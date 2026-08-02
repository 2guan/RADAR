FROM node:22-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs ./
COPY public ./public
RUN mkdir -p uploads && chown -R node:node /app

EXPOSE 8091
USER node
CMD ["node", "server.mjs"]
