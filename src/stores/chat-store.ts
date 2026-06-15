import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ChatAttachment, ChatMessage, ChatMessageStatus } from "@/types"

interface ChatState {
  messages: ChatMessage[]
  addMessage: (message: ChatMessage) => void
  updateMessageStatus: (id: string, status: ChatMessageStatus) => void
  updateFileProgress: (
    fileId: string,
    progress: { bytesSent: number; bytesTotal: number; speed?: number }
  ) => void
  markFileStatus: (fileId: string, status: ChatMessageStatus) => void
  updateFileSavedPath: (fileId: string, savedPath: string) => void
  markFilesForPeer: (peerId: string, fileIds: string[], status: ChatMessageStatus) => void
  markOfferStatus: (offerId: string, status: ChatMessageStatus) => void
  clearFileMessages: () => void
  clearPeer: (peerId: string) => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],

      addMessage: (message) => {
        const exists = get().messages.some((m) => m.id === message.id)
        if (exists) return
        set({ messages: [...get().messages, message] })
      },

      updateMessageStatus: (id, status) => {
        set({
          messages: get().messages.map((message) =>
            message.id === id ? { ...message, status } : message
          ),
        })
      },

      updateFileProgress: (fileId, progress) => {
        set({
          messages: get().messages.map((message) => {
            if (!message.files?.some((file) => file.id === fileId)) return message
            return {
              ...message,
              status: message.direction === "incoming" ? "downloading" : "sending",
              files: updateFiles(message.files, fileId, {
                ...progress,
                status:
                  progress.bytesTotal > 0 && progress.bytesSent >= progress.bytesTotal
                    ? "completed"
                    : message.direction === "incoming" ? "downloading" : "sending",
              }),
            }
          }),
        })
      },

      markFileStatus: (fileId, status) => {
        set({
          messages: get().messages.map((message) => {
            if (!message.files?.some((file) => file.id === fileId)) return message
            const files = updateFiles(message.files, fileId, { status })
            const allDone = files.every((file) =>
              ["completed", "received", "sent"].includes(file.status || "")
            )
            const allExpired = files.every((file) => file.status === "expired")
            return {
              ...message,
              files,
              status: allExpired ? "expired" : allDone ? status : message.status,
            }
          }),
        })
      },

      updateFileSavedPath: (fileId, savedPath) => {
        set({
          messages: get().messages.map((message) => {
            if (!message.files?.some((file) => file.id === fileId)) return message
            return {
              ...message,
              files: updateFiles(message.files, fileId, { savedPath }),
            }
          }),
        })
      },

      markFilesForPeer: (peerId, fileIds, status) => {
        const ids = new Set(fileIds)
        set({
          messages: get().messages.map((message) => {
            if (message.peerId !== peerId || !message.files?.some((file) => ids.has(file.id))) {
              return message
            }
            return {
              ...message,
              status,
              files: message.files.map((file) =>
                ids.has(file.id) ? { ...file, status } : file
              ),
            }
          }),
        })
      },

      markOfferStatus: (offerId, status) => {
        set({
          messages: get().messages.map((message) => {
            if (message.offerId !== offerId && !message.files?.some((file) => file.offerId === offerId)) {
              return message
            }
            return {
              ...message,
              status,
              files: message.files?.map((file) =>
                file.offerId === offerId || message.offerId === offerId
                  ? { ...file, status }
                  : file
              ),
            }
          }),
        })
      },

      clearPeer: (peerId) => {
        set({ messages: get().messages.filter((message) => message.peerId !== peerId) })
      },

      clearFileMessages: () => {
        set({ messages: get().messages.filter((message) => message.kind !== "files") })
      },
    }),
    { name: "rust-send-chat" }
  )
)

function updateFiles(
  files: ChatAttachment[],
  fileId: string,
  patch: Partial<ChatAttachment>
) {
  return files.map((file) => (file.id === fileId ? { ...file, ...patch } : file))
}

export function createChatId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
