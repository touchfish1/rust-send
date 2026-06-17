import { create } from "zustand"
import type {
  TransferState,
  TransferRecord,
  IncomingTransfer,
  TransferProgress,
} from "@/types"

interface TransferState_ {
  active: Map<string, TransferState>
  history: TransferRecord[]
  incoming: IncomingTransfer | null

  addTransfer: (t: TransferState) => void
  replaceActive: (transfers: TransferState[]) => void
  removeTransfer: (id: string) => void
  cancelTransfer: (id: string) => void
  updateProgress: (p: TransferProgress) => void
  completeTransfer: (fileId: string) => void
  failTransfer: (fileId: string, error: string) => void
  setIncoming: (req: IncomingTransfer | null) => void
  addHistory: (record: TransferRecord) => void
  replaceHistory: (records: TransferRecord[]) => void
  clearHistory: () => void
}

export const useTransferStore = create<TransferState_>((set, get) => ({
  active: new Map(),
  history: [],
  incoming: null,

  addTransfer: (t) => {
    const active = new Map(get().active)
    active.set(t.id, t)
    set({ active })
  },

  replaceActive: (transfers) =>
    set({
      active: new Map(transfers.map((transfer) => [transfer.id, transfer])),
    }),

  removeTransfer: (id) => {
    const active = new Map(get().active)
    active.delete(id)
    set({ active })
  },

  cancelTransfer: (id) => {
    const active = new Map(get().active)
    const t = active.get(id)
    if (t) {
      const record: TransferRecord = {
        id: t.id,
        direction: t.direction,
        peerId: t.peerId,
        peerName: t.peerName,
        transport: t.transport || "unknown",
        fileNames: t.files.map((f) => f.fileName),
        totalSize: t.files.reduce((s, f) => s + f.size, 0),
        startedAt: t.startedAt,
        completedAt: new Date().toISOString(),
        status: "cancelled",
        failureReason: "user_cancelled",
      }
      active.delete(id)
      set({ active, history: [record, ...get().history] })
      return
    }
    set({ active })
  },

  updateProgress: (p) => {
    const active = new Map(get().active)
    const transfer = active.get(p.transferId)
    if (!transfer) return

    transfer.files = transfer.files.map((f) =>
      f.fileId === p.fileId
        ? { ...f, bytesSent: p.bytesSent, speed: p.speed, status: "transferring" }
        : f
    )
    active.set(p.transferId, { ...transfer })
    set({ active })
  },

  completeTransfer: (fileId) => {
    const active = new Map(get().active)
    for (const [id, t] of active) {
      t.files = t.files.map((f) =>
        f.fileId === fileId ? { ...f, bytesSent: f.size, status: "completed" } : f
      )
      const allDone = t.files.every((f) => f.status === "completed")
      if (allDone) {
        const record: TransferRecord = {
          id: t.id,
          direction: t.direction,
          peerId: t.peerId,
          peerName: t.peerName,
          transport: t.transport || "unknown",
          fileNames: t.files.map((f) => f.fileName),
          totalSize: t.files.reduce((s, f) => s + f.size, 0),
          startedAt: t.startedAt,
          completedAt: new Date().toISOString(),
          status: "completed",
        }
        active.delete(id)
        set({ active: new Map(active), history: [record, ...get().history] })
        return
      }
      active.set(id, { ...t })
    }
    set({ active: new Map(active) })
  },

  failTransfer: (fileId, _error) => {
    const active = new Map(get().active)
    for (const [id, t] of active) {
      const hasFile = t.files.some((f) => f.fileId === fileId)
      if (!hasFile) continue
      t.files = t.files.map((f) =>
        f.fileId === fileId ? { ...f, status: "failed" as const } : f
      )
      const record: TransferRecord = {
        id: t.id,
        direction: t.direction,
        peerId: t.peerId,
        peerName: t.peerName,
        transport: t.transport || "unknown",
        fileNames: t.files.map((f) => f.fileName),
        totalSize: t.files.reduce((s, f) => s + f.size, 0),
        startedAt: t.startedAt,
        completedAt: new Date().toISOString(),
        status: "failed",
        failureReason: _error,
      }
      active.delete(id)
      set({ active: new Map(active), history: [record, ...get().history] })
      return
    }
    set({ active: new Map(active) })
  },

  setIncoming: (req) => set({ incoming: req }),

  addHistory: (record) => set({ history: [record, ...get().history] }),

  replaceHistory: (records) => set({ history: records }),

  clearHistory: () => set({ history: [] }),
}))
