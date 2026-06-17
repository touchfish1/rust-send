import type { TransferRecord, TransferState, TransferStatus, TransferTransport } from "@/types"

export function normalizeTransferStatus(value: string): TransferStatus {
  switch (value.toLowerCase()) {
    case "queued":
      return "queued"
    case "transferring":
      return "transferring"
    case "paused":
      return "paused"
    case "verifying":
      return "verifying"
    case "completed":
      return "completed"
    case "failed":
      return "failed"
    case "cancelled":
      return "cancelled"
    case "expired":
      return "expired"
    default:
      return "queued"
  }
}

export function normalizeTransferDirection(value: string): "send" | "receive" {
  return value.toLowerCase() === "receive" ? "receive" : "send"
}

export function normalizeTransferTransport(value?: string): TransferTransport {
  switch ((value || "").toLowerCase()) {
    case "lan":
      return "lan"
    case "relay":
      return "relay"
    case "hybrid":
      return "hybrid"
    default:
      return "unknown"
  }
}

export function normalizeTransferRecord(record: Record<string, any>): TransferRecord {
  return {
    id: String(record.id || ""),
    direction: normalizeTransferDirection(String(record.direction || "send")),
    peerId: record.peerId || record.peer_id || "",
    peerName: String(record.peerName || record.peer_name || ""),
    transport: normalizeTransferTransport(record.transport),
    fileNames: Array.isArray(record.fileNames || record.file_names)
      ? (record.fileNames || record.file_names).map((name: unknown) => String(name))
      : [],
    totalSize: Number(record.totalSize || record.total_size || 0),
    startedAt: String(record.startedAt || record.started_at || new Date().toISOString()),
    completedAt: String(record.completedAt || record.completed_at || new Date().toISOString()),
    status: normalizeTransferStatus(String(record.status || "queued")),
    failureReason: record.failureReason || record.failure_reason || undefined,
  }
}

export function normalizeTransferState(state: Record<string, any>): TransferState {
  return {
    id: String(state.id || ""),
    direction: normalizeTransferDirection(String(state.direction || "send")),
    peerId: String(state.peerId || state.peer_id || ""),
    peerName: String(state.peerName || state.peer_name || ""),
    transport: normalizeTransferTransport(state.transport),
    files: Array.isArray(state.files)
      ? state.files.map((file: Record<string, any>) => ({
          fileId: String(file.fileId || file.file_id || ""),
          fileName: String(file.fileName || file.file_name || ""),
          size: Number(file.size || 0),
          bytesSent: Number(file.bytesSent || file.bytes_sent || 0),
          speed: Number(file.speed || 0),
          status: normalizeTransferStatus(String(file.status || "queued")),
        }))
      : [],
    startedAt: String(state.startedAt || state.started_at || new Date().toISOString()),
    status: normalizeTransferStatus(String(state.status || "queued")),
    pauseReason: state.pauseReason || state.pause_reason || undefined,
  }
}
