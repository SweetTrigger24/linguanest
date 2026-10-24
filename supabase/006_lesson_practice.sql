-- Apply after 004; 005 is optional legacy Storage setup. Safe to reapply.
BEGIN;
CREATE TABLE IF NOT EXISTS public.lesson_practices (
 lesson_id uuid PRIMARY KEY REFERENCES public.lessons(id) ON DELETE RESTRICT,
 version integer NOT NULL DEFAULT 1, questions jsonb NOT NULL DEFAULT '[]', layout jsonb,
 media_keys text[] NOT NULL DEFAULT '{}', enabled boolean NOT NULL DEFAULT true,
 source_exam_id uuid UNIQUE REFERENCES public.exams(id) ON DELETE RESTRICT,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.lesson_practice_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT, snapshot jsonb NOT NULL,
 responses jsonb NOT NULL DEFAULT '{}', checks jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed')),
 started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_lesson_practice ON public.lesson_practice_runs(user_id,lesson_id) WHERE status='in_progress';
CREATE INDEX IF NOT EXISTS practice_history ON public.lesson_practice_runs(user_id,lesson_id,started_at DESC);
ALTER TABLE public.lesson_practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_practice_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesson_practices,public.lesson_practice_runs FROM anon,authenticated;
GRANT ALL ON public.lesson_practices,public.lesson_practice_runs TO service_role;

-- Copy, never remove or rewrite source exams, versions, runs or old XP.
INSERT INTO public.lesson_practices(lesson_id,questions,layout,media_keys,enabled,source_exam_id)
 SELECT e.lesson_id,v.questions,v.layout,e.media_keys,e.status='published',e.id
 FROM public.exams e JOIN public.exam_types t ON t.id=e.exam_type_id
 JOIN public.exam_versions v ON v.exam_id=e.id AND v.version=e.version
 WHERE e.lesson_id IS NOT NULL AND t.name='Bài tập'
 ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.list_lesson_practices() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('lesson_id',p.lesson_id,'question_count',jsonb_array_length(p.questions),'enabled',p.enabled,'source_exam_id',p.source_exam_id)),'[]')
 FROM public.lesson_practices p JOIN public.lessons l ON l.id=p.lesson_id
 WHERE public.is_linguanest_member() AND (public.is_linguanest_admin() OR (l.status='published' AND p.enabled));
