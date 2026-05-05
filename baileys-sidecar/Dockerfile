# Production: upstream @whiskeysockets/baileys from npm + TypeScript sidecar (no Baileys repo clone).
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./

COPY src ./src

RUN npm install \
    && npm run build \
    && npm prune --omit=dev

RUN mkdir -p /data/sessions /data/media \
    && groupadd -r sidecar && useradd -r -g sidecar -d /app sidecar \
    && chown -R sidecar:sidecar /app /data
USER sidecar

ENV NODE_ENV=production
ENV SESSIONS_DIR=/data/sessions
ENV MEDIA_DIR=/data/media
ENV PORT=3500

EXPOSE 3500

VOLUME ["/data/sessions"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "const h=require('http');h.get('http://localhost:3500/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
