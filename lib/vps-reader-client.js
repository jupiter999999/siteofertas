'use strict';
/* Leitor VPS opcional: somente servidor a servidor, sem cookies ou credenciais da Shopee no site. */
function asPrice(raw){
 const n=Number(raw);
 return Number.isFinite(n)&&n>0&&n<1000000?Math.round(n*100)/100:null;
}
function safeImage(raw){
 try{const u=new URL(String(raw||''));return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u.href:''}catch{return ''}
}
async function fromVps(original){
 const endpoint=process.env.DRINKA_READER_URL;
 const secret=process.env.DRINKA_READER_SECRET;
 if(!endpoint||!secret)return null;
 let base;
 try{base=new URL(endpoint);if(base.protocol!=='https:'||base.username||base.password||base.port)return null}
 catch{return null}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),27000);
 try{
  const r=await fetch(new URL('/lookup',base).href,{
   method:'POST',signal:controller.signal,
   headers:{'Content-Type':'application/json','x-drinka-reader-secret':secret},
   body:JSON.stringify({url:original})
  });
  if(r.status===503||r.status===404)return null;
  if(!r.ok)return null;
  const data=await r.json();
  if(!data||data.store!=='Shopee')return null;
  const name=String(data.title||'').replace(/\s+/g,' ').trim().slice(0,200);
  const image=safeImage(data.image);
  const price=asPrice(data.price),oldPrice=asPrice(data.oldPrice);
  if(!name||name.length<9||!/shopee\.com|shope\.ee|shp\.ee/.test(String(data.productUrl||'')))return null;
  return {store:'Shopee',title:name,image,price,oldPrice:oldPrice&&price&&oldPrice>price?oldPrice:null,
   source:'vps_chrome',priceSource:price?'visible_product':null,
   partial:!(image&&price),warning:price?null:'O leitor da VPS identificou o anúncio, mas não conseguiu confirmar o preço atual.'};
 }catch{return null}finally{clearTimeout(timer)}
}
module.exports={fromVps};
