# 任务规划

> 基于当前设计文档（架构/协议/API/组件/后端/美学）的完整实施计划。
>
> 当前说明：本文件保留为项目早期阶段的历史实施计划。当前有效的产品方向、里程碑、决策记录与后续优先级，统一维护在 `docs/roadmap.md`。

---

## 0. 总览

```
Phase 1: 项目骨架         ─ 3 天
Phase 2: 核心协议 + 发现   ─ 4 天
Phase 3: 文件传输引擎       ─ 6 天
Phase 4: 中继服务器         ─ 4 天
Phase 5: 前端核心 UI       ─ 5 天
Phase 6: 前端状态 + 集成   ─ 5 天
Phase 7: 打磨 + 边界情况   ─ 4 天
                               ─────
总计: 31 天（单人全职）
```

### 依赖图

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 7
   │                      │            ↑
   │                      ↓            │
   └─────────→ Phase 5 ─→ Phase 6 ─────┘
                  ↑
   Phase 4 ───────┘
```

---

## 1. Phase 1: 项目骨架搭建 (3天)

### 1.1 初始化工作区

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 1.1.1 | 创建 Rust 工作区 Cargo.toml（workspace = ["src-tauri", "relay-server"]） | 0.5d | `Cargo.toml` | — |
| 1.1.2 | 用 `create-tauri-app` 初始化 Tauri v2 + React + TypeScript + Vite | 0.5d | `src-tauri/`, `src/`, `package.json` | 1.1.1 |
| 1.1.3 | relay-server 独立 cargo init | 0.25d | `relay-server/Cargo.toml` | 1.1.1 |
| 1.1.4 | 配置 ESLint + Prettier + tsconfig | 0.25d | 代码规范配置 | 1.1.2 |
| 1.1.5 | 配置 git hooks（commitlint / husky 可选） | 0.25d | `.husky/` | — |
| 1.1.6 | 验证：`cargo build` + `npm run dev` 均通过 | 0.25d | 可运行的空应用 | 1.1.2-1.1.3 |

### 1.2 Tailwind + shadcn/ui + 水墨主题

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 1.2.1 | 安装 Tailwind CSS + postcss + autoprefixer + tailwind-merge + clsx | 0.25d | `tailwind.config.js` | 1.1.2 |
| 1.2.2 | 编写 `globals.css`：HSL 变量（浅色/深色）、宣纸纹理背景、水墨动画 keyframes | 0.5d | `src/app/globals.css` | 1.2.1 |
| 1.2.3 | 初始化 shadcn/ui components.json（指向 ink-wash 色彩） | 0.25d | `components.json` | 1.2.2 |
| 1.2.4 | 生成 shadcn 基础组件：Button, Card, Progress, Dialog, Switch, Input | 0.5d | `src/components/ui/*.tsx` | 1.2.3 |
| 1.2.5 | 自定义 Button 变体（ink-ghost）、Progress 变体（success/warning/error） | 0.25d | 同上，overrides | 1.2.4 |
| 1.2.6 | 验证：shadcn 组件渲染且样式正确 | 0.25d | 视觉验证 | 1.2.5 |

### 1.3 共享类型定义

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 1.3.1 | Rust core 模块：`core/protocol.rs`（SignalingMessage, PeerMessage, ErrorCode 枚举） | 0.5d | `src-tauri/src/core/protocol.rs` | 1.1.2 |
| 1.3.2 | Rust core：`core/device.rs`（DeviceId, DeviceInfo, DeviceType） | 0.25d | `src-tauri/src/core/device.rs` | 1.3.1 |
| 1.3.3 | Rust core：`core/file.rs`（FileMeta, Chunk, ProgressEvent, TransferState） | 0.5d | `src-tauri/src/core/file.rs` | 1.3.1 |
| 1.3.4 | TypeScript 类型：`types/index.ts`（DeviceInfo, FileMeta, TransferState 等） | 0.5d | `src/types/index.ts` | 1.3.1-1.3.3 |
| 1.3.5 | Rust `error.rs`：AppError 枚举（含 ErrorCode） | 0.25d | `src-tauri/src/error.rs` | 1.3.1 |

### Phase 1 交付物 Checklist

- [ ] `npm run dev` 启动成功，展示空白墨色页面
- [ ] `cargo build`（src-tauri）编译通过
- [ ] `cargo build`（relay-server）编译通过
- [ ] `globals.css` 浅色/深色正确切换
- [ ] Button / Card / Progress 渲染且风格统一
- [ ] Rust 核心类型可序列化

---

## 2. Phase 2: 核心协议 + 设备发现 (4天)

### 2.1 WebRTC 信令客户端

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 2.1.1 | `relay/client.rs`：WebSocket 连接、register 消息、写循环 + 15s 心跳 | 1d | `src-tauri/src/relay/client.rs` | 1.3.1 |
| 2.1.2 | RelayEvent 枚举 + 读循环处理所有信令消息 | 0.5d | 同上 | 2.1.1 |
| 2.1.3 | send_signal / send_relay_data / send_transfer_request 方法 | 0.5d | 同上 | 2.1.2 |
| 2.1.4 | close + 自动重连逻辑 | 0.5d | 同上 | 2.1.3 |
| 2.1.5 | 单元测试：Mock WebSocket Server 验证消息收发 | 0.5d | `relay/client_test.rs` | 2.1.4 |

### 2.2 mDNS 局域网发现

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 2.2.1 | `discovery/mdns.rs`：ServiceInfo 注册 \_rust-send._tcp + TXT record | 0.5d | `src-tauri/src/discovery/mdns.rs` | 1.3.2 |
| 2.2.2 | 浏览服务 + 提取 DeviceInfo + Found/Lost 事件 | 0.5d | 同上 | 2.2.1 |
| 2.2.3 | update_name 方法 | 0.25d | 同上 | 2.2.2 |
| 2.2.4 | 集成到 Tauri setup：启动 mDNS → 转发事件 → app.emit | 0.5d | `src-tauri/src/lib.rs` | 2.2.2 |

### 2.3 PeerHandle 抽象层

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 2.3.1 | PeerHandle 枚举（Lan/Relay/Both）+ send(data) 方法（优先 LAN fallback Relay） | 0.5d | `src-tauri/src/core/peer.rs` | 2.1.3, 2.2.2 |
| 2.3.2 | 信令交换逻辑：receive offer → create answer → set ICE candidate | 1d | `src-tauri/src/core/signaling.rs` | 2.3.1 |

### 2.4 AppState + setup

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 2.4.1 | AppState 结构体（engine/discovery/relay/config/history） | 0.25d | `src-tauri/src/lib.rs` | 2.3.1 |
| 2.4.2 | config 加载/保存（`storage/config.rs`） | 0.5d | `src-tauri/src/storage/config.rs` | 1.1.2 |
| 2.4.3 | history 加载/保存（`storage/history.rs`） | 0.25d | `src-tauri/src/storage/history.rs` | 1.3.3 |
| 2.4.4 | platform/paths.rs（get_config_dir, get_downloads_dir） | 0.25d | `src-tauri/src/platform/paths.rs` | — |
| 2.4.5 | setup 函数：注册命令 + 启动 mDNS + 连接中继 + 事件循环 | 1d | `src-tauri/src/lib.rs` | 2.4.1-2.4.4 |

### Phase 2 交付物 Checklist

- [ ] 可连接中继服务器并接收 device_list
- [ ] mDNS 可发现局域网其他 rust-send 设备
- [ ] PeerHandle 可发送/接收消息
- [ ] AppState 在 Tauri 启动时正确初始化
- [ ] config.json 可读写

---

## 3. Phase 3: 文件传输引擎 (6天)

### 3.1 TransferEngine

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 3.1.1 | TransferEngine 结构体（active/queue/progress_tx/cancel_tx） | 0.5d | `src-tauri/src/transfer/engine.rs` | 2.3.1 |
| 3.1.2 | start_send / start_receive（含并发限制 + 排队逻辑） | 1d | 同上 | 3.1.1 |
| 3.1.3 | cancel / pause / resume 方法 | 0.5d | 同上 | 3.1.2 |
| 3.1.4 | on_file_complete（文件级完成 → transfer 级完成 → 调度下一个） | 0.5d | 同上 | 3.1.2 |
| 3.1.5 | dequeue_and_start 自动出队 | 0.25d | 同上 | 3.1.4 |
| 3.1.6 | active_transfers 快照 + 状态聚合逻辑 | 0.5d | 同上 | 3.1.3 |

### 3.2 FileSender

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 3.2.1 | FileSender 结构体（file_id/reader/peer/hasher/cancel_rx/pause_flag） | 0.5d | `src-tauri/src/transfer/sender.rs` | 3.1.1 |
| 3.2.2 | run 主循环：send_header → tokio::select!(cancel_rx / 发送循环) | 1.5d | 同上 | 3.2.1 |
| 3.2.3 | read_chunk + send_with_retry + wait_ack | 1d | 同上 | 3.2.2 |
| 3.2.4 | pause/resume 处理 + wait_resume | 0.5d | 同上 | 3.2.2 |
| 3.2.5 | speed 计算 + 进度上报 | 0.25d | 同上 | 3.2.2 |
| 3.2.6 | 单元测试：Mock DataChannel 验证分片发送 + 重试 + 取消 | 0.5d | `sender_test.rs` | 3.2.4 |

### 3.3 FileReceiver

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 3.3.1 | FileReceiver 结构体（writer/bitset/hasher） | 0.5d | `src-tauri/src/transfer/receiver.rs` | 3.1.1 |
| 3.3.2 | run 主循环：recv_message → 匹配 PeerMessage → 写入 + ACK | 1.5d | 同上 | 3.3.1 |
| 3.3.3 | write_chunk（write_all_at + hasher.update + 进度上报） | 0.5d | 同上 | 3.3.2 |
| 3.3.4 | 断点续传：recv chunk_request → 生成 missing_chunks 列表 | 0.5d | 同上 | 3.3.2 |
| 3.3.5 | checksum 校验 + complete/error 处理 | 0.5d | 同上 | 3.3.2 |
| 3.3.6 | 单元测试：Mock DataChannel 验证接收 + 写入 + 校验 | 0.5d | `receiver_test.rs` | 3.3.5 |

### 3.4 分片序列化

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 3.4.1 | `transfer/chunk.rs`：serialize_chunk + try_deserialize_chunk | 0.25d | `src-tauri/src/transfer/chunk.rs` | 1.3.3 |
| 3.4.2 | 单元测试：序列化/反序列化往返验证 + 边界（空数据/大分片） | 0.25d | 同上 | 3.4.1 |

### 3.5 事件循环

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 3.5.1 | ProgressEvent 枚举 + event_loop 函数（匹配 → app.emit） | 1d | `src-tauri/src/lib.rs` | 3.1.1, 3.3.5 |

### Phase 3 交付物 Checklist

- [ ] 单个文件发送/接收端到端可用
- [ ] 分片 ACK/重试机制工作
- [ ] 暂停后恢复从断点续传
- [ ] 取消后 cleanup
- [ ] SHA256 校验正确
- [ ] 进度事件实时推送到前端
- [ ] 多文件传输完成后 batch_complete

---

## 4. Phase 4: 中继服务器 (4天)

### 4.1 基础服务器

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 4.1.1 | axum 路由 `GET /ws` + WebSocket upgrade | 0.5d | `relay-server/src/main.rs` | 1.1.3 |
| 4.1.2 | WsSession 结构体 + handle_socket 函数（register → room → 读写循环） | 1d | `relay-server/src/ws.rs` | 4.1.1 |
| 4.1.3 | heartbeat：ping/pong + 60s 超时断开 | 0.5d | 同上 | 4.1.2 |

### 4.2 Room 管理

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 4.2.1 | Room 结构体（HashMap<device_id, WsSession>）+ add/remove/get/route | 0.5d | `relay-server/src/room.rs` | 4.1.2 |
| 4.2.2 | all_devices + broadcast_device_list | 0.25d | 同上 | 4.2.1 |
| 4.2.3 | device_id 冲突处理：旧会话 kick + 新会话接管 | 0.25d | 同上 | 4.2.1 |

### 4.3 消息路由

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 4.3.1 | handle_message 统一路由（signal/relay_data/transfer_*/cancel/pause 等） | 1d | `relay-server/src/relay.rs` | 4.2.1 |
| 4.3.2 | relay_data 中继转发（含 sequence_id 合并逻辑） | 0.5d | 同上 | 4.3.1 |
| 4.3.3 | 错误回送 + device_offline 处理 | 0.25d | 同上 | 4.3.1 |

