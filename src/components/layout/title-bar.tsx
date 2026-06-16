import { Minus, Square, X } from "lucide-react"
import { AppMark } from "@/components/branding/app-mark"

interface TitleBarProps {
  title?: string
  onMinimize?: () => void
  onMaximize?: () => void
  onClose?: () => void
  isTauri: boolean
}

export function TitleBar({ title, onMinimize, onMaximize, onClose, isTauri }: TitleBarProps) {
  if (!isTauri) return null

  const handleMinimize = async () => {
    if (onMinimize) return onMinimize()
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    await getCurrentWindow().minimize()
  }

  const handleMaximize = async () => {
    if (onMaximize) return onMaximize()
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    await getCurrentWindow().toggleMaximize()
  }

  const handleClose = async () => {
    if (onClose) return onClose()
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    await getCurrentWindow().close()
  }

  return (
    <div className="flex h-10 items-center border-b border-border/30 bg-muted/20 select-none backdrop-blur-sm">
      <div
        className="flex h-full min-w-0 flex-1 items-center justify-between px-3"
        data-tauri-drag-region
      >
        {/* 左侧：Logo */}
        <div className="group flex items-center gap-2 transition-all duration-300" data-tauri-drag-region>
          <AppMark size="sm" className="transition-transform duration-300 group-hover:-translate-y-0.5" />
          <span
            className="text-xs font-medium text-foreground/60 tracking-[0.24em] transition-colors duration-300 group-hover:text-foreground/80"
            data-tauri-drag-region
          >
            rust-send
          </span>
        </div>

        {/* 中间：当前页面标题 */}
        {title && (
          <span className="truncate text-xs text-foreground/40 animate-ink-fade" data-tauri-drag-region>
            {title}
          </span>
        )}
      </div>

      {/* 右侧：窗口控制 */}
      <div className="flex h-full shrink-0 items-center gap-1 px-2">
        <button
          type="button"
          onClick={handleMinimize}
          aria-label="最小化"
          title="最小化"
          className="flex h-8 w-10 items-center justify-center rounded-sm text-foreground/45 transition-[transform,color,background-color] duration-200 hover:-translate-y-0.5 hover:bg-muted hover:text-foreground/75 active:translate-y-0 active:bg-muted/80"
        >
          <Minus className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          aria-label="最大化"
          title="最大化"
          className="flex h-8 w-10 items-center justify-center rounded-sm text-foreground/45 transition-[transform,color,background-color] duration-200 hover:-translate-y-0.5 hover:bg-muted hover:text-foreground/75 active:translate-y-0 active:bg-muted/80"
        >
          <Square className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={handleClose}
          aria-label="关闭"
          title="关闭"
          className="flex h-8 w-10 items-center justify-center rounded-sm text-foreground/45 transition-[transform,color,background-color] duration-200 hover:-translate-y-0.5 hover:bg-destructive hover:text-destructive-foreground active:translate-y-0 active:bg-destructive/90"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
