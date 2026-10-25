import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function moduleAt(entry, plugins = []) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', plugins })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

test('demo leaderboard uses the saved name, photo and total XP of its actual local profile', async () => {
  const storage = new Map(), original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } })
  try {
    const demo = await moduleAt('src/lib/demo.ts')
    let rows = demo.demoLeaderboard()
    assert.equal(rows.length, 1); assert.equal(rows[0].rank, 1); assert.equal(rows[0].xp, 0)
    const lesson = demo.demoStore().lessons[0]
    demo.demoComplete(lesson.id); demo.demoComplete(lesson.id)
    demo.demoRename('My saved name'); demo.demoAvatar('data:image/png;base64,avatar')
    rows = demo.demoLeaderboard()
    assert.equal(rows[0].xp, 20); assert.equal(rows[0].xp, demo.demoSummary().xp)
    assert.equal(rows[0].display_name, 'My saved name'); assert.equal(rows[0].avatar_data_url, 'data:image/png;base64,avatar')
    storage.set('linguanest_profile_v2', JSON.stringify({ ...demo.demoProfile(), role: 'member' }))
    assert.equal(demo.demoLeaderboard().length, 1)
    storage.set('linguanest_profile_v2', JSON.stringify({ ...demo.demoProfile(), must_change_password: true }))
    assert.throws(() => demo.demoLeaderboard(), /Không có quyền/)
  } finally { if (original === undefined) delete globalThis.localStorage; else Object.defineProperty(globalThis, 'localStorage', original) }
})

test('leaderboard API calls the member RPC and fetches other avatars using the current session', async () => {
  const calls = [], originalFetch = globalThis.fetch
  let failure = null
  const entries = [{ id: 'peer', display_name: 'Peer', avatar_key: 'avatars/peer/photo.png', xp: 30, rank: 1 }]
  globalThis.__leaderboardRpc = async (name, args) => { calls.push([name, args]); return { data: entries, error: failure } }
  const api = await moduleAt('src/lib/api.ts', [{ name: 'leaderboard-transport', setup(b) {
    b.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'supabase', namespace: 'mock' }))
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const cloudMode=true, mediaWorkerUrl="https://worker.test"; export const supabase={rpc:(...args)=>globalThis.__leaderboardRpc(...args),auth:{getSession:async()=>({data:{session:{access_token:"member-session"}},error:null})}};' }))
  } }])
  try {
    assert.deepEqual(await api.loadLeaderboard(), entries)
    assert.deepEqual(calls, [['xp_leaderboard', {}]])
    failure = Error('Not authorized'); await assert.rejects(api.loadLeaderboard(), /Not authorized/)
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://worker.test/members/peer/avatar')
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer member-session')
      return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'image/png' } })
    }
    assert.equal((await api.avatarBlob('peer')).type, 'image/png')
  } finally { delete globalThis.__leaderboardRpc; globalThis.fetch = originalFetch }
})
