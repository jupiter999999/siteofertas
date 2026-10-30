const crypto=require('node:crypto');const {list,put}=require('@vercel/blob');
const secret=()=>process.env.ADMIN_SESSION_SECRET||process.env.ADMIN_PASSWORD||'';
function sign(s){return crypto.createHmac('sha256',secret()).update(s).digest('hex')}
function authorised(req){const raw=String(req.headers.cookie||'').match(/(?:^|; )drika_session=([^;]+)/)?.[1];if(!raw||!secret())return false;const [ts,sig]=decodeURIComponent(raw).split('.');if(!/^\d{10,}$/.test(ts)||Date.now()-Number(ts)>12*3600e3||Number(ts)>Date.now()+60000)return false;return sig===sign(ts)}
function cookie(res){const ts=String(Date.now());res.setHeader('Set-Cookie','drika_session='+encodeURIComponent(ts+'.'+sign(ts))+'; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict')}
function clear(res){res.setHeader('Set-Cookie','drika_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict')}
async function getOffers(){const token=process.env.BLOB_READ_WRITE_TOKEN;if(!token)throw Error('Armazenamento não conectado. Conecte Vercel Blob ao projeto.');const found=await list({prefix:'drika/ofertas.json',limit:10,token});const blob=found.blobs.find(x=>x.pathname==='drika/ofertas.json');if(!blob)return [];const r=await fetch(blob.url,{cache:'no-store'});if(!r.ok)throw Error('Falha ao carregar ofertas');const a=await r.json();return Array.isArray(a)?a:[]}
async function setOffers(items){const token=process.env.BLOB_READ_WRITE_TOKEN;if(!token)throw Error('Armazenamento não conectado');await put('drika/ofertas.json',JSON.stringify(items),{access:'public',overwrite:true,contentType:'application/json',token,cacheControlMaxAge:0})}
const json=(res,status,data)=>{res.setHeader('Cache-Control','no-store');res.status(status).json(data)};
module.exports={crypto,sign,authorised,cookie,clear,getOffers,setOffers,json};