import type { PracticeCheck, Question } from '../lib/types'
import { answerLabel, kindNames, listAnswer } from '../lib/authoring'
import { AttachmentList } from './Common'

export default function PracticeQuestion({ question: q, value, feedback, busy = false, completed = false, onChange, onCheck, onReveal }: {
  question: Question; value: string; feedback?: PracticeCheck; busy?: boolean; completed?: boolean
  onChange: (value: string) => void; onCheck: () => void; onReveal?: () => void
}) {
  const checked = feedback?.response === value ? feedback : undefined, locked = completed || !!feedback?.locked
  const values = listAnswer(value), choices = q.kind === 'choice' || q.kind === 'multi'
  const state = checked ? checked.correct ? 'is-correct' : checked.correct === false ? 'is-incorrect' : '' : ''
  const blank = (text: string) => text.split(/(\{\{blank\}\}|\{\{\d+\}\}|_{2,})/g).map((part, i) => /^(\{\{|__)/.test(part) ? <span key={i} className="practice-blank">{part.match(/\d+/)?.[0] || '…'}</span> : part)
  const slot = (i: number) => {
    const css = checked?.slot_correct?.[i] === true ? 'is-correct' : checked?.slot_correct?.[i] === false ? 'is-incorrect' : ''
    const change = (v: string) => onChange(JSON.stringify(q.slots!.map((_, j) => j === i ? v : values[j] || '')))
    return <label key={i} className={`practice-input ${css}`}>{q.slots?.[i] || `Ô ${i + 1}`}{q.kind === 'matching' ? <select disabled={locked || busy} value={values[i] || ''} onChange={e => change(e.target.value)}><option value="">Chọn phương án</option>{q.choices.map((c, j) => <option value={j + 1} key={j}>{j + 1}. {c}</option>)}</select> : <input disabled={locked || busy} value={values[i] || ''} maxLength={1000} placeholder="Nhập từ hoặc cụm từ" autoComplete="off" onChange={e => change(e.target.value)} />}{checked?.slot_correct?.[i] !== undefined && <small>{checked.slot_correct[i] ? '✓ Đúng' : '✕ Cần ôn lại'}</small>}</label>
  }
  return <section className="practice-question" aria-label="Câu hỏi luyện tập" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.target instanceof HTMLInputElement && !['radio', 'checkbox'].includes(e.target.type)) { e.preventDefault(); if (!locked && !busy && value.trim()) onCheck() } }}>
    <h2>{q.title || kindNames[q.kind]}</h2>
    <div className="practice-prompt"><span className="practice-kicker">{kindNames[q.kind]}</span><div className="practice-sentence">{blank(q.prompt)}</div>{q.hint && <p className="practice-hint"><b>Gợi ý:</b> {q.hint}</p>}</div>
    {q.passage && <div className="reading-passage">{q.passage}</div>}<AttachmentList keys={q.media_keys || []} />
    {choices ? <div className="practice-options" role={q.kind === 'choice' ? 'radiogroup' : 'group'} aria-label="Các phương án">{q.choices.map((choice, i) => {
      const selected = q.kind === 'multi' ? values.includes(String(i)) : value === String(i)
      const correct = locked && q.answers?.includes(String(i)), wrong = !!checked && selected && !correct && checked.correct === false
      return <label key={i} className={`practice-option ${selected ? 'is-selected' : ''} ${correct ? 'is-correct' : wrong ? 'is-incorrect' : ''}`}>
        <input type={q.kind === 'multi' ? 'checkbox' : 'radio'} name={`practice-${q.id}`} disabled={locked || busy} checked={selected} onChange={() => onChange(q.kind === 'choice' ? String(i) : JSON.stringify(selected ? values.filter(v => v !== String(i)) : [...values, String(i)]))} />
        <span className="practice-letter">{String.fromCharCode(65 + i)}</span><span>{q.labels_only ? `Phương án ${String.fromCharCode(65 + i)}` : choice}</span>{correct ? <span className="practice-mark">✓ Đúng</span> : wrong ? <span className="practice-mark">✕ Sai</span> : null}
      </label>
    })}</div> : ['gaps', 'matching'].includes(q.kind) ? <div className="practice-slots">{q.slots?.map((_, i) => slot(i))}</div> : <label className={`practice-input ${state}`}>Đáp án của bạn{q.kind === 'essay' ? <textarea rows={7} maxLength={20000} value={value} disabled={locked || busy} onChange={e => onChange(e.target.value)} /> : <input placeholder="Nhập từ hoặc cụm từ" maxLength={20000} autoComplete="off" value={value} disabled={locked || busy} onChange={e => onChange(e.target.value)} />}</label>}
    {!!q.word_limit && <small>Tối đa {q.word_limit} từ mỗi ô trả lời.</small>}
    {q.kind === 'essay' && <p className="secondary-label">Tự luận luyện tập: lưu bài viết và tự đối chiếu bài mẫu, không tự chấm đúng/sai.</p>}
    {checked && <div className={`practice-feedback ${state}`} role="status" aria-live="polite"><b>{checked.revealed ? 'Đã mở đáp án để ôn tập.' : checked.correct === null ? 'Đã lưu bài viết để tự đối chiếu.' : checked.correct ? 'Chính xác! Bạn làm tốt lắm.' : locked ? 'Chưa chính xác. Cùng xem lại đáp án nhé.' : 'Chưa chính xác. Bạn có thể sửa đáp án và thử lại.'}</b>{!locked && <p>Còn {Math.max(0, (q.max_attempts || 2) - checked.tries)} lần thử.</p>}</div>}
    {locked && <div className="practice-explanation">{q.kind !== 'essay' && <p><b>Đáp án:</b> {answerLabel(q)}</p>}{q.explanation && <p><b>{q.kind === 'essay' ? 'Bài mẫu' : 'Giải thích'}:</b> {q.explanation}</p>}</div>}
    {!locked && <div className="practice-actions"><small>{choices ? 'Chọn phương án rồi kiểm tra.' : 'Nhấn Enter hoặc Kiểm tra để trả lời.'}</small>{onReveal && <button type="button" className="text-action" disabled={busy} onClick={onReveal}>Xem đáp án</button>}<button type="button" className="practice-primary" disabled={busy || !value.trim() || (['multi', 'gaps', 'matching'].includes(q.kind) && !values.some(v => v.trim()))} onClick={onCheck}>{busy ? 'Đang kiểm tra…' : 'Kiểm tra'}</button></div>}
  </section>
}
