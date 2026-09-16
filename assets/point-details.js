import {esc} from './point-shared.js';

// Editorial presentation based on the partner's visible Point page (16/09/2026).
// No membership download, direct application or automatic partner referral.
const membership = {
 subtitle:'Una rete al fianco delle piccole e medie imprese.',
 introTitle:'Rappresentanza, servizi e opportunità per la tua impresa',
 paragraphs:[
  'Conflavoro rappresenta le piccole e medie imprese e affianca gli imprenditori nelle esigenze legate al lavoro e allo sviluppo dell’attività. Il tesseramento permette di entrare nella rete associativa e conoscere i servizi e le opportunità dedicati alle aziende aderenti.',
  'Tra gli ambiti presentati dall’associazione rientrano la contrattazione collettiva, l’assistenza sindacale datoriale, la formazione e il supporto alle imprese. Il contatto con Conflavoro consente di approfondire quali strumenti siano adatti alla propria attività.'
 ],
 benefits:[
  {image:'supporto.png',title:'Supporto alle scelte aziendali',text:'Orientamento sulle esigenze dell’impresa, sull’accesso al credito e sulla finanza agevolata, con attenzione alla gestione dei costi e alle convenzioni disponibili.'},
  {image:'formazione.png',title:'Formazione e crescita professionale',text:'Percorsi formativi, anche obbligatori, e opportunità legate alla sicurezza e alle certificazioni, da individuare in base al settore e alle necessità dell’azienda.'},
  {image:'tutela.png',title:'Assistenza legale e sindacale',text:'Affiancamento nei rapporti di lavoro e nelle questioni sindacali datoriali, con aggiornamenti e supporto nella gestione delle esigenze aziendali.'}
 ],
 conditions:'Quote associative, modalità di adesione e condizioni dei singoli servizi saranno approfondite con Conflavoro. La richiesta di ricontatto non attiva il tesseramento e non comporta l’acquisto di un servizio.'
};
function callout(s){return '<div class="partner-callout"><span class="contact-dot" aria-hidden="true"></span><div><strong>L’azienda verrà contattata dal partner</strong><span>Leone Consulting raccoglie la richiesta e cura la segnalazione a '+esc(s.partner)+'.</span></div></div>'}
export function detailIntro(s){
 const m=s.id==='p1'?membership:null;
 const subtitle=m?.subtitle||s.descrizione;
 let result='<a class="back" href="/conflavoro/">← Tutti i servizi e le convenzioni</a><section class="detail-hero '+(m?'membership-hero':'')+'">'+(m?'<img class="hero-photo" src="/assets/conflavoro/tesseramento-header.jpg" alt="" fetchpriority="high">':'')+'<div class="detail-hero-content"><div class="eyebrow">'+esc(s.categoria)+'</div><h1>'+esc(s.titolo)+'</h1><p class="detail-subtitle">'+esc(subtitle)+'</p><p class="detail-partner">'+(s.partner==='Conflavoro'?'Conflavoro · Associazione di categoria':'Partner della rete Conflavoro · '+esc(s.partner))+'</p><a class="button" href="#richiedi-contatto">Richiedi di essere ricontattato →</a></div></section>'+callout(s);
 if(m){
  result+='<section class="detail-intro"><div><div class="eyebrow">Il tesseramento</div><h2>'+esc(m.introTitle)+'</h2>'+m.paragraphs.map(p=>'<p>'+esc(p)+'</p>').join('')+'</div><figure><img src="/assets/conflavoro/tesseramento.png" alt="Presentazione della tessera associativa Conflavoro" loading="lazy"><figcaption>La tessera associativa Conflavoro</figcaption></figure></section><section class="benefits-section"><div class="eyebrow">Gli ambiti di supporto</div><h2>Cosa puoi approfondire con Conflavoro</h2><div class="benefit-grid">'+m.benefits.map(b=>'<article class="benefit-card"><img src="/assets/conflavoro/'+b.image+'" alt="" loading="lazy"><h3>'+esc(b.title)+'</h3><p>'+esc(b.text)+'</p></article>').join('')+'</div><p class="detail-conditions">'+esc(m.conditions)+'</p></section>';
 }else{
  result+='<section class="service-overview"><div class="eyebrow">Il servizio</div><h2>Una soluzione per la tua attività</h2><p>'+esc(s.descrizione)+'</p><div class="notice">'+esc(s.requisiti)+'</div></section>';
 }
 return result;
}
export function detailFaq(s){return '<section class="detail-faq"><div class="eyebrow">Prima di inviare la richiesta</div><h2>Domande frequenti</h2><details><summary>Chi gestisce la mia richiesta?</summary><p>Leone Consulting riceve i recapiti e il servizio di interesse, poi cura la segnalazione tramite Conflavoro Point. Il partner '+esc(s.partner)+' si occupa del successivo contatto.</p></details><details><summary>Devo compilare subito moduli o inviare documenti?</summary><p>No. Per richiedere il ricontatto basta compilare il modulo in questa pagina. Eventuali moduli e documenti necessari saranno gestiti successivamente con Leone Consulting.</p></details><details><summary>La richiesta attiva già il servizio'+(s.id==='p1'?' o il tesseramento':'')+'?</summary><p>No. L’invio serve a richiedere il contatto. Requisiti, costi e condizioni vengono verificati successivamente con il partner, prima di un’eventuale adesione.</p></details></section>'}
