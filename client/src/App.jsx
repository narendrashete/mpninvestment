import { useEffect, useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Investments from './pages/Investments.jsx';
import InvestmentDetail from './pages/InvestmentDetail.jsx';
import Closed from './pages/Closed.jsx';
import Masters from './pages/Masters.jsx';
import LicPolicies from './pages/LicPolicies.jsx';
import LicPolicyDetail from './pages/LicPolicyDetail.jsx';
import HealthPolicies from './pages/HealthPolicies.jsx';
import HealthPolicyDetail from './pages/HealthPolicyDetail.jsx';

const NAV_ITEMS = [
  { to: '/', end: true, label: 'Dashboard', shortLabel: 'Dashboard', icon: '⌂' },
  { to: '/investments', label: 'Investments', shortLabel: 'Investments', icon: '☰' },
  { to: '/closed', label: 'Redeemed / Renewed', shortLabel: 'Redeemed', icon: '↺' },
  { to: '/lic', label: 'LIC Policies', shortLabel: 'LIC', icon: '🛡' },
  { to: '/health', label: 'Health Insurance', shortLabel: 'Health', icon: '⚕' },
  { to: '/masters', label: 'Masters', shortLabel: 'Masters', icon: '⚙' },
];

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
          {NAV_ITEMS.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}>{item.label}</NavLink>
          ))}
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
          <Route path="/lic" element={<LicPolicies />} />
          <Route path="/lic/:id" element={<LicPolicyDetail />} />
          <Route path="/health" element={<HealthPolicies />} />
          <Route path="/health/:id" element={<HealthPolicyDetail />} />
          <Route path="/masters" element={<Masters />} />
        </Routes>
      </main>
      <nav className="bottom-nav">
        {NAV_ITEMS.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            <span className="icon">{item.icon}</span>
            {item.shortLabel}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
