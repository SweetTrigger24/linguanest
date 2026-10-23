import { useEffect, useRef, useState } from 'react'
import { saveResponses, submitExam } from '../lib/api'
import { errorMessage } from '../lib/content'
import type { ExamRun } from '../lib/types'
import { AttachmentList, Notice, QuestionBody } from './Common'

export default function ExamPlayer({ initial, onExit, onResult }: { initial: ExamRun; onExit: () => void; onResult: (result: ExamRun) => void }) {
  const [run, setRun] = useState(initial), [answers, setAnswers] = useState<Record<string, string>>(() => {
    try { const local = JSON.parse(localStorage.getItem(`ln-run-${initial.id}`) || 'null'); return initial.status === 'in_progress' && local?.revision === initial.revision ? local.responses : initial.responses } catch { return initial.responses }
  })
  const [index, setIndex] = useState(0), [error, setError] = useState(''), [saving, setSaving] = useState(''), [busy, setBusy] = useState(false), [now, setNow] = useState(Date.now())
  const revision = useRef(initial.revision), latest = useRef(answers), chain = useRef<Promise<unknown>>(Promise.resolve()), ending = useRef(false), expiredOnce = useRef(false), alive = useRef(true)
  const clockOffset = useRef(initial.server_now ? Date.parse(initial.server_now) - Date.now() : 0)
  latest.current = answers
  const remaining = Math.max(0, Math.ceil((Date.parse(run.deadline) - now - clockOffset.current) / 1000)), active = run.status === 'in_progress'
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (!active) return; const tick = setInterval(() => setNow(Date.now()), 500); const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }; window.addEventListener('beforeunload', guard); return () => { clearInterval(tick); window.removeEventListener('beforeunload', guard) } }, [active])
  function cache(responses: Record<string, string>) { try { localStorage.setItem(`ln-run-${run.id}`, JSON.stringify({ responses, revision: revision.current })) } catch { if (alive.current) setError('Không lưu được bản dự phòng trên máy. Kiểm tra kết nối để lưu lên máy chủ.') } }
  function persist(responses: Record<string, string>) {
    const job = chain.current.catch(() => {}).then(async () => { const next = await saveResponses(run.id, responses, revision.current); revision.current = next; cache(latest.current); if (alive.current) { setSaving('Đã lưu bài làm'); setError('') } })
    chain.current = job; return job
  }
  useEffect(() => {
    if (!active || ending.current) return
    cache(answers); setSaving('Chưa đồng bộ…')
    const timer = setTimeout(() => { if (ending.current) return; void persist(answers).catch(e => { if (alive.current) { setError(errorMessage(e)); setSaving('Chưa đồng bộ — bản trả lời vẫn ở trên máy') } }) }, 600)
    return () => clearTimeout(timer)
    // Each queue uses the latest revision, including when a previous save is still in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, active])
  async function finish(automatic = false) {
    if (ending.current) return
    if (!automatic && !window.confirm(`Nộp bài với ${Object.values(latest.current).filter(v => v.trim()).length}/${run.questions.length} câu đã trả lời?`)) return
    ending.current = true; setBusy(true); setError('')
    try {
      await chain.current.catch(() => {})
      const result = await submitExam(run.id, latest.current, revision.current)
      localStorage.removeItem(`ln-run-${run.id}`)
      if (alive.current) { setRun(result); setAnswers(result.responses); onResult(result) }
    } catch (e) { if (alive.current) setError(errorMessage(e)); ending.current = false }
    finally { if (alive.current) setBusy(false) }
  }
  useEffect(() => { if (active && remaining === 0 && !expiredOnce.current) { expiredOnce.current = true; void finish(true) } }, [remaining, active])
  const q = run.questions[index]
  if (!active) return <div className="page-enter"><button className="back-link" onClick={onExit}>← Về danh sách đề</button><div className="card-box"><span className="eyebrow">KẾT QUẢ · PHIÊN BẢN {run.version}</span><h1>{run.title}</h1><p className="result-number">{run.score}<small> / {run.max_score} điểm</small></p><Notice>{run.status === 'pending_review' ? 'Điểm tạm tính. Phần tự luận đang chờ quản trị chấm.' : 'Đã chấm xong.'} Điểm theo thang của đề luyện tập.</Notice></div><div className="stack">{run.questions.map((q, i) => <div className="card-box" key={q.id}><div className="section-head"><b>Câu {i + 1} · {q.section}</b><span>{run.grades[q.id]?.score ?? 'Chờ chấm'} / {q.points}</span></div><QuestionBody question={q} value={run.responses[q.id] || ''} onChange={() => {}} disabled />{q.kind !== 'essay' && <p className="answer-explain answer-right">Đáp án: {q.kind === 'choice' ? q.choices[Number(q.answers?.[0])] : q.answers?.join(' / ')}</p>}{q.explanation && <p className="reading-passage">{q.explanation}</p>}{run.grades[q.id]?.feedback && <Notice>Nhận xét: {run.grades[q.id].feedback}</Notice>}</div>)}</div></div>
  return <div className="page-enter"><div className="exam-sticky"><div><span className="eyebrow">ĐANG LÀM BÀI · PHIÊN BẢN {run.version}</span><h2>{run.title}</h2><small>{saving}</small></div><strong className={remaining < 60 ? 'timer urgent' : 'timer'}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</strong><button className="btn-primary" disabled={busy} onClick={() => void finish(remaining === 0)}>{busy ? 'Đang nộp…' : 'Nộp bài'}</button></div>
    {remaining === 0 && <Notice>Đã hết giờ. Máy chủ sử dụng các câu trả lời đã lưu trước hạn. Nếu mất mạng, hãy kết nối lại rồi bấm Nộp bài.</Notice>}{error && <Notice error>{error}</Notice>}
    <div className="exam-layout"><aside className="card-box"><h3>Câu hỏi</h3><div className="question-grid">{run.questions.map((q, i) => <button key={q.id} className={`${i === index ? 'current' : ''} ${answers[q.id]?.trim() ? 'answered' : ''}`} onClick={() => setIndex(i)} aria-label={`Đến câu ${i + 1}`}>{i + 1}</button>)}</div><p>{Object.values(answers).filter(v => v.trim()).length}/{run.questions.length} câu đã trả lời</p><button className="btn-secondary" disabled={busy} onClick={async () => { if (remaining === 0) { await finish(true); return } try { setBusy(true); await persist(latest.current); onExit() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }}>Lưu và quay lại</button><p className="secondary-label">Thời gian tiếp tục chạy khi rời bài. Bài tự luận được chấm thủ công.</p></aside>
      <div className="stack"><AttachmentList keys={run.media_keys} /><div className="card-box"><div className="section-head"><b>{q.section || 'Phần chung'} · Câu {index + 1}</b><span>{q.points} điểm</span></div><QuestionBody question={q} value={answers[q.id] || ''} disabled={busy || remaining === 0} onChange={v => setAnswers(old => ({ ...old, [q.id]: v }))} /><div className="toolbar"><button className="btn-secondary" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>← Câu trước</button><button className="btn-primary" disabled={index === run.questions.length - 1} onClick={() => setIndex(i => i + 1)}>Câu tiếp →</button></div></div></div></div>
  </div>
}
