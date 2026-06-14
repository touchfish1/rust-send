# 后端详细设计

## 1. 项目结构

```
src-tauri/src/
├── main.rs                    # Tauri 入口，builder 装配
├── lib.rs                     # 模块声明、AppState、setup 函数
├── commands/                  # Tauri IPC 命令
│   ├── mod.rs
│   ├── device.rs              # 设备管理
│   ├── file.rs                # 文件操作
│   └── transfer.rs            # 传输控制
├── core/                      # 核心类型（与 relay-server 共享）
│   ├── mod.rs
│   ├── protocol.rs            # 通信协议枚举
│   ├── device.rs              # DeviceId, DeviceInfo
│   └── file.rs                # FileMeta, Chunk, Progress
├── transfer/                  # 文件传输引擎
│   ├── mod.rs
│   ├── engine.rs              # 传输管理器（并发控制）
│   ├── sender.rs              # 发送端逐分片读取+发送
│   └── receiver.rs            # 接收端收分片+落盘+校验
├── discovery/                 # 局域网发现
│   ├── mod.rs
│   └── mdns.rs                # mDNS 注册+浏览
├── relay/                     # 中继客户端
│   ├── mod.rs
│   └── client.rs              # WebSocket 信令+数据中继
├── platform/                  # 平台适配
│   ├── mod.rs
│   └── paths.rs               # 应用目录、下载目录
├── storage/                   # 持久化
│   ├── mod.rs
│   ├── config.rs              # 设置读写
│   └── history.rs             # 传输历史读写
└── error.rs                   # 统一错误类型

relay-server/
├── Cargo.toml
└── src/
    ├── main.rs                # axum 启动，路由挂载
    ├── ws.rs                  # WebSocket 会话管理
    ├── room.rs                # 设备房间映射
    └── relay.rs               # 数据中继转发
```

---

## 2. AppState（Tauri 共享状态）

```rust
// lib.rs

pub struct AppState {
    pub engine:   Arc<Mutex<TransferEngine>>,
    pub discovery: Arc<MdnsDiscovery>,
    pub relay:    Arc<Mutex<Option<RelayClient>>>,
    pub config:   Arc<Mutex<AppConfig>>,
    pub history:  Arc<Mutex<TransferHistory>>,
}

pub struct AppConfig {
    pub device_id: Uuid,
    pub device_name: String,
    pub download_dir: PathBuf,
    pub chunk_size: u32,
    pub auto_accept_lan: bool,
    pub relay_url: Option<String>,
}

// setup() 函数在 Tauri 启动时调用：
// 1. 加载 config.json，若不存在则创建默认配置
// 2. 加载 history.json
// 3. 初始化 TransferEngine
// 4. 启动 mDNS 发现
// 5. 若配置了 relay_url，自动连接中继
// 6. 注册所有 tauri::command
// 7. 启动全局事件监听循环
```

---

## 3. 命令层 (commands/)

### device.rs

```rust
#[tauri::command]
fn get_device_id(state: State<AppState>) -> String
// → 返回 state.config.lock().device_id.to_string()

#[tauri::command]
fn get_device_name(state: State<AppState>) -> String
// → 返回 state.config.lock().device_name.clone()

#[tauri::command]
fn set_device_name(state: State<AppState>, name: String) -> Result<(), AppError>
// 1. 校验 1 ≤ name.len() ≤ 32
// 2. state.config.lock().device_name = name
// 3. 更新 mDNS TXT 记录（discovery.update_name(name)）
// 4. 保存 config 到磁盘
// 5. 若已连接 relay，发送更新消息

#[tauri::command]
fn get_device_info(state: State<AppState>) -> DeviceInfo
// → 从 config + relay/discovery 状态组装 DeviceInfo
```

### file.rs

```rust
#[tauri::command]
async fn pick_file(app: AppHandle) -> Option<String>
// → 调用 tauri::api::dialog::file::open_file(Some(DefaultFilter))
//    （或使用 rfd crate 获得更好控制）

#[tauri::command]
async fn pick_files(app: AppHandle) -> Vec<String>
// → 多文件版本，allow_multiple = true

#[tauri::command]
async fn pick_save_directory(app: AppHandle) -> Option<String>
// → tauri::api::dialog::file::save 或 rfd::pick_folder

#[tauri::command]
async fn get_file_meta(path: String) -> Result<FileMeta, AppError>
// 1. tokio::fs::metadata(path) → 获取 len, modified
// 2. 从路径提取文件名、扩展名
// 3. 映射 mime_type（简单映射表）
// 4. 返回 FileMeta { id: Uuid::new_v4(), name, size, mime_type }

#[tauri::command]
fn get_downloads_dir(state: State<AppState>) -> String
// → state.config.lock().download_dir.to_string_lossy()
```

### transfer.rs

```rust
#[tauri::command]
async fn send_files(
    state: State<AppState>,
    app: AppHandle,
    target_id: String,
    paths: Vec<String>,
) -> Result<(), AppError>
// 1. 解析 target_id → Uuid
// 2. 对每个 path: tokio::fs::metadata + get_file_meta
// 3. 获取 peer connection（先查 LAN，fallback 到 relay）
// 4. 发送 transfer_request 信令
// 5. 等待对方 accept（超时 60s）
// 6. 若 accept → engine.start_send()
//    若 reject → 返回错误给前端
// 7. 每个文件作为一个独立的 sender task 启动

#[tauri::command]
async fn accept_transfer(
    state: State<AppState>,
    app: AppHandle,
    source_id: String,
    save_dir: String,
    conflict: Option<String>,  // "rename" | "overwrite" | "skip"
) -> Result<(), AppError>
// 1. 通过 relay/信令发送 transfer_response { accepted: true, conflict: "rename" }
// 2. 执行 WebRTC 连接协商（exchange SDP + ICE）
// 3. 连接建立后 → engine.start_receive()
// 4. 每个文件启动一个 receiver task

#[tauri::command]
async fn reject_transfer(
    state: State<AppState>,
    source_id: String,
) -> Result<(), AppError>
// → 发送 transfer_response { accepted: false }

#[tauri::command]
async fn cancel_transfer(
    state: State<AppState>,
    app: AppHandle,
    transfer_id: String,
    delete_partial: Option<bool>,  // 是否删除已收部分文件（仅接收方）
) -> Result<(), AppError>
// 1. engine.cancel(transfer_id, delete_partial.unwrap_or(false))
// 2. 通过 relay 发送 cancel 信令到对端
// 3. 若 delete_partial → 删除已写入的部分文件

#[tauri::command]
async fn pause_transfer(
    state: State<AppState>,
    transfer_id: String,
    reason: Option<String>,
) -> Result<(), AppError>
// 1. engine.pause(transfer_id)
// 2. 发送 pause 信令到对端

#[tauri::command]
async fn resume_transfer(
    state: State<AppState>,
    transfer_id: String,
) -> Result<(), AppError>
// 1. engine.resume(transfer_id)
// 2. 发送 resume 信令到对端
// 3. 若接收方，发送 chunk_request 请求缺失分片

#[tauri::command]
fn get_active_transfers(state: State<AppState>) -> Vec<TransferState>
// → engine.active_transfers() 克隆当前状态快照

#[tauri::command]
fn get_history(state: State<AppState>) -> Vec<TransferRecord>
// → state.history.lock().records.clone()

#[tauri::command]
async fn clear_history(state: State<AppState>) -> Result<(), AppError>
// → state.history.lock().clear()
// → 写回磁盘
```

