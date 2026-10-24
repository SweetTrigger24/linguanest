from pathlib import Path
import re

source = Path('supabase/003_learning_platform.sql').read_text(encoding='utf-8')
def fn(name):
    return re.search(r'CREATE OR REPLACE FUNCTION public\.' + name + r'\(.*?\$\$;', source, re.S).group(0)

sql = '''-- Apply after 003. Existing runs and historical snapshots are not rewritten.
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
 SELECT COALESCE(length(btrim(b))>0 AND (max_words=0 OR cardinality(regexp_split_to_array(btrim(b),'\\s+'))<=max_words) AND lower(regexp_replace(btrim(normalize(a,NFC)),'\\s+',' ','g'))=lower(regexp_replace(btrim(normalize(b,NFC)),'\\s+',' ','g')),false);
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
'''

s=fn('save_lesson')
s=s.replace('w jsonb; n integer:=0;', 'w jsonb; block jsonb; n integer:=0;')
needle=" keys:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_doc->'media_keys','[]')));"
s=s.replace(needle, ''' IF p_doc ? 'blocks' THEN
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
 keys:=public.content_media_keys(p_doc);''')
s=s.replace(' RETURN lid;', " IF p_doc ? 'blocks' THEN UPDATE public.lessons SET blocks=p_doc->'blocks' WHERE id=lid; END IF;\n RETURN lid;")
sql+=s+'\n'
s=fn('save_exam')
s=s.replace('q jsonb; keys text[];', "q jsonb; keys text[]; layout_doc jsonb:=p_doc->'layout';")
a=s.index(' FOR q IN SELECT');b=s.index(' SELECT version INTO ver',a)
s=s[:a]+''' IF octet_length(p_doc::text)>2000000 THEN RAISE EXCEPTION 'Đề quá lớn'; END IF;
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
''' +s[b:]
s=s.replace('INSERT INTO public.exam_versions VALUES(eid,ver,qs);', "INSERT INTO public.exam_versions(exam_id,version,questions,layout) VALUES(eid,ver,qs,CASE WHEN layout_doc IS NULL THEN NULL ELSE layout_doc||jsonb_build_object('root_media_keys',COALESCE(p_doc->'media_keys','[]')) END);")
s=s.replace(' INSERT INTO public.exam_versions', " UPDATE public.exams SET mode=COALESCE(layout_doc->>'mode','mock') WHERE id=eid;\n INSERT INTO public.exam_versions")
sql+=s+'\n'
s=fn('get_exam_document').replace("jsonb_build_object('questions',v.questions)", "jsonb_build_object('questions',v.questions)||CASE WHEN v.layout IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('layout',v.layout,'media_keys',v.layout->'root_media_keys') END")
sql+=s+'\n'
s=fn('start_exam').replace('qs jsonb;', 'qs jsonb; layout_doc jsonb;').replace('SELECT questions INTO qs FROM public.exam_versions', 'SELECT questions,layout INTO qs,layout_doc FROM public.exam_versions')
s=s.replace("'media_keys',e.media_keys)", "'media_keys',e.media_keys,'layout',layout_doc)").replace('now()+make_interval(mins=>e.duration_minutes)', "CASE WHEN layout_doc->>'mode'='practice' THEN NULL ELSE now()+make_interval(mins=>e.duration_minutes) END")
sql+=s+'\n'
s=fn('run_payload').replace("(r.snapshot-'questions')", "(r.snapshot-'questions'-'layout')")
s=s.replace("'questions',CASE", """'layout',CASE WHEN r.status='in_progress' AND r.snapshot->'layout' IS NOT NULL AND jsonb_typeof(r.snapshot->'layout')='object' THEN (r.snapshot->'layout')||jsonb_build_object('groups',(SELECT COALESCE(jsonb_agg(g-'transcript'),'[]') FROM jsonb_array_elements(r.snapshot->'layout'->'groups') g)) ELSE r.snapshot->'layout' END,
 'questions',CASE""")
s=s.replace("q-'answers'-'explanation'", "q-'answers'-'explanation'-'rubric'")
s=s.replace("ELSE r.snapshot->'questions' END", "ELSE (SELECT COALESCE(jsonb_agg(CASE WHEN public.is_linguanest_admin() THEN q ELSE q-'rubric' END),'[]') FROM jsonb_array_elements(r.snapshot->'questions') q) END")
sql+=s+'\n'
s=fn('submit_exam').replace('IF clock_timestamp()<r.deadline THEN', 'IF r.deadline IS NULL OR clock_timestamp()<r.deadline THEN')
a=s.index(" ELSIF q->>'kind'='choice'");b=s.index(' total:=',a)
s=s[:a]+" ELSE pts:=public.score_question_v4(q,response);\n END IF;\n"+s[b:]
sql+=s+'\n'
sql+='''
REVOKE ALL ON FUNCTION public.content_media_keys(jsonb), public.validate_question_v4(jsonb,boolean), public.answer_equal_v4(text,text,integer), public.score_question_v4(jsonb,text) FROM PUBLIC,anon,authenticated;
COMMIT;
'''
Path('supabase/004_structured_content.sql').write_text(sql,encoding='utf-8')
