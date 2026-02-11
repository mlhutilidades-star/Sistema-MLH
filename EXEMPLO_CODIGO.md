# Exemplo de Estrutura de Código Python

## Cliente Base (clients/base_client.py)

```python
from abc import ABC, abstractmethod
from typing import Dict, List, Optional
import requests
from datetime import datetime, timedelta

class BaseMarketplaceClient(ABC):
    """Classe base para clientes de marketplace"""
    
    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token: Optional[str] = None
        self.token_expires_at: Optional[datetime] = None
        self.session = requests.Session()
    
    @abstractmethod
    def authenticate(self) -> str:
        """Autenticar e retornar access token"""
        pass
    
    @abstractmethod
    def get_products(self) -> List[Dict]:
        """Obter lista de produtos"""
        pass
    
    @abstractmethod
    def get_orders(self) -> List[Dict]:
        """Obter lista de pedidos"""
        pass
    
    def ensure_valid_token(self):
        """Garantir que o token é válido"""
        if not self.access_token:
            self.authenticate()
        elif self.token_expires_at and datetime.now() > self.token_expires_at - timedelta(minutes=5):
            self.refresh_token()
    
    def _make_request(self, method: str, url: str, **kwargs) -> Dict:
        """Fazer requisição HTTP com tratamento de erro"""
        self.ensure_valid_token()
        
        headers = kwargs.get('headers', {})
        headers['Authorization'] = f'Bearer {self.access_token}'
        kwargs['headers'] = headers
        
        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        
        return response.json()
```

## Cliente Mercado Livre (clients/mercado_livre_client.py)

```python
import requests
from typing import Dict, List, Optional
from .base_client import BaseMarketplaceClient

class MercadoLivreClient(BaseMarketplaceClient):
    """Cliente para Mercado Livre API"""
    
    BASE_URL = "https://api.mercadolibre.com"
    AUTH_URL = "https://auth.mercadolibre.com.br"
    
    def __init__(self, client_id: str, client_secret: str, redirect_uri: str):
        super().__init__(client_id, client_secret)
        self.redirect_uri = redirect_uri
        self.refresh_token: Optional[str] = None
    
    def get_authorization_url(self) -> str:
        """Gerar URL para redirecionamento do usuário"""
        return (
            f"{self.AUTH_URL}/authorization?"
            f"response_type=code&"
            f"client_id={self.client_id}&"
            f"redirect_uri={self.redirect_uri}"
        )
    
    def authenticate(self, auth_code: str) -> str:
        """Trocar código de autorização por token"""
        response = requests.post(
            f"{self.BASE_URL}/oauth/token",
            data={
                'grant_type': 'authorization_code',
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'code': auth_code,
                'redirect_uri': self.redirect_uri
            }
        )
        response.raise_for_status()
        data = response.json()
        
        self.access_token = data['access_token']
        self.refresh_token = data.get('refresh_token')
        
        return self.access_token
    
    def refresh_token(self) -> str:
        """Renovar access token usando refresh token"""
        if not self.refresh_token:
            raise ValueError("Refresh token não disponível")
        
        response = requests.post(
            f"{self.BASE_URL}/oauth/token",
            data={
                'grant_type': 'refresh_token',
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'refresh_token': self.refresh_token
            }
        )
        response.raise_for_status()
        data = response.json()
        
        self.access_token = data['access_token']
        self.refresh_token = data.get('refresh_token', self.refresh_token)
        
        return self.access_token
    
    def get_user_info(self) -> Dict:
        """Obter informações do usuário autenticado"""
        return self._make_request('GET', f'{self.BASE_URL}/users/me')
    
    def get_products(self, user_id: str) -> List[Dict]:
        """Obter lista de produtos do usuário"""
        response = self._make_request(
            'GET',
            f'{self.BASE_URL}/users/{user_id}/items/search'
        )
        return response.get('results', [])
    
    def create_product(self, product_data: Dict) -> Dict:
        """Criar novo produto"""
        return self._make_request(
            'POST',
            f'{self.BASE_URL}/items',
            json=product_data
        )
    
    def update_product(self, item_id: str, product_data: Dict) -> Dict:
        """Atualizar produto existente"""
        return self._make_request(
            'PUT',
            f'{self.BASE_URL}/items/{item_id}',
            json=product_data
        )
    
    def get_orders(self, seller_id: str) -> List[Dict]:
        """Obter lista de pedidos"""
        response = self._make_request(
            'GET',
            f'{self.BASE_URL}/orders/search/seller',
            params={'seller_id': seller_id}
        )
        return response.get('results', [])
    
    def get_order(self, order_id: str) -> Dict:
        """Obter detalhes de um pedido"""
        return self._make_request(
            'GET',
            f'{self.BASE_URL}/orders/{order_id}'
        )
```

## Modelo de Produto (models/product.py)

```python
from dataclasses import dataclass
from typing import List, Optional, Dict
from datetime import datetime

@dataclass
class Image:
    url: str
    secure_url: Optional[str] = None
    size: Optional[str] = None

@dataclass
class Product:
    # Identificação
    external_id: str  # ID da plataforma
    marketplace: str  # meli, shopee, tiktok
    title: str
    
    # Preço e quantidade
    price: float
    currency: str
    quantity: int
    sku: str
    
    # Descrição
    description: str
    
    # Mídia
    images: List[Image]
    
    # Atributos
    attributes: Dict[str, str]
    
    # Status
    status: str  # active, inactive, paused
    condition: str  # new, used
    
    # Rastreamento
    created_at: datetime
    updated_at: datetime
    synced_at: Optional[datetime] = None
    
    def to_dict(self) -> Dict:
        """Converter para dicionário"""
        return {
            'external_id': self.external_id,
            'marketplace': self.marketplace,
            'title': self.title,
            'price': self.price,
            'quantity': self.quantity,
            'sku': self.sku
        }
```

