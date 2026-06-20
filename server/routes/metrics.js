// Agrégations pour le tableau de bord (Lot 4) et le simulateur (Lot 5).
// Backend D1. Toutes les formules vivent dans lib/rentability.js.
import { Hono } from 'hono';
import {
  indicateursLogement,
  pilotageJ15,
  simulation,
  joursDansMois,
  totalChargesFixes,
} from '../lib/rentability.js';
import { genererRecommandations } from '../lib/recommandations.js';

const router = new Hono();

const ymCourant = () => new Date().toISOString().slice(0, 7);

async function reservationsMois(db, logementId, ym) {
  const { results } = await db.prepare(
    `SELECT * FROM reservations
     WHERE logement_id = ? AND statut = 'confirmée'
       AND strftime('%Y-%m', check_in) = ?`
  ).bind(logementId, ym).all();
  return results;
}

// Table des upsells saisis au mois (créée à la volée → pas besoin de migration).
let _extraReady = false;
async function ensureExtra(db) {
  if (_extraReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS upsells_mensuels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    logement_id INTEGER NOT NULL,
    mois TEXT NOT NULL,
    montant REAL DEFAULT 0
  )`).run();
  _extraReady = true;
}

// Upsell saisi manuellement pour un bien sur un mois (montant forfaitaire).
async function upsellManuel(db, logementId, ym) {
  await ensureExtra(db);
  const row = await db.prepare(
    'SELECT COALESCE(SUM(montant),0) AS total FROM upsells_mensuels WHERE logement_id = ? AND mois = ?'
  ).bind(logementId, ym).first();
  return row.total || 0;
}

// Total upsells du mois = upsells par réservation + saisie mensuelle forfaitaire.
async function upsellsMois(db, logementId, ym, jusquaDate = null) {
  let sql = `SELECT COALESCE(SUM(u.montant),0) AS total
             FROM upsells u JOIN reservations r ON r.id = u.reservation_id
             WHERE r.logement_id = ? AND strftime('%Y-%m', r.check_in) = ?`;
  const args = [logementId, ym];
  if (jusquaDate) { sql += ' AND r.check_in <= ?'; args.push(jusquaDate); }
  const row = await db.prepare(sql).bind(...args).first();
  return (row.total || 0) + (await upsellManuel(db, logementId, ym));
}

// Nuits disponibles d'un mois (depuis le calendrier Superhote), sinon null.
async function nuitsDispoMois(db, logementId, ym) {
  const start = `${ym}-01`;
  const end = `${ym}-${String(joursDansMois(ym)).padStart(2, '0')}`;
  const row = await db.prepare(
    'SELECT COUNT(*) AS n FROM calendrier WHERE logement_id = ? AND date >= ? AND date <= ?'
  ).bind(logementId, start, end).first();
  return row.n || null;
}

// Le bail couvre-t-il ce mois ? (pour ne compter les charges fixes que si actif)
function bailCouvre(l, ym) {
  const start = `${ym}-01`;
  const end = `${ym}-${String(joursDansMois(ym)).padStart(2, '0')}`;
  if (l.date_debut_bail && l.date_debut_bail > end) return false;
  if (l.date_fin_bail && l.date_fin_bail < start) return false;
  return true;
}

// Contexte calendrier/réservations pour le moteur de recommandations.
async function contexteReco(db, logementId, ym, estMoisCourant, jourDuMois, nbJoursMois) {
  const today = new Date().toISOString().slice(0, 10);
  const end = `${ym}-${String(nbJoursMois).padStart(2, '0')}`;
  const refStart = estMoisCourant ? today : `${ym}-01`;
  const q = async (sql, ...args) => (await db.prepare(sql).bind(...args).first()).n || 0;

  const nuitsLibresMois = await q(
    'SELECT COUNT(*) AS n FROM calendrier WHERE logement_id = ? AND dispo = 1 AND date >= ? AND date <= ?',
    logementId, refStart, end);
  const d20 = new Date(); d20.setDate(d20.getDate() + 20);
  const nuitsLibres20j = await q(
    'SELECT COUNT(*) AS n FROM calendrier WHERE logement_id = ? AND dispo = 1 AND date >= ? AND date <= ?',
    logementId, today, d20.toISOString().slice(0, 10));
  const resaLointaines = await q(
    `SELECT COUNT(*) AS n FROM reservations
     WHERE logement_id = ? AND statut = 'confirmée' AND check_in > ?
       AND date_reservation IS NOT NULL AND date_reservation != ''
       AND julianday(check_in) - julianday(date_reservation) > 20`,
    logementId, today);

  return {
    jour: jourDuMois, nbJours: nbJoursMois, joursRestants: Math.max(0, nbJoursMois - jourDuMois),
    nuitsLibresMois, nuitsLibres20j, resaLointaines,
  };
}

async function dataLogement(db, logementId) {
  const logement = await db.prepare('SELECT * FROM logements WHERE id = ?').bind(logementId).first();
  const chargesFixes = await db.prepare('SELECT * FROM charges_fixes WHERE logement_id = ?').bind(logementId).first() || {};
  const params = await db.prepare('SELECT * FROM params_charges_variables WHERE logement_id = ?').bind(logementId).first() || {};
  return { logement, chargesFixes, params };
}

// ─── Vue « Mois en cours » ────────────────────────────────────────────────
router.get('/mois', async (c) => {
  const db = c.env.DB;
  const ym = c.req.query('mois') || ymCourant();
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const nbJoursMois = joursDansMois(ym);
  const estMoisCourant = ym === ymCourant();
  const jourDuMois = estMoisCourant ? new Date().getDate() : nbJoursMois;

  const { results: logements } = await db.prepare("SELECT id FROM logements WHERE statut = 'actif' ORDER BY nom_commercial").all();

  const parBien = [];
  for (const { id } of logements) {
    const { logement, chargesFixes, params } = await dataLogement(db, id);
    const resas = await reservationsMois(db, id, ym);
    const ups = await upsellsMois(db, id, ym);
    const nuitsDisponibles = await nuitsDispoMois(db, id, ym);
    const ind = indicateursLogement({ chargesFixes, params, reservations: resas, upsells: ups, nuitsDisponibles, ym });

    const resasADate = estMoisCourant ? resas.filter((r) => r.check_in <= aujourdhui) : resas;
    const encaisse =
      resasADate.reduce((s, r) => s + (r.prix_sejour || 0), 0) +
      (await upsellsMois(db, id, ym, estMoisCourant ? aujourdhui : null));
    const j15 = pilotageJ15({ chargesFixes, encaisseADate: encaisse, jourDuMois, nbJoursMois });

    const ctx = await contexteReco(db, id, ym, estMoisCourant, jourDuMois, nbJoursMois);
    const recommandations = genererRecommandations({ ind, j15, ...ctx });

    parBien.push({ logement, indicateurs: ind, j15, recommandations, contexte: ctx });
  }

  const sum = (sel) => parBien.reduce((s, b) => s + (sel(b) || 0), 0);
  const ca_total = sum((b) => b.indicateurs.ca_total);
  const charges_fixes = sum((b) => b.indicateurs.charges_fixes);
  const charges_variables = sum((b) => b.indicateurs.charges_variables_reelles);
  const marge_nette = ca_total - charges_variables - charges_fixes;
  const objectif_j15 = sum((b) => b.j15.objectif_j15);
  const encaisse_j15 = sum((b) => b.j15.encaisse_a_date);
  const rythme = Math.min(jourDuMois / 15, 1);

  const global = {
    ym,
    jour_du_mois: jourDuMois,
    nb_jours_mois: nbJoursMois,
    ca_total,
    charges_fixes,
    charges_variables,
    marge_nette,
    taux_marge_nette: ca_total > 0 ? marge_nette / ca_total : null,
    nuits_reservees: sum((b) => b.indicateurs.nuits_reservees),
    j15: {
      objectif_j15,
      encaisse_a_date: encaisse_j15,
      couverture_pct: objectif_j15 > 0 ? encaisse_j15 / objectif_j15 : null,
      rythme_attendu_pct: rythme,
      en_retard: objectif_j15 > 0 && encaisse_j15 / objectif_j15 < rythme,
      jour_du_mois: jourDuMois,
    },
  };

  return c.json({ global, par_bien: parBien });
});

// ─── Vue « Année » ────────────────────────────────────────────────────────
router.get('/annee', async (c) => {
  const db = c.env.DB;
  const annee = c.req.query('annee') || String(new Date().getFullYear());
  const { results: logements } = await db.prepare("SELECT id FROM logements WHERE statut = 'actif'").all();

  const labels = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const serie = [];
  let caCumule = 0;
  for (let m = 1; m <= 12; m++) {
    const ym = `${annee}-${String(m).padStart(2, '0')}`;
    let ca = 0, cvar = 0, cfix = 0;
    for (const { id } of logements) {
      const { chargesFixes, params } = await dataLogement(db, id);
      const resas = await reservationsMois(db, id, ym);
      const ups = await upsellsMois(db, id, ym);
      const ind = indicateursLogement({ chargesFixes, params, reservations: resas, upsells: ups, ym });
      ca += ind.ca_total;
      cvar += ind.charges_variables_reelles;
      if (resas.length > 0) cfix += ind.charges_fixes;
    }
    caCumule += ca;
    serie.push({ mois: ym, label: labels[m], ca: Math.round(ca), marge: Math.round(ca - cvar - cfix), ca_cumule: Math.round(caCumule) });
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const { results: objectifs } = await db.prepare('SELECT * FROM objectifs ORDER BY phase').all();
  const phaseCourante =
    objectifs.find((o) => o.date_debut <= aujourdhui && (!o.date_fin || o.date_fin >= aujourdhui)) ||
    objectifs[objectifs.length - 1] || null;
  const nbBiensActifs = (await db.prepare("SELECT COUNT(*) AS n FROM logements WHERE statut = 'actif'").first()).n;

  return c.json({
    annee,
    serie,
    ca_cumule_annee: caCumule,
    phase_courante: phaseCourante,
    avancement_objectif: phaseCourante && phaseCourante.ca_cible > 0 ? caCumule / phaseCourante.ca_cible : null,
    nb_biens_actifs: nbBiensActifs,
    objectifs,
  });
});

// ─── Indicateurs d'un seul bien ───────────────────────────────────────────
router.get('/logement/:id', async (c) => {
  const db = c.env.DB;
  const id = Number(c.req.param('id'));
  const ym = c.req.query('mois') || ymCourant();
  const { logement, chargesFixes, params } = await dataLogement(db, id);
  if (!logement) return c.json({ error: 'Logement introuvable' }, 404);
  const resas = await reservationsMois(db, id, ym);
  const ups = await upsellsMois(db, id, ym);
  const nuitsDisponibles = await nuitsDispoMois(db, id, ym);
  const indicateurs = indicateursLogement({ chargesFixes, params, reservations: resas, upsells: ups, nuitsDisponibles, ym });
  const upsell_mensuel = await upsellManuel(db, id, ym);
  return c.json({ logement, chargesFixes, params, indicateurs, reservations: resas, upsell_mensuel, mois: ym });
});

// ─── Upsells saisis au mois (forfait par bien) ────────────────────────────
router.get('/upsells-mensuels', async (c) => {
  const db = c.env.DB;
  const logementId = Number(c.req.query('logement_id'));
  const ym = c.req.query('mois') || ymCourant();
  return c.json({ logement_id: logementId, mois: ym, montant: await upsellManuel(db, logementId, ym) });
});

router.put('/upsells-mensuels', async (c) => {
  const db = c.env.DB;
  await ensureExtra(db);
  const { logement_id, mois, montant } = await c.req.json();
  const lid = Number(logement_id);
  const ym = mois || ymCourant();
  const m = Number(montant) || 0;
  if (!lid) return c.json({ error: 'logement_id requis' }, 400);
  const existing = await db.prepare('SELECT id FROM upsells_mensuels WHERE logement_id = ? AND mois = ?').bind(lid, ym).first();
  if (existing) await db.prepare('UPDATE upsells_mensuels SET montant = ? WHERE id = ?').bind(m, existing.id).run();
  else await db.prepare('INSERT INTO upsells_mensuels (logement_id, mois, montant) VALUES (?, ?, ?)').bind(lid, ym, m).run();
  return c.json({ ok: true, logement_id: lid, mois: ym, montant: m });
});

// ─── Statistiques : KPIs mensuels sur une année (pour les graphiques) ──────
router.get('/statistiques', async (c) => {
  const db = c.env.DB;
  const annee = c.req.query('annee') || String(new Date().getFullYear());
  const { results: logements } = await db.prepare("SELECT * FROM logements WHERE statut = 'actif'").all();
  const labels = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

  const serie = [];
  for (let m = 1; m <= 12; m++) {
    const ym = `${annee}-${String(m).padStart(2, '0')}`;
    let ca = 0, caHeb = 0, cvar = 0, cfix = 0, nuitsRes = 0, nuitsDispo = 0, ups = 0;
    for (const l of logements) {
      const chargesFixes = await db.prepare('SELECT * FROM charges_fixes WHERE logement_id = ?').bind(l.id).first() || {};
      const params = await db.prepare('SELECT * FROM params_charges_variables WHERE logement_id = ?').bind(l.id).first() || {};
      const resas = await reservationsMois(db, l.id, ym);
      const upsM = await upsellsMois(db, l.id, ym);
      const ndispo = await nuitsDispoMois(db, l.id, ym);
      const ind = indicateursLogement({ chargesFixes, params, reservations: resas, upsells: upsM, nuitsDisponibles: ndispo, ym });
      ca += ind.ca_total;
      caHeb += ind.ca_hebergement;
      cvar += ind.charges_variables_reelles;
      ups += ind.upsells;
      nuitsRes += ind.nuits_reservees;
      nuitsDispo += ind.nuits_dispo;
      if (bailCouvre(l, ym)) cfix += ind.charges_fixes;
    }
    const marge = ca - cvar - cfix;
    serie.push({
      mois: ym,
      label: labels[m],
      ca: Math.round(ca),
      ca_hebergement: Math.round(caHeb),
      upsells: Math.round(ups),
      marge: Math.round(marge),
      taux_marge: ca > 0 ? marge / ca : null,
      charges_fixes: Math.round(cfix),
      charges_variables: Math.round(cvar),
      nuits_reservees: nuitsRes,
      nuits_dispo: nuitsDispo,
      occupation: nuitsDispo > 0 ? nuitsRes / nuitsDispo : null,
      revpar: nuitsDispo > 0 ? Math.round(caHeb / nuitsDispo) : null,
      adr: nuitsRes > 0 ? Math.round(caHeb / nuitsRes) : null,
    });
  }
  return c.json({ annee, serie });
});

// ─── Simulateur (Lot 5) ───────────────────────────────────────────────────
router.post('/simulation', async (c) => {
  const db = c.env.DB;
  const { logement_id, adr, taux_occupation_pct, upsells = 0, mois } = await c.req.json();
  const ym = mois || ymCourant();
  const nbJoursMois = joursDansMois(ym);
  let chargesFixes = {}, params = {};
  if (logement_id) {
    const d = await dataLogement(db, Number(logement_id));
    chargesFixes = d.chargesFixes || {};
    params = d.params || {};
  } else {
    const { results: cfs } = await db.prepare('SELECT * FROM charges_fixes').all();
    const { results: ps } = await db.prepare('SELECT * FROM params_charges_variables').all();
    chargesFixes = { autres: cfs.reduce((s, x) => s + totalChargesFixes(x), 0) };
    const avg = (k) => (ps.length ? ps.reduce((s, p) => s + (p[k] || 0), 0) / ps.length : 0);
    params = {
      taux_commission_plateforme: avg('taux_commission_plateforme'),
      taux_frais_paiement: avg('taux_frais_paiement'),
      cout_menage_sejour: avg('cout_menage_sejour'),
      cout_linge_sejour: avg('cout_linge_sejour'),
      cout_consommables_sejour: avg('cout_consommables_sejour'),
    };
  }
  return c.json(simulation({
    adr: Number(adr) || 0,
    tauxOccupationPct: Number(taux_occupation_pct) || 0,
    chargesFixes, params, nbJoursMois,
    upsells: Number(upsells) || 0,
  }));
});

// ─── Vue Calendrier : grille jour par jour d'un bien (dispo, prix, séjour) ──
router.get('/calendrier', async (c) => {
  const db = c.env.DB;
  const ym = c.req.query('mois') || ymCourant();
  const logementId = Number(c.req.query('logement_id'));
  if (!logementId) return c.json({ error: 'logement_id requis' }, 400);

  const nbj = joursDansMois(ym);
  const start = `${ym}-01`;
  const end = `${ym}-${String(nbj).padStart(2, '0')}`;

  const { results: cal } = await db.prepare(
    'SELECT date, dispo, prix_affiche, min_stay FROM calendrier WHERE logement_id = ? AND date >= ? AND date <= ? ORDER BY date'
  ).bind(logementId, start, end).all();
  const calByDate = new Map(cal.map((r) => [r.date, r]));

  // Réservations qui chevauchent le mois (check_in <= fin ET check_out > début)
  const { results: resas } = await db.prepare(
    'SELECT * FROM reservations WHERE logement_id = ? AND check_in <= ? AND check_out > ? ORDER BY check_in'
  ).bind(logementId, end, start).all();

  const jours = [];
  for (let d = 1; d <= nbj; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    const cinfo = calByDate.get(date);
    const resa = resas.find((r) => r.check_in <= date && date < r.check_out) || null;
    jours.push({
      date,
      jour: d,
      dispo: cinfo ? cinfo.dispo : null,
      prix_affiche: cinfo ? cinfo.prix_affiche : null,
      premier_jour: resa ? resa.check_in === date : false, // pour afficher le nom une seule fois
      reservation: resa
        ? { id: resa.id, voyageur: resa.voyageur_nom, statut: resa.statut, canal: resa.canal, check_in: resa.check_in, check_out: resa.check_out, nb_nuits: resa.nb_nuits, prix_sejour: resa.prix_sejour }
        : null,
    });
  }
  return c.json({ ym, logement_id: logementId, jours, reservations: resas });
});

export default router;
