import { checkPractice, emptyPractice, publicPracticeRun, validatePractice, learningExam } from './practice'
import type { PracticeDocument, PracticeRun } from './types'
import type { LeaderboardEntry } from './types'
import { scoreQuestion, nestedMedia } from './authoring'
import seed from '../data/demo.json'
import { validateQuestions } from './content'
import type { ContentData, ExamDocument, ExamRun, ExamType, Lesson, Profile, Progress, Summary, Word, LessonStudyStatus } from './types'

const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback } }
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))
const KEY = 'linguanest_workspace_v2', RUNS = 'linguanest_runs_v2'
type Store = ContentData & { documents: ExamDocument[]; practice_documents?: PracticeDocument[]; practice_migration?: boolean }
export function demoStore(): Store {
  const saved = read<Store | null>(KEY, null); if (saved) return upgradePractice(saved)
  const names = { en: ['IELTS', 'TOEIC', 'Cambridge', 'Bài tập'], fr: ['DELF', 'DALF', 'TCF', 'Bài tập'], zh: ['HSK', 'HSKK', 'Bài tập'], ja: ['JLPT', 'J.TEST', 'Bài tập'] }
  const types: ExamType[] = Object.entries(names).flatMap(([lang, list]) => list.map(name => ({ id: crypto.randomUUID(), language_code: lang as ExamType['language_code'], name })))
  const custom = read<{ lessons: Lesson[]; vocabulary: Word[]; exercises: typeof seed.exercises }>('linguanest_demo_content_v1', { lessons: [], vocabulary: [], exercises: [] })
  const lessons = [...seed.lessons, ...custom.lessons].map(l => ({ ...l, status: l.is_published ? 'published' : 'draft', media_keys: [] })) as Lesson[]
  const documents: ExamDocument[] = lessons.map(l => {
    const lang = seed.courses.find(c => c.id === l.course_id)!.language_code as ExamType['language_code']
    return { id: crypto.randomUUID(), language_code: lang, exam_type_id: types.find(t => t.language_code === lang && t.name === 'Bài tập')!.id, lesson_id: l.id, title: `Bài tập: ${l.title}`, description: 'Bài luyện tập mẫu. Bạn có thể tự tạo đề IELTS, TOEIC hoặc kỳ thi khác ở trang quản trị.', duration_minutes: 15, status: l.status, version: 1, media_keys: [], questions: [...seed.exercises, ...custom.exercises].filter(q => q.lesson_id === l.id).map(q => ({ id: q.id, section: 'Bài tập', kind: 'choice', prompt: q.prompt, passage: '', choices: q.choices, answers: [String(q.answer_index)], explanation: q.explanation, points: 1 })) }
  }).filter(d => d.questions.length) as ExamDocument[]
  const store: Store = { courses: seed.courses as ContentData['courses'], lessons, vocabulary: [...seed.vocabulary, ...custom.vocabulary], exams: documents.map(({ questions: _questions, ...exam }) => exam), exam_types: types, documents }
  write(KEY, store); return upgradePractice(store)
}
export const demoProfile = (): Profile => read('linguanest_profile_v2', { id: 'demo', username: 'demo', display_name: 'Bạn học thử', role: 'admin', is_active: true, must_change_password: false })
export function demoRename(name: string) { write('linguanest_profile_v2', { ...demoProfile(), display_name: name }) }
export function demoAvatar(data: string | null) { write('linguanest_profile_v2', { ...demoProfile(), avatar_data_url: data }) }
export function demoLesson(lesson: Lesson, words: Word[]) {
  const s = demoStore(); const id = lesson.id || crypto.randomUUID()
  s.lessons = [...s.lessons.filter(l => l.id !== id), { ...lesson, id, is_published: lesson.status === 'published' }]
  s.vocabulary = [...s.vocabulary.filter(w => w.lesson_id !== id), ...words.map((w, i) => ({ ...w, id: w.id || crypto.randomUUID(), lesson_id: id, sort_order: i }))]
  write(KEY, s); return id
}
export function demoExam(doc: ExamDocument) {
  if (demoStore().practices?.some(p => p.source_exam_id === doc.id)) throw Error('Hãy sửa bài tập trong Bài học')
  const errors = doc.status === 'published' ? validateQuestions(doc.questions, true) : []; if (errors.length) throw Error(errors.join('\n'))
  const s = demoStore(), old = s.documents.find(d => d.id === doc.id)
  if (old && old.version !== doc.version) throw Error('Đề đã thay đổi. Hãy tải lại.')
  const saved = { ...doc, id: doc.id || crypto.randomUUID(), version: (old?.version || 0) + 1 }
  s.documents = [...s.documents.filter(d => d.id !== saved.id), saved]
  s.exams = s.documents.map(({ questions: _questions, ...exam }) => ({ ...exam, mode: exam.layout?.mode || 'mock' })); write(KEY, s); return saved.id
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
const publicRun = (r: ExamRun): ExamRun => r.status === 'in_progress' ? { ...r, layout: r.layout ? { ...r.layout, groups: r.layout.groups.map(({ transcript: _t, ...g }) => g) } : undefined, questions: r.questions.map(({ answers: _a, explanation: _e, rubric: _r, ...q }) => q) } : r
export function demoRun(id: string) { const r = runs().find(r => r.id === id); if (!r) throw Error('Không tìm thấy bài.'); return publicRun(r) }
export function demoStart(id: string) {
  if (demoStore().practices?.some(p => p.source_exam_id === id)) throw Error('Bài tập này đã chuyển vào Bài học. Lượt thi cũ vẫn ở Lịch sử')
  const s = demoStore(), doc = s.documents.find(e => e.id === id)
  if (!doc || doc.status !== 'published') throw Error('Đề chưa xuất bản.')
  const active = runs().find(r => r.exam_id === id && r.status === 'in_progress'); if (active) return publicRun(active)
  const r: ExamRun = { id: crypto.randomUUID(), exam_id: id, title: doc.title, language_code: doc.language_code, version: doc.version, layout: structuredClone(doc.layout), media_keys: [...new Set([...doc.media_keys, ...nestedMedia(doc)])], questions: structuredClone(doc.questions), responses: {}, revision: 0, started_at: new Date().toISOString(), deadline: doc.layout?.mode === 'practice' ? null : new Date(Date.now() + doc.duration_minutes * 60000).toISOString(), status: 'in_progress', submitted_at: null, score: 0, max_score: doc.questions.reduce((s, q) => s + q.points, 0), grades: {}, user_id: 'demo', display_name: demoProfile().display_name }
  saveRun(r); return publicRun(r)
}
export function demoResponses(id: string, responses: Record<string, string>, revision: number) {
  const r = runs().find(r => r.id === id)!
  if (r.status !== 'in_progress' || (r.deadline !== null && Date.now() >= Date.parse(r.deadline))) throw Error('Bài đã hết giờ.')
  if (r.revision !== revision) throw Error('Bài đã được lưu từ tab khác. Hãy mở lại bài.')
  r.responses = responses; r.revision++; saveRun(r); return r.revision
}
export function demoSubmit(id: string, responses: Record<string, string>, revision: number) {
  const r = runs().find(r => r.id === id)!
  if (r.status !== 'in_progress') return r
  if ((r.deadline === null || Date.now() < Date.parse(r.deadline))) { if (r.revision !== revision) throw Error('Bài đã được lưu từ tab khác.'); r.responses = responses }
  r.score = 0; r.status = 'graded'
  for (const q of r.questions) {
    const answer = r.responses[q.id] || ''
    const score = q.kind === 'essay' ? null : scoreQuestion(q, answer)
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
  return { lesson_status: demoStudyStatus(), dedicated_exam_count: demoDedicatedRuns().filter(r => r.status !== 'in_progress').length, exam_xp: demoDedicatedRuns().filter(r => r.status === 'graded').reduce((sum, r) => sum + r.score * 5, 0), progress, xp: progress.reduce((s, p) => s + p.xp, 0) + legacy.reduce((s, a) => s + Math.min(a.correct_count, a.total_count) * 5, 0) + runs().filter(r => r.status === 'graded').reduce((s, r) => s + r.score * 5, 0), exam_count: runs().filter(r => r.status !== 'in_progress').length, legacy_count: legacy.length }
}

export function demoLeaderboard(): LeaderboardEntry[] {
  practiceMember()
  const { id, display_name, avatar_data_url } = demoProfile()
  return [{ id, display_name, avatar_data_url, xp: demoSummary().xp, rank: 1 }]
}


function upgradePractice(store: Store): Store {
  if (!store.practice_migration) {
    store.practice_documents ||= []
    for (const doc of store.documents) if (doc.lesson_id && store.exam_types.find(t => t.id === doc.exam_type_id)?.name === 'Bài tập' && !store.practice_documents.some(p => p.lesson_id === doc.lesson_id || p.source_exam_id === doc.id)) {
      store.practice_documents.push({ lesson_id: doc.lesson_id, version: 1, questions: structuredClone(doc.questions), layout: structuredClone(doc.layout), media_keys: [...new Set([...doc.media_keys, ...nestedMedia(doc)])], source_exam_id: doc.id, enabled: doc.status === 'published' })
    }
    store.practice_migration = true
    write(KEY, store)
  }
  store.practices = (store.practice_documents || []).map(p => ({ lesson_id: p.lesson_id, question_count: p.questions.length, enabled: p.enabled, source_exam_id: p.source_exam_id || null }))
  return store
}
function practiceAdmin() { if (demoProfile().role !== 'admin' || !demoProfile().is_active || demoProfile().must_change_password) throw Error('Chỉ quản trị viên') }
export function demoPracticeDocument(id: string): PracticeDocument { practiceAdmin(); return structuredClone(demoStore().practice_documents?.find(p => p.lesson_id === id) || emptyPractice(id)) }
export function demoLessonBundle(doc: Lesson, words: Word[], practice: PracticeDocument) {
  practiceAdmin()
  const issues = validatePractice(practice); if (issues.length) throw Error(issues.join('\n'))
  const store = demoStore(), id = doc.id || crypto.randomUUID(), old = store.practice_documents?.find(p => p.lesson_id === id)
  if ((old?.version || 0) !== practice.version) throw Error('Bài tập đã được sửa ở nơi khác. Hãy tải lại')
  if (old?.source_exam_id && old.source_exam_id !== practice.source_exam_id) throw Error('Không thay liên kết nguồn đã chuyển')
  if (practice.source_exam_id && store.practice_documents?.some(p => p.lesson_id !== id && p.source_exam_id === practice.source_exam_id)) throw Error('Bài tập nguồn đã được chuyển vào bài học khác')
  if (practice.source_exam_id) {
    const source = store.documents.find(e => e.id === practice.source_exam_id)
    if (!source || source.language_code !== store.courses.find(c => c.id === doc.course_id)?.language_code) throw Error('Đề nguồn không thuộc ngôn ngữ bài học')
  }
  const saved = { ...structuredClone(practice), lesson_id: id, version: practice.version + 1, media_keys: [...new Set([...practice.media_keys, ...nestedMedia(practice)])] }
  store.lessons = [...store.lessons.filter(l => l.id !== id), { ...doc, id, is_published: doc.status === 'published' }]
  store.vocabulary = [...store.vocabulary.filter(w => w.lesson_id !== id), ...words.map((w, i) => ({ ...w, id: w.id || crypto.randomUUID(), lesson_id: id, sort_order: i }))]
  store.practice_documents = [...(store.practice_documents || []).filter(p => p.lesson_id !== id), saved]
  write(KEY, store); return id
}
const PRACTICE_RUNS = 'linguanest_practice_runs_v1'
const practiceRuns = () => read<PracticeRun[]>(PRACTICE_RUNS, [])
function practiceMember() { const p = demoProfile(); if (!p.is_active || p.must_change_password) throw Error('Không có quyền') }
function storePracticeRun(run: PracticeRun) { write(PRACTICE_RUNS, [run, ...practiceRuns().filter(r => r.id !== run.id)]); return publicPracticeRun(run) }
export function demoStartPractice(lesson_id: string) {
  practiceMember(); const store = demoStore(), lesson = store.lessons.find(l => l.id === lesson_id && l.status === 'published')
  if (!lesson) throw Error('Bài học chưa xuất bản')
  const active = practiceRuns().find(r => r.lesson_id === lesson_id && r.status === 'in_progress'); if (active) return publicPracticeRun(active)
  const p = store.practice_documents?.find(p => p.lesson_id === lesson_id && p.enabled && p.questions.length)
  if (!p) throw Error('Bài học chưa có luyện tập')
  const run: PracticeRun = { ...structuredClone(p), id: crypto.randomUUID(), title: lesson.title, responses: {}, checks: {}, revision: 0, status: 'in_progress', started_at: new Date().toISOString(), completed_at: null }
  return storePracticeRun(run)
}
export function demoPracticeRun(id: string) { practiceMember(); const run = practiceRuns().find(r => r.id === id); if (!run) throw Error('Không tìm thấy lượt luyện tập'); return publicPracticeRun(run) }
export function demoPracticeHistory(id: string) { practiceMember(); return practiceRuns().filter(r => r.lesson_id === id).sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 20).map(publicPracticeRun) }
function editablePractice(id: string, revision: number) {
  practiceMember(); const r = practiceRuns().find(r => r.id === id)
  if (!r || r.status !== 'in_progress') throw Error('Lượt luyện tập đã kết thúc')
  if (r.revision !== revision) throw Error('Bài đã lưu ở thiết bị khác. Hãy tải lại lượt luyện tập')
  return r
}
export function demoPracticeAnswers(id: string, responses: Record<string, string>, revision: number) {
  const r = editablePractice(id, revision)
  const next = { ...responses }
  for (const q of r.questions) if (r.checks[q.id]?.locked) next[q.id] = r.responses[q.id] || ''
  r.responses = next
  r.revision++; return storePracticeRun(r)
}
export function demoCheckPractice(id: string, question: string, response: string, revision: number, reveal = false) {
  const r = editablePractice(id, revision), q = r.questions.find(q => q.id === question)
  if (!q) throw Error('Không tìm thấy câu hỏi')
  if (!r.checks[q.id]?.locked) { r.responses[q.id] = response; r.checks[q.id] = checkPractice(q, response, r.checks[q.id], reveal); r.revision++ }
  return storePracticeRun(r)
}
export function demoFinishPractice(id: string, responses: Record<string, string>, revision: number) {
  practiceMember(); const old = practiceRuns().find(r => r.id === id); if (old?.status === 'completed') return publicPracticeRun(old)
  const r = editablePractice(id, revision)
  for (const q of r.questions) if (!r.checks[q.id]?.locked) { r.responses[q.id] = responses[q.id] || ''; r.checks[q.id] = { ...checkPractice(q, r.responses[q.id], r.checks[q.id]), locked: true } }
  r.status = 'completed'; r.completed_at = new Date().toISOString(); r.revision++; return storePracticeRun(r)
}


const STUDY_STARTS = 'linguanest_study_starts_v1'
export function demoBeginLesson(id: string) {
  practiceMember()
  if (!demoStore().lessons.some(l => l.id === id && l.status === 'published')) throw Error('Bài học chưa xuất bản')
  const visits = read<Record<string, string>>(STUDY_STARTS, {})
  if (!visits[id]) { visits[id] = new Date().toISOString(); write(STUDY_STARTS, visits) }
}
function legacySources() {
  const store = demoStore()
  return store.exams.filter(e => learningExam(e, store)).map(e => ({ exam_id: e.id, lesson_id: store.practice_documents?.find(p => p.source_exam_id === e.id)?.lesson_id || e.lesson_id }))
}
const demoDedicatedRuns = () => { const sources = legacySources(); return runs().filter(r => !sources.some(s => s.exam_id === r.exam_id)) }
export const demoExamHistory = (offset = 0) => demoDedicatedRuns().sort((a, b) => b.started_at.localeCompare(a.started_at) || a.id.localeCompare(b.id)).slice(offset, offset + 20).map(publicRun)
export function demoLessonExamHistory(id: string | null, offset = 0) {
  practiceMember(); const sources = legacySources().filter(s => s.lesson_id === id)
  return runs().filter(r => sources.some(s => s.exam_id === r.exam_id)).sort((a, b) => b.started_at.localeCompare(a.started_at) || a.id.localeCompare(b.id)).slice(offset, offset + 20).map(publicRun)
}
export function demoStudyStatus(): LessonStudyStatus[] {
  const visits = read<Record<string, string>>(STUDY_STARTS, {}), sources = legacySources()
  const attempts = practiceRuns().map(r => ({ id: r.id, lesson_id: r.lesson_id, started_at: r.started_at, finished_at: r.completed_at, completed: r.status === 'completed', active: r.status === 'in_progress', score: Object.values(r.checks).reduce((sum, c) => sum + c.score, 0), max_score: r.questions.filter(q => q.kind !== 'essay').reduce((sum, q) => sum + q.points, 0) }))
  for (const r of runs()) { const source = sources.find(s => s.exam_id === r.exam_id); if (source?.lesson_id) attempts.push({ id: r.id, lesson_id: source.lesson_id, started_at: r.started_at, finished_at: r.submitted_at, completed: r.status === 'graded', active: r.status === 'in_progress', score: r.score, max_score: r.max_score }) }
  for (const p of read<Progress[]>('linguanest_demo_progress_v1', [])) if (!visits[p.lesson_id]) visits[p.lesson_id] = p.completed_at
  for (const r of attempts) if (!visits[r.lesson_id] || visits[r.lesson_id] > r.started_at) visits[r.lesson_id] = r.started_at
  return Object.entries(visits).map(([lesson_id, started_at]) => {
    const list = attempts.filter(r => r.lesson_id === lesson_id), completed = list.filter(r => r.completed).sort((a, b) => (b.finished_at || '').localeCompare(a.finished_at || '') || b.id.localeCompare(a.id))
    return { lesson_id, started_at, completed_runs: completed.length, active_run: list.some(r => r.active), score: completed[0]?.score ?? null, max_score: completed[0]?.max_score ?? null }
  })
}
