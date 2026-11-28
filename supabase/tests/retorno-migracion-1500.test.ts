// Procedimiento de retorno de la migración 1500: aplicar → usar → revertir → comparar con la base de la 1400 →
// volver a aplicar. Garantiza que el script de supabase/rollback/ deja el esquema igual al anterior.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { como, filas } from './db'

const raiz = join(import.meta.dirname, '..')
const M1500 = '20261126001500_flujo_prediccion_e2e.sql'
const leer = (...p: string[]) => readFileSync(join(raiz, ...p), 'utf8')

async function base(incluir1500: boolean) {
  const db = new PGlite()
  await db.exec(leer('tests', 'supabase-stubs.sql'))
  for (const f of readdirSync(join(raiz, 'migrations')).filter(f => f.endsWith('.sql')).sort()) {
    if (f === M1500 && !incluir1500) continue
    await db.exec(leer('migrations', f))
  }
  return db
}

/** Huella del esquema público: funciones (definición y permisos), columnas, restricciones, disparadores y políticas. */
async function esquema(db: PGlite) {
  await como(db, { tipo: 'postgres' })
  const q = async (sql: string) => (await filas<{ x: string }>(db, sql)).map(r => r.x)
  return {
    funciones: await q(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(replace(pg_get_functiondef(p.oid), chr(13), '')) || ' ' || coalesce(p.proacl::text, '') as x
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`),
    columnas: await q(`select table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '') as x
      from information_schema.columns where table_schema = 'public' order by 1`),
    restricciones: await q(`select conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid) as x
      from pg_constraint where connamespace = 'public'::regnamespace order by 1`),
    disparadores: await q(`select tgrelid::regclass::text || ' ' || tgname as x from pg_trigger t
      join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal order by 1`),
    politicas: await q(`select tablename || ' ' || policyname || ' ' || coalesce(qual, '') as x from pg_policies where schemaname = 'public' order by 1`),
  }
}

describe('Retorno de la migración 1500', () => {
  it('revierte el esquema exactamente al de la 1400 y permite volver a aplicarla', async () => {
    const antes = await esquema(await base(false))
    const db = await base(true)

    // Uso real antes de revertir: predicciones del modelo, de respaldo, bitácora y un recordatorio.
    const junta = '00000000-0000-4000-8000-0000000000c1', admin = '10000000-0000-4000-8000-0000000000c1'
    await db.exec(`insert into public.juntas (id, nombre, cuota_mensual, dia_vencimiento, es_simulado, modo_demo) values ('${junta}', 'Junta retorno', 150, 5, true, true);
      insert into public.juntas_invitacion (junta_id, codigo) values ('${junta}', 'RETORNO01');
      insert into public.unidades (junta_id, codigo, es_simulado) values ('${junta}', 'Casa 01', true);
      insert into auth.users (id, email, raw_user_meta_data) values ('${admin}', 'admin-retorno@ejemplo.test', '{"nombre_completo":"admin","acepto_datos":"true"}');
      insert into public.miembros_junta (junta_id, perfil_id, rol) values ('${junta}', '${admin}', 'admin');`)
    await como(db, { tipo: 'usuario', id: admin })
    const [{ s }] = await filas<{ s: string }>(db, `select (date_trunc('month', public.hoy_lima()) + interval '1 month')::date::text as s`)
    await db.query('select public.generar_cuotas($1, $2::date)', [junta, s])
    await db.query('select public.calcular_riesgo_periodo($1, $2::date)', [junta, s])
    await db.query('select public.simular_falla_modelo($1, true)', [junta])
    await db.query('select public.calcular_riesgo_periodo($1, $2::date)', [junta, s])
    const [{ cuota_id }] = await filas<{ cuota_id: string }>(db, 'select cuota_id from public.predicciones_vigentes($1)', [junta])
    await db.query(`select public.registrar_recordatorio($1, 'llamada')`, [cuota_id])
    // Una segunda cuota (corte de otro día) queda calculada por el modelo, para comprobar que el retorno la conserva.
    await db.query('select public.simular_falla_modelo($1, false)', [junta])
    await como(db, { tipo: 'postgres' })
    await db.query(`insert into public.predicciones_morosidad (junta_id, cuota_id, modelo_id, fecha_corte, probabilidad, prediccion, nivel_riesgo, entrada)
      select junta_id, cuota_id, (select id from public.modelos_ml where version = 'v1'), fecha_corte - 1, 0.3, 1, 'alto', '{}'::jsonb
      from public.predicciones_morosidad limit 1`)

    await db.exec(leer('rollback', '20261126001500_revertir_flujo_prediccion_e2e.sql'))
    expect(await esquema(db)).toEqual(antes)
    // Limitación documentada: el retorno elimina las predicciones de respaldo; las del modelo se conservan.
    const quedan = await filas<{ n: number; nulas: number }>(db, 'select count(*)::int as n, count(*) filter (where probabilidad is null)::int as nulas from public.predicciones_morosidad')
    expect(quedan[0]).toEqual({ n: 1, nulas: 0 })

    // Volver a aplicar la 1500 sobre la base revertida funciona y el flujo responde.
    await db.exec(leer('migrations', M1500))
    await como(db, { tipo: 'usuario', id: admin })
    const [{ r }] = await filas<{ r: { cuotas: number; respaldo: number } }>(db, 'select public.calcular_riesgo_periodo($1, $2::date) as r', [junta, s])
    expect(r).toMatchObject({ cuotas: 1, respaldo: 0 })
  })
})
