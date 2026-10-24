import type { LessonStudyStatus, PracticeSummary, Summary } from '../lib/types'

export function studyState(status?: LessonStudyStatus, theoryDone = false, practice?: PracticeSummary) {
  const hasPractice = !!practice?.enabled && practice.question_count > 0
  if (status?.completed_runs) return { tone: 'completed', label: 'Đã hoàn thành luyện tập', detail: status.max_score ? `Lần gần nhất: ${status.score}/${status.max_score} điểm` : 'Tự luận: đã tự đối chiếu', active: status.active_run }
  if (theoryDone && !hasPractice) return { tone: 'completed', label: 'Đã học', detail: 'Đã hoàn thành lý thuyết', active: false }
  if (status || theoryDone) return { tone: 'learning', label: 'Đang học', detail: status?.active_run ? 'Đang làm bài luyện tập' : theoryDone && hasPractice ? 'Đã học lý thuyết · Chưa hoàn thành luyện tập' : 'Tiếp tục bài học', active: false }
  return { tone: 'new', label: 'Chưa học', detail: 'Học bài →', active: false }
}
export function lessonStudyState(id: string, stats: Summary, practice?: PracticeSummary) {
  return studyState(stats.lesson_status?.find(s => s.lesson_id === id), stats.progress.some(p => p.lesson_id === id), practice)
}
export default function StudyBadge({ state }: { state: ReturnType<typeof studyState> }) {
  return <span className={`study-badge study-${state.tone}`}><strong>{state.tone === 'completed' ? '✓ ' : state.tone === 'learning' ? '◷ ' : ''}{state.label}</strong><small>{state.detail}</small>{state.active && <small>Đang luyện tập lại</small>}</span>
}
