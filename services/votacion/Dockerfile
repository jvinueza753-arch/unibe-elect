FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_PATH=/app/node_modules
COPY services/votacion/package*.json ./
RUN npm install
COPY services/votacion/ ./
COPY shared/ /shared/
EXPOSE 4003
CMD ["sh", "-c", "npm run predev && npm start"]
