# 流程图与交互图

## 1. 系统架构图

```mermaid
graph TB
    subgraph "发送端 (Tauri Desktop)"
        A1["React UI<br/>(WebView)"] <-->|IPC invoke/event| A2["Rust 后端<br/>(Commands + Engine)"]
        A2 --> A3["mDNS 发现"]
        A2 --> A4["WebRTC DataChannel"]
        A2 --> A5["Relay Client<br/>(WebSocket)"]
    end

    subgraph "接收端 (Tauri Desktop / Web)"
        B1["React UI<br/>(WebView)"] <-->|IPC invoke/event| B2["Rust 后端<br/>(Commands + Engine)"]
        B2 --> B3["mDNS 发现"]
        B2 --> B4["WebRTC DataChannel"]
        B2 --> B5["Relay Client<br/>(WebSocket)"]
    end

    subgraph "中继服务器"
        C1["axum WebSocket 服务"]
        C2["Room 管理"]
        C3["信令转发"]
        C4["数据中继"]
        C1 --> C2
        C1 --> C3
        C1 --> C4
    end

    subgraph "网络层"
        D1["LAN (mDNS + P2P)"]
        D2["WAN (WebRTC STUN)"]
        D3["中继 (Relay Server)"]
    end

    A3 -.->|_rust-send._tcp| D1
    B3 -.->|_rust-send._tcp| D1
    A4 -.->|直连| D1
    A4 -.->|打洞| D2
    B4 -.->|直连| D1
    B4 -.->|打洞| D2
    A5 <-->|wss://| C1
    B5 <-->|wss://| C1
    C1 <--> D3
```

---

## 2. 应用启动流程

```mermaid
flowchart TD
    Start(["应用启动"]) --> LoadConfig["加载 config.json"]

    LoadConfig --> ConfigExists{"文件存在?"}
    ConfigExists -->|是| Parse["解析配置"]
    ConfigExists -->|否| Default["创建默认配置<br/>· device_id = UUID v4<br/>· device_name = hostname<br/>· download_dir = ~/Downloads/rust-send<br/>· chunk_size = 64KB"]

    Parse --> Init["初始化 AppState"]
    Default --> Init

    Init --> Engine["创建 TransferEngine<br/>· 配置分片大小<br/>· 配置超时/重试参数<br/>· 启动 progress 事件通道"]
    Engine --> MDNS["启动 mDNS<br/>· 注册 _rust-send._tcp<br/>· 开始浏览其他设备"]

    MDNS --> Relay{"配置了 relay_url?"}
    Relay -->|是| Connect["连接中继服务器<br/>· WebSocket 握手<br/>· 发送 register 消息<br/>· 监听信令事件"]
    Relay -->|否| Skip["跳过中继连接"]

    Connect --> Register["注册 Tauri IPC 命令<br/>· device: get/set_name, get_info<br/>· file: pick, get_meta<br/>· transfer: send, accept, cancel"]

    Connect --> Hb["启动心跳<br/>每 15s 发送 ping<br/>60s 无响应自动重连"]
    Hb --> Register

    Skip --> Register

    Register --> EventLoop["启动后台事件循环<br/>· 监听 ProgressEvent<br/>· 转发为 Tauri event<br/>· 自动保存 history"]

    EventLoop --> Ready["应用就绪<br/>发送 connection:state 事件"]

    Ready --> UI["前端渲染 WelcomePage<br/>· 显示 QR 码<br/>· 显示设备列表<br/>· 监听设备发现"]
```

---

## 3. 设备发现流程

