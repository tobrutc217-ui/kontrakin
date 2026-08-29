import { createClient } from '@supabase/supabase-js';
import { computeProrata } from '../lib/prorata.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { tenant_id, new_billing_day } = req.body || {};
    const newDay = Number(new_billing_day);
    if (!tenant_id || !Number.isInteger(newDay) || newDay < 1 || newDay > 31) {
      return res.status(400).json({ error: 'tenant_id and new_billing_day (1..31) required' });
    }

    const { data: tenant, error: tenantError } = await supabase.from('tenants').select('*').eq('id', tenant_id).single();
    if (tenantError || !tenant) return res.status(404).json({ error: 'tenant not found' });
    const { data: room, error: roomError } = await supabase.from('rooms').select('*').eq('id', tenant.room_id).single();
    if (roomError || !room) return res.status(404).json({ error: 'room not found' });

    const oldDay = Number(tenant.billing_day || new Date(`${tenant.start_date}T00:00:00`).getDate());
    const result = computeProrata(Number(room.rate ?? room.monthly_rate), oldDay, newDay);

    const { data: updatedTenant, error: updateError } = await supabase
      .from('tenants')
      .update({ billing_day: newDay })
      .eq('id', tenant_id)
      .select()
      .single();
    if (updateError) throw updateError;

    // Record the one-time adjustment separately. Monthly invoice amounts stay untouched.
    let adjustment = null;
    if (result.amount !== 0) {
      const { data, error } = await supabase.from('prorata_adjustments').insert([{
        tenant_id,
        old_billing_day: oldDay,
        new_billing_day: newDay,
        days_shifted: result.shiftDays,
        amount: result.amount,
        adjustment_date: new Date().toISOString().slice(0, 10),
        status: 'unpaid',
      }]).select().single();
      if (error) throw error;
      adjustment = data;
    }

    return res.status(200).json({ tenant: updatedTenant, prorata: result, adjustment });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error', detail: err.message });
  }
}
