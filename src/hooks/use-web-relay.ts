import { useEffect, useRef, useCallback } from "react"
import { useDeviceStore } from "@/stores/device-store"
import { useSettingsStore } from "@/stores/settings-store"
import { useChatStore } from "@/stores/chat-store"
import { isTauri } from "./use-tauri-event"
import type { IncomingTransfer } from "@/types"
import { useConnectionStore } from "@/stores/connection-store"

type PendingWebFile = { id: string; file: File; name: string; size: number; mimeType: string }
type PendingWebOffer = {
  offerId: string
  targetId: string
  expiresAt: string
  files: PendingWebFile[]
}
type ReceiveState = {
  meta: IncomingTransfer["files"][number]
  chunks: Uint8Array[]
  received: number
}

const DEFAULT_OFFER_TTL_MS = 2 * 60 * 60 * 1000

export function useWebRelay() {
  const relayUrl = useSettingsStore((s) => s.relayUrl)
  const setDevices = useDeviceStore((s) => s.setDevices)
  const setStatus = useDeviceStore((s) => s.setStatus)
  const localName = useDeviceStore((s) => s.localName)
  const setRelayTarget = useConnectionStore((s) => s.setRelayTarget)
  const markConnecting = useConnectionStore((s) => s.markConnecting)
  const markConnected = useConnectionStore((s) => s.markConnected)
  const markDisconnected = useConnectionStore((s) => s.markDisconnected)
  const markReconnectAttempt = useConnectionStore((s) => s.markReconnectAttempt)
  const markError = useConnectionStore((s) => s.markError)
  const addMessage = useChatStore((s) => s.addMessage)
  const updateFileProgress = useChatStore((s) => s.updateFileProgress)
  const markFileStatus = useChatStore((s) => s.markFileStatus)
  const markOfferStatus = useChatStore((s) => s.markOfferStatus)
  const wsRef = useRef<WebSocket | null>(null)
  const deviceIdRef = useRef<string>("")
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const connectedRef = useRef(false)
  const shouldReconnectRef = useRef(true)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  const pendingSendsRef = useRef(new Map<string, PendingWebOffer>())
  const receivingRef = useRef(new Map<string, ReceiveState>())

  const getDeviceId = () => {
    const storageKey = "rust-send-web-device-id"
    const existing = window.localStorage.getItem(storageKey)
    if (existing) return existing

    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0
            return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
          })
    window.localStorage.setItem(storageKey, generated)
    return generated
  }

  const connect = useCallback((url: string) => {
    if (!url.startsWith("ws://") && !url.startsWith("wss://")) return
    setRelayTarget(url)
    markConnecting(retryCountRef.current > 0)
    if (connectedRef.current) {
      wsRef.current?.close()
      connectedRef.current = false
    }

    if (!deviceIdRef.current) {
      deviceIdRef.current = getDeviceId()
    }

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      connectedRef.current = true
      retryCountRef.current = 0
      ws.send(JSON.stringify({
        type: "register",
        device_id: deviceIdRef.current,
        device_name: localName || "Device-" + deviceIdRef.current.slice(0, 6),
        device_type: "web",
      }))
      setStatus({ state: "relay" })
      markConnected("Web 端已连接到中继")
      console.log("[relay] connected to", url)
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === "device_list" && Array.isArray(msg.devices)) {
          const myId = deviceIdRef.current
          const devices = msg.devices
            .filter((d: Record<string, unknown>) => String(d.id || "") !== myId)
            .map((d: Record<string, unknown>) => ({
              id: String(d.id || ""),
              name: String(d.name || "Unknown"),
              deviceType: (d.deviceType || "desktop") as "desktop" | "web",
              addr: typeof d.addr === "string" ? d.addr : undefined,
              ipAddress: typeof d.ipAddress === "string" ? d.ipAddress : undefined,
              connectedAt: typeof d.connectedAt === "string" ? d.connectedAt : undefined,
              lastSeen: String(d.lastSeen || new Date().toISOString()),
              status: "online" as const,
            }))
          console.log("[relay] device_list received:", devices.length, "devices")
          setDevices(devices)
        } else if (msg.type === "transfer_request" && Array.isArray(msg.files)) {
          const offerId = String(msg.offer_id || msg.offerId || crypto.randomUUID())
          const expiresAt = String(
            msg.expires_at ||
              msg.expiresAt ||
              new Date(Date.now() + DEFAULT_OFFER_TTL_MS).toISOString()
          )
          const isExpired = Date.now() >= Date.parse(expiresAt)
          const incoming: IncomingTransfer = {
            sourceId: String(msg.source_id || ""),
            sourceName: String(msg.source_name || "Unknown"),
            offerId,
            expiresAt,
            files: msg.files.map((f: Record<string, unknown>) => ({
              id: String(f.id || ""),
              name: String(f.name || "file"),
              size: Number(f.size || 0),
              mimeType: String(f.mime_type || f.mimeType || "application/octet-stream"),
            })),
          }
          addMessage({
            id: offerId,
            peerId: incoming.sourceId,
            peerName: incoming.sourceName,
            direction: "incoming",
            kind: "files",
            offerId,
            expiresAt,
            files: incoming.files.map((file) => ({
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
        } else if (msg.type === "transfer_accept") {
          const targetId = String(msg.source_id || "")
          const offerId = String(msg.offer_id || msg.offerId || "")
          const offer = pendingSendsRef.current.get(offerId)
          if (!offer || offer.targetId !== targetId) {
            sendTransferReject(ws, targetId, offerId, "unavailable")
          } else if (Date.now() >= Date.parse(offer.expiresAt)) {
            pendingSendsRef.current.delete(offerId)
            markOfferStatus(offerId, "expired")
            sendTransferReject(ws, targetId, offerId, "expired")
          } else {
            const requestedIds = parseAcceptedFileIds(msg)
            const selected = requestedIds.size
              ? offer.files.filter((file) => requestedIds.has(file.id))
              : offer.files
            if (selected.length === 0) {
              sendTransferReject(ws, targetId, offerId, "unavailable")
            } else {
              sendPendingFiles(ws, targetId, selected).catch((err) => console.error("[relay] web send failed:", err))
            }
          }
        } else if (msg.type === "transfer_reject") {
          const offerId = String(msg.offer_id || msg.offerId || "")
          const reason = String(msg.reason || msg.conflict || "rejected")
          markOfferStatus(offerId, reason === "expired" ? "expired" : "failed")
        } else if (msg.type === "relay_data") {
          handleRelayData(String(msg.source_id || ""), String(msg.data || ""))
        } else if (msg.type === "chat_message") {
          addMessage({
            id: String(msg.message_id || crypto.randomUUID()),
            peerId: String(msg.source_id || ""),
            peerName: String(msg.source_name || "Unknown"),
            direction: "incoming",
            kind: "text",
            text: String(msg.text || ""),
            createdAt: String(msg.sent_at || new Date().toISOString()),
            status: "received",
          })
        }
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      console.log("[relay] disconnected")
      setStatus({ state: "offline" })
      wsRef.current = null
      connectedRef.current = false
      markDisconnected("Web 端中继连接已断开")
      if (shouldReconnectRef.current) {
        const delay = Math.min(1000 * 2 ** retryCountRef.current, 30000)
        retryCountRef.current++
        markReconnectAttempt(`连接已断开，${Math.ceil(delay / 1000)} 秒后重试`)
        retryRef.current = setTimeout(() => connect(url), delay)
      }
    }

    ws.onerror = () => {
      markError("WebSocket 连接失败")
      ws.close()
    }

    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }))
      }
    }, 15000)
  }, [addMessage, localName, markConnected, markConnecting, markDisconnected, markError, markOfferStatus, markReconnectAttempt, setDevices, setRelayTarget, setStatus])

  const handleRelayData = useCallback((sourceId: string, dataBase64: string) => {
    const raw = base64ToBytes(dataBase64)
    const text = bytesToText(raw)
    if (text) {
      try {
        const msg = JSON.parse(text)
        if (msg.type === "complete") {
          finishReceive(String(msg.file_id || msg.fileId || ""))
        }
        return
      } catch {
        // Binary data may also decode as text; fall through to chunk parsing.
      }
    }

    if (raw.length < 24) return
    const fileId = uuidFromBytes(raw.slice(0, 16))
    const payloadLength = readU32(raw, 20)
    if (raw.length < 24 + payloadLength) return

    const receive = receivingRef.current.get(fileId)
    if (!receive) return

    const payload = raw.slice(24, 24 + payloadLength)
    receive.chunks.push(payload)
    receive.received += payload.length
    updateFileProgress(fileId, {
      bytesSent: receive.received,
      bytesTotal: receive.meta.size,
    })

    sendJson(wsRef.current, {
      type: "relay_data",
      target_id: sourceId,
      data: bytesToBase64(textToBytes(JSON.stringify({
        type: "ack",
        file_id: fileId,
        chunk_index: readU32(raw, 16),
      }))),
    })
  }, [updateFileProgress])

  const finishReceive = useCallback((fileId: string) => {
    const receive = receivingRef.current.get(fileId)
    if (!receive) return

    receivingRef.current.delete(fileId)
    markFileStatus(fileId, "completed")
    const blob = new Blob(receive.chunks.map(toArrayBuffer), { type: receive.meta.mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = receive.meta.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [markFileStatus])

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false
    if (retryRef.current) {
      clearTimeout(retryRef.current)
      retryRef.current = null
    }
    retryCountRef.current = 0
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    wsRef.current?.close()
    wsRef.current = null
    connectedRef.current = false
    setStatus({ state: "offline" })
  }, [setStatus])

  useEffect(() => {
    if (isTauri()) return

    ;(window as any).__RUST_SEND_WEB_RELAY__ = {
      acceptTransfer: (req: IncomingTransfer) => {
        requestDownload(req)
      },
      requestDownload: (req: IncomingTransfer, files = req.files) => {
        requestDownload({ ...req, files })
      },
      rejectTransfer: (sourceId: string, offerId = "") => {
        sendTransferReject(wsRef.current, sourceId, offerId, "rejected")
      },
      sendFiles: (
        targetId: string,
        files: Array<File | { id: string; file: File }>,
        offerId = crypto.randomUUID(),
        expiresAt = new Date(Date.now() + DEFAULT_OFFER_TTL_MS).toISOString()
      ) => {
        const pending = files.map((entry) => {
          const file = entry instanceof File ? entry : entry.file
          return {
            id: entry instanceof File ? crypto.randomUUID() : entry.id,
            file,
            name: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
          }
        })
        pendingSendsRef.current.set(offerId, {
          offerId,
          targetId,
          expiresAt,
          files: pending,
        })
        sendJson(wsRef.current, {
          type: "transfer_request",
          target_id: targetId,
          offer_id: offerId,
          expires_at: expiresAt,
          files: pending.map((f) => ({
            id: f.id,
            name: f.name,
            size: f.size,
            mime_type: f.mimeType,
          })),
        })
      },
      sendText: (targetId: string, messageId: string, text: string) => {
        sendJson(wsRef.current, {
          type: "chat_message",
          target_id: targetId,
          message_id: messageId,
          text,
          sent_at: new Date().toISOString(),
        })
      },
    }

    function requestDownload(req: IncomingTransfer) {
      if (req.expiresAt && Date.now() >= Date.parse(req.expiresAt)) {
        markOfferStatus(req.offerId || "", "expired")
        return
      }

      for (const file of req.files) {
        receivingRef.current.set(file.id, {
          meta: file,
          chunks: [],
          received: 0,
        })
      }
      sendJson(wsRef.current, {
        type: "transfer_accept",
        target_id: req.sourceId,
        offer_id: req.offerId || "",
        files: req.files.map((file) => ({
          id: file.id,
          name: file.name,
          size: file.size,
          mime_type: file.mimeType,
        })),
        accepted: true,
      })
    }

    if (relayUrl) {
      shouldReconnectRef.current = true
      retryCountRef.current = 0
      setRelayTarget(relayUrl)
      connect(relayUrl)
    }
    return () => {
      delete (window as any).__RUST_SEND_WEB_RELAY__
      disconnect()
    }
  }, [relayUrl, connect, disconnect, markOfferStatus, setRelayTarget])

  return { connect, disconnect }
}

