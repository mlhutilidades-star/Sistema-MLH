"use strict";
// ==========================================
// SCRIPT SEED - Dados Iniciais
// ==========================================
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../src/shared/database");
const logger_1 = require("../src/shared/logger");
const prisma = (0, database_1.getPrismaClient)();
async function seed() {
    logger_1.logger.info('Iniciando seed do banco de dados...');
    try {
        // Limpar dados existentes (apenas em desenvolvimento)
        if (process.env.NODE_ENV === 'development') {
            logger_1.logger.info('Limpando dados existentes...');
            await prisma.logSync.deleteMany();
            await prisma.consumoAds.deleteMany();
            await prisma.regraConciliacao.deleteMany();
            await prisma.extratoBanco.deleteMany();
            await prisma.contaReceber.deleteMany();
            await prisma.contaPagar.deleteMany();
            await prisma.produto.deleteMany();
        }
        // Produtos de exemplo
        logger_1.logger.info('Criando produtos de exemplo...');
        await prisma.produto.createMany({
            data: [
                {
                    sku: 'PROD001',
                    descricao: 'Produto Exemplo 1',
                    ncm: '12345678',
                    custoReal: 50.00,
                    precoVenda: 100.00,
                    estoqueTiny: 10,
                    ativo: true,
                },
                {
                    sku: 'PROD002',
                    descricao: 'Produto Exemplo 2',
                    ncm: '87654321',
                    custoReal: 75.00,
                    precoVenda: 150.00,
                    estoqueTiny: 5,
                    ativo: true,
                },
                {
                    sku: 'PROD003',
                    descricao: 'Produto Exemplo 3',
                    custoReal: 30.00,
                    precoVenda: 60.00,
                    estoqueTiny: 20,
                    ativo: true,
                },
            ],
        });
        // Regras de conciliação
        logger_1.logger.info('Criando regras de conciliação...');
        await prisma.regraConciliacao.createMany({
            data: [
                {
                    padrao: 'PIX|TRANSFERENCIA',
                    categoria: 'RECEITA_VENDA',
                    tipo: 'RECEITA',
                    prioridade: 10,
                    descricao: 'Pagamentos recebidos via PIX ou transferência',
                },
                {
                    padrao: 'SHOPEE|MERCADO PAGO',
                    categoria: 'RECEITA_MARKETPLACE',
                    tipo: 'RECEITA',
                    prioridade: 9,
                    descricao: 'Receitas de marketplaces',
                },
                {
                    padrao: 'FORNECEDOR|COMPRA',
                    categoria: 'DESPESA_FORNECEDOR',
                    tipo: 'DESPESA',
                    prioridade: 8,
                    descricao: 'Pagamentos a fornecedores',
                },
                {
                    padrao: 'ALUGUEL|CONDOMINIO',
                    categoria: 'DESPESA_FIXA',
                    tipo: 'DESPESA',
                    prioridade: 7,
                    descricao: 'Despesas fixas mensais',
                },
                {
                    padrao: 'ENERGIA|AGUA|INTERNET',
                    categoria: 'DESPESA_UTILIDADE',
                    tipo: 'DESPESA',
                    prioridade: 6,
                    descricao: 'Contas de utilidades',
                },
            ],
        });
        // Contas a pagar de exemplo
        logger_1.logger.info('Criando contas a pagar de exemplo...');
        const hoje = new Date();
        const proximoMes = new Date();
        proximoMes.setMonth(proximoMes.getMonth() + 1);
        await prisma.contaPagar.createMany({
            data: [
                {
                    vencimento: proximoMes,
                    descricao: 'Fornecedor XYZ - Mercadorias',
                    fornecedor: 'Fornecedor XYZ Ltda',
                    categoria: 'FORNECEDOR',
                    valor: 5000.00,
                    status: 'PENDENTE',
                },
                {
                    vencimento: proximoMes,
                    descricao: 'Aluguel Janeiro 2026',
                    fornecedor: 'Imobiliária ABC',
                    categoria: 'DESPESA_FIXA',
                    valor: 3000.00,
                    status: 'PENDENTE',
                },
            ],
        });
        // Contas a receber de exemplo
        logger_1.logger.info('Criando contas a receber de exemplo...');
        await prisma.contaReceber.createMany({
            data: [
                {
                    previsao: proximoMes,
                    cliente: 'Cliente ABC',
                    categoria: 'VENDA',
                    valorBruto: 10000.00,
                    taxas: 500.00,
                    custoAds: 300.00,
                    liquido: 9200.00,
                    status: 'PENDENTE',
                },
                {
                    previsao: hoje,
                    cliente: 'Shopee - Pedidos',
                    categoria: 'MARKETPLACE',
                    valorBruto: 5000.00,
                    taxas: 750.00,
                    custoAds: 200.00,
                    liquido: 4050.00,
                    status: 'RECEBIDO',
                },
            ],
        });
        logger_1.logger.info('✅ Seed concluído com sucesso!');
        // Estatísticas
        const stats = {
            produtos: await prisma.produto.count(),
            regras: await prisma.regraConciliacao.count(),
            contasPagar: await prisma.contaPagar.count(),
            contasReceber: await prisma.contaReceber.count(),
        };
        logger_1.logger.info('Estatísticas:', stats);
    }
    catch (error) {
        logger_1.logger.error('Erro ao executar seed', { error });
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
// Executar seed
seed()
    .catch((error) => {
    logger_1.logger.error('Erro fatal no seed', { error });
    process.exit(1);
});
//# sourceMappingURL=seed.js.map