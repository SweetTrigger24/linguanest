import StudyBadge, { lessonStudyState } from './components/StudyBadge'
import LegacyPracticeHistory from './components/LegacyPracticeHistory'
import LessonPractice from './components/LessonPractice'
import PracticePlayer from './components/PracticePlayer'
import { learningExam } from './lib/practice'
import { LessonContent } from './components/LessonBlocks'
import { lessonBlocks } from './lib/authoring'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BookOpen, ClipboardList, GraduationCap, LayoutDashboard, LogOut, Menu, Settings2, TrendingUp, Trophy, UserRound, X } from 'lucide-react'
import { beginLesson, completeLesson, examHistory, getRun, loadContent, loadProfile, startExam, startPractice, summary } from './lib/api'
import { cloudMode, supabase } from './lib/supabase'
import { errorMessage, loginIdentity } from './lib/content'
import { LANG_DETAILS } from './lib/types'
import type { ContentData, ExamRun, Lang, Lesson, PracticeRun, PracticeSummary, Profile, Summary } from './lib/types'
import { Empty, Notice, Speak } from './components/Common'
import Account from './components/Account'
import Avatar from './components/Avatar'
import Leaderboard from './components/Leaderboard'
import ExamPlayer from './components/ExamPlayer'
const ContentAdmin = lazy(() => import('./components/ContentAdmin'))
const MediaAdmin = lazy(() => import('./components/OperationsAdmin').then(m => ({ default: m.MediaAdmin })))
const MembersAdmin = lazy(() => import('./components/OperationsAdmin').then(m => ({ default: m.MembersAdmin })))
const GradingAdmin = lazy(() => import('./components/OperationsAdmin').then(m => ({ default: m.GradingAdmin })))
type Page = 'dashboard' | 'courses' | 'lesson' | 'practice' | 'exams' | 'progress' | 'account' | 'leaderboard' | 'admin'
const EMPTY: Summary = { xp: 0, progress: [], exam_count: 0, legacy_count: 0 }
function Logo() { return <div className="brand"><div className="brand-mark"><BookOpen size={21} /></div><span>lingua<span className="brand-accent">nest</span>.</span></div> }
function Login() {
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { const { error } = await supabase!.auth.signInWithPassword({ email: loginIdentity(username), password }); if (error) throw error } catch { setError('Tên đăng nhập hoặc mật khẩu không đúng, hoặc dịch vụ đang tạm gián đoạn. Hãy thử lại.') } finally { setBusy(false) } }
  return <main className="login-screen"><div className="login-card"><Logo /><div className="login-graphic"><div>🌎</div><span>Học cùng nhau, tiến bộ mỗi ngày.</span></div><h1>Chào mừng trở lại!</h1><p>Đăng nhập bằng tài khoản quản trị đã cấp.</p><form className="field-stack" onSubmit={submit}><label>Tên đăng nhập<input required autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="minh.nguyen" /></label><label>Mật khẩu<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <Notice error>{error}</Notice>}<button className="btn-primary" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button></form><p className="login-note">Quên mật khẩu? Liên hệ quản trị để nhận mật khẩu tạm.</p></div></main>
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null), [ready, setReady] = useState(!cloudMode), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null), [data, setData] = useState<ContentData | null>(null), [stats, setStats] = useState<Summary>(EMPTY)
  const [page, setPage] = useState<Page>('dashboard'), [lang, setLang] = useState<Lang>('en'), [lessonId, setLessonId] = useState(''), [run, setRun] = useState<ExamRun | null>(null), [menu, setMenu] = useState(false), [examBusy, setExamBusy] = useState(false)
  const [practiceRun, setPracticeRun] = useState<PracticeRun | null>(null)
  const [examReturnLesson, setExamReturnLesson] = useState<string | null>(null)
  const [adminTab, setAdminTab] = useState<'lessons' | 'exams' | 'media' | 'members' | 'grading'>('lessons')
  const userId = cloudMode ? session?.user.id || '' : 'demo'
  const currentUser = useRef(userId), statsRequest = useRef(0)
  currentUser.current = userId
  useEffect(() => {
    if (!cloudMode) return
    let alive = true
    supabase!.auth.getSession().then(({ data, error }) => { if (alive) { if (error) setError(errorMessage(error)); setSession(data.session); setReady(true) } })
    const { data } = supabase!.auth.onAuthStateChange((_event, s) => { if (alive) { setSession(s); setReady(true) } })
    return () => { alive = false; data.subscription.unsubscribe() }
  }, [])
  useEffect(() => {
    if (!ready) return
    let alive = true; setProfile(null); setData(null); setStats(EMPTY); setRun(null); setPracticeRun(null); setExamReturnLesson(null); setPage('dashboard'); setError('')
    if (!userId) { setLoading(false); return }
    setLoading(true)
    void (async () => { try {
      const profile = await loadProfile(userId); if (!alive) return; setProfile(profile)
      if (profile.is_active && !profile.must_change_password) { const [content, personal] = await Promise.all([loadContent(), summary()]); if (alive) { setData(content); setStats(personal) } }
    } catch (e) { if (alive) setError(errorMessage(e)) } finally { if (alive) setLoading(false) } })()
    return () => { alive = false }
  }, [ready, userId])
  useEffect(() => {
    if (page !== 'lesson' || !lessonId || !userId) return
    beginLesson(lessonId).then(() => { if (currentUser.current === userId) refreshStats() }).catch(e => { if (currentUser.current === userId) setError(`Chưa lưu được trạng thái học: ${errorMessage(e)}`) })
  }, [page, lessonId, userId])
  async function refreshContent() { setData(await loadContent()); setStats(await summary()) }
  async function refreshProfile() { setProfile(await loadProfile(userId)) }
  function refreshStats() { const request = ++statsRequest.current; void summary().then(next => { if (currentUser.current === userId && request === statsRequest.current) setStats(next) }).catch(e => { if (currentUser.current === userId && request === statsRequest.current) setError(errorMessage(e)) }) }
  function navigate(next: Page) {
    if (run?.status === 'in_progress' && !window.confirm('Rời bài đang làm? Thời gian vẫn tiếp tục chạy. Bạn có thể mở lại trong Lịch sử.')) return
    setRun(null); setPracticeRun(null); setExamReturnLesson(null); setPage(next); setMenu(false); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function openExam(id: string, resume = false, returnLesson: string | null = null) { setExamBusy(true); setError(''); try { const r = resume ? await getRun(id) : await startExam(id); setRun(r); setExamReturnLesson(returnLesson); setPage('exams'); window.scrollTo({ top: 0 }) } catch (e) { setError(errorMessage(e)) } finally { setExamBusy(false) } }
  if (!ready || loading) return <main className="loading-screen"><Logo /><div className="spinner" /><p>Đang chuẩn bị góc học tập…</p></main>
  if (cloudMode && !session) return <Login />
  if (!profile || error && !data && !profile.must_change_password) return <main className="loading-screen"><Logo /><Notice error>{error || 'Không tải được tài khoản.'}</Notice><button className="btn-secondary" onClick={() => window.location.reload()}>Tải lại</button>{cloudMode && <button className="btn-secondary" onClick={() => void supabase!.auth.signOut()}>Đăng xuất</button>}</main>
  if (!profile.is_active) return <main className="loading-screen"><Logo /><Notice error>Tài khoản đã bị khóa hoặc chưa được quản trị duyệt.</Notice><button className="btn-secondary" onClick={() => void supabase!.auth.signOut()}>Đăng xuất</button></main>
  if (profile.must_change_password) return <main className="forced-account"><Account profile={profile} refresh={refreshProfile} /><button className="btn-secondary" onClick={() => void supabase!.auth.signOut()}>Đăng xuất</button></main>
  if (!data) return <Empty>Chưa tải được nội dung.</Empty>
  const currentCourse = data.courses.find(c => c.language_code === lang), lessons = data.lessons.filter(l => l.course_id === currentCourse?.id && l.status === 'published')
  const lesson = data.lessons.find(l => l.id === lessonId), theme = { '--lang-color': LANG_DETAILS[lang].color, '--lang-soft': LANG_DETAILS[lang].soft } as CSSProperties
  const nav: [Page, string, typeof BookOpen][] = [['dashboard', 'Tổng quan', LayoutDashboard], ['courses', 'Bài học', BookOpen], ['exams', 'Luyện đề thi', ClipboardList], ['progress', 'Tiến độ & lịch sử', TrendingUp], ['leaderboard', 'Bảng xếp hạng', Trophy], ['account', 'Tài khoản', UserRound]]
  if (profile.role === 'admin') nav.push(['admin', 'Quản trị', Settings2])
  const openPractice = (next: PracticeRun) => { setLessonId(next.lesson_id); setPracticeRun(next); refreshStats(); setPage('practice'); setMenu(false); window.scrollTo({ top: 0 }) }
  const openLesson = (id: string) => { setLessonId(id); setPage('lesson'); window.scrollTo({ top: 0 }) }
  return <div className="app-shell" style={theme}>{menu && <button className="mobile-backdrop" onClick={() => setMenu(false)} aria-label="Đóng menu" />}<aside className={`sidebar ${menu ? 'sidebar-visible' : ''}`}><div className="sidebar-top"><Logo /><button className="close-sidebar" aria-label="Đóng" onClick={() => setMenu(false)}><X /></button></div><div className="workspace-label">KHÔNG GIAN HỌC TẬP</div><div className="sidebar-links">{nav.map(([key, label, Icon]) => <button key={key} className={`nav-item ${page === key || key === 'courses' && (page === 'lesson' || page === 'practice') ? 'nav-active' : ''}`} onClick={() => navigate(key)}><Icon size={19} />{label}</button>)}</div><div className="workspace-label language-heading">NGÔN NGỮ</div><div className="side-languages">{Object.entries(LANG_DETAILS).map(([key, v]) => <button key={key} className={`side-language ${lang === key ? 'side-language-selected' : ''}`} disabled={!!run || !!practiceRun} onClick={() => { setLang(key as Lang); if (page === 'lesson') setPage('courses'); setMenu(false) }}><span>{v.flag}</span>{v.label}</button>)}</div><div className="sidebar-foot"><div className="study-tip"><b>Mỗi ngày một chút!</b><p>Học bài, luyện đề và nhìn lại những câu cần cải thiện.</p></div><div className="side-user"><Avatar key={profile.id} profile={profile} /><div className="user-details"><b>{profile.display_name}</b><span>{profile.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}</span></div>{cloudMode && <button aria-label="Đăng xuất" className="icon-button" onClick={() => { if (!run || confirm('Đăng xuất? Thời gian làm bài vẫn tiếp tục chạy.')) void supabase!.auth.signOut() }}><LogOut size={18} /></button>}</div></div></aside>
    <main className="main-panel"><div className="topbar"><div className="topbar-left"><button className="menu-button" aria-label="Mở menu" onClick={() => setMenu(true)}><Menu /></button><span className="breadcrumbs">Góc học tập / <b>{page === 'practice' ? 'Luyện tập bài học' : nav.find(([key]) => key === page)?.[1] || 'Bài học'}</b></span></div><div className="topbar-streak">✦ {stats.xp} XP</div></div><div className="content-wrap">
      {!cloudMode && <div className="demo-banner"><b>Chế độ demo</b><span>Nội dung và bài làm chỉ lưu trên trình duyệt này. Kết nối dịch vụ để nhóm dùng chung và chấm điểm trên máy chủ.</span></div>}{error && <Notice error>{error}</Notice>}
      {run ? <ExamPlayer key={run.id} initial={run} exitLabel={examReturnLesson === null ? undefined : examReturnLesson ? '← Quay về bài học' : '← Về danh sách bài học'} onExit={() => { setRun(null); if (examReturnLesson) openLesson(examReturnLesson); else setPage(examReturnLesson === '' ? 'courses' : 'progress'); setExamReturnLesson(null); refreshStats() }} onResult={result => { setRun(result); refreshStats() }} /> : <>
      {page === 'dashboard' && <div className="page-enter"><div className="greeting-row"><div><span className="eyebrow">HỌC CÙNG NHAU</span><h1>Chào {profile.display_name} 👋</h1><p>Một bài học nhỏ, một bước tiến mới.</p></div></div><div className="hero-card"><div className="hero-content"><span className="hero-kicker">{LANG_DETAILS[lang].flag} {LANG_DETAILS[lang].label.toUpperCase()}</span><h2>Học vững kiến thức.<br />Tự tin luyện đề.</h2><p>Khám phá bài học của nhóm và thử sức với những bộ đề do quản trị biên soạn.</p><button className="hero-button" onClick={() => navigate('exams')}>Bắt đầu luyện đề →</button></div><div className="hero-art" aria-hidden="true"><div className="hero-earth">🌍</div></div></div><div className="stats-grid"><div className="stat-card"><GraduationCap /><div><span className="stat-label">Bài đã hoàn thành</span><strong>{stats.progress.length}</strong></div></div><div className="stat-card"><ClipboardList /><div><span className="stat-label">Đề đã nộp</span><strong>{stats.exam_count}</strong></div></div><div className="stat-card"><TrendingUp /><div><span className="stat-label">Điểm tích lũy</span><strong>{stats.xp}</strong></div></div></div><div className="section-head section-spacious"><h2>Tiếp tục học hôm nay</h2><button className="text-action" onClick={() => navigate('courses')}>Tất cả bài học →</button></div><LessonCards lessons={lessons.filter(l => !stats.progress.some(p => p.lesson_id === l.id)).slice(0, 3)} stats={stats} practices={data.practices} onOpen={openLesson} /></div>}
      {page === 'courses' && <div className="stack"><div className="page-heading"><div><span className="eyebrow">KIẾN THỨC NỀN TẢNG</span><h1>{LANG_DETAILS[lang].flag} Bài học {LANG_DETAILS[lang].label.toLowerCase()}</h1><p>{currentCourse?.description}</p></div></div><LessonCards lessons={lessons} stats={stats} practices={data.practices} onOpen={openLesson} /><LegacyPracticeHistory lessonId={null} onOpen={id => void openExam(id, true, '')} /></div>}
      {page === 'lesson' && lesson && <LessonPage key={lesson.id} lesson={lesson} data={data} stats={stats} lang={lang} refresh={refreshStats} back={() => setPage('courses')} openExam={id => void openExam(id)} busy={examBusy} openPractice={openPractice} openLegacy={id => void openExam(id, true, lesson.id)} />}
      {page === 'practice' && practiceRun && <PracticePlayer key={practiceRun.id} initial={practiceRun} onComplete={refreshStats} onBack={() => { setPracticeRun(null); openLesson(practiceRun.lesson_id) }} onRetry={async () => openPractice(await startPractice(practiceRun.lesson_id))} />}
      {page === 'exams' && <ExamCatalog data={data} lang={lang} busy={examBusy} start={id => void openExam(id)} />}
      {page === 'progress' && <History stats={stats} busy={examBusy} open={id => void openExam(id, true)} />}
      {page === 'leaderboard' && <Leaderboard key={userId} userId={userId} />}
      {page === 'account' && <Account profile={profile} refresh={refreshProfile} />}
      {page === 'admin' && profile.role === 'admin' && <div className="stack"><div className="page-heading"><div><span className="eyebrow">DÀNH CHO QUẢN TRỊ</span><h1>Không gian biên soạn</h1><p>Chuẩn bị học liệu, tạo đề và theo dõi nhóm của bạn.</p></div></div><div className="admin-tabs">{([['lessons', 'Bài học'], ['exams', 'Đề thi'], ['media', 'Thư viện file'], ['members', 'Thành viên'], ['grading', 'Chấm tự luận']] as const).map(([key, label]) => <button key={key} className={adminTab === key ? 'active' : ''} onClick={() => setAdminTab(key)}>{label}</button>)}</div><Suspense fallback={<p>Đang tải trang quản trị…</p>}>{adminTab === 'lessons' || adminTab === 'exams' ? <ContentAdmin key={adminTab} kind={adminTab} data={data} userId={userId} refresh={refreshContent} /> : adminTab === 'media' ? <MediaAdmin /> : adminTab === 'members' ? <MembersAdmin /> : <GradingAdmin />}</Suspense></div>}
      </>}
    </div></main></div>
}
function LessonCards({ lessons, stats, practices, onOpen }: { lessons: Lesson[]; stats: Summary; practices?: PracticeSummary[]; onOpen: (id: string) => void }) {
  return <div className="stack">{!lessons.length && <Empty>Chưa có bài mới ở đây. Bạn có thể ôn lại bài hoặc chuyển sang luyện đề.</Empty>}{lessons.map((l, i) => {
    const state = lessonStudyState(l.id, stats, practices?.find(p => p.lesson_id === l.id))
    return <button className={`lesson-row study-${state.tone}`} key={l.id} onClick={() => onOpen(l.id)}><span className="lesson-index">{String(i + 1).padStart(2, '0')}</span><span className="lesson-row-copy"><b>{l.title}</b><span>{l.description}</span><span>{l.level} · {l.category} · {l.duration_minutes} phút</span></span><StudyBadge state={state} /></button>
  })}</div>
}
function LessonPage({ lesson: l, data, stats, lang, refresh, back, openExam, openPractice, openLegacy, busy }: { lesson: Lesson; data: ContentData; stats: Summary; lang: Lang; refresh: () => void; back: () => void; openExam: (id: string) => void; openPractice: (run: PracticeRun) => void; openLegacy: (id: string) => void; busy: boolean }) {
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const practice = data.practices?.find(p => p.lesson_id === l.id), state = lessonStudyState(l.id, stats, practice)
  const exam = data.exams.find(e => e.lesson_id === l.id && e.status === 'published' && !learningExam(e, data))
  return <div className="stack"><button data-leave-page className="back-link" onClick={back}>← Về bài học</button><div className="lesson-hero"><div><span className="hero-kicker">{l.level} · {l.category}</span><h1>{l.title}</h1><p>{l.description}</p></div></div><StudyBadge state={state} /><LessonContent blocks={lessonBlocks(l)} lang={lang} />{data.vocabulary.some(w => w.lesson_id === l.id) && <div className="card-box"><h2>Từ vựng</h2>{data.vocabulary.filter(w => w.lesson_id === l.id).map(w => <div className="word-item" key={w.id}><div><strong>{w.term}</strong><span>{w.pronunciation} · {w.meaning}</span>{w.example && <p>{w.example}<br />{w.example_translation}</p>}</div><Speak text={w.term} lang={lang} /></div>)}</div>}{error && <Notice error>{error}</Notice>}<div className="toolbar"><button className="btn-secondary" disabled={saving || stats.progress.some(p => p.lesson_id === l.id)} onClick={async () => { setSaving(true); try { await completeLesson(l.id); refresh() } catch (e) { setError(errorMessage(e)) } finally { setSaving(false) } }}>{stats.progress.some(p => p.lesson_id === l.id) ? '✓ Đã hoàn thành' : 'Đánh dấu hoàn thành · +20 XP'}</button>{exam && <button className="btn-primary" disabled={busy} onClick={() => openExam(exam.id)}>Làm bài kiểm tra →</button>}</div><LessonPractice lessonId={l.id} onOpen={openPractice} summary={practice} state={state} /><LegacyPracticeHistory lessonId={l.id} onOpen={openLegacy} /></div>
}
function ExamCatalog({ data, lang, busy, start }: { data: ContentData; lang: Lang; busy: boolean; start: (id: string) => void }) {
  const [type, setType] = useState(''), [query, setQuery] = useState('')
  useEffect(() => { setType(''); setQuery('') }, [lang])
  const exams = data.exams.filter(e => e.language_code === lang && e.status === 'published' && !learningExam(e, data) && (!e.lesson_id || data.lessons.some(l => l.id === e.lesson_id && l.status === 'published')) && (!type || e.exam_type_id === type) && e.title.toLowerCase().includes(query.toLowerCase()))
  return <div className="stack"><div className="page-heading"><div><span className="eyebrow">THỬ SỨC & TIẾN BỘ</span><h1>{LANG_DETAILS[lang].flag} Luyện đề {LANG_DETAILS[lang].label.toLowerCase()}</h1><p>Chọn kỳ thi, đọc hướng dẫn và bắt đầu khi bạn đã sẵn sàng.</p></div></div><div className="toolbar"><select aria-label="Lọc kỳ thi" value={type} onChange={e => setType(e.target.value)}><option value="">Tất cả kỳ thi</option>{data.exam_types.filter(t => t.language_code === lang && t.name !== 'Bài tập').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><input aria-label="Tìm đề" placeholder="Tìm tên đề…" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="exam-cards">{exams.map(e => <article className="card-box exam-card" key={e.id}><span className="small-tag">{data.exam_types.find(t => t.id === e.exam_type_id)?.name}</span><h2>{e.title}</h2><p>{e.description}</p><div className="exam-card-foot"><span>{e.mode === 'practice' ? 'Không giới hạn giờ' : `${e.duration_minutes} phút`} · Phiên bản {e.version}</span><button className="btn-primary" disabled={busy} onClick={() => start(e.id)}>{busy ? 'Đang mở…' : 'Bắt đầu / tiếp tục →'}</button></div></article>)}</div>{!exams.length && <Empty>Chưa có đề đã xuất bản cho bộ lọc này. Quản trị có thể tạo đề trong mục Quản trị → Đề thi.</Empty>}<p className="secondary-label">Điểm theo thang của từng đề luyện tập. Tự luận được quản trị chấm sau khi nộp. IELTS/TOEIC… là loại đề, không phải chứng nhận điểm thi chính thức.</p></div>
}
function History({ stats, busy, open }: { stats: Summary; busy: boolean; open: (id: string) => void }) {
  const [runs, setRuns] = useState<ExamRun[]>([]), [page, setPage] = useState(0), [error, setError] = useState(''), [loading, setLoading] = useState(false)
  useEffect(() => { let alive = true; setLoading(true); examHistory(page * 20).then(r => { if (alive) setRuns(r) }).catch(e => { if (alive) setError(errorMessage(e)) }).finally(() => { if (alive) setLoading(false) }); return () => { alive = false } }, [page])
  return <div className="stack"><h1>Tiến độ & lịch sử đề thi</h1><div className="card-box"><h2>{stats.exam_xp ?? 0} XP từ đề thi</h2><p>{stats.dedicated_exam_count ?? 0} đề đã nộp</p><p className="secondary-label">Lịch sử thi thử và bài kiểm tra tổng hợp. Trạng thái bài học và điểm luyện tập được hiển thị trong mục Bài học.</p></div>{error && <Notice error>{error}</Notice>}{loading ? <p>Đang tải lịch sử…</p> : runs.map(r => <div className="card-box content-row" key={r.id}><div><h3>{r.title}</h3><p>{new Date(r.started_at).toLocaleString('vi-VN')} · Phiên bản {r.version}</p><span className="small-tag">{r.status === 'in_progress' ? 'Đang làm' : r.status === 'pending_review' ? 'Chờ chấm tự luận' : `${r.score}/${r.max_score} điểm`}</span></div><button className="btn-primary" disabled={busy} onClick={() => open(r.id)}>{r.status === 'in_progress' ? 'Tiếp tục / nộp bài' : 'Xem bài làm'}</button></div>)}{!loading && !runs.length && <Empty>Chưa có bài làm ở trang này.</Empty>}<div className="toolbar"><button className="btn-secondary" disabled={loading || !page} onClick={() => setPage(p => p - 1)}>Trang trước</button><span>Trang {page + 1}</span><button className="btn-secondary" disabled={loading || runs.length < 20} onClick={() => setPage(p => p + 1)}>Trang sau</button></div></div>
}
