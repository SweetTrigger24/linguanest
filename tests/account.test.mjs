import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

test('cloud avatar adapter sends session authorization, reads binary images, validates uploads and reports failures', async () => {
  let session = { access_token: 'member-session' }, failure = false
  const calls = [], originalFetch = globalThis.fetch
  globalThis.__avatarSession = async () => ({ data: { session }, error: null })
  const result = await build({ entryPoints: ['src/lib/api.ts'], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{
    name: 'avatar-transport', setup(b) {
      b.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'supabase', namespace: 'mock' }))
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const cloudMode=true, mediaWorkerUrl="https://worker.test"; export const supabase={auth:{getSession:()=>globalThis.__avatarSession()}};' }))
    },
  }] })
  const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
  const png = new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'photo.png', { type: 'image/png' })
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://worker.test/account/avatar')
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer member-session')
    calls.push(init)
    if (failure) return Response.json({ error: 'Upload failed' }, { status: 503 })
    return init.method ? Response.json({ avatar_key: init.method === 'DELETE' ? null : 'avatars/me/photo.png' }) : new Response(png, { headers: { 'Content-Type': 'image/png' } })
  }
  try {
    assert.equal((await api.uploadAvatar(png)).avatar_key, 'avatars/me/photo.png')
    assert.equal(calls[0].body, png); assert.equal(new Headers(calls[0].headers).get('Content-Type'), 'image/png')
    assert.equal((await api.avatarBlob()).type, 'image/png')
    assert.equal((await api.removeAvatar()).avatar_key, null)
    assert.equal(calls[2].method, 'DELETE')
    await assert.rejects(api.uploadAvatar(new File(['fake'], 'photo.png', { type: 'image/png' })), /hợp lệ/)
    assert.equal(calls.length, 3)
    failure = true; await assert.rejects(api.avatarBlob(), /Upload failed/)
    session = null; await assert.rejects(api.uploadAvatar(png), /đăng nhập lại/)
    assert.equal(calls.length, 4)
  } finally { globalThis.fetch = originalFetch; delete globalThis.__avatarSession }
})
