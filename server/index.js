import { carregarConfig } from './config.js'
import { criarBancoNeon } from './db/neon.js'
import { criarApp } from './app.js'

let cache
export function obterServidor() {
  if (!cache) {
    const config = carregarConfig()
    cache = criarApp({ config, db: criarBancoNeon(config.databaseUrl) })
  }
  return cache
}
