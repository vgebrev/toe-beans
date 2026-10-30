# Spike S-1.3: the adapter-node server for Cloud Run (`gcloud run deploy --source .` builds this).
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
# Prerendering validates env vars; the real values are read at runtime, so placeholders do here.
RUN VAPID_PUBLIC_KEY=build VAPID_PRIVATE_KEY=build VAPID_SUBJECT=build pnpm build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts && mkdir data && chown node:node data
COPY --from=build /app/build build
USER node
# Cloud Run sets PORT and terminates TLS, passing the original scheme in x-forwarded-proto.
ENV PROTOCOL_HEADER=x-forwarded-proto
CMD ["node", "build"]
