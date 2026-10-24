FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_PATH=/app/node_modules
COPY services/identidad/package*.json ./
RUN npm install
COPY services/identidad/ ./
COPY shared/ /shared/
EXPOSE 4001
CMD ["sh", "-c", "npm run predev && npm start"]
