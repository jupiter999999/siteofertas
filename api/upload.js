const crypto=require('node:crypto');
const {put}=require('@vercel/blob');
const {authorised,json}=require('../lib/drika');
const LIMIT=2*1024*1024;
function verify(bytes,mime){
  const png=bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217;
  const webp=bytes.length>12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(mime==='image/jpeg'&&jpeg)return '.jpg';
  if(mime==='image/png'&&png)return '.png';
  if(mime==='image/webp'&&webp)return '.webp';
  return '';
}
module.exports=async function upload(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Método inválido'});
 if(!authorised(req))return json(res,401,{error:'Faça login no painel para enviar fotos.'});
 if(!process.env.BLOB_READ_WRITE_TOKEN)return json(res,503,{error:'Armazenamento não está conectado.'});
 try{
   const raw=String(req.body?.data||'');
   if(raw.length>LIMIT*1.45)throw Error('Imagem muito grande. Envie uma foto com até 2 MB.');
   const match=raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i);
   if(!match)throw Error('Escolha uma foto JPG, PNG ou WEBP.');
   const mime=match[1].toLowerCase(),bytes=Buffer.from(match[2],'base64');
   if(!bytes.length||bytes.length>LIMIT)throw Error('Foto acima de 2 MB.');
   const ext=verify(bytes,mime);
   if(!ext)throw Error('Arquivo de imagem inválido.');
   const item=await put('drinka/fotos/'+crypto.randomUUID()+ext,bytes,{
     access:'public',contentType:mime,token:process.env.BLOB_READ_WRITE_TOKEN,cacheControlMaxAge:31536000
   });
   return json(res,200,{url:item.url});
 }catch(e){return json(res,422,{error:e.message||'Falha ao enviar imagem'})}
};