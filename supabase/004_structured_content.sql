-- Apply after 003. Existing runs and historical snapshots are not rewritten.
BEGIN;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS blocks jsonb;
ALTER TABLE public.exam_versions ADD COLUMN IF NOT EXISTS layout jsonb;
ALTER TABLE public.exam_runs ALTER COLUMN deadline DROP NOT NULL;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'mock' CHECK(mode IN ('practice','mock'));

CREATE OR REPLACE FUNCTION public.content_media_keys(doc jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT ARRAY(SELECT DISTINCT v #>> '{}' FROM jsonb_path_query(doc, '$.**.media_keys[*]') v WHERE jsonb_typeof(v)='string');
$$;
CREATE OR REPLACE FUNCTION public.validate_question_v4(q jsonb, strict boolean) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE kind text:=q->>'kind'; n integer; a text; BEGIN
 IF COALESCE(length(q->>'id'),0)=0 OR COALESCE(kind,'') NOT IN ('choice','multi','short','essay','gaps','matching') OR COALESCE((q->>'points')::integer,0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Câu hỏi/điểm không hợp lệ'; END IF;
 IF q ? 'word_limit' AND (q->>'word_limit')::integer NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Giới hạn từ không hợp lệ'; END IF;
 IF NOT strict THEN RETURN; END IF;
 IF COALESCE(length(btrim(q->>'prompt')),0)=0 THEN RAISE EXCEPTION 'Thiếu nội dung câu hỏi'; END IF;
 IF kind IN ('choice','multi','matching') THEN
 IF jsonb_typeof(q->'choices') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'choices') NOT BETWEEN 2 AND 30 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(q->'choices') c WHERE btrim(c)='') THEN RAISE EXCEPTION 'Lựa chọn trống/không hợp lệ'; END IF;
 END IF;
 IF kind<>'essay' AND (jsonb_typeof(q->'answers') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'answers')=0) THEN RAISE EXCEPTION 'Thiếu đáp án'; END IF;
 IF kind IN ('choice','multi') THEN
 IF jsonb_array_length(q->'choices')>8 OR (kind='choice' AND jsonb_array_length(q->'answers')<>1) OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(q->'answers'))<>jsonb_array_length(q->'answers') THEN RAISE EXCEPTION 'Đáp án không hợp lệ'; END IF;
 FOR a IN SELECT jsonb_array_elements_text(q->'answers') LOOP
 IF a !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Đáp án không hợp lệ'; END IF;
 IF a::integer>=jsonb_array_length(q->'choices') THEN RAISE EXCEPTION 'Đáp án ngoài phạm vi'; END IF;
 END LOOP;
 ELSIF kind IN ('short','gaps','matching') THEN
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(q->'answers') ans WHERE btrim(ans)='') THEN RAISE EXCEPTION 'Thiếu đáp án'; END IF;
 IF kind IN ('gaps','matching') THEN
 IF jsonb_typeof(q->'slots') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Thiếu mục trả lời'; END IF;
 n:=jsonb_array_length(q->'slots');
 IF n NOT BETWEEN 1 AND 30 OR jsonb_array_length(q->'answers')<>n OR (q->>'points')::integer % n <> 0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(q->'slots') s WHERE btrim(s)='') THEN RAISE EXCEPTION 'Mục trả lời hoặc điểm chia cho từng mục không hợp lệ'; END IF;
 IF kind='matching' THEN
 FOR a IN SELECT jsonb_array_elements_text(q->'answers') LOOP
 IF a !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Đáp án nối cần số thứ tự'; END IF;
 IF a::integer NOT BETWEEN 1 AND jsonb_array_length(q->'choices') THEN RAISE EXCEPTION 'Đáp án nối ngoài phạm vi'; END IF;
 END LOOP;
 END IF;
 END IF;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.answer_equal_v4(a text,b text,max_words integer DEFAULT 0) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT COALESCE(length(btrim(b))>0 AND (max_words=0 OR cardinality(regexp_split_to_array(btrim(b),'\s+'))<=max_words) AND lower(regexp_replace(btrim(normalize(a,NFC)),'\s+',' ','g'))=lower(regexp_replace(btrim(normalize(b,NFC)),'\s+',' ','g')),false);
