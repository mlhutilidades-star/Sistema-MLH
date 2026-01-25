import { Request, Response } from 'express';

export function mapeamentoUiHandler(_req: Request, res: Response) {
  // Interface simples, sem build tooling.
  // Proteção: as rotas da API exigem x-admin-secret; a UI apenas facilita chamadas.
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mapeamento SKU Shopee → Tiny</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; background: #0b1220; color: #e6edf3; }
    h1 { margin: 0 0 12px; font-size: 20px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    input, button { border-radius: 10px; border: 1px solid #2d3a55; background: #111a2e; color: #e6edf3; padding: 10px 12px; }
    input { min-width: 220px; }
    button { cursor: pointer; }
    button:hover { background: #15223d; }
    .card { margin-top: 14px; border: 1px solid #2d3a55; border-radius: 14px; padding: 14px; background: #0f1730; }
    .muted { color: #9fb0c0; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border-bottom: 1px solid #22304a; padding: 10px; text-align: left; vertical-align: top; }
    th { color: #9fb0c0; font-weight: 600; }
    .code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; }
    .pill { padding: 2px 8px; border: 1px solid #2d3a55; border-radius: 999px; font-size: 12px; color: #9fb0c0; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .tiny-results { margin-top: 8px; }
    .tiny-item { display:flex; justify-content: space-between; gap: 10px; padding: 8px; border: 1px solid #22304a; border-radius: 10px; margin-top: 6px; }
    .tiny-item b { font-weight: 600; }
  </style>
</head>
<body>
  <h1>Mapeamento SKU Shopee → Código Tiny</h1>
  <div class="muted">A API exige <span class="code">x-admin-secret</span> (mesmo <span class="code">OAUTH_ADMIN_SECRET</span> do Railway). A UI só facilita o preenchimento.</div>

  <div class="card">
    <div class="row">
      <label>Admin secret<br><input id="secret" type="password" placeholder="x-admin-secret" /></label>
      <label>Dias<br><input id="days" type="number" value="30" min="1" max="365" /></label>
      <button id="load">Carregar pendentes</button>
      <span id="status" class="muted"></span>
    </div>

    <div id="results"></div>
  </div>

  <div class="card">
    <div class="row">
      <div>
        <div style="font-weight:600; margin-bottom:6px;">Importar em lote</div>
        <div class="muted">Cole linhas no formato <span class="code">SKU,codigoTiny</span> (ou <span class="code">SKU=codigoTiny</span>). Um por linha.</div>
      </div>
    </div>
    <div style="margin-top:10px;">
      <textarea id="bulk" style="width:100%; min-height:140px; border-radius: 10px; border: 1px solid #2d3a55; background: #111a2e; color: #e6edf3; padding: 10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px;" placeholder="27083093496-ITEM A,12345\n27083093496-ITEM B,67890\n..."></textarea>
    </div>
    <div class="row" style="margin-top:10px;">
      <button id="bulkImport">Importar + atualizar custo</button>
      <span id="bulkStatus" class="muted"></span>
    </div>
  </div>

<script>
  const $ = (id) => document.getElementById(id);
  const secretEl = $('secret');
  const daysEl = $('days');
  const statusEl = $('status');
  const resultsEl = $('results');
  const bulkEl = $('bulk');
  const bulkStatusEl = $('bulkStatus');

  secretEl.value = localStorage.getItem('mlh_admin_secret') || '';
  secretEl.addEventListener('change', () => localStorage.setItem('mlh_admin_secret', secretEl.value));

  async function api(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json', 'x-admin-secret': secretEl.value }, opts.headers || {});
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || res.statusText);
    return data;
  }

  function parseBulkMappings(text) {
    const lines = String(text || '').split(/\r?\n/);
    const items = [];
    for (const rawLine of lines) {
      const line = String(rawLine || '').trim();
      if (!line) continue;
      if (line.startsWith('#')) continue;

      const seps = [',', ';', '\t', '=', '|'];
      let pos = -1;
      let sep = '';
      for (const s of seps) {
        const p = line.indexOf(s);
        if (p > 0) { pos = p; sep = s; break; }
      }

      if (pos < 0) {
        throw new Error('Linha inválida (sem separador): ' + line);
      }

      const skuShopee = line.slice(0, pos).trim();
      const codigoTiny = line.slice(pos + sep.length).trim();
      if (!skuShopee || !codigoTiny) {
        throw new Error('Linha inválida (campos vazios): ' + line);
      }
      items.push({ skuShopee, codigoTiny });
    }
    return items;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[c]));
  }

  async function loadPendentes() {
    statusEl.textContent = 'Carregando...';
    resultsEl.innerHTML = '';
    const days = Number(daysEl.value || 30);
    const data = await api('/api/mapeamento/pendentes?days=' + encodeURIComponent(days));

    const items = data.pendentes || [];
    statusEl.textContent = 'Sold SKUs: ' + data.soldSkus + ' | Pendentes: ' + items.length;

    if (!items.length) {
      resultsEl.innerHTML = '<div class="muted">Nenhum SKU pendente 🎉</div>';
      return;
    }

    const rows = items.map((p, idx) => {
      const mapping = p.mapping?.codigoTiny || '';
      return (
        '\n<tr>' +
          '<td>' + (idx + 1) + '</td>' +
          '<td class="code">' + escapeHtml(p.sku) + '</td>' +
          '<td>' + escapeHtml(p.descricao || '') + '</td>' +
          '<td><span class="pill">' + escapeHtml(p.custoStatus) + '</span> <span class="muted">' + (p.custoReal || 0) + '</span></td>' +
          '<td>' +
            '<div class="actions">' +
              '<input class="code" data-sku="' + escapeHtml(p.sku) + '" value="' + escapeHtml(mapping) + '" placeholder="codigoTiny" />' +
              '<button data-action="buscar" data-sku="' + escapeHtml(p.sku) + '">Buscar no Tiny</button>' +
              '<button data-action="salvar" data-sku="' + escapeHtml(p.sku) + '">Salvar + atualizar custo</button>' +
            '</div>' +
            '<div class="tiny-results" id="tiny-' + escapeHtml(p.sku) + '"></div>' +
          '</td>' +
        '</tr>\n'
      );
    }).join('');

    resultsEl.innerHTML =
      '<table>' +
        '<thead>' +
          '<tr><th>#</th><th>SKU Shopee</th><th>Descrição</th><th>Status</th><th>Mapear</th></tr>' +
        '</thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';

    resultsEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = btn.getAttribute('data-action');
        const sku = btn.getAttribute('data-sku');
        const input = resultsEl.querySelector('input[data-sku="' + CSS.escape(sku) + '"]');
        const out = $('tiny-' + sku);

        try {
          if (action === 'buscar') {
            const q = (sku || '').replace(/^\d{6,}\s*[-_\/]\s*/, '');
            out.textContent = 'Buscando...';
            const r = await api('/api/mapeamento/buscar-tiny?q=' + encodeURIComponent(q));
            const list = (r.data || []).slice(0, 8);
            if (!list.length) { out.innerHTML = '<div class="muted">Nenhum resultado no Tiny.</div>'; return; }
            out.innerHTML = list.map((it) =>
              '<div class="tiny-item">' +
                '<div><b class="code">' + escapeHtml(it.codigo) + '</b><div class="muted">' + escapeHtml(it.nome || '') + '</div></div>' +
                '<div><button data-pick="' + escapeHtml(it.codigo) + '" data-sku="' + escapeHtml(sku) + '">Usar</button></div>' +
              '</div>'
            ).join('');
            out.querySelectorAll('button[data-pick]').forEach((pickBtn) => {
              pickBtn.addEventListener('click', () => {
                input.value = pickBtn.getAttribute('data-pick');
              });
            });
          }

          if (action === 'salvar') {
            const codigoTiny = (input?.value || '').trim();
            if (!codigoTiny) throw new Error('Informe o codigoTiny');
            btn.disabled = true;
            btn.textContent = 'Salvando...';
            await api('/api/mapeamento/adicionar', {
              method: 'POST',
              body: JSON.stringify({ skuShopee: sku, codigoTiny, atualizarCusto: true }),
            });
            btn.textContent = 'Salvo';
          }
        } catch (e) {
          console.error(e);
          alert(e.message || String(e));
        } finally {
          btn.disabled = false;
          if (action === 'salvar') btn.textContent = 'Salvar + atualizar custo';
        }
      });
    });
  }

  $('load').addEventListener('click', () => loadPendentes().catch((e) => {
    statusEl.textContent = 'Erro: ' + (e.message || String(e));
  }));

  $('bulkImport').addEventListener('click', async () => {
    try {
      bulkStatusEl.textContent = 'Preparando...';
      const items = parseBulkMappings(bulkEl.value);
      if (!items.length) {
        bulkStatusEl.textContent = 'Nada para importar.';
        return;
      }

      bulkStatusEl.textContent = 'Importando ' + items.length + '...';
      const r = await api('/api/mapeamento/importar', {
        method: 'POST',
        body: JSON.stringify({ items, atualizarCusto: true }),
      });

      const errCount = (r.errors || []).length;
      bulkStatusEl.textContent =
        'Importados: ' + (r.ok || 0) + '/' + (r.total || items.length) +
        ' | Custos atualizados: ' + (r.custoAtualizado || 0) +
        (errCount ? ' | Erros: ' + errCount : '');

      if (errCount) {
        console.error('Erros na importação:', r.errors);
        alert('Importação finalizou com erros. Veja o console para detalhes.');
      }
    } catch (e) {
      console.error(e);
      bulkStatusEl.textContent = 'Erro: ' + (e.message || String(e));
      alert(e.message || String(e));
    }
  });
</script>
</body>
</html>`);
}
