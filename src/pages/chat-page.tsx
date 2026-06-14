import { useParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useTransferStore } from "@/stores/transfer-store"
import { useDeviceStore } from "@/stores/device-store"
import { formatFileSize, formatSpeed, getFileIcon, formatTime } from "@/lib/utils"
import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"

export function ChatPage() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const devices = useDeviceStore((s) => s.devices)
  const device = deviceId ? devices.get(deviceId) : undefined
  const active = useTransferStore((s) => s.active)
  const history = useTransferStore((s) => s.history)

  const [pendingFiles, setPendingFiles] = useState<{ path: string; name: string; size: number }[]>([])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const files = acceptedFiles.map((f) => ({
      path: (f as any).path || f.name,
      name: f.name,
      size: f.size,
    }))
    setPendingFiles((prev) => [...prev, ...files])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, noClick: true })

  const handlePickFiles = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const paths = await invoke<string[]>("pick_files")
      if (paths && paths.length > 0) {
        const metas = await Promise.all(
          paths.map(async (path: string) => {
            const meta = await invoke<{ name: string; size: number }>("get_file_meta", { path })
            return { path, name: meta.name, size: meta.size }
          })
        )
        setPendingFiles((prev) => [...prev, ...metas])
      }
    } catch {
      // web fallback: use file input
      const input = document.createElement("input")
      input.type = "file"
      input.multiple = true
      input.onchange = () => {
        const files = Array.from(input.files || [])
        setPendingFiles((prev) => [
          ...prev,
          ...files.map((f) => ({ path: f.name, name: f.name, size: f.size })),
        ])
      }
      input.click()
    }
  }, [])

  const handleSend = useCallback(async () => {
    if (!deviceId || pendingFiles.length === 0) return
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("send_files", {
        targetId: deviceId,
        targetName: device?.name || "unknown",
        paths: pendingFiles.map((f) => f.path),
      })
      setPendingFiles([])
    } catch (e: any) {
      console.error("send failed", e)
    }
  }, [deviceId, pendingFiles, device])

  const handleRemovePending = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const deviceTransfers = Array.from(active.values()).filter(
    (t) => t.peerId === deviceId
  )
  const deviceHistory = history.filter(
    (r) => r.peerName === device?.name
  )

  const isOnline = device?.status !== "offline"
  const connectionLabel = device?.status === "relay" ? "中继" : "LAN"

  return (
    <div className="flex h-full flex-col animate-ink-fade">
      {/* 设备头部 */}
      <div className="flex items-center gap-3 border-b border-border/30 px-8 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-muted text-sm text-muted-foreground">
          {device?.deviceType === "web" ? "🌐" : "🖥"}
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{device?.name || deviceId}</span>
            <span className={cn(
              "inline-block h-2 w-2 rounded-full",
              isOnline ? "bg-emerald-500 shadow-[0_0_6px_-1px_rgba(34,197,94,0.3)]" : "bg-muted-foreground/30"
            )} />
            <span className={cn(
              "text-xs",
              isOnline ? "text-emerald-600/80" : "text-muted-foreground/50"
            )}>
              {isOnline ? `在线 · ${connectionLabel}` : "离线"}
            </span>
          </div>
          {device?.lastSeen && (
            <div className="text-xs text-muted-foreground/50">上次活跃: {formatTime(device.lastSeen)}</div>
          )}
        </div>
      </div>

      {/* 传输列表 */}
      <div className="flex-1 overflow-y-auto px-8 py-6" {...getRootProps()}>
        <input {...getInputProps()} />

        {isDragActive && (
          <div className="mb-4 rounded-md border-2 border-dashed border-primary/40 bg-primary/[0.02] py-8 text-center text-sm text-primary/60">
            拖放文件到此处
          </div>
        )}

        {/* 活跃传输 */}
        {deviceTransfers.length > 0 && (
          <div className="mb-6 space-y-3">
            {deviceTransfers.map((t) => {
              const f = t.files[0]
              const pct = f ? Math.round((f.bytesSent / Math.max(f.size, 1)) * 100) : 0
              return (
                <Card key={t.id} className="border-primary/20 bg-primary/[0.02]">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-lg">{f ? getFileIcon(f.fileName) : "📎"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">{f?.fileName}</span>
                          <span className="shrink-0 text-xs text-muted-foreground/60">
                            {f ? formatFileSize(f.size) : ""}
                          </span>
                        </div>
                        <div className="mt-2.5">
                          <Progress value={pct} size="md" />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground/60">
                          <span>{pct}%</span>
                          {f && f.speed > 0 && (
                            <span>{formatSpeed(f.speed)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* 历史记录 */}
        {deviceHistory.length > 0 && (
          <div className="space-y-1">
            {deviceHistory.map((r) => (
              <div
                key={r.id}
                className="group flex items-center gap-3 rounded-sm px-3 py-3 transition-colors hover:bg-muted/30"
              >
                <span className="text-base">{getFileIcon(r.fileNames[0] || "")}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{r.fileNames.join(", ")}</span>
                    <span className="text-xs text-muted-foreground/60">{formatFileSize(r.totalSize)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                    <span>{formatTime(r.completedAt)}</span>
                    <span>·</span>
                    <span>{r.direction === "send" ? "已发送" : "已接收"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 空状态 */}
        {deviceTransfers.length === 0 && deviceHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center text-sm text-muted-foreground/60">
            <span className="mb-3 text-3xl opacity-40">📁</span>
            <p>还没有传输记录</p>
          </div>
        )}
      </div>

      {/* 底部输入区 */}
      <div className="border-t border-border/30 px-8 py-4">
        {/* 文件预览 */}
        {pendingFiles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {pendingFiles.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-sm bg-muted/50 px-2.5 py-1.5 text-xs"
              >
                <span>{getFileIcon(f.name)}</span>
                <span className="max-w-[120px] truncate">{f.name}</span>
                <span className="text-muted-foreground/50">{formatFileSize(f.size)}</span>
                <button
                  onClick={() => handleRemovePending(i)}
                  className="ml-0.5 text-muted-foreground/40 hover:text-foreground transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div
            onClick={handlePickFiles}
            className="flex flex-1 cursor-pointer items-center gap-2 rounded-sm border border-border/40 bg-muted/20 px-4 py-2.5 transition-colors hover:border-primary/40"
          >
            <svg className="h-4 w-4 shrink-0 text-muted-foreground/40" strokeWidth="1.5" stroke="currentColor" fill="none" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-sm text-muted-foreground/50">
              {isDragActive ? "松开以添加文件" : "拖拽文件到此处，或点击选择"}
            </span>
          </div>
          <Button
            size="lg"
            roundness="sharp"
            className="px-6"
            disabled={pendingFiles.length === 0}
            onClick={handleSend}
          >
            <svg className="h-4 w-4" strokeWidth="1.5" stroke="currentColor" fill="none" viewBox="0 0 24 24">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            发送
          </Button>
        </div>
      </div>
    </div>
  )
}

function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ")
}
