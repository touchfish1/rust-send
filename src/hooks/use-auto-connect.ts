import { useEffect, useRef } from "react"
import { useSettingsStore } from "@/stores/settings-store"
import { useDeviceStore } from "@/stores/device-store"
import { useWebRelay } from "./use-web-relay"
import { useConnectionStore } from "@/stores/connection-store"

function isTauri() {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__
}

export function useAutoConnect() {
  const relayUrl = useSettingsStore((s) => s.relayUrl)
  const setStatus = useDeviceStore((s) => s.setStatus)
  const connectionState = useDeviceStore((s) => s.status.state)
  const setRelayTarget = useConnectionStore((s) => s.setRelayTarget)
  const markConnecting = useConnectionStore((s) => s.markConnecting)
  const markConnected = useConnectionStore((s) => s.markConnected)
  const markReconnectAttempt = useConnectionStore((s) => s.markReconnectAttempt)
  const markError = useConnectionStore((s) => s.markError)
  const connectedRef = useRef(false)

  // Web 端：直接用 WebSocket；Tauri 端该 hook 内部会 no-op。
  useWebRelay()

  // Tauri 端：通过 invoke 调用 connect_relay 命令
  useEffect(() => {
    if (!isTauri()) return
    setRelayTarget(relayUrl)
    if (!relayUrl) return

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const connect = async (retry = false) => {
      if (cancelled || connectedRef.current) return
      markConnecting(retry)
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("connect_relay", { url: relayUrl })
        console.log("Tauri relay connected:", relayUrl)
        setStatus({ state: "relay" })
        connectedRef.current = true
        markConnected("已连接到中继")
      } catch (e) {
        console.warn("Tauri relay connect failed:", e)
        setStatus({ state: "offline" })
        const message = e instanceof Error ? e.message : String(e)
        markError(message)
        markReconnectAttempt("连接失败，5 秒后自动重试")
        retryTimer = setTimeout(() => connect(true), 5000)
      }
    }

    connect()

    return () => {
      cancelled = true
      connectedRef.current = false
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [markConnected, markConnecting, markError, markReconnectAttempt, relayUrl, setRelayTarget, setStatus])

  useEffect(() => {
    if (!isTauri()) return
    connectedRef.current = connectionState === "relay"
  }, [connectionState])
}
