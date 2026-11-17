// Utilidades para probar las migraciones con PGlite (Postgres en WebAssembly).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const raiz = join(import.meta.dirname, '..')

export type Identidad = { tipo: 'anon' } | { tipo: 'usuario'; id: string } | { tipo: 'servicio' } | { tipo: 'postgres' }

export async function crearBaseDePrueba() {
  const db = new PGlite()
  await db.exec(readFileSync(join(raiz, 'tests', 'supabase-stubs.sql'), 'utf8'))
  const migraciones = readdirSync(join(raiz, 'migrations')).filter(f => f.endsWith('.sql')).sort()
  for (const archivo of migraciones) {
    try {
      await db.exec(readFileSync(join(raiz, 'migrations', archivo), 'utf8'))
    } catch (error) {
      throw new Error(`Falló la migración ${archivo}: ${(error as Error).message}`)
    }
  }
  return db
}

export async function como(db: PGlite, identidad: Identidad) {
  await db.exec('reset role')
  if (identidad.tipo === 'postgres') {
    await db.query(`select set_config('request.jwt.claims', '', false)`)
    return
  }
  const claims =
    identidad.tipo === 'usuario' ? { sub: identidad.id, role: 'authenticated' }
      : identidad.tipo === 'servicio' ? { role: 'service_role' }
        : { role: 'anon' }
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)])
  const rol = identidad.tipo === 'usuario' ? 'authenticated' : identidad.tipo === 'servicio' ? 'service_role' : 'anon'
  await db.exec(`set role ${rol}`)
}

/** Ejecuta una consulta y devuelve las filas. */
export async function filas<T = Record<string, unknown>>(db: PGlite, sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows
}

/** Ejecuta y devuelve el mensaje de error (o null si no falló). */
export async function errorDe(db: PGlite, sql: string, params: unknown[] = []) {
  try {
    await db.query(sql, params)
    return null
  } catch (error) {
    return (error as Error).message
  }
}
