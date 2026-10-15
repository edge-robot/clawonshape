# Devcontainer for ts-plugin-dev, owned by onshape-architekt.
# The plugin ships as an npm .tgz through Clawake, so there is no runtime stage.
#
#   podman build --target dev -t localhost/clawonshape-dev:latest .

FROM docker.io/library/node:24-trixie-slim AS dev
ARG CLAUDE_CODE_VERSION=2.1.300
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates ripgrep less procps \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"
COPY .devcontainer/hooks/ /opt/devcontainer/hooks/
WORKDIR /workspaces/clawonshape
CMD ["bash"]
