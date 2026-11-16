import express, { Router } from 'express'
import helmet from 'helmet'
import { criarRepositorios } from './repositories/index.js'
import { criarClienteGoogle } from './services/google.js'
import { criarServicoCalendario } from './services/calendarSync.js'
import { carregarSessao, exigirAutenticacao, protegerCsrf, verificarOrigem } from './middleware/sessao.js'
import { naoEncontradaRota, tratarErros } from './middleware/erros.js'
import { criarLimitadores } from './middleware/limites.js'
import { criarRotasAuth } from './routes/auth.js'
import { criarRotasCalendario } from './routes/calendario.js'
import { criarRotasPerfil } from './routes/perfil.js'
import { criarRotasTarefas } from './routes/tarefas.js'
import { criarRotasCategorias, criarRotasMeta, criarRotasTransacoes } from './routes/transacoes.js'
import { criarRotasCartoes } from './routes/cartoes.js'
import { criarRotasFavoritos } from './routes/favoritos.js'
import { criarRotasEventos } from './routes/eventos.js'
import { criarRotasAssistente } from './routes/assistente.js'

export function criarApp({ config, db, fetchImpl, limitar = true, atrasosRede, relogio, llm }) {
  const repos = criarRepositorios(db)
  const google = criarClienteGoogle({ config, fetchImpl, atrasos: atrasosRede })
  const calendario = criarServicoCalendario({ repos, google, config })
  const limites = criarLimitadores({ habilitado: limitar })

  const api = Router()
  api.use(limites.geral)
  api.use(verificarOrigem(config))
  api.use(express.json({ limit: '2mb' }))
  api.use(carregarSessao({ config, repos }))

  api.get('/saude', (_req, res) => res.json({ ok: true }))
  api.use('/auth', criarRotasAuth({ config, repos, google, limites }))
  const cal = criarRotasCalendario({ config, repos, google, calendario, limites })
  api.use('/calendario', cal.publico)

  // Tudo abaixo exige sessão válida e, nas escritas, token CSRF.
  const privado = Router()
  privado.use(exigirAutenticacao, protegerCsrf)
  privado.use('/calendario', cal.protegido)
  privado.use('/', criarRotasPerfil({ repos }))
  privado.use('/tarefas', criarRotasTarefas({ repos }))
  privado.use('/transacoes', criarRotasTransacoes({ repos }))
  privado.use('/meta', criarRotasMeta({ repos }))
  privado.use('/categorias', criarRotasCategorias({ repos }))
  privado.use('/cartoes', criarRotasCartoes({ repos, relogio }))
  privado.use('/favoritos', criarRotasFavoritos({ repos }))
  privado.use('/eventos', criarRotasEventos({ repos, calendario }))
  privado.use('/assistente', criarRotasAssistente({ config, repos, calendario, limites, llm }))
  api.use(privado)

  const app = express()
  app.disable('x-powered-by')
  // Netlify / reverse proxy: um hop confiável para req.ip (rate limit).
  if (config.producao) app.set('trust proxy', 1)
  app.use(helmet())
  // No Netlify a função recebe o caminho reescrito; aceitamos os dois prefixos.
  app.use(['/api', '/.netlify/functions/api'], api)
  app.use(naoEncontradaRota)
  app.use(tratarErros)

  return { app, repos, google, calendario }
}
