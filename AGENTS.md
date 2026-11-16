# LifeSync — Agent notes

LifeSync (1 conta via `ALLOWED_EMAILS`). Vite MPA + Express API (Netlify Function) + Neon Postgres. Auth Google server-side.

## Comandos

```bash
npm install
copy .env.example .env && npm run gerar-chaves   # depois preencher .env
npm run migrate
npm run dev:api    # :3001
npm run dev        # :5173 — usar 127.0.0.1
npm test
npm run build
```

## Camadas do front (não “duplicata”)

| Pasta | Papel |
|---|---|
| `*.html` + `src/entradas/*` | Shell HTML + boot (CSS, `exigirLogin`, importa a página) |
| `src/pages/*` | Orquestra a tela |
| `src/modules/*` | Widgets/UI reutilizáveis (podem aparecer em várias páginas) |
| `src/services/*` | API client, storage, auth guard |
| `shared/*` | Funções puras compartilhadas com o servidor |

Ex.: `tarefas` tem os três (`entrada` → `page` → usa `modules/tarefas` no dashboard). Isso é intencional no MPA.

## Entradas

- Front: `src/entradas/*.js` → `pages/*` + `modules/*` + `services/*` (páginas: index, assistente, agenda, favoritos, financeiro, tarefas, personalizar, landing)
- API: `server/app.js` → `routes/*` → `repositories/*`
- Assistente: API `server/routes/assistente.js` + `server/services/assistente/*`; página `assistente.html` + dock `assistente-ui.js`
- Deploy: `netlify.toml`, `netlify/functions/api.js`, `calendar-sync.js` (cron 15m)
- SQL: `db/migrations/001`…`010` (só aditivo; tabelas órfãs leisure/wishlist ok)
- Regras de cartão: `shared/cartoes.js` (`server/lib/cartoes.js` só reexporta)

## Regras

- Segredos só em env; nunca commit de `.env`
- Usuário vem da sessão, nunca de `user_id` no body
- Escritas precisam de `X-CSRF-Token`
- Credenciais só em `.env` (servidor); nada hardcoded no front
- IA: `AI_PROVIDER` (`gemini` \| `openai_compat`) + `AI_API_KEY` (Gemini: também `GOOGLE_API_KEY` / `GEMINI_API_KEY`) + `AI_BASE_URL` se compat; auth via `x-goog-api-key`; nunca `VITE_`
- Prefixo de eventos/cache: `lifesync:*` / `lifesync-*`
- Mapa detalhado: `../mapa/` · índice barato: `.cursor-map/INDEX.md`

## Testar

Vitest + Supertest + PGlite. Preferir `npm test` após auth, cartões, calendário ou cleanup.
