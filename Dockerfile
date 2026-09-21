FROM node:22-bookworm-slim

# Latest stable on 2026-09-19; includes the matching embedded Web UI.
ARG OPENCODE_VERSION=1.18.31

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global opencode-ai@${OPENCODE_VERSION} \
    && npm cache clean --force

ENV HOME=/home/node
RUN mkdir -p /workspace /home/node/.local/share/opencode \
    && chown -R node:node /workspace /home/node/.local

USER node
WORKDIR /workspace

EXPOSE 4096
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:4096/global/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["opencode"]
CMD ["web", "--hostname", "0.0.0.0", "--port", "4096"]
