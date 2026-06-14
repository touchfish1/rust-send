import { useEffect, useRef, useCallback } from "react"
import { useDeviceStore } from "@/stores/device-store"
import { useSettingsStore } from "@/stores/settings-store"

export function useWebRelay() {
  const relayUrl = useSettingsStore((s) => s.relayUrl)
  const setDevices = useDeviceStore((s) => s.setDevices)
  const setStatus = useDeviceStore((s) => s.setStatus)
  const wsRef = useRef<WebSocket | null>(null)
  const deviceIdRef = useRef<string>("")
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const connectedRef = useRef(false)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)

  const connect = useCallback((url: string) => {
    if (!url.startsWith("ws://") && !url.startsWith("wss://")) return
    if (connectedRef.current) {
      wsRef.current?.close()
      connectedRef.current = false
    }

    if (!deviceIdRef.current) {
      // 生成有效的 UUID v4 格式（中继服务器要求 device_id 必须是 UUID）
      deviceIdRef.current = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
      })
    }

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      connectedRef.current = true
      retryCountRef.current = 0
      ws.send(JSON.stringify({
        type: "register",
        device_id: deviceIdRef.current,
        device_name: "Device-" + deviceIdRef.current.slice(0, 6),
        device_type: "desktop",
      }))
      setStatus({ state: "relay" })
      console.log("[relay] connected to", url)

      // Tauri 模式下同时连接 Rust 中继客户端（用于文件传输）
      if (typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__) {
        import("@tauri-apps/api/core").then(({ invoke }) => {
          invoke("connect_relay", { url }).catch((e: any) => console.warn("[relay] Rust client connect:", e))
        })
      }
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === "device_list" && Array.isArray(msg.devices)) {
          const myId = deviceIdRef.current
          const devices = msg.devices
            .filter((d: Record<string, unknown>) => String(d.id || "") !== myId)
            .map((d: Record<string, unknown>) => ({
              id: String(d.id || ""),
              name: String(d.name || "Unknown"),
              deviceType: (d.deviceType || "desktop") as "desktop" | "web",
              lastSeen: String(d.lastSeen || new Date().toISOString()),
              status: "online" as const,
            }))
          console.log("[relay] device_list received:", devices.length, "devices")
          setDevices(devices)
        }
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      console.log("[relay] disconnected")
      setStatus({ state: "offline" })
      wsRef.current = null
      connectedRef.current = false
      if (retryCountRef.current < 10) {
        const delay = Math.min(1000 * 2 ** retryCountRef.current, 30000)
        retryCountRef.current++
        retryRef.current = setTimeout(() => connect(url), delay)
      }
    }

    ws.onerror = () => {
      ws.close()
    }

    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }))
      }
    }, 15000)
  }, [setDevices, setStatus])

  const disconnect = useCallback(() => {
    if (retryRef.current) {
      clearTimeout(retryRef.current)
      retryRef.current = null
    }
    retryCountRef.current = 0
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    wsRef.current?.close()
    wsRef.current = null
    connectedRef.current = false
    setStatus({ state: "offline" })
  }, [setStatus])

  useEffect(() => {
    if (relayUrl) {
      retryCountRef.current = 0
      connect(relayUrl)
    }
    return () => {
      disconnect()
    }
  }, [relayUrl, connect, disconnect])

  return { connect, disconnect }
}
