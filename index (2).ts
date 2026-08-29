import { createClient } from 'npm:@supabase/supabase-js@2'
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const rupiah=new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0})
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{
 const url=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, resend=Deno.env.get('RESEND_API_KEY'), from=Deno.env.get('INVOICE_FROM_EMAIL')||'Kontrakin <onboarding@resend.dev>'
 if(!resend)throw new Error('RESEND_API_KEY belum diatur di Supabase secrets')
 const admin=createClient(url,key), now=new Date(), iso=(d:Date)=>d.toISOString().slice(0,10), add=(n:number)=>{const d=new Date(now);d.setDate(d.getDate()+n);return iso(d)}, today=iso(now)
 const due=new Map<string,string>([[add(3),'H-3'],[add(1),'H-1'],[today,'H0'],[add(-1),'H+1']])
 const {data:invoices,error}=await admin.from('invoices').select('id, amount, due_date, status, tenants(full_name), rooms(room_number, houses(properties(name,admin_email)))').in('status',['unpaid','overdue']).in('due_date',[...due.keys()]);if(error)throw error
 let sent=0
 for(const i of invoices||[]){const reminder=due.get(i.due_date);if(!reminder)continue;const tenant=Array.isArray(i.tenants)?i.tenants[0]:i.tenants;const room=Array.isArray(i.rooms)?i.rooms[0]:i.rooms;const house=Array.isArray(room?.houses)?room.houses[0]:room?.houses;const prop=Array.isArray(house?.properties)?house.properties[0]:house?.properties;const to=prop?.admin_email;if(!to)continue
  const {data:already}=await admin.from('invoice_reminder_log').select('id').eq('invoice_id',i.id).eq('reminder_key',reminder).maybeSingle();if(already)continue
  const overdue=reminder==='H+1', subject=`${overdue?'⚠️ Tagihan terlambat':'🔔 Pengingat tagihan'} · ${prop?.name||'Kontrakin'} · Kamar ${room?.room_number||'-'}`
  const html=`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#26312d"><h2>${prop?.name||'Kontrakin'}</h2><p><b>${overdue?'Tagihan sudah melewati jatuh tempo.':`Pengingat ${reminder}.`}</b></p><p>Penghuni: <b>${tenant?.full_name||'-'}</b><br/>Kamar: <b>${room?.room_number||'-'}</b><br/>Nominal: <b>${rupiah.format(Number(i.amount))}</b><br/>Jatuh tempo: <b>${i.due_date}</b></p><p>Silakan cek pembayaran di dashboard Kontrakin.</p></div>`
  const resp=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${resend}`},body:JSON.stringify({from,to:[to],subject,html})});const result=await resp.json();if(!resp.ok)throw new Error(result?.message||'Resend gagal mengirim email');await admin.from('invoice_reminder_log').insert({invoice_id:i.id,reminder_key:reminder});sent++
 }
 return new Response(JSON.stringify({ok:true,sent}),{headers:{...cors,'Content-Type':'application/json'},status:200})
}catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:String(e)}),{headers:{...cors,'Content-Type':'application/json'},status:400})}})
