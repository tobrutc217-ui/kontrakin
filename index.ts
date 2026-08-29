import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { invoice_id } = await req.json()
    if (!invoice_id) throw new Error('invoice_id wajib diisi')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('INVOICE_FROM_EMAIL') || 'Kontrakin <onboarding@resend.dev>'
    if (!resendKey) throw new Error('RESEND_API_KEY belum diatur di Supabase Edge Function Secrets')

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data: invoice, error } = await admin
      .from('invoices')
      .select('id, amount, due_date, status, tenants(full_name), rooms(room_number, houses(property_id, properties(name,admin_email)))')
      .eq('id', invoice_id)
      .single()

    if (error || !invoice) throw new Error(error?.message || 'Tagihan tidak ditemukan')
    const tenant = Array.isArray(invoice.tenants) ? invoice.tenants[0] : invoice.tenants
    const room = Array.isArray(invoice.rooms) ? invoice.rooms[0] : invoice.rooms
    const house = Array.isArray(room?.houses) ? room.houses[0] : room?.houses
    const property = Array.isArray(house?.properties) ? house.properties[0] : house?.properties
    const adminEmail = property?.admin_email
    if (!adminEmail) throw new Error('Email admin belum diatur di Pengaturan properti')

    const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
    const propertyName = property?.name || 'Properti'
    const subject = `Pengingat tagihan ${propertyName} · Kamar ${room?.room_number || '-'} · ${rupiah.format(Number(invoice.amount))}`
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#20322e">
        <h2>${propertyName}</h2>
        <p>Pengingat untuk admin/pemilik: ada tagihan yang perlu diperhatikan.</p>
        <p>Penghuni: <b>${tenant?.full_name || '-'}</b></p>
        <table cellpadding="8" cellspacing="0" style="border-collapse:collapse">
          <tr><td><b>Kamar</b></td><td>${room?.room_number || '-'}</td></tr>
          <tr><td><b>Jatuh tempo</b></td><td>${invoice.due_date}</td></tr>
          <tr><td><b>Nominal</b></td><td>${rupiah.format(Number(invoice.amount))}</td></tr>
          <tr><td><b>Status</b></td><td>${invoice.status === 'paid' ? 'Lunas' : 'Belum lunas'}</td></tr>
        </table>
        <p>Silakan cek pembayaran dan hubungi penghuni bila diperlukan.</p>
      </div>`

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({ from: fromEmail, to: [adminEmail], subject, html }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result?.message || 'Resend gagal mengirim email')

    return new Response(JSON.stringify({ ok: true, id: result.id }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
