import { useEffect, useState } from 'react'
import { useApp } from '../store'

/**
 * Llama a una función RPC de solo lectura y vuelve a llamarla cuando cambian las claves o los datos
 * de la junta (por ejemplo, tras aprobar un pago o recibir un cambio en tiempo real).
 */
export function useRpc<T>(fn: string, args: Record<string, unknown> | null, claves: unknown[] = []) {
  const { rpc, datos } = useApp()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const firma = JSON.stringify(args)

  useEffect(() => {
    if (!args) return
    let activo = true
    setCargando(true)
    rpc<T>(fn, args).then(r => {
      if (!activo) return
      if (r.ok) { setData(r.data); setError('') } else setError(r.error)
      setCargando(false)
    })
    return () => { activo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, firma, datos.cuotas, datos.pagos, datos.egresos, ...claves])

  return { data, error, cargando }
}
