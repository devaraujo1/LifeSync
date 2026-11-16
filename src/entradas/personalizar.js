import '../styles/main.css'
import '../styles/paginas.css'
import '../styles/personalizar.css'
import { exigirLogin } from '../services/guarda.js'

await exigirLogin()
await import('../pages/personalizar.js')
