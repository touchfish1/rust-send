import { describe, it, expect, beforeEach } from "vitest"
import { useSettingsStore } from "@/stores/settings-store"

describe("SettingsStore", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      downloadDir: "",
      chunkSize: 65536,
      autoAcceptLan: false,
      autoCheckUpdates: true,
      relayUrl: "",
      theme: "system",
    })
  })

  it("default values are correct", () => {
    const state = useSettingsStore.getState()
    expect(state.chunkSize).toBe(65536)
    expect(state.autoAcceptLan).toBe(false)
    expect(state.autoCheckUpdates).toBe(true)
    expect(state.theme).toBe("system")
  })

  it("sets download directory", () => {
    useSettingsStore.getState().setDownloadDir("/downloads")
    expect(useSettingsStore.getState().downloadDir).toBe("/downloads")
  })

  it("sets chunk size", () => {
    useSettingsStore.getState().setChunkSize(262144)
    expect(useSettingsStore.getState().chunkSize).toBe(262144)
  })

  it("toggles auto accept", () => {
    useSettingsStore.getState().setAutoAcceptLan(true)
    expect(useSettingsStore.getState().autoAcceptLan).toBe(true)
  })

  it("toggles auto check updates", () => {
    useSettingsStore.getState().setAutoCheckUpdates(false)
    expect(useSettingsStore.getState().autoCheckUpdates).toBe(false)
  })

  it("sets relay URL", () => {
    useSettingsStore.getState().setRelayUrl("wss://relay.example.com")
    expect(useSettingsStore.getState().relayUrl).toBe("wss://relay.example.com")
  })

  it("sets theme", () => {
    useSettingsStore.getState().setTheme("dark")
    expect(useSettingsStore.getState().theme).toBe("dark")
  })
})
