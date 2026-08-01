import { useEffect, useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Investments from './pages/Investments.jsx';
import InvestmentDetail from './pages/InvestmentDetail.jsx';
import Closed from './pages/Closed.jsx';
import Masters from './pages/Masters.jsx';

export default function App() {
  const [me, setMe] = useState(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setMe).catch(() => {});
  }, []);

  return (
    <>
      <header className="topbar">
        <div className="brand">₹ Invest<span>Track</span></div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/investments">Investments</NavLink>
          <NavLink to="/closed">Redeemed / Renewed</NavLink>
          <NavLink to="/masters">Masters</NavLink>
        </nav>
        {me && (
          <span className="muted" style={{ fontSize: 13, marginRight: 12 }}>
            {me.username} · {me.group}
          </span>
        )}
        <form method="POST" action="/api/auth/logout" className="logout-form">
          <button type="submit">Logout</button>
        </form>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/investments" element={<Investments />} />
          <Route path="/investments/:id" element={<InvestmentDetail />} />
          <Route path="/closed" element={<Closed />} />
          <Route path="/masters" element={<Masters />} />
        </Routes>
      </main>
    </>
  );
}
