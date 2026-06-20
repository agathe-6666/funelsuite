// Client API minimal vers le Worker (/api/*).
async function req(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b),
  put: (p, b) => req('PUT', p, b),
  del: (p) => req('DELETE', p),
};

// ─── Formatage FR ─────────────────────────────────────────────────────────
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

export const fmtEuro = (n, dec = false) =>
  n == null || Number.isNaN(n) ? '—' : (dec ? eur2 : eur).format(n);

export const fmtPct = (n, dec = 0) =>
  n == null || Number.isNaN(n) ? '—' : `${(n * 100).toFixed(dec)} %`;

export const fmtNum = (n, dec = 1) =>
  n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: dec });

export const moisLabel = (ym) => {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const noms = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${noms[Number(m)]} ${y}`;
};

export const moisCourant = () => new Date().toISOString().slice(0, 7);
