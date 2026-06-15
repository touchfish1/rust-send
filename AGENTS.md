# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the React + Vite frontend: route pages in `src/pages/`, reusable UI in `src/components/`, Zustand stores in `src/stores/`, hooks in `src/hooks/`, and Vitest files in `src/__tests__/`. The Tauri desktop backend lives in `src-tauri/src/` with modules for `commands/`, `transfer/`, `discovery/`, `storage/`, and `relay/`. `relay-server/` is a separate Rust binary for websocket relay support. Reference material and protocol notes are in `docs/`.

## Build, Test, and Development Commands
Use `npm run dev` for the web UI and `npm run tauri:dev` for the desktop app. Build the frontend with `npm run build`, or package the desktop app with `npm run tauri:build`. Run frontend tests with `npm test` or `npm run test:coverage`. For Rust code, use `cargo test --workspace` to run workspace tests and `cargo build --workspace` to validate both `src-tauri` and `relay-server`.

## Coding Style & Naming Conventions
Follow the existing style in the repo: TypeScript/TSX uses 2-space indentation, double quotes, and semicolon-free formatting; Rust follows standard `rustfmt` defaults with 4-space indentation. Prefer kebab-case filenames for frontend modules such as `welcome-page.tsx` and `use-web-relay.ts`, PascalCase for React components, and snake_case for Rust modules and functions. Keep shared path imports rooted at `@/` when importing from `src/`.

## Testing Guidelines
Frontend tests use Vitest with Testing Library and live under `src/__tests__/` as `*.test.ts` or `*.test.tsx`. Keep test names behavior-focused, for example `it("merges class names", ...)`. Rust unit tests are colocated with modules, such as in `src-tauri/src/core/protocol.rs`. Add or update tests for protocol, store, and transfer-flow changes before opening a PR.

## Commit & Pull Request Guidelines
Recent history follows short Conventional Commit subjects like `fix: ...` and `chore: ...`; keep that pattern. PRs should include a clear summary, affected areas (`frontend`, `src-tauri`, `relay-server`), linked issues when applicable, and screenshots or recordings for UI changes. Note any manual verification steps, especially for local-network discovery, relay behavior, and file transfer flows.
