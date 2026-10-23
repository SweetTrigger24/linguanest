-- Run AFTER 001_schema.sql and 002_seed.sql. Existing history is retained.
BEGIN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean;
UPDATE public.profiles SET is_active=true WHERE is_active IS NULL;
ALTER TABLE public.profiles ALTER COLUMN is_active SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS status text;
UPDATE public.lessons SET status=CASE WHEN is_published THEN 'published' ELSE 'draft' END WHERE status IS NULL;
ALTER TABLE public.lessons ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE public.lessons ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.lessons ALTER COLUMN is_published SET DEFAULT false;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS media_keys text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.exam_types (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), language_code text NOT NULL CHECK(language_code IN ('en','fr','zh','ja')),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80), UNIQUE(language_code,name)
);
INSERT INTO public.exam_types(language_code,name) VALUES
 ('en','IELTS'),('en','TOEIC'),('en','Cambridge'),('en','Bài tập'),
 ('fr','DELF'),('fr','DALF'),('fr','TCF'),('fr','Bài tập'),
 ('zh','HSK'),('zh','HSKK'),('zh','Bài tập'),('ja','JLPT'),('ja','J.TEST'),('ja','Bài tập')
 ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.exams (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), language_code text NOT NULL CHECK(language_code IN ('en','fr','zh','ja')),
 exam_type_id uuid NOT NULL REFERENCES public.exam_types(id), lesson_id uuid UNIQUE REFERENCES public.lessons(id) ON DELETE RESTRICT,
 title text NOT NULL, description text NOT NULL DEFAULT '', duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 1 AND 300),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')), version integer NOT NULL DEFAULT 1,
 media_keys text[] NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.exam_versions (
 exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT, version integer NOT NULL,
 questions jsonb NOT NULL CHECK(jsonb_typeof(questions)='array'), PRIMARY KEY(exam_id,version)
);
CREATE TABLE IF NOT EXISTS public.exam_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT, snapshot jsonb NOT NULL,
 responses jsonb NOT NULL DEFAULT '{}', grades jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','pending_review','graded')),
 started_at timestamptz NOT NULL DEFAULT now(), deadline timestamptz NOT NULL, submitted_at timestamptz,
 score integer NOT NULL DEFAULT 0, max_score integer NOT NULL CHECK(max_score>0),
 CHECK(score>=0 AND score<=max_score)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_exam ON public.exam_runs(user_id,exam_id) WHERE status='in_progress';
CREATE INDEX IF NOT EXISTS runs_history ON public.exam_runs(user_id,started_at DESC);
CREATE TABLE IF NOT EXISTS public.media_files (
 key text PRIMARY KEY, filename text NOT NULL, content_type text NOT NULL, size bigint NOT NULL CHECK(size>=0),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','deleting')), created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.media_files(key,filename,content_type,size)
 SELECT audio_key,audio_key,'audio/mpeg',0 FROM public.lessons WHERE audio_key IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.media_files(key,filename,content_type,size)
 SELECT image_key,image_key,CASE WHEN image_key LIKE '%.png' THEN 'image/png' WHEN image_key LIKE '%.webp' THEN 'image/webp' ELSE 'image/jpeg' END,0
 FROM public.lessons WHERE image_key IS NOT NULL ON CONFLICT DO NOTHING;

-- Convert old lesson quizzes, without deleting their original questions or results.
INSERT INTO public.exams(language_code,exam_type_id,lesson_id,title,duration_minutes,status)
 SELECT c.language_code,t.id,l.id,'Bài tập: '||l.title,15,l.status FROM public.lessons l
 JOIN public.courses c ON c.id=l.course_id JOIN public.exam_types t ON t.language_code=c.language_code AND t.name='Bài tập'
 WHERE EXISTS(SELECT 1 FROM public.exercises q WHERE q.lesson_id=l.id) ON CONFLICT(lesson_id) DO NOTHING;
INSERT INTO public.exam_versions(exam_id,version,questions)
 SELECT e.id,1,jsonb_agg(jsonb_build_object('id',q.id,'kind','choice','section','Bài tập','passage','',
 'prompt',q.prompt,'choices',q.choices,'answers',jsonb_build_array(q.answer_index::text),'explanation',q.explanation,'points',1) ORDER BY q.sort_order,q.id)
 FROM public.exams e JOIN public.exercises q ON q.lesson_id=e.lesson_id GROUP BY e.id ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_linguanest_member() RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND NOT must_change_password);
