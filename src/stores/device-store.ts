import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { DeviceInfo, ConnectionStatus } from "@/types"

const MAX_RECENT_DEVICES = 8

interface DeviceState {
  localId: string
  localName: string
  devices: Map<string, DeviceInfo>
  recentDevices: DeviceInfo[]
  trustedDeviceIds: string[]
  status: ConnectionStatus

  setLocalInfo: (id: string, name: string) => void
  setDevices: (devices: DeviceInfo[]) => void
  addDevice: (device: DeviceInfo) => void
  removeDevice: (id: string) => void
  setStatus: (status: ConnectionStatus) => void
  trustDevice: (id: string) => void
  untrustDevice: (id: string) => void
  toggleTrustedDevice: (id: string) => void
  clearTrustedDevices: () => void
  clearRecentDevices: () => void
}

export const useDeviceStore = create<DeviceState>()(
  persist(
    (set, get) => ({
      localId: "",
      localName: "",
      devices: new Map(),
      recentDevices: [],
      trustedDeviceIds: [],
      status: { state: "offline" },

      setLocalInfo: (id, name) => set({ localId: id, localName: name }),

      setDevices: (devices) => {
        const map = new Map<string, DeviceInfo>()
        for (const d of devices) {
          map.set(d.id, d)
        }
        set((state) => ({
          devices: map,
          recentDevices: mergeRecentDevices(state.recentDevices, devices),
        }))
      },

      addDevice: (device) => {
        const devices = new Map(get().devices)
        devices.set(device.id, device)
        set((state) => ({
          devices,
          recentDevices: mergeRecentDevices(state.recentDevices, [device]),
        }))
      },

      removeDevice: (id) => {
        const devices = new Map(get().devices)
        const existing = devices.get(id)
        devices.delete(id)
        set((state) => ({
          devices,
          recentDevices: existing
            ? mergeRecentDevices(state.recentDevices, [
                {
                  ...existing,
                  status: "offline",
                  lastSeen: new Date().toISOString(),
                },
              ])
            : state.recentDevices,
        }))
      },

      setStatus: (status) => set({ status }),

      trustDevice: (id) =>
        set((state) => ({
          trustedDeviceIds: addTrustedDevice(state.trustedDeviceIds, id),
        })),

      untrustDevice: (id) =>
        set((state) => ({
          trustedDeviceIds: state.trustedDeviceIds.filter((deviceId) => deviceId !== id),
        })),

      toggleTrustedDevice: (id) =>
        set((state) => ({
          trustedDeviceIds: state.trustedDeviceIds.includes(id)
            ? state.trustedDeviceIds.filter((deviceId) => deviceId !== id)
            : addTrustedDevice(state.trustedDeviceIds, id),
        })),

      clearTrustedDevices: () => set({ trustedDeviceIds: [] }),

      clearRecentDevices: () => set({ recentDevices: [] }),
    }),
    {
      name: "rust-send-devices",
      partialize: (state) => ({
        recentDevices: state.recentDevices,
        trustedDeviceIds: state.trustedDeviceIds,
      }),
    }
  )
)

function addTrustedDevice(current: string[], id: string) {
  if (current.includes(id)) return current
  return [...current, id]
}

function mergeRecentDevices(current: DeviceInfo[], incoming: DeviceInfo[]) {
  const byId = new Map<string, DeviceInfo>()

  for (const device of current) {
    byId.set(device.id, {
      ...device,
      status: device.status === "online" ? "offline" : device.status || "offline",
    })
  }

  for (const device of incoming) {
    const previous = byId.get(device.id)
    byId.set(device.id, {
      ...previous,
      ...device,
      lastSeen: device.lastSeen || previous?.lastSeen || new Date().toISOString(),
    })
  }

  return Array.from(byId.values())
    .sort((a, b) => getTimestamp(b.lastSeen) - getTimestamp(a.lastSeen))
    .slice(0, MAX_RECENT_DEVICES)
}

function getTimestamp(value?: string) {
  if (!value) return 0
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}
