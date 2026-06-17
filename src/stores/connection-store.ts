import { create } from "zustand"

type ConnectionPhase = "idle" | "connecting" | "connected" | "reconnecting" | "error"

interface ConnectionDiagnosticsState {
  relayUrl: string
  phase: ConnectionPhase
  reconnectAttempts: number
  lastConnectedAt: string | null
  lastDisconnectedAt: string | null
  lastError: string | null
  lastErrorAt: string | null
  lastEvent: string
  lastEventAt: string | null

  setRelayTarget: (url: string) => void
  markConnecting: (retry?: boolean) => void
  markConnected: (message?: string) => void
  markDisconnected: (reason?: string) => void
  markReconnectAttempt: (message?: string) => void
  markError: (message: string) => void
  clearError: () => void
  reset: () => void
}

const initialState = {
  relayUrl: "",
  phase: "idle" as ConnectionPhase,
  reconnectAttempts: 0,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  lastError: null,
  lastErrorAt: null,
  lastEvent: "等待连接",
  lastEventAt: null,
}

export const useConnectionStore = create<ConnectionDiagnosticsState>()((set) => ({
  ...initialState,

  setRelayTarget: (url) => set({ relayUrl: url.trim() }),

  markConnecting: (retry = false) =>
    set((state) => ({
      phase: retry ? "reconnecting" : "connecting",
      lastEvent: retry ? "正在尝试重新连接中继" : "正在连接中继",
      lastEventAt: now(),
      reconnectAttempts: retry ? Math.max(state.reconnectAttempts, 1) : state.reconnectAttempts,
    })),

  markConnected: (message = "已连接到中继") =>
    set({
      phase: "connected",
      reconnectAttempts: 0,
      lastConnectedAt: now(),
      lastError: null,
      lastErrorAt: null,
      lastEvent: message,
      lastEventAt: now(),
    }),

  markDisconnected: (reason = "连接已断开") =>
    set({
      phase: "idle",
      lastDisconnectedAt: now(),
      lastEvent: reason,
      lastEventAt: now(),
    }),

  markReconnectAttempt: (message = "连接失败，准备重试") =>
    set((state) => ({
      phase: "reconnecting",
      reconnectAttempts: state.reconnectAttempts + 1,
      lastEvent: message,
      lastEventAt: now(),
    })),

  markError: (message) =>
    set({
      phase: "error",
      lastError: message,
      lastErrorAt: now(),
      lastEvent: message,
      lastEventAt: now(),
    }),

  clearError: () =>
    set((state) => ({
      lastError: null,
      lastErrorAt: null,
      phase: state.phase === "error" ? "idle" : state.phase,
    })),

  reset: () => set(initialState),
}))

function now() {
  return new Date().toISOString()
}
