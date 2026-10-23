export type Lang = 'en' | 'fr' | 'zh' | 'ja'
export type Status = 'draft' | 'published' | 'archived'
export interface Course { id: string; language_code: Lang; title: string; native_name: string; level_label: string; description: string; sort_order: number }
export interface Word { id: string; lesson_id: string; term: string; pronunciation: string; meaning: string; example: string; example_translation: string; sort_order: number }
export interface Lesson {
  id: string; course_id: string; title: string; description: string; level: string; category: string; duration_minutes: number; sort_order: number;
  explanation: string; example_sentence: string; example_translation: string; listening_text: string;
  audio_key: string | null; image_key: string | null; media_keys: string[]; is_published: boolean; status: Status;
}
export interface ExamType { id: string; language_code: Lang; name: string }
export interface Exam { id: string; language_code: Lang; exam_type_id: string; lesson_id: string | null; title: string; description: string; duration_minutes: number; status: Status; version: number; media_keys: string[] }
export interface Question {
  id: string; section: string; kind: 'choice' | 'short' | 'essay'; prompt: string; passage: string; choices: string[];
  answers?: string[]; explanation?: string; points: number;
}
export interface ExamDocument extends Exam { questions: Question[] }
export interface ExamRun {
  id: string; exam_id: string; title: string; language_code: Lang; version: number; media_keys: string[];
  questions: Question[]; responses: Record<string, string>; started_at: string; deadline: string;
  submitted_at: string | null; status: 'in_progress' | 'pending_review' | 'graded'; score: number; max_score: number; revision: number;
  grades: Record<string, { score: number | null; feedback: string }>;
  user_id?: string; display_name?: string; server_now?: string;
}
export interface Profile { id: string; display_name: string; username: string | null; role: 'admin' | 'member'; is_active: boolean; must_change_password: boolean }
export interface Progress { lesson_id: string; completed_at: string; xp: number }
export interface Summary { xp: number; progress: Progress[]; exam_count: number; legacy_count: number }
export interface MediaFile { key: string; filename: string; content_type: string; size: number; state: 'active' | 'deleting'; created_at: string }
export interface ContentData { courses: Course[]; lessons: Lesson[]; vocabulary: Word[]; exams: Exam[]; exam_types: ExamType[] }
export const LANG_DETAILS: Record<Lang, { flag: string; label: string; color: string; soft: string; tts: string }> = {
  en: { flag: '🇬🇧', label: 'Tiếng Anh', color: '#6258df', soft: '#eeebff', tts: 'en-US' },
  fr: { flag: '🇫🇷', label: 'Tiếng Pháp', color: '#eb8a68', soft: '#fff0e8', tts: 'fr-FR' },
  zh: { flag: '🇨🇳', label: 'Tiếng Trung', color: '#df6572', soft: '#ffecf0', tts: 'zh-CN' },
  ja: { flag: '🇯🇵', label: 'Tiếng Nhật', color: '#38a699', soft: '#e6faf5', tts: 'ja-JP' },
}
