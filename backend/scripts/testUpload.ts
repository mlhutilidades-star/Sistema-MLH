import * as fs from 'fs';
import * as path from 'path';
import { UploadService } from '../src/modules/produtos/uploadService';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

async function main() {
  const filePath = getArg('--file') || getArg('-f');
  const apply = process.argv.includes('--apply');

  if (!filePath) {
    throw new Error('Uso: tsx scripts/testUpload.ts --file <caminho.xlsx|csv> [--apply]');
  }

  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const buffer = fs.readFileSync(abs);

  const uploadService = new UploadService();
  const tipo = uploadService.detectTipo('', abs);

  console.log('🔄 Processando planilha...', { tipo, file: abs });
  const parsed = await uploadService.processarPlanilha(buffer, tipo);

  console.log(`📊 Linhas: ${parsed.totalLinhas} | Válidas: ${parsed.validos.length} | Rejeitadas: ${parsed.rejeitados.length}`);
  console.log('📋 Preview (primeiros 5 válidos):');
  parsed.validos.slice(0, 5).forEach((p, i) => {
    const custo = (p.custoMedio || 0) > 0 ? p.custoMedio : p.precoCusto;
    console.log(`${i + 1}. ${p.sku} | ${p.descricao || ''} | custo=${custo} | estoque=${p.estoque ?? ''}`);
  });

  if (!apply) {
    console.log('✅ Simulação concluída (dados NÃO foram salvos). Use --apply para escrever no banco.');
    return;
  }

  console.log('💾 Aplicando atualização no banco...');
  const result = await uploadService.atualizarCustos(parsed.validos);
  console.log('✅ Resultado:', result);
}

main().catch((e) => {
  console.error('❌ Erro:', e?.message || e);
  process.exitCode = 1;
});
