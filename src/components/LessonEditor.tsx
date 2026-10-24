import { useState } from 'react'
import { examDocument, saveLessonBundle } from '../lib/api'
import { errorMessage, validateQuestions } from '../lib/content'
import { emptyPractice, validatePractice } from '../lib/practice'
import { useUnsavedChanges } from '../lib/useUnsavedChanges'
import type { ContentData, Lesson, PracticeDocument, Status, Word } from '../lib/types'
import { CsvImport, Notice, useDraft } from './Common'
import { BlockEditor, LessonContent } from './LessonBlocks'
import { lessonBlocks, lessonMedia, nestedMedia } from '../lib/authoring'
import PracticeEditor from './PracticeEditor'
const statusNames: Record<Status, string> = { draft: 'Bản nháp', published: 'Đã xuất bản', archived: 'Đã lưu trữ' }
function StatusSelect({ value, onChange }: { value: Status; onChange: (s: Status) => void }) { return <label>Trạng thái<select value={value} onChange={e => onChange(e.target.value as Status)}>{Object.entries(statusNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label> }
export default function LessonEditor({ initial, initialWords, initialPractice, data, draftKey, onDone }: { initial: Lesson; initialWords: Word[]; initialPractice: PracticeDocument; data: ContentData; draftKey: string; onDone: (saved?: boolean) => Promise<void> }) {
  const initialValue = { lesson: initial, words: initialWords, practice: initialPractice }
  const draft = useDraft(draftKey, initialValue), { lesson, words } = draft.value, practice = draft.value.practice || initialPractice
  const [tab, setTab] = useState<'content' | 'practice' | 'preview'>('content'), [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [source, setSource] = useState('')
  const dirty = !saved && JSON.stringify({ ...draft.value, practice }) !== JSON.stringify(initialValue)
  useUnsavedChanges(dirty)
  const change = (patch: Partial<Lesson>) => draft.setValue(v => ({ ...v, lesson: { ...v.lesson, ...patch } }))
  const setWords = (list: Word[]) => draft.setValue(v => ({ ...v, words: list }))
  const setPractice = (next: PracticeDocument) => draft.setValue(v => ({ ...v, practice: next }))
  const candidates = data.exams.filter(e => data.exam_types.find(t => t.id === e.exam_type_id)?.name === 'Bài tập' && e.language_code === data.courses.find(c => c.id === lesson.course_id)?.language_code && !data.practices?.some(p => p.source_exam_id === e.id))
  async function save() {
    setBusy(true); setError('')
    try {
      const blocks = lessonBlocks(lesson), issues = validatePractice(practice)
      if (!lesson.title.trim()) issues.push('Nhập tiêu đề bài học.')
      if (!Number.isInteger(lesson.duration_minutes) || lesson.duration_minutes < 1 || lesson.duration_minutes > 300) issues.push('Thời lượng bài học phải từ 1–300 phút.')
      if (!Number.isInteger(lesson.sort_order)) issues.push('Thứ tự bài học phải là số nguyên.')
      if (words.some(w => !w.term.trim() || !w.meaning.trim())) issues.push('Từ vựng cần từ và nghĩa.')
      if (lesson.status === 'published') { issues.push(...blocks.flatMap(b => b.question ? b.question.kind === 'essay' ? ['Bài tập nhanh cần dạng tự chấm.'] : validateQuestions([b.question], true) : [])); if (!blocks.length) issues.push('Bài học cần ít nhất một mục.') }
      if (issues.length) throw Error(issues.join('\n'))
      await saveLessonBundle({ ...lesson, blocks, listening_text: blocks.map(b => b.transcript || '').filter(Boolean).join('\n\n'), media_keys: lessonMedia(blocks) }, words, practice)
      setSaved(true); draft.clear(); await onDone(true)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return <div className="stack"><div className="editor-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={() => { if (!dirty || confirm('Có thay đổi chưa lưu. Quay về danh sách?')) void onDone() }}>← Danh sách</button><h2>{lesson.id ? 'Chỉnh sửa bài học' : 'Tạo bài học'}</h2><button type="button" className="practice-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Đang lưu…' : lesson.status === 'published' ? 'Lưu và xuất bản' : 'Lưu nội dung'}</button></div>
    {draft.saved && <small>Đã lưu bản nháp trên máy lúc {new Date(draft.saved).toLocaleTimeString('vi-VN')} · Bấm Lưu để đồng bộ bài học và bài tập.</small>}{draft.storageError && <Notice error>{draft.storageError}</Notice>}{error && <Notice error>{error}</Notice>}
    <div className="lesson-editor-tabs" role="tablist" aria-label="Chỉnh sửa bài học">{([['content','Nội dung bài học'],['practice','Bài tập luyện tập'],['preview','Xem trước']] as const).map(([key,label]) => <button type="button" role="tab" id={`lesson-tab-${key}`} aria-controls="lesson-editor-panel" aria-selected={tab === key} key={key} onClick={() => setTab(key)}>{label}</button>)}</div>
    <fieldset disabled={busy} className="lesson-editor-panel" role="tabpanel" id="lesson-editor-panel" aria-labelledby={`lesson-tab-${tab}`}>
      {tab === 'content' && <div className="card-box editor-form">
<div className="form-grid"><label>Khóa học<select value={lesson.course_id} onChange={e => change({ course_id: e.target.value })}>{data.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><StatusSelect value={lesson.status} onChange={status => change({ status })} /></div>
      <label>Tiêu đề<input required maxLength={200} value={lesson.title} onChange={e => change({ title: e.target.value })} /></label><label>Mô tả<textarea value={lesson.description} onChange={e => change({ description: e.target.value })} /></label>
      <div className="form-grid"><label>Trình độ<input value={lesson.level} onChange={e => change({ level: e.target.value })} /></label><label>Chủ đề<input value={lesson.category} onChange={e => change({ category: e.target.value })} /></label><label>Thời lượng (phút)<input type="number" min={1} max={300} value={lesson.duration_minutes} onChange={e => change({ duration_minutes: Number(e.target.value) })} /></label><label>Thứ tự<input type="number" value={lesson.sort_order} onChange={e => change({ sort_order: Number(e.target.value) })} /></label></div>
      <BlockEditor blocks={lessonBlocks(lesson)} onChange={blocks => change({ blocks, media_keys: lessonMedia(blocks), audio_key: null, image_key: null })} />
      <h3>Từ vựng ({words.length})</h3><CsvImport kind="words" onImport={items => setWords([...words, ...items as Word[]])} />
      {words.map((w, i) => <div className="word-editor" key={w.id}><div className="section-head"><b>Từ {i + 1}</b><button type="button" className="danger-link" onClick={() => setWords(words.filter((_, j) => j !== i))}>Xóa từ</button></div><div className="form-grid">{([['term', 'Từ/cụm từ'], ['meaning', 'Nghĩa'], ['pronunciation', 'Phiên âm'], ['example', 'Ví dụ'], ['example_translation', 'Dịch ví dụ']] as const).map(([field, label]) => <label key={field}>{label}<input required={field === 'term' || field === 'meaning'} value={w[field]} onChange={e => setWords(words.map((it, j) => i === j ? { ...it, [field]: e.target.value } : it))} /></label>)}</div></div>)}
      <button type="button" className="btn-secondary" onClick={() => setWords([...words, { id: crypto.randomUUID(), lesson_id: lesson.id, term: '', meaning: '', pronunciation: '', example: '', example_translation: '', sort_order: words.length }])}>+ Thêm từ vựng</button>

      </div>}
      {tab === 'practice' && <>{!practice.source_exam_id && candidates.length > 0 && <div className="card-box editor-form"><label>Chuyển bài ôn tập cũ vào bài học<select value={source} onChange={e => setSource(e.target.value)}><option value="">Chọn bài tập cũ chưa chuyển</option>{candidates.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label><button type="button" disabled={!source} onClick={async () => { if (practice.questions.length && !confirm('Thay bộ câu đang soạn bằng bài tập cũ? Bản đã lưu và lịch sử không bị xóa.')) return; setBusy(true); try { const old = await examDocument(source); setPractice({ ...emptyPractice(lesson.id), version: practice.version, questions: old.questions, layout: old.layout, media_keys: [...new Set([...old.media_keys, ...nestedMedia(old)])], source_exam_id: old.id, enabled: old.status === 'published' }) } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }}>Đưa vào bản soạn</button><small>Chỉ chuyển khi bấm lưu bài học. Đề gốc và lịch sử cũ vẫn được giữ.</small></div>}<PracticeEditor doc={practice} onChange={setPractice} /></>}
      {tab === 'preview' && <div className="stack"><h1>{lesson.title}</h1><p>{lesson.description}</p><LessonContent blocks={lessonBlocks(lesson)} /><div className="card-box"><h3>Từ vựng</h3>{words.map(w => <p key={w.id}><b>{w.term}</b> — {w.meaning}</p>)}</div><PracticeEditor doc={practice} onChange={setPractice} previewOnly /></div>}
    </fieldset>
  </div>
}
