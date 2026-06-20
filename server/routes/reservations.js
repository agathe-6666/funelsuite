// CRUD réservations (saisie manuelle, secours de l'API Superhote) + upsells.
// Backend D1.
import { Hono } from 'hono';

const router = new Hono();

const FIELDS = [
  'reservation_id_superhote', 'logement_id', 'canal', 'check_in', 'check_out',
  'nb_nuits', 'nb_voyageurs', 'prix_sejour', 'taxe_sejour', 'statut',
  'date_reservation', 'voyageur_nom',
];
const pick = (o) => Object.fromEntries(FIELDS.filter((f) => o[f] !== undefined).map((f) => [f, o[f]]));

function nuitsEntre(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const d = (new Date(checkOut) - new Date(checkIn)) / 86400000;
  return d > 0 ? Math.round(d) : 0;
}

async function withUpsells(db, r) {
  if (!r) return r;
  const { results } = await db.prepare('SELECT * FROM upsells WHERE reservation_id = ?').bind(r.id).all();
  r.upsells = results;
  r.upsells_total = results.reduce((s, u) => s + (u.montant || 0), 0);
  return r;
}

router.get('/', async (c) => {
  const db = c.env.DB;
  const logementId = c.req.query('logement_id');
  const mois = c.req.query('mois'); // YYYY-MM sur check_in
  let sql = 'SELECT * FROM reservations';
  const conds = [];
  const args = [];
  if (logementId) { conds.push('logement_id = ?'); args.push(Number(logementId)); }
  if (mois) { conds.push("strftime('%Y-%m', check_in) = ?"); args.push(mois); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY check_in DESC';
  const { results } = await db.prepare(sql).bind(...args).all();
  const out = [];
  for (const r of results) out.push(await withUpsells(db, r));
  return c.json(out);
});

router.get('/:id', async (c) => {
  const db = c.env.DB;
  const r = await withUpsells(db, await db.prepare('SELECT * FROM reservations WHERE id = ?').bind(Number(c.req.param('id'))).first());
  if (!r) return c.json({ error: 'Réservation introuvable' }, 404);
  return c.json(r);
});

router.post('/', async (c) => {
  const db = c.env.DB;
  const data = pick(await c.req.json());
  if (!data.logement_id || !data.check_in || !data.check_out)
    return c.json({ error: 'logement_id, check_in et check_out requis' }, 400);
  if (!data.nb_nuits) data.nb_nuits = nuitsEntre(data.check_in, data.check_out);
  const cols = Object.keys(data);
  const info = await db
    .prepare(`INSERT INTO reservations (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .bind(...Object.values(data))
    .run();
  const row = await db.prepare('SELECT * FROM reservations WHERE id = ?').bind(info.meta.last_row_id).first();
  return c.json(await withUpsells(db, row), 201);
});

router.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = Number(c.req.param('id'));
  const data = pick(await c.req.json());
  if (data.check_in && data.check_out && data.nb_nuits === undefined)
    data.nb_nuits = nuitsEntre(data.check_in, data.check_out);
  if (!Object.keys(data).length) return c.json({ error: 'Aucun champ à mettre à jour' }, 400);
  const set = Object.keys(data).map((k) => `${k} = ?`).join(', ');
  const info = await db.prepare(`UPDATE reservations SET ${set}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...Object.values(data), id).run();
  if (!info.meta.changes) return c.json({ error: 'Réservation introuvable' }, 404);
  const row = await db.prepare('SELECT * FROM reservations WHERE id = ?').bind(id).first();
  return c.json(await withUpsells(db, row));
});

router.delete('/:id', async (c) => {
  const info = await c.env.DB.prepare('DELETE FROM reservations WHERE id = ?').bind(Number(c.req.param('id'))).run();
  if (!info.meta.changes) return c.json({ error: 'Réservation introuvable' }, 404);
  return c.json({ ok: true });
});

// ─── Upsells ──────────────────────────────────────────────────────────────
router.post('/:id/upsells', async (c) => {
  const db = c.env.DB;
  const reservationId = Number(c.req.param('id'));
  const exists = await db.prepare('SELECT id FROM reservations WHERE id = ?').bind(reservationId).first();
  if (!exists) return c.json({ error: 'Réservation introuvable' }, 404);
  const body = await c.req.json();
  const info = await db.prepare('INSERT INTO upsells (reservation_id, type, montant) VALUES (?, ?, ?)')
    .bind(reservationId, body.type || null, body.montant || 0).run();
  return c.json(await db.prepare('SELECT * FROM upsells WHERE id = ?').bind(info.meta.last_row_id).first(), 201);
});

router.delete('/upsells/:upsellId', async (c) => {
  const info = await c.env.DB.prepare('DELETE FROM upsells WHERE id = ?').bind(Number(c.req.param('upsellId'))).run();
  if (!info.meta.changes) return c.json({ error: 'Upsell introuvable' }, 404);
  return c.json({ ok: true });
});

export default router;
