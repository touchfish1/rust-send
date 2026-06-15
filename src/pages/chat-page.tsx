import { useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useDeviceStore } from "@/stores/device-store"
import { createChatId, useChatStore } from "@/stores/chat-store"
import { formatFileSize, formatTime, getFileIcon } from "@/lib/utils"
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useDropzone } from "react-dropzone"
import { FileUp, Globe2, Info, Monitor, Paperclip, Send, X } from "lucide-react"
import type { ChatAttachment, ChatMessage, DeviceInfo } from "@/types"

type PendingFile = {
  id: string
  path: string
  name: string
  size: number
  mimeType: string
  file?: File
}

export function ChatPage() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const devices = useDeviceStore((s) => s.devices)
  const device = deviceId ? devices.get(deviceId) : undefined
  const messages = useChatStore((s) => s.messages)
  const addMessage = useChatStore((s) => s.addMessage)
  const updateMessageStatus = useChatStore((s) => s.updateMessageStatus)
  const isTauri = typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__

  const [draft, setDraft] = useState("")
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [showDeviceInfo, setShowDeviceInfo] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  const peerMessages = useMemo(
    () =>
      messages
        .filter((message) => message.peerId === deviceId)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [deviceId, messages]
  )

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [peerMessages.length, pendingFiles.length])

  const addPendingFiles = useCallback((files: PendingFile[]) => {
    setPendingFiles((prev) => [...prev, ...files])
  }, [])

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      addPendingFiles(
        acceptedFiles.map((file) => ({
          id: createChatId(),
          path: (file as any).path || file.name,
          name: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
          file,
        }))
      )
    },
    [addPendingFiles]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, noClick: true })

  const handlePickFiles = useCallback(async () => {
    if (isTauri) {
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        const paths = await invoke<string[]>("pick_files")
        if (paths?.length) {
          const metas = await Promise.all(
            paths.map(async (path) => {
              const meta = await invoke<{
                id?: string
                name: string
                size: number
                mime_type?: string
                mimeType?: string
              }>("get_file_meta", { path })
              return {
                id: meta.id || createChatId(),
                path,
                name: meta.name,
                size: meta.size,
                mimeType: meta.mimeType || meta.mime_type || "application/octet-stream",
              }
            })
          )
          addPendingFiles(metas)
        }
      } catch (e) {
        console.error("pick_files failed:", e)
      }
      return
    }

    const input = document.createElement("input")
    input.type = "file"
    input.multiple = true
    input.onchange = () => {
      const files = Array.from(input.files || [])
      addPendingFiles(
        files.map((file) => ({
          id: createChatId(),
          path: file.name,
          name: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
          file,
        }))
      )
    }
    input.click()
  }, [addPendingFiles, isTauri])

  const handleSend = useCallback(async () => {
    if (!deviceId) return

    const text = draft.trim()
    const files = pendingFiles
    if (!text && files.length === 0) return

    setDraft("")
    setPendingFiles([])

    if (text) {
      const messageId = createChatId()
      addMessage({
        id: messageId,
        peerId: deviceId,
        peerName: device?.name || deviceId,
        direction: "outgoing",
        kind: "text",
        text,
        createdAt: new Date().toISOString(),
        status: "sending",
      })

      try {
        if (isTauri) {
          const { invoke } = await import("@tauri-apps/api/core")
          await invoke("send_chat_message", {
            targetId: deviceId,
            messageId,
            text,
          })
        } else {
          ;(window as any).__RUST_SEND_WEB_RELAY__?.sendText(deviceId, messageId, text)
        }
        updateMessageStatus(messageId, "sent")
      } catch (e) {
        console.error("send text failed", e)
        updateMessageStatus(messageId, "failed")
      }
    }

    if (files.length > 0) {
      const messageId = createChatId()
      const attachments: ChatAttachment[] = files.map((file) => ({
        id: file.id,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
        bytesSent: 0,
        bytesTotal: file.size,
        status: "pending",
      }))

      addMessage({
        id: messageId,
        peerId: deviceId,
        peerName: device?.name || deviceId,
        direction: "outgoing",
        kind: "files",
        files: attachments,
        createdAt: new Date().toISOString(),
        status: "pending",
      })

      try {
        if (isTauri) {
          const { invoke } = await import("@tauri-apps/api/core")
          await invoke("send_files", {
            targetId: deviceId,
            targetName: device?.name || "unknown",
            paths: files.map((file) => file.path),
            fileIds: files.map((file) => file.id),
          })
        } else {
          const webFiles = files
            .filter((file): file is PendingFile & { file: File } => !!file.file)
            .map((file) => ({ id: file.id, file: file.file }))
          ;(window as any).__RUST_SEND_WEB_RELAY__?.sendFiles(deviceId, webFiles)
        }
      } catch (e) {
        console.error("send files failed", e)
        updateMessageStatus(messageId, "failed")
      }
    }
  }, [addMessage, device, deviceId, draft, isTauri, pendingFiles, updateMessageStatus])

  const handleRemovePending = useCallback((id: string) => {
    setPendingFiles((prev) => prev.filter((file) => file.id !== id))
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const isOnline = device?.status !== "offline"
  const connectionLabel = device?.status === "relay" ? "中继" : "LAN"
  const canSend = !!deviceId && (!!draft.trim() || pendingFiles.length > 0)
  const shortDeviceId = deviceId ? `${deviceId.slice(0, 8)}...${deviceId.slice(-6)}` : ""

  return (
    <div className="flex h-full flex-col animate-ink-fade">
      <div className="flex items-center gap-3 border-b border-border/30 px-8 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-muted text-muted-foreground">
          {device?.deviceType === "web" ? <Globe2 className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{device?.name || deviceId}</span>
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                isOnline ? "bg-emerald-500 shadow-[0_0_6px_-1px_rgba(34,197,94,0.3)]" : "bg-muted-foreground/30"
              )}
            />
            <span className={cn("text-xs", isOnline ? "text-emerald-600/80" : "text-muted-foreground/50")}>
              {isOnline ? `在线 · ${connectionLabel}` : "离线"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowDeviceInfo(true)}
            className="mt-0.5 flex max-w-full items-center gap-1 text-xs text-muted-foreground/55 transition-colors hover:text-foreground"
            title="查看客户端信息"
          >
            <Info className="h-3 w-3 shrink-0" />
            <span className="truncate">{shortDeviceId || "未知设备"}</span>
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-8 py-6">
        <div {...getRootProps({ className: "min-h-full" })}>
          <input {...getInputProps()} />

          {isDragActive && (
            <div className="mb-4 rounded-md border-2 border-dashed border-primary/40 bg-primary/[0.02] py-8 text-center text-sm text-primary/60">
              拖放文件到此处
            </div>
          )}

          {peerMessages.length === 0 ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center text-sm text-muted-foreground/60">
              <FileUp className="mb-3 h-8 w-8 opacity-35" />
              <p>发送消息或文件开始会话</p>
            </div>
          ) : (
            <div className="space-y-4">
              {peerMessages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border/30 px-8 py-4">
        {pendingFiles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {pendingFiles.map((file) => (
              <div
                key={file.id}
                className="flex max-w-[240px] items-center gap-1.5 rounded-sm bg-muted/50 px-2.5 py-1.5 text-xs"
              >
                <span>{getFileIcon(file.name)}</span>
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-muted-foreground/50">{formatFileSize(file.size)}</span>
                <button
                  onClick={() => handleRemovePending(file.id)}
                  className="ml-0.5 text-muted-foreground/40 transition-colors hover:text-foreground"
                  aria-label="移除文件"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            roundness="sharp"
            onClick={handlePickFiles}
            aria-label="选择文件"
            title="选择文件"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="输入消息"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-sm border border-border/40 bg-muted/20 px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-primary/40"
          />
          <Button
            type="button"
            size="icon"
            roundness="sharp"
            disabled={!canSend}
            onClick={handleSend}
            aria-label="发送"
            title="发送"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showDeviceInfo && (
        <DeviceInfoDialog
          deviceId={deviceId || ""}
          device={device}
          connectionLabel={connectionLabel}
          onClose={() => setShowDeviceInfo(false)}
        />
      )}
    </div>
  )
}

function DeviceInfoDialog({
  deviceId,
  device,
  connectionLabel,
  onClose,
}: {
  deviceId: string
  device?: DeviceInfo
  connectionLabel: string
  onClose: () => void
}) {
  const typeLabel = device?.deviceType === "web" ? "Web 客户端" : "桌面客户端"
  const address = device?.ipAddress || device?.addr || "未知"
  const onlineAt = device?.connectedAt ? formatDateTime(device.connectedAt) : "未知"
  const lastSeen = device?.lastSeen ? formatDateTime(device.lastSeen) : "未知"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-md border border-border/60 bg-card p-5 shadow-ink-lg animate-ink-fade">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-medium">客户端信息</h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground/60">{device?.name || deviceId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 divide-y divide-border/30 rounded-sm border border-border/35">
          <InfoRow label="设备名称" value={device?.name || "未知"} />
          <InfoRow label="设备 ID" value={deviceId || "未知"} monospace />
          <InfoRow label="客户端类型" value={typeLabel} />
          <InfoRow label="连接方式" value={connectionLabel} />
          <InfoRow label="IP / 地址" value={address} monospace />
          <InfoRow label="上线时间" value={onlineAt} />
          <InfoRow label="最后活跃" value={lastSeen} />
        </div>
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  monospace,
}: {
  label: string
  value: string
  monospace?: boolean
}) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 px-3 py-2.5 text-sm">
      <span className="text-muted-foreground/60">{label}</span>
      <span className={cn("break-words text-foreground/85", monospace && "font-mono text-xs")}>
        {value}
      </span>
    </div>
  )
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isOutgoing = message.direction === "outgoing"

  return (
    <div className={cn("flex", isOutgoing ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[72%] space-y-1", isOutgoing ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-md px-3.5 py-2.5 text-sm shadow-sm",
            isOutgoing
              ? "bg-primary text-primary-foreground"
              : "border border-border/45 bg-card text-card-foreground"
          )}
        >
          {message.kind === "text" ? (
            <p className="whitespace-pre-wrap break-words leading-6">{message.text}</p>
          ) : (
            <div className="space-y-2">
              {message.files?.map((file) => (
                <FileBubble key={file.id} file={file} isOutgoing={isOutgoing} />
              ))}
            </div>
          )}
        </div>
        <div
          className={cn(
            "px-1 text-[11px] text-muted-foreground/55",
            isOutgoing ? "text-right" : "text-left"
          )}
        >
          {formatTime(message.createdAt)} · {statusLabel(message.status)}
        </div>
      </div>
    </div>
  )
}

function FileBubble({ file, isOutgoing }: { file: ChatAttachment; isOutgoing: boolean }) {
  const total = file.bytesTotal || file.size || 1
  const sent = file.bytesSent || 0
  const progress = Math.min(100, Math.round((sent / Math.max(total, 1)) * 100))
  const showProgress = file.status === "sending" || (sent > 0 && progress < 100)

  return (
    <div className="min-w-[220px]">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-base">{getFileIcon(file.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{file.name}</div>
          <div className={cn("text-xs", isOutgoing ? "text-primary-foreground/70" : "text-muted-foreground/65")}>
            {formatFileSize(file.size)}
          </div>
        </div>
      </div>
      {showProgress && (
        <div className="mt-2 space-y-1">
          <Progress value={progress} size="sm" />
          <div className={cn("text-[11px]", isOutgoing ? "text-primary-foreground/70" : "text-muted-foreground/60")}>
            {progress}%
          </div>
        </div>
      )}
    </div>
  )
}

function statusLabel(status: ChatMessage["status"]) {
  switch (status) {
    case "pending":
      return "等待接收"
    case "sending":
      return "发送中"
    case "sent":
      return "已发送"
    case "received":
      return "已接收"
    case "completed":
      return "已完成"
    case "failed":
      return "失败"
    default:
      return ""
  }
}

function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ")
}
