import React, { useState, useMemo } from 'react';
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
  
  // 🔥 SIMPEL: Hanya 2 tab - Belum Lunas & Sudah Lunas
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
  const remain = i => Math.max(0, Number(i.amount || 0) - Number(i.paid_amount || 0));
  const autoAmount = t => Number(roomFor(t)?.monthly_rate || 0);

  // 🔥 FUNGSI SIMPAN TAGIHAN (DIPERBAIKI)
  const saveInvoice = async e => {
    e.preventDefault();
    const t = tenants.find(x => x.id === form.tenant_id);
    const r = roomFor(t);
    if (!t || !r) return notify('Pilih penghuni yang sudah punya kamar.');
    
    setBusy(true);
    
    if (editing) {
      // Edit single invoice
      const amount = form.manualAmount ? Number(form.amount) : autoAmount(t);
      const paidAmount = Number(editing.paid_amount || 0);
      let newStatus = 'unpaid';
      if (paidAmount >= amount) newStatus = 'paid';
      else if (parseDateLocal(form.due_date) < parseDateLocal(today())) newStatus = 'overdue';
      
      const result = await supabase.from('invoices')
        .update({ due_date: form.due_date, amount, status: newStatus })
        .eq('id', editing.id);
      
      setBusy(false);
      if (result.error) return notify('Gagal update: ' + result.error.message);
      setOpen(false);
      setEditing(null);
      notify('Tagihan berhasil diupdate!');
      reload();
    } else {
      // Create new invoices (multi-bulan)
      const count = Math.max(1, Math.min(24, Number(form.monthCount) || 1));
      const rows = [];
      for (let n = 0; n < count; n++) {
        const due = addMonthsDate(form.due_date, n);
        const amount = form.manualAmount ? Number(form.amount) : autoAmount(t);
        const status = parseDateLocal(due) < parseDateLocal(today()) ? 'overdue' : 'unpaid';
        rows.push({
          tenant_id: t.id,
          room_id: r.id,
          due_date: due,
          amount,
          status,
          paid_amount: 0
        });
      }
      
      const result = await supabase.from('invoices').upsert(rows, {
        onConflict: 'tenant_id,due_date'
      });
      
      setBusy(false);
      if (result.error) return notify('Gagal simpan: ' + result.error.message);
      
      // Clear from deleted list
      try {
        let deletedList = JSON.parse(localStorage.getItem('kos_deleted_invoices') || '[]');
        const keysToClear = rows.map(row => `${t.id}::${row.due_date}`);
        deletedList = deletedList.filter(k => !keysToClear.includes(k));
        localStorage.setItem('kos_deleted_invoices', JSON.stringify(deletedList));
      } catch (e) { console.warn(e); }
      
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
    const periodLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(parseDateLocal(i.due_date));
    if (!window.confirm(`Hapus tagihan ${periodLabel} untuk ${tName}?`)) return;
    
    setBusy(true);
    const { error } = await supabase.from('invoices').delete().eq('id', i.id);
    setBusy(false);
    if (error) return notify('Gagal hapus: ' + error.message);
    
    try {
      const deletedList = JSON.parse(localStorage.getItem('kos_deleted_invoices') || '[]');
      const key = `${i.tenant_id}::${i.due_date}`;
      if (!deletedList.includes(key)) {
        deletedList.push(key);
        localStorage.setItem('kos_deleted_invoices', JSON.stringify(deletedList));
      }
    } catch (e) { console.warn(e); }
    
    notify('Tagihan dihapus.');
    reload();
  };

  // 🔥 GROUPING LEBIH SIMPLE
  const tenantGroups = useMemo(() => {
    const grouped = invoices.reduce((acc, i) => {
      const key = `${i.tenant_id}::${i.room_id}`;
      if (!acc[key]) {
        acc[key] = {
          tenant: tenants.find(t => t.id === i.tenant_id),
          room: rooms.find(r => r.id === i.room_id),
          items: []
        };
      }
      acc[key].items.push(i);
      return acc;
    }, {});
    return Object.values(grouped).filter(g => g.tenant && g.room);
  }, [invoices, tenants, rooms]);

  const unpaidInvoices = useMemo(() => invoices.filter(i => i.status !== 'paid'), [invoices]);
  const totalTunggakan = useMemo(() => unpaidInvoices.reduce((s, i) => s + remain(i), 0), [unpaidInvoices]);
  const overdueInvoices = useMemo(() => unpaidInvoices.filter(i => overdueDays(i.due_date) > 0), [unpaidInvoices]);
  const totalTerlambat = useMemo(() => overdueInvoices.reduce((s, i) => s + remain(i), 0), [overdueInvoices]);

  // 🔥 FILTER SIMPLE: unpaid vs paid
  const displayedGroups = useMemo(() => {
    return tenantGroups.filter(g => {
      const activeItems = g.items.filter(i => i.status !== 'paid');
      const outstandingSum = activeItems.reduce((s, i) => s + remain(i), 0);
      if (activeTab === 'unpaid') return outstandingSum > 0;
      return outstandingSum === 0;
    });
  }, [tenantGroups, activeTab]);

  const openPayment = g => {
    const activeItems = g.items.filter(i => i.status !== 'paid');
    const total = activeItems.reduce((s, i) => s + remain(i), 0);
    setSelectedGroup(g);
    setPaymentAmount(String(total));
    setPaymentOpen(true);
  };

  const recordPayment = async e => {
    e.preventDefault();
    const g = selectedGroup;
    const amount = Number(paymentAmount);
    if (!g || amount <= 0) return notify('Nominal tidak valid.');
    
    let left = amount;
    const now = new Date().toISOString();
    setBusy(true);
    
    // FIFO: bayar dari yang paling lama dulu
    const unpaidSorted = [...g.items]
      .filter(i => i.status !== 'paid')
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
    
    for (const invoice of unpaidSorted) {
      if (left <= 0) break;
      const outstanding = remain(invoice);
      const applied = Math.min(left, outstanding);
      if (applied <= 0) continue;
      
      const newPaid = Number(invoice.paid_amount || 0) + applied;
      const isLunas = newPaid >= Number(invoice.amount || 0);
      const newStatus = isLunas ? 'paid' : (overdueDays(invoice.due_date) > 0 ? 'overdue' : 'unpaid');
      
      const { error: invErr } = await supabase.from('invoices')
        .update({ paid_amount: newPaid, status: newStatus, paid_at: isLunas ? now : null })
        .eq('id', invoice.id);
      
      if (invErr) {
        setBusy(false);
        return notify(invErr.message);
      }
      
      const property = properties.find(p => p.id === g.room?.property_id) || properties[0];
      const tx = {
        property_id: property?.id,
        invoice_id: invoice.id,
        category: 'Sewa Kamar',
        description: `Pembayaran ${g.tenant?.full_name || 'Penghuni'} · Kamar ${g.room?.room_number || '-'}`,
        amount: applied,
        transaction_date: today()
      };
      
      const { error: txErr } = await supabase.from('transactions').insert(tx);
      if (txErr) {
        setBusy(false);
        return notify(txErr.message);
      }
      
      left -= applied;
    }
    
    setBusy(false);
    setPaymentOpen(false);
    setPaymentAmount('');
    reload();
    
    const totalPaidActual = amount - left;
    notify(`✅ Pembayaran ${rupiah(totalPaidActual)} berhasil dicatat!`);
    
    // Open WA receipt
    setMessageType('paid');
    setMessage(buildPaidMessage(g, totalPaidActual));
    setMessageOpen(true);
  };

  const buildPenagihanMessage = g => {
    const prop = properties.find(p => p.id === g.room?.property_id) || properties[0];
    const unpaidItems = g.items
      .filter(i => i.status !== 'paid')
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
    
    const lines = unpaidItems.map(i => {
      const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(parseDateLocal(i.due_date));
      const remainingAmount = remain(i);
      const isOverdue = overdueDays(i.due_date) > 0;
      return `${monthLabel} - ${rupiah(remainingAmount)}${isOverdue ? ` (Terlambat ${overdueDays(i.due_date)} hari)` : ''}`;
    }).join('\n');
    
    const totalOutstanding = unpaidItems.reduce((s, i) => s + remain(i), 0);
    const totalBillOriginal = unpaidItems.reduce((s, i) => s + Number(i.amount || 0), 0);
    const totalAlreadyPaid = unpaidItems.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
    
    let partialDetails = `\nTotal tagihan: ${rupiah(totalOutstanding)}\n`;
    if (totalAlreadyPaid > 0) {
      partialDetails = `\nTotal tagihan: ${rupiah(totalBillOriginal)}\nSudah dibayar: ${rupiah(totalAlreadyPaid)}\nSisa: ${rupiah(totalOutstanding)}\n`;
    }
    
    const paymentText = [
      prop?.payment_bca && `BCA: ${prop.payment_bca}`,
      prop?.payment_dana && `DANA: ${prop.payment_dana}`,
      prop?.payment_gopay && `GoPay/ShopeePay: ${prop.payment_gopay}`,
      prop?.payment_name && `a.n. ${prop.payment_name}`
    ].filter(Boolean).join('\n') || 'BCA: 0571288191\nDANA: 08816585970\nGoPay: 085161174317\na.n. Ryan Putra Pratama';
    
    return `Halo ${g.tenant?.full_name || ''},

Kami ingatkan tagihan sewa kos yang belum dilunasi.

Properti: ${prop?.name || 'Kos'}
Kamar: ${g.room?.room_number || ''}

PERIODE:
${lines}

${partialDetails}

Pembayaran:
${paymentText}

Mohon konfirmasi setelah bayar. Terima kasih 🙏`;
  };

  const buildPaidMessage = (g, paidAmount) => {
    const prop = properties.find(p => p.id === g.room?.property_id) || properties[0];
    const remainingOutstanding = g.items.filter(i => i.status !== 'paid').reduce((s, i) => s + remain(i), 0);
    return `Halo ${g.tenant?.full_name || ''},

Pembayaran kos sudah kami terima:

Properti: ${prop?.name || 'Kos'}
Kamar: ${g.room?.room_number || ''}

Jumlah: ${rupiah(paidAmount)}
Status: LUNAS ✅

${remainingOutstanding > 0 ? `Sisa Tagihan: ${rupiah(remainingOutstanding)}` : 'Terima kasih atas pembayaran Anda!'}

Terima kasih 🙏`;
  };

  const openMessage = (g, type) => {
    setSelectedGroup(g);
    setMessageType(type);
    if (type === 'receipt') {
      const lastPaid = [...g.items]
        .filter(i => i.status === 'paid' && i.paid_at)
        .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)))[0];
      const paidAmount = lastPaid ? lastPaid.amount : 0;
      setMessage(buildPaidMessage(g, paidAmount));
    } else {
      setMessage(buildPenagihanMessage(g));
    }
    setMessageOpen(true);
  };

  const sendWhatsApp = async () => {
    const t = selectedGroup?.tenant;
    if (!t?.whatsapp_number || t.whatsapp_number.trim() === '') {
      return notify('Nomor WA tidak ada.');
    }
    const cleanNumber = t.whatsapp_number.replace(/\D/g, '');
    if (!cleanNumber) return notify('Nomor WA tidak valid.');
    
    const waUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    
    if (messageType === 'reminder') {
      const activeIds = selectedGroup.items.filter(i => i.status !== 'paid').map(i => i.id);
      if (activeIds.length) {
        await supabase.from('invoices')
          .update({ collection_status: 'contacted', last_contacted_at: new Date().toISOString() })
          .in('id', activeIds);
        reload();
      }
    }
    setMessageOpen(false);
  };

  return (
    <section className="module-full" id="billing-manager">
      <div className="module-toolbar">
        <div>
          <h2>Manajemen Penagihan</h2>
          <p>Buat tagihan, catat pembayaran, kirim WA.</p>
        </div>
        <div className="toolbar-actions">
          <button
            className="add-button"
            type="button"
            onClick={() => {
              setEditing(null);
              setForm({
                tenant_id: '',
                due_date: today(),
                amount: '',
                manualAmount: false,
                monthCount: 1,
                month_period: defaultMonthPeriod()
              });
              setOpen(true);
            }}
          >
            <ReceiptText size={17} /> Buat Tagihan
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="billing-summary" id="billing-summary">
        <div>
          <small>Total Tunggakan</small>
          <b>{rupiah(totalTunggakan)}</b>
        </div>
        <div>
          <small>Tunggakan Terlambat</small>
          <b className="text-red-500">{rupiah(totalTerlambat)}</b>
        </div>
        <div>
          <small>Jumlah Invoice Belum Lunas</small>
          <b>{unpaidInvoices.length}</b>
        </div>
      </div>

      {/* 🔥 TAB SIMPLE: Belum Lunas & Sudah Lunas */}
      <div className="billing-filter" id="billing-tab-filters">
        <button className={activeTab === 'unpaid' ? 'active' : ''} onClick={() => setActiveTab('unpaid')}>
          🔴 Belum Lunas ({unpaidInvoices.length})
        </button>
        <button className={activeTab === 'paid' ? 'active' : ''} onClick={() => setActiveTab('paid')}>
          ✅ Sudah Lunas
        </button>
      </div>

      {/* Form Buat Tagihan */}
      {open && (
        <form className="edit-card" onSubmit={saveInvoice} id="billing-form">
          <h3>{editing ? 'Edit Tagihan' : 'Buat Tagihan Baru'}</h3>
          <div className="form-grid">
            <label htmlFor="invoice-tenant">
              Pilih Penghuni
              <select
                id="invoice-tenant"
                value={form.tenant_id}
                onChange={e => {
                  const tenantId = e.target.value;
                  const tenant = tenants.find(x => x.id === tenantId);
                  const calculatedDue = getCalculatedDueDate(tenantId, form.month_period);
                  setForm(f => ({
                    ...f,
                    tenant_id: tenantId,
                    due_date: calculatedDue,
                    amount: tenant && !f.manualAmount ? String(autoAmount(tenant)) : f.amount
                  }));
                }}
                required
              >
                <option value="">Pilih penghuni</option>
                {tenants.filter(t => t.room_id).map(t => {
                  const r = rooms.find(room => room.id === t.room_id);
                  return (
                    <option key={t.id} value={t.id}>
                      {t.full_name} (Kamar {r?.room_number || '-'})
                    </option>
                  );
                })}
              </select>
            </label>
            
            {!editing ? (
              <>
                <label htmlFor="invoice-period">
                  Bulan Mulai
                  <input
                    id="invoice-period"
                    type="month"
                    value={form.month_period}
                    onChange={e => {
                      const ym = e.target.value;
                      setForm(f => ({
                        ...f,
                        month_period: ym,
                        due_date: getCalculatedDueDate(f.tenant_id, ym)
                      }));
                    }}
                    required
                  />
                </label>
                <label htmlFor="invoice-count">
                  Jumlah Bulan
                  <input
                    id="invoice-count"
                    type="number"
                    min="1"
                    max="24"
                    value={form.monthCount}
                    onChange={e => set('monthCount', e.target.value)}
                    required
                  />
                </label>
              </>
            ) : (
              <label htmlFor="invoice-due">
                Tanggal Jatuh Tempo
                <input
                  id="invoice-due"
                  type="date"
                  value={form.due_date}
                  onChange={e => set('due_date', e.target.value)}
                  required
                />
              </label>
            )}
            
            <label htmlFor="invoice-amount" className="flex flex-col">
              <span className="flex justify-between items-center">
                Nominal
                <button
                  type="button"
                  className="text-xs text-blue-500 underline"
                  onClick={() => set('manualAmount', !form.manualAmount)}
                >
                  {form.manualAmount ? 'Pakai Tarif Otomatis' : 'Ubah Nominal'}
                </button>
              </span>
              <MoneyInput
                id="invoice-amount"
                value={form.amount}
                onChange={val => {
                  set('amount', val);
                  set('manualAmount', true);
                }}
                required
              />
            </label>
          </div>
          
          {previewDates.length > 0 && (
            <div className="mt-3 text-xs text-blue-800 bg-blue-50 border border-blue-200 p-3 rounded">
              <span className="font-semibold block mb-1">📅 Tanggal Jatuh Tempo ({previewDates.length} bulan):</span>
              <div className="flex flex-wrap gap-1">
                {previewDates.map(d => {
                  const formatted = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(parseDateLocal(d));
                  return (
                    <span key={d} className="bg-white border text-blue-700 px-2 py-0.5 rounded text-[11px]">
                      {formatted}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          
          <div className="form-actions mt-4">
            <button type="submit" className="primary" disabled={busy}>
              <Save size={15} /> {editing ? 'Update' : 'Simpan'} Tagihan
            </button>
            <button type="button" onClick={() => { setOpen(false); setEditing(null); }}>
              Batal
            </button>
          </div>
        </form>
      )}

      {/* List Tagihan */}
      {displayedGroups.length === 0 ? (
        <div className="empty panel">Tidak ada tagihan.</div>
      ) : (
        <div className="billing-room-list" id="billing-room-list">
          {displayedGroups.map(g => {
            const activeItems = g.items.filter(i => i.status !== 'paid');
            const totalOutstanding = activeItems.reduce((s, i) => s + remain(i), 0);
            const hasOverdue = activeItems.some(i => overdueDays(i.due_date) > 0);
            
            return (
              <div
                className={`billing-room-card ${totalOutstanding > 0 ? (hasOverdue ? 'is-overdue' : 'is-pending') : 'is-paid'}`}
                key={`${g.tenant?.id}-${g.room?.id}`}
              >
                <div className="billing-room-head">
                  <div>
                    <b>Kamar {g.room?.room_number || '-'} · {g.tenant?.full_name || 'Penghuni'}</b>
                    <small>
                      {totalOutstanding > 0
                        ? `${activeItems.length} bulan belum lunas${hasOverdue ? ' · ⚠️ Terlambat' : ''}`
                        : '✅ Lunas'}
                    </small>
                  </div>
                  <strong>{rupiah(totalOutstanding)}</strong>
                </div>
                
                {activeItems.length > 0 && (
                  <div className="billing-details">
                    {activeItems
                      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
                      .map(invoice => {
                        const daysLate = overdueDays(invoice.due_date);
                        return (
                          <div className="billing-detail" key={invoice.id}>
                            <span>
                              {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(parseDateLocal(invoice.due_date))}
                            </span>
                            <b>{rupiah(remain(invoice))}</b>
                            <small>
                              {Number(invoice.paid_amount || 0) > 0
                                ? `Dibayar: ${rupiah(invoice.paid_amount)}`
                                : daysLate > 0
                                  ? `⚠️ Terlambat ${daysLate} hari`
                                  : 'Menunggu'}
                            </small>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => editInvoice(invoice)} title="Edit" className="p-1 hover:bg-gray-100 rounded">
                                <Pencil size={13} />
                              </button>
                              <button type="button" onClick={() => deleteInvoice(invoice)} title="Hapus" className="p-1 hover:bg-red-50 text-red-500 rounded">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
                
                <div className="billing-room-actions">
                  {totalOutstanding > 0 ? (
                    <>
                      <button className="primary" type="button" onClick={() => openMessage(g, 'reminder')}>
                        <MessageCircle size={15} /> Kirim WA
                      </button>
                      <button className="secondary-button" type="button" onClick={() => openPayment(g)}>
                        <CheckCircle2 size={15} /> Catat Bayar
                      </button>
                    </>
                  ) : (
                    <button className="success-button" type="button" onClick={() => openMessage(g, 'receipt')}>
                      <CheckCircle2 size={15} /> WA Konfirmasi Lunas
                    </button>
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
            <button type="button" className="modal-close" onClick={() => setPaymentOpen(false)}>
              <X />
            </button>
            <h3>Catat Pembayaran</h3>
            <p className="text-sm mb-4">
              {selectedGroup.tenant?.full_name} · Kamar {selectedGroup.room?.room_number}
            </p>
            <label htmlFor="payout-amount">
              Nominal Diterima (IDR)
              <MoneyInput
                id="payout-amount"
                value={paymentAmount}
                onChange={setPaymentAmount}
                required
              />
            </label>
            <div className="alert-notice bg-blue-50 border border-blue-200 p-3 rounded text-xs text-blue-800 mt-3">
              💡 Pembayaran akan otomatis melunasi tagihan paling lama dulu (FIFO).
            </div>
            <div className="form-actions mt-4">
              <button type="submit" className="primary" disabled={busy}>
                <CheckCircle2 size={15} /> Simpan Pembayaran
              </button>
              <button type="button" onClick={() => setPaymentOpen(false)}>
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal WhatsApp */}
      {messageOpen && selectedGroup && (
        <div className="modal-backdrop">
          <div className="modal">
            <button type="button" className="modal-close" onClick={() => setMessageOpen(false)}>
              <X />
            </button>
            <h3>{messageType === 'paid' ? 'Konfirmasi Lunas' : 'Pesan Tagihan WA'}</h3>
            <p className="text-xs text-gray-500 mb-2">
              Ke: {selectedGroup.tenant?.whatsapp_number || 'Tidak ada nomor'}
            </p>
            <textarea
              className="w-full font-mono text-sm border p-3 rounded bg-gray-50 focus:outline-none"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={15}
            />
            <div className="form-actions mt-4">
              <button className="primary" type="button" onClick={sendWhatsApp}>
                <MessageCircle size={15} /> Buka WhatsApp
              </button>
              <button type="button" onClick={() => setMessageOpen(false)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
