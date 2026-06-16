const RELAY_PROTOCOL_RE = /^wss?:\/\//i

export function isRelayUrl(value: string) {
  return RELAY_PROTOCOL_RE.test(value.trim())
}

export function buildPairingUrl(baseUrl: string, relayUrl?: string) {
  const url = new URL(baseUrl)
  // 扫码入口统一落到首页，避免把桌面端当前路由原样带到 Web 端。
  url.pathname = "/"
  // 仅透传真实的 ws/wss 中继地址，避免把无效参数编码进二维码。
  if (relayUrl && isRelayUrl(relayUrl)) {
    url.searchParams.set("relay", relayUrl)
  }
  return url.toString()
}

export function extractRelayUrlFromLocation(href: string) {
  const relay = new URL(href).searchParams.get("relay")?.trim() || ""
  return isRelayUrl(relay) ? relay : null
}

export function isLoopbackHost(hostname: string) {
  // 开发态 localhost 只能在本机访问，不能直接拿来生成给手机扫码的地址。
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}
