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

  // Web 端：直接用 WebSocket
  useWebRelay()

  // Tauri 端：通过 invoke 调用 connect_relay 命令
  useEffect(() => {
    if (!isTauri()) return
    if (connectedRef.current) return
    if (!relayUrl) return

    connectedRef.current = true

    ;(async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("connect_relay", { url: relayUrl })
        console.log("Tauri relay connected:", relayUrl)
      } catch (e) {
        console.warn("Tauri relay connect failed:", e)
        setStatus({ state: "offline" })
        connectedRef.current = false
        // 5 秒后重试
        setTimeout(() => { connectedRef.current = false }, 5000)
      }
    })()
  }, [relayUrl, setStatus])
}
