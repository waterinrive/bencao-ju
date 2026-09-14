# 本草·局 v1（对战 demo）—— 单镜像：Hono 后端 + 静态 dist/，端口 3000
ARG NODE_IMAGE=node:22-alpine
ARG NPM_REGISTRY=https://registry.npmmirror.com

# ---------- build ----------
FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY
ENV COREPACK_NPM_REGISTRY=${NPM_REGISTRY}
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate \
 && pnpm config set registry ${NPM_REGISTRY}
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build            # vite build → dist/

# ---------- runtime ----------
FROM ${NODE_IMAGE}
ARG NPM_REGISTRY
ENV PORT=7860 \
    COREPACK_NPM_REGISTRY=${NPM_REGISTRY}
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate \
 && pnpm config set registry ${NPM_REGISTRY}
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# NODE_ENV 留默认，否则 pnpm 跳过 devDeps（tsx 是 devDependency，运行期要用）
RUN pnpm install --frozen-lockfile          # 含 tsx（pnpm start 需要）
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY src ./src
COPY data ./data
COPY public ./public
EXPOSE 3000
# .env 不打包；运行时用环境变量注入。教学关离线可玩，无需 ZHIHU_ACCESS_SECRET。
CMD ["pnpm", "exec", "tsx", "src/server/index.ts"]
