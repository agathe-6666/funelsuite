// CRUD objectifs — les 4 phases du séminaire (Lot 2). Backend D1.
import { Hono } from 'hono';

const router = new Hono();
const FIELDS = ['phase', 'libelle', 'date_debut', 'date_fin', 'ca_cible', 'marge_cible_pct', 'nb_logements_cible'];
const pick = (o) => Object.fromEntries(FIELDS.filter((f) => o[f] !== undefined).map((f) => [f, o[f]]));

router.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM objectifs ORDER BY phase').all();
  return c.json(results);
});

router.post('/', async (c) => {
  const data = pick(await c.req.json());
  const cols = Object.keys(data);
  const info = await c.env.DB
    .prepare(`INSERT INTO objectifs (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .bind(...Object.values(data))
    .run();
  const row = await c.env.DB.prepare('SELECT * FROM objectifs WHERE id = ?').bind(info.meta.last_row_id).first();
  return c.json(row, 201);
});

router.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const data = pick(await c.req.json());
  if (!Object.keys(data).length) return c.json({ error: 'Aucun champ à mettre à jour' }, 400);
  const set = Object.keys(data).map((k) => `${k} = ?`).join(', ');
  const info = await c.env.DB.prepare(`UPDATE objectifs SET ${set} WHERE id = ?`).bind(...Object.values(data), id).run();
  if (!info.meta.changes) return c.json({ error: 'Objectif introuvable' }, 404);
  return c.json(await c.env.DB.prepare('SELECT * FROM objectifs WHERE id = ?').bind(id).first());
});

router.delete('/:id', async (c) => {
  const info = await c.env.DB.prepare('DELETE FROM objectifs WHERE id = ?').bind(Number(c.req.param('id'))).run();
  if (!info.meta.changes) return c.json({ error: 'Objectif introuvable' }, 404);
  return c.json({ ok: true });
});

export default router;
