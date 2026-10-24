-- Apply after 006. Track reading separately from completion/XP; preserve all old runs.
BEGIN;
CREATE TABLE IF NOT EXISTS public.lesson_study_starts (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
 started_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,lesson_id)
);
ALTER TABLE public.lesson_study_starts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesson_study_starts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.lesson_study_starts TO service_role;

-- Internal lookup: converted sources and legacy exercises, including unlinked ones.
CREATE OR REPLACE VIEW public.lesson_exercise_sources AS
 SELECT e.id AS exam_id,COALESCE(p.lesson_id,e.lesson_id) AS lesson_id
 FROM public.exams e JOIN public.exam_types t ON t.id=e.exam_type_id
 LEFT JOIN public.lesson_practices p ON p.source_exam_id=e.id
 WHERE t.name='Bài tập' OR p.source_exam_id IS NOT NULL;
REVOKE ALL ON public.lesson_exercise_sources FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.lesson_exercise_sources TO service_role;

CREATE OR REPLACE FUNCTION public.begin_lesson(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.lessons WHERE id=p_id AND status='published') THEN RAISE EXCEPTION 'Bài học chưa xuất bản'; END IF;
 INSERT INTO public.lesson_study_starts(user_id,lesson_id) VALUES(auth.uid(),p_id) ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.lesson_study_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 WITH attempts AS (
  SELECT r.id,r.lesson_id,r.started_at,r.completed_at AS finished_at,r.status='completed' AS completed,r.status='in_progress' AS active,
   (SELECT COALESCE(sum((c.value->>'score')::numeric),0) FROM jsonb_each(r.checks) c) AS score,
   (SELECT COALESCE(sum((q->>'points')::numeric),0) FROM jsonb_array_elements(r.snapshot->'questions') q WHERE q->>'kind'<>'essay') AS max_score
  FROM public.lesson_practice_runs r WHERE r.user_id=auth.uid()
  UNION ALL
  SELECT r.id,s.lesson_id,r.started_at,r.submitted_at,r.status='graded',r.status='in_progress',r.score,r.max_score
  FROM public.exam_runs r JOIN public.lesson_exercise_sources s ON s.exam_id=r.exam_id
  WHERE r.user_id=auth.uid() AND s.lesson_id IS NOT NULL
 ), visits AS (
  SELECT lesson_id,started_at FROM public.lesson_study_starts WHERE user_id=auth.uid()
  UNION ALL SELECT lesson_id,completed_at FROM public.user_progress WHERE user_id=auth.uid()
  UNION ALL SELECT lesson_id,started_at FROM attempts
 ), totals AS (
  SELECT lesson_id,count(*) FILTER(WHERE completed) AS completed_runs,bool_or(active) AS active_run FROM attempts GROUP BY lesson_id
 ), latest AS (
  SELECT DISTINCT ON(lesson_id) lesson_id,score,max_score FROM attempts WHERE completed ORDER BY lesson_id,finished_at DESC,id DESC
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object('lesson_id',v.lesson_id,'started_at',v.started_at,
  'completed_runs',COALESCE(t.completed_runs,0),'active_run',COALESCE(t.active_run,false),'score',l.score,'max_score',l.max_score)),'[]') INTO result
 FROM (SELECT lesson_id,min(started_at) AS started_at FROM visits GROUP BY lesson_id) v
 LEFT JOIN totals t ON t.lesson_id=v.lesson_id LEFT JOIN latest l ON l.lesson_id=v.lesson_id;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.exam_history(p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 RETURN (SELECT COALESCE(jsonb_agg(public.run_payload(r) ORDER BY r.started_at DESC,r.id),'[]') FROM
 (SELECT r.* FROM public.exam_runs r WHERE r.user_id=auth.uid()
 AND NOT EXISTS(SELECT 1 FROM public.lesson_exercise_sources s WHERE s.exam_id=r.exam_id)
 ORDER BY r.started_at DESC,r.id LIMIT 20 OFFSET greatest(0,p_offset)) r);
END $$;

CREATE OR REPLACE FUNCTION public.lesson_exam_history(p_lesson uuid DEFAULT NULL,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 RETURN (SELECT COALESCE(jsonb_agg(public.run_payload(r) ORDER BY r.started_at DESC,r.id),'[]') FROM
 (SELECT r.* FROM public.exam_runs r JOIN public.lesson_exercise_sources s ON s.exam_id=r.exam_id
 WHERE r.user_id=auth.uid() AND s.lesson_id IS NOT DISTINCT FROM p_lesson
 ORDER BY r.started_at DESC,r.id LIMIT 20 OFFSET greatest(0,p_offset)) r);
END $$;

DO $$ BEGIN
 IF to_regprocedure('public.learning_summary_before_study_status()') IS NULL THEN ALTER FUNCTION public.learning_summary() RENAME TO learning_summary_before_study_status; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.learning_summary() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb; BEGIN
 base:=public.learning_summary_before_study_status();
 RETURN base||jsonb_build_object('lesson_status',public.lesson_study_status(),
  'dedicated_exam_count',(SELECT count(*) FROM public.exam_runs r WHERE r.user_id=auth.uid() AND r.status<>'in_progress' AND NOT EXISTS(SELECT 1 FROM public.lesson_exercise_sources s WHERE s.exam_id=r.exam_id)),
  'exam_xp',(SELECT COALESCE(sum(r.score*5),0) FROM public.exam_runs r WHERE r.user_id=auth.uid() AND r.status='graded' AND NOT EXISTS(SELECT 1 FROM public.lesson_exercise_sources s WHERE s.exam_id=r.exam_id)));
END $$;
REVOKE ALL ON FUNCTION public.learning_summary_before_study_status() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.begin_lesson(uuid),public.lesson_study_status(),public.exam_history(integer),public.lesson_exam_history(uuid,integer),public.learning_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_lesson(uuid),public.lesson_study_status(),public.exam_history(integer),public.lesson_exam_history(uuid,integer),public.learning_summary() TO authenticated;
COMMIT;
