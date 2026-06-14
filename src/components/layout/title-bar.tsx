interface TitleBarProps {
  title?: string
  onMinimize?: () => void
  onMaximize?: () => void
  onClose?: () => void
  isTauri: boolean
}

export function TitleBar({ title, onMinimize, onMaximize, onClose, isTauri }: TitleBarProps) {
  if (!isTauri) return null

  return (
    <div
      className="flex h-9 items-center justify-between border-b border-border/30 bg-muted/20 px-3 select-none"
      data-tauri-drag-region
    >
      {/* 左侧：Logo */}
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-[3px] bg-primary text-[10px] text-primary-foreground font-serif leading-none">
          送
        </span>
        <span className="text-xs font-medium text-foreground/60 tracking-wider">
          rust-send
        </span>
      </div>

      {/* 中间：当前页面标题 */}
      {title && (
        <span className="text-xs text-foreground/40">
          {title}
        </span>
      )}

      {/* 右侧：窗口控制 */}
      {/* Tauri v2 使用 data-tauri-drag-region，macOS 用原生交通灯，这里仅占位 */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onMinimize}
          className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] text-foreground/20 hover:text-foreground/60 transition-colors"
        >
          —
        </button>
        <button
          onClick={onMaximize}
          className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] text-foreground/20 hover:text-foreground/60 transition-colors"
        >
          □
        </button>
        <button
          onClick={onClose}
          className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] text-foreground/20 hover:text-destructive transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
