import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function moduleAt(entry, plugins = []) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', plugins })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const practice = await moduleAt('src/lib/practice.ts'), demo = await moduleAt('src/lib/demo.ts')
const storage = new Map()
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }
const question = patch => ({ id: 'p1', kind: 'short', section: 'Practice', prompt: 'One child, two {{blank}}.', choices: [], answers: ['children', 'kids'], passage: '', explanation: 'Irregular plural.', points: 1, max_attempts: 2, ...patch })

test('practice marking: configured alternatives, attempts, multi-choice and per-slot feedback', () => {
  const q = question(), first = practice.checkPractice(q, 'childs')
  assert.equal(first.correct, false); assert.equal(first.locked, false)
  const second = practice.checkPractice(q, '  KIDS  ', first)
  assert.equal(second.correct, true); assert.equal(second.locked, true)
  assert.deepEqual(practice.checkPractice(q, 'wrong', second), second)
  assert.equal(practice.checkPractice(q, 'young people').correct, false)
  assert.equal(practice.checkPractice(q, 'children', undefined, true).score, 0)
  assert.equal(practice.checkPractice(question({ kind: 'multi', choices: ['a', 'b', 'c'], answers: ['0', '2'] }), '["2","0"]').correct, true)
  const gaps = question({ kind: 'gaps', slots: ['City', 'Color'], answers: ['hanoi|ha noi', 'blue'], points: 2, word_limit: 2 })
  const marked = practice.checkPractice(gaps, '[" HA  NOI ","red"]')
  assert.equal(marked.score, 1); assert.deepEqual(marked.slot_correct, [true, false])
  assert.equal(practice.checkPractice(gaps, '["ha noi city","blue"]').score, 1)
  assert.ok(practice.validatePractice({ ...practice.emptyPractice(), questions: [question({ answers: [] })] }).length)
})

test('demo safely migrates old exercises once, retains old exam histories and keeps certificates separate', () => {
  storage.clear()
  const initial = demo.demoStore(), doc = initial.documents[0]
  delete initial.practice_migration; delete initial.practice_documents; delete initial.practices
  initial.documents.push({ ...doc, id: 'certificate', exam_type_id: initial.exam_types.find(t => t.name === 'IELTS').id })
  initial.exams.push({ ...initial.documents.at(-1) })
  const oldRun = { id: 'old', exam_id: doc.id, status: 'graded', questions: doc.questions, score: 1, max_score: 3, submitted_at: new Date().toISOString(), started_at: new Date().toISOString() }
  storage.set('linguanest_workspace_v2', JSON.stringify(initial)); storage.set('linguanest_runs_v2', JSON.stringify([oldRun]))
  const migrated = demo.demoStore()
  assert.deepEqual(demo.demoPracticeDocument(doc.lesson_id).questions, doc.questions)
  assert.equal(practice.learningExam(doc, migrated), true)
  assert.equal(practice.learningExam(initial.documents.at(-1), migrated), false)
  assert.deepEqual(demo.demoRun('old'), oldRun)
  assert.equal(demo.demoExamHistory().length, 0)
  assert.equal(demo.demoLessonExamHistory(doc.lesson_id)[0].id, 'old')
  assert.equal(demo.demoSummary().lesson_status.find(s => s.lesson_id === doc.lesson_id).score, 1)
  assert.equal(demo.demoSummary().exam_xp, 0)
  assert.equal(demo.demoSummary().xp, 5)
  assert.deepEqual(demo.demoStore().practice_documents, JSON.parse(JSON.stringify(migrated.practice_documents)))
  assert.throws(() => demo.demoStart(doc.id), /Bài học/)
})

