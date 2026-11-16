import { icon, injetarIcones } from './icons.js'
import { EVENTO, aplicarPreferencias, fotoPerfil, nomeExibicao } from './preferencias.js'
import { iniciarMotion } from './motion.js'
import { encerrarSessao } from '../services/conta.js'
import { escaparHTML } from '../services/storage.js'
import { iniciarAssistenteUI } from './assistente-ui.js'

const MENU_KEY = 'lifesync-menu'

const LINKS = [
  { id: 'inicio', href: 'index.html', icone: 'home', texto: 'Workspace' },
  { id: 'assistente', href: 'assistente.html', icone: 'sparkles', texto: 'Assistente' },
  { id: 'tarefas', href: 'tarefas.html', icone: 'tasks', texto: 'Tarefas' },
  { id: 'agenda', href: 'agenda.html', icone: 'calendar', texto: 'Agenda' },
  { id: 'favoritos', href: 'favoritos.html', icone: 'bookmark', texto: 'Favoritos' },
  { id: 'financeiro', href: 'financeiro.html', icone: 'dollar', texto: 'Financeiro' }
]

function lerMenu() {
  try {
    return localStorage.getItem(MENU_KEY) === 'open'
  } catch {
    return false
  }
}

function salvarMenu(aberto) {
  try {
    localStorage.setItem(MENU_KEY, aberto ? 'open' : 'closed')
  } catch {
    /* armazenamento indisponível: segue sem persistir */
  }
}

function avatarHTML() {
  const foto = fotoPerfil()
  return foto
    ? `<img src="${escaparHTML(foto)}" alt="" />`
    : `<span>${escaparHTML(nomeExibicao().charAt(0).toUpperCase())}</span>`
}

function templateSidebar() {
  const itens = LINKS.map(
    (l) => `
      <a class="nav-item" href="${l.href}" data-nav="${l.id}" title="${l.texto}">
        ${icon(l.icone)}<span class="nav-label">${l.texto}</span>
      </a>`
  ).join('')

  return `
    <aside class="sidebar" id="sidebar" aria-label="Menu LifeSync">
      <div class="sidebar-head">
        <a class="brand-lockup" href="index.html" title="LifeSync" aria-label="LifeSync">
          <img class="brand-mark" src="/brand/lifesync-mark.svg" alt="" width="28" height="28" />
          <span class="brand-wordmark"><span class="brand-life">Life</span><span class="brand-sync">Sync</span></span>
        </a>
        <button class="icon-btn sidebar-chevron" id="sidebar-chevron" type="button"
          aria-controls="sidebar" aria-expanded="false" aria-label="Abrir menu">
          ${icon('chevron-right')}
        </button>
      </div>

      <nav class="sidebar-nav">${itens}</nav>

      <div class="sidebar-foot">
        <a class="nav-item sidebar-profile-btn" id="avatar-btn" href="personalizar.html"
          data-nav="personalizar" title="Meu Perfil" aria-label="Meu perfil e personalização">
          <span class="avatar-face sidebar-avatar">${avatarHTML()}</span>
          <span class="nav-label">Meu Perfil</span>
        </a>
        <button class="nav-item sidebar-logout" id="logout-btn" type="button" data-action="logout"
          title="Sair" aria-label="Sair da conta">
          ${icon('logout')}<span class="nav-label">Sair</span>
        </button>
      </div>
    </aside>`
}

function templateExtras() {
  return `
    <button class="menu-fab icon-btn" id="menu-fab" type="button"
      aria-controls="sidebar" aria-expanded="false" aria-label="Abrir menu">
      ${icon('menu')}
    </button>
    <div class="sidebar-backdrop" id="sidebar-backdrop" hidden></div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>`
}

export function mostrarAviso(texto) {
  const toast = document.querySelector('#toast')
  if (!toast) return
  toast.textContent = texto
  toast.classList.add('is-visible')
  clearTimeout(mostrarAviso.timer)
  mostrarAviso.timer = setTimeout(() => toast.classList.remove('is-visible'), 2200)
}

