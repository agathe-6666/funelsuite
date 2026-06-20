-- ════════════════════════════════════════════════════════════════════════
--  Données de démonstration FUNEL suite (Lot 1 + Lot 2 + jeu d'exemple).
--  Pré-remplit les 3 biens, les 4 phases du séminaire, et des réservations
--  du MOIS EN COURS (dates calculées dynamiquement) pour que le tableau de
--  bord soit "vivant" dès le premier lancement.
--
--  ⚠️ Chiffres = HYPOTHÈSES d'illustration (cf. §4.3). À remplacer par tes
--     vrais chiffres dans l'app.  ⚠️ Ce script RÉINITIALISE la démo.
-- ════════════════════════════════════════════════════════════════════════

DELETE FROM upsells;
DELETE FROM reservations;
DELETE FROM params_charges_variables;
DELETE FROM charges_fixes;
DELETE FROM objectifs;
DELETE FROM logements;
DELETE FROM sqlite_sequence WHERE name IN
  ('logements','charges_fixes','params_charges_variables','reservations','upsells','objectifs');

-- ─── 3 logements ──────────────────────────────────────────────────────────
INSERT INTO logements (nom_commercial, adresse, ville, zone, type, surface_m2, dpe, statut, gestionnaire, plateformes, date_debut_bail, date_fin_bail) VALUES
 ('Studio Dolce Ciotat', '12 quai Ganteaume',    'La Ciotat', 1, 'studio',    28, 'C', 'actif', 'interne', 'Booking, Airbnb',         '2025-09-01', '2028-08-31'),
 ('Maison Provence',     '4 chemin des Oliviers', 'Aubagne',   2, 'maison T4', 95, 'D', 'actif', 'Noé',     'Booking, Airbnb, direct', '2025-06-15', '2028-06-14'),
 ('T2 Edgar Quinet',     '27 rue Edgar Quinet',   'Marseille', 3, 'T2',        42, 'C', 'actif', 'interne', 'Booking, Airbnb',         '2026-01-10', '2029-01-09');

-- ─── Charges fixes mensuelles ─────────────────────────────────────────────
INSERT INTO charges_fixes (logement_id, loyer_proprio, charges_locatives, assurance, abonnements, internet, autres, commentaire) VALUES
 ((SELECT id FROM logements WHERE nom_commercial='Studio Dolce Ciotat'), 540, 50,  20, 30,  0,  0, 'Hypothèses §4.3'),
 ((SELECT id FROM logements WHERE nom_commercial='Maison Provence'),    1200, 110, 35, 40, 30, 20, ''),
 ((SELECT id FROM logements WHERE nom_commercial='T2 Edgar Quinet'),     720, 70,  22, 30, 25,  0, '');

-- ─── Paramètres charges variables (taux en %) ─────────────────────────────
INSERT INTO params_charges_variables (logement_id, taux_commission_plateforme, cout_menage_sejour, cout_linge_sejour, cout_consommables_sejour, taux_frais_paiement, taxe_sejour_par_nuit) VALUES
 ((SELECT id FROM logements WHERE nom_commercial='Studio Dolce Ciotat'), 15, 25, 8,  5, 2, 1.5),
 ((SELECT id FROM logements WHERE nom_commercial='Maison Provence'),     15, 60, 20, 12, 2, 2.2),
 ((SELECT id FROM logements WHERE nom_commercial='T2 Edgar Quinet'),     15, 35, 12, 7, 2, 1.8);

-- ─── Réservations du mois courant ─────────────────────────────────────────
-- check_in = 1er du mois + (jour-1) jours. Studio (ADR ~80).
INSERT INTO reservations (logement_id, canal, check_in, check_out, nb_nuits, nb_voyageurs, prix_sejour, taxe_sejour, statut, date_reservation, voyageur_nom) VALUES
 ((SELECT id FROM logements WHERE nom_commercial='Studio Dolce Ciotat'), 'Booking', date('now','start of month','+1 days'),  date('now','start of month','+4 days'),  3, 2, 240, 9,  'confirmée', date('now','start of month','-11 days'), 'Famille Martin'),
 ((SELECT id FROM logements WHERE nom_commercial='Studio Dolce Ciotat'), 'Airbnb',  date('now','start of month','+6 days'),  date('now','start of month','+9 days'),  3, 2, 250, 9,  'confirmée', date('now','start of month','-6 days'),  'A. Dubois'),
 ((SELECT id FROM logements WHERE nom_commercial='Studio Dolce Ciotat'), 'Booking', date('now','start of month','+11 days'), date('now','start of month','+14 days'), 3, 3, 235, 14, 'confirmée', date('now','start of month','-1 days'),  'Couple Lefèvre'),
 ((SELECT id FROM logements WHERE nom_commercial='Studio Dolce Ciotat'), 'direct',  date('now','start of month','+17 days'), date('now','start of month','+21 days'), 4, 2, 330, 12, 'confirmée', date('now','start of month','+5 days'),  'M. Rossi'),
 ((SELECT id FROM logements WHERE nom_commercial='Studio Dolce Ciotat'), 'Airbnb',  date('now','start of month','+23 days'), date('now','start of month','+26 days'), 3, 4, 245, 18, 'confirmée', date('now','start of month','+11 days'), 'Groupe Bernard'),
-- Maison Provence (ADR ~180)
 ((SELECT id FROM logements WHERE nom_commercial='Maison Provence'), 'Booking', date('now','start of month','+1 days'),  date('now','start of month','+4 days'),  3, 4, 540,  26, 'confirmée', date('now','start of month','-11 days'), 'Famille Garnier'),
 ((SELECT id FROM logements WHERE nom_commercial='Maison Provence'), 'Airbnb',  date('now','start of month','+6 days'),  date('now','start of month','+9 days'),  3, 5, 560,  33, 'confirmée', date('now','start of month','-6 days'),  'S. Moreau'),
 ((SELECT id FROM logements WHERE nom_commercial='Maison Provence'), 'direct',  date('now','start of month','+11 days'), date('now','start of month','+15 days'), 4, 6, 745,  53, 'confirmée', date('now','start of month','-1 days'),  'Séminaire Petit'),
 ((SELECT id FROM logements WHERE nom_commercial='Maison Provence'), 'Booking', date('now','start of month','+18 days'), date('now','start of month','+21 days'), 3, 4, 545,  26, 'confirmée', date('now','start of month','+6 days'),  'Famille Roux'),
-- T2 Edgar Quinet (ADR ~95)
 ((SELECT id FROM logements WHERE nom_commercial='T2 Edgar Quinet'), 'Booking', date('now','start of month','+1 days'),  date('now','start of month','+4 days'),  3, 2, 285, 11, 'confirmée', date('now','start of month','-11 days'), 'L. Fontaine'),
 ((SELECT id FROM logements WHERE nom_commercial='T2 Edgar Quinet'), 'Airbnb',  date('now','start of month','+6 days'),  date('now','start of month','+9 days'),  3, 2, 295, 11, 'confirmée', date('now','start of month','-6 days'),  'K. Lambert'),
 ((SELECT id FROM logements WHERE nom_commercial='T2 Edgar Quinet'), 'Booking', date('now','start of month','+12 days'), date('now','start of month','+15 days'), 3, 3, 280, 16, 'confirmée', date('now','start of month','+0 days'),  'Couple Girard'),
 ((SELECT id FROM logements WHERE nom_commercial='T2 Edgar Quinet'), 'direct',  date('now','start of month','+17 days'), date('now','start of month','+21 days'), 4, 2, 390, 14, 'confirmée', date('now','start of month','+5 days'),  'P. Mercier');

-- ─── Upsells (accélèrent la couverture J15) ───────────────────────────────
INSERT INTO upsells (reservation_id, type, montant) VALUES
 ((SELECT id FROM reservations WHERE voyageur_nom='Famille Martin'), 'arrivée anticipée', 20),
 ((SELECT id FROM reservations WHERE voyageur_nom='Couple Lefèvre'), 'champagne', 35),
 ((SELECT id FROM reservations WHERE voyageur_nom='S. Moreau'),      'transfert aéroport', 45),
 ((SELECT id FROM reservations WHERE voyageur_nom='Séminaire Petit'),'ménage premium', 40),
 ((SELECT id FROM reservations WHERE voyageur_nom='L. Fontaine'),    'arrivée anticipée', 20);

-- ─── 4 phases du séminaire ────────────────────────────────────────────────
INSERT INTO objectifs (phase, libelle, date_debut, date_fin, ca_cible, marge_cible_pct, nb_logements_cible) VALUES
 (1, 'Amorçage — premiers biens & rodage', '2026-01-01', '2026-12-31', 120000, 35, 6),
 (2, 'Accélération — jalon 15 logements',  '2027-01-01', '2027-06-30', 220000, 35, 15),
 (3, 'Densification 3 zones',              '2027-07-01', '2027-12-31', 350000, 35, 25),
 (4, 'Palier 500 K€ — 35 logements',       '2028-01-01', '2028-06-30', 500000, 35, 35);
