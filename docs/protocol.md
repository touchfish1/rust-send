# 通信协议

## 1. 信令协议 (WebSocket JSON)

### ### 枚举

```
DeviceType  = "desktop" | "web"
Direction   = "send" | "receive"
TransferStatus = "queued" | "transferring" | "paused" | "verifying"
               | "completed" | "failed" | "cancelled" | "expired"
FileConflict   = "rename" | "overwrite" | "skip" | "prompt"
ErrorCode      = "checksum_mismatch" | "disk_full" | "file_not_found"
               | "permission_denied" | "timeout" | "cancelled"
               | "device_offline" | "protocol_error"
```

### 消息定义

#### 设备注册

```json
// C → S
{ "type": "register", "device_id": "uuid", "device_name": "string", "device_type": "desktop" }

// S → C
{ "type": "registered", "device_id": "uuid" }
```

#### 设备发现

```json
// C → S
{ "type": "discover" }

// S → C
{
  "type": "device_list",
  "devices": [
    { "id": "uuid", "name": "string", "device_type": "desktop", "last_seen": "iso8601" }
  ]
}
```

#### WebRTC 信令

```json
// C → S (转发给 target_id)
{ "type": "offer",      "target_id": "uuid", "sdp": "string" }
{ "type": "answer",     "target_id": "uuid", "sdp": "string" }
{ "type": "ice_candidate", "target_id": "uuid", "candidate": "string" }

// S → C (转发自 source_id)
{ "type": "offer",         "source_id": "uuid", "sdp": "string" }
{ "type": "answer",        "source_id": "uuid", "sdp": "string" }
{ "type": "ice_candidate", "source_id": "uuid", "candidate": "string" }
```

#### 传输控制

```json
// C → S
{
  "type": "transfer_request",
  "target_id": "uuid",
  "files": [
    { "id": "uuid", "name": "string", "size": 1024, "mime_type": "string" }
  ]
}

// S → C (发给接收方)
{
  "type": "transfer_incoming",
  "source_id": "uuid",
  "source_name": "string",
  "files": [ ... ]
}

// C → S (接收方响应)
{ "type": "transfer_accept",  "source_id": "uuid" }
{ "type": "transfer_reject",  "source_id": "uuid", "reason": "busy" }

// S → C (发给发送方)
{ "type": "transfer_accepted", "target_id": "uuid" }
{ "type": "transfer_rejected", "target_id": "uuid", "reason": "busy" }
```

#### 心跳保活

```json
// C → S, 每 15s 发送
{ "type": "ping" }

// S → C
{ "type": "pong" }

// 服务端检测到 60s 无消息 → 断开连接, 广播 device_lost
```

#### 传输控制（补充）

```json
// 取消传输（任意一方发起）
{ "type": "cancel", "target_id": "uuid", "transfer_id": "uuid", "reason": "user_cancelled" }

// 暂停传输（任意一方发起）
{ "type": "pause", "target_id": "uuid", "transfer_id": "uuid", "reason": "network" }

// 恢复传输
{ "type": "resume", "target_id": "uuid", "transfer_id": "uuid" }

// 批次完成（含多文件的传输所有文件都发完时）
{ "type": "batch_complete", "target_id": "uuid", "transfer_id": "uuid" }

// 断点续传：接收方请求缺失的分片列表
{
  "type": "chunk_request",
  "target_id": "uuid", "transfer_id": "uuid",
  "file_id": "uuid",
  "missing_chunks": [0, 1, 2, 50, 51, 52]
}

// 重连后同步状态
{ "type": "transfer_info_query", "target_id": "uuid", "transfer_id": "uuid" }

{
  "type": "transfer_info",
  "target_id": "uuid", "transfer_id": "uuid",
  "direction": "send",
  "file_states": [
    { "file_id": "uuid", "sent_chunks": 42, "total_chunks": 100, "status": "transferring" }
  ]
}

// 文件冲突策略：接收方在 accept 时告知发送方
{
  "type": "transfer_accept",
  "source_id": "uuid",
  "conflict": "rename"   // "rename" | "overwrite" | "skip"
}

// 拉取模式：接收方主动请求发送方发送指定文件
{
  "type": "pull_request",
  "target_id": "uuid",
  "files": [
    { "id": "uuid", "name": "string", "path": "string" }
  ]
}
```

#### 中继数据

```json
// 单条 relay_data 的 base64 解码后 ≤ 64KB
// 超过 64KB 的数据由发送方自行分片后用 sequence_id 标识
{
  "type": "relay_data",
  "target_id": "uuid",
  "transfer_id": "uuid",
  "sequence_id": 0,       // 可选，大于 64KB 的数据的分片编号
  "sequence_total": 5,    // 可选，总片数
  "data": "base64"
}
```

