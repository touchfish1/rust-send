import { create } from "zustand"

interface UpdateState {
  currentVersion: string
  latestVersion: string | null
  latestNotes: string
  latestDate: string | null
  checking: boolean
  downloading: boolean
  downloadProgress: number
  downloadedBytes: number
  totalBytes: number | null
  error: string | null

  setCurrentVersion: (version: string) => void
  setChecking: (checking: boolean) => void
  setAvailableUpdate: (payload: {
    version: string
    notes?: string | null
    date?: string | null
  }) => void
  clearAvailableUpdate: () => void
  setDownloading: (downloading: boolean) => void
  setDownloadProgress: (payload: {
    progress: number
    downloadedBytes: number
    totalBytes: number | null
  }) => void
  resetDownloadProgress: () => void
  setError: (error: string | null) => void
}

export const useUpdateStore = create<UpdateState>((set) => ({
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

  setCurrentVersion: (version) => set({ currentVersion: version }),
  setChecking: (checking) => set({ checking }),
  setAvailableUpdate: ({ version, notes, date }) =>
    set({
      latestVersion: version,
      latestNotes: notes ?? "",
      latestDate: date ?? null,
      error: null,
    }),
  clearAvailableUpdate: () =>
    set({
      latestVersion: null,
      latestNotes: "",
      latestDate: null,
      error: null,
    }),
  setDownloading: (downloading) => set({ downloading }),
  setDownloadProgress: ({ progress, downloadedBytes, totalBytes }) =>
    set({
      downloadProgress: progress,
      downloadedBytes,
      totalBytes,
    }),
  resetDownloadProgress: () =>
    set({
      downloadProgress: 0,
      downloadedBytes: 0,
      totalBytes: null,
    }),
  setError: (error) => set({ error }),
}))
