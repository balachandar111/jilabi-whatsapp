import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { token } = await api('/auth/login', { method: 'POST', body: { username, password } });
      localStorage.setItem('token', token);
      nav('/', { replace: true });
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h2>🍬 Krishna Jelabi Kadai</h2>
        <p className="muted">Admin login</p>
        <label>Username<input value={username} onChange={e => setUsername(e.target.value)} autoFocus required /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        {err && <div className="error">{err}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Login'}</button>
      </form>
    </div>
  );
}
