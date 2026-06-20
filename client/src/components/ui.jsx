import { fmtEuro, fmtPct } from '../api.js';

// Jauge / barre de progression — bleu nuit, passe en or quand l'objectif
// est atteint (≥ 100 %), conformément à la charte (§8).
export function Jauge({ valeur, max = 1, atteintLabel, className = '' }) {
  const pct = max > 0 ? Math.min(valeur / max, 1) : 0;
  const atteint = valeur >= max;
  return (
    <div className={className}>
      <div className="h-3 w-full rounded-full bg-poudre overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${atteint ? 'bg-or' : 'bg-nuit'}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

// Carte KPI
export function Stat({ label, valeur, sous, accent = false, alerte = false }) {
  return (
    <div className={`carte ${alerte ? 'ring-2 ring-or' : ''}`}>
      <div className="label-champ">{label}</div>
      <div className={`text-2xl font-titre ${accent ? 'text-or' : 'text-nuit'}`}>{valeur}</div>
      {sous && <div className="text-xs text-nuit/50 mt-1">{sous}</div>}
    </div>
  );
}

// Badge de statut coloré
export function Badge({ children, ton = 'nuit' }) {
  const tons = {
    nuit: 'bg-nuit/10 text-nuit',
    or: 'bg-or/30 text-nuit',
    poudre: 'bg-poudre text-nuit',
    gris: 'bg-gray-100 text-gray-500',
    vert: 'bg-emerald-100 text-emerald-700',
    rouge: 'bg-rose-100 text-rose-700',
  };
  return <span className={`badge ${tons[ton] || tons.nuit}`}>{children}</span>;
}

// Bandeau pédagogique (réflexes séminaire)
export function Conseil({ children }) {
  return (
    <div className="rounded-xl bg-poudre/60 border border-poudre px-4 py-3 text-sm text-nuit/80">
      🌞 {children}
    </div>
  );
}

// État de couverture du loyer (J15)
export function CouvertureLoyer({ j15 }) {
  if (!j15 || j15.objectif_j15 <= 0) return null;
  const pct = j15.couverture_pct ?? 0;
  const atteint = pct >= 1;
  return (
    <div className="carte">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg">Couverture du loyer · 15 premiers jours</h3>
        <span className={`text-sm font-medium ${j15.en_retard ? 'text-rose-600' : atteint ? 'text-or' : 'text-nuit'}`}>
          {j15.en_retard ? '⚠ en retard sur le rythme' : atteint ? '🗝️ loyer couvert' : 'en cours'}
        </span>
      </div>
      <p className="text-sm text-nuit/60 mt-1">
        Loyer couvert à <strong>{fmtPct(pct)}</strong> au {j15.jour_du_mois} du mois
        <span className="text-nuit/40"> · objectif {fmtEuro(j15.objectif_j15)} · encaissé {fmtEuro(j15.encaisse_a_date)}</span>
      </p>
      <Jauge valeur={j15.encaisse_a_date} max={j15.objectif_j15} className="mt-3" />
      <div className="text-xs text-nuit/40 mt-1">
        Rythme attendu au {j15.jour_du_mois} : {fmtPct(j15.rythme_attendu_pct)} (100 % visé à J15)
      </div>
    </div>
  );
}
