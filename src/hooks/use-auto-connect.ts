import { useEffect, useRef } from "react"
import { useSettingsStore } from "@/stores/settings-store"
import { useDeviceStore } from "@/stores/device-store"
import { useWebRelay } from "./use-web-relay"

function isTauri() {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__
}

export function useAutoConnect() {
  const relayUrl = useSettingsStore((s) => s.relayUrl)
  const setStatus = useDeviceStore((s) => s.setStatus)
  const connectedRef = useRef(false)

  // Web 端：直接用 WebSocket；Tauri 端该 hook 内部会 no-op。
  useWebRelay()

  // Tauri 端：通过 invoke 调用 connect_relay 命令
  useEffect(() => {
    if (!isTauri()) return
    if (!relayUrl) return

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const connect = async () => {
      if (cancelled || connectedRef.current) return
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("connect_relay", { url: relayUrl })
        console.log("Tauri relay connected:", relayUrl)
        setStatus({ state: "relay" })
        connectedRef.current = true
      } catch (e) {
        console.warn("Tauri relay connect failed:", e)
        setStatus({ state: "offline" })
        retryTimer = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      cancelled = true
      connectedRef.current = false
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [relayUrl, setStatus])
}
