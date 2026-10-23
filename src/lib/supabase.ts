import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL?.trim() || ''
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || ''
export const cloudMode = Boolean(url && publicKey)
export const supabase = cloudMode ? createClient(url, publicKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
}) : null
export const mediaWorkerUrl = (import.meta.env.VITE_MEDIA_WORKER_URL || '').replace(/\/$/, '')
