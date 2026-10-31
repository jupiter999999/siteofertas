'use strict';
/* Leitor próprio de produtos — nenhum token ou serviço de scraping externo.
   Lê dados públicos de uma URL de produto, sem inventar preços.
   A Vercel usa Chromium serverless para links que exigem JavaScript. */
const cheerio=require('cheerio');

const HOSTS=[
  'shopee.com.br','shopee.com','shope.ee','shp.ee',
  'amazon.com.br','amazon.com','link.amazon','amzn.to','a.co',
  'meli.la','mercadolivre.com.br','mercadolibre.com',
  'magalu.com','magazineluiza.com.br'
];
const isAllowed=u=>{
 try{const x=u instanceof URL?u:new URL(String(u));return x.protocol==='https:'&&!x.username&&!x.password&&!x.port&&HOSTS.some(d=>x.hostname===d||x.hostname.endsWith('.'+d))}catch{return false}
};
function storeFor(host){
 if(/shopee|shope\.ee|shp\.ee/i.test(host))return 'Shopee';
 if(/amazon|amzn\.to|^a\.co$/i.test(host))return 'Amazon';
 if(/mercado|meli\.la/i.test(host))return 'Mercado Livre';
 return 'Magalu';
}
function amount(v){
 if(v===null||v===undefined||v==='')return null;
 let s=String(v).trim().replace(/[^\d.,]/g,'');
 if(!s)return null;
 const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
 if(comma>=0&&dot>=0)s=comma>dot?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
 else if(comma>=0)s=s.slice(comma+1).length===3&&s.indexOf(',')===comma&&s.length>=5?s.replace(/,/g,''):s.replace(',','.');
 const n=Number(s);return Number.isFinite(n)&&n>0&&n<=1000000?Math.round(n*100)/100:null;
}
function onlyProductName(s){
 const name=String(s||'').replace(/\s+/g,' ').replace(/\s*\|\s*(?:Amazon.*|Shopee.*|Mercado Livre.*)$/i,'').trim();
 if(name.length<9||name.length>250)return '';
 if(/shopee brasil|ofertas incríveis|melhores preços do mercado|loja oficial|access denied|just a moment|robot check|captcha|não foi possível|página inicial|error_page|página não encontrada|please enable javascript/i.test(name))return '';
 return name;
}
function safeImg(v,base){
 try{
 const s=Array.isArray(v)?v[0]:v&&typeof v==='object'?v.url||v.contentUrl:v;
 if(!s||typeof s!=='string')return '';
 const u=new URL(s,base);
 if(u.protocol!=='https:'||u.username||u.password||u.port)return '';
 if(/\/(?:logo|favicon|banner|homepage|icon)[-/.]|shopee-mobilemall/i.test(u.pathname))return '';
 return u.href;
 }catch{return ''}
}
function jsonProduct($){
 const products=[];
 $('script[type="application/ld+json"]').each((_,el)=>{
  try{
   const value=JSON.parse($(el).html());
   const walk=(v,depth=0)=>{
    if(depth>7||!v)return;
    if(Array.isArray(v)){v.forEach(x=>walk(x,depth+1));return}
    if(typeof v!=='object')return;
    if(String(v['@type']||'').toLowerCase().includes('product'))products.push(v);
    if(v['@graph'])walk(v['@graph'],depth+1);
    if(v.mainEntity)walk(v.mainEntity,depth+1);
   };walk(value);
  }catch{}
 });
 return products[0]||{};
}
function amazonPrice($){
 const take=(el)=>{
   if(!el?.length)return null;
   const whole=el.find('.a-price-whole').first().text().replace(/\D/g,'');
   const frac=el.find('.a-price-fraction').first().text().replace(/\D/g,'');
   if(whole)return amount(whole+(frac?'.'+frac:''));
   return amount(el.find('.a-offscreen').first().text());
 };
 // Buy box price only; never choose a "R$ 0,04 por ml" unit price.
 for(const sel of [
   '#corePriceDisplay_desktop_feature_div .apex-pricetopay-value',
   '#corePriceDisplay_desktop_feature_div .priceToPay',
   '#corePriceDisplay_desktop_feature_div .reinventPriceAccordionT2',
   '#corePrice_feature_div .a-price:not(.a-price-per-unit)',
   '#apex_desktop .a-price:not(.a-price-per-unit)',
   '#corePriceDisplay_desktop_feature_div .a-price:not(.a-price-per-unit)',
   '#priceblock_ourprice',
   '#priceblock_dealprice'
 ]){
  const price=take($(sel).first());if(price)return price;
 }
 return null;
}
function fromHtml(html,pageUrl,shop){
 const $=cheerio.load(html);
 const p=jsonProduct($);
 const offer=Array.isArray(p.offers)?p.offers[0]:p.offers||{};
 const m=(key)=>$('meta[property="'+key+'"], meta[name="'+key+'"], meta[itemprop="'+key+'"]').first().attr('content')||'';
 const url=new URL(pageUrl);
 const title=onlyProductName(
   shop==='Amazon'?$('#productTitle').first().text()||p.name||m('og:title')||$('title').text()
     :p.name||m('og:title')||m('twitter:title')||$('h1').first().text()||$('title').text()
 );
 const image=safeImg(
   shop==='Amazon'?$('#landingImage').attr('data-old-hires')||$('#landingImage').attr('src')||$('#imgTagWrapperId img').attr('src')||p.image||m('og:image')
      :p.image||m('og:image:secure_url')||m('og:image')||m('twitter:image'),pageUrl);
 let price=shop==='Amazon'?amazonPrice($):null;
 if(!price)price=amount(offer.price||offer.lowPrice||m('product:price:amount')||m('price'));
 const oldPrice=amount(m('product:original_price:amount'));
 if(!title)return null;
 return {store:shop,title,image,price:price||null,oldPrice:oldPrice&&price&&oldPrice>price?oldPrice:null,
  source:'own_html',partial:!(title&&image&&price)};
}
function resolveLocation(raw,base){
 const u=new URL(raw,base);
 if(!isAllowed(u))throw Error('Redirecionamento fora das lojas permitidas');
 return u;
}
async function directRead(input,store){
 let url=new URL(input);const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),11000);
 try{
  for(let i=0;i<6;i++){
   const r=await fetch(url.href,{redirect:'manual',signal:controller.signal,headers:{
    'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'accept':'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'accept-language':'pt-BR,pt;q=0.9'
   }});
   if([301,302,303,307,308].includes(r.status)){
    const location=r.headers.get('location');if(!location)return null;
    url=resolveLocation(location,url.href);continue;
   }
   if(!r.ok||!(r.headers.get('content-type')||'').includes('text/html'))return null;
   const size=Number(r.headers.get('content-length'))||0;if(size>4500000)return null;
   // Limit input to a reasonable product page size.
   const html=(await r.text()).slice(0,3300000);
   if(/shope\.ee\/error_page|shopee\.com\.br\/error_page/.test(url.href))return null;
   return fromHtml(html,url.href,store);
  }
  return null;
 }catch{return null}finally{clearTimeout(timer)}
}
let launchPromise=null;
async function browser(){
 const {chromium:pw}=require('playwright-core');
 const serverless=(await import('@sparticuz/chromium')).default;
 const executablePath=await serverless.executablePath();
 return pw.launch({executablePath,headless:true,args:serverless.args,timeout:18000});
}
async function browserRead(input,store){
 let instance;
 try{
   instance=await browser();
   const context=await instance.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo',viewport:{width:1280,height:820},
     userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'});
   const page=await context.newPage();
   // Never allow navigation to arbitrary/untrusted hosts, even after short-link redirects.
   await page.route('**/*',route=>{
    const req=route.request(), target=req.url();
    if(req.isNavigationRequest()&&req.frame()===page.mainFrame()&&!isAllowed(target))return route.abort();
    if(!/^https:\/\//i.test(target))return route.abort();
    if(['image','font','media'].includes(req.resourceType()))return route.abort();
    return route.continue();
   });
   await page.goto(input,{waitUntil:'domcontentloaded',timeout:16000}).catch(()=>{});
   if(!isAllowed(page.url())||/\/error_page(?:[?#]|$)/.test(page.url()))return null;
   await page.waitForTimeout(1800);
   const html=(await page.content()).slice(0,3300000);
   const found=fromHtml(html,page.url(),store);
   if(found?.title)return {...found,source:'own_browser'};
   return null;
 }catch(e){console.warn('Product browser unavailable:',e.name);return null}
 finally{if(instance)await instance.close().catch(()=>{})}
}
const cache=new Map();
function finish(data,store){
 const v=data||{store,title:'',image:'',price:null,oldPrice:null};
 v.store=store;v.title=onlyProductName(v.title);v.image=safeImg(v.image,'https://example.com');
 v.price=amount(v.price);v.oldPrice=amount(v.oldPrice);
 v.partial=!(v.title&&v.image&&v.price);
 if(v.partial)v.warning=store==='Shopee'
  ?'O leitor não conseguiu identificar este anúncio da Shopee. O link curto foi bloqueado pela loja; nenhuma informação incorreta será publicada.'
  :'O anúncio não forneceu todos os dados. Nenhum preço será inventado. Confira antes de publicar.';
 return v;
}
async function readProduct(input){
 const u=new URL(input);if(!isAllowed(u))throw Error('Use um link HTTPS válido da Shopee, Amazon, Mercado Livre ou Magalu');
 const store=storeFor(u.hostname),existing=cache.get(u.href);
 if(existing&&Date.now()-existing.time<10*60*1000)return {...existing.data};
 let data=null;
 if(store==='Amazon')data=await directRead(u.href,store);
 if(store==='Shopee'){
   // For short links the HTML request may go to an error page; use a real browser.
   data=await browserRead(u.href,store);
   if(!data)data=await directRead(u.href,store);
 }
 if(!data&&store!=='Shopee')data=await browserRead(u.href,store);
 const result=finish(data,store);
 if(result.title&&result.image&&result.price){
  if(cache.size>70)cache.delete(cache.keys().next().value);
  cache.set(u.href,{time:Date.now(),data:result});
 }
 return result;
}
module.exports={readProduct,fromHtml,amount,onlyProductName,amazonPrice,isAllowed,storeFor};
