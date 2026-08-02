FROM node:22-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs ./
COPY public ./public
RUN mkdir -p uploads

EXPOSE 8091
CMD ["node", "server.mjs"]
