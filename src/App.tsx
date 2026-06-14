import { Routes, Route, useNavigate } from "react-router-dom"
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
import { useWebRelay } from "@/hooks/use-web-relay"
import { isTauri } from "@/hooks/use-tauri-event"
import { useCallback } from "react"

export default function App() {
  const navigate = useNavigate()
  const devices = useDeviceStore((s) => s.devices)
  const localName = useDeviceStore((s) => s.localName)
  const connectionStatus = useDeviceStore((s) => s.status)
  const incoming = useTransferStore((s) => s.incoming)
  const setIncoming = useTransferStore((s) => s.setIncoming)

  useDeviceEvents()
  useTransferEvents()
  useWebRelay()

  const path = window.location.pathname
  const currentPage = path === "/" ? "welcome" : path.split("/")[1]

  const handleSelectDevice = useCallback(
    (id: string) => navigate(`/chat/${id}`),
    [navigate]
  )

  const handleNavigate = useCallback(
    (page: string) => navigate(`/${page}`),
    [navigate]
  )

  const handleAcceptTransfer = useCallback(() => {
    if (incoming) {
      setIncoming(null)
      navigate(`/chat/${incoming.sourceId}`)
    }
  }, [incoming, setIncoming, navigate])

  const handleRejectTransfer = useCallback(() => {
    setIncoming(null)
  }, [setIncoming])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TitleBar isTauri={isTauri()} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          localName={localName || "rust-send"}
          connectionStatus={connectionStatus.state}
          devices={Array.from(devices.values())}
          activeDeviceId={undefined}
          onSelectDevice={handleSelectDevice}
          onNavigate={handleNavigate}
          currentPage={currentPage}
        />

        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<WelcomePage />} />
            <Route path="/transfers" element={<TransferPage />} />
            <Route path="/chat/:deviceId" element={<ChatPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
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