### 4.4 部署配置

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 4.4.1 | CORS 配置（允许跨域） | 0.25d | `relay-server/src/main.rs` | 4.1.1 |
| 4.4.2 | tracing 日志 + 可观测性 | 0.25d | 同上 | 4.1.1 |
| 4.4.3 | Dockerfile + docker-compose.yml | 0.5d | `relay-server/Dockerfile` | 4.4.2 |
| 4.4.4 | 验证：手动 ws 连接测试消息路由 | 0.5d | 手动测试 | 4.3.3 |

### Phase 4 交付物 Checklist

- [ ] 多个 WebSocket 客户端可同时连接
- [ ] 注册 → 加入 Room → 收到 device_list
- [ ] 信令消息准确路由到目标
- [ ] relay_data 转发正确
- [ ] 客户端断开 → 广播更新
- [ ] ping/pong 保活 + 超时断开
- [ ] Docker 可部署

---

## 5. Phase 5: 前端核心 UI (5天)

### 5.1 布局系统

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 5.1.1 | TitleBar 组件（Tauri 拖拽区域 + 窗口控制） | 0.5d | `src/components/layout/title-bar.tsx` | 1.2.4 |
| 5.1.2 | Sidebar 组件（设备列表 + 本机信息 + 底部导航） | 1d | `src/components/layout/sidebar.tsx` | 1.2.4 |
| 5.1.3 | App.tsx 布局框架（TitleBar + Sidebar + MainContent） | 0.5d | `src/App.tsx` | 5.1.1, 5.1.2 |
| 5.1.4 | React Router 配置 + 页面过渡动画 | 0.5d | `src/main.tsx` | 5.1.3 |
| 5.1.5 | 新增 cn() 工具函数 + lib/utils.ts | 0.25d | `src/lib/utils.ts` | — |

