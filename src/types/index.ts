export interface DeviceInfo {
  id: string
  name: string
  deviceType: "desktop" | "web"
  addr?: string
  ipAddress?: string
  connectedAt?: string
  lastSeen: string
  status?: "online" | "relay" | "offline"
}

export interface FileMeta {
  id: string
  name: string
  size: number
  mimeType: string
}

export interface FileProgress {
  fileId: string
  fileName: string
  size: number
  bytesSent: number
  speed: number
  status: TransferStatus
}

export type TransferStatus =
  | "queued"
  | "transferring"
  | "paused"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"

export interface TransferState {
  id: string
  direction: "send" | "receive"
  peerId: string
  peerName: string
  files: FileProgress[]
  startedAt: string
  status: TransferStatus
  pauseReason?: "user" | "network" | "disk_full"
}

export interface TransferRecord {
  id: string
  direction: "send" | "receive"
  peerName: string
  fileNames: string[]
  totalSize: number
  startedAt: string
  completedAt: string
  status: TransferStatus
}

export interface IncomingTransfer {
  sourceId: string
  sourceName: string
  files: { id: string; name: string; size: number; mimeType: string }[]
}

export interface TransferProgress {
  transferId: string
  fileId: string
  fileName: string
  bytesSent: number
  bytesTotal: number
  speed: number
}

export interface ConnectionStatus {
  state: "lan" | "relay" | "offline"
}

export type ChatMessageKind = "text" | "files"
export type ChatMessageDirection = "incoming" | "outgoing"
export type ChatMessageStatus =
  | "pending"
  | "sending"
  | "sent"
  | "received"
  | "completed"
  | "failed"

export interface ChatAttachment {
  id: string
  name: string
  size: number
  mimeType: string
  bytesSent?: number
  bytesTotal?: number
  speed?: number
  status?: ChatMessageStatus
}

export interface ChatMessage {
  id: string
  peerId: string
  peerName: string
  direction: ChatMessageDirection
  kind: ChatMessageKind
  text?: string
  files?: ChatAttachment[]
  createdAt: string
  status: ChatMessageStatus
}
