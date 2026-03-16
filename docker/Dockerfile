FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production

COPY dist/ ./dist/
COPY skills/ ./skills/

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/index.js"]
