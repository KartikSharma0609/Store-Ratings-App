# ---- stage 1: production dependencies only ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- stage 2: minimal runtime ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
# Code stays root-owned and read-only to the app; it runs as the unprivileged "node" user.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json schema.sql ./
COPY src ./src
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
