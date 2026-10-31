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

/* Fallback: a third-party public link-preview service may read metadata when a marketplace returns a challenge page.
   Prices are intentionally not guessed from snippets or unrelated products. */
function cleanTitle(t,store){
  const s=decode(t).replace(/\s+/g,' ').trim().slice(0,190);
  if(!s||s.length<12)return '';
  if(/^(shopee|shopee brasil|amazon(?:\.com(?:\.br)?)?|mercado livre|magalu|just a moment|access denied|captcha|robot check|página não encontrada|acesso negado|verifique se você é humano|login|sign in|please enable javascript)\s*[.!–-]?$/i.test(s))return '';
  if(/enable javascript|please wait|automated access|access denied|verify you are human|captcha|cloudflare|não foi possível|página não encontrada|ofertas incríveis|melhores preços do mercado|loja oficial|shopee brasil \||shopee brasil -|início da shopee|sua loja online|frete gr[aá]tis em milhares de produtos/i.test(s))return '';
  return s;
}
function isGenericImage(image){return /(?:homepage|shopee-mobilemall|\/(?:logo|brand|icons?|favicon|header)[-_/.]|shopee.*home|banner[-_/]|\/shopee\/shopee|shopee-mobilemall-live-sg)/i.test(String(image||''))}
function cleanPreview(input,store){
  if(!input||typeof input!=='object')return null;
  const title=cleanTitle(input.title,store);
  let image=imageUrl(input.image);
  try{if(!image||!image.startsWith('https://'))image='';else image=new URL(image).href}catch{image=''}
  if(isGenericImage(image))image='';if(!title)return null;
  const price=priceNumber(input.price);
  const oldPrice=priceNumber(input.oldPrice);
  return {store,title,image,price:price||null,oldPrice:oldPrice&&price&&oldPrice>price?oldPrice:null,priceSource:price?'product_metadata':null,partial:!title||!image||!price};
}
async function microlinkPreview(input,store){
  const u=new URL('https://api.microlink.io/');
  u.searchParams.set('url',input);
  const res=await fetch(u.href,{headers:{accept:'application/json'},signal:AbortSignal.timeout(5500)});
  if(!res.ok)return null;
  const json=await res.json();
  if(json.status!=='success'||!json.data)return null;
  const d=json.data;
  const result=cleanPreview({title:d.title||d.description,image:d.image?.url||d.image,price:d.price,oldPrice:d.originalPrice},store);
  return result?{...result,source:'link_preview'}:null;
}
async function readerPreview(input,store){
  const u='https://r.jina.ai/'+input;
  const res=await fetch(u,{signal:AbortSignal.timeout(4500),headers:{accept:'text/plain'}});
  if(!res.ok)return null;
  const body=(await res.text()).slice(0,180000);
  const t=(body.match(/^Title:\s*(.+)$/mi)||[])[1]||'';
  const title=cleanTitle(t,store);
  if(!title)return null;
  const images=[...body.matchAll(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g)].map(x=>x[1]);
  const image=images.find(x=>/shopee|amazon|media-amazon|mlstatic|m\.media|magalu/i.test(x))||'';
  const result=cleanPreview({title,image},store);
  return result?{...result,source:'reader_preview'}:null;
}

/* Leitor especializado no servidor. A credencial vive só em SCRAPEDO_API_TOKEN na Vercel.
   Amazon: endpoint de produto em JSON; Shopee: HTML renderizado, sem inferir preço incorreto. */
