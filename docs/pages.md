# 前端页面详细设计

## 0. 全局布局

```
┌──────────────────────────────────────────────────────────┐
│ TitleBar (Tauri only, h=36px, -webkit-app-region: drag)   │
│ [icon] rust-send         当前设备           —  □  ×     │
├────────┬─────────────────────────────────────────────────┤
│        │                                                  │
│ Sidebar│              MainContent                         │
│ w-72   │              flex-1, p-6                        │
│ bg-    │                                                  │
│ muted  │                                                  │
│        │                                                  │
│ ───────┤                                                  │
│ NavMenu│                                                  │
│ h-14   │                                                  │
└────────┴──────────────────────────────────────────────────┘
```

### TitleBar (仅 Tauri)

| 区域 | 内容 |
|------|------|
| 左侧 | App 图标 + 名称 "rust-send" |
| 中间 | 当前连接状态指示（"已连接 中继" / "局域网 3台设备"） |
| 右侧 | macOS 交通灯（红黄绿）或 Windows/Linux 最小化/最大化/关闭 |
| 行为 | 整行为可拖拽区域；双击最大化 |

### Sidebar

| 区域 | 内容 |
|------|------|
| 顶部 | 本机信息卡片 + 连接状态徽章 |
| 中间 | 设备列表（可滚动） |
| 底部 | 导航菜单（传输列表 / 设置） |

### 响应式断点 (Web 端)

| 断点 | Sidebar 行为 | 说明 |
|------|-------------|------|
| ≥1024px | 固定显示 | 桌面布局 |
| 768-1023px | 可折叠汉堡菜单 | 平板 |
| <768px | 抽屉式 overlay | 手机 |

---

## 1. WelcomePage

**路径:** `/`
**条件:** 未选中任何设备

### 布局

```
┌────────────────────────────────────────────┐
│                                            │
│  ┌────────────────────────────────────┐    │
│  │           QR Code                   │    │
│  │            ████                     │    │
│  │           ██████                   │    │
│  │            ████                     │    │
│  │                                      │    │
│  │  扫码打开 Web 端                      │    │
│  │  ws://192.168.1.100:8080            │    │
│  └────────────────────────────────────┘    │
│                                            │
│  ██ rust-send                              │
│  跨平台文件传输，点对点直连                   │
│                                            │
│  ┌──────────────┐  ┌──────────────┐       │
│  │ 📡 局域网发现  │  │ 🔗 中继连接   │       │
│  └──────────────┘  └──────────────┘       │
│                                            │
│  ┌────────────────────────────────────┐    │
│  │ 💡 提示                               │    │
│  │ · 确保设备在同一局域网                 │    │
│  │ · 或连接同一个中继服务器               │    │
│  │ · 用手机扫码可快速从 Web 端加入        │    │
│  └────────────────────────────────────┘    │
│                                            │
└────────────────────────────────────────────┘
```

### 元素

| 元素 | 类型 | 说明 |
|------|------|------|
| QRCodeCard | Card | 渲染本机连接二维码 + 下方显示 URL 文本 |
| AppTitle | Text | "rust-send" 大字 + 副标题 |
| StatusCards | Card × 2 | LAN 和 Relay 两种连接模式提示卡 |
| TipsSection | Card | 使用提示列表 |

### 状态

| 状态 | 表现 |
|------|------|
| **默认** | 显示 QR 码 + 提示 |
| **无网络** | QR 码置灰，提示 "未连接到网络" |
| **已有历史设备** | QR 码下方显示 "最近连接的设备" 快捷入口 |
| **Web 端加载** | 无 QR 码（Web 没有本地设备），直接显示引导 |

### 交互

| 操作 | 响应 |
|------|------|
| 点击 QR 码 | 放大显示，方便扫码 |
| 点击 LAN 卡片 | 跳转网络设置 |
| 点击 Relay 卡片 | 跳转中继设置 |

### 数据流

