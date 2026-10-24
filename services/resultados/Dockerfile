FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_PATH=/app/node_modules
COPY services/resultados/package*.json ./
RUN npm install
COPY services/resultados/ ./
COPY shared/ /shared/
EXPOSE 4004
CMD ["sh", "-c", "npm run predev && npm start"]
