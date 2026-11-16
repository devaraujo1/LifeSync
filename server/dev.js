import { obterServidor } from './index.js'

const porta = Number(process.env.API_PORT ?? 3001)
obterServidor().app.listen(porta, '127.0.0.1', () => {
  console.log(`API local em http://127.0.0.1:${porta} (use o site em ${process.env.APP_URL ?? 'http://127.0.0.1:5173'})`)
})
