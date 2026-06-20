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

  // Pagination Superhote (result.meta.last_page) : on récupère toutes les pages.
  const items = [];
  let page = 1, lastPage = 1;
  do {
    const data = await shFetch(c, '/reservations', {
      checkout_from, checkout_to, updated_since: body.updated_since || null, page,
    });
    items.push(...liste(data, 'reservations'));
    lastPage = data?.result?.meta?.last_page ?? 1;
    page += 1;
  } while (page <= lastPage && page <= 40);

  const { results: logements } = await db.prepare('SELECT id, rental_id_superhote FROM logements WHERE rental_id_superhote IS NOT NULL').all();
  const mapRental = new Map(logements.map((l) => [String(l.rental_id_superhote), l.id]));
  const idRental = (it) => it.rental_id ?? it.rentalId ?? it.rentalID ?? it.listingId ?? it.property_id ?? null;

  // Codes plateforme Superhote (numériques) → libellés best-effort.
  const PLATEFORMES = { 1: 'Airbnb', 2: 'Booking', 3: 'Direct', 4: 'Abritel/Vrbo', 5: 'Expedia' };
  // Le CA n'est pas dans l'endpoint réservations (total_price souvent null) →
  // on le reconstitue à partir des prix du calendrier (nuits du séjour).
  const prixDepuisCalendrier = async (logementId, ci, co) => {
    if (!ci || !co) return 0;
    const row = await db.prepare(
      'SELECT SUM(prix_affiche) AS s FROM calendrier WHERE logement_id = ? AND date >= ? AND date < ?'
    ).bind(logementId, ci, co).first();
    return row && row.s ? Number(row.s) : 0;
  };

  // Upsert manuel (sans ON CONFLICT) → fonctionne même sans index unique.
  const insSql = `INSERT INTO reservations
      (reservation_id_superhote, logement_id, canal, check_in, check_out, nb_nuits,
       nb_voyageurs, prix_sejour, taxe_sejour, statut, date_reservation, updated_at, voyageur_nom)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`;
  const updSql = `UPDATE reservations SET
      logement_id=?, canal=?, check_in=?, check_out=?, nb_nuits=?, nb_voyageurs=?,
      prix_sejour=?, taxe_sejour=?, statut=?, date_reservation=?, updated_at=datetime('now'), voyageur_nom=?
    WHERE reservation_id_superhote=?`;

  let enregistres = 0, ignores = 0;
  const idsVus = new Set();
  const statutsVus = new Set();
  for (const it of items) {
    const rid = idRental(it);
    if (rid != null) idsVus.add(String(rid));
    statutsVus.add(it.status);
    const logementId = mapRental.get(String(rid));
    if (!logementId) { ignores++; continue; }
    const resaId = String(it.id ?? it.reservation_id ?? it.reservationId ?? '');
    const check_in = String(it.checkin ?? it.check_in ?? it.checkIn ?? it.arrival ?? it.start_date ?? '').slice(0, 10);
    const check_out = String(it.checkout ?? it.check_out ?? it.checkOut ?? it.departure ?? it.end_date ?? '').slice(0, 10);
    const platform = it.platform ?? it.channel_id ?? null;
    const canal = it.channel ?? it.source ?? (platform != null ? (PLATEFORMES[platform] || `Canal ${platform}`) : null);
    const nb_nuits = calcNuits(check_in, check_out, it.nights ?? it.nb_nights ?? it.number_of_nights);
    const nb_voyageurs = num(it.guests_count) || num(it.guests) || (num(it.adults_count) + num(it.children_count)) || num(it.nb_voyageurs);
    let prix = num(it.total_price ?? it.totalPrice ?? it.total_amount ?? it.amount ?? it.price ?? it.payout ?? it.prix_sejour);
    if (!prix) prix = await prixDepuisCalendrier(logementId, check_in, check_out);
    const taxe = num(it.city_tax ?? it.cityTax ?? it.tourist_tax ?? it.taxe_sejour);
    // Superhote : status 1 = confirmée. Tout autre code (annulation, demande
    // refusée…) → marqué « annulée » et EXCLU du CA. Ajuste CONFIRMEES au besoin
    // (cf. statuts_vus renvoyé ci-dessous).
    const CONFIRMEES = new Set([1]);
    const statut = CONFIRMEES.has(Number(it.status)) ? 'confirmée' : 'annulée';
    const dateResa = String(it.created_at ?? it.createdAt ?? it.booked_at ?? it.date_reservation ?? '').slice(0, 10);
    const nomComplet = `${it.guest_first_name ?? ''} ${it.guest_last_name ?? ''}`.trim();
    const voyageur = it.guest_name ?? it.guestName ?? it.guest?.name ?? (nomComplet || it.voyageur_nom || null);

    const existing = resaId
      ? await db.prepare('SELECT id FROM reservations WHERE reservation_id_superhote = ?').bind(resaId).first()
      : null;
    if (existing) {
      await db.prepare(updSql).bind(
        logementId, canal, check_in, check_out, nb_nuits, nb_voyageurs,
        prix, taxe, statut, dateResa, voyageur, resaId,
      ).run();
    } else {
      await db.prepare(insSql).bind(
        resaId || null, logementId, canal, check_in, check_out, nb_nuits,
        nb_voyageurs, prix, taxe, statut, dateResa, voyageur,
      ).run();
    }
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
    statuts_vus: [...statutsVus],
    exemple_champs: items[0] ? Object.keys(items[0]) : [],
  });
});

// Synchro du calendrier (← GET /rentals/{id}/calendar) → table calendrier.
// Alimente disponibilité, prix affichés, occupation/RevPAR et le moteur de reco.
router.post('/sync-calendar', async (c) => {
  const db = c.env.DB;
  if (!token(c)) return c.json({ error: 'SUPERHOTE_TOKEN non configuré', configured: false }, 409);
  const body = await c.req.json().catch(() => ({}));
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const from = body.from || iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)); // 2 mois en arrière
  const to = body.to || iso(new Date(now.getFullYear(), now.getMonth() + 4, 0));     // ~4 mois en avant

  const { results: logements } = await db.prepare(
    'SELECT id, rental_id_superhote FROM logements WHERE rental_id_superhote IS NOT NULL'
  ).all();

  const ins = db.prepare(
    `INSERT INTO calendrier (logement_id, date, dispo, prix_affiche, min_stay) VALUES (?, ?, ?, ?, ?)`
  );
  let jours = 0;
  for (const l of logements) {
    const data = await shFetch(c, `/rentals/${l.rental_id_superhote}/calendar`, { from, to });
    const days = data?.result?.days ?? liste(data, 'days');
    // On remplace la fenêtre pour ce logement (pas de doublons).
    await db.prepare('DELETE FROM calendrier WHERE logement_id = ? AND date >= ? AND date <= ?')
      .bind(l.id, from, to).run();
    for (const d of days) {
      await ins.bind(l.id, d.date, d.available ? 1 : 0, num(d.price), d.min_nights ?? null).run();
      jours++;
    }
  }
  return c.json({ ok: true, logements: logements.length, jours, periode: { from, to } });
});

export default router;
