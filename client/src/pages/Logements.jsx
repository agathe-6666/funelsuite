import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtEuro } from '../api.js';
import { Badge } from '../components/ui.jsx';

const totalCF = (cf = {}) =>
  (cf.loyer_proprio || 0) + (cf.charges_locatives || 0) + (cf.assurance || 0) +
  (cf.abonnements || 0) + (cf.internet || 0) + (cf.autres || 0);

const STATUT_TON = { actif: 'vert', prospect: 'or', archivé: 'gris' };

export default function Logements() {
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [nom, setNom] = useState('');

  const charger = () => api.get('/logements').then(setList);
  useEffect(() => { charger(); }, []);

  async function creer(e) {
    e.preventDefault();
    if (!nom.trim()) return;
    const l = await api.post('/logements', { nom_commercial: nom.trim(), statut: 'actif' });
    setNom(''); setCreating(false);
    await charger();
    window.location.href = `/logements/${l.id}`;
  }

  if (!list) return <div className="text-nuit/50">Chargement…</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl">Logements & charges</h1>
          <p className="text-nuit/50">Le cœur : chaque bien, son bail, ses charges fixes et variables.</p>
        </div>
        <button className="btn-nuit" onClick={() => setCreating((v) => !v)}>+ Ajouter un bien</button>
      </header>

      {creating && (
        <form onSubmit={creer} className="carte flex items-end gap-3">
          <div className="flex-1">
            <label className="label-champ">Nom commercial</label>
            <input className="input" autoFocus value={nom} onChange={(e) => setNom(e.target.value)}
              placeholder="ex. Studio Dolce Ciotat" />
          </div>
          <button className="btn-or" type="submit">Créer</button>
        </form>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((l) => (
          <Link key={l.id} to={`/logements/${l.id}`} className="carte block hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-titre text-lg">{l.nom_commercial}</div>
                <div className="text-xs text-nuit/40">{l.ville || '—'} · {l.type || '—'} · zone {l.zone || '—'}</div>
              </div>
              <Badge ton={STATUT_TON[l.statut] || 'nuit'}>{l.statut}</Badge>
            </div>
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-nuit/50">Charges fixes / mois</span>
              <span className="font-medium">{fmtEuro(totalCF(l.charges_fixes))}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-nuit/50">Commission + frais</span>
              <span className="font-medium">
                {((l.params_charges_variables?.taux_commission_plateforme || 0) +
                  (l.params_charges_variables?.taux_frais_paiement || 0))} %
              </span>
            </div>
          </Link>
        ))}
      </div>
      {list.length === 0 && <div className="carte text-nuit/50">Aucun bien. Clique « Ajouter un bien ».</div>}
    </div>
  );
}
