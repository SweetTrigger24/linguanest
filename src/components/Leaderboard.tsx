import { useEffect, useState } from 'react'
import { RefreshCw, Trophy } from 'lucide-react'
import { loadLeaderboard } from '../lib/api'
import { errorMessage } from '../lib/content'
import type { LeaderboardEntry } from '../lib/types'
import Avatar from './Avatar'
import { Empty, Notice } from './Common'

const number = (value: number) => value.toLocaleString('vi-VN')

export default function Leaderboard({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    loadLeaderboard().then(rows => { if (active) setEntries(rows) })
      .catch(e => { if (active) setError(errorMessage(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId, reload])
  const own = entries.find(entry => entry.id === userId)
  return <div className="stack leaderboard-page">
    <div className="page-heading"><div><span className="eyebrow">CÙNG NHAU TIẾN BỘ</span><h1>Bảng xếp hạng</h1><p>Ai đang dẫn đầu? Cùng nhìn lại nỗ lực học tập của cả nhóm.</p></div><button type="button" className="btn-secondary" disabled={loading} onClick={() => setReload(n => n + 1)}><RefreshCw size={16} aria-hidden="true" />{loading ? 'Đang tải…' : 'Làm mới'}</button></div>
    {error && <Notice error>Không tải được bảng xếp hạng. {error} <button type="button" className="btn-secondary" disabled={loading} onClick={() => setReload(n => n + 1)}>Thử lại</button></Notice>}
    {loading && !entries.length && <p role="status">Đang tải bảng xếp hạng…</p>}
    {!!entries.length && <>
      <div className="leaderboard-overview"><div className="leaderboard-trophy"><Trophy size={32} aria-hidden="true" /></div><div><span>Vị trí của bạn</span><strong>{own ? `#${own.rank}` : '—'}</strong></div><div><span>XP của bạn</span><strong>{own ? number(own.xp) : '—'}</strong></div><div><span>Thành viên</span><strong>{number(entries.length)}</strong></div></div>
      <div className="card-box leaderboard-card" aria-busy={loading}><table className="leaderboard-table"><caption>Tổng XP trên tất cả ngôn ngữ</caption><thead><tr><th scope="col">Hạng</th><th scope="col">Thành viên</th><th scope="col">XP</th></tr></thead><tbody>
        {entries.map(entry => <tr key={entry.id} className={`${entry.id === userId ? 'leaderboard-self ' : ''}${entry.rank <= 3 ? `leaderboard-top-${entry.rank}` : ''}`}>
          <td><span className="leaderboard-rank">{entry.rank === 1 && <Trophy size={14} aria-hidden="true" />}<span>{entry.rank}</span></span></td>
          <th scope="row"><div className="leaderboard-member"><Avatar profile={entry} memberAvatar /><div><span className="leaderboard-name">{entry.display_name}</span>{entry.id === userId && <span className="leaderboard-you">Bạn</span>}</div></div></th>
          <td className="leaderboard-xp">{number(entry.xp)}<span> XP</span></td>
        </tr>)}
      </tbody></table></div>
      <p className="secondary-label">Xếp theo tổng XP từ cao xuống thấp. Cùng số XP sẽ cùng hạng.</p>
    </>}
    {!loading && !error && !entries.length && <Empty>Chưa có thành viên trong bảng xếp hạng.</Empty>}
  </div>
}
