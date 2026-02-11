# Integração com Mercado Livre

## Informações Básicas
- **API Base URL**: https://api.mercadolibre.com
- **Documentação Oficial**: https://developers.mercadolivre.com.br/pt_br/api-docs-pt-br
- **Região**: Brasil

## Primeiros Passos

### 1. Criar uma Aplicação
Você deve:
1. Acessar: https://developers.mercadolivre.com.br/devcenter
2. Clicar em "Criar uma aplicação"
3. Preencher informações obrigatórias:
   - **Nome**: Nome único da aplicação
   - **Nome curto**: Usado para gerar a URL
   - **Descrição**: Até 150 caracteres
   - **Logo**: Imagem da empresa
   - **URLs de redirecionamento**: HTTPS obrigatório

### 2. Obter Credenciais
Depois de criada a aplicação você receberá:
- **Client ID**: ID da aplicação
- **Client Secret**: Chave secreta (NUNCA compartilhe!)

### 3. Escopos de Permissão

#### Tipos de Escopos:

**Leitura (read)**
- Permite uso de métodos GET HTTPS
- Acesso a informações públicas

**Escrita (write)**
- Permite uso de PUT, POST, DELETE HTTPS
- Criar/editar publicações, gerenciar vendas

#### Tipos de Aplicações:

1. **Somente Leitura**
   - Usuários visualizam informações
   - Não altera dados

2. **Online Leitura/Escrita**
   - Usuário realiza operações em tempo real
   - Access token válido por um período
   - Requer renovação após expirar

3. **Offline Leitura/Escrita**
   - Aplicação age em nome do usuário mesmo offline
   - Requer refresh token
   - Permissão contínua

### 4. Tópicos de Notificação

Você pode se inscrever em tópicos para receber notificações:

- **Orders**: Mudanças em pedidos
- **Messages**: Novas mensagens
- **Items**: Alterações em produtos
- **Catalog**: Mudanças no catálogo
- **Shipments**: Atualizações de envios
- **Promotions**: Mudanças em promoções

**Importante**: Configure uma URL HTTPS válida para receber notificações.

## Recursos Disponíveis

### Gestão de Produtos
- Publicar produtos
- Editar publicações
- Gerenciar variações
- Controlar estoque
- Gerenciar imagens

### Gestão de Vendas
- Acompanhar pedidos
- Gerenciar envios
- Acompanhar pagamentos
- Emitir notas fiscais
- Feedback de vendas

### Gestão de Preços
- Definir preços
- Aplicar descontos
- Preços por quantidade
- Automatizar preços

### Análise e Relatórios
- Tendências de mercado
- Qualidade de publicações
- Experiência de compra
- Mais vendidos
- Estatísticas de visitas

### Promoções e Campanhas
- Gerenciar ofertas
- Campanhas tradicionais
- Ofertas relâmpago
- Cupons do vendedor
- Desconto de quantidade

## Documentação por Tópico

1. **Autenticação**: Veja `02_AUTENTICACAO.md`
2. **Endpoints de Usuários**: Veja `03_USUARIOS.md`
3. **Gerenciamento de Produtos**: Veja `04_PRODUTOS.md`
4. **Ordenações e Vendas**: Veja `05_VENDAS.md`
5. **Notificações**: Veja `06_NOTIFICACOES.md`

## Boas Práticas de Segurança

### Recomendações Importantes

1. **Access Token**
   - Sempre envie em cada requisição
   - Corresponda ao usuário que faz a consulta
   - Renove quando expirar

2. **Client Secret**
   - NUNCA compartilhe
   - Use HTTPS obrigatoriamente
   - Renovação automática recomendada

3. **URLs de Redirecionamento**
   - Use a mesma URL configurada na aplicação
   - Sempre HTTPS

4. **Parâmetros de Segurança**
   - Envie parâmetros no body (não querystring)
   - Use state com ID seguro
   - Implemente PKCE (Proof Key for Code Exchange)

## Referências Rápidas

- [DevCenter](https://developers.mercadolivre.com.br/devcenter)
- [Documentação de Autenticação](https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao)
- [Desenvolvimento Seguro](https://developers.mercadolivre.com.br/pt_br/desenvolvimento-seguro)
- [Permissões Funcionais](https://developers.mercadolivre.com.br/pt_br/permissoes-funcionais)
