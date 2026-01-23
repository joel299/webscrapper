FROM node:22-bullseye-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install
RUN npx playwright install --with-deps chromium

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
