import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  server: {
    // Spotify OAuth exige 127.0.0.1 (não localhost).
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.API_PORT ?? 3001}` } }
  },
  build: {
    rollupOptions: {
      input: {
        landing: resolve(root, 'landing.html'),
        dashboard: resolve(root, 'index.html'),
        financeiro: resolve(root, 'financeiro.html'),
        favoritos: resolve(root, 'favoritos.html'),
        agenda: resolve(root, 'agenda.html'),
        tarefas: resolve(root, 'tarefas.html'),
        assistente: resolve(root, 'assistente.html'),
        personalizar: resolve(root, 'personalizar.html')
      }
    }
  }
})
