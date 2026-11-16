# Map

Stack: Vite MPA (JS vanilla) + Express + Neon HTTP + Netlify Functions + Vitest/PGlite  
Entry: `src/entradas/*.js` (login) → pages; API `server/app.js`; serverless `netlify/functions/api.js`  
Apps/packages: pasta `LifeSync` (workspace pai só aponta para cá)

Front (pastas):
- `src/entradas` boot+auth
- `src/pages` telas (dashboard home, assistente, agenda, favoritos, financeiro, cartoes, tarefas, personalizar)
- `src/modules` widgets (shell, assistente-ui dock, assistente-chat, clima, tarefas, agenda-*)
- `src/services` api/guarda/assistenteApi/*Api (chaves `lifesync-*`)
- `shared` regras puras front+API (`cartoes.js`)
- `*.html` páginas app (+ landing + assistente); estilos em `src/styles` (**mobile-first** `min-width`; tokens `--bp-sm/md/lg/xl` em `main.css`)

Back (pastas):
- `server/routes` auth, calendario, perfil, tarefas, transacoes, cartoes, favoritos, eventos, assistente
- `server/repositories` SQL (+ `assistentePendentes`)
- `server/services` google, calendarSync, eventMapping (props `lifesync*`), assistente
- `server/middleware` sessao (Origin/Referer em prod), limites (`req.ip`), erros
- `server/lib` crypto, dates, cookies, validate; `cartoes.js` reexporta `shared/cartoes.js`

Dados: Neon Postgres; migrations `001`…`010_assistente_pendentes` (leisure/wishlist órfãs ok); sessão hash; Calendar refresh AES-GCM; pendências assistente com `DELETE … RETURNING`

Como testar: `npm test`; local `dev:api`+`dev` em 127.0.0.1; health `/api/saude`

Hotspots:
- `server/config.js` (`AI_*` assistente)
- `server/middleware/sessao.js` / `limites.js`
- `server/services/calendarSync.js` + `netlify/functions/calendar-sync.js` (`CRON_SECRET`)
- `server/services/assistente/*` (`contexto.js` snapshot, prompt, pendentes, timeout providers)
- `src/services/guarda.js` / `api.js`
- `src/modules/assistente-ui.js` / `assistente-chat.js`
- `src/pages/cartoes.js` + `shared/cartoes.js`
- `netlify.toml` (CSP Report-Only)
- `.env` / `.env.example` (credenciais + `CRON_SECRET`)

Não ler: node_modules, dist, build, .git

Reconhecimento completo: `../mapa/`
