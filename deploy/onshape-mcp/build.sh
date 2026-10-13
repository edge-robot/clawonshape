#!/usr/bin/env bash
set -euo pipefail
# Run from the owning host; no credentials or production filesystem are mounted.
# The pinned revision is published in edge-robot/onshape-mcp. An optional
# CLAW_ONSHAPE_SOURCE_REPOSITORY override still checks out the exact commit.
asset_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
build_dir=${CLAW_ONSHAPE_BUILD_DIR:?Set CLAW_ONSHAPE_BUILD_DIR to an empty build directory}
mkdir -p "$build_dir"
git clone "${CLAW_ONSHAPE_SOURCE_REPOSITORY:-https://github.com/edge-robot/onshape-mcp.git}" "$build_dir/source"
git -C "$build_dir/source" checkout --detach 612de76266efedc6b1f7fcc1fafe3063837ae8da
podman run --rm --userns keep-id --user 1000:1000 -e CARGO_HOME=/build/.cargo \
  -v "$build_dir/source:/build:rw" -w /build \
  docker.io/library/rust:1.99-slim@sha256:2752b332db73fdbb7dc576f06c82ed1f312005784ef913d7e04a28f5f55dc581 \
  sh -c 'rustup component add rustfmt clippy --toolchain 1.99.0 && cargo +1.99.0 fmt --check && cargo +1.99.0 clippy --locked --workspace --all-targets --all-features -- -D warnings && cargo +1.99.0 test --locked --workspace --all-features && cargo +1.99.0 build --locked -p onshape-mcp && strip target/debug/onshape-mcp'
mkdir -p "$build_dir/image"
cp "$build_dir/source/target/debug/onshape-mcp" "$build_dir/image/onshape-mcp"
cp "$build_dir/source/LICENSE-MIT" "$build_dir/source/LICENSE-APACHE" "$build_dir/image/"
cp "$asset_dir/Dockerfile" "$build_dir/image/Dockerfile"
podman build --tag localhost/clawonshape-mcp:612de76-external-token-v3 "$build_dir/image"
