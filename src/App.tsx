import { Routes, Route, useLocation, useNavigate } from "react-router-dom"
import { Sidebar } from "@/components/layout/sidebar"
import { TitleBar } from "@/components/layout/title-bar"
import { WelcomePage } from "@/pages/welcome-page"
import { TransferPage } from "@/pages/transfer-page"
import { ChatPage } from "@/pages/chat-page"
import { SettingsPage } from "@/pages/settings-page"
import { useDeviceStore } from "@/stores/device-store"
import { useTransferStore } from "@/stores/transfer-store"
import { useDeviceEvents } from "@/hooks/use-device-events"
import { useTransferEvents } from "@/hooks/use-transfer-events"
import { useAutoConnect } from "@/hooks/use-auto-connect"
import { useChatEvents } from "@/hooks/use-chat-events"
import { useLocalDeviceInfo } from "@/hooks/use-local-device-info"
import { isTauri } from "@/hooks/use-tauri-event"
import { useChatStore } from "@/stores/chat-store"
import { useCallback, useEffect } from "react"
import { useSettingsStore } from "@/stores/settings-store"
import { extractRelayUrlFromLocation } from "@/lib/pairing"

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const devices = useDeviceStore((s) => s.devices)
  const localName = useDeviceStore((s) => s.localName)
  const connectionStatus = useDeviceStore((s) => s.status)
  const incoming = useTransferStore((s) => s.incoming)
  const setIncoming = useTransferStore((s) => s.setIncoming)
  const setRelayUrl = useSettingsStore((s) => s.setRelayUrl)

  useDeviceEvents()
  useTransferEvents()
  useChatEvents()
  useLocalDeviceInfo()
  useAutoConnect()

  useEffect(() => {
    if (isTauri() || typeof window === "undefined") return

    // Web 端通过扫码进入时，会把桌面端的 relay 参数带过来，这里落回本地设置即可自动重连。
    const relayUrl = extractRelayUrlFromLocation(window.location.href)
    if (relayUrl) {
      setRelayUrl(relayUrl)
    }
  }, [setRelayUrl])

  const path = location.pathname
  const currentPage = path === "/" ? "welcome" : path.split("/")[1]
  const activeDeviceId = currentPage === "chat" ? path.split("/")[2] : undefined

  const handleSelectDevice = useCallback(
    (id: string) => navigate(`/chat/${id}`),
    [navigate]
  )

  const handleNavigate = useCallback(
    (page: string) => navigate(`/${page}`),
    [navigate]
  )

  const handleAcceptTransfer = useCallback(() => {
    if (!incoming) return

    ;(async () => {
      try {
        if (isTauri()) {
          const { invoke } = await import("@tauri-apps/api/core")
          const saveDir = await invoke<string>("get_downloads_dir")
          await invoke("accept_transfer", {
            sourceId: incoming.sourceId,
            saveDir,
            files: incoming.files.map((f) => ({
              id: f.id,
              name: f.name,
              size: f.size,
              mime_type: f.mimeType,
            })),
          })
        } else {
          ;(window as any).__RUST_SEND_WEB_RELAY__?.acceptTransfer(incoming)
        }
        useChatStore.getState().markFilesForPeer(
          incoming.sourceId,
          incoming.files.map((f) => f.id),
          "received"
        )
        setIncoming(null)
        navigate(`/chat/${incoming.sourceId}`)
      } catch (e) {
        console.error("accept transfer failed", e)
      }
    })()
  }, [incoming, setIncoming, navigate])

  const handleRejectTransfer = useCallback(() => {
    if (!incoming) return

    ;(async () => {
      try {
        if (isTauri()) {
          const { invoke } = await import("@tauri-apps/api/core")
          await invoke("reject_transfer", { sourceId: incoming.sourceId })
        } else {
          ;(window as any).__RUST_SEND_WEB_RELAY__?.rejectTransfer(incoming.sourceId)
        }
        useChatStore.getState().markFilesForPeer(
          incoming.sourceId,
          incoming.files.map((f) => f.id),
          "failed"
        )
      } catch (e) {
        console.error("reject transfer failed", e)
      } finally {
        setIncoming(null)
      }
    })()
  }, [incoming, setIncoming])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TitleBar isTauri={isTauri()} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          localName={localName || "rust-send"}
          connectionStatus={connectionStatus.state}
          devices={Array.from(devices.values())}
          activeDeviceId={activeDeviceId}
          onSelectDevice={handleSelectDevice}
          onNavigate={handleNavigate}
          currentPage={currentPage}
        />

        <main className="relative flex-1 overflow-hidden">
          <div
            key={location.pathname}
            className="absolute inset-0 overflow-y-auto animate-page-rise"
          >
            <Routes location={location}>
              <Route path="/" element={<WelcomePage />} />
              <Route path="/transfers" element={<TransferPage />} />
              <Route path="/chat/:deviceId" element={<ChatPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
        </main>
      </div>

      {/* 接收确认弹窗 */}
      {incoming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-md border border-border/60 bg-card p-6 shadow-ink-lg animate-ink-fade">
            <h2 className="text-base font-medium">接收文件</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {incoming.sourceName} 想向你发送以下文件：
            </p>
            <div className="mt-3 space-y-1.5">
              {incoming.files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 rounded-sm bg-muted/50 px-3 py-2 text-sm"
                >
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground/60">
                    {(f.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={handleRejectTransfer}
                className="rounded-sm px-4 py-2 text-sm text-foreground/60 hover:text-foreground transition-colors"
              >
                拒绝
              </button>
              <button
                onClick={handleAcceptTransfer}
                className="rounded-sm bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all"
              >
                接受
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
