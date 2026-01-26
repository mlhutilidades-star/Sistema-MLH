import { Request, Response } from 'express';

function setDashboardCsp(res: Response): void {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
}

export function dashboardUiHandler(_req: Request, res: Response): void {
  setDashboardCsp(res);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  res.end(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dashboard - Saúde do Negócio</title>
  <style>
    :root { --bg:#0b1220; --card:#111a2e; --txt:#e9eefc; --muted:#a9b7df; --ok:#35d07f; --warn:#ffcc66; --bad:#ff6b6b; --line:#223055; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background: var(--bg); color: var(--txt); }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .sub { color: var(--muted); margin-bottom: 16px; }
    .row { display:flex; gap:12px; flex-wrap:wrap; align-items:end; margin-bottom: 18px; }
    .box { background: var(--card); border:1px solid var(--line); border-radius: 12px; padding: 14px; }
    .filters { flex:1; min-width: 260px; }
    label { display:block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    input { background:#0d1730; border:1px solid var(--line); color: var(--txt); padding: 10px; border-radius: 10px; width: 100%; box-sizing: border-box; }
    .btn { cursor:pointer; background:#2b56ff; border:none; color:white; padding: 10px 14px; border-radius: 10px; font-weight:600; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .cards { display:grid; grid-template-columns: repeat(3, minmax(220px, 1fr)); gap:12px; margin-top: 10px; }
    .card .k { color: var(--muted); font-size: 12px; }
    .card .v { font-size: 22px; font-weight: 700; margin-top: 8px; }
    .card .s { color: var(--muted); font-size: 12px; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align:left; padding: 10px; border-bottom: 1px solid var(--line); font-size: 14px; }
    th { color: var(--muted); font-weight: 600; }
    .tag { display:inline-block; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .tag.CRITICO { background: rgba(255,107,107,0.16); color: var(--bad); border: 1px solid rgba(255,107,107,0.35); }
    .tag.SAUDAVEL { background: rgba(255,204,102,0.16); color: var(--warn); border: 1px solid rgba(255,204,102,0.35); }
    .tag.EXCELENTE { background: rgba(53,208,127,0.16); color: var(--ok); border: 1px solid rgba(53,208,127,0.35); }
    .err { color: var(--bad); white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Saúde do Negócio</h1>
    <div class="sub">Visão consolidada (renda, ads e lucro real final)</div>

    <div class="row">
      <div class="box filters">
        <div class="row" style="margin:0; align-items:center;">
          <div style="flex:1; min-width: 160px;">
            <label>Data início</label>
            <input id="inicio" type="date" />
          </div>
          <div style="flex:1; min-width: 160px;">
            <label>Data fim</label>
            <input id="fim" type="date" />
          </div>
          <div style="min-width: 140px;">
            <label>&nbsp;</label>
            <button id="btn" class="btn">Atualizar</button>
          </div>
        </div>
        <div id="status" class="sub" style="margin:10px 0 0;"></div>
        <div id="err" class="err"></div>
      </div>
    </div>

    <div class="cards">
      <div class="box card">
        <div class="k">Renda Líquida</div>
        <div id="renda" class="v">—</div>
        <div id="rendaSub" class="s">—</div>
      </div>
      <div class="box card">
        <div class="k">Gasto Ads</div>
        <div id="ads" class="v">—</div>
        <div class="s">Shopee Ads (ConsumoAds)</div>
      </div>
      <div class="box card">
        <div class="k">Lucro Real</div>
        <div id="lucro" class="v">—</div>
        <div id="lucroSub" class="s">—</div>
      </div>
    </div>

    <div class="box" style="margin-top: 14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <h2 style="margin:0; font-size: 16px;">Top 5 produtos que mais deram dinheiro</h2>
        <div class="sub" style="margin:0;">baseado em PedidoItem</div>
      </div>
      <div style="margin-top: 10px; overflow:auto;">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Descrição</th>
              <th>Qtd</th>
              <th>Renda</th>
              <th>Custo</th>
              <th>Lucro</th>
              <th>Margem</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="top"></tbody>
        </table>
      </div>
    </div>
  </div>

<script>
  const fmtMoney = (n) => {
    const v = Number(n || 0);
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const fmtPct = (n) => {
    const v = Number(n || 0);
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  };

  function dateToYMD(d) {
    const pad = (x) => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  async function fetchJson(url) {
    const r = await fetch(url, { headers: { 'accept': 'application/json' } });
    const text = await r.text();
    try { return { ok: r.ok, status: r.status, data: JSON.parse(text) }; }
    catch { return { ok: r.ok, status: r.status, data: { raw: text } }; }
  }

  async function atualizar() {
    const inicio = document.getElementById('inicio').value;
    const fim = document.getElementById('fim').value;
    const btn = document.getElementById('btn');
    const err = document.getElementById('err');
    const status = document.getElementById('status');

    err.textContent = '';
    status.textContent = 'Carregando...';
    btn.disabled = true;

    try {
      const q = new URLSearchParams({ dataInicio: inicio, dataFim: fim });

      const [lucroTotal, topLucro] = await Promise.all([
        fetchJson('/api/relatorios/lucro-total?' + q.toString()),
        fetchJson('/api/relatorios/top-lucro?limit=5&' + q.toString()),
      ]);

      if (!lucroTotal.ok) {
        throw new Error('lucro-total: ' + JSON.stringify(lucroTotal.data));
      }
      if (!topLucro.ok) {
        throw new Error('top-lucro: ' + JSON.stringify(topLucro.data));
      }

      const lt = lucroTotal.data;
      document.getElementById('renda').textContent = fmtMoney(lt.rendaLiquida);
      document.getElementById('ads').textContent = fmtMoney(lt.gastoAds);
      document.getElementById('lucro').textContent = fmtMoney(lt.lucroRealFinal);

      document.getElementById('rendaSub').textContent = 'Bruto: ' + fmtMoney(lt.faturamentoBruto) + ' | Taxas: ' + fmtMoney(lt.taxasShopee);
      document.getElementById('lucroSub').textContent = 'Margem média: ' + fmtPct(lt.margemMedia);

      const rows = (topLucro.data.data || []).map((r) => {
        return '<tr>'
          + '<td>' + (r.sku || '') + '</td>'
          + '<td>' + (r.descricao || '') + '</td>'
          + '<td>' + (r.quantidade || 0) + '</td>'
          + '<td>' + fmtMoney(r.renda) + '</td>'
          + '<td>' + fmtMoney(r.custo) + '</td>'
          + '<td>' + fmtMoney(r.lucro) + '</td>'
          + '<td>' + fmtPct(r.margemPorcentagem) + '</td>'
          + '<td><span class="tag ' + (r.status || 'SAUDAVEL') + '">' + (r.status || '') + '</span></td>'
          + '</tr>';
      }).join('');

      document.getElementById('top').innerHTML = rows || '<tr><td colspan="8" class="sub">Sem dados no período</td></tr>';

      status.textContent = 'Atualizado em ' + new Date().toLocaleString('pt-BR');
    } catch (e) {
      err.textContent = String(e && e.message ? e.message : e);
      status.textContent = '';
    } finally {
      btn.disabled = false;
    }
  }

  (function init(){
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 30);
    document.getElementById('inicio').value = dateToYMD(inicio);
    document.getElementById('fim').value = dateToYMD(fim);
    document.getElementById('btn').addEventListener('click', atualizar);
    atualizar();
  })();
</script>
</body>
</html>`);
}