$$;
CREATE OR REPLACE FUNCTION public.get_lesson_practice(p_lesson uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE doc jsonb; BEGIN
 IF NOT public.is_linguanest_admin() THEN RAISE EXCEPTION 'Chỉ quản trị viên'; END IF;
 SELECT to_jsonb(p) INTO doc FROM public.lesson_practices p WHERE lesson_id=p_lesson;
 RETURN COALESCE(doc,jsonb_build_object('lesson_id',p_lesson,'version',0,'questions','[]'::jsonb,'media_keys','[]'::jsonb,'enabled',true));
END $$;

CREATE OR REPLACE FUNCTION public.save_lesson_bundle(p_doc jsonb,p_words jsonb,p_practice jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lid uuid; ver integer; qs jsonb; q jsonb; keys text[]; source_id uuid; existing_source uuid; BEGIN
 IF NOT public.is_linguanest_admin() THEN RAISE EXCEPTION 'Chỉ quản trị viên'; END IF;
 lid:=public.save_lesson(p_doc,p_words);
 IF p_practice IS NULL THEN RETURN lid; END IF;
 PERFORM 1 FROM public.lessons WHERE id=lid FOR UPDATE;
 SELECT version,source_exam_id INTO ver,existing_source FROM public.lesson_practices WHERE lesson_id=lid FOR UPDATE;
 IF COALESCE(ver,0)<>COALESCE((p_practice->>'version')::integer,0) THEN RAISE EXCEPTION 'Bài tập đã được sửa ở nơi khác. Hãy tải lại'; END IF;
 qs:=p_practice->'questions';
 IF jsonb_typeof(qs) IS DISTINCT FROM 'array' OR jsonb_array_length(qs)>200 OR octet_length(p_practice::text)>2000000 THEN RAISE EXCEPTION 'Bài tập tối đa 200 câu và 2 MB'; END IF;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(qs))<>jsonb_array_length(qs) THEN RAISE EXCEPTION 'Mã câu hỏi trùng hoặc thiếu'; END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(qs) LOOP
  PERFORM public.validate_question_v4(q,true);
  IF COALESCE((q->>'max_attempts')::integer,2) NOT BETWEEN 1 AND 10 OR COALESCE(q->>'reveal_mode','after_attempts') NOT IN ('after_attempts','after_check') OR COALESCE(q->>'check_mode','manual') NOT IN ('manual','instant') THEN RAISE EXCEPTION 'Cấu hình kiểm tra không hợp lệ'; END IF;
  IF q->>'kind'='gaps' AND EXISTS(SELECT 1 FROM regexp_matches(q->>'prompt','\{\{([0-9]+)\}\}','g') m WHERE m[1]::integer NOT BETWEEN 1 AND jsonb_array_length(q->'slots')) THEN RAISE EXCEPTION 'Vị trí ô trống không có đáp án'; END IF;
 END LOOP;
 source_id:=NULLIF(p_practice->>'source_exam_id','')::uuid;
 IF existing_source IS NOT NULL AND source_id IS DISTINCT FROM existing_source THEN RAISE EXCEPTION 'Không thay liên kết nguồn đã chuyển'; END IF;
 IF source_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.exams e JOIN public.courses c ON c.id=(SELECT course_id FROM public.lessons WHERE id=lid) WHERE e.id=source_id AND e.language_code=c.language_code) THEN RAISE EXCEPTION 'Đề nguồn không thuộc ngôn ngữ bài học'; END IF;
 END IF;
 keys:=public.content_media_keys(p_practice); PERFORM public.validate_media_keys(keys);
 INSERT INTO public.lesson_practices(lesson_id,version,questions,layout,media_keys,enabled,source_exam_id)
 VALUES(lid,COALESCE(ver,0)+1,qs,p_practice->'layout',keys,COALESCE((p_practice->>'enabled')::boolean,true),source_id)
 ON CONFLICT(lesson_id) DO UPDATE SET version=EXCLUDED.version,questions=EXCLUDED.questions,layout=EXCLUDED.layout,media_keys=EXCLUDED.media_keys,enabled=EXCLUDED.enabled,source_exam_id=EXCLUDED.source_exam_id,updated_at=now();
 RETURN lid;
END $$;

CREATE OR REPLACE FUNCTION public.practice_payload(r public.lesson_practice_runs) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',r.id,'lesson_id',r.lesson_id,'title',r.snapshot->'title','version',r.snapshot->'version','media_keys',r.snapshot->'media_keys',
 'layout',CASE WHEN r.status='completed' THEN r.snapshot->'layout' WHEN jsonb_typeof(r.snapshot->'layout')='object' THEN (r.snapshot->'layout')||jsonb_build_object('groups',(SELECT COALESCE(jsonb_agg(g-'transcript'),'[]') FROM jsonb_array_elements(r.snapshot->'layout'->'groups') g)) ELSE NULL END,
 'questions',(SELECT COALESCE(jsonb_agg(CASE WHEN r.status='completed' OR COALESCE((r.checks->(q->>'id')->>'locked')::boolean,false) THEN q-'rubric' ELSE q-'answers'-'explanation'-'rubric' END ORDER BY n),'[]') FROM jsonb_array_elements(r.snapshot->'questions') WITH ORDINALITY a(q,n)),
 'responses',r.responses,'checks',r.checks,'revision',r.revision,'status',r.status,'started_at',r.started_at,'completed_at',r.completed_at);