const cache=new Map(), CACHE_MS=15*60*1000;
function cacheGet(url){const e=cache.get(url);if(!e)return null;if(Date.now()-e.at>CACHE_MS){cache.delete(url);return null}return {...e.data,cache:true}}
function cacheSet(url,data){if(cache.size>=80)cache.delete(cache.keys().next().value);cache.set(url,{at:Date.now(),data});}
function chooseProduct(data,store,source){
  const title=cleanTitle(data.title||data.name,store);
  let image=imageUrl(data.image||data.thumbnail||(Array.isArray(data.images)?data.images[0]:null));
  try{if(image)image=new URL(image).href;if(!image.startsWith('https://')||isGenericImage(image))image=''}catch{image=''}
  const price=priceNumber(data.price?.amount??data.price);
  const original=priceNumber(data.oldPrice??data.list_price);
  if(!title)return null;
  return {store,title,image,price:price||null,oldPrice:original&&price&&original>price?original:null,
    priceSource:price?'product_metadata':null,partial:!(title&&image&&price),source};
}
async function specialisedScrape(input,store){
  const key=process.env.SCRAPEDO_API_TOKEN;
  if(!key)return null;
  const cached=cacheGet(input);if(cached)return cached;
  const endpoint=store==='Amazon'?'https://api.scrape.do/plugin/amazon/pdp':'https://api.scrape.do/';
  const api=new URL(endpoint);
  api.searchParams.set('token',key);
  let asin=null;
  if(store==='Amazon'){
    asin=input.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?:[/?#]|$)/i)?.[1]?.toUpperCase()||null;
    if(!asin)return null;
    api.searchParams.set('asin',asin);api.searchParams.set('geocode','br');
  }else if(store==='Shopee'){
    /* Shopee custa 100 créditos/consulta; exigir liberação explícita no servidor. */
    if(process.env.SCRAPEDO_SHOPEE_ENABLED!=='true')return null;
    api.searchParams.set('url',input);api.searchParams.set('render','true');
    api.searchParams.set('geoCode','br');api.searchParams.set('customWait','1200');
    api.searchParams.set('timeout','14000');api.searchParams.set('disableRetry','true');
  }else return null;
  let response;
  try{response=await fetch(api.href,{signal:AbortSignal.timeout(18000),headers:{accept:store==='Amazon'?'application/json':'text/html'}})}
  catch{return null}
  if(!response.ok)return null;
  let parsed;
  if(store==='Amazon'){
    let data;try{data=await response.json()}catch{return null}
    if(data.status==='error'||(data.asin&&String(data.asin).toUpperCase()!==asin))return null;
    if(data.currency&&data.currency!=='BRL')return null;
    parsed=chooseProduct(data,store,'amazon_catalog');
  }else{
    const contentType=response.headers.get('content-type')||'';
    if(!contentType.toLowerCase().includes('html'))return null;
    let html;try{html=await limitedHtml(response)}catch{return null}
    const found=extract(html,input,store);
    parsed=chooseProduct(found,store,'shopee_browser');
  }
  if(parsed&&parsed.title){
    if(parsed.partial)parsed.warning=!parsed.price?'Nome e foto identificados, mas o preço atual não foi disponibilizado pela loja.':'Produto identificado parcialmente; confira os campos antes de publicar.';
    cacheSet(input,parsed);
  }
  return parsed;
}

async function enhancedScan(input){
  const url=new URL(input);
  if(!isAllowed(url))throw Error('Domínio não permitido. Use um link da Shopee, Amazon, Mercado Livre ou Magalu.');
  const store=shopOf(url.hostname);
  const special=await specialisedScrape(input,store);
  if(special?.title&&special?.image&&special?.price)return special;
  let result=special||null;
  if(!result){try{result=await scan(input)}catch(e){result={store,partial:true,title:'',image:'',price:null,oldPrice:null,warning:e?.message||'Falha ao consultar a loja'};}}
  if(result?.title&&!cleanTitle(result.title,store))result.title='';if(result?.image&&isGenericImage(result.image))result.image='';if(result?.title&&result?.image&&result?.price)return result;
  for(const provider of [microlinkPreview,readerPreview]){
    if(result?.title&&result?.image)break;
    try{
      const alt=await provider(input,store);
      if(!alt)continue;
      result={...result,store,
        title:result?.title||alt.title||'',
        image:result?.image||alt.image||'',
        price:result?.price||alt.price||null,
        oldPrice:result?.oldPrice||alt.oldPrice||null,
        priceSource:result?.priceSource||alt.priceSource||null,
        source:alt.source};
      if(result.title||result.image)result.warning='';
    }catch{}
  }
  if(!result)result={store,title:'',image:'',price:null,oldPrice:null};
  if(result.title&&!cleanTitle(result.title,store))result.title='';
  if(result.image&&isGenericImage(result.image))result.image='';
  result.partial=!(result.title&&result.image&&result.price);
  if(result.partial){
    if(!result.title&&!result.image)result.warning='A Shopee ou Amazon não liberou a prévia para importação. Você ainda pode cadastrar o produto manualmente e enviar uma foto.';
    else if(!result.price)result.warning='Encontrei dados do produto, mas a loja não liberou o preço atual. Confira na loja antes de publicar.';
    else if(!result.image)result.warning='Encontrei o produto, mas não sua foto. Envie uma imagem manualmente.';
  }
  return result;
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Método não permitido'});
  if(!require('../lib/drika').authorised(req))return res.status(401).json({error:'Entre no painel para buscar os produtos.'});
  try{
    const url=req.query.url;
    if(typeof url!=='string'||url.length>2500)return res.status(422).json({error:'Cole um link válido de produto'});
    const result=await enhancedScan(url);
    return res.status(200).json(result);
  }catch(e){
    const message=e?.name==='AbortError'?'A loja demorou a responder. Tente novamente.':e?.message||'Não foi possível consultar o anúncio';
    return res.status(422).json({error:message});
  }
};
module.exports._test={isAllowed,shopOf,extract,priceNumber,meta,cleanTitle,cleanPreview,chooseProduct};