---

## 4. 传输引擎 (transfer/)

### engine.rs — TransferEngine

```rust
pub struct TransferEngine {
    active: HashMap<Uuid, FileTransferTask>,   // 正在进行中
    queue: VecDeque<QueuedTransfer>,            // 超并发数时排队
    progress_tx: mpsc::Sender<ProgressEvent>,
    cancel_tx: mpsc::Sender<Uuid>,              // 通知 sender/receiver task 取消
    config: TransferConfig,
}

pub struct TransferConfig {
    pub chunk_size: u32,
    pub max_retries: u32,
    pub ack_timeout: Duration,       // 默认 10s
    pub max_concurrent: usize,       // 默认 3
    pub verify_timeout: Duration,    // 默认 30s
}

pub struct QueuedTransfer {
    pub id: Uuid,
    pub peer: PeerHandle,
    pub files: Vec<FileMeta>,
    pub direction: Direction,
    pub save_dir: Option<PathBuf>,
    pub enqueued_at: Instant,
}

pub enum FileTransferTask {
    Send {
        id: Uuid,
        files: Vec<FileSendState>,
        peer: PeerHandle,
        handles: Vec<JoinHandle<Result<(), AppError>>>,
    },
    Receive {
        id: Uuid,
        files: Vec<FileRecvState>,
        peer: PeerHandle,
        handles: Vec<JoinHandle<Result<(), AppError>>>,
    },
}

pub enum PeerHandle {
    Lan { conn: Arc<DataChannel> },
    Relay { client: Arc<RelayClient>, peer_id: Uuid },
    Both { conn: Arc<DataChannel>, client: Arc<RelayClient>, peer_id: Uuid },
}

impl PeerHandle {
    /// 发送数据，优先走 LAN DataChannel，失败走 relay
    pub async fn send(&self, data: Bytes) -> Result<()> { ... }
    pub fn peer_id(&self) -> Uuid { ... }
}
```

**TransferEngine 方法：**

```rust
impl TransferEngine {
    /// 创建引擎，启动后台事件循环
    pub fn new(config: TransferConfig) -> (Self, mpsc::Receiver<ProgressEvent>);

    /// 启动发送：若并发未满立即开始，否则入队
    pub fn start_send(
        &mut self,
        peer: PeerHandle,
        files: Vec<FileMeta>,
    ) -> Result<Uuid, AppError>;
    // 1. 生成 transfer_id (Uuid v4)
    // 2. 若 active.len() < max_concurrent:
    //    创建 FileSendState → spawn sender tasks → 加入 active
    //    否则加入 queue (状态为 Queued)
    // 3. 返回 transfer_id

    /// 启动接收
    pub fn start_receive(
        &mut self,
        peer: PeerHandle,
        files: Vec<FileMeta>,
        save_dir: PathBuf,
    ) -> Result<Uuid, AppError>;
    // 同上，方向为 Receive

    /// 取消传输
    pub fn cancel(&mut self, transfer_id: &Uuid, delete_partial: bool) -> Result<(), AppError>;
    // 1. 尝试从 active 或 queue 取出
    // 2. 若 active: cancel_tx.send(transfer_id) → abort handles
    // 3. 若 delete_partial → 删除部分文件
    // 4. 检查 queue 是否有等待任务 → 调度一个出队

    /// 暂停传输（仅 active 中的任务）
    pub fn pause(&mut self, transfer_id: &Uuid) -> Result<(), AppError>;
    // 1. 设置状态为 Paused(User) 或 Paused(Network)
    // 2. 通知 sender/receiver task 暂停（通过 cancel_tx 发特殊信号）
    // 3. sender task 暂停发送循环，receiver task 暂停写入

    /// 恢复传输
    pub fn resume(&mut self, transfer_id: &Uuid) -> Result<(), AppError>;
    // 1. 设置状态为 Transferring
    // 2. 通知 task 恢复
    // 3. 若接收方，通过 peer 发送 chunk_request

    /// 获取快照
    pub fn active_transfers(&self) -> Vec<TransferState>;

    /// 完成回调
    pub fn on_file_complete(&mut self, transfer_id: &Uuid, file_id: &Uuid, result: Result<(), AppError>);
    // 1. 更新 FileState
    // 2. 若所有文件完成 → 移到 history
    // 3. 若有文件失败且达到 max_retries → 整个 transfer 标记 Failed
    // 4. 从 queue 调度下一个

    /// 从 queue 取出下一个传输并启动
    fn dequeue_and_start(&mut self);
}
```

**后台事件循环：**

```rust
// 在 lib.rs setup() 中启动
pub async fn event_loop(
    mut progress_rx: mpsc::Receiver<ProgressEvent>,
    app: AppHandle,
    history: Arc<Mutex<TransferHistory>>,
) {
    while let Some(event) = progress_rx.recv().await {
        match event {
            ProgressEvent::Progress { .. } => {
                app.emit("transfer:progress", &event).ok();
            }
            ProgressEvent::Complete { file_id, .. } => {
                // 检查 transfer 是否所有文件完成
                history.lock().add(TransferRecord { ... });
                history.lock().save();
                app.emit("transfer:complete", &event).ok();
            }
            ProgressEvent::BatchComplete { transfer_id } => {
                app.emit("transfer:batch_complete",
                    json!({"transfer_id": transfer_id})).ok();
            }
            ProgressEvent::Failed { file_id, error } => {
                app.emit("transfer:failed", &event).ok();
            }
            ProgressEvent::Paused { reason } => {
                app.emit("transfer:paused", json!({"reason": reason})).ok();
            }
            ProgressEvent::Resumed { .. } => {
                app.emit("transfer:resumed", &event).ok();
            }
            ProgressEvent::Cancelled { transfer_id, reason } => {
                app.emit("transfer:cancelled",
                    json!({"transfer_id": transfer_id, "reason": reason})).ok();
            }
            ProgressEvent::Queued { transfer_id, position } => {
                app.emit("transfer:queued",
                    json!({"transfer_id": transfer_id, "position": position})).ok();
            }
        }
    }
}
```

