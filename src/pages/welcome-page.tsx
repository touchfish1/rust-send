import { Card } from "@/components/ui/card"
import { AppMark } from "@/components/branding/app-mark"
import { useDeviceStore } from "@/stores/device-store"
import { isTauri } from "@/hooks/use-tauri-event"
import { Globe2, MonitorSmartphone } from "lucide-react"

export function WelcomePage() {
  const localName = useDeviceStore((s) => s.localName)
  const desktopRuntime = isTauri()
  const webEntry = typeof window !== "undefined" ? window.location.origin : ""

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
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8 text-primary">
                <MonitorSmartphone className="h-7 w-7" strokeWidth={1.6} />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Web 端入口</p>
                <p className="text-xs leading-relaxed text-muted-foreground/65">
                  当前版本还没有接入真实可扫码的 Web 配对地址，
                  <br />
                  所以这里不再显示假的二维码，避免误导。
                </p>
              </div>
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
            Web 端扫码即可快速加入，接收文件。
          </p>
        </div>
      </div>
    </div>
  )
}
