// ════════════════════════════════════════════════════════════════════════
//  Intégration API Superhote (§7) — scaffold du Lot 6, version Cloudflare.
//  Devient fonctionnel dès qu'un secret SUPERHOTE_TOKEN est défini
//  (`wrangler secret put SUPERHOTE_TOKEN`, ou .dev.vars en local).
// ════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';

const router = new Hono();

const baseUrl = (c) => c.env.SUPERHOTE_BASE_URL || 'https://connect.superhote.com/api/v2/public';
const token = (c) => c.env.SUPERHOTE_TOKEN || '';

async function shFetch(c, path, params = {}) {
  const url = new URL(baseUrl(c) + path);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token(c)}`, Accept: 'application/json' } });
  if (!r.ok) {
    const body = await r.text();
    const err = new Error(`Superhote ${r.status}: ${body.slice(0, 200)}`);
    err.status = r.status === 401 ? 401 : 502;
    throw err;
  }
  return r.json();
}

router.get('/status', (c) => c.json({ configured: Boolean(token(c)), base_url: baseUrl(c) }));

router.get('/rentals', async (c) => {
  if (!token(c)) return c.json({ error: 'SUPERHOTE_TOKEN non configuré', configured: false }, 409);
  return c.json(await shFetch(c, '/rentals'));
});

// Synchro incrémentale GET /reservations?updated_since=… → table reservations.
router.post('/sync', async (c) => {
  const db = c.env.DB;
  if (!token(c)) return c.json({ error: 'SUPERHOTE_TOKEN non configuré', configured: false }, 409);
  const body = await c.req.json().catch(() => ({}));
  const data = await shFetch(c, '/reservations', { updated_since: body.updated_since || null });
  const items = Array.isArray(data) ? data : data.data || data.reservations || [];

  const { results: logements } = await db.prepare('SELECT id, rental_id_superhote FROM logements WHERE rental_id_superhote IS NOT NULL').all();
  const mapRental = new Map(logements.map((l) => [String(l.rental_id_superhote), l.id]));

  const sql = `
    INSERT INTO reservations
      (reservation_id_superhote, logement_id, canal, check_in, check_out, nb_nuits,
       nb_voyageurs, prix_sejour, taxe_sejour, statut, date_reservation, updated_at, voyageur_nom)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(reservation_id_superhote) DO UPDATE SET
      check_in=excluded.check_in, check_out=excluded.check_out, nb_nuits=excluded.nb_nuits,
      prix_sejour=excluded.prix_sejour, taxe_sejour=excluded.taxe_sejour,
      statut=excluded.statut, updated_at=datetime('now')`;

  let enregistres = 0, ignores = 0;
  for (const it of items) {
    const logementId = mapRental.get(String(it.rentalId ?? it.rental_id));
    if (!logementId) { ignores++; continue; }
    await db.prepare(sql).bind(
      String(it.id ?? it.reservationId ?? ''),
      logementId,
      it.channel ?? it.canal ?? null,
      (it.checkIn ?? it.check_in ?? '').slice(0, 10),
      (it.checkOut ?? it.check_out ?? '').slice(0, 10),
      it.nights ?? it.nb_nuits ?? 0,
      it.guests ?? it.nb_voyageurs ?? 0,
      it.totalPrice ?? it.prix_sejour ?? 0,
      it.cityTax ?? it.taxe_sejour ?? 0,
      it.status ?? 'confirmée',
      (it.createdAt ?? it.date_reservation ?? '').slice(0, 10),
      it.guestName ?? it.voyageur_nom ?? null,
    ).run();
    enregistres++;
  }
  return c.json({ ok: true, recus: items.length, enregistres, ignores_sans_mapping: ignores });
});

export default router;
