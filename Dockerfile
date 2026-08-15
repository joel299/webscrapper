FROM node:22-bullseye-slim

WORKDIR /app

COPY package.json package-lock.json* ./
ENV PLAYWRIGHT_BROWSERS_PATH=0
RUN npm install
RUN npx playwright install --with-deps chromium

ARG BUILD_DATE=unknown
ENV BUILD_DATE=${BUILD_DATE}

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

RUN npm run build

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
