'use strict';
/* Public product page preview; never fetch untrusted redirects/hosts. */
const ALLOWED = [
  'shopee.com.br','shopee.com','shopee.sg','shopee.ph','shopee.tw','shopee.co.id',
  'shope.ee','shp.ee','mercadolivre.com.br','mercadolibre.com','mercadolibre.com.br','meli.la',
  'amazon.com.br','amazon.com','amazon.com.mx','amazon.es','amazon.co.uk','amazon.ca',
  'amazon.de','amazon.fr','amazon.it','amazon.in','amazon.com.au','amazon.co.jp',
  'link.amazon','amzn.to','a.co','amzn.com','magazineluiza.com.br','magalu.com'
];
function isAllowed(u){
  return u instanceof URL && u.protocol==='https:' && !u.port &&
    !u.username && !u.password && ALLOWED.some(d=>u.hostname===d||u.hostname.endsWith('.'+d));
}
function shopOf(host){
  if(/(?:^|\.)(?:shopee|shope|shp)\b/i.test(host)||host==='shope.ee'||host==='shp.ee')return 'Shopee';
  if(/(?:mercadolivre|mercadolibre|meli\.la)/i.test(host))return 'Mercado Livre';
  if(/(?:amazon|amzn\.to|amzn\.com|a\.co)/i.test(host))return 'Amazon';
  if(/(?:magalu|magazineluiza)/i.test(host))return 'Magalu';
  return null;
}
function decode(s){
  return String(s||'').replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39|#x27|#34|#(\d+)|#x([\da-f]+));?/gi,(m,dec,hex)=>{
    if(dec||hex){try{return String.fromCodePoint(parseInt(dec||hex,hex?16:10))}catch{return m}}
    return ({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' ','&#39;':"'",'&#x27;':"'",'&#34;':'"'}[m.toLowerCase()]||m);
  }).trim();
}
function attrs(tag){
  const out={};for(const m of tag.matchAll(/([-\w:]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))out[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);return out;
}
function tags(html,selector){
  const result=[];const regex=new RegExp('<'+selector+'\\b[^>]*>','gi');
  for(const m of html.matchAll(regex))result.push(attrs(m[0]));return result;
}
function meta(html,...keys){
  const found=tags(html,'meta');
  for(const key of keys){
    const entry=found.find(x=>(x.property||x.name||x.itemprop||'').toLowerCase()===key.toLowerCase());
    if(entry&&(entry.content||entry.value))return entry.content||entry.value;
  }
  return '';
}
function priceNumber(v){
  if(v===null||v===undefined||v==='')return null;
  let s=String(v).replace(/\s/g,'').replace(/[^0-9.,]/g,'');
  if(!s)return null;
  if(s.includes('.')&&s.includes(','))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  else if(s.includes(','))s=s.replace(',','.');
  const n=Number(s);return Number.isFinite(n)&&n>0&&n<1e7?Math.round(n*100)/100:null;
}
function jsonProducts(html){
  const found=[];
  for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const p=JSON.parse(decode(m[1]));
      const walk=(v,depth=0)=>{
        if(!v||depth>8)return;
        if(Array.isArray(v)){v.forEach(x=>walk(x,depth+1));return}
        if(typeof v!=='object')return;
        const type=String(v['@type']||'').toLowerCase();
        if(type.includes('product')||type==='offer'||type.includes('aggregateoffer'))found.push(v);
        if(v['@graph'])walk(v['@graph'],depth+1);
        if(v.mainEntity)walk(v.mainEntity,depth+1);
        if(v.offers)walk(v.offers,depth+1);
      };walk(p);
    }catch{}
  }
  return found;
}
function pick(obj,...keys){for(const k of keys){const v=obj?.[k];if(v!==undefined&&v!==null&&v!=='')return v}return null}
function imageUrl(x){if(Array.isArray(x))return imageUrl(x[0]);if(x&&typeof x==='object')return imageUrl(x.url||x.contentUrl);return String(x||'')}
function extract(html,finalUrl,store){
  const products=jsonProducts(html);
  const product=products.find(x=>String(x['@type']).toLowerCase().includes('product'))||{};
  const offer=products.find(x=>String(x['@type']).toLowerCase().includes('offer'))||{};
  const pageTitle=decode((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
  const title=decode(meta(html,'og:title','twitter:title','product:name')||product.name||pageTitle);
  let image=imageUrl(meta(html,'og:image:secure_url','og:image','twitter:image')||product.image);
  try{if(image)image=new URL(image,finalUrl).href;if(!image.startsWith('https://'))image=''}catch{image=''}
  let price=priceNumber(meta(html,'product:price:amount','product:sale_price:amount','product:price','price'));
  if(!price)price=priceNumber(pick(offer,'price','lowPrice'));
  if(!price)price=priceNumber(pick(product,'price'));
  // Amazon rendered price - only when a clearly identified buy-box amount exists.
  if(!price && store==='Amazon'){
    const buyBox=(html.match(/<span[^>]+class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*(R\$\s*[\d.,]+)/i)||[])[1];
    if(buyBox)price=priceNumber(buyBox);
  }
  let priceSource=price?'product_metadata':null;
  if(!price&&title){
    const match=String(title).match(/R\$\s*([\d.,]+)/);
    if(match){price=priceNumber(match[1]);if(price)priceSource='product_title'}
  }
  const oldPrice=priceNumber(meta(html,'product:original_price:amount','product:original_price','original_price'));
  const generic=/^(shopee|amazon(?:\.com)?|mercado livre|magalu)\b/i.test(title)&&title.length<65;
  return {
    title:generic?'':title.slice(0,220),
    image,price:price||null,
    oldPrice:oldPrice&&price&&oldPrice>price?oldPrice:null,
    store,priceSource,
    partial:!(title&&!generic&&image&&price)
  };
}
async function limitedHtml(response){
  const length=Number(response.headers.get('content-length'))||0;
  if(length>3e6)throw Error('Página muito grande para importar');
  const reader=response.body?.getReader();
  if(!reader)return (await response.text()).slice(0,2000000);
  const parts=[];let lengthRead=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;lengthRead+=value.length;if(lengthRead>2000000)break;parts.push(value)}}finally{await reader.cancel().catch(()=>{})}
  return new TextDecoder('utf-8').decode(Buffer.concat(parts));
}
function httpRedirect(html,base){
  const m=html.match(/<meta\b[^>]*http-equiv=["']refresh["'][^>]*>/i);
  if(m){const x=attrs(m[0]).content||'';const v=x.match(/url\s*=\s*['"]?([^'"\s;]+)/i)?.[1];if(v){try{return new URL(decode(v),base)}catch{}}}
  for(const pattern of [/location\.(?:href|replace)\s*(?:=|\()\s*['"]([^'"]+)['"]/i,/window\.location\s*=\s*['"]([^'"]+)['"]/i]){
    const m=html.match(pattern);if(m){try{return new URL(decode(m[1]),base)}catch{}}
  }
  return null;
}
async function scan(input){
  let url=new URL(input);if(!isAllowed(url))throw Error('Domínio não permitido. Use um link da Shopee, Amazon, Mercado Livre ou Magalu.');
  const originShop=shopOf(url.hostname);
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),13000);
  try{
    let html='',lastResponse=null;
    for(let i=0;i<8;i++){
      const response=await fetch(url,{redirect:'manual',signal:controller.signal,headers:{
        'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language':'pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.5'
      }});
      lastResponse=response;
      if([301,302,303,307,308].includes(response.status)){
        const location=response.headers.get('location');if(!location)break;
        const next=new URL(location,url);
        if(!isAllowed(next))return {store:originShop,partial:true,warning:'A loja usa um redirecionamento não disponível para importação automática.',price:null,oldPrice:null,title:'',image:''};
        url=next;continue;
      }
      if(!response.ok)return {store:originShop,partial:true,warning:'A loja bloqueou a leitura automática (HTTP '+response.status+'). Use os dados do anúncio.',price:null,oldPrice:null,title:'',image:''};
      if(!(response.headers.get('content-type')||'').toLowerCase().includes('text/html')){
        return {store:originShop,partial:true,warning:'A loja não retornou uma página de produto.',price:null,oldPrice:null,title:'',image:''};
      }
      html=await limitedHtml(response);
      const redirected=httpRedirect(html,url);
      if(redirected&&isAllowed(redirected)&&redirected.href!==url.href){url=redirected;continue}
      break;
    }
    if(!html)return {store:originShop,partial:true,warning:'Não foi possível obter a página do produto.',price:null,oldPrice:null,title:'',image:''};
    const result=extract(html,url,shopOf(url.hostname)||originShop);
    if(!result.title&&!result.image)result.warning='A loja não disponibilizou nome e foto para leitura automática. Preencha os campos manualmente.';
    else if(!result.price)result.warning='A loja não disponibilizou preço atual. Confira o anúncio e preencha o valor manualmente.';
    return result;
  }finally{clearTimeout(timeout)}
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Método não permitido'});
  try{
    const url=req.query.url;
    if(typeof url!=='string'||url.length>2500)return res.status(422).json({error:'Cole um link válido de produto'});
    const result=await scan(url);
    return res.status(200).json(result);
  }catch(e){
    const message=e?.name==='AbortError'?'A loja demorou a responder. Tente novamente.':e?.message||'Não foi possível consultar o anúncio';
    return res.status(422).json({error:message});
  }
};
module.exports._test={isAllowed,shopOf,extract,priceNumber,meta};