$$;
CREATE OR REPLACE FUNCTION public.start_lesson_practice(p_lesson uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.lesson_practices; r public.lesson_practice_runs; title text; BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 SELECT l.title INTO title FROM public.lessons l WHERE id=p_lesson AND status='published' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bài học chưa xuất bản'; END IF;
 SELECT * INTO r FROM public.lesson_practice_runs WHERE user_id=auth.uid() AND lesson_id=p_lesson AND status='in_progress';
 IF FOUND THEN RETURN public.practice_payload(r); END IF;
 SELECT * INTO p FROM public.lesson_practices WHERE lesson_id=p_lesson AND enabled AND jsonb_array_length(questions)>0;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bài học chưa có luyện tập'; END IF;
 INSERT INTO public.lesson_practice_runs(user_id,lesson_id,snapshot) VALUES(auth.uid(),p_lesson,to_jsonb(p)||jsonb_build_object('title',title)) RETURNING * INTO r;
 RETURN public.practice_payload(r);
END $$;
CREATE OR REPLACE FUNCTION public.get_practice_run(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.lesson_practice_runs; BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 SELECT * INTO r FROM public.lesson_practice_runs WHERE id=p_id AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lượt luyện tập'; END IF;
 RETURN public.practice_payload(r);
END $$;
CREATE OR REPLACE FUNCTION public.practice_history(p_lesson uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE(jsonb_agg(public.practice_payload(r) ORDER BY r.started_at DESC),'[]') FROM
 (SELECT * FROM public.lesson_practice_runs WHERE public.is_linguanest_member() AND user_id=auth.uid() AND lesson_id=p_lesson ORDER BY started_at DESC,id LIMIT 20) r;
$$;
CREATE OR REPLACE FUNCTION public.practice_check(q jsonb,response text,previous jsonb,reveal boolean) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE tries integer:=COALESCE((previous->>'tries')::integer,0)+1; pts integer; correct boolean; locked boolean; slots jsonb; i integer; flags jsonb:='[]'; ok boolean; BEGIN
 IF COALESCE((previous->>'locked')::boolean,false) THEN RETURN previous; END IF;
 pts:=CASE WHEN reveal OR q->>'kind'='essay' THEN 0 ELSE public.score_question_v4(q,response) END;
 correct:=CASE WHEN q->>'kind'='essay' THEN NULL ELSE NOT reveal AND pts=(q->>'points')::integer END;
 locked:=reveal OR COALESCE(correct,false) OR q->>'kind'='essay' OR tries>=COALESCE((q->>'max_attempts')::integer,2) OR COALESCE(q->>'reveal_mode','after_attempts')='after_check';
 IF q->>'kind' IN ('gaps','matching') THEN
  BEGIN slots:=response::jsonb; EXCEPTION WHEN OTHERS THEN slots:='[]'; END;
  IF jsonb_typeof(slots) IS DISTINCT FROM 'array' THEN slots:='[]'; END IF;
  FOR i IN 0..jsonb_array_length(q->'slots')-1 LOOP
   SELECT NOT reveal AND COALESCE(bool_or(public.answer_equal_v4(slots->>i,a,COALESCE((q->>'word_limit')::integer,0))),false) INTO ok FROM unnest(string_to_array(q->'answers'->>i,'|')) a;
   flags:=flags||jsonb_build_array(ok);
  END LOOP;
 END IF;
 RETURN jsonb_build_object('tries',tries,'response',response,'score',pts,'correct',correct,'locked',locked,'revealed',reveal,'slot_correct',flags);
END $$;
CREATE OR REPLACE FUNCTION public.save_practice_answers(p_id uuid,p_responses jsonb,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.lesson_practice_runs; q jsonb; next_responses jsonb:=p_responses; BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 SELECT * INTO r FROM public.lesson_practice_runs WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR r.status<>'in_progress' THEN RAISE EXCEPTION 'Lượt luyện tập đã kết thúc'; END IF;
 IF r.revision<>p_revision THEN RAISE EXCEPTION 'Bài đã lưu ở thiết bị khác. Hãy tải lại lượt luyện tập'; END IF;
 PERFORM public.validate_responses(r.snapshot->'questions',p_responses);
 FOR q IN SELECT value FROM jsonb_array_elements(r.snapshot->'questions') LOOP
  IF COALESCE((r.checks->(q->>'id')->>'locked')::boolean,false) THEN next_responses:=next_responses||jsonb_build_object(q->>'id',COALESCE(r.responses->>(q->>'id'),'')); END IF;
 END LOOP;
 UPDATE public.lesson_practice_runs SET responses=next_responses,revision=revision+1 WHERE id=p_id RETURNING * INTO r;
 RETURN public.practice_payload(r);
END $$;
CREATE OR REPLACE FUNCTION public.check_practice_answer(p_id uuid,p_question text,p_response text,p_revision integer,p_reveal boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.lesson_practice_runs; q jsonb; result jsonb; BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 SELECT * INTO r FROM public.lesson_practice_runs WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR r.status<>'in_progress' THEN RAISE EXCEPTION 'Lượt luyện tập đã kết thúc'; END IF;
 IF r.revision<>p_revision THEN RAISE EXCEPTION 'Bài đã lưu ở thiết bị khác. Hãy tải lại lượt luyện tập'; END IF;
 SELECT value INTO q FROM jsonb_array_elements(r.snapshot->'questions') WHERE value->>'id'=p_question;
 IF q IS NULL OR p_response IS NULL THEN RAISE EXCEPTION 'Câu hỏi hoặc câu trả lời không hợp lệ'; END IF;
 PERFORM public.validate_responses(jsonb_build_array(q),jsonb_build_object(p_question,p_response));
 IF NOT COALESCE((r.checks->p_question->>'locked')::boolean,false) THEN
  result:=public.practice_check(q,p_response,r.checks->p_question,p_reveal);
  UPDATE public.lesson_practice_runs SET responses=responses||jsonb_build_object(p_question,p_response),checks=checks||jsonb_build_object(p_question,result),revision=revision+1 WHERE id=p_id RETURNING * INTO r;
 END IF;
 RETURN public.practice_payload(r);
END $$;
CREATE OR REPLACE FUNCTION public.finish_practice(p_id uuid,p_responses jsonb,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.lesson_practice_runs; q jsonb; result jsonb; BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 SELECT * INTO r FROM public.lesson_practice_runs WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lượt luyện tập'; END IF;
 IF r.status='completed' THEN RETURN public.practice_payload(r); END IF;
 IF r.revision<>p_revision THEN RAISE EXCEPTION 'Bài đã lưu ở thiết bị khác. Hãy tải lại lượt luyện tập'; END IF;
 PERFORM public.validate_responses(r.snapshot->'questions',p_responses);
 FOR q IN SELECT value FROM jsonb_array_elements(r.snapshot->'questions') LOOP
  IF NOT COALESCE((r.checks->(q->>'id')->>'locked')::boolean,false) THEN
   r.responses:=r.responses||jsonb_build_object(q->>'id',COALESCE(p_responses->>(q->>'id'),''));
   result:=public.practice_check(q,COALESCE(p_responses->>(q->>'id'),''),r.checks->(q->>'id'),false)||'{"locked":true}'::jsonb;
   r.checks:=r.checks||jsonb_build_object(q->>'id',result);
  END IF;
 END LOOP;
 UPDATE public.lesson_practice_runs SET responses=r.responses,checks=r.checks,status='completed',completed_at=now(),revision=revision+1 WHERE id=p_id RETURNING * INTO r;
 RETURN public.practice_payload(r);
END $$;

-- Preserve the existing exam/media implementation and extend only the relevant gates.
DO $$ BEGIN
 IF to_regprocedure('public.start_exam_before_practice(uuid)') IS NULL THEN ALTER FUNCTION public.start_exam(uuid) RENAME TO start_exam_before_practice; END IF;
 IF to_regprocedure('public.save_exam_before_practice(jsonb)') IS NULL THEN ALTER FUNCTION public.save_exam(jsonb) RENAME TO save_exam_before_practice; END IF;
 IF to_regprocedure('public.can_access_media_before_practice(uuid,text)') IS NULL THEN ALTER FUNCTION public.can_access_media_for(uuid,text) RENAME TO can_access_media_before_practice; END IF;
 IF to_regprocedure('public.reserve_media_delete_before_practice(text)') IS NULL THEN ALTER FUNCTION public.reserve_media_delete(text) RENAME TO reserve_media_delete_before_practice; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.start_exam(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.lesson_practices WHERE source_exam_id=p_id) THEN RAISE EXCEPTION 'Bài tập này đã chuyển vào Bài học. Lượt thi cũ vẫn ở Lịch sử'; END IF;
 RETURN public.start_exam_before_practice(p_id);
END $$;
CREATE OR REPLACE FUNCTION public.save_exam(p_doc jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.lesson_practices WHERE source_exam_id=NULLIF(p_doc->>'id','')::uuid) THEN RAISE EXCEPTION 'Hãy sửa bài tập trong Bài học'; END IF;
 RETURN public.save_exam_before_practice(p_doc);
END $$;
CREATE OR REPLACE FUNCTION public.can_access_media_for(p_user uuid,p_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.can_access_media_before_practice(p_user,p_key) OR
 EXISTS(SELECT 1 FROM public.profiles u JOIN public.media_files m ON m.key=p_key AND m.state='active' WHERE u.id=p_user AND u.is_active AND NOT u.must_change_password AND
 (EXISTS(SELECT 1 FROM public.lesson_practices p JOIN public.lessons l ON l.id=p.lesson_id WHERE p.enabled AND l.status='published' AND p_key=ANY(p.media_keys)) OR
 EXISTS(SELECT 1 FROM public.lesson_practice_runs r WHERE r.user_id=p_user AND r.snapshot->'media_keys' ? p_key)));
$$;
CREATE OR REPLACE FUNCTION public.reserve_media_delete(p_key text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.media_files WHERE key=p_key FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.lesson_practices WHERE p_key=ANY(media_keys)) OR EXISTS(SELECT 1 FROM public.lesson_practice_runs WHERE snapshot->'media_keys' ? p_key) THEN RAISE EXCEPTION 'File đang được bài luyện tập hoặc lịch sử sử dụng'; END IF;
 PERFORM public.reserve_media_delete_before_practice(p_key);
END $$;

REVOKE ALL ON FUNCTION public.start_exam_before_practice(uuid),public.save_exam_before_practice(jsonb),public.can_access_media_before_practice(uuid,text),public.reserve_media_delete_before_practice(text),public.practice_payload(public.lesson_practice_runs),public.practice_check(jsonb,text,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.list_lesson_practices(),public.get_lesson_practice(uuid),public.save_lesson_bundle(jsonb,jsonb,jsonb),public.start_lesson_practice(uuid),public.get_practice_run(uuid),public.practice_history(uuid),public.save_practice_answers(uuid,jsonb,integer),public.check_practice_answer(uuid,text,text,integer,boolean),public.finish_practice(uuid,jsonb,integer),public.start_exam(uuid),public.save_exam(jsonb),public.can_access_media_for(uuid,text),public.reserve_media_delete(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_lesson_practices(),public.get_lesson_practice(uuid),public.save_lesson_bundle(jsonb,jsonb,jsonb),public.start_lesson_practice(uuid),public.get_practice_run(uuid),public.practice_history(uuid),public.save_practice_answers(uuid,jsonb,integer),public.check_practice_answer(uuid,text,text,integer,boolean),public.finish_practice(uuid,jsonb,integer),public.start_exam(uuid),public.save_exam(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_media_for(uuid,text),public.reserve_media_delete(text) TO service_role;
COMMIT;