```mermaid
sequenceDiagram
    participant App as 本机 App
    participant MDNS as mDNS 服务
    participant Peer as 对端设备
    participant Relay as 中继服务器
    participant Frontend as 前端 UI

    Note over App: 启动时自动开始

    %% LAN 发现
    App->>MDNS: 注册 _rust-send._tcp<br/>(TXT: id + name)
    App->>MDNS: 浏览 _rust-send._tcp

    alt 局域网设备上线
        Peer->>MDNS: 注册服务
        MDNS-->>App: ServiceFound
        App->>App: 提取 DeviceInfo
        App->>Frontend: emit("device:discovered")
        Frontend->>Frontend: 设备列表新增条目
    end

    alt 局域网设备离线
        MDNS-->>App: ServiceLost
        App->>Frontend: emit("device:lost", {device_id})
        Frontend->>Frontend: 设备列表移除条目
    end

    %% 中继发现
    alt 已连接中继
        App->>Relay: WebSocket connect
        Relay-->>App: connected
        App->>Relay: {"type":"register", device_id, name}
        Relay->>Relay: Room.add(session)
        Relay-->>App: {"type":"registered"}
        Relay-->>App: {"type":"device_list", devices:[...]}
        App->>Frontend: emit("device:discovered") × N
        Frontend->>Frontend: 合并中继设备到列表

        Note over App,Relay: 后续设备上线/离线均主动推送
        Relay-->>App: {"type":"device_list", devices:[...]}
    end
```

---

## 4. 发送文件完整时序

```mermaid
sequenceDiagram
    participant SenderUI as 发送方 UI
    participant Sender as 发送方 Rust
    participant Relay as 中继服务器
    participant Receiver as 接收方 Rust
    participant ReceiverUI as 接收方 UI

    SenderUI->>Sender: invoke("send_files", targetId, paths)

    Sender->>Sender: 读取 FileMeta<br/>创建 TransferEngine
    Sender->>Relay: {"type":"transfer_request", target_id, files}

    Relay->>Receiver: {"type":"transfer_request", source_id, source_name, files}
    Receiver->>ReceiverUI: emit("transfer:incoming")
    ReceiverUI->>ReceiverUI: 弹出 ReceiveConfirmDialog

    alt 用户接受
        ReceiverUI->>Receiver: invoke("accept_transfer", sourceId, saveDir, conflict:"rename")
        Receiver->>Relay: {"type":"transfer_accept", target_id, conflict:"rename"}
        Relay->>Sender: {"type":"transfer_accepted", target_id, conflict:"rename"}

        Note over Sender,Receiver: WebRTC 连接协商
        Sender->>Relay: {"type":"offer", target_id, sdp}
        Relay->>Receiver: {"type":"offer", source_id, sdp}
        Receiver->>Relay: {"type":"answer", source_id, sdp}
        Relay->>Sender: {"type":"answer", target_id, sdp}
        Sender->>Relay: {"type":"ice_candidate", target_id, candidate}
        Relay->>Receiver: {"type":"ice_candidate", source_id, candidate}
        Receiver->>Relay: {"type":"ice_candidate", source_id, candidate}
        Relay->>Sender: {"type":"ice_candidate", target_id, candidate}

        Note over Sender,Receiver: DataChannel "file-transfer-{id}" 建立

        Sender->>Sender: 分片读取文件
        Sender->>Receiver: file_header (JSON, 含 relative_path)
        Receiver->>Receiver: 处理文件名冲突（rename/overwrite/skip）
        Receiver->>Receiver: 创建输出文件

        loop 逐分片发送
            Sender->>Sender: read_chunk(index)
            Sender->>Receiver: [24B header + payload]
            alt 中继模式
                Sender->>Relay: {"type":"relay_data", target_id, base64(data≤64KB)}
                Relay->>Receiver: {"type":"relay_data", source_id, data}
            end
            Receiver->>Receiver: write_chunk(index)
            Receiver->>Sender: ack (JSON)
            alt 超时重试
                Note over Sender: 10s 无 ACK → 重发(最多3次)
            end
            par 进度上报
                Sender->>SenderUI: emit("transfer:progress")
                Receiver->>ReceiverUI: emit("transfer:progress")
            end
        end

        Note over Sender,Receiver: 传输过程中可暂停/恢复/取消
        alt 用户暂停
            Sender->>Relay: {"type":"pause", target_id, transfer_id, reason:"user"}
            Relay->>Receiver: {"type":"pause", source_id, transfer_id, reason:"user"}
            Note over Sender,Receiver: 暂停后保留进度
            Receiver->>Relay: {"type":"resume", target_id, transfer_id}
            Relay->>Sender: {"type":"resume", source_id, transfer_id}
            Note over Sender,Receiver: 恢复后接收方发送 chunk_request
            Receiver->>Sender: {"type":"chunk_request", transfer_id, file_id, missing_chunks}
            Sender->>Sender: 从缺失分片继续发送
        end

        alt 用户取消
            Receiver->>Relay: {"type":"cancel", target_id, transfer_id, reason:"user_cancelled"}
            Relay->>Sender: {"type":"cancel", source_id, transfer_id, reason:"user_cancelled"}
            Note over Sender,Receiver: 取消后清理部分文件
        end

        Sender->>Sender: SHA256 校验
        Sender->>Receiver: {"type":"complete", file_id, checksum}
        Receiver->>Receiver: 验证 checksum

        alt 校验通过
            Receiver->>Sender: {"type":"complete_ack"}
            Sender->>SenderUI: emit("transfer:complete")
            Receiver->>ReceiverUI: emit("transfer:complete")
            Receiver->>Receiver: 保存到 history
            Note over Sender,Receiver: 多文件传输全部完成后
            Sender->>Receiver: {"type":"batch_complete", transfer_id}
            Receiver->>ReceiverUI: emit("transfer:batch_complete")
        else 校验失败
            Receiver->>Sender: {"type":"error", "checksum_mismatch"}
            Sender->>SenderUI: emit("transfer:failed", "校验不匹配")
        end

    else 用户拒绝
        ReceiverUI->>Receiver: invoke("reject_transfer", sourceId)
        Receiver->>Relay: {"type":"transfer_response", accepted:false}
        Relay->>Sender: {"type":"transfer_rejected"}
        Sender->>SenderUI: emit("transfer:failed", "对方已拒绝")
    end
```

