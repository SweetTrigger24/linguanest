import type { ContentData, Exam, PracticeCheck, PracticeDocument, PracticeRun, Question } from './types'
import { listAnswer, scoreQuestion } from './authoring'
import { normalizeAnswer, validateQuestions } from './content'

export const emptyPractice = (lesson_id = ''): PracticeDocument => ({ lesson_id, version: 0, questions: [], media_keys: [], enabled: true })
export const learningExam = (exam: Exam, data: ContentData) => data.practices?.some(p => p.source_exam_id === exam.id) || data.exam_types.find(t => t.id === exam.exam_type_id)?.name === 'Bài tập'
export function validatePractice(doc: PracticeDocument) {
  const errors = validateQuestions(doc.questions)
  if (new TextEncoder().encode(JSON.stringify(doc)).length > 2000000) errors.push('Bài tập tối đa 2 MB.')
  for (const [i, q] of doc.questions.entries()) {
    if (!Number.isInteger(q.max_attempts ?? 2) || (q.max_attempts ?? 2) < 1 || (q.max_attempts ?? 2) > 10) errors.push(`Câu ${i + 1}: số lần thử từ 1–10.`)
    if (q.reveal_mode && !['after_attempts', 'after_check'].includes(q.reveal_mode)) errors.push(`Câu ${i + 1}: chế độ xem đáp án không hợp lệ.`)
    if (q.check_mode && !['manual', 'instant'].includes(q.check_mode)) errors.push(`Câu ${i + 1}: chế độ kiểm tra không hợp lệ.`)
    if (q.kind === 'gaps') for (const match of q.prompt.matchAll(/\{\{(\d+)\}\}/g)) if (+match[1] < 1 || +match[1] > (q.slots?.length || 0)) errors.push(`Câu ${i + 1}: vị trí ô trống không có đáp án.`)
  }
  return errors
}
export function checkPractice(q: Question, response: string, previous?: PracticeCheck, reveal = false): PracticeCheck {
  if (previous?.locked) return previous
  const tries = (previous?.tries || 0) + 1, score = reveal || q.kind === 'essay' ? 0 : scoreQuestion(q, response)
  const correct = q.kind === 'essay' ? null : !reveal && score === q.points
  const locked = reveal || correct === true || q.kind === 'essay' || tries >= (q.max_attempts || 2) || q.reveal_mode === 'after_check'
  const values = listAnswer(response)
  const slot_correct = ['gaps', 'matching'].includes(q.kind) ? q.slots?.map((_, i) => !reveal && !!values[i]?.trim() && (!q.word_limit || values[i].trim().split(/\s+/).length <= q.word_limit) && (q.answers?.[i] || '').split('|').some(a => normalizeAnswer(a) === normalizeAnswer(values[i]))) : undefined
  return { tries, response, score, correct, locked, revealed: reveal, slot_correct }
}
export function publicPracticeRun(run: PracticeRun): PracticeRun {
  const result = structuredClone(run)
  result.questions = result.questions.map(q => {
    const { rubric: _rubric, ...safe } = q
    if (run.status === 'completed' || run.checks[q.id]?.locked) return safe
    const { answers: _answers, explanation: _explanation, ...hidden } = safe
    return hidden
  })
  if (run.status !== 'completed' && result.layout) result.layout.groups = result.layout.groups.map(({ transcript: _t, ...g }) => g)
  return result
}
