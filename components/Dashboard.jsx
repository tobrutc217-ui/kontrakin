import React, { useMemo } from 'react';
import { WalletCards, CircleDollarSign, Home, FileText, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { rupiah, today, overdueDays, initials } from '../utils';

export function Dashboard({ properties, rooms, tenants, invoices, transactions, selectedPropertyId }) {
  // Compute active data based on selection
  const filteredRooms = useMemo(() => {
    if (selectedPropertyId === 'all') return rooms;
    return rooms.filter(r => r.property_id === selectedPropertyId);
  }, [rooms, selectedPropertyId]);

  const activeRoomIds = useMemo(() => new Set(filteredRooms.map(r => r.id)), [filteredRooms]);

  const filteredTenants = useMemo(() => {
    if (selectedPropertyId === 'all') return tenants;
    return tenants.filter(t => activeRoomIds.has(t.room_id));
  }, [tenants, activeRoomIds, selectedPropertyId]);

  const activeTenantIds = useMemo(() => new Set(filteredTenants.map(t => t.id)), [filteredTenants]);

  const filteredInvoices = useMemo(() => {
    if (selectedPropertyId === 'all') return invoices;
    return invoices.filter(i => activeTenantIds.has(i.tenant_id));
  }, [invoices, activeTenantIds, selectedPropertyId]);

  const filteredTransactions = useMemo(() => {
    if (selectedPropertyId === 'all') return transactions;
    return transactions.filter(t => t.property_id === selectedPropertyId);
  }, [transactions, selectedPropertyId]);

  // Calculations
  const totalProperties = selectedPropertyId === 'all' ? properties.length : 1;
  const totalRooms = filteredRooms.length;
  const occupiedCount = filteredRooms.filter(r => r.status === 'occupied').length;
  const vacantCount = filteredRooms.filter(r => r.status === 'vacant').length;
  const maintenanceCount = filteredRooms.filter(r => r.status === 'maintenance').length;
  const totalTenants = filteredTenants.length;

  // Unpaid invoices
  const unpaidInvoices = useMemo(() => {
    return filteredInvoices.filter(i => i.status !== 'paid');
  }, [filteredInvoices]);

  const totalTunggakan = useMemo(() => {
    return unpaidInvoices.reduce((sum, inv) => sum + (Number(inv.amount || 0) - Number(inv.paid_amount || 0)), 0);
  }, [unpaidInvoices]);

  const totalTerlambat = useMemo(() => {
    const overdueInvoices = unpaidInvoices.filter(i => overdueDays(i.due_date) > 0);
    return overdueInvoices.reduce((sum, inv) => sum + (Number(inv.amount || 0) - Number(inv.paid_amount || 0)), 0);
  }, [unpaidInvoices]);

  // Current Month Finance
  const currentMonthKey = today().slice(0, 7); // YYYY-MM
  const monthTransactions = useMemo(() => {
    return filteredTransactions.filter(t => String(t.transaction_date).slice(0, 7) === currentMonthKey);
  }, [filteredTransactions, currentMonthKey]);

  const monthIncome = useMemo(() => {
    return monthTransactions
      .filter(t => Number(t.amount) > 0)
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [monthTransactions]);

  const monthExpense = useMemo(() => {
    return Math.abs(
      monthTransactions
        .filter(t => Number(t.amount) < 0)
        .reduce((sum, t) => sum + Number(t.amount), 0)
    );
  }, [monthTransactions]);

  // Uncontacted vs Contacted inside unpaid bills
  const notContacted = unpaidInvoices.filter(i => i.collection_status !== 'contacted');
  const contacted = unpaidInvoices.filter(i => i.collection_status === 'contacted');

  const notContactedTotal = notContacted.reduce((sum, i) => sum + (Number(i.amount || 0) - Number(i.paid_amount || 0)), 0);
  const contactedTotal = contacted.reduce((sum, i) => sum + (Number(i.amount || 0) - Number(i.paid_amount || 0)), 0);

  return (
    <div id="dashboard-container" className="space-y-6">
      {/* Metrics Grid */}
      <section className="stats-grid" id="dashboard-stats-grid">
        <article className="stat-card" id="card-income">
          <div className="stat-icon green">
            <WalletCards />
          </div>
          <p>Pemasukan ({currentMonthKey})</p>
          <h2>{rupiah(monthIncome)}</h2>
        </article>

        <article className="stat-card" id="card-expense">
          <div className="stat-icon orange">
            <CircleDollarSign />
          </div>
          <p>Pengeluaran ({currentMonthKey})</p>
          <h2>{rupiah(monthExpense)}</h2>
        </article>

        <article className="stat-card" id="card-occupancy">
          <div className="stat-icon blue">
            <Home />
          </div>
          <p>Okupansi Kamar</p>
          <h2>
            {occupiedCount}
            <small>/ {totalRooms} Kamar</small>
          </h2>
          <div className="bar">
            <span style={{ width: `${totalRooms ? (occupiedCount / totalRooms) * 100 : 0}%` }} />
          </div>
          <span className="muted">
            {vacantCount} Kosong · {maintenanceCount} Perawatan
          </span>
        </article>

        <article className="stat-card" id="card-tunggakan">
          <div className="stat-icon purple">
            <FileText />
          </div>
          <p>Total Tunggakan</p>
          <h2>{rupiah(totalTunggakan)}</h2>
          <span className="muted">{unpaidInvoices.length} tagihan belum lunas</span>
          <span className="status-alert">Terlambat: {rupiah(totalTerlambat)}</span>
        </article>
      </section>

      {/* Main Grid: Room Status & Collections */}
      <section className="content-grid" id="dashboard-content-grid">
        {/* Room list and quick summary */}
        <div className="panel room-panel" id="room-occupancy-panel">
          <div className="panel-heading">
            <div>
              <h3>Status Kamar Terkini</h3>
              <p>Daftar seluruh kamar aktif dan status huniannya</p>
            </div>
          </div>
          {filteredRooms.length === 0 ? (
            <div className="empty">Belum ada kamar yang terdaftar.</div>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {filteredRooms.map(r => {
                const tenant = filteredTenants.find(t => t.room_id === r.id);
                return (
                  <div className="db-room" key={r.id}>
                    <div>
                      <b>Kamar {r.room_number}</b>
                      <span>{r.status === 'occupied' ? (tenant?.full_name || 'Terisi') : r.status === 'maintenance' ? 'Dalam Perawatan' : 'Kosong'}</span>
                    </div>
                    <strong>{rupiah(r.monthly_rate)}</strong>
                    <span className={`status ${r.status}`}>
                      {r.status === 'occupied' ? 'Terisi' : r.status === 'maintenance' ? 'Perawatan' : 'Kosong'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Unpaid / Outstandingpenagihan Panel */}
        <div className="panel payment-panel" id="collection-billing-panel">
          <div className="panel-heading">
            <div>
              <h3>Ringkasan Penagihan</h3>
              <p>{notContacted.length} perlu ditagih · {contacted.length} sudah ditagih</p>
            </div>
            <span className="count">{unpaidInvoices.length}</span>
          </div>

          <div className="dashboard-collection-summary">
            <div>
              <span>Perlu Ditagih</span>
              <b>{rupiah(notContactedTotal)}</b>
            </div>
            <div>
              <span>Sudah Ditagih</span>
              <b>{rupiah(contactedTotal)}</b>
            </div>
            <div>
              <span>Terlambat Jatuh Tempo</span>
              <b>{rupiah(totalTerlambat)}</b>
            </div>
          </div>

          <div className="space-y-3 mt-4 max-h-[300px] overflow-y-auto pr-1">
            {unpaidInvoices.slice(0, 5).map(i => {
              const tenant = filteredTenants.find(x => x.id === i.tenant_id);
              const room = filteredRooms.find(x => x.id === i.room_id);
              const remainAmount = Number(i.amount || 0) - Number(i.paid_amount || 0);
              const isOverdue = overdueDays(i.due_date) > 0;
              return (
                <div className="payment" key={i.id}>
                  <div className="avatar">{initials(tenant?.full_name)}</div>
                  <div className="payment-info">
                    <b>{tenant?.full_name || 'Penghuni'}</b>
                    <span>
                      Kamar {room?.room_number || '-'} · Sisa: {rupiah(remainAmount)} · {i.collection_status === 'contacted' ? 'Sudah ditagih' : isOverdue ? `Terlambat ${overdueDays(i.due_date)} hari` : 'Belum ditagih'}
                    </span>
                  </div>
                </div>
              );
            })}
            {unpaidInvoices.length === 0 && (
              <div className="empty">Tidak ada tagihan yang belum dibayar. Luar biasa!</div>
            )}
          </div>
        </div>
      </section>

      {/* Transaction List */}
      <section className="panel transaction-panel" id="recent-transactions-panel">
        <div className="panel-heading">
          <div>
            <h3>Transaksi Kas Terbaru</h3>
            <p>Histori pemasukan dan pengeluaran tunai aktual</p>
          </div>
        </div>
        {filteredTransactions.length === 0 ? (
          <div className="empty">Belum ada transaksi keuangan yang tercatat.</div>
        ) : (
          <div className="transaction-list">
            {filteredTransactions.slice(0, 6).map(t => (
              <div className="transaction" key={t.id}>
                <div className={`transaction-icon ${Number(t.amount) > 0 ? 'income' : 'expense'}`}>
                  <WalletCards size={19} />
                </div>
                <div>
                  <b>{t.description}</b>
                  <span>{t.category} · {t.transaction_date}</span>
                </div>
                <strong className={Number(t.amount) > 0 ? 'income' : 'expense'}>
                  {Number(t.amount) > 0 ? '+' : '−'}
                  {rupiah(Math.abs(Number(t.amount)))}
                </strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
