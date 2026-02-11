# Integração com Shopee

## Informações Básicas
- **API Base URL**: https://partner.shopeemx.com/api/v1 (México) / https://partner.shopeeid.com/api/v1 (Indonésia)
- **Documentação Oficial**: https://open.shopee.com/documents
- **Status**: Plataforma popular na Ásia e América Latina

## Primeiros Passos

### 1. Registrar como Seller
1. Acesse: https://seller.shopee.com.br (Brasil)
2. Complete o registro de vendedor
3. Preencha informações da empresa

### 2. Solicitar Acesso à API
1. Acesse o Dashboard do Seller
2. Vá em "Configurações" > "Ferramentas"
3. Solicite acesso ao programa de integração
4. Aguarde aprovação da Shopee (2-5 dias)

### 3. Obter Credenciais
Após aprovado, você receberá:
- **Partner ID**: ID único do seu programa
- **Partner Key**: Chave para autenticação

## Autenticação

### Gerar Token de Acesso

**Método**: POST
**URL**: `/auth/token/get`

**Headers**:
```
Content-Type: application/x-www-form-urlencoded
```

**Body**:
```
partner_id=YOUR_PARTNER_ID
partner_key=YOUR_PARTNER_KEY
timestamp=UNIX_TIMESTAMP
```

**Cálculo de Timestamp**: Use o timestamp Unix atual (segundos)

**Response**:
```json
{
  "request_id": "123456",
  "error": "",
  "warning": "",
  "response": {
    "access_token": "c706b46c1c123456",
    "expire_time": 1705336800
  }
}
```

### Usar Token em Requisições

```
Authorization: Bearer c706b46c1c123456
```

## Recursos Principais

### Produtos
- Listar produtos
- Criar/editar produtos
- Gerenciar estoque
- Gerenciar imagens

### Pedidos
- Listar pedidos
- Obter detalhes do pedido
- Atualizar status
- Gerar rótulo de envio

### Envios
- Rastrear envio
- Confirmar entrega
- Gerar rótulo

### Relatórios
- Vendas
- Tráfego da loja
- Produtos populares

## Rate Limiting
- **Limite**: 10.000 requisições por dia
- **Janela**: 24 horas

## Próximos Passos
Consulte os arquivos específicos para cada recurso:
- `02_SHOPEE_AUTENTICACAO.md`
- `03_SHOPEE_PRODUTOS.md`
- `04_SHOPEE_PEDIDOS.md`

## Observações Importantes

1. **Timestamp**: Sempre use UNIX timestamp em segundos
2. **Timeouts**: Configure timeout mínimo de 30 segundos
3. **Retry**: Implemente retry automático com backoff exponencial
4. **Moedas**: Cada mercado usa uma moeda diferente
5. **IDs**: Shopee usa IDs numéricos grandes (int64)

## Mercados Suportados
- Brasil (shopee.com.br)
- México
- Colômbia
- Argentina
- Chile
- Peru
- Indonésia
- Malásia
- Filipinas
- Tailândia
- Vietnã
- Singapura
- Taiwan

## Links Úteis
- [Seller Center](https://seller.shopee.com.br)
- [API Documentation](https://open.shopee.com/documents)
- [Status API](https://shopee-api-status.statuspage.io)