test('demo saves drafts and results, rejects stale writes and members editing questions, retakes without XP', () => {
  storage.clear(); const data = demo.demoStore(), lesson = data.lessons[0]
  const doc = { ...demo.demoPracticeDocument(lesson.id), questions: [question(), question({ id: 'p2', kind: 'choice', choices: ['a', 'an'], answers: ['1'], reveal_mode: 'after_check' })] }
  demo.demoLessonBundle(lesson, [], doc)
  assert.throws(() => demo.demoLessonBundle(lesson, [], doc), /sửa ở nơi khác/)
  let run = demo.demoStartPractice(lesson.id)
  assert.equal(run.questions[0].answers, undefined)
  run = demo.demoPracticeAnswers(run.id, { p1: 'kids', p2: '0' }, run.revision)
  assert.equal(demo.demoStartPractice(lesson.id).responses.p1, 'kids')
  assert.throws(() => demo.demoPracticeAnswers(run.id, {}, 0), /thiết bị khác/)
  run = demo.demoCheckPractice(run.id, 'p1', 'kids', run.revision)
  run = demo.demoCheckPractice(run.id, 'p2', '0', run.revision)
  assert.equal(run.checks.p2.correct, false); assert.deepEqual(run.questions[1].answers, ['1'])
  const xp = demo.demoSummary().xp
  run = demo.demoFinishPractice(run.id, { p1: 'wrong', p2: '1' }, run.revision)
  assert.equal(run.responses.p1, 'kids'); assert.equal(run.responses.p2, '0')
  assert.equal(demo.demoFinishPractice(run.id, {}, 0).revision, run.revision)
  assert.equal(demo.demoSummary().xp, xp)
  assert.notEqual(demo.demoStartPractice(lesson.id).id, run.id)
  assert.equal(demo.demoPracticeHistory(lesson.id).length, 2)
  storage.set('linguanest_profile_v2', JSON.stringify({ ...demo.demoProfile(), role: 'member' }))
  assert.throws(() => demo.demoPracticeDocument(lesson.id), /quản trị/)
  assert.throws(() => demo.demoLessonBundle(lesson, [], doc), /quản trị/)
  assert.equal(demo.demoPracticeRun(run.id).status, 'completed')
})

test('cloud API uses practice RPCs with revisions and propagates database errors', async () => {
  const calls = []; let failure = null
  globalThis.__practiceRpc = async (name, args) => { calls.push([name, args]); return { data: name === 'get_lesson_practice' ? { lesson_id: 'lesson', layout: null } : { id: 'run' }, error: failure } }
  const api = await moduleAt('src/lib/api.ts', [{ name: 'mock-supabase-transport', setup(b) {
    b.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'supabase', namespace: 'mock' }))
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const cloudMode=true, mediaWorkerUrl=""; export const supabase={rpc:(...args)=>globalThis.__practiceRpc(...args)};' }))
  } }])
  assert.equal((await api.lessonPractice('lesson')).layout, undefined)
  await api.saveLessonBundle({ id: 'lesson' }, [], { questions: [] })
  await api.startPractice('lesson'); await api.getPracticeRun('run'); await api.practiceHistory('lesson')
  await api.savePracticeAnswers('run', { p1: 'a' }, 2)
  await api.checkPracticeAnswer('run', 'p1', 'a', 3, true)
  await api.finishPractice('run', { p1: 'a' }, 4)
  assert.deepEqual(calls.map(c => c[0]), ['get_lesson_practice', 'save_lesson_bundle', 'start_lesson_practice', 'get_practice_run', 'practice_history', 'save_practice_answers', 'check_practice_answer', 'finish_practice'])
  assert.deepEqual(calls[6][1], { p_id: 'run', p_question: 'p1', p_response: 'a', p_revision: 3, p_reveal: true })
  await api.beginLesson('lesson'); await api.examHistory(20); await api.lessonExamHistory('lesson', 20)
  assert.deepEqual(calls.slice(-3), [['begin_lesson', { p_id: 'lesson' }], ['exam_history', { p_offset: 20 }], ['lesson_exam_history', { p_lesson: 'lesson', p_offset: 20 }]])
  failure = Error('stale revision'); await assert.rejects(api.savePracticeAnswers('run', {}, 0), /stale revision/)
  delete globalThis.__practiceRpc
})


test('study badges distinguish reading, theory-only completion and latest practice score', async () => {
  storage.clear(); const lesson = demo.demoStore().lessons[0]
  const before = demo.demoSummary().xp
  demo.demoBeginLesson(lesson.id); demo.demoBeginLesson(lesson.id)
  const status = demo.demoSummary().lesson_status.find(s => s.lesson_id === lesson.id)
  assert.equal(status.completed_runs, 0); assert.equal(status.score, null); assert.equal(demo.demoSummary().xp, before)
  const { studyState } = await moduleAt('src/components/StudyBadge.tsx')
  const practice = { enabled: true, question_count: 2 }
  assert.equal(studyState(undefined, false, practice).tone, 'new')
  assert.equal(studyState(status, false, practice).tone, 'learning')
  assert.equal(studyState(status, true, practice).tone, 'learning')
  assert.equal(studyState(status, true, { ...practice, question_count: 0 }).tone, 'completed')
  const result = studyState({ ...status, completed_runs: 1, score: 0, max_score: 2, active_run: true }, false, practice)
  assert.equal(result.tone, 'completed'); assert.equal(result.detail, 'Lần gần nhất: 0/2 điểm'); assert.equal(result.active, true)
})
