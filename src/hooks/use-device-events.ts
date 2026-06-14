import { useCallback } from "react"
import { useTauriEvent } from "./use-tauri-event"
import { useDeviceStore } from "@/stores/device-store"
import type { DeviceInfo, ConnectionStatus } from "@/types"

export function useDeviceEvents() {
  const addDevice = useDeviceStore((s) => s.addDevice)
  const removeDevice = useDeviceStore((s) => s.removeDevice)
  const setStatus = useDeviceStore((s) => s.setStatus)

  const onDeviceFound = useCallback(
    (device: DeviceInfo) => {
      addDevice({ ...device, status: "online" })
    },
    [addDevice]
  )

  const onDeviceLost = useCallback(
    (payload: { device_id: string }) => {
      removeDevice(payload.device_id)
    },
    [removeDevice]
  )

  const onConnectionState = useCallback(
    (payload: ConnectionStatus) => {
      setStatus(payload)
    },
    [setStatus]
  )

  useTauriEvent("device:discovered", onDeviceFound)
  useTauriEvent("device:lost", onDeviceLost)
  useTauriEvent("connection:state", onConnectionState)
}
