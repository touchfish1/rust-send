import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useSettingsStore } from "@/stores/settings-store"
import { useDeviceStore } from "@/stores/device-store"
import { useToast } from "@/components/ui/toast"
import { useCallback, useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { isTauri } from "@/hooks/use-tauri-event"
import { saveWebDeviceName } from "@/hooks/use-local-device-info"

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs font-medium text-muted-foreground/60 tracking-wide">
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
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4 gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="mt-0.5 text-xs text-muted-foreground/60">{description}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const downloadDir = useSettingsStore((s) => s.downloadDir)
  const chunkSize = useSettingsStore((s) => s.chunkSize)
  const autoAcceptLan = useSettingsStore((s) => s.autoAcceptLan)
  const relayUrl = useSettingsStore((s) => s.relayUrl)
  const theme = useSettingsStore((s) => s.theme)
  const setDownloadDir = useSettingsStore((s) => s.setDownloadDir)
  const setChunkSize = useSettingsStore((s) => s.setChunkSize)
  const setAutoAcceptLan = useSettingsStore((s) => s.setAutoAcceptLan)
  const setRelayUrl = useSettingsStore((s) => s.setRelayUrl)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const localId = useDeviceStore((s) => s.localId)
  const localName = useDeviceStore((s) => s.localName)
  const setLocalInfo = useDeviceStore((s) => s.setLocalInfo)
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

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col p-8 animate-ink-fade">
      <h1 className="text-xl font-medium tracking-wide">设置</h1>

      <div className="mt-6 space-y-8">
        <SettingsSection title="通用">
          <SettingsRow label="设备名称" description="其他设备看到的名字">
            <Input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              onBlur={handleNameBlur}
              className="h-8 w-44 text-sm"
            />
          </SettingsRow>

          <SettingsRow label="下载目录" description="接收文件的默认保存位置">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground/60 truncate max-w-[120px]">
                {downloadDir || "~/Downloads/rust-send"}
              </span>
              <Button variant="outline" size="sm" roundness="sharp" className="text-xs" onClick={handlePickDir}>
                选择
              </Button>
            </div>
          </SettingsRow>

          <SettingsRow label="分片大小" description="影响传输速度与内存占用">
            <div className="flex items-center gap-2 text-xs">
              {[
                { value: 65536, label: "64KB" },
                { value: 262144, label: "256KB" },
                { value: 1048576, label: "1MB" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setChunkSize(opt.value)}
                  className={`rounded-sm px-3 py-1.5 transition-all ${
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
            <div className="flex items-center gap-2">
              <Input
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                placeholder="wss://relay.rust-send.dev:443"
                className="h-8 w-56 text-xs font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                roundness="sharp"
                className="text-xs"
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

        <SettingsSection title="外观">
          <SettingsRow label="主题">
            <div className="flex items-center gap-1 text-xs">
              {[
                { value: "system" as const, label: "跟随系统" },
                { value: "light" as const, label: "浅色" },
                { value: "dark" as const, label: "深色" },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => handleThemeChange(t.value)}
                  className={`rounded-sm px-3 py-1.5 transition-all ${
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
              <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary/10 text-sm text-primary font-serif">
                送
              </span>
              <div>
                <div className="text-sm font-medium">rust-send</div>
                <div className="text-xs text-muted-foreground/60">
                  版本 0.1.0 · Rust 后端 · React 前端 · WebRTC 传输
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
