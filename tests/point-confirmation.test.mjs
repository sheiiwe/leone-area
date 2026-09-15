import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
let handler,sendFailure=false,sent=[],updates=[],claims=0;
const secret='test-internal-token';
const row={richiesta_id:'00000000-0000-0000-0000-000000000001',destinatario:'customer@example.invalid',servizio:'Servizio <script>unsafe</script>',partner:'Partner & prova'};
globalThis.__SMTPClient=class {async send(message){if(sendFailure)throw Error('SMTP unavailable');sent.push(message)}async close(){}};
globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://project.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-key',SMTP_USER:'sender@example.invalid',SMTP_PASS:'test-password',SMTP_HOST:'smtp.example.invalid'}[name])},serve:fn=>{handler=fn}};
globalThis.fetch=async(url,options={})=>{
 if(url.includes('point_mail_config'))return Response.json([{dispatch_token:secret}]);
 if(url.includes('rpc/point_claim_confirmation')){claims++;return Response.json([row])}
 if(options.method==='PATCH'){updates.push(JSON.parse(options.body));return new Response(null,{status:204})}
 throw Error('Unexpected network call');
};
const directory=await mkdtemp(join(tmpdir(),'point-mail-test-'));
try{
 const source=(await readFile(new URL('../supabase/functions/point-confirmation/index.ts',import.meta.url),'utf8')).replace("import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';",'const SMTPClient = globalThis.__SMTPClient;');
 const modulePath=join(directory,'handler.ts');await writeFile(modulePath,source);await import(pathToFileURL(modulePath));
 const request=(token,body={})=>new Request('https://example.invalid',{method:'POST',headers:token?{'x-point-token':token}:{},body:JSON.stringify(body)});
 assert.equal((await handler(request())).status,401);
 assert.equal((await handler(request('wrong-token'))).status,401);
 assert.equal(claims,0);
 assert.equal((await handler(request(secret,{health:true}))).status,200);
 assert.equal(claims,0);assert.equal(sent.length,0);
 assert.equal((await handler(request(secret))).status,200);
 assert.equal(sent.length,1);assert.equal(sent[0].to,row.destinatario);
 assert.ok(sent[0].html.includes('&lt;script&gt;'));assert.ok(!sent[0].html.includes('<script>'));
 assert.ok(sent[0].content.includes('deve ancora essere effettuata'));
 assert.equal(updates.at(-1).stato,'sent');
 sendFailure=true;
 assert.equal((await handler(request(secret))).status,502);
 assert.equal(updates.at(-1).stato,'failed');
 assert.equal(sent.length,1);
 row.destinatario='victim@example.invalid,other@example.invalid';
 assert.equal((await handler(request(secret))).status,422);
 assert.equal(updates.at(-1).tentativi,3);
 assert.equal(sent.length,1);
 console.log('PASS: auth, read-only health, fixed recipient, escaping, success/failure status, invalid recipient rejection. No network or real email used.');
}finally{await rm(directory,{recursive:true,force:true})}
