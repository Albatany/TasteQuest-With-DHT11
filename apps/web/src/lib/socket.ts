import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { io } from 'socket.io-client'
import type { LiveState } from '@tastequest/shared'

export const socket = io(import.meta.env.VITE_SOCKET_URL || undefined, { autoConnect: false })

/** Connects once at app root and keeps the query cache in sync with server pushes. */
export function useRealtime() {
  const qc = useQueryClient()
  const wasConnected = useRef(false)
  useEffect(() => {
    const invalidate = (...keys: string[]) => () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
    // Socket payloads are untyped at the transport boundary; each handler declares its shape.
    const handlers: Record<string, (data: any) => void> = {
      connect: () => {
        if (wasConnected.current) qc.invalidateQueries() // catch up after a reconnect
        wasConnected.current = true
      },
      telemetry: (t: LiveState) => qc.setQueryData<LiveState[]>(['live', t.source], (old = []) => [t, ...old.filter((o) => o.deviceId !== t.deviceId)]),
      'game:started': invalidate('games', 'events'),
      'round:completed': invalidate('events'),
      'game:completed': invalidate('leaderboard', 'overview', 'games', 'events'),
      'leaderboard:updated': invalidate('leaderboard', 'games'),
      'feedback:submitted': invalidate('feedback-stats', 'overview', 'events'),
      'device:status': invalidate('devices', 'overview', 'events', 'live'),
      'settings:changed': (s: unknown) => qc.setQueryData(['settings'], s),
      'product:changed': invalidate('products', 'settings'),
      'data:cleared': () => qc.invalidateQueries(),
    }
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler)
    socket.connect()
    return () => {
      for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler)
    }
  }, [qc])
}

export const useSocketConnected = () =>
  useSyncExternalStore(
    (cb) => {
      socket.on('connect', cb)
      socket.on('disconnect', cb)
      return () => {
        socket.off('connect', cb)
        socket.off('disconnect', cb)
      }
    },
    () => socket.connected,
  )

export function useSocketEvent<T>(event: string, handler: (data: T) => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const fn = (data: T) => ref.current(data)
    socket.on(event, fn)
    return () => {
      socket.off(event, fn)
    }
  }, [event])
}