export function iniciarShell({ pagina }) {
  injetarIcones()

  const app = document.querySelector('.app')
  if (!app) return

  app.insertAdjacentHTML('afterbegin', templateSidebar())
  app.insertAdjacentHTML('beforeend', templateExtras())

  const chevron = app.querySelector('#sidebar-chevron')
  const menuFab = app.querySelector('#menu-fab')
  const backdrop = app.querySelector('#sidebar-backdrop')

  const telaPequena = window.matchMedia('(max-width: 699.98px)')

  function definirMenu(aberto, { persistir = true } = {}) {
    app.classList.toggle('menu-open', aberto)
    const label = aberto ? 'Recolher menu' : 'Abrir menu'
    for (const btn of [chevron, menuFab]) {
      if (!btn) continue
      btn.setAttribute('aria-expanded', String(aberto))
      btn.setAttribute('aria-label', label)
    }
    if (backdrop) backdrop.hidden = !(telaPequena.matches && aberto)
    if (persistir) salvarMenu(aberto)
    if (aberto) referenciaRolagem = window.scrollY
  }

  let referenciaRolagem = window.scrollY
  const alternar = () => definirMenu(!app.classList.contains('menu-open'))
  chevron?.addEventListener('click', alternar)
  menuFab?.addEventListener('click', alternar)
  backdrop?.addEventListener('click', () => definirMenu(false))

  definirMenu(telaPequena.matches ? false : lerMenu(), { persistir: false })

  const DISTANCIA_PARA_RECOLHER = 48
  let aguardandoQuadro = false
  window.addEventListener(
    'scroll',
    () => {
      if (aguardandoQuadro || !app.classList.contains('menu-open')) return
      if (telaPequena.matches) return
      aguardandoQuadro = true
      requestAnimationFrame(() => {
        aguardandoQuadro = false
        if (!app.classList.contains('menu-open') || telaPequena.matches) return
        const y = window.scrollY
        if (y - referenciaRolagem > DISTANCIA_PARA_RECOLHER) definirMenu(false, { persistir: false })
        else if (y < referenciaRolagem) referenciaRolagem = y
      })
    },
    { passive: true }
  )

  app.querySelector('#sidebar')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-nav]')) definirMenu(false)
  })
  window.addEventListener('hashchange', () => definirMenu(false, { persistir: false }))

  document.addEventListener('click', (e) => {
    if (
      telaPequena.matches &&
      app.classList.contains('menu-open') &&
      !e.target.closest('#sidebar') &&
      !e.target.closest('#menu-fab')
    ) {
      definirMenu(false)
    }
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && telaPequena.matches && app.classList.contains('menu-open')) {
      definirMenu(false)
    }
  })
  telaPequena.addEventListener('change', (e) => {
    if (e.matches) definirMenu(false, { persistir: false })
    else definirMenu(lerMenu(), { persistir: false })
  })

  function marcarAtivo() {
    const hash = location.hash.replace('#', '')
    const ativo = hash && LINKS.some((l) => l.id === hash) ? hash : pagina
    app.querySelectorAll('[data-nav]').forEach((a) => {
      const atual = a.dataset.nav === ativo
      a.classList.toggle('active', atual)
      if (atual) a.setAttribute('aria-current', 'page')
      else a.removeAttribute('aria-current')
    })
  }
  marcarAtivo()
  window.addEventListener('hashchange', marcarAtivo)

  window.addEventListener(EVENTO, () => {
    const face = app.querySelector('.avatar-face')
    if (face) face.innerHTML = avatarHTML()
  })

  aplicarPreferencias()
  iniciarMotion(document)
  if (pagina !== 'assistente') iniciarAssistenteUI({ avisar: mostrarAviso })

  app.querySelector('#logout-btn')?.addEventListener('click', async (e) => {
    const botao = e.currentTarget
    botao.disabled = true
    try {
      await encerrarSessao()
    } catch {
      botao.disabled = false
      mostrarAviso('Não foi possível sair agora. Tente novamente.')
    }
  })
}
