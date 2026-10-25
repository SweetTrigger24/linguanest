import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import ts from 'typescript'
const source=await fs.readFile(new URL('../media-worker/src/index.ts',import.meta.url),'utf8')
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}})
const {default:worker}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const originalFetch=globalThis.fetch
const admin='00000000-0000-4000-8000-000000000001',member='00000000-0000-4000-8000-000000000002'
let calls,role,active,mustChange,allowed,files,deleted,failMetadata,failDelete,failPut,r2Calls,avatarKey,profileOverrides
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test',ALLOWED_ORIGINS:'https://learn.example.com',MEDIA_BUCKET:{
  async head(key) { r2Calls.push(['head',key]); return objectInfo(key) },
  async get(key,options) {
    r2Calls.push(['get',key,options]); const info=objectInfo(key); if(!info)return null
    const data=files.get(key).bytes,range=options?.range
    const bytes=range?data.slice(range.offset,range.offset+range.length):data
    return {...info,body:new Response(bytes).body}
  },
  async put(key,bytes,options) {
    r2Calls.push(['put',key]); if(failPut)throw Error('R2 unavailable')
    files.set(key,{bytes:bytes.slice(),type:options.httpMetadata.contentType});return objectInfo(key)
  },
  async delete(key) { r2Calls.push(['delete',key]); if(failDelete)throw Error('R2 unavailable'); files.delete(key);deleted.push(key) },
}}
const seedFile=(key)=>files.set(key,{bytes:Uint8Array.from({length:10},(_,i)=>i),type:'audio/mpeg'})
function objectInfo(key) {
  const file=files.get(key);if(!file)return null
  return {size:file.bytes.length,httpEtag:'"test-etag"',uploaded:new Date('2026-10-01T00:00:00Z'),writeHttpMetadata(headers){headers.set('Content-Type',file.type)}}
}
test.beforeEach(()=>{
  calls=[];role='admin';active=true;mustChange=false;allowed=true;files=new Map();deleted=[];failMetadata=false;failDelete=false;failPut=false;r2Calls=[];avatarKey=null;profileOverrides=new Map()
  globalThis.fetch=async (url,init={})=>{
    const u=new URL(url),body=typeof init.body==='string'?JSON.parse(init.body):null,headers=new Headers(init.headers)
    calls.push([u.pathname,init.method||'GET',body,headers])
    assert.equal(u.pathname.startsWith('/storage/'),false,'Worker must not call Supabase Storage')
    if(u.pathname==='/auth/v1/user')return Response.json({id:role==='admin'?admin:member,email:'me@users.linguanest.invalid'})
    if(u.pathname==='/auth/v1/token'){
      assert.equal(headers.get('apikey'),'sb_publishable_test'); assert.equal(headers.has('Authorization'),false)
      return body.password==='correct password'?Response.json({user:{id:role==='admin'?admin:member}}):Response.json({msg:'Wrong password'},{status:400})
    }
    if(u.pathname==='/rest/v1/profiles'&&(!init.method||init.method==='GET')) {
      const id=u.searchParams.get('id').slice(3)
      if(profileOverrides.has(id))return Response.json(profileOverrides.get(id)?[profileOverrides.get(id)]:[])
      return Response.json([{id,role:id===member?'member':role,is_active:active,must_change_password:mustChange,avatar_key:avatarKey}])
    }
    if(u.pathname==='/rest/v1/rpc/replace_profile_avatar') {
      assert.equal(body.p_user,role==='admin'?admin:member)
      if(failMetadata)return Response.json({message:'Metadata failed'},{status:500})
      const previous=avatarKey;avatarKey=body.p_key;return Response.json(previous)
    }
    if(u.pathname==='/rest/v1/rpc/can_access_media_for')return Response.json(allowed)
    if(u.pathname==='/rest/v1/rpc/reserve_media_delete')return allowed?Response.json(null):Response.json({message:'File đang được lịch sử sử dụng'},{status:400})
    if(u.pathname==='/rest/v1/media_files'&&failMetadata)return Response.json({message:'Metadata failed'},{status:500})
    if(u.pathname==='/auth/v1/admin/users'&&init.method==='POST')return Response.json({id:member})
    return new Response(null,{status:204})
  }
})
test.afterEach(()=>{assert.equal(calls.some(c=>c[0].startsWith('/storage/')),false)})
test.after(()=>{globalThis.fetch=originalFetch})
const request=(path,method='GET',body,extra={})=>new Request('https://media.example.com'+path,{method,headers:{Authorization:'Bearer user-token',Origin:'https://learn.example.com',...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body)}:{})})

