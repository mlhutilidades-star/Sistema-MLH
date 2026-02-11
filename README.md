# Sistema de Integração Multi-Marketplace

Integração completa com **Mercado Livre**, **Shopee** e **TikTok Shop** para gerenciar produtos, pedidos e estoque de forma centralizada.

## 📋 Características

✅ **Mercado Livre**
- Autenticação OAuth 2.0
- Sincronização de produtos
- Gerenciamento de pedidos
- Webhooks de notificações
- Rastreamento de envios

✅ **Shopee** (em desenvolvimento)
- Autenticação API Key
- CRUD de produtos
- Sincronização de pedidos
- Polling de atualizações

✅ **TikTok Shop** (em desenvolvimento)
- Autenticação OAuth 2.0
- Gerenciamento de loja
- Sincronização de produtos
- Webhooks de pedidos

## 🗂️ Estrutura de Documentação

```
docs/
├── mercado-livre/
│   ├── 01_INTRODUCAO.md        # Visão geral e primeiros passos
│   ├── 02_AUTENTICACAO.md      # OAuth 2.0, tokens, refresh
│   ├── 03_USUARIOS.md          # Endpoints de usuários
│   ├── 04_PRODUTOS.md          # CRUD de produtos
│   ├── 05_VENDAS.md            # Pedidos, envios, pagamentos
│   └── 06_NOTIFICACOES.md      # Webhooks e notificações
├── shopee/
│   └── 01_INTRODUCAO.md        # Visão geral
└── tiktok-shop/
    └── 01_INTRODUCAO.md        # Visão geral
```

## 🚀 Quick Start

### 1. Clonar Repositório
```bash
git clone <seu-repositorio>
cd sistema-mlh
```

### 2. Configurar Ambiente
```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Preencher credenciais das plataformas
nano .env
```

### 3. Instalar Dependências
```bash
pip install -r requirements.txt
```

### 4. Configurar Banco de Dados
```bash
python manage.py migrate
```

### 5. Executar Servidor
```bash
python run.py
```

## 🔐 Configuração de Credenciais

### Mercado Livre

1. Acesse: https://developers.mercadolivre.com.br/devcenter
2. Crie uma aplicação
3. Copie `Client ID` e `Client Secret`
4. Configure URL de redirecionamento: `https://seu-app.com/callback/meli`

```env
MELI_CLIENT_ID=xxxxx
MELI_CLIENT_SECRET=xxxxx
MELI_REDIRECT_URI=https://seu-app.com/callback/meli
```

### Shopee

1. Acesse: https://seller.shopee.com.br
2. Solicite acesso ao programa de integração
3. Obtenha `Partner ID` e `Partner Key`

```env
SHOPEE_PARTNER_ID=xxxxx
SHOPEE_PARTNER_KEY=xxxxx
```

### TikTok Shop

1. Acesse: https://seller.tiktokshop.com/developer
2. Crie nova aplicação
3. Obtenha `Client ID` e `Client Secret`

```env
TIKTOK_CLIENT_ID=xxxxx
TIKTOK_CLIENT_SECRET=xxxxx
TIKTOK_REDIRECT_URI=https://seu-app.com/callback/tiktok
```

## 📡 Endpoints da API

### Produtos
```
GET    /api/products              # Listar
POST   /api/products              # Criar
GET    /api/products/{id}         # Detalhes
PUT    /api/products/{id}         # Atualizar
DELETE /api/products/{id}         # Deletar
```

### Pedidos
```
GET    /api/orders                # Listar
GET    /api/orders/{id}           # Detalhes
PUT    /api/orders/{id}/status    # Atualizar status
```

### Sincronização
```
POST   /api/sync/products         # Sincronizar todos
POST   /api/sync/orders           # Sincronizar pedidos
GET    /api/sync/status           # Status da sincronização
```

## 🔄 Webhooks

### Configurar Webhooks

**Mercado Livre**:
```
https://seu-app.com/webhooks/meli
```

**Shopee**:
```
https://seu-app.com/webhooks/shopee
```

**TikTok Shop**:
```
https://seu-app.com/webhooks/tiktok
```

## 🛠️ Desenvolvimento

### Estrutura de Pastas

```
src/
├── auth/                  # Autenticação
├── clients/              # Clientes de API
├── models/               # Modelos de dados
├── services/             # Lógica de negócio
├── webhooks/             # Handlers de webhooks
├── utils/                # Utilitários
└── main.py               # Entrada da aplicação
```

### Executar Testes
```bash
pytest tests/
pytest tests/ --cov=src  # Com cobertura
```

### Linting
```bash
flake8 src/
black src/
```

## 📚 Documentação Adicional

- [ARQUITETURA.md](ARQUITETURA.md) - Design do sistema
- [CHECKLIST.md](CHECKLIST.md) - Progresso do desenvolvimento
- [docs/mercado-livre/](docs/mercado-livre/) - Documentação completa do ML

## 🐛 Troubleshooting

### Erro 401 Unauthorized
- Verificar se token expirou
- Renovar token usando refresh token
- Validar credenciais

### Erro 429 Rate Limited
- Implementar backoff exponencial
- Aguardar antes de nova requisição
- Ajustar frequência de sincronização

### Erro de Webhook
- Validar URL HTTPS
- Verificar timeout (máximo 22 segundos para ML)
- Validar assinatura de webhook

## 📞 Suporte

Para problemas:
1. Consulte a documentação específica do marketplace
2. Verifique logs da aplicação
3. Valide credenciais
4. Teste com curl antes de implementar

## 📄 Licença

MIT License

## ✨ Principais Fontes

- [Mercado Livre Developers](https://developers.mercadolivre.com.br/pt_br/api-docs-pt-br)
- [Shopee Open Platform](https://open.shopee.com/documents)
- [TikTok Shop Developers](https://developer.tiktokshop.com)

---

**Última atualização**: Fevereiro 2026
**Status**: Em desenvolvimento ⚙️
