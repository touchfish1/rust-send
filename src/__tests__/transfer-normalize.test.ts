import { describe, expect, it } from "vitest"
import {
  normalizeTransferDirection,
  normalizeTransferRecord,
  normalizeTransferState,
  normalizeTransferStatus,
  normalizeTransferTransport,
} from "@/lib/transfer-normalize"

describe("transfer normalize helpers", () => {
  it("normalizes transfer status values", () => {
    expect(normalizeTransferStatus("Completed")).toBe("completed")
    expect(normalizeTransferStatus("FAILED")).toBe("failed")
    expect(normalizeTransferStatus("unknown-status")).toBe("queued")
  })

  it("normalizes transfer direction and transport", () => {
    expect(normalizeTransferDirection("Receive")).toBe("receive")
    expect(normalizeTransferDirection("send")).toBe("send")
    expect(normalizeTransferTransport("Relay")).toBe("relay")
    expect(normalizeTransferTransport("unsupported")).toBe("unknown")
  })

  it("normalizes transfer records from snake_case payloads", () => {
    const record = normalizeTransferRecord({
      id: "t-1",
      direction: "Receive",
      peer_id: "peer-1",
      peer_name: "MacBook Pro",
      transport: "Hybrid",
      file_names: ["photo.jpg"],
      total_size: 2048,
      started_at: "2026-06-17T10:00:00.000Z",
      completed_at: "2026-06-17T10:01:00.000Z",
      status: "Completed",
      failure_reason: "user_cancelled",
    })

    expect(record).toEqual({
      id: "t-1",
      direction: "receive",
      peerId: "peer-1",
      peerName: "MacBook Pro",
      transport: "hybrid",
      fileNames: ["photo.jpg"],
      totalSize: 2048,
      startedAt: "2026-06-17T10:00:00.000Z",
      completedAt: "2026-06-17T10:01:00.000Z",
      status: "completed",
      failureReason: "user_cancelled",
    })
  })

  it("normalizes active transfer state payloads", () => {
    const state = normalizeTransferState({
      id: "t-2",
      direction: "Send",
      peer_id: "peer-2",
      peer_name: "Linux Workstation",
      transport: "Lan",
      files: [
        {
          file_id: "f-1",
          file_name: "archive.zip",
          size: 4096,
          bytes_sent: 1024,
          speed: 512,
          status: "Transferring",
        },
      ],
      started_at: "2026-06-17T11:00:00.000Z",
      status: "Paused",
      pause_reason: "network",
    })

    expect(state.direction).toBe("send")
    expect(state.transport).toBe("lan")
    expect(state.files[0]).toEqual({
      fileId: "f-1",
      fileName: "archive.zip",
      size: 4096,
      bytesSent: 1024,
      speed: 512,
      status: "transferring",
    })
    expect(state.status).toBe("paused")
    expect(state.pauseReason).toBe("network")
  })
})
