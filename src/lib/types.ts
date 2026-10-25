export type Lang = 'en' | 'fr' | 'zh' | 'ja'
export type Status = 'draft' | 'published' | 'archived'
export interface Course { id: string; language_code: Lang; title: string; native_name: string; level_label: string; description: string; sort_order: number }
export interface Word { id: string; lesson_id: string; term: string; pronunciation: string; meaning: string; example: string; example_translation: string; sort_order: number }
export interface Lesson {
  blocks?: LessonBlock[];
  id: string; course_id: string; title: string; description: string; level: string; category: string; duration_minutes: number; sort_order: number;
  explanation: string; example_sentence: string; example_translation: string; listening_text: string;
  audio_key: string | null; image_key: string | null; media_keys: string[]; is_published: boolean; status: Status;
}
export interface ExamType { id: string; language_code: Lang; name: string }
export interface Exam { mode?: 'practice' | 'mock'; id: string; language_code: Lang; exam_type_id: string; lesson_id: string | null; title: string; description: string; duration_minutes: number; status: Status; version: number; media_keys: string[] }
export interface Question {
  title?: string; hint?: string; max_attempts?: number; reveal_mode?: 'after_attempts' | 'after_check'; check_mode?: 'manual' | 'instant';
  id: string; section: string; kind: 'choice' | 'short' | 'essay' | 'multi' | 'gaps' | 'matching'; prompt: string; passage: string; choices: string[];
  group_id?: string; media_keys?: string[]; slots?: string[]; word_limit?: number; labels_only?: boolean; rubric?: string;
  answers?: string[]; explanation?: string; points: number;
}
export interface ExamSection { id: string; title: string; instructions: string; media_keys: string[] }
export interface QuestionGroup { id: string; section_id: string; title: string; passage: string; media_keys: string[]; transcript?: string }
export interface ExamLayout { sections: ExamSection[]; groups: QuestionGroup[]; mode: 'practice' | 'mock'; template?: string }
export interface ExamDocument extends Exam { questions: Question[]; layout?: ExamLayout }
export interface LessonBlock { id: string; kind: 'text' | 'formula' | 'table' | 'example' | 'note' | 'media' | 'quiz'; title: string; body: string; translation?: string; media_keys?: string[]; transcript?: string; question?: Question }
export interface ExamRun {
  layout?: ExamLayout;
  id: string; exam_id: string; title: string; language_code: Lang; version: number; media_keys: string[];
  questions: Question[]; responses: Record<string, string>; started_at: string; deadline: string | null;
  submitted_at: string | null; status: 'in_progress' | 'pending_review' | 'graded'; score: number; max_score: number; revision: number;
  grades: Record<string, { score: number | null; feedback: string }>;
  user_id?: string; display_name?: string; server_now?: string;
}
export interface Profile { id: string; display_name: string; username: string | null; role: 'admin' | 'member'; is_active: boolean; must_change_password: boolean; avatar_key?: string | null; avatar_data_url?: string | null }
export interface LeaderboardEntry { id: string; display_name: string; avatar_key?: string | null; avatar_data_url?: string | null; xp: number; rank: number }
export interface Progress { lesson_id: string; completed_at: string; xp: number }
export interface LessonStudyStatus { lesson_id: string; started_at: string; completed_runs: number; active_run: boolean; score: number | null; max_score: number | null }
export interface Summary { lesson_status?: LessonStudyStatus[]; dedicated_exam_count?: number; exam_xp?: number; xp: number; progress: Progress[]; exam_count: number; legacy_count: number }
export interface MediaFile { key: string; filename: string; content_type: string; size: number; state: 'active' | 'deleting'; created_at: string }
export interface PracticeDocument { lesson_id: string; version: number; questions: Question[]; layout?: ExamLayout; media_keys: string[]; enabled: boolean; source_exam_id?: string | null }
export interface PracticeSummary { lesson_id: string; question_count: number; enabled: boolean; source_exam_id: string | null }
export interface PracticeCheck { tries: number; response: string; correct: boolean | null; score: number; locked: boolean; revealed: boolean; slot_correct?: boolean[] }
export interface PracticeRun { id: string; lesson_id: string; title: string; version: number; questions: Question[]; layout?: ExamLayout; media_keys: string[]; responses: Record<string, string>; checks: Record<string, PracticeCheck>; revision: number; status: 'in_progress' | 'completed'; started_at: string; completed_at: string | null }
export interface ContentData { courses: Course[]; lessons: Lesson[]; vocabulary: Word[]; exams: Exam[]; exam_types: ExamType[]; practices?: PracticeSummary[] }
export const LANG_DETAILS: Record<Lang, { flag: string; label: string; color: string; soft: string; tts: string }> = {
  en: { flag: '🇬🇧', label: 'Tiếng Anh', color: '#6258df', soft: '#eeebff', tts: 'en-US' },
  fr: { flag: '🇫🇷', label: 'Tiếng Pháp', color: '#eb8a68', soft: '#fff0e8', tts: 'fr-FR' },
  zh: { flag: '🇨🇳', label: 'Tiếng Trung', color: '#df6572', soft: '#ffecf0', tts: 'zh-CN' },
  ja: { flag: '🇯🇵', label: 'Tiếng Nhật', color: '#38a699', soft: '#e6faf5', tts: 'ja-JP' },
}
