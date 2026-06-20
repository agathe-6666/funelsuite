import { useEffect, useState } from 'react';
import {
  Bar, CartesianGrid, Legend, Line, ComposedChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api, fmtEuro, fmtNum, fmtPct, moisCourant, moisLabel } from '../api.js';
import { Stat, Jauge, Badge, Conseil, CouvertureLoyer } from '../components/ui.jsx';

export default function Dashboard() {
  const [vue, setVue] = useState('mois');
  const [mois, setMois] = useState(moisCourant());
  const [selBien, setSelBien] = useState(''); // '' = tous
  const [data, setData] = useState(null);
  const [annee, setAnnee] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/metrics/mois?mois=${mois}`).then(setData).catch((e) => setErr(e.message));
  }, [mois]);
  useEffect(() => {
    api.get(`/metrics/annee?annee=${mois.slice(0, 4)}`).then(setAnnee).catch(() => {});
  }, [mois]);

  if (err) return <div className="carte text-rose-600">Erreur : {err}</div>;
  if (!data) return <div className="text-nuit/50">Chargement…</div>;

  const g = data.global;
  const bienSel = selBien ? data.par_bien.find((b) => String(b.logement.id) === selBien) : null;

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl md:text-3xl">Tableau de bord</h1>
          <p className="text-sm text-nuit/50">Où j'en suis ce mois, vs mon objectif.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto flex-1 min-w-[160px]" value={selBien} onChange={(e) => setSelBien(e.target.value)}>
            <option value="">🏠 Tous les biens</option>
            {data.par_bien.map((b) => (
              <option key={b.logement.id} value={b.logement.id}>{b.logement.nom_commercial}</option>
            ))}
          </select>
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

      {vue === 'annee' ? (
        <VueAnnee annee={annee} />
      ) : bienSel ? (
        <DetailBien b={bienSel} mois={mois} />
      ) : (
        <VueTous data={data} g={g} mois={mois} onSelect={setSelBien} />
      )}
    </div>
  );
}

// ─── Vue agrégée (tous les biens) ─────────────────────────────────────────
function VueTous({ data, g, mois, onSelect }) {
  const margeFaible = g.taux_marge_nette != null && g.taux_marge_nette < 0.35;
  return (
    <>
      <CouvertureLoyer j15={g.j15} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Stat label={`CA · ${moisLabel(mois)}`} valeur={fmtEuro(g.ca_total)} sous={`${fmtNum(g.nuits_reservees, 0)} nuits`} />
        <Stat label="Marge nette" valeur={fmtEuro(g.marge_nette)} accent={g.marge_nette >= 0} />
        <Stat label="Taux de marge" valeur={fmtPct(g.taux_marge_nette)} alerte={margeFaible} sous={margeFaible ? '⚠ sous 35 %' : 'objectif ≥ 35 %'} />
        <Stat label="Charges fixes" valeur={fmtEuro(g.charges_fixes)} sous="à couvrir" />
      </div>

      <Conseil>
        Astuce : choisis un bien dans le menu déroulant ci-dessus pour voir ses <strong>statistiques détaillées</strong> et ses <strong>recommandations</strong>.
      </Conseil>

      <section>
        <h2 className="text-lg md:text-xl mb-3">Par bien · {moisLabel(mois)}</h2>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
          {data.par_bien.map((b) => <CarteBien key={b.logement.id} b={b} onSelect={onSelect} />)}
        </div>
        {data.par_bien.length === 0 && (
          <div className="carte text-nuit/50">Aucun logement actif.</div>
        )}
      </section>
    </>
  );
}

function CarteBien({ b, onSelect }) {
  const i = b.indicateurs;
  const rentable = i.point_mort_jour != null && i.point_mort_jour <= i.nb_jours_mois;
  const reco = b.recommandations?.[0];
  return (
    <button onClick={() => onSelect(String(b.logement.id))} className="carte block text-left hover:shadow-md transition">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-titre text-lg">{b.logement.nom_commercial}</div>
          <div className="text-xs text-nuit/40">{b.logement.ville} · zone {b.logement.zone}</div>
        </div>
        {rentable ? <Badge ton="or">🗝️ rentable</Badge> : <Badge ton="gris">sous le seuil</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-sm">
        <Mini label="CA mois" v={fmtEuro(i.ca_total)} />
        <Mini label="Marge" v={fmtEuro(i.marge_nette)} />
        <Mini label="Occupation" v={fmtPct(i.taux_occupation)} />
        <Mini label="RevPAR" v={fmtEuro(i.revpar)} />
      </div>
      {reco && (
        <div className="mt-3 pt-3 border-t border-poudre/60 text-xs text-nuit/70 flex gap-1.5">
          <span>{reco.icone}</span><span className="line-clamp-2">{reco.titre}</span>
        </div>
      )}
    </button>
  );
}

// ─── Détail d'un bien (stats + recommandations) ───────────────────────────
function DetailBien({ b, mois }) {
  const i = b.indicateurs;
  const cd = i.charges_detail || {};
  const margeFaible = i.taux_marge_nette != null && i.taux_marge_nette < 0.35;
  return (
    <div className="space-y-5">
      <CouvertureLoyer j15={b.j15} />

      <Recommandations recos={b.recommandations} />

      <section>
        <h2 className="text-lg md:text-xl mb-3">Indicateurs · {moisLabel(mois)}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <Stat label="CA du mois" valeur={fmtEuro(i.ca_total)} sous={`dont ${fmtEuro(i.upsells)} upsells`} />
          <Stat label="Marge nette" valeur={fmtEuro(i.marge_nette)} accent={i.marge_nette >= 0} />
          <Stat label="Taux de marge" valeur={fmtPct(i.taux_marge_nette)} alerte={margeFaible} />
          <Stat label="Seuil de rentabilité" valeur={i.seuil_ca ? fmtEuro(i.seuil_ca) : '—'} sous="CA à atteindre" />
          <Stat label="Point mort" valeur={i.point_mort_jour ? `J${Math.ceil(i.point_mort_jour)}` : '—'} sous="rentable dès le… du mois" />
          <Stat label="Occupation" valeur={fmtPct(i.taux_occupation)} />
          <Stat label="RevPAR" valeur={fmtEuro(i.revpar)} />
          <Stat label="ADR" valeur={fmtEuro(i.adr_net)} />
        </div>
      </section>

      {/* Détail des charges variables (ménage / linge comptés par séjour) */}
      <section className="carte">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-lg">Charges variables du mois</h3>
          <span className="text-sm text-nuit/50">{cd.nb_sejours || 0} séjour(s)</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <Mini label="Commission + frais" v={fmtEuro(cd.commission_et_frais)} />
          <Mini label={`Ménage (×${cd.nb_sejours || 0})`} v={fmtEuro(cd.menage)} />
          <Mini label={`Linge (×${cd.nb_sejours || 0})`} v={fmtEuro(cd.linge)} />
          <Mini label="Consommables" v={fmtEuro(cd.consommables)} />
          <Mini label="Total variable" v={fmtEuro(i.charges_variables_reelles)} fort />
        </div>
        <p className="text-xs text-nuit/40 mt-2">Le ménage et le linge sont comptés une fois par réservation (1 par séjour).</p>
      </section>
    </div>
  );
}

function Recommandations({ recos }) {
  if (!recos || recos.length === 0) return null;
  const tons = {
    or: 'bg-or/20 border-or/50',
    nuit: 'bg-poudre/60 border-poudre',
    vert: 'bg-emerald-50 border-emerald-200',
    rouge: 'bg-rose-50 border-rose-200',
  };
  return (
    <section>
      <h2 className="text-lg md:text-xl mb-3">Recommandations 🗝️</h2>
      <div className="space-y-2.5">
        {recos.map((r) => (
          <div key={r.id} className={`rounded-xl border px-4 py-3 ${tons[r.ton] || tons.nuit}`}>
            <div className="flex gap-2 items-start">
              <span className="text-lg leading-none mt-0.5">{r.icone}</span>
              <div>
                <div className="font-medium text-nuit text-sm">{r.titre}</div>
                <div className="text-xs text-nuit/60 mt-0.5">{r.detail}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Mini({ label, v, fort }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-nuit/40">{label}</div>
      <div className={`font-medium ${fort ? 'text-nuit' : ''}`}>{v}</div>
    </div>
  );
}

function VueAnnee({ annee }) {
  if (!annee) return <div className="text-nuit/50">Chargement…</div>;
  const p = annee.phase_courante;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        <Stat label={`CA cumulé ${annee.annee}`} valeur={fmtEuro(annee.ca_cumule_annee)} />
        <Stat label="Biens actifs" valeur={`${annee.nb_biens_actifs} / 15`} sous="jalon mars 2027" />
        <Stat label="Avancement" valeur={fmtPct(annee.avancement_objectif)} accent={(annee.avancement_objectif ?? 0) >= 1} />
      </div>
      {p && (
        <div className="carte">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg">Phase {p.phase} · {p.libelle}</h3>
            <span className="text-sm text-nuit/50">cible {fmtEuro(p.ca_cible)} · marge ≥ {p.marge_cible_pct} %</span>
          </div>
          <Jauge valeur={annee.ca_cumule_annee} max={p.ca_cible} className="mt-3" />
          <div className="text-xs text-nuit/50 mt-1">{fmtEuro(annee.ca_cumule_annee)} / {fmtEuro(p.ca_cible)} · {fmtPct(annee.avancement_objectif)}</div>
        </div>
      )}
      <div className="carte">
        <h3 className="text-lg mb-4">CA & marge mois par mois</h3>
        <ResponsiveContainer width="100%" height={280}>
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
