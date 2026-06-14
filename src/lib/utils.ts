import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / Math.pow(1024, i)
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return ""
  return `${formatFileSize(bytesPerSec)}/s`
}

export function formatEta(seconds: number): string {
  if (seconds <= 0) return ""
  if (seconds < 60) return `剩余 ${Math.ceil(seconds)} 秒`
  if (seconds < 3600) return `剩余 ${Math.ceil(seconds / 60)} 分钟`
  return `剩余 ${(seconds / 3600).toFixed(1)} 小时`
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
}

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return d.toLocaleDateString("zh-CN")
}

export function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || ""
  const iconMap: Record<string, string> = {
    pdf: "📄",
    doc: "📄",
    docx: "📄",
    xls: "📊",
    xlsx: "📊",
    ppt: "📽",
    pptx: "📽",
    jpg: "🖼",
    jpeg: "🖼",
    png: "🖼",
    gif: "🖼",
    webp: "🖼",
    svg: "🖼",
    mp4: "🎬",
    mov: "🎬",
    avi: "🎬",
    mkv: "🎬",
    webm: "🎬",
    mp3: "🎵",
    wav: "🎵",
    flac: "🎵",
    aac: "🎵",
    zip: "📦",
    rar: "📦",
    "7z": "📦",
    tar: "📦",
    gz: "📦",
    exe: "⚙",
    dmg: "⚙",
    appimage: "⚙",
    sh: "📜",
    txt: "📝",
    md: "📝",
    json: "📝",
    yml: "📝",
    yaml: "📝",
    toml: "📝",
    rs: "🦀",
    ts: "🟦",
    js: "🟨",
    py: "🐍",
    go: "🔵",
    css: "🎨",
    html: "🌐",
  }
  return iconMap[ext] || "📎"
}
