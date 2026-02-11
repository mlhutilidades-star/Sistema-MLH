/**
 * validateShopeeContract.ts
 *
 * Valida o contrato em contracts/shopee.endpoints.yaml.
 * Falha com exit code 1 se encontrar:
 *   - Qualquer TODO em campos marcados como required
 *   - Campos sem "type" definido
 *   - Endpoints sem "method" ou "path"
 *
 * Uso: ts-node scripts/validateShopeeContract.ts
 * No build: npm run validate:contracts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnvVar {
  name: string;
  type?: string;
  required?: boolean;
  todo?: string;
}

interface Param {
  name: string;
  type?: string;
  required?: boolean;
  todo?: string;
  description?: string;
}

interface ResponseField {
  name: string;
  type?: string;
  jsonPath?: string;
  required?: boolean;
  todo?: string;
}

interface Endpoint {
  name: string;
  method?: string;
  path?: string;
  description?: string;
  requiredParams?: Param[];
  optionalParams?: Param[];
  responseFields?: ResponseField[];
  notes?: string;
  todos?: string[];
}

interface Auth {
  type?: string;
  env_vars?: EnvVar[];
}

interface Contract {
  auth?: Auth;
  endpoints?: Endpoint[];
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface ValidationError {
  severity: 'error' | 'warning';
  location: string;
  message: string;
}

function containsTodo(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /TODO/i.test(value);
}

function validate(contract: Contract): ValidationError[] {
  const errors: ValidationError[] = [];

  // ── Auth env vars ──
  if (contract.auth?.env_vars) {
    for (const envVar of contract.auth.env_vars) {
      if (!envVar.type) {
        errors.push({
          severity: 'error',
          location: `auth.env_vars.${envVar.name}`,
          message: `Env var "${envVar.name}" não tem "type" definido.`,
        });
      }
      if (envVar.required && envVar.todo && containsTodo(envVar.todo)) {
        errors.push({
          severity: 'warning',
          location: `auth.env_vars.${envVar.name}`,
          message: `Env var required "${envVar.name}" tem TODO: ${envVar.todo}`,
        });
      }
    }
  }

  // ── Endpoints ──
  if (!contract.endpoints || contract.endpoints.length === 0) {
    errors.push({
      severity: 'error',
      location: 'endpoints',
      message: 'Nenhum endpoint definido no contrato.',
    });
    return errors;
  }

  for (const ep of contract.endpoints) {
    const loc = `endpoints.${ep.name}`;

    // method obrigatório
    if (!ep.method) {
      errors.push({
        severity: 'error',
        location: loc,
        message: `Endpoint "${ep.name}" não tem "method" definido.`,
      });
    }

    // path obrigatório e não pode ser TODO
    if (!ep.path) {
      errors.push({
        severity: 'error',
        location: loc,
        message: `Endpoint "${ep.name}" não tem "path" definido.`,
      });
    } else if (containsTodo(ep.path)) {
      errors.push({
        severity: 'error',
        location: `${loc}.path`,
        message: `Endpoint "${ep.name}" tem path com TODO: "${ep.path}"`,
      });
    }

    // requiredParams — cada um precisa de type
    if (ep.requiredParams) {
      for (const param of ep.requiredParams) {
        if (!param.type) {
          errors.push({
            severity: 'error',
            location: `${loc}.requiredParams.${param.name}`,
            message: `Param required "${param.name}" não tem "type" definido.`,
          });
        }
        if (param.todo && containsTodo(param.todo)) {
          errors.push({
            severity: 'warning',
            location: `${loc}.requiredParams.${param.name}`,
            message: `Param required "${param.name}" tem TODO: ${param.todo}`,
          });
        }
      }
    }

    // responseFields — required fields com TODO ou sem type
    if (ep.responseFields) {
      for (const field of ep.responseFields) {
        if (!field.type) {
          errors.push({
            severity: 'error',
            location: `${loc}.responseFields.${field.name}`,
            message: `Response field "${field.name}" não tem "type" definido.`,
          });
        }

        if (field.required && field.todo && containsTodo(field.todo)) {
          errors.push({
            severity: 'error',
            location: `${loc}.responseFields.${field.name}`,
            message: `Response field required "${field.name}" tem TODO: ${field.todo}`,
          });
        }

        if (field.required && field.jsonPath && containsTodo(field.jsonPath)) {
          errors.push({
            severity: 'error',
            location: `${loc}.responseFields.${field.name}`,
            message: `Response field required "${field.name}" tem jsonPath com TODO: "${field.jsonPath}"`,
          });
        }

        // Non-required fields with TODO are warnings
        if (!field.required && field.todo && containsTodo(field.todo)) {
          errors.push({
            severity: 'warning',
            location: `${loc}.responseFields.${field.name}`,
            message: `Response field optional "${field.name}" tem TODO: ${field.todo}`,
          });
        }
      }
    }

    // Endpoint-level TODOs (informational warnings)
    if (ep.todos) {
      for (const todo of ep.todos) {
        errors.push({
          severity: 'warning',
          location: `${loc}.todos`,
          message: `TODO pendente: ${todo}`,
        });
      }
    }
  }

  return errors;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const contractPath = path.resolve(
    __dirname,
    '..',
    'contracts',
    'shopee.endpoints.yaml'
  );

  console.log(`\n🔍 Validando contrato: ${contractPath}\n`);

  if (!fs.existsSync(contractPath)) {
    console.error('❌ Arquivo de contrato não encontrado!');
    process.exit(1);
  }

  const raw = fs.readFileSync(contractPath, 'utf-8');
  const contract = yaml.load(raw) as Contract;

  const results = validate(contract);

  const errorsOnly = results.filter((r) => r.severity === 'error');
  const warningsOnly = results.filter((r) => r.severity === 'warning');

  // Print warnings
  if (warningsOnly.length > 0) {
    console.log(`⚠️  ${warningsOnly.length} warning(s):\n`);
    for (const w of warningsOnly) {
      console.log(`  ⚠️  [${w.location}] ${w.message}`);
    }
    console.log('');
  }

  // Print errors
  if (errorsOnly.length > 0) {
    console.log(`❌ ${errorsOnly.length} error(s):\n`);
    for (const e of errorsOnly) {
      console.log(`  ❌ [${e.location}] ${e.message}`);
    }
    console.log(
      '\n💡 Corrija os erros acima ou confirme os TODOs no contrato.'
    );
    console.log('   Referência: docs/shopee/README.md\n');
    process.exit(1);
  }

  if (warningsOnly.length > 0) {
    console.log(
      `✅ Contrato válido (com ${warningsOnly.length} warning(s) — TODOs pendentes).\n`
    );
  } else {
    console.log('✅ Contrato válido — nenhum TODO pendente! 🎉\n');
  }

  process.exit(0);
}

main();
