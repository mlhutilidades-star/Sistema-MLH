import { Request, Response } from 'express';

export function produtosUploadUiHandler(_req: Request, res: Response) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Upload planilha Tiny (custos)</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; background: #0b1220; color: #e6edf3; }
    h1 { margin: 0 0 12px; font-size: 20px; }
    .muted { color: #9fb0c0; font-size: 12px; }
    .card { margin-top: 14px; border: 1px solid #2d3a55; border-radius: 14px; padding: 14px; background: #0f1730; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    input, button { border-radius: 10px; border: 1px solid #2d3a55; background: #111a2e; color: #e6edf3; padding: 10px 12px; }
    input[type="file"] { padding: 8px; }
    button { cursor: pointer; }
    button:hover { background: #15223d; }
    pre { white-space: pre-wrap; word-break: break-word; background: #0b1220; border: 1px solid #22304a; padding: 12px; border-radius: 12px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border-bottom: 1px solid #22304a; padding: 10px; text-align: left; vertical-align: top; }
    th { color: #9fb0c0; font-weight: 600; }
    .code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Importar custos via planilha (Tiny)</h1>
  <div class="muted">Endpoints: <span class="code">POST /api/produtos/preview-planilha</span> e <span class="code">POST /api/produtos/upload-planilha</span>. Protegido por <span class="code">x-admin-secret</span> (OAUTH_ADMIN_SECRET).</div>

  <div class="card">
    <div class="row">
      <label>Admin secret<br><input id="secret" type="password" placeholder="x-admin-secret" /></label>
      <label>Arquivo<br><input id="file" type="file" accept=".xlsx,.xls,.csv" /></label>
      <button id="preview">Preview</button>
      <button id="upload">Upload + atualizar custos</button>
      <span id="status" class="muted"></span>
    </div>

    <div id="out" style="margin-top:12px;"></div>
  </div>

<script>
  const $ = (id) => document.getElementById(id);
  const secretEl = $('secret');
  const fileEl = $('file');
  const statusEl = $('status');
  const outEl = $('out');

  secretEl.value = localStorage.getItem('mlh_admin_secret') || '';
  secretEl.addEventListener('change', () => localStorage.setItem('mlh_admin_secret', secretEl.value));

  function escapeHtml(s) {
    return String(s).replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[c]));
  }

  async function postFile(path) {
    const f = fileEl.files && fileEl.files[0];
    if (!f) throw new Error('Selecione um arquivo');

    const form = new FormData();
    form.append('planilha', f);

    const res = await fetch(path, {
      method: 'POST',
      headers: { 'x-admin-secret': secretEl.value },
      body: form,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || data?.message || res.statusText);
    return data;
  }

  function renderPreview(data) {
    const rows = (data.preview || []).map((p, idx) =>
      '<tr>' +
        '<td>' + (idx + 1) + '</td>' +
        '<td class="code">' + escapeHtml(p.sku) + '</td>' +
        '<td>' + escapeHtml(p.descricao || '') + '</td>' +
        '<td>' + escapeHtml(p.custoMedio ?? '') + '</td>' +
        '<td>' + escapeHtml(p.precoCusto ?? '') + '</td>' +
        '<td>' + escapeHtml(p.estoque ?? '') + '</td>' +
      '</tr>'
    ).join('');

    outEl.innerHTML =
      '<div class="muted">Tipo: <span class="code">' + escapeHtml(data.tipo) + '</span> | Total linhas: ' + data.totalLinhas +
      ' | Válidos: ' + data.validos + ' | Rejeitados: ' + data.rejeitados + '</div>' +
      '<table>' +
        '<thead><tr><th>#</th><th>SKU</th><th>Descrição</th><th>Custo médio</th><th>Preço custo</th><th>Estoque</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';
  }

  $('preview').addEventListener('click', async () => {
    try {
      statusEl.textContent = 'Enviando preview...';
      outEl.innerHTML = '';
      const data = await postFile('/api/produtos/preview-planilha');
      renderPreview(data);
      statusEl.textContent = 'Preview OK.';
    } catch (e) {
      statusEl.textContent = 'Erro: ' + (e.message || String(e));
      outEl.innerHTML = '';
      alert(e.message || String(e));
    }
  });

  $('upload').addEventListener('click', async () => {
    try {
      statusEl.textContent = 'Enviando upload...';
      outEl.innerHTML = '';
      const data = await postFile('/api/produtos/upload-planilha');
      statusEl.textContent = 'Upload OK.';
      outEl.innerHTML = '<pre class="code">' + escapeHtml(JSON.stringify(data, null, 2)) + '</pre>';
    } catch (e) {
      statusEl.textContent = 'Erro: ' + (e.message || String(e));
      outEl.innerHTML = '';
      alert(e.message || String(e));
    }
  });
</script>
</body>
</html>`);
}
