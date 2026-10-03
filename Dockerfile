FROM node:22.23.3-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.js ./
COPY lib ./lib
COPY bin ./bin
COPY test ./test
RUN npm test

FROM node:22.23.3-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=8000
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/index.js ./
COPY --from=build /app/lib ./lib
COPY --from=build /app/bin ./bin
USER node
EXPOSE 8000
CMD ["node", "bin/storage.js"]
