import React, { useState, useEffect, useMemo } from 'react';
import { Pencil, MessageCircle, CheckCircle2, X, Save, ReceiptText, AlertTriangle, Trash2, Check } from 'lucide-react';
import { supabase } from '../supabase';
import { rupiah, today, parseDateLocal, overdueDays, addMonthsDate, monthDueDate } from '../utils';
import { MoneyInput } from './MoneyInput';

export function InvoiceManager({ tenants, rooms, invoices, properties, reload, notify }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  // WhatsApp Message Modals
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageType, setMessageType] = useState('reminder'); // 'reminder' or 'receipt'
  const [message, setMessage] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);

  // Payment Recording Modals
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');

  // Filtering Tabs
  // 'pending' (Perlu Ditagih), 'contacted' (Sudah Ditagih), 'paid' (Lunas / Tidak Ada Tunggakan)
  const [activeTab, setActiveTab] = useState('pending');



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
  const remain = i => Math.max(0, Number(i.amount || 0) - Number(i.paid_amount || 0));
  const autoAmount = t => Number(roomFor(t)?.monthly_rate || 0);

  const saveInvoice = async e => {
    e.preventDefault();
    const t = tenants.find(x => x.id === form.tenant_id);
    const r = roomFor(t);

    if (!t || !r) {
      return notify('Silakan pilih penghuni yang sudah memiliki kamar.');
    }

    setBusy(true);

    // Ambil seluruh invoice yang ada untuk tenant ini terlebih dahulu
    // Ini agar jika ada invoice yang sudah ada pada tanggal jatuh tempo yang sama, kita bisa mengupdate nominalnya (amount)
    // tanpa menimpa status lunas/pembayaran yang sudah dicicil (paid_amount).
    const { data: existing, error: fetchErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('tenant_id', t.id);

    if (fetchErr) {
      setBusy(false);
      return notify('Gagal memeriksa data tagihan yang sudah ada: ' + fetchErr.message);
    }

    const count = Math.max(1, Math.min(24, Number(form.monthCount) || 1));
    const rows = [];

    if (editing) {
      // Skenario Edit Satu Invoice Tertentu
      const amount = form.manualAmount ? Number(form.amount) : autoAmount(t);
      const paidAmount = Number(editing.paid_amount || 0);
      const remainAmount = Math.max(0, amount - paidAmount);
      
      // Hitung status baru berdasarkan nominal baru dan sisa pembayaran
      let newStatus = 'unpaid';
      if (remainAmount === 0) {
        newStatus = 'paid';
      } else if (parseDateLocal(form.due_date) < parseDateLocal(today())) {
        newStatus = 'overdue';
      }

      const result = await supabase.from('invoices')
        .update({
          due_date: form.due_date,
          amount,
          status: newStatus
        })
        .eq('id', editing.id);

      setBusy(false);
      if (result.error) {
        return notify(result.error.message);
      }

      // Hapus dari daftar terhapus jika di-edit / di-re-create secara manual
      try {
        let deletedList = JSON.parse(localStorage.getItem('kos_deleted_invoices') || '[]');
        const keyToClear = `${editing.tenant_id}::${form.due_date}`;
        deletedList = deletedList.filter(k => k !== keyToClear);
        localStorage.setItem('kos_deleted_invoices', JSON.stringify(deletedList));
      } catch (e) {
        console.warn(e);
      }
    } else {
      // Skenario Pembuatan Tagihan Baru (Bisa Multi Bulan)
      const clearedKeys = [];
      for (let n = 0; n < count; n++) {
        const due = addMonthsDate(form.due_date, n);
        const amount = form.manualAmount ? Number(form.amount) : autoAmount(t);
        clearedKeys.push(`${t.id}::${due}`);
        
        // Cari apakah ada invoice yang sudah terbit di tanggal yang sama untuk tenant ini
        const ext = (existing || []).find(i => i.due_date === due);
        
        if (ext) {
          // Jika ada, kita TIMPA amount-nya, tetapi kita jaga paid_amount dan statusnya
          const paidAmount = Number(ext.paid_amount || 0);
          const remainAmount = Math.max(0, amount - paidAmount);
          
          let newStatus = 'unpaid';
          if (remainAmount === 0) {
            newStatus = 'paid';
          } else if (parseDateLocal(due) < parseDateLocal(today())) {
            newStatus = 'overdue';
          }

          rows.push({
            tenant_id: t.id,
            room_id: r.id,
            due_date: due,
            amount,
            status: newStatus,
            paid_amount: paidAmount
          });
        } else {
          // Jika belum ada, buat baru dari nol
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

      // Upsert ke database tanpa ignoreDuplicates agar data yang konflik ter-update dengan aman!
      const result = await supabase.from('invoices').upsert(rows, {
        onConflict: 'tenant_id,due_date'
      });

      setBusy(false);
      if (result.error) {
        return notify(result.error.message);
      }

      // Hapus seluruh kunci yang dibuat dari daftar terhapus
      try {
        let deletedList = JSON.parse(localStorage.getItem('kos_deleted_invoices') || '[]');
        deletedList = deletedList.filter(k => !clearedKeys.includes(k));
        localStorage.setItem('kos_deleted_invoices', JSON.stringify(deletedList));
      } catch (e) {
        console.warn(e);
      }
    }

    setOpen(false);
    setEditing(null);
    notify(editing ? 'Tagihan berhasil diperbarui.' : `${count} periode tagihan berhasil ditambahkan/diperbarui.`);
    reload();
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
    if (error) {
      return notify('Gagal menghapus tagihan: ' + error.message);
    }

    // Catat ke daftar terhapus agar tidak di-generate ulang otomatis
    try {
      const deletedList = JSON.parse(localStorage.getItem('kos_deleted_invoices') || '[]');
      const key = `${i.tenant_id}::${i.due_date}`;
      if (!deletedList.includes(key)) {
        deletedList.push(key);
        localStorage.setItem('kos_deleted_invoices', JSON.stringify(deletedList));
      }
    } catch (e) {
      console.warn('Gagal mencatat invoice terhapus:', e);
    }

    notify('Tagihan berhasil dihapus.');
    reload();
  };

  const payInvoiceDirect = async i => {
    const tName = tenants.find(t => t.id === i.tenant_id)?.full_name || 'Penghuni';
    const periodLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(parseDateLocal(i.due_date));
    if (!window.confirm(`Apakah Anda yakin ingin menandai tagihan periode ${periodLabel} untuk ${tName} sebagai LUNAS?`)) {
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    const remainingAmount = remain(i);

    // Update status to paid and set paid_amount to its full amount
    const { error: invErr } = await supabase.from('invoices')
      .update({
        paid_amount: i.amount,
        status: 'paid',
        paid_at: now
      })
      .eq('id', i.id);

    if (invErr) {
      setBusy(false);
      return notify('Gagal melunasi tagihan: ' + invErr.message);
    }

    // Record cash income transaction ONLY if remaining amount to be paid > 0
    if (remainingAmount > 0) {
      const room = rooms.find(r => r.id === i.room_id);
      const property = properties.find(p => p.id === room?.property_id) || properties[0];
      const propertyId = property?.id || i.property_id;

      if (propertyId) {
        const tx = {
          property_id: propertyId,
          invoice_id: i.id,
          category: 'Sewa Kamar',
          description: `Pembayaran ${tName} · Kamar ${room?.room_number || '-'} (Lunas - Instan)`,
          amount: remainingAmount,
          transaction_date: today()
        };

        const { error: txErr } = await supabase.from('transactions').insert(tx);
        if (txErr) {
          setBusy(false);
          notify('Tagihan lunas, namun gagal mencatat transaksi keuangan: ' + txErr.message);
          reload(); // Ensure UI reloads even if transaction insert fails
          return;
        }
      }
    }

    setBusy(false);
    notify(`Tagihan periode ${periodLabel} untuk ${tName} berhasil dilunasi.`);
    reload();
  };

  // Group invoices by tenant and room for aggregated view
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

  // Calculations for billing overview cards
  const unpaidInvoices = useMemo(() => invoices.filter(i => i.status !== 'paid'), [invoices]);
  const totalTunggakan = useMemo(() => unpaidInvoices.reduce((s, i) => s + remain(i), 0), [unpaidInvoices]);
  
  const overdueInvoices = useMemo(() => unpaidInvoices.filter(i => overdueDays(i.due_date) > 0), [unpaidInvoices]);
  const totalTerlambat = useMemo(() => overdueInvoices.reduce((s, i) => s + remain(i), 0), [overdueInvoices]);

  const needToBillInvoices = useMemo(() => unpaidInvoices.filter(i => i.collection_status !== 'contacted'), [unpaidInvoices]);
  const totalNeedToBill = useMemo(() => needToBillInvoices.reduce((s, i) => s + remain(i), 0), [needToBillInvoices]);

  const alreadyBilledInvoices = useMemo(() => unpaidInvoices.filter(i => i.collection_status === 'contacted'), [unpaidInvoices]);
  const totalAlreadyBilled = useMemo(() => alreadyBilledInvoices.reduce((s, i) => s + remain(i), 0), [alreadyBilledInvoices]);

  // Filter groups according to tabs
  const displayedGroups = useMemo(() => {
    return tenantGroups.filter(g => {
      const activeItems = g.items.filter(i => i.status !== 'paid');
      const outstandingSum = activeItems.reduce((s, i) => s + remain(i), 0);

      if (activeTab === 'pending') {
        // Perlu ditagih: Outstanding > 0 and NOT fully contacted on all bills
        return outstandingSum > 0 && activeItems.some(i => i.collection_status !== 'contacted');
      } else if (activeTab === 'contacted') {
        // Sudah ditagih: Outstanding > 0 and at least one bill marked contacted
        return outstandingSum > 0 && activeItems.every(i => i.collection_status === 'contacted');
      } else {
        // Lunas: Outstanding === 0
        return outstandingSum === 0;
      }
    });
  }, [tenantGroups, activeTab]);

  // Open payment recorder modal
  const openPayment = g => {
    const activeItems = g.items.filter(i => i.status !== 'paid');
    const totalOutstanding = activeItems.reduce((s, i) => s + remain(i), 0);
    setSelectedGroup(g);
    setPaymentAmount(String(totalOutstanding));
    setPaymentOpen(true);
  };

  // RECORD PAYMENT & FIFO ALLOCATION
  const recordPayment = async e => {
    e.preventDefault();
    const g = selectedGroup;
    const amount = Number(paymentAmount);

    if (!g || amount <= 0) {
      return notify('Harap masukkan nominal pembayaran yang valid.');
    }

    let left = amount;
    const now = new Date().toISOString();
    setBusy(true);

    // Filter unpaid items and sort by due_date ASC for FIFO
    const unpaidItemsSorted = [...g.items]
      .filter(i => i.status !== 'paid')
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));

    for (const invoice of unpaidItemsSorted) {
      if (left <= 0) break;

      const outstanding = remain(invoice);
      const applied = Math.min(left, outstanding);

      if (applied <= 0) continue;

      const newPaid = Number(invoice.paid_amount || 0) + applied;
      const isLunas = newPaid >= Number(invoice.amount || 0);
      const newStatus = isLunas ? 'paid' : (overdueDays(invoice.due_date) > 0 ? 'overdue' : 'unpaid');

      // Update invoice
      const { error: invErr } = await supabase.from('invoices')
        .update({
          paid_amount: newPaid,
          status: newStatus,
          paid_at: isLunas ? now : null
        })
        .eq('id', invoice.id);

      if (invErr) {
        setBusy(false);
        return notify(invErr.message);
      }

      // Record transaction inside Keuangan linked to the specific property of the room
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

    // Sisa kembalian check
    const change = left;
    const totalPaidActual = amount - change;
    notify(`Pembayaran sebesar ${rupiah(totalPaidActual)} berhasil dicatat.`);

    // If fully or partially paid, open a confirmation receipt modal to send over WA!
    setMessageType('paid');
    setMessage(buildPaidMessage(g, totalPaidActual));
    setMessageOpen(true);
  };

  // BUILD WHATSAPP MESSAGE TEXT FOR PENAGIHAN (TUNGGAKAN > 0)
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

    // Bank credentials Milik Properti
    const paymentText = [
      prop?.payment_bca && `BCA: ${prop.payment_bca}`,
      prop?.payment_dana && `DANA: ${prop.payment_dana}`,
      prop?.payment_gopay && `GoPay / ShopeePay: ${prop.payment_gopay}`,
      prop?.payment_name && `a.n. ${prop.payment_name}`
    ].filter(Boolean).join('\n') || 'BCA: 0571288191\nDANA: 08816585970\nGoPay / ShopeePay: 085161174317\na.n. Ryan Putra Pratama';

    // Check if the tenant has partial payments already on these active bills
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

  // BUILD WHATSAPP MESSAGE TEXT FOR KONFIRMASI LUNAS
  const buildPaidMessage = (g, paidAmount) => {
    const prop = properties.find(p => p.id === g.room?.property_id) || properties[0];
    const currentMonthLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(parseDateLocal(today()));
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

    // Clean phone number from non-digits
    const cleanNumber = t.whatsapp_number.replace(/\D/g, '');
    if (!cleanNumber) {
      return notify('Nomor WhatsApp tidak valid.');
    }

    const waUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    // Mark as contacted in DB if we sent a billing reminder
    if (messageType === 'reminder') {
      const activeIds = selectedGroup.items.filter(i => i.status !== 'paid').map(i => i.id);
      if (activeIds.length) {
        await supabase.from('invoices')
          .update({
            collection_status: 'contacted',
            last_contacted_at: new Date().toISOString()
          })
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
          <h2>Manajemen Penagihan & Billing</h2>
          <p>Kirim tagihan otomatis, catat pembayaran sebagian FIFO, dan koordinasikan via WhatsApp.</p>
        </div>
        <div className="toolbar-actions">
          <button
            className="add-button"
            type="button"
            onClick={() => {
              setEditing(null);
              const nowYm = (() => {
                const d = new Date();
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              })();
              setForm({
                tenant_id: '',
                due_date: today(),
                amount: '',
                manualAmount: false,
                monthCount: 1,
                month_period: nowYm
              });
              setOpen(true);
            }}
          >
            <ReceiptText size={17} /> Buat Tagihan Baru
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="billing-summary" id="billing-summary">
        <div>
          <small>Total Tunggakan</small>
          <b>{rupiah(totalTunggakan)}</b>
        </div>
        <div>
          <small>Perlu Ditagih</small>
          <b>{rupiah(totalNeedToBill)}</b>
        </div>
        <div>
          <small>Sudah Ditagih</small>
          <b>{rupiah(totalAlreadyBilled)}</b>
        </div>
        <div>
          <small>Nilai Terlambat</small>
          <b className="text-red-500">{rupiah(totalTerlambat)}</b>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="billing-filter" id="billing-tab-filters">
        <button className={activeTab === 'pending' ? 'active' : ''} onClick={() => setActiveTab('pending')}>
          Perlu Ditagih ({needToBillInvoices.length})
        </button>
        <button className={activeTab === 'contacted' ? 'active' : ''} onClick={() => setActiveTab('contacted')}>
          Sudah Ditagih ({alreadyBilledInvoices.length})
        </button>
        <button className={activeTab === 'paid' ? 'active' : ''} onClick={() => setActiveTab('paid')}>
          Lunas / Bebas Tunggakan
        </button>
      </div>

      {/* Manual Billing Creator Form */}
      {open && (
         <form className="edit-card" onSubmit={saveInvoice} id="billing-form">
          <h3>{editing ? 'Edit Tagihan' : 'Buat Tagihan Manual Baru'}</h3>
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
                  Bulan Periode Mulai
                  <input
                    id="invoice-period"
                    type="month"
                    value={form.month_period}
                    onChange={e => {
                      const ym = e.target.value;
                      const calculatedDue = getCalculatedDueDate(form.tenant_id, ym);
                      setForm(f => ({
                        ...f,
                        month_period: ym,
                        due_date: calculatedDue
                      }));
                    }}
                    required
                  />
                </label>

                <label htmlFor="invoice-count">
                  Jumlah Bulan / Periode Berurutan
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
                Nominal Tagihan
                <button
                  type="button"
                  className="text-xs text-blue-500 font-normal underline hover:text-blue-600"
                  onClick={() => set('manualAmount', !form.manualAmount)}
                >
                  {form.manualAmount ? 'Gunakan Tarif Kamar Otomatis' : 'Ubah Nominal Kustom'}
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
            <div className="mt-3 text-xs text-blue-800 bg-blue-50 border border-blue-200 p-3 rounded" id="billing-preview-dates">
              <span className="font-semibold block mb-1">📅 Rencana Tanggal Jatuh Tempo ({previewDates.length} Bulan):</span>
              <div className="flex flex-wrap gap-1">
                {previewDates.map(d => {
                  const formatted = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(parseDateLocal(d));
                  return (
                    <span key={d} className="bg-white border text-blue-700 px-2 py-0.5 rounded text-[11px] font-medium shadow-sm">
                      {formatted}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <p className="form-hint">
            Tagihan bulanan normal selalu memakai tarif kamar penuh. Jika tanggal tagihan berubah, lakukan perubahan siklus tanggal di menu Penghuni untuk menghitung prorata khusus pindah tanggal secara formal.
          </p>

          <div className="form-actions mt-4">
            <button type="submit" className="primary" disabled={busy}>
              <Save size={15} /> Simpan Tagihan
            </button>
            <button type="button" onClick={() => { setOpen(false); setEditing(null); }}>
              Batal
            </button>
          </div>
        </form>
      )}

      {/* Bills Group List */}
      {displayedGroups.length === 0 ? (
        <div className="empty panel">Tidak ada data penagihan yang cocok dengan filter ini.</div>
      ) : (
        <div className="billing-room-list" id="billing-room-list">
          {displayedGroups.map(g => {
            const activeItems = g.items.filter(i => i.status !== 'paid');
            const totalOutstandingSum = activeItems.reduce((s, i) => s + remain(i), 0);
            const hasOverdue = activeItems.some(i => overdueDays(i.due_date) > 0);
            
            return (
              <div
                className={`billing-room-card ${totalOutstandingSum > 0 ? (hasOverdue ? 'is-overdue' : 'is-pending') : 'is-paid'}`}
                key={`${g.tenant?.id}-${g.room?.id}`}
              >
                <div className="billing-room-head">
                  <div>
                    <b>Kamar {g.room?.room_number || '-'} · {g.tenant?.full_name || 'Penghuni'}</b>
                    <small>
                      {totalOutstandingSum > 0
                        ? `${activeItems.length} bulan belum lunas · ${hasOverdue ? 'Ada tunggakan terlambat' : 'Menunggu jatuh tempo'}`
                        : 'Lunas / Tidak ada tunggakan sewa aktif'}
                    </small>
                  </div>
                  <strong>{rupiah(totalOutstandingSum)}</strong>
                </div>

                {/* Sub items list */}
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
                                ? `Dibayar sebagian: ${rupiah(invoice.paid_amount)}`
                                : invoice.collection_status === 'contacted'
                                ? 'Sudah diingatkan'
                                : daysLate > 0
                                ? `Terlambat ${daysLate} hari`
                                : 'Menunggu'}
                            </small>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => editInvoice(invoice)} title="Edit Tagihan" className="p-1 hover:bg-gray-100 rounded">
                                <Pencil size={13} />
                              </button>
                              <button type="button" onClick={() => deleteInvoice(invoice)} title="Hapus Tagihan" className="p-1 hover:bg-red-50 text-red-500 rounded">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Action Controls based on Outstanding status */}
                <div className="billing-room-actions">
                  {totalOutstandingSum > 0 ? (
                    <>
                      <button className="primary" type="button" onClick={() => openMessage(g, 'reminder')}>
                        <MessageCircle size={15} /> Kirim WA Penagihan
                      </button>
                      <button className="secondary-button" type="button" onClick={() => openPayment(g)}>
                        <CheckCircle2 size={15} /> Catat Pembayaran
                      </button>
                    </>
                  ) : (
                    <button className="success-button" type="button" onClick={() => openMessage(g, 'receipt')}>
                      <CheckCircle2 size={15} /> Kirim WA Konfirmasi Lunas
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
        <div className="modal-backdrop">
          <form className="modal" onSubmit={recordPayment} id="record-payment-modal">
            <button type="button" className="modal-close" onClick={() => setPaymentOpen(false)}>
              <X />
            </button>
            <h3>Catat Penerimaan Pembayaran</h3>
            <p className="text-sm mb-4">
              Penghuni: <b>{selectedGroup.tenant?.full_name}</b> · Kamar <b>{selectedGroup.room?.room_number}</b>
            </p>

            <label htmlFor="payout-amount">
              Nominal yang Diterima (IDR)
              <MoneyInput
                id="payout-amount"
                value={paymentAmount}
                onChange={setPaymentAmount}
                required
              />
            </label>

            <div className="alert-notice flex items-start gap-2 bg-blue-50 border border-blue-200 p-3 rounded text-xs text-blue-800 mt-3">
              <AlertTriangle size={16} className="shrink-0 text-blue-500" />
              <span>
                <b>Alokasi Otomatis (FIFO):</b> Sistem akan otomatis membagi pembayaran ini untuk melunasi tagihan yang paling lama/tertua terlebih dahulu. Sebagian sisa pembayaran yang tidak melunasi invoice penuh akan tercatat sebagai pembayaran sebagian (partial) pada periode berikutnya.
              </span>
            </div>

            <div className="form-actions mt-4">
              <button type="submit" className="primary" disabled={busy}>
                <CheckCircle2 size={15} /> Konfirmasi & Simpan Pembayaran
              </button>
              <button type="button" onClick={() => setPaymentOpen(false)}>
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* WA Preview Modal */}
      {messageOpen && selectedGroup && (
        <div className="modal-backdrop">
          <div className="modal" id="whatsapp-preview-modal">
            <button type="button" className="modal-close" onClick={() => setMessageOpen(false)}>
              <X />
            </button>
            <h3>
              {messageType === 'paid' ? 'Pratinjau Konfirmasi Lunas' : 'Pratinjau Penagihan WhatsApp'}
            </h3>
            <p className="text-xs text-gray-500 mb-2">
              Pesan di bawah siap dikirimkan ke nomor WhatsApp penghuni: <b>{selectedGroup.tenant?.whatsapp_number || 'Tidak ada nomor'}</b>
            </p>
            <textarea
              className="w-full font-mono text-sm border p-3 rounded bg-gray-50 text-gray-800 focus:outline-none"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={15}
            />
            <div className="form-actions mt-4">
              <button className="primary" type="button" onClick={sendWhatsApp}>
                <MessageCircle size={15} /> Buka & Kirim WhatsApp
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
