import { create } from "zustand"
import type { DeviceInfo, ConnectionStatus } from "@/types"

interface DeviceState {
  localId: string
  localName: string
  devices: Map<string, DeviceInfo>
  status: ConnectionStatus

  setLocalInfo: (id: string, name: string) => void
  setDevices: (devices: DeviceInfo[]) => void
  addDevice: (device: DeviceInfo) => void
  removeDevice: (id: string) => void
  setStatus: (status: ConnectionStatus) => void
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  localId: "",
  localName: "",
  devices: new Map(),
  status: { state: "offline" },

  setLocalInfo: (id, name) => set({ localId: id, localName: name }),

  setDevices: (devices) => {
    const map = new Map<string, DeviceInfo>()
    for (const d of devices) {
      map.set(d.id, d)
    }
    set({ devices: map })
  },

  addDevice: (device) => {
    const devices = new Map(get().devices)
    devices.set(device.id, device)
    set({ devices })
  },

  removeDevice: (id) => {
    const devices = new Map(get().devices)
    devices.delete(id)
    set({ devices })
  },

  setStatus: (status) => set({ status }),
}))
