import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

function envBool(name: string, fallback = false): boolean {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  if (!v) return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

function pickEnv(...names: string[]): string {
  for (const n of names) {
    const v = String(process.env[n] ?? '').trim();
    if (v) return v;
  }
  return '';
}

async function sendSlack(text: string): Promise<boolean> {
  const url = String(process.env.ALERTS_SLACK_WEBHOOK_URL || '').trim();
  if (!url) return false;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendEmail(subject: string, text: string, attachmentPath?: string): Promise<boolean> {
  const enabled = envBool('ALERTS_EMAIL_ENABLED', false);
  if (!enabled) return false;

  const host = pickEnv('ALERTS_EMAIL_SMTP_HOST', 'ALERTS_SMTP_HOST');
  const portRaw = pickEnv('ALERTS_EMAIL_SMTP_PORT', 'ALERTS_SMTP_PORT');
  const port = portRaw ? Number(portRaw) : 587;
  const user = pickEnv('ALERTS_EMAIL_SMTP_USER', 'ALERTS_SMTP_USER');
  const pass = pickEnv('ALERTS_EMAIL_SMTP_PASS', 'ALERTS_SMTP_PASS');
  const to = pickEnv('ALERTS_EMAIL_TO');
  const from = pickEnv('ALERTS_EMAIL_FROM') || user;

  if (!host || !to || !from) return false;

  const transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      attachments: attachmentPath
        ? [
            {
              filename: path.basename(attachmentPath),
              path: attachmentPath,
              contentType: 'application/pdf',
            },
          ]
        : [],
    });
    return true;
  } catch {
    return false;
  }
}

function getLatestPdf(reportsDir: string): { fullPath: string; filename: string; size: number } | null {
  if (!fs.existsSync(reportsDir)) return null;
  const files = fs
    .readdirSync(reportsDir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .map((f) => {
      const fullPath = path.join(reportsDir, f);
      const stat = fs.statSync(fullPath);
      return { fullPath, filename: f, mtimeMs: stat.mtimeMs, size: stat.size };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return files[0] ? { fullPath: files[0].fullPath, filename: files[0].filename, size: files[0].size } : null;
}

async function main(): Promise<void> {
  const reportsDir = path.resolve(process.cwd(), 'reports');
  const latest = getLatestPdf(reportsDir);

  if (!latest) {
    // Nothing to send.
    process.exit(0);
    return;
  }

  const subject = `Sistema MLH — Relatório semanal (${latest.filename})`;
  const sizeKb = Math.round(latest.size / 1024);

  const text = [
    '*Sistema MLH — Relatório semanal*',
    `Arquivo: ${latest.filename} (${sizeKb} KB)`,
    '',
    'Observação: se você estiver usando Slack webhook, o PDF não pode ser anexado via webhook; o envio por email anexa o PDF.',
    'Para baixar via Railway: `railway ssh -s api-backend` e então acessar a pasta `reports/`.',
  ].join('\n');

  // Slack: best-effort message
  await sendSlack(text);

  // Email: attach the PDF
  await sendEmail(subject, text, latest.fullPath);
}

main().catch(() => process.exit(1));
