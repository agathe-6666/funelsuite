// ════════════════════════════════════════════════════════════════════════
//  FUNEL suite — Cloudflare Worker (Hono).
//  Sert l'API /api/* (adossée à D1) et délègue tout le reste aux assets
//  statiques (l'app React buildée). Un seul Worker pour tout.
// ════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';

import logements from './routes/logements.js';
import objectifs from './routes/objectifs.js';
import reservations from './routes/reservations.js';
import metrics from './routes/metrics.js';
import superhote from './routes/superhote.js';

const app = new Hono();

app.get('/api/health', (c) =>
  c.json({ ok: true, app: 'FUNEL suite', date: new Date().toISOString() })
);

app.route('/api/logements', logements);
app.route('/api/objectifs', objectifs);
app.route('/api/reservations', reservations);
app.route('/api/metrics', metrics);
app.route('/api/superhote', superhote);

// Erreurs uniformes côté API
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || 'Erreur serveur' }, err.status || 500);
});

// Tout ce qui n'est pas /api → app React (Workers Assets, SPA fallback)
app.all('*', (c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Route introuvable' }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
