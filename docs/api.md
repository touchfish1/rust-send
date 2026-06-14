# Tauri IPC API

## 命令（Frontend → Backend）

### 设备管理

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_device_id` | — | `string` | 获取本机设备 ID（UUID） |
| `get_device_name` | — | `string` | 获取本机设备名 |
| `set_device_name` | `{ name: string }` | `void` | 设置本机设备名 |
| `get_device_info` | — | `DeviceInfo` | 获取完整设备信息 |

### 文件操作

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `pick_file` | — | `Option<string>` | 系统文件选择器（单文件） |
| `pick_files` | — | `string[]` | 系统文件选择器（多文件） |
| `pick_directory` | — | `Option<string>` | 选择文件夹 |
| `pick_save_directory` | — | `Option<string>` | 选择保存目录 |
| `get_file_meta` | `{ path: string }` | `FileMeta` | 获取文件元信息 |
| `get_downloads_dir` | — | `string` | 获取默认下载目录 |

### 传输控制

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `send_files` | `{ target_id: string, paths: string[] }` | `void` | 发起文件发送 |
| `accept_transfer` | `{ source_id: string, save_dir: string, conflict?: string }` | `void` | 接受传入传输 |
| `reject_transfer` | `{ source_id: string }` | `void` | 拒绝传入传输 |
| `cancel_transfer` | `{ transfer_id: string, delete_partial?: bool }` | `void` | 取消传输（可删除已收文件） |
| `pause_transfer` | `{ transfer_id: string, reason?: string }` | `void` | 暂停传输 |
| `resume_transfer` | `{ transfer_id: string }` | `void` | 恢复传输 |
| `get_active_transfers` | — | `TransferState[]` | 获取活跃传输列表 |
| `get_history` | — | `TransferRecord[]` | 获取历史记录 |
| `clear_history` | — | `void` | 清除历史 |

### 网络

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `connect_relay` | `{ url: string }` | `void` | 连接到中继服务器 |
| `disconnect_relay` | — | `void` | 断开中继连接 |
| `get_connection_status` | — | `ConnectionStatus` | 获取当前连接状态 |
| `force_lan_scan` | — | `void` | 强制扫描局域网设备 |

## 事件（Backend → Frontend）

| 事件 | Payload | 说明 |
|------|---------|------|
| `transfer:progress` | `{ file_id, file_name, bytes_sent, bytes_total, speed }` | 传输进度 |
| `transfer:complete` | `{ file_id, file_name, target_id }` | 文件传输完成 |
| `transfer:batch_complete` | `{ transfer_id, target_id }` | 多文件传输全部完成 |
| `transfer:failed` | `{ file_id, error }` | 传输失败 |
| `transfer:paused` | `{ file_id, reason }` | 传输暂停（user / network / disk_full） |
| `transfer:resumed` | `{ file_id }` | 传输恢复 |
| `transfer:cancelled` | `{ transfer_id, reason }` | 传输被取消 |
| `transfer:incoming` | `{ source_id, source_name, files }` | 收到传输请求 |
| `transfer:queued` | `{ transfer_id, position }` | 传输进入排队 |
| `transfer:reconnecting` | `{ device_id }` | 设备重连中 |
| `device:discovered` | `DeviceInfo` | 发现新设备 |
| `device:lost` | `{ device_id }` | 设备离线 |
| `connection:state` | `{ state: "lan" \| "relay" \| "offline" }` | 连接状态变化 |
| `relay:error` | `{ code, message }` | 中继错误 |
| `pull:request` | `{ source_id, source_name, files }` | 收到拉取请求 |

## 数据模型

### Rust 侧

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub id: Uuid,
    pub name: String,
    pub device_type: DeviceType,
    pub addr: Option<SocketAddr>,
    pub last_seen: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMeta {
    pub id: Uuid,
    pub name: String,
    pub size: u64,
    pub mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileProgress {
    pub file_id: Uuid,
    pub file_name: String,
    pub size: u64,
    pub bytes_sent: u64,
    pub speed: f64,           // bytes/sec
    pub status: TransferStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferState {
    pub id: Uuid,
    pub direction: Direction,
    pub peer_id: Uuid,
    pub peer_name: String,
    pub files: Vec<FileProgress>,
    pub started_at: DateTime<Utc>,
    pub status: TransferStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferRecord {
    pub id: Uuid,
    pub direction: Direction,
    pub peer_name: String,
    pub file_names: Vec<String>,
    pub total_size: u64,
    pub started_at: DateTime<Utc>,
    pub completed_at: DateTime<Utc>,
    pub status: TransferStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub relay_connected: bool,
    pub lan_devices: usize,
    pub mode: ConnectionMode,
}

pub enum ConnectionMode { Lan, Relay, Offline }
pub enum Direction { Send, Receive }
pub enum TransferStatus { Queued, Transferring, Paused(User), Paused(Network), Verifying, Completed, Failed, Cancelled, Expired }

pub enum PauseReason { User, Network, DiskFull }
pub enum DeviceType { Desktop, Web }
```

### TypeScript 侧

```typescript
interface DeviceInfo {
  id: string
  name: string
  deviceType: 'desktop' | 'web'
  addr?: string
  lastSeen: string
}

interface FileMeta {
  id: string
  name: string
  size: number
  mimeType: string
}

interface TransferProgress {
  fileId: string
  fileName: string
  bytesSent: number
  bytesTotal: number
  speed: number
}

interface TransferState {
  id: string
  direction: 'send' | 'receive'
  peerId: string
  peerName: string
  files: FileProgress[]
  startedAt: string
  status: 'queued' | 'transferring' | 'paused' | 'verifying' | 'completed' | 'failed' | 'cancelled' | 'expired'
  pauseReason?: 'user' | 'network' | 'disk_full'
}

interface IncomingTransfer {
  sourceId: string
  sourceName: string
  files: { id: string; name: string; size: number; mimeType: string }[]
}

interface ConnectionStatus {
  relayConnected: boolean
  lanDevices: number
  mode: 'lan' | 'relay' | 'offline'
}
```
