import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const dayDiff = (from, to) => Math.max(0, Math.floor((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000));

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { tenant_id } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

    const { data: tenant, error: tenantError } = await supabase.from('tenants').select('*').eq('id', tenant_id).single();
    if (tenantError || !tenant) return res.status(404).json({ error: 'tenant not found' });

    const { data: room, error: roomError } = await supabase.from('rooms').select('*').eq('id', tenant.room_id).single();
    if (roomError || !room) return res.status(404).json({ error: 'room not found' });

    const { data: invoices, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('period_start', { ascending: true });
    if (invoiceError) throw invoiceError;

    const { data: payments, error: paymentError } = await supabase
      .from('payments')
      .select('id, amount, paid_at, allocation')
      .eq('tenant_id', tenant_id)
      .order('paid_at', { ascending: true });
    if (paymentError) throw paymentError;

    // Build the actually allocated amount per invoice from payment allocation JSON.
    // This fixes the old bug where a partial payment was counted as if the whole invoice remained unpaid.
    const allocated = new Map();
    for (const payment of payments || []) {
      const allocation = Array.isArray(payment.allocation)
        ? payment.allocation
        : (typeof payment.allocation === 'string' ? JSON.parse(payment.allocation || '[]') : []);
      for (const item of allocation) {
        if (!item?.invoice_id) continue;
        const value = Number(item.amount_allocated ?? item.amount ?? 0);
        allocated.set(item.invoice_id, (allocated.get(item.invoice_id) || 0) + value);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const unpaid = (invoices || []).map(inv => {
      const total = Number(inv.amount || 0) + Number(inv.late_fee || 0);
      const paid = allocated.get(inv.id) || 0;
      const amount_due = Math.max(0, total - paid);
      const periodStart = inv.period_start || inv.due_date;
      const daysLate = amount_due > 0 && periodStart ? dayDiff(periodStart, today) : 0;
      return { ...inv, period_start: periodStart, total_amount: total, paid_amount: paid, amount_due, daysLate };
    }).filter(inv => inv.amount_due > 0);

    const total_due = unpaid.reduce((sum, inv) => sum + inv.amount_due, 0);
    const overdue_value = unpaid.filter(inv => inv.daysLate > 0).reduce((sum, inv) => sum + inv.amount_due, 0);

    return res.status(200).json({
      tenant,
      room,
      unpaid,
      total_due,
      overdue_value,
      months_late: unpaid.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error', detail: err.message });
  }
}