### sender.rs — FileSender

```rust
pub struct FileSender {
    transfer_id: Uuid,
    file_id: Uuid,
    meta: FileMeta,
    reader: tokio::fs::File,
    peer: PeerHandle,
    chunk_size: u32,
    progress_tx: mpsc::Sender<ProgressEvent>,
    cancel_rx: mpsc::Receiver<ControlSignal>,
    start_time: Instant,
    pause_flag: Arc<AtomicBool>,
}

enum ControlSignal {
    Cancel,
    Pause,
    Resume,
    ChunkRequest { missing: Vec<u32> },
}

impl FileSender {
    pub fn new(
        transfer_id: Uuid,
        file: FileMeta,
        path: &Path,
        peer: PeerHandle,
        chunk_size: u32,
        progress_tx: mpsc::Sender<ProgressEvent>,
        cancel_rx: mpsc::Receiver<ControlSignal>,
        pause_flag: Arc<AtomicBool>,
    ) -> Result<Self, AppError> {
        // 1. 打开文件 tokio::fs::File::open(path)
        // 2. 计算分片数
        // 3. 初始化 SHA256 上下文
        Ok(Self { ... })
    }

    /// 主循环（监听 cancel_rx + 逐分片发送）
    pub async fn run(mut self) -> Result<(), AppError> {
        self.send_header().await?;

        let total_chunks = (self.meta.size + self.chunk_size as u64 - 1) / self.chunk_size as u64;
        let mut emitted_progress = 0u64;
        let mut chunk_index = 0u64;

        // 处理断点续传（如果收到 chunk_request，从指定位置开始）
        // 同时监听控制信号

        loop {
            tokio::select! {
                // 控制信号优先
                Some(signal) = self.cancel_rx.recv() => {
                    match signal {
                        ControlSignal::Cancel => return Err(AppError::Cancelled("user cancelled".into())),
                        ControlSignal::Pause => {
                            self.pause_flag.store(true, Ordering::SeqCst);
                            // 等待 Resume 信号
                            self.wait_resume().await?;
                        }
                        ControlSignal::ChunkRequest { missing } => {
                            // 断点续传：从最小编号缺失分片开始
                            if let Some(&first) = missing.iter().min() {
                                chunk_index = first as u64;
                            }
                        }
                        _ => {}
                    }
                }
                // 正常发送流程
                _ = async {
                    if self.pause_flag.load(Ordering::SeqCst) {
                        tokio::time::sleep(Duration::from_millis(100)).await;
                        return;
                    }
                    if chunk_index >= total_chunks { return; }

                    let chunk_data = self.read_chunk(chunk_index).await.unwrap();
                    let wire = serialize_chunk(&Chunk {
                        file_id: self.file_id,
                        index: chunk_index as u32,
                        data: chunk_data.clone(),
                    });

                    self.send_with_retry(&wire, chunk_index as u32).await.unwrap();
                    self.hasher.update(&chunk_data);

                    let sent = (chunk_index + 1) * self.chunk_size as u64;
                    if sent - emitted_progress >= 65536 || chunk_index == total_chunks - 1 {
                        let speed = self.calculate_speed(sent);
                        self.progress_tx.send(ProgressEvent::Progress {
                            transfer_id: self.transfer_id,
                            file_id: self.file_id,
                            file_name: self.meta.name.clone(),
                            bytes_sent: sent.min(self.meta.size),
                            bytes_total: self.meta.size,
                            speed,
                        }).await.ok();
                        emitted_progress = sent;
                    }
                    chunk_index += 1;
                } => {}
            }

            if chunk_index >= total_chunks { break; }
        }

        // 发送 complete
        let checksum = hex::encode(self.hasher.finalize());
        self.peer.send(Bytes::from(
            serde_json::to_string(&PeerMessage::Complete {
                file_id: self.file_id,
                checksum: checksum.clone(),
            })?
        )).await?;

        self.progress_tx.send(ProgressEvent::Complete {
            transfer_id: self.transfer_id,
            file_id: self.file_id,
            file_name: self.meta.name.clone(),
        }).await.ok();

        Ok(())
    }

    async fn wait_resume(&mut self) -> Result<(), AppError> {
        loop {
            match self.cancel_rx.recv().await {
                Some(ControlSignal::Resume) => return Ok(()),
                Some(ControlSignal::Cancel) => return Err(AppError::Cancelled("paused then cancelled".into())),
                _ => continue,
            }
        }
    }

    async fn read_chunk(&mut self, index: u64) -> Result<Bytes, AppError> {
        let offset = index * self.chunk_size as u64;
        let size = self.chunk_size as usize;
        let mut buf = vec![0u8; size];
        let n = self.reader.read_at(&mut buf, offset).await?;
        buf.truncate(n);
        Ok(Bytes::from(buf))
    }

    async fn send_with_retry(&self, data: &[u8], chunk_index: u32) -> Result<(), AppError> {
        for attempt in 0..=MAX_RETRIES {
            self.peer.send(Bytes::copy_from_slice(data)).await?;

            match timeout(ACK_TIMEOUT, self.wait_ack(chunk_index)).await {
                Ok(Ok(_)) => return Ok(()),
                Ok(Err(e)) => return Err(e),
                Err(_) if attempt < MAX_RETRIES => continue,
                Err(_) => return Err(AppError::Timeout(format!("chunk {} 超时", chunk_index))),
            }
        }
        unreachable!()
    }

    fn calculate_speed(&self, bytes_sent: u64) -> f64 {
        let elapsed = self.start_time.elapsed().as_secs_f64();
        if elapsed > 0.0 { bytes_sent as f64 / elapsed } else { 0.0 }
    }
}
```

### receiver.rs — FileReceiver

