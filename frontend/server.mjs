import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const version = String(process.env.APP_VERSION || '1.0.0');

const distDir = path.join(__dirname, 'dist');

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', version, timestamp: new Date().toISOString() });
});

app.use(express.static(distDir, { index: false }));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Frontend listening on :${port}`);
});
