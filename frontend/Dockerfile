FROM node:22-alpine AS build
WORKDIR /app
ARG API_ORIGIN=http://api:8000
ENV API_ORIGIN=$API_ORIGIN DOCKER_BUILD=1 NEXT_TELEMETRY_DISABLED=1
COPY package.json ./
RUN npm install
COPY . .
RUN mkdir -p public && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1 API_ORIGIN=http://api:8000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