```rust
pub struct FileReceiver {
    transfer_id: Uuid,
    file_id: Uuid,
    meta: FileMeta,
    writer: tokio::fs::File,
    peer: PeerHandle,
    chunk_size: u32,
    received_chunks: BitSet,        // 已收分片位图
    progress_tx: mpsc::Sender<ProgressEvent>,
    hasher: Sha256,
    start_time: Instant,
    total_received: u64,
}

impl FileReceiver {
    pub fn new(
        transfer_id: Uuid,
        file: FileMeta,
        save_path: PathBuf,
        peer: PeerHandle,
        chunk_size: u32,
        progress_tx: mpsc::Sender<ProgressEvent>,
    ) -> Result<Self, AppError> {
        // 1. 创建父目录（如有必要）
        // 2. 创建输出文件 tokio::fs::File::create(save_path)
        // 3. 预分配空间（可选）
        Ok(Self { ... })
    }

    /// 主循环
    pub async fn run(mut self) -> Result<(), AppError> {
        // 1. 等待接收 file_header（已由 engine 层处理，meta 已传入）
        // 2. 循环接收分片直到 complete
        loop {
            let raw = self.recv_message().await?;  // 从 peer recv

            let msg: PeerMessage = serde_json::from_slice(&raw)?;
            match msg {
                PeerMessage::Chunk(chunk) => {
                    self.write_chunk(chunk).await?;
                }
                PeerMessage::Complete { file_id, checksum } => {
                    // 校验 SHA256
                    let actual = hex::encode(self.hasher.finalize());
                    if actual != checksum {
                        return Err(AppError::ChecksumMismatch { expected: checksum, actual });
                    }
                    self.progress_tx.send(ProgressEvent::Complete {
                        transfer_id: self.transfer_id,
                        file_id: self.file_id,
                        file_name: self.meta.name.clone(),
                    }).await.ok();
                    return Ok(());
                }
                PeerMessage::Error { code, message } => {
                    return Err(AppError::PeerError(code, message));
                }
                _ => {}  // ignore other messages
            }
        }
    }

    async fn write_chunk(&mut self, chunk: Chunk) -> Result<(), AppError> {
        let offset = chunk.index as u64 * self.chunk_size as u64;
        self.writer.write_all_at(&chunk.data, offset).await?;

        self.hasher.update(&chunk.data);
        self.received_chunks.set(chunk.index as usize);
        self.total_received += chunk.data.len() as u64;

        // 发送 ACK
        let ack = serde_json::to_string(&PeerMessage::Ack {
            file_id: self.file_id,
            chunk_index: chunk.index,
        })?;
        self.peer.send(Bytes::from(ack)).await?;

        // 进度上报
        let speed = self.calculate_speed();
        self.progress_tx.send(ProgressEvent::Progress {
            transfer_id: self.transfer_id,
            file_id: self.file_id,
            file_name: self.meta.name.clone(),
            bytes_sent: self.total_received,
            bytes_total: self.meta.size,
            speed,
        }).await.ok();

        Ok(())
    }

    async fn recv_message(&mut self) -> Result<Bytes, AppError> {
        // 从 peer 读取消息（可能是 DataChannel 或 relay）
        // 先读 4 字节长度前缀，再读 payload
        // 在 engine 层封装
        todo!()
    }
}
```

### chunk.rs — 分片序列化

```rust
pub const CHUNK_HEADER_SIZE: usize = 24;  // 16 + 4 + 4

pub struct Chunk {
    pub file_id: Uuid,
    pub index: u32,
    pub data: Bytes,
}

/// 分片线格式：
/// [0..16)  file_id (16 bytes, big-endian UUID bytes)
/// [16..20) chunk_index (big-endian u32)
/// [20..24) payload_length (big-endian u32)
/// [24..)   payload
pub fn serialize_chunk(chunk: &Chunk) -> Vec<u8> {
    let mut buf = Vec::with_capacity(CHUNK_HEADER_SIZE + chunk.data.len());
    buf.extend_from_slice(chunk.file_id.as_bytes());      // 16 bytes
    buf.extend_from_slice(&chunk.index.to_be_bytes());    // 4 bytes
    buf.extend_from_slice(&(chunk.data.len() as u32).to_be_bytes());  // 4 bytes
    buf.extend_from_slice(&chunk.data);                   // payload
    buf
}

/// 解析分片，返回 None 表示数据不足
pub fn try_deserialize_chunk(data: &[u8]) -> Result<Option<Chunk>, AppError> {
    if data.len() < CHUNK_HEADER_SIZE {
        return Ok(None);  // 数据不完整
    }
    let file_id = Uuid::from_slice(&data[..16])?;
    let index = u32::from_be_bytes(data[16..20].try_into()?);
    let payload_len = u32::from_be_bytes(data[20..24].try_into()?) as usize;

    if data.len() < CHUNK_HEADER_SIZE + payload_len {
        return Ok(None);  // payload 还没到齐
    }

    Ok(Some(Chunk {
        file_id,
        index,
        data: Bytes::copy_from_slice(&data[24..24 + payload_len]),
    }))
}
```

---

## 5. 发现层 (discovery/)

### mdns.rs

```rust
pub struct MdnsDiscovery {
    daemon: Arc<Mdns>,
    device_id: Uuid,
    _service: ServiceInfo,
    found_tx: mpsc::Sender<DiscoveredEvent>,
    found_rx: mpsc::Receiver<DiscoveredEvent>,
}

pub enum DiscoveredEvent {
    Found(DeviceInfo),
    Lost(Uuid),
}

impl MdnsDiscovery {
    /// 启动 mDNS 注册 + 浏览
    pub async fn start(device_id: Uuid, device_name: String) -> Result<Self, AppError> {
        let daemon = Mdns::new()?;

        // 注册本机服务
        let service = ServiceInfo::new(
            "_rust-send._tcp",
            &device_name,
            &format!("{}.local", device_name),
            0,  // port 0 = 不监听 TCP，仅用于发现
            &["id=", &device_id.to_string(), "name=", &device_name],
        )?;
        daemon.register(service)?;

        // 浏览其他 _rust-send._tcp 服务
        let receiver = daemon.browse("_rust-send._tcp")?;
        let (tx, rx) = mpsc::channel(256);

        // 后台任务处理 mDNS 事件
        tokio::spawn(async move {
            while let Ok(Some(event)) = receiver.try_recv() {
                match event {
                    MdnsEvent::ServiceFound(info) => {
                        if let Some(dev) = Self::extract_device(&info) {
                            tx.send(DiscoveredEvent::Found(dev)).ok();
                        }
                    }
                    MdnsEvent::ServiceLost(info) => {
                        if let Some(id) = Self::extract_device_id(&info) {
                            tx.send(DiscoveredEvent::Lost(id)).ok();
                        }
                    }
                }
            }
        });

        Ok(Self { daemon, device_id, _service: service, found_tx: tx, found_rx: rx })
    }

    /// 更新设备名
    pub fn update_name(&self, new_name: &str) -> Result<(), AppError> {
        // 重新注册服务
        Ok(())
    }

    /// 获取当前发现的设备列表
    pub fn discovered_devices() -> Vec<DeviceInfo>;
    // 从内部 HashMap 获取（需要另一个 channel 或 Arc<RwLock<...>>）

    fn extract_device(info: &ServiceInfo) -> Option<DeviceInfo> {
        let id = info.get_property("id")?.parse().ok()?;
        let name = info.get_property("name")?.to_string();
        let addr = info.get_addresses().first().copied();
        Some(DeviceInfo { id, name, device_type: DeviceType::Desktop, addr, last_seen: Utc::now() })
    }
}
```

