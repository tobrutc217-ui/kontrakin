import React, { useState, useEffect } from 'react';
import { Download, Save, LogOut } from 'lucide-react';
import { supabase } from '../supabase';
import { today, downloadCSV, initials } from '../utils';

export function SettingsManager({ user, properties, reload, notify, theme, setTheme, signOut }) {
  const p = properties[0];
  const [name, setName] = useState(p?.name || '');
  const [address, setAddress] = useState(p?.address || '');
  const [adminEmail, setAdminEmail] = useState(p?.admin_email || user.email || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(p?.name || '');
    setAddress(p?.address || '');
    setAdminEmail(p?.admin_email || user.email || '');
  }, [p?.id, p?.name, p?.address, p?.admin_email, user.email]);

  const saveSettings = async e => {
    e.preventDefault();
    setBusy(true);
    let res;
    const payload = {
      name: name.trim() || 'Kos Baru',
      address: address.trim() || null,
      admin_email: adminEmail.trim() || user.email
    };

    if (p) {
      res = await supabase.from('properties').update(payload).eq('id', p.id);
    } else {
      res = await supabase.from('properties').insert(payload);
    }

    setBusy(false);
    if (res.error) {
      return notify(res.error.message);
    }

    notify('Profil pengaturan default properti berhasil disimpan.');
    reload();
  };

  const exportAll = async () => {
    const tables = [
      ['properties', ['id', 'name', 'address', 'created_at']],
      ['rooms', ['id', 'property_id', 'room_number', 'monthly_rate', 'status', 'created_at']],
      ['tenants', ['id', 'room_id', 'full_name', 'email', 'whatsapp_number', 'id_card_number', 'lease_start', 'lease_end', 'billing_day', 'created_at']],
      ['invoices', ['id', 'tenant_id', 'room_id', 'due_date', 'amount', 'paid_amount', 'status', 'paid_at', 'created_at']],
      ['transactions', ['id', 'property_id', 'invoice_id', 'category', 'description', 'amount', 'transaction_date', 'created_at']]
    ];

    try {
      for (const [table, headers] of tables) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) {
          return notify(`Gagal mengekspor tabel ${table}: ${error.message}`);
        }
        
        const rows = (data || []).map(row => 
          headers.map(h => {
            const val = row[h];
            return Array.isArray(val) ? val.join(' | ') : String(val ?? '');
          })
        );

        downloadCSV(`${table}-${today()}.csv`, headers, rows);
        await new Promise(r => setTimeout(r, 150)); // stagger downloads
      }
      notify('Backup seluruh database (CSV/Excel) berhasil diunduh.');
    } catch (err) {
      notify(`Gagal mengekspor data: ${err.message}`);
    }
  };

  return (
    <section className="module-full" id="settings-manager">
      <div className="module-toolbar">
        <div>
          <h2>Pengaturan Sistem</h2>
          <p>Kelola profil default, backup/export data, dan preferensi tampilan aplikasi Kontrakin.</p>
        </div>
        <button className="secondary-button flex items-center gap-2" type="button" onClick={exportAll}>
          <Download size={16} /> Backup Seluruh Data (CSV/Excel)
        </button>
      </div>

      <div className="settings-grid" id="settings-grid">
        <form className="edit-card" onSubmit={saveSettings} id="settings-form">
          <h3>Profil Default Kos / Properti</h3>
          
          <label htmlFor="settings-name">
            Nama Utama Kos/Properti
            <input
              id="settings-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Contoh: Kos Cendana"
              required
            />
          </label>

          <label htmlFor="settings-address">
            Alamat Default
            <input
              id="settings-address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Contoh: Jl. Cendana No. 12, Jakarta"
            />
          </label>

          <label htmlFor="settings-email">
            Email Admin Utama
            <input
              id="settings-email"
              type="email"
              value={adminEmail}
              onChange={e => setAdminEmail(e.target.value)}
              placeholder="Contoh: admin@email.com"
              required
            />
            <small className="form-hint">
              Digunakan untuk notifikasi penting atau korespondensi sistem.
            </small>
          </label>

          <div className="form-actions mt-4">
            <button type="submit" className="primary" disabled={busy}>
              <Save size={15} /> Simpan Pengaturan
            </button>
          </div>
        </form>

        <div className="edit-card space-y-6" id="settings-appearance-card">
          <div>
            <h3>Tampilan Aplikasi</h3>
            <label htmlFor="settings-theme" className="mt-2 block">
              Pilihan Tema Tampilan
              <select
                id="settings-theme"
                value={theme}
                onChange={e => setTheme(e.target.value)}
                className="mt-1"
              >
                <option value="system">Otomatis (Sesuai Sistem Operasi)</option>
                <option value="light">Terang (Rekomendasi Modern)</option>
                <option value="dark">Gelap (Eye-Safe Night Mode)</option>
              </select>
            </label>
          </div>

          <hr className="my-4 border-gray-200" />

          <div>
            <h3>Informasi Akun</h3>
            <div className="account-box flex items-center gap-4 p-3 border border-gray-100 rounded-lg mt-2">
              <div className="avatar dark font-bold shrink-0">{initials(user.email)}</div>
              <div>
                <b className="block text-gray-800 text-sm">{user.email}</b>
                <small className="text-gray-400 block text-xs">Admin Properti / Owner</small>
              </div>
            </div>
            <button className="logout-button flex items-center justify-center gap-2 mt-4" type="button" onClick={signOut}>
              <LogOut size={16} /> Keluar dari Sesi Kontrakin
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
