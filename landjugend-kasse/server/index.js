import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fstatic from '@fastify/static';
import { config } from './config.js';
import { get } from './db.js';
import accountRoutes from './routes/account.js';
import kasseRoutes from './routes/kasse.js';
import uploadRoutes from './routes/upload.js';

export async function build({ logger = true } = {}) {
  const app = Fastify({ logger: logger ? { level: 'info' } : false, trustProxy: true, bodyLimit: 256 * 1024 });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: config.uploadMaxBytes, files: 1, fields: 10 } });

  // Schutz vor Cross-Site-Requests: schreibende Anfragen nur von der eigenen Seite
  app.addHook('onRequest', async (req, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.url.startsWith('/api/')) return;
    const origin = req.headers.origin;
    if (!origin) return;
    let host = null;
    try { host = new URL(origin).host; } catch {}
    if (host !== req.headers.host && origin !== config.baseUrl) return reply.code(403).send({ error: 'Ungültige Herkunft.' });
  });
  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Frame-Options', 'SAMEORIGIN').header('Referrer-Policy', 'same-origin').header('X-Content-Type-Options', 'nosniff');
    if (config.production && config.baseUrl.startsWith('https:')) reply.header('Strict-Transport-Security', 'max-age=31536000');
    if (req.url.startsWith('/api/') && !reply.getHeader('cache-control')) reply.header('Cache-Control', 'no-store');
  });

  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode || 500;
    if (status >= 500) req.log.error(err);
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(400).send({ error: 'Die Datei ist zu groß.' });
    reply.code(status).send({ error: status >= 500 ? 'Interner Fehler. Bitte später erneut versuchen.' : err.message, code: err.code });
  });

  // Für Überwachung und das Installationsskript
  app.get('/api/health', async () => ({ ok: !!get('SELECT 1 ok').ok }));

  await app.register(accountRoutes);
  await app.register(kasseRoutes);
  await app.register(uploadRoutes);

  // Gebaute Web-App ausliefern (SPA mit Fallback auf index.html)
  const dist = path.join(config.root, 'web', 'dist');
  if (fs.existsSync(dist)) {
    await app.register(fstatic, { root: dist, wildcard: true, setHeaders: (reply, p) => {
      reply.header('Cache-Control', p.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
    } });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Nicht gefunden' });
      if (req.url.startsWith('/assets/') || /\.(js|css|png|svg|webmanifest|woff2?)(\?|$)/.test(req.url)) return reply.code(404).type('text/plain').send('Nicht gefunden');
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  }
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await build();
  await app.listen({ port: config.port, host: config.host });
  console.log(`Landjugend-Kasse läuft auf ${config.baseUrl}`);
  if (!process.env.APP_SECRET) console.log('Hinweis: APP_SECRET ist nicht gesetzt – in Produktion unbedingt setzen.');
}