$$;
CREATE OR REPLACE FUNCTION public.is_linguanest_admin() RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND is_active AND NOT must_change_password);
$$;

-- Replace all old policies, including old direct client score/XP writes.
DO $$ DECLARE p record; t text; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN
 ('profiles','courses','lessons','vocabulary','exercises','user_progress','quiz_attempts','flashcard_reviews','exam_types','exams','exam_versions','exam_runs','media_files')
 LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
 FOREACH t IN ARRAY ARRAY['profiles','courses','lessons','vocabulary','exercises','user_progress','quiz_attempts','flashcard_reviews','exam_types','exams','exam_versions','exam_runs','media_files']
 LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
GRANT SELECT ON public.profiles,public.courses,public.lessons,public.vocabulary,public.exam_types,public.exams,public.media_files TO authenticated;
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid() OR public.is_linguanest_admin());
CREATE POLICY courses_read ON public.courses FOR SELECT TO authenticated USING(public.is_linguanest_member());
CREATE POLICY lessons_read ON public.lessons FOR SELECT TO authenticated USING(public.is_linguanest_member() AND (status='published' OR public.is_linguanest_admin()));
CREATE POLICY vocabulary_read ON public.vocabulary FOR SELECT TO authenticated USING(public.is_linguanest_member() AND EXISTS(SELECT 1 FROM public.lessons l WHERE l.id=lesson_id));
CREATE POLICY types_read ON public.exam_types FOR SELECT TO authenticated USING(public.is_linguanest_member());
CREATE POLICY exams_read ON public.exams FOR SELECT TO authenticated USING(public.is_linguanest_member() AND (public.is_linguanest_admin() OR (status='published' AND (lesson_id IS NULL OR EXISTS(SELECT 1 FROM public.lessons l WHERE l.id=lesson_id)))));
CREATE POLICY media_admin_read ON public.media_files FOR SELECT TO authenticated USING(public.is_linguanest_admin());

