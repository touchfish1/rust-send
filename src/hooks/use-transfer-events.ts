import { useCallback } from "react"
import { useTauriEvent } from "./use-tauri-event"
import { useTransferStore } from "@/stores/transfer-store"
import { useChatStore } from "@/stores/chat-store"
import type {
  TransferProgress,
  IncomingTransfer,
} from "@/types"

const DEFAULT_OFFER_TTL_MS = 2 * 60 * 60 * 1000

export function useTransferEvents() {
  const updateProgress = useTransferStore((s) => s.updateProgress)
  const completeTransfer = useTransferStore((s) => s.completeTransfer)
  const failTransfer = useTransferStore((s) => s.failTransfer)
  const cancelTransfer = useTransferStore((s) => s.cancelTransfer)
  const addMessage = useChatStore((s) => s.addMessage)
  const updateFileProgress = useChatStore((s) => s.updateFileProgress)
  const markFileStatus = useChatStore((s) => s.markFileStatus)
  const updateFileSavedPath = useChatStore((s) => s.updateFileSavedPath)
  const markOfferStatus = useChatStore((s) => s.markOfferStatus)

  const onProgress = useCallback(
    (p: TransferProgress | Record<string, unknown>) => {
      const progress = normalizeProgress(p)
      updateProgress(progress)
      updateFileProgress(progress.fileId, {
        bytesSent: progress.bytesSent,
        bytesTotal: progress.bytesTotal,
        speed: progress.speed,
      })
    },
    [updateProgress, updateFileProgress]
  )

  const onComplete = useCallback(
    (p: { file_id?: string; fileId?: string; saved_path?: string; savedPath?: string }) => {
      const fileId = String(p.fileId || p.file_id || "")
      if (!fileId) return
      const savedPath = String(p.savedPath || p.saved_path || "")
      completeTransfer(fileId)
      markFileStatus(fileId, "completed")
      if (savedPath) {
        updateFileSavedPath(fileId, savedPath)
      }
    },
    [completeTransfer, markFileStatus, updateFileSavedPath]
  )

  const onBatchComplete = useCallback(
    (_p: { transfer_id: string }) => {
      // 多文件传输全部完成
    },
    []
  )

  const onFailed = useCallback(
    (p: { file_id?: string; fileId?: string; error: string }) => {
      const fileId = String(p.fileId || p.file_id || "")
      failTransfer(fileId, p.error)
      markFileStatus(fileId, "failed")
    },
    [failTransfer, markFileStatus]
  )

  const onIncoming = useCallback(
    (req: IncomingTransfer) => {
      const offerId = req.offerId || `incoming-files-${req.sourceId}-${req.files.map((file) => file.id).join("-")}`
      const expiresAt = req.expiresAt || new Date(Date.now() + DEFAULT_OFFER_TTL_MS).toISOString()
      const isExpired = Date.now() >= Date.parse(expiresAt)
      addMessage({
        id: offerId,
        peerId: req.sourceId,
        peerName: req.sourceName,
        direction: "incoming",
        kind: "files",
        offerId,
        expiresAt,
        files: req.files.map((file) => ({
          ...file,
          offerId,
          expiresAt,
          bytesSent: 0,
          bytesTotal: file.size,
          status: isExpired ? "expired" : "available",
        })),
        createdAt: new Date().toISOString(),
        status: isExpired ? "expired" : "available",
      })
    },
    [addMessage]
  )

  const onOfferFailed = useCallback(
    (p: { offerId?: string; offer_id?: string; reason?: string }) => {
      const offerId = String(p.offerId || p.offer_id || "")
      const reason = String(p.reason || "")
      markOfferStatus(offerId, reason === "expired" ? "expired" : "failed")
    },
    [markOfferStatus]
  )

  const onPaused = useCallback(
    (_p: { transfer_id: string; reason: string }) => {
      // store 通过 progress 事件更新状态
    },
    []
  )

  const onResumed = useCallback(
    (_p: { file_id: string }) => {
      // store 通过 progress 事件更新状态
    },
    []
  )

  const onCancelled = useCallback(
    (p: { transfer_id: string }) => cancelTransfer(p.transfer_id),
    [cancelTransfer]
  )

  const onQueued = useCallback(
    (_p: { transfer_id: string; position: number }) => {
      // 可以通过 addTransfer 添加排队状态
    },
    []
  )

  useTauriEvent("transfer:progress", onProgress)
  useTauriEvent("transfer:complete", onComplete)
  useTauriEvent("transfer:batch_complete", onBatchComplete)
  useTauriEvent("transfer:failed", onFailed)
  useTauriEvent("transfer:incoming", onIncoming)
  useTauriEvent("transfer:offer_failed", onOfferFailed)
  useTauriEvent("transfer:paused", onPaused)
  useTauriEvent("transfer:resumed", onResumed)
  useTauriEvent("transfer:cancelled", onCancelled)
  useTauriEvent("transfer:queued", onQueued)
}

function normalizeProgress(p: TransferProgress | Record<string, unknown>): TransferProgress {
  return {
    transferId: String((p as any).transferId || (p as any).transfer_id || ""),
    fileId: String((p as any).fileId || (p as any).file_id || ""),
    fileName: String((p as any).fileName || (p as any).file_name || ""),
    bytesSent: Number((p as any).bytesSent || (p as any).bytes_sent || 0),
    bytesTotal: Number((p as any).bytesTotal || (p as any).bytes_total || 0),
    speed: Number((p as any).speed || 0),
  }
}