---

## 5. 传输状态机

```mermaid
stateDiagram-v2
    [*] --> Idle: 启动完成

    Idle --> Queued: 并发已满，入队等待
    Idle --> Transferring: send_files / accept_transfer
    Idle --> Incoming: 收到 transfer_request

    Queued --> Transferring: 前一个传输完成，自动出队

    Incoming --> Transferring: 用户接受
    Incoming --> Rejected: 用户拒绝
    Incoming --> Expired: 60s 无操作，自动拒绝

    Transferring --> Paused_User: 用户手动暂停
    Transferring --> Paused_Network: 网络断开
    Transferring --> Paused_DiskFull: 磁盘空间不足
    Transferring --> Completed: 所有分片收齐
    Transferring --> Failed: 重试耗尽 / 校验失败
    Transferring --> Cancelled: 用户取消
    Transferring --> Reconnecting: 连接断开，自动重连

    Reconnecting --> Transferring: 重连成功，发送 chunk_request 续传
    Reconnecting --> Failed: 30s 重连超时

    Paused_User --> Transferring: 用户续传
    Paused_Network --> Reconnecting: 网络恢复，尝试重连
    Paused_DiskFull --> Paused_User: 磁盘空间释放后用户手动恢复
    Paused_User --> Cancelled: 用户取消

    Completed --> Verifying: 校验 SHA256

    Verifying --> Completed_Verified: 校验通过
    Verifying --> Failed: 校验不匹配 / 30s 超时

    Completed_Verified --> [*]: 自动移入历史
    Failed --> Transferring: 用户重试 (最多 3 次)
    Failed --> [*]: 重试耗尽，移入历史
    Cancelled --> [*]: 移入历史（可选删除部分文件）
    Rejected --> [*]
    Expired --> [*]: 24h TTL 后清理

    note right of Verifying
        计算已收分片的
        SHA256 哈希值
        超时 30s → Failed
    end note

    note right of Transferring
        逐分片发送 → 等待 ACK
        超时 10s → 重试(最多 3 次)
    end note

    note right of Reconnecting
        重连期间保持传输状态
        重连后 chunk_request 续传
    end note
```