$$;
CREATE OR REPLACE FUNCTION public.score_question_v4(q jsonb,response text) RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE values_json jsonb; a text; i integer:=0; total integer:=0; lim integer:=COALESCE((q->>'word_limit')::integer,0); BEGIN
 IF q->>'kind'='choice' THEN RETURN CASE WHEN response=q->'answers'->>0 THEN (q->>'points')::integer ELSE 0 END; END IF;
 IF q->>'kind'='short' THEN RETURN CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements_text(q->'answers') ans WHERE public.answer_equal_v4(ans,response,lim)) THEN (q->>'points')::integer ELSE 0 END; END IF;
 IF q->>'kind' NOT IN ('multi','gaps','matching') THEN RETURN 0; END IF;
 BEGIN values_json:=response::jsonb; EXCEPTION WHEN OTHERS THEN RETURN 0; END;
 IF jsonb_typeof(values_json) IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(values_json) v WHERE jsonb_typeof(v)<>'string') THEN RETURN 0; END IF;
 IF q->>'kind'='multi' THEN
 RETURN CASE WHEN jsonb_array_length(values_json)=jsonb_array_length(q->'answers') AND (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(values_json))=jsonb_array_length(values_json) AND values_json @> (q->'answers') AND (q->'answers') @> values_json THEN (q->>'points')::integer ELSE 0 END;
 END IF;
 FOR a IN SELECT jsonb_array_elements_text(q->'answers') LOOP
 IF EXISTS(SELECT 1 FROM unnest(string_to_array(a,'|')) accepted WHERE public.answer_equal_v4(accepted,values_json->>i,lim)) THEN total:=total+(q->>'points')::integer/jsonb_array_length(q->'slots'); END IF;
 i:=i+1;
 END LOOP; RETURN total;
END $$;
CREATE OR REPLACE FUNCTION public.save_lesson(p_doc jsonb,p_words jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lid uuid:=COALESCE(NULLIF(p_doc->>'id','')::uuid,gen_random_uuid()); keys text[]; w jsonb; block jsonb; n integer:=0; BEGIN
 IF NOT public.is_linguanest_admin() THEN RAISE EXCEPTION 'Chỉ quản trị viên được sửa bài'; END IF;
 IF COALESCE(length(btrim(p_doc->>'title')),0)=0 OR p_doc->>'status' NOT IN ('draft','published','archived') THEN RAISE EXCEPTION 'Thiếu tiêu đề/trạng thái'; END IF;
 IF jsonb_typeof(p_words) IS DISTINCT FROM 'array' OR jsonb_array_length(p_words)>1000 THEN RAISE EXCEPTION 'Tối đa 1.000 từ mỗi bài'; END IF;
 IF p_doc ? 'blocks' THEN
 IF jsonb_typeof(p_doc->'blocks') IS DISTINCT FROM 'array' OR jsonb_array_length(p_doc->'blocks')>100 OR octet_length((p_doc->'blocks')::text)>1000000 THEN RAISE EXCEPTION 'Nội dung bài học không hợp lệ/quá lớn'; END IF;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_doc->'blocks'))<>jsonb_array_length(p_doc->'blocks') THEN RAISE EXCEPTION 'Mã mục trùng hoặc thiếu'; END IF;
 FOR block IN SELECT value FROM jsonb_array_elements(p_doc->'blocks') LOOP
 IF COALESCE(block->>'kind','') NOT IN ('text','formula','table','example','note','media','quiz') THEN RAISE EXCEPTION 'Loại nội dung không hợp lệ'; END IF;
 IF block->>'kind'='quiz' THEN
 IF block->'question'->>'kind'='essay' THEN RAISE EXCEPTION 'Bài tập nhanh cần dạng tự chấm'; END IF;
 PERFORM public.validate_question_v4(block->'question',p_doc->>'status'='published');
 END IF;
 END LOOP;
 END IF;
 keys:=public.content_media_keys(p_doc);
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
 IF p_doc ? 'blocks' THEN UPDATE public.lessons SET blocks=p_doc->'blocks' WHERE id=lid; END IF;
 RETURN lid;
