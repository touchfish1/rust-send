import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { AppMark } from "@/components/branding/app-mark"
import { useSettingsStore } from "@/stores/settings-store"
import { useDeviceStore } from "@/stores/device-store"
import { useUpdateStore } from "@/stores/update-store"
import { useToast } from "@/components/ui/toast"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import type { CSSProperties, ReactNode } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTheme } from "next-themes"
import { isTauri } from "@/hooks/use-tauri-event"
import { saveWebDeviceName } from "@/hooks/use-local-device-info"
import { checkForUpdates, downloadAndInstallUpdate } from "@/services/update-service"
import type { DeviceInfo } from "@/types"

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="motion-stagger" style={{ "--stagger-delay": "80ms" } as CSSProperties}>
      <div className="mb-4 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground/60">
        <span className="inline-block h-3 w-0.5 rounded-full bg-border/60" />
        {title}
      </div>
      <Card className="divide-y divide-border/30">
        {children}
      </Card>
    </div>
  )
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 sm:max-w-[42%]">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="mt-0.5 text-xs text-muted-foreground/60">{description}</div>
        )}
      </div>
      <div className="w-full sm:w-auto sm:max-w-[58%]">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const downloadDir = useSettingsStore((s) => s.downloadDir)
  const chunkSize = useSettingsStore((s) => s.chunkSize)
  const autoAcceptLan = useSettingsStore((s) => s.autoAcceptLan)
  const autoCheckUpdates = useSettingsStore((s) => s.autoCheckUpdates)
  const relayUrl = useSettingsStore((s) => s.relayUrl)
  const theme = useSettingsStore((s) => s.theme)
  const setDownloadDir = useSettingsStore((s) => s.setDownloadDir)
  const setChunkSize = useSettingsStore((s) => s.setChunkSize)
  const setAutoAcceptLan = useSettingsStore((s) => s.setAutoAcceptLan)
  const setAutoCheckUpdates = useSettingsStore((s) => s.setAutoCheckUpdates)
  const setRelayUrl = useSettingsStore((s) => s.setRelayUrl)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const localId = useDeviceStore((s) => s.localId)
  const localName = useDeviceStore((s) => s.localName)
  const devices = useDeviceStore((s) => s.devices)
  const recentDevices = useDeviceStore((s) => s.recentDevices)
  const trustedDeviceIds = useDeviceStore((s) => s.trustedDeviceIds)
  const setLocalInfo = useDeviceStore((s) => s.setLocalInfo)
  const toggleTrustedDevice = useDeviceStore((s) => s.toggleTrustedDevice)
  const clearTrustedDevices = useDeviceStore((s) => s.clearTrustedDevices)
  const currentVersion = useUpdateStore((s) => s.currentVersion)
  const latestVersion = useUpdateStore((s) => s.latestVersion)
  const latestNotes = useUpdateStore((s) => s.latestNotes)
  const latestDate = useUpdateStore((s) => s.latestDate)
  const checkingUpdate = useUpdateStore((s) => s.checking)
  const downloadingUpdate = useUpdateStore((s) => s.downloading)
  const downloadProgress = useUpdateStore((s) => s.downloadProgress)
  const downloadedBytes = useUpdateStore((s) => s.downloadedBytes)
  const totalBytes = useUpdateStore((s) => s.totalBytes)
  const updateError = useUpdateStore((s) => s.error)
  const { toast } = useToast()
  const { setTheme: setNextTheme } = useTheme()

  const [deviceName, setDeviceName] = useState(localName)
  const [testingRelay, setTestingRelay] = useState(false)

  useEffect(() => {
    if (localName) {
      setDeviceName(localName)
    }
  }, [localName])

  const handleNameBlur = useCallback(async () => {
    const name = deviceName.trim()
    if (name.length < 1 || name.length > 32) {
      toast("名称长度应为 1-32 字符", "error")
      return
    }
    try {
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("set_device_name", { name })
        if (relayUrl.startsWith("ws://") || relayUrl.startsWith("wss://")) {
          await invoke("connect_relay", { url: relayUrl })
        }
      } else {
        saveWebDeviceName(name)
      }
      setDeviceName(name)
      setLocalInfo(localId, name)
      toast("已保存", "success")
    } catch {
      toast("保存失败", "error")
    }
  }, [deviceName, localId, relayUrl, setLocalInfo, toast])

  const handlePickDir = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const dir = await invoke<string | null>("pick_directory")
      if (dir) {
        setDownloadDir(dir)
        toast("下载目录已更新", "success")
      }
    } catch { /* web */ }
  }, [setDownloadDir, toast])

  const handleConnectRelay = useCallback(async () => {
    if (!relayUrl.startsWith("ws://") && !relayUrl.startsWith("wss://")) {
      toast("中继地址格式无效", "error")
      return
    }
    setTestingRelay(true)
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("connect_relay", { url: relayUrl })
      toast("已连接到中继服务器", "success")
    } catch (e: any) {
      toast(`连接失败: ${e}`, "error")
    }
    setTestingRelay(false)
  }, [relayUrl, toast])

  const handleThemeChange = useCallback((t: "light" | "dark" | "system") => {
    setTheme(t)
    setNextTheme(t)
  }, [setTheme, setNextTheme])

  const handleCheckUpdates = useCallback(async () => {
    try {
      const result = await checkForUpdates()
      if (!result.supported) {
        toast("当前仅桌面端支持应用内升级", "warning")
        return
      }

      if (!result.available) {
        toast("当前已是最新版本", "success")
        return
      }

      toast(`发现新版本 ${result.latestVersion}`, "info")
    } catch (error) {
      const message = error instanceof Error ? error.message : "检查更新失败"
      toast(message, "error")
    }
  }, [toast])

  const handleInstallUpdate = useCallback(async () => {
    try {
      const result = await downloadAndInstallUpdate()
      if (!result.installed) {
        toast("当前已是最新版本", "success")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "下载安装更新失败"
      toast(message, "error")
    }
  }, [toast])

  const downloadStatus = useMemo(() => {
    if (!downloadingUpdate) return ""
    if (totalBytes && totalBytes > 0) {
      const downloadedMb = (downloadedBytes / 1024 / 1024).toFixed(1)
      const totalMb = (totalBytes / 1024 / 1024).toFixed(1)
      return `${downloadedMb} / ${totalMb} MB`
    }

    if (downloadProgress > 0) {
      return `${downloadProgress.toFixed(0)}%`
    }

    return "准备下载..."
  }, [downloadProgress, downloadedBytes, downloadingUpdate, totalBytes])

  const desktopApp = isTauri()
  const versionLabel = currentVersion || __APP_VERSION__
  const canInstallUpdate = desktopApp && !!latestVersion && !downloadingUpdate
  const knownDevices = useMemo(
    () => buildKnownDevices(Array.from(devices.values()), recentDevices, trustedDeviceIds),
    [devices, recentDevices, trustedDeviceIds]
  )

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col p-6 sm:p-8 animate-page-rise">
      <h1 className="motion-stagger text-xl font-medium tracking-wide [--stagger-delay:30ms]">设置</h1>

      <div className="mt-6 space-y-8">
        <SettingsSection title="通用">
          <SettingsRow label="设备名称" description="其他设备看到的名字">
            <Input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              onBlur={handleNameBlur}
              className="h-9 w-full text-sm sm:w-52"
            />
          </SettingsRow>

          <SettingsRow label="下载目录" description="接收文件的默认保存位置">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <span className="max-w-full truncate text-xs text-muted-foreground/60 sm:max-w-[160px]">
                {downloadDir || "~/Downloads/rust-send"}
              </span>
              <Button variant="outline" size="sm" roundness="sharp" className="self-start text-xs sm:self-auto" onClick={handlePickDir}>
                选择
              </Button>
            </div>
          </SettingsRow>

          <SettingsRow label="分片大小" description="影响传输速度与内存占用">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {[
                { value: 65536, label: "64KB" },
                { value: 262144, label: "256KB" },
                { value: 1048576, label: "1MB" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setChunkSize(opt.value)}
                  className={`rounded-sm px-3 py-1.5 outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/20 ${
                    chunkSize === opt.value
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "text-muted-foreground/60 hover:text-foreground border border-transparent hover:border-border/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="网络">
          <SettingsRow label="中继服务器地址" description="外网传输时通过此服务器中转">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Input
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                placeholder="wss://relay.rust-send.dev:443"
                className="h-9 w-full text-xs font-mono sm:w-64"
              />
              <Button
                variant="outline"
                size="sm"
                roundness="sharp"
                className="self-start text-xs sm:self-auto"
                onClick={handleConnectRelay}
                loading={testingRelay}
              >
                {testingRelay ? "连接中..." : "连接"}
              </Button>
            </div>
          </SettingsRow>

          <SettingsRow label="局域网自动接收" description="开启后局域网设备发来的文件自动保存">
            <Switch checked={autoAcceptLan} onCheckedChange={setAutoAcceptLan} />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="设备信任">
          <SettingsRow label="可信设备" description="对常用设备做标记，后续可作为自动连接和更安全确认的基础">
            <div className="flex w-full flex-col gap-3 sm:min-w-[320px]">
              {knownDevices.length > 0 ? (
                <div className="space-y-2">
                  {knownDevices.map((device) => {
                    const trusted = trustedDeviceIds.includes(device.id)
                    return (
                      <div
                        key={device.id}
                        className="flex items-center justify-between gap-3 rounded-sm border border-border/40 bg-muted/35 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{device.name}</span>
                            {trusted && <Badge variant="success">可信</Badge>}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground/60">
                            {device.deviceType === "web" ? "Web 端" : "桌面端"} · {device.status === "offline" ? "最近出现" : "当前在线"}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          roundness="sharp"
                          className="shrink-0"
                          onClick={() => toggleTrustedDevice(device.id)}
                        >
                          {trusted ? "取消可信" : "设为可信"}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-sm border border-dashed border-border/40 px-3 py-3 text-xs text-muted-foreground/60">
                  暂时还没有可管理的设备，先连接过一次设备后会出现在这里。
                </div>
              )}

              {trustedDeviceIds.length > 0 && (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    roundness="sharp"
                    className="text-xs text-muted-foreground/60 hover:text-foreground"
                    onClick={clearTrustedDevices}
                  >
                    清空可信设备
                  </Button>
                </div>
              )}
            </div>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="更新">
          <SettingsRow label="自动检查更新" description="应用启动后静默检查新版本，不会打断正在传输的任务">
            <Switch checked={autoCheckUpdates} onCheckedChange={setAutoCheckUpdates} />
          </SettingsRow>

          <SettingsRow label="当前版本" description="桌面端支持下载并重启完成升级">
            <div className="flex w-full flex-col gap-3 sm:min-w-[280px]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">v{versionLabel}</Badge>
                {!desktopApp ? (
                  <Badge variant="outline">仅桌面端支持应用内升级</Badge>
                ) : latestVersion ? (
                  <Badge variant="warning">可升级到 v{latestVersion}</Badge>
                ) : (
                  <Badge variant="success">已跟上最新</Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  roundness="sharp"
                  onClick={handleCheckUpdates}
                  loading={checkingUpdate}
                >
                  {checkingUpdate ? "检查中..." : "检查更新"}
                </Button>

                {canInstallUpdate && (
                  <Button
                    size="sm"
                    roundness="sharp"
                    onClick={handleInstallUpdate}
                    loading={downloadingUpdate}
                  >
                    {downloadingUpdate ? "下载中..." : "下载并安装"}
                  </Button>
                )}
              </div>

              {downloadingUpdate && (
                <div className="space-y-2 rounded-sm border border-border/40 bg-muted/35 px-3 py-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground/70">
                    <span>更新下载中</span>
                    <span>{downloadStatus}</span>
                  </div>
                  <Progress value={downloadProgress} active size="sm" />
                </div>
              )}

              {updateError && (
                <div className="rounded-sm border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {updateError}
                </div>
              )}

              {latestVersion && (
                <div className="rounded-sm border border-border/40 bg-muted/35 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground/70">
                    <span>最新版本 v{latestVersion}</span>
                    {latestDate && <span>发布时间 {new Date(latestDate).toLocaleDateString()}</span>}
                  </div>
                  {latestNotes ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-foreground/80">
                      {latestNotes}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground/70">
                      这次版本没有附带更新说明，但已经可以直接下载安装。
                    </p>
                  )}
                </div>
              )}
            </div>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="外观">
          <SettingsRow label="主题">
            <div className="flex flex-wrap items-center gap-1 text-xs">
              {[
                { value: "system" as const, label: "跟随系统" },
                { value: "light" as const, label: "浅色" },
                { value: "dark" as const, label: "深色" },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => handleThemeChange(t.value)}
                  className={`rounded-sm px-3 py-1.5 outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/20 ${
                    theme === t.value
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "text-muted-foreground/60 hover:text-foreground border border-transparent hover:border-border/40"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="关于">
          <div className="px-5 py-4">
            <div className="flex items-center gap-3">
              <AppMark size="md" className="bg-primary/95" />
              <div>
                <div className="text-sm font-medium">rust-send</div>
                <div className="text-xs text-muted-foreground/60">
                  版本 {versionLabel} · Rust 后端 · React 前端 · WebRTC 传输
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-3 text-xs">
              <Button variant="ghost" size="sm" roundness="sharp" className="h-auto py-1 text-muted-foreground/60 hover:text-foreground">
                检查更新
              </Button>
              <Button variant="ghost" size="sm" roundness="sharp" className="h-auto py-1 text-muted-foreground/60 hover:text-foreground">
                反馈问题
              </Button>
            </div>
          </div>
        </SettingsSection>
      </div>
    </div>
  )
}

function buildKnownDevices(
  onlineDevices: DeviceInfo[],
  recentDevices: DeviceInfo[],
  trustedDeviceIds: string[]
) {
  const merged = new Map<string, DeviceInfo>()

  for (const device of recentDevices) {
    merged.set(device.id, device)
  }

  for (const device of onlineDevices) {
    merged.set(device.id, {
      ...merged.get(device.id),
      ...device,
    })
  }

  return Array.from(merged.values()).sort((a, b) => {
    const trustedRank = Number(trustedDeviceIds.includes(b.id)) - Number(trustedDeviceIds.includes(a.id))
    if (trustedRank !== 0) return trustedRank
    return getTimestamp(b.lastSeen) - getTimestamp(a.lastSeen)
  })
}

function getTimestamp(value?: string) {
  if (!value) return 0
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}