## 2. 文件传输协议 (WebRTC DataChannel)

### DataChannel 配置

- Label: `"file-transfer-{transfer_id}"`（每批传输独立通道，支持并发）
- Protocol: `"rust-send"`
- Ordered: `false`（允许乱序到达，分片自带序号）
- MaxPacketLifeTime: 3000（毫秒，避免堆积）
- Negotiated: `true`（双方使用相同 ID）

### 消息格式

#### File Header（元数据，JSON）

```json
{
  "type": "file_header",
  "file_id": "uuid",
  "name": "photo.jpg",
  "size": 1048576,
  "mime_type": "image/jpeg",
  "chunk_size": 65536,
  "chunk_count": 16,
  "checksum": "sha256hex"
}
```

#### 数据分片（二进制）

```
Offset  Size  Field
──────  ────  ─────────────────
0       4     file_id (bytes 0-3)
4       4     file_id (bytes 4-7)
8       4     file_id (bytes 8-11)
12      4     file_id (bytes 12-15)
16      4     chunk_index (big-endian u32)
20      4     payload_length (big-endian u32)
24      var   payload
```

16 字节 file_id + 4 字节 chunk_index + 4 字节 payload_length = 24 字节头部。

#### 确认（JSON）

```json
{ "type": "ack",  "file_id": "uuid", "chunk_index": 5 }
{ "type": "nack", "file_id": "uuid", "chunk_index": 5, "reason": "checksum_mismatch" }
```

#### 完成与错误

```json
{ "type": "complete",     "file_id": "uuid", "checksum": "sha256hex" }
{ "type": "complete_ack", "file_id": "uuid" }

// 含多文件的传输全部完成
{ "type": "batch_complete", "transfer_id": "uuid" }

// 错误码为枚举值
{ "type": "error", "file_id": "uuid",
  "code": "checksum_mismatch",    // | "disk_full" | "file_not_found"
                                  // | "permission_denied" | "timeout"
                                  // | "cancelled" | "protocol_error"
  "message": "SHA256 mismatch" }
```

## 3. 分片策略

| 场景 | 分片大小 | 说明 |
|------|---------|------|
| LAN | 256 KB | 低延迟高带宽 |
| WAN P2P | 64 KB | 适应不稳定网络 |
| Relay | 16 KB | 减少单包延迟 |

接收方维护 `BitSet(u128)` 记录已收分片，支持断点续传。

超时 10 秒未收到 ACK 则重传，最大重试 3 次。

**断点续传流程：**
1. 接收方重连后发送 `chunk_request`，包含 `missing_chunks` 列表
2. 发送方从第一个缺失分片开始重发
3. 已收到的分片不必重传

**文件冲突策略（接收方在 accept 时指定）：**
| 策略 | 行为 |
|------|------|
| `rename` | 自动追加 `(1)`, `(2)` 序号 |
| `overwrite` | 直接覆盖 |
| `skip` | 跳过该文件（仅在批量传输时） |
| `prompt` | 弹出对话框让用户选（默认） |

## 4. 目录传输

目录传输 = 递归列举目录中所有文件 + 保留相对路径。

```
传输请求中的 files 列表（拍平）:
├── dir/file_a.txt     (relative_path: "dir/file_a.txt")
├── dir/sub/file_b.txt (relative_path: "dir/sub/file_b.txt")
└── readme.md          (relative_path: "readme.md")
```

- `FileHeader` 中增加字段 `relative_path`（可选，仅在目录传输时有值）
- 接收方按 `relative_path` 还原目录结构
- 目录本身不发空目录（若目录为空则发一个 `.rust-send-empty` 标记）

## 5. 拉取模式（Pull）

默认 Push 模式。Pull 模式支持接收方主动请求指定文件：

```
1. 接收方 → 发送方: pull_request { files: [{name, path}] }
2. 发送方收到后弹出确认对话框
3. 用户确认 → 发送方将 pull_request 转为 transfer_request
4. 后续流程与 Push 相同
```

## 6. 心跳保活

| 参数 | 值 |
|------|-----|
| Ping 间隔 | 15 秒 |
| 超时断开 | 60 秒 |
| 重连等待 | 30 秒（客户端自动重连） |

## 7. mDNS 服务发现

- Service type: `_rust-send._tcp`
- TXT records:
  - `id=<device_id>`
  - `name=<device_name>`
  - `port=<signaling_port>`