test('members upload, replace, read and remove only their own avatar without media admin rights',async()=>{
  role='member'
  const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])
  const upload=()=>worker.fetch(request('/account/avatar?user='+admin,'POST',png,{'Content-Type':'image/png'}),env)
  assert.equal((await worker.fetch(request('/account/avatar'),env)).status,404)
  assert.equal((await upload()).status,200)
  const first=avatarKey;assert.match(first,new RegExp(`^avatars/${member}/`));assert.equal(files.size,1)
  let response=await worker.fetch(request('/account/avatar?key=avatars/'+admin+'/other.png'),env)
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png')
  assert.equal(response.headers.get('Cache-Control'),'private, no-store')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),png)
  assert.equal((await upload()).status,200);assert.notEqual(avatarKey,first);assert.equal(files.has(first),false)
  assert.equal((await worker.fetch(request('/media/'+avatarKey),env)).status,400)
  assert.equal((await worker.fetch(request('/account/avatar','DELETE'),env)).status,200)
  assert.equal(avatarKey,null);assert.equal(files.size,0)
  assert.equal(calls.some(c=>c[0]==='/rest/v1/media_files'),false)
})

test('avatar validation and account gates precede storage; failed writes preserve the existing avatar',async()=>{
  role='member'
  const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])
  const upload=(bytes=png,headers={})=>worker.fetch(request('/account/avatar','POST',bytes,{'Content-Type':'image/png',...headers}),env)
  assert.equal((await upload(png,{'Content-Type':'image/svg+xml'})).status,415)
  assert.equal((await upload(new Uint8Array([0,1,2]))).status,415)
  assert.equal((await upload(png,{'Content-Length':String(2*1024*1024+1)})).status,413)
  assert.equal((await upload(new Uint8Array(2*1024*1024+1))).status,413)
  mustChange=true;assert.equal((await upload()).status,403)
  mustChange=false;active=false;assert.equal((await upload()).status,403)
  active=true;assert.equal(r2Calls.length,0)
  assert.equal((await upload()).status,200);const previous=avatarKey
  failMetadata=true;assert.equal((await upload()).status,503)
  assert.equal(avatarKey,previous);assert.equal(files.size,1);assert.ok(files.has(previous))
  failMetadata=false;failPut=true;assert.equal((await upload()).status,503)
  assert.equal(avatarKey,previous)
  failPut=false;failDelete=true;assert.equal((await upload()).status,200)
  assert.notEqual(avatarKey,previous)
})
test('reject anonymous, wrong origins, locked accounts and member uploads',async()=>{
  assert.equal((await worker.fetch(new Request('https://media.example.com/media-ticket?key=files/x.mp3'),env)).status,401)
  assert.equal((await worker.fetch(request('/media','POST',{}, {Origin:'https://evil.example.com'}),env)).status,403)
  active=false;assert.equal((await worker.fetch(request('/media'),env)).status,403)
  active=true;role='member';assert.equal((await worker.fetch(request('/media?filename=x.mp3','POST',new Uint8Array([73,68,51])),env)).status,403)
  mustChange=true;assert.equal((await worker.fetch(request('/media-ticket?key=files/x.mp3'),env)).status,403)
})
test('signed file tickets support Range, reject tampering and recheck access',async()=>{
  const key=`files/${crypto.randomUUID()}.mp3`;seedFile(key)
  const ticket=await worker.fetch(request('/media-ticket?key='+key),env);assert.equal(ticket.status,200)
  const {url}=await ticket.json(); const response=await worker.fetch(new Request(url,{headers:{Range:'bytes=0-4'}}),env)
  assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 0-4/10');assert.equal((await response.arrayBuffer()).byteLength,5)
  assert.equal((await worker.fetch(new Request(url+'corrupt'),env)).status,401)
  allowed=false;assert.equal((await worker.fetch(new Request(url),env)).status,403)
  active=false;assert.equal((await worker.fetch(new Request(url),env)).status,403)
})
test('upload validates signatures and compensates when metadata cannot be saved',async()=>{
  assert.equal((await worker.fetch(request('/media?filename=x.mp3','POST',new Uint8Array([0,1,2])),env)).status,415)
  const uploaded=await worker.fetch(request('/media?filename=x.mp3','POST',new Uint8Array([73,68,51,0,0,0])),env)
  assert.equal(uploaded.status,201);const {key}=await uploaded.json();assert.equal(files.has(key),true);assert.equal(files.get(key).type,'audio/mpeg');assert.equal(files.get(key).bytes.length,6)
  failMetadata=true
  assert.equal((await worker.fetch(request('/media?filename=y.mp3','POST',new Uint8Array([73,68,51])),env)).status,503)
  assert.equal(deleted.length,1);assert.equal(files.size,1)
})
test('referenced files cannot be deleted',async()=>{
  const key=`files/${crypto.randomUUID()}.mp3`;seedFile(key);allowed=false
  assert.equal((await worker.fetch(request('/media?key='+key,'DELETE'),env)).status,400);assert.equal(deleted.length,0)
  allowed=true;assert.equal((await worker.fetch(request('/media?key='+key,'DELETE'),env)).status,200);assert.deepEqual(deleted,[key])
})
test('password change verifies the current password even during forced reset',async()=>{
  role='member';mustChange=true
  assert.equal((await worker.fetch(request('/account/password','POST',{current_password:'wrong',password:'new password123'}),env)).status,400)
  assert.equal(calls.some(c=>c[0]?.includes('/auth/v1/admin/users/')),false)
  assert.equal((await worker.fetch(request('/account/password','POST',{current_password:'correct password',password:'new password123'}),env)).status,200)
  assert.ok(calls.some(c=>c[0]==='/rest/v1/profiles'&&c[1]==='PATCH'&&c[2].must_change_password===false))
})
test('account creation confirms internal identity and sets member password gate',async()=>{
  const response=await worker.fetch(request('/admin/users','POST',{username:'minh.nguyen',display_name:'Minh',password:'temporary123!'}),env)
  assert.equal(response.status,201)
  const create=calls.find(c=>c[0]==='/auth/v1/admin/users');assert.equal(create[2].email,'minh.nguyen@users.linguanest.invalid');assert.equal(create[2].email_confirm,true)
  const patch=calls.find(c=>c[0]==='/rest/v1/profiles'&&c[1]==='PATCH');assert.equal(patch[2].must_change_password,true);assert.equal(patch[2].is_active,true)
  role='member';assert.equal((await worker.fetch(request('/admin/users/reset','POST',{id:admin,password:'temporary123!'}),env)).status,403)
})


