import { useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useDeviceStore } from "@/stores/device-store"
import { createChatId, useChatStore } from "@/stores/chat-store"
import { formatFileSize, formatTime, getFileIcon } from "@/lib/utils"
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useDropzone } from "react-dropzone"
import { Download, FileUp, FolderOpen, Globe2, Info, Monitor, Paperclip, Send, X } from "lucide-react"
import type { ChatAttachment, ChatMessage, DeviceInfo } from "@/types"
import type { CSSProperties } from "react"

type PendingFile = {
  id: string
  path: string
  name: string
  size: number
  mimeType: string
  file?: File
}

const DEFAULT_FILE_OFFER_TTL_MS = 2 * 60 * 60 * 1000

export function ChatPage() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const devices = useDeviceStore((s) => s.devices)
  const device = deviceId ? devices.get(deviceId) : undefined
  const messages = useChatStore((s) => s.messages)
  const addMessage = useChatStore((s) => s.addMessage)
  const updateMessageStatus = useChatStore((s) => s.updateMessageStatus)
  const markFileStatus = useChatStore((s) => s.markFileStatus)
  const isTauri = typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__

  const [draft, setDraft] = useState("")
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [showDeviceInfo, setShowDeviceInfo] = useState(false)
  const [now, setNow] = useState(() => Date.now())
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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

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
      const expiresAt = new Date(Date.now() + DEFAULT_FILE_OFFER_TTL_MS).toISOString()
      const attachments: ChatAttachment[] = files.map((file) => ({
        id: file.id,
        offerId: messageId,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
        expiresAt,
        bytesSent: 0,
        bytesTotal: file.size,
        status: "available",
      }))

      addMessage({
        id: messageId,
        peerId: deviceId,
        peerName: device?.name || deviceId,
        direction: "outgoing",
        kind: "files",
        offerId: messageId,
        expiresAt,
        files: attachments,
        createdAt: new Date().toISOString(),
        status: "available",
      })

      try {
        if (isTauri) {
          const { invoke } = await import("@tauri-apps/api/core")
          await invoke("send_files", {
            targetId: deviceId,
            targetName: device?.name || "unknown",
            paths: files.map((file) => file.path),
            fileIds: files.map((file) => file.id),
            offerId: messageId,
            expiresAt,
          })
        } else {
          const webFiles = files
            .filter((file): file is PendingFile & { file: File } => !!file.file)
            .map((file) => ({ id: file.id, file: file.file }))
          ;(window as any).__RUST_SEND_WEB_RELAY__?.sendFiles(deviceId, webFiles, messageId, expiresAt)
        }
        updateMessageStatus(messageId, "sent")
      } catch (e) {
        console.error("send files failed", e)
        updateMessageStatus(messageId, "failed")
      }
    }
  }, [addMessage, device, deviceId, draft, isTauri, pendingFiles, updateMessageStatus])

  const handleDownloadFile = useCallback(
    async (message: ChatMessage, file: ChatAttachment) => {
      if (!deviceId) return
      const expiresAt = file.expiresAt || message.expiresAt
      if (expiresAt && Date.now() >= Date.parse(expiresAt)) {
        markFileStatus(file.id, "expired")
        return
      }
      if (device?.status === "offline") {
        markFileStatus(file.id, "failed")
        return
      }

      markFileStatus(file.id, "downloading")
      try {
        if (isTauri) {
          const { invoke } = await import("@tauri-apps/api/core")
          const saveDir = await invoke<string>("get_downloads_dir")
          await invoke("accept_transfer", {
            sourceId: deviceId,
            sourceName: device?.name || message.peerName || deviceId,
            offerId: file.offerId || message.offerId || message.id,
            expiresAt,
            saveDir,
            files: [
              {
                id: file.id,
                name: file.name,
                size: file.size,
                mime_type: file.mimeType,
              },
            ],
          })
        } else {
          ;(window as any).__RUST_SEND_WEB_RELAY__?.requestDownload(
            {
              sourceId: deviceId,
              sourceName: device?.name || message.peerName || deviceId,
              offerId: file.offerId || message.offerId || message.id,
              expiresAt,
              files: [
                {
                  id: file.id,
                  name: file.name,
                  size: file.size,
                  mimeType: file.mimeType,
                },
              ],
            },
            [
              {
                id: file.id,
                name: file.name,
                size: file.size,
                mimeType: file.mimeType,
              },
            ]
          )
        }
      } catch (e) {
        console.error("download file failed", e)
        markFileStatus(file.id, String(e).includes("expired") ? "expired" : "failed")
      }
    },
    [device, deviceId, isTauri, markFileStatus]
  )

  const handleRevealFile = useCallback(
    async (path?: string) => {
      if (!path || !isTauri) return
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("reveal_file", { path })
      } catch (e) {
        console.error("reveal file failed", e)
      }
    },
    [isTauri]
  )

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
    <div className="relative flex h-full flex-col overflow-hidden animate-page-rise">
      <div className="ambient-ink left-[8%] top-[12%] h-36 w-36 bg-primary/15" />
      <div className="ambient-ink bottom-[10%] right-[8%] h-48 w-48 bg-border/35 [animation-delay:-6s]" />

      <div className="relative z-10 flex items-center gap-3 border-b border-border/30 px-8 py-4 motion-stagger [--stagger-delay:40ms]">
        <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-muted text-muted-foreground shadow-[0_12px_30px_-22px_rgba(0,0,0,0.22)] transition-transform duration-300 hover:-translate-y-0.5">
          {device?.deviceType === "web" ? <Globe2 className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{device?.name || deviceId}</span>
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full transition-transform duration-300",
                isOnline && "animate-status-pulse",
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

      <div ref={listRef} className="relative z-10 flex-1 overflow-y-auto px-8 py-6">
        <div {...getRootProps({ className: "min-h-full" })}>
          <input {...getInputProps()} />

          {isDragActive && (
            <div className="motion-stagger mb-4 rounded-md border-2 border-dashed border-primary/40 bg-primary/[0.02] py-8 text-center text-sm text-primary/60 [--stagger-delay:40ms]">
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
              {peerMessages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  index={index}
                  now={now}
                  peerOnline={isOnline}
                  onDownload={handleDownloadFile}
                  onRevealFile={handleRevealFile}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 border-t border-border/30 px-8 py-4 backdrop-blur-sm">
        {pendingFiles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {pendingFiles.map((file, index) => (
              <div
                key={file.id}
                style={{ "--stagger-delay": `${60 + index * 40}ms` } as CSSProperties}
                className="motion-stagger flex max-w-[240px] items-center gap-1.5 rounded-sm bg-muted/50 px-2.5 py-1.5 text-xs"
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

        <div className="motion-stagger flex items-end gap-3 [--stagger-delay:80ms]">
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
            className="max-h-32 min-h-10 flex-1 resize-none rounded-sm border border-border/40 bg-muted/20 px-3 py-2.5 text-sm outline-none transition-[border-color,background-color,box-shadow] duration-300 placeholder:text-muted-foreground/45 focus:border-primary/40 focus:bg-card/70 focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]"
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

function MessageBubble({
  message,
  index,
  now,
  peerOnline,
  onDownload,
  onRevealFile,
}: {
  message: ChatMessage
  index: number
  now: number
  peerOnline: boolean
  onDownload: (message: ChatMessage, file: ChatAttachment) => void
  onRevealFile: (path?: string) => void
}) {
  const isOutgoing = message.direction === "outgoing"

  return (
    <div
      style={{ "--stagger-delay": `${Math.min(index * 40, 320)}ms` } as CSSProperties}
      className={cn("motion-stagger flex", isOutgoing ? "justify-end" : "justify-start")}
    >
      <div className={cn("max-w-[72%] space-y-1", isOutgoing ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-md px-3.5 py-2.5 text-sm shadow-sm transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5",
            isOutgoing
              ? "bg-primary text-primary-foreground shadow-[0_16px_36px_-24px_hsl(var(--primary)/0.95)]"
              : "border border-border/45 bg-card text-card-foreground hover:shadow-ink-md"
          )}
        >
          {message.kind === "text" ? (
            <p className="whitespace-pre-wrap break-words leading-6">{message.text}</p>
          ) : (
            <div className="space-y-2">
              {message.files?.map((file) => (
                <FileBubble
                  key={file.id}
                  file={file}
                  message={message}
                  isOutgoing={isOutgoing}
                  now={now}
                  peerOnline={peerOnline}
                  onDownload={onDownload}
                  onRevealFile={onRevealFile}
                />
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

function FileBubble({
  file,
  message,
  isOutgoing,
  now,
  peerOnline,
  onDownload,
  onRevealFile,
}: {
  file: ChatAttachment
  message: ChatMessage
  isOutgoing: boolean
  now: number
  peerOnline: boolean
  onDownload: (message: ChatMessage, file: ChatAttachment) => void
  onRevealFile: (path?: string) => void
}) {
  const total = file.bytesTotal || file.size || 1
  const sent = file.bytesSent || 0
  const progress = Math.min(100, Math.round((sent / Math.max(total, 1)) * 100))
  const expiresAt = file.expiresAt || message.expiresAt
  const isExpired = Boolean(expiresAt && now >= Date.parse(expiresAt))
  const status = isExpired && file.status !== "completed" ? "expired" : file.status
  const showProgress =
    status === "sending" ||
    status === "downloading" ||
    (sent > 0 && progress < 100)
  const canDownload =
    !isOutgoing &&
    peerOnline &&
    !isExpired &&
    (status === "available" || status === "pending" || status === "failed")
  const canReveal = status === "completed" && Boolean(file.savedPath)

  return (
    <div
      className={cn("min-w-[220px]", canReveal && "cursor-pointer")}
      onDoubleClick={() => {
        if (canReveal) {
          onRevealFile(file.savedPath)
        }
      }}
      title={canReveal ? "双击打开文件位置" : undefined}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-base">{getFileIcon(file.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{file.name}</div>
          <div className={cn("text-xs", isOutgoing ? "text-primary-foreground/70" : "text-muted-foreground/65")}>
            {formatFileSize(file.size)}
            {expiresAt && status !== "completed" && (
              <span className="ml-1.5">{expiryLabel(expiresAt, now)}</span>
            )}
          </div>
        </div>
        {!isOutgoing && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onDownload(message, file)
            }}
            disabled={!canDownload}
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border transition-colors",
              canDownload
                ? "border-border/50 bg-background/60 text-foreground/75 hover:bg-muted hover:text-foreground"
                : "border-border/25 text-muted-foreground/35"
            )}
            aria-label="下载文件"
            title={downloadTitle(status, peerOnline, isExpired)}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        )}
        {canReveal && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onRevealFile(file.savedPath)
            }}
            onDoubleClick={(event) => event.stopPropagation()}
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border transition-colors",
              isOutgoing
                ? "border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground/80 hover:bg-primary-foreground/20 hover:text-primary-foreground"
                : "border-border/50 bg-background/60 text-foreground/75 hover:bg-muted hover:text-foreground"
            )}
            aria-label="打开文件位置"
            title="打开文件位置"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {showProgress && (
        <div className="mt-2 space-y-1">
          <Progress value={progress} size="sm" active={status === "sending" || status === "downloading"} />
          <div className={cn("text-[11px]", isOutgoing ? "text-primary-foreground/70" : "text-muted-foreground/60")}>
            {progress}%
          </div>
        </div>
      )}
      {!isOutgoing && (
        <div className="mt-1 text-[11px] text-muted-foreground/55">
          {downloadTitle(status, peerOnline, isExpired)}
        </div>
      )}
    </div>
  )
}

function expiryLabel(expiresAt: string, now: number) {
  const expires = Date.parse(expiresAt)
  if (!Number.isFinite(expires)) return ""
  const remaining = expires - now
  if (remaining <= 0) return "已过期"
  const minutes = Math.ceil(remaining / 60000)
  if (minutes < 60) return `${minutes} 分钟后过期`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours}小时${rest}分钟后过期` : `${hours}小时后过期`
}

function downloadTitle(
  status: ChatAttachment["status"],
  peerOnline: boolean,
  isExpired: boolean
) {
  if (status === "completed") return "已下载"
  if (status === "downloading") return "下载中"
  if (status === "sending") return "发送中"
  if (isExpired || status === "expired") return "已过期"
  if (!peerOnline) return "发送方离线，无法下载"
  if (status === "failed") return "下载失败，可重试"
  return "下载"
}

function statusLabel(status: ChatMessage["status"]) {
  switch (status) {
    case "pending":
      return "等待接收"
    case "available":
      return "可下载"
    case "downloading":
      return "下载中"
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
    case "expired":
      return "已过期"
    default:
      return ""
  }
}

function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ")
}
