import type { Produto, Pedido } from '@prisma/client';

type ShopeeOrderLike = {
  escrow_amount?: number;
  total_amount?: number;
  estimated_shipping_fee?: number;
  actual_shipping_fee?: number;
  item_list?: Array<{
    item_sku?: string;
    model_sku?: string;
    model_quantity_purchased?: number;
    model_discounted_price?: number;
    item_name?: string;
  }>;
};

export class LucroService {
  calcularRendaLiquidaPedido(pedidoShopee: ShopeeOrderLike): number {
    const escrow = Number(pedidoShopee.escrow_amount ?? 0) || 0;
    if (escrow > 0) return escrow;

    const total = Number(pedidoShopee.total_amount ?? 0) || 0;
    const shipping =
      Number(pedidoShopee.actual_shipping_fee ?? pedidoShopee.estimated_shipping_fee ?? 0) || 0;

    const totalMinusShipping = total - shipping;
    if (totalMinusShipping > 0) return totalMinusShipping;

    const itemTotal = (pedidoShopee.item_list || []).reduce((sum, it) => {
      const qty = Number(it.model_quantity_purchased ?? 0) || 0;
      const price = Number(it.model_discounted_price ?? 0) || 0;
      return sum + price * qty;
    }, 0);
    if (itemTotal > 0) return itemTotal;

    return total;
  }

  calcularLucroPedido(pedidoShopee: ShopeeOrderLike, produtos: Produto[]): {
    rendaLiquida: number;
    custoProdutos: number;
    lucro: number;
    margem: number;
  } {
    const rendaLiquida = this.calcularRendaLiquidaPedido(pedidoShopee);

    const produtoBySku = new Map<string, Produto>();
    for (const p of produtos) {
      produtoBySku.set(String(p.sku).trim().toLowerCase(), p);
    }

    let custoProdutos = 0;
    for (const item of pedidoShopee.item_list || []) {
      const sku = String(item.model_sku || item.item_sku || '').trim();
      if (!sku) continue;
      const qty = Number(item.model_quantity_purchased ?? 0) || 0;
      if (qty <= 0) continue;

      const produto = produtoBySku.get(sku.toLowerCase());
      const custoUnit = Number(produto?.custoReal ?? 0) || 0;
      custoProdutos += custoUnit * qty;
    }

    const lucro = rendaLiquida - custoProdutos;
    const margem = rendaLiquida > 0 ? (lucro / rendaLiquida) * 100 : 0;
    return { rendaLiquida, custoProdutos, lucro, margem };
  }

  calcularLucroAnuncio(
    anuncioShopee: any,
    pedidosRelacionados: Array<Pick<Pedido, 'rendaLiquida' | 'custoProdutos'>>
  ): {
    gasto: number;
    rendaGerada: number;
    custoProdutos: number;
    lucro: number;
    roi: number;
  } {
    const gasto = Number(anuncioShopee?.spend ?? anuncioShopee?.gasto ?? 0) || 0;
    const rendaGerada = pedidosRelacionados.reduce((sum, p) => sum + (Number(p.rendaLiquida) || 0), 0);
    const custoProdutos = pedidosRelacionados.reduce((sum, p) => sum + (Number(p.custoProdutos) || 0), 0);
    const lucro = rendaGerada - custoProdutos - gasto;
    const roi = gasto > 0 ? (lucro / gasto) * 100 : 0;
    return { gasto, rendaGerada, custoProdutos, lucro, roi };
  }
}
