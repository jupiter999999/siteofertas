const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val=id=>$(id).value.trim();
const num=v=>{let s=String(v??'').replace(/[^0-9.,]/g,'');if(!s)return 0;if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(s.includes(','))s=s.replace(',','.');return Number(s)||0};
const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmt=v=>Number(v).toFixed(2).replace('.',',');
let items=[],editing=null,storage=false;
async function api(path,options={}){const r=await fetch(path,{cache:'no-store',credentials:'same-origin',...options});const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{throw Error('A API respondeu de forma inesperada ('+r.status+'). Atualize o painel e tente novamente')};if(!r.ok)throw Error(data.error||'Falha na solicitação');return data}
function preview(){const image=val('image');$('previewimg').innerHTML=image.startsWith('https://')?'<img alt="Produto selecionado" src="'+esc(image)+'">':'📦';$('previewshop').textContent=val('shop');$('previewname').textContent=val('name')||'Seu produto aparecerá aqui';const p=num(val('price')),old=num(val('old'));$('previewold').textContent=old>p&&p>0?money(old):'';$('previewprice').textContent=p?money(p):'R$ —';const percent=old>p&&p>0?Math.round((1-p/old)*100):0;$('previewdiscount').textContent=percent?percent+'% de desconto':'';$('discountInfo').textContent=percent?'Economia de '+money(old-p)+' ('+percent+'% OFF)':p?'Preço atual: '+money(p):'Informe o valor atual para publicar'}
function note(msg){$('message').textContent=msg}
function reset(){editing=null;['url','name','image','old','price'].forEach(id=>$(id).value='');$('shop').value='Shopee';$('formTitle').textContent='✨ Nova promoção';$('save').textContent='Publicar oferta no site';$('cancelEdit').style.display='none';note('Cole um link para começar.');preview()}
function startEdit(id){const item=items.find(x=>x.id===id);if(!item)return;editing=id;for(const k of ['url','name','image'])$(k).value=item[k]||'';$('shop').value=item.shop;$('old').value=item.old?fmt(item.old):'';$('price').value=fmt(item.price);$('formTitle').textContent='✏️ Editar promoção';$('save').textContent='Salvar alterações';$('cancelEdit').style.display='block';preview();$('formTitle').scrollIntoView({behavior:'smooth',block:'start'})}
function draw(){const target=$('offers');target.innerHTML=items.length?items.map(item=>'<div class="line"><span><strong>'+esc(item.name)+'</strong><br><small>'+esc(item.shop)+' • '+money(item.price)+'</small></span><div><button class="edit-btn" data-edit="'+esc(item.id)+'">Editar</button><button data-remove="'+esc(item.id)+'">Excluir</button></div></div>').join(''):'Nenhuma oferta publicada ainda.';document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>startEdit(b.dataset.edit));document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir essa oferta do site público?'))return;try{await api('/api/offers?id='+encodeURIComponent(b.dataset.remove),{method:'DELETE'});await load();note('Oferta excluída do site.')}catch(e){note(e.message)}})}
async function load(){try{items=(await api('/api/offers?ts='+Date.now())).items;if(!Array.isArray(items))items=[];draw();storage=true;$('status').className='status ok';$('status').textContent='✓ Site sincronizado com o armazenamento. '+items.length+' oferta(s) publicada(s) para todos os visitantes.'}catch(e){storage=false;$('status').className='status error';$('status').textContent='Publicação indisponível: '+e.message}}
async function state(){try{const s=await api('/api/session');$('loginBox').style.display=s.authenticated?'none':'grid';$('dashboard').style.display=s.authenticated?'grid':'none';if(s.authenticated)await load();else if(!s.configured)$('loginMessage').textContent='Configure ADMIN_PASSWORD na Vercel para entrar.'}catch(e){$('loginMessage').textContent=e.message}}
$('loginForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:val('password')})});$('password').value='';$('loginMessage').textContent='';await state()}catch(err){$('loginMessage').textContent=err.message}};
$('logout').onclick=async e=>{e.preventDefault();await api('/api/session',{method:'DELETE'});reset();await state()};
['name','image','shop','old','price'].forEach(k=>$(k).addEventListener('input',preview));
$('cancelEdit').onclick=reset;

/* Captura a URL original da mensagem, preservando rastreamento de afiliados. */
function extractLink(raw){
 const match=String(raw||'').match(/https:\/\/[^\s<>"'\u200b]+/i);
 return match?match[0].replace(/[.,;!?]+$/,'').replace(/\)+$/,''):'';
}
function readSharedMessage(raw){
 const original=String(raw||'').trim();
 const link=extractLink(original);
 const body=original.replace(link,'').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim();
 if(!link||body.length<15)return {link};
 const shopee=body.match(/(?:D[eê]\s+uma\s+olhada\s+em|D[aá]\s+uma\s+olhada\s+em)\s+(.+?)\s+por\s+R\$\s*([\d.,]+)/i);
 const advertised=body.match(/(?:por|apenas|agora|preço(?: de)?)\s*:?\s*R\$\s*([\d.,]+)/i);
 const oldPrice=body.match(/(?:de|antes|era)\s+R\$\s*([\d.,]+)\s+(?:por|agora|hoje)\s+R\$\s*([\d.,]+)/i);
 let title=shopee?.[1]||'';
 if(!title){
   title=body.replace(/(?:^|\s)(?:D[eê]\s+uma\s+olhada\s+em|Confira(?:\s+esse)?|Olha\s+(?:s[oó]\s+)?(?:esse|essa)|Compre)\s*/i,'')
    .split(/\b(?:por|apenas|agora|compre\s+(?:na|no)\s+(?:shopee|amazon)|https?:\/\/)\b/i)[0]
    .replace(/[!.,:\s]+$/,'').trim();
 }
 if(title.length<8||title.length>175||/^(?:https?:|www\.|shopee|amazon)/i.test(title))title='';
 const current=num(String(oldPrice?.[2]||advertised?.[1]||shopee?.[2]||'').replace(/[.,]+$/,''));
 const previous=num(String(oldPrice?.[1]||'').replace(/[.,]+$/,''));
 return {link,title,price:current||null,oldPrice:previous>current?previous:null};
}
function isRealProductTitle(v){
 const t=String(v||'').trim();
 if(t.length<10)return false;
 if(/^(?:shopee|amazon|mercado livre|magalu)(?:\s*(?:brasil|\.com\.br))?\s*[|:-]/i.test(t))return false;
 if(/ofertas incr[ií]veis|melhores pre[çc]os do mercado|compre e venda online|p[aá]gina inicial|loja oficial|homepage|access denied|robot check/i.test(t))return false;
 return true;
}
function isRealProductImage(v){
 let u;try{u=new URL(String(v||''))}catch{return false}
 if(u.protocol!=='https:')return false;
 if(/(?:homepage|\/logo|\/icons?\/|favicon|\/shopee-mobilemall|banner[_/-]|default-logo|\/brand|shopee.*homepage)/i.test(u.pathname))return false;
 return true;
}

/* Leitor opcional pelo Chrome real: usa a sessão já conectada à Shopee do computador,
   sem transferir senhas/cookies nem instalar scraping pago. */
function chromeReaderInstalled(){
  return document.documentElement.dataset.drinkaChromeReader==='ativo';
}
function lookupFromChrome(url){
  return new Promise((resolve,reject)=>{
    if(!chromeReaderInstalled())return reject(Error('Extensão Leitor Drinka não encontrada.'));
    const id='drinka-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    const finish=(event)=>{
      if(event.source!==window||event.origin!==location.origin||event.data?.type!=='DRINKA_LOCAL_READER_RESULT'||event.data.id!==id)return;
      clearTimeout(timer);
      window.removeEventListener('message',finish);
      const d=event.data.result||{};
      if(d.erro)return reject(Error(d.erro));
      resolve({
        store:'Shopee',title:d.nome||'',image:d.imagem||'',
        price:d.preco||null,oldPrice:d.preco_anterior||null,
        source:'chrome_conectado',warning:d.aviso||''
      });
    };
    const timer=setTimeout(()=>{
      window.removeEventListener('message',finish);
      reject(Error('O leitor local não respondeu. Confirme se a extensão está habilitada no Chrome.'));
    },22500);
    window.addEventListener('message',finish);
    window.postMessage({type:'DRINKA_LOCAL_READER_REQUEST',id,url},location.origin);
  });
}

$('fetch').onclick=async()=>{
 const raw=val('url'),shared=readSharedMessage(raw),link=shared.link;
 if(!link.startsWith('https://'))return note('Cole o link ou a mensagem compartilhada que contém o link HTTPS.');
 $('fetch').disabled=true;
 $('name').value=shared.title||'';
 $('image').value='';
 $('price').value=shared.price?fmt(shared.price):'';
 $('old').value=shared.oldPrice?fmt(shared.oldPrice):'';
 if(/shopee/i.test(link))$('shop').value='Shopee';
 else if(/amazon|amzn|a\.co/i.test(link))$('shop').value='Amazon';
 else if(/meli|mercado/i.test(link))$('shop').value='Mercado Livre';
 else if(/magalu|magazineluiza/i.test(link))$('shop').value='Magalu';
 preview();
 note(shared.title||shared.price?'Identifiquei informações na mensagem. Verificando a foto e outros detalhes...':'Consultando o produto. Algumas lojas bloqueiam o acesso automático.');
 try{
   const d=($('shop').value==='Shopee'&&chromeReaderInstalled())?await lookupFromChrome(link):await api('/api/product?url='+encodeURIComponent(link)+'&ts='+Date.now());
   if(d.store)$('shop').value=d.store;
   const validTitle=isRealProductTitle(d.title);
   const validImage=isRealProductImage(d.image);
   if(validTitle&&!shared.title)$('name').value=d.title;
   if(validImage)$('image').value=d.image;
   let price=Number(d.price)||shared.price||0;
   if(price)$('price').value=fmt(price);
   if(d.oldPrice)$('old').value=fmt(d.oldPrice);
   preview();
   const foundName=Boolean(val('name')),foundPhoto=Boolean(val('image')),foundPrice=num(val('price'))>0;
   if(foundName&&foundPhoto&&foundPrice)note('Dados encontrados. Confirme o preço e publique a oferta.');
   else if(foundName&&foundPrice)note('Nome e preço encontrados. A foto não foi liberada: envie uma imagem do produto abaixo.');
   else if(foundName)note('Nome encontrado. A loja não disponibilizou foto ou preço; confira o anúncio e complete antes de publicar.');
   else note(d.warning||'Não foi possível identificar o produto automaticamente. Nenhum dado incorreto será publicado.');
 }catch(err){
   if(shared.title||shared.price)note('A loja bloqueou a consulta, mas aproveitei os dados da mensagem. Confira e envie uma foto, se necessário.');
   else note('Não foi possível ler o anúncio: '+err.message+($('shop').value==='Shopee'&&!chromeReaderInstalled()?' Para tentar pelo seu Chrome conectado, instale o Leitor Drinka neste computador.':''));
 }finally{$('fetch').disabled=false}
};
$('save').onclick=async()=>{const data={id:editing,url:extractLink(val('url')),name:val('name'),image:val('image'),shop:val('shop'),old:num(val('old')),price:num(val('price'))};if(!data.url.startsWith('https://')||!data.name||!data.price)return note('Preencha link, nome e valor atual.');if(!storage)return note('O armazenamento ainda não está conectado ao projeto Vercel. É necessário conectá-lo antes de publicar.');$('save').disabled=true;note(editing?'Atualizando produto...':'Publicando para todos os visitantes...');try{const result=await api('/api/offers',{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});await load();reset();note(result.updated?'Oferta atualizada no site!':'Oferta publicada no site!');document.getElementById('offers').scrollIntoView({behavior:'smooth',block:'center'})}catch(err){note('Não foi possível publicar: '+err.message)}finally{$('save').disabled=false}};

/* A pessoa só cola o link: a consulta começa automaticamente após a colagem. */
let autoLookupTimer=null,autoLookupLast='';
$('url').addEventListener('input',()=>{
  clearTimeout(autoLookupTimer);
  if(editing)return;
  const link=extractLink(val('url'));
  if(!link||link===autoLookupLast)return;
  autoLookupTimer=setTimeout(()=>{
    if(editing||$('fetch').disabled||!$('dashboard')||$('dashboard').style.display==='none')return;
    if(extractLink(val('url'))!==link)return;
    autoLookupLast=link;
    $('fetch').click();
  },750);
});

preview();state();

/* Upload direto de imagem: fallback quando Amazon e Shopee bloqueiam a prévia automática. */
function optimizePhoto(file){
 return new Promise((resolve,reject)=>{
   if(!/^image\/(png|jpeg|webp)$/.test(file.type))return reject(Error('Envie uma imagem JPG, PNG ou WEBP.'));
   const objectUrl=URL.createObjectURL(file);
   const img=new Image();
   img.onload=()=>{
     URL.revokeObjectURL(objectUrl);
     try{
       const ratio=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));
       const canvas=document.createElement('canvas');
       canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));
       canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
       const ctx=canvas.getContext('2d');
       ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
       ctx.drawImage(img,0,0,canvas.width,canvas.height);
       let quality=.84,data=canvas.toDataURL('image/jpeg',quality);
       while(data.length>2600000&&quality>.3){quality-=.12;data=canvas.toDataURL('image/jpeg',quality)}
       if(data.length>2600000)throw Error('Foto muito grande. Escolha outra imagem.');
       resolve(data);
     }catch(e){reject(e)}
   };
   img.onerror=()=>{URL.revokeObjectURL(objectUrl);reject(Error('Não foi possível abrir a foto.'))};
   img.src=objectUrl;
 });
}
$('uploadImage').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  $('uploadImage').disabled=true;$('uploadStatus').textContent='Otimizando e enviando a foto...';
  try{
    const data=await optimizePhoto(file);
    const result=await api('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data})});
    $('image').value=result.url;preview();
    $('uploadStatus').textContent='✓ Foto enviada e pronta para publicar.';
    note('Foto carregada com sucesso. Complete o nome e o valor do produto.');
  }catch(err){$('uploadStatus').textContent='Não foi possível enviar: '+err.message}
  finally{$('uploadImage').disabled=false;e.target.value=''}
});
