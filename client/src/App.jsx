import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Investments from './pages/Investments.jsx';
import InvestmentDetail from './pages/InvestmentDetail.jsx';

export default function App() {
  return (
    <>
      <header className="topbar">
        <div className="brand">₹ Invest<span>Track</span></div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/investments">Investments</NavLink>
        </nav>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/investments" element={<Investments />} />
          <Route path="/investments/:id" element={<InvestmentDetail />} />
        </Routes>
      </main>
    </>
  );
}
