import { useState } from 'react'
import { removeAvatar, renameProfile, uploadAvatar, workerJSON } from '../lib/api'
import { cloudMode, supabase } from '../lib/supabase'
import { errorMessage } from '../lib/content'
import { avatarDataURL, validateAvatar } from '../lib/avatar'
import { useUnsavedChanges } from '../lib/useUnsavedChanges'
import type { Profile } from '../lib/types'
import { Notice } from './Common'
import Avatar from './Avatar'

export default function Account({ profile, refresh }: { profile: Profile; refresh: () => Promise<void> }) {
  const [name, setName] = useState(profile.display_name), [current, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [pendingAvatar, setPendingAvatar] = useState<{ file: File | null; preview: string }>(), [selecting, setSelecting] = useState(false)
  const dirty = name.trim() !== profile.display_name || pendingAvatar !== undefined
  const hasAvatar = pendingAvatar ? !!pendingAvatar.file : !!(profile.avatar_key || profile.avatar_data_url)
  useUnsavedChanges(!profile.must_change_password && dirty && !busy)
  async function selectAvatar(file: File) {
    setSelecting(true); setError(''); setMessage('')
    try {
      await validateAvatar(file)
      setPendingAvatar({ file, preview: await avatarDataURL(file) })
    } catch (e) { setError(errorMessage(e)) } finally { setSelecting(false) }
  }
  async function saveProfile() {
    setBusy(true); setError(''); setMessage('')
    try {
      if (!name.trim()) throw Error('Nhập tên hiển thị.')
      if (name.trim() !== profile.display_name) await renameProfile(name.trim())
      if (pendingAvatar?.file) await uploadAvatar(pendingAvatar.file)
      else if (pendingAvatar) await removeAvatar()
      await refresh(); setPendingAvatar(undefined); setName(name.trim()); setMessage('Đã lưu hồ sơ.')
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return <div className="stack"><div className="page-heading"><div><span className="eyebrow">TÀI KHOẢN CỦA BẠN</span><h1>{profile.must_change_password ? 'Đổi mật khẩu tạm' : 'Thông tin tài khoản'}</h1><p>{profile.username || 'Tài khoản được quản trị cấp'}</p></div></div>
    {profile.must_change_password && <Notice>Bạn cần đặt mật khẩu riêng trước khi truy cập nội dung học.</Notice>}{error && <Notice error>{error}</Notice>}{message && <Notice>{message}</Notice>}
    {!profile.must_change_password && <form className="card-box editor-form" onSubmit={e => { e.preventDefault(); if (dirty && !busy && !selecting) void saveProfile() }}>
      <h2>Hồ sơ</h2>
      <div className="profile-photo"><Avatar profile={profile} large previewURL={pendingAvatar?.preview} /><div className="stack">
        <label className={`file-label${busy || selecting ? ' avatar-busy' : ''}`}>Đổi ảnh đại diện<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || selecting} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void selectAvatar(file) }} /></label>
        <small>JPG, PNG hoặc WebP, tối đa 2 MB. Ảnh đang xem trước; bấm Lưu hồ sơ để áp dụng.</small>
        {hasAvatar && <button type="button" className="btn-secondary" disabled={busy || selecting} onClick={() => { setPendingAvatar(profile.avatar_key || profile.avatar_data_url ? { file: null, preview: '' } : undefined); setError(''); setMessage('') }}>Xóa ảnh đại diện</button>}
      </div></div>
      <label>Tên hiển thị<input required maxLength={80} disabled={busy} value={name} onChange={e => { setName(e.target.value); setMessage('') }} /></label>
      <p>Tên đăng nhập và vai trò do quản trị quản lý.</p>
      {dirty && <small>Có thay đổi chưa lưu.</small>}
      <div className="toolbar"><button className="btn-primary" disabled={busy || selecting || !dirty}>{busy ? 'Đang lưu…' : 'Lưu hồ sơ'}</button>{dirty && <button type="button" className="btn-secondary" disabled={busy || selecting} onClick={() => { setName(profile.display_name); setPendingAvatar(undefined); setError(''); setMessage('') }}>Hủy thay đổi</button>}</div>
    </form>}
    <form className="card-box editor-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); setMessage(''); try { if (password !== confirm) throw Error('Mật khẩu xác nhận không khớp.'); if (password === current) throw Error('Hãy chọn mật khẩu khác mật khẩu hiện tại.'); await workerJSON('/account/password', { current_password: current, password }); setCurrent(''); setPassword(''); setConfirm(''); await supabase!.auth.signOut(); } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }}><h2>Đổi mật khẩu</h2>{!cloudMode && <Notice>Chế độ demo không có mật khẩu. Chức năng này hoạt động sau khi kết nối Supabase và Worker.</Notice>}<label>Mật khẩu hiện tại<input type="password" required autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} /></label><label>Mật khẩu mới<input type="password" required minLength={10} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label><label>Nhập lại mật khẩu mới<input type="password" required minLength={10} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label><p>Ít nhất 10 ký tự. Sau khi đổi thành công, hãy đăng nhập lại bằng mật khẩu mới.</p><button className="btn-primary" disabled={!cloudMode || busy}>{busy ? 'Đang xử lý…' : 'Đổi mật khẩu'}</button></form>
  </div>
}
