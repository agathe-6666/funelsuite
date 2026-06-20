import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Logements from './pages/Logements.jsx';
import LogementDetail from './pages/LogementDetail.jsx';
import Objectifs from './pages/Objectifs.jsx';
import Reservations from './pages/Reservations.jsx';
import Calendrier from './pages/Calendrier.jsx';
import Statistiques from './pages/Statistiques.jsx';
import Simulateur from './pages/Simulateur.jsx';

const NAV = [
  { to: '/', label: 'Tableau de bord', icon: '▹', end: true },
  { to: '/statistiques', label: 'Statistiques', icon: '▹' },
  { to: '/logements', label: 'Logements & charges', icon: '↳' },
  { to: '/reservations', label: 'Réservations', icon: '↳' },
  { to: '/calendrier', label: 'Calendrier', icon: '↳' },
  { to: '/objectifs', label: 'Objectifs', icon: '↳' },
  { to: '/simulateur', label: 'Simulateur', icon: '▹' },
];

function NavLinks({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
              isActive ? 'bg-white/15 text-or font-medium' : 'text-poudre/90 hover:bg-white/10'
            }`
          }
        >
          <span className="text-or">{n.icon}</span>
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Marque() {
  return (
    <div className="text-2xl font-titre tracking-wide flex items-center gap-2">
      🗝️ FUNEL <span className="text-or">suite</span>
    </div>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="md:flex min-h-screen">
      {/* Sidebar — bureau */}
      <aside className="hidden md:flex w-64 shrink-0 bg-nuit text-white min-h-screen p-5 flex-col">
        <div className="mb-8">
          <Marque />
          <div className="text-xs text-poudre/70 mt-1">Pilotage sous-location · Sud</div>
        </div>
        <NavLinks />
        <div className="mt-auto pt-6 text-[11px] text-poudre/50 leading-relaxed">
          Palier 500 K€ · marge ≥ 35 %<br />35 logements · juin 2028
        </div>
      </aside>

      {/* Barre du haut — mobile */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-nuit text-white px-4 py-3 shadow">
        <Marque />
        <button onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu" className="text-2xl leading-none px-2">☰</button>
      </header>

      {/* Tiroir — mobile */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 max-w-[80%] bg-nuit text-white p-5 flex flex-col shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <Marque />
              <button onClick={() => setMenuOpen(false)} aria-label="Fermer" className="text-2xl leading-none px-2">✕</button>
            </div>
            <NavLinks onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <main className="flex-1 min-h-screen p-4 md:p-8 w-full max-w-[1200px]">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/statistiques" element={<Statistiques />} />
          <Route path="/logements" element={<Logements />} />
          <Route path="/logements/:id" element={<LogementDetail />} />
          <Route path="/reservations" element={<Reservations />} />
          <Route path="/calendrier" element={<Calendrier />} />
          <Route path="/objectifs" element={<Objectifs />} />
          <Route path="/simulateur" element={<Simulateur />} />
        </Routes>
      </main>
    </div>
  );
}
