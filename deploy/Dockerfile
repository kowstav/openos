# OpenOS control plane + worker image. The worker body (lib/job-worker.ts)
# runs in the web process for single-container use; the compose `worker`
# service runs this same image with `node scripts/worker.mjs`, claiming
# durable jobs through the token-gated drain endpoint. Python + the Modal
# SDK are packaged here so workers/modal_runner.py can create sandboxes
# whenever credentials are configured — without them it refuses honestly.
FROM node:22-alpine
RUN apk add --no-cache python3 py3-pip \
  && pip3 install --no-cache-dir --break-system-packages "modal>=1.0" "faster-whisper>=1.0" \
  || pip3 install --no-cache-dir "modal>=1.0" "faster-whisper>=1.0"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["npm", "start"]
