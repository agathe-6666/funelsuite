-- ════════════════════════════════════════════════════════════════════════
--  FUNEL suite — schéma SQLite (Modèle de données §3 du plan d'action)
--  Une table = une entité. Toutes les sommes monétaires sont en euros.
--  Les taux (commission, frais de paiement, marge) sont stockés en POURCENT
--  (ex. 15 = 15 %).
-- ════════════════════════════════════════════════════════════════════════

-- ─── Module 1 : Logements & baux ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logements (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  nom_commercial       TEXT NOT NULL,
  adresse              TEXT,
  ville                TEXT,
  zone                 INTEGER,                       -- 1 / 2 / 3
  type                 TEXT,                          -- studio, T2, maison…
  surface_m2           REAL,
  dpe                  TEXT,
  statut               TEXT DEFAULT 'actif',          -- actif / prospect / archivé
  gestionnaire         TEXT DEFAULT 'interne',        -- interne / Noé
  plateformes          TEXT,                          -- "Booking, Airbnb"
  rental_id_superhote  TEXT,                          -- GET /rentals
  date_debut_bail      TEXT,
  date_fin_bail        TEXT,
  created_at           TEXT DEFAULT (datetime('now'))
);

-- Charges fixes mensuelles (1 ligne par logement)
CREATE TABLE IF NOT EXISTS charges_fixes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  logement_id       INTEGER NOT NULL UNIQUE,
  loyer_proprio     REAL DEFAULT 0,
  charges_locatives REAL DEFAULT 0,                   -- eau, élec…
  assurance         REAL DEFAULT 0,
  abonnements       REAL DEFAULT 0,                   -- quote-part Superhote, AirDNA…
  internet          REAL DEFAULT 0,
  autres            REAL DEFAULT 0,
  commentaire       TEXT,
  FOREIGN KEY (logement_id) REFERENCES logements(id) ON DELETE CASCADE
);

-- Paramètres des charges variables (1 ligne par logement)
CREATE TABLE IF NOT EXISTS params_charges_variables (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  logement_id                 INTEGER NOT NULL UNIQUE,
  taux_commission_plateforme  REAL DEFAULT 0,         -- % (Booking ~15)
  cout_menage_sejour          REAL DEFAULT 0,
  cout_linge_sejour           REAL DEFAULT 0,
  cout_consommables_sejour    REAL DEFAULT 0,
  taux_frais_paiement         REAL DEFAULT 0,         -- % (Stripe)
  taxe_sejour_par_nuit        REAL DEFAULT 0,         -- neutre dans la marge
  FOREIGN KEY (logement_id) REFERENCES logements(id) ON DELETE CASCADE
);

-- ─── Module 3 : Réservations (← API Superhote, saisie manuelle en secours) ─
CREATE TABLE IF NOT EXISTS reservations (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id_superhote TEXT,
  logement_id              INTEGER NOT NULL,
  canal                    TEXT,                      -- Booking, Airbnb, direct…
  check_in                 TEXT NOT NULL,             -- YYYY-MM-DD
  check_out                TEXT NOT NULL,             -- YYYY-MM-DD
  nb_nuits                 INTEGER DEFAULT 0,
  nb_voyageurs             INTEGER DEFAULT 0,
  prix_sejour              REAL DEFAULT 0,            -- hébergement (hors taxe de séjour)
  taxe_sejour              REAL DEFAULT 0,
  statut                   TEXT DEFAULT 'confirmée',  -- confirmée / annulée
  date_reservation         TEXT,
  updated_at               TEXT DEFAULT (datetime('now')),
  voyageur_nom             TEXT,
  FOREIGN KEY (logement_id) REFERENCES logements(id) ON DELETE CASCADE
);

-- Unicité de l'ID Superhote (pour la synchro incrémentale ON CONFLICT),
-- uniquement quand il est renseigné (les saisies manuelles ont NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_resa_superhote
  ON reservations(reservation_id_superhote)
  WHERE reservation_id_superhote IS NOT NULL;

CREATE TABLE IF NOT EXISTS upsells (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL,
  type           TEXT,                                -- arrivée anticipée, transfert, champagne…
  montant        REAL DEFAULT 0,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
);

-- ─── Module 2 : Objectifs (4 phases du séminaire) ─────────────────────────
CREATE TABLE IF NOT EXISTS objectifs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  phase               INTEGER,                         -- 1–4
  libelle             TEXT,
  date_debut          TEXT,
  date_fin            TEXT,
  ca_cible            REAL DEFAULT 0,
  marge_cible_pct     REAL DEFAULT 0,
  nb_logements_cible  INTEGER DEFAULT 0
);

-- ─── Module 4 : CRM propriétaires & apporteurs ────────────────────────────
CREATE TABLE IF NOT EXISTS proprietaires (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  nom              TEXT,
  contact          TEXT,
  source           TEXT,                               -- IAD / apporteur / réseau
  statut           TEXT DEFAULT 'prospect',            -- prospect / en discussion / signé / perdu
  biens_lies       TEXT,
  prochaine_action TEXT,
  date_relance     TEXT,
  notes            TEXT
);

CREATE TABLE IF NOT EXISTS apporteurs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nom            TEXT,
  contact        TEXT,
  commission     REAL DEFAULT 0,                       -- 300–500 €/bien
  biens_apportes TEXT
);

-- ─── Module 5 : Tunnel voyageur (checklist 7 messages par réservation) ────
CREATE TABLE IF NOT EXISTS tunnel_messages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL,
  etape          INTEGER,                              -- 1–7
  fait           INTEGER DEFAULT 0,                    -- 0 / 1
  date           TEXT,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
);

-- ─── Données calendrier (← GET /rentals/{id}/calendar) ────────────────────
CREATE TABLE IF NOT EXISTS calendrier (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  logement_id  INTEGER NOT NULL,
  date         TEXT NOT NULL,                          -- YYYY-MM-DD
  dispo        INTEGER DEFAULT 1,                      -- 0 / 1
  prix_affiche REAL,
  min_stay     INTEGER,
  FOREIGN KEY (logement_id) REFERENCES logements(id) ON DELETE CASCADE
);

-- ─── Module 8 : Recommandations prix (générées chaque jour) ───────────────
CREATE TABLE IF NOT EXISTS recommandations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  logement_id    INTEGER NOT NULL,
  date           TEXT,
  action         TEXT,                                 -- monter / baisser / garder
  delta_suggere  REAL,                                 -- %
  raison         TEXT,
  applique       INTEGER DEFAULT 0,
  FOREIGN KEY (logement_id) REFERENCES logements(id) ON DELETE CASCADE
);

-- ─── Module 9 : Événements à proximité ────────────────────────────────────
CREATE TABLE IF NOT EXISTS evenements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  titre          TEXT,
  categorie      TEXT,                                 -- concert, sport, conférence…
  date_debut     TEXT,
  date_fin       TEXT,
  lieu           TEXT,
  distance_km    REAL,
  impact_demande TEXT,                                 -- faible / moyen / fort
  source         TEXT
);
