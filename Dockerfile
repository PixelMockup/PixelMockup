# Node + system Chromium (lighter than the full Playwright image).
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (including vite/playwright needed for `vite preview` + capture).
COPY package.json package-lock.json ./
# Skip Playwright browser download — we use system Chromium.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

COPY . .
RUN npm run build

ENV HOST=0.0.0.0 \
    PORT=4173 \
    PIXEL_MOCKUP_DISABLE_SANDBOX=1 \
    PIXEL_MOCKUP_CHROME=/usr/bin/chromium \
    NODE_ENV=production

EXPOSE 4173

CMD ["npm", "start"]