## Serviço de Sincronização (services/sync_service.py)

```python
from typing import List
from clients.mercado_livre_client import MercadoLivreClient
from models.product import Product
import logging

logger = logging.getLogger(__name__)

class SyncService:
    """Serviço para sincronizar produtos entre marketplaces"""
    
    def __init__(self, meli_client: MercadoLivreClient):
        self.meli_client = meli_client
    
    def sync_products(self, user_id: str) -> int:
        """Sincronizar produtos do Mercado Livre"""
        try:
            products = self.meli_client.get_products(user_id)
            logger.info(f"Sincronizando {len(products)} produtos")
            
            synced = 0
            for product_id in products:
                try:
                    self._sync_product(product_id)
                    synced += 1
                except Exception as e:
                    logger.error(f"Erro ao sincronizar {product_id}: {e}")
            
            return synced
        
        except Exception as e:
            logger.error(f"Erro na sincronização: {e}")
            raise
    
    def _sync_product(self, product_id: str):
        """Sincronizar um produto individual"""
        product_data = self.meli_client._make_request(
            'GET',
            f'https://api.mercadolibre.com/items/{product_id}'
        )
        
        # Aqui você salvaria no banco de dados
        logger.info(f"Produto {product_id} sincronizado")
```

## Webhook Handler (webhooks/handlers.py)

```python
from typing import Dict
from clients.mercado_livre_client import MercadoLivreClient
import logging

logger = logging.getLogger(__name__)

class WebhookHandler:
    """Handler para webhooks do Mercado Livre"""
    
    def __init__(self, meli_client: MercadoLivreClient):
        self.meli_client = meli_client
    
    def handle_order_notification(self, notification: Dict):
        """Tratar notificação de pedido"""
        order_id = notification['resource'].split('/')[-1]
        
        try:
            order = self.meli_client.get_order(order_id)
            
            # Processar por status
            if order['status'] == 'paid':
                self._handle_paid_order(order)
            elif order['status'] == 'cancelled':
                self._handle_cancelled_order(order)
            
            logger.info(f"Pedido {order_id} processado")
        
        except Exception as e:
            logger.error(f"Erro ao processar pedido {order_id}: {e}")
            raise
    
    def _handle_paid_order(self, order: Dict):
        """Processar pedido pago"""
        logger.info(f"Gerando rótulo para pedido {order['id']}")
        # Implementar lógica
    
    def _handle_cancelled_order(self, order: Dict):
        """Processar pedido cancelado"""
        logger.info(f"Pedido {order['id']} cancelado")
        # Implementar lógica
```

## Arquivo Principal (main.py)

```python
from flask import Flask, request
from clients.mercado_livre_client import MercadoLivreClient
from webhooks.handlers import WebhookHandler
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Inicializar cliente
meli_client = MercadoLivreClient(
    client_id=os.getenv('MELI_CLIENT_ID'),
    client_secret=os.getenv('MELI_CLIENT_SECRET'),
    redirect_uri=os.getenv('MELI_REDIRECT_URI')
)

handler = WebhookHandler(meli_client)

@app.route('/callback/meli', methods=['GET'])
def meli_callback():
    """Callback de autenticação do Mercado Livre"""
    code = request.args.get('code')
    meli_client.authenticate(code)
    return {'status': 'success'}

@app.route('/webhooks/meli', methods=['POST'])
def meli_webhook():
    """Receber webhooks do Mercado Livre"""
    notification = request.json
    
    if notification.get('topic') == 'orders_v2':
        handler.handle_order_notification(notification)
    
    return {'status': 'received'}, 200

if __name__ == '__main__':
    app.run(debug=True, port=5000)
```

## Requirements.txt

```
Flask==2.3.0
requests==2.31.0
python-dotenv==1.0.0
pytest==7.4.0
pytest-cov==4.1.0
flake8==6.0.0
black==23.7.0
SQLAlchemy==2.0.0
psycopg2-binary==2.9.0
```

## .env.example

```
# Mercado Livre
MELI_CLIENT_ID=xxxxx
MELI_CLIENT_SECRET=xxxxx
MELI_REDIRECT_URI=https://seu-app.com/callback/meli

# Shopee
SHOPEE_PARTNER_ID=xxxxx
SHOPEE_PARTNER_KEY=xxxxx

# TikTok Shop
TIKTOK_CLIENT_ID=xxxxx
TIKTOK_CLIENT_SECRET=xxxxx
TIKTOK_REDIRECT_URI=https://seu-app.com/callback/tiktok

# Banco de Dados
DATABASE_URL=postgresql://user:pass@localhost/marketplace

# Flask
FLASK_ENV=development
FLASK_DEBUG=True
```

---

Este é um exemplo básico. Para produção, adicione:
- Tratamento de erro mais robusto
- Caching
- Rate limiting
- Logging avançado
- Testes unitários
- Database migrations