```typescript
// 页面加载时
onMount(() => {
  const info = await invoke('get_device_info')
  const qrUrl = `${window.location.origin}/pair?device=${info.id}`
  setQRData(qrUrl)
})
```

---

## 2. ChatPage (设备对话)

**路径:** `/chat/:deviceId`
**条件:** 从 Sidebar 点击设备

### 布局

```
┌────────────────────────────────────────────┐
│ ChatHeader                                  │
│ [Avatar] MacBook Pro    ● 在线 (LAN)        │
│           上次活跃: 2分钟前                   │
├────────────────────────────────────────────┤
│                                             │
│  TransferList (ScrollArea, 自动滚动到底部)    │
│                                             │
│  ┌────────────── 今天 ───────────────┐     │
│  ┌─ Sent ────────────────────────────┐     │
│  │ 📄 report.pdf            15 MB    │     │
│  │ 14:30                     ✓ 已发送 │     │
│  │ [打开] [重发]                     │     │
│  └──────────────────────────────────┘     │
│                                           │
│  ┌─ Received ──────────────────────────┐  │
│  │ 🖼️ photo.jpg             3 MB      │  │
│  │ 14:28                     ✓ 已接收  │  │
│  │ [打开] [保存到...]                  │  │
│  └──────────────────────────────────┘  │  │
│                                           │
│  ┌─ Active ────────────────────────────┐  │
│  │ 🎬 video.mp4             200 MB      │  │
│  │ ████████████░░░░░░░ 60%              │  │
│  │ 15 MB/s  预计剩余 5 秒  [取消]        │  │
│  └──────────────────────────────────┘  │  │
│                                           │
├────────────────────────────────────────────┤
│ BottomBar                                   │
│ ┌──────────────────────────┐ ┌──────────┐  │
│ │  [+] 拖拽或点击选择文件    │ │ 📤 发送  │  │
│ └──────────────────────────┘ └──────────┘  │
│ ┌─ FilePreview (待发送预览) ──────────────┐ │
│ │ 📄 a.pdf  🖼️ b.jpg  ×                  │ │
│ └──────────────────────────────────────────┘│
└────────────────────────────────────────────┘
```

### ChatHeader

| 元素 | 类型 | 说明 |
|------|------|------|
| DeviceAvatar | Avatar | 设备图标（电脑/手机），首字母 fallback |
| DeviceName | Heading | 设备名称 |
| StatusDot | Badge | ● 颜色指示：绿=LAN，蓝=Relay，灰=离线 |
| StatusText | Text | "在线 (LAN)" / "在线 (中继)" / "离线" |
| LastSeen | Text | "上次活跃: 2分钟前"（仅离线时显示） |

### TransferItem (消息列表条目)

| 区域 | 内容 |
|------|------|
| 图标 | 文件类型图标（文档/图片/视频/音频/压缩包/未知） |
| 文件信息 | 文件名 + 格式化文件大小 |
| 时间 | HH:mm 格式 |
| 状态标签 | ✓ 已发送 / ✓ 已接收 / ↻ 传输中 / ✗ 失败 |
| 进度条 | Progress 组件（仅活跃传输） |
| 速度标签 | "15 MB/s  预计剩余 5 秒"（仅活跃传输） |
| 操作按钮 | 已完成: [打开] [保存到...]；活跃: [取消]；失败: [重试] |

**文件图标映射规则：**
```typescript
const FILE_ICONS: Record<string, IconType> = {
  'pdf': FileText, 'doc': FileText, 'docx': FileText,
  'jpg': Image, 'jpeg': Image, 'png': Image, 'gif': Image, 'webp': Image,
  'mp4': Video, 'mov': Video, 'avi': Video, 'mkv': Video,
  'mp3': Music, 'wav': Music, 'flac': Music,
  'zip': Archive, 'rar': Archive, '7z': Archive, 'tar': Archive, 'gz': Archive,
  'exe': FileCode, 'dmg': FileCode, 'AppImage': FileCode,
}
// 未知类型 → File icon
```

### BottomBar

