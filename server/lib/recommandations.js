// ════════════════════════════════════════════════════════════════════════
//  Moteur de recommandations du tableau de bord.
//  À partir des indicateurs d'un bien sur le mois + du contexte (calendrier,
//  délais de réservation), produit des conseils concrets : atteindre le point
//  d'équilibre, ou — s'il est atteint — pousser les prix de fin de mois, etc.
//  S'appuie sur les réflexes du séminaire (§6bis-B du plan).
// ════════════════════════════════════════════════════════════════════════

/**
 * @param {object} a
 * @param {object} a.ind     indicateurs du bien (lib/rentability)
 * @param {object} a.j15     pilotage « 15 premiers jours »
 * @param {number} a.jour    jour du mois (référence)
 * @param {number} a.nbJours nb de jours du mois
 * @param {number} a.joursRestants  jours restants dans le mois
 * @param {number} a.nuitsLibresMois nuits encore libres d'ici la fin du mois
 * @param {number} a.nuitsLibres20j  nuits libres dans les 20 prochains jours
 * @param {number} a.resaLointaines  réservations futures tombées à +20 j du check-in
 * @returns {Array<{id,ton,icone,titre,detail}>}
 */
export function genererRecommandations({
  ind, j15, jour, nbJours, joursRestants,
  nuitsLibresMois = 0, nuitsLibres20j = 0, resaLointaines = 0,
}) {
  const recos = [];
  const euro = (n) => `${Math.round(n)} €`;
  const pct = (n) => `${Math.round((n || 0) * 100)} %`;

  const seuilConnu = ind.seuil_ca != null && ind.seuil_ca > 0;
  const atteint = seuilConnu && ind.ca_total >= ind.seuil_ca;
  const manque = seuilConnu ? Math.max(0, ind.seuil_ca - ind.ca_total) : null;

  // ── 1. Point d'équilibre ────────────────────────────────────────────────
  if (seuilConnu && !atteint) {
    recos.push({
      id: 'seuil-non-atteint',
      ton: 'or',
      icone: '🎯',
      titre: `Point d'équilibre pas encore atteint — il manque ${euro(manque)} de CA`,
      detail:
        `Tu es rentable à partir du J${ind.point_mort_jour ? Math.ceil(ind.point_mort_jour) : '—'} au rythme actuel.` +
        (joursRestants > 0 ? ` Il reste ${joursRestants} jour(s) et ${nuitsLibresMois} nuit(s) libre(s) ce mois.` : ''),
    });
    if (nuitsLibres20j > 0) {
      recos.push({
        id: 'last-minute',
        ton: 'nuit',
        icone: '⬇️',
        titre: `${nuitsLibres20j} nuit(s) libre(s) dans les 20 prochains jours → baisse le prix (last-minute)`,
        detail: 'Le calendrier proche encore vide = prix trop haut pour la date. Descends vers ton prix plancher pour remplir.',
      });
    }
    recos.push({
      id: 'upsells',
      ton: 'nuit',
      icone: '✨',
      titre: 'Pousse les upsells pour accélérer la couverture',
      detail: 'Arrivée anticipée, départ tardif, ménage premium, paniers : autant de marge qui rapproche du seuil avant J15.',
    });
  } else if (atteint) {
    recos.push({
      id: 'seuil-atteint',
      ton: 'vert',
      icone: '🗝️',
      titre: 'Point d\'équilibre atteint — le reste du mois est de la marge',
      detail: `Tu as dépassé ton seuil de ${euro(ind.ca_total - ind.seuil_ca)}. Plus besoin de remplir à tout prix.`,
    });
    if (nuitsLibresMois > 0) {
      recos.push({
        id: 'monter-fin-mois',
        ton: 'or',
        icone: '⬆️',
        titre: `Monte tes prix sur les ${nuitsLibresMois} nuit(s) encore libres de fin de mois`,
        detail: 'Seuil couvert : chaque nuit vendue plus chère part directement en marge. Vise le RevPAR, pas le taux de remplissage.',
      });
    }
  }

  // ── 2. Couverture du loyer (J15) ────────────────────────────────────────
  if (j15 && j15.en_retard && jour <= 15) {
    recos.push({
      id: 'j15-retard',
      ton: 'rouge',
      icone: '⚠️',
      titre: `Couverture du loyer en retard (${pct(j15.couverture_pct)} au J${jour})`,
      detail: 'Tu devrais être à 100 % au J15. Revois la grille de prix des nuits proches et active les upsells.',
    });
  }

  // ── 3. Revenue management — délai de réservation (réflexe « +18 jours ») ─
  if (resaLointaines >= 2) {
    recos.push({
      id: 'prix-trop-bas',
      ton: 'or',
      icone: '📈',
      titre: `${resaLointaines} réservations tombées à plus de 20 jours → prix probablement trop bas`,
      detail: 'Quand la demande arrive trop tôt, c\'est que le prix est sous le marché. Remonte toute la grille (réflexe « +18 jours »).',
    });
  }

  // ── 4. Occupation vs RevPAR ─────────────────────────────────────────────
  if (ind.taux_occupation != null && ind.taux_occupation > 0.85) {
    recos.push({
      id: 'occ-haute',
      ton: 'or',
      icone: '⬆️',
      titre: `Occupation très élevée (${pct(ind.taux_occupation)}) → tu peux monter l'ADR`,
      detail: `RevPAR actuel ${euro(ind.revpar || 0)}. Une hausse de prix se traduira en marge sans perdre beaucoup de nuits.`,
    });
  } else if (ind.taux_occupation != null && ind.taux_occupation < 0.4 && joursRestants <= 12 && nuitsLibres20j > 0) {
    recos.push({
      id: 'occ-basse',
      ton: 'nuit',
      icone: '⬇️',
      titre: `Occupation faible (${pct(ind.taux_occupation)}) avec des nuits proches libres`,
      detail: 'Active des promos last-minute / nuits dégressives pour ne pas laisser des nuits invendues.',
    });
  }

  // ── 5. Marge sous l'objectif ────────────────────────────────────────────
  if (ind.taux_marge_nette != null && ind.ca_total > 0 && ind.taux_marge_nette < 0.35) {
    recos.push({
      id: 'marge-faible',
      ton: 'rouge',
      icone: '🔻',
      titre: `Taux de marge sous l'objectif 35 % (${pct(ind.taux_marge_nette)})`,
      detail: 'Vérifie tes charges variables (commission, ménage, linge) ou monte l\'ADR. La marge prime sur le volume.',
    });
  }

  if (recos.length === 0) {
    recos.push({
      id: 'rien',
      ton: 'vert',
      icone: '🌞',
      titre: 'Rien à signaler — continue comme ça',
      detail: 'Les indicateurs sont dans le vert sur ce bien ce mois-ci.',
    });
  }
  return recos;
}
