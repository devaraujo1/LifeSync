# LifeSync — v1.0

**Personal Life OS** — dashboard pessoal (visual verde-petróleo/ciano) para usar como página inicial do navegador. Reúne workspace, tarefas, financeiro (com cartões), agenda com **sincronização bidirecional com o Google Calendar**, favoritos, personalização e **assistente de IA**.

Os dados ficam na **sua conta** (login com Google) e acompanham você em qualquer dispositivo.

> Projeto pensado para **contas autorizadas** (`ALLOWED_EMAILS`). Não é um serviço multiusuário aberto.

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/API.md](docs/API.md) | Referência completa das rotas REST |
| [docs/EXEMPLOS-FETCH.md](docs/EXEMPLOS-FETCH.md) | Tutorial didático: GET, POST, PATCH, PUT, DELETE com `fetch` + DOM |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Variáveis de ambiente, Google OAuth, Neon, Netlify |
| [`.env.example`](.env.example) | Modelo de configuração local/produção |

## Checklist do enunciado (disciplina)

| Requisito | Onde está no projeto |
|---|---|
| Arquitetura REST | Rotas em `server/routes/*` sob `/api` — ver [docs/API.md](docs/API.md) |
| Exemplos práticos de todos os métodos | [docs/EXEMPLOS-FETCH.md](docs/EXEMPLOS-FETCH.md) |
| Função `fetch` do JavaScript | [`src/services/api.js`](src/services/api.js) (usado por todos os `*Api.js`) |
| Node.js + Express | [`server/app.js`](server/app.js), entrada local [`server/dev.js`](server/dev.js) |
| Mobile first | CSS em `src/styles/*` (base mobile + `@media (min-width: …)`) |
| DOM para exibir dados | Páginas em `src/pages/*` e módulos em `src/modules/*` atualizam a interface após o `fetch` |

## Funcionalidades

| Módulo | O que faz |
|---|---|
| **Workspace (Início)** | Saudação, data/relógio, clima, pesquisa Google, atalhos de favoritos, resumo (tarefas, próximo evento, saldo) |
| **Assistente** | Chat em português: prévia de gastos/eventos/tarefas; confirmação antes de gravar ou excluir; dock nas páginas |
| **Tarefas** | Únicas e recorrentes, prioridade, checklist, status por dia, progresso |
| **Financeiro** | Lançamentos, categorias, meta, resumo, cartões/faturas/parcelas, relatório PDF |
| **Agenda** | Calendário mensal, recorrência, sync com Google Calendar |
| **Favoritos** | Links por categoria; atalhos fixados na home |
| **Meu Perfil** | Tema, aurora, densidade, cidade do clima, foto, fuso |

Tarefas e eventos são **entidades independentes**: uma tarefa nunca vira evento automaticamente.

## Tecnologias

