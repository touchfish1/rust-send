import { getVersion } from "@tauri-apps/api/app"
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"
import { isTauri } from "@/hooks/use-tauri-event"
import { useUpdateStore } from "@/stores/update-store"

declare const __APP_VERSION__: string

type CheckForUpdatesResult =
  | {
      supported: false
      available: false
      currentVersion: string
    }
  | {
      supported: true
      available: false
      currentVersion: string
    }
  | {
      supported: true
      available: true
      currentVersion: string
      latestVersion: string
      notes: string
      date: string | null
    }

async function resolveCurrentVersion() {
  const store = useUpdateStore.getState()
  if (store.currentVersion) {
    return store.currentVersion
  }

  const version = isTauri() ? await getVersion() : __APP_VERSION__
  useUpdateStore.getState().setCurrentVersion(version)
  return version
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === "string" && error.trim()) {
    return error
  }

  return "更新服务暂时不可用"
}

function applyDownloadProgress(event: DownloadEvent, downloadedBytes: number, totalBytes: number | null) {
  const store = useUpdateStore.getState()

  if (event.event === "Started") {
    const nextTotal = event.data.contentLength ?? null
    store.setDownloadProgress({
      progress: 0,
      downloadedBytes: 0,
      totalBytes: nextTotal,
    })
    return { downloadedBytes: 0, totalBytes: nextTotal }
  }

  if (event.event === "Progress") {
    const nextDownloaded = downloadedBytes + event.data.chunkLength
    const progress = totalBytes && totalBytes > 0
      ? Math.min(100, (nextDownloaded / totalBytes) * 100)
      : 0

    store.setDownloadProgress({
      progress,
      downloadedBytes: nextDownloaded,
      totalBytes,
    })
    return { downloadedBytes: nextDownloaded, totalBytes }
  }

  store.setDownloadProgress({
    progress: 100,
    downloadedBytes,
    totalBytes,
  })
  return { downloadedBytes, totalBytes }
}

export async function bootstrapUpdater() {
  const currentVersion = await resolveCurrentVersion()

  if (!isTauri()) {
    return {
      supported: false as const,
      currentVersion,
    }
  }

  return {
    supported: true as const,
    currentVersion,
  }
}

export async function checkForUpdates({
  silent = false,
}: {
  silent?: boolean
} = {}): Promise<CheckForUpdatesResult> {
  const store = useUpdateStore.getState()
  const currentVersion = await resolveCurrentVersion()

  if (!isTauri()) {
    store.clearAvailableUpdate()
    return {
      supported: false,
      available: false,
      currentVersion,
    }
  }

  store.setChecking(true)
  store.setError(null)

  try {
    const update = await check()

    if (!update) {
      store.clearAvailableUpdate()
      return {
        supported: true,
        available: false,
        currentVersion,
      }
    }

    const notes = update.body?.trim() ?? ""
    const date = update.date ?? null

    store.setAvailableUpdate({
      version: update.version,
      notes,
      date,
    })

    return {
      supported: true,
      available: true,
      currentVersion,
      latestVersion: update.version,
      notes,
      date,
    }
  } catch (error) {
    const message = normalizeErrorMessage(error)

    if (!silent) {
      store.setError(message)
      throw new Error(message)
    }

    return {
      supported: true,
      available: false,
      currentVersion,
    }
  } finally {
    store.setChecking(false)
  }
}

export async function downloadAndInstallUpdate() {
  const store = useUpdateStore.getState()

  if (!isTauri()) {
    throw new Error("当前环境不支持应用内升级")
  }

  store.setDownloading(true)
  store.setError(null)
  store.resetDownloadProgress()

  try {
    const update = await check()
    if (!update) {
      store.clearAvailableUpdate()
      return {
        installed: false as const,
        reason: "up-to-date" as const,
      }
    }

    store.setAvailableUpdate({
      version: update.version,
      notes: update.body ?? "",
      date: update.date ?? null,
    })

    let downloadedBytes = 0
    let totalBytes: number | null = null

    await update.downloadAndInstall((event) => {
      const next = applyDownloadProgress(event, downloadedBytes, totalBytes)
      downloadedBytes = next.downloadedBytes
      totalBytes = next.totalBytes
    })

    await relaunch()

    return {
      installed: true as const,
    }
  } catch (error) {
    const message = normalizeErrorMessage(error)
    store.setError(message)
    throw new Error(message)
  } finally {
    store.setDownloading(false)
  }
}
