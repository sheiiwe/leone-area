// Internal transactional mail worker. Only the database dispatcher can call it.
// HTTP delivery avoids the SMTP client's CPU-limit failures in the Edge runtime.
const base = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sender = 'amministrazione@leoneconsultingitalia.it';
const adminUrl = 'https://area.leoneconsultingitalia.it/amministrazione/';
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

async function db(path: string, options: RequestInit = {}) {
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Database status ${response.status}`);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const emailValid = (value: string) => value.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value);
const reply = (body: object, status = 200) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json'}});
async function sameSecret(a: string, b: string) {
  const encode = new TextEncoder();
  const [x,y] = await Promise.all([a,b].map(s=>crypto.subtle.digest('SHA-256',encode.encode(s))));
  const u=new Uint8Array(x),v=new Uint8Array(y);let difference=0;
  for(let i=0;i<u.length;i++)difference|=u[i]^v[i];
  return difference===0;
}
function frame(title: string, content: string, id: string) {
  return `<!doctype html><html lang="it"><body style="margin:0;background:#f3f5f8;font-family:Arial,sans-serif;color:#172238"><div style="max-width:640px;margin:24px auto;background:white;border-radius:16px;overflow:hidden"><div style="background:#101e37;padding:28px;color:white;font-weight:bold">LEONE CONSULTING · CONFLAVORO POINT</div><div style="padding:28px"><h1 style="font-size:26px">${esc(title)}</h1>${content}<p style="font-size:12px;color:#626d80">Riferimento: ${esc(id)}</p><hr style="border:0;border-top:1px solid #e4e7ed"><p>Leone Consulting di Leonardo Angelucci<br><a href="https://leoneconsultingitalia.it">leoneconsultingitalia.it</a></p></div></div></body></html>`;
}

Deno.serve(async req => {
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  const token=req.headers.get('x-point-token');
  if(!token || token.length>200)return reply({error:'Unauthorized'},401);
  try {
    const config=await db('point_mail_config?id=eq.true&select=dispatch_token,admin_email');
    if(!config?.[0]?.dispatch_token || !await sameSecret(token,config[0].dispatch_token))return reply({error:'Unauthorized'},401);
    const apiKey=Deno.env.get('BREVO_API_KEY') || await db('rpc/point_mail_provider_key',{method:'POST',body:'{}'});
    if(!apiKey)return reply({error:'Email provider configuration missing'},503);
    const body=await req.json().catch(()=>({}));
    // No message is claimed or sent by the authenticated health check.
    if(body.health===true)return reply({ok:true,provider:'brevo',configured:true,admin_email:config[0].admin_email});
    // Read-only delivery verification, limited to an existing outbox message.
    if(body.delivery_status) {
      const {richiesta_id,tipo}=body.delivery_status;
      if(!/^[0-9a-f-]{36}$/i.test(richiesta_id||'') || !['cliente','amministrazione'].includes(tipo))return reply({error:'Invalid reference'},400);
      const rows=await db(`point_mail_outbox?richiesta_id=eq.${richiesta_id}&tipo=eq.${tipo}&select=destinatario,provider_message_id,stato`);
      const item=rows?.[0];
      if(!item?.provider_message_id)return reply({stato:item?.stato||'missing',events:[]});
      const query=new URLSearchParams({messageId:item.provider_message_id,email:item.destinatario,limit:'20',sort:'desc'});
      const response=await fetch(`https://api.brevo.com/v3/smtp/statistics/events?${query}`,{headers:{'api-key':apiKey},signal:AbortSignal.timeout(10000)});
      if(!response.ok)return reply({error:'Delivery status unavailable'},502);
      const report=await response.json();
      return reply({stato:item.stato,events:(report.events||[]).map((e: {event:string,date:string})=>({event:e.event,date:e.date}))});
    }
    const rows=await db('rpc/point_claim_confirmation',{method:'POST',body:'{}'});
    if(!rows?.length)return reply({ok:true,processed:0});
    const row=rows[0];
    const path=`point_mail_outbox?richiesta_id=eq.${encodeURIComponent(row.richiesta_id)}&tipo=eq.${encodeURIComponent(row.tipo)}`;
    const update=(values: object)=>db(path,{method:'PATCH',body:JSON.stringify({...values,updated_at:new Date().toISOString()})});
    if(!emailValid(row.destinatario) || !['cliente','amministrazione'].includes(row.tipo) ||
      (row.tipo==='amministrazione' && row.destinatario!==config[0].admin_email)) {
      await update({stato:'failed',tentativi:3,last_error:'Destinatario non valido o non autorizzato'});
      return reply({ok:false,error:'Invalid recipient'},422);
    }
    let subject: string, textContent: string, htmlContent: string, replyTo: {email:string}|undefined;
    try {
      if(row.tipo==='amministrazione') {
        const requests=await db(`point_richieste?id=eq.${encodeURIComponent(row.richiesta_id)}&select=ragione_sociale,referente,email,telefono,partita_iva,citta,messaggio,created_at`);
        const request=requests?.[0];
        if(!request)throw new Error('Request missing');
        const fields=[['Servizio',row.servizio],['Partner',row.partner],['Azienda',request.ragione_sociale],['Referente',request.referente],['Email',request.email],['Telefono',request.telefono],['Partita IVA',request.partita_iva||'Non indicata'],['Città',request.citta||'Non indicata'],['Richiesta',request.messaggio||'Nessun messaggio aggiuntivo'],['Data',new Date(request.created_at).toLocaleString('it-IT',{timeZone:'Europe/Rome'})]];
        subject=`Nuova richiesta Conflavoro — ${String(row.servizio).replace(/[\r\n]/g,' ')}`;
        textContent=`È arrivata una nuova richiesta dal modulo Conflavoro.\n\n${fields.map(([label,value])=>`${label}: ${value}`).join('\n')}\n\nRiferimento: ${row.richiesta_id}\nGestisci la richiesta: ${adminUrl}\n\nLa segnalazione al partner deve essere effettuata dall’amministrazione.`;
        htmlContent=frame('Nuova richiesta di ricontatto',`<p>È arrivata una richiesta dal sito. Ecco tutti i dati per prenderla in carico.</p><table style="width:100%;border-collapse:collapse">${fields.map(([label,value])=>`<tr><th style="padding:8px;text-align:left;vertical-align:top">${esc(label)}</th><td style="padding:8px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(value)}</td></tr>`).join('')}</table><p><a href="${adminUrl}" style="display:inline-block;background:#ba241d;color:white;padding:14px 20px;border-radius:8px">Apri l’Area Amministrazione</a></p><p>La segnalazione al partner deve essere effettuata dall’amministrazione.</p>`,row.richiesta_id);
        if(emailValid(request.email))replyTo={email:request.email};
      } else {
        subject='Abbiamo ricevuto la tua richiesta — Leone Consulting';
        const explanation='Leone Consulting avvierà la segnalazione tramite Conflavoro Point. Il partner indicato ti ricontatterà ai recapiti forniti per approfondire le esigenze e verificare requisiti, disponibilità e condizioni del servizio.';
        const terms='Questa email conferma soltanto la ricezione della richiesta: la segnalazione al partner deve ancora essere effettuata. La richiesta non costituisce un ordine o un contratto.';
        textContent=`Abbiamo ricevuto la tua richiesta di ricontatto.\n\nServizio: ${row.servizio}\nPartner della rete Conflavoro: ${row.partner}\nRiferimento richiesta: ${row.richiesta_id}\n\n${explanation}\n\n${terms}\n\nLeone Consulting di Leonardo Angelucci\nhttps://leoneconsultingitalia.it\n\nSe non hai inviato tu questa richiesta, puoi ignorare il messaggio.`;
        htmlContent=frame('Abbiamo ricevuto la tua richiesta',`<p>Grazie per aver richiesto di essere ricontattato.</p><p><strong>Servizio:</strong> ${esc(row.servizio)}<br><strong>Partner della rete Conflavoro:</strong> ${esc(row.partner)}</p><p>${explanation}</p><p>${terms}</p><p>Se non hai inviato tu questa richiesta, puoi ignorare il messaggio.</p>`,row.richiesta_id);
        replyTo={email:sender};
      }
    } catch {
      await update({stato:'failed',last_error:'Impossibile preparare il messaggio'});
      return reply({ok:false,error:'Message preparation failed'},500);
    }
    let response: Response;
    try {
      response=await fetch('https://api.brevo.com/v3/smtp/email',{
        method:'POST',headers:{'api-key':apiKey,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),
        body:JSON.stringify({sender:{name:'Leone Consulting',email:sender},to:[{email:row.destinatario}],subject,textContent,htmlContent,replyTo,
          headers:{idempotencyKey:row.idempotency_key},tags:['conflavoro-point',row.tipo]}),
      });
    } catch {
      // An interrupted response may still have been accepted. Retry only inside
      // the provider's idempotency window, with the same persisted UUID.
      await update({last_error:'Risposta del servizio email non ricevuta; verifica automatica in corso'});
      return reply({ok:false,error:'Email response interrupted'},502);
    }
    const result=await response.json().catch(()=>({}));
    const alreadyAccepted=response.status===400 && result.code==='duplicate_parameter' && /idempotenc/i.test(result.message||'');
    if(!response.ok && !alreadyAccepted) {
      const permanent=response.status>=400 && response.status<500 && response.status!==429;
      await update({stato:'failed',last_error:`Servizio email: HTTP ${response.status}`,...(permanent?{tentativi:3}:{})});
      return reply({ok:false,error:'Email provider rejected message'},502);
    }
    if(!alreadyAccepted && !result.messageId) {
      await update({last_error:'Risposta del servizio email incompleta; verifica automatica in corso'});
      return reply({ok:false,error:'Email outcome uncertain'},502);
    }
    // Persist acceptance immediately. If this write fails, the next claim reuses
    // the same idempotency key; a confirmed duplicate is treated as accepted.
    await update({stato:'sent',sent_at:new Date().toISOString(),provider_message_id:result.messageId||row.provider_message_id||null,last_error:null});
    return reply({ok:true,processed:1,tipo:row.tipo});
  } catch {return reply({error:'Mail processing failed'},500)}
});
