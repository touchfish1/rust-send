import { Card } from "@/components/ui/card"

export function WelcomePage() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 animate-ink-fade">
      {/* 空状态主体 */}
      <div className="flex max-w-md flex-col items-center text-center">
        {/* 印章 Logo */}
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-sm bg-primary shadow-ink-md">
          <span className="text-4xl text-primary-foreground font-serif leading-none tracking-wide">
            送
          </span>
        </div>

        {/* 标题 */}
        <h1 className="text-2xl font-medium tracking-wider text-foreground">
          rust-send
        </h1>
        <p className="mt-2 text-sm text-muted-foreground/80 tracking-wide">
          跨平台文件传输 · 点对点直连
        </p>

        {/* 分割 */}
        <div className="ink-divider my-8 w-32" />

        {/* 引导 */}
        <p className="text-sm text-muted-foreground/60 leading-relaxed">
          从左侧选择一台在线设备，或扫描二维码从 Web 端加入
        </p>

        {/* 状态提示 */}
        <div className="mt-8 flex gap-4 text-xs text-muted-foreground/50">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500/60" />
            局域网
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500/60" />
            中继连接
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
            离线
          </div>
        </div>

        {/* QR 码（示意） */}
        <Card className="mt-10 p-5">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-32 w-32 items-center justify-center rounded-sm border border-border/40 bg-muted/30">
              <div className="grid grid-cols-7 gap-[2px] opacity-40">
                {Array.from({ length: 49 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2.5 w-2.5 rounded-[1px] ${
                      [0, 1, 2, 5, 6, 7, 8, 13, 14, 21, 27, 28, 35, 41, 42, 43, 46, 47, 48].includes(i)
                        ? "bg-foreground"
                        : "bg-transparent"
                    }`}
                  />
                ))}
              </div>
            </div>
            <span className="text-xs text-muted-foreground/60">
              扫码打开 Web 端
            </span>
          </div>
        </Card>

        {/* 提示 */}
        <div className="mt-12 space-y-2 text-xs text-muted-foreground/40">
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