### 5.2 页面实现

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 5.2.1 | WelcomePage：印章 Logo + QR 码卡片 + 引导文字 + 空状态 | 1d | `src/pages/welcome-page.tsx` | 5.1.3 |
| 5.2.2 | ChatPage：设备头部 + 传输历史列表 + 活跃传输卡片 + 底部拖拽区 | 1.5d | `src/pages/chat-page.tsx` | 5.1.3 |
| 5.2.3 | TransferPage：活跃/已完成分组 + TransferCard 全状态映射 | 1.5d | `src/pages/transfer-page.tsx` | 5.1.3 |
| 5.2.4 | SettingsPage：分组卡片 + 设备名/下载目录/分片大小/中继地址/主题 | 1d | `src/pages/settings-page.tsx` | 5.1.3 |

### 5.3 公共组件

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 5.3.1 | ReceiveConfirmDialog（文件列表 + 冲突策略选择 + 自动接收开关） | 1d | `src/components/dialogs/receive-confirm.tsx` | 1.2.4 |
| 5.3.2 | ConfirmDialog（通用确认 + 取消删除选项） | 0.5d | `src/components/dialogs/confirm.tsx` | 1.2.4 |
| 5.3.3 | Toast 通知组件（完成/失败/连接状态） | 0.5d | `src/components/ui/toast.tsx` | 1.2.4 |
| 5.3.4 | FileTypeIcon（文件类型 → 线稿风格图标映射） | 0.5d | `src/components/common/file-icon.tsx` | — |
| 5.3.5 | ConnectionBadge（LAN/中继/离线状态指示器） | 0.25d | `src/components/layout/connection-badge.tsx` | — |

