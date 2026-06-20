import { useEffect, useState } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api, fmtEuro, fmtPct } from '../api.js';
import { Stat } from '../components/ui.jsx';

const pctTick = (v) => `${Math.round(v * 100)}%`;

export default function Statistiques() {
  const [annee, setAnnee] = useState(String(new Date().getFullYear()));
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get(`/metrics/statistiques?annee=${annee}`).then(setData).catch(() => {});
  }, [annee]);

  if (!data) return <div className="text-nuit/50">Chargement…</div>;
  const s = data.serie;

  // Totaux de l'année
  const tot = s.reduce((a, m) => ({
    ca: a.ca + m.ca, marge: a.marge + m.marge, upsells: a.upsells + m.upsells,
    nuits: a.nuits + m.nuits_reservees, dispo: a.dispo + m.nuits_dispo, caHeb: a.caHeb + m.ca_hebergement,
  }), { ca: 0, marge: 0, upsells: 0, nuits: 0, dispo: 0, caHeb: 0 });
  const tauxMargeAn = tot.ca > 0 ? tot.marge / tot.ca : null;
  const occAn = tot.dispo > 0 ? tot.nuits / tot.dispo : null;
  const revparAn = tot.dispo > 0 ? tot.caHeb / tot.dispo : null;
  const adrAn = tot.nuits > 0 ? tot.caHeb / tot.nuits : null;

  const annees = [];
  for (let y = new Date().getFullYear() + 1; y >= 2026; y--) annees.push(String(y));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Statistiques</h1>
          <p className="text-nuit/50">Évolution mois par mois — CA, marge, occupation, RevPAR, ADR.</p>
        </div>
        <select className="input w-auto" value={annee} onChange={(e) => setAnnee(e.target.value)}>
          {annees.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </header>

      {/* Totaux année */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label={`CA ${annee}`} valeur={fmtEuro(tot.ca)} sous={`dont ${fmtEuro(tot.upsells)} d'upsells`} />
        <Stat label="Marge nette" valeur={fmtEuro(tot.marge)} accent={tot.marge >= 0} />
        <Stat label="Taux de marge" valeur={fmtPct(tauxMargeAn)} alerte={tauxMargeAn != null && tauxMargeAn < 0.35} />
        <Stat label="Occupation moy." valeur={fmtPct(occAn)} sous={`RevPAR ${fmtEuro(revparAn)} · ADR ${fmtEuro(adrAn)}`} />
      </div>

      {/* CA & marge + taux de marge */}
      <div className="carte">
        <h3 className="text-lg mb-4">CA, marge nette et taux de marge</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={s}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dceefd" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#1700ab' }} />
            <YAxis yAxisId="e" tick={{ fontSize: 12, fill: '#1700ab' }} />
            <YAxis yAxisId="p" orientation="right" tickFormatter={pctTick} domain={[0, 1]} tick={{ fontSize: 12, fill: '#1700ab' }} />
            <Tooltip formatter={(v, n) => (n === 'Taux de marge' ? pctTick(v) : fmtEuro(v))} />
            <Legend />
            <Bar yAxisId="e" dataKey="ca" name="CA" fill="#1700ab" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="e" dataKey="marge" name="Marge nette" fill="#FDC751" radius={[4, 4, 0, 0]} />
            <Line yAxisId="p" dataKey="taux_marge" name="Taux de marge" stroke="#1700ab" strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Occupation & RevPAR */}
      <div className="carte">
        <h3 className="text-lg mb-4">Occupation & RevPAR</h3>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={s}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dceefd" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#1700ab' }} />
            <YAxis yAxisId="o" tickFormatter={pctTick} domain={[0, 1]} tick={{ fontSize: 12, fill: '#1700ab' }} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 12, fill: '#1700ab' }} />
            <Tooltip formatter={(v, n) => (n === 'Occupation' ? pctTick(v) : fmtEuro(v))} />
            <Legend />
            <Bar yAxisId="o" dataKey="occupation" name="Occupation" fill="#dceefd" radius={[4, 4, 0, 0]} />
            <Line yAxisId="r" dataKey="revpar" name="RevPAR" stroke="#1700ab" strokeWidth={2} dot={{ r: 2 }} />
            <Line yAxisId="r" dataKey="adr" name="ADR" stroke="#FDC751" strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Tableau détaillé */}
      <div className="carte p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-poudre/50 text-nuit/60 text-xs uppercase">
            <tr>
              <th className="text-left p-3">Mois</th>
              <th className="text-right p-3">CA</th>
              <th className="text-right p-3">Upsells</th>
              <th className="text-right p-3">Marge</th>
              <th className="text-right p-3">Tx marge</th>
              <th className="text-right p-3">Nuits</th>
              <th className="text-right p-3">Occ.</th>
              <th className="text-right p-3">RevPAR</th>
              <th className="text-right p-3">ADR</th>
            </tr>
          </thead>
          <tbody>
            {s.map((m) => (
              <tr key={m.mois} className="border-t border-poudre/40">
                <td className="p-3 font-medium">{m.label}</td>
                <td className="p-3 text-right">{fmtEuro(m.ca)}</td>
                <td className="p-3 text-right text-nuit/50">{fmtEuro(m.upsells)}</td>
                <td className={`p-3 text-right ${m.marge < 0 ? 'text-rose-600' : ''}`}>{fmtEuro(m.marge)}</td>
                <td className="p-3 text-right">{fmtPct(m.taux_marge)}</td>
                <td className="p-3 text-right">{m.nuits_reservees}</td>
                <td className="p-3 text-right">{fmtPct(m.occupation)}</td>
                <td className="p-3 text-right">{fmtEuro(m.revpar)}</td>
                <td className="p-3 text-right">{fmtEuro(m.adr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
