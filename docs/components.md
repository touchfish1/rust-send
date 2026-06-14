# 前端设计

## 技术栈

| 用途 | 库 | 说明 |
|------|-----|------|
| 框架 | React 18 + TypeScript | — |
| 路由 | react-router-dom v6 | — |
| 状态管理 | Zustand | 轻量、无 boilerplate |
| 样式 | Tailwind CSS | 原子化 CSS |
| UI 组件 | shadcn/ui (Radix + Tailwind) | 非依赖、copy-paste 组件 |
| 图标 | lucide-react | 树摇友好、与 shadcn 默认搭配 |
| 拖拽选文件 | react-dropzone | 文件拖放 / 点击选择 |
| 构建 | Vite | HMR 快速、双入口配置 |
| 主题 | next-themes | shadcn 推荐的暗色模式方案 |
| WebRTC | browser 原生 API | — |

## shadcn/ui 组件清单

| 组件 | 用途 | 引用路径 |
|------|------|---------|
| `Button` | 操作按钮 | `@/components/ui/button` |
| `Input` | 文本输入、设备名编辑 | `@/components/ui/input` |
| `Card` | 设备卡片、文件消息卡片 | `@/components/ui/card` |
| `Dialog` | 接收确认弹窗 | `@/components/ui/dialog` |
| `Progress` | 传输进度条 | `@/components/ui/progress` |
| `ScrollArea` | 设备列表、消息列表 | `@/components/ui/scroll-area` |
| `Separator` | 布局分隔 | `@/components/ui/separator` |
| `Switch` | 设置项开关 | `@/components/ui/switch` |
| `Tooltip` | 图标释义 | `@/components/ui/tooltip` |
| `Avatar` | 设备头像/图标 | `@/components/ui/avatar` |
| `Badge` | 设备状态标记 | `@/components/ui/badge` |
| `DropdownMenu` | 设备右键/更多操作 | `@/components/ui/dropdown-menu` |
| `Toast` | 传输完成/错误通知 | `@/components/ui/toast` |
| `Label` | 表单标签 | `@/components/ui/label` |
| `Skeleton` | 加载占位 | `@/components/ui/skeleton` |

## 设计系统

### 色彩

```
--background: 白色 / 深灰 950
--foreground: 深灰 950 / 白色

--primary:    蓝色 600 (#2563eb)   /* 主色调：品牌色 */
--primary-foreground: 白色

--secondary:  灰色 100             /* 辅助色：侧栏、卡片背景 */
--secondary-foreground: 深灰 900

--muted:      灰色 100             /* 弱化：状态标签、描述 */
--muted-foreground: 灰色 500

--accent:     蓝色 50              /* 强调：悬停、选中 */
--accent-foreground: 蓝色 700

--destructive: 红色 600            /* 错误、取消 */
--ring:       蓝色 300
```

使用 shadcn 默认 HSL 方案，直接通过 `next-themes` 切换 `.dark` class。

### 布局

```
┌──────────────────────────────────────────────┐
│  TitleBar (Tauri 自定义, h-10, drag region)    │ ← Tauri only
├────────┬─────────────────────────────────────┤
│        │                                      │
│ Sidebar │           MainContent               │
│ w-72   │           flex-1                     │
│  bg    │                                      │
│ muted  │                                      │
│        │                                      │
│ ───────┤                                      │
│ NavMenu│                                      │
│ h-14   │                                      │
└────────┴─────────────────────────────────────┘
```

- Sidebar: 固定 288px (`w-72`)，包含设备列表 + 底部导航
- MainContent: 自适应剩余宽度
- Tauri 环境额外增加自定义标题栏

### 间距

| Token | 值 | 用途 |
|-------|----|------|
| `p-4` | 16px | 卡片内边距 |
| `p-6` | 24px | 页面/区块内边距 |
| `gap-2` | 8px | 组件间距 |
| `gap-4` | 16px | 区块间距 |
| `space-y-6` | 24px | 段落间距 |

### 字体

- UI: `Inter` (sans-serif)
- 代码/文件名: `JetBrains Mono` (monospace)
- Tauri 中直接使用系统字体回退

## 组件树

