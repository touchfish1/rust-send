#!/bin/bash
set -euo pipefail

echo "==> 安装 Rust 工具链（中国大陆镜像）"

# 使用 USTC 镜像下载 rustup-init
RUSTUP_INIT="rustup-init"
ARCH="aarch64-apple-darwin"
RUSTUP_URL="https://mirrors.ustc.edu.cn/rust-static/rustup/dist/$ARCH/rustup-init"

echo "1/4 下载 rustup-init..."
curl -sSfL -o /tmp/rustup-init "$RUSTUP_URL"
chmod +x /tmp/rustup-init

echo "2/4 安装 Rust (stable)..."
export RUSTUP_DIST_SERVER="https://mirrors.ustc.edu.cn/rust-static"
export RUSTUP_UPDATE_ROOT="https://mirrors.ustc.edu.cn/rust-static/rustup"

/tmp/rustup-init -y --no-modify-path --default-toolchain stable --profile default

source "$HOME/.cargo/env"

echo "3/4 配置 cargo 镜像..."
mkdir -p "$HOME/.cargo"
cat > "$HOME/.cargo/config.toml" << 'EOF'
[source.crates-io]
replace-with = "ustc"

[source.ustc]
registry = "sparse+https://mirrors.ustc.edu.cn/crates.io-index/"
EOF

echo "4/4 验证安装..."
echo "rustc:  $(rustc --version)"
echo "cargo:  $(cargo --version)"
echo "rustup: $(rustup --version)"

echo ""
echo "==> 安装完成!"
echo "    源: USTC mirror"
echo "    目标: $ARCH"
echo ""
echo "运行以下命令加载环境:"
echo "  source \$HOME/.cargo/env"
