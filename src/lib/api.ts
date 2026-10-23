import { cloudMode, mediaWorkerUrl, supabase } from './supabase'
import * as demo from './demo'
import { errorMessage } from './content'
import type { ContentData, ExamDocument, ExamRun, ExamType, Lesson, MediaFile, Profile, Summary, Word } from './types'

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase!.rpc(name, args); if (error) throw error; return data as T
}
async function all<T>(table: string, order = 'id'): Promise<T[]> {
  const result: T[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase!.from(table).select('*').order(order).range(offset, offset + 499)
    if (error) throw error; result.push(...data as T[]); if (data.length < 500) return result
  }
}
export async function loadContent(): Promise<ContentData> {
  if (!cloudMode) return demo.demoStore()
  const [courses, lessons, vocabulary, exams, exam_types] = await Promise.all([all<ContentData['courses'][number]>('courses'), all<Lesson>('lessons'), all<Word>('vocabulary'), all<ContentData['exams'][number]>('exams'), all<ExamType>('exam_types')])
  lessons.sort((a, b) => a.sort_order - b.sort_order); vocabulary.sort((a, b) => a.sort_order - b.sort_order)
  return { courses, lessons, vocabulary, exams, exam_types }
}
export async function loadProfile(id: string): Promise<Profile> {
  if (!cloudMode) return demo.demoProfile()
  const { data, error } = await supabase!.from('profiles').select('*').eq('id', id).single(); if (error) throw error; return data
}
export async function renameProfile(name: string) { if (!cloudMode) return demo.demoRename(name); return rpc('update_my_profile', { p_name: name }) }
export async function summary(): Promise<Summary> { return cloudMode ? rpc('learning_summary') : demo.demoSummary() }
export async function completeLesson(id: string) { return cloudMode ? rpc('complete_lesson', { p_id: id }) : demo.demoComplete(id) }
export async function saveLesson(doc: Lesson, words: Word[]): Promise<string> { return cloudMode ? rpc('save_lesson', { p_doc: doc, p_words: words }) : demo.demoLesson(doc, words) }
export async function saveExam(doc: ExamDocument): Promise<string> { return cloudMode ? rpc('save_exam', { p_doc: doc }) : demo.demoExam(doc) }
export async function examDocument(id: string): Promise<ExamDocument> { return cloudMode ? rpc('get_exam_document', { p_id: id }) : structuredClone(demo.demoStore().documents.find(d => d.id === id)!) }
export async function addExamType(language: ExamType['language_code'], name: string): Promise<ExamType> { return cloudMode ? rpc('add_exam_type', { p_language: language, p_name: name }) : demo.demoType(language, name) }
export async function startExam(id: string): Promise<ExamRun> { return cloudMode ? rpc('start_exam', { p_id: id }) : demo.demoStart(id) }
export async function getRun(id: string): Promise<ExamRun> { return cloudMode ? rpc('get_exam_run', { p_id: id }) : demo.demoRun(id) }
export async function saveResponses(id: string, responses: Record<string, string>, revision: number): Promise<number> { return cloudMode ? rpc('save_exam_responses', { p_id: id, p_responses: responses, p_revision: revision }) : demo.demoResponses(id, responses, revision) }
export async function submitExam(id: string, responses: Record<string, string>, revision: number): Promise<ExamRun> { return cloudMode ? rpc('submit_exam', { p_id: id, p_responses: responses, p_revision: revision }) : demo.demoSubmit(id, responses, revision) }
export async function gradeExam(id: string, grades: ExamRun['grades']): Promise<ExamRun> { return cloudMode ? rpc('grade_exam', { p_id: id, p_grades: grades }) : demo.demoGrade(id, grades) }
export async function history(offset = 0, pending = false): Promise<ExamRun[]> { return cloudMode ? rpc('list_exam_runs', { p_offset: offset, p_pending: pending }) : demo.demoHistory(offset, pending) }
export async function worker<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!cloudMode || !mediaWorkerUrl) throw Error('Cần cấu hình Supabase và VITE_MEDIA_WORKER_URL để dùng chức năng này.')
  const { data, error } = await supabase!.auth.getSession(); if (error) throw error
  if (!data.session) throw Error('Vui lòng đăng nhập lại.')
  const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${data.session.access_token}`)
  const response = await fetch(`${mediaWorkerUrl}${path}`, { ...init, headers })
  const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
  if (!response.ok) throw Error(body.error || errorMessage(body)); return body
}
export const workerJSON = <T,>(path: string, value: unknown, method = 'POST') => worker<T>(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
export const mediaURL = (key: string) => worker<{ url: string }>('/media-ticket?key=' + encodeURIComponent(key))
export const listMedia = (): Promise<MediaFile[]> => cloudMode ? all('media_files', 'key') : Promise.resolve([])
export const uploadMedia = (file: File) => worker<MediaFile>('/media?filename=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
export const deleteMedia = (key: string) => worker('/media?key=' + encodeURIComponent(key), { method: 'DELETE' })
export const listMembers = (): Promise<Profile[]> => cloudMode ? all('profiles') : Promise.resolve([demo.demoProfile()])
export const memberSummaries = (): Promise<{ id: string; lessons: number; exams: number; xp: number }[]> => cloudMode ? rpc('member_summaries') : Promise.resolve([{ id: 'demo', lessons: demo.demoSummary().progress.length, exams: demo.demoSummary().exam_count, xp: demo.demoSummary().xp }])
