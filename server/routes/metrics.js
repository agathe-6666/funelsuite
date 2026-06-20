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

async function upsellsMois(db, logementId, ym, jusquaDate = null) {
  let sql = `SELECT COALESCE(SUM(u.montant),0) AS total
             FROM upsells u JOIN reservations r ON r.id = u.reservation_id
             WHERE r.logement_id = ? AND strftime('%Y-%m', r.check_in) = ?`;
  const args = [logementId, ym];
  if (jusquaDate) { sql += ' AND r.check_in <= ?'; args.push(jusquaDate); }
  const row = await db.prepare(sql).bind(...args).first();
  return row.total || 0;
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
    const ind = indicateursLogement({ chargesFixes, params, reservations: resas, upsells: ups, ym });

    const resasADate = estMoisCourant ? resas.filter((r) => r.check_in <= aujourdhui) : resas;
    const encaisse =
      resasADate.reduce((s, r) => s + (r.prix_sejour || 0), 0) +
      (await upsellsMois(db, id, ym, estMoisCourant ? aujourdhui : null));
    const j15 = pilotageJ15({ chargesFixes, encaisseADate: encaisse, jourDuMois, nbJoursMois });

    parBien.push({ logement, indicateurs: ind, j15 });
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
  const indicateurs = indicateursLogement({ chargesFixes, params, reservations: resas, upsells: ups, ym });
  return c.json({ logement, chargesFixes, params, indicateurs, reservations: resas });
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

export default router;
