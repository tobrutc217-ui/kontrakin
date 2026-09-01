import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import { supabase } from '../supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
    }
  };

  return (
    <div className="login-shell" id="login-screen">
      <div className="login-card" id="login-card">
        <div className="brand login-brand" id="login-brand">
          <div className="brand-mark">
            <Building2 size={20} />
          </div>
          <span>Kontrakin</span>
        </div>
        <h1>Masuk ke dashboard</h1>
        <p>Gunakan akun admin untuk mengelola properti kos Anda.</p>
        <form onSubmit={submit} className="login-form" id="login-form">
          <label htmlFor="email">
            Email
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@kontrakin.com"
              required
            />
          </label>
          <label htmlFor="password">
            Password
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button type="submit" className="add-button login-button" id="login-btn" disabled={busy}>
            {busy ? 'Memproses...' : 'Masuk'}
          </button>
        </form>
        <small>Data tersimpan secara otomatis dan aman.</small>
      </div>
    </div>
  );
}
