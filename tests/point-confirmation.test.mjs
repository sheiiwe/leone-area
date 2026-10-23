import assert from 'node:assert/strict';
let handler, sent=[], updates=[], claims=0, row, mode='ok', configured=true, vaultConfigured=false, missingRequest=false, patchFailure=false;
const secret='test-internal-token';
const admin='amministrazione@leoneconsultingitalia.it';
const id='00000000-0000-4000-8000-000000000001';
const clientRow={richiesta_id:id,tipo:'cliente',destinatario:'customer@example.invalid',servizio:'Servizio <script>unsafe</script>',partner:'Partner & prova',idempotency_key:'00000000-0000-4000-8000-000000000002'};
const requestData={ragione_sociale:'Azienda <script>test</script>',referente:'Referente Prova',email:'customer@example.invalid',telefono:'5551234567',partita_iva:'12345678901',citta:'Velletri',messaggio:'Richiesta <img src=x onerror=alert(1)>\nseconda riga',created_at:'2026-10-23T12:00:00Z'};
globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://project.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-key',BREVO_API_KEY:configured?'test-provider-key':undefined}[name])},serve:fn=>{handler=fn}};
globalThis.fetch=async(url,options={})=>{
 if(url.includes('point_mail_config'))return Response.json([{dispatch_token:secret,admin_email:admin}]);
 if(url.includes('rpc/point_mail_provider_key'))return Response.json(vaultConfigured?'test-vault-key':null);
 if(url.includes('rpc/point_claim_confirmation')){claims++;return Response.json(row?[row]:[])}
 if(url.includes('point_richieste?'))return Response.json(missingRequest?[]:[requestData]);
 if(options.method==='PATCH'){
   if(patchFailure)throw Error('Database unavailable');
   updates.push({url,...JSON.parse(options.body)});return new Response(null,{status:204});
 }
 if(url.startsWith('https://api.brevo.com/v3/smtp/statistics/events'))return Response.json({events:[{event:'delivered',date:'2026-10-23'}]});
 if(url.includes('point_mail_outbox?'))return Response.json([{...row,stato:'sent',provider_message_id:'<test@example.invalid>'}]);
 if(url==='https://api.brevo.com/v3/smtp/email'){
   sent.push(JSON.parse(options.body));
   if(mode==='timeout')throw Error('Response interrupted');
   if(mode==='rejected')return Response.json({code:'invalid_parameter'},{status:400});
   if(mode==='temporary')return Response.json({code:'unavailable'},{status:503});
   if(mode==='duplicate')return Response.json({code:'duplicate_parameter',message:'Email for this idempotencyKey already processed'},{status:400});
   return Response.json({messageId:'<test@example.invalid>'},{status:201});
 }
 throw Error('Unexpected network call: '+url);
};
await import('../supabase/functions/point-confirmation/index.ts');
const request=(token=secret,body={})=>new Request('https://example.invalid',{method:'POST',headers:token?{'x-point-token':token}:{},body:JSON.stringify(body)});
const reset=()=>{sent=[];updates=[];row={...clientRow};mode='ok';missingRequest=false;patchFailure=false;configured=true};
reset();
assert.equal((await handler(new Request('https://example.invalid'))).status,405);
assert.equal((await handler(request(null))).status,401);
assert.equal((await handler(request('wrong'))).status,401);
assert.equal(claims,0);
assert.equal((await handler(request(secret,{health:true}))).status,200);
assert.equal(claims,0);assert.equal(sent.length,0);
configured=false;assert.equal((await handler(request())).status,503);assert.equal(claims,0);configured=true;
configured=false;vaultConfigured=true;assert.equal((await handler(request(secret,{health:true}))).status,200);assert.equal(claims,0);configured=true;vaultConfigured=false;

assert.equal((await handler(request())).status,200);
assert.equal(sent.length,1);assert.deepEqual(sent[0].to,[{email:clientRow.destinatario}]);
assert.ok(sent[0].htmlContent.includes('&lt;script&gt;'));assert.ok(!sent[0].htmlContent.includes('<script>'));
assert.ok(sent[0].textContent.includes('\n\nServizio:'));assert.ok(sent[0].textContent.includes('deve ancora essere effettuata'));
assert.ok(!sent[0].textContent.includes(requestData.telefono));
assert.equal(updates.at(-1).stato,'sent');assert.equal(updates.at(-1).provider_message_id,'<test@example.invalid>');
assert.ok(updates.at(-1).url.endsWith('&tipo=eq.cliente'));

reset();row={...clientRow,tipo:'amministrazione',destinatario:admin};
assert.equal((await handler(request())).status,200);
assert.deepEqual(sent[0].to,[{email:admin}]);assert.equal(sent[0].replyTo.email,requestData.email);
for(const field of ['referente','email','telefono','partita_iva','citta','messaggio'])assert.ok(sent[0].textContent.includes(requestData[field]));
assert.ok(sent[0].htmlContent.includes('&lt;img'));assert.ok(!sent[0].htmlContent.includes('<script>'));
assert.ok(updates.at(-1).url.endsWith('&tipo=eq.amministrazione'));
assert.equal(sent[0].headers.idempotencyKey,row.idempotency_key);
row.destinatario='other@example.invalid';assert.equal((await handler(request())).status,422);assert.equal(sent.length,1);

reset();mode='temporary';assert.equal((await handler(request())).status,502);assert.equal(updates.at(-1).stato,'failed');assert.equal(updates.at(-1).tentativi,undefined);
reset();mode='rejected';assert.equal((await handler(request())).status,502);assert.equal(updates.at(-1).tentativi,3);
reset();mode='timeout';assert.equal((await handler(request())).status,502);assert.equal(updates.at(-1).stato,undefined);
const originalKey=sent[0].headers.idempotencyKey;
mode='duplicate';assert.equal((await handler(request())).status,200);assert.equal(sent[1].headers.idempotencyKey,originalKey);assert.equal(updates.at(-1).stato,'sent');

reset();patchFailure=true;assert.equal((await handler(request())).status,500);assert.equal(sent.length,1);assert.equal(updates.length,0);
reset();row.destinatario='victim@example.invalid,other@example.invalid';assert.equal((await handler(request())).status,422);assert.equal(sent.length,0);
reset();row={...clientRow,tipo:'amministrazione',destinatario:admin};missingRequest=true;
assert.equal((await handler(request())).status,500);assert.equal(sent.length,0);assert.equal(updates.at(-1).stato,'failed');
reset();row=null;assert.equal((await handler(request())).status,200);assert.equal(sent.length,0);
reset();const claimsBefore=claims;
assert.equal((await handler(request(secret,{delivery_status:{richiesta_id:id,tipo:'cliente'}}))).status,200);
assert.equal(claims,claimsBefore);assert.equal(sent.length,0);
assert.equal((await handler(request(secret,{delivery_status:{richiesta_id:'bad',tipo:'cliente'}}))).status,400);
console.log('PASS: authentication, health, fixed admin recipient, full request details, separate customer confirmation, escaping, independent outcomes, retry safety, idempotency, read-only delivery verification. No network or real email used.');
