import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Building2, Save, Home } from 'lucide-react';
import { supabase } from '../supabase';
import { rupiah, parseMoneyInput } from '../utils';
import { MoneyInput } from './MoneyInput';

export function PropertyManager({ properties, rooms, reload, notify }) {
  const [selectedId, setSelectedId] = useState('');
  const p = properties.find(x => x.id === selectedId) || properties[0];

  const [mode, setMode] = useState('list'); // 'list' or 'edit'
  const [form, setForm] = useState({
    name: '',
    address: '',
    bca: '',
    dana: '',
    gopay: '',
    payment_name: ''
  });

  const [roomForm, setRoomForm] = useState({
    room_number: '',
    monthly_rate: ''
  });
  const [busy, setBusy] = useState(false);

  // Sync selected property form details when selection changes
  useEffect(() => {
    if (!selectedId && properties[0]) {
      setSelectedId(properties[0].id);
    }
    if (p) {
      setForm({
        name: p.name || '',
        address: p.address || '',
        bca: p.payment_bca || '',
        dana: p.payment_dana || '',
        gopay: p.payment_gopay || '',
        payment_name: p.payment_name || ''
      });
    }
  }, [p?.id, properties.length]);

  const saveProperty = async e => {
    e.preventDefault();
    if (!form.name.trim()) return notify('Nama properti harus diisi.');

    setBusy(true);
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      payment_bca: form.bca.trim() || null,
      payment_dana: form.dana.trim() || null,
      payment_gopay: form.gopay.trim() || null,
      payment_name: form.payment_name.trim() || null
    };

    let res;
    if (p && selectedId) {
      res = await supabase.from('properties').update(payload).eq('id', p.id);
    } else {
      res = await supabase.from('properties').insert(payload);
    }

    setBusy(false);
    if (res.error) {
      return notify(res.error.message);
    }

    setMode('list');
    notify('Properti berhasil disimpan.');
    reload();
  };

  const deleteProperty = async () => {
    if (!p) return;
    if (!confirm(`Hapus ${p.name}? Semua kamar, penghuni, tagihan dan transaksi terkait dari properti ini akan terhapus.`)) return;

    setBusy(true);
    const { error } = await supabase.from('properties').delete().eq('id', p.id);
    setBusy(false);

    if (error) {
      return notify(error.message);
    }

    setSelectedId('');
    notify('Properti berhasil dihapus.');
    reload();
  };

  const addRoom = async e => {
    e.preventDefault();
    if (!p) return notify('Pilih properti terlebih dahulu.');
    
    const rate = parseMoneyInput(roomForm.monthly_rate);
    if (!roomForm.room_number.trim() || !rate) {
      return notify('Harap lengkapi nomor kamar dan tarif bulanan.');
    }

    setBusy(true);
    const { error } = await supabase.from('rooms').insert({
      property_id: p.id,
      room_number: roomForm.room_number.trim(),
      monthly_rate: rate,
      status: 'vacant'
    });
    setBusy(false);

    if (error) {
      return notify(error.message);
    }

    setRoomForm({ room_number: '', monthly_rate: '' });
    notify('Kamar baru berhasil ditambahkan.');
    reload();
  };

  const deleteRoom = async r => {
    if (!confirm(`Hapus Kamar ${r.room_number}? Ini akan menghapus data kamar, namun histori tagihan lama akan tetap tersimpan.`)) return;

    setBusy(true);
    const { error } = await supabase.from('rooms').delete().eq('id', r.id);
    setBusy(false);

    if (error) {
      return notify(error.message);
    }

    notify('Kamar berhasil dihapus.');
    reload();
  };

  const currentRooms = rooms.filter(r => r.property_id === p?.id);
  const occupiedCount = currentRooms.filter(r => r.status === 'occupied').length;

  return (
    <section className="property-manager-v2" id="property-manager">
      <div className="property-list-panel">
        <div className="module-toolbar">
          <div>
            <h2>Daftar Properti</h2>
            <p>Kelola seluruh kos dalam satu sistem terintegrasi.</p>
          </div>
          <button
            className="add-button"
            type="button"
            onClick={() => {
              setSelectedId('');
              setForm({ name: '', address: '', bca: '', dana: '', gopay: '', payment_name: '' });
              setMode('edit');
            }}
          >
            <Plus size={17} /> Tambah Properti
          </button>
        </div>

        {properties.length === 0 ? (
          <div className="empty panel">Belum ada properti terdaftar. Tambahkan properti pertama Anda di atas.</div>
        ) : (
          <div className="property-cards">
            {properties.map(x => {
              const rs = rooms.filter(r => r.property_id === x.id);
              const occ = rs.filter(r => r.status === 'occupied').length;
              return (
                <button
                  className={`property-card ${p?.id === x.id && mode === 'list' ? 'selected' : ''}`}
                  key={x.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(x.id);
                    setMode('list');
                  }}
                >
                  <Building2 size={20} />
                  <div>
                    <b>{x.name}</b>
                    <span>{x.address || 'Alamat belum diisi'}</span>
                    <small>
                      {rs.length} Kamar · {occ} Terisi · {rs.length - occ} Kosong
                    </small>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {mode === 'edit' && (
        <form className="edit-card" onSubmit={saveProperty} id="property-form">
          <h3>{p && selectedId ? 'Edit Properti' : 'Tambah Properti Baru'}</h3>
          <label htmlFor="prop-name">
            Nama Properti
            <input
              id="prop-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Contoh: Kos Melati"
              required
            />
          </label>
          <label htmlFor="prop-address">
            Alamat Lengkap
            <input
              id="prop-address"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="Contoh: Jl. Cendana No. 12, Jakarta"
            />
          </label>

          <h4>Metode Pembayaran (Tampil di WhatsApp Tagihan)</h4>
          <label htmlFor="payment_name">
            Nama Pemilik Rekening / Akun
            <input
              id="payment_name"
              value={form.payment_name}
              onChange={e => setForm(f => ({ ...f, payment_name: e.target.value }))}
              placeholder="Contoh: Ryan Putra Pratama"
            />
          </label>
          <label htmlFor="payment_bca">
            Nomor Rekening BCA
            <input
              id="payment_bca"
              value={form.bca}
              onChange={e => setForm(f => ({ ...f, bca: e.target.value }))}
              placeholder="Contoh: 0571288191"
            />
          </label>
          <label htmlFor="payment_dana">
            Nomor DANA
            <input
              id="payment_dana"
              value={form.dana}
              onChange={e => setForm(f => ({ ...f, dana: e.target.value }))}
              placeholder="Contoh: 08816585970"
            />
          </label>
          <label htmlFor="payment_gopay">
            Nomor GoPay / ShopeePay
            <input
              id="payment_gopay"
              value={form.gopay}
              onChange={e => setForm(f => ({ ...f, gopay: e.target.value }))}
              placeholder="Contoh: 085161174317"
            />
          </label>

          <div className="form-actions">
            <button type="submit" className="primary" disabled={busy}>
              <Save size={15} /> Simpan Properti
            </button>
            <button type="button" onClick={() => setMode('list')}>
              Batal
            </button>
            {p && selectedId && (
              <button type="button" className="danger-outline-btn" onClick={deleteProperty} disabled={busy}>
                Hapus Properti
              </button>
            )}
          </div>
        </form>
      )}

      {p && mode === 'list' && (
        <div className="property-detail" id="property-detail-view">
          <div className="property-detail-head">
            <div>
              <h2>{p.name}</h2>
              <p>{p.address || 'Alamat belum diisi'}</p>
            </div>
            <div className="toolbar-actions">
              <button className="secondary-button" type="button" onClick={() => setMode('edit')}>
                <Pencil size={15} /> Edit Properti
              </button>
            </div>
          </div>

          <div className="payment-methods">
            <h3>Rekening Pembayaran Properti</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mt-2">
              <div>
                <span className="block text-gray-500 font-medium">BCA</span>
                <span className="font-bold">{p.payment_bca || '—'}</span>
              </div>
              <div>
                <span className="block text-gray-500 font-medium">DANA</span>
                <span className="font-bold">{p.payment_dana || '—'}</span>
              </div>
              <div>
                <span className="block text-gray-500 font-medium">GoPay / ShopeePay</span>
                <span className="font-bold">{p.payment_gopay || '—'}</span>
              </div>
            </div>
            <small className="block mt-2 text-gray-400">Atas nama: {p.payment_name || '—'}</small>
          </div>

          <div className="property-room-head">
            <h3>Daftar Kamar</h3>
            <span>
              {currentRooms.length} Kamar ({occupiedCount} Terisi, {currentRooms.length - occupiedCount} Kosong)
            </span>
          </div>

          {/* Inline Add Room Form */}
          <form className="room-inline-form" onSubmit={addRoom}>
            <input
              value={roomForm.room_number}
              onChange={e => setRoomForm(r => ({ ...r, room_number: e.target.value }))}
              placeholder="Contoh: Kamar 101"
              required
            />
            <MoneyInput
              value={roomForm.monthly_rate}
              onChange={val => setRoomForm(r => ({ ...r, monthly_rate: val }))}
              placeholder="Tarif Bulanan (misal: 1,500,000)"
              required
            />
            <button className="add-button" type="submit" disabled={busy}>
              <Plus size={15} /> Tambah Kamar
            </button>
          </form>

          {/* Room List Grid */}
          <div className="room-list">
            {currentRooms.length === 0 ? (
              <div className="empty text-center py-4">Belum ada kamar di properti ini. Tambahkan kamar menggunakan form di atas.</div>
            ) : (
              currentRooms.map(r => (
                <article className="room-row" key={r.id}>
                  <div className={`room-row-icon ${r.status}`}>
                    <Home size={18} />
                  </div>
                  <div>
                    <b>Kamar {r.room_number}</b>
                    <span>
                      {r.status === 'occupied' ? 'Terisi' : r.status === 'maintenance' ? 'Dalam Perawatan' : 'Kosong'}
                    </span>
                  </div>
                  <strong>
                    {rupiah(r.monthly_rate)}
                    <small>/bulan</small>
                  </strong>
                  <button className="danger-icon" type="button" onClick={() => deleteRoom(r)} disabled={busy} title="Hapus Kamar">
                    <Trash2 size={15} />
                  </button>
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
