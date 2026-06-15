import { useCallback } from "react"
import { useTauriEvent } from "./use-tauri-event"
import { useChatStore } from "@/stores/chat-store"

interface IncomingChatMessage {
  id: string
  peerId: string
  peerName: string
  text: string
  createdAt: string
}

export function useChatEvents() {
  const addMessage = useChatStore((s) => s.addMessage)

  const onMessage = useCallback(
    (message: IncomingChatMessage) => {
      addMessage({
        id: message.id,
        peerId: message.peerId,
        peerName: message.peerName,
        direction: "incoming",
        kind: "text",
        text: message.text,
        createdAt: message.createdAt,
        status: "received",
      })
    },
    [addMessage]
  )

  useTauriEvent("chat:message", onMessage)
}
