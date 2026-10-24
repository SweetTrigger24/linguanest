import type { Question, Word } from './types'
export const errorMessage = (e: unknown): string => e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e)
export const loginIdentity = (value: string) => value.includes('@') ? value.trim().toLowerCase() : `${value.trim().toLowerCase()}@users.linguanest.invalid`
export const normalizeAnswer = (value: string) => value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')
export const newQuestion = (): Question => ({ id: crypto.randomUUID(), section: 'Reading', kind: 'choice', prompt: '', passage: '', choices: ['', '', '', ''], answers: ['0'], explanation: '', points: 1 })
export function validateQuestions(questions: Question[], publish = false): string[] {
  const errors: string[] = []
  if (questions.length > 200 || (publish && !questions.length)) errors.push('Đề xuất bản cần từ 1 đến 200 câu hỏi.')
  const ids = new Set<string>()
  questions.forEach((q, index) => {
    const p = `Câu ${index + 1}: `
    if (!q.id || ids.has(q.id)) errors.push(p + 'mã câu hỏi bị trùng hoặc thiếu.')
    ids.add(q.id)
    if (!q.prompt.trim()) errors.push(p + 'thiếu nội dung.')
    if (!Number.isInteger(q.points) || q.points < 1 || q.points > 100) errors.push(p + 'điểm phải là số nguyên từ 1–100.')
    if (!['choice', 'short', 'essay', 'multi', 'gaps', 'matching'].includes(q.kind)) errors.push(p + 'loại câu hỏi không hợp lệ.')
    if (q.kind === 'choice' && (q.choices.length < 2 || q.choices.length > 8 || q.choices.some(c => !c.trim()) || q.answers?.length !== 1 || !/^\d+$/.test(q.answers[0]) || Number(q.answers[0]) >= q.choices.length)) errors.push(p + 'cần 2–8 lựa chọn và một đáp án đúng.')
    if (q.kind === 'short' && (!q.answers?.length || q.answers.some(a => !a.trim()))) errors.push(p + 'thiếu đáp án được chấp nhận.')
    if (q.kind === 'multi' && (q.choices.length < 2 || q.choices.length > 8 || q.choices.some(c => !c.trim()) || !q.answers?.length || new Set(q.answers).size !== q.answers.length || q.answers.some(a => !/^\d+$/.test(a) || Number(a) >= q.choices.length))) errors.push(p + 'lựa chọn/đáp án nhiều lựa chọn chưa hợp lệ.')
    if (['gaps', 'matching'].includes(q.kind) && (!q.slots?.length || q.slots.length > 30 || q.slots.some(s => !s.trim()) || q.answers?.length !== q.slots.length || q.answers.some(a => !a.trim()) || q.points % q.slots.length !== 0)) errors.push(p + 'mỗi mục cần nhãn, đáp án; điểm phải chia hết cho số mục (tối đa 30 mục).')
    if (q.kind === 'matching' && (!q.choices.length || q.choices.some(c => !c.trim()) || q.answers?.some(a => !/^\d+$/.test(a) || Number(a) < 1 || Number(a) > q.choices.length))) errors.push(p + 'đáp án nối phải là số thứ tự lựa chọn từ 1.')
    if (q.word_limit !== undefined && (!Number.isInteger(q.word_limit) || q.word_limit < 0 || q.word_limit > 100)) errors.push(p + 'giới hạn từ phải từ 0–100.')
  })
  return errors
}
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false
  text = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++ } else if (c === '"') { quoted = false; closed = true } else field += c; continue }
    if (c === '"') { if (field || closed) throw Error('Dấu ngoặc kép không hợp lệ trong CSV.'); quoted = true }
    else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false
      if (c !== ',') { if (row.some(v => v !== '')) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++ }
    } else { if (closed) throw Error('Ký tự không hợp lệ sau dấu ngoặc kép.'); field += c }
  }
  if (quoted) throw Error('CSV có dấu ngoặc kép chưa đóng.')
  row.push(field); if (row.some(v => v !== '')) rows.push(row)
  return rows
}
export function importCSV(text: string, kind: 'words' | 'questions'): { items: (Word | Question)[]; errors: string[] } {
  const [headers, ...rows] = parseCSV(text)
  if (!headers) return { items: [], errors: ['Tệp rỗng.'] }
  const required = kind === 'words' ? ['term', 'meaning'] : ['kind', 'prompt', 'points']
  if (new Set(headers).size !== headers.length || required.some(h => !headers.includes(h))) return { items: [], errors: ['Tiêu đề cột thiếu hoặc trùng. Hãy dùng mẫu CSV.'] }
  const errors: string[] = [], items: (Word | Question)[] = []
  rows.forEach((row, i) => {
    if (row.length !== headers.length) { errors.push(`Dòng ${i + 2}: sai số cột.`); return }
    const v = Object.fromEntries(headers.map((h, j) => [h.trim(), row[j]]))
    if (kind === 'words') {
      if (!v.term?.trim() || !v.meaning?.trim()) { errors.push(`Dòng ${i + 2}: thiếu từ hoặc nghĩa.`); return }
      items.push({ id: crypto.randomUUID(), lesson_id: '', term: v.term, meaning: v.meaning, pronunciation: v.pronunciation || '', example: v.example || '', example_translation: v.example_translation || '', sort_order: i })
    } else {
      const q: Question = { id: crypto.randomUUID(), kind: v.kind as Question['kind'], section: v.section || '', prompt: v.prompt || '', passage: v.passage || '', choices: v.choices ? v.choices.split('|') : [], answers: v.answers ? v.answers.split(['gaps', 'matching'].includes(v.kind) ? ';' : '|') : [], slots: v.slots ? v.slots.split('|') : [], word_limit: Number(v.word_limit || 0), explanation: v.explanation || '', points: Number(v.points) }
      const issues = validateQuestions([q]); errors.push(...issues.map(e => `Dòng ${i + 2}: ${e.replace('Câu 1: ', '')}`)); items.push(q)
    }
  })
  return { items, errors }
}
