import { useEffect } from "react"

type TauriEventPayload = Record<string, unknown>

export function useTauriEvent<T = TauriEventPayload>(
  event: string,
  handler: (payload: T) => void
) {
  useEffect(() => {
    let unlisten: (() => void) | undefined

    async function listen() {
      const { listen: tauriListen } = await import("@tauri-apps/api/event")
      unlisten = await tauriListen<T>(event, (e) => handler(e.payload))
    }

    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    if (isTauri) {
      listen()
    }

    return () => {
      unlisten?.()
    }
  }, [event, handler])
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}
