import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AppMark } from "@/components/branding/app-mark"
import { useDeviceStore } from "@/stores/device-store"
import { isTauri } from "@/hooks/use-tauri-event"
import { useSettingsStore } from "@/stores/settings-store"
import { buildPairingUrl, isLoopbackHost } from "@/lib/pairing"
import { Check, Copy, Globe2, MonitorSmartphone, QrCode } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"

export function WelcomePage() {
  const localName = useDeviceStore((s) => s.localName)
  const desktopRuntime = isTauri()
  const relayUrl = useSettingsStore((s) => s.relayUrl)
  const [pairingCandidates, setPairingCandidates] = useState<string[]>([])
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("")
  const [copySucceeded, setCopySucceeded] = useState(false)
  const webEntry = typeof window !== "undefined" ? window.location.origin : ""
  const pairingUrl = pairingCandidates[0] || ""
  const additionalCandidates = pairingCandidates.slice(1)

  useEffect(() => {
    let cancelled = false

    async function resolvePairingUrls() {
      if (typeof window === "undefined") return

      const currentUrl = new URL(window.location.href)
      const publicWebUrl = import.meta.env.VITE_PUBLIC_WEB_URL?.trim()
      const urls = new Set<string>()

      // 生产或预发布环境优先使用显式配置的公网入口，扫码体验更稳定。
      if (publicWebUrl) {
        urls.add(buildPairingUrl(publicWebUrl, relayUrl))
      }

      if (!desktopRuntime) {
        // Web 端自己打开时，当前 origin 就是可访问入口。
        urls.add(buildPairingUrl(currentUrl.toString(), relayUrl))
      } else if (!isLoopbackHost(currentUrl.hostname) && /^https?:$/.test(currentUrl.protocol)) {
        // 桌面端如果运行在一个非 localhost 的 devUrl，也可以直接复用它。
        urls.add(buildPairingUrl(currentUrl.toString(), relayUrl))
      } else {
        try {
          const { invoke } = await import("@tauri-apps/api/core")
          // 本地开发时改用局域网 IP，方便手机或其它设备直接扫码访问。
          const ips = await invoke<string[]>("get_local_ip_addresses")
          const port = currentUrl.port || "1420"
          for (const ip of ips) {
            urls.add(buildPairingUrl(`http://${ip}:${port}`, relayUrl))
          }
        } catch (error) {
          console.warn("resolve pairing urls failed", error)
        }
      }

      if (!cancelled) {
        setPairingCandidates(Array.from(urls))
      }
    }

    resolvePairingUrls()

    return () => {
      cancelled = true
    }
  }, [desktopRuntime, relayUrl])

  useEffect(() => {
    let cancelled = false

    async function renderQrCode() {
      if (!pairingUrl) {
        setQrCodeDataUrl("")
        return
      }

      try {
        // 直接输出 data URL，省掉额外组件依赖，桌面端和 Web 端都能复用同一渲染逻辑。
        const dataUrl = await QRCode.toDataURL(pairingUrl, {
          width: 240,
          margin: 1,
          color: {
            dark: "#17352f",
            light: "#0000",
          },
        })
        if (!cancelled) {
          setQrCodeDataUrl(dataUrl)
        }
      } catch (error) {
        console.warn("render qr code failed", error)
        if (!cancelled) {
          setQrCodeDataUrl("")
        }
      }
    }

    renderQrCode()

    return () => {
      cancelled = true
    }
  }, [pairingUrl])

  useEffect(() => {
    if (!copySucceeded) return
    // 复制成功态只短暂展示一下，避免按钮文案一直停留在“已复制”。
    const timer = window.setTimeout(() => setCopySucceeded(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copySucceeded])

  const helperText = useMemo(() => {
    if (!desktopRuntime) {
      return "这个页面本身就是 Web 客户端入口，不需要再扫码打开。"
    }
    if (pairingUrl) {
      return "扫码后会打开 Web 端，并自动带上当前中继地址。"
    }
    return "还没有拿到可对外访问的 Web 地址。开发环境下请确认 Vite 已开放局域网访问，或设置 VITE_PUBLIC_WEB_URL。"
  }, [desktopRuntime, pairingUrl])

  const handleCopy = async () => {
    if (!pairingUrl || typeof navigator === "undefined" || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(pairingUrl)
      setCopySucceeded(true)
    } catch (error) {
      console.warn("copy pairing url failed", error)
    }
  }

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden p-8 animate-page-rise">
      <div className="ambient-ink left-[12%] top-[18%] h-40 w-40 bg-primary/20" />
      <div className="ambient-ink bottom-[14%] right-[10%] h-52 w-52 bg-border/45 [animation-delay:-4s]" />

      {/* 空状态主体 */}
      <div className="relative z-10 flex max-w-md flex-col items-center text-center">
        <AppMark size="lg" className="mb-8 animate-ink-stamp" />

        {/* 标题 */}
        <h1 className="motion-stagger text-2xl font-medium tracking-[0.24em] text-foreground [--stagger-delay:80ms]">
          rust-send
        </h1>
        <p className="motion-stagger mt-2 text-sm tracking-wide text-muted-foreground/80 [--stagger-delay:140ms]">
          跨平台文件传输 · 点对点直连
        </p>

        {/* 分割 */}
        <div className="ink-divider motion-stagger my-8 w-32 [--stagger-delay:200ms]" />

        {/* 引导 */}
        <p className="motion-stagger text-sm leading-relaxed text-muted-foreground/60 [--stagger-delay:260ms]">
          从左侧选择一台在线设备，或扫描二维码从 Web 端加入
        </p>

        {/* 状态提示 */}
        <div className="motion-stagger mt-8 flex gap-4 text-xs text-muted-foreground/50 [--stagger-delay:320ms]">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500/60 animate-status-pulse" />
            局域网
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500/60 animate-status-pulse [animation-delay:0.6s]" />
            中继连接
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
            离线
          </div>
        </div>

        <Card className="motion-stagger mt-10 w-full max-w-sm p-5 [--stagger-delay:380ms]">
          {desktopRuntime ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex items-center gap-2 self-start rounded-full border border-border/50 bg-muted/30 px-3 py-1 text-[11px] tracking-wide text-muted-foreground/70">
                <QrCode className="h-3.5 w-3.5" strokeWidth={1.7} />
                Web 端入口
              </div>
              <div className="rounded-[28px] border border-border/50 bg-white/95 p-4 shadow-[0_18px_50px_-32px_rgba(23,53,47,0.45)]">
                {qrCodeDataUrl ? (
                  <img src={qrCodeDataUrl} alt="rust-send Web 端入口二维码" className="h-56 w-56 rounded-2xl" />
                ) : (
                  <div className="flex h-56 w-56 items-center justify-center rounded-2xl bg-muted/45 text-muted-foreground/55">
                    <MonitorSmartphone className="h-10 w-10" strokeWidth={1.6} />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {pairingUrl ? "扫码打开 Web 端" : "等待可用的 Web 地址"}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground/65">{helperText}</p>
              </div>
              {pairingUrl && (
                <>
                  <div className="w-full rounded-md border border-border/40 bg-muted/25 px-3 py-2 text-left text-[11px] leading-relaxed text-muted-foreground/70">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/45">
                      Scan URL
                    </div>
                    <div className="break-all font-mono">{pairingUrl}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    roundness="sharp"
                    className="text-xs"
                    onClick={handleCopy}
                  >
                    {copySucceeded ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                    {copySucceeded ? "已复制" : "复制链接"}
                  </Button>
                </>
              )}
              {additionalCandidates.length > 0 && (
                <div className="w-full rounded-md border border-dashed border-border/40 bg-background/35 px-3 py-2 text-left">
                  {/* 多网卡场景下保留其它候选地址，主二维码只展示优先级最高的一个。 */}
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/45">
                    Other LAN URLs
                  </p>
                  <div className="mt-2 space-y-1 text-[11px] text-muted-foreground/65">
                    {additionalCandidates.map((candidate) => (
                      <div key={candidate} className="break-all font-mono">
                        {candidate}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8 text-primary animate-float-slow">
                <Globe2 className="h-7 w-7" strokeWidth={1.6} />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">当前已在 Web 端</p>
                <p className="text-xs leading-relaxed text-muted-foreground/65">
                  这个页面本身就是 Web 客户端入口，不需要再扫码打开。
                </p>
              </div>
              <div className="rounded-md border border-border/40 bg-muted/25 px-3 py-2 text-xs text-muted-foreground/70">
                {webEntry || localName || "rust-send web"}
              </div>
            </div>
          )}
        </Card>

        {/* 提示 */}
        <div className="motion-stagger mt-12 space-y-2 text-xs text-muted-foreground/40 [--stagger-delay:460ms]">
          <p>💡 小提示</p>
          <p className="leading-relaxed">
            确保设备在同一局域网，或连接到同一个中继服务器。
            <br />
            {desktopRuntime ? "手机扫码后会直接进入 Web 客户端。" : "当前页面已经是 Web 客户端入口。"}
          </p>
        </div>
      </div>
    </div>
  )
}
