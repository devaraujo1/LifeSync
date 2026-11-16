import '../styles/main.css'
import '../styles/paginas.css'
import '../styles/tarefas.css'
import { exigirLogin } from '../services/guarda.js'

await exigirLogin({ precarregar: ['/tarefas', '/tarefas/tags'] })
await import('../pages/tarefas.js')
