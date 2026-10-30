let offers=[],current='Todos',lastError='';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const safeUrl=v=>{try{let u=new URL(v);return u.protocol==='https:'?u.href:''}catch{return ''}};
function draw(){
 document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===current));
 const text=document.getElementById('search').value.trim().toLowerCase();
 const filtered=offers.filter(p=>(current==='Todos'||p.shop===current)&&String(p.name).toLowerCase().includes(text));
 const target=document.getElementById('products');
 if(!filtered.length){target.innerHTML='<div style="grid-column:1/-1;text-align:center;background:#fff7ed;border:1px solid #efdfcb;border-radius:17px;padding:45px 18px;color:#7a5a42"><div style="font-size:34px">🛍️</div><h3 style="margin:10px 0">'+(lastError?'Ofertas temporariamente indisponíveis':offers.length?'Nenhuma oferta encontrada':'Novas promoções chegando!')+'</h3><p style="font-size:13px">'+(lastError?'Tente novamente daqui a pouco.':offers.length?'Tente buscar outro produto ou loja.':'Acompanhe os achadinhos selecionados pela Drinka.')+'</p></div>';return}
 target.innerHTML=filtered.map(p=>{const pic=safeUrl(p.image),link=safeUrl(p.url),old=Number(p.old)||0,price=Number(p.price)||0,discount=old>price&&price>0?Math.round((1-price/old)*100):0;return '<article class="card"><div class="card-image">'+(pic?'<img src="'+esc(pic)+'" alt="'+esc(p.name)+'" loading="lazy">':'<span class="fallback">📦</span>')+(discount?'<span class="discount">'+discount+'% OFF</span>':'')+'</div><div class="card-body"><span class="shop-label">'+esc(p.shop)+'</span><h3>'+esc(p.name)+'</h3><div class="old">'+(discount?money(old):'')+'</div><div class="price">'+money(price)+'</div>'+(link?'<a class="card-cta" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer sponsored">Ver oferta na loja ↗</a>':'')+'</div></article>'}).join('')
}
async function reload(){try{const r=await fetch('/api/offers?ts='+Date.now(),{cache:'no-store'});const data=await r.json();if(!r.ok||!Array.isArray(data.items))throw Error(data.error||'indisponível');offers=data.items;lastError='';draw()}catch(e){lastError=e.message;offers=[];draw()}}
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{current=b.dataset.filter;draw()}));
document.querySelectorAll('[data-store]').forEach(b=>b.addEventListener('click',()=>{current=b.dataset.store;draw();document.getElementById('ofertas').scrollIntoView({behavior:'smooth'})}));
document.getElementById('search').addEventListener('input',draw);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload()});
draw();reload();setInterval(()=>{if(!document.hidden)reload()},30000);
