import { cn } from "@/lib/utils"
import { formatRelativeTime } from "@/lib/utils"
import type { DeviceInfo } from "@/types"
import type { CSSProperties } from "react"
import { Badge } from "@/components/ui/badge"

interface SidebarProps {
  localName: string
  connectionStatus: "lan" | "relay" | "offline"
  devices: DeviceInfo[]
  recentDevices: DeviceInfo[]
  trustedDeviceIds: string[]
  activeDeviceId?: string
  onSelectDevice: (id: string) => void
  onNavigate: (page: string) => void
  currentPage: string
  updateAvailable?: boolean
}

const statusDot = {
  lan: "bg-emerald-500 shadow-[0_0_6px_-1px_rgba(34,197,94,0.3)]",
  relay: "bg-amber-500 shadow-[0_0_6px_-1px_rgba(245,158,11,0.3)]",
  offline: "bg-muted-foreground/40",
}

function DeviceStatusDot({ status }: { status: "lan" | "relay" | "offline" }) {
  return (
    <span className={cn(
      "inline-block h-2 w-2 rounded-full transition-transform duration-300",
      status !== "offline" && "animate-status-pulse",
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
  recentDevices,
  trustedDeviceIds,
  activeDeviceId,
  onSelectDevice,
  onNavigate,
  currentPage,
  updateAvailable = false,
}: SidebarProps) {
  const offlineRecentDevices = recentDevices
    .filter((device) => !devices.some((online) => online.id === device.id))
    .sort((a, b) => Number(trustedDeviceIds.includes(b.id)) - Number(trustedDeviceIds.includes(a.id)))

  return (
    <aside className="flex w-72 flex-col border-r border-border/50 bg-muted/30 backdrop-blur-sm animate-ink-slide">
      {/* 设备信息 */}
      <div className="flex items-center gap-3 border-b border-border/30 px-5 py-4 motion-stagger [--stagger-delay:40ms]">
        <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary text-sm font-medium text-primary-foreground shadow-[0_10px_30px_-18px_hsl(var(--primary)/0.95)] transition-transform duration-300 hover:-translate-y-0.5">
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

        {devices.length === 0 && offlineRecentDevices.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground/60">
            <div className="mb-2 text-lg">📡</div>
            <div>未发现设备</div>
            <div className="mt-1">确保在同一网络或连接中继</div>
          </div>
        ) : (
          <div className="space-y-3 px-2">
            {devices.length > 0 && (
              <div>
                <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/55">
                  当前在线
                </div>
                <div className="space-y-1">
                  {devices.map((device, index) => (
                    <DeviceListItem
                      key={device.id}
                      device={device}
                      trusted={trustedDeviceIds.includes(device.id)}
                      activeDeviceId={activeDeviceId}
                      index={index}
                      onSelectDevice={onSelectDevice}
                    />
                  ))}
                </div>
              </div>
            )}

            {offlineRecentDevices.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-2 pb-1">
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/55">
                    最近设备
                  </div>
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {offlineRecentDevices.length}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {offlineRecentDevices.map((device, index) => (
                    <DeviceListItem
                      key={device.id}
                      device={device}
                      trusted={trustedDeviceIds.includes(device.id)}
                      activeDeviceId={activeDeviceId}
                      index={devices.length + index}
                      onSelectDevice={onSelectDevice}
                      recent
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部导航 */}
      <div className="border-t border-border/30 px-2 py-2">
        <button
          onClick={() => onNavigate("transfers")}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none transition-[transform,background-color,color,box-shadow] duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-0",
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
            "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none transition-[transform,background-color,color,box-shadow] duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-0",
            currentPage === "settings"
              ? "bg-accent/10 text-foreground font-medium"
              : "text-foreground/60 hover:bg-muted/60 hover:text-foreground"
          )}
        >
          <svg className="h-4 w-4" strokeWidth="1.5" stroke="currentColor" fill="none" viewBox="0 0 24 24">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="flex items-center gap-2">
            设置
            {updateAvailable && (
              <Badge variant="warning" className="px-1.5 py-0 text-[10px] uppercase tracking-wide">
                New
              </Badge>
            )}
          </span>
        </button>
      </div>
    </aside>
  )
}

function DeviceListItem({
  device,
  trusted,
  activeDeviceId,
  index,
  onSelectDevice,
  recent = false,
}: {
  device: DeviceInfo
  trusted?: boolean
  activeDeviceId?: string
  index: number
  onSelectDevice: (id: string) => void
  recent?: boolean
}) {
  const status =
    device.status === "online"
      ? "lan"
      : device.status === "relay"
      ? "relay"
      : "offline"

  return (
    <button
      onClick={() => onSelectDevice(device.id)}
      style={{ "--stagger-delay": `${80 + index * 40}ms` } as CSSProperties}
      className={cn(
        "group motion-stagger relative flex w-full items-center gap-3 overflow-hidden rounded-md px-3 py-2.5 text-left text-sm outline-none transition-[transform,background-color,color,box-shadow] duration-300 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-0",
        activeDeviceId === device.id
          ? "bg-accent/10 text-foreground shadow-[0_12px_24px_-22px_hsl(var(--primary)/0.9)]"
          : "text-foreground/70 hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <span
        className={cn(
          "absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary/70 transition-all duration-300",
          activeDeviceId === device.id ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
        )}
      />
      <DeviceIcon type={device.deviceType} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{device.name}</span>
          {trusted && <Badge variant="success" className="px-1.5 py-0 text-[10px]">可信</Badge>}
          {recent && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">最近</Badge>}
        </div>
        {device.lastSeen && (
          <span className="text-xs text-muted-foreground/60">
            {status === "offline" ? "上次活跃" : "刚刚同步"} · {formatRelativeTime(device.lastSeen)}
          </span>
        )}
      </div>
      <DeviceStatusDot status={status} />
    </button>
  )
}
