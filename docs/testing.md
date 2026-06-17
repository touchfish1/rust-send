# 测试说明

本项目目前采用“前端单元测试 + 前端构建校验 + Rust 工作区测试 + GitHub Actions 持续集成”的基础质量策略。

## 1. 测试目标

- 尽早发现前端状态管理、页面渲染和工具函数回归
- 保证桌面端 Rust 逻辑与 relay-server 在提交前后都可被持续验证
- 让每次 push 和 pull request 都自动触发测试，减少人工漏检

## 2. 当前覆盖范围

### 前端单元测试

位置：`src/__tests__/`

当前重点覆盖：

- UI 基础组件：`Button`、`Card`
- 工具函数：`utils`、`pairing`
- Store 状态：`settings-store`、`device-store`、`transfer-store`、`update-store`
- 传输数据归一化：`transfer-normalize`
- 关键导航呈现：`Sidebar`

### Rust 工作区测试

命令：

```bash
cargo test --workspace
```

覆盖范围目前以：

- `src-tauri` 内部单元测试
- `relay-server` 的编译与测试校验

为主。后续建议继续补充 relay 事件处理、历史记录持久化、传输状态机相关测试。

## 3. 本地运行方式

### 前端

运行全部前端测试：

```bash
npm test
```

只看覆盖率：

```bash
npm run test:coverage
```

执行 CI 风格前端校验：

```bash
npm run test:ci
```

### Rust

运行 Rust 工作区测试：

```bash
cargo test --workspace
```

做一次工作区构建校验：

```bash
cargo build --workspace
```

## 4. GitHub Actions

仓库已增加测试工作流：

- 文件：`.github/workflows/ci.yml`
- 触发时机：
  - `push`
  - `pull_request`
  - `workflow_dispatch`

### CI 当前执行内容

前端作业：

- `npm ci`
- `npm test`
- `npm run build`

Rust 作业：

- 安装 Linux 所需系统依赖
- `cargo test --workspace`
- `cargo build --workspace`

## 5. 后续建议

建议继续补的测试方向：

- `useTransferEvents` 与 `useDeviceEvents` 的事件驱动测试
- `TransferPage` / `ChatPage` 的交互级渲染测试
- Relay 客户端解析与错误分支测试
- 历史记录持久化的 Rust 单元测试
- 关键 E2E 冒烟测试（后续可考虑 Playwright）