---

## 6. 前后端数据流

```mermaid
flowchart LR
    subgraph Frontend ["前端 (React + TypeScript)"]
        UI["React 组件"]
        Store["Zustand Store"]
        Hook["useTauriEvent / useInvoke"]
    end

    subgraph IPC ["Tauri IPC 桥"]
        Cmd["invoke(command, args)"]
        Evt["事件监听"]
    end

    subgraph Backend ["后端 (Rust)"]
        CmdHandler["commands/<br/>device.rs / file.rs / transfer.rs"]
        Engine["TransferEngine"]
        Sender["FileSender"]
        Receiver["FileReceiver"]
        Disc["MdnsDiscovery"]
        Relay["RelayClient"]
        Progress["Progress Event Loop"]
        Storage["config.json<br/>history.json"]
    end

    subgraph Network ["网络"]
        MDNS["mDNS 局域网"]
        WS["WebSocket 中继"]
        RTC["WebRTC DataChannel"]
    end

    %% 前端 IPC 交互
    UI -->|"用户点击发送"| Store
    Store -->|"invoke('send_files')"| Cmd
    Cmd --> CmdHandler

    %% 后端命令处理
    CmdHandler --> Engine
    Engine --> Sender
    Sender --> RTC

    CmdHandler --> Relay
    Relay --> WS

    %% 发现流程
    Disc --> MDNS
    Disc -->|"emit 'device:discovered'"| Evt

    %% 事件回传
    Sender -->|"ProgressEvent"| Progress
    Receiver -->|"ProgressEvent"| Progress
    Progress -->|"app.emit()"| Evt

    %% 前端接收事件
    Evt --> Hook
    Hook --> Store
    Store --> UI

    %% 持久化
    Progress --> Storage
    CmdHandler --> Storage

    %% 接收流程
    RTC --> Receiver
    WS --> Relay
    Relay --> Receiver

    %% 样式
    classDef frontend fill:#e1f5fe,stroke:#0288d1
    classDef ipc fill:#fff3e0,stroke:#f57c00
    classDef backend fill:#e8f5e9,stroke:#388e3c
    classDef network fill:#fce4ec,stroke:#c62828,stroke-dasharray: 5 5

    class UI,Store,Hook frontend
    class Cmd,Evt ipc
    class CmdHandler,Engine,Sender,Receiver,Disc,Relay,Progress,Storage backend
    class MDNS,WS,RTC network
```

---

## 7. 分片发送内部流程

```mermaid
flowchart TD
    Start(["FileSender::run()"]) --> Header["序列化 FileHeader JSON"]
    Header --> SendHeader["通过 DataChannel 发送"]

    SendHeader --> Loop{"还有分片?"}

    Loop -->|是| Read["reader.read_at(offset)<br/>从文件读取 chunk_size 字节"]
    Read --> Serialize["serialize_chunk()<br/>[16B UUID][4B index][4B len][payload]"]

    Serialize --> Send["peer.send(bytes)"]
    Send --> Wait["等待 ACK<br/>timeout = 10s"]

    Wait --> Ack{"收到 ACK?"}

    Ack -->|是, chunk_index 匹配| UpdateHasher["hasher.update(data)"]
    UpdateHasher --> Report{"达到上报阈值?<br/>(每 64KB 或 1%)"}
    Report -->|是| Emit["progress_tx.send(ProgressEvent::Progress)<br/>含 speed 计算"]
    Emit --> Next["chunk_index++"]
    Report -->|否| Next
    Next --> Loop

    Ack -->|否, 超时| Retry{"重试次数 < 3?"}
    Retry -->|是| Send
    Retry -->|否| FailRetry["返回 Timeout 错误"]

    Loop -->|否| Complete["发送 'complete' 消息<br/>含 SHA256"]
    Complete --> Verify["等待对端 complete_ack"]
    Verify --> Done["发送 ProgressEvent::Complete"]

    FailRetry --> Fail["发送 ProgressEvent::Failed"]

    style Start fill:#e8f5e9,stroke:#388e3c
    style Done fill:#e8f5e9,stroke:#388e3c
    style Fail fill:#ffebee,stroke:#c62828
```