CREATE OR REPLACE FUNCTION public.update_my_profile(p_name text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền truy cập'; END IF;
 IF length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Tên hiển thị cần 1–80 ký tự'; END IF;
 UPDATE public.profiles SET display_name=btrim(p_name) WHERE id=auth.uid();
END $$;
CREATE OR REPLACE FUNCTION public.validate_media_keys(p_keys text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text; BEGIN
 FOREACH k IN ARRAY p_keys LOOP
 PERFORM 1 FROM public.media_files WHERE key=k AND state='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'File không tồn tại hoặc đang được xóa: %',k; END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.save_lesson(p_doc jsonb,p_words jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lid uuid:=COALESCE(NULLIF(p_doc->>'id','')::uuid,gen_random_uuid()); keys text[]; w jsonb; n integer:=0; BEGIN
 IF NOT public.is_linguanest_admin() THEN RAISE EXCEPTION 'Chỉ quản trị viên được sửa bài'; END IF;
 IF COALESCE(length(btrim(p_doc->>'title')),0)=0 OR p_doc->>'status' NOT IN ('draft','published','archived') THEN RAISE EXCEPTION 'Thiếu tiêu đề/trạng thái'; END IF;
 IF jsonb_typeof(p_words) IS DISTINCT FROM 'array' OR jsonb_array_length(p_words)>1000 THEN RAISE EXCEPTION 'Tối đa 1.000 từ mỗi bài'; END IF;
 keys:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_doc->'media_keys','[]')));
 PERFORM public.validate_media_keys(keys||array_remove(ARRAY[p_doc->>'audio_key',p_doc->>'image_key'],NULL));
 INSERT INTO public.lessons(id,course_id,title,description,level,category,duration_minutes,sort_order,explanation,example_sentence,example_translation,listening_text,audio_key,image_key,media_keys,status,is_published)
 VALUES(lid,(p_doc->>'course_id')::uuid,btrim(p_doc->>'title'),COALESCE(p_doc->>'description',''),COALESCE(p_doc->>'level','A1'),COALESCE(p_doc->>'category','Tổng hợp'),
 greatest(1,least(300,COALESCE((p_doc->>'duration_minutes')::integer,10))),COALESCE((p_doc->>'sort_order')::integer,0),COALESCE(p_doc->>'explanation',''),
 COALESCE(p_doc->>'example_sentence',''),COALESCE(p_doc->>'example_translation',''),COALESCE(p_doc->>'listening_text',''),p_doc->>'audio_key',p_doc->>'image_key',keys,p_doc->>'status',p_doc->>'status'='published')
 ON CONFLICT(id) DO UPDATE SET course_id=EXCLUDED.course_id,title=EXCLUDED.title,description=EXCLUDED.description,level=EXCLUDED.level,category=EXCLUDED.category,
 duration_minutes=EXCLUDED.duration_minutes,sort_order=EXCLUDED.sort_order,explanation=EXCLUDED.explanation,example_sentence=EXCLUDED.example_sentence,
 example_translation=EXCLUDED.example_translation,listening_text=EXCLUDED.listening_text,audio_key=EXCLUDED.audio_key,image_key=EXCLUDED.image_key,
 media_keys=EXCLUDED.media_keys,status=EXCLUDED.status,is_published=EXCLUDED.is_published;
 FOR w IN SELECT value FROM jsonb_array_elements(p_words) LOOP
 IF COALESCE(length(btrim(w->>'term')),0)=0 OR COALESCE(length(btrim(w->>'meaning')),0)=0 THEN RAISE EXCEPTION 'Từ và nghĩa không được trống'; END IF;
 IF EXISTS(SELECT 1 FROM public.vocabulary WHERE id=(w->>'id')::uuid AND lesson_id<>lid) THEN RAISE EXCEPTION 'Mã từ thuộc bài khác'; END IF;
 INSERT INTO public.vocabulary(id,lesson_id,term,meaning,pronunciation,example,example_translation,sort_order)
 VALUES((w->>'id')::uuid,lid,w->>'term',w->>'meaning',COALESCE(w->>'pronunciation',''),COALESCE(w->>'example',''),COALESCE(w->>'example_translation',''),n)
 ON CONFLICT(id) DO UPDATE SET term=EXCLUDED.term,meaning=EXCLUDED.meaning,pronunciation=EXCLUDED.pronunciation,example=EXCLUDED.example,example_translation=EXCLUDED.example_translation,sort_order=EXCLUDED.sort_order;
 n:=n+1;
 END LOOP;
 DELETE FROM public.vocabulary WHERE lesson_id=lid AND id NOT IN(SELECT (value->>'id')::uuid FROM jsonb_array_elements(p_words));
 RETURN lid;
