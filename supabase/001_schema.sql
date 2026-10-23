-- LinguaNest schema — chạy bằng Supabase SQL Editor, chỉ một lần (có thể chạy lại).
-- KHÔNG chèn service_role vào frontend; role admin được gán thủ công trong SQL Editor.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Thành viên',
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  language_code text NOT NULL CHECK (language_code IN ('en','fr','zh','ja')),
  title text NOT NULL,
  native_name text NOT NULL DEFAULT '',
  level_label text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT 'A1',
  category text NOT NULL DEFAULT 'Tổng hợp',
  duration_minutes integer NOT NULL DEFAULT 10,
  sort_order integer NOT NULL DEFAULT 0,
  explanation text NOT NULL DEFAULT '',
  example_sentence text NOT NULL DEFAULT '',
  example_translation text NOT NULL DEFAULT '',
  listening_text text NOT NULL DEFAULT '',
  audio_key text,
  image_key text,
  is_published boolean NOT NULL DEFAULT true
);
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS image_key text;
CREATE TABLE IF NOT EXISTS public.vocabulary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  term text NOT NULL,
  pronunciation text NOT NULL DEFAULT '',
  meaning text NOT NULL,
  example text NOT NULL DEFAULT '',
  example_translation text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  choices jsonb NOT NULL CHECK (jsonb_typeof(choices) = 'array'),
  answer_index integer NOT NULL CHECK (answer_index BETWEEN 0 AND 3),
  explanation text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.user_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  xp integer NOT NULL DEFAULT 20 CHECK (xp >= 0 AND xp <= 100),
  PRIMARY KEY (user_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS public.flashcard_reviews (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vocabulary_id uuid NOT NULL REFERENCES public.vocabulary(id) ON DELETE CASCADE,
  confidence integer NOT NULL CHECK (confidence BETWEEN 0 AND 2),
  next_review_at timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, vocabulary_id)
);
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  correct_count integer NOT NULL CHECK (correct_count >= 0),
  total_count integer NOT NULL CHECK (total_count > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_lessons_course ON public.lessons (course_id,sort_order);
CREATE INDEX IF NOT EXISTS ix_words_lesson ON public.vocabulary (lesson_id,sort_order);
CREATE INDEX IF NOT EXISTS ix_exercises_lesson ON public.exercises (lesson_id,sort_order);
CREATE INDEX IF NOT EXISTS ix_attempts_user ON public.quiz_attempts (user_id,created_at DESC);

-- Trigger tự tạo hồ sơ khi thêm tài khoản qua Supabase Auth.
CREATE OR REPLACE FUNCTION public.create_profile_for_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 INSERT INTO public.profiles(id, display_name)
 VALUES (NEW.id, coalesce(nullif(NEW.raw_user_meta_data->>'display_name',''), split_part(coalesce(NEW.email,'thanhvien'), '@', 1)))
 ON CONFLICT (id) DO NOTHING;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created_linguanest ON auth.users;
CREATE TRIGGER on_auth_user_created_linguanest
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_user();
INSERT INTO public.profiles(id,display_name)
SELECT id, coalesce(split_part(email,'@',1),'Thành viên') FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Kiểm tra quyền admin server-side; SECURITY DEFINER để tránh policy recursion.
CREATE OR REPLACE FUNCTION public.is_linguanest_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND role='admin');
$$;
REVOKE ALL ON FUNCTION public.is_linguanest_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_linguanest_admin() TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read" ON public.profiles;
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated USING (id=(SELECT auth.uid()) OR public.is_linguanest_admin());
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE TO authenticated USING (public.is_linguanest_admin()) WITH CHECK (public.is_linguanest_admin());
DROP POLICY IF EXISTS "courses_read" ON public.courses;
CREATE POLICY "courses_read" ON public.courses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "courses_admin_insert" ON public.courses;
CREATE POLICY "courses_admin_insert" ON public.courses FOR INSERT TO authenticated WITH CHECK (public.is_linguanest_admin());
DROP POLICY IF EXISTS "courses_admin_update" ON public.courses;
CREATE POLICY "courses_admin_update" ON public.courses FOR UPDATE TO authenticated USING (public.is_linguanest_admin()) WITH CHECK (public.is_linguanest_admin());
DROP POLICY IF EXISTS "lessons_read" ON public.lessons;
CREATE POLICY "lessons_read" ON public.lessons FOR SELECT TO authenticated USING (is_published OR public.is_linguanest_admin());
DROP POLICY IF EXISTS "lessons_admin_insert" ON public.lessons;
CREATE POLICY "lessons_admin_insert" ON public.lessons FOR INSERT TO authenticated WITH CHECK (public.is_linguanest_admin());
DROP POLICY IF EXISTS "lessons_admin_update" ON public.lessons;
CREATE POLICY "lessons_admin_update" ON public.lessons FOR UPDATE TO authenticated USING (public.is_linguanest_admin()) WITH CHECK (public.is_linguanest_admin());
DROP POLICY IF EXISTS "vocabulary_read" ON public.vocabulary;
CREATE POLICY "vocabulary_read" ON public.vocabulary FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND (l.is_published OR public.is_linguanest_admin())));
DROP POLICY IF EXISTS "vocabulary_admin_insert" ON public.vocabulary;
CREATE POLICY "vocabulary_admin_insert" ON public.vocabulary FOR INSERT TO authenticated WITH CHECK (public.is_linguanest_admin());
DROP POLICY IF EXISTS "exercises_read" ON public.exercises;
CREATE POLICY "exercises_read" ON public.exercises FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND (l.is_published OR public.is_linguanest_admin())));
DROP POLICY IF EXISTS "exercises_admin_insert" ON public.exercises;
CREATE POLICY "exercises_admin_insert" ON public.exercises FOR INSERT TO authenticated WITH CHECK (public.is_linguanest_admin());
DROP POLICY IF EXISTS "progress_read" ON public.user_progress;
CREATE POLICY "progress_read" ON public.user_progress FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "progress_insert" ON public.user_progress;
CREATE POLICY "progress_insert" ON public.user_progress FOR INSERT TO authenticated WITH CHECK (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "progress_update" ON public.user_progress;
CREATE POLICY "progress_update" ON public.user_progress FOR UPDATE TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "review_read" ON public.flashcard_reviews;
CREATE POLICY "review_read" ON public.flashcard_reviews FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "review_insert" ON public.flashcard_reviews;
CREATE POLICY "review_insert" ON public.flashcard_reviews FOR INSERT TO authenticated WITH CHECK (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "review_update" ON public.flashcard_reviews;
CREATE POLICY "review_update" ON public.flashcard_reviews FOR UPDATE TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "attempt_read" ON public.quiz_attempts;
CREATE POLICY "attempt_read" ON public.quiz_attempts FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "attempt_insert" ON public.quiz_attempts;
CREATE POLICY "attempt_insert" ON public.quiz_attempts FOR INSERT TO authenticated WITH CHECK (user_id=(SELECT auth.uid()));

-- Lưu ý: quiz_attempts là dữ liệu hỗ trợ học tập, không phải chống gian lận thi cử.
-- Nếu triển khai thi có thưởng hoặc xếp hạng có giá trị, cần chấm điểm server-side.
