FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV DB_PATH=/data/planner.db
COPY package.json ./
COPY server ./server
COPY public ./public
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "server/index.js"]
