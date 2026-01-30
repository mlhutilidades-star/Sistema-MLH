# ==========================================
# SISTEMA MLH - DOCKERFILE (Railway)
# Build context: repo root
# ==========================================

FROM node:18-alpine

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Dependências (do backend)
COPY backend/package*.json ./
COPY backend/prisma ./prisma/

# Instala deps (inclui devDeps para build TS)
RUN npm ci

# Prisma Client
RUN npx prisma generate

# Código-fonte (apenas backend)
COPY backend/. ./

# Build TS
RUN npm run build

# Remove devDeps
RUN npm prune --omit=dev && npm cache clean --force

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
