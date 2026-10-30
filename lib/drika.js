const crypto=require('node:crypto');const {list,put}=require('@vercel/blob');
const secret=()=>process.env.ADMIN_SESSION_SECRET||process.env.ADMIN_PASSWORD||'';
const token=()=>process.env.BLOB_READ_WRITE_TOKEN;
function sign(s){return crypto.createHmac('sha256',secret()).update(s).digest('hex')}
function authorised(req){try{const raw=String(req.headers.cookie||'').match(/(?:^|; )drika_session=([^;]+)/)?.[1];if(!raw||!secret())return false;const [ts,sig]=decodeURIComponent(raw).split('.');if(!/^\d{13}$/.test(ts)||Date.now()-Number(ts)>12*3600e3||Number(ts)>Date.now()+60000)return false;const expected=sign(ts);return sig?.length===expected.length&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))}catch{return false}}
function cookie(res){const ts=String(Date.now());res.setHeader('Set-Cookie','drika_session='+encodeURIComponent(ts+'.'+sign(ts))+'; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict')}
function clear(res){res.setHeader('Set-Cookie','drika_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict')}
function configured(){return Boolean(token())}
async function getOffers(){
 if(!configured())throw new Error('Armazenamento Blob não conectado ao projeto. Vincule a loja siteofertas-produtos na Vercel.');
 const results=await list({prefix:'drinka/catalogo-',limit:1000,token:token()});
 const versions=(results.blobs||[]).filter(x=>x.pathname.endsWith('.json')).sort((a,b)=>b.pathname.localeCompare(a.pathname));
 if(!versions.length)return [];
 const response=await fetch(versions[0].url,{cache:'no-store'});
 if(!response.ok)throw new Error('Falha ao ler ofertas publicadas');
 const parsed=await response.json();
 return Array.isArray(parsed)?parsed:[];
}
async function setOffers(items){
 if(!configured())throw new Error('Armazenamento Blob não conectado ao projeto');
 const path='drinka/catalogo-'+String(Date.now()).padStart(13,'0')+'-'+crypto.randomUUID()+'.json';
 await put(path,JSON.stringify(items),{access:'public',token:token(),contentType:'application/json',cacheControlMaxAge:60});
}
function json(res,status,data){res.setHeader('Cache-Control','private, no-store, max-age=0');res.status(status).json(data)}
module.exports={crypto,authorised,cookie,clear,configured,getOffers,setOffers,json};