**在 lib.rs setup 中的用法：**

```rust
// 启动 mDNS
let (discovery, mut mdns_rx) = MdnsDiscovery::start(device_id, device_name).await?;

// 监听发现事件
let app_handle = app.handle().clone();
tokio::spawn(async move {
    while let Some(event) = mdns_rx.recv().await {
        match event {
            DiscoveredEvent::Found(device) => {
                app_handle.emit("device:discovered", &device).ok();
            }
            DiscoveredEvent::Lost(device_id) => {
                app_handle.emit("device:lost", serde_json::json!({"device_id": device_id})).ok();
            }
        }
    }
});
```

---

## 6. 中继层 (relay/)

### client.rs — RelayClient

```rust
pub struct RelayClient {
    ws: WebSocketStream<MaybeTlsStream<TcpStream>>,
    device_id: Uuid,
    event_tx: mpsc::Sender<RelayEvent>,
    write_tx: mpsc::UnboundedSender<String>,
}

pub enum RelayEvent {
    Connected,
    Disconnected,
    DeviceList(Vec<DeviceInfo>),
    Signal { source_id: Uuid, message: SignalingMessage },
    RelayData { source_id: Uuid, data: Bytes, sequence_id: Option<u32>, sequence_total: Option<u32> },
    TransferRequest { source_id: Uuid, source_name: String, files: Vec<FileMeta> },
    TransferResponse { target_id: Uuid, accepted: bool, conflict: Option<String> },
    Cancel { transfer_id: Uuid, reason: String },
    Pause { transfer_id: Uuid, reason: String },
    Resume { transfer_id: Uuid },
    BatchComplete { transfer_id: Uuid },
    ChunkRequest { transfer_id: Uuid, file_id: Uuid, missing_chunks: Vec<u32> },
    TransferInfoQuery { transfer_id: Uuid },
    TransferInfo { transfer_id: Uuid, direction: Direction, file_states: Vec<FileStateSummary> },
    PullRequest { source_id: Uuid, source_name: String, files: Vec<PullFileItem> },
    Error(String),
}

impl RelayClient {
    /// 连接中继服务器
    pub async fn connect(
        url: &str,
        device_id: Uuid,
        device_name: &str,
    ) -> Result<(Self, mpsc::Receiver<RelayEvent>), AppError> {
        let (ws, _) = tokio_tungstenite::connect_async(url).await?;
        let (write_tx, write_rx) = mpsc::unbounded_channel::<String>();
        let (event_tx, event_rx) = mpsc::channel::<RelayEvent>(256);

        // 发送 register 消息
        let register = serde_json::json!({
            "type": "register",
            "device_id": device_id,
            "device_name": device_name,
            "device_type": "desktop",
        });
        ws.send(Message::Text(register.to_string())).await?;

        let (ws_reader, ws_writer) = ws.split();

        // 写任务（含定时 heartbeat）
        let hb_tx = write_tx.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(15));
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        if hb_tx.send(r#"{"type":"ping"}"#.into()).is_err() {
                            break;
                        }
                    }
                    msg = write_rx.recv() => {
                        match msg {
                            Some(m) => {
                                if ws_writer.send(Message::Text(m.into())).await.is_err() {
                                    break;
                                }
                            }
                            None => break,
                        }
                    }
                }
            }
        });

        // 读任务
        let event_tx_clone = event_tx.clone();
        tokio::spawn(read_loop(ws_reader, event_tx_clone));

        Ok((Self { ws, device_id, event_tx, write_tx }, event_rx))
    }

    /// 发送信令消息到对端
    pub async fn send_signal(&self, target_id: Uuid, msg: SignalingMessage) -> Result<(), AppError> {
        let payload = serde_json::json!({
            "type": "signal",
            "target_id": target_id,
            "message": msg,
        });
        self.write_tx.send(payload.to_string()).map_err(|_| AppError::RelayDisconnected)?;
        Ok(())
    }

    /// 发送中继数据
    pub async fn send_relay_data(&self, target_id: Uuid, data: Bytes) -> Result<(), AppError> {
        let payload = serde_json::json!({
            "type": "relay_data",
            "target_id": target_id,
            "data": BASE64.encode(&data),
        });
        self.write_tx.send(payload.to_string())...;
        Ok(())
    }

    /// 发送传输请求
    pub async fn send_transfer_request(
        &self,
        target_id: Uuid,
        files: &[FileMeta],
    ) -> Result<(), AppError> {
        let payload = serde_json::json!({
            "type": "transfer_request",
            "target_id": target_id,
            "files": files,
        });
        self.write_tx.send(payload.to_string())...;
        Ok(())
    }

    pub async fn close(&self) -> Result<(), AppError> {
        self.ws.close(None).await?;
        Ok(())
    }
}

// 读循环
async fn read_loop(
    mut reader: SplitSink<WebSocketStream, Message>,
    event_tx: mpsc::Sender<RelayEvent>,
) {
    while let Some(msg) = reader.next().await {
        let msg = match msg {
            Ok(Message::Text(text)) => text,
            Ok(Message::Binary(_)) => continue,
            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => continue,
        };

        let parsed: serde_json::Value = match serde_json::from_str(&msg) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let event = match parsed["type"].as_str() {
            Some("pong") => continue,  // heartbeat reply, no action needed
            Some("device_list") => {
                let devices: Vec<DeviceInfo> = serde_json::from_value(parsed["devices"]).ok()?;
                RelayEvent::DeviceList(devices)
            }
            Some("signal") => {
                let source_id: Uuid = serde_json::from_value(parsed["source_id"]).ok()?;
                let message: SignalingMessage = serde_json::from_value(parsed["message"]).ok()?;
                RelayEvent::Signal { source_id, message }
            }
            Some("relay_data") => {
                let source_id: Uuid = serde_json::from_value(parsed["source_id"]).ok()?;
                let data = BASE64.decode(parsed["data"].as_str()?).ok()?;
                let sequence_id = parsed["sequence_id"].as_u64().map(|v| v as u32);
                let sequence_total = parsed["sequence_total"].as_u64().map(|v| v as u32);
                RelayEvent::RelayData { source_id, data: Bytes::from(data), sequence_id, sequence_total }
            }
            Some("transfer_request") => {
                let source_id: Uuid = serde_json::from_value(parsed["source_id"]).ok()?;
                let source_name = parsed["source_name"].as_str()?.to_string();
                let files: Vec<FileMeta> = serde_json::from_value(parsed["files"]).ok()?;
                RelayEvent::TransferRequest { source_id, source_name, files }
            }
            Some("transfer_response") | Some("transfer_accept") => {
                let target_id: Uuid = serde_json::from_value(parsed["target_id"]).ok()?;
                let accepted = parsed["type"] == "transfer_accept";
                let conflict = parsed["conflict"].as_str().map(String::from);
                RelayEvent::TransferResponse { target_id, accepted, conflict }
            }
            Some("cancel") => {
                let transfer_id: Uuid = serde_json::from_value(parsed["transfer_id"]).ok()?;
                let reason = parsed["reason"].as_str().unwrap_or("unknown").to_string();
                RelayEvent::Cancel { transfer_id, reason }
            }
            Some("pause") => {
                let transfer_id: Uuid = serde_json::from_value(parsed["transfer_id"]).ok()?;
                let reason = parsed["reason"].as_str().unwrap_or("user").to_string();
                RelayEvent::Pause { transfer_id, reason }
            }
            Some("resume") => {
                let transfer_id: Uuid = serde_json::from_value(parsed["transfer_id"]).ok()?;
                RelayEvent::Resume { transfer_id }
            }
            Some("batch_complete") => {
                let transfer_id: Uuid = serde_json::from_value(parsed["transfer_id"]).ok()?;
                RelayEvent::BatchComplete { transfer_id }
            }
            Some("chunk_request") => {
                let transfer_id: Uuid = serde_json::from_value(parsed["transfer_id"]).ok()?;
                let file_id: Uuid = serde_json::from_value(parsed["file_id"]).ok()?;
                let missing_chunks: Vec<u32> = serde_json::from_value(parsed["missing_chunks"]).ok()?;
                RelayEvent::ChunkRequest { transfer_id, file_id, missing_chunks }
            }
            Some("transfer_info_query") => {
                let transfer_id: Uuid = serde_json::from_value(parsed["transfer_id"]).ok()?;
                RelayEvent::TransferInfoQuery { transfer_id }
            }
            Some("pull_request") => {
                let source_id: Uuid = serde_json::from_value(parsed["source_id"]).ok()?;
                let source_name = parsed["source_name"].as_str()?.to_string();
                let files: Vec<PullFileItem> = serde_json::from_value(parsed["files"]).ok()?;
                RelayEvent::PullRequest { source_id, source_name, files }
            }
            _ => continue,
        };

        if event_tx.send(event).await.is_err() {
            break;
        }
    }
}
```

