import React, { useState } from 'react';
import { Pencil, Trash2, UserPlus, Save, DoorOpen, History } from 'lucide-react';
import { supabase } from '../supabase';
import { rupiah, today, parseDateLocal, roundDownTo1k, isoDate } from '../utils';

const calculateLeaseDuration = (startStr, endStr) => {
  if (!startStr || !endStr) return null;
  const start = parseDateLocal(startStr);
  const end = parseDateLocal(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  
  const yearsDiff = end.getFullYear() - start.getFullYear();
  const monthsDiff = end.getMonth() - start.getMonth();
  const daysDiff = end.getDate() - start.getDate();
  
  let totalMonths = yearsDiff * 12 + monthsDiff;
  if (daysDiff > 15) {
    totalMonths += 1;
  }
  return totalMonths > 0 ? totalMonths : null;
};

export function TenantManager({ tenants, rooms, allRooms = [], properties = [], reload, notify }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [roomMoveOpen, setRoomMoveOpen] = useState(false);
  const [selectedTenantForMove, setSelectedTenantForMove] = useState(null);

  const getRoomLabel = (r) => {
    if (!r) return 'Belum Ditempatkan';
    const prop = properties?.find(p => p.id === r.property_id);
    return `Kamar ${r.room_number}${prop ? ` (${prop.name})` : ''}`;
  };

  const blank = {
    full_name: '',
    email: '',
    whatsapp_number: '',
    id_card_number: '',
    lease_start: today(),
    lease_end: '',
    room_id: '',
    billing_day: ''
  };

  const [form, setForm] = useState(blank);
  const [moveForm, setMoveForm] = useState({
    target_room_id: '',
    move_date: today()
  });
  const [busy, setBusy] = useState(false);
  const [prorateAction, setProrateAction] = useState('invoice'); // 'invoice', 'transaction', 'none'

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const startEdit = t => {
    setEditing(t);
    const roomList = allRooms.length ? allRooms : rooms;
    const room = roomList.find(r => r.id === t.room_id);
    
    let initialBillingDay = Number(t.billing_day);
    if (!initialBillingDay && t.lease_start) {
      const parsed = parseDateLocal(t.lease_start);
      if (parsed && !isNaN(parsed.getTime())) {
        initialBillingDay = parsed.getDate();
      }
    }
    if (!initialBillingDay || isNaN(initialBillingDay) || initialBillingDay < 1 || initialBillingDay > 31) {
      initialBillingDay = 1;
    }
    
    setForm({
      full_name: t.full_name,
      email: t.email || '',
      whatsapp_number: t.whatsapp_number,
      id_card_number: t.id_card_number || '',
      lease_start: t.lease_start,
      lease_end: t.lease_end || '',
      room_id: t.room_id || '',
      billing_day: String(initialBillingDay)
    });
    setProrateAction('invoice');
    setOpen(true);
  };

  const startRoomMove = t => {
    setSelectedTenantForMove(t);
    setMoveForm({
      target_room_id: '',
      move_date: today()
    });
    setRoomMoveOpen(true);
  };

  const saveMoveRoom = async e => {
    e.preventDefault();
    if (!selectedTenantForMove || !moveForm.target_room_id) {
      return notify('Harap pilih kamar tujuan.');
    }

    setBusy(true);
    const t = selectedTenantForMove;
    const oldRoomId = t.room_id;
    const targetRoomId = moveForm.target_room_id;
    const roomList = allRooms.length ? allRooms : rooms;
    const targetRoom = roomList.find(r => r.id === targetRoomId);

    if (!targetRoom) {
      setBusy(false);
      return notify('Kamar tujuan tidak ditemukan.');
    }

    // 1. Update the tenant with the new room_id
    const { error: tError } = await supabase.from('tenants').update({
      room_id: targetRoomId
    }).eq('id', t.id);

    if (tError) {
      setBusy(false);
      return notify(`Gagal memindahkan penghuni: ${tError.message}`);
    }

    // 2. Set new room status to occupied
    await supabase.from('rooms').update({ status: 'occupied' }).eq('id', targetRoomId);

    // 3. Set old room status to vacant (if it had one)
    if (oldRoomId && oldRoomId !== targetRoomId) {
      await supabase.from('rooms').update({ status: 'vacant' }).eq('id', oldRoomId);
    }

    // Simple room move does not shift the billing cycle or amount, so we do not insert into billing_adjustments.
    // This avoids database CHECK constraint violations (amount <> 0) on the billing_adjustments table.

    setBusy(false);
    setRoomMoveOpen(false);
    setSelectedTenantForMove(null);
    notify(`Penghuni ${t.full_name} berhasil dipindahkan ke ${getRoomLabel(targetRoom)}`);
    reload();
  };

  const save = async e => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.whatsapp_number.trim() || !form.lease_start) {
      return notify('Nama, WhatsApp, dan Tanggal Masuk wajib diisi.');
    }

    // Compute automatic billing day based on lease start day if empty
    const defaultDay = parseDateLocal(form.lease_start).getDate();
    const finalBillingDay = Math.max(1, Math.min(31, Number(form.billing_day) || defaultDay));

    setBusy(true);
    let error = null;

    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      whatsapp_number: form.whatsapp_number.trim(),
      id_card_number: form.id_card_number.trim() || null,
      lease_start: form.lease_start,
      lease_end: form.lease_end || null,
      room_id: form.room_id || null,
      billing_day: finalBillingDay
    };

    if (editing) {
      let oldDay = Number(editing.billing_day);
      if (!oldDay && editing.lease_start) {
        const parsed = parseDateLocal(editing.lease_start);
        if (parsed && !isNaN(parsed.getTime())) {
          oldDay = parsed.getDate();
        }
      }
      if (!oldDay || isNaN(oldDay) || oldDay < 1 || oldDay > 31) {
        oldDay = 1;
      }
      
      const result = await supabase.from('tenants').update(payload).eq('id', editing.id);
      error = result.error;

      // Handle Prorata Khusus Pindah Tanggal
      if (!error && oldDay !== finalBillingDay) {
        const roomList = allRooms.length ? allRooms : rooms;
        const room = roomList.find(r => r.id === (form.room_id || editing.room_id));
        const rate = Number(room?.monthly_rate || 0);

        // Calculate prorate adjustment
        const shift = finalBillingDay - oldDay;
        const rawAmt = (rate / 30) * shift;
        const absAmt = roundDownTo1k(Math.abs(rawAmt));
        const adjustment = absAmt; // Absolute amount used for invoice or transaction

        if (adjustment !== 0) {
          const propertyId = room?.property_id;
          
          // Log adjustment to billing_adjustments (silently handles if table not present)
          const adjustmentRow = {
            tenant_id: editing.id,
            room_id: room.id,
            old_billing_day: oldDay,
            new_billing_day: finalBillingDay,
            shift_days: shift,
            amount: shift >= 0 ? adjustment : -adjustment,
            effective_date: today(),
            description: `Perubahan tanggal tagihan dari tanggal ${oldDay} ke tanggal ${finalBillingDay} (${prorateAction})`
          };

          const adjRes = await supabase.from('billing_adjustments').insert(adjustmentRow);
          if (adjRes.error && !adjRes.error.message.includes('billing_adjustments')) {
            console.warn('Gagal mencatat penyesuaian prorata:', adjRes.error.message);
          }

          // Execute selected prorate action
          if (prorateAction === 'invoice') {
            // Create a real unpaid Invoice
            const { error: invErr } = await supabase.from('invoices').insert({
              tenant_id: editing.id,
              room_id: room.id,
              due_date: today(),
              amount: adjustment,
              status: 'unpaid',
              paid_amount: 0
            });
            if (invErr) {
              console.warn('Gagal membuat tagihan prorata:', invErr.message);
            }
          } else if (prorateAction === 'transaction' && propertyId) {
            // Direct Cash Transaction entry
            const tx = {
              property_id: propertyId,
              category: 'Penyesuaian Prorata',
              description: `Penyesuaian perubahan tanggal tagihan ${oldDay} → ${finalBillingDay} · ${form.full_name}`,
              amount: adjustment,
              transaction_date: today()
            };
            const txRes = await supabase.from('transactions').insert(tx);
            if (txRes.error) {
              console.warn('Gagal mencatat transaksi prorata:', txRes.error.message);
            }
          }
        }
      }
    } else {
      // Create new tenant
      const r = await supabase.from('tenants').insert(payload).select().single();
      error = r.error;
    }

    // Set room status
    if (!error && form.room_id) {
      await supabase.from('rooms').update({ status: 'occupied' }).eq('id', form.room_id);
    }

    // Handle vacating the old room if the room changed
    if (!error && editing && editing.room_id && editing.room_id !== form.room_id) {
      await supabase.from('rooms').update({ status: 'vacant' }).eq('id', editing.room_id);
    }

    setBusy(false);
    if (error) {
      return notify(error.message);
    }

    setOpen(false);
    setEditing(null);
    setForm(blank);
    notify(editing ? 'Data penghuni diperbarui.' : 'Penghuni baru berhasil ditambahkan.');
    reload();
  };

  const del = async t => {
    if (!confirm(`Hapus penghuni ${t.full_name}? Seluruh histori data sewa akan tetap tersimpan.`)) return;

    setBusy(true);
    const { error } = await supabase.from('tenants').delete().eq('id', t.id);
    setBusy(false);

    if (error) {
      return notify(error.message);
    }

    if (t.room_id) {
      await supabase.from('rooms').update({ status: 'vacant' }).eq('id', t.room_id);
    }

    notify('Penghuni berhasil dihapus.');
    reload();
  };

  const availableRoomsForSelect = React.useMemo(() => {
    const list = [...rooms];
    if (form.room_id && !list.some(r => r.id === form.room_id)) {
      const roomList = allRooms.length ? allRooms : rooms;
      const currentRoom = roomList.find(r => r.id === form.room_id);
      if (currentRoom) {
        list.push(currentRoom);
      }
    }
    return list;
  }, [rooms, allRooms, form.room_id]);

  const freeRooms = availableRoomsForSelect.filter(r => r.status === 'vacant' || form.room_id === r.id);
  const freeRoomsForMove = rooms.filter(r => r.status === 'vacant');

  // Prorate Live Calculation
  const room = (allRooms.length ? allRooms : rooms).find(r => r.id === (form.room_id || editing?.room_id));
  const rate = Number(room?.monthly_rate || 0);

  let oldDay = 0;
  if (editing) {
    oldDay = Number(editing.billing_day);
    if (!oldDay && editing.lease_start) {
      const parsed = parseDateLocal(editing.lease_start);
      if (parsed && !isNaN(parsed.getTime())) {
        oldDay = parsed.getDate();
      }
    }
    if (!oldDay || isNaN(oldDay) || oldDay < 1 || oldDay > 31) {
      oldDay = 1;
    }
  }

  const currentFormDay = Number(form.billing_day) || oldDay;
  const isDayChanged = editing && oldDay !== currentFormDay && currentFormDay >= 1 && currentFormDay <= 31;
  const shiftDays = isDayChanged ? currentFormDay - oldDay : 0;
  const rawProrate = isDayChanged ? (rate / 30) * shiftDays : 0;
  const prorateAmount = roundDownTo1k(Math.abs(rawProrate));

  return (
    <section className="module-full" id="tenant-manager">
      <div className="module-toolbar">
        <div>
          <h2>Manajemen Penghuni</h2>
          <p>Daftar penghuni kos aktif beserta penempatan kamar dan siklus tagihan.</p>
        </div>
        <button
          className="add-button"
          type="button"
          onClick={() => {
            setEditing(null);
            setForm(blank);
            setOpen(true);
          }}
        >
          <UserPlus size={17} /> Tambah Penghuni
        </button>
      </div>

      {open && (
        <form className="edit-card tenant-form" onSubmit={save} id="tenant-form">
          <h3>{editing ? 'Edit Data Penghuni' : 'Registrasi Penghuni Baru'}</h3>
          <div className="form-grid">
            <label htmlFor="tenant-name">
              Nama Lengkap
              <input
                id="tenant-name"
                value={form.full_name}
                onChange={e => set('full_name', e.target.value)}
                placeholder="Contoh: Nanda Pratama"
                required
              />
            </label>
            <label htmlFor="tenant-whatsapp">
              Nomor WhatsApp / HP
              <input
                id="tenant-whatsapp"
                value={form.whatsapp_number}
                onChange={e => set('whatsapp_number', e.target.value)}
                placeholder="Contoh: 6281234567890"
                required
              />
            </label>
            <label htmlFor="tenant-email">
              Alamat Email (Opsional)
              <input
                id="tenant-email"
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="Contoh: nanda@email.com"
              />
            </label>
            <label htmlFor="tenant-ktp">
              Nomor KTP (Opsional)
              <input
                id="tenant-ktp"
                value={form.id_card_number}
                onChange={e => set('id_card_number', e.target.value)}
                placeholder="Contoh: 3171234567890001"
              />
            </label>
            <label htmlFor="tenant-room">
              Kamar Ditempati
              <select id="tenant-room" value={form.room_id} onChange={e => set('room_id', e.target.value)}>
                <option value="">Belum Ditempatkan / Kosong</option>
                {freeRooms.map(r => (
                  <option key={r.id} value={r.id}>
                    Kamar {r.room_number} ({rupiah(r.monthly_rate)}/bln)
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="tenant-lease-start">
              Tanggal Masuk / Sewa Mulai
              <input
                id="tenant-lease-start"
                type="date"
                value={form.lease_start}
                onChange={e => set('lease_start', e.target.value)}
                required
              />
            </label>
            {editing && (
              <div className="col-span-full border-t border-gray-100 pt-4 mt-2">
                <label htmlFor="tenant-billing-day" className="block text-sm font-semibold text-gray-700 mb-1">
                  Pindahkan Tanggal Tagihan Bulanan ke
                </label>
                <div className="flex gap-2 items-center max-w-xs">
                  <input
                    id="tenant-billing-day"
                    type="number"
                    min="1"
                    max="31"
                    value={form.billing_day}
                    onChange={e => set('billing_day', e.target.value)}
                    className="w-24 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Contoh: 25"
                  />
                  <span className="text-gray-500 text-sm">setiap bulan</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Ubah tanggal jatuh tempo bulanan (misal menyelaraskan tanggal gajian penghuni).
                </p>

                {isDayChanged && (
                  <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 mt-4" id="prorate-preview-box">
                    <h4 className="text-amber-900 font-bold flex items-center gap-2 mb-3 text-sm">
                      🧮 Kalkulator Prorata Pindah Tanggal
                    </h4>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-amber-800 mb-4 bg-white/80 p-3 rounded-lg border border-amber-100">
                      <div>
                        <span className="block text-gray-500 font-medium mb-0.5">Siklus Lama:</span>
                        <b className="text-sm text-gray-800">Tanggal {oldDay}</b>
                      </div>
                      <div>
                        <span className="block text-gray-500 font-medium mb-0.5">Siklus Baru:</span>
                        <b className="text-sm text-gray-800">Tanggal {currentFormDay}</b>
                      </div>
                      <div>
                        <span className="block text-gray-500 font-medium mb-0.5">Pergeseran Hari:</span>
                        <b className="text-sm text-gray-800">
                          {Math.abs(shiftDays)} Hari ({shiftDays > 0 ? 'Mundur/Lambat' : 'Maju/Cepat'})
                        </b>
                      </div>
                      <div>
                        <span className="block text-gray-500 font-medium mb-0.5">Tarif Kamar Bulanan:</span>
                        <b className="text-sm text-gray-800">{rupiah(rate)}</b>
                      </div>
                    </div>

                    <div className="border-t border-amber-200/50 pt-3 text-xs text-amber-800 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Tarif Kamar Harian:</span>
                        <span className="font-mono">{rupiah(rate / 30)} / hari</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Rumus Prorata:</span>
                        <span>({rupiah(rate / 30)} x {Math.abs(shiftDays)} hari)</span>
                      </div>
                      <div className="flex justify-between font-bold text-amber-950 text-sm border-t border-dashed border-amber-200 pt-2.5">
                        <span>Nilai Prorata Penyesuaian:</span>
                        <span className="text-base text-emerald-700">{rupiah(prorateAmount)}</span>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-amber-200/50 pt-3">
                      <span className="block text-xs font-bold text-amber-900 mb-2">Tindakan Penyesuaian Otomatis:</span>
                      <div className="space-y-2 bg-white/40 p-3 rounded-lg border border-amber-100/50">
                        <label className="flex items-start gap-2 text-xs text-gray-700 font-normal cursor-pointer">
                          <input
                            type="radio"
                            name="prorate_action"
                            value="invoice"
                            checked={prorateAction === 'invoice'}
                            onChange={() => setProrateAction('invoice')}
                            className="text-amber-600 focus:ring-amber-500 mt-0.5"
                          />
                          <div>
                            <span className="font-semibold text-gray-900 block">Buat Tagihan Baru (Invoice Prorata)</span>
                            <span className="text-gray-500">Sistem akan otomatis menerbitkan tagihan senilai <b>{rupiah(prorateAmount)}</b> yang dapat dicicil / dibayar di menu Penagihan.</span>
                          </div>
                        </label>
                        <label className="flex items-start gap-2 text-xs text-gray-700 font-normal cursor-pointer">
                          <input
                            type="radio"
                            name="prorate_action"
                            value="transaction"
                            checked={prorateAction === 'transaction'}
                            onChange={() => setProrateAction('transaction')}
                            className="text-amber-600 focus:ring-amber-500 mt-0.5"
                          />
                          <div>
                            <span className="font-semibold text-gray-900 block">Catat Langsung sebagai Pemasukan Kas</span>
                            <span className="text-gray-500">Sistem langsung mencatat uang masuk senilai <b>{rupiah(prorateAmount)}</b> di laporan keuangan tanpa membuat tagihan baru.</span>
                          </div>
                        </label>
                        <label className="flex items-start gap-2 text-xs text-gray-700 font-normal cursor-pointer">
                          <input
                            type="radio"
                            name="prorate_action"
                            value="none"
                            checked={prorateAction === 'none'}
                            onChange={() => setProrateAction('none')}
                            className="text-amber-600 focus:ring-amber-500 mt-0.5"
                          />
                          <div>
                            <span className="font-semibold text-gray-900 block">Hanya Ganti Tanggal Siklus</span>
                            <span className="text-gray-500">Hanya memindahkan tanggal jatuh tempo tanpa memicu tagihan atau transaksi apapun.</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 col-span-full">
              <label htmlFor="tenant-lease-duration">
                Durasi Sewa / Kontrak (Pilihan Cepat)
                <select
                  id="tenant-lease-duration"
                  value={(() => {
                    if (!form.lease_end || !form.lease_start) return '';
                    const dur = calculateLeaseDuration(form.lease_start, form.lease_end);
                    if ([1, 3, 6, 12].includes(dur)) return String(dur);
                    return 'custom';
                  })()}
                  onChange={e => {
                    const dur = e.target.value;
                    if (dur === '') {
                      set('lease_end', '');
                    } else if (dur !== 'custom' && form.lease_start) {
                      const months = Number(dur);
                      const start = parseDateLocal(form.lease_start);
                      const end = new Date(start.getFullYear(), start.getMonth() + months, start.getDate());
                      set('lease_end', isoDate(end));
                    } else {
                      // Kustom tanggal, biarkan seperti semula
                    }
                  }}
                  disabled={!form.lease_start}
                >
                  <option value="">Sampai Keluar (Tanpa Batas)</option>
                  <option value="1">1 Bulan</option>
                  <option value="3">3 Bulan</option>
                  <option value="6">6 Bulan</option>
                  <option value="12">12 Bulan</option>
                  <option value="custom">Kustom Tanggal</option>
                </select>
              </label>

              <label htmlFor="tenant-lease-end">
                Tanggal Keluar / Selesai (Opsional)
                <input
                  id="tenant-lease-end"
                  type="date"
                  value={form.lease_end}
                  onChange={e => set('lease_end', e.target.value)}
                  disabled={!form.lease_start}
                />
              </label>
            </div>
          </div>
          <div className="form-actions mt-4">
            <button type="submit" className="primary" disabled={busy}>
              <Save size={15} /> Simpan Penghuni
            </button>
            <button type="button" onClick={() => { setOpen(false); setEditing(null); }}>
              Batal
            </button>
          </div>
        </form>
      )}

      {tenants.length === 0 ? (
        <div className="panel empty">Belum ada data penghuni yang tercatat. Registrasikan penghuni di atas.</div>
      ) : (
        <div className="data-table panel" id="tenant-table">
          <div className="table-head">
            <span>Nama / Kontak</span>
            <span>Kamar Sekarang</span>
            <span>Siklus Tagihan</span>
            <span>Aksi</span>
          </div>
          {tenants.map(t => {
            const roomList = allRooms.length ? allRooms : rooms;
            const room = roomList.find(x => x.id === t.room_id);
            const cycleDay = t.billing_day || (t.lease_start ? parseDateLocal(t.lease_start).getDate() : 1);
            return (
              <div className="table-row" key={t.id}>
                <div>
                  <b>{t.full_name}</b>
                  <small>
                    {t.whatsapp_number} {t.email ? `· ${t.email}` : ''}
                  </small>
                </div>
                <span>{room ? getRoomLabel(room) : 'Belum ditempatkan'}</span>
                <div>
                  <span>Tanggal {cycleDay} setiap bulan</span>
                  {t.lease_end && (
                    <small className="block text-gray-500 mt-0.5">
                      📅 Kontrak: {calculateLeaseDuration(t.lease_start, t.lease_end) || '?'} Bulan (s.d. {new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(parseDateLocal(t.lease_end))})
                    </small>
                  )}
                </div>
                <div className="row-actions">
                  {room && (
                    <button
                      type="button"
                      onClick={() => startRoomMove(t)}
                      title="Pindah Kamar"
                    >
                      <DoorOpen size={14} />
                    </button>
                  )}
                  <button type="button" onClick={() => startEdit(t)} title="Edit">
                    <Pencil size={14} />
                  </button>
                  <button type="button" className="danger" onClick={() => del(t)} title="Hapus">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Room Move Modal */}
      {roomMoveOpen && selectedTenantForMove && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={saveMoveRoom} id="room-move-form">
            <h3>Pindahkan Kamar Penghuni</h3>
            <p className="mb-4 text-sm text-gray-500">
              Penghuni: <b>{selectedTenantForMove.full_name}</b> <br />
              Kamar Sekarang: <b>{getRoomLabel((allRooms.length ? allRooms : rooms).find(r => r.id === selectedTenantForMove.room_id))}</b>
            </p>

            {freeRoomsForMove.length === 0 ? (
              <div className="bg-red-50 border border-red-200 text-red-800 text-xs p-3 rounded-lg my-2">
                ⚠️ Tidak ada kamar kosong yang tersedia untuk dipindahkan saat ini. Silakan buat atau kosongkan kamar terlebih dahulu di menu <b>Properti</b>.
              </div>
            ) : (
              <label htmlFor="move-target-room">
                Kamar Kosong Tujuan
                <select
                  id="move-target-room"
                  value={moveForm.target_room_id}
                  onChange={e => setMoveForm(m => ({ ...m, target_room_id: e.target.value }))}
                  required
                >
                  <option value="">Pilih kamar baru</option>
                  {freeRoomsForMove.map(r => (
                    <option key={r.id} value={r.id}>
                      {getRoomLabel(r)} — {rupiah(r.monthly_rate)}/bln
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label htmlFor="move-date">
              Tanggal Efektif Pindah
              <input
                id="move-date"
                type="date"
                value={moveForm.move_date}
                onChange={e => setMoveForm(m => ({ ...m, move_date: e.target.value }))}
                required
              />
            </label>

            <small className="form-hint block mb-4">
              Pindah kamar tidak akan menghapus riwayat pembayaran, penagihan, atau histori keuangan yang berhubungan dengan kamar lama. Semuanya tetap diarsipkan rapi di bawah nama penghuni.
            </small>

            <div className="form-actions">
              <button type="submit" className="primary" disabled={busy || freeRoomsForMove.length === 0}>
                <DoorOpen size={15} /> Konfirmasi Pindah
              </button>
              <button type="button" onClick={() => { setRoomMoveOpen(false); setSelectedTenantForMove(null); }}>
                Batal
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