test('R2 full reads, HEAD, suffix/open ranges and invalid ranges preserve HTTP semantics',async()=>{
  const key=`files/${crypto.randomUUID()}.mp3`;seedFile(key)
  const read=(method='GET',headers={})=>worker.fetch(request('/media/'+key,method,undefined,headers),env)
  let response=await read()
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'audio/mpeg')
  assert.equal(response.headers.get('ETag'), '"test-etag"');assert.equal(response.headers.get('Cache-Control'),'private, no-store')
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[0,1,2,3,4,5,6,7,8,9])
  r2Calls=[];response=await read('HEAD',{Range:'bytes=0-4'})
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Length'),'10');assert.equal(await response.text(),'')
  assert.deepEqual(r2Calls,[['head',key]])
  for(const [range,expected,contentRange] of [
    ['bytes=5-',[5,6,7,8,9],'bytes 5-9/10'],['bytes=-3',[7,8,9],'bytes 7-9/10'],
    ['bytes=8-100',[8,9],'bytes 8-9/10'],['bytes=-100',[0,1,2,3,4,5,6,7,8,9],'bytes 0-9/10'],
  ]) {
    response=await read('GET',{Range:range});assert.equal(response.status,206)
    assert.equal(response.headers.get('Content-Range'),contentRange);assert.equal(response.headers.get('Content-Length'),String(expected.length))
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],expected)
  }
  for(const range of ['bytes=10-','bytes=5-2','bytes=-0']) {
    response=await read('GET',{Range:range});assert.equal(response.status,416);assert.equal(response.headers.get('Content-Range'),'bytes */10')
  }
  for(const range of ['bytes=bad','bytes=0-1,5-6','items=0-1']) {
    response=await read('GET',{Range:range});assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,10)
  }
  response=await read('GET',{Range:'bytes=0-4','If-Range':'"old-etag"'});assert.equal(response.status,200)
  response=await read('GET',{Range:'bytes=0-4','If-Range':'"test-etag"'});assert.equal(response.status,206)
  files.delete(key)
  for(const [method,headers] of [['GET',{}],['GET',{Range:'bytes=0-4'}],['HEAD',{}]])assert.equal((await read(method,headers)).status,404)
})

