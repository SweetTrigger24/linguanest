import { useState } from 'react'
import { addExamType, examDocument, lessonPractice } from '../lib/api'
import { errorMessage } from '../lib/content'
import type { ContentData, ExamDocument, Lang, Lesson, PracticeDocument, Status, Word } from '../lib/types'
import { LANG_DETAILS } from '../lib/types'
import { Empty, Notice } from './Common'

import LessonEditor from './LessonEditor'
import { emptyPractice, learningExam } from '../lib/practice'
import ExamEditor from './ExamEditor'

const statusNames: Record<Status, string> = { draft: 'Bản nháp', published: 'Đã xuất bản', archived: 'Đã lưu trữ' }
export default function ContentAdmin({ data, userId, refresh, kind }: { data: ContentData; userId: string; refresh: () => Promise<void>; kind: 'lessons' | 'exams' }) {
  const [editing, setEditing] = useState<{ key: string; lesson?: Lesson; words?: Word[]; practice?: PracticeDocument; exam?: ExamDocument } | null>(null)
  const [search, setSearch] = useState(''), [language, setLanguage] = useState<Lang>('en'), [error, setError] = useState(''), [typeName, setTypeName] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  async function done() {
    try { await refresh() }
    catch (e) { setError(`Chưa tải lại được danh sách: ${errorMessage(e)}. Hãy tải lại trang trước khi tạo thêm nội dung.`) }
    finally { setEditing(null) }
  }
  async function editLesson(l?: Lesson, clone = false) {
    setBusy(true); setError(''); setMessage(''); try {
    const initial: Lesson = l ? { ...l, media_keys: [...new Set([...l.media_keys, l.audio_key, l.image_key].filter((k): k is string => !!k))], audio_key: null, image_key: null, ...(clone ? { id: '', title: l.title + ' (bản sao)', status: 'draft' as const } : {}) } : { id: '', course_id: data.courses.find(c => c.language_code === language)!.id, title: '', description: '', level: 'A1', category: 'Tổng hợp', duration_minutes: 10, sort_order: data.lessons.length, blocks: [{ id: crypto.randomUUID(), kind: 'text', title: 'Kiến thức trọng tâm', body: '' }], explanation: '', example_sentence: '', example_translation: '', listening_text: '', audio_key: null, image_key: null, media_keys: [], is_published: false, status: 'draft' }
    const words = data.vocabulary.filter(w => w.lesson_id === l?.id).map(w => clone ? { ...w, id: crypto.randomUUID() } : w)
    const practice = l ? await lessonPractice(l.id) : emptyPractice()
    if (clone) { practice.lesson_id = ''; practice.version = 0; practice.source_exam_id = null; practice.questions = practice.questions.map(q => ({ ...q, id: crypto.randomUUID() })) }
    setEditing({ key: clone ? crypto.randomUUID() : initial.id || 'new-lesson', lesson: initial, words, practice })
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  async function editExam(id?: string, clone = false) {
    setBusy(true); setError(''); try {
      const doc: ExamDocument = id ? await examDocument(id) : { id: '', language_code: language, exam_type_id: data.exam_types.find(t => t.language_code === language && t.name !== 'Bài tập')!.id, lesson_id: null, title: '', description: '', duration_minutes: 30, status: 'draft', version: 0, media_keys: [], questions: [] }
      if (clone) { doc.id = ''; doc.lesson_id = null; doc.version = 0; doc.title += ' (bản sao)'; doc.status = 'draft'; doc.questions = doc.questions.map(q => ({ ...q, id: crypto.randomUUID() })) }
      setEditing({ key: clone ? crypto.randomUUID() : doc.id || 'new-exam', exam: doc })
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  if (editing?.lesson) return <LessonEditor key={editing.key} draftKey={`ln-draft-${userId}-${editing.key}`} initial={editing.lesson} initialWords={editing.words!} initialPractice={editing.practice!} data={data} onDone={async saved => { await done(); if (saved) setMessage('Đã lưu bài học và bài tập luyện tập.') }} />
  if (editing?.exam) return <ExamEditor key={editing.key} draftKey={`ln-draft-${userId}-${editing.key}`} initial={editing.exam} data={data} onDone={done} />
  const list = (kind === 'lessons' ? data.lessons.filter(l => data.courses.find(c => c.id === l.course_id)?.language_code === language) : data.exams.filter(e => e.language_code === language && !learningExam(e, data))).filter(item => item.title.toLowerCase().includes(search.toLowerCase()))
  return <div className="stack"><div className="toolbar"><select aria-label="Ngôn ngữ quản trị" value={language} onChange={e => setLanguage(e.target.value as Lang)}>{Object.entries(LANG_DETAILS).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}</select><input aria-label="Tìm nội dung" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tiêu đề…" /><button className="btn-primary" disabled={busy} onClick={() => kind === 'lessons' ? editLesson() : void editExam()}>+ {kind === 'lessons' ? 'Tạo bài học' : 'Tạo đề thi'}</button></div>
    {error && <Notice error>{error}</Notice>}{message && <Notice>{message}</Notice>}{kind === 'exams' && <form className="card-box inline-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await addExamType(language, typeName.trim()); setTypeName(''); await refresh() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }}><label>Thêm loại kỳ thi cho {LANG_DETAILS[language].label}<input required maxLength={80} value={typeName} onChange={e => setTypeName(e.target.value)} placeholder="Ví dụ: TOEFL, VSTEP…" /></label><button className="btn-secondary" disabled={busy}>Thêm loại kỳ thi</button></form>}
    {list.length === 0 && <Empty>Chưa có nội dung phù hợp.</Empty>}{list.map(item => <div className="card-box content-row" key={item.id}><div><span className={`status-badge ${item.status}`}>{statusNames[item.status]}</span><h3>{item.title}</h3><p>{item.description}</p></div><div className="toolbar"><button className="btn-secondary" disabled={busy} onClick={() => kind === 'lessons' ? editLesson(item as Lesson) : void editExam(item.id)}>Sửa / xem trước</button><button className="btn-secondary" disabled={busy} onClick={() => kind === 'lessons' ? editLesson(item as Lesson, true) : void editExam(item.id, true)}>Nhân bản</button></div></div>)}
  </div>
}