END $$;
CREATE OR REPLACE FUNCTION public.save_exam(p_doc jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid uuid:=COALESCE(NULLIF(p_doc->>'id','')::uuid,gen_random_uuid()); ver integer; qs jsonb:=p_doc->'questions'; q jsonb; keys text[]; layout_doc jsonb:=p_doc->'layout'; BEGIN
 IF NOT public.is_linguanest_admin() THEN RAISE EXCEPTION 'Chỉ quản trị viên'; END IF;
 IF COALESCE(length(btrim(p_doc->>'title')),0)=0 THEN RAISE EXCEPTION 'Thiếu tên đề'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.exam_types WHERE id=(p_doc->>'exam_type_id')::uuid AND language_code=p_doc->>'language_code') THEN RAISE EXCEPTION 'Loại kỳ thi không thuộc ngôn ngữ này'; END IF;
 IF NULLIF(p_doc->>'lesson_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.lessons l JOIN public.courses c ON c.id=l.course_id WHERE l.id=(p_doc->>'lesson_id')::uuid AND c.language_code=p_doc->>'language_code') THEN RAISE EXCEPTION 'Bài học không thuộc ngôn ngữ này'; END IF;
 IF jsonb_typeof(qs) IS DISTINCT FROM 'array' OR jsonb_array_length(qs)>200 OR (p_doc->>'status'='published' AND jsonb_array_length(qs)=0) THEN RAISE EXCEPTION 'Đề xuất bản cần 1–200 câu'; END IF;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(qs))<>jsonb_array_length(qs) THEN RAISE EXCEPTION 'Mã câu hỏi trùng hoặc thiếu'; END IF;
 IF octet_length(p_doc::text)>2000000 THEN RAISE EXCEPTION 'Đề quá lớn'; END IF;
 IF layout_doc IS NOT NULL THEN
 IF jsonb_typeof(layout_doc->'sections') IS DISTINCT FROM 'array' OR jsonb_typeof(layout_doc->'groups') IS DISTINCT FROM 'array' OR COALESCE(layout_doc->>'mode','') NOT IN ('mock','practice') THEN RAISE EXCEPTION 'Cấu trúc đề không hợp lệ'; END IF;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(layout_doc->'sections'))<>jsonb_array_length(layout_doc->'sections') OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(layout_doc->'groups'))<>jsonb_array_length(layout_doc->'groups') THEN RAISE EXCEPTION 'Mã phần/nhóm trùng hoặc thiếu'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(layout_doc->'groups') g WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(layout_doc->'sections') s WHERE s->>'id'=g->>'section_id')) THEN RAISE EXCEPTION 'Nhóm không thuộc phần nào'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(qs) item WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(layout_doc->'groups') g WHERE g->>'id'=item->>'group_id')) THEN RAISE EXCEPTION 'Câu chưa thuộc nhóm nào'; END IF;
 END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(qs) LOOP
 PERFORM public.validate_question_v4(q,p_doc->>'status'='published');
 END LOOP;
 keys:=public.content_media_keys(p_doc); PERFORM public.validate_media_keys(keys);
 SELECT version INTO ver FROM public.exams WHERE id=eid FOR UPDATE;
 IF FOUND AND ver<>COALESCE((p_doc->>'version')::integer,0) THEN RAISE EXCEPTION 'Đề đã được sửa ở nơi khác. Hãy tải lại trước khi lưu'; END IF;
 ver:=COALESCE(ver,0)+1;
 INSERT INTO public.exams(id,language_code,exam_type_id,lesson_id,title,description,duration_minutes,status,version,media_keys)
 VALUES(eid,p_doc->>'language_code',(p_doc->>'exam_type_id')::uuid,NULLIF(p_doc->>'lesson_id','')::uuid,btrim(p_doc->>'title'),COALESCE(p_doc->>'description',''),(p_doc->>'duration_minutes')::integer,p_doc->>'status',ver,keys)
 ON CONFLICT(id) DO UPDATE SET language_code=EXCLUDED.language_code,exam_type_id=EXCLUDED.exam_type_id,lesson_id=EXCLUDED.lesson_id,title=EXCLUDED.title,description=EXCLUDED.description,duration_minutes=EXCLUDED.duration_minutes,status=EXCLUDED.status,version=EXCLUDED.version,media_keys=EXCLUDED.media_keys,updated_at=now();
 UPDATE public.exams SET mode=COALESCE(layout_doc->>'mode','mock') WHERE id=eid;
 INSERT INTO public.exam_versions(exam_id,version,questions,layout) VALUES(eid,ver,qs,CASE WHEN layout_doc IS NULL THEN NULL ELSE layout_doc||jsonb_build_object('root_media_keys',COALESCE(p_doc->'media_keys','[]')) END); RETURN eid;
