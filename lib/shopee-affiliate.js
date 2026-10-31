'use strict';
const crypto=require('node:crypto');
/* Shopee Open API (afiliados), executada somente no servidor. Sem segredos no front-end.
   É necessária a autorização prévia da Shopee para a conta proprietária. */
function ids(raw){
  const s=String(raw||'');
  let m=s.match(/(?:^|\/)product\/(\d{3,20})\/(\d{3,20})(?:[/?#]|$)/i);
  if(!m)m=s.match(/(?:^|\/|-)i\.(\d{3,20})\.(\d{3,20})(?:[/?#]|$)/i);
  if(m)return {shopId:m[1],itemId:m[2]};
  return null;
}
function allowed(u){
 try{const h=new URL(u);return h.protocol==='https:'&&!h.port&&!h.username&&!h.password&&['shopee.com.br','shopee.com','shope.ee','shp.ee'].some(d=>h.hostname===d||h.hostname.endsWith('.'+d))}catch{return false}
}
async function expand(raw){
 if(!allowed(raw))return null;
 let current=new URL(raw);
 for(let i=0;i<5;i++){
  const found=ids(current.href);if(found)return found;
  let r;
  try{r=await fetch(current.href,{redirect:'manual',signal:AbortSignal.timeout(4500),headers:{'user-agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/123 Mobile Safari/537.36','accept':'text/html'}})}
  catch{return null}
  if([301,302,303,307,308].includes(r.status)){
   try{current=new URL(r.headers.get('location'),current);if(!allowed(current.href))return null}catch{return null}
   continue;
  }
  if(!r.ok)return null;
  const html=(await r.text()).slice(0,90000);
  for(const m of html.matchAll(/(?:https?:\\\/\\\/|https?:\/\/|\/product\/)[^"'<> ]{1,200}/gi)){
   const target=ids(m[0].replaceAll('\\/','/'));if(target)return target;
  }
  return null;
 }
 return null;
}
function signedPayload(appId,secret,body,now=Math.floor(Date.now()/1000)){
 const sign=crypto.createHash('sha256').update(String(appId)+now+body+String(secret),'utf8').digest('hex');
 return 'SHA256 Credential='+appId+', Timestamp='+now+', Signature='+sign;
}
function allowedImage(raw){
 try{const u=new URL(String(raw||''));return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u.href:''}catch{return ''}
}
function positivePrice(raw){
 const str=String(raw||'').replace(/[^\d.,]/g,'');
 if(!str)return null;const n=Number(str.replace(',','.'));
 return Number.isFinite(n)&&n>0&&n<1e7?Math.round(n*100)/100:null;
}
async function affiliateProduct(raw){
 const appId=process.env.SHOPEE_AFFILIATE_APP_ID,secret=process.env.SHOPEE_AFFILIATE_SECRET;
 if(!appId||!secret)return null;
 const target=ids(raw)||await expand(raw);
 if(!target)return null;
 // A API aceita itemId como filtro. Confiamos APENAS em IDs que coincidem com o link recebido.
 const query='{ productOfferV2(itemId: '+target.itemId+', page: 1, limit: 5) { nodes { itemId shopId productName productLink imageUrl priceMin priceMax priceDiscountRate } } }';
 const body=JSON.stringify({query});
 let r;
 try{r=await fetch('https://open-api.affiliate.shopee.com.br/graphql',{
  method:'POST',signal:AbortSignal.timeout(8500),
  headers:{'content-type':'application/json',authorization:signedPayload(appId,secret,body)},
  body
 })}catch{return null}
 if(!r.ok)return null;
 let data;try{data=await r.json()}catch{return null}
 const nodes=data?.data?.productOfferV2?.nodes;
 if(!Array.isArray(nodes))return null;
 const found=nodes.find(x=>String(x.itemId)===target.itemId&&(!x.shopId||String(x.shopId)===target.shopId));
 if(!found||!found.productName)return null;
 const price=positivePrice(found.priceMin);
 return {store:'Shopee',title:String(found.productName).trim().slice(0,200),
  image:allowedImage(found.imageUrl),price,oldPrice:null,
  source:'shopee_affiliate_api',priceSource:price?'affiliate_catalog':null,
  partial:!price,
  warning:price?'':'A API da Shopee retornou o produto, mas não informou o preço atual.'
 };
}
module.exports={affiliateProduct,ids,signedPayload};