### Phase 5 交付物 Checklist

- [ ] 三栏布局（TitleBar + Sidebar + MainContent）
- [ ] React Router 四个页面路由正确
- [ ] 所有页面加载不报错
- [ ] 浅色/深色切换基本可用
- [ ] Dialog 弹出/关闭正常

---

## 6. Phase 6: 前端状态 + 集成 (5天)

### 6.1 Zustand Store

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 6.1.1 | DeviceStore（devices, localInfo, status + actions） | 0.5d | `src/stores/device-store.ts` | 1.3.4 |
| 6.1.2 | TransferStore（active, history, incoming + actions） | 0.5d | `src/stores/transfer-store.ts` | 1.3.4 |
| 6.1.3 | SettingsStore（downloadDir, chunkSize, autoAccept, relayUrl, theme） | 0.5d | `src/stores/settings-store.ts` | 1.3.4 |
| 6.1.4 | Store persist 集成（Zustand persist middleware → localStorage） | 0.25d | 同上 | 6.1.3 |

### 6.2 Tauri 桥接

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 6.2.1 | `useTauriEvent` hook（泛型事件监听 + 清理） | 0.5d | `src/hooks/use-tauri-event.ts` | 6.1.1-6.1.3 |
| 6.2.2 | `useInvoke` 封装（类型安全 invoke 调用） | 0.5d | `src/hooks/use-invoke.ts` | — |
| 6.2.3 | 事件 → Store 绑定：device:discovered/lost → DeviceStore | 0.5d | `src/hooks/use-device-events.ts` | 6.2.1, 6.1.1 |
| 6.2.4 | 事件 → Store 绑定：transfer:* → TransferStore | 1d | `src/hooks/use-transfer-events.ts` | 6.2.1, 6.1.2 |
| 6.2.5 | 事件 → Store 绑定：connection:state → ConnectionBadge | 0.25d | 同上 | 6.2.1 |
| 6.2.6 | 初始化 App 层事件监听器 | 0.5d | `src/App.tsx` | 6.2.3-6.2.5 |

