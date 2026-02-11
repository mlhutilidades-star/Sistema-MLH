# Autenticação - Mercado Livre

## Fluxo de Autenticação OAuth 2.0

### Passo 1: Redirecionar o Usuário

Direcione o usuário para:

```
GET https://auth.mercadolibre.com.br/authorization?
    response_type=code&
    client_id=YOUR_CLIENT_ID&
    state=SECURE_RANDOM_ID&
    redirect_uri=YOUR_REDIRECT_URI
```

**Parâmetros:**
- `response_type`: Sempre `code`
- `client_id`: ID da sua aplicação
- `state`: ID seguro gerado (recomendado para segurança)
- `redirect_uri`: URL registrada na aplicação (HTTPS obrigatório)

**Exemplo com curl:**
```bash
curl -X GET \
  "https://auth.mercadolibre.com.br/authorization?response_type=code&client_id=YOUR_APP_ID&state=ABC123&redirect_uri=https://sua-aplicacao.com/callback"
```

### Passo 2: Receber o Código de Autorização

O usuário será redirecionado para sua URL com:

```
https://YOUR_REDIRECT_URI?code=SERVER_GENERATED_AUTHORIZATION_CODE&state=ABC123
```

**⚠️ Importante**: Valide se o `state` corresponde ao que você enviou para garantir segurança!

### Passo 3: Trocar o Código por Access Token

**Método**: POST
**URL**: `https://api.mercadolibre.com/oauth/token`

**Headers:**
```
Content-Type: application/x-www-form-urlencoded
Accept: application/json
```

**Body (form-urlencoded):**
```
grant_type=authorization_code
client_id=YOUR_CLIENT_ID
client_secret=YOUR_CLIENT_SECRET
code=SERVER_GENERATED_AUTHORIZATION_CODE
redirect_uri=YOUR_REDIRECT_URI
```

**Exemplo com curl:**
```bash
curl -X POST \
  -H 'accept: application/json' \
  -H 'content-type: application/x-www-form-urlencoded' \
  'https://api.mercadolibre.com/oauth/token' \
  -d 'grant_type=authorization_code' \
  -d 'client_id=YOUR_CLIENT_ID' \
  -d 'client_secret=YOUR_CLIENT_SECRET' \
  -d 'code=SERVER_GENERATED_CODE' \
  -d 'redirect_uri=YOUR_REDIRECT_URI'
```

**Resposta (sucesso):**
```json
{
  "access_token": "APP_USR-1234567890-alfa-xxxxx",
  "token_type": "bearer",
  "expires_in": 21600,
  "scope": "read write offline_access",
  "refresh_token": "TG-abcdef1234567890",
  "user_id": 123456789,
  "x_request_id": "0000-0000-0000-0000"
}
```

### Passo 4: Usar o Access Token

Inclua o access token em **todas** as requisições:

```bash
curl -X GET \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  'https://api.mercadolibre.com/users/me'
```

## Renovação de Token (Refresh Token)

Quando o access token expirar, use o refresh token:

**URL**: `https://api.mercadolibre.com/oauth/token`

**Body:**
```
grant_type=refresh_token
client_id=YOUR_CLIENT_ID
client_secret=YOUR_CLIENT_SECRET
refresh_token=YOUR_REFRESH_TOKEN
```

**Resposta:**
```json
{
  "access_token": "APP_USR-NOVO-TOKEN",
  "token_type": "bearer",
  "expires_in": 21600,
  "scope": "read write offline_access",
  "refresh_token": "TG-novo-refresh-token",
  "x_request_id": "0000-0000-0000-0000"
}
```

## Boas Práticas de Segurança

### 1. Usar PKCE (Proof Key for Code Exchange)

Gere um código verificador:
```bash
# Código verificador (43-128 caracteres)
code_verifier = random_string(128)

# Desafio (SHA-256 do verificador, base64 URL encoded)
code_challenge = base64_url_encode(sha256(code_verifier))
```

**URL de autorização com PKCE:**
```
https://auth.mercadolibre.com.br/authorization?
  response_type=code&
  client_id=YOUR_CLIENT_ID&
  code_challenge=CHALLENGE&
  code_challenge_method=S256&
  redirect_uri=YOUR_REDIRECT_URI
```

**Ao trocar código por token, inclua:**
```
code_verifier=YOUR_CODE_VERIFIER
```

### 2. Usar State Parameter com Valor Seguro

```java
// Exemplo em Java
SecureRandom random = new SecureRandom();
String state = generateSecureRandom(); // 32+ caracteres aleatórios
```

### 3. Validações Importantes

```javascript
// Validar state na resposta
if (urlParams.state !== sessionState) {
  throw new Error('State mismatch - possível ataque CSRF');
}

// Armazenar tokens com segurança
// Nunca em localStorage (vulnerable to XSS)
// Use sessionStorage ou cookies com httpOnly flag
```

## Tipos de Token

### Access Token
- **Duração**: 6 horas (21600 segundos)
- **Uso**: Autenticar requisições à API
- **Escopo**: Definido durante autorização

### Refresh Token
- **Duração**: Permanente (offline_access)
- **Uso**: Renovar access token expirado
- **Requer**: grant_type=refresh_token

## Gerenciamento de Credenciais

### Renovação de Client Secret

1. Acesse: https://developers.mercadolivre.com.br/devcenter
2. Selecione a aplicação
3. Vá para "Configurações"
4. Opções:
   - **Renove agora**: Renovação imediata
   - **Programar renovação**: Agendar para data/hora futura (até 7 dias)

**⚠️ Importante**: Após renovação, atualize a chave em TODOS seus ambientes (dev, test, prod).

## Tratamento de Erros

**Erro: invalid_grant**
```json
{
  "error": "invalid_grant",
  "error_description": "The authorization code is invalid or expired"
}
```
Solução: Obtenha um novo código de autorização

**Erro: invalid_client**
```json
{
  "error": "invalid_client",
  "error_description": "Invalid client credentials"
}
```
Solução: Verifique client_id e client_secret

**Erro: invalid_request**
```json
{
  "error": "invalid_request",
  "error_description": "The request is missing required parameters"
}
```
Solução: Verifique todos os parâmetros obrigatórios

## Endpoints de Autenticação

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/authorize` | GET | Iniciar fluxo de autorização |
| `/oauth/token` | POST | Obter ou renovar tokens |
| `/users/me` | GET | Obter dados do usuário autenticado |
