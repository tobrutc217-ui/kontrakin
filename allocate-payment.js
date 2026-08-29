import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseMoney(value) {
  if (typeof value === 'number') return Math.floor(value);
  return Number(String(value || '').replace(/\D/g, '')) || 0;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { tenant_id, amount, method = 'manual' } = req.body || {};
    const paymentAmount = parseMoney(amount);
    if (!tenant_id || paymentAmount <= 0) return res.status(400).json({ error: 'tenant_id and positive amount required' });

    const { data: invoices, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('tenant_id', tenant_id)
      .in('status', ['unpaid', 'overdue'])
      .order('period_start', { ascending: true });
    if (invoiceError) throw invoiceError;

    const { data: payments, error: paymentReadError } = await supabase
      .from('payments')
      .select('id, amount, allocation')
      .eq('tenant_id', tenant_id)
      .order('paid_at', { ascending: true });
    if (paymentReadError) throw paymentReadError;

    const allocated = new Map();
    for (const p of payments || []) {
      const list = Array.isArray(p.allocation) ? p.allocation : (typeof p.allocation === 'string' ? JSON.parse(p.allocation || '[]') : []);
      for (const a of list) {
        if (!a?.invoice_id) continue;
        const v = Number(a.amount_allocated ?? a.amount ?? 0);
        allocated.set(a.invoice_id, (allocated.get(a.invoice_id) || 0) + v);
      }
    }

    let remaining = paymentAmount;
    const allocations = [];

    for (const inv of invoices || []) {
      if (remaining <= 0) break;
      const total = Number(inv.amount || 0) + Number(inv.late_fee || 0);
      const alreadyPaid = allocated.get(inv.id) || 0;
      const outstanding = Math.max(0, total - alreadyPaid);
      if (outstanding <= 0) continue;

      const take = Math.min(remaining, outstanding);
      allocations.push({ invoice_id: inv.id, amount_allocated: take });
      remaining -= take;
    }

    if (allocations.length === 0) return res.status(400).json({ error: 'no outstanding invoices for tenant' });

    const { data: payment, error: paymentInsertError } = await supabase
      .from('payments')
      .insert([{ tenant_id, amount: paymentAmount, method, allocation: allocations }])
      .select()
      .single();
    if (paymentInsertError) throw paymentInsertError;

    // Update status only after the payment allocation is persisted.
    for (const a of allocations) {
      const inv = (invoices || []).find(i => i.id === a.invoice_id);
      const total = Number(inv.amount || 0) + Number(inv.late_fee || 0);
      const newPaid = (allocated.get(inv.id) || 0) + a.amount_allocated;
      const status = newPaid >= total ? 'paid' : (String(inv.status) === 'overdue' ? 'overdue' : 'unpaid');
      const { error } = await supabase.from('invoices').update({ status }).eq('id', inv.id);
      if (error) throw error;
    }

    // Keuangan: one income transaction for the real amount received.
    // If your transactions table has extra required columns, add them in this insert.
    await supabase.from('transactions').insert([{
      type: 'payment',
      amount: paymentAmount,
      source: method,
    }]);

    return res.status(200).json({
      payment,
      allocations,
      applied: paymentAmount - remaining,
      remaining_credit: remaining,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error', detail: err.message });
  }
}
