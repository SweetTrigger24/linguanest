import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const admin = '00000000-0000-4000-8000-000000000001', member = '00000000-0000-4000-8000-000000000002', other = '00000000-0000-4000-8000-000000000003'
const lessonId = '11111111-1111-4111-8111-111111111111'
let db
async function asUser(id, sql, args = []) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id])
  await db.exec('SET ROLE authenticated')
  try { return await db.query(sql, args) } finally { await db.exec('RESET ROLE') }
}
const rpc = async (user, name, args = []) => (await asUser(user, `SELECT public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) AS result`, args)).rows[0].result
const exam = (type, overrides = {}) => ({ id: '', language_code: 'en', exam_type_id: type, lesson_id: null, title: 'Integration exam', description: '', duration_minutes: 30, status: 'published', version: 0, media_keys: [], questions: [
  { id: 'q1', kind: 'choice', section: 'Reading', prompt: 'Pick greeting', passage: 'Hello!', choices: ['Hello', 'Goodbye'], answers: ['0'], explanation: 'Greeting', points: 2 },
  { id: 'q2', kind: 'short', section: 'Listening', prompt: 'Write hello world', passage: '', choices: [], answers: ['hello world'], explanation: '', points: 3 },
  { id: 'q3', kind: 'essay', section: 'Writing', prompt: 'Introduce yourself', passage: '', choices: [], answers: [], explanation: 'Rubric', points: 5 },
], ...overrides })
test.before(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon,service_role;`)
  for (const name of ['001_schema.sql', '002_seed.sql', '003_learning_platform.sql', '004_structured_content.sql', '006_lesson_practice.sql', '007_study_status.sql', '008_profile_avatar.sql', '009_leaderboard.sql']) {
    let sql = await fs.readFile(new URL('../supabase/' + name, import.meta.url), 'utf8')
    // PGlite uses PostgreSQL's built-in gen_random_uuid; pgcrypto is not installed here.
    sql = sql.replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '')
    await db.exec(sql)
  }
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2),($3,$4),($5,$6)', [admin,'admin@example.com',member,'member@example.com',other,'other@example.com'])
  await db.exec(`UPDATE public.profiles SET is_active=true; UPDATE public.profiles SET role='admin' WHERE id='${admin}';`)
})
test.after(async () => { await db?.close() })

test('avatar keys are changed only by the Worker, isolated per user, and migration is repeatable', async () => {
  const key = `avatars/${member}/${crypto.randomUUID()}.png`, next = `avatars/${member}/${crypto.randomUUID()}.jpg`
  const swap = async (id, value) => {
    await db.exec('SET ROLE service_role')
    try { return (await db.query('SELECT public.replace_profile_avatar($1,$2) AS previous', [id, value])).rows[0].previous }
    finally { await db.exec('RESET ROLE') }
  }
  await assert.rejects(rpc(member, 'replace_profile_avatar', [member, key]), /permission denied/)
  await assert.rejects(rpc(admin, 'replace_profile_avatar', [member, key]), /permission denied/)
  await assert.rejects(asUser(member, 'UPDATE public.profiles SET avatar_key=$1 WHERE id=$2', [key, member]), /permission denied/)
  assert.equal(await swap(member, key), null)
  assert.equal((await asUser(member, 'SELECT avatar_key FROM public.profiles WHERE id=$1', [member])).rows[0].avatar_key, key)
  assert.equal((await asUser(other, 'SELECT avatar_key FROM public.profiles WHERE id=$1', [member])).rows.length, 0)
  await assert.rejects(swap(other, key), /không hợp lệ/)
  assert.equal(await swap(member, next), key)
  await db.exec(await fs.readFile(new URL('../supabase/008_profile_avatar.sql', import.meta.url), 'utf8'))
  assert.equal((await db.query('SELECT avatar_key FROM public.profiles WHERE id=$1', [member])).rows[0].avatar_key, next)
  await db.query('UPDATE public.profiles SET must_change_password=true WHERE id=$1', [member])
  await assert.rejects(swap(member, null), /không có quyền/)
  await db.query('UPDATE public.profiles SET must_change_password=false,is_active=false WHERE id=$1', [member])
  await assert.rejects(swap(member, null), /không có quyền/)
  await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1', [member])
  assert.equal(await swap(member, null), next)
})

test('migration preserves lesson quizzes and closes direct answer/score access', async () => {
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM public.exams')).rows[0].n, 12)
  assert.equal((await asUser(member, 'SELECT count(*)::integer AS n FROM public.lessons')).rows[0].n, 12)
  for (const table of ['exam_versions', 'exam_runs', 'exercises', 'quiz_attempts', 'flashcard_reviews']) await assert.rejects(asUser(member, `SELECT * FROM public.${table}`), /permission denied/)
  await assert.rejects(asUser(member, "UPDATE public.profiles SET role='admin' WHERE id=$1", [member]), /permission denied/)
  await assert.rejects(asUser(member, 'INSERT INTO public.user_progress(user_id,lesson_id,xp) VALUES($1,$2,100)', [member,lessonId]), /permission denied/)
  await rpc(member, 'update_my_profile', ['My updated name'])
  assert.equal((await asUser(member, 'SELECT display_name FROM public.profiles WHERE id=$1', [member])).rows[0].display_name, 'My updated name')
  assert.equal((await asUser(member, 'SELECT * FROM public.profiles WHERE id=$1', [other])).rows.length, 0)
  await assert.rejects(rpc(member, 'member_summaries'), /Chỉ quản trị/)
})
test('new signups remain inactive; locked and forced-password accounts cannot access content or RPCs', async () => {
  const unapproved='00000000-0000-4000-8000-000000000004'
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [unapproved,'stranger@example.com'])
  assert.equal((await asUser(unapproved,'SELECT * FROM public.lessons')).rows.length,0)
  await assert.rejects(rpc(unapproved,'learning_summary'),/Không có quyền/)
  await db.query('UPDATE public.profiles SET must_change_password=true WHERE id=$1',[other])
  assert.equal((await asUser(other,'SELECT * FROM public.exam_types')).rows.length,0)
  await assert.rejects(rpc(other,'learning_summary'),/Không có quyền/)
  await db.query('UPDATE public.profiles SET must_change_password=false,is_active=false WHERE id=$1',[other])
  assert.equal((await asUser(other,'SELECT * FROM public.lessons')).rows.length,0)
  await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[other])
})
test('server grading, revisions, snapshot preservation, authorization and idempotent submit', async () => {
  const type = (await db.query("SELECT id FROM public.exam_types WHERE language_code='en' AND name='IELTS'")).rows[0].id
  const doc = exam(type), id = await rpc(admin, 'save_exam', [doc])
  await assert.rejects(rpc(member,'get_exam_document',[id]), /Chỉ quản trị/)
  await assert.rejects(rpc(member,'save_exam',[doc]), /Chỉ quản trị/)
  let run = await rpc(member,'start_exam',[id])
  assert.equal(run.questions[0].answers, undefined); assert.equal(run.questions[0].explanation, undefined)
  assert.equal((await rpc(member,'start_exam',[id])).id, run.id)
  await assert.rejects(rpc(other,'get_exam_run',[run.id]),/Không tìm thấy/)
  await rpc(admin, 'save_exam', [{ ...doc, id, version: 1, questions: doc.questions.map(q => q.id==='q1'?{...q,answers:['1']}:q) }])
  await assert.rejects(rpc(admin, 'save_exam', [{ ...doc, id, version: 1 }]), /Đề đã được sửa/)
  assert.equal((await rpc(member,'get_exam_run',[run.id])).version, 1)
  const responses = { q1: '0', q2: '  HELLO   world ', q3: 'My name is Linh.' }
  assert.equal(await rpc(member,'save_exam_responses',[run.id,responses,0]),1)
  await assert.rejects(rpc(member,'save_exam_responses',[run.id,responses,0]),/thiết bị khác/)
  await assert.rejects(rpc(other,'submit_exam',[run.id,responses,1]),/Không tìm thấy/)
  run=await rpc(member,'submit_exam',[run.id,responses,1])
  assert.equal(run.status,'pending_review'); assert.equal(run.score,5); assert.equal(run.max_score,10)
  assert.equal(run.questions[0].answers[0],'0'); assert.equal(run.responses.q3,responses.q3)
  assert.equal((await rpc(member,'submit_exam',[run.id,{},0])).score,5)
  await assert.rejects(rpc(member,'grade_exam',[run.id,{q3:{score:5,feedback:'self'}}]),/Chỉ quản trị/)
  await assert.rejects(rpc(admin,'grade_exam',[run.id,{q3:{score:6,feedback:'invalid'}}]),/không hợp lệ/)
  run=await rpc(admin,'grade_exam',[run.id,{q3:{score:4,feedback:'Good work'}}])
  assert.equal(run.status,'graded'); assert.equal(run.score,9)
  assert.equal((await rpc(member,'learning_summary')).xp,45)
  await assert.rejects(rpc(admin,'grade_exam',[run.id,{q3:{score:3}}]),/không còn chờ chấm/)
  assert.equal((await rpc(member,'list_exam_runs',[0,false]))[0].grades.q3.feedback,'Good work')
  await assert.rejects(rpc(member,'list_exam_runs',[0,true]),/Không có quyền/)
})
test('deadline uses saved answers, ignores late modifications and rejects further saves', async () => {
  const type=(await db.query("SELECT id FROM public.exam_types WHERE language_code='en' LIMIT 1")).rows[0].id
  const doc=exam(type,{questions:[exam(type).questions[0]]}), id=await rpc(admin,'save_exam',[doc]), run=await rpc(member,'start_exam',[id])
  await rpc(member,'save_exam_responses',[run.id,{q1:'0'},0])
  await db.query("UPDATE public.exam_runs SET deadline=now()-interval '1 second' WHERE id=$1",[run.id])
  await assert.rejects(rpc(member,'save_exam_responses',[run.id,{q1:'1'},1]),/hết giờ/)
  const result=await rpc(member,'submit_exam',[run.id,{q1:'1'},1])
  assert.equal(result.responses.q1,'0'); assert.equal(result.score,2)
})
test('lesson CRUD saves atomically, hides drafts, and awards completion only once', async () => {
  const course=(await db.query("SELECT id FROM public.courses WHERE language_code='en'")).rows[0].id
  const doc={ id:'',course_id:course,title:'New lesson',status:'draft',media_keys:[] }, words=[{id:crypto.randomUUID(),term:'hello',meaning:'xin chào'}]
  const id=await rpc(admin,'save_lesson',[doc,words])
  assert.equal((await asUser(member,'SELECT id FROM public.lessons WHERE id=$1',[id])).rows.length,0)
  await assert.rejects(rpc(member,'complete_lesson',[id]),/Không thể/)
  await rpc(admin,'save_lesson',[{...doc,id,status:'published'},words])
  await rpc(member,'complete_lesson',[id]); await rpc(member,'complete_lesson',[id])
  assert.equal((await db.query('SELECT count(*)::integer n FROM public.user_progress WHERE user_id=$1 AND lesson_id=$2',[member,id])).rows[0].n,1)
  await assert.rejects(rpc(admin,'save_lesson',[{...doc,id,title:'Should rollback'},[{id:crypto.randomUUID(),term:'',meaning:'bad'}]]),/không được trống/)
  assert.equal((await db.query('SELECT title FROM public.lessons WHERE id=$1',[id])).rows[0].title,'New lesson')
  await rpc(admin,'save_lesson',[{...doc,id,status:'archived'},[]])
  assert.equal((await asUser(member,'SELECT id FROM public.lessons WHERE id=$1',[id])).rows.length,0)
  assert.equal((await db.query('SELECT count(*)::integer n FROM public.user_progress WHERE lesson_id=$1',[id])).rows[0].n,1)
})
test('media follows published content, retains attempt attachments and prevents unsafe deletion', async () => {
  const key=`files/${crypto.randomUUID()}.mp3`, type=(await db.query("SELECT id FROM public.exam_types WHERE language_code='en' LIMIT 1")).rows[0].id
  await db.query('INSERT INTO public.media_files(key,filename,content_type,size) VALUES($1,$2,$3,100)',[key,'test.mp3','audio/mpeg'])
  const can=async user=>(await db.query('SELECT public.can_access_media_for($1,$2) AS ok',[user,key])).rows[0].ok
  assert.equal(await can(member),false); assert.equal(await can(admin),true)
  const doc=exam(type,{media_keys:[key],status:'draft'}), id=await rpc(admin,'save_exam',[doc])
  assert.equal(await can(member),false)
  await rpc(admin,'save_exam',[{...doc,id,version:1,status:'published'}]); assert.equal(await can(member),true)
  const run=await rpc(member,'start_exam',[id])
  await rpc(admin,'save_exam',[{...doc,id,version:2,status:'archived',media_keys:[]}])
  assert.equal(await can(other),false); assert.equal(await can(member),true)
  await assert.rejects(db.query('SELECT public.reserve_media_delete($1)',[key]),/lịch sử/)
  await assert.rejects(rpc(member,'can_access_media_for',[member,key]),/permission denied/)
  await assert.rejects(rpc(member,'reserve_media_delete',[key]),/permission denied/)
  assert.equal((await rpc(member,'get_exam_run',[run.id])).media_keys[0],key)
  const unused=`files/${crypto.randomUUID()}.pdf`
  await db.query('INSERT INTO public.media_files(key,filename,content_type,size) VALUES($1,$2,$3,100)',[unused,'unused.pdf','application/pdf'])
  await db.query('SELECT public.reserve_media_delete($1)',[unused])
  await assert.rejects(rpc(admin,'save_exam',[exam(type,{media_keys:[unused]})]),/đang được xóa/)
})
test('XP aggregates every historical attempt, independently of the 20-row history page', async () => {
  const before=await rpc(member,'learning_summary')
  const lesson=(await db.query('SELECT id FROM public.lessons LIMIT 1')).rows[0].id
  await db.query('INSERT INTO public.quiz_attempts(user_id,lesson_id,correct_count,total_count) SELECT $1,$2,2,3 FROM generate_series(1,205)',[member,lesson])
  const after=await rpc(member,'learning_summary')
  assert.equal(after.xp-before.xp,2050); assert.equal(after.legacy_count-before.legacy_count,205)
  assert.equal((await rpc(admin,'member_summaries')).find(s=>s.id===member).xp,after.xp)
})
test('server rejects malformed questions and responses', async () => {
  const type=(await db.query("SELECT id FROM public.exam_types WHERE language_code='en' LIMIT 1")).rows[0].id
  const doc=exam(type)
  await assert.rejects(rpc(admin,'save_exam',[{...doc,questions:[{...doc.questions[0],answers:['8']}]}]),/ngoài phạm vi/)
  await assert.rejects(rpc(admin,'save_exam',[{...doc,questions:[]}]),/1–200/)
  await assert.rejects(rpc(admin,'save_exam',[{...doc,questions:[doc.questions[0],doc.questions[0]]}]),/trùng/)
  const id=await rpc(admin,'save_exam',[doc]),r=await rpc(member,'start_exam',[id])
  await assert.rejects(rpc(member,'save_exam_responses',[r.id,{q999:'fake'},0]),/không hợp lệ/)
  await assert.rejects(rpc(member,'save_exam_responses',[r.id,{q1:4},0]),/không hợp lệ/)
})

test('structured exams protect transcripts and rubrics, grade compound answers, preserve layout and nested media', async () => {
  const type=(await db.query("SELECT id FROM public.exam_types WHERE name='IELTS' LIMIT 1")).rows[0].id
  const key=`files/${crypto.randomUUID()}.mp3`
  await db.query('INSERT INTO public.media_files(key,filename,content_type,size) VALUES($1,$2,$3,100)',[key,'group.mp3','audio/mpeg'])
  const layout={mode:'practice',sections:[{id:'s1',title:'Listening',instructions:'Listen',media_keys:[]}],groups:[{id:'g1',section_id:'s1',title:'Conversation',passage:'Shared source',transcript:'PRIVATE TRANSCRIPT',media_keys:[key]}]}
  const questions=[
    {id:'multi',kind:'multi',group_id:'g1',prompt:'Select two',points:2,choices:['A','B','C'],answers:['0','2']},
    {id:'gaps',kind:'gaps',group_id:'g1',prompt:'Fill {{1}} and {{2}}',points:4,choices:[],slots:['City','Color'],answers:['ha noi|hanoi','blue'],word_limit:2},
    {id:'match',kind:'matching',group_id:'g1',prompt:'Match',points:2,choices:['A','B'],slots:['One','Two'],answers:['2','1']},
    {id:'essay',kind:'essay',group_id:'g1',prompt:'Write',points:5,choices:[],answers:[],explanation:'SAMPLE',rubric:'ADMIN RUBRIC'},
  ]
  const doc=exam(type,{layout,questions}),id=await rpc(admin,'save_exam',[doc])
  const adminDoc=await rpc(admin,'get_exam_document',[id]);assert.equal(adminDoc.layout.groups[0].transcript,'PRIVATE TRANSCRIPT');assert.deepEqual(adminDoc.media_keys,[])
  let r=await rpc(member,'start_exam',[id]);assert.equal(r.deadline,null);assert.equal(r.layout.groups[0].transcript,undefined);assert.equal(r.questions[3].rubric,undefined);assert.ok(r.media_keys.includes(key))
  const responses={multi:'["2","0"]',gaps:'["  HA NOI  ","red"]',match:'["2","1"]',essay:'My answer'}
  r=await rpc(member,'submit_exam',[r.id,responses,0]);assert.equal(r.score,6);assert.equal(r.grades.gaps.score,2);assert.equal(r.status,'pending_review');assert.equal(r.layout.groups[0].transcript,'PRIVATE TRANSCRIPT');assert.equal(r.questions[3].rubric,undefined)
  assert.equal((await rpc(admin,'get_exam_run',[r.id])).questions[3].rubric,'ADMIN RUBRIC')
  await rpc(admin,'save_exam',[{...doc,id,version:1,layout:{...layout,groups:[{...layout.groups[0],transcript:'CHANGED',media_keys:[]}]}}])
  assert.equal((await rpc(member,'get_exam_run',[r.id])).layout.groups[0].transcript,'PRIVATE TRANSCRIPT')
  await assert.rejects(db.query('SELECT public.reserve_media_delete($1)',[key]),/lịch sử/)
  for(const [q,value] of [[questions[0],'["0","0"]'],[questions[0],'[0,2]'],[questions[1],'["ha noi extra","red"]'],[questions[2],'not json']])assert.equal((await db.query('SELECT public.score_question_v4($1,$2) AS score',[q,value])).rows[0].score,0)
  await assert.rejects(rpc(member,'score_question_v4',[questions[0],'["0","2"]']),/permission denied/)
})

test('drafts save incomplete questions but publishing validates groups, answers and per-item points', async () => {
  const type=(await db.query("SELECT id FROM public.exam_types WHERE language_code='en' LIMIT 1")).rows[0].id
  const doc=exam(type,{status:'draft',questions:[{id:'blank',kind:'choice',prompt:'',points:1,choices:['',''],answers:[]}]})
  const id=await rpc(admin,'save_exam',[doc]);assert.ok(id)
  await assert.rejects(rpc(admin,'save_exam',[{...doc,id,version:1,status:'published'}]),/Thiếu nội dung/)
  const bad=exam(type,{questions:[{id:'g',kind:'gaps',prompt:'Fill',points:3,slots:['1','2'],answers:['a','b'],choices:[]}]})
  await assert.rejects(rpc(admin,'save_exam',[bad]),/không hợp lệ/)
  await assert.rejects(rpc(admin,'save_exam',[{...doc,layout:{mode:'practice',sections:[],groups:[]}}]),/nhóm/)
})

test('lesson blocks persist safely and nested media participates in authorization/deletion', async () => {
  const course=(await db.query('SELECT id FROM public.courses LIMIT 1')).rows[0].id,key=`files/${crypto.randomUUID()}.png`
  await db.query('INSERT INTO public.media_files(key,filename,content_type,size) VALUES($1,$2,$3,100)',[key,'diagram.png','image/png'])
  const blocks=[{id:'formula',kind:'formula',title:'Present simple',body:'S + V(s/es)'},{id:'media',kind:'media',title:'Diagram',body:'',media_keys:[key]}]
  const id=await rpc(admin,'save_lesson',[{id:'',course_id:course,title:'Grammar',status:'published',blocks},[]])
  const row=(await asUser(member,'SELECT blocks,media_keys FROM public.lessons WHERE id=$1',[id])).rows[0]
  assert.deepEqual(row.blocks,blocks);assert.ok(row.media_keys.includes(key))
  assert.equal((await db.query('SELECT public.can_access_media_for($1,$2) ok',[member,key])).rows[0].ok,true)
  await assert.rejects(db.query('SELECT public.reserve_media_delete($1)',[key]),/bài học/)
})

test('legacy Storage migration still protects previously used buckets',async()=>{
  await db.exec(`CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role; GRANT ALL ON storage.objects TO anon,authenticated,service_role;
    CREATE POLICY broad_existing_policy ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);`)
  await db.exec(await fs.readFile(new URL('../supabase/005_private_storage.sql',import.meta.url),'utf8'))
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('linguanest-media','secret.mp3'),('other','public.png')")
  assert.equal((await asUser(member,"SELECT * FROM storage.objects WHERE bucket_id='linguanest-media'")).rows.length,0)
  assert.equal((await asUser(admin,"SELECT * FROM storage.objects WHERE bucket_id='linguanest-media'")).rows.length,0)
  assert.equal((await asUser(member,"SELECT * FROM storage.objects WHERE bucket_id='other'")).rows.length,1)
  await assert.rejects(asUser(member,"INSERT INTO storage.objects(bucket_id,name) VALUES('linguanest-media','bad.mp3')"),/row-level security/)
  await db.exec('SET ROLE service_role')
  try {assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='linguanest-media'")).rows.length,1)} finally {await db.exec('RESET ROLE')}
  assert.equal((await db.query("SELECT public FROM storage.buckets WHERE id='linguanest-media'")).rows[0].public,false)
})


const practiceQuestion = (patch={}) => ({id:'p1',kind:'short',section:'Practice',prompt:'One child, two {{blank}}.',passage:'',choices:[],answers:['children','kids'],points:1,hint:'irregular plural',explanation:'Child has an irregular plural.',max_attempts:2,...patch})
async function practiceFixture(questions=[practiceQuestion()]) {
  const course=(await db.query('SELECT id FROM public.courses LIMIT 1')).rows[0].id
  const lesson={id:'',course_id:course,title:'Practice lesson',status:'published',blocks:[{id:'theory',kind:'text',title:'Theory',body:'Grammar'}]}
  const doc={version:0,questions,enabled:true,media_keys:[]}
  const id=await rpc(admin,'save_lesson_bundle',[lesson,[],doc]);lesson.id=id
  return {id,lesson,doc}
}
test('lesson practice migration preserves source exams, snapshots and is repeatable',async()=>{
  assert.ok((await db.query('SELECT count(*)::int n FROM public.lesson_practices')).rows[0].n>=12)
  const old=(await db.query('SELECT source_exam_id FROM public.lesson_practices WHERE source_exam_id IS NOT NULL LIMIT 1')).rows[0].source_exam_id
  await assert.rejects(rpc(member,'start_exam',[old]),/chuyển vào Bài học/)
  await assert.rejects(rpc(admin,'save_exam',[{id:old}]),/sửa bài tập/)
  const before=(await db.query('SELECT count(*)::int n FROM public.exams')).rows[0].n
  const {id,lesson,doc}=await practiceFixture()
  const run=await rpc(member,'start_lesson_practice',[id])
  await rpc(admin,'save_lesson_bundle',[lesson,[],{...doc,version:1,questions:[practiceQuestion({answers:['new answer']})]}])
  await db.exec(await fs.readFile(new URL('../supabase/006_lesson_practice.sql',import.meta.url),'utf8'))
  assert.equal((await db.query('SELECT count(*)::int n FROM public.exams')).rows[0].n,before)
  assert.deepEqual((await rpc(admin,'get_lesson_practice',[id])).questions[0].answers,['new answer'])
  const result=await rpc(member,'check_practice_answer',[run.id,'p1','children',0,false])
  assert.equal(result.checks.p1.correct,true);assert.deepEqual(result.questions[0].answers,['children','kids'])
})

test('converting an unlinked legacy exercise retains old submitted and active exam attempts',async()=>{
  const type=(await db.query("SELECT id FROM public.exam_types WHERE language_code='en' AND name='Bài tập'")).rows[0].id
  const eid=await rpc(admin,'save_exam',[exam(type,{questions:[practiceQuestion()]})])
  const completed=await rpc(member,'start_exam',[eid])
  const result=await rpc(member,'submit_exam',[completed.id,{p1:'children'},completed.revision])
  const active=await rpc(other,'start_exam',[eid])
  const {id,lesson,doc}=await practiceFixture()
  await rpc(admin,'save_lesson_bundle',[lesson,[],{...doc,version:1,source_exam_id:eid}])
  assert.equal((await rpc(admin,'get_lesson_practice',[id])).source_exam_id,eid)
  await assert.rejects(rpc(member,'start_exam',[eid]),/chuyển vào Bài học/)
  const xp=(await rpc(member,'learning_summary')).xp
  await db.exec(await fs.readFile(new URL('../supabase/006_lesson_practice.sql',import.meta.url),'utf8'))
  assert.equal((await rpc(member,'get_exam_run',[completed.id])).score,result.score)
  assert.equal((await rpc(member,'learning_summary')).xp,xp)
  const submitted=await rpc(other,'submit_exam',[active.id,{p1:'kids'},active.revision])
  assert.equal(submitted.score,1)
  assert.ok((await rpc(member,'list_exam_runs',[0,false])).some(r=>r.id===completed.id))
})
test('practice RLS, administrative atomic save, validation and revision guard',async()=>{
  const {id,lesson,doc}=await practiceFixture()
  for(const table of ['lesson_practices','lesson_practice_runs']) await assert.rejects(asUser(member,`SELECT * FROM public.${table}`),/permission denied/)
  await assert.rejects(rpc(member,'get_lesson_practice',[id]),/quản trị/)
  await assert.rejects(rpc(member,'save_lesson_bundle',[lesson,[],{...doc,version:1}]),/quản trị/)
  await assert.rejects(rpc(admin,'save_lesson_bundle',[{...lesson,title:'Should rollback'},[],{...doc,version:1,questions:[practiceQuestion({answers:[]})]}]),/đáp án/)
  assert.equal((await db.query('SELECT title FROM public.lessons WHERE id=$1',[id])).rows[0].title,'Practice lesson')
  await assert.rejects(rpc(admin,'save_lesson_bundle',[lesson,[],doc]),/sửa ở nơi khác/)
  await assert.rejects(rpc(admin,'save_lesson_bundle',[lesson,[],{...doc,version:1,questions:[practiceQuestion({max_attempts:0})]}]),/Cấu hình/)
  await rpc(admin,'save_lesson_bundle',[lesson,[],{...doc,version:1,questions:[]}])
  await assert.rejects(rpc(member,'start_lesson_practice',[id]),/chưa có luyện tập/)
  await rpc(admin,'save_lesson_bundle',[{...lesson,status:'draft'},[],{...doc,version:2}])
  await assert.rejects(rpc(member,'start_lesson_practice',[id]),/chưa xuất bản/)
})
test('practice checks normalize only configured alternatives, hide answers and enforce attempts',async()=>{
  const {id}=await practiceFixture([practiceQuestion(),practiceQuestion({id:'p2',kind:'choice',prompt:'Article?',choices:['a','an'],answers:['1'],reveal_mode:'after_check'})])
  let r=await rpc(member,'start_lesson_practice',[id]);assert.equal((await rpc(member,'start_lesson_practice',[id])).id,r.id)
  assert.equal(r.questions[0].answers,undefined);assert.equal(r.questions[0].explanation,undefined);assert.equal(r.questions[0].hint,'irregular plural')
  await assert.rejects(rpc(other,'get_practice_run',[r.id]),/Không tìm thấy/)
  await assert.rejects(rpc(other,'check_practice_answer',[r.id,'p1','children',0,false]),/kết thúc/)
  r=await rpc(member,'check_practice_answer',[r.id,'p1','childs',r.revision,false])
  assert.equal(r.checks.p1.correct,false);assert.equal(r.checks.p1.tries,1);assert.equal(r.questions[0].answers,undefined)
  await assert.rejects(rpc(member,'check_practice_answer',[r.id,'p1','kids',0,false]),/thiết bị khác/)
  r=await rpc(member,'check_practice_answer',[r.id,'p1','  KIDS  ',r.revision,false])
  assert.equal(r.checks.p1.correct,true);assert.equal(r.checks.p1.locked,true);assert.equal(r.questions[0].explanation,'Child has an irregular plural.')
  r=await rpc(member,'check_practice_answer',[r.id,'p1','wrong',r.revision,false]);assert.equal(r.responses.p1,'  KIDS  ')
  r=await rpc(member,'check_practice_answer',[r.id,'p2','0',r.revision,false]);assert.equal(r.checks.p2.correct,false);assert.deepEqual(r.questions[1].answers,['1'])
  const xp=(await rpc(member,'learning_summary')).xp
  r=await rpc(member,'finish_practice',[r.id,{p1:'wrong',p2:'1'},r.revision]);assert.equal(r.status,'completed');assert.equal(r.checks.p2.correct,false)
  assert.equal((await rpc(member,'finish_practice',[r.id,{},0])).revision,r.revision)
  assert.equal((await rpc(member,'learning_summary')).xp,xp)
  assert.notEqual((await rpc(member,'start_lesson_practice',[id])).id,r.id)
  assert.equal((await rpc(other,'practice_history',[id])).length,0)
  assert.equal((await rpc(member,'practice_history',[id])).length,2)
})
test('practice persistence, per-slot scoring, explicit reveal and final submit',async()=>{
  const qs=[practiceQuestion({kind:'gaps',slots:['City','Color'],answers:['hanoi|ha noi','blue'],points:2,word_limit:2}),practiceQuestion({id:'p2'}),practiceQuestion({id:'p3',kind:'multi',choices:['A','B','C'],answers:['0','2'],points:2}),practiceQuestion({id:'p4',kind:'essay',answers:[],rubric:'private'})]
  const {id}=await practiceFixture(qs);let r=await rpc(member,'start_lesson_practice',[id])
  r=await rpc(member,'save_practice_answers',[r.id,{p1:JSON.stringify([' HA   NOI ','red']),p3:JSON.stringify(['0','2'])},r.revision]);assert.equal(r.revision,1)
  assert.equal((await rpc(member,'get_practice_run',[r.id])).responses.p3,JSON.stringify(['0','2']))
  r=await rpc(member,'check_practice_answer',[r.id,'p1',r.responses.p1,r.revision,false]);assert.deepEqual(r.checks.p1.slot_correct,[true,false]);assert.equal(r.checks.p1.score,1)
  r=await rpc(member,'check_practice_answer',[r.id,'p2','children',r.revision,true]);assert.equal(r.checks.p2.score,0);assert.equal(r.checks.p2.revealed,true)
  r=await rpc(member,'finish_practice',[r.id,{...r.responses,p4:'My answer'},r.revision]);assert.equal(r.checks.p3.correct,true);assert.equal(r.checks.p4.correct,null);assert.equal(r.questions[3].rubric,undefined)
})
test('practice media is retained by active documents and historical snapshots',async()=>{
  const key=`files/${crypto.randomUUID()}.mp3`
  await db.query('INSERT INTO public.media_files(key,filename,content_type,size) VALUES($1,$2,$3,100)',[key,'listening.mp3','audio/mpeg'])
  const {id,lesson,doc}=await practiceFixture([practiceQuestion({media_keys:[key]})]);let run=await rpc(member,'start_lesson_practice',[id])
  assert.equal((await db.query('SELECT public.can_access_media_for($1,$2) ok',[member,key])).rows[0].ok,true)
  await rpc(admin,'save_lesson_bundle',[{...lesson,status:'archived'},[],{...doc,version:1,questions:[]}])
  assert.equal((await db.query('SELECT public.can_access_media_for($1,$2) ok',[other,key])).rows[0].ok,false)
  assert.equal((await db.query('SELECT public.can_access_media_for($1,$2) ok',[member,key])).rows[0].ok,true)
  await assert.rejects(db.query('SELECT public.reserve_media_delete($1)',[key]),/lịch sử/)
  await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[member])
  await assert.rejects(rpc(member,'get_practice_run',[run.id]),/Không có quyền/)
  assert.equal((await db.query('SELECT public.can_access_media_for($1,$2) ok',[member,key])).rows[0].ok,false)
  await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[member])
})

test('reading status is personal, idempotent and separate from completion and XP',async()=>{
  const {id}=await practiceFixture()
  const before=await rpc(member,'learning_summary')
  await rpc(member,'begin_lesson',[id]);await rpc(member,'begin_lesson',[id])
  const after=await rpc(member,'learning_summary'), status=after.lesson_status.find(s=>s.lesson_id===id)
  assert.equal(status.completed_runs,0);assert.equal(status.score,null);assert.equal(status.active_run,false)
  assert.equal(after.xp,before.xp);assert.equal(after.progress.length,before.progress.length)
  assert.equal((await db.query('SELECT count(*)::int n FROM public.lesson_study_starts WHERE user_id=$1 AND lesson_id=$2',[member,id])).rows[0].n,1)
  assert.equal((await rpc(other,'learning_summary')).lesson_status.some(s=>s.lesson_id===id),false)
  await assert.rejects(asUser(member,'SELECT * FROM public.lesson_study_starts'),/permission denied/)
  await assert.rejects(asUser(member,'INSERT INTO public.lesson_study_starts(user_id,lesson_id) VALUES($1,$2)',[other,id]),/permission denied/)
  await db.query('UPDATE public.profiles SET must_change_password=true WHERE id=$1',[other])
  await assert.rejects(rpc(other,'begin_lesson',[id]),/Không có quyền/)
  await assert.rejects(rpc(other,'lesson_study_status'),/Không có quyền/)
  await db.query('UPDATE public.profiles SET must_change_password=false WHERE id=$1',[other])
})

test('study summary uses latest completed snapshot score, retains it during a retake and includes zero',async()=>{
  const {id,lesson,doc}=await practiceFixture()
  let r=await rpc(member,'start_lesson_practice',[id])
  assert.equal((await rpc(member,'learning_summary')).lesson_status.find(s=>s.lesson_id===id).active_run,true)
  await rpc(member,'finish_practice',[r.id,{p1:'children'},r.revision])
  await rpc(admin,'save_lesson_bundle',[lesson,[],{...doc,version:1,questions:[practiceQuestion({points:10})]}])
  r=await rpc(member,'start_lesson_practice',[id])
  let status=(await rpc(member,'learning_summary')).lesson_status.find(s=>s.lesson_id===id)
  assert.equal(status.score,1);assert.equal(status.max_score,1);assert.equal(status.active_run,true)
  await rpc(member,'finish_practice',[r.id,{p1:'wrong'},r.revision])
  status=(await rpc(member,'learning_summary')).lesson_status.find(s=>s.lesson_id===id)
  assert.equal(status.score,0);assert.equal(status.max_score,10);assert.equal(status.completed_runs,2);assert.equal(status.active_run,false)
  await db.exec(await fs.readFile(new URL('../supabase/007_study_status.sql',import.meta.url),'utf8'))
  assert.deepEqual((await rpc(member,'learning_summary')).lesson_status.find(s=>s.lesson_id===id),status)
})

test('exam history filters exercises before pagination; old linked/unlinked results remain accessible in lessons',async()=>{
  const user='00000000-0000-4000-8000-000000000030'
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[user,'study-history@example.com'])
  await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[user])
  const types=(await db.query("SELECT id,name FROM public.exam_types WHERE language_code='en'")).rows
  const cert=await rpc(admin,'save_exam',[exam(types.find(t=>t.name==='IELTS').id,{questions:[practiceQuestion()]})])
  let r=await rpc(user,'start_exam',[cert]);await rpc(user,'submit_exam',[r.id,{p1:'children'},r.revision])
  const certRun=r.id
  const old=await rpc(admin,'save_exam',[exam(types.find(t=>t.name==='Bài tập').id,{questions:[practiceQuestion()]})])
  for(let i=0;i<21;i++){r=await rpc(user,'start_exam',[old]);await rpc(user,'submit_exam',[r.id,{p1:'kids'},r.revision])}
  assert.deepEqual((await rpc(user,'exam_history',[0])).map(r=>r.id),[certRun])
  assert.equal((await rpc(user,'exam_history',[20])).length,0)
  assert.equal((await rpc(user,'lesson_exam_history',[null,0])).length,20)
  assert.equal((await rpc(user,'lesson_exam_history',[null,20])).length,1)
  const personal=await rpc(user,'learning_summary');assert.equal(personal.dedicated_exam_count,1);assert.equal(personal.exam_xp,5);assert.equal(personal.xp,110)
  const {id,lesson,doc}=await practiceFixture()
  await rpc(admin,'save_lesson_bundle',[lesson,[],{...doc,version:1,source_exam_id:old}])
  assert.equal((await rpc(user,'lesson_exam_history',[null,0])).length,0)
  assert.equal((await rpc(user,'lesson_exam_history',[id,20])).length,1)
  assert.equal((await rpc(user,'learning_summary')).lesson_status.find(s=>s.lesson_id===id).completed_runs,21)
  assert.equal((await rpc(other,'lesson_exam_history',[id,0])).length,0)
  assert.equal((await rpc(user,'get_exam_run',[r.id])).score,1)
})
test('group leaderboard matches total XP, ranks ties, includes zero XP and shares only summary fields', async () => {
  const first='00000000-0000-4000-8000-000000000100',tie='00000000-0000-4000-8000-000000000101',zero='00000000-0000-4000-8000-000000000102',locked='00000000-0000-4000-8000-000000000103',forced='00000000-0000-4000-8000-000000000104'
  for(const id of [first,tie,zero,locked,forced]) await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,id+'@example.com'])
  await db.query("UPDATE public.profiles SET is_active=true,display_name='Equal XP' WHERE id=ANY($1::uuid[])",[[first,tie,zero,forced]])
  await db.query('UPDATE public.profiles SET must_change_password=true WHERE id=$1',[forced])
  const key=`avatars/${first}/${crypto.randomUUID()}.png`
  await db.query('UPDATE public.profiles SET avatar_key=$1 WHERE id=$2',[key,first])
  const existingLesson=(await db.query('SELECT id FROM public.lessons LIMIT 1')).rows[0].id
  await db.query('INSERT INTO public.user_progress(user_id,lesson_id,xp) VALUES($1,$2,20)',[first,existingLesson])
  await db.query('INSERT INTO public.quiz_attempts(user_id,lesson_id,correct_count,total_count) VALUES($1,$2,8,3)',[first,existingLesson])
  const examId=(await db.query('SELECT id FROM public.exams LIMIT 1')).rows[0].id
  await db.query("INSERT INTO public.exam_runs(user_id,exam_id,snapshot,status,deadline,score,max_score) SELECT $1,$2,'{}','graded',now(),2,100 FROM generate_series(1,25)",[first,examId])
  await db.query("INSERT INTO public.exam_runs(user_id,exam_id,snapshot,status,deadline,score,max_score) VALUES($1,$2,'{}','pending_review',now(),100,100),($3,$2,'{}','graded',now(),57,100)",[first,examId,tie])
  const rows=await rpc(member,'xp_leaderboard'),a=rows.find(row=>row.id===first),b=rows.find(row=>row.id===tie)
  assert.equal(a.xp,285);assert.equal(b.xp,285);assert.equal(a.rank,b.rank);assert.equal(a.avatar_key,key)
  assert.ok(rows.findIndex(row=>row.id===first)<rows.findIndex(row=>row.id===tie))
  assert.equal(rows.find(row=>row.id===zero).xp,0)
  assert.ok(rows.some(row=>row.id===admin),'active administrators also participate')
  assert.equal(rows.some(row=>[locked,forced].includes(row.id)),false)
  for(let i=0;i<rows.length;i++) {
    assert.deepEqual(Object.keys(rows[i]).sort(),['avatar_key','display_name','id','rank','xp'])
    if(i)assert.ok(rows[i-1].xp>=rows[i].xp)
    assert.equal(rows[i].rank,new Set(rows.filter(row=>row.xp>rows[i].xp).map(row=>row.xp)).size+1)
    assert.equal(rows[i].xp,(await rpc(rows[i].id,'learning_summary')).xp)
  }
  await assert.rejects(rpc(locked,'xp_leaderboard'),/Không có quyền/)
  await assert.rejects(rpc(forced,'xp_leaderboard'),/Không có quyền/)
  await db.exec('SET ROLE anon')
  try { await assert.rejects(db.query('SELECT public.xp_leaderboard()'),/permission denied/) } finally { await db.exec('RESET ROLE') }
  await assert.rejects(asUser(member,'SELECT * FROM public.exam_runs WHERE user_id=$1',[first]),/permission denied/)
  assert.equal((await asUser(member,'SELECT * FROM public.profiles WHERE id=$1',[first])).rows.length,0)
  await db.exec(await fs.readFile(new URL('../supabase/009_leaderboard.sql',import.meta.url),'utf8'))
  assert.deepEqual(await rpc(member,'xp_leaderboard'),rows)
})
