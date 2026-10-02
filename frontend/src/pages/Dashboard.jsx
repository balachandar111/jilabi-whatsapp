import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Badge, inr, fmtDate } from '../ui';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [toPack, setToPack] = useState([]);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [s, o] = await Promise.all([
        api('/orders/stats'),
        api('/orders?paymentStatus=paid&status=new&limit=8'),
      ]);
      setStats(s); setToPack(o.orders); setErr('');
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);

  const cards = stats && [
    ['Orders today', stats.todayOrders],
    ['Revenue today', inr(stats.todayRevenue)],
    ['To pack (paid)', stats.toPack],
    ['Awaiting payment', stats.pendingPayments],
    ['New bulk enquiries', stats.newBulk],
    ['Total orders', stats.totalOrders],
    ['Total revenue', inr(stats.totalRevenue)],
  ];

  return (
    <>
      <h1>Dashboard</h1>
      {err && <div className="error">{err}</div>}
      <div className="stats">
        {cards?.map(([k, v]) => <div className="card stat" key={k}><span>{k}</span><b>{v}</b></div>)}
      </div>

      {stats?.byBranch?.length > 0 && (
        <div className="card">
          <h3>Today by outlet (paid)</h3>
          <table><thead><tr><th>Outlet</th><th>Orders</th><th>Revenue</th></tr></thead>
            <tbody>{stats.byBranch.map(b => <tr key={b.branch}><td>{b.branch}</td><td>{b.orders}</td><td>{inr(b.revenue)}</td></tr>)}</tbody></table>
        </div>
      )}

      <div className="card">
        <div className="row-between">
          <h3>Paid orders waiting to be packed</h3>
          <Link to="/orders?status=new&paymentStatus=paid">View all →</Link>
        </div>
        {toPack.length === 0 ? <p className="muted">Nothing to pack 🎉</p> : (
          <table>
            <thead><tr><th>Order</th><th>Time</th><th>Customer</th><th>Outlet</th><th>Items</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {toPack.map(o => (
                <tr key={o._id}>
                  <td><b>{o.orderId}</b></td><td>{fmtDate(o.createdAt)}</td>
                  <td>{o.name}<div className="muted">+{o.phone}</div></td>
                  <td>{o.branchName || '—'} <Badge value={o.fulfilment} /></td>
                  <td>{o.items.map(i => `${i.name}${i.variant ? ' ' + i.variant : ''}×${i.qty}`).join(', ')}</td>
                  <td>{inr(o.amount)}</td><td><Badge value={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
