import React, { useState, useMemo, useEffect } from 'react';
import { Pencil, MessageCircle, CheckCircle2, X, Save, ReceiptText, Trash2 } from 'lucide-react';
import { supabase } from '../supabase';
import { rupiah, today, parseDateLocal, overdueDays, addMonthsDate, monthDueDate } from '../utils';
import { MoneyInput } from './MoneyInput';

export function InvoiceManager({ tenants, rooms, invoices, properties, reload, notify }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageType, setMessageType] = useState('reminder');
  const [message, setMessage] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [activeTab, setActiveTab] = useState('unpaid');

  const defaultMonthPeriod = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const [form, setForm] = useState({
    tenant_id: '',
    due_date: today(),
    amount: '',
    manualAmount: false,
    monthCount: 1,
    month_period: defaultMonthPeriod()
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // 🔥 HELPER SUPER KETAT: Mengubah apa pun menjadi angka yang aman
  const getNum = (val) => {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  };

  const remain = (i) => {
    const amt = getNum(i.amount);
    const paid = getNum(i.paid_amount);
    return Math.max(0, amt - paid);
  };

  // 🔥 PENENTU LUNAS: Kebal terhadap huruf besar/kecil atau format aneh
  const isPaidOff = (i) => {
    const sisa = remain(i);
    const statusLower = String(i.status || '').toLowerCase().trim();
    return statusLower === 'paid' || statusLower === 'lunas' || sisa === 0;
  };

  // 🔥 DEBUGGER OTOMATIS: Buka Console (F12) untuk melihat apa yang dipikirkan sistem
  useEffect(() => {
    console.log("🔍 DEBUG TAGIHAN:", invoices.map(i => ({
      id: i.id,
      tenant: tenants.find(t => t.id === i.tenant_id)?.full_name || 'Unknown',
      amount: i.amount,
      paid_amount: i.paid_amount,
      sisa: remain(i),
      status: i.status,
      isPaidOff: isPaidOff(i)
    })));
  }, [invoices, tenants]);

  const getCalculatedDueDate = (tenantId, monthPeriodStr) => {
    const t = tenants.find(x => x.id === tenantId);
    if (!t) return today();
    const parts = (monthPeriodStr || defaultMonthPeriod()).split('-');
    const year = Number(parts[0]) || new Date().getFullYear();
    const month = Number(parts[1]) || (new Date().getMonth() + 1);
    let billingDay = 1;
    if (t.billing_day && !isNaN(Number(t.billing_day))) billingDay = Number(t.billing_day);
    else if (t.lease_start) {
      const start = parseDateLocal(t.lease_start);
      if (start && !isNaN(start.getTime())) billingDay = start.getDate();
    }
    return monthDueDate(year, month - 1, billingDay);
  };

  const previewDates = useMemo(() => {
    if (!form.tenant_id || !form.month_period) return [];
    const count = Math.max(1, Math.min(24, Number(form.monthCount) || 1));
    const dates = [];
    const startDue = getCalculatedDueDate(form.tenant_id, form.month_period);
    for (let n = 0; n < count; n++) dates.push(addMonthsDate(startDue, n));
    return dates;
  }, [form.tenant_id, form.month_period, form.monthCount, tenants]);

  const roomFor = t => rooms.find(r => r.id === t?.room_id);
  const autoAmount = t => Number(roomFor(t)?.monthly_rate || 0);

  const saveInvoice = async e => {
    e.preventDefault();
    const t = tenants.find(x => x.id === form.tenant_id);
    const r = roomFor(t);
    if (!t || !r) return notify('Pilih penghuni yang sudah punya kamar.');
    
    setBusy(true);
    if (editing) {
      const amount = form.manualAmount ? getNum(form.amount) : autoAmount(t);
      const paidAmount = getNum(editing.paid_amount);
      let newStatus = 'unpaid';
      if (paidAmount >= amount) newStatus = 'paid';
      else if (parseDateLocal(form.due_date) < parseDateLocal(today())) newStatus = 'overdue';
      
      const result = await supabase.from('invoices').update({ due_date: form.due_date, amount, status: newStatus }).eq('id', editing.id);
      setBusy(false);
      if (result.error) return notify('Gagal update: ' + result.error.message);
      setOpen(false); setEditing(null);
      notify('Tagihan berhasil diupdate!');
      reload();
    } else {
      const count = Math.max(1, Math.min(24, Number(form.monthCount) || 1));
      const rows = [];
      for (let n = 0; n < count; n++) {
        const due = addMonthsDate(form.due_date, n);
        const amount = form.manualAmount ? getNum(form.amount) : autoAmount(t);
        const status = parseDateLocal(due) < parseDateLocal(today()) ? 'overdue' : 'unpaid';
        rows.push({ tenant_id: t.id, room_id: r.id, due_date: due, amount, status, paid_amount: 0 });
      }
      const result = await supabase.from('invoices').upsert(rows, { onConflict: 'tenant_id,due_date' });
      setBusy(false);
      if (result.error) return notify('Gagal simpan: ' + result.error.message);
      setOpen(false);
      notify(`✅ ${count} tagihan berhasil dibuat!`);
      reload();
    }
  };

  const editInvoice = i => {
    setEditing(i);
    const d = parseDateLocal(i.due_date);
    setForm({
      tenant_id: i.tenant_id,
      due_date: i.due_date,
      amount: String(i.amount),
      manualAmount: true,
      monthCount: 1,
      month_period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    });
    setOpen(true);
  };

  const deleteInvoice = async i => {
    const tName = tenants.find(t => t.id === i.tenant_id)?.full_name || 'Penghuni';
    if (!window.confirm(`Hapus tagihan ini untuk ${tName}?`)) return;
    setBusy(true);
    const { error } = await supabase.from('invoices').delete().eq('id', i.id);
    setBusy(false);
    if (error) return notify('Gagal hapus: ' + error.message);
    notify('Tagihan dihapus.');
    reload();
  };

  const tenantGroups = useMemo(() => {
    const grouped = invoices.reduce((acc, i) => {
      const key = `${i.tenant_id}::${i.room_id}`;
      if (!acc[key]) acc[key] = { tenant: tenants.find(t => t.id === i.tenant_id), room: rooms.find(r => r.id === i.room_id), items: [] };
      acc[key].items.push(i);
      return acc;
    }, {});
    return Object.values(grouped).filter(g => g.tenant && g.room);
  }, [invoices, tenants, rooms]);

  // 🔥 FILTER TAMPILAN MUTLAK
  const displayedGroups = useMemo(() => {
    return tenantGroups.filter(g => {
      const unpaidItems = g.items.filter(i => !isPaidOff(i));
      const paidItems = g.items.filter(i => isPaidOff(i));
      
      if (activeTab === 'unpaid') {
        return unpaidItems.length > 0; // Tampilkan grup HANYA jika ada yang belum lunas
      } else {
        return paidItems.length > 0; // Tampilkan grup HANYA jika ada yang sudah lunas
      }
    });
  }, [tenantGroups, activeTab]);

  const openPayment = g => {
    const unpaidItems = g.items.filter(i => !isPaidOff(i));
    const total = unpaidItems.reduce((s, i) => s + remain(i), 0);
    setSelectedGroup(g);
    setPaymentAmount(String(total));
    setPaymentOpen(true);
  };

  const recordPayment = async e => {
    e.preventDefault();
    const g = selectedGroup;
    const amount = getNum(paymentAmount);
    if (!g || amount <= 0) return notify('Nominal tidak valid.');
    
    let left = amount;
    const now = new Date().toISOString();
    setBusy(true);
    
    const unpaidSorted = [...g.items]
      .filter(i => !isPaidOff(i))
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
    
    for (const invoice of unpaidSorted) {
      if (left <= 0) break;
      const outstanding = remain(invoice);
      const applied = Math.min(left, outstanding);
      if (applied <= 0) continue;
      
      const newPaid = getNum(invoice.paid_amount) + applied;
      const isLunas = newPaid >= getNum(invoice.amount);
      const newStatus = isLunas ? 'paid' : (overdueDays(invoice.due_date) > 0 ? 'overdue' : 'unpaid');
      
      const { error: invErr } = await supabase.from('invoices')
        .update({ paid_amount: newPaid, status: newStatus, paid_at: isLunas ? now : null })
        .eq('id', invoice.id);
      
      if (invErr) { setBusy(false); return notify(invErr.message); }
      
      const property = properties.find(p => p.id === g.room?.property_id) || properties[0];
      await supabase.from('transactions').insert({
        property_id: property?.id,
        invoice_id: invoice.id,
        category: 'Sewa Kamar',
        description: `Pembayaran ${g.tenant?.full_name} · Kamar ${g.room?.room_number}`,
        amount: applied,
        transaction_date: today()
      });
      
      left -= applied;
    }
    
    setBusy(false);
    setPaymentOpen(false);
    setPaymentAmount('');
    reload();
    notify(`✅ Pembayaran ${rupiah(amount - left)} berhasil dicatat!`);
    setMessageType('paid');
    setMessage(`Halo ${g.tenant?.full_name}, pembayaran ${rupiah(amount - left)} untuk Kamar ${g.room?.room_number} sudah kami terima. Status: LUNAS ✅. Terima kasih!`);
    setMessageOpen(true);
  };

  const openMessage = (g, type) => {
    setSelectedGroup(g);
    setMessageType(type);
    if (type === 'receipt') {
      setMessage(`Halo ${g.tenant?.full_name}, pembayaran untuk Kamar ${g.room?.room_number} sudah kami terima. Status: LUNAS ✅. Terima kasih!`);
    } else {
      const unpaidItems = g.items.filter(i => !isPaidOff(i)).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
      const lines = unpaidItems.map(i => `${new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(parseDateLocal(i.due_date))} - ${rupiah(remain(i))}`).join('\n');
      setMessage(`Halo ${g.tenant?.full_name},\n\nTagihan belum lunas:\n${lines}\n\nTotal: ${rupiah(unpaidItems.reduce((s, i) => s + remain(i), 0))}\n\nMohon segera melakukan pembayaran. Terima kasih.`);
    }
    setMessageOpen(true);
  };

  const sendWhatsApp = async () => {
    const t = selectedGroup?.tenant;
    if (!t?.whatsapp_number) return notify('Nomor WA tidak ada.');
    const cleanNumber = t.whatsapp_number.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`, '_blank');
    
    if (messageType === 'reminder') {
      const activeIds = selectedGroup.items.filter(i => !isPaidOff(i)).map(i => i.id);
      if (activeIds.length) {
        await supabase.from('invoices').update({ collection_status: 'contacted', last_contacted_at: new Date().toISOString() }).in('id', activeIds);
        reload();
      }
    }
    setMessageOpen(false);
  };

  return (
    <section className="module-full">
      <div className="module-toolbar">
        <div><h2>Manajemen Penagihan</h2><p>Kelola tagihan, bayar, dan kirim WA.</p></div>
        <button className="add-button" type="button" onClick={() => { setEditing(null); setForm({ tenant_id: '', due_date: today(), amount: '', manualAmount: false, monthCount: 1, month_period: defaultMonthPeriod() }); setOpen(true); }}>
          <ReceiptText size={17} /> Buat Tagihan
        </button>
      </div>

      <div className="billing-filter" style={{ marginBottom: '1rem' }}>
        <button className={activeTab === 'unpaid' ? 'active' : ''} onClick={() => setActiveTab('unpaid')}>🔴 Belum Lunas</button>
        <button className={activeTab === 'paid' ? 'active' : ''} onClick={() => setActiveTab('paid')}>✅ Sudah Lunas</button>
      </div>

      {open && (
        <form className="edit-card" onSubmit={saveInvoice}>
          <h3>{editing ? 'Edit Tagihan' : 'Buat Tagihan Baru'}</h3>
          <div className="form-grid">
            <label>Pilih Penghuni
              <select value={form.tenant_id} onChange={e => {
                const t = tenants.find(x => x.id === e.target.value);
                setForm(f => ({ ...f, tenant_id: e.target.value, due_date: getCalculatedDueDate(e.target.value, f.month_period), amount: t && !f.manualAmount ? String(autoAmount(t)) : f.amount }));
              }} required>
                <option value="">Pilih penghuni</option>
                {tenants.filter(t => t.room_id).map(t => <option key={t.id} value={t.id}>{t.full_name} (Kamar {rooms.find(r => r.id === t.room_id)?.room_number || '-'})</option>)}
              </select>
            </label>
            {!editing ? (
              <>
                <label>Bulan Mulai<input type="month" value={form.month_period} onChange={e => setForm(f => ({ ...f, month_period: e.target.value, due_date: getCalculatedDueDate(f.tenant_id, e.target.value) }))} required /></label>
                <label>Jumlah Bulan<input type="number" min="1" max="24" value={form.monthCount} onChange={e => set('monthCount', e.target.value)} required /></label>
              </>
            ) : (
              <label>Tanggal Jatuh Tempo<input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} required /></label>
            )}
            <label className="flex flex-col">
              <span className="flex justify-between"><span>Nominal</span><button type="button" className="text-xs text-blue-500 underline" onClick={() => set('manualAmount', !form.manualAmount)}>{form.manualAmount ? 'Otomatis' : 'Kustom'}</button></span>
              <MoneyInput value={form.amount} onChange={val => { set('amount', val); set('manualAmount', true); }} required />
            </label>
          </div>
          <div className="form-actions mt-4">
            <button type="submit" className="primary" disabled={busy}><Save size={15} /> {editing ? 'Update' : 'Simpan'}</button>
            <button type="button" onClick={() => { setOpen(false); setEditing(null); }}>Batal</button>
          </div>
        </form>
      )}

      {displayedGroups.length === 0 ? (
        <div className="empty panel">Tidak ada data di kategori ini.</div>
      ) : (
        <div className="billing-room-list">
          {displayedGroups.map(g => {
            // 🔥 INI KUNCINYA: Filter item secara mutlak berdasarkan tab
            const itemsToShow = activeTab === 'unpaid' ? g.items.filter(i => !isPaidOff(i)) : g.items.filter(i => isPaidOff(i));
            const totalToShow = itemsToShow.reduce((s, i) => s + (activeTab === 'unpaid' ? remain(i) : getNum(i.amount)), 0);
            
            return (
              <div className={`billing-room-card ${activeTab === 'unpaid' ? 'is-pending' : 'is-paid'}`} key={`${g.tenant?.id}-${g.room?.id}`}>
                <div className="billing-room-head">
                  <div>
                    <b>Kamar {g.room?.room_number || '-'} · {g.tenant?.full_name}</b>
                    <small>{activeTab === 'unpaid' ? `${itemsToShow.length} periode belum lunas` : '✅ Semua periode sudah lunas'}</small>
                  </div>
                  <strong>{rupiah(totalToShow)}</strong>
                </div>
                
                <div className="billing-details">
                  {itemsToShow.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))).map(invoice => {
                    const sisa = remain(invoice);
                    const isLunas = isPaidOff(invoice);
                    return (
                      <div className="billing-detail" key={invoice.id} style={{ opacity: isLunas ? 0.6 : 1, borderLeft: isLunas ? '4px solid green' : '4px solid red' }}>
                        <span>{new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(parseDateLocal(invoice.due_date))}</span>
                        <b>{rupiah(isLunas ? getNum(invoice.amount) : sisa)}</b>
                        <small>
                          {isLunas ? '✅ LUNAS' : `Sisa: ${rupiah(sisa)}`}
                          {/* Debug text kecil untuk memastikan */}
                          <span style={{fontSize: '10px', color: '#888', marginLeft: '8px'}}>(Status: {invoice.status}, Paid: {invoice.paid_amount})</span>
                        </small>
                        {activeTab === 'unpaid' && (
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => editInvoice(invoice)} className="p-1 hover:bg-gray-100 rounded"><Pencil size={13} /></button>
                            <button type="button" onClick={() => deleteInvoice(invoice)} className="p-1 hover:bg-red-50 text-red-500 rounded"><Trash2 size={13} /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                <div className="billing-room-actions">
                  {activeTab === 'unpaid' ? (
                    <>
                      <button className="primary" type="button" onClick={() => openMessage(g, 'reminder')}><MessageCircle size={15} /> Kirim WA</button>
                      <button className="secondary-button" type="button" onClick={() => openPayment(g)}><CheckCircle2 size={15} /> Catat Bayar</button>
                    </>
                  ) : (
                    <button className="success-button" type="button" onClick={() => openMessage(g, 'receipt')}><CheckCircle2 size={15} /> WA Konfirmasi</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Pembayaran */}
      {paymentOpen && selectedGroup && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={recordPayment}>
            <button type="button" className="modal-close" onClick={() => setPaymentOpen(false)}><X /></button>
            <h3>Catat Pembayaran</h3>
            <p className="text-sm mb-4">{selectedGroup.tenant?.full_name} · Kamar {selectedGroup.room?.room_number}</p>
            <label>Nominal Diterima (IDR)<MoneyInput value={paymentAmount} onChange={setPaymentAmount} required /></label>
            <div className="form-actions mt-4">
              <button type="submit" className="primary" disabled={busy}><CheckCircle2 size={15} /> Simpan</button>
              <button type="button" onClick={() => setPaymentOpen(false)}>Batal</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal WhatsApp */}
      {messageOpen && selectedGroup && (
        <div className="modal-backdrop">
          <div className="modal">
            <button type="button" className="modal-close" onClick={() => setMessageOpen(false)}><X /></button>
            <h3>{messageType === 'paid' ? 'Konfirmasi Lunas' : 'Pesan Tagihan'}</h3>
            <textarea className="w-full font-mono text-sm border p-3 rounded bg-gray-50" value={message} onChange={e => setMessage(e.target.value)} rows={10} />
            <div className="form-actions mt-4">
              <button className="primary" type="button" onClick={sendWhatsApp}><MessageCircle size={15} /> Buka WhatsApp</button>
              <button type="button" onClick={() => setMessageOpen(false)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
