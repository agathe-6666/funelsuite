# 🗝️ FUNEL suite — plateforme de pilotage

App web de pilotage de la sous-location courte durée : logements & charges,
objectifs, moteur de rentabilité (seuil, point mort), tableau de bord et
simulateur. Pensée pour tourner **en local** comme **déployée sur Cloudflare**,
avec **le même code**.

> Les références « §4 », « §8 »… renvoient au brief *Plan d'action plateforme
> FUNEL suite* qui a cadré ce projet.

## Stack

| Brique | Choix | Pourquoi |
|---|---|---|
| Front | React + Vite + Tailwind + Recharts | Charte FUNEL (§8) facile à appliquer, graphiques |
| API | Cloudflare Worker + **Hono** | Léger, tourne en local et en ligne sans changement |
| Base de données | Cloudflare **D1** (SQLite serverless) | Un seul moteur en local (miniflare) et en prod |
| Secrets | `.dev.vars` (local) / `wrangler secret` (prod) | Token Superhote jamais dans le code |

En local, `wrangler dev` simule D1 avec une base SQLite locale → **tes données
restent sur ta machine**. En ligne, c'est la base D1 de ton compte Cloudflare.

## Démarrage local (5 minutes)

```bash
npm install                 # installe front + worker
npm run db:setup:local      # crée les tables (migrations) + données de démo
npm run dev                 # lance le Worker (API) + Vite (UI)
```

Puis ouvre **http://localhost:5173**. L'API tourne sur `:8787`, le front la
joint via un proxy `/api`.

> `npm run db:setup:local` réinitialise un jeu de **données de démonstration**
> (3 biens, 4 phases d'objectifs, des réservations du mois en cours). Remplace-les
> par tes vrais chiffres dans l'app.

## Déploiement sur Cloudflare

Prérequis : un compte Cloudflare. Connecte-toi une fois : `npx wrangler login`.

1. **Créer la base D1** et coller son identifiant dans `wrangler.toml` :
   ```bash
   npx wrangler d1 create funel-suite-db
   # → copie le "database_id" renvoyé dans wrangler.toml (champ database_id)
   ```
2. **Créer les tables + (option) données de démo** sur la base en ligne :
   ```bash
   npm run db:migrate:remote     # tables seules
   # ou, pour aussi charger la démo :
   npm run db:setup:remote
   ```
3. **Définir le token Superhote** (secret, jamais commité) :
   ```bash
   npx wrangler secret put SUPERHOTE_TOKEN
   ```
4. **Déployer** (build React + push du Worker) :
   ```bash
   npm run deploy
   ```
   Wrangler renvoie l'URL publique (`https://funel-suite.<ton-sous-domaine>.workers.dev`).
   Le même Worker sert l'app **et** l'API.

### Mises à jour
Re-déploie avec `npm run deploy`. Pour un changement de schéma, ajoute un fichier
`migrations/0002_*.sql` puis `npm run db:migrate:remote`.

## Le moteur de rentabilité (§4)

Toutes les formules vivent dans `server/lib/rentability.js` (réutilisées à
l'identique par le tableau de bord et le simulateur) :

- **Seuil de CA** = charges fixes ÷ taux de marge sur coûts variables
- **Seuil en nuits** = charges fixes ÷ marge variable par nuit
- **Point mort (jour du mois)** = seuil CA ÷ (CA prévu ÷ nb jours)
- **Marge nette** = CA − charges variables − charges fixes
- **Pilotage « 15 premiers jours » (§4bis)** : couverture du loyer à date
- **KPIs (§5)** : occupation, ADR, **RevPAR**, panier moyen, avancement objectif

> Réflexe séminaire intégré à l'UI : l'occupation n'est jamais affichée seule,
> toujours couplée au **RevPAR**.

## Structure

```
wrangler.toml          Config Cloudflare (Worker + D1 + assets React)
migrations/            Schéma D1 (§3) — une migration par évolution
server/                Worker Hono
  index.js             Entrée : /api/* + service de l'app React
  lib/rentability.js   Moteur de calcul (§4) — formules pures
  routes/              logements · objectifs · reservations · metrics · superhote
  seed.sql             Données de démonstration
client/                App React (Vite + Tailwind + Recharts)
  src/pages/           Dashboard · Logements · LogementDetail · Reservations · Objectifs · Simulateur
  src/components/ui.jsx Jauges, cartes KPI, badges (charte §8)
```

## Périmètre livré & suite

**Livré (Lots 0 → 6 partiel)** : fondations + charte, Logements & charges,
Objectifs, moteur de rentabilité, tableau de bord (Mois/Année/Par bien + jauge
J15), simulateur, et le **scaffold de synchro Superhote** (actif dès qu'un token
est fourni — bouton « Synchroniser »).

**Prochaines étapes** (cf. plan §10) :
- **Lot 7** — recommandations prix quotidiennes (Cron Trigger du Worker)
- **Lot 8** — CRM propriétaires & apporteurs
- **Lot 9** — tunnel voyageur (7 messages) & upsells détaillés
- **Lot 10** — événements à proximité (Ticketmaster / OpenAgenda)

## Côté Superhote (§12)
- **Régénérer** le token API (l'ancien a été partagé en clair → compromis),
  puis `wrangler secret put SUPERHOTE_TOKEN`.
- Renseigner le **Rental ID Superhote** de chaque bien (fiche logement) pour que
  la synchro mappe les réservations.
