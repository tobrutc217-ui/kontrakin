import React, { useState } from 'react';
import { Plus, Trash2, WalletCards, Save } from 'lucide-react';
import { supabase } from '../supabase';
import { rupiah, today, parseMoneyInput } from '../utils';
import { MoneyInput } from './MoneyInput';

export function FinanceManager({ properties, transactions, selectedPropertyId, reload, notify }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('Semua'); // 'Semua', 'Pemasukan', 'Pengeluaran'
  
  const [form, setForm] = useState({
    category: 'Pemasukan',
    description: '',
    amount: '',
    transaction_date: today()
  });

  const [busy, setBusy] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Get active property for transaction recording
  const activeProperty = selectedPropertyId === 'all' ? properties[0] : properties.find(p => p.id === selectedPropertyId);

  const saveTransaction = async e => {
    e.preventDefault();
    if (!activeProperty) {
      return notify('Harap pilih properti terlebih dahulu di sidebar atau panel aktif.');
    }
    if (!form.description.trim() || !form.amount) {
      return notify('Harap lengkapi deskripsi dan nominal transaksi.');
    }

    setBusy(true);
    // Income is positive, Expense is negative
    const numericAmount = (form.category === 'Pengeluaran' ? -1 : 1) * parseMoneyInput(form.amount);

    const { error } = await supabase.from('transactions').insert({
      property_id: activeProperty.id,
      category: form.category,
      description: form.description.trim(),
      amount: numericAmount,
      transaction_date: form.transaction_date
    });

    setBusy(false);
    if (error) {
      return notify(error.message);
    }

    setOpen(false);
    setForm({
      category: 'Pemasukan',
      description: '',
      amount: '',
      transaction_date: today()
    });
    notify('Transaksi baru berhasil dicatat.');
    reload();
  };

  const deleteTransaction = async t => {
    if (!confirm(`Hapus transaksi "${t.description}" dari Keuangan? Sisa saldo/tagihan tidak terpengaruh.`)) return;

    setBusy(true);
    const { error } = await supabase.from('transactions').delete().eq('id', t.id);
    setBusy(false);

    if (error) {
      return notify(error.message);
    }

    notify('Transaksi berhasil dihapus.');
    reload();
  };

  const deleteAllTransactions = async () => {
    if (!transactions.length) return notify('Tidak ada data keuangan untuk dihapus.');
    if (!confirm(`Hapus seluruh ${transactions.length} transaksi yang ditampilkan saat ini? Tindakan ini tidak dapat dibatalkan.`)) return;

    setBusy(true);
    const ids = transactions.map(t => t.id);
    const { error } = await supabase.from('transactions').delete().in('id', ids);
    setBusy(false);

    if (error) {
      return notify(error.message);
    }

    notify('Seluruh transaksi yang ditampilkan berhasil dibersihkan.');
    reload();
  };

  // Calculations based on currently loaded transactions (already filtered by property_id in App.jsx!)
  const totalIncome = transactions
    .filter(t => Number(t.amount) > 0)
    .reduce((s, t) => s + Number(t.amount), 0);

  const totalExpense = transactions
    .filter(t => Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const netBalance = totalIncome - totalExpense;

  // Client-side filtering of types ('Semua', 'Pemasukan', 'Pengeluaran')
  const filteredTransactions = transactions.filter(t => {
    if (filter === 'Semua') return true;
    if (filter === 'Pemasukan') return Number(t.amount) > 0;
    return Number(t.amount) < 0;
  });

  return (
    <section className="module-full" id="finance-manager">
      <div className="module-toolbar">
        <div>
          <h2>Keuangan Properti</h2>
          <p>Lacak arus kas masuk dari penagihan serta pengeluaran operasional secara real-time.</p>
        </div>
        <div className="toolbar-actions">
          {transactions.length > 0 && (
            <button className="danger-outline-btn mr-2" type="button" onClick={deleteAllTransactions}>
              <Trash2 size={16} /> Hapus Semua Transaksi
            </button>
          )}
          <button className="add-button" type="button" onClick={() => setOpen(true)}>
            <Plus size={17} /> Tambah Transaksi Kas
          </button>
        </div>
      </div>

      {/* Summary Row */}
      <div className="finance-summary" id="finance-summary">
        <div>
          <span>Total Pemasukan</span>
          <strong className="text-green-600">{rupiah(totalIncome)}</strong>
        </div>
        <div>
          <span>Total Pengeluaran</span>
          <strong className="text-orange-600">{rupiah(totalExpense)}</strong>
        </div>
        <div>
          <span>Saldo Bersih (Net)</span>
          <strong className={netBalance >= 0 ? 'text-blue-600' : 'text-red-600'}>
            {rupiah(netBalance)}
          </strong>
        </div>
      </div>

      {/* Type Filters */}
      <div className="finance-filters" id="finance-tab-filters">
        {['Semua', 'Pemasukan', 'Pengeluaran'].map(x => (
          <button
            key={x}
            type="button"
            className={filter === x ? 'active' : ''}
            onClick={() => setFilter(x)}
          >
            {x}
          </button>
        ))}
      </div>

      {/* Record Manual Transaction Form */}
      {open && (
        <form className="edit-card" onSubmit={saveTransaction} id="finance-form">
          <h3>Pencatatan Transaksi Manual</h3>
          <div className="form-grid">
            <label htmlFor="tx-property">
              Properti Aktif
              <select id="tx-property" value={activeProperty?.id || ''} disabled>
                <option value={activeProperty?.id || ''}>
                  {activeProperty ? activeProperty.name : 'Pilih properti aktif di sidebar'}
                </option>
              </select>
              <small className="form-hint">
                Transaksi baru akan dimasukkan di properti aktif: <b>{activeProperty?.name || '—'}</b>
              </small>
            </label>

            <label htmlFor="tx-type">
              Jenis Aliran Kas
              <select id="tx-type" value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="Pemasukan">Pemasukan (Uang Masuk)</option>
                <option value="Pengeluaran">Pengeluaran (Uang Keluar)</option>
              </select>
            </label>

            <label htmlFor="tx-description">
              Deskripsi Transaksi
              <input
                id="tx-description"
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Contoh: Pembayaran listrik bulanan, service AC Kamar 102"
                required
              />
            </label>

            <label htmlFor="tx-amount">
              Nominal Transaksi (IDR)
              <MoneyInput
                id="tx-amount"
                value={form.amount}
                onChange={val => set('amount', val)}
                required
              />
            </label>

            <label htmlFor="tx-date">
              Tanggal Transaksi
              <input
                id="tx-date"
                type="date"
                value={form.transaction_date}
                onChange={e => set('transaction_date', e.target.value)}
                required
              />
            </label>
          </div>

          <div className="form-actions mt-4">
            <button type="submit" className="primary" disabled={busy}>
              <Save size={15} /> Simpan Transaksi
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Batal
            </button>
          </div>
        </form>
      )}

      {/* Transactions Table / List */}
      <div className="data-table panel" id="finance-table">
        {filteredTransactions.length === 0 ? (
          <div className="empty text-center py-6">Belum ada transaksi kas yang tercatat untuk kriteria filter ini.</div>
        ) : (
          filteredTransactions.map(t => {
            const isPemasukan = Number(t.amount) > 0;
            return (
              <div className="invoice-row" key={t.id}>
                <div>
                  <b>{t.description}</b>
                  <small>
                    {t.category} · {t.transaction_date}
                  </small>
                </div>
                <strong className={isPemasukan ? 'income' : 'expense'}>
                  {isPemasukan ? '+' : '−'}
                  {rupiah(Math.abs(Number(t.amount)))}
                </strong>
                <button
                  type="button"
                  className="danger delete-transaction"
                  onClick={() => deleteTransaction(t)}
                  title="Hapus Transaksi"
                >
                  <Trash2 size={15} /> Hapus
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