END $$;
CREATE OR REPLACE FUNCTION public.complete_lesson(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_linguanest_member() OR NOT EXISTS(SELECT 1 FROM public.lessons WHERE id=p_id AND status='published') THEN RAISE EXCEPTION 'Không thể hoàn thành bài này'; END IF;
 INSERT INTO public.user_progress(user_id,lesson_id,xp) VALUES(auth.uid(),p_id,20) ON CONFLICT DO NOTHING;
END $$;
CREATE OR REPLACE FUNCTION public.add_exam_type(p_language text,p_name text) RETURNS public.exam_types LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.exam_types; BEGIN
 IF NOT public.is_linguanest_admin() THEN RAISE EXCEPTION 'Chỉ quản trị viên'; END IF;
 INSERT INTO public.exam_types(language_code,name) VALUES(p_language,btrim(p_name)) RETURNING * INTO result; RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.save_exam(p_doc jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid uuid:=COALESCE(NULLIF(p_doc->>'id','')::uuid,gen_random_uuid()); ver integer; qs jsonb:=p_doc->'questions'; q jsonb; keys text[]; BEGIN
 IF NOT public.is_linguanest_admin() THEN RAISE EXCEPTION 'Chỉ quản trị viên'; END IF;
 IF COALESCE(length(btrim(p_doc->>'title')),0)=0 THEN RAISE EXCEPTION 'Thiếu tên đề'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.exam_types WHERE id=(p_doc->>'exam_type_id')::uuid AND language_code=p_doc->>'language_code') THEN RAISE EXCEPTION 'Loại kỳ thi không thuộc ngôn ngữ này'; END IF;
 IF NULLIF(p_doc->>'lesson_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.lessons l JOIN public.courses c ON c.id=l.course_id WHERE l.id=(p_doc->>'lesson_id')::uuid AND c.language_code=p_doc->>'language_code') THEN RAISE EXCEPTION 'Bài học không thuộc ngôn ngữ này'; END IF;
 IF jsonb_typeof(qs) IS DISTINCT FROM 'array' OR jsonb_array_length(qs)>200 OR (p_doc->>'status'='published' AND jsonb_array_length(qs)=0) THEN RAISE EXCEPTION 'Đề xuất bản cần 1–200 câu'; END IF;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(qs))<>jsonb_array_length(qs) THEN RAISE EXCEPTION 'Mã câu hỏi trùng hoặc thiếu'; END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(qs) LOOP
 IF COALESCE(length(q->>'id'),0)=0 OR COALESCE(length(btrim(q->>'prompt')),0)=0 OR COALESCE(q->>'kind','') NOT IN ('choice','short','essay') OR COALESCE((q->>'points')::integer,0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Câu hỏi/điểm không hợp lệ'; END IF;
 IF q->>'kind'='choice' THEN
 IF jsonb_typeof(q->'choices') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'choices') NOT BETWEEN 2 AND 8 OR
 jsonb_typeof(q->'answers') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'answers')<>1 OR COALESCE(q->'answers'->>0,'') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Lựa chọn/đáp án không hợp lệ'; END IF;
 IF (q->'answers'->>0)::integer>=jsonb_array_length(q->'choices') OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(q->'choices') x WHERE btrim(x)='') THEN RAISE EXCEPTION 'Đáp án ngoài phạm vi hoặc lựa chọn trống'; END IF;
 ELSIF q->>'kind'='short' THEN
 IF jsonb_typeof(q->'answers') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'answers')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(q->'answers') x WHERE btrim(x)='') THEN RAISE EXCEPTION 'Thiếu đáp án điền từ'; END IF;
 END IF;
 END LOOP;
 keys:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_doc->'media_keys','[]'))); PERFORM public.validate_media_keys(keys);
 SELECT version INTO ver FROM public.exams WHERE id=eid FOR UPDATE;
 IF FOUND AND ver<>COALESCE((p_doc->>'version')::integer,0) THEN RAISE EXCEPTION 'Đề đã được sửa ở nơi khác. Hãy tải lại trước khi lưu'; END IF;
 ver:=COALESCE(ver,0)+1;
 INSERT INTO public.exams(id,language_code,exam_type_id,lesson_id,title,description,duration_minutes,status,version,media_keys)
 VALUES(eid,p_doc->>'language_code',(p_doc->>'exam_type_id')::uuid,NULLIF(p_doc->>'lesson_id','')::uuid,btrim(p_doc->>'title'),COALESCE(p_doc->>'description',''),(p_doc->>'duration_minutes')::integer,p_doc->>'status',ver,keys)
 ON CONFLICT(id) DO UPDATE SET language_code=EXCLUDED.language_code,exam_type_id=EXCLUDED.exam_type_id,lesson_id=EXCLUDED.lesson_id,title=EXCLUDED.title,description=EXCLUDED.description,duration_minutes=EXCLUDED.duration_minutes,status=EXCLUDED.status,version=EXCLUDED.version,media_keys=EXCLUDED.media_keys,updated_at=now();
 INSERT INTO public.exam_versions VALUES(eid,ver,qs); RETURN eid;
