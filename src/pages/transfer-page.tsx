import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { useTransferStore } from "@/stores/transfer-store"
import { useChatStore } from "@/stores/chat-store"
import { formatFileSize, formatSpeed, formatTime, getFileIcon } from "@/lib/utils"
import { useCallback, useMemo } from "react"
import type { ChatMessage, TransferRecord } from "@/types"
import type { CSSProperties } from "react"

function statusLabel(status: string): string {
  switch (status) {
    case "transferring": return "传输中"
    case "paused": return "已暂停"
    case "verifying": return "校验中"
    case "completed": return "已完成"
    case "failed": return "失败"
    case "cancelled": return "已取消"
    case "queued": return "排队中"
    case "expired": return "已过期"
    default: return status
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "transferring": return "text-foreground"
    case "paused": return "text-warning"
    case "verifying": return "text-muted-foreground"
    case "completed": return "text-success"
    case "failed": return "text-destructive"
    case "cancelled": return "text-muted-foreground/60"
    case "queued": return "text-muted-foreground"
    case "expired": return "text-muted-foreground/40"
    default: return "text-muted-foreground"
  }
}

function progressVariant(status: string): "default" | "warning" | "success" | "error" {
  if (status === "paused") return "warning"
  if (status === "failed") return "error"
  if (status === "completed") return "success"
  return "default"
}

