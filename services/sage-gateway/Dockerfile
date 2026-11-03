FROM node:24-alpine
WORKDIR /app
COPY server.cjs ./server.cjs
USER node
EXPOSE 8770
CMD ["node", "server.cjs"]
