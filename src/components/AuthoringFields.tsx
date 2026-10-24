import { useEffect, useRef, useState } from 'react'
import { listMedia, uploadMedia } from '../lib/api'
import { errorMessage } from '../lib/content'
import { kindNames } from '../lib/authoring'
import type { MediaFile, Question } from '../lib/types'
import { AttachmentList, Notice } from './Common'

export function MediaPicker({ keys, onChange }: { keys: string[]; onChange: (keys: string[]) => void }) {
  const [files, setFiles] = useState<MediaFile[]>([]), [query, setQuery] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [preview, setPreview] = useState(false)
  const latest = useRef({ keys, onChange }); latest.current = { keys, onChange }
  useEffect(() => { listMedia().then(setFiles).catch(e => setError(errorMessage(e))) }, [])
  return <fieldset className="media-picker"><legend>Ảnh, âm thanh và tài liệu</legend><label className="file-label">{busy ? 'Đang tải lên…' : 'Tải file lên tại đây'}<input disabled={busy} type="file" multiple accept=".mp3,.jpg,.jpeg,.png,.webp,.pdf" onChange={async e => {
    const selected = Array.from(e.target.files || []); e.target.value = ''; setBusy(true); setError(''); const added: string[] = []
    try { for (const f of selected) { const uploaded = await uploadMedia(f); added.push(uploaded.key); setFiles(old => [...old, { ...uploaded, state: 'active' }]) } }
    catch (e) { setError(errorMessage(e)) } finally { if (added.length) latest.current.onChange([...latest.current.keys, ...added]); setBusy(false) }
  }} /></label><small>MP3 ≤30 MB · ảnh ≤5 MB · PDF ≤20 MB. Hoặc chọn lại file đã có:</small><input aria-label="Tìm học liệu" placeholder="Tìm tên file…" value={query} onChange={e => setQuery(e.target.value)} />{error && <Notice error>{error}</Notice>}
    <div className="file-options">{files.filter(f => f.state === 'active' && f.filename.toLowerCase().includes(query.toLowerCase())).map(f => <label key={f.key}><input disabled={busy} type="checkbox" checked={keys.includes(f.key)} onChange={e => onChange(e.target.checked ? [...keys, f.key] : keys.filter(k => k !== f.key))} />{f.filename}</label>)}</div>
    {keys.map(key => <div className="selected-file" key={key}><span>{files.find(f => f.key === key)?.filename || key}</span><button disabled={busy} type="button" className="text-action" onClick={() => onChange(keys.filter(k => k !== key))}>Gỡ</button></div>)}
    {!!keys.length && <><button type="button" className="text-action" onClick={() => setPreview(!preview)}>{preview ? 'Ẩn xem thử' : 'Xem ảnh / nghe thử'}</button>{preview && <AttachmentList keys={keys} />}</>}
  </fieldset>
}
export function QuestionFields({ q, onChange }: { q: Question; onChange: (q: Question) => void }) {
  const change = (p: Partial<Question>) => onChange({ ...q, ...p })
  const choice = q.kind === 'choice' || q.kind === 'multi'
  return <div className="editor-form">
    <div className="form-grid"><label>Dạng câu<select aria-label="Dạng câu" value={q.kind} onChange={e => { const kind = e.target.value as Question['kind']; change({ kind, choices: ['choice', 'multi', 'matching'].includes(kind) ? ['', '', '', ''] : [], answers: kind === 'essay' ? [] : kind === 'choice' || kind === 'multi' ? ['0'] : [''], slots: ['gaps', 'matching'].includes(kind) ? ['Mục 1'] : [], labels_only: false }) }}>{Object.entries(kindNames).map(([k, name]) => <option key={k} value={k}>{name}</option>)}</select></label><label>Điểm tối đa<input aria-label="Điểm tối đa" type="number" min={1} max={100} value={q.points} onChange={e => change({ points: Number(e.target.value) })} /></label></div>
    <div className="toolbar"><button type="button" className="btn-secondary" onClick={() => change({ kind: 'choice', choices: ['True', 'False', 'Not Given'], answers: ['0'], labels_only: false })}>True / False / Not Given</button><button type="button" className="btn-secondary" onClick={() => change({ kind: 'choice', choices: ['Yes', 'No', 'Not Given'], answers: ['0'], labels_only: false })}>Yes / No / Not Given</button></div>
    <label>Nội dung câu hỏi<textarea aria-label="Nội dung câu hỏi" rows={3} value={q.prompt} onChange={e => change({ prompt: e.target.value })} /></label>
    {q.kind === 'gaps' && <small>Chèn {'{{1}}'}, {'{{2}}'}… vào nội dung để đặt ô trống ngay trong câu. Nếu không chèn, các ô hiển thị thành bảng bên dưới.</small>}
    <label>Ngữ cảnh riêng của câu (tùy chọn)<textarea aria-label="Ngữ cảnh riêng của câu (tùy chọn)" rows={2} value={q.passage} onChange={e => change({ passage: e.target.value })} /></label>
    <MediaPicker keys={q.media_keys || []} onChange={media_keys => change({ media_keys })} />
    {(choice || q.kind === 'matching') && <><label>Lựa chọn (mỗi dòng một lựa chọn)<textarea aria-label="Lựa chọn (mỗi dòng một lựa chọn)" rows={4} value={q.choices.join('\n')} onChange={e => change({ choices: e.target.value.split('\n') })} /></label>{choice && <label className="check-row"><input type="checkbox" checked={!!q.labels_only} onChange={e => change({ labels_only: e.target.checked, choices: e.target.checked ? q.choices.map((_, i) => String.fromCharCode(65 + i)) : q.choices })} />Chỉ hiện A/B/C/D; nội dung lựa chọn nằm trong audio</label>}</>}
    {choice && <fieldset><legend>{q.kind === 'multi' ? 'Chọn tất cả đáp án đúng' : 'Đáp án đúng'}</legend>{q.choices.map((c, i) => <label className="check-row" key={i}><input type={q.kind === 'multi' ? 'checkbox' : 'radio'} name={`correct-${q.id}`} checked={!!q.answers?.includes(String(i))} onChange={e => change({ answers: q.kind === 'choice' ? [String(i)] : e.target.checked ? [...(q.answers || []), String(i)] : q.answers?.filter(a => a !== String(i)) })} />{String.fromCharCode(65 + i)}. {c}</label>)}</fieldset>}
    {q.kind === 'short' && <label>Các đáp án được chấp nhận (mỗi dòng một đáp án)<textarea aria-label="Các đáp án được chấp nhận (mỗi dòng một đáp án)" value={q.answers?.join('\n') || ''} onChange={e => change({ answers: e.target.value.split('\n') })} /></label>}
    {(q.kind === 'gaps' || q.kind === 'matching') && <><small>Mỗi mục có đáp án riêng. Điền ô: dùng | cho cách viết thay thế. Nối: nhập số thứ tự lựa chọn, bắt đầu từ 1. Mỗi mục được chấm bằng nhau; điểm tối đa phải chia hết cho số mục. Lựa chọn nối có thể dùng lại.</small>{q.slots?.map((s, i) => <div className="form-grid" key={i}><label>Mục {i + 1}<input aria-label={`Mục ${i + 1}`} value={s} onChange={e => change({ slots: q.slots!.map((x, j) => j === i ? e.target.value : x) })} /></label><label>Đáp án mục {i + 1}<input aria-label={`Đáp án mục ${i + 1}`} value={q.answers?.[i] || ''} onChange={e => change({ answers: q.slots!.map((_, j) => j === i ? e.target.value : q.answers?.[j] || '') })} /></label><button type="button" onClick={() => change({ slots: q.slots!.filter((_, j) => j !== i), answers: q.answers?.filter((_, j) => j !== i) })}>Xóa mục {i + 1}</button></div>)}<button type="button" className="btn-secondary" onClick={() => change({ slots: [...(q.slots || []), `Mục ${(q.slots?.length || 0) + 1}`], answers: [...(q.answers || []), ''], points: (q.slots?.length || 0) + 1 })}>+ Thêm mục trả lời</button></>}
    {['short', 'gaps'].includes(q.kind) && <label>Số từ tối đa mỗi đáp án (0 = không giới hạn)<input aria-label="Số từ tối đa mỗi đáp án (0 = không giới hạn)" type="number" min={0} max={100} value={q.word_limit || 0} onChange={e => change({ word_limit: Number(e.target.value) })} /></label>}
    <label>{q.kind === 'essay' ? 'Bài mẫu (hiện sau khi nộp)' : 'Giải thích đáp án (hiện sau khi nộp)'}<textarea rows={3} value={q.explanation || ''} onChange={e => change({ explanation: e.target.value })} /></label>
    {q.kind === 'essay' && <label>Tiêu chí chấm dành riêng cho quản trị<textarea aria-label="Tiêu chí chấm dành riêng cho quản trị" rows={3} value={q.rubric || ''} onChange={e => change({ rubric: e.target.value })} /></label>}
  </div>
}