END $$;
CREATE OR REPLACE FUNCTION public.get_exam_document(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; BEGIN
 IF NOT public.is_linguanest_admin() THEN RAISE EXCEPTION 'Chỉ quản trị viên'; END IF;
 SELECT to_jsonb(e)||jsonb_build_object('questions',v.questions) INTO result FROM public.exams e JOIN public.exam_versions v ON v.exam_id=e.id AND v.version=e.version WHERE e.id=p_id;
 IF result IS NULL THEN RAISE EXCEPTION 'Không tìm thấy đề'; END IF; RETURN result;
END $$;

-- Private helper: never grant execute to browser roles.
CREATE OR REPLACE FUNCTION public.run_payload(r public.exam_runs) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (r.snapshot-'questions')||jsonb_build_object('id',r.id,'exam_id',r.exam_id,'user_id',r.user_id,'display_name',(SELECT display_name FROM public.profiles WHERE id=r.user_id),
 'questions',CASE WHEN r.status='in_progress' THEN (SELECT COALESCE(jsonb_agg(q-'answers'-'explanation'),'[]') FROM jsonb_array_elements(r.snapshot->'questions') q) ELSE r.snapshot->'questions' END,
 'responses',r.responses,'revision',r.revision,'grades',r.grades,'started_at',r.started_at,'deadline',r.deadline,'submitted_at',r.submitted_at,'status',r.status,'score',r.score,'max_score',r.max_score,'server_now',clock_timestamp());
$$;
CREATE OR REPLACE FUNCTION public.validate_responses(p_questions jsonb,p_responses jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(p_responses) IS DISTINCT FROM 'object' OR octet_length(p_responses::text)>250000 THEN RAISE EXCEPTION 'Bài làm không hợp lệ/quá lớn'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_responses) a WHERE jsonb_typeof(a.value)<>'string' OR length(a.value#>>'{}')>20000 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_questions) q WHERE q->>'id'=a.key)) THEN RAISE EXCEPTION 'Câu trả lời không hợp lệ'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.start_exam(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.exams; r public.exam_runs; qs jsonb; BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 SELECT * INTO e FROM public.exams WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR e.status<>'published' OR (e.lesson_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.lessons WHERE id=e.lesson_id AND status='published')) THEN RAISE EXCEPTION 'Đề chưa xuất bản'; END IF;
 SELECT * INTO r FROM public.exam_runs WHERE user_id=auth.uid() AND exam_id=p_id AND status='in_progress';
 IF FOUND THEN RETURN public.run_payload(r); END IF;
 SELECT questions INTO qs FROM public.exam_versions WHERE exam_id=e.id AND version=e.version;
 INSERT INTO public.exam_runs(user_id,exam_id,snapshot,deadline,max_score)
 VALUES(auth.uid(),e.id,jsonb_build_object('title',e.title,'language_code',e.language_code,'version',e.version,'questions',qs,'media_keys',e.media_keys),
 now()+make_interval(mins=>e.duration_minutes),(SELECT sum((q->>'points')::integer) FROM jsonb_array_elements(qs) q)) RETURNING * INTO r;
 RETURN public.run_payload(r);
END $$;
CREATE OR REPLACE FUNCTION public.get_exam_run(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.exam_runs; BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 SELECT * INTO r FROM public.exam_runs WHERE id=p_id AND (user_id=auth.uid() OR public.is_linguanest_admin());
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lượt làm bài'; END IF;
 RETURN public.run_payload(r);
END $$;
CREATE OR REPLACE FUNCTION public.save_exam_responses(p_id uuid,p_responses jsonb,p_revision integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.exam_runs; BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 SELECT * INTO r FROM public.exam_runs WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR r.status<>'in_progress' OR clock_timestamp()>=r.deadline THEN RAISE EXCEPTION 'Bài đã kết thúc hoặc hết giờ'; END IF;
 IF r.revision<>p_revision THEN RAISE EXCEPTION 'Bài đã được lưu từ thiết bị khác. Hãy mở lại bài'; END IF;
 PERFORM public.validate_responses(r.snapshot->'questions',p_responses);
 UPDATE public.exam_runs SET responses=p_responses,revision=revision+1 WHERE id=p_id RETURNING revision INTO p_revision; RETURN p_revision;
END $$;
CREATE OR REPLACE FUNCTION public.submit_exam(p_id uuid,p_responses jsonb,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.exam_runs; q jsonb; response text; pts integer; total integer:=0; pending boolean:=false; result_grades jsonb:='{}'; BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 SELECT * INTO r FROM public.exam_runs WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bài'; END IF;
 IF r.status<>'in_progress' THEN RETURN public.run_payload(r); END IF;
 IF clock_timestamp()<r.deadline THEN
 IF r.revision<>p_revision THEN RAISE EXCEPTION 'Bài đã được lưu từ thiết bị khác. Hãy mở lại bài'; END IF;
 PERFORM public.validate_responses(r.snapshot->'questions',p_responses); r.responses:=p_responses;
 END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(r.snapshot->'questions') LOOP
 response:=COALESCE(r.responses->>(q->>'id'),''); pts:=0;
 IF q->>'kind'='essay' THEN pending:=true; pts:=NULL;
 ELSIF q->>'kind'='choice' THEN IF response=q->'answers'->>0 THEN pts:=(q->>'points')::integer; END IF;
 ELSE
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(q->'answers') a WHERE lower(regexp_replace(btrim(normalize(a,NFC)),'\s+',' ','g'))=lower(regexp_replace(btrim(normalize(response,NFC)),'\s+',' ','g'))) THEN pts:=(q->>'points')::integer; END IF;
 END IF;
 total:=total+COALESCE(pts,0); result_grades:=result_grades||jsonb_build_object(q->>'id',jsonb_build_object('score',pts,'feedback',''));
 END LOOP;
 UPDATE public.exam_runs SET responses=r.responses,grades=result_grades,score=total,status=CASE WHEN pending THEN 'pending_review' ELSE 'graded' END,submitted_at=now(),revision=revision+1 WHERE id=p_id RETURNING * INTO r;
 RETURN public.run_payload(r);
END $$;
CREATE OR REPLACE FUNCTION public.grade_exam(p_id uuid,p_grades jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.exam_runs; q jsonb; pts integer; g jsonb; total integer:=0; BEGIN
 IF NOT public.is_linguanest_admin() THEN RAISE EXCEPTION 'Chỉ quản trị viên'; END IF;
 SELECT * INTO r FROM public.exam_runs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending_review' THEN RAISE EXCEPTION 'Bài không còn chờ chấm'; END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(r.snapshot->'questions') LOOP
 IF q->>'kind'='essay' THEN
 g:=p_grades->(q->>'id'); pts:=(g->>'score')::integer;
 IF pts IS NULL OR pts<0 OR pts>(q->>'points')::integer OR length(COALESCE(g->>'feedback',''))>10000 THEN RAISE EXCEPTION 'Điểm tự luận không hợp lệ'; END IF;
 r.grades:=r.grades||jsonb_build_object(q->>'id',jsonb_build_object('score',pts,'feedback',COALESCE(g->>'feedback','')));
 ELSE pts:=(r.grades->(q->>'id')->>'score')::integer;
 END IF; total:=total+pts;
 END LOOP;
 UPDATE public.exam_runs SET grades=r.grades,score=total,status='graded' WHERE id=p_id RETURNING * INTO r; RETURN public.run_payload(r);
END $$;
CREATE OR REPLACE FUNCTION public.list_exam_runs(p_offset integer DEFAULT 0,p_pending boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_linguanest_member() OR (p_pending AND NOT public.is_linguanest_admin()) THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 RETURN (SELECT COALESCE(jsonb_agg(public.run_payload(r) ORDER BY r.started_at DESC),'[]') FROM
 (SELECT * FROM public.exam_runs WHERE (CASE WHEN p_pending THEN status='pending_review' ELSE user_id=auth.uid() END) ORDER BY started_at DESC,id LIMIT 20 OFFSET greatest(0,p_offset)) r);
END $$;
CREATE OR REPLACE FUNCTION public.learning_summary() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 RETURN jsonb_build_object('xp',
 COALESCE((SELECT sum(xp) FROM public.user_progress WHERE user_id=auth.uid()),0)+
 COALESCE((SELECT sum(least(correct_count,total_count)*5) FROM public.quiz_attempts WHERE user_id=auth.uid()),0)+
 COALESCE((SELECT sum(score*5) FROM public.exam_runs WHERE user_id=auth.uid() AND status='graded'),0),
 'progress',(SELECT COALESCE(jsonb_agg(jsonb_build_object('lesson_id',lesson_id,'completed_at',completed_at,'xp',xp)),'[]') FROM public.user_progress WHERE user_id=auth.uid()),
 'exam_count',(SELECT count(*) FROM public.exam_runs WHERE user_id=auth.uid() AND status<>'in_progress'),
 'legacy_count',(SELECT count(*) FROM public.quiz_attempts WHERE user_id=auth.uid()));
END $$;

CREATE OR REPLACE FUNCTION public.member_summaries() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_linguanest_admin() THEN RAISE EXCEPTION 'Chỉ quản trị viên'; END IF;
 RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,
 'lessons',(SELECT count(*) FROM public.user_progress WHERE user_id=p.id),
 'exams',(SELECT count(*) FROM public.exam_runs WHERE user_id=p.id AND status<>'in_progress'),
 'xp',COALESCE((SELECT sum(xp) FROM public.user_progress WHERE user_id=p.id),0)+COALESCE((SELECT sum(least(correct_count,total_count)*5) FROM public.quiz_attempts WHERE user_id=p.id),0)+COALESCE((SELECT sum(score*5) FROM public.exam_runs WHERE user_id=p.id AND status='graded'),0))),'[]') FROM public.profiles p);
END $$;
CREATE OR REPLACE FUNCTION public.can_access_media_for(p_user uuid,p_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.media_files WHERE key=p_key AND state='active') AND
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_user AND p.is_active AND NOT p.must_change_password AND
 (p.role='admin' OR EXISTS(SELECT 1 FROM public.lessons WHERE status='published' AND (audio_key=p_key OR image_key=p_key OR p_key=ANY(media_keys))) OR
 EXISTS(SELECT 1 FROM public.exams e WHERE status='published' AND p_key=ANY(media_keys) AND (lesson_id IS NULL OR EXISTS(SELECT 1 FROM public.lessons l WHERE l.id=e.lesson_id AND l.status='published'))) OR
 EXISTS(SELECT 1 FROM public.exam_runs r WHERE r.user_id=p_user AND r.snapshot->'media_keys' ? p_key)));
$$;
CREATE OR REPLACE FUNCTION public.reserve_media_delete(p_key text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.media_files WHERE key=p_key FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy file'; END IF;
 IF EXISTS(SELECT 1 FROM public.lessons WHERE audio_key=p_key OR image_key=p_key OR p_key=ANY(media_keys)) OR
 EXISTS(SELECT 1 FROM public.exams WHERE p_key=ANY(media_keys)) OR EXISTS(SELECT 1 FROM public.exam_runs WHERE snapshot->'media_keys' ? p_key)
 THEN RAISE EXCEPTION 'File đang được bài học, đề hoặc lịch sử sử dụng. Hãy gỡ liên kết trước'; END IF;
 UPDATE public.media_files SET state='deleting' WHERE key=p_key;
END $$;

-- Close all new function entry points by default; grant only the intended API.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
 ('is_linguanest_member','is_linguanest_admin','update_my_profile','validate_media_keys','save_lesson','complete_lesson','add_exam_type','save_exam','get_exam_document','run_payload','validate_responses','start_exam','get_exam_run','save_exam_responses','submit_exam','grade_exam','list_exam_runs','learning_summary','member_summaries','can_access_media_for','reserve_media_delete')
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature); END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.is_linguanest_member(),public.is_linguanest_admin(),public.update_my_profile(text),public.save_lesson(jsonb,jsonb),public.complete_lesson(uuid),
 public.add_exam_type(text,text),public.save_exam(jsonb),public.get_exam_document(uuid),public.start_exam(uuid),public.get_exam_run(uuid),
 public.save_exam_responses(uuid,jsonb,integer),public.submit_exam(uuid,jsonb,integer),public.grade_exam(uuid,jsonb),public.list_exam_runs(integer,boolean),public.learning_summary(),public.member_summaries() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_media_for(uuid,text),public.reserve_media_delete(text) TO service_role;
COMMIT;
