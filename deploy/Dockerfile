FROM node:22-bookworm-slim

ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision="${SOURCE_REVISION}"

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_POOL_MAX=10 \
    TRUSTED_CLIENT_IP_HEADER=x-real-ip

WORKDIR /app
COPY --chown=node:node . /app
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e 'fetch("http://127.0.0.1:3000/api/health/live",{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'

CMD ["node", "server.js"]
