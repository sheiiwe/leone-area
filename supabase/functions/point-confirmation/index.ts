import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const base = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
async function db(path: string, options: RequestInit = {}) {
  const response = await fetch(`${base}/rest/v1/${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`Database status ${response.status}`);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const reply = (body: object, status = 200) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json'}});
async function sameSecret(a: string, b: string) {
  const encode = new TextEncoder();
  const [x,y] = await Promise.all([a,b].map(s=>crypto.subtle.digest('SHA-256',encode.encode(s))));
  const u=new Uint8Array(x),v=new Uint8Array(y);let difference=0;
  for(let i=0;i<u.length;i++)difference|=u[i]^v[i];
  return difference===0;
}
Deno.serve(async req => {
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  const token=req.headers.get('x-point-token');
  if(!token || token.length>200)return reply({error:'Unauthorized'},401);
  try {
    const config=await db('point_mail_config?id=eq.true&select=dispatch_token');
    if(!config?.[0]?.dispatch_token || !await sameSecret(token,config[0].dispatch_token))return reply({error:'Unauthorized'},401);
    const user=Deno.env.get('SMTP_USER'),pass=Deno.env.get('SMTP_PASS');
    const host=Deno.env.get('SMTP_HOST')||'smtps.aruba.it';
    if(!user||!pass)return reply({error:'SMTP configuration missing'},503);
    // Read-only authenticated health check: no claims and no messages sent.
    const body=await req.json().catch(()=>({}));
    if(body.health===true)return reply({ok:true,smtp_configured:true});
    const rows=await db('rpc/point_claim_confirmation',{method:'POST',body:'{}'});
    if(!rows?.length)return reply({ok:true,processed:0});
    const row=rows[0];
    const path=`point_mail_outbox?richiesta_id=eq.${encodeURIComponent(row.richiesta_id)}`;
    if(!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(row.destinatario)) {
      await db(path,{method:'PATCH',body:JSON.stringify({stato:'failed',tentativi:3,last_error:'Indirizzo email non valido',updated_at:new Date().toISOString()})});
      return reply({ok:false,error:'Invalid recipient'},422);
    }
    const subject='Abbiamo ricevuto la tua richiesta — Leone Consulting';
    const content=`Abbiamo ricevuto la tua richiesta di ricontatto.\n\nServizio: ${row.servizio}\nPartner della rete Conflavoro: ${row.partner}\nRiferimento richiesta: ${row.richiesta_id}\n\nLeone Consulting avvierà la segnalazione tramite Conflavoro Point. Il partner indicato ti ricontatterà ai recapiti forniti per approfondire le esigenze e verificare requisiti, disponibilità e condizioni del servizio.\n\nQuesta email conferma soltanto la ricezione della richiesta: la segnalazione al partner deve ancora essere effettuata. La richiesta non costituisce un ordine o un contratto.\n\nLeone Consulting di Leonardo Angelucci\nhttps://leoneconsultingitalia.it\n\nSe non hai inviato tu questa richiesta, puoi ignorare il messaggio.`;
    const html=`<!doctype html><html lang="it"><body style="margin:0;background:#f3f5f8;font-family:Arial,sans-serif;color:#172238"><div style="max-width:600px;margin:24px auto;background:white;border-radius:16px;overflow:hidden"><div style="background:#101e37;padding:28px;color:white;font-weight:bold">LEONE CONSULTING <span style="color:#ff625d">· CONFLAVORO POINT</span></div><div style="padding:28px"><h1 style="font-size:26px">Abbiamo ricevuto la tua richiesta</h1><p>Grazie per aver richiesto di essere ricontattato.</p><div style="background:#f3f5f8;padding:18px;border-radius:10px"><strong>Servizio:</strong> ${esc(row.servizio)}<br><strong>Partner della rete Conflavoro:</strong> ${esc(row.partner)}</div><p style="line-height:1.6">Leone Consulting avvierà la segnalazione tramite Conflavoro Point. Il partner indicato ti ricontatterà ai recapiti forniti per approfondire le esigenze e verificare requisiti, disponibilità e condizioni del servizio.</p><p style="line-height:1.6">Questa email conferma soltanto la ricezione della richiesta: la segnalazione al partner deve ancora essere effettuata. La richiesta non costituisce un ordine o un contratto.</p><p style="font-size:12px;color:#626d80">Riferimento: ${esc(row.richiesta_id)}</p><hr style="border:0;border-top:1px solid #e4e7ed"><p><strong>Leone Consulting di Leonardo Angelucci</strong><br><a href="https://leoneconsultingitalia.it" style="color:#ba241d">leoneconsultingitalia.it</a></p><p style="font-size:12px;color:#626d80">Se non hai inviato tu questa richiesta, puoi ignorare il messaggio.</p></div></div></body></html>`;
    const client=new SMTPClient({connection:{hostname:host,port:465,tls:true,auth:{username:user,password:pass}}});
    try {
      await client.send({from:user,to:row.destinatario,subject,content,html});
    } catch {
      await db(path,{method:'PATCH',body:JSON.stringify({stato:'failed',last_error:'Invio SMTP non riuscito',updated_at:new Date().toISOString()})});
      return reply({ok:false,error:'SMTP delivery failed'},502);
    } finally {try{await client.close()}catch{/* Delivery status is independent of connection close. */}}
    // If this write fails after SMTP acceptance, leave 'sending' for manual review.
    // Do not automatically send a second copy after an ambiguous outcome.
    await db(path,{method:'PATCH',body:JSON.stringify({stato:'sent',sent_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:null})});
    return reply({ok:true,processed:1});
  } catch {return reply({error:'Confirmation processing failed'},500)}
});