END $$;
CREATE OR REPLACE FUNCTION public.get_exam_document(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; BEGIN
 IF NOT public.is_linguanest_admin() THEN RAISE EXCEPTION 'Chỉ quản trị viên'; END IF;
 SELECT to_jsonb(e)||jsonb_build_object('questions',v.questions)||CASE WHEN v.layout IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('layout',v.layout,'media_keys',v.layout->'root_media_keys') END INTO result FROM public.exams e JOIN public.exam_versions v ON v.exam_id=e.id AND v.version=e.version WHERE e.id=p_id;
 IF result IS NULL THEN RAISE EXCEPTION 'Không tìm thấy đề'; END IF; RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.start_exam(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.exams; r public.exam_runs; qs jsonb; layout_doc jsonb; BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 SELECT * INTO e FROM public.exams WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR e.status<>'published' OR (e.lesson_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.lessons WHERE id=e.lesson_id AND status='published')) THEN RAISE EXCEPTION 'Đề chưa xuất bản'; END IF;
 SELECT * INTO r FROM public.exam_runs WHERE user_id=auth.uid() AND exam_id=p_id AND status='in_progress';
 IF FOUND THEN RETURN public.run_payload(r); END IF;
 SELECT questions,layout INTO qs,layout_doc FROM public.exam_versions WHERE exam_id=e.id AND version=e.version;
 INSERT INTO public.exam_runs(user_id,exam_id,snapshot,deadline,max_score)
 VALUES(auth.uid(),e.id,jsonb_build_object('title',e.title,'language_code',e.language_code,'version',e.version,'questions',qs,'media_keys',e.media_keys,'layout',layout_doc),
 CASE WHEN layout_doc->>'mode'='practice' THEN NULL ELSE now()+make_interval(mins=>e.duration_minutes) END,(SELECT sum((q->>'points')::integer) FROM jsonb_array_elements(qs) q)) RETURNING * INTO r;
 RETURN public.run_payload(r);
END $$;
CREATE OR REPLACE FUNCTION public.run_payload(r public.exam_runs) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (r.snapshot-'questions'-'layout')||jsonb_build_object('id',r.id,'exam_id',r.exam_id,'user_id',r.user_id,'display_name',(SELECT display_name FROM public.profiles WHERE id=r.user_id),
 'layout',CASE WHEN r.status='in_progress' AND r.snapshot->'layout' IS NOT NULL AND jsonb_typeof(r.snapshot->'layout')='object' THEN (r.snapshot->'layout')||jsonb_build_object('groups',(SELECT COALESCE(jsonb_agg(g-'transcript'),'[]') FROM jsonb_array_elements(r.snapshot->'layout'->'groups') g)) ELSE r.snapshot->'layout' END,
 'questions',CASE WHEN r.status='in_progress' THEN (SELECT COALESCE(jsonb_agg(q-'answers'-'explanation'-'rubric'),'[]') FROM jsonb_array_elements(r.snapshot->'questions') q) ELSE (SELECT COALESCE(jsonb_agg(CASE WHEN public.is_linguanest_admin() THEN q ELSE q-'rubric' END),'[]') FROM jsonb_array_elements(r.snapshot->'questions') q) END,
 'responses',r.responses,'revision',r.revision,'grades',r.grades,'started_at',r.started_at,'deadline',r.deadline,'submitted_at',r.submitted_at,'status',r.status,'score',r.score,'max_score',r.max_score,'server_now',clock_timestamp());
$$;
CREATE OR REPLACE FUNCTION public.submit_exam(p_id uuid,p_responses jsonb,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.exam_runs; q jsonb; response text; pts integer; total integer:=0; pending boolean:=false; result_grades jsonb:='{}'; BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 SELECT * INTO r FROM public.exam_runs WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bài'; END IF;
 IF r.status<>'in_progress' THEN RETURN public.run_payload(r); END IF;
 IF r.deadline IS NULL OR clock_timestamp()<r.deadline THEN
 IF r.revision<>p_revision THEN RAISE EXCEPTION 'Bài đã được lưu từ thiết bị khác. Hãy mở lại bài'; END IF;
 PERFORM public.validate_responses(r.snapshot->'questions',p_responses); r.responses:=p_responses;
 END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(r.snapshot->'questions') LOOP
 response:=COALESCE(r.responses->>(q->>'id'),''); pts:=0;
 IF q->>'kind'='essay' THEN pending:=true; pts:=NULL;
 ELSE pts:=public.score_question_v4(q,response);
 END IF;
 total:=total+COALESCE(pts,0); result_grades:=result_grades||jsonb_build_object(q->>'id',jsonb_build_object('score',pts,'feedback',''));
 END LOOP;
 UPDATE public.exam_runs SET responses=r.responses,grades=result_grades,score=total,status=CASE WHEN pending THEN 'pending_review' ELSE 'graded' END,submitted_at=now(),revision=revision+1 WHERE id=p_id RETURNING * INTO r;
 RETURN public.run_payload(r);
END $$;

REVOKE ALL ON FUNCTION public.content_media_keys(jsonb), public.validate_question_v4(jsonb,boolean), public.answer_equal_v4(text,text,integer), public.score_question_v4(jsonb,text) FROM PUBLIC,anon,authenticated;
COMMIT;
