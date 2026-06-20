import { useEffect, useState } from 'react';
import { api, fmtEuro } from '../api.js';

const champs = [
  ['phase', 'Phase', 'number'],
  ['libelle', 'Libellé', 'text'],
  ['date_debut', 'Début', 'date'],
  ['date_fin', 'Fin', 'date'],
  ['ca_cible', 'CA cible (€)', 'number'],
  ['marge_cible_pct', 'Marge cible (%)', 'number'],
  ['nb_logements_cible', 'Nb logements', 'number'],
];

export default function Objectifs() {
  const [list, setList] = useState(null);
  const charger = () => api.get('/objectifs').then(setList);
  useEffect(() => { charger(); }, []);

  async function maj(o, k, v) {
    const val = ['phase', 'ca_cible', 'marge_cible_pct', 'nb_logements_cible'].includes(k) ? Number(v) : v;
    setList(list.map((x) => (x.id === o.id ? { ...x, [k]: val } : x)));
  }
  async function enregistrer(o) { await api.put(`/objectifs/${o.id}`, o); charger(); }
  async function ajouter() {
    await api.post('/objectifs', { phase: (list.length || 0) + 1, libelle: 'Nouvelle phase', ca_cible: 0, marge_cible_pct: 35, nb_logements_cible: 0 });
    charger();
  }
  async function supprimer(o) { if (confirm('Supprimer cette phase ?')) { await api.del(`/objectifs/${o.id}`); charger(); } }

  if (!list) return <div className="text-nuit/50">Chargement…</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl">Objectifs</h1>
          <p className="text-nuit/50">Les 4 phases du séminaire — référentiel du suivi annuel.</p>
        </div>
        <button className="btn-nuit" onClick={ajouter}>+ Phase</button>
      </header>

      <div className="space-y-4">
        {list.map((o) => (
          <div key={o.id} className="carte">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg">Phase {o.phase} · cible {fmtEuro(o.ca_cible)}</h2>
              <div className="flex gap-2">
                <button className="btn-or" onClick={() => enregistrer(o)}>Enregistrer</button>
                <button className="btn-ghost text-rose-600" onClick={() => supprimer(o)}>Supprimer</button>
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              {champs.map(([k, label, type]) => (
                <div key={k} className={k === 'libelle' ? 'md:col-span-2' : ''}>
                  <label className="label-champ">{label}</label>
                  <input className="input" type={type} value={o[k] ?? ''} onChange={(e) => maj(o, k, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
