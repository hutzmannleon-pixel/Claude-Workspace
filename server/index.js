import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fstatic from '@fastify/static';
import { config } from './config.js';
import { wipe } from './db.js';
import { live } from './live.js';
import { startJobs } from './jobs.js';
import { testStatus } from './testmode.js';
import publicRoutes from './routes/public.js';
import customerRoutes from './routes/customer.js';
import sweepRoutes from './routes/sweep.js';
import adminRoutes from './routes/admin.js';
import feedbackRoutes from './routes/feedback.js';
import passkeyRoutes from './routes/passkey.js';

export async function build({ logger = !config.testMode } = {}) {
  const app = Fastify({ logger: logger ? { level: 'info' } : false, trustProxy: true, bodyLimit: 256 * 1024 });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: config.uploadMaxBytes, files: 1 } });

  // Schutz vor Cross-Site-Requests: schreibende Anfragen nur von der eigenen Seite
  app.addHook('onRequest', async (req, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.url.startsWith('/api/')) return;
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host && origin !== config.baseUrl) return reply.code(403).send({ error: 'Ungültige Herkunft.' });
  });
  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Frame-Options', 'SAMEORIGIN').header('Referrer-Policy', 'same-origin').header('X-Content-Type-Options', 'nosniff');
    if (req.url.startsWith('/api/') && !reply.getHeader('cache-control')) reply.header('Cache-Control', 'no-store');
  });

  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode || 500;
    if (status >= 500) req.log.error(err);
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(400).send({ error: 'Die Datei ist zu groß.' });
    reply.code(status).send({ error: status >= 500 ? 'Interner Fehler. Bitte später erneut versuchen.' : err.message, code: err.code });
  });

  await app.register(publicRoutes);
  await app.register(customerRoutes);
  await app.register(sweepRoutes);
  await app.register(adminRoutes);
  await app.register(feedbackRoutes);
  await app.register(passkeyRoutes);

  if (config.testMode) {
    app.get('/api/test/status', async () => ({ done: testStatus() }));
    // Alles löschen – nur im Testmodus
    app.post('/api/test/reset', async () => { wipe(); live.bump(); return { ok: true }; });
  }

  // Gebaute Web-App ausliefern (SPA mit Fallback auf index.html)
  const dist = path.join(config.root, 'web', 'dist');
  if (fs.existsSync(dist)) {
    await app.register(fstatic, { root: dist, wildcard: true, setHeaders: (reply, p) => {
      reply.header('Cache-Control', p.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
    } });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Nicht gefunden' });
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  }
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await build();
  startJobs();
  await app.listen({ port: config.port, host: config.host });
  console.log(`Kaminfeger Verwaltung läuft auf ${config.baseUrl}${config.testMode ? '  (Testmodus: ' + config.baseUrl + '/test)' : ''}`);
  if (!config.smtp) console.log('Hinweis: SMTP ist nicht konfiguriert – E-Mails werden im Log ausgegeben.');
  if (!config.adminEmails.length) console.log('Hinweis: ADMIN_EMAILS ist leer – niemand kann sich als Betreiber anmelden.');
}
