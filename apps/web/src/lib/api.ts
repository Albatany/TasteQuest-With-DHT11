import { useQuery } from '@tanstack/react-query'
import type { UseQueryOptions } from '@tanstack/react-query'
import type { DeviceInfo, LiveState, Product, Settings, Source } from '@tastequest/shared'

// Empty = same origin (recommended: the server serves the dashboard).
const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init: Omit<RequestInit, 'body'> & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init
  let res: Response
  try {
    res = await fetch(BASE + path, {
      signal: AbortSignal.timeout(8000),
      ...rest,
      headers: json !== undefined ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: json !== undefined ? JSON.stringify(json) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Server tidak dapat dihubungi. Periksa koneksi Wi-Fi / server.')
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Permintaan gagal (HTTP ${res.status})`)
  return data as T
}

export type AppSettings = Settings & { resetSeq: number }

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api<AppSettings>('/api/settings') })
export const useSource = (): Source | undefined => useSettings().data?.displayMode
export const useAuth = () => useQuery({ queryKey: ['auth'], queryFn: () => api<{ operator: boolean }>('/api/auth/me') })
export const useIsOperator = () => useAuth().data?.operator === true
export const useProducts = () => useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })

/** Query scoped to a data source (DEMO/LIVE); cache key includes the source. */
export function useSourced<T>(key: string, path: string, source: Source | undefined, opts: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({
    queryKey: [key, source, path],
    queryFn: () => api<T>(`${path}${path.includes('?') ? '&' : '?'}source=${source}`),
    enabled: !!source,
    ...opts,
  })
}

export const useDevices = (source: Source | undefined) => useSourced<DeviceInfo[]>('devices', '/api/devices', source, { refetchInterval: 5000 })

/** Latest live telemetry for the source; kept fresh by Socket.IO pushes (see socket.ts). */
export const useLive = (source: Source | undefined) =>
  useQuery({ queryKey: ['live', source], queryFn: () => api<LiveState[]>(`/api/live?source=${source}`), enabled: !!source })
