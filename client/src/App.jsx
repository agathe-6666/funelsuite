import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Logements from './pages/Logements.jsx';
import LogementDetail from './pages/LogementDetail.jsx';
import Objectifs from './pages/Objectifs.jsx';
import Reservations from './pages/Reservations.jsx';
import Calendrier from './pages/Calendrier.jsx';
import Simulateur from './pages/Simulateur.jsx';

const NAV = [
  { to: '/', label: 'Tableau de bord', icon: '▹', end: true },
  { to: '/logements', label: 'Logements & charges', icon: '↳' },
  { to: '/reservations', label: 'Réservations', icon: '↳' },
  { to: '/calendrier', label: 'Calendrier', icon: '↳' },
  { to: '/objectifs', label: 'Objectifs', icon: '↳' },
  { to: '/simulateur', label: 'Simulateur', icon: '▹' },
];

function Sidebar() {
  return (
    <aside className="w-64 shrink-0 bg-nuit text-white min-h-screen p-5 flex flex-col">
      <div className="mb-8">
        <div className="text-2xl font-titre tracking-wide flex items-center gap-2">
          🗝️ FUNEL <span className="text-or">suite</span>
        </div>
        <div className="text-xs text-poudre/70 mt-1">Pilotage sous-location · Sud</div>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                isActive ? 'bg-white/15 text-or font-medium' : 'text-poudre/90 hover:bg-white/10'
              }`
            }
          >
            <span className="text-or">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto pt-6 text-[11px] text-poudre/50 leading-relaxed">
        Palier 500 K€ · marge ≥ 35 %<br />35 logements · juin 2028
      </div>
    </aside>
  );
}

export default function App() {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-h-screen p-6 md:p-8 max-w-[1200px]">
        <Routes>
          <Route path="/" element={<Dashboard />} />
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