```
App
├── Layout
│   ├── Sidebar
│   │   ├── LocalDeviceCard        ← 本机设备信息 + 二维码
│   │   ├── ConnectionBadge        ← 连接状态指示灯
│   │   ├── DeviceList             ← 设备列表区域
│   │   │   ├── DeviceListHeader   ← "在线设备 (N)" + 刷新按钮
│   │   │   └── DeviceItem[xN]     ← 图标 + 名称 + 状态点
│   │   └── NavMenu                ← 底部导航
│   │       ├── NavItem("传输")     → /transfers
│   │       └── NavItem("设置")     → /settings
│   │
│   └── MainContent
│       ├── WelcomePage            ← 无设备选中时的空状态
│       │   ├── QRCodeCard         ← 本机二维码（Web 端扫码）
│       │   └── TipsSection        ← 使用提示
│       │
│       ├── ChatPage               ← 与某设备对话
│       │   ├── ChatHeader         ← 设备名 + 状态 + 操作
│       │   ├── MessageList        ← 消息列表（虚拟滚动）
│       │   │   ├── FileBubble     ← 文件消息卡片
│       │   │   │   ├── FileIcon   ← 类型图标
│       │   │   │   ├── FileInfo   ← 名称 + 大小
│       │   │   │   └── FileAction ← 下载/打开/保存
│       │   │   └── SystemMessage  ← "已连接" / "传输完成"
│       │   └── BottomBar
│       │       ├── FileDropZone   ← 拖拽 + 点击选文件
│       │       ├── FilePreview    ← 待发送文件预览列表
│       │       └── SendButton     ← 发送按钮
│       │
│       ├── TransferPage           ← 传输中心
│       │   ├── ActiveSection
│       │   │   └── TransferCard[xN]
│       │   │       ├── FileInfo     ← 名称 + 大小 + 方向
│       │   │       ├── ProgressBar  ← 进度条 + 百分比
│       │   │       ├── SpeedLabel   ← 实时速度
│       │   │       └── ActionButton ← 取消/暂停/重试
│       │   └── HistorySection
│       │       ├── HistoryHeader    ← "已完成" + 清空按钮
│       │       └── HistoryItem[xN]
│       │           ├── FileIcon
│       │           ├── FileInfo
│       │           └── Timestamp
│       │
│       └── SettingsPage           ← 设置
│           ├── GeneralSection
│           │   ├── DeviceNameInput
│           │   ├── DownloadDirPicker
│           │   └── ChunkSizeSelect
│           ├── NetworkSection
│           │   ├── RelayUrlInput
│           │   └── AutoAcceptLanToggle
│           └── AboutSection
│               └── VersionInfo
│
└── DialogLayer (Portal)
    ├── ReceiveConfirmDialog       ← 接收/拒绝弹窗
    └── ConfirmDialog              ← 通用确认弹窗
```

## 路由

```
/                    → TransferPage（传输列表首页）
/chat/:deviceId      → ChatPage（与设备对话）
/settings            → SettingsPage
```

## 状态管理 (Zustand)

### DeviceStore

```typescript
interface DeviceStore {
  localId: string
  localName: string
  devices: Map<string, DeviceInfo>
  status: ConnectionStatus

  setLocalInfo: (id: string, name: string) => void
  setDevices: (devices: DeviceInfo[]) => void
  addDevice: (device: DeviceInfo) => void
  removeDevice: (id: string) => void
  setStatus: (status: ConnectionStatus) => void
}
```

### TransferStore

```typescript
interface TransferStore {
  active: Map<string, TransferState>
  history: TransferRecord[]
  incoming: IncomingTransfer | null

  addTransfer: (t: TransferState) => void
  updateProgress: (fileId: string, progress: TransferProgress) => void
  completeTransfer: (id: string) => void
  failTransfer: (id: string, error: string) => void
  setIncoming: (req: IncomingTransfer | null) => void
  addHistory: (record: TransferRecord) => void
  clearHistory: () => void
}
```

### SettingsStore

```typescript
interface SettingsStore {
  downloadDir: string
  chunkSize: number
  autoAcceptLan: boolean
  relayUrl: string
  theme: 'light' | 'dark' | 'system'

  setDownloadDir: (dir: string) => void
  setChunkSize: (size: number) => void
  setAutoAcceptLan: (on: boolean) => void
  setRelayUrl: (url: string) => void
  setTheme: (t: 'light' | 'dark' | 'system') => void
}
```

### Hooks

```typescript
// Tauri 事件订阅
useTauriEvent(event: string, handler: (payload: T) => void)

// WebRTC 连接管理
useWebRTC(peerId: string)

// LAN 扫描
useLanScan()
```
