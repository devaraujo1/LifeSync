import { perfil } from '../config.js'
import { icon } from './icons.js'
import { escaparHTML } from '../services/storage.js'
import { blobParaDataURL, redimensionarImagem } from '../services/imagens.js'
import {
  CARTOES,
  DESTAQUES,
  EVENTO,
  atualizarPreferencias,
  fotoPerfil,
  lerPreferencias,
  nomeExibicao,
  restaurarPadroes
} from './preferencias.js'
import { buscarCidade } from './weather.js'
import { usuarioLogado } from '../services/api.js'
import { encerrarSessao } from '../services/conta.js'

/* Formulário de conta, perfil, aparência e preferências — usado em personalizar.html. */

function segmentado(nome, opcoes) {
  const botoes = opcoes
    .map((o) => `<button type="button" data-valor="${o.valor}" aria-pressed="false">${o.texto}</button>`)
    .join('')
  return `<div class="toggle-group" role="group" aria-label="${nome}" data-grupo="${nome}">${botoes}</div>`
}

function linhaSwitch(id, texto) {
  return `
    <label class="switch-row">
      <span>${texto}</span>
      <input class="switch" type="checkbox" role="switch" data-switch="${id}" />
    </label>`
}

export function templatePersonalizar() {
  const cores = DESTAQUES.map(
    (d) => `
      <button class="swatch" type="button" data-destaque="${d.id}" style="--swatch:${d.cor}"
        aria-pressed="false" aria-label="${d.nome}" title="${d.nome}">${icon('check')}</button>`
  ).join('')

  const grupos = [...new Set(CARTOES.map((c) => c.grupo))]
    .map(
      (grupo) => `
      <div class="switch-group">
        <p class="switch-group-title">${grupo}</p>
        ${CARTOES.filter((c) => c.grupo === grupo)
          .map((c) => linhaSwitch(`cartao:${c.id}`, c.nome))
          .join('')}
      </div>`
    )
    .join('')

  return `
    <section class="prefs-card" aria-labelledby="sec-conta">
      <h2 id="sec-conta">Conta</h2>
      <p class="drawer-note" id="conta-email"></p>
      <button class="btn btn-sm" id="conta-sair" type="button">Sair da conta</button>
      <p class="drawer-note" id="conta-nota" role="status"></p>
    </section>

    <section class="prefs-card" aria-labelledby="sec-perfil">
      <h2 id="sec-perfil">Perfil</h2>
      <div class="profile-edit">
        <button class="profile-photo" id="profile-photo-btn" type="button" aria-label="Alterar foto de perfil"></button>
        <div class="profile-photo-actions">
          <button class="btn btn-sm" id="profile-photo-pick" type="button">${icon('camera')}Alterar foto</button>
          <button class="link-btn" id="profile-photo-remove" type="button">Remover foto</button>
        </div>
        <input id="profile-photo-input" type="file" accept="image/*" hidden />
      </div>
      <label class="field">
        Nome
        <input id="profile-name" type="text" maxlength="40" autocomplete="off" placeholder="${escaparHTML(perfil.nome)}" />
      </label>
      <p class="drawer-note" id="profile-note" role="status"></p>
    </section>

    <section class="prefs-card" aria-labelledby="sec-aparencia">
      <h2 id="sec-aparencia">Aparência</h2>
      <div class="field">
        Cor de destaque (botões e cartões)
        <div class="swatches" role="group" aria-label="Cor de destaque">${cores}</div>
      </div>
      <div class="field">
        Fundo
        ${segmentado('Fundo', [
          { valor: 'animado', texto: 'Animado' },
          { valor: 'estatico', texto: 'Estático' },
          { valor: 'desligado', texto: 'Sem efeito' }
        ])}
        <p class="drawer-note">Afeta só o fundo; a cor de destaque pinta botões e cartões.</p>
      </div>
      <div class="field">
        Densidade
        ${segmentado('Densidade', [
          { valor: 'confortavel', texto: 'Confortável' },
          { valor: 'compacta', texto: 'Compacta' }
        ])}
        <p class="drawer-note">Espaçamento dos painéis, menu e textos de apoio.</p>
      </div>
    </section>

    <section class="prefs-card" aria-labelledby="sec-prefs">
      <h2 id="sec-prefs">Preferências</h2>
      <div class="field">
        Formato da hora
        ${segmentado('Hora', [
          { valor: '24', texto: '24 horas' },
          { valor: '12', texto: '12 horas' }
        ])}
      </div>
      <div class="field">
        Semana do calendário começa em
        ${segmentado('Semana', [
          { valor: '0', texto: 'Domingo' },
          { valor: '1', texto: 'Segunda' }
        ])}
      </div>
      ${linhaSwitch('clima:ativo', 'Mostrar clima na saudação')}
      <div class="field">
        Unidade de temperatura
        ${segmentado('Unidade', [
          { valor: 'C', texto: '°C' },
          { valor: 'F', texto: '°F' }
        ])}
      </div>
      <div class="field">
        Local do clima
        <div class="inline-field">
          <input id="weather-city" type="text" maxlength="60" autocomplete="off" placeholder="Buscar cidade" />
          <button class="btn btn-sm" id="weather-city-search" type="button">Buscar</button>
        </div>
        <p class="drawer-note" id="weather-city-note" role="status"></p>
        <button class="link-btn" id="weather-city-auto" type="button">${icon('map-pin')}Usar a localização do navegador</button>
      </div>
    </section>

    <section class="prefs-card" aria-labelledby="sec-cartoes">
      <h2 id="sec-cartoes">Página inicial</h2>
      <p class="drawer-note">Escolha o que aparece na página inicial.</p>
      ${grupos}
    </section>

    <section class="prefs-card prefs-card-foot">
      <button class="btn btn-danger btn-sm" id="prefs-reset" type="button">Restaurar padrões</button>
    </section>`
}