- **Front-end:** Vite + JavaScript vanilla (MPA), HTML/CSS próprios
- **Back-end:** Node.js + **Express**, empacotado como função serverless Netlify
- **Banco:** PostgreSQL no [Neon](https://neon.tech) (driver HTTP), migrations SQL versionadas
- **Autenticação:** Google OAuth 2.0 / OIDC (código no servidor, PKCE)
- **Integrações:** Google Calendar API, Open-Meteo (clima), provedor de IA (Gemini / OpenAI-compat)
- **Testes:** Vitest + Supertest + PGlite

## Arquitetura REST (visão geral)

```
Navegador (HTML/CSS/JS + DOM)
    │  fetch('/api/...', { credentials: 'same-origin' })
    ▼
Express (server/app.js → routes → services → repositories)
    ├── Neon PostgreSQL
    ├── Google OAuth / Calendar
    └── Provedor de IA (assistente)
```

Em produção, `/api/*` é reescrito para a função Netlify `api` ([`netlify.toml`](netlify.toml)).

O servidor identifica o usuário **somente pela sessão** (cookie), nunca por um `user_id` enviado pelo cliente. Escritas exigem CSRF.

## Partes do projeto (explicação)

### Front-end

| Pasta / arquivos | Função |
|---|---|
| `*.html` | Páginas MPA (`index`, `tarefas`, `financeiro`, `agenda`, `favoritos`, `assistente`, `personalizar`, `landing`) |
| `src/entradas/` | Boot de cada página (CSS + `exigirLogin` + import da página) |
| `src/pages/` | Lógica de tela; monta/atualiza o **DOM** com os dados da API |
| `src/modules/` | Widgets reutilizáveis (shell/menu, clima, agenda, assistente, PDF…) |
| `src/services/` | Cliente HTTP (`api.js` + `*Api.js`), auth/guarda, storage |
| `src/styles/` | CSS **mobile-first** por área |

### Back-end

| Pasta | Função |
|---|---|
| `server/app.js` | Monta o app Express e monta as rotas `/api` |
| `server/routes/` | Endpoints REST (auth, tarefas, transações, cartões, eventos, assistente…) |
| `server/services/` | Regras de negócio (Google, sync do calendário, assistente) |
| `server/repositories/` | Acesso SQL ao Neon |
| `server/middleware/` | Sessão, CSRF/origem, rate limit, erros |
| `server/dev.js` | Sobe a API local (`npm run dev:api`) |
| `shared/` | Regras puras compartilhadas front + API (ex.: cartões) |

### Infra e ops

| Pasta | Função |
|---|---|
| `netlify/functions/` | `api.js` (Express) + `calendar-sync.js` (cron 15 min) |
| `db/migrations/` | SQL aditivo (`001`…`010`) |
| `scripts/` | `migrate.js`, `gerar-chaves.js` |
| `tests/` | Suíte Vitest (API + regras) |

## Rodando localmente

Requisitos: Node.js ≥ 20.6, Neon e Google Cloud. Detalhes em [docs/DEPLOY.md](docs/DEPLOY.md).

```bash
npm install
copy .env.example .env        # Windows  |  macOS/Linux: cp .env.example .env
npm run gerar-chaves          # cole SESSION_SECRET e TOKEN_ENCRYPTION_KEY no .env
# preencha DATABASE_URL, Google OAuth, etc. (veja docs/DEPLOY.md)
npm run migrate
npm run dev:api               # terminal 1: API em http://127.0.0.1:3001
npm run dev                   # terminal 2: site em http://127.0.0.1:5173
```

Abra **http://127.0.0.1:5173** (não `localhost`): o OAuth usa esse endereço.

```bash
npm test                      # testes automatizados
```

## Produção (Netlify)

1. Configure as variáveis no painel (espelhando `.env.example`).
2. `APP_URL` = URL HTTPS do site; `ALLOWED_EMAILS` e `CRON_SECRET` obrigatórios em produção.
3. Cadastre os redirects OAuth de produção no Google Cloud.
4. Deploy: conecte o Git ou `npx netlify deploy --prod --build`.

Passo a passo: [docs/DEPLOY.md](docs/DEPLOY.md).

## Segurança (resumo)

- Segredos só no servidor; o navegador não recebe tokens do Google.
- Sessão `HttpOnly` / `Secure` / `SameSite=Lax` (`__Host-` em produção).
- CSRF + verificação de `Origin`/`Referer` nas escritas.
- Acesso restrito por e-mail (`ALLOWED_EMAILS`).
- SQL parametrizado, validação Zod, refresh token do Calendar criptografado (AES-GCM).

## Google Calendar: comportamento

- Sync ao abrir a agenda, ao focar a aba, após escrita local e a cada 15 min (cron).
- Não é tempo real; lembretes usam as notificações nativas do Google.
- Conflitos: vence a alteração mais recente; exclusão no Google prevalece.

## Limitações conhecidas

- Fotos de perfil no PostgreSQL (até 600 KB).
- Sem push `watch` do Calendar.
- Uso para contas autorizadas (lista de e-mails).

## Estrutura do repositório

```
*.html             páginas Vite (MPA)
src/entradas/      boot de cada HTML
src/pages/         lógica de tela + DOM
src/modules/       widgets (shell, clima, assistente…)
src/services/      fetch / api / guarda
src/styles/        CSS mobile-first
shared/            regras puras front+API
server/            Express (routes → services → repositories)
netlify/functions/ api.js + calendar-sync.js
db/migrations/     SQL versionado
scripts/           migrate + gerar-chaves
tests/             Vitest + PGlite
docs/              API.md, EXEMPLOS-FETCH.md, DEPLOY.md
```
