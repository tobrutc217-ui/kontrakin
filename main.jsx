import React, { useEffect, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Building2, Users, CreditCard, WalletCards, Settings, LayoutDashboard,
  Menu, Sun, RefreshCw, X, LogOut, Bell
} from 'lucide-react';

import './styles.css';
import { supabase } from './supabase';
import { initials } from './utils';

// Import Modular Components
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { PropertyManager } from './components/PropertyManager';
import { TenantManager } from './components/TenantManager';
import { InvoiceManager } from './components/InvoiceManager';
import { FinanceManager } from './components/FinanceManager';
import { SettingsManager } from './components/SettingsManager';

function App({ user }) {
  const [section, setSection] = useState('Dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Core Database Collections
  const [properties, setProperties] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Property Switcher State
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    () => localStorage.getItem('selected-property') || 'all'
  );

  // App Theme Style
  const [theme, setTheme] = useState(() => localStorage.getItem('kos-theme') || 'system');
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  const notify = msg => {
    setToast(msg);
    window.clearTimeout(window.__toastTimer);
    window.__toastTimer = window.setTimeout(() => setToast(''), 3500);
  };

  const loadData = async () => {
    if (!hasLoadedOnce) setLoading(true);
    setError('');

    try {
      const [pRes, rRes, tRes, iRes, txRes] = await Promise.all([
        supabase.from('properties').select('*').order('created_at'),
        supabase.from('rooms').select('*').order('room_number'),
        supabase.from('tenants').select('*').order('created_at', { ascending: false }),
        supabase.from('invoices').select('*').order('due_date', { ascending: false }),
        supabase.from('transactions').select('*').order('transaction_date', { ascending: false }).limit(300)
      ]);

      const failed = [pRes, rRes, tRes, iRes, txRes].find(r => r.error);
      if (failed) {
        setError(failed.error.message);
      } else {
        setProperties(pRes.data || []);
        setRooms(rRes.data || []);
        setTenants(tRes.data || []);
        setInvoices(iRes.data || []);
        setTransactions(txRes.data || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setHasLoadedOnce(true);
      setLoading(false);
    }
  };

  // On mount and theme listener
  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemDarkChange = e => setSystemDark(e.matches);
    media.addEventListener('change', handleSystemDarkChange);
    return () => media.removeEventListener('change', handleSystemDarkChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    localStorage.setItem('kos-theme', theme);
  }, [theme, resolvedTheme]);

  useEffect(() => {
    localStorage.setItem('selected-property', selectedPropertyId);
  }, [selectedPropertyId]);

  // ISOLASI DATA MULTI-PROPERTI (Sangat Ketat)
  const scopedRooms = useMemo(() => {
    if (selectedPropertyId === 'all') return rooms;
    return rooms.filter(r => r.property_id === selectedPropertyId);
  }, [rooms, selectedPropertyId]);

  const scopedRoomIds = useMemo(() => new Set(scopedRooms.map(r => r.id)), [scopedRooms]);

  const scopedTenants = useMemo(() => {
    if (selectedPropertyId === 'all') return tenants;
    // Tenants belong to a room, and the room belongs to the active property
    return tenants.filter(t => scopedRoomIds.has(t.room_id));
  }, [tenants, scopedRoomIds, selectedPropertyId]);

  const scopedTenantIds = useMemo(() => new Set(scopedTenants.map(t => t.id)), [scopedTenants]);

  const scopedInvoices = useMemo(() => {
    if (selectedPropertyId === 'all') return invoices;
    // Invoices belong to a tenant of the active property
    return invoices.filter(i => scopedTenantIds.has(i.tenant_id));
  }, [invoices, scopedTenantIds, selectedPropertyId]);

  const scopedTransactions = useMemo(() => {
    if (selectedPropertyId === 'all') return transactions;
    // Transactions belong directly to the active property
    return transactions.filter(t => t.property_id === selectedPropertyId);
  }, [transactions, selectedPropertyId]);

  // Unpaid invoices count for sidebar indicator badge
  const unpaidInvoicesCount = useMemo(() => {
    return scopedInvoices.filter(i => i.status !== 'paid').length;
  }, [scopedInvoices]);

  const activePropertyName = selectedPropertyId === 'all'
    ? 'Semua Properti'
    : (properties.find(p => p.id === selectedPropertyId)?.name || 'Properti');

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) notify(error.message);
  };

  const menuItems = [
    [LayoutDashboard, 'Dashboard'],
    [Building2, 'Properti'],
    [Users, 'Penghuni'],
    [CreditCard, 'Penagihan'],
    [WalletCards, 'Keuangan']
  ];

  const pageTitle = useMemo(() => {
    if (section === 'Dashboard') {
      return ['Selamat Datang', `${activePropertyName} · Ringkasan data operasional kos hari ini.`];
    }
    return [section, `Sistem kelola ${section.toLowerCase()} Kontrakin yang akurat.`];
  }, [section, activePropertyName]);

  return (
    <div className="app-shell">
      {/* Desktop & Mobile Sidebar */}
      <aside className={mobileOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <div className="brand-mark">
            <Building2 size={20} />
          </div>
          <span>Kontrakin</span>
          <button className="close-menu" type="button" onClick={() => setMobileOpen(false)}>
            <X />
          </button>
        </div>

        {/* Global Property Switcher */}
        <div className="property-switcher">
          <label htmlFor="global-property-switcher">Properti Aktif</label>
          <select
            id="global-property-switcher"
            value={selectedPropertyId}
            onChange={e => setSelectedPropertyId(e.target.value)}
          >
            <option value="all">Semua Properti</option>
            {properties.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <nav>
          {menuItems.map(([Icon, label]) => (
            <button
              key={label}
              type="button"
              className={section === label ? 'active' : ''}
              onClick={() => {
                setSection(label);
                setMobileOpen(false);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {label === 'Penagihan' && unpaidInvoicesCount > 0 && <em>{unpaidInvoicesCount}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            type="button"
            className={section === 'Pengaturan' ? 'active' : ''}
            onClick={() => setSection('Pengaturan')}
          >
            <Settings size={19} />
            <span>Pengaturan</span>
          </button>
          <div className="help-card">
            <span>Supabase Database Terkoneksi</span>
          </div>
          <div className="user">
            <div className="avatar dark font-bold">{initials(user.email)}</div>
            <div className="user-info">
              <b>{user.email}</b>
              <small>Admin Properti</small>
            </div>
            <button className="icon-button logout" type="button" onClick={signOut} title="Keluar">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main">
        <header className="topbar">
          <button className="menu-toggle" type="button" onClick={() => setMobileOpen(v => !v)}>
            <Menu />
          </button>
          <div className="topbar-property">
            <b>{activePropertyName}</b>
            <small>{selectedPropertyId === 'all' ? 'Gabungan seluruh properti aktif' : 'Properti aktif saat ini'}</small>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={loadData} title="Muat ulang data">
              <RefreshCw size={17} />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => setTheme(t => t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system')}
              title={`Ubah tema (Sekarang: ${theme})`}
            >
              <Sun size={17} />
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="intro">
            <div>
              <h1>{pageTitle[0]}</h1>
              <p>{pageTitle[1]}</p>
            </div>
          </div>

          {error && <div className="error-box">{error}</div>}

          {loading && !hasLoadedOnce ? (
            <div className="panel loading py-8 text-center text-gray-500">
              Menghubungkan ke database Kontrakin...
            </div>
          ) : (
            <>
              {section === 'Dashboard' && (
                <Dashboard
                  properties={properties}
                  rooms={rooms}
                  tenants={tenants}
                  invoices={invoices}
                  transactions={transactions}
                  selectedPropertyId={selectedPropertyId}
                />
              )}
              {section === 'Properti' && (
                <PropertyManager
                  properties={properties}
                  rooms={rooms}
                  reload={loadData}
                  notify={notify}
                />
              )}
              {section === 'Penghuni' && (
                <TenantManager
                  tenants={scopedTenants}
                  rooms={scopedRooms}
                  allRooms={rooms}
                  properties={properties}
                  reload={loadData}
                  notify={notify}
                />
              )}
              {section === 'Penagihan' && (
                <InvoiceManager
                  tenants={scopedTenants}
                  rooms={scopedRooms}
                  invoices={scopedInvoices}
                  properties={properties}
                  reload={loadData}
                  notify={notify}
                />
              )}
              {section === 'Keuangan' && (
                <FinanceManager
                  properties={properties}
                  transactions={scopedTransactions}
                  selectedPropertyId={selectedPropertyId}
                  reload={loadData}
                  notify={notify}
                />
              )}
              {section === 'Pengaturan' && (
                <SettingsManager
                  user={user}
                  properties={properties}
                  reload={loadData}
                  notify={notify}
                  theme={theme}
                  setTheme={setTheme}
                  signOut={signOut}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* Mobile Floating Bottom Bar */}
      <div className="mobile-nav">
        {menuItems.map(([Icon, label]) => (
          <button
            key={label}
            type="button"
            className={section === label ? 'active' : ''}
            onClick={() => setSection(label)}
          >
            <Icon size={20} />
            <span>{label}</span>
            {label === 'Penagihan' && unpaidInvoicesCount > 0 && <em>{unpaidInvoicesCount}</em>}
          </button>
        ))}
        <button
          type="button"
          className={section === 'Pengaturan' ? 'active' : ''}
          onClick={() => setSection('Pengaturan')}
        >
          <Settings size={20} />
          <span>Setelan</span>
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Root() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setChecking(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <div className="login-shell">
        <div className="login-card p-6 text-center text-gray-500">
          Memeriksa sesi Kontrakin...
        </div>
      </div>
    );
  }

  return session ? <App user={session.user} /> : <Login />;
}

createRoot(document.getElementById('root')).render(<Root />);
