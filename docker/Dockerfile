FROM node:24-slim

# Install Copilot CLI
RUN npm install -g @anthropic-ai/copilot-cli || true

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production

COPY dist/ ./dist/
COPY skills/ ./skills/

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/index.js"]