### 6.3 Tauri 命令注册

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 6.3.1 | commands/device.rs（get/set_name, get_info） | 0.5d | `src-tauri/src/commands/device.rs` | 2.4.1 |
| 6.3.2 | commands/file.rs（pick_file/s, get_meta, save_dir） | 0.5d | `src-tauri/src/commands/file.rs` | 2.4.1 |
| 6.3.3 | commands/transfer.rs（send_files, accept/reject/cancel/pause/resume, get_*） | 1d | `src-tauri/src/commands/transfer.rs` | 3.1.3 |
| 6.3.4 | main.rs 注册所有命令 | 0.25d | `src-tauri/src/main.rs` | 6.3.1-6.3.3 |

### 6.4 文件拖拽 + 发送流程

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 6.4.1 | react-dropzone 集成（文件拖拽/点击选择 + 预览列表） | 0.5d | `src/pages/chat-page.tsx` | 6.3.2, 6.3.3 |
| 6.4.2 | 发送按钮逻辑（validate → invoke send_files → 清空预览） | 0.5d | 同上 | 6.4.1 |
| 6.4.3 | 接收弹窗绑定（incoming → Dialog → accept/reject → 反馈） | 0.5d | `src/App.tsx` | 6.2.4, 5.3.1 |

### Phase 6 交付物 Checklist

- [ ] Sidebar 设备列表从 DeviceStore 渲染
- [ ] 发送文件端到端 UI→Rust→Network 可用
- [ ] 接收文件弹窗 → accept → 下载
- [ ] 进度条实时更新
- [ ] Settings 修改 → 持久化
- [ ] 浅色/深色切换 Store 联动

---

## 7. Phase 7: 打磨 + 边界情况 (4天)

### 7.1 错误与异常处理

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 7.1.1 | 前端全局错误边界（ErrorBoundary 组件） | 0.5d | `src/components/common/error-boundary.tsx` | — |
| 7.1.2 | Toast 错误通知（连接断开/传输失败/校验错误） | 0.5d | `src/components/ui/toast.tsx` | 6.2.4 |
| 7.1.3 | Rust 侧错误处理遍历：DiskFull/Timeout/DeviceOffline 等触发合适的行为 | 1d | 各模块 | Phase 3 |
| 7.1.4 | 重连逻辑：WebSocket 断开 → 自动重连 → 发送 transfer_info_query | 0.5d | `src-tauri/src/relay/client.rs` | 2.1.4 |

### 7.2 深色模式精调

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 7.2.1 | next-themes 集成 + localStorage 持久化 | 0.25d | `src/App.tsx` | 6.1.4 |
| 7.2.2 | 深色模式 UI 审核：对比度/色彩/可读性（每页检查） | 0.5d | 各页面 CSS | 5.2.1-5.2.4 |
| 7.2.3 | 过渡动画兼容（ThemeProvider → 无需闪烁） | 0.25d | 同上 | 7.2.1 |