| 元素 | 类型 | 说明 |
|------|------|------|
| DropZone | Button + DropZone | 点击选文件，拖拽直接添加 |
| SendButton | Button | 有文件待发送时亮起，无文件时 disabled |
| FilePreview | row of chips | 选中文件后的预览标签，支持逐个移除 |

### 状态

| 状态 | 表现 |
|------|------|
| **加载中** | TransferList 显示 3 个 Skeleton |
| **空历史** | "还没有传输记录" + "立即发送文件" 按钮（触发 DropZone） |
| **有历史** | 按日期分组展示 TransferItem |
| **活跃传输** | 在历史中插入进度条 TransferItem |
| **设备离线** | ChatHeader 灰色状态点，BottomBar 禁用，"设备离线" 提示条 |
| **接收请求** | 弹出 ReceiveConfirmDialog |
| **传输失败** | TransferItem 显示 ✗ 失败 + [重试] 按钮 |
| **重连中** | ChatHeader 闪烁 "重连中..." |

### 交互

| 操作 | 响应 |
|------|------|
| 点击 DropZone | 触发 Tauri `pick_files`，选中后显示 FilePreview |
| 拖拽文件到 DropZone | FilePreview 显示文件列表 |
| 点击 FilePreview 的 × | 移除该文件 |
| 点击 SendButton | 调用 Tauri `send_files`，开始传输 |
| 点击 TransferItem [取消] | 弹出 ConfirmDialog，确认后调用 `cancel_transfer` |
| 点击 TransferItem [重试] | 重新调用 `send_files` |
| 点击 TransferItem [打开] | 使用系统默认程序打开文件（Tauri `shell.open`） |
| 点击 TransferItem [保存到...] | 触发系统保存对话框 |

### 键盘快捷键

| 快捷键 | 行为 |
|--------|------|
| `Cmd/Ctrl + O` | 打开文件选择器 |
| `Cmd/Ctrl + V` | 粘贴剪贴板中的文件 |
| `Escape` | 清空待发送列表 |

### 数据流

```typescript
// 发送文件
async function handleSend() {
  // 1. 读取待发送文件列表（来自 FilePreview state）
  // 2. 调用 Tauri command
  await invoke('send_files', {
    targetId: deviceId,
    paths: pendingFiles.map(f => f.path),
  })
  // 3. 清空待发送列表
  setPendingFiles([])
  // 4. Tauri 后端发送进度通过事件推送
  // 5. listen('transfer:progress') 更新 TransferStore
  // 6. TransferItem 响应式更新进度条
}

// 接收文件 — 事件驱动
listen<IncomingTransfer>('transfer:incoming', (event) => {
  // 1. 设置 incoming state → 触发 ReceiveConfirmDialog
  // 2. 用户点击接受
  await invoke('accept_transfer', {
    sourceId: event.payload.sourceId,
    saveDir: settingsStore.downloadDir,
  })
  // 3. 用户点击拒绝
  await invoke('reject_transfer', {
    sourceId: event.payload.sourceId,
  })
})
```

---

## 3. TransferPage (传输列表)

**路径:** `/transfers`
**条件:** 侧栏导航点击 "传输"

### 布局

