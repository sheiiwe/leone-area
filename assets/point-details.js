import {esc} from './point-shared.js';
import {serviceContent} from './point-content.js?v=20261023-point';

export function detailIntro(s){
 const content=serviceContent[s.id];
 const subtitle=s.id==='p1'?'Una rete al fianco delle piccole e medie imprese.':s.descrizione;
 let result='<a class="back" href="/conflavoro/">← Tutti i servizi e le convenzioni</a><section class="detail-hero '+(s.id==='p1'?'membership-hero':'')+'"><div class="detail-hero-content"><div class="eyebrow">'+esc(s.categoria)+'</div><h1>'+esc(s.titolo)+'</h1><p class="detail-subtitle">'+esc(subtitle)+'</p><p class="detail-partner">'+(s.partner==='Conflavoro'?'Conflavoro · Associazione di categoria':'Partner della rete Conflavoro · '+esc(s.partner))+'</p><a class="button" href="#richiedi-contatto">Richiedi di essere ricontattato →</a></div></section><div class="partner-callout"><span class="contact-dot" aria-hidden="true"></span><strong>Verrete ricontattati dal partner</strong></div>';
 if(content){
  result+='<section class="detail-intro"><div class="eyebrow">'+(s.id==='p1'?'Il tesseramento':'Il servizio')+'</div><h2>'+esc(content.title)+'</h2><p>'+esc(content.intro)+'</p><h3>A chi si rivolge</h3><p>'+esc(content.audience)+'</p></section>';
  result+='<section class="benefits-section"><div class="eyebrow">La proposta del partner</div><h2>Cosa puoi approfondire</h2><div class="benefit-grid">'+content.points.map(([title,text],i)=>'<article class="benefit-card"><span class="benefit-number" aria-hidden="true">'+String(i+1).padStart(2,'0')+'</span><h3>'+esc(title)+'</h3><p>'+esc(text)+'</p></article>').join('')+'</div><div class="service-preparation"><h3>Per il primo contatto</h3><p>'+esc(content.prepare)+'</p></div><p class="detail-conditions">'+esc(s.requisiti)+(content.note?' '+esc(content.note):'')+'</p></section>';
 }else{
  result+='<section class="service-overview"><div class="eyebrow">Il servizio</div><h2>Una soluzione per la tua attività</h2><p>'+esc(s.descrizione)+'</p><div class="notice">'+esc(s.requisiti)+'</div></section>';
 }
 return result;
}
export function detailFaq(s){return '<section class="detail-faq"><div class="eyebrow">Prima di inviare la richiesta</div><h2>Domande frequenti</h2><details><summary>Chi gestisce la mia richiesta?</summary><p>Leone Consulting riceve i recapiti e il servizio di interesse, poi cura la segnalazione tramite Conflavoro Point. Il partner '+esc(s.partner)+' si occupa del successivo contatto.</p></details><details><summary>Devo compilare subito moduli o inviare documenti?</summary><p>No. Per richiedere il ricontatto basta compilare il modulo in questa pagina. Eventuali moduli e documenti necessari saranno gestiti successivamente con Leone Consulting.</p></details><details><summary>La richiesta attiva già il servizio'+(s.id==='p1'?' o il tesseramento':'')+'?</summary><p>No. L’invio serve a richiedere il contatto. Requisiti, costi e condizioni vengono verificati successivamente con il partner, prima di un’eventuale adesione.</p></details></section>'}
