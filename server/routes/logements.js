// CRUD logements + charges fixes + paramètres de charges variables (Lot 1).
// Backend D1 (async).
import { Hono } from 'hono';

const router = new Hono();

const LOGEMENT_FIELDS = [
  'nom_commercial', 'adresse', 'ville', 'zone', 'type', 'surface_m2', 'dpe',
  'statut', 'gestionnaire', 'plateformes', 'rental_id_superhote',
  'date_debut_bail', 'date_fin_bail',
];
const CF_FIELDS = [
  'loyer_proprio', 'charges_locatives', 'assurance', 'abonnements',
  'internet', 'autres', 'commentaire',
];
const PCV_FIELDS = [
  'taux_commission_plateforme', 'cout_menage_sejour', 'cout_linge_sejour',
  'cout_consommables_sejour', 'taux_frais_paiement', 'taxe_sejour_par_nuit',
];

const pick = (obj, fields) => {
  const out = {};
  for (const f of fields) if (obj[f] !== undefined) out[f] = obj[f];
  return out;
};

async function ensureChildren(db, id) {
  await db.prepare('INSERT OR IGNORE INTO charges_fixes (logement_id) VALUES (?)').bind(id).run();
  await db.prepare('INSERT OR IGNORE INTO params_charges_variables (logement_id) VALUES (?)').bind(id).run();
}

async function fullLogement(db, id) {
  const logement = await db.prepare('SELECT * FROM logements WHERE id = ?').bind(id).first();
  if (!logement) return null;
  await ensureChildren(db, id);
  logement.charges_fixes = await db.prepare('SELECT * FROM charges_fixes WHERE logement_id = ?').bind(id).first();
  logement.params_charges_variables = await db.prepare('SELECT * FROM params_charges_variables WHERE logement_id = ?').bind(id).first();
  return logement;
}

router.get('/', async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare('SELECT id FROM logements ORDER BY statut, nom_commercial').all();
  const out = [];
  for (const r of results) out.push(await fullLogement(db, r.id));
  return c.json(out);
});

router.get('/:id', async (c) => {
  const l = await fullLogement(c.env.DB, Number(c.req.param('id')));
  if (!l) return c.json({ error: 'Logement introuvable' }, 404);
  return c.json(l);
});

router.post('/', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();
  const data = pick(body, LOGEMENT_FIELDS);
  if (!data.nom_commercial) return c.json({ error: 'nom_commercial requis' }, 400);
  const cols = Object.keys(data);
  const info = await db
    .prepare(`INSERT INTO logements (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .bind(...cols.map((k) => data[k]))
    .run();
  const id = info.meta.last_row_id;
  await ensureChildren(db, id);
  return c.json(await fullLogement(db, id), 201);
});

router.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = Number(c.req.param('id'));
  const existing = await db.prepare('SELECT id FROM logements WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Logement introuvable' }, 404);
  await ensureChildren(db, id);
  const body = await c.req.json();

  const lo = pick(body, LOGEMENT_FIELDS);
  if (Object.keys(lo).length) {
    const set = Object.keys(lo).map((k) => `${k} = ?`).join(', ');
    await db.prepare(`UPDATE logements SET ${set} WHERE id = ?`).bind(...Object.values(lo), id).run();
  }
  const cf = pick(body.charges_fixes || {}, CF_FIELDS);
  if (Object.keys(cf).length) {
    const set = Object.keys(cf).map((k) => `${k} = ?`).join(', ');
    await db.prepare(`UPDATE charges_fixes SET ${set} WHERE logement_id = ?`).bind(...Object.values(cf), id).run();
  }
  const pcv = pick(body.params_charges_variables || {}, PCV_FIELDS);
  if (Object.keys(pcv).length) {
    const set = Object.keys(pcv).map((k) => `${k} = ?`).join(', ');
    await db.prepare(`UPDATE params_charges_variables SET ${set} WHERE logement_id = ?`).bind(...Object.values(pcv), id).run();
  }
  return c.json(await fullLogement(db, id));
});

router.delete('/:id', async (c) => {
  const info = await c.env.DB.prepare('DELETE FROM logements WHERE id = ?').bind(Number(c.req.param('id'))).run();
  if (!info.meta.changes) return c.json({ error: 'Logement introuvable' }, 404);
  return c.json({ ok: true });
});

export default router;
