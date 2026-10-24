FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_PATH=/app/node_modules
COPY services/elecciones/package*.json ./
RUN npm install
COPY services/elecciones/ ./
COPY shared/ /shared/
EXPOSE 4002
CMD ["sh", "-c", "npm run predev && npm start"]
