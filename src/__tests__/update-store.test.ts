import { beforeEach, describe, expect, it } from "vitest"
import { useUpdateStore } from "@/stores/update-store"

describe("UpdateStore", () => {
  beforeEach(() => {
    useUpdateStore.setState({
      currentVersion: "",
      latestVersion: null,
      latestNotes: "",
      latestDate: null,
      checking: false,
      downloading: false,
      downloadProgress: 0,
      downloadedBytes: 0,
      totalBytes: null,
      error: null,
    })
  })

  it("stores the current app version", () => {
    useUpdateStore.getState().setCurrentVersion("0.1.0")
    expect(useUpdateStore.getState().currentVersion).toBe("0.1.0")
  })

  it("stores available update metadata", () => {
    useUpdateStore.getState().setAvailableUpdate({
      version: "0.2.0",
      notes: "Important fixes",
      date: "2026-06-17T00:00:00Z",
    })

    const state = useUpdateStore.getState()
    expect(state.latestVersion).toBe("0.2.0")
    expect(state.latestNotes).toBe("Important fixes")
    expect(state.latestDate).toBe("2026-06-17T00:00:00Z")
  })

  it("tracks download progress", () => {
    useUpdateStore.getState().setDownloadProgress({
      progress: 48,
      downloadedBytes: 480,
      totalBytes: 1000,
    })

    const state = useUpdateStore.getState()
    expect(state.downloadProgress).toBe(48)
    expect(state.downloadedBytes).toBe(480)
    expect(state.totalBytes).toBe(1000)
  })

  it("clears available update metadata", () => {
    useUpdateStore.getState().setAvailableUpdate({
      version: "0.2.0",
      notes: "Important fixes",
      date: "2026-06-17T00:00:00Z",
    })
    useUpdateStore.getState().clearAvailableUpdate()

    const state = useUpdateStore.getState()
    expect(state.latestVersion).toBeNull()
    expect(state.latestNotes).toBe("")
    expect(state.latestDate).toBeNull()
  })
})
