import { cn } from "@/lib/utils"
import type { DeviceInfo } from "@/types"

interface SidebarProps {
  localName: string
  connectionStatus: "lan" | "relay" | "offline"
  devices: DeviceInfo[]
  activeDeviceId?: string
  onSelectDevice: (id: string) => void
  onNavigate: (page: string) => void
  currentPage: string
}

const statusDot = {
  lan: "bg-emerald-500 shadow-[0_0_6px_-1px_rgba(34,197,94,0.3)]",
  relay: "bg-amber-500 shadow-[0_0_6px_-1px_rgba(245,158,11,0.3)]",
  offline: "bg-muted-foreground/40",
}

function DeviceStatusDot({ status }: { status: "lan" | "relay" | "offline" }) {
  return (
    <span className={cn(
      "inline-block h-2 w-2 rounded-full",
      statusDot[status]
    )} />
  )
}

function DeviceIcon({ type }: { type: "desktop" | "web" }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-border/40 bg-muted/50 text-xs text-muted-foreground">
      {type === "desktop" ? "🖥" : "🌐"}
    </span>
  )
}

export function Sidebar({
  localName,
  connectionStatus,
  devices,
  activeDeviceId,
  onSelectDevice,
  onNavigate,
  currentPage,
}: SidebarProps) {
  return (
    <aside className="flex w-72 flex-col border-r border-border/50 bg-muted/30">
      {/* 设备信息 */}
      <div className="flex items-center gap-3 border-b border-border/30 px-5 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary text-sm text-primary-foreground font-medium">
          {localName.charAt(0).toUpperCase()}
        </span>
        <div className="flex flex-col min-w-0">
          <span className="truncate text-sm font-medium">{localName}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <DeviceStatusDot status={connectionStatus} />
            {connectionStatus === "lan" && "局域网"}
            {connectionStatus === "relay" && "中继连接"}
            {connectionStatus === "offline" && "离线"}
          </span>
        </div>
      </div>

      {/* 设备列表 */}
      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-4 pb-1 pt-3 text-xs font-medium text-muted-foreground">
          设备 · {devices.length}
        </div>

        {devices.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground/60">
            <div className="mb-2 text-lg">📡</div>
            <div>未发现设备</div>
            <div className="mt-1">确保在同一网络或连接中继</div>
          </div>
        ) : (
          <div className="space-y-0.5 px-2">
            {devices.map((device) => (
              <button
                key={device.id}
                onClick={() => onSelectDevice(device.id)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-sm transition-all duration-150",
                  activeDeviceId === device.id
                    ? "bg-accent/10 text-foreground"
                    : "text-foreground/70 hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <DeviceIcon type={device.deviceType} />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="truncate font-medium">{device.name}</span>
                  {(!device.status || device.status === "offline") && device.lastSeen && (
                    <span className="text-xs text-muted-foreground/60">
                      上次活跃: {device.lastSeen}
                    </span>
                  )}
                </div>
                <DeviceStatusDot
                  status={
                    device.status === "online"
                      ? "lan"
                      : device.status === "relay"
                      ? "relay"
                      : "offline"
                  }
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 底部导航 */}
      <div className="border-t border-border/30 px-2 py-2">
        <button
          onClick={() => onNavigate("transfers")}
          className={cn(
            "flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-sm transition-all duration-150",
            currentPage === "transfers"
              ? "bg-accent/10 text-foreground font-medium"
              : "text-foreground/60 hover:bg-muted/60 hover:text-foreground"
          )}
        >
          <svg className="h-4 w-4" strokeWidth="1.5" stroke="currentColor" fill="none" viewBox="0 0 24 24">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          传输列表
        </button>
        <button
          onClick={() => onNavigate("settings")}
          className={cn(
            "flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-sm transition-all duration-150",
            currentPage === "settings"
              ? "bg-accent/10 text-foreground font-medium"
              : "text-foreground/60 hover:bg-muted/60 hover:text-foreground"
          )}
        >
          <svg className="h-4 w-4" strokeWidth="1.5" stroke="currentColor" fill="none" viewBox="0 0 24 24">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          设置
        </button>
      </div>
    </aside>
  )
}
