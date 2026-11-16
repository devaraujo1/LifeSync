import { iniciarShell, mostrarAviso } from '../modules/shell.js'
import { iniciarPersonalizarUI, templatePersonalizar } from '../modules/personalizar-ui.js'

iniciarShell({ pagina: 'personalizar' })

const raiz = document.querySelector('#personalizar-root')
if (raiz) {
  raiz.innerHTML = templatePersonalizar()
  iniciarPersonalizarUI(raiz, { avisar: mostrarAviso })
}
