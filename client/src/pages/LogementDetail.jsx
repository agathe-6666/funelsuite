import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, fmtEuro, fmtNum, fmtPct, moisCourant } from '../api.js';
import { Stat } from '../components/ui.jsx';

// Champ générique
function Champ({ label, value, onChange, type = 'text', suffix, ...rest }) {
  return (
    <div>
      <label className="label-champ">{label}{suffix ? ` (${suffix})` : ''}</label>
      <input className="input" type={type} value={value ?? ''} {...rest}
        onChange={(e) => onChange(type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} />
    </div>
  );
}

export default function LogementDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [l, setL] = useState(null);
  const [metr, setMetr] = useState(null);
  const [saved, setSaved] = useState(false);

  const charger = () => api.get(`/logements/${id}`).then(setL);
  useEffect(() => { charger(); }, [id]);
  useEffect(() => {
    api.get(`/metrics/logement/${id}?mois=${moisCourant()}`).then(setMetr).catch(() => {});
  }, [id, saved]);

  if (!l) return <div className="text-nuit/50">Chargement…</div>;

  const set = (k, v) => setL({ ...l, [k]: v });
  const setCF = (k, v) => setL({ ...l, charges_fixes: { ...l.charges_fixes, [k]: v } });
  const setPCV = (k, v) => setL({ ...l, params_charges_variables: { ...l.params_charges_variables, [k]: v } });

  async function enregistrer() {
    await api.put(`/logements/${id}`, {
      ...l,
      charges_fixes: l.charges_fixes,
      params_charges_variables: l.params_charges_variables,
    });
    setSaved((s) => !s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function supprimer() {
    if (!confirm(`Supprimer « ${l.nom_commercial} » et ses données ?`)) return;
    await api.del(`/logements/${id}`);
    nav('/logements');
  }

  const i = metr?.indicateurs;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <button onClick={() => nav('/logements')} className="text-sm text-nuit/50 hover:text-nuit">↳ retour</button>
          <h1 className="text-3xl">{l.nom_commercial}</h1>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost text-rose-600" onClick={supprimer}>Supprimer</button>
          <button className="btn-nuit" onClick={enregistrer}>Enregistrer</button>
        </div>
      </header>

      {/* Indicateurs de rentabilité (live, mois en cours) */}
      {i && (
        <section>
          <h2 className="text-xl mb-3">Rentabilité · mois en cours</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Seuil de rentabilité" valeur={i.seuil_ca ? fmtEuro(i.seuil_ca) : '—'} sous="CA à atteindre" />
            <Stat label="Seuil en nuits" valeur={i.seuil_nuits ? `${fmtNum(i.seuil_nuits, 0)} nuits` : '—'} />
            <Stat label="Point mort" valeur={i.point_mort_jour ? `J${Math.ceil(i.point_mort_jour)}` : '—'} sous="rentable à partir du… du mois" />
            <Stat label="Taux marge / coûts var." valeur={fmtPct(i.taux_marge_var)} />
            <Stat label="CA mois" valeur={fmtEuro(i.ca_total)} />
            <Stat label="Marge nette" valeur={fmtEuro(i.marge_nette)} accent={i.marge_nette >= 0} />
            <Stat label="Occupation" valeur={fmtPct(i.taux_occupation)} />
            <Stat label="RevPAR" valeur={fmtEuro(i.revpar)} />
          </div>
        </section>
      )}

      {/* Fiche bien */}
      <section className="carte space-y-4">
        <h2 className="text-xl">Fiche du bien</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <Champ label="Nom commercial" value={l.nom_commercial} onChange={(v) => set('nom_commercial', v)} />
          <Champ label="Ville" value={l.ville} onChange={(v) => set('ville', v)} />
          <Champ label="Adresse" value={l.adresse} onChange={(v) => set('adresse', v)} />
          <Champ label="Type" value={l.type} onChange={(v) => set('type', v)} />
          <Champ label="Zone" type="number" value={l.zone} onChange={(v) => set('zone', v)} />
          <Champ label="Surface" suffix="m²" type="number" value={l.surface_m2} onChange={(v) => set('surface_m2', v)} />
          <Champ label="DPE" value={l.dpe} onChange={(v) => set('dpe', v)} />
          <div>
            <label className="label-champ">Statut</label>
            <select className="input" value={l.statut || 'actif'} onChange={(e) => set('statut', e.target.value)}>
              <option value="actif">actif</option>
              <option value="prospect">prospect</option>
              <option value="archivé">archivé</option>
            </select>
          </div>
          <div>
            <label className="label-champ">Gestionnaire</label>
            <select className="input" value={l.gestionnaire || 'interne'} onChange={(e) => set('gestionnaire', e.target.value)}>
              <option value="interne">interne</option>
              <option value="Noé">Noé</option>
            </select>
          </div>
          <Champ label="Plateformes" value={l.plateformes} onChange={(v) => set('plateformes', v)} />
          <Champ label="Début du bail" type="date" value={l.date_debut_bail} onChange={(v) => set('date_debut_bail', v)} />
          <Champ label="Fin du bail" type="date" value={l.date_fin_bail} onChange={(v) => set('date_fin_bail', v)} />
          <Champ label="Rental ID Superhote" value={l.rental_id_superhote} onChange={(v) => set('rental_id_superhote', v)} />
        </div>
      </section>

      {/* Charges fixes */}
      <section className="carte space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl">Charges fixes mensuelles</h2>
          <span className="text-sm text-nuit/50">indépendantes du nombre de nuits</span>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <Champ label="Loyer propriétaire" suffix="€" type="number" value={l.charges_fixes?.loyer_proprio} onChange={(v) => setCF('loyer_proprio', v)} />
          <Champ label="Charges locatives" suffix="€" type="number" value={l.charges_fixes?.charges_locatives} onChange={(v) => setCF('charges_locatives', v)} />
          <Champ label="Assurance" suffix="€" type="number" value={l.charges_fixes?.assurance} onChange={(v) => setCF('assurance', v)} />
          <Champ label="Abonnements" suffix="€" type="number" value={l.charges_fixes?.abonnements} onChange={(v) => setCF('abonnements', v)} />
          <Champ label="Internet" suffix="€" type="number" value={l.charges_fixes?.internet} onChange={(v) => setCF('internet', v)} />
          <Champ label="Autres" suffix="€" type="number" value={l.charges_fixes?.autres} onChange={(v) => setCF('autres', v)} />
        </div>
      </section>

      {/* Paramètres charges variables */}
      <section className="carte space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl">Paramètres des charges variables</h2>
          <span className="text-sm text-nuit/50">dépendent de chaque séjour</span>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <Champ label="Commission plateforme" suffix="%" type="number" value={l.params_charges_variables?.taux_commission_plateforme} onChange={(v) => setPCV('taux_commission_plateforme', v)} />
          <Champ label="Frais de paiement" suffix="%" type="number" value={l.params_charges_variables?.taux_frais_paiement} onChange={(v) => setPCV('taux_frais_paiement', v)} />
          <Champ label="Ménage / séjour" suffix="€" type="number" value={l.params_charges_variables?.cout_menage_sejour} onChange={(v) => setPCV('cout_menage_sejour', v)} />
          <Champ label="Linge / séjour" suffix="€" type="number" value={l.params_charges_variables?.cout_linge_sejour} onChange={(v) => setPCV('cout_linge_sejour', v)} />
          <Champ label="Consommables / séjour" suffix="€" type="number" value={l.params_charges_variables?.cout_consommables_sejour} onChange={(v) => setPCV('cout_consommables_sejour', v)} />
          <Champ label="Taxe de séjour / nuit" suffix="€" type="number" value={l.params_charges_variables?.taxe_sejour_par_nuit} onChange={(v) => setPCV('taxe_sejour_par_nuit', v)} />
        </div>
        <p className="text-xs text-nuit/40">La taxe de séjour est collectée puis reversée → neutre dans la marge, suivie à part.</p>
      </section>
    </div>
  );
}
