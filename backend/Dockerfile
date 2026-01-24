# ==========================================
# SISTEMA MLH - DOCKERFILE PRODUCTION (Railway Optimized)
# ==========================================

FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependências (inclui devDependencies para permitir build TypeScript)
RUN npm ci

# Gerar Prisma Client
RUN npx prisma generate

# Copiar código fonte
COPY . .

# Build TypeScript
RUN npm run build

# Remover devDependencies para reduzir a imagem em produção
RUN npm prune --omit=dev && npm cache clean --force

# Expor porta
EXPOSE 3000

# Comando de inicialização
CMD ["npm", "start"]
