# The Broccoli image: the API, the built web app and the migrations.
# Build from the repository root: docker build -f packages/api/Dockerfile .

FROM node:24.21.0-bookworm AS build
WORKDIR /repo
# Corepack installs the pnpm version pinned in package.json. `deploy --legacy`:
# the API has no workspace runtime dependencies, so nothing needs injecting.
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm build \
  && pnpm --filter @broccoli/api deploy --legacy --prod /out/api

FROM node:24.21.0-bookworm-slim
ENV NODE_ENV=production PORT=3000 WEB_DIR=/app/web
WORKDIR /app/api
COPY --from=build /out/api ./
COPY --from=build /repo/packages/web/dist /app/web
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s \
  CMD ["node", "-e", "fetch('http://localhost:3000/readyz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
