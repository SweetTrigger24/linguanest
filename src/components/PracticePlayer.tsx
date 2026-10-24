import { useEffect, useRef, useState } from 'react'
import { checkPracticeAnswer, finishPractice, getPracticeRun, savePracticeAnswers } from '../lib/api'
import { errorMessage } from '../lib/content'
import { nestedMedia } from '../lib/authoring'
import { useUnsavedChanges } from '../lib/useUnsavedChanges'
import type { PracticeRun } from '../lib/types'
import { AttachmentList, Notice } from './Common'
import PracticeQuestion from './PracticeQuestion'

export default function PracticePlayer({ initial, onBack, onRetry, onComplete }: { initial: PracticeRun; onBack: () => void; onRetry: () => Promise<void>; onComplete?: () => void }) {
  const [run, setRun] = useState(initial), [index, setIndex] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const key = `ln-practice-${initial.id}`
  const [answers, setAnswers] = useState<Record<string, string>>(() => { try { const cached = JSON.parse(localStorage.getItem(key) || 'null'); return initial.status === 'in_progress' && cached?.revision === initial.revision ? cached.responses : initial.responses } catch { return initial.responses } })
  const current = useRef(run), latest = useRef(answers), chain = useRef<Promise<unknown>>(Promise.resolve()), alive = useRef(true), heading = useRef<HTMLHeadingElement>(null)
  latest.current = answers
  const active = run.status === 'in_progress', dirty = active && JSON.stringify(answers) !== JSON.stringify(run.responses)
  useUnsavedChanges(dirty)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [index])
  function cache() { try { localStorage.setItem(key, JSON.stringify({ responses: latest.current, revision: current.current.revision })) } catch { if (alive.current) setError('Không lưu được bản dự phòng trên máy. Hãy lưu trước khi rời bài.') } }
  function accept(next: PracticeRun) { current.current = next; if (alive.current) setRun(next); cache() }
  function persist(responses: Record<string, string>) {
    const job = chain.current.catch(() => {}).then(async () => { if (current.current.status === 'in_progress') accept(await savePracticeAnswers(run.id, responses, current.current.revision)) })
    chain.current = job; return job
  }
  useEffect(() => {
    if (!active || busy || !dirty) return
    cache()
    const timer = setTimeout(() => { void persist(answers).catch(e => alive.current && setError(errorMessage(e))) }, 600)
    return () => clearTimeout(timer)
  }, [answers, active, busy])
  const q = run.questions[index], feedback = run.checks[q.id]
  async function check(reveal = false, response = latest.current[q.id] || '') {
    if (busy || !active) return
    setBusy(true); setError('')
    try { await chain.current; const next = await checkPracticeAnswer(run.id, q.id, response, current.current.revision, reveal); accept(next); latest.current = { ...latest.current, [q.id]: next.responses[q.id] }; setAnswers(latest.current); cache() }
    catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  async function finish() {
    if (!confirm('Hoàn thành luyện tập? Các câu chưa kiểm tra sẽ được chấm và mở đáp án.')) return
    setBusy(true); setError('')
    try { await chain.current; const next = await finishPractice(run.id, latest.current, current.current.revision); accept(next); setAnswers(next.responses); localStorage.removeItem(key); setIndex(0); onComplete?.() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  async function leave() { setBusy(true); try { if (active) await persist(latest.current); onBack() } catch (e) { setError(errorMessage(e)); setBusy(false) } }
  const checked = Object.keys(run.checks).length, objective = run.questions.filter(q => q.kind !== 'essay'), correct = objective.filter(q => run.checks[q.id]?.correct).length
  const group = run.layout?.groups.find(g => g.id === q.group_id), section = run.layout?.sections.find(s => s.id === group?.section_id)
  return <div className="practice-shell stack">
    <div className="practice-top"><button type="button" className="back-link" disabled={busy} onClick={() => void leave()}>← Quay về bài học</button><span>Luyện tập · Không giới hạn giờ</span></div>
    <h1>{run.title}</h1>
    {!active && <div className="practice-result"><span className="practice-kicker">ĐÃ HOÀN THÀNH</span><h2>{correct}/{objective.length} câu đúng</h2><p>{objective.length ? Math.round(correct / objective.length * 100) : 0}% chính xác · {Object.values(run.checks).reduce((sum, c) => sum + c.score, 0)} điểm luyện tập</p><p>Kết quả theo lần kiểm tra cuối của mỗi câu. Câu đã mở đáp án không nhận điểm. Luyện tập không cộng thêm XP.</p>{objective.length !== run.questions.length && <p>{run.questions.length - objective.length} câu tự luận tự đối chiếu, không tính vào tỷ lệ đúng.</p>}<div className="toolbar"><button type="button" className="practice-primary" disabled={busy} onClick={async () => { setBusy(true); try { await onRetry() } catch (e) { setError(errorMessage(e)); setBusy(false) } }}>Luyện tập lại</button><button type="button" className="btn-secondary" disabled={busy} onClick={onBack}>Quay về bài học</button></div><h3>Cần ôn lại</h3>{objective.filter(q => !run.checks[q.id]?.correct).length ? <div className="practice-review-list">{objective.filter(q => !run.checks[q.id]?.correct).map(item => <button type="button" key={item.id} onClick={() => setIndex(run.questions.findIndex(q => q.id === item.id))}>Câu {run.questions.findIndex(q => q.id === item.id) + 1}: {item.title || item.prompt}</button>)}</div> : <p>Bạn đã trả lời đúng tất cả câu được chấm tự động.</p>}</div>}
    <div className="practice-progress"><div><h2 tabIndex={-1} ref={heading}>Câu {index + 1}/{run.questions.length}</h2><span>{checked}/{run.questions.length} câu đã kiểm tra</span></div><progress aria-label="Tiến độ luyện tập" value={checked} max={run.questions.length} /></div>
    <nav className="practice-number-nav" aria-label="Chuyển câu luyện tập">{run.questions.map((item, i) => <button type="button" key={item.id} disabled={busy} aria-label={`Câu luyện tập ${i + 1}`} aria-current={index === i ? 'step' : undefined} className={run.checks[item.id]?.correct ? 'is-correct' : run.checks[item.id] ? 'is-incorrect' : ''} onClick={() => setIndex(i)}>{i + 1}</button>)}</nav>
    {error && <Notice error>{error} <button type="button" disabled={busy} onClick={async () => { if (!confirm('Tải lại trạng thái trên máy chủ? Câu chưa đồng bộ trên máy có thể được thay thế.')) return; setBusy(true); try { const next = await getPracticeRun(run.id); chain.current = Promise.resolve(); latest.current = next.responses; setAnswers(next.responses); accept(next); setError('') } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }}>Tải lại lượt luyện tập</button></Notice>}
    <AttachmentList keys={run.media_keys.filter(k => !nestedMedia(run).includes(k))} />
    {(group || section) && <div className="card-box practice-source"><b>{section?.title} / {group?.title}</b>{section?.instructions && <p>{section.instructions}</p>}{group?.passage && <div className="reading-passage">{group.passage}</div>}<AttachmentList keys={[...(section?.media_keys || []), ...(group?.media_keys || [])]} />{!active && group?.transcript && <details><summary>Transcript</summary><p>{group.transcript}</p></details>}</div>}
    <PracticeQuestion question={q} value={answers[q.id] || ''} feedback={feedback} busy={busy} completed={!active} onChange={value => { const next = { ...latest.current, [q.id]: value }; latest.current = next; setAnswers(next); cache(); if (q.kind === 'choice' && q.check_mode === 'instant') void check(false, value) }} onCheck={() => void check()} onReveal={() => { if (confirm('Xem đáp án sẽ kết thúc câu này và không nhận điểm cho câu đó. Tiếp tục?')) void check(true) }} />
    <div className="practice-footer"><button type="button" className="btn-secondary" disabled={busy || index === 0} onClick={() => setIndex(i => i - 1)}>← Câu trước</button><span aria-live="polite">{active ? dirty ? 'Đang lưu câu trả lời…' : 'Đã lưu câu trả lời' : 'Kết quả đã lưu'}</span>{index < run.questions.length - 1 && <button type="button" className="practice-primary" disabled={busy} onClick={() => setIndex(i => i + 1)}>Câu tiếp theo →</button>}{active && <button type="button" className="practice-primary" disabled={busy} onClick={() => void finish()}>Hoàn thành luyện tập</button>}</div>
  </div>
}
