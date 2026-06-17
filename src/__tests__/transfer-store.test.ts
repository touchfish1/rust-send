import { describe, it, expect, beforeEach } from "vitest"
import { useTransferStore } from "@/stores/transfer-store"
import type { TransferState, TransferProgress } from "@/types"

const mockTransfer: TransferState = {
  id: "t-1",
  direction: "send",
  peerId: "dev-1",
  peerName: "MacBook Pro",
  transport: "relay",
  files: [
    { fileId: "f-1", fileName: "test.pdf", size: 1024, bytesSent: 0, speed: 0, status: "queued" },
  ],
  startedAt: "2024-01-15T14:30:00Z",
  status: "transferring",
}

describe("TransferStore", () => {
  beforeEach(() => {
    useTransferStore.setState({
      active: new Map(),
      history: [],
      incoming: null,
    })
  })

  it("adds a transfer", () => {
    useTransferStore.getState().addTransfer(mockTransfer)
    expect(useTransferStore.getState().active.size).toBe(1)
  })

  it("updates progress", () => {
    useTransferStore.getState().addTransfer(mockTransfer)

    const progress: TransferProgress = {
      transferId: "t-1",
      fileId: "f-1",
      fileName: "test.pdf",
      bytesSent: 512,
      bytesTotal: 1024,
      speed: 1024 * 1024,
    }

    useTransferStore.getState().updateProgress(progress)
    const file = useTransferStore.getState().active.get("t-1")?.files[0]
    expect(file?.bytesSent).toBe(512)
    expect(file?.speed).toBe(1024 * 1024)
    expect(file?.status).toBe("transferring")
  })

  it("completes a transfer when all files done", () => {
    const singleFileTransfer: TransferState = {
      ...mockTransfer,
      files: [
        { fileId: "f-1", fileName: "test.pdf", size: 1024, bytesSent: 1024, speed: 0, status: "transferring" },
      ],
    }
    useTransferStore.getState().addTransfer(singleFileTransfer)
    useTransferStore.getState().completeTransfer("f-1")

    expect(useTransferStore.getState().active.size).toBe(0)
    expect(useTransferStore.getState().history.length).toBe(1)
    expect(useTransferStore.getState().history[0].status).toBe("completed")
  })

  it("marks transfer as failed", () => {
    useTransferStore.getState().addTransfer(mockTransfer)
    useTransferStore.getState().failTransfer("f-1", "disk full")

    expect(useTransferStore.getState().active.get("t-1")).toBeUndefined()
    expect(useTransferStore.getState().history[0].status).toBe("failed")
    expect(useTransferStore.getState().history[0].failureReason).toBe("disk full")
  })

  it("handles incoming transfer request", () => {
    const req = {
      sourceId: "dev-1",
      sourceName: "MacBook Pro",
      files: [{ id: "f-1", name: "photo.jpg", size: 3000000, mimeType: "image/jpeg" }],
    }
    useTransferStore.getState().setIncoming(req)
    expect(useTransferStore.getState().incoming?.sourceName).toBe("MacBook Pro")

    useTransferStore.getState().setIncoming(null)
    expect(useTransferStore.getState().incoming).toBeNull()
  })

  it("clears history", () => {
    useTransferStore.getState().addTransfer(mockTransfer)
    useTransferStore.getState().completeTransfer("f-1")
    expect(useTransferStore.getState().history.length).toBe(1)

    useTransferStore.getState().clearHistory()
    expect(useTransferStore.getState().history.length).toBe(0)
  })

  it("moves cancelled transfers into history", () => {
    useTransferStore.getState().addTransfer(mockTransfer)
    useTransferStore.getState().cancelTransfer("t-1")

    expect(useTransferStore.getState().active.size).toBe(0)
    expect(useTransferStore.getState().history[0].status).toBe("cancelled")
  })
})
