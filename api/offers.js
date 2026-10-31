const d=require('../lib/drika');
const SHOPS=['Shopee','Mercado Livre','Amazon','Magalu'];
const DOMAINS=['mercadolivre.com.br','mercadolibre.com','mercadolibre.com.br','meli.la','shopee.com.br','shopee.com','shopee.sg','shopee.ph','shopee.tw','shopee.co.id','shope.ee','shp.ee','amazon.com.br','amazon.com','amazon.com.mx','amazon.es','amazon.co.uk','amazon.ca','amazon.de','amazon.fr','amazon.it','amazon.in','amazon.com.au','amazon.co.jp','amzn.to','a.co','amzn.com','link.amazon','magazineluiza.com.br','magalu.com'];
const urlAllowed=(raw,market)=>{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Link deve ser HTTPS válido');if(!DOMAINS.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw Error('Use um link da Shopee, Mercado Livre, Amazon ou Magalu');return u.href};
function parseItem(input){const a=input||{};const url=urlAllowed(String(a.url||''));const name=String(a.name||'').trim().slice(0,190),shop=String(a.shop||''),price=Number(a.price),old=Number(a.old)||0,image=String(a.image||'').trim();if(!name||!Number.isFinite(price)||price<=0||!SHOPS.includes(shop))throw Error('Preencha nome, loja e valor atual');if(old<0||!Number.isFinite(old))throw Error('Valor anterior inválido');if(image){const u=new URL(image);if(u.protocol!=='https:'||u.username||u.password)throw Error('Imagem precisa usar HTTPS')}return {url,name,shop,price:Math.round(price*100)/100,old:old>price?Math.round(old*100)/100:0,image}}
module.exports=async(req,res)=>{try{
 if(req.method==='GET'){const items=await d.getOffers();return d.json(res,200,{items})}
 if(!d.authorised(req))return d.json(res,401,{error:'Acesso exclusivo. Entre no painel.'});
 if(!['POST','PUT','DELETE'].includes(req.method))return d.json(res,405,{error:'Operação inválida'});
 const items=await d.getOffers();
 if(req.method==='DELETE'){const id=String(req.query.id||'');if(!items.some(x=>x.id===id))return d.json(res,404,{error:'Oferta não encontrada'});await d.setOffers(items.filter(x=>x.id!==id));return d.json(res,200,{ok:true})}
 const input=parseItem(req.body);
 const editing=String(req.body?.id||'');
 const existingIndex=items.findIndex(x=>x.id===editing||x.url===input.url);
 const existing=existingIndex>=0?items[existingIndex]:null;
 const item={...input,id:existing?.id||d.crypto.randomUUID(),createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
 if(existingIndex>=0)items.splice(existingIndex,1);
 items.unshift(item);
 await d.setOffers(items.slice(0,300));
 return d.json(res,200,{item,updated:Boolean(existing)});
}catch(e){const msg=e?.message||'Erro ao salvar';const status=/Armazenamento|Blob/.test(msg)?503:/Acesso exclusivo/.test(msg)?401:422;return d.json(res,status,{error:msg})}};