export function TransferPage() {
  const active = useTransferStore((s) => s.active)
  const history = useTransferStore((s) => s.history)
  const messages = useChatStore((s) => s.messages)
  const clearFileMessages = useChatStore((s) => s.clearFileMessages)
  const cancelTransfer = useTransferStore((s) => s.cancelTransfer)
  const clearHistory = useTransferStore((s) => s.clearHistory)

  const activeTransfers = Array.from(active.values()).filter(
    (t) => t.status === "transferring" || t.status === "paused" || t.status === "verifying" || t.status === "queued"
  )
  const chatFileHistory = useMemo(() => buildChatFileHistory(messages), [messages])
  const completedTransfers = useMemo(
    () => [...chatFileHistory, ...history].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)),
    [chatFileHistory, history]
  )

  const handleCancel = useCallback(async (id: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("cancel_transfer", { transferId: id })
    } catch {
      cancelTransfer(id) // 直接移除即使没有后端
    }
  }, [cancelTransfer])

  const handlePause = useCallback(async (id: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("pause_transfer", { transferId: id })
    } catch { /* ignore in web */ }
  }, [])

  const handleResume = useCallback(async (id: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("resume_transfer", { transferId: id })
    } catch { /* ignore in web */ }
  }, [])

  const handleClearHistory = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("clear_history")
    } catch { /* ignore */ }
    clearHistory()
    clearFileMessages()
  }, [clearFileMessages, clearHistory])

  return (
    <div className="flex h-full flex-col p-8 animate-page-rise">
      <div className="flex items-center justify-between motion-stagger [--stagger-delay:40ms]">
        <h1 className="text-xl font-medium tracking-wide">传输列表</h1>
        {completedTransfers.length > 0 && (
          <Button variant="ghost" size="sm" roundness="sharp" className="text-xs text-muted-foreground/60 hover:text-foreground" onClick={handleClearHistory}>
            全部清空
          </Button>
        )}
      </div>

      {activeTransfers.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground/60 tracking-wide">
            <span className="inline-block h-3 w-0.5 rounded-full bg-primary/60" />
            进行中 · {activeTransfers.length}
          </div>
          <div className="space-y-3">
            {activeTransfers.map((t, index) => {
              const f = t.files[0]
              const pct = f ? Math.round((f.bytesSent / Math.max(f.size, 1)) * 100) : 0
              const isActive = t.status === "transferring"
              return (
                <div
                  key={t.id}
                  style={{ "--stagger-delay": `${100 + index * 55}ms` } as CSSProperties}
                  className="group motion-stagger relative flex items-start gap-4 overflow-hidden rounded-md border border-border/40 bg-card px-5 py-4 shadow-ink-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-ink-md"
                >
                  {isActive && <div className="absolute inset-0 motion-shimmer opacity-60" />}
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <span className="text-lg leading-none">{f ? getFileIcon(f.fileName) : "📎"}</span>
                    <span className="text-[10px] text-muted-foreground/50">
                      {t.direction === "receive" ? "←" : "→"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground/60">
                          {t.direction === "receive" ? "来自" : "发送至"}
                        </span>
                        <span className="truncate text-sm font-medium">{t.peerName}</span>
                      </div>
                      <span className={cn("shrink-0 text-xs", statusColor(t.status))}>
                        {statusLabel(t.status)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      <span className="truncate font-medium">{f?.fileName || "未知文件"}</span>
                      <span className="shrink-0 text-xs text-muted-foreground/60">
                        {f ? formatFileSize(f.size) : ""}
                      </span>
                    </div>
                    {isActive && (
                      <div className="mt-3">
                        <Progress value={pct} variant={progressVariant(t.status)} size="sm" active />
                        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground/60">
                          <span>{pct}%</span>
                          {f && f.speed > 0 && (
                            <span>{formatSpeed(f.speed)}</span>
                          )}
                        </div>
                      </div>
                    )}
                    {t.status === "paused" && (
                      <div className="mt-3">
                        <Progress value={pct} variant="warning" size="sm" />
                        <div className="mt-1.5 text-xs text-warning/80">已暂停</div>
                      </div>
                    )}
                    {t.status === "queued" && (
                      <div className="mt-1.5 text-xs text-muted-foreground/60">排队中</div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {isActive && (
                      <>
                        <Button variant="ghost" size="icon" roundness="sharp" className="h-7 w-7 text-muted-foreground/50 hover:text-foreground" onClick={() => handlePause(t.id)}>
                          <svg className="h-3.5 w-3.5" strokeWidth="1.5" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                          </svg>
                        </Button>
                        <Button variant="ghost" size="icon" roundness="sharp" className="h-7 w-7 text-muted-foreground/50 hover:text-destructive" onClick={() => handleCancel(t.id)}>
                          <svg className="h-3.5 w-3.5" strokeWidth="1.5" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </Button>
                      </>
                    )}
                    {t.status === "paused" && (
                      <>
                        <Button variant="ghost" size="icon" roundness="sharp" className="h-7 w-7 text-muted-foreground/50 hover:text-foreground" onClick={() => handleResume(t.id)}>
                          <svg className="h-3.5 w-3.5" strokeWidth="1.5" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </Button>
                        <Button variant="ghost" size="icon" roundness="sharp" className="h-7 w-7 text-muted-foreground/50 hover:text-destructive" onClick={() => handleCancel(t.id)}>
                          <svg className="h-3.5 w-3.5" strokeWidth="1.5" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {completedTransfers.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground/60 tracking-wide">
            <span className="inline-block h-3 w-0.5 rounded-full bg-border/60" />
            历史记录 · {completedTransfers.length}
          </div>
          <div className="space-y-2">
            {completedTransfers.map((r, index) => (
              <div
                key={r.id}
                style={{ "--stagger-delay": `${120 + index * 40}ms` } as CSSProperties}
                className="group motion-stagger flex items-start gap-4 rounded-md border border-border/40 bg-card px-5 py-4 shadow-ink-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-ink-md"
              >
                <div className="flex flex-col items-center gap-1 pt-0.5">
                  <span className="text-lg leading-none">{getFileIcon(r.fileNames[0] || "")}</span>
                  <span className="text-[10px] text-muted-foreground/50">
                    {r.direction === "receive" ? "←" : "→"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground/60">
                        {r.direction === "receive" ? "来自" : "发送至"}
                      </span>
                      <span className="truncate text-sm font-medium">{r.peerName}</span>
                    </div>
                    <span className={cn("shrink-0 text-xs", statusColor(r.status))}>
                      {statusLabel(r.status)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm">
                    <span className="truncate font-medium">{r.fileNames.join(", ")}</span>
                    <span className="shrink-0 text-xs text-muted-foreground/60">{formatFileSize(r.totalSize)}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground/40">{formatTime(r.completedAt)}</div>
                </div>
                {r.status === "failed" && (
                  <Button variant="ghost" size="sm" roundness="sharp" className="text-xs h-auto py-0.5">重试</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTransfers.length === 0 && completedTransfers.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center text-center text-sm text-muted-foreground/60">
          <span className="mb-3 text-3xl opacity-40">📭</span>
          <p>还没有传输记录</p>
          <p className="mt-1 text-xs text-muted-foreground/40">聊天中发送或下载文件后会出现在这里</p>
        </div>
      )}
    </div>
  )
}

function buildChatFileHistory(messages: ChatMessage[]): TransferRecord[] {
  return messages
    .filter((message) => message.kind === "files" && message.files?.length)
    .map((message) => {
      const files = message.files || []
      const statuses = files.map((file) => {
        if (isExpired(file.expiresAt || message.expiresAt) && file.status !== "completed") {
          return "expired"
        }
        return file.status || message.status
      })
      const status =
        statuses.every((status) => status === "completed")
          ? "completed"
          : statuses.some((status) => status === "downloading" || status === "sending")
            ? "transferring"
            : statuses.every((status) => status === "expired")
              ? "expired"
              : statuses.some((status) => status === "failed")
                ? "failed"
                : "queued"

      return {
        id: message.id,
        direction: message.direction === "incoming" ? "receive" : "send",
        peerName: message.peerName,
        fileNames: files.map((file) => file.name),
        totalSize: files.reduce((sum, file) => sum + file.size, 0),
        startedAt: message.createdAt,
        completedAt: message.createdAt,
        status,
      } satisfies TransferRecord
    })
}

function isExpired(expiresAt?: string) {
  return Boolean(expiresAt && Date.now() >= Date.parse(expiresAt))
}

function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ")
}
