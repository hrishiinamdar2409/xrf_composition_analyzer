 import { useEffect, useRef } from 'react'

/**
 * Connects to the server WebSocket at /ws and calls onMessage for each event.
 * Automatically reconnects on disconnect.
 */
export function useWebSocket(onMessage) {
  const wsRef = useRef(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    let reconnectTimer = null

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws`)
      wsRef.current = ws

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data)
          onMessageRef.current(data)
        } catch (_) {}
      }

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, [])
}