---

## 8. 中继服务器消息处理

```mermaid
flowchart TD
    Client1["发送端 WebSocket"] --> Server["axum /ws 路由"]
    Client2["接收端 WebSocket"] --> Server

    Server --> Upgrade["WebSocket 升级"]
    Upgrade --> WaitReg["等待 'register' 消息"]

    WaitReg --> Register["提取 device_id + device_name"]
    Register --> AddRoom["Room.add(session)"]
    AddRoom --> Broadcast["广播更新后的 device_list<br/>给所有已连接客户端"]
    Broadcast --> Loop["消息处理循环"]

    Loop --> Msg{"消息类型?"}

    Msg -->|ping| Pong["回复 pong"]
    Msg -->|discover| DL["返回全部设备列表"]

    Msg -->|signal / transfer_request / transfer_response| Route["解析 target_id<br/>添加 source_id"]
    Msg -->|relay_data| Relay["解析 target_id + data<br/>(支持 sequence_id 合并)"]
    Relay --> Route

    Msg -->|cancel| Cancel["转发 cancel<br/>含 transfer_id + reason"]
    Cancel --> Route

    Msg -->|pause| Pause["转发 pause<br/>含 transfer_id + reason"]
    Pause --> Route

    Msg -->|resume| Resume["转发 resume<br/>含 transfer_id"]
    Resume --> Route

    Msg -->|batch_complete| BC["转发 batch_complete<br/>含 transfer_id"]
    BC --> Route

    Msg -->|chunk_request| CReq["转发 chunk_request<br/>含 missing_chunks"]
    CReq --> Route

    Msg -->|transfer_info_query| TI["转发 transfer_info_query"]
    TI --> Route

    Msg -->|pull_request| PR["转发 pull_request<br/>含 files 列表"]
    PR --> Route

    Route --> Success{"目标在线?"}
    Success -->|是| Forward["发送到目标 WebSocket"]
    Success -->|否| ErrBack["回送错误给发送方"]

    Msg -->|其他| Ignore["忽略"]

    Client2 -->|断开| Remove["Room.remove(device_id)"]
    Remove --> Broadcast2["广播更新后的 device_list"]
```

---

## 9. 组件交互图（前端）

```mermaid
flowchart TB
    subgraph "页面层"
        WP["WelcomePage"]
        CP["ChatPage"]
        TP["TransferPage"]
        SP["SettingsPage"]
    end

    subgraph "共享组件"
        DL["DeviceList (Sidebar)"]
        CB["ConnectionBadge"]
        RC["ReceiveConfirmDialog"]
        CD["ConfirmDialog"]
        Toast["Toast 通知"]
    end

    subgraph "Store 层"
        DS["DeviceStore"]
        TS["TransferStore"]
        SS["SettingsStore"]
    end

    subgraph "Tauri 桥"
        Invoke["invoke()"]
        Events["事件监听"]
    end

    subgraph "后端"
        Rust["Rust Backend"]
    end

    %% 页面 ←→ Store
    WP --> DS
    CP --> DS
    CP --> TS
    TP --> TS
    SP --> SS

    %% Store → 共享组件
    DS --> DL
    DS --> CB
    TS --> RC
    TS --> CD
    TS --> Toast

    %% Store → Tauri
    SS --> Invoke
    DS --> Invoke
    TS --> Invoke

    Invoke --> Rust
    Rust --> Events
    Events --> DS
    Events --> TS
    Events --> Toast

    %% 交互标注
    DL -->|"点击设备"| CP
    DL -->|"点击导航"| TP
    DL -->|"点击设置"| SP
    RC -->|"接受/拒绝"| TS
    CD -->|"确认"| TS

    classDef page fill:#e3f2fd,stroke:#1565c0
    classDef component fill:#f3e5f5,stroke:#7b1fa2
    classDef store fill:#fff3e0,stroke:#e65100
    classDef bridge fill:#e8f5e9,stroke:#2e7d32
    classDef backend fill:#fce4ec,stroke:#c62828

    class WP,CP,TP,SP page
    class DL,CB,RC,CD,Toast component
    class DS,TS,SS store
    class Invoke,Events bridge
    class Rust backend
```

