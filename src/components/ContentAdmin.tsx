import { useState } from 'react'
import { addExamType, examDocument, saveLesson } from '../lib/api'
import { errorMessage, validateQuestions } from '../lib/content'
import type { ContentData, ExamDocument, Lang, Lesson, Status, Word } from '../lib/types'
import { LANG_DETAILS } from '../lib/types'
import { CsvImport, Empty, Notice, useDraft } from './Common'

import { BlockEditor, LessonContent } from './LessonBlocks'
import { lessonBlocks, lessonMedia } from '../lib/authoring'
import ExamEditor from './ExamEditor'

const statusNames: Record<Status, string> = { draft: 'Bản nháp', published: 'Đã xuất bản', archived: 'Đã lưu trữ' }
function StatusSelect({ value, onChange }: { value: Status; onChange: (s: Status) => void }) { return <label>Trạng thái<select value={value} onChange={e => onChange(e.target.value as Status)}>{Object.entries(statusNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label> }
function LessonEditor({ initial, initialWords, data, draftKey, onDone }: { initial: Lesson; initialWords: Word[]; data: ContentData; draftKey: string; onDone: () => Promise<void> }) {
  const draft = useDraft(draftKey, { lesson: initial, words: initialWords }), { lesson, words } = draft.value
  const [preview, setPreview] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const change = (patch: Partial<Lesson>) => draft.setValue(v => ({ ...v, lesson: { ...v.lesson, ...patch } }))
  const setWords = (list: Word[]) => draft.setValue(v => ({ ...v, words: list }))
  return <div className="stack"><div className="toolbar"><button className="btn-secondary" onClick={() => void onDone()}>← Danh sách</button><button className="btn-secondary" onClick={() => setPreview(v => !v)}>{preview ? 'Tiếp tục soạn' : 'Xem trước'}</button></div>{draft.saved && <small>Đã lưu bản nháp trên máy lúc {new Date(draft.saved).toLocaleTimeString('vi-VN')}</small>}{draft.storageError && <Notice error>{draft.storageError}</Notice>}
    {preview ? <div className="card-box"><span className="eyebrow">XEM TRƯỚC · {statusNames[lesson.status]}</span><h1>{lesson.title}</h1><p>{lesson.description}</p><LessonContent blocks={lessonBlocks(lesson)} /><h3>Từ vựng</h3>{words.map(w => <p key={w.id}><b>{w.term}</b> — {w.meaning}</p>)}</div>
    : <form className="card-box editor-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { const blocks = lessonBlocks(lesson); if (lesson.status === 'published') { const issues = blocks.flatMap(b => b.question ? b.question.kind === 'essay' ? ['Bài tập nhanh cần dạng tự chấm.'] : validateQuestions([b.question], true) : []); if (!blocks.length) issues.push('Bài học cần ít nhất một mục.'); if (issues.length) throw Error(issues.join('\n')) }; await saveLesson({ ...lesson, blocks, listening_text: blocks.map(b => b.transcript || '').filter(Boolean).join('\n\n'), media_keys: lessonMedia(blocks) }, words); draft.clear(); await onDone() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }}>
      <h2>{lesson.id ? 'Sửa bài học' : 'Tạo bài học'}</h2><div className="form-grid"><label>Khóa học<select value={lesson.course_id} onChange={e => change({ course_id: e.target.value })}>{data.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><StatusSelect value={lesson.status} onChange={status => change({ status })} /></div>
      <label>Tiêu đề<input required maxLength={200} value={lesson.title} onChange={e => change({ title: e.target.value })} /></label><label>Mô tả<textarea value={lesson.description} onChange={e => change({ description: e.target.value })} /></label>
      <div className="form-grid"><label>Trình độ<input value={lesson.level} onChange={e => change({ level: e.target.value })} /></label><label>Chủ đề<input value={lesson.category} onChange={e => change({ category: e.target.value })} /></label><label>Thời lượng (phút)<input type="number" min={1} max={300} value={lesson.duration_minutes} onChange={e => change({ duration_minutes: Number(e.target.value) })} /></label><label>Thứ tự<input type="number" value={lesson.sort_order} onChange={e => change({ sort_order: Number(e.target.value) })} /></label></div>
      <BlockEditor blocks={lessonBlocks(lesson)} onChange={blocks => change({ blocks, media_keys: lessonMedia(blocks), audio_key: null, image_key: null })} />
      <h3>Từ vựng ({words.length})</h3><CsvImport kind="words" onImport={items => setWords([...words, ...items as Word[]])} />
      {words.map((w, i) => <div className="word-editor" key={w.id}><div className="section-head"><b>Từ {i + 1}</b><button type="button" className="danger-link" onClick={() => setWords(words.filter((_, j) => j !== i))}>Xóa từ</button></div><div className="form-grid">{([['term', 'Từ/cụm từ'], ['meaning', 'Nghĩa'], ['pronunciation', 'Phiên âm'], ['example', 'Ví dụ'], ['example_translation', 'Dịch ví dụ']] as const).map(([field, label]) => <label key={field}>{label}<input required={field === 'term' || field === 'meaning'} value={w[field]} onChange={e => setWords(words.map((it, j) => i === j ? { ...it, [field]: e.target.value } : it))} /></label>)}</div></div>)}
      <button type="button" className="btn-secondary" onClick={() => setWords([...words, { id: crypto.randomUUID(), lesson_id: lesson.id, term: '', meaning: '', pronunciation: '', example: '', example_translation: '', sort_order: words.length }])}>+ Thêm từ vựng</button>
      <p className="secondary-label">Bài tập của bài học được tạo trong tab Đề thi, chọn bài học liên quan.</p>{error && <Notice error>{error}</Notice>}<button disabled={busy} className="btn-primary">{busy ? 'Đang lưu…' : lesson.status === 'published' ? 'Lưu và xuất bản' : 'Lưu nội dung'}</button>
    </form>}
  </div>
}
export default function ContentAdmin({ data, userId, refresh, kind }: { data: ContentData; userId: string; refresh: () => Promise<void>; kind: 'lessons' | 'exams' }) {
  const [editing, setEditing] = useState<{ key: string; lesson?: Lesson; words?: Word[]; exam?: ExamDocument } | null>(null)
  const [search, setSearch] = useState(''), [language, setLanguage] = useState<Lang>('en'), [error, setError] = useState(''), [typeName, setTypeName] = useState(''), [busy, setBusy] = useState(false)
  async function done() {
    try { await refresh() }
    catch (e) { setError(`Chưa tải lại được danh sách: ${errorMessage(e)}. Hãy tải lại trang trước khi tạo thêm nội dung.`) }
    finally { setEditing(null) }
  }
  function editLesson(l?: Lesson, clone = false) {
    const initial: Lesson = l ? { ...l, media_keys: [...new Set([...l.media_keys, l.audio_key, l.image_key].filter((k): k is string => !!k))], audio_key: null, image_key: null, ...(clone ? { id: '', title: l.title + ' (bản sao)', status: 'draft' as const } : {}) } : { id: '', course_id: data.courses.find(c => c.language_code === language)!.id, title: '', description: '', level: 'A1', category: 'Tổng hợp', duration_minutes: 10, sort_order: data.lessons.length, blocks: [{ id: crypto.randomUUID(), kind: 'text', title: 'Kiến thức trọng tâm', body: '' }], explanation: '', example_sentence: '', example_translation: '', listening_text: '', audio_key: null, image_key: null, media_keys: [], is_published: false, status: 'draft' }
    const words = data.vocabulary.filter(w => w.lesson_id === l?.id).map(w => clone ? { ...w, id: crypto.randomUUID() } : w)
    setEditing({ key: clone ? crypto.randomUUID() : initial.id || 'new-lesson', lesson: initial, words })
  }
  async function editExam(id?: string, clone = false) {
    setBusy(true); setError(''); try {
      const doc: ExamDocument = id ? await examDocument(id) : { id: '', language_code: language, exam_type_id: data.exam_types.find(t => t.language_code === language)!.id, lesson_id: null, title: '', description: '', duration_minutes: 30, status: 'draft', version: 0, media_keys: [], questions: [] }
      if (clone) { doc.id = ''; doc.lesson_id = null; doc.version = 0; doc.title += ' (bản sao)'; doc.status = 'draft'; doc.questions = doc.questions.map(q => ({ ...q, id: crypto.randomUUID() })) }
      setEditing({ key: clone ? crypto.randomUUID() : doc.id || 'new-exam', exam: doc })
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  if (editing?.lesson) return <LessonEditor key={editing.key} draftKey={`ln-draft-${userId}-${editing.key}`} initial={editing.lesson} initialWords={editing.words!} data={data} onDone={done} />
  if (editing?.exam) return <ExamEditor key={editing.key} draftKey={`ln-draft-${userId}-${editing.key}`} initial={editing.exam} data={data} onDone={done} />
  const list = (kind === 'lessons' ? data.lessons.filter(l => data.courses.find(c => c.id === l.course_id)?.language_code === language) : data.exams.filter(e => e.language_code === language)).filter(item => item.title.toLowerCase().includes(search.toLowerCase()))
  return <div className="stack"><div className="toolbar"><select aria-label="Ngôn ngữ quản trị" value={language} onChange={e => setLanguage(e.target.value as Lang)}>{Object.entries(LANG_DETAILS).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}</select><input aria-label="Tìm nội dung" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tiêu đề…" /><button className="btn-primary" disabled={busy} onClick={() => kind === 'lessons' ? editLesson() : void editExam()}>+ {kind === 'lessons' ? 'Tạo bài học' : 'Tạo đề thi'}</button></div>
    {error && <Notice error>{error}</Notice>}{kind === 'exams' && <form className="card-box inline-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await addExamType(language, typeName.trim()); setTypeName(''); await refresh() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }}><label>Thêm loại kỳ thi cho {LANG_DETAILS[language].label}<input required maxLength={80} value={typeName} onChange={e => setTypeName(e.target.value)} placeholder="Ví dụ: TOEFL, VSTEP…" /></label><button className="btn-secondary" disabled={busy}>Thêm loại kỳ thi</button></form>}
    {list.length === 0 && <Empty>Chưa có nội dung phù hợp.</Empty>}{list.map(item => <div className="card-box content-row" key={item.id}><div><span className={`status-badge ${item.status}`}>{statusNames[item.status]}</span><h3>{item.title}</h3><p>{item.description}</p></div><div className="toolbar"><button className="btn-secondary" disabled={busy} onClick={() => kind === 'lessons' ? editLesson(item as Lesson) : void editExam(item.id)}>Sửa / xem trước</button><button className="btn-secondary" disabled={busy} onClick={() => kind === 'lessons' ? editLesson(item as Lesson, true) : void editExam(item.id, true)}>Nhân bản</button></div></div>)}
  </div>
}
