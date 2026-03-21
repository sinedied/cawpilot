# --- Build stage ---
FROM node:24 AS build

WORKDIR /app
COPY package.json package-lock.json* ./
COPY scripts/ ./scripts/
RUN npm ci --cache /tmp/npm-cache && rm -rf /tmp/npm-cache

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# --- Web UI build stage ---
FROM node:24 AS web-build

WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci --cache /tmp/npm-cache && rm -rf /tmp/npm-cache
COPY web/ ./
RUN npm run build

# --- Runtime stage ---
FROM node:24

# Install gh CLI, uv, python3-venv, Copilot CLI
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3-venv \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && curl -fsSL https://astral.sh/uv/install.sh | sh \
    && npm install -g --cache /tmp/npm-cache @github/copilot \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/npm-cache

ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

COPY package.json package-lock.json* ./
COPY scripts/ ./scripts/
RUN npm ci --production --cache /tmp/npm-cache && rm -rf /tmp/npm-cache
COPY --from=build /app/dist/ ./dist/
COPY --from=web-build /app/dist/web/ ./dist/web/
COPY skills/ ./skills/
COPY templates/ ./templates/

VOLUME /workspace
ENV CAWPILOT_WORKSPACE=/workspace

EXPOSE 2243

ENTRYPOINT ["node", "dist/index.js"]
CMD ["start"]
