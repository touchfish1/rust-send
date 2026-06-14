import { useCallback } from "react"
import { useTauriEvent } from "./use-tauri-event"
import { useTransferStore } from "@/stores/transfer-store"
import type {
  TransferProgress,
  IncomingTransfer,
} from "@/types"

export function useTransferEvents() {
  const updateProgress = useTransferStore((s) => s.updateProgress)
  const completeTransfer = useTransferStore((s) => s.completeTransfer)
  const failTransfer = useTransferStore((s) => s.failTransfer)
  const setIncoming = useTransferStore((s) => s.setIncoming)
  const cancelTransfer = useTransferStore((s) => s.cancelTransfer)

  const onProgress = useCallback(
    (p: TransferProgress) => updateProgress(p),
    [updateProgress]
  )

  const onComplete = useCallback(
    (p: { file_id: string }) => completeTransfer(p.file_id),
    [completeTransfer]
  )

  const onBatchComplete = useCallback(
    (_p: { transfer_id: string }) => {
      // 多文件传输全部完成
    },
    []
  )

  const onFailed = useCallback(
    (p: { file_id: string; error: string }) => failTransfer(p.file_id, p.error),
    [failTransfer]
  )

  const onIncoming = useCallback(
    (req: IncomingTransfer) => setIncoming(req),
    [setIncoming]
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
  useTauriEvent("transfer:paused", onPaused)
  useTauriEvent("transfer:resumed", onResumed)
  useTauriEvent("transfer:cancelled", onCancelled)
  useTauriEvent("transfer:queued", onQueued)
}
