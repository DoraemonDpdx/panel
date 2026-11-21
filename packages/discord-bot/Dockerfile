FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    CONTROL_HOST=0.0.0.0
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
USER node
EXPOSE 8787
# Run with `--restart on-failure`: the dashboard's Restart button exits with code 75, Stop exits with 0.
CMD ["node", "dist/index.js"]
