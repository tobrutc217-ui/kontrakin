import React, { useState, useEffect, useMemo } from 'react';
import { Pencil, MessageCircle, CheckCircle2, X, Save, ReceiptText, AlertTriangle, Trash2 } from 'lucide-react';
import { supabase } from '../supabase';
import { rupiah, today, parseDateLocal, overdueDays, addMonthsDate, monthDueDate } from '../utils';
import { MoneyInput } from './MoneyInput';

export function InvoiceManager({ tenants, rooms, invoices, properties, reload, notify }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  // WhatsApp Message Modals
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageType, setMessageType] = useState('reminder');
  const [message, setMessage] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);

  // Payment Recording Modals
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');

  // Filtering Tabs
  const [activeTab, setActiveTab] = useState('pending');

  // 🔥 HELPER: Parse angka dengan aman (menghapus titik/koma agar tidak jadi NaN)
  const parseSafeNumber = (val) => Number(String(val || '').replace(/\D/g, '')) || 0;

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
    
    const periodYm = monthPeriodStr || defaultMonthPeriod();
    const parts = periodYm.split('-');
    const year = Number(parts[0]) || new Date().getFullYear();
    const month = Number(parts[1]) || (new Date().getMonth() + 1);
    
    let billingDay = 1;
    if (t.billing_day && !isNaN(Number(t.billing_day))) {
      billingDay = Number(t.billing_day);
    } else if (t.lease_start) {
      const start = parseDateLocal(t.lease_start);
      if (start && !isNaN(start.getTime())) {
        billingDay = start.getDate();
      }
    }
    
    return monthDueDate(year, month - 1, billingDay);
  };

  const previewDates = useMemo(() => {
    if (!form.tenant_id || !form.month_period) return [];
    const t = tenants.find(x => x.id === form.tenant_id);
    if (!t) return [];
    
    const count = Math.max(1, Math.min(24, Number(form.monthCount) || 1));
    const dates = [];
    const startCalculatedDue = getCalculatedDueDate(form.tenant_id, form.month_period);
    
    for (let n = 0; n < count; n++) {
      dates.push(addMonthsDate(startCalculatedDue, n));
    }
    return dates;
  }, [form.tenant_id, form.month_period, form.monthCount, tenants]);

  const roomFor = t => rooms.find(r => r.id === t?.room_id);
  const remain = i => Math.max(0, parseSafeNumber(i.amount) - parseSafeNumber(i.paid_amount));
  const autoAmount = t => parseSafeNumber(roomFor(t)?.monthly_rate);

  // 🔥 SIMPAN TAGIHAN (DIPERBAIKI DENGAN TRY/CATCH & SAFE NUMBER)
  const saveInvoice = async e => {
    e.preventDefault();
    const t = tenants.find(x => x.id === form.tenant_id);
    const r = roomFor(t);

    if (!t || !r) {
      return notify('Silakan pilih penghuni yang sudah memiliki kamar.');
    }

    setBusy(true);

    try {
      const { data: existing, error: fetchErr } = await supabase
        .from('invoices')
        .select('*')
        .eq('tenant_id', t.id);

      if (fetchErr) throw new Error(fetchErr.message);

      const count = Math.max(1, Math.min(24, Number(form.monthCount) || 1));
      const rows = [];

      if (editing) {
        const amount = form.manualAmount ? parseSafeNumber(form.amount) : autoAmount(t);
        const paidAmount = parseSafeNumber(editing.paid_amount);
        const remainAmount = Math.max(0, amount - paidAmount);
        
        let newStatus = 'unpaid';
        if (remainAmount === 0) newStatus = 'paid';
        else if (parseDateLocal(form.due_date) < parseDateLocal(today())) newStatus = 'overdue';

        const { error: updateErr } = await supabase.from('invoices')
          .update({ due_date: form.due_date, amount, status: newStatus })
          .eq('id', editing.id);

        if (updateErr) throw new Error(updateErr.message);

        try {
          let deletedList = JSON.parse(localStorage.getItem('kos_deleted_invoices') || '[]');
          const keyToClear = `${editing.tenant_id}::${form.due_date}`;
          deletedList = deletedList.filter(k => k !== keyToClear);
          localStorage.setItem('kos_deleted_invoices', JSON.stringify(deletedList));
        } catch (e) { console.warn(e); }

      } else {
        const clearedKeys = [];
        for (let n = 0; n < count; n++) {
          const due = addMonthsDate(form.due_date, n);
          const amount = form.manualAmount ? parseSafeNumber(form.amount) : autoAmount(t);
          clearedKeys.push(`${t.id}::${due}`);
          
          const ext = (existing || []).find(i => i.due_date === due);
          
          if (ext) {
            const paidAmount = parseSafeNumber(ext.paid_amount);
            const remainAmount = Math.max(0, amount - paidAmount);
            let newStatus = 'unpaid';
            if (remainAmount === 0) newStatus = 'paid';
            else if (parseDateLocal(due) < parseDateLocal(today())) newStatus = 'overdue';

            rows.push({ tenant_id: t.id, room_id: r.id, due_date: due, amount, status: newStatus, paid_amount: paidAmount });
          } else {
            rows.push({
              tenant_id: t.id,
              room_id: r.id,
              due_date: due,
              amount,
              status: parseDateLocal(due) < parseDateLocal(today()) ? 'overdue' : 'unpaid',
              paid_amount: 0
            });
          }
        }

        const { error: upsertErr } = await supabase.from('invoices').upsert(rows, {
          onConflict: 'tenant_id,due_date'
        });

        if (upsertErr) throw new Error(upsertErr.message);

        try {
          let deletedList = JSON.parse(localStorage.getItem('kos_deleted_invoices') || '[]');
          deletedList = deletedList.filter(k => !clearedKeys.includes(k));
          localStorage.setItem('kos_deleted_invoices', JSON.stringify(deletedList));
        } catch (e) { console.warn(e); }
      }

      setOpen(false);
      setEditing(null);
      notify(editing ? 'Tagihan berhasil diperbarui.' : `${count} periode tagihan berhasil ditambahkan.`);
      reload();
    } catch (err) {
      console.error('Save Invoice Error:', err);
      notify('Gagal menyimpan tagihan: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const editInvoice = i => {
    setEditing(i);
    const d = parseDateLocal(i.due_date);
    const yyyyMm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setForm({
      tenant_id: i.tenant_id,
      due_date: i.due_date,
      amount: String(i.amount),
      manualAmount: true,
      monthCount: 1,
      month_period: yyyyMm
    });
    setOpen(true);
  };

  const deleteInvoice = async i => {
    const tName = tenants.find(t => t.id === i.tenant_id)?.full_name || 'Penghuni';
    const periodLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(parseDateLocal(i.due_date));
    if (!window.confirm(`Apakah Anda yakin ingin menghapus tagihan periode ${periodLabel} untuk ${tName}? Tindakan ini bersifat permanen.`)) {
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('invoices').delete().eq('id', i.id);
    setBusy(false);
    if (error) return notify('Gagal menghapus tagihan: ' + error.message);

    try {
      const deletedList = JSON.parse(localStorage.getItem('kos_deleted_invoices') || '[]');
      const key = `${i.tenant_id}::${i.due_date}`;
      if (!deletedList.includes(key)) {
        deletedList.push(key);
        localStorage.setItem('kos_deleted_invoices', JSON.stringify(deletedList));
      }
    } catch (e) { console.warn('Gagal mencatat invoice terhapus:', e); }

    notify('Tagihan berhasil dihapus.');
    reload();
  };

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
  const needToBillInvoices = useMemo(() => unpaidInvoices.filter(i => i.collection_status !== 'contacted'), [unpaidInvoices]);
  const totalNeedToBill = useMemo(() => needToBillInvoices.reduce((s, i) => s + remain(i), 0), [needToBillInvoices]);
  const alreadyBilledInvoices = useMemo(() => unpaidInvoices.filter(i => i.collection_status === 'contacted'), [unpaidInvoices]);
  const totalAlreadyBilled = useMemo(() => alreadyBilledInvoices.reduce((s, i) => s + remain(i), 0), [alreadyBilledInvoices]);

  const displayedGroups = useMemo(() => {
    return tenantGroups.filter(g => {
      const activeItems = g.items.filter(i => i.status !== 'paid');
      const outstandingSum = activeItems.reduce((s, i) => s + remain(i), 0);

      if (activeTab === 'pending') {
        return outstandingSum > 0 && activeItems.some(i => i.collection_status !== 'contacted');
      } else if (activeTab === 'contacted') {
        return outstandingSum > 0 && activeItems.every(i => i.collection_status === 'contacted');
      } else {
        return outstandingSum === 0;
      }
    });
  }, [tenantGroups, activeTab]);

  const openPayment = g => {
    const activeItems = g.items.filter(i => i.status !== 'paid');
    const totalOutstanding = activeItems.reduce((s, i) => s + remain(i), 0);
    setSelectedGroup(g);
    setPaymentAmount(String(totalOutstanding));
    setPaymentOpen(true);
  };

  const recordPayment = async e => {
    e.preventDefault();
    const g = selectedGroup;
    const amount = parseSafeNumber(paymentAmount);

    if (!g || amount <= 0) return notify('Harap masukkan nominal pembayaran yang valid.');

    let left = amount;
    const now = new Date().toISOString();
    setBusy(true);

    const unpaidItemsSorted = [...g.items]
      .filter(i => i.status !== 'paid')
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));

    for (const invoice of unpaidItemsSorted) {
      if (left <= 0) break;
      const outstanding = remain(invoice);
      const applied = Math.min(left, outstanding);
      if (applied <= 0) continue;

      const newPaid = parseSafeNumber(invoice.paid_amount) + applied;
      const isLunas = newPaid >= parseSafeNumber(invoice.amount);
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
        description: `Pembayaran ${g.tenant?.full_name || 'Penghuni'} · Kamar ${g.room?.room_number || '-'} (${newStatus === 'paid' ? 'Lunas' : 'Sebagian'})`,
        amount: applied,
        transaction_date: today()
      };

      const { error: txErr } = await supabase.from('transactions').insert(tx);
      if (txErr) {
        setBusy(false);
        setPaymentOpen(false);
        setPaymentAmount('');
        reload();
        return notify('Sebagian pembayaran diperbarui, namun gagal mencatat transaksi keuangan: ' + txErr.message);
      }
      left -= applied;
    }

    setBusy(false);
    setPaymentOpen(false);
    setPaymentAmount('');
    reload();

    const totalPaidActual = amount - left;
    notify(`Pembayaran sebesar ${rupiah(totalPaidActual)} berhasil dicatat.`);

    setMessageType('paid');
    setMessage(buildPaidMessage(g, totalPaidActual));
    setMessageOpen(true);
  };

  // ==========================================
  // PESAN WHATSAPP (TIDAK DIUBAH SAMA SEKALI)
  // ==========================================
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

    const totalOutstandingSum = unpaidItems.reduce((s, i) => s + remain(i), 0);
    const paymentText = [
      prop?.payment_bca && `BCA: ${prop.payment_bca}`,
      prop?.payment_dana && `DANA: ${prop.payment_dana}`,
      prop?.payment_gopay && `GoPay / ShopeePay: ${prop.payment_gopay}`,
      prop?.payment_name && `a.n. ${prop.payment_name}`
    ].filter(Boolean).join('\n') || 'BCA: 0571288191\nDANA: 08816585970\nGoPay / ShopeePay: 085161174317\na.n. Ryan Putra Pratama';

    const totalBillOriginal = unpaidItems.reduce((s, i) => s + Number(i.amount || 0), 0);
    const totalAlreadyPaid = unpaidItems.reduce((s, i) => s + Number(i.paid_amount || 0), 0);

    let partialDetails = '';
    if (totalAlreadyPaid > 0) {
      partialDetails = `\nTotal tagihan: ${rupiah(totalBillOriginal)}\nSudah dibayar: ${rupiah(totalAlreadyPaid)}\nSisa tagihan: ${rupiah(totalOutstandingSum)}\n`;
    } else {
      partialDetails = `\nTotal tagihan: ${rupiah(totalOutstandingSum)}\n`;
    }

    return `Halo ${g.tenant?.full_name || ''},

Kami mengingatkan mengenai tagihan sewa kos yang masih belum dilunasi.

Properti: ${prop?.name || 'Kos'}
Kamar: ${g.room?.room_number || ''}

PERIODE PENAGIHAN:
${lines}
${partialDetails}
Pembayaran dapat ditransfer melalui rekening properti kami:

${paymentText}

Mohon segera melakukan konfirmasi jika sudah membayar. Terima kasih banyak 🙏`;
  };

  const buildPaidMessage = (g, paidAmount) => {
    const prop = properties.find(p => p.id === g.room?.property_id) || properties[0];
    const remainingOutstanding = g.items.filter(i => i.status !== 'paid').reduce((s, i) => s + remain(i), 0);

    return `Halo ${g.tenant?.full_name || ''},

Pembayaran kos sudah kami terima dengan rincian berikut:

Properti: ${prop?.name || 'Kos'}
Kamar: ${g.room?.room_number || ''}

Jumlah Pembayaran: ${rupiah(paidAmount)}
Status: LUNAS ✅
${remainingOutstanding > 0 ? `Sisa Tagihan: ${rupiah(remainingOutstanding)}` : 'Terima kasih atas pembayaran Anda!'}

Terima kasih 🙏`;
  };

  const openMessage = (g, type) => {
    setSelectedGroup(g);
    setMessageType(type);
    if (type === 'receipt') {
      const lastPaidItem = [...g.items]
        .filter(i => i.status === 'paid' && i.paid_at)
        .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)))[0];
      const paidAmount = lastPaidItem ? lastPaidItem.amount : 0;
      setMessage(buildPaidMessage(g, paidAmount));
    } else {
      setMessage(buildPenagihanMessage(g));
    }
    setMessageOpen(true);
  };

  const sendWhatsApp = async () => {
    const t = selectedGroup?.tenant;
    if (!t?.whatsapp_number || t.whatsapp_number.trim() === '') {
      return notify('Nomor WhatsApp tidak tersedia atau tidak valid.');
    }
    const cleanNumber = t.whatsapp_number.replace(/\D/g, '');
    if (!cleanNumber) return notify('Nomor WhatsApp tidak valid.');

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

  // ==========================================
  // UI DENGAN DUKUNGAN LIGHT & DARK MODE
  // ==========================================
  return (
    <section className="module-full text-gray-900 dark:text-gray-100" id="billing-manager">
      <div className="module-toolbar flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Manajemen Penagihan & Billing</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Kirim tagihan otomatis, catat pembayaran sebagian FIFO, dan koordinasikan via WhatsApp.</p>
        </div>
        <button
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm"
          type="button"
          onClick={() => {
            setEditing(null);
            setForm({ tenant_id: '', due_date: today(), amount: '', manualAmount: false, monthCount: 1, month_period: defaultMonthPeriod() });
            setOpen(true);
          }}
        >
          <ReceiptText size={18} /> Buat Tagihan Baru
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="billing-summary">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <small className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Tunggakan</small>
          <b className="block text-xl mt-1 text-gray-900 dark:text-white">{rupiah(totalTunggakan)}</b>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <small className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Perlu Ditagih</small>
          <b className="block text-xl mt-1 text-blue-600 dark:text-blue-400">{rupiah(totalNeedToBill)}</b>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <small className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sudah Ditagih</small>
          <b className="block text-xl mt-1 text-yellow-600 dark:text-yellow-400">{rupiah(totalAlreadyBilled)}</b>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <small className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nilai Terlambat</small>
          <b className="block text-xl mt-1 text-red-600 dark:text-red-400">{rupiah(totalTerlambat)}</b>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-1 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto" id="billing-tab-filters">
        {[
          { id: 'pending', label: 'Perlu Ditagih', count: needToBillInvoices.length },
          { id: 'contacted', label: 'Sudah Ditagih', count: alreadyBilledInvoices.length },
          { id: 'paid', label: 'Lunas / Bebas Tunggakan', count: invoices.filter(i => i.status === 'paid').length }
        ].map(tab => (
          <button
            key={tab.id}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Manual Billing Creator Form */}
      {open && (
        <form className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6" onSubmit={saveInvoice} id="billing-form">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">{editing ? 'Edit Tagihan' : 'Buat Tagihan Manual Baru'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Pilih Penghuni</span>
              <select
                className="w-full mt-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
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
                  return <option key={t.id} value={t.id}>{t.full_name} (Kamar {r?.room_number || '-'})</option>;
                })}
              </select>
            </label>

            {!editing ? (
              <>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Bulan Periode Mulai</span>
                  <input
                    className="w-full mt-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    type="month"
                    value={form.month_period}
                    onChange={e => {
                      const ym = e.target.value;
                      setForm(f => ({ ...f, month_period: ym, due_date: getCalculatedDueDate(f.tenant_id, ym) }));
                    }}
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Jumlah Bulan Berurutan</span>
                  <input
                    className="w-full mt-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
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
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tanggal Jatuh Tempo</span>
                <input
                  className="w-full mt-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  type="date"
                  value={form.due_date}
                  onChange={e => set('due_date', e.target.value)}
                  required
                />
              </label>
            )}

            <label className="block md:col-span-3 lg:col-span-1">
              <span className="flex justify-between items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                Nominal Tagihan
                <button
                  type="button"
                  className="text-xs text-blue-600 dark:text-blue-400 font-normal underline hover:text-blue-800 dark:hover:text-blue-300"
                  onClick={() => set('manualAmount', !form.manualAmount)}
                >
                  {form.manualAmount ? 'Gunakan Tarif Kamar Otomatis' : 'Ubah Nominal Kustom'}
                </button>
              </span>
              <div className="mt-1">
                <MoneyInput
                  value={form.amount}
                  onChange={val => { set('amount', val); set('manualAmount', true); }}
                  required
                />
             . </div>
            </label>
          </div>

          {previewDates.length > 0 && (
            <div className="mt-4 text-xs text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 rounded-lg">
              <span className="font-semibold block mb-2">📅 Rencana Tanggal Jatuh Tempo ({previewDates.length} Bulan):</span>
              <div className="flex flex-wrap gap-2">
                {previewDates.map(d => {
                  const formatted = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(parseDateLocal(d));
                  return (
                    <span key={d} className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-md text-xs font-medium shadow-sm">
                      {formatted}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 mb-4">
            Tagihan bulanan normal selalu memakai tarif kamar penuh. Jika tanggal tagihan berubah, lakukan perubahan siklus tanggal di menu Penghuni untuk menghitung prorata khusus.
          </p>

          <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
            <button type="submit" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50" disabled={busy}>
              <Save size={16} /> {editing ? 'Perbarui Tagihan' : 'Simpan Tagihan'}
            </button>
            <button type="button" className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium rounded-lg transition-colors" onClick={() => { setOpen(false); setEditing(null); }}>
              Batal
            </button>
          </div>
        </form>
      )}

      {/* Bills Group List */}
      {displayedGroups.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">Tidak ada data penagihan yang cocok dengan filter ini.</p>
        </div>
      ) : (
        <div className="space-y-4" id="billing-room-list">
          {displayedGroups.map(g => {
            const activeItems = g.items.filter(i => i.status !== 'paid');
            const totalOutstandingSum = activeItems.reduce((s, i) => s + remain(i), 0);
            const hasOverdue = activeItems.some(i => overdueDays(i.due_date) > 0);
            const isPaidGroup = totalOutstandingSum === 0;
            
            return (
              <div
                key={`${g.tenant?.id}-${g.room?.id}`}
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border overflow-hidden transition-all hover:shadow-md ${
                  isPaidGroup 
                    ? 'border-green-200 dark:border-green-900/50' 
                    : hasOverdue 
                      ? 'border-red-200 dark:border-red-900/50' 
                      : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className={`p-4 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 ${isPaidGroup ? 'bg-green-50/50 dark:bg-green-900/10' : hasOverdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <b className="text-base text-gray-900 dark:text-white">Kamar {g.room?.room_number || '-'} · {g.tenant?.full_name || 'Penghuni'}</b>
                      {hasOverdue && !isPaidGroup && <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full">Terlambat</span>}
                    </div>
                    <small className={`text-sm mt-1 block ${isPaidGroup ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      {isPaidGroup ? 'Lunas / Tidak ada tunggakan sewa aktif' : `${activeItems.length} bulan belum lunas`}
                    </small>
                  </div>
                  <strong className={`text-xl ${isPaidGroup ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                    {rupiah(totalOutstandingSum)}
                  </strong>
                </div>

                {activeItems.length > 0 && (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {activeItems.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))).map(invoice => {
                      const daysLate = overdueDays(invoice.due_date);
                      const isPartial = parseSafeNumber(invoice.paid_amount) > 0;
                      
                      return (
                        <div key={invoice.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(parseDateLocal(invoice.due_date))}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {isPartial ? (
                                <span className="text-blue-600 dark:text-blue-400 font-medium">Dibayar sebagian: {rupiah(invoice.paid_amount)}</span>
                              ) : invoice.collection_status === 'contacted' ? (
                                <span className="text-yellow-600 dark:text-yellow-400">Sudah diingatkan</span>
                              ) : daysLate > 0 ? (
                                <span className="text-red-600 dark:text-red-400 font-medium">Terlambat {daysLate} hari</span>
                              ) : (
                                <span>Menunggu jatuh tempo</span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 sm:gap-6">
                            <div className="text-right min-w-[100px]">
                              <div className="font-bold text-gray-900 dark:text-gray-100">{rupiah(remain(invoice))}</div>
                              {isPartial && <div className="text-xs text-gray-400 dark:text-gray-500 line-through">{rupiah(invoice.amount)}</div>}
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => editInvoice(invoice)} title="Edit Tagihan" className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 rounded-lg transition-colors">
                                <Pencil size={16} />
                              </button>
                              <button type="button" onClick={() => deleteInvoice(invoice)} title="Hapus Tagihan" className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 dark:hover:text-red-400 rounded-lg transition-colors">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-3 justify-end">
                  {totalOutstandingSum > 0 ? (
                    <>
                      <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm" type="button" onClick={() => openMessage(g, 'reminder')}>
                        <MessageCircle size={16} /> Kirim WA Penagihan
                      </button>
                      <button className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors shadow-sm" type="button" onClick={() => openPayment(g)}>
                        <CheckCircle2 size={16} /> Catat Pembayaran
                      </button>
                    </>
                  ) : (
                    <button className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm" type="button" onClick={() => openMessage(g, 'receipt')}>
                      <CheckCircle2 size={16} /> Kirim WA Konfirmasi Lunas
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Record Payment Modal */}
      {paymentOpen && selectedGroup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form className="bg-white dark:bg-gray-800 w-full max-w-md rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-6" onSubmit={recordPayment} id="record-payment-modal">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Catat Penerimaan Pembayaran</h3>
              <button type="button" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" onClick={() => setPaymentOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Penghuni: <b className="text-gray-900 dark:text-white">{selectedGroup.tenant?.full_name}</b> · Kamar <b className="text-gray-900 dark:text-white">{selectedGroup.room?.room_number}</b>
            </p>

            <label className="block mb-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Nominal yang Diterima (IDR)</span>
              <MoneyInput value={paymentAmount} onChange={setPaymentAmount} required />
            </label>

            <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 rounded-lg text-xs text-blue-800 dark:text-blue-200 mb-6">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
              <span>
                <b>Alokasi Otomatis (FIFO):</b> Sistem akan otomatis membagi pembayaran ini untuk melunasi tagihan yang paling lama/tertua terlebih dahulu. Sebagian sisa pembayaran yang tidak melunasi invoice penuh akan tercatat sebagai pembayaran sebagian (partial).
              </span>
            </div>

            <div className="flex items-center gap-3 justify-end">
              <button type="submit" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50" disabled={busy}>
                <CheckCircle2 size={16} /> Konfirmasi & Simpan
              </button>
              <button type="button" className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium rounded-lg transition-colors" onClick={() => setPaymentOpen(false)}>
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* WA Preview Modal */}
      {messageOpen && selectedGroup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {messageType === 'paid' ? 'Pratinjau Konfirmasi Lunas' : 'Pratinjau Penagihan WhatsApp'}
              </h3>
              <button type="button" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" onClick={() => setMessageOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Pesan di bawah siap dikirimkan ke nomor WhatsApp penghuni: <b className="text-gray-700 dark:text-gray-200">{selectedGroup.tenant?.whatsapp_number || 'Tidak ada nomor'}</b>
            </p>
            <textarea
              className="w-full font-mono text-sm border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={12}
            />
            <div className="flex items-center gap-3 justify-end">
              <button className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors" type="button" onClick={sendWhatsApp}>
                <MessageCircle size={16} /> Buka & Kirim WhatsApp
              </button>
              <button type="button" className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium rounded-lg transition-colors" onClick={() => setMessageOpen(false)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
