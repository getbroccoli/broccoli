# The Broccoli image: the API, the built web app and the migrations.
# Build from the repository root: docker build -f packages/api/Dockerfile .

# The development API (`pnpm dev`): Node with uv, which installs the PDF word reader's Python.
FROM node:24.21.0-bookworm AS dev
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /usr/local/bin/uv

FROM dev AS build
WORKDIR /repo
# The word reader's Python lives here, so the runtime copies it to the same path.
ENV UV_PYTHON_INSTALL_DIR=/opt/python UV_PYTHON_PREFERENCE=only-managed
# Corepack installs the pnpm version pinned in package.json. `deploy --legacy`:
# the API has no workspace runtime dependencies, so nothing needs injecting.
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm build \
  && pnpm --filter @broccoli/api deploy --legacy --prod /out/api \
  && uv sync --frozen --no-dev --project packages/pdf-words

FROM node:24.21.0-bookworm-slim
ENV NODE_ENV=production PORT=3000 WEB_DIR=/app/web
WORKDIR /app/api
COPY --from=build /out/api ./
COPY --from=build /repo/packages/web/dist /app/web
# The PDF word reader, beside the API as in the repository, with its Python.
COPY --from=build /opt/python /opt/python
COPY --from=build /repo/packages/pdf-words/.venv /app/pdf-words/.venv
COPY --from=build /repo/packages/pdf-words/pdf_words.py /app/pdf-words/
# A new named volume copies this folder's owner, so the app can write its secrets.
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s \
  CMD ["node", "-e", "fetch('http://localhost:3000/readyz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
