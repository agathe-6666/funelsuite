import { useEffect, useState } from 'react';
import { api, fmtEuro, fmtNum, fmtPct } from '../api.js';
import { Stat, Conseil } from '../components/ui.jsx';

export default function Simulateur() {
  const [logements, setLogements] = useState([]);
  const [logementId, setLogementId] = useState('');
  const [adr, setAdr] = useState(90);
  const [occ, setOcc] = useState(60);
  const [upsells, setUpsells] = useState(0);
  const [res, setRes] = useState(null);

  useEffect(() => {
    api.get('/logements').then((ls) => {
      setLogements(ls);
      if (ls.length) setLogementId(String(ls[0].id)); // par défaut : 1er bien (plus parlant que le global)
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      api.post('/metrics/simulation', {
        logement_id: logementId ? Number(logementId) : null,
        adr: Number(adr), taux_occupation_pct: Number(occ), upsells: Number(upsells),
      }).then(setRes).catch(() => {});
    }, 120);
    return () => clearTimeout(t);
  }, [logementId, adr, occ, upsells]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl">Simulateur</h1>
        <p className="text-nuit/50">Prix × taux d'occupation → CA, marge, seuil et point mort recalculés en direct.</p>
      </header>

      <div className="carte space-y-6">
        <div>
          <label className="label-champ">Périmètre</label>
          <select className="input md:w-1/2" value={logementId} onChange={(e) => setLogementId(e.target.value)}>
            <option value="">Global (tous les biens)</option>
            {logements.map((l) => <option key={l.id} value={l.id}>{l.nom_commercial}</option>)}
          </select>
        </div>

        <Curseur label="Prix moyen / nuit (ADR)" min={30} max={400} step={5} value={adr} setValue={setAdr} suffix="€" />
        <Curseur label="Taux d'occupation" min={0} max={100} step={1} value={occ} setValue={setOcc} suffix="%" />
        <Curseur label="Upsells estimés / mois" min={0} max={1000} step={10} value={upsells} setValue={setUpsells} suffix="€" />
      </div>

      {res && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="CA simulé" valeur={fmtEuro(res.ca_total)} sous={`${res.nuits} nuits`} />
            <Stat label="Marge nette" valeur={fmtEuro(res.marge_nette)} accent={res.marge_nette >= 0} />
            <Stat label="Taux de marge" valeur={fmtPct(res.taux_marge_nette)}
              alerte={res.taux_marge_nette != null && res.taux_marge_nette < 0.35} />
            <Stat label="Seuil de rentabilité" valeur={res.seuil_ca ? fmtEuro(res.seuil_ca) : '—'} />
            <Stat label="Seuil en nuits" valeur={res.seuil_nuits ? `${fmtNum(res.seuil_nuits, 0)} nuits` : '—'} />
            <Stat label="Point mort" valeur={res.point_mort_jour ? `J${Math.ceil(res.point_mort_jour)}` : '—'}
              sous="rentable à partir du… du mois" accent />
            <Stat label="Charges fixes" valeur={fmtEuro(res.charges_fixes)} />
            <Stat label="Charges variables" valeur={fmtEuro(res.charges_variables)} />
          </div>

          <Conseil>
            {res.point_mort_jour
              ? `À ${fmtEuro(adr)}/nuit et ${occ}% d'occupation, tu couvres tes charges fixes vers le J${Math.ceil(res.point_mort_jour)} du mois.`
              : 'Augmente l\'ADR ou l\'occupation pour atteindre le seuil de rentabilité.'}
            {' '}Vise une marge ≥ 35 % : monte plutôt l'ADR (RevPAR) que l'occupation à prix cassés.
          </Conseil>
        </>
      )}
    </div>
  );
}

function Curseur({ label, min, max, step, value, setValue, suffix }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="label-champ mb-0">{label}</label>
        <span className="text-lg font-titre text-nuit">{fmtNum(value, 0)} {suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full accent-nuit" />
    </div>
  );
}
