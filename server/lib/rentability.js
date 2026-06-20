// ════════════════════════════════════════════════════════════════════════
//  Moteur de rentabilité — §4 du plan d'action.
//  Toutes les formules de seuil / point mort / marge vivent ICI, pour que le
//  tableau de bord (Lot 4) et le simulateur (Lot 5) donnent exactement les
//  mêmes chiffres. Les taux en entrée sont en POURCENT (15 = 15 %).
// ════════════════════════════════════════════════════════════════════════

/** Nombre de jours dans le mois d'une date 'YYYY-MM'. */
export function joursDansMois(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Total des charges fixes mensuelles d'un logement. */
export function totalChargesFixes(cf = {}) {
  return (
    (cf.loyer_proprio || 0) +
    (cf.charges_locatives || 0) +
    (cf.assurance || 0) +
    (cf.abonnements || 0) +
    (cf.internet || 0) +
    (cf.autres || 0)
  );
}

/**
 * Charges variables et marge variable d'UNE réservation.
 *   charges_variables = prix × (commission% + frais%) + ménage + linge + conso
 *   marge_variable    = prix − charges_variables
 */
export function chargesVariablesReservation(prixSejour, params = {}) {
  const tauxPct =
    ((params.taux_commission_plateforme || 0) +
      (params.taux_frais_paiement || 0)) /
    100;
  const commissionEtFrais = prixSejour * tauxPct;
  const fixesParSejour =
    (params.cout_menage_sejour || 0) +
    (params.cout_linge_sejour || 0) +
    (params.cout_consommables_sejour || 0);
  const charges_variables = commissionEtFrais + fixesParSejour;
  return {
    charges_variables,
    marge_variable: prixSejour - charges_variables,
    commission_et_frais: commissionEtFrais,
    fixes_par_sejour: fixesParSejour,
  };
}

/**
 * Indicateurs de rentabilité d'un logement sur un mois.
 *
 * @param {object} a
 * @param {object} a.chargesFixes      ligne charges_fixes
 * @param {object} a.params            ligne params_charges_variables
 * @param {Array}  a.reservations      réservations confirmées du mois [{prix_sejour, nb_nuits}]
 * @param {number} a.upsells           total des upsells encaissés sur le mois
 * @param {number} a.nuitsDisponibles  nuits dispo (calendrier) — sinon jours du mois
 * @param {string} a.ym                'YYYY-MM'
 */
export function indicateursLogement({
  chargesFixes = {},
  params = {},
  reservations = [],
  upsells = 0,
  nuitsDisponibles = null,
  ym,
}) {
  const nbJoursMois = joursDansMois(ym);
  const charges_fixes = totalChargesFixes(chargesFixes);

  // Agrégats réels du mois
  let ca_hebergement = 0;
  let charges_variables_reelles = 0;
  let nuits_reservees = 0;
  let commission_et_frais_total = 0;
  let menage_total = 0;
  let linge_total = 0;
  let consommables_total = 0;
  for (const r of reservations) {
    const prix = r.prix_sejour || 0;
    ca_hebergement += prix;
    nuits_reservees += r.nb_nuits || 0;
    const cv = chargesVariablesReservation(prix, params);
    charges_variables_reelles += cv.charges_variables;
    commission_et_frais_total += cv.commission_et_frais;
    // Coûts par séjour : comptés UNE FOIS par réservation (1 ménage / linge par séjour)
    menage_total += params.cout_menage_sejour || 0;
    linge_total += params.cout_linge_sejour || 0;
    consommables_total += params.cout_consommables_sejour || 0;
  }

  const ca_total = ca_hebergement + upsells; // CA = nuits + upsells (§5)
  const marge_variable_totale = ca_hebergement - charges_variables_reelles;

  // Taux de marge sur coûts variables (sur le réel du mois si dispo)
  const taux_marge_var =
    ca_hebergement > 0 ? marge_variable_totale / ca_hebergement : null;

  // ① Seuil de rentabilité en € de CA
  const seuil_ca =
    taux_marge_var && taux_marge_var > 0 ? charges_fixes / taux_marge_var : null;

  // ② Seuil en nombre de nuits
  const adr_net = nuits_reservees > 0 ? ca_hebergement / nuits_reservees : null;
  const marge_variable_par_nuit =
    nuits_reservees > 0 ? marge_variable_totale / nuits_reservees : null;
  const seuil_nuits =
    marge_variable_par_nuit && marge_variable_par_nuit > 0
      ? charges_fixes / marge_variable_par_nuit
      : null;

  // ③ Point mort en jour du mois (CA prévu ≈ CA réalisé du mois, proxy)
  const ca_par_jour = ca_hebergement / nbJoursMois;
  const point_mort_jour =
    seuil_ca && ca_par_jour > 0 ? seuil_ca / ca_par_jour : null;

  // ④ Rentabilité réalisée
  const marge_nette = ca_total - charges_variables_reelles - charges_fixes;
  const taux_marge_nette = ca_total > 0 ? marge_nette / ca_total : null;

  // KPIs §5
  const nuits_dispo = nuitsDisponibles ?? nbJoursMois;
  const taux_occupation = nuits_dispo > 0 ? nuits_reservees / nuits_dispo : null;
  const revpar = nuits_dispo > 0 ? ca_hebergement / nuits_dispo : null;
  const panier_moyen =
    reservations.length > 0 ? ca_total / reservations.length : null;

  return {
    ym,
    nb_jours_mois: nbJoursMois,
    charges_fixes,
    ca_hebergement,
    upsells,
    ca_total,
    charges_variables_reelles,
    charges_detail: {
      commission_et_frais: commission_et_frais_total,
      menage: menage_total,
      linge: linge_total,
      consommables: consommables_total,
      nb_sejours: reservations.length,
    },
    marge_variable_totale,
    taux_marge_var,
    seuil_ca,
    adr_net,
    marge_variable_par_nuit,
    seuil_nuits,
    point_mort_jour,
    marge_nette,
    taux_marge_nette,
    nuits_reservees,
    nuits_dispo,
    taux_occupation,
    revpar,
    panier_moyen,
    nb_reservations: reservations.length,
  };
}

/**
 * Pilotage « 15 premiers jours » (§4bis).
 * objectif_J15 = charges fixes du mois ; encaissé à date = CA résa + upsells
 * depuis le 1er. % couverture, et alerte si en retard sur le rythme attendu.
 */
export function pilotageJ15({ chargesFixes = {}, encaisseADate = 0, jourDuMois, nbJoursMois }) {
  const objectif = totalChargesFixes(chargesFixes);
  const couverturePct = objectif > 0 ? encaisseADate / objectif : null;
  // Rythme attendu : 100 % atteint au 15. Avant J15, cible linéaire = jour/15.
  const rythmeAttendu = Math.min(jourDuMois / 15, 1);
  const enRetard = couverturePct !== null && couverturePct < rythmeAttendu;
  return {
    objectif_j15: objectif,
    encaisse_a_date: encaisseADate,
    couverture_pct: couverturePct,
    rythme_attendu_pct: rythmeAttendu,
    en_retard: enRetard,
    jour_du_mois: jourDuMois,
    nb_jours_mois: nbJoursMois,
  };
}

/**
 * Simulateur (§6bis-A) : à partir d'un ADR et d'un taux d'occupation, recalcule
 * CA / marge / seuil / point mort. Sans données externes — 100 % formules §4.
 */
export function simulation({ adr, tauxOccupationPct, chargesFixes = {}, params = {}, nbJoursMois = 30, upsells = 0 }) {
  const occ = tauxOccupationPct / 100;
  const nuits = Math.round(nbJoursMois * occ);
  const ca_hebergement = adr * nuits;
  const charges_fixes = totalChargesFixes(chargesFixes);

  // Coût variable par nuit : part proportionnelle + part par séjour ramenée à la
  // nuit (on suppose ici une réservation = la durée moyenne ; on amortit les
  // coûts par séjour sur l'ensemble des nuits du mois).
  const tauxPct =
    ((params.taux_commission_plateforme || 0) + (params.taux_frais_paiement || 0)) / 100;
  const fixesParSejour =
    (params.cout_menage_sejour || 0) +
    (params.cout_linge_sejour || 0) +
    (params.cout_consommables_sejour || 0);
  // Hypothèse de durée moyenne de séjour pour estimer le nb de séjours
  const dureeMoyenne = 3;
  const nbSejours = nuits > 0 ? Math.max(1, Math.round(nuits / dureeMoyenne)) : 0;
  const charges_variables = ca_hebergement * tauxPct + fixesParSejour * nbSejours;
  const marge_variable_totale = ca_hebergement - charges_variables;
  const taux_marge_var = ca_hebergement > 0 ? marge_variable_totale / ca_hebergement : null;

  const ca_total = ca_hebergement + upsells;
  const seuil_ca = taux_marge_var && taux_marge_var > 0 ? charges_fixes / taux_marge_var : null;
  const marge_variable_par_nuit = nuits > 0 ? marge_variable_totale / nuits : null;
  const seuil_nuits =
    marge_variable_par_nuit && marge_variable_par_nuit > 0 ? charges_fixes / marge_variable_par_nuit : null;
  const ca_par_jour = ca_hebergement / nbJoursMois;
  const point_mort_jour = seuil_ca && ca_par_jour > 0 ? seuil_ca / ca_par_jour : null;
  const marge_nette = ca_total - charges_variables - charges_fixes;
  const taux_marge_nette = ca_total > 0 ? marge_nette / ca_total : null;

  return {
    adr,
    taux_occupation_pct: tauxOccupationPct,
    nuits,
    ca_hebergement,
    ca_total,
    charges_fixes,
    charges_variables,
    marge_variable_totale,
    taux_marge_var,
    seuil_ca,
    seuil_nuits,
    point_mort_jour,
    marge_nette,
    taux_marge_nette,
  };
}