---

## 7. 中继服务器 (relay-server/)

### main.rs

```rust
#[tokio::main]
async fn main() {
    let state = Arc::new(AppState {
        room: RwLock::new(Room::new()),
    });

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .with_state(state);

    let listener = TcpListener::bind("0.0.0.0:8080").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    state: State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}
```

### ws.rs

```rust
pub struct WsSession {
    pub id: Uuid,                     // 会话 ID
    pub device_id: Uuid,              // 设备 ID
    pub device_name: String,
    pub sender: mpsc::UnboundedSender<Message>,
    pub joined_at: Instant,
}

pub async fn handle_socket(ws: WebSocketStream, state: Arc<AppState>) {
    let (ws_sender, mut ws_receiver) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // 等待 register 消息
    let device_info = match wait_register(&mut ws_receiver).await {
        Some(info) => info,
        None => return,
    };

    let session = WsSession {
        id: Uuid::new_v4(),
        device_id: device_info.id,
        device_name: device_info.name.clone(),
        sender: tx,
        joined_at: Instant::now(),
    };

    // 加入房间
    state.room.write().add(session.clone());
    broadcast_device_list(&state).await;

    // 读任务：处理收到的消息
    let read_state = state.clone();
    let read_session = session.clone();
    let read_handle = tokio::spawn(async move {
        while let Some(msg) = ws_receiver.next().await {
            let msg = match msg {
                Ok(Message::Text(text)) => text,
                Ok(Message::Close(_)) => break,
                _ => continue,
            };
            handle_message(&read_state, &read_session, &msg).await;
        }
    });

    // 写任务：将 tx 中的消息发往 WebSocket
    let write_handle = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    // 等待任一任务结束（连接断开）
    tokio::select! {
        _ = read_handle => {},
        _ = write_handle => {},
    }

    // 清理
    state.room.write().remove(&session.device_id);
    broadcast_device_list(&state).await;
}

async fn wait_register(ws: &mut SplitStream<...>) -> Option<DeviceInfo> {
    while let Some(msg) = ws.next().await {
        let text = msg.ok()?.into_text().ok()?;
        let parsed: serde_json::Value = serde_json::from_str(&text).ok()?;
        if parsed["type"] == "register" {
            return Some(DeviceInfo {
                id: serde_json::from_value(parsed["device_id"]).ok()?,
                name: parsed["device_name"].as_str()?.to_string(),
                device_type: ...,
            });
        }
    }
    None
}
```

### room.rs

```rust
pub struct Room {
    sessions: HashMap<Uuid, WsSession>,   // device_id → session
    device_names: HashMap<Uuid, String>,   // device_id → name
}

impl Room {
    pub fn new() -> Self;

    pub fn add(&mut self, session: WsSession);
    // 1. 若相同 device_id 已存在，先踢掉旧会话
    // 2. 插入新会话

    pub fn remove(&mut self, device_id: &Uuid);
    // → sessions.remove(device_id); device_names.remove(device_id);

    pub fn get(&self, device_id: &Uuid) -> Option<&WsSession>;
    // → sessions.get(device_id)

    pub fn all_devices(&self) -> Vec<DeviceInfo>;
    // → 遍历 sessions 组装 DeviceInfo 列表

    pub fn route(&self, target_id: &Uuid, message: &str) -> Result<(), AppError>;
    // 1. sessions.get(target_id)
    // 2. session.sender.send(Message::Text(message.to_string()))
    // 3. 若 send 失败(通道关闭) → 返回 DeviceOffline 错误
}
```