### 7.3 边界场景

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 7.3.1 | 超大文件传输（>4GB）测试 + memory map 或 streaming 验证 | 0.5d | 测试 | Phase 3 |
| 7.3.2 | 中继数据 64KB 分片 + sequence_id 合并 | 0.5d | `relay/client.rs` + `relay-server/src/relay.rs` | 4.3.2 |
| 7.3.3 | 目录传输：递归列举 → 分批 transfer_request → 还原结构 | 1d | `commands/file.rs` + `receiver.rs` | 6.3.2, 3.3.5 |
| 7.3.4 | 传输队列满时排队提示 + 自动出队 | 0.25d | `TransferPage` | 3.1.5 |

### 7.4 平台适配

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 7.4.1 | macOS 适配：traffic lights 区域避开 + NSDocument 关联 | 0.5d | `src-tauri/src/platform/macos.rs` | — |
| 7.4.2 | Windows 适配：msi 打包 + 文件关联 | 0.5d | `src-tauri/tauri.conf.json` | — |
| 7.4.3 | Linux 适配：AppImage + 文件关联 | 0.5d | 同上 | — |

### 7.5 最终验证

| ID | 任务 | 耗时 | 产出 | 依赖 |
|----|------|------|------|------|
| 7.5.1 | 端到端测试：两台设备 LAN 发送/接收 | 0.5d | 手动测试 | 7.3.4 |
| 7.5.2 | 端到端测试：两台设备 Relay 发送/接收 | 0.5d | 手动测试 | 7.3.4 |
| 7.5.3 | 端到端测试：暂停 → 恢复 → 续传 | 0.25d | 手动测试 | 7.3.4 |
| 7.5.4 | 端到端测试：取消 → 部分文件清理 | 0.25d | 手动测试 | 7.3.4 |
| 7.5.5 | CI 配置：GitHub Actions (cargo build + test + clippy) | 0.5d | `.github/workflows/` | — |

### Phase 7 交付物 Checklist

- [ ] 所有错误路径正确处理 + 前端友好提示
- [ ] 深色模式每页视觉无误
- [ ] 中继 64KB 分片 + 合并正确
- [ ] 目录传输端到端可用
- [ ] macOS/Linux/Windows 三平台可构建
- [ ] CI 通过

---

## 8. 优先级与可选降级

### MVP 必须（Phase 1-4 + 5 + 6）

```
· 单文件 LAN 传输 + 中继传输
· 基础 UI（Sidebar + ChatPage + TransferPage）
· 发送/接收/进度/完成/失败
```

### v1.0 追加（Phase 7 大部分）

```
· 断点续传
· 暂停/恢复
· 目录传输
· 深色模式完善
· CI
```

### 可选延期

```
· 拉取模式（pull_request）
· Web 端（扫码加入）
· 平台打包（macOS .dmg / Win .msi / Linux .AppImage）
```

---

## 9. 关键依赖版本

| 依赖 | 版本 | 用途 |
|------|------|------|
| Tauri | 2.x | 桌面应用框架 |
| React | 18.x | 前端框架 |
| Tailwind CSS | 3.4+ | 样式 |
| shadcn/ui | latest | UI 组件 |
| Zustand | 4.x | 状态管理 |
| Vite | 5.x | 构建工具 |
| Rust | 1.77+ | 后端语言 |
| axum | 0.7 | HTTP/WS 框架 |
| tokio | 1.x | 异步运行时 |
| webrtc-rs | 0.11（可暂缓） | P2P 直连 |
| tokio-tungstenite | 0.24 | WebSocket 客户端 |
| mdns-sd | 0.12 | mDNS 库 |

---

## 10. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| webrtc-rs 集成复杂 | 中 | 高 | 初期直接用 relay 模式跳过 P2P；WebRTC 作为后续优化 |
| 跨平台路径/编码问题 | 高 | 中 | 统一用 PathBuf + 尽早测试三平台 |
| 超大文件 OOM | 低 | 高 | 分片 + streaming read，不整文件加载内存 |
| Tauri v2 破坏性更新 | 中 | 中 | 锁定 tauri = "2.0" 精确版本，不追 latest |
| 中继服务器单点瓶颈 | 中 | 中 | 初期无状态设计，后续可水平扩展 |