export function iniciarPersonalizarUI(raiz, { avisar }) {
  const campoNome = raiz.querySelector('#profile-name')
  const fotoBotao = raiz.querySelector('#profile-photo-btn')
  const fotoInput = raiz.querySelector('#profile-photo-input')
  const fotoRemover = raiz.querySelector('#profile-photo-remove')
  const nota = raiz.querySelector('#profile-note')
  const campoCidade = raiz.querySelector('#weather-city')
  const notaCidade = raiz.querySelector('#weather-city-note')
  const botaoBuscar = raiz.querySelector('#weather-city-search')
  const botaoAuto = raiz.querySelector('#weather-city-auto')

  raiz.querySelector('#conta-email').textContent = usuarioLogado()?.email ?? ''
  raiz.querySelector('#conta-sair').addEventListener('click', async () => {
    const notaConta = raiz.querySelector('#conta-nota')
    try {
      await encerrarSessao()
    } catch {
      notaConta.textContent = 'Não foi possível sair agora. Tente novamente.'
    }
  })

  function avatarConteudo() {
    const foto = fotoPerfil()
    return foto
      ? `<img src="${escaparHTML(foto)}" alt="" />`
      : `<span>${escaparHTML(nomeExibicao().charAt(0).toUpperCase())}</span>`
  }

  function desenharAvatar() {
    fotoBotao.innerHTML = `${avatarConteudo()}<span class="profile-photo-edit">${icon('camera')}</span>`
    fotoRemover.hidden = !lerPreferencias().foto
  }

  let temporizador
  const salvarNome = () => {
    clearTimeout(temporizador)
    if (!atualizarPreferencias({ nome: campoNome.value.trim() })) avisar('Não foi possível salvar o nome.')
  }
  campoNome.addEventListener('input', () => {
    clearTimeout(temporizador)
    temporizador = setTimeout(salvarNome, 300)
  })
  campoNome.addEventListener('blur', salvarNome)
  campoNome.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      salvarNome()
      avisar('Nome atualizado')
    }
  })

  const abrirSeletor = () => fotoInput.click()
  fotoBotao.addEventListener('click', abrirSeletor)
  raiz.querySelector('#profile-photo-pick').addEventListener('click', abrirSeletor)

  fotoInput.addEventListener('change', async () => {
    const arquivo = fotoInput.files?.[0]
    fotoInput.value = ''
    if (!arquivo) return

    try {
      const { blob } = await redimensionarImagem(arquivo, { largura: 256, altura: 256, modo: 'cobrir', qualidade: 0.88 })
      const dataUrl = await blobParaDataURL(blob)
      if (!atualizarPreferencias({ foto: dataUrl })) throw new Error('Não foi possível salvar a foto no navegador.')
      nota.textContent = ''
      avisar('Foto atualizada')
    } catch (erro) {
      nota.textContent = erro.message
    }
  })

  fotoRemover.addEventListener('click', () => {
    atualizarPreferencias({ foto: null })
    avisar('Foto removida')
  })

  raiz.querySelectorAll('[data-destaque]').forEach((botao) =>
    botao.addEventListener('click', () => atualizarPreferencias({ destaque: botao.dataset.destaque }))
  )

  const aoEscolher = {
    Fundo: (v) => ({ fundo: v }),
    Densidade: (v) => ({ densidade: v }),
    Hora: (v) => ({ hora24: v === '24' }),
    Semana: (v) => ({ inicioSemana: Number(v) }),
    Unidade: (v) => ({ clima: { unidade: v } })
  }

  raiz.querySelectorAll('[data-grupo]').forEach((grupo) =>
    grupo.addEventListener('click', (e) => {
      const botao = e.target.closest('[data-valor]')
      if (botao) atualizarPreferencias(aoEscolher[grupo.dataset.grupo](botao.dataset.valor))
    })
  )

  raiz.querySelectorAll('[data-switch]').forEach((chave) =>
    chave.addEventListener('change', () => {
      const [tipo, id] = chave.dataset.switch.split(':')
      atualizarPreferencias(tipo === 'cartao' ? { cartoes: { [id]: chave.checked } } : { clima: { [id]: chave.checked } })
    })
  )

  async function procurarCidade() {
    const consulta = campoCidade.value.trim()
    if (consulta.length < 2) {
      notaCidade.textContent = 'Digite o nome da cidade.'
      return
    }
    botaoBuscar.disabled = true
    notaCidade.textContent = 'Buscando...'
    try {
      const cidade = await buscarCidade(consulta)
      if (!cidade) {
        notaCidade.textContent = 'Nenhuma cidade encontrada.'
        return
      }
      atualizarPreferencias({ clima: { cidade } })
      campoCidade.value = ''
      avisar('Local do clima atualizado')
    } catch {
      notaCidade.textContent = 'Não foi possível buscar agora. Tente novamente.'
    } finally {
      botaoBuscar.disabled = false
    }
  }

  botaoBuscar.addEventListener('click', procurarCidade)
  campoCidade.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      procurarCidade()
    }
  })
  botaoAuto.addEventListener('click', () => {
    atualizarPreferencias({ clima: { cidade: null } })
    avisar('Usando a localização do navegador')
  })

  raiz.querySelector('#prefs-reset').addEventListener('click', () => {
    if (!confirm('Restaurar nome, foto, aparência e preferências para o padrão?')) return
    restaurarPadroes()
    avisar('Padrões restaurados')
  })

  function sincronizar() {
    const p = lerPreferencias()

    if (document.activeElement !== campoNome) campoNome.value = p.nome

    const marcar = (grupo, valor) =>
      raiz.querySelectorAll(`[data-grupo="${grupo}"] [data-valor]`).forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.valor === String(valor)))
      )

    raiz.querySelectorAll('[data-destaque]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.destaque === p.destaque))
    )
    marcar('Fundo', p.fundo)
    marcar('Densidade', p.densidade)
    marcar('Hora', p.hora24 ? '24' : '12')
    marcar('Semana', p.inicioSemana)
    marcar('Unidade', p.clima.unidade)

    raiz.querySelectorAll('[data-switch]').forEach((chave) => {
      const [tipo, id] = chave.dataset.switch.split(':')
      chave.checked = tipo === 'cartao' ? p.cartoes[id] !== false : Boolean(p.clima[id])
    })

    notaCidade.textContent = p.clima.cidade
      ? `Local atual: ${p.clima.cidade.nome}`
      : 'Usando a localização do navegador.'
    botaoAuto.hidden = !p.clima.cidade

    desenharAvatar()
  }

  window.addEventListener(EVENTO, sincronizar)
  sincronizar()
}
