import '../styles/main.css'
import '../styles/paginas.css'
import '../styles/assistente.css'
import '../styles/assistente-page.css'
import { exigirLogin } from '../services/guarda.js'

await exigirLogin({ precarregar: ['/assistente/status'] })
await import('../pages/assistente.js')
