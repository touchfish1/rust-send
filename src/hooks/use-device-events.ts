import { useCallback } from "react"
import { useTauriEvent } from "./use-tauri-event"
import { useDeviceStore } from "@/stores/device-store"
import type { DeviceInfo, ConnectionStatus } from "@/types"
import { useConnectionStore } from "@/stores/connection-store"

export function useDeviceEvents() {
  const addDevice = useDeviceStore((s) => s.addDevice)
  const removeDevice = useDeviceStore((s) => s.removeDevice)
  const setStatus = useDeviceStore((s) => s.setStatus)
  const markConnected = useConnectionStore((s) => s.markConnected)
  const markDisconnected = useConnectionStore((s) => s.markDisconnected)
  const markError = useConnectionStore((s) => s.markError)

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
      if (payload.state === "relay") {
        markConnected("中继连接可用")
      } else if (payload.state === "offline") {
        markDisconnected("当前未连接到中继")
      }
    },
    [markConnected, markDisconnected, setStatus]
  )

  const onRelayError = useCallback(
    (payload: { message?: string }) => {
      if (payload.message) {
        markError(payload.message)
      }
    },
    [markError]
  )

  useTauriEvent("device:discovered", onDeviceFound)
  useTauriEvent("device:lost", onDeviceLost)
  useTauriEvent("connection:state", onConnectionState)
  useTauriEvent("relay:error", onRelayError)
}