### relay.rs

```rust
/// 通用路由：将消息从 source 转发到 target_id
async fn route_to(state: &Arc<AppState>, source: &WsSession, target_id: &Uuid, msg: &serde_json::Value) {
    match state.room.read().route(target_id, &msg.to_string()) {
        Ok(_) => {}
        Err(_) => {
            let error = serde_json::json!({
                "type": "error",
                "code": "device_offline",
                "message": "目标设备离线"
            });
            let _ = source.sender.send(Message::Text(error.to_string()));
        }
    }
}

/// 处理各类消息的路由
pub async fn handle_message(
    state: &Arc<AppState>,
    source: &WsSession,
    parsed: &serde_json::Value,
) {
    let msg_type = match parsed["type"].as_str() {
        Some(t) => t,
        None => return,
    };

    // 不需要路由的消息
    match msg_type {
        "ping" => {
            let _ = source.sender.send(Message::Text(r#"{"type":"pong"}"#.into()));
            return;
        }
        "discover" => {
            let devices = state.room.read().all_devices();
            let resp = serde_json::json!({
                "type": "device_list",
                "devices": devices,
            });
            let _ = source.sender.send(Message::Text(resp.to_string()));
            return;
        }
        "register" => return,  // already handled in ws.rs
        _ => {}
    }

    // 需要路由的消息（都需要 target_id）
    let target_id: Uuid = match serde_json::from_value(parsed["target_id"].clone()) {
        Ok(id) => id,
        Err(_) => return,
    };

    // 构建转发消息，添加 source_id
    let mut forwarded = parsed.clone();
    forwarded["source_id"] = serde_json::json!(source.device_id);
    forwarded["source_name"] = serde_json::json!(source.device_name);

    route_to(state, source, &target_id, &forwarded).await;
}
```

---

## 8. 错误处理

```rust
// error.rs
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("WebSocket error: {0}")]
    Ws(#[from] tokio_tungstenite::tungstenite::Error),

    #[error("UUID error: {0}")]
    Uuid(#[from] uuid::Error),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("Checksum mismatch: expected {expected}, got {actual}")]
    ChecksumMismatch { expected: String, actual: String },

    #[error("Device offline: {0}")]
    DeviceOffline(String),

    #[error("Transfer cancelled: {0}")]
    Cancelled(String),

    #[error("Peer error: {code} - {message}")]
    PeerError(ErrorCode, String),

    #[error("Relay disconnected")]
    RelayDisconnected,

    #[error("Transfer not found: {0}")]
    TransferNotFound(Uuid),

    #[error("Disk full: {0}")]
    DiskFull(String),

    #[error("Max retries exhausted for {0}")]
    RetriesExhausted(String),

    #[error("Reconnection timeout")]
    ReconnectTimeout,

    #[error("Verification timeout")]
    VerifyTimeout,

    #[error("{0}")]
    Other(String),
}

/// 协议错误码枚举（与 protocol.md ErrorCode 一致）
pub enum ErrorCode {
    ChecksumMismatch,
    DiskFull,
    FileNotFound,
    PermissionDenied,
    Timeout,
    Cancelled,
    DeviceOffline,
    ProtocolError,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: Serializer {
        serializer.serialize_str(&self.to_string())
    }
}
```

---

## 9. 持久化

### config.rs

```rust
const CONFIG_FILE: &str = "config.json";

#[derive(Debug, Serialize, Deserialize)]
pub struct Config {
    pub device_id: Uuid,
    pub device_name: String,
    pub download_dir: PathBuf,
    pub chunk_size: u32,
    pub auto_accept_lan: bool,
    pub relay_url: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            device_id: Uuid::new_v4(),
            device_name: whoami::hostname(),
            download_dir: platform::get_downloads_dir().join("rust-send"),
            chunk_size: 65536,
            auto_accept_lan: false,
            relay_url: None,
        }
    }
}

pub fn load() -> Result<Config, AppError> {
    let path = platform::get_config_dir().join(CONFIG_FILE);
    if path.exists() {
        let content = std::fs::read_to_string(&path)?;
        Ok(serde_json::from_str(&content)?)
    } else {
        let config = Config::default();
        save(&config)?;
        Ok(config)
    }
}

pub fn save(config: &Config) -> Result<(), AppError> {
    let path = platform::get_config_dir().join(CONFIG_FILE);
    std::fs::create_dir_all(path.parent().unwrap())?;
    let content = serde_json::to_string_pretty(config)?;
    std::fs::write(&path, content)?;
    Ok(())
}
```

### history.rs

```rust
const HISTORY_FILE: &str = "history.json";

#[derive(Debug, Serialize, Deserialize)]
pub struct TransferHistory {
    pub records: Vec<TransferRecord>,
}

impl TransferHistory {
    pub fn load() -> Result<Self, AppError> {
        let path = platform::get_config_dir().join(HISTORY_FILE);
        if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            Ok(serde_json::from_str(&content)?)
        } else {
            Ok(Self { records: Vec::new() })
        }
    }

    pub fn save(&self) -> Result<(), AppError> {
        let path = platform::get_config_dir().join(HISTORY_FILE);
        std::fs::create_dir_all(path.parent().unwrap())?;
        let content = serde_json::to_string_pretty(&self)?;
        std::fs::write(&path, content)?;
        Ok(())
    }

    pub fn add(&mut self, record: TransferRecord) {
        self.records.push(record);
        // 最多保留 500 条
        if self.records.len() > 500 {
            self.records.remove(0);
        }
    }

    pub fn clear(&mut self) {
        self.records.clear();
    }
}
```

---

## 10. 完整数据流向图

