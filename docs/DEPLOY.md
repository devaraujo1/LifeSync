# Deploy e configuração do LifeSync

Guia para rodar o projeto **localmente** e em **produção (Netlify)**.  
Segredos ficam só no `.env` (local) ou nas variáveis do painel Netlify — **nunca** no Git.

Modelo de variáveis: [`.env.example`](../.env.example).

---

## 1. Pré-requisitos

- Node.js ≥ 20.6
- Conta no [Neon](https://neon.tech) (PostgreSQL)
- Projeto no [Google Cloud Console](https://console.cloud.google.com/) (OAuth)
- Conta Netlify (produção)
- (Opcional) chave de IA para o Assistente (`AI_API_KEY`)

---

## 2. Variáveis de ambiente

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `APP_URL` | Sim | Origem pública do site **sem** barra final. Local: `http://127.0.0.1:5173`. Prod: `https://seu-site.netlify.app` |
| `NODE_ENV` | Sim | `development` ou `production` |
| `DATABASE_URL` | Sim | Connection string Neon (preferir host **pooled** com `sslmode=require`) |
| `SESSION_SECRET` | Sim | Assina cookies do fluxo OAuth (≥ 32 caracteres). Gerar com `npm run gerar-chaves` |
| `TOKEN_ENCRYPTION_KEY` | Sim | AES-256 (32 bytes em base64) para o refresh token do Google Calendar |
| `GOOGLE_CLIENT_ID` | Sim | Credencial OAuth do Google |
| `GOOGLE_CLIENT_SECRET` | Sim | Segredo OAuth do Google |
| `ALLOWED_EMAILS` | **Obrigatória em produção** | E-mails Google autorizados, separados por vírgula |
| `ALLOWED_ORIGINS` | Não | Origens extras além de `APP_URL` (CORS/CSRF de escrita). Vazio = só o próprio site |
| `DEFAULT_TIMEZONE` | Não | Padrão `America/Sao_Paulo` |
| `API_PORT` | Não | Porta da API local (padrão `3001`) |
| `CRON_SECRET` | **Obrigatória em produção** | Protege a função `calendar-sync` |
| `AI_PROVIDER` | Não | `gemini` ou `openai_compat` |
| `AI_API_KEY` | Não* | Chave do provedor (*sem ela o assistente responde 503) |
| `AI_MODEL` / `AI_MODEL_PENSAR` | Não | Modelos padrão e “pensar” |
| `AI_BASE_URL` | Só `openai_compat` | Ex.: `https://api.openai.com/v1` |

Gerar segredos:

```bash
npm run gerar-chaves
```

---

## 3. Google Cloud (OAuth)

1. Crie um projeto e ative a **Google Calendar API** (se for usar a agenda sincronizada).
2. Em **APIs e serviços → Credenciais**, crie um **ID do cliente OAuth** (aplicativo Web).
3. Cadastre as **URIs de redirecionamento autorizadas** (derivadas de `APP_URL`):

**Local**

- `http://127.0.0.1:5173/api/auth/google/callback`
- `http://127.0.0.1:5173/api/calendario/callback`

**Produção** (troque pelo seu domínio)

- `https://SEU-SITE.netlify.app/api/auth/google/callback`
- `https://SEU-SITE.netlify.app/api/calendario/callback`

4. Copie `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` para o `.env` / Netlify.

> Use **127.0.0.1**, não `localhost`, no desenvolvimento.

---

## 4. Banco Neon + migrações

1. Crie um projeto Neon e copie a connection string **pooled**.
2. Coloque em `DATABASE_URL`.
3. Aplique as migrations:

```bash
npm run migrate
```

As migrations ficam em `db/migrations/` (`001` … `010_assistente_pendentes`). O script é idempotente: rodar de novo não duplica tabelas.

---

## 5. Rodando localmente

```bash
npm install
copy .env.example .env          # Windows
# ou: cp .env.example .env      # macOS/Linux

npm run gerar-chaves            # cole SESSION_SECRET e TOKEN_ENCRYPTION_KEY no .env
# preencha DATABASE_URL, Google, ALLOWED_EMAILS (opcional em dev)

npm run migrate
npm run dev:api                 # terminal 1 → http://127.0.0.1:3001
npm run dev                     # terminal 2 → http://127.0.0.1:5173
```

Abra **http://127.0.0.1:5173**. O Vite encaminha `/api` para a API local.

Testes automatizados:

```bash
npm test
```

---

## 6. Deploy no Netlify

O arquivo [`netlify.toml`](../netlify.toml) define:

- **Build:** `npm run build` → pasta `dist`
- **Functions:** `netlify/functions` (`api` + `calendar-sync`)
- **Redirect:** `/api/*` → função Express `api`
- **Headers:** segurança + `Cache-Control: no-store` nas rotas da API

### Passos

1. Conecte o repositório (ou faça deploy via CLI: `npx netlify deploy --prod --build`).
2. Em **Site configuration → Environment variables**, copie todas as variáveis da tabela acima.
3. Em produção:
   - `NODE_ENV=production`
   - `APP_URL=https://seu-site.netlify.app`
   - `ALLOWED_EMAILS` com pelo menos um e-mail
   - `CRON_SECRET` definido (senão `calendar-sync` responde 503)
4. Confirme no Google Cloud os redirects de **produção**.
5. Rode `npm run migrate` **uma vez** apontando para o mesmo `DATABASE_URL` de produção (localmente, com o `.env` de prod ou um script seguro).

### Função agendada

`calendar-sync` roda a cada **15 minutos** (`*/15 * * * *`). Aceita:

- `Authorization: Bearer <CRON_SECRET>`
- header `x-cron-secret`
- ou invocação do scheduler Netlify (`x-netlify-event: schedule`)

---

## 7. Checklist pós-deploy

- [ ] `GET https://SEU-SITE.netlify.app/api/saude` → `{ "ok": true }`
- [ ] Página inicial / landing abrem (`200`)
- [ ] Login Google funciona com um e-mail de `ALLOWED_EMAILS`
- [ ] E-mail fora da lista recebe “não autorizado”
- [ ] Agenda: conectar Google Calendar (escopo separado)
- [ ] (Opcional) Assistente: `GET /api/assistente/status` com `configurado: true` se `AI_API_KEY` estiver setada

---

## 8. Documentos relacionados

- [README.md](../README.md) — visão geral do projeto
- [API.md](./API.md) — referência das rotas
- [EXEMPLOS-FETCH.md](./EXEMPLOS-FETCH.md) — exemplos GET/POST/PATCH/PUT/DELETE com `fetch` e DOM
