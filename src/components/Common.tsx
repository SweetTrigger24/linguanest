import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { listAnswer } from '../lib/authoring'
import { mediaURL } from '../lib/api'
import { errorMessage, importCSV } from '../lib/content'
import type { Lang, Question, Word } from '../lib/types'
import { LANG_DETAILS } from '../lib/types'

export function Notice({ error, children }: { error?: boolean; children: ReactNode }) { return <div role={error ? 'alert' : 'status'} className={error ? 'alert-error' : 'success-message'}>{children}</div> }
export function Empty({ children }: { children: ReactNode }) { return <div className="empty-state">{children}</div> }
export function Speak({ text, lang }: { text: string; lang: Lang }) {
  return <button className="btn-secondary" onClick={() => { if (!('speechSynthesis' in window)) { alert('Thiết bị chưa có giọng đọc. Hãy dùng bài MP3.'); return } speechSynthesis.cancel(); const voice = new SpeechSynthesisUtterance(text); voice.lang = LANG_DETAILS[lang].tts; voice.rate = .9; speechSynthesis.speak(voice) }}>Nghe giọng mẫu</button>
}
export function Media({ fileKey }: { fileKey: string }) {
  const [url, setURL] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true; setURL(''); setError('')
    mediaURL(fileKey).then(v => { if (active) setURL(v.url) }).catch(e => { if (active) setError(errorMessage(e)) })
    return () => { active = false }
  }, [fileKey, retry])
  if (error) return <Notice error>{error} <button className="btn-secondary" onClick={() => setRetry(n => n + 1)}>Tải lại file</button></Notice>
  if (!url) return <p className="secondary-label">Đang tải học liệu…</p>
  if (/\.mp3$/i.test(fileKey)) return <div className="audio-box"><audio key={url} controls preload="metadata" src={url} onError={() => setError('Không phát được audio hoặc liên kết hết hạn.')} /></div>
  if (/\.pdf$/i.test(fileKey)) return <a className="btn-secondary" href={url} target="_blank" rel="noreferrer">Tải tài liệu PDF</a>
  return <img className="lesson-image" key={url} src={url} alt="Học liệu minh họa" onError={() => setError('Không tải được ảnh.')} />
}
export function AttachmentList({ keys }: { keys: string[] }) { return <div className="attachment-list">{[...new Set(keys)].map(key => <Media key={key} fileKey={key} />)}</div> }
export function QuestionBody({ question: q, value, onChange, disabled = false }: { question: Question; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const values = listAnswer(value)
  const slot = (i: number) => q.kind === 'matching' ? <select aria-label={q.slots?.[i]} disabled={disabled} value={values[i] || ''} onChange={e => onChange(JSON.stringify(q.slots!.map((_, j) => j === i ? e.target.value : values[j] || '')))}><option value="">Chọn đáp án</option>{q.choices.map((c, j) => <option key={j} value={String(j + 1)}>{j + 1}. {c}</option>)}</select> : <input className="gap-input" aria-label={q.slots?.[i]} disabled={disabled} maxLength={1000} value={values[i] || ''} onChange={e => onChange(JSON.stringify(q.slots!.map((_, j) => j === i ? e.target.value : values[j] || '')))} />
  const inline = q.kind === 'gaps' && /\{\{\d+\}\}/.test(q.prompt)
  return <div className="question-body">{q.passage && <div className="reading-passage">{q.passage}</div>}<AttachmentList keys={q.media_keys || []} />
    {inline ? <div className="reading-passage inline-gaps">{q.prompt.split(/(\{\{\d+\}\})/g).map((part, i) => { const match = part.match(/^\{\{(\d+)\}\}$/); return <span key={i}>{match && Number(match[1]) <= (q.slots?.length || 0) && Number(match[1]) > 0 ? slot(Number(match[1]) - 1) : part}</span> })}</div> : <h3>{q.prompt}</h3>}
    {q.kind === 'choice' || q.kind === 'multi' ? <div className="quiz-options">{q.kind === 'multi' && <small>Chọn tất cả đáp án phù hợp.</small>}{q.choices.map((choice, index) => { const checked = q.kind === 'multi' ? values.includes(String(index)) : value === String(index); return <label className={`choice-input ${checked ? 'selected' : ''}`} key={index}><input type={q.kind === 'multi' ? 'checkbox' : 'radio'} name={q.id} value={index} checked={checked} disabled={disabled} onChange={() => onChange(q.kind === 'multi' ? JSON.stringify(checked ? values.filter(v => v !== String(index)) : [...values, String(index)]) : String(index))} /><span>{String.fromCharCode(65 + index)}{!q.labels_only && `. ${choice}`}</span></label> })}</div>
    : q.kind === 'gaps' || q.kind === 'matching' ? <div className="stack">{q.slots?.map((s, i) => (!inline || !q.prompt.includes(`{{${i + 1}}}`)) && <label key={i}>{s}{slot(i)}</label>)}</div>
    : <label>{q.kind === 'essay' ? 'Bài viết của bạn' : 'Đáp án của bạn'}<textarea aria-label={q.kind === 'essay' ? 'Bài viết của bạn' : 'Đáp án của bạn'} rows={q.kind === 'essay' ? 12 : 2} maxLength={20000} disabled={disabled} value={value} onChange={e => onChange(e.target.value)} />{q.kind === 'essay' && <small>{value.trim() ? value.trim().split(/\s+/).length : 0} từ · Quản trị chấm thủ công</small>}</label>}
    {!!q.word_limit && <small>Tối đa {q.word_limit} từ mỗi ô trả lời.</small>}
  </div>
}
export function CsvImport({ kind, onImport }: { kind: 'words' | 'questions'; onImport: (items: (Word | Question)[]) => void }) {
  const [preview, setPreview] = useState<ReturnType<typeof importCSV> | null>(null), [error, setError] = useState('')
  const sample = kind === 'words' ? 'term,meaning,pronunciation,example,example_translation\nhello,xin chào,/həˈləʊ/,Hello everyone!,Xin chào mọi người!\n' : 'kind,section,prompt,passage,choices,answers,points,explanation,slots,word_limit\nchoice,Reading,Choose the greeting.,,Hello|Goodbye,0,1,Hello là lời chào.,,0\nshort,Listening,Complete the word.,,,hello|Hello,1,,,1\nessay,Writing,Write about your hometown.,,,,10,,,0\ngaps,Reading,I live in {{1}}. The sky is {{2}}.,,,hanoi|ha noi;blue,2,,City|Color,2\nmatching,Reading,Match the headings.,,Heading A|Heading B,2;1,2,,Paragraph 1|Paragraph 2,0\n'
  function download() { const url = URL.createObjectURL(new Blob(['\uFEFF' + sample], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `${kind}-template.csv`; a.click(); URL.revokeObjectURL(url) }
  return <div className="import-panel"><div className="toolbar"><button type="button" className="btn-secondary" onClick={download}>Tải mẫu CSV</button><label className="file-label">Nhập CSV<input type="file" accept=".csv,text/csv" onChange={async e => { setError(''); setPreview(null); const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 2 * 1024 * 1024) throw Error('CSV tối đa 2 MB.'); setPreview(importCSV(await file.text(), kind)) } catch (e) { setError(errorMessage(e)) } e.target.value = '' }} /></label></div>
    <small>CSV UTF-8. Câu trắc nghiệm dùng đáp án 0 cho A, 1 cho B…; dùng | tách lựa chọn/đáp án short. Với gaps/matching: slots ngăn bởi |, answers ngăn bởi ; theo từng mục; matching dùng số từ 1. Ảnh/audio được gắn sau khi nhập.</small>
    {error && <Notice error>{error}</Notice>}{preview && <><p>{preview.items.length} mục đọc được · {preview.errors.length} lỗi</p>{preview.errors.length > 0 && <Notice error>{preview.errors.map((s, i) => <div key={i}>{s}</div>)}</Notice>}<div className="import-preview">{preview.items.slice(0, 8).map((item, i) => <p key={i}>{i + 1}. {'term' in item ? `${item.term} → ${item.meaning}` : item.prompt}</p>)}</div><button type="button" className="btn-primary" disabled={!preview.items.length || !!preview.errors.length} onClick={() => { onImport(preview.items); setPreview(null) }}>Thêm vào bản nháp</button></>}
  </div>
}
export function useDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => { try { return JSON.parse(localStorage.getItem(key) || 'null')?.value ?? initial } catch { return initial } })
  const [saved, setSaved] = useState(''), [storageError, setStorageError] = useState('')
  const latest = useRef(value), cleared = useRef(false); latest.current = value
  useEffect(() => {
    const flush = () => { if (!cleared.current) { try { localStorage.setItem(key, JSON.stringify({ value: latest.current, at: new Date().toISOString() })) } catch { /* The visible autosave warning reports storage failures. */ } } }
    window.addEventListener('beforeunload', flush)
    return () => { window.removeEventListener('beforeunload', flush); flush() }
  }, [key])
  useEffect(() => { const timer = setTimeout(() => { if (cleared.current) return; try { const at = new Date().toISOString(); localStorage.setItem(key, JSON.stringify({ value, at })); setSaved(at); setStorageError('') } catch { setStorageError('Không lưu được bản nháp trên máy. Hãy lưu nội dung trước khi rời trang.') } }, 400); return () => clearTimeout(timer) }, [value, key])
  return { value, setValue, saved, storageError, clear: () => { cleared.current = true; localStorage.removeItem(key) } }
}
