import { Routes, Route, Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Orders from './pages/Orders.jsx';
import Products from './pages/Products.jsx';
import Branches from './pages/Branches.jsx';
import Bulk from './pages/Bulk.jsx';
import Setup from './pages/Setup.jsx';
import Guide from './pages/Guide.jsx';

function Layout() {
  const nav = useNavigate();
  const logout = () => { localStorage.removeItem('token'); nav('/login'); };
  return (
    <div className="app">
      <aside className="sidebar">
        <h2>🍬 Krishna Jelabi</h2>
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/orders">Orders</NavLink>
        <NavLink to="/products">Products</NavLink>
        <NavLink to="/branches">Outlets</NavLink>
        <NavLink to="/bulk">Bulk enquiries</NavLink>
        <NavLink to="/setup">Setup</NavLink>
        <NavLink to="/guide">Guide</NavLink>
        <button className="link logout" onClick={logout}>Logout</button>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}

const Protected = () => (localStorage.getItem('token') ? <Layout /> : <Navigate to="/login" replace />);

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/products" element={<Products />} />
        <Route path="/branches" element={<Branches />} />
        <Route path="/bulk" element={<Bulk />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/guide" element={<Guide />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
