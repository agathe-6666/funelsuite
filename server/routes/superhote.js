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

// Superhote enveloppe ses listes dans result.<clé> (avec pagination meta).
function liste(data, cle) {
  return (
    data?.result?.[cle] ??
    data?.[cle] ??
    data?.data ??
    (Array.isArray(data) ? data : [])
  );
}
const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
function calcNuits(ci, co, fallback) {
  if (fallback) return Number(fallback);
  if (!ci || !co) return 0;
  const d = (new Date(co) - new Date(ci)) / 86400000;
  return d > 0 ? Math.round(d) : 0;
}

router.get('/status', (c) => c.json({ configured: Boolean(token(c)), base_url: baseUrl(c) }));

// Diagnostic : renvoie la 1re réservation brute pour caler le mapping des champs.
router.get('/reservations-debug', async (c) => {
  if (!token(c)) return c.json({ error: 'SUPERHOTE_TOKEN non configuré' }, 409);
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const data = await shFetch(c, '/reservations', {
    checkout_from: iso(new Date(now.getFullYear(), now.getMonth() - 6, 1)),
    checkout_to: iso(new Date(now.getFullYear(), now.getMonth() + 12, 1)),
  });
  const items = liste(data, 'reservations');
  return c.json({ total: items.length, meta: data?.result?.meta ?? null, premier: items[0] ?? null });
});

router.get('/rentals', async (c) => {
  if (!token(c)) return c.json({ error: 'SUPERHOTE_TOKEN non configuré', configured: false }, 409);
  return c.json(await shFetch(c, '/rentals'));
});

// Synchro incrémentale GET /reservations?updated_since=… → table reservations.
router.post('/sync', async (c) => {
  const db = c.env.DB;
  if (!token(c)) return c.json({ error: 'SUPERHOTE_TOKEN non configuré', configured: false }, 409);
  const body = await c.req.json().catch(() => ({}));

  // Fenêtre de dates (l'API Superhote attend checkout_from/checkout_to).
  // Par défaut : 6 mois en arrière → 12 mois en avant, pour ramener large.
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const checkout_from = body.checkout_from || iso(new Date(now.getFullYear(), now.getMonth() - 6, 1));
  const checkout_to = body.checkout_to || iso(new Date(now.getFullYear(), now.getMonth() + 12, 1));

  const data = await shFetch(c, '/reservations', {
    checkout_from, checkout_to, updated_since: body.updated_since || null,
  });
  const items = liste(data, 'reservations');

  const { results: logements } = await db.prepare('SELECT id, rental_id_superhote FROM logements WHERE rental_id_superhote IS NOT NULL').all();
  const mapRental = new Map(logements.map((l) => [String(l.rental_id_superhote), l.id]));
  const idRental = (it) => it.rental_id ?? it.rentalId ?? it.rentalID ?? it.listingId ?? it.property_id ?? null;

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
  const idsVus = new Set();
  for (const it of items) {
    const rid = idRental(it);
    if (rid != null) idsVus.add(String(rid));
    const logementId = mapRental.get(String(rid));
    if (!logementId) { ignores++; continue; }
    const check_in = String(it.check_in ?? it.checkIn ?? it.arrival ?? it.start_date ?? '').slice(0, 10);
    const check_out = String(it.check_out ?? it.checkOut ?? it.departure ?? it.end_date ?? '').slice(0, 10);
    await db.prepare(sql).bind(
      String(it.id ?? it.reservation_id ?? it.reservationId ?? ''),
      logementId,
      it.channel ?? it.source ?? it.platform ?? it.canal ?? null,
      check_in,
      check_out,
      calcNuits(check_in, check_out, it.nights ?? it.nb_nights ?? it.number_of_nights),
      num(it.guests ?? it.nb_guests ?? it.adults ?? it.nb_voyageurs),
      num(it.total_price ?? it.totalPrice ?? it.total_amount ?? it.amount ?? it.price ?? it.payout ?? it.prix_sejour),
      num(it.city_tax ?? it.cityTax ?? it.tourist_tax ?? it.taxe_sejour),
      it.status ?? it.state ?? 'confirmée',
      String(it.created_at ?? it.createdAt ?? it.booked_at ?? it.date_reservation ?? '').slice(0, 10),
      it.guest_name ?? it.guestName ?? it.guest?.name ?? it.voyageur_nom ?? null,
    ).run();
    enregistres++;
  }
  return c.json({
    ok: true,
    recus: items.length,
    enregistres,
    ignores_sans_mapping: ignores,
    periode: { checkout_from, checkout_to },
    // Aide au diagnostic : IDs Superhote vus dans le lot, IDs déjà mappés
    // côté app, et noms de champs du 1er élément (sans les valeurs).
    ids_superhote_vus: [...idsVus],
    ids_mappes_dans_app: [...mapRental.keys()],
    exemple_champs: items[0] ? Object.keys(items[0]) : [],
  });
});

export default router;
