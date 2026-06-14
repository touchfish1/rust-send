import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SettingsState {
  downloadDir: string
  chunkSize: number
  autoAcceptLan: boolean
  relayUrl: string
  theme: "light" | "dark" | "system"

  setDownloadDir: (dir: string) => void
  setChunkSize: (size: number) => void
  setAutoAcceptLan: (on: boolean) => void
  setRelayUrl: (url: string) => void
  setTheme: (t: "light" | "dark" | "system") => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      downloadDir: "",
      chunkSize: 65536,
      autoAcceptLan: false,
      relayUrl: "ws://localhost:8080/ws",
      theme: "system",

      setDownloadDir: (dir) => set({ downloadDir: dir }),
      setChunkSize: (size) => set({ chunkSize: size }),
      setAutoAcceptLan: (on) => set({ autoAcceptLan: on }),
      setRelayUrl: (url) => set({ relayUrl: url }),
      setTheme: (t) => set({ theme: t }),
    }),
    { name: "rust-send-settings" }
  )
)
