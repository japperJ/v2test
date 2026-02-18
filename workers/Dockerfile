FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
RUN npx playwright install chromium --with-deps
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
# Install chromium + deps to a fixed path accessible to non-root users
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package*.json ./
RUN npm ci --omit=dev
RUN npx playwright install chromium --with-deps && chmod -R o+rx /ms-playwright
COPY --from=builder /app/dist ./dist
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /app
USER appuser
CMD ["node", "dist/index.js"]
