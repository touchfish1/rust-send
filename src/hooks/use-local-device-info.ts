import { useEffect } from "react"
import { useDeviceStore } from "@/stores/device-store"
import { isTauri } from "./use-tauri-event"

type LocalDeviceInfo = {
  id: string
  name: string
}

const WEB_DEVICE_ID_KEY = "rust-send-web-device-id"
const WEB_DEVICE_NAME_KEY = "rust-send-web-device-name"

export function useLocalDeviceInfo() {
  const setLocalInfo = useDeviceStore((s) => s.setLocalInfo)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (isTauri()) {
        try {
          const { invoke } = await import("@tauri-apps/api/core")
          const info = await invoke<LocalDeviceInfo>("get_device_info")
          if (!cancelled) {
            setLocalInfo(info.id, info.name)
          }
          return
        } catch (e) {
          console.warn("load local device info failed:", e)
        }
      }

      const id = getOrCreateWebDeviceId()
      const name = window.localStorage.getItem(WEB_DEVICE_NAME_KEY) || `Device-${id.slice(0, 6)}`
      if (!cancelled) {
        setLocalInfo(id, name)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [setLocalInfo])
}

function getOrCreateWebDeviceId() {
  const existing = window.localStorage.getItem(WEB_DEVICE_ID_KEY)
  if (existing) return existing

  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
        })
  window.localStorage.setItem(WEB_DEVICE_ID_KEY, generated)
  return generated
}

export function saveWebDeviceName(name: string) {
  window.localStorage.setItem(WEB_DEVICE_NAME_KEY, name)
}
