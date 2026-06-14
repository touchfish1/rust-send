# 架构设计

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 后端/中继服务器 | Rust (axum + tokio) | 高性能、安全、与 Tauri 共享 core 代码 |
| 桌面端 | Tauri v2 | Rust 内核，包体约 5MB，原生跨平台体验 |
| 共享前端 | React + TypeScript | Tauri WebView 与 Web 端共用一套代码 |
| P2P 传输 | WebRTC | 局域网直连，失败走中继 |
| 信令/中继 | WebSocket (axum + tokio-tungstenite) | 轻量双向实时通信 |
| 设备发现 | mDNS (libp2p-mdns / mdns-sd) | 局域网零配置发现 |

## 架构图

```
┌─────────────────────────────────────────────────┐
│                  桌面端 (Tauri)                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ React UI  │  │ Rust Core │  │ File Chunking │  │
│  │ (WebView) │◄─┤(Commands) │──┤ + Checksum    │  │
│  └──────────┘  └─────┬────┘  └───────────────┘  │
│                      │ WebRTC                    │
└──────────────────────┼──────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │  LAN P2P   │  WAN P2P   │ 中继模式
          ▼            ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────────┐
    │ Browser  │ │ Tauri    │ │ Relay Server │
    │ (WebRTC) │ │ (WebRTC) │ │ (Rust/Axum)  │
    └──────────┘ └──────────┘ └──────────────┘
```

## 项目结构

```
rust-send/
├── src/                    # React 前端（与 Web 端共享）
│   ├── components/
│   │   ├── Layout/
│   │   ├── DeviceList/
│   │   ├── Chat/
│   │   ├── Transfer/
│   │   └── common/
│   ├── pages/
│   ├── hooks/
│   ├── stores/             # Zustand 状态管理
│   ├── lib/                # WebRTC 客户端等工具
│   └── types/              # TypeScript 类型
│
├── src-tauri/              # Tauri Rust 层
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands/       # Tauri IPC 命令
│   │   ├── core/           # 与 relay-server 共享的核心逻辑
│   │   ├── transfer/       # 文件传输引擎
│   │   ├── discovery/      # mDNS 局域网发现
│   │   ├── relay/          # WebSocket 中继客户端
│   │   └── platform/       # 平台特定实现
│   └── Cargo.toml
│
├── relay-server/           # 独立中继服务器
│   ├── src/
│   │   ├── main.rs
│   │   ├── ws.rs           # WebSocket 连接管理
│   │   ├── room.rs         # 设备房间映射
│   │   └── relay.rs        # 数据中继转发
│   └── Cargo.toml
│
├── web/                    # Web 端入口（共享 src/ 代码）
│   └── index.html
│
└── docs/                   # 设计文档
```

## 传输策略优先级

1. **LAN P2P** — mDNS 发现设备，WebRTC 直连，零延迟
2. **WAN P2P** — STUN 打洞 + WebRTC（可能受 NAT 限制失败）
3. **Relay** — 通过中继服务器转发流量（兜底，延迟最高）