```
┌─────────────────────────────────────────────────────────────┐
│ 发送端 (Tauri Desktop)           接收端 (Tauri Desktop)       │
│                                                                │
│  ┌──────────┐                    ┌──────────┐                  │
│  │ React UI  │                    │ React UI  │                  │
│  └────┬─────┘                    └────┬─────┘                  │
│       │ invoke("send_files")          │ listen("transfer:     │
│       ▼                               │   incoming")           │
│  ┌──────────────────┐                │                         │
│  │ commands/         │                │                         │
│  │ transfer.rs       │                │                         │
│  └────┬─────────────┘                │                         │
│       │ engine.start_send()          ▼                         │
│       ▼                      ┌──────────────────┐              │
│  ┌──────────────────┐       │ commands/         │              │
│  │ TransferEngine    │       │ transfer.rs       │              │
│  │ 管理并发传输       │       │ accept_transfer() │              │
│  └────┬─────────────┘       └────┬─────────────┘              │
│       │ spawn sender.run()       │ engine.start_receive()      │
│       ▼                          ▼                             │
│  ┌──────────────────┐       ┌──────────────────┐              │
│  │ FileSender        │       │ FileReceiver     │              │
│  │ · read_chunk()    │       │ · recv_chunk()   │              │
│  │ · send()          │       │ · write_chunk()  │              │
│  │ · wait_ack()      │       │ · send_ack()     │              │
│  └────┬─────────────┘       └────┬─────────────┘              │
│       │                          ▲                            │
│       │     WebRTC DataChannel   │                            │
│       │     (或 Relay 中继)       │                            │
│       └──────────┬───────────────┘                            │
│                  │                                             │
│                  ▼                                             │
│         ┌──────────────────┐                                  │
│         │   中继服务器       │                                  │
│         │   (relay-server)  │                                  │
│         │   · WebSocket     │                                  │
│         │   · 信令转发       │                                  │
│         │   · 数据中继       │                                  │
│         └──────────────────┘                                  │
│                                                                │
│  事件推送:                  事件推送:                           │
│  ┌────────────────┐       ┌────────────────┐                  │
│  │ progress_tx ──→│       │ progress_tx ──→│                  │
│  │ event_loop()   │       │ event_loop()   │                  │
│  │ ─→emit("progress")     │ ─→emit("progress")               │
│  │ ─→emit("complete")     │ ─→emit("complete")               │
│  └────────────────┘       └────────────────┘                  │
│                                                                │
│  持久化:                     持久化:                           │
│  config.json  ←→ storage/   config.json  ←→ storage/          │
│  history.json ←→ storage/   history.json ←→ storage/          │
└─────────────────────────────────────────────────────────────┘
```

## 11. 传输时序

```
发送方                         中继服务器                    接收方
 │                               │                           │
 │── register ──────────────────│                           │
 │                               │── register ──────────────│
 │── ping ───── 每 15s ────────│── ping ──────────────────│
 │◀── pong ────────────────────│◀── pong ─────────────────│
 │                               │                           │
 │── transfer_request ──────────│── transfer_request ──────│
 │  (target_id, files)          │  (source_id, files)       │
 │                               │                           │
 │                               │── transfer_accept ──────│
 │◀── transfer_accepted ────────│  (source_id, conflict)    │
 │                               │                           │
 │ ◀══════ WebRTC 协商 ═══════▶│                           │
 │  (offer/answer/ICE via relay) │                           │
 │                               │                           │
 │ ◀══════ DataChannel ═══════▶│                           │
 │   label: "file-transfer-{id}" │                           │
 │                               │                           │
 │── file_header ──────────────│── file_header ────────────│
 │  (含 relative_path)          │                           │
 │── chunk[0] ─────────────────│── chunk[0] ───────────────│
 │◀── ack[0] ─────────────────│◀── ack[0] ───────────────│
 │── chunk[1] ─────────────────│── chunk[1] ───────────────│
 │◀── ack[1] ─────────────────│◀── ack[1] ───────────────│
 │  ...                         │                           │
 │── complete ─────────────────│── complete ───────────────│
 │◀── complete_ack ────────────│◀── complete_ack ─────────│
 │                               │                           │
 │── batch_complete ───────────│── batch_complete ─────────│
 │  (多文件传输时)              │                           │
 │                               │                           │
 │ 暂停/恢复/取消:              │                           │
 │── pause ───────────────────│── pause ─────────────────│
 │── resume ──────────────────│── resume ────────────────│
 │── cancel ──────────────────│── cancel ────────────────│
 │                               │                           │
 │ 断点续传:                    │                           │
 │◀── chunk_request ──────────│◀── chunk_request ─────────│
 │── chunk[51] ───────────────│── chunk[51] ──────────────│
 │  ...                         │                           │
 │                               │                           │
 │ 拉取模式:                    │                           │
 │◀── pull_request ───────────│◀── pull_request ─────────│
 │── transfer_request ────────│── transfer_request ──────│
 │  (转为标准 Push 流程)       │                           │
 │                               │                           │
 │  (若无 DataChannel，全部走 relay_data)                    │
 │  relay_data 超 64KB 需分片 + sequence_id                 │
```

---

## 12. Cargo 依赖

### src-tauri/Cargo.toml

```toml
[dependencies]
tauri = { version = "2", features = ["dialog"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
sha2 = "0.10"
hex = "0.4"
anyhow = "1"
thiserror = "1"
bytes = "1"
mdns-sd = "0.12"
tokio-tungstenite = { version = "0.24", features = ["native-tls"] }
futures-util = "0.3"
whoami = "1"
base64 = "0.22"
bit-set = "0.8"

# webrtc-rs（如果实现 P2P 直连，否则仅用浏览器内置 WebRTC + relay 中继）
# webrtc = "0.11"  # P2P 直连需要，初期可暂缓引入
```

### relay-server/Cargo.toml

```toml
[dependencies]
axum = { version = "0.7", features = ["ws"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
tower-http = { version = "0.5", features = ["cors"] }
tracing = "0.1"
tracing-subscriber = "0.3"
futures-util = "0.3"
base64 = "0.22"
chrono = { version = "0.4", features = ["serde"] }
```

---

## 13. 与前端的数据类型对照

| Rust 类型 | TypeScript 类型 | JSON 字段命名 |
|-----------|----------------|---------------|
| DeviceInfo | DeviceInfo | snake_case → camelCase |
| FileMeta | FileMeta | 同上 |
| TransferState | TransferState | 同上 |
| TransferRecord | TransferRecord | 同上 |
| ProgressEvent | (Tauri event payload) | 同上 |
| AppError | string | 序列化为错误字符串 |

前后端通过 `#[tauri::command]` 的 JSON 序列化自动互转，Tauri 在 2.x 使用 `serde` 的 `rename_all = "camelCase"`（通过 `#[tauri::command(rename_all = "camelCase")]`）。
