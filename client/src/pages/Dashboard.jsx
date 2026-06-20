import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar, CartesianGrid, Legend, Line, ComposedChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api, fmtEuro, fmtNum, fmtPct, moisCourant, moisLabel } from '../api.js';
import { Stat, Jauge, Badge, Conseil, CouvertureLoyer } from '../components/ui.jsx';

export default function Dashboard() {
  const [vue, setVue] = useState('mois');
  const [mois, setMois] = useState(moisCourant());
  const [data, setData] = useState(null);
  const [annee, setAnnee] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/metrics/mois?mois=${mois}`).then(setData).catch((e) => setErr(e.message));
  }, [mois]);
  useEffect(() => {
    api.get(`/metrics/annee?annee=${mois.slice(0, 4)}`).then(setAnnee).catch(() => {});
  }, [mois]);

  if (err) return <div className="carte text-rose-600">Erreur : {err}. Le serveur est-il démarré ?</div>;
  if (!data) return <div className="text-nuit/50">Chargement…</div>;

  const g = data.global;
  const margeFaible = g.taux_marge_nette != null && g.taux_marge_nette < 0.35;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Tableau de bord</h1>
          <p className="text-nuit/50">Où j'en suis ce mois, sur l'année, vs mon objectif de phase.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={mois} onChange={(e) => setMois(e.target.value)} className="input w-auto" />
          <div className="flex rounded-lg bg-poudre/60 p-1">
            {['mois', 'annee'].map((v) => (
              <button key={v} onClick={() => setVue(v)}
                className={`px-3 py-1 rounded-md text-sm ${vue === v ? 'bg-nuit text-white' : 'text-nuit/70'}`}>
                {v === 'mois' ? 'Mois' : 'Année'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {vue === 'mois' ? (
        <>
          <CouvertureLoyer j15={g.j15} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label={`CA · ${moisLabel(mois)}`} valeur={fmtEuro(g.ca_total)}
              sous={`${fmtNum(g.nuits_reservees, 0)} nuits réservées`} />
            <Stat label="Marge nette" valeur={fmtEuro(g.marge_nette)} accent={g.marge_nette >= 0} />
            <Stat label="Taux de marge" valeur={fmtPct(g.taux_marge_nette)}
              alerte={margeFaible} sous={margeFaible ? '⚠ sous l\'objectif 35 %' : 'objectif ≥ 35 %'} />
            <Stat label="Charges fixes du mois" valeur={fmtEuro(g.charges_fixes)} sous="à couvrir" />
          </div>

          <Conseil>
            Réflexe séminaire : ne jamais lire le taux d'occupation seul — toujours le coupler au <strong>RevPAR</strong>.
            Un RevPAR élevé à taux moyen vaut mieux qu'un taux plein à prix cassés.
          </Conseil>

          <section>
            <h2 className="text-xl mb-3">Par bien · {moisLabel(mois)}</h2>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.par_bien.map((b) => <FicheBien key={b.logement.id} b={b} />)}
            </div>
            {data.par_bien.length === 0 && (
              <div className="carte text-nuit/50">Aucun logement actif. Ajoute tes biens dans « Logements ».</div>
            )}
          </section>
        </>
      ) : (
        <VueAnnee annee={annee} />
      )}
    </div>
  );
}

function FicheBien({ b }) {
  const i = b.indicateurs;
  const rentable = i.point_mort_jour != null && i.point_mort_jour <= i.nb_jours_mois;
  const margeFaible = i.taux_marge_nette != null && i.taux_marge_nette < 0.35;
  return (
    <Link to={`/logements/${b.logement.id}`} className="carte block hover:shadow-md transition">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-titre text-lg">{b.logement.nom_commercial}</div>
          <div className="text-xs text-nuit/40">{b.logement.ville} · zone {b.logement.zone}</div>
        </div>
        {rentable
          ? <Badge ton="or">🗝️ rentable</Badge>
          : <Badge ton="gris">sous le seuil</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-sm">
        <Mini label="CA mois" v={fmtEuro(i.ca_total)} />
        <Mini label="Marge nette" v={fmtEuro(i.marge_nette)} alerte={margeFaible} />
        <Mini label="Occupation" v={fmtPct(i.taux_occupation)} />
        <Mini label="RevPAR" v={fmtEuro(i.revpar)} fort />
        <Mini label="ADR" v={fmtEuro(i.adr_net)} />
        <Mini label="Panier moyen" v={fmtEuro(i.panier_moyen)} />
        <Mini label="Seuil de rentabilité" v={i.seuil_ca ? fmtEuro(i.seuil_ca) : '—'} />
        <Mini label="Seuil en nuits" v={i.seuil_nuits ? `${fmtNum(i.seuil_nuits, 0)} nuits` : '—'} />
      </div>

      <div className="mt-3 pt-3 border-t border-poudre/60 text-sm">
        {i.point_mort_jour != null ? (
          <span className={rentable ? 'text-nuit' : 'text-nuit/60'}>
            Point mort : <strong>rentable à partir du {Math.ceil(i.point_mort_jour)} du mois</strong>
          </span>
        ) : <span className="text-nuit/40">Point mort : données insuffisantes ce mois</span>}
      </div>
    </Link>
  );
}

function Mini({ label, v, fort, alerte }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-nuit/40">{label}</div>
      <div className={`font-medium ${fort ? 'text-nuit' : ''} ${alerte ? 'text-rose-600' : ''}`}>{v}</div>
    </div>
  );
}

function VueAnnee({ annee }) {
  if (!annee) return <div className="text-nuit/50">Chargement…</div>;
  const p = annee.phase_courante;
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <Stat label={`CA cumulé ${annee.annee}`} valeur={fmtEuro(annee.ca_cumule_annee)} />
        <Stat label="Biens actifs" valeur={`${annee.nb_biens_actifs} / 15`} sous="jalon mars 2027" />
        <Stat label="Avancement objectif" valeur={fmtPct(annee.avancement_objectif)}
          accent={(annee.avancement_objectif ?? 0) >= 1} />
      </div>

      {p && (
        <div className="carte">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg">Phase {p.phase} · {p.libelle}</h3>
            <span className="text-sm text-nuit/50">cible {fmtEuro(p.ca_cible)} · marge ≥ {p.marge_cible_pct} %</span>
          </div>
          <Jauge valeur={annee.ca_cumule_annee} max={p.ca_cible} className="mt-3" />
          <div className="text-xs text-nuit/50 mt-1">
            {fmtEuro(annee.ca_cumule_annee)} / {fmtEuro(p.ca_cible)} · {fmtPct(annee.avancement_objectif)}
          </div>
        </div>
      )}

      <div className="carte">
        <h3 className="text-lg mb-4">CA & marge mois par mois · {annee.annee}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={annee.serie}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dceefd" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#1700ab' }} />
            <YAxis tick={{ fontSize: 12, fill: '#1700ab' }} />
            <Tooltip formatter={(v) => fmtEuro(v)} />
            <Legend />
            <Bar dataKey="ca" name="CA" fill="#1700ab" radius={[4, 4, 0, 0]} />
            <Bar dataKey="marge" name="Marge nette" fill="#FDC751" radius={[4, 4, 0, 0]} />
            <Line dataKey="ca_cumule" name="CA cumulé" stroke="#1700ab" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