---

## 10. 文件生命周期

```mermaid
flowchart LR
    Pick["用户选择文件<br/>pick_file()"] --> Meta["获取元信息<br/>get_file_meta()"]
    Meta --> Preview["前端预览<br/>FilePreview 组件"]
    Preview --> Send["调用 send_files"]

    Send --> Chunking["分片读取<br/>read_chunk(index)"]
    Chunking --> Network["网络传输<br/>DataChannel / Relay"]
    Network --> Ack["等待 ACK"]

    Ack -->|成功| Next["下一分片"]
    Ack -->|超时| Retry["重试(×3)"]
    Retry -->|失败| Fail["传输失败"]

    Next -->|所有分片完成| Checksum["SHA256 校验"]
    Checksum -->|匹配| Complete["传输完成"]
    Checksum -->|不匹配| Fail

    Complete --> History["记录到 history.json"]
    Complete --> Notify["Toast 通知用户"]

    Fail --> History2["记录失败状态"]
    Fail --> Notify2["失败通知"]

    style Pick fill:#e8f5e9
    style Complete fill:#e8f5e9
    style Fail fill:#ffebee
```

---

## 11. 项目文件结构概览

```mermaid
graph TD
    Root["rust-send/"] --> Src["src/ (React 前端)"]
    Root --> Tauri["src-tauri/ (Rust 后端)"]
    Root --> Relay["relay-server/ (中继服务器)"]
    Root --> Web["web/ (Web 端入口)"]
    Root --> Docs["docs/ (设计文档)"]

    Src --> Comp["components/"]
    Src --> Pages["pages/"]
    Src --> Stores["stores/"]
    Src --> Lib["lib/"]

    Tauri --> Cmds["commands/"]
    Tauri --> Core["core/"]
    Tauri --> Transfer["transfer/"]
    Tauri --> Disc2["discovery/"]
    Tauri --> Relay2["relay/"]
    Tauri --> Plat["platform/"]

    Relay --> WS["ws.rs"]
    Relay --> Room["room.rs"]
    Relay --> Main["main.rs"]

    Docs --> Arch["architecture.md"]
    Docs --> Proto["protocol.md"]
    Docs --> API["api.md"]
    Docs --> CompDoc["components.md"]
    Docs --> PagesDoc["pages.md"]
    Docs --> BackendDoc["backend.md"]
    Docs --> Diagrams["diagrams.md"]

    style Root fill:#37474f,color:#fff
    style Src fill:#e3f2fd
    style Tauri fill:#e8f5e9
    style Relay fill:#fce4ec
    style Docs fill:#fff3e0
```

---

## 附录：流程图索引

| 图号 | 名称 | 用途 |
|------|------|------|
| 1 | 系统架构图 | 整体组件关系、网络层级 |
| 2 | 应用启动流程 | AppState 初始化顺序 |
| 3 | 设备发现流程 | LAN + Relay 两种发现机制 |
| 4 | 发送文件完整时序 | 信令 → WebRTC → 分片 → 完成的全部交互 |
| 5 | 传输状态机 | 传输生命周期的状态迁移 |
| 6 | 前后端数据流 | 数据如何在 React → IPC → Rust → Network 间流动 |
| 7 | 分片发送内部流程 | FileSender 的逐分片处理细节 |
| 8 | 中继服务器消息处理 | Relay Server 的消息路由逻辑 |
| 9 | 组件交互图 | 前端页面/组件/Store 间的关系 |
| 10 | 文件生命周期 | 从选择文件到传输完成的完整路径 |
| 11 | 项目文件结构 | 代码目录结构 |
