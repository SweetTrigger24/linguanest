import { answered, answerLabel, nestedMedia } from '../lib/authoring'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { saveResponses, submitExam } from '../lib/api'
import { errorMessage } from '../lib/content'
import type { ExamRun } from '../lib/types'
import { AttachmentList, Notice, QuestionBody } from './Common'

export default function ExamPlayer({ initial, onExit, onResult, exitLabel = '← Về danh sách đề' }: { exitLabel?: string; initial: ExamRun; onExit: () => void; onResult: (result: ExamRun) => void }) {
  const [run, setRun] = useState(initial), [answers, setAnswers] = useState<Record<string, string>>(() => {
    try { const local = JSON.parse(localStorage.getItem(`ln-run-${initial.id}`) || 'null'); return initial.status === 'in_progress' && local?.revision === initial.revision ? local.responses : initial.responses } catch { return initial.responses }
  })
  const [index, setIndex] = useState(0), [error, setError] = useState(''), [saving, setSaving] = useState(''), [busy, setBusy] = useState(false), [now, setNow] = useState(Date.now())
  const workspaceRef = useRef<HTMLDivElement>(null), headerRef = useRef<HTMLDivElement>(null), sourceRef = useRef<HTMLElement>(null)
  const [tab, setTab] = useState<'source' | 'questions'>('questions'), [filter, setFilter] = useState('all')
  const [flags, setFlags] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(`ln-flags-${initial.id}`) || '[]') } catch { return [] } })
  function flag(id: string) { const next = flags.includes(id) ? flags.filter(x => x !== id) : [...flags, id]; setFlags(next); try { localStorage.setItem(`ln-flags-${initial.id}`, JSON.stringify(next)) } catch { /* Flags do not affect saved answers. */ } }
  useEffect(() => { document.getElementById(`question-${initial.questions[index]?.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [index, initial.questions])
  const revision = useRef(initial.revision), latest = useRef(answers), chain = useRef<Promise<unknown>>(Promise.resolve()), ending = useRef(false), expiredOnce = useRef(false), alive = useRef(true)
  const clockOffset = useRef(initial.server_now ? Date.parse(initial.server_now) - Date.now() : 0)
  latest.current = answers
  const remaining = run.deadline ? Math.max(0, Math.ceil((Date.parse(run.deadline) - now - clockOffset.current) / 1000)) : Infinity, active = run.status === 'in_progress'
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
    if (!automatic && !window.confirm(`Nộp bài với ${run.questions.filter(q => answered(q, latest.current[q.id])).length}/${run.questions.length} câu đã trả lời?`)) return
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
  const group = run.layout?.groups.find(g => g.id === q.group_id), section = run.layout?.sections.find(s => s.id === group?.section_id)
  const visible = group ? run.questions.filter(x => x.group_id === group.id) : [q]
  const sources = [...(section?.media_keys || []), ...(group?.media_keys || [])]
  useLayoutEffect(() => {
    // Account for wrapped titles, loaded images/audio and viewport changes.
    const update = () => {
      workspaceRef.current?.style.setProperty('--exam-header-height', `${headerRef.current?.getBoundingClientRect().height || 0}px`)
      workspaceRef.current?.style.setProperty('--exam-source-height', `${sourceRef.current?.getBoundingClientRect().height || 0}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    if (headerRef.current) observer.observe(headerRef.current)
    if (sourceRef.current) observer.observe(sourceRef.current)
    return () => observer.disconnect()
  }, [active])
  return <div className="page-enter" ref={workspaceRef}>
    {!active && <><button className="back-link" onClick={onExit}>{exitLabel}</button><div className="card-box"><span className="eyebrow">KẾT QUẢ · PHIÊN BẢN {run.version}</span><h1>{run.title}</h1><p className="result-number">{run.score}<small> / {run.max_score} điểm</small></p><Notice>{run.status === 'pending_review' ? 'Điểm tạm tính. Phần tự luận đang chờ quản trị chấm.' : 'Đã chấm xong.'} Điểm theo thang của đề luyện tập.</Notice></div></>}
    {active && <div className="exam-sticky" ref={headerRef}><div><span className="eyebrow">{run.deadline ? 'THI THỬ' : 'LUYỆN TẬP'} · PHIÊN BẢN {run.version}</span><h2>{run.title}</h2><small>{saving}</small></div><strong className={remaining < 60 ? 'timer urgent' : 'timer'}>{run.deadline ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'Không giới hạn giờ'}</strong><button className="btn-primary" disabled={busy} onClick={() => void finish(remaining === 0)}>{busy ? 'Đang nộp…' : 'Nộp bài'}</button></div>}
    {remaining === 0 && active && <Notice>Đã hết giờ. Máy chủ sử dụng các câu trả lời đã lưu trước hạn. Nếu mất mạng, hãy kết nối lại rồi bấm Nộp bài.</Notice>}{error && <Notice error>{error}</Notice>}
    <div className="exam-workspace"><aside className="card-box exam-nav"><h3>Câu hỏi</h3><select aria-label="Lọc câu hỏi" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Tất cả</option><option value="empty">Chưa trả lời</option><option value="flagged">Đánh dấu xem lại</option>{!active && <option value="wrong">Chưa đạt điểm tối đa</option>}</select><div className="question-grid">{run.questions.map((item, i) => (filter === 'empty' && answered(item, answers[item.id]) || filter === 'flagged' && !flags.includes(item.id) || filter === 'wrong' && run.grades[item.id]?.score === item.points) ? null : <button key={item.id} title={item.section} className={`${i === index ? 'current' : ''} ${answered(item, answers[item.id]) ? 'answered' : ''} ${flags.includes(item.id) ? 'flagged' : ''}`} onClick={() => { setIndex(i); setTab('questions') }} aria-label={`Đến câu ${i + 1}`}>{i + 1}{flags.includes(item.id) ? '★' : ''}</button>)}</div><p>{run.questions.filter(q => answered(q, answers[q.id])).length}/{run.questions.length} câu đã trả lời</p>{run.layout?.sections.map(s => <button key={s.id} className="validation-link" onClick={() => { const i = run.questions.findIndex(q => run.layout?.groups.some(g => g.id === q.group_id && g.section_id === s.id)); if (i >= 0) setIndex(i) }}>{s.title}</button>)}
    {active && <><button className="btn-secondary" disabled={busy} onClick={async () => { if (remaining === 0) { await finish(true); return } try { setBusy(true); await persist(latest.current); onExit() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }}>Lưu và quay lại</button><p className="secondary-label">{run.deadline ? 'Thời gian tiếp tục chạy khi rời bài.' : 'Có thể tiếp tục bài luyện tập sau.'} Bài tự luận được chấm thủ công.</p></>}</aside>
    <div className="stack exam-main"><div className="mobile-study-tabs"><button className={tab === 'source' ? 'selected' : ''} onClick={() => setTab('source')}>Học liệu</button><button className={tab === 'questions' ? 'selected' : ''} onClick={() => setTab('questions')}>Câu hỏi</button></div>
      <div className={`reading-layout mobile-tab-${tab}`}><aside className="card-box reading-source" ref={sourceRef} aria-label="Học liệu dùng chung"><AttachmentList keys={run.media_keys.filter(k => !nestedMedia(run).includes(k))} /><h2>{section?.title || q.section}</h2><p>{section?.instructions}</p><AttachmentList keys={section?.media_keys || []} /><div key={group?.id || 'legacy'}><h3>{group?.title}</h3><div className="reading-passage">{group?.passage || (!group ? q.passage : '')}</div><AttachmentList keys={group?.media_keys || []} />{!active && group?.transcript && <details open><summary>Transcript</summary><div className="reading-passage">{group.transcript}</div></details>}{!sources.length && !group?.passage && !q.passage && <p className="secondary-label">Nhóm này không có học liệu chung.</p>}</div></aside>
      <div className="stack group-questions">{visible.map(item => <div id={`question-${item.id}`} className={`card-box ${q.id === item.id ? 'focused-question' : ''}`} key={item.id}><div className="section-head"><b>Câu {run.questions.findIndex(x => x.id === item.id) + 1}</b><span>{!active ? `${run.grades[item.id]?.score ?? 'Chờ chấm'} / ` : ''}{item.points} điểm</span></div><button className="text-action" aria-pressed={flags.includes(item.id)} onClick={() => flag(item.id)}>{flags.includes(item.id) ? '★ Đã đánh dấu' : '☆ Đánh dấu xem lại'}</button><QuestionBody question={item} value={answers[item.id] || ''} disabled={!active || busy || remaining === 0} onChange={v => setAnswers(old => ({ ...old, [item.id]: v }))} />{!active && <>{item.kind !== 'essay' && <p className="answer-explain answer-right">Đáp án: {answerLabel(item)}</p>}{item.explanation && <div className="reading-passage">{item.explanation}</div>}{run.grades[item.id]?.feedback && <Notice>Nhận xét: {run.grades[item.id].feedback}</Notice>}</>}</div>)}<div className="toolbar"><button className="btn-secondary" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>← Câu trước</button><button className="btn-primary" disabled={index === run.questions.length - 1} onClick={() => setIndex(i => i + 1)}>Câu tiếp →</button></div></div></div>
    </div></div>
  </div>
}