function sendJson(ws: WebSocket | null, payload: unknown) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

function sendTransferReject(ws: WebSocket | null, targetId: string, offerId: string, reason: string) {
  sendJson(ws, {
    type: "transfer_reject",
    target_id: targetId,
    offer_id: offerId,
    accepted: false,
    reason,
  })
}

function parseAcceptedFileIds(msg: Record<string, unknown>) {
  const files = Array.isArray(msg.files) ? msg.files : []
  const ids = files
    .map((file) => String((file as Record<string, unknown>).id || ""))
    .filter(Boolean)
  if (ids.length > 0) return new Set(ids)

  const fileIds = Array.isArray(msg.file_ids) ? msg.file_ids : []
  return new Set(fileIds.map((id) => String(id || "")).filter(Boolean))
}

async function sendPendingFiles(ws: WebSocket, targetId: string, files: PendingWebFile[]) {
  const chunkSize = 65536
  for (const item of files) {
    const buffer = new Uint8Array(await item.file.arrayBuffer())
    const checksum = await sha256Hex(buffer)
    const chunkCount = Math.ceil(buffer.length / chunkSize)

    sendJson(ws, {
      type: "relay_data",
      target_id: targetId,
      data: bytesToBase64(textToBytes(JSON.stringify({
        type: "file_header",
        file_id: item.id,
        name: item.name,
        size: item.size,
        mime_type: item.mimeType,
        chunk_size: chunkSize,
        chunk_count: chunkCount,
        checksum: "",
        relative_path: null,
      }))),
    })

    for (let index = 0; index < chunkCount; index++) {
      const start = index * chunkSize
      const payload = buffer.slice(start, Math.min(start + chunkSize, buffer.length))
      sendJson(ws, {
        type: "relay_data",
        target_id: targetId,
        data: bytesToBase64(serializeChunk(item.id, index, payload)),
      })
      useChatStore.getState().updateFileProgress(item.id, {
        bytesSent: Math.min(start + payload.length, buffer.length),
        bytesTotal: buffer.length,
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    sendJson(ws, {
      type: "relay_data",
      target_id: targetId,
      data: bytesToBase64(textToBytes(JSON.stringify({
        type: "complete",
        file_id: item.id,
        checksum,
      }))),
    })
    useChatStore.getState().markFileStatus(item.id, "completed")
  }
}

function serializeChunk(fileId: string, index: number, payload: Uint8Array) {
  const out = new Uint8Array(24 + payload.length)
  out.set(uuidToBytes(fileId), 0)
  writeU32(out, 16, index)
  writeU32(out, 20, payload.length)
  out.set(payload, 24)
  return out
}

function uuidToBytes(id: string) {
  const hex = id.replace(/-/g, "")
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function uuidFromBytes(bytes: Uint8Array) {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function readU32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false)
}

function writeU32(bytes: Uint8Array, offset: number, value: number) {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 4).setUint32(0, value, false)
}

function textToBytes(text: string) {
  return new TextEncoder().encode(text)
}

function bytesToText(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
