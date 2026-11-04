#!/usr/bin/env bash
# Build the clawonshape-mcp image from a pinned edge-robot/onshape-mcp commit.
#
# 1. Build the distroless runtime target of onshape-mcp's Containerfile (release, musl, checks
#    inside the build are the server's own CI responsibility).
# 2. Copy its binary into a debian-slim wrapper (./Dockerfile) that adds curl, because the
#    deployed Clawake HealthCmd uses curl. Once the exec-form health command of
#    edge-robot/clawake#39 is enabled in service.json, the runtime image can be used directly.
#
# Defaults are the accepted row of docs/interface/onshape-mcp.md §9. Run on the owning host; no
# credentials or production state are mounted.
#
#   CLAW_ONSHAPE_BUILD_DIR=<empty dir> [ONSHAPE_MCP_REF=<sha>] [ONSHAPE_MCP_LABEL=<label>] \
#   [CLAW_ONSHAPE_SOURCE_REPOSITORY=<git url or path>] bash deploy/onshape-mcp/build.sh
set -euo pipefail
asset_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
build_dir=${CLAW_ONSHAPE_BUILD_DIR:?Set CLAW_ONSHAPE_BUILD_DIR to an empty build directory}
ref=${ONSHAPE_MCP_REF:-cc67472e3dd05d178bce4736c5f158abe6e4df3e}
label=${ONSHAPE_MCP_LABEL:-goal-grant-curl}
short=${ref:0:7}

mkdir -p "$build_dir"
if [[ -n "$(ls -A "$build_dir")" ]]; then
  echo "build.sh: $build_dir is not empty" >&2
  exit 1
fi
git clone "${CLAW_ONSHAPE_SOURCE_REPOSITORY:-https://github.com/edge-robot/onshape-mcp.git}" "$build_dir/source"
git -C "$build_dir/source" checkout --detach "$ref"

podman build --target runtime -f "$build_dir/source/Containerfile" \
  --tag "localhost/clawonshape-mcp:$short-runtime" "$build_dir/source"

mkdir -p "$build_dir/image"
cid=$(podman create "localhost/clawonshape-mcp:$short-runtime")
trap 'podman rm "$cid" >/dev/null' EXIT
podman cp "$cid:/usr/local/bin/onshape-mcp" "$build_dir/image/onshape-mcp"
cp "$build_dir/source/LICENSE-MIT" "$build_dir/source/LICENSE-APACHE" "$build_dir/image/"
cp "$asset_dir/Dockerfile" "$build_dir/image/Dockerfile"
podman build --tag "localhost/clawonshape-mcp:$short-$label" "$build_dir/image"

echo "binary sha256: $(sha256sum "$build_dir/image/onshape-mcp" | cut -d' ' -f1)"
echo "image: localhost/clawonshape-mcp:$short-$label"
podman image inspect --format 'image id: {{.Id}}' "localhost/clawonshape-mcp:$short-$label"