test('R2 failures retain metadata for deletion retry and do not register failed uploads',async()=>{
  const key=`files/${crypto.randomUUID()}.mp3`;seedFile(key);failDelete=true
  assert.equal((await worker.fetch(request('/media?key='+key,'DELETE'),env)).status,503)
  assert.equal(files.has(key),true);assert.equal(calls.some(c=>c[0]==='/rest/v1/media_files'&&c[1]==='DELETE'),false)
  failDelete=false;failMetadata=true
  assert.equal((await worker.fetch(request('/media?key='+key,'DELETE'),env)).status,503);assert.equal(files.has(key),false)
  failMetadata=false
  assert.equal((await worker.fetch(request('/media?key='+key,'DELETE'),env)).status,200)
  calls=[];failPut=true
  assert.equal((await worker.fetch(request('/media?filename=x.mp3','POST',new Uint8Array([73,68,51])),env)).status,503)
  assert.equal(calls.some(c=>c[0]==='/rest/v1/media_files'),false)
})

test('media authorization runs before any R2 access; uploads respect file limits',async()=>{
  allowed=false
  const key=`files/${crypto.randomUUID()}.mp3`
  for(const method of ['GET','HEAD'])assert.equal((await worker.fetch(request('/media/'+key,method),env)).status,403)
  assert.equal(r2Calls.length,0)
  assert.equal((await worker.fetch(request('/media?filename=x.mp3','POST',new Uint8Array([73,68,51]),{'Content-Length':String(31*1024*1024)}),env)).status,413)
  assert.equal((await worker.fetch(request('/media?filename=x.exe','POST',new Uint8Array([1])),env)).status,415)
  assert.equal(r2Calls.length,0)
})
test('leaderboard avatars allow authenticated group reads and never allow editing another account',async()=>{
  role='member'
  const key=`avatars/${admin}/${crypto.randomUUID()}.png`,png=new Uint8Array([137,80,78,71,13,10,26,10])
  const target={id:admin,role:'admin',is_active:true,must_change_password:false,avatar_key:key}
  profileOverrides.set(admin,target);files.set(key,{bytes:png,type:'image/png'})
  const path=`/members/${admin}/avatar`
  const response=await worker.fetch(request(path+'?key=files/other.png'),env)
  assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),png)
  assert.equal(response.headers.get('Cache-Control'),'private, no-store')
  r2Calls=[]
  assert.equal((await worker.fetch(request(path,'DELETE'),env)).status,405)
  assert.equal((await worker.fetch(request(path,'POST',png,{'Content-Type':'image/png'}),env)).status,405)
  assert.equal((await worker.fetch(new Request('https://media.example.com'+path),env)).status,401)
  assert.equal((await worker.fetch(request(path,'GET',undefined,{Origin:'https://evil.example.com'}),env)).status,403)
  mustChange=true;assert.equal((await worker.fetch(request(path),env)).status,403)
  mustChange=false;active=false;assert.equal((await worker.fetch(request(path),env)).status,403)
  active=true;target.must_change_password=true;assert.equal((await worker.fetch(request(path),env)).status,404)
  target.must_change_password=false;target.is_active=false;assert.equal((await worker.fetch(request(path),env)).status,403)
  target.is_active=true;target.avatar_key=null;assert.equal((await worker.fetch(request(path),env)).status,404)
  target.avatar_key=`avatars/${member}/${crypto.randomUUID()}.png`;assert.equal((await worker.fetch(request(path),env)).status,404)
  profileOverrides.set(admin,null);assert.equal((await worker.fetch(request(path),env)).status,403)
  assert.equal(r2Calls.length,0)
  assert.equal(calls.some(call=>call[0]==='/rest/v1/rpc/replace_profile_avatar'),false)
})
