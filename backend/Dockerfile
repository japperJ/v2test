# Install production-only dependencies in a separate stage so the runtime
# image doesn't need npm or TypeScript tooling.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Build stage: compile TypeScript with all dev dependencies
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Minimal production runtime — non-root user
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY migrations ./migrations
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 3000
CMD ["node", "dist/server.js"]
