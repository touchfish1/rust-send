# rust-send

跨平台（macOS / Linux / Windows）文件传输工具，提供桌面端（Tauri）与 Web 端。

## 文档索引

| 文档 | v2 更新内容 |
|------|---------------|
| [roadmap.md](./roadmap.md) | **当前有效路线图:** 产品目标、当前状态、`v0.2.0` 里程碑、优先级、决策记录、协作约定；后续计划默认维护在这里 |
| [protocol.md](./protocol.md) | **协议补全:** +heartbeat/cancel/pause/resume/chunk_request/batch_complete/pull_request; 错误码枚举; relay_data 分片限 64KB; 目录传输 + relative_path; 文件冲突策略（rename/overwrite/skip） |
| [api.md](./api.md) | **新增命令:** pause_transfer/resume_transfer; **新增事件:** batch_complete/resumed/cancelled/queued/reconnecting/pull:request; TransferStatus 增加 Queued/Verifying/Expired + PauseReason |
| [backend.md](./backend.md) | **TransferEngine:** +queue/Concurrent limit/pause/resume; **FileSender:** +cancel_rx/ControlSignal/tokio::select!; **RelayClient:** +heartbeat/新消息类型; **AppError:** +DiskFull/RetriesExhausted/ReconnectTimeout/VerifyTimeout |
| [pages.md](./pages.md) | **ReceiveConfirmDialog:** +冲突策略选择; **ConfirmDialog:** +删除部分文件选项; **TransferCard:** 状态映射表覆盖 11 种状态 |
| [diagrams.md](./diagrams.md) | **状态机:** 增加 Queued/Reconnecting/Paused 细分/Expired/Verifying 超时; **时序图:** 增加暂停/恢复/取消/chunk_request续传/batch_complete |
| [task-plan.md](./task-plan.md) | **历史实施计划:** 早期完整任务拆解与阶段依赖，适合作为背景参考，不再作为当前主计划入口 |
| [aesthetics.md](./aesthetics.md) | **中国水墨风格**: 色彩系统（宣纸/墨/朱砂/青绿/赭石）、字体层级、布局间距、圆角边框、阴影、图标、动画、Logo、shadcn HSL 覆盖 |
| [release.md](./release.md) | GitHub Actions 自动打包 Windows / macOS / Linux，并生成 GitHub Release 草稿 |
| [architecture.md](./architecture.md) | 技术栈、项目结构、架构图 |
| [components.md](./components.md) | 前端技术栈、shadcn 组件清单、设计系统 |