```
┌────────────────────────────────────────────┐
│ 传输列表          [全部清空] (仅历史存在时)   │
│                                             │
│ ─── 进行中 (2) ───                         │
│                                             │
│ ┌ TransferCard ───────────────────────────┐ │
│ │ ← MacBook Pro (LAN)                    │ │
│ │ 🎬 video.mp4         200 MB            │ │
│ │ ████████████░░░░░░░░ 60%  120/200 MB   │ │
│ │ 15 MB/s  预计剩余 5 秒     [取消]        │ │
│ └────────────────────────────────────────┘ │
│                                             │
│ ┌ TransferCard ───────────────────────────┐ │
│ │ → Linux-PC (中继)                       │ │
│ │ 📄 documents.zip     50 MB             │ │
│ │ ████████████████████ 100%               │ │
│ │ ⏳ 正在校验哈希...                       │ │
│ └────────────────────────────────────────┘ │
│                                             │
│ ─── 已完成 (12) ───                        │
│ ┌ TransferCard ───────────────────────────┐ │
│ │ ← MacBook Pro      ✓ 已接收             │ │
│ │ 🖼️ photo.jpg       3 MB                │ │
│ │ 01-15 14:28                              │ │
│ └────────────────────────────────────────┘ │
│ ┌ TransferCard ───────────────────────────┐ │
│ │ → Linux-PC         ✗ 失败               │ │
│ │ 📄 report.pdf      15 MB                │ │
│ │ 01-15 14:30                [重试]        │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

### TransferCard

| 区域 | 内容 |
|------|------|
| 方向 | `←` 接收 / `→` 发送，+ 设备名 +（连接方式） |
| 文件图标 + 名称 | 如 🎬 video.mp4 |
| 文件大小 | 格式化后的大小 |
| 进度条（活跃）| Progress + 数值 "120/200 MB" |
| 速度（活跃）| "15 MB/s  预计剩余 5 秒" |
| 状态标签 | 见下方状态映射表 |
| 操作按钮 | 见下方状态映射表 |

**状态映射表：**

| 状态 | 标签 | 操作按钮 | 进度条 |
|------|------|---------|--------|
| `queued` | ⏳ "排队中（第 2 位）" | [取消] | 无 |
| `transferring` | 自动计算速度 | [暂停] [取消] | 显示 |
| `paused(user)` | ⏸ "已暂停" | [续传] [取消] | 保留 |
| `paused(network)` | ⚠ "网络中断" | [取消] | 保留 |
| `paused(disk_full)` | ⚠ "磁盘空间不足" | [取消] | 保留 |
| `reconnecting` | 🔄 "重连中..." | [取消] | 保留 |
| `verifying` | ⏳ "正在校验哈希..." | 无 | 100% 定格 |
| `completed` | ✓ "已接收 / 已发送" | [打开] [保存到...] | 100% |
| `failed` | ✗ "失败" | [重试] [取消] | 已发送量 |
| `cancelled` | ⛔ "已取消" | [重发] | 已发送量 |
| `expired` | ⏰ "已过期" | 无 | 无 |

### 分组规则

| 分组 | 条件 | 排序 |
|------|------|------|
| 进行中 | status = queued / transferring / paused / reconnecting / verifying | 按优先级: queued→transferring→verifying→paused→reconnecting |
| 已完成 | status = completed / failed / cancelled / expired | 按 completed_at 降序 |

### 状态

| 状态 | 表现 |
|------|------|
| **加载中** | 2 个 Skeleton TransferCard |
| **空** | "还没有传输记录" + "选择左侧设备开始发送" |
| **仅活跃** | 只显示进行中分组 |
| **仅历史** | 只显示已完成分组 |
| **混合** | 两个分组都显示 |
| **全部传输完成** | 活跃分组自动消失，历史分组保留 |

### 交互

| 操作 | 响应 |
|------|------|
| 点击 [全部清空] | 弹确认框 → 调用 `clear_history` |
| 点击活跃 TransferCard | 跳转到 `/chat/:deviceId` 并滚动到该传输 |
| 点击历史 TransferCard | 跳转到对应的设备 ChatPage |
| 点击 [取消] | ConfirmDialog → `cancel_transfer` |
| 点击 [重试] | 调用 `send_files` |

### 数据流

```typescript
// 页面挂载时获取数据
const transfers = await invoke('get_transfers')
const history = await invoke('get_history')

