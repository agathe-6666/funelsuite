import { useEffect, useMemo, useState } from 'react';
import { api, fmtEuro, fmtPct, moisCourant, moisLabel } from '../api.js';
import { Badge, Stat } from '../components/ui.jsx';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Décalage Lun-first pour aligner le 1er du mois.
function offsetLundi(ym) {
  const [y, m] = ym.split('-').map(Number);
  return (new Date(y, m - 1, 1).getDay() + 6) % 7;
}
function moisVoisin(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Calendrier() {
  const [logements, setLogements] = useState([]);
  const [logementId, setLogementId] = useState('');
  const [mois, setMois] = useState(moisCourant());
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/logements').then((ls) => {
      setLogements(ls);
      if (ls.length) setLogementId(String(ls[0].id));
    });
  }, []);

  useEffect(() => {
    if (!logementId) return;
    setData(null);
    api.get(`/metrics/calendrier?logement_id=${logementId}&mois=${mois}`).then(setData).catch(() => {});
  }, [logementId, mois]);

  const resume = useMemo(() => {
    if (!data) return null;
    let conf = 0, annul = 0, dispo = 0, ferme = 0;
    for (const j of data.jours) {
      if (j.reservation) (j.reservation.statut === 'annulée' ? annul++ : conf++);
      else if (j.dispo === 1) dispo++;
      else if (j.dispo === 0) ferme++;
    }
    const nbj = data.jours.length;
    return { conf, annul, dispo, ferme, occ: nbj ? conf / nbj : 0 };
  }, [data]);

  const cellules = useMemo(() => {
    if (!data) return [];
    return [...Array(offsetLundi(mois)).fill(null), ...data.jours];
  }, [data, mois]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Calendrier</h1>
          <p className="text-nuit/50">Vue jour par jour : séjours, disponibilités et prix affichés.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-auto" value={logementId} onChange={(e) => setLogementId(e.target.value)}>
            {logements.map((l) => <option key={l.id} value={l.id}>{l.nom_commercial}</option>)}
          </select>
          <button className="btn-ghost" onClick={() => setMois(moisVoisin(mois, -1))}>←</button>
          <input type="month" value={mois} onChange={(e) => setMois(e.target.value)} className="input w-auto" />
          <button className="btn-ghost" onClick={() => setMois(moisVoisin(mois, 1))}>→</button>
        </div>
      </header>

      {/* Résumé du mois */}
      {resume && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat label="Nuits réservées" valeur={resume.conf} sous="confirmées" />
          <Stat label="Nuits annulées" valeur={resume.annul} alerte={resume.annul > 0} />
          <Stat label="Nuits dispo" valeur={resume.dispo} />
          <Stat label="Nuits fermées" valeur={resume.ferme} />
          <Stat label="Taux d'occupation" valeur={fmtPct(resume.occ)} accent />
        </div>
      )}

      {/* Légende */}
      <div className="flex flex-wrap gap-4 text-xs text-nuit/60">
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded bg-nuit inline-block" /> Séjour confirmé</span>
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded bg-rose-300 inline-block" /> Annulé</span>
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded bg-white border border-poudre inline-block" /> Disponible (prix affiché)</span>
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded bg-gray-200 inline-block" /> Fermé / bloqué</span>
      </div>

      {/* Grille */}
      <div className="carte">
        {!data ? (
          <div className="text-nuit/40">Chargement…</div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {JOURS.map((j) => <div key={j} className="text-center text-xs font-medium text-nuit/50 py-1">{j}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cellules.map((j, i) => <Cellule key={i} j={j} />)}
            </div>
          </>
        )}
      </div>

      {/* Détail des réservations du mois */}
      {data && data.reservations.length > 0 && (
        <div className="carte p-0 overflow-hidden">
          <div className="px-4 py-3 text-sm font-medium border-b border-poudre/60">
            Réservations sur {moisLabel(mois)}
          </div>
          <table className="w-full text-sm">
            <tbody>
              {data.reservations.map((r) => (
                <tr key={r.id} className="border-t border-poudre/40">
                  <td className="p-3">{r.voyageur_nom || '—'}</td>
                  <td className="p-3 text-nuit/60">{r.check_in} → {r.check_out}</td>
                  <td className="p-3 text-right">{r.nb_nuits} nuit(s)</td>
                  <td className="p-3 text-right font-medium">{fmtEuro(r.prix_sejour)}</td>
                  <td className="p-3"><Badge ton="poudre">{r.canal || '—'}</Badge></td>
                  <td className="p-3">
                    {r.statut === 'annulée'
                      ? <Badge ton="rouge">annulée</Badge>
                      : <Badge ton="vert">confirmée</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Cellule({ j }) {
  if (!j) return <div className="aspect-square rounded-lg bg-transparent" />;
  const r = j.reservation;
  let cls = 'bg-white border border-poudre/60';
  let contenu = null;

  if (r && r.statut === 'annulée') {
    cls = 'bg-rose-100 border border-rose-200';
    contenu = j.premier_jour
      ? <span className="text-[10px] text-rose-600 line-through truncate">{r.voyageur || 'annulé'}</span>
      : <span className="text-[10px] text-rose-400">·</span>;
  } else if (r) {
    cls = 'bg-nuit text-white';
    contenu = j.premier_jour
      ? <span className="text-[10px] truncate">{r.voyageur || 'réservé'}</span>
      : <span className="text-[10px] text-white/60">·</span>;
  } else if (j.dispo === 0) {
    cls = 'bg-gray-100 border border-gray-200';
    contenu = <span className="text-[10px] text-gray-400">fermé</span>;
  } else if (j.prix_affiche != null) {
    contenu = <span className="text-[10px] text-nuit/50">{Math.round(j.prix_affiche)} €</span>;
  }

  return (
    <div className={`aspect-square rounded-lg p-1.5 flex flex-col justify-between overflow-hidden ${cls}`}>
      <span className={`text-xs font-medium ${r && r.statut !== 'annulée' ? 'text-white' : 'text-nuit/70'}`}>{j.jour}</span>
      <div className="leading-tight">{contenu}</div>
    </div>
  );
}
