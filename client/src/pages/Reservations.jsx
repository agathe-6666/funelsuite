import { useEffect, useState } from 'react';
import { api, fmtEuro, moisCourant, moisLabel } from '../api.js';
import { Badge } from '../components/ui.jsx';

const vide = (logId) => ({
  logement_id: logId || '', canal: 'Booking', check_in: '', check_out: '',
  nb_voyageurs: 2, prix_sejour: '', voyageur_nom: '',
});

export default function Reservations() {
  const [mois, setMois] = useState(moisCourant());
  const [logements, setLogements] = useState([]);
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);
  const [sh, setSh] = useState(null);
  const [syncMsg, setSyncMsg] = useState(null);

  const charger = () => api.get(`/reservations?mois=${mois}`).then(setList);
  useEffect(() => { api.get('/logements').then(setLogements); }, []);
  useEffect(() => { charger(); }, [mois]);
  useEffect(() => { api.get('/superhote/status').then(setSh).catch(() => {}); }, []);

  const nomBien = (id) => logements.find((l) => l.id === id)?.nom_commercial || `#${id}`;

  async function ajouter(e) {
    e.preventDefault();
    await api.post('/reservations', { ...form, logement_id: Number(form.logement_id), prix_sejour: Number(form.prix_sejour) });
    setForm(null); charger();
  }
  async function supprimer(r) {
    if (!confirm('Supprimer cette réservation ?')) return;
    await api.del(`/reservations/${r.id}`); charger();
  }
  async function ajouterUpsell(r) {
    const type = prompt('Type d\'upsell (ex. champagne, arrivée anticipée) :');
    if (!type) return;
    const montant = Number(prompt('Montant (€) :') || 0);
    await api.post(`/reservations/${r.id}/upsells`, { type, montant }); charger();
  }
  async function synchroniser() {
    setSyncMsg('Synchronisation…');
    try {
      // Calendrier d'abord : il sert à reconstituer le CA des réservations.
      let cal = null;
      try { cal = await api.post('/superhote/sync-calendar', {}); } catch { /* calendrier optionnel */ }
      const res = await api.post('/superhote/sync', {});
      setSyncMsg(
        `${res.enregistres} réservation(s) / ${res.recus} reçue(s)` +
        (res.ignores_sans_mapping ? ` · ${res.ignores_sans_mapping} ignorée(s) (mapping)` : '') +
        (cal ? ` · calendrier : ${cal.jours} jours sur ${cal.logements} bien(s)` : '')
      );
      charger();
    } catch (e) { setSyncMsg(`⚠ ${e.message}`); }
  }

  if (!list) return <div className="text-nuit/50">Chargement…</div>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Réservations</h1>
          <p className="text-nuit/50">Source du CA réel · saisie manuelle ou synchro Superhote.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={mois} onChange={(e) => setMois(e.target.value)} className="input w-auto" />
          <button className="btn-or" onClick={() => setForm(vide(logements[0]?.id))}>+ Réservation</button>
        </div>
      </header>

      {/* Bandeau Superhote */}
      <div className="carte flex items-center justify-between">
        <div className="text-sm">
          <span className="font-medium">Synchro Superhote</span>{' '}
          {sh?.configured
            ? <Badge ton="vert">connecté</Badge>
            : <Badge ton="gris">token non configuré</Badge>}
          {!sh?.configured && (
            <span className="text-nuit/40 ml-2">Ajoute SUPERHOTE_TOKEN dans .dev.vars (local) ou via wrangler secret (prod).</span>
          )}
          {syncMsg && <span className="ml-2 text-nuit/60">{syncMsg}</span>}
        </div>
        <button className="btn-nuit" onClick={synchroniser} disabled={!sh?.configured}>Synchroniser</button>
      </div>

      {form && (
        <form onSubmit={ajouter} className="carte grid md:grid-cols-3 gap-4">
          <div>
            <label className="label-champ">Logement</label>
            <select className="input" value={form.logement_id} onChange={(e) => setForm({ ...form, logement_id: e.target.value })} required>
              <option value="">— choisir —</option>
              {logements.map((l) => <option key={l.id} value={l.id}>{l.nom_commercial}</option>)}
            </select>
          </div>
          <div>
            <label className="label-champ">Canal</label>
            <select className="input" value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value })}>
              {['Booking', 'Airbnb', 'direct', 'Abritel', 'autre'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="label-champ">Voyageur</label><input className="input" value={form.voyageur_nom} onChange={(e) => setForm({ ...form, voyageur_nom: e.target.value })} /></div>
          <div><label className="label-champ">Check-in</label><input className="input" type="date" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} required /></div>
          <div><label className="label-champ">Check-out</label><input className="input" type="date" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} required /></div>
          <div><label className="label-champ">Prix séjour (€)</label><input className="input" type="number" value={form.prix_sejour} onChange={(e) => setForm({ ...form, prix_sejour: e.target.value })} required /></div>
          <div><label className="label-champ">Voyageurs</label><input className="input" type="number" value={form.nb_voyageurs} onChange={(e) => setForm({ ...form, nb_voyageurs: Number(e.target.value) })} /></div>
          <div className="md:col-span-3 flex gap-2">
            <button className="btn-nuit" type="submit">Enregistrer</button>
            <button className="btn-ghost" type="button" onClick={() => setForm(null)}>Annuler</button>
          </div>
        </form>
      )}

      <div className="carte p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-poudre/50 text-nuit/60 text-xs uppercase">
            <tr>
              <th className="text-left p-3">Bien</th>
              <th className="text-left p-3">Voyageur</th>
              <th className="text-left p-3">Séjour</th>
              <th className="text-right p-3">Nuits</th>
              <th className="text-right p-3">Prix</th>
              <th className="text-right p-3">Upsells</th>
              <th className="text-left p-3">Canal</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-poudre/50 hover:bg-creme/60">
                <td className="p-3 font-medium">{nomBien(r.logement_id)}</td>
                <td className="p-3">{r.voyageur_nom || '—'}</td>
                <td className="p-3 text-nuit/60">{r.check_in} → {r.check_out}</td>
                <td className="p-3 text-right">{r.nb_nuits}</td>
                <td className="p-3 text-right font-medium">{fmtEuro(r.prix_sejour)}</td>
                <td className="p-3 text-right">
                  <button onClick={() => ajouterUpsell(r)} className="text-nuit hover:text-or" title="Ajouter un upsell">
                    {r.upsells_total > 0 ? fmtEuro(r.upsells_total) : '+ '}
                  </button>
                </td>
                <td className="p-3"><Badge ton="poudre">{r.canal || '—'}</Badge></td>
                <td className="p-3 text-right">
                  <button onClick={() => supprimer(r)} className="text-rose-500 hover:text-rose-700">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="p-6 text-center text-nuit/40">Aucune réservation en {moisLabel(mois)}.</div>}
      </div>
    </div>
  );
}
