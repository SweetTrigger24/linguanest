import type { ExamDocument, ExamLayout, Lesson, LessonBlock, Question } from './types'
import { newQuestion, normalizeAnswer } from './content'

export const kindNames: Record<Question['kind'], string> = { choice: 'Chọn một đáp án', multi: 'Chọn nhiều đáp án', short: 'Điền đáp án', gaps: 'Điền nhiều ô trống', matching: 'Nối thông tin / tiêu đề', essay: 'Tự luận' }
export const blockNames: Record<LessonBlock['kind'], string> = { text: 'Văn bản', formula: 'Công thức', table: 'Bảng', example: 'Ví dụ và bản dịch', note: 'Lưu ý', media: 'Ảnh / audio / PDF', quiz: 'Bài tập nhanh' }
export function lessonBlocks(l: Lesson): LessonBlock[] {
  if (l.blocks !== undefined) return l.blocks
  const blocks: LessonBlock[] = []
  if (l.explanation) blocks.push({ id: 'legacy-text', kind: 'text', title: 'Kiến thức trọng tâm', body: l.explanation })
  if (l.example_sentence) blocks.push({ id: 'legacy-example', kind: 'example', title: 'Ví dụ', body: l.example_sentence, translation: l.example_translation })
  const keys = [...new Set([...l.media_keys, l.audio_key, l.image_key].filter((k): k is string => !!k))]
  if (keys.length || l.listening_text) blocks.push({ id: 'legacy-media', kind: 'media', title: 'Học liệu', body: '', media_keys: keys, transcript: l.listening_text })
  return blocks
}
export function layoutOf(doc: { layout?: ExamLayout; questions: Question[] }): ExamLayout {
  if (doc.layout) return doc.layout
  const names = [...new Set(doc.questions.map(q => q.section || 'Phần chung'))]
  return { mode: 'mock', sections: names.map((title, i) => ({ id: `legacy-${i}`, title, instructions: '', media_keys: [] })), groups: [] }
}
export const listAnswer = (value: string): string[] => { try { const a = JSON.parse(value); return Array.isArray(a) && a.every(x => typeof x === 'string') ? a : [] } catch { return [] } }
export function correctAnswer(q: Question, value: string): boolean {
  if (q.kind === 'essay') return false
  if (q.kind === 'choice') return value === q.answers?.[0]
  if (q.kind === 'multi') { const a = listAnswer(value); return a.length === q.answers?.length && new Set(a).size === a.length && a.every(v => q.answers!.includes(v)) }
  const within = (v: string) => !q.word_limit || v.trim().split(/\s+/).filter(Boolean).length <= q.word_limit
  if (q.kind === 'gaps' || q.kind === 'matching') { const a = listAnswer(value); return a.length === q.slots?.length && a.every((v, i) => v.trim() && within(v) && (q.answers?.[i] || '').split('|').some(x => normalizeAnswer(x) === normalizeAnswer(v))) }
  return within(value) && !!q.answers?.some(a => normalizeAnswer(a) === normalizeAnswer(value))
}
export function answered(q: Question, value = '') { return ['multi', 'gaps', 'matching'].includes(q.kind) ? listAnswer(value).some(v => v.trim()) : !!value.trim() }
export function scoreQuestion(q: Question, value: string) {
  if (q.kind === 'gaps' || q.kind === 'matching') {
    const a = listAnswer(value), n = q.slots?.length || 1
    return (q.answers || []).reduce((sum, accepted, i) => sum + (a[i]?.trim() && (!q.word_limit || a[i].trim().split(/\s+/).length <= q.word_limit) && accepted.split('|').some(s => normalizeAnswer(s) === normalizeAnswer(a[i])) ? q.points / n : 0), 0)
  }
  return correctAnswer(q, value) ? q.points : 0
}
export function answerLabel(q: Question) { return q.kind === 'choice' || q.kind === 'multi' ? q.answers?.map(a => `${String.fromCharCode(65 + Number(a))}. ${q.choices[Number(a)]}`).join('; ') : q.answers?.join(' ; ') }
export function lessonMedia(blocks: LessonBlock[]) { return [...new Set(blocks.flatMap(b => [...(b.media_keys || []), ...(b.question?.media_keys || [])]))] }
export function nestedMedia(doc: { layout?: ExamLayout; questions: Question[] }) { return [...new Set([...(doc.layout?.sections || []).flatMap(s => s.media_keys), ...(doc.layout?.groups || []).flatMap(g => g.media_keys), ...doc.questions.flatMap(q => q.media_keys || [])])] }
export function templateDocument(doc: ExamDocument, name: string): ExamDocument {
  const layout: ExamLayout = { mode: 'mock', template: name, sections: [], groups: [] }, questions: Question[] = []
  const add = (title: string, groups: { title: string; count: number; kind?: Question['kind'] }[]) => {
    const section = { id: crypto.randomUUID(), title, instructions: '', media_keys: [] }; layout.sections.push(section)
    for (const spec of groups) { const group = { id: crypto.randomUUID(), section_id: section.id, title: spec.title, passage: '', media_keys: [] }; layout.groups.push(group)
      for (let i = 0; i < spec.count; i++) questions.push({ ...newQuestion(), group_id: group.id, section: title, kind: spec.kind || 'choice', choices: spec.kind && spec.kind !== 'choice' ? [] : ['', '', '', ''], answers: spec.kind === 'essay' ? [] : spec.kind === 'short' ? [''] : ['0'] })
    }
  }
  let duration = 60
  if (name === 'toeic') {
    duration = 120
    add('Listening', [{ title: 'Part 1 · Photographs', count: 6 }, { title: 'Part 2 · Question–Response', count: 25 }, ...Array.from({ length: 13 }, (_, i) => ({ title: `Part 3 · Conversation ${i + 1}`, count: 3 })), ...Array.from({ length: 10 }, (_, i) => ({ title: `Part 4 · Talk ${i + 1}`, count: 3 }))])
    add('Reading', [{ title: 'Part 5 · Incomplete sentences', count: 30 }, ...Array.from({ length: 4 }, (_, i) => ({ title: `Part 6 · Text ${i + 1}`, count: 4 })), { title: 'Part 7 · Reading (chia nhóm theo đoạn đọc của bạn)', count: 54 }])
    questions.slice(0, 31).forEach((q, i) => { q.labels_only = true; q.choices = i < 6 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C'] })
  } else if (name.includes('listening')) { duration = 30; add('Listening', Array.from({ length: 4 }, (_, i) => ({ title: `Part ${i + 1}`, count: 10, kind: 'short' }))) }
  else if (name.includes('writing')) { add('Writing', [{ title: name.startsWith('general') ? 'Task 1 · Letter' : 'Task 1 · Report', count: 1, kind: 'essay' }, { title: 'Task 2 · Essay', count: 1, kind: 'essay' }]) }
  else if (name.includes('reading')) { add('Reading', [13, 13, 14].map((count, i) => ({ title: `${name.startsWith('general') ? 'Section' : 'Passage'} ${i + 1}`, count, kind: 'short' }))) }
  else { layout.mode = 'practice'; add('Bài tập', [{ title: 'Nhóm câu 1', count: 1 }]) }
  return { ...doc, status: 'draft', duration_minutes: duration, layout, questions }
}
