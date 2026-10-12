FROM docker.io/library/debian:trixie-slim@sha256:918311b7b6c4c6f68b232ba516584925f6c78ad82b6fd534b98979df6438e483
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --chmod=0555 onshape-mcp /usr/local/bin/onshape-mcp
COPY LICENSE-MIT LICENSE-APACHE /usr/share/licenses/onshape-mcp/
USER 1000:1000
ENTRYPOINT ["/usr/local/bin/onshape-mcp"]
