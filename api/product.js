'use strict';
/* Busca por link (somente painel autenticado). Leitor próprio, sem Scrape.do. */
const {readProduct}=require('../lib/product-reader');
const {authorised}=require('../lib/drika');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 if(req.method!=='GET')return res.status(405).json({error:'Método não permitido'});
 if(!authorised(req))return res.status(401).json({error:'Entre no painel para buscar o produto.'});
 try{
  const url=req.query.url;
  if(typeof url!=='string'||url.length>2500)return res.status(422).json({error:'Cole um link de produto válido.'});
  const result=await readProduct(url);
  return res.status(200).json(result);
 }catch(e){
  return res.status(422).json({error:e?.message||'Erro ao consultar o anúncio'});
 }
};
