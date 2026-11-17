# syntax=docker/dockerfile:1
# The app image (architecture §8.1): the adapter-node server plus the packages the bundle
# imports at runtime (OpenTelemetry's API, and sharp, which is native). Build from the repo root: docker build -f docker/Dockerfile .

ARG NODE_IMAGE=node:24.21.0-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# Manifests first, so the dependency layer is reused until they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/backend/package.json packages/backend/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
# The build's name (architecture §9, S0.8): the deploy sets it to the commit, so browser and server
# errors share a release. Unset, the build falls back to git or a timestamp.
ARG APP_RELEASE
RUN pnpm build
# apps/web's `dependencies` are exactly what the bundle imports at runtime; everything else,
# the workspace packages included, is bundled and so a devDependency.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
	pnpm --filter @toe-beans/web deploy --prod --legacy /out

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
# The image is prod unless told otherwise, so a deploy that forgets APP_ENV still gets every prod
# guard (security audit F4). Compose's app profile sets it back to local.
ENV APP_ENV=prod
# Cloud Run sets PORT itself; 8080 is its default too.
ENV PORT=8080
# adapter-node refuses bodies over 512 KB by default. A dog's photo may be up to 10 MB (§3.6).
ENV BODY_SIZE_LIMIT=11M
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/web/build ./build
# The exercise library, read at startup (architecture §3.8); found as /app/content/exercises.
COPY --from=build /repo/content/exercises ./content/exercises
# The image's built-in unprivileged user. Files stay root-owned, so the app can't modify itself.
USER node
EXPOSE 8080
# adapter-node handles SIGTERM itself: it stops taking requests, then the backend closes Mongo.
CMD ["node", "build"]
