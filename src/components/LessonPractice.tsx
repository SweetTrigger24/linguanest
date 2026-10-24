import StudyBadge, { studyState } from './StudyBadge'
import { useEffect, useState } from 'react'
import { getPracticeRun, practiceHistory, startPractice } from '../lib/api'
import type { PracticeRun, PracticeSummary } from '../lib/types'
import { errorMessage } from '../lib/content'
import { Notice } from './Common'

export default function LessonPractice({ lessonId, summary, onOpen, state }: { lessonId: string; summary?: PracticeSummary; state: ReturnType<typeof studyState>; onOpen: (run: PracticeRun) => void }) {
  const [history, setHistory] = useState<PracticeRun[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { let alive = true; practiceHistory(lessonId).then(h => alive && setHistory(h)).catch(e => alive && setError(errorMessage(e))); return () => { alive = false } }, [lessonId])
  async function open(id?: string) { setBusy(true); setError(''); try { onOpen(id ? await getPracticeRun(id) : await startPractice(lessonId)) } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }
  return <section className={`card-box practice-entry study-${state.tone}`}><span className="practice-kicker">ÁP DỤNG KIẾN THỨC</span><h2>Luyện tập</h2><StudyBadge state={state} />{error && <Notice error>{error}</Notice>}{summary?.enabled && summary.question_count > 0 ? <><p>{summary.question_count} câu hỏi · Không giới hạn thời gian · Có gợi ý và giải thích</p><button type="button" className="practice-primary" disabled={busy} onClick={() => void open()}>{busy ? 'Đang mở…' : 'Bắt đầu luyện tập'}</button></> : <p>Bài học này chưa mở câu hỏi luyện tập.</p>}{history.length > 0 && <details><summary>Lịch sử luyện tập ({history.length} lượt gần nhất)</summary><div className="stack">{history.map(item => <div className="practice-history" key={item.id}><span>{new Date(item.started_at).toLocaleString('vi-VN')} · {item.status === 'completed' ? `Đã hoàn thành · ${Object.values(item.checks).reduce((sum, c) => sum + c.score, 0)}/${item.questions.filter(q => q.kind !== 'essay').reduce((sum, q) => sum + q.points, 0)} điểm` : 'Đang luyện tập'}</span><button type="button" disabled={busy} className="btn-secondary" onClick={() => void open(item.id)}>{item.status === 'completed' ? 'Xem kết quả' : 'Tiếp tục luyện tập'}</button></div>)}</div></details>}</section>
}
