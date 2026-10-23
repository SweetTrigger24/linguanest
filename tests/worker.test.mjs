import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import ts from 'typescript'
const source=await fs.readFile(new URL('../media-worker/src/index.ts',import.meta.url),'utf8')
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}})
const {default:worker}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const originalFetch=globalThis.fetch
const admin='00000000-0000-4000-8000-000000000001',member='00000000-0000-4000-8000-000000000002'
let calls,role,active,mustChange,allowed,files,deleted,failMetadata
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test',ALLOWED_ORIGINS:'https://learn.example.com',MEDIA_BUCKET:{
  async get(key,options){calls.push(['get',key,options?.range?.get('Range')]); if(!files.has(key))return null;return{size:10,httpEtag:'"test"',httpMetadata:{contentType:'audio/mpeg'},range:options?.range?.has('Range')?{offset:0,length:5}:undefined,body:new Uint8Array(options?.range?.has('Range')?5:10),writeHttpMetadata(h){h.set('Content-Type','audio/mpeg')}}},
  async head(key){return files.has(key)?{size:10,httpEtag:'"test"',httpMetadata:{contentType:'audio/mpeg'},writeHttpMetadata(h){h.set('Content-Type','audio/mpeg')}}:null},
  async put(key){files.add(key)}, async delete(key){files.delete(key);deleted.push(key)},
}}
test.beforeEach(()=>{
  calls=[];role='admin';active=true;mustChange=false;allowed=true;files=new Set();deleted=[];failMetadata=false
  globalThis.fetch=async (url,init={})=>{
    const u=new URL(url),body=init.body?JSON.parse(init.body):null,headers=new Headers(init.headers)
    calls.push([u.pathname,init.method||'GET',body,headers])
    if(u.pathname==='/auth/v1/user')return Response.json({id:role==='admin'?admin:member,email:'me@users.linguanest.invalid'})
    if(u.pathname==='/auth/v1/token'){
      assert.equal(headers.get('apikey'),'sb_publishable_test'); assert.equal(headers.has('Authorization'),false)
      return body.password==='correct password'?Response.json({user:{id:role==='admin'?admin:member}}):Response.json({msg:'Wrong password'},{status:400})
    }
    if(u.pathname==='/rest/v1/profiles'&&(!init.method||init.method==='GET'))return Response.json([{id:u.searchParams.get('id').slice(3),role:u.searchParams.get('id').includes(member)?'member':role,is_active:active,must_change_password:mustChange}])
    if(u.pathname==='/rest/v1/rpc/can_access_media_for')return Response.json(allowed)
    if(u.pathname==='/rest/v1/rpc/reserve_media_delete')return allowed?Response.json(null):Response.json({message:'File đang được lịch sử sử dụng'},{status:400})
    if(u.pathname==='/rest/v1/media_files'&&failMetadata)return Response.json({message:'Metadata failed'},{status:500})
    if(u.pathname==='/auth/v1/admin/users'&&init.method==='POST')return Response.json({id:member})
    return new Response(null,{status:204})
  }
})
test.after(()=>{globalThis.fetch=originalFetch})
const request=(path,method='GET',body,extra={})=>new Request('https://media.example.com'+path,{method,headers:{Authorization:'Bearer user-token',Origin:'https://learn.example.com',...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body)}:{})})
test('reject anonymous, wrong origins, locked accounts and member uploads',async()=>{
  assert.equal((await worker.fetch(new Request('https://media.example.com/media-ticket?key=files/x.mp3'),env)).status,401)
  assert.equal((await worker.fetch(request('/media','POST',{}, {Origin:'https://evil.example.com'}),env)).status,403)
  active=false;assert.equal((await worker.fetch(request('/media'),env)).status,403)
  active=true;role='member';assert.equal((await worker.fetch(request('/media?filename=x.mp3','POST',new Uint8Array([73,68,51])),env)).status,403)
  mustChange=true;assert.equal((await worker.fetch(request('/media-ticket?key=files/x.mp3'),env)).status,403)
})
test('signed file tickets support Range, reject tampering and recheck access',async()=>{
  const key=`files/${crypto.randomUUID()}.mp3`;files.add(key)
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
  assert.equal(uploaded.status,201);const {key}=await uploaded.json();assert.equal(files.has(key),true)
  failMetadata=true
  assert.equal((await worker.fetch(request('/media?filename=y.mp3','POST',new Uint8Array([73,68,51])),env)).status,503)
  assert.equal(deleted.length,1);assert.equal(files.size,1)
})
test('referenced files cannot be deleted',async()=>{
  const key=`files/${crypto.randomUUID()}.mp3`;files.add(key);allowed=false
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
