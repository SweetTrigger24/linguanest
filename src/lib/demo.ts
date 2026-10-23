import seed from '../data/demo.json'
import { normalizeAnswer, validateQuestions } from './content'
import type { ContentData, ExamDocument, ExamRun, ExamType, Lesson, Profile, Progress, Summary, Word } from './types'

const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback } }
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))
const KEY = 'linguanest_workspace_v2', RUNS = 'linguanest_runs_v2'
type Store = ContentData & { documents: ExamDocument[] }
export function demoStore(): Store {
  const saved = read<Store | null>(KEY, null); if (saved) return saved
  const names = { en: ['IELTS', 'TOEIC', 'Cambridge', 'Bài tập'], fr: ['DELF', 'DALF', 'TCF', 'Bài tập'], zh: ['HSK', 'HSKK', 'Bài tập'], ja: ['JLPT', 'J.TEST', 'Bài tập'] }
  const types: ExamType[] = Object.entries(names).flatMap(([lang, list]) => list.map(name => ({ id: crypto.randomUUID(), language_code: lang as ExamType['language_code'], name })))
  const custom = read<{ lessons: Lesson[]; vocabulary: Word[]; exercises: typeof seed.exercises }>('linguanest_demo_content_v1', { lessons: [], vocabulary: [], exercises: [] })
  const lessons = [...seed.lessons, ...custom.lessons].map(l => ({ ...l, status: l.is_published ? 'published' : 'draft', media_keys: [] })) as Lesson[]
  const documents: ExamDocument[] = lessons.map(l => {
    const lang = seed.courses.find(c => c.id === l.course_id)!.language_code as ExamType['language_code']
    return { id: crypto.randomUUID(), language_code: lang, exam_type_id: types.find(t => t.language_code === lang && t.name === 'Bài tập')!.id, lesson_id: l.id, title: `Bài tập: ${l.title}`, description: 'Bài luyện tập mẫu. Bạn có thể tự tạo đề IELTS, TOEIC hoặc kỳ thi khác ở trang quản trị.', duration_minutes: 15, status: l.status, version: 1, media_keys: [], questions: [...seed.exercises, ...custom.exercises].filter(q => q.lesson_id === l.id).map(q => ({ id: q.id, section: 'Bài tập', kind: 'choice', prompt: q.prompt, passage: '', choices: q.choices, answers: [String(q.answer_index)], explanation: q.explanation, points: 1 })) }
  }).filter(d => d.questions.length) as ExamDocument[]
  const store: Store = { courses: seed.courses as ContentData['courses'], lessons, vocabulary: [...seed.vocabulary, ...custom.vocabulary], exams: documents.map(({ questions: _questions, ...exam }) => exam), exam_types: types, documents }
  write(KEY, store); return store
}
export const demoProfile = (): Profile => read('linguanest_profile_v2', { id: 'demo', username: 'demo', display_name: 'Bạn học thử', role: 'admin', is_active: true, must_change_password: false })
export function demoRename(name: string) { write('linguanest_profile_v2', { ...demoProfile(), display_name: name }) }
export function demoLesson(lesson: Lesson, words: Word[]) {
  const s = demoStore(); const id = lesson.id || crypto.randomUUID()
  s.lessons = [...s.lessons.filter(l => l.id !== id), { ...lesson, id, is_published: lesson.status === 'published' }]
  s.vocabulary = [...s.vocabulary.filter(w => w.lesson_id !== id), ...words.map((w, i) => ({ ...w, id: w.id || crypto.randomUUID(), lesson_id: id, sort_order: i }))]
  write(KEY, s); return id
}
export function demoExam(doc: ExamDocument) {
  const errors = validateQuestions(doc.questions, doc.status === 'published'); if (errors.length) throw Error(errors.join('\n'))
  const s = demoStore(), old = s.documents.find(d => d.id === doc.id)
  if (old && old.version !== doc.version) throw Error('Đề đã thay đổi. Hãy tải lại.')
  const saved = { ...doc, id: doc.id || crypto.randomUUID(), version: (old?.version || 0) + 1 }
  s.documents = [...s.documents.filter(d => d.id !== saved.id), saved]
  s.exams = s.documents.map(({ questions: _questions, ...exam }) => exam); write(KEY, s); return saved.id
}
export function demoType(language_code: ExamType['language_code'], name: string) {
  const s = demoStore(); if (s.exam_types.some(t => t.language_code === language_code && t.name === name)) throw Error('Loại kỳ thi đã có.')
  const item = { id: crypto.randomUUID(), language_code, name }; s.exam_types.push(item); write(KEY, s); return item
}
export function demoComplete(id: string) {
  const p = read<Progress[]>('linguanest_demo_progress_v1', [])
  if (!p.some(x => x.lesson_id === id)) { p.push({ lesson_id: id, completed_at: new Date().toISOString(), xp: 20 }); write('linguanest_demo_progress_v1', p) }
}
const runs = () => read<ExamRun[]>(RUNS, [])
function saveRun(r: ExamRun) { write(RUNS, [r, ...runs().filter(v => v.id !== r.id)]) }
const publicRun = (r: ExamRun): ExamRun => r.status === 'in_progress' ? { ...r, questions: r.questions.map(({ answers: _a, explanation: _e, ...q }) => q) } : r
export function demoRun(id: string) { const r = runs().find(r => r.id === id); if (!r) throw Error('Không tìm thấy bài.'); return publicRun(r) }
export function demoStart(id: string) {
  const s = demoStore(), doc = s.documents.find(e => e.id === id)
  if (!doc || doc.status !== 'published') throw Error('Đề chưa xuất bản.')
  const active = runs().find(r => r.exam_id === id && r.status === 'in_progress'); if (active) return publicRun(active)
  const r: ExamRun = { id: crypto.randomUUID(), exam_id: id, title: doc.title, language_code: doc.language_code, version: doc.version, media_keys: doc.media_keys, questions: structuredClone(doc.questions), responses: {}, revision: 0, started_at: new Date().toISOString(), deadline: new Date(Date.now() + doc.duration_minutes * 60000).toISOString(), status: 'in_progress', submitted_at: null, score: 0, max_score: doc.questions.reduce((s, q) => s + q.points, 0), grades: {}, user_id: 'demo', display_name: demoProfile().display_name }
  saveRun(r); return publicRun(r)
}
export function demoResponses(id: string, responses: Record<string, string>, revision: number) {
  const r = runs().find(r => r.id === id)!
  if (r.status !== 'in_progress' || Date.now() >= Date.parse(r.deadline)) throw Error('Bài đã hết giờ.')
  if (r.revision !== revision) throw Error('Bài đã được lưu từ tab khác. Hãy mở lại bài.')
  r.responses = responses; r.revision++; saveRun(r); return r.revision
}
export function demoSubmit(id: string, responses: Record<string, string>, revision: number) {
  const r = runs().find(r => r.id === id)!
  if (r.status !== 'in_progress') return r
  if (Date.now() < Date.parse(r.deadline)) { if (r.revision !== revision) throw Error('Bài đã được lưu từ tab khác.'); r.responses = responses }
  r.score = 0; r.status = 'graded'
  for (const q of r.questions) {
    const answer = r.responses[q.id] || ''
    const score = q.kind === 'essay' ? null : (q.kind === 'choice' ? q.answers?.[0] === answer : q.answers?.some(a => normalizeAnswer(a) === normalizeAnswer(answer))) ? q.points : 0
    if (score === null) r.status = 'pending_review'; else r.score += score
    r.grades[q.id] = { score, feedback: '' }
  }
  r.submitted_at = new Date().toISOString(); r.revision++; saveRun(r); return r
}
export function demoGrade(id: string, grades: ExamRun['grades']) {
  const r = runs().find(r => r.id === id)!
  if (r.status !== 'pending_review') throw Error('Bài không còn chờ chấm.')
  for (const q of r.questions.filter(q => q.kind === 'essay')) {
    const g = grades[q.id]; if (!g || g.score === null || !Number.isInteger(g.score) || g.score < 0 || g.score > q.points) throw Error('Điểm không hợp lệ.')
    r.grades[q.id] = g
  }
  r.score = Object.values(r.grades).reduce((s, g) => s + (g.score || 0), 0); r.status = 'graded'; saveRun(r); return r
}
export const demoHistory = (offset: number, pending: boolean) => runs().filter(r => !pending || r.status === 'pending_review').sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(offset, offset + 20).map(publicRun)
export function demoSummary(): Summary {
  const progress = read<Progress[]>('linguanest_demo_progress_v1', []), legacy = read<{ correct_count: number; total_count: number }[]>('linguanest_demo_attempts_v1', [])
  return { progress, xp: progress.reduce((s, p) => s + p.xp, 0) + legacy.reduce((s, a) => s + Math.min(a.correct_count, a.total_count) * 5, 0) + runs().filter(r => r.status === 'graded').reduce((s, r) => s + r.score * 5, 0), exam_count: runs().filter(r => r.status !== 'in_progress').length, legacy_count: legacy.length }
}