// 实时更新
listen('transfer:progress', (e) => {
  transferStore.updateProgress(e.payload.fileId, e.payload)
})
listen('transfer:complete', (e) => {
  // 从 active 移到 history
  transferStore.completeTransfer(e.payload.fileId)
})
listen('transfer:failed', (e) => {
  transferStore.failTransfer(e.payload.fileId, e.payload.error)
})
```

---

## 4. SettingsPage

**路径:** `/settings`
**条件:** 侧栏导航点击 "设置"

### 布局

```
┌────────────────────────────────────────────┐
│ 设置                                        │
│                                             │
│ ─── 通用 ───                                │
│ ┌────────────────────────────────────────┐ │
│ │ 设备名称                                │ │
│ │ ┌──────────────────────────────────┐   │ │
│ │ │ MacBook Pro                      │   │ │
│ │ └──────────────────────────────────┘   │ │
│ │                                        │ │
│ │ 下载目录                                │ │
│ │ ┌────────────────────┐ ┌────┐         │ │
│ │ │ ~/Downloads/rust-send │ │选择│         │ │
│ │ └────────────────────┘ └────┘         │ │
│ │                                        │ │
│ │ 分片大小                                │ │
│ │ ○ 64KB  ● 256KB  ○ 1MB                │ │
│ └────────────────────────────────────────┘ │
│                                             │
│ ─── 网络 ───                                │
│ ┌────────────────────────────────────────┐ │
│ │ 中继服务器地址                           │ │
│ │ ┌──────────────────────────────────┐   │ │
│ │ │ wss://relay.rust-send.dev:443   │   │ │
│ │ └──────────────────────────────────┘   │ │
│ │  [连接测试]                             │ │
│ │                                        │ │
│ │ 局域网自动接受文件       [开关]          │ │
│ │ 开启后局域网设备发来的文件自动接收        │ │
│ └────────────────────────────────────────┘ │
│                                             │
│ ─── 外观 ───                                │
│ ┌────────────────────────────────────────┐ │
│ │ 主题                                    │ │
│ │ ● 跟随系统  ○ 浅色  ○ 深色              │ │
│ └────────────────────────────────────────┘ │
│                                             │
│ ─── 关于 ───                                │
│ ┌────────────────────────────────────────┐ │
│ │ rust-send                              │ │
│ │ 版本 0.1.0                             │ │
│ │ 构建: 2024-01-15                       │ │
│ │                                        │ │
│ │ Rust 后端 | React 前端 | WebRTC 传输    │ │
│ │                                        │ │
│ │ [检查更新]   [反馈问题]                  │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

### 各设置项

| 设置 | 组件 | 验证规则 | 保存时机 |
|------|------|---------|---------|
| 设备名称 | Input | 1-32 字符，不能为空 | blur |
| 下载目录 | Input + Button(pick_directory) | 必须存在 | 选择后立即 |
| 分片大小 | Radio Group | 64KB / 256KB / 1MB | 选择后立即 |
| 中继地址 | Input | 必须是 wss:// 或 ws:// URL | blur + 格式校验 |
| 局域网自动接收 | Switch | — | 切换后立即 |
| 主题 | Radio Group | system / light / dark | 切换后立即 |

### 状态

| 状态 | 表现 |
|------|------|
| **默认** | 显示当前设置值 |
| **编辑中** | Input 获得焦点，显示光标 |
| **保存中** | 设置值变化时短暂显示 "已保存" 提示 |
| **验证失败** | Input 红色边框 + 错误提示文字 |
| **连接测试中** | 按钮显示 spinner，结果 Toast 通知 |
| **目录不存在** | 下载目录显示警告图标 + "目录不存在" |

### 交互

| 操作 | 响应 |
|------|------|
| 修改设备名称 | blur 时调用 `set_device_name`，失败 Toast |
| 点击 [选择] 下载目录 | 触发 `pick_directory`，成功后更新显示 |
| 切换分片大小 | 立即调用底层更新 chunk 配置 |
| 修改中继地址 | blur 时校验 URL 格式，通过则调用 `connect_relay` |
| 点击 [连接测试] | 尝试 WS 握手，成功/失败 Toast |
| 切换自动接收 | 更新配置，持久化到本地 |
| 切换主题 | `next-themes` 切换 class，持久化 |

### 数据流

