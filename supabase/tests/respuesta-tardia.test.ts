// Auditoría del tiempo límite de 8 s (PROY): el cliente deja de esperar, pero el servidor termina el cálculo.
// Se comprueba que no queden predicciones contradictorias, que los reintentos no dupliquen filas vigentes, que una
// respuesta tardía no se mezcle con el resultado de respaldo y que la bitácora distinga cálculos normales, respaldos
// y respuestas tardías.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { como, crearBaseDePrueba, errorDe, filas } from './db'

let db: PGlite
const ids = {
  junta: '00000000-0000-4000-8000-0000000000b1', admin: '10000000-0000-4000-8000-0000000000b1',
  u1: '30000000-0000-4000-8000-0000000000b1', u2: '30000000-0000-4000-8000-0000000000b2',
}
let periodo = ''
const comoAdmin = () => como(db, { tipo: 'usuario', id: ids.admin })
const comoPostgres = () => como(db, { tipo: 'postgres' })
const calcular = async () => { await comoAdmin(); return (await filas<{ r: { lote: string; respaldo: number } }>(db, 'select public.calcular_riesgo_periodo($1, $2::date) as r', [ids.junta, periodo]))[0].r }
const falla = async (activa: boolean) => { await comoAdmin(); await db.query('select public.simular_falla_modelo($1, $2)', [ids.junta, activa]) }
const vigentesPorCuota = async () => {
  await comoPostgres()
  return filas<{ cuota_id: string; n: number; origenes: string }>(db, `
    select cuota_id, count(*)::int as n, string_agg(origen, ',' order by origen) as origenes
    from public.predicciones_morosidad where junta_id = $1 group by cuota_id, fecha_corte`, [ids.junta])
}

beforeAll(async () => {
  db = await crearBaseDePrueba()
  periodo = (await filas<{ m: string }>(db, `select (date_trunc('month', public.hoy_lima()) + interval '1 month')::date::text as m`))[0].m
  await db.exec(`
    insert into public.juntas (id, nombre, cuota_mensual, dia_vencimiento, es_simulado, modo_demo) values ('${ids.junta}', 'Junta tardía', 150, 5, true, true);
    insert into public.juntas_invitacion (junta_id, codigo) values ('${ids.junta}', 'TARDIA001');
    insert into public.unidades (id, junta_id, codigo, es_simulado) values ('${ids.u1}', '${ids.junta}', 'Casa 01', true), ('${ids.u2}', '${ids.junta}', 'Casa 02', true);
    insert into auth.users (id, email, raw_user_meta_data) values ('${ids.admin}', 'admin-tardia@ejemplo.test', '{"nombre_completo":"admin","acepto_datos":"true"}');
    insert into public.miembros_junta (junta_id, perfil_id, rol) values ('${ids.junta}', '${ids.admin}', 'admin');`)
  await comoAdmin()
  for (const atras of [2, 1]) await db.query(`select public.generar_cuotas($1, (date_trunc('month', public.hoy_lima()) - make_interval(months => $2))::date)`, [ids.junta, atras])
  await db.query('select public.generar_cuotas($1, $2::date)', [ids.junta, periodo])
})

describe('Respuestas repetidas y tardías', () => {
  it('reintentar el mismo cálculo no duplica predicciones vigentes', async () => {
    await calcular(); await calcular(); await calcular()
    expect((await vigentesPorCuota()).every(x => x.n === 1)).toBe(true)
  })

  it('el modelo y la regla de respaldo nunca quedan vigentes a la vez para la misma cuota y corte', async () => {
    await falla(true); await calcular()          // respaldo
    await falla(false); await calcular()         // modelo de nuevo
    const v = await vigentesPorCuota()
    expect(v).toHaveLength(2)
    expect(v.map(x => [x.n, x.origenes])).toEqual([[1, 'modelo'], [1, 'modelo']])
  })

  it('el último cálculo manda: un respaldo posterior reemplaza al modelo en la misma fila (el recordatorio conserva su vínculo)', async () => {
    await comoPostgres()
    const [antes] = await filas<{ id: string; cuota_id: string }>(db, `select id, cuota_id from public.predicciones_morosidad where junta_id = $1 order by cuota_id limit 1`, [ids.junta])
    await comoAdmin()
    await db.query(`select public.registrar_recordatorio($1, 'llamada')`, [antes.cuota_id])
    await falla(true); await calcular(); await falla(false)
    await comoPostgres()
    const [despues] = await filas<{ id: string; origen: string }>(db, `select id, origen from public.predicciones_morosidad where cuota_id = $1`, [antes.cuota_id])
    expect(despues).toEqual({ id: antes.id, origen: 'regla_respaldo' })
    const [rec] = await filas<{ prediccion_id: string }>(db, `select prediccion_id from public.recordatorios where cuota_id = $1`, [antes.cuota_id])
    expect(rec.prediccion_id).toBe(antes.id)
  })

  it('la base impide dos filas vigentes para la misma cuota y corte, aunque se inserten a mano', async () => {
    await comoPostgres()
    // Se inserta con el OTRO modelo (distinto del de la fila vigente): solo la restricción por cuota y corte lo impide.
    const err = await errorDe(db, `insert into public.predicciones_morosidad (junta_id, cuota_id, modelo_id, fecha_corte, probabilidad, prediccion, nivel_riesgo, entrada)
      select p.junta_id, p.cuota_id, (select m.id from public.modelos_ml m where m.version in ('v1', 'regla-respaldo') and m.id <> p.modelo_id),
        p.fecha_corte, 0.5, 1, 'alto', '{}'::jsonb
      from public.predicciones_morosidad p where p.junta_id = $1 limit 1`, [ids.junta])
    expect(err).toMatch(/duplicate key|llave duplicada|unique/i)
  })

  it('la bitácora agrupa cada cálculo en un lote y distingue modelo, respaldo y respuesta tardía', async () => {
    // Un cálculo que llega 8,2 s después de iniciada la solicitud (el cliente ya dejó de esperar).
    await comoAdmin()
    await db.exec('begin')
    await db.query('select pg_sleep(8.2)')
    const [{ r }] = await filas<{ r: { lote: string } }>(db, 'select public.calcular_riesgo_periodo($1, $2::date) as r', [ids.junta, periodo])
    await db.exec('commit')
    await comoPostgres()
    const lotes = await filas<{ lote: string; origen: string; n: number; tardio: boolean }>(db, `
      select lote::text, origen, count(*)::int as n, bool_and(demora_ms > 8000) as tardio
      from public.registro_predicciones where junta_id = $1 and tipo = 'cuota' group by lote, origen order by min(registrado_en)`, [ids.junta])
    expect(new Set(lotes.map(x => x.lote)).size).toBe(lotes.length)          // un lote por cálculo
    expect(lotes.every(x => x.n === 2)).toBe(true)                            // dos cuotas por lote
    expect(lotes.some(x => x.origen === 'regla_respaldo')).toBe(true)
    const ultimo = lotes[lotes.length - 1]
    expect(ultimo).toMatchObject({ lote: r.lote, origen: 'modelo', tardio: true })
    expect(lotes.slice(0, -1).every(x => !x.tardio)).toBe(true)
  }, 20000)

  it('los cálculos de una misma junta se ejecutan de a uno (bloqueo por junta)', async () => {
    await comoPostgres()
    const [{ def }] = await filas<{ def: string }>(db, `select pg_get_functiondef('public.ml_calcular(uuid, date, integer, date)'::regprocedure) as def`)
    expect(def).toMatch(/pg_advisory_xact_lock/)
  })
})
