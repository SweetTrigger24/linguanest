interface Env {
  MEDIA_BUCKET: R2Bucket; ALLOWED_ORIGINS: string; SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string; SUPABASE_SERVICE_ROLE_KEY: string;
}
type Profile = { id: string; role: string; is_active: boolean; must_change_password: boolean; avatar_key?: string | null }
class HttpError extends Error { constructor(message: string, public status = 400) { super(message) } }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const unbase64 = (s: string) => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0))
const keyPattern = /^(?:files\/[a-f0-9-]+\.(?:mp3|png|jpg|webp|pdf)|(?:english|french|chinese|japanese)\/(?:listening|images)\/[a-zA-Z0-9_.-]+)$/
async function backend<T>(env: Env, path: string, init: RequestInit = {}, token?: string, publicOnly = false): Promise<T> {
  const headers = new Headers(init.headers), key = token || publicOnly ? env.SUPABASE_ANON_KEY : env.SUPABASE_SERVICE_ROLE_KEY
  headers.set('apikey', key)
  if (token || !key.startsWith('sb_')) headers.set('Authorization', `Bearer ${token || key}`)
  if (init.body) headers.set('Content-Type', 'application/json')
  const r = await fetch(`${env.SUPABASE_URL}${path}`, { ...init, headers, signal: AbortSignal.timeout(10000) })
  const body = await r.text(); let data: unknown
  try { data = body ? JSON.parse(body) : null } catch { throw new HttpError('Dịch vụ dữ liệu tạm thời không khả dụng.', 503) }
  if (!r.ok) {
    const error = data as { message?: string; msg?: string }
    throw new HttpError(error?.message || error?.msg || 'Không thể thực hiện yêu cầu.', r.status >= 500 ? 503 : 400)
  }
  return data as T
}
// Ignore malformed/multipart ranges; return null for an unsatisfiable single range.
function byteRange(value: string, size: number): { offset: number; length: number } | null | undefined {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim())
  if (!match || (!match[1] && !match[2])) return undefined
  if (!size) return null
  if (!match[1]) {
    const length = Math.min(Number(match[2]), size)
    return length ? { offset: size - length, length } : null
  }
  const offset = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  if (offset >= size || end < offset) return null
  return { offset, length: end - offset + 1 }
}
async function readMedia(request: Request, env: Env, key: string): Promise<Response> {
  let range: { offset: number; length: number } | undefined
  const requestedRange = request.method === 'GET' ? request.headers.get('Range') : null
  if (requestedRange) {
    const info = await env.MEDIA_BUCKET.head(key)
    if (!info) throw new HttpError('Không tìm thấy file.', 404)
    const ifRange = request.headers.get('If-Range')
    if (!ifRange || ifRange === info.httpEtag || ifRange === info.uploaded.toUTCString()) {
      const parsed = byteRange(requestedRange, info.size)
      if (parsed === null) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}`, 'Accept-Ranges': 'bytes' } })
      range = parsed
    }
  }
  let object: R2Object | null, body: ReadableStream | null = null
  if (request.method === 'HEAD') object = await env.MEDIA_BUCKET.head(key)
  else {
    const result = await env.MEDIA_BUCKET.get(key, range ? { range } : undefined)
    object = result
    body = result?.body ?? null
  }
  if (!object) throw new HttpError('Không tìm thấy file.', 404)
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('ETag', object.httpEtag)
  headers.set('Last-Modified', object.uploaded.toUTCString())
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Content-Length', String(range ? range.length : object.size))
  headers.set('Content-Disposition', key.endsWith('.pdf') ? 'attachment; filename="document.pdf"' : 'inline')
  if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`)
  return new Response(body, { status: range ? 206 : 200, headers })
}
const post = (value: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(value) })
const rpc = <T,>(env: Env, name: string, value: unknown) => backend<T>(env, `/rest/v1/rpc/${name}`, post(value))
async function profile(env: Env, id: string) {
  const rows = await backend<Profile[]>(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,role,is_active,must_change_password,avatar_key`)
  if (!rows[0]?.is_active) throw new HttpError('Tài khoản chưa được duyệt hoặc đã bị khóa.', 403)
  return rows[0]
}
async function bytesLimited(request: Request, max: number): Promise<Uint8Array> {
  if (Number(request.headers.get('Content-Length')) > max) throw new HttpError('Tệp/yêu cầu quá lớn.', 413)
  if (!request.body) throw new HttpError('Nội dung trống.')
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new HttpError('Tệp/yêu cầu quá lớn.', 413) } chunks.push(value) } } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0; for (const part of chunks) { bytes.set(part, offset); offset += part.length } return bytes
}
async function bodyJSON(request: Request): Promise<Record<string, unknown>> {
  try { const data = JSON.parse(new TextDecoder().decode(await bytesLimited(request, 32768))); if (!data || Array.isArray(data) || typeof data !== 'object') throw Error(); return data }
  catch (e) { if (e instanceof HttpError) throw e; throw new HttpError('Dữ liệu JSON không hợp lệ.') }
}
function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 10 || new TextEncoder().encode(value).length > 72) throw new HttpError('Mật khẩu cần ít nhất 10 ký tự và tối đa 72 byte.')
  return value
}
async function signingKey(env: Env) { return crypto.subtle.importKey('raw', new TextEncoder().encode(`linguanest-media-v1:${env.SUPABASE_SERVICE_ROLE_KEY}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']) }
async function signTicket(env: Env, user: string, key: string) {
  const payload = base64(new TextEncoder().encode(JSON.stringify({ user, key, exp: Date.now() + 15 * 60000 })))
  const signature = await crypto.subtle.sign('HMAC', await signingKey(env), new TextEncoder().encode(payload))
  return `${payload}.${base64(new Uint8Array(signature))}`
}
async function ticketUser(env: Env, token: string, key: string): Promise<string> {
  try {
    if (token.length > 4096) throw Error()
    const [payload, signature, extra] = token.split('.')
    if (extra || !signature || !await crypto.subtle.verify('HMAC', await signingKey(env), unbase64(signature), new TextEncoder().encode(payload))) throw Error()
    const parsed = JSON.parse(new TextDecoder().decode(unbase64(payload))) as { user: string; key: string; exp: number }
    if (parsed.key !== key || !Number.isFinite(parsed.exp) || parsed.exp < Date.now()) throw Error()
    return parsed.user
  } catch { throw new HttpError('Liên kết đã hết hạn. Hãy tải lại học liệu.', 401) }
}
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === '/health' && request.method === 'GET') return json({ status: 'ok' })
  let user: { id: string; email?: string }
  const mediaKey = url.pathname.startsWith('/media/') ? decodeURIComponent(url.pathname.slice(7)) : ''
  if (mediaKey && !keyPattern.test(mediaKey)) throw new HttpError('Đường dẫn file không hợp lệ.')
  if (mediaKey && url.searchParams.has('ticket') && ['GET', 'HEAD'].includes(request.method)) user = { id: await ticketUser(env, url.searchParams.get('ticket')!, mediaKey) }
  else {
    const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token || token.length > 8192) throw new HttpError('Vui lòng đăng nhập.', 401)
    try { user = await backend(env, '/auth/v1/user', {}, token) } catch { throw new HttpError('Phiên đăng nhập không hợp lệ.', 401) }
  }
  const me = await profile(env, user.id)
  if (url.pathname === '/account/password' && request.method === 'POST') {
    const body = await bodyJSON(request), next = password(body.password)
    if (typeof body.current_password !== 'string' || !user.email) throw new HttpError('Cần mật khẩu hiện tại.')
    try {
      const checked = await backend<{ user: { id: string } }>(env, '/auth/v1/token?grant_type=password', post({ email: user.email, password: body.current_password }), undefined, true)
      if (checked.user.id !== user.id) throw Error()
    } catch { throw new HttpError('Mật khẩu hiện tại không đúng hoặc đã thử quá nhiều lần.') }
    await backend(env, `/auth/v1/admin/users/${user.id}`, post({ password: next }, 'PUT'))
    await backend(env, `/rest/v1/profiles?id=eq.${user.id}`, post({ must_change_password: false }, 'PATCH'))
    return json({ ok: true })
  }
  if (me.must_change_password) throw new HttpError('Bạn cần đổi mật khẩu tạm trước khi tiếp tục.', 403)
  const memberAvatar = /^\/members\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/avatar$/.exec(url.pathname)
  if (memberAvatar) {
    if (request.method !== 'GET') throw new HttpError('Phương thức không được hỗ trợ.', 405)
    const id = memberAvatar[1], target = id === user.id ? me : await profile(env, id)
    if (target.must_change_password || !target.avatar_key || !target.avatar_key.startsWith(`avatars/${id}/`)) throw new HttpError('Không tìm thấy ảnh đại diện.', 404)
    return readMedia(request, env, target.avatar_key)
  }
  if (url.pathname === '/account/avatar') {
    if (request.method === 'GET') {
      if (!me.avatar_key || !me.avatar_key.startsWith(`avatars/${user.id}/`)) throw new HttpError('Chưa có ảnh đại diện.', 404)
      return readMedia(request, env, me.avatar_key)
    }
    if (!['POST', 'DELETE'].includes(request.method)) throw new HttpError('Phương thức không được hỗ trợ.', 405)
    let key: string | null = null
    if (request.method === 'POST') {
      const type = request.headers.get('Content-Type') || ''
      const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[type]
      if (!ext) throw new HttpError('Hỗ trợ ảnh JPG, PNG và WebP.', 415)
      const bytes = await bytesLimited(request, 2 * 1024 * 1024), h = bytes.slice(0, 12), text = new TextDecoder().decode(h)
      const valid = ext === 'png' ? [137,80,78,71,13,10,26,10].every((n, i) => h[i] === n)
        : ext === 'webp' ? text.startsWith('RIFF') && text.slice(8) === 'WEBP' : h[0] === 255 && h[1] === 216 && h[2] === 255
      if (!valid) throw new HttpError('Nội dung không đúng định dạng ảnh.', 415)
      key = `avatars/${user.id}/${crypto.randomUUID()}.${ext}`
      await env.MEDIA_BUCKET.put(key, bytes, { httpMetadata: { contentType: type } })
    }
    let previous: string | null
    try { previous = await rpc<string | null>(env, 'replace_profile_avatar', { p_user: user.id, p_key: key }) }
    catch (e) { if (key) await env.MEDIA_BUCKET.delete(key); throw e }
    if (previous && previous !== key && previous.startsWith(`avatars/${user.id}/`)) {
      try { await env.MEDIA_BUCKET.delete(previous) }
      catch { console.warn('Avatar updated; previous R2 object could not be removed.') }
    }
    return json({ avatar_key: key })
  }
  if (url.pathname.startsWith('/admin/')) {
    if (me.role !== 'admin') throw new HttpError('Chỉ quản trị viên.', 403)
    if (request.method !== 'POST') throw new HttpError('Phương thức không được hỗ trợ.', 405)
    const body = await bodyJSON(request)
    if (url.pathname === '/admin/users') {
      const username = String(body.username || '').trim().toLowerCase(), display = String(body.display_name || '').trim()
      if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) || !display || display.length > 80) throw new HttpError('Tên đăng nhập cần 3–32 ký tự a–z, 0–9, dấu chấm, gạch dưới hoặc gạch ngang; cần tên hiển thị.')
      const created = await backend<{ id: string }>(env, '/auth/v1/admin/users', post({ email: `${username}@users.linguanest.invalid`, password: password(body.password), email_confirm: true, user_metadata: { display_name: display } }))
      try { await backend(env, `/rest/v1/profiles?id=eq.${created.id}`, post({ username, display_name: display, is_active: true, must_change_password: true }, 'PATCH')) }
      catch (e) { await backend(env, `/auth/v1/admin/users/${created.id}`, { method: 'DELETE' }); throw e }
      return json({ id: created.id }, 201)
    }
    const id = String(body.id || '')
    if (!/^[a-f0-9-]{36}$/.test(id) || id === user.id) throw new HttpError('Không thể dùng thao tác này cho chính tài khoản của bạn.')
    const target = await backend<Profile[]>(env, `/rest/v1/profiles?id=eq.${id}&select=id,role,is_active,must_change_password`)
    if (!target.length || target[0].role === 'admin') throw new HttpError('Chỉ quản lý tài khoản thành viên tại đây.', 403)
    if (url.pathname === '/admin/users/reset') {
      const next = password(body.password)
      await backend(env, `/rest/v1/profiles?id=eq.${id}`, post({ must_change_password: true }, 'PATCH'))
      await backend(env, `/auth/v1/admin/users/${id}`, post({ password: next }, 'PUT'))
      return json({ ok: true })
    }
    if (url.pathname === '/admin/users/status') {
      if (typeof body.is_active !== 'boolean') throw new HttpError('Trạng thái không hợp lệ.')
      await backend(env, `/rest/v1/profiles?id=eq.${id}`, post({ is_active: body.is_active }, 'PATCH')); return json({ ok: true })
    }
    throw new HttpError('Không tìm thấy chức năng.', 404)
  }
  if (url.pathname === '/media-ticket' && request.method === 'GET') {
    const key = url.searchParams.get('key') || ''
    if (!keyPattern.test(key) || !await rpc<boolean>(env, 'can_access_media_for', { p_user: user.id, p_key: key })) throw new HttpError('Bạn không có quyền đọc file này.', 403)
    return json({ url: `${url.origin}/media/${key}?ticket=${await signTicket(env, user.id, key)}` })
  }
  if (mediaKey && ['GET', 'HEAD'].includes(request.method)) {
    if (!await rpc<boolean>(env, 'can_access_media_for', { p_user: user.id, p_key: mediaKey })) throw new HttpError('Bạn không có quyền đọc file này.', 403)
    return readMedia(request, env, mediaKey)
  }
  if (url.pathname === '/media' && request.method === 'POST') {
    if (me.role !== 'admin') throw new HttpError('Chỉ quản trị viên được tải học liệu.', 403)
    const filename = (url.searchParams.get('filename') || '').slice(0, 200), ext = filename.toLowerCase().split('.').pop() || ''
    const formats: Record<string, { type: string; max: number }> = { mp3: { type: 'audio/mpeg', max: 30 }, png: { type: 'image/png', max: 5 }, jpg: { type: 'image/jpeg', max: 5 }, jpeg: { type: 'image/jpeg', max: 5 }, webp: { type: 'image/webp', max: 5 }, pdf: { type: 'application/pdf', max: 20 } }
    const format = formats[ext]; if (!format) throw new HttpError('Hỗ trợ MP3, JPG, PNG, WebP và PDF.', 415)
    const bytes = await bytesLimited(request, format.max * 1024 * 1024), h = bytes.slice(0, 12), text = new TextDecoder().decode(h)
    const valid = ext === 'mp3' ? text.startsWith('ID3') || (h[0] === 255 && (h[1] & 224) === 224) : ext === 'png' ? [137,80,78,71,13,10,26,10].every((n, i) => h[i] === n) : ext === 'pdf' ? text.startsWith('%PDF-') : ext === 'webp' ? text.startsWith('RIFF') && text.slice(8) === 'WEBP' : h[0] === 255 && h[1] === 216 && h[2] === 255
    if (!valid) throw new HttpError('Nội dung không đúng định dạng file.', 415)
    const key = `files/${crypto.randomUUID()}.${ext === 'jpeg' ? 'jpg' : ext}`, item = { key, filename, content_type: format.type, size: bytes.length }
    await env.MEDIA_BUCKET.put(key, bytes, { httpMetadata: { contentType: format.type } })
    try { await backend(env, '/rest/v1/media_files', post(item)) } catch (e) { await env.MEDIA_BUCKET.delete(key); throw e }
    return json(item, 201)
  }
  if (url.pathname === '/media' && request.method === 'DELETE') {
    if (me.role !== 'admin') throw new HttpError('Chỉ quản trị viên.', 403)
    const key = url.searchParams.get('key') || ''; if (!keyPattern.test(key)) throw new HttpError('Khóa file không hợp lệ.')
    await rpc(env, 'reserve_media_delete', { p_key: key })
    await env.MEDIA_BUCKET.delete(key)
    await backend(env, `/rest/v1/media_files?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE' }); return json({ ok: true })
  }
  throw new HttpError('Không tìm thấy chức năng.', 404)
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin'), allowed = env.ALLOWED_ORIGINS.split(',').map(v => v.trim())
    if (origin && !allowed.includes(origin)) return json({ error: 'Origin không được phép.' }, 403)
    let response: Response
    try { response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, env) }
    catch (e) { response = json({ error: e instanceof HttpError ? e.message : 'Dịch vụ tạm thời không khả dụng.' }, e instanceof HttpError ? e.status : 503) }
    const headers = new Headers(response.headers)
    if (origin) headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin'); headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, DELETE, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Range, If-Range'); headers.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, ETag')
    headers.set('Cache-Control', 'private, no-store'); headers.set('X-Content-Type-Options', 'nosniff'); headers.set('Referrer-Policy', 'no-referrer')
    return new Response(response.body, { status: response.status, headers })
  },
} satisfies ExportedHandler<Env>
