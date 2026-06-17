import { beforeEach, describe, expect, it } from "vitest"
import { useConnectionStore } from "@/stores/connection-store"

describe("ConnectionStore", () => {
  beforeEach(() => {
    useConnectionStore.getState().reset()
  })

  it("tracks relay target and connect lifecycle", () => {
    useConnectionStore.getState().setRelayTarget("wss://relay.example.com/ws")
    useConnectionStore.getState().markConnecting()
    useConnectionStore.getState().markConnected()

    const state = useConnectionStore.getState()
    expect(state.relayUrl).toBe("wss://relay.example.com/ws")
    expect(state.phase).toBe("connected")
    expect(state.lastConnectedAt).toBeTruthy()
    expect(state.lastError).toBeNull()
  })

  it("tracks reconnect attempts and errors", () => {
    useConnectionStore.getState().markReconnectAttempt("连接失败，5 秒后重试")
    useConnectionStore.getState().markError("relay disconnected")

    const state = useConnectionStore.getState()
    expect(state.reconnectAttempts).toBe(1)
    expect(state.phase).toBe("error")
    expect(state.lastError).toBe("relay disconnected")
    expect(state.lastErrorAt).toBeTruthy()
  })

  it("tracks disconnects", () => {
    useConnectionStore.getState().markDisconnected("中继连接已断开")

    const state = useConnectionStore.getState()
    expect(state.phase).toBe("idle")
    expect(state.lastDisconnectedAt).toBeTruthy()
    expect(state.lastEvent).toBe("中继连接已断开")
  })
})
