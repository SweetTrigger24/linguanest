import { useEffect, useState } from 'react'
import { lessonExamHistory } from '../lib/api'
import { errorMessage } from '../lib/content'
import type { ExamRun } from '../lib/types'
import { Notice } from './Common'

export default function LegacyPracticeHistory({ lessonId, onOpen }: { lessonId: string | null; onOpen: (id: string) => void }) {
  const [runs, setRuns] = useState<ExamRun[]>([]), [offset, setOffset] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let alive = true; setBusy(true)
    lessonExamHistory(lessonId, offset).then(next => { if (alive) { setRuns(next); setError('') } }).catch(e => alive && setError(errorMessage(e))).finally(() => alive && setBusy(false))
    return () => { alive = false }
  }, [lessonId, offset])
  if (!runs.length && !offset && !error) return null
  return <section className="card-box legacy-practice-history"><h2>{lessonId ? 'Lịch sử bài tập cũ' : 'Bài tập cũ chưa gắn bài học'}</h2><p>Các lượt làm trước khi chuyển bài tập vào Bài học vẫn được giữ để tiếp tục hoặc xem lại.</p>{error && <Notice error>{error}</Notice>}{busy && <p>Đang tải lịch sử…</p>}{runs.map(r => <div className="practice-history" key={r.id}><span><b>{r.title}</b><br />{new Date(r.started_at).toLocaleString('vi-VN')} · {r.status === 'in_progress' ? 'Đang làm' : r.status === 'pending_review' ? 'Chờ chấm tự luận' : `${r.score}/${r.max_score} điểm`}</span><button className="btn-secondary" disabled={busy} onClick={() => onOpen(r.id)}>{r.status === 'in_progress' ? 'Tiếp tục bài tập cũ' : 'Xem bài tập cũ'}</button></div>)}{(offset > 0 || runs.length === 20) && <div className="toolbar"><button className="btn-secondary" disabled={busy || !offset} onClick={() => setOffset(v => v - 20)}>Trang trước</button><button className="btn-secondary" disabled={busy || runs.length < 20} onClick={() => setOffset(v => v + 20)}>Trang sau</button></div>}</section>
}