```typescript
// 载入设置
onMount(async () => {
  const info = await invoke('get_device_info')
  const dir = await invoke('get_downloads_dir')
  settingsStore.setLocalInfo(info)
  settingsStore.setDownloadDir(dir)
})

// 保存设置
async function onNameBlur(name: string) {
  if (name.length < 1 || name.length > 32) return showError('名称长度不合法')
  await invoke('set_device_name', { name })
  toast.success('已保存')
}
```

---

## 5. Dialog 层 (Portal)

### ReceiveConfirmDialog

```
┌──────────────────────────────────────┐
│ 接收文件                               │
│                                        │
│ ◀ MacBook Pro 想向你发送以下文件：       │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │ 📄 📄 🖼️                         │  │
│ │ report.pdf  notes.txt  photo.jpg  │  │
│ │ 15 MB       2 KB       3 MB      │  │
│ └──────────────────────────────────┘  │
│                                        │
│ 共 3 个文件, 共 20.02 MB               │
│                                        │
│ 保存到: ~/Downloads/rust-send          │
│                                        │
│ 文件名冲突:                            │
│ ○ 自动重命名  ● 覆盖  ○ 跳过            │
│                                        │
│ 以后来自此设备自动接收  [开关]           │
│                                        │
│        [拒绝]              [接受]       │
└──────────────────────────────────────┘
```

| 状态 | 表现 |
|------|------|
| **默认** | 显示文件列表 + 尺寸 |
| **接收中** | 按钮变为 spinner "正在准备..." |
| **已拒绝** | Dialog 关闭 |
| **超时** | 60 秒无操作自动拒绝，Dialog 关闭 |

### ConfirmDialog (通用确认)

```
┌──────────────────────────────────────┐
| 取消传输                               |
|                                        |
| 确定要取消 video.mp4 (200 MB) 吗？      |
| 已传输 120 MB (60%)                   |
|                                        |
| ☐ 删除已接收的部分文件（仅接收方可见）    |
|                                        |
|        [取消]              [确定]       |
└──────────────────────────────────────┘
```

### Toast 通知

| 场景 | 位置 | 持续时间 |
|------|------|---------|
| 传输完成 | 右下 | 5s |
| 传输失败 | 右下 | 8s |
| 连接成功 | 右下 | 3s |
| 连接断开 | 右下 | 持续 |
| 错误 | 右下 | 8s |
| 保存成功 | 右下 | 3s |

---

## 6. 页面/组件交互总览

```
Sidebar
 ├── 点击设备 → navigate(/chat/:deviceId)
 ├── 点击 "传输" → navigate(/transfers)
 └── 点击 "设置" → navigate(/settings)

WelcomePage
 └── 选中侧栏设备 → navigate(/chat/:deviceId)

ChatPage
 ├── 拖拽/选文件 → FilePreview 出现
 ├── 点击发送 → invoke send_files
 ├── 事件 transfer:progress → TransferItem 更新进度
 ├── 事件 transfer:incoming → ReceiveConfirmDialog
 └── 事件 device:discovered → Sidebar 刷新

TransferPage
 ├── 点击 TransferCard → navigate(/chat/:deviceId)
 ├── 事件 transfer:progress → TransferCard 更新
 └── 事件 transfer:complete → 从 active 移到 history

SettingsPage
 ├── 修改设置 → invoke / 持久化
 └── 连接测试 → WebSocket 握手

Globally
 └── 事件 connection:state → ConnectionBadge 更新
```

---

## 7. 页面路由、标题、过渡

| 路由 | 页面组件 | document.title | 过渡动画 |
|------|---------|---------------|---------|
| `/` | WelcomePage | "rust-send" | fade in |
| `/chat/:deviceId` | ChatPage | "设备名 - rust-send" | slide left |
| `/transfers` | TransferPage | "传输列表 - rust-send" | fade in |
| `/settings` | SettingsPage | "设置 - rust-send" | fade in |

过渡动画使用 CSS `@keyframes`（不引入 framer-motion 以保持轻量）：

```css
@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes slide-left {
  from { opacity: 0; transform: translateX(8px); }
  to   { opacity: 1; transform: translateX(0); }
}
```
