import { describe, it, expect, beforeEach } from "vitest"
import { useDeviceStore } from "@/stores/device-store"

const mockDevice = {
  id: "dev-1",
  name: "MacBook Pro",
  deviceType: "desktop" as const,
  lastSeen: "2024-01-15T14:30:00Z",
}

const mockDevice2 = {
  id: "dev-2",
  name: "Linux-PC",
  deviceType: "desktop" as const,
  lastSeen: "2024-01-15T14:31:00Z",
}

describe("DeviceStore", () => {
  beforeEach(() => {
    useDeviceStore.setState({
      localId: "",
      localName: "",
      devices: new Map(),
      recentDevices: [],
      trustedDeviceIds: [],
      status: { state: "offline" },
    })
  })

  it("sets local info", () => {
    useDeviceStore.getState().setLocalInfo("id-1", "My Mac")
    const { localId, localName } = useDeviceStore.getState()
    expect(localId).toBe("id-1")
    expect(localName).toBe("My Mac")
  })

  it("adds a device", () => {
    useDeviceStore.getState().addDevice(mockDevice)
    const devices = useDeviceStore.getState().devices
    expect(devices.size).toBe(1)
    expect(devices.get("dev-1")?.name).toBe("MacBook Pro")
    expect(useDeviceStore.getState().recentDevices[0]?.id).toBe("dev-1")
  })

  it("adds multiple devices", () => {
    useDeviceStore.getState().addDevice(mockDevice)
    useDeviceStore.getState().addDevice(mockDevice2)
    expect(useDeviceStore.getState().devices.size).toBe(2)
  })

  it("removes a device", () => {
    useDeviceStore.getState().addDevice(mockDevice)
    useDeviceStore.getState().addDevice(mockDevice2)
    useDeviceStore.getState().removeDevice("dev-1")
    const devices = useDeviceStore.getState().devices
    expect(devices.size).toBe(1)
    expect(devices.has("dev-1")).toBe(false)
    expect(useDeviceStore.getState().recentDevices.some((device) => device.id === "dev-1")).toBe(true)
  })

  it("replaces devices via setDevices", () => {
    useDeviceStore.getState().addDevice(mockDevice)
    useDeviceStore.getState().setDevices([mockDevice2])
    const devices = useDeviceStore.getState().devices
    expect(devices.size).toBe(1)
    expect(devices.get("dev-2")?.name).toBe("Linux-PC")
    expect(useDeviceStore.getState().recentDevices.length).toBe(2)
  })

  it("updates connection status", () => {
    useDeviceStore.getState().setStatus({ state: "lan" })
    expect(useDeviceStore.getState().status.state).toBe("lan")
  })

  it("clears recent devices", () => {
    useDeviceStore.getState().addDevice(mockDevice)
    expect(useDeviceStore.getState().recentDevices.length).toBe(1)
    useDeviceStore.getState().clearRecentDevices()
    expect(useDeviceStore.getState().recentDevices.length).toBe(0)
  })

  it("marks and unmarks trusted devices", () => {
    useDeviceStore.getState().trustDevice("dev-1")
    expect(useDeviceStore.getState().trustedDeviceIds).toEqual(["dev-1"])

    useDeviceStore.getState().toggleTrustedDevice("dev-1")
    expect(useDeviceStore.getState().trustedDeviceIds).toEqual([])

    useDeviceStore.getState().toggleTrustedDevice("dev-2")
    expect(useDeviceStore.getState().trustedDeviceIds).toEqual(["dev-2"])

    useDeviceStore.getState().untrustDevice("dev-2")
    expect(useDeviceStore.getState().trustedDeviceIds).toEqual([])
  })

  it("clears trusted devices", () => {
    useDeviceStore.getState().trustDevice("dev-1")
    useDeviceStore.getState().trustDevice("dev-2")
    expect(useDeviceStore.getState().trustedDeviceIds.length).toBe(2)
    useDeviceStore.getState().clearTrustedDevices()
    expect(useDeviceStore.getState().trustedDeviceIds).toEqual([])
  })
})
