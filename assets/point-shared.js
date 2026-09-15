import {SUPA_URL,SUPA_KEY} from './config.js';
export const db=window.supabase.createClient(SUPA_URL,SUPA_KEY,{auth:{storageKey:'leone-amministrazione',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const pageUrl=s=>new URL('/conflavoro/?servizio='+encodeURIComponent(s.slug),location.origin).href;
export function post(s,short=false){
 const link=pageUrl(s);
 if(short)return s.titolo+' con '+s.partner+'.\nRichiedi il ricontatto dal partner tramite Leone Consulting, Conflavoro Point.\n'+link;
 return '🏢 '+s.titolo+'\n\n'+s.descrizione+'\n\n'+(s.tipo==='Convenzione'?'Convenzione dedicata agli associati Conflavoro.\n\n':'')+'🤝 Con Leone Consulting, Conflavoro Point, puoi richiedere di essere ricontattato dal partner '+s.partner+'. Raccogliamo la tua richiesta e avviamo la segnalazione attraverso il portale Conflavoro.\n\n'+s.requisiti+'\n\n👉 Richiedi di essere ricontattato: '+link+'\n\n#LeoneConsulting #ConflavoroPoint #ServiziAlleImprese';
}
export function toast(t){document.querySelector('.toast')?.remove();const n=document.createElement('div');n.className='toast';n.setAttribute('role','status');n.textContent=t;document.body.append(n);setTimeout(()=>n.remove(),3500)}
export async function copy(t){try{await navigator.clipboard.writeText(t);toast('Copiato')}catch{const d=document.createElement('dialog');const area=document.createElement('textarea');area.value=t;const b=document.createElement('button');b.textContent='Chiudi';b.onclick=()=>d.remove();d.append(area,b);document.body.append(d);d.showModal();area.select()}}
export function download(name,data,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
export function footer(){return '<footer class="foot"><p>Leone Consulting di Leonardo Angelucci · Conflavoro Point</p><p>Via Pia 42, 00049 Velletri (RM) · P.IVA 18231181001</p><a href="/conflavoro/privacy.html">Privacy richieste di ricontatto</a><a href="https://leoneconsultingitalia.it">Sito principale</a></footer>'}
export async function poster(s){
 await document.fonts.ready;
 const c=document.createElement('canvas');c.width=1080;c.height=1350;const x=c.getContext('2d');
 x.fillStyle='#111e35';x.fillRect(0,0,1080,1350);
 x.fillStyle='#ef251c';x.fillRect(0,0,16,1350);x.fillRect(70,240,78,8);
 x.strokeStyle='#ffffff0d';x.lineWidth=2;for(let i=0;i<5;i++){x.beginPath();x.arc(1100,540,180+i*75,0,Math.PI*2);x.stroke()}
 const img=new Image();img.src='/assets/logo.png';await img.decode();
 x.fillStyle='#fff';x.beginPath();x.roundRect(70,60,98,98,15);x.fill();x.drawImage(img,79,69,80,80);
 x.fillStyle='#fff';x.font='800 32px Manrope,Arial';x.fillText('LEONE CONSULTING',190,105);
 x.fillStyle='#b7c3d5';x.font='500 24px "DM Sans",Arial';x.fillText('CONFLAVORO POINT',190,144);
 x.fillStyle='#fb746a';x.font='700 22px "DM Sans",Arial';x.fillText(s.categoria.toUpperCase(),70,211);
 const wrap=(txt,y,size,maxLines,color,weight=700)=>{
  x.font=weight+' '+size+'px Manrope,Arial';x.fillStyle=color;
  const words=txt.split(/\s+/);const lines=[];let line='';
  for(const w of words){if(x.measureText(line+' '+w).width>920&&line){lines.push(line);line=w}else line+=(line?' ':'')+w}if(line)lines.push(line);
  if(lines.length>maxLines&&size>24)return wrap(txt,y,size-3,maxLines,color,weight);
  lines.forEach((l,i)=>x.fillText(l,70,y+i*size*1.22));return y+lines.length*size*1.22;
 };
 let y=wrap(s.titolo,340,65,4,'#fff',800);
 x.fillStyle='#b7c3d5';x.font='600 25px "DM Sans",Arial';x.fillText('Partner: '+s.partner,70,y+35);
 y=wrap(s.descrizione,y+105,31,4,'#d1d9e6',500);
 if(s.tipo==='Convenzione'){x.fillStyle='#fb746a';x.font='600 24px "DM Sans",Arial';x.fillText('DEDICATA AGLI ASSOCIATI CONFLAVORO',70,930)}
 x.fillStyle='#fff';x.beginPath();x.roundRect(55,987,970,287,22);x.fill();
 x.fillStyle='#172033';x.font='800 36px Manrope,Arial';x.fillText('Vuoi essere ricontattato?',85,1050);
 x.font='500 25px "DM Sans",Arial';x.fillText('Avviamo la segnalazione al partner per te.',85,1099);
 x.fillStyle='#ef251c';x.beginPath();x.roundRect(85,1130,620,65,10);x.fill();x.fillStyle='#fff';x.font='700 25px "DM Sans",Arial';x.fillText('RICHIEDI IL CONTATTO · LINK NEL POST',107,1172);
 x.fillStyle='#677080';x.font='400 19px "DM Sans",Arial';x.fillText('Disponibilità e condizioni sono verificate dal partner.',85,1236);
 x.fillStyle='#b7c3d5';x.font='500 21px "DM Sans",Arial';x.fillText('leoneconsultingitalia.it',70,1315);
 return c;
}
