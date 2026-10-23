import { createServer } from 'vite'

// Own the server in-process: Windows does not need taskkill to clean up children.
// Force demo mode so local .env credentials can never point these tests at real data.
export default async function setup() {
  const server = await createServer({
    server: { host: '127.0.0.1', port: 4173, strictPort: true },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(''),
      'import.meta.env.VITE_MEDIA_WORKER_URL': JSON.stringify(''),
    },
  })
  await server.listen()
  return async () => { await server.close() }
}
