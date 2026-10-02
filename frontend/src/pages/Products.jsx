import { useEffect, useState } from 'react';
import { api } from '../api';
import { inr } from '../ui';

const EMPTY = { code: '', name: '', category: 'sweet', variants: [{ label: '250g', price: '', sku: '' }], unavailableAt: [] };
const CAT = { sweet: 'Sweet', kaaram: 'Savory (Kaaram)', ghee: 'Ghee Mithai' };

export default function Products() {
  const [list, setList] = useState([]);
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [err, setErr] = useState('');

  const load = () => Promise.all([api('/products'), api('/branches')]).then(([p, b]) => { setList(p); setBranches(b); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  const setVar = (i, k, v) => setForm({ ...form, variants: form.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  const addVar = () => setForm({ ...form, variants: [...form.variants, { label: '', price: '', sku: '' }] });
  const delVar = (i) => setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) });
  const toggleOut = (code) => setForm({ ...form, unavailableAt: form.unavailableAt.includes(code) ? form.unavailableAt.filter(c => c !== code) : [...form.unavailableAt, code] });

  const submit = async (e) => {
    e.preventDefault(); setErr('');
    const variants = form.variants.filter(v => v.label && v.price !== '');
    if (!variants.length) return setErr('Add at least one size with a price');
    try {
      await api(editId ? `/products/${editId}` : '/products', { method: editId ? 'PUT' : 'POST', body: { ...form, variants, price: variants[0].price, unit: variants[0].label } });
      setForm(EMPTY); setEditId(null); load();
    } catch (e2) { setErr(e2.message); }
  };
  const edit = (p) => {
    setEditId(p._id);
    setForm({ code: p.code, name: p.name, category: p.category, unavailableAt: p.unavailableAt || [],
      variants: p.variants?.length ? p.variants.map(v => ({ label: v.label, price: v.price, sku: v.sku || '' })) : [{ label: p.unit, price: p.price, sku: '' }] });
    window.scrollTo(0, 0);
  };
  const toggle = async (p) => { await api(`/products/${p._id}`, { method: 'PUT', body: { available: !p.available } }); load(); };
  const del = async (p) => { if (confirm(`Delete ${p.name}?`)) { await api(`/products/${p._id}`, { method: 'DELETE' }); load(); } };

  return (
    <>
      <h1>Products</h1>
      <form className="card" onSubmit={submit}>
        <div className="filters">
          <input placeholder="Code (e.g. SW010)" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required disabled={!!editId} />
          <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <h4>Sizes &amp; prices</h4>
        {form.variants.map((v, i) => (
          <div className="filters" key={i} style={{ marginBottom: 8 }}>
            <input placeholder="Size (250g / 500g / 1kg)" value={v.label} onChange={e => setVar(i, 'label', e.target.value)} />
            <input type="number" min="0" placeholder="Price ₹" value={v.price} onChange={e => setVar(i, 'price', e.target.value)} />
            <input placeholder="Catalog Content ID (optional)" value={v.sku} onChange={e => setVar(i, 'sku', e.target.value)} />
            {form.variants.length > 1 && <button type="button" className="btn small danger" onClick={() => delVar(i)}>✕</button>}
          </div>
        ))}
        <button type="button" className="btn small secondary" onClick={addVar}>+ Add size</button>
        {branches.length > 0 && (
          <>
            <h4>Out of stock at (tick outlets where this item is NOT available)</h4>
            <div className="inline">
              {branches.map(b => (
                <label key={b.code} className="check"><input type="checkbox" checked={form.unavailableAt.includes(b.code)} onChange={() => toggleOut(b.code)} /> {b.name}</label>
              ))}
            </div>
          </>
        )}
        <div className="inline" style={{ marginTop: 12 }}>
          <button className="btn">{editId ? 'Update product' : 'Add product'}</button>
          {editId && <button type="button" className="btn secondary" onClick={() => { setEditId(null); setForm(EMPTY); }}>Cancel</button>}
        </div>
      </form>
      {err && <div className="error">{err}</div>}
      <p className="muted">The bot reads products live. The <b>Content ID</b> is only needed if you use a Meta catalog (it must match the item's Content ID there); otherwise leave it empty.</p>

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Sizes</th><th>Out of stock at</th><th>Available</th><th /></tr></thead>
          <tbody>
            {list.map(p => (
              <tr key={p._id} className={p.available ? '' : 'dim'}>
                <td>{p.code}</td><td>{p.name}</td><td>{CAT[p.category] || p.category}</td>
                <td>{(p.variants?.length ? p.variants : [{ label: p.unit, price: p.price }]).map(v => `${v.label} ${inr(v.price)}`).join(' · ')}</td>
                <td>{(p.unavailableAt || []).join(', ') || '—'}</td>
                <td><input type="checkbox" checked={p.available} onChange={() => toggle(p)} /></td>
                <td>
                  <button className="btn small secondary" onClick={() => edit(p)}>Edit</button>{' '}
                  <button className="btn small danger" onClick={() => del(p)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
