/**
 * contract.ts
 *
 * Carrega e tipifica o contrato YAML da Shopee.
 * Fonte single-source-of-truth: contracts/shopee.endpoints.yaml
 *
 * Regra: a integração só pode mapear campos definidos neste contrato.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContractEnvVar {
  name: string;
  type: string;
  required: boolean;
  secret?: boolean;
  default?: string;
  description?: string;
  todo?: string;
}

export interface ContractSignature {
  algorithm: string;
  base_string_formula: string;
  key: string;
}

export interface ContractAuth {
  type: string;
  flow: string;
  env_vars: ContractEnvVar[];
  signature: ContractSignature;
}

export interface ContractParam {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  todo?: string;
}

export interface ContractResponseField {
  name: string;
  type: string;
  jsonPath: string;
  required: boolean;
  todo?: string;
}

export interface ContractEndpoint {
  name: string;
  method: string;
  path: string;
  description: string;
  requiredParams: ContractParam[];
  optionalParams?: ContractParam[];
  responseFields: ContractResponseField[];
  notes?: string;
  todos: string[];
}

export interface ContractCommonParams {
  description: string;
  params: ContractParam[];
}

export interface ShopeeContract {
  auth: ContractAuth;
  common_params: ContractCommonParams;
  endpoints: ContractEndpoint[];
}

// ─── Loader ───────────────────────────────────────────────────────────────────

let _cached: ShopeeContract | null = null;

/**
 * Carrega o contrato YAML e retorna tipado.
 * Usa cache em memória para evitar re-leitura.
 */
export function loadContract(): ShopeeContract {
  if (_cached) return _cached;

  const contractPath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'contracts',
    'shopee.endpoints.yaml'
  );

  if (!fs.existsSync(contractPath)) {
    throw new Error(
      `Contrato Shopee não encontrado: ${contractPath}. Execute o build a partir da raiz do projeto.`
    );
  }

  const raw = fs.readFileSync(contractPath, 'utf-8');
  _cached = yaml.load(raw) as ShopeeContract;
  return _cached;
}

/**
 * Retorna um endpoint pelo nome.
 * Lança erro se não encontrar.
 */
export function getEndpoint(name: string): ContractEndpoint {
  const contract = loadContract();
  const ep = contract.endpoints.find((e) => e.name === name);
  if (!ep) {
    throw new Error(
      `Endpoint "${name}" não definido no contrato Shopee. ` +
        `Endpoints disponíveis: ${contract.endpoints.map((e) => e.name).join(', ')}`
    );
  }
  return ep;
}

/**
 * Verifica se um campo existe no contrato para um endpoint.
 * Usado pelos clients para rejeitar campos não mapeados.
 */
export function isFieldMapped(
  endpointName: string,
  fieldName: string
): boolean {
  const ep = getEndpoint(endpointName);
  return ep.responseFields.some((f) => f.name === fieldName);
}

/**
 * Retorna os campos obrigatórios de um endpoint.
 */
export function getRequiredFields(
  endpointName: string
): ContractResponseField[] {
  const ep = getEndpoint(endpointName);
  return ep.responseFields.filter((f) => f.required);
}

/**
 * Retorna campos que ainda têm TODO no contrato.
 */
export function getUnconfirmedFields(
  endpointName: string
): ContractResponseField[] {
  const ep = getEndpoint(endpointName);
  return ep.responseFields.filter(
    (f) => f.todo && /TODO/i.test(f.todo)
  );
}

/**
 * Checa se o endpoint tem TODOs pendentes (endpoint-level).
 */
export function hasEndpointTodos(endpointName: string): boolean {
  const ep = getEndpoint(endpointName);
  return ep.todos.length > 0;
}
