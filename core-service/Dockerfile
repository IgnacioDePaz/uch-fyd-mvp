# Construye y ejecuta el servicio Node.js de catálogo y pedidos en un contenedor.
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./

ENV NODE_ENV=production
EXPOSE 3001

USER node

CMD ["npm", "start"]
