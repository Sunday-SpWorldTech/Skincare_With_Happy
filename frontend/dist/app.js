const API_BASE = (window.SWH_API_BASE_URL || '__API_BASE_URL__').replace(/\/$/, '');
const PAYSTACK_PUBLIC_KEY = window.SWH_PAYSTACK_PUBLIC_KEY || '__PAYSTACK_PUBLIC_KEY__';
let paystackScriptPromise;
function loadPaystackScript(){
  if(window.PaystackPop) return Promise.resolve(window.PaystackPop);
  if(paystackScriptPromise) return paystackScriptPromise;
  paystackScriptPromise = new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-paystack-inline]');
    if(existing){ existing.addEventListener('load',()=>resolve(window.PaystackPop)); existing.addEventListener('error',reject); return; }
    const script=document.createElement('script'); script.src='https://js.paystack.co/v2/inline.js'; script.async=true; script.dataset.paystackInline='true';
    script.onload=()=>window.PaystackPop?resolve(window.PaystackPop):reject(new Error('Paystack checkout could not load'));
    script.onerror=()=>reject(new Error('Unable to load Paystack checkout')); document.head.appendChild(script);
  });
  return paystackScriptPromise;
}
const money = v => '₦' + (Number(v || 0) * 1500).toLocaleString('en-NG', {minimumFractionDigits: 0, maximumFractionDigits: 0});
const SALES_PHONE = '2347038186482';
const SALES_PHONE_DISPLAY = '+234 703 818 6482';
function whatsappProduct(id){ const p=getByIdProduct(id); if(!p)return; const text=`Hello Skincare With Happy, I want to buy ${p.name} for ${money(p.price)}. Please assist me with my order.`; window.open(`https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(text)}`,'_blank','noopener'); }
let products = [];
let currentFilter = 'All';
let cart = JSON.parse(localStorage.getItem('skincare-with-happy-cart') || '[]');

const getById = id => document.getElementById(id);
function saveCart(){ localStorage.setItem('skincare-with-happy-cart', JSON.stringify(cart)); }
function getByIdProduct(id){ return products.find(x=>String(x._id)===String(id)); }

function layout(active='home'){
 document.body.insertAdjacentHTML('afterbegin',`<div class="announcement"><span>✨ Skincare With Happy</span><span class="announcement-copy">Quality skincare, trusted service, convenient online shopping.</span><span class="site-clock" id="siteClock" aria-label="Current local time"></span></div><div class="nav-wrap"><div class="container"><nav><a href="/" class="logo"><span class="logo-mark"><img src="/images/logo.png" alt="Skincare With Happy logo"></span><span>Skincare With<br/>Happy</span></a><div class="nav-links" id="navLinks"><a class="${active==='home'?'active':''}" href="/">Home</a><a class="${active==='shop'?'active':''}" href="/shop/">Shop</a><a class="${active==='collections'?'active':''}" href="/collections/">Collections</a><a class="${active==='about'?'active':''}" href="/about/">About</a><a class="${active==='reviews'?'active':''}" href="/reviews/">Reviews</a><a class="${active==='contact'?'active':''}" href="/contact/">Contact</a></div><div class="nav-actions"><button class="cart-btn" onclick="openCart()">🛒 Cart <span class="cart-count" id="cartCount">0</span></button><button class="menu-btn" onclick="toggleMenu()">☰</button><a class="btn" href="/shop/">Shop Now</a><a class="btn secondary" id="accountLink" href="/login/">Login</a></div></nav></div></div>`);
 document.body.insertAdjacentHTML('beforeend',`<footer><div class="container"><div class="footer-grid"><div><h3>Skincare With Happy</h3><p>A modern Nigerian skincare e-commerce platform built for simple shopping, secure payments and dependable customer service.</p></div><div><h4>Quick Links</h4><a href="/">Home</a><a href="/shop/">Shop</a><a href="/collections/">Collections</a><a href="/about/">About</a></div><div><h4>Shop</h4><a href="/shop/">Cleansers</a><a href="/shop/">Serums</a><a href="/shop/">Moisturizers</a><a href="/shop/">Sunscreen</a></div><div><h4>Customer Service</h4><a href="/contact/">Contact</a><a href="/cart/">Cart & Checkout</a><a href="/reviews/">Reviews</a><a href="#">Instagram | Facebook</a></div></div><div class="copyright">© <span id="year"></span> Skincare With Happy. All rights reserved. <span class="site-credit">Powered by <strong>SunShine Software Development Team</strong>.</span></div></div></footer><div class="cart-overlay" id="cartOverlay" onclick="closeCart()"></div><aside class="cart-drawer" id="cartDrawer"><div class="cart-head"><h3>Your Shopping Cart</h3><button class="close-cart" onclick="closeCart()">×</button></div><div class="cart-items" id="cartItems"></div><div class="cart-bottom"><div class="total-row"><span>Total</span><span id="cartTotal">₦0</span></div><form class="checkout" onsubmit="payNow(event)"><input id="customerName" required placeholder="Customer full name"><input id="customerPhone" required placeholder="Phone number"><input id="customerEmail" type="email" required placeholder="Email address"><input id="deliveryAddress" required placeholder="Delivery address"><button class="btn" type="submit">Continue to Secure Payment</button><a class="btn secondary" href="/cart/">View Full Cart</a></form></div></aside><div class="toast" id="toast"></div>`);
 if(getById('year')) getById('year').textContent=new Date().getFullYear();
 const u=(()=>{try{return JSON.parse(localStorage.getItem('swh_user')||'null')}catch{return null}})(); const al=getById('accountLink'); if(al){al.textContent=u? (u.role==='admin'?'Admin':'My Account'):'Login'; al.href=u?(u.role==='admin'?'/admin/':'/dashboard/'):'/login/';}
 updateCart();
 const session=(()=>{try{return JSON.parse(localStorage.getItem('swh_user')||'null')}catch{return null}})();
 if(session){ if(getById('customerName')&&!getById('customerName').value)getById('customerName').value=session.name||''; if(getById('customerEmail')&&!getById('customerEmail').value)getById('customerEmail').value=session.email||''; if(getById('customerPhone')&&!getById('customerPhone').value)getById('customerPhone').value=session.phone||''; }
 // Put authentication actions directly in every public hero without changing the existing hero layout.
 const hero = document.querySelector('.page-hero .page-hero-grid > div:first-child, .home-hero .home-hero-grid > div:first-child');
 if(hero && !hero.querySelector('.hero-auth-actions')){
   hero.insertAdjacentHTML('beforeend', `<div class="hero-auth-actions"><a class="btn" href="/login/">Login</a><a class="btn secondary" href="/register/">Register</a></div>`);
 }
}
function toggleMenu(){ getById('navLinks')?.classList.toggle('show'); }
function openCart(){ updateCart(); getById('cartDrawer')?.classList.add('show'); getById('cartOverlay')?.classList.add('show'); }
function closeCart(){ getById('cartDrawer')?.classList.remove('show'); getById('cartOverlay')?.classList.remove('show'); }
function showToast(msg){ const t=getById('toast'); if(!t)return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3500); }

async function fetchProducts(){
 try{
   const r=await fetch(`${API_BASE}/products?_=${Date.now()}`); if(!r.ok) throw new Error('Could not load products');
   products=await r.json();
   renderFilters(); renderProducts(); renderCartPage();
 }catch(e){ showToast('Store is temporarily unable to load products.'); console.error(e); }
}
function addToCart(id,open=true){
 const p=getByIdProduct(id); if(!p)return;
 if(open && !localStorage.getItem('swh_token')){ showToast('Please register or log in to continue to checkout.'); setTimeout(()=>location.href='/login/?return=/cart/',650); return; }
 const e=cart.find(x=>String(x.id)===String(id)); e ? e.qty++ : cart.push({id:p._id,name:p.name,price:Number(p.price),image_url:p.image_url,qty:1});
 saveCart(); updateCart(); showToast(p.name+' added to cart'); if(open)openCart();
}
function changeQty(id,amount){ const i=cart.find(x=>String(x.id)===String(id)); if(!i)return; i.qty+=amount; if(i.qty<=0)cart=cart.filter(x=>String(x.id)!==String(id)); saveCart(); updateCart(); renderCartPage(); }
function removeItem(id){ cart=cart.filter(x=>String(x.id)!==String(id)); saveCart(); updateCart(); renderCartPage(); showToast('Item removed'); }
function updateCart(){
 const count=cart.reduce((s,i)=>s+i.qty,0); if(getById('cartCount'))getById('cartCount').textContent=count;
 if(getById('cartItems')) getById('cartItems').innerHTML=cart.length?cart.map(item=>`<div class="cart-item"><img src="${item.image_url||item.img}" alt="${item.name}"><div><h4>${item.name}</h4><div class="cart-price">${money(item.price)}</div><div class="qty"><button onclick="changeQty('${item.id}',-1)">−</button><strong>${item.qty}</strong><button onclick="changeQty('${item.id}',1)">+</button></div></div><button class="remove" onclick="removeItem('${item.id}')">×</button></div>`).join(''):'<div class="empty">Your cart is empty. Start shopping.</div>';
 const total=cart.reduce((s,i)=>s+Number(i.price)*i.qty,0); if(getById('cartTotal'))getById('cartTotal').textContent=money(total); if(getById('cartPageTotal'))getById('cartPageTotal').textContent=money(total);
}
async function payNow(e){
 e.preventDefault();
 if(!cart.length){showToast('Please add a product first.');return;}
 const token=localStorage.getItem('swh_token');
 if(!token){showToast('Please register or log in before completing payment.');setTimeout(()=>{location.href='/login/?return=/cart/'},700);return;}
 const readField=(id, fallback='')=>getById(id)?.value?.trim() || fallback;
 const paymentMethod=getById('paymentMethod')?.value||'paystack';
 const payload={customer:{name:readField('customerName', readField('checkoutName')),phone:readField('customerPhone', readField('checkoutPhone')),email:readField('customerEmail', readField('checkoutEmail')),address:readField('deliveryAddress', readField('checkoutAddress'))},items:cart.map(i=>({product_id:i.id,quantity:i.qty})),payment_method:paymentMethod};
 if(!payload.customer.name||!payload.customer.phone||!payload.customer.email||!payload.customer.address){showToast('Please complete your name, phone, email and delivery address.');return;}
 try{
   showToast('Preparing secure Paystack checkout...');
   const r=await fetch(`${API_BASE}/orders`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(payload)});
   const data=await r.json(); if(!r.ok)throw new Error(data.error||'Unable to create order');
   if(data.payment_method==='wallet'){ cart=[]; saveCart(); updateCart(); renderCartPage(); showToast('Wallet payment successful. Your order has been confirmed.'); return; }
   const publicKey=data.paystack_public_key||PAYSTACK_PUBLIC_KEY;
   if(!publicKey || publicKey.includes('YOUR_PAYSTACK')) throw new Error('Paystack public key is not configured.');
   try { await loadPaystackScript(); } catch (loadErr) {
     const fallback=await fetch(`${API_BASE}/paystack/initialize/${encodeURIComponent(data.reference)}`,{method:'POST',headers:{'Authorization':`Bearer ${token}`}});
     const fallbackData=await fallback.json(); if(!fallback.ok) throw new Error(fallbackData.error||loadErr.message||'Unable to load Paystack checkout');
     window.location.href=fallbackData.authorization_url; return;
   }
   const popup = new PaystackPop();
   popup.newTransaction({
     key: publicKey,
     email: payload.customer.email,
     amount: Number(data.paystack_amount),
     currency: data.settlement_currency || 'NGN',
     reference: data.reference,
     onSuccess: async (transaction) => {
       try{
         showToast('Payment received. Verifying transaction...');
         const vr=await fetch(`${API_BASE}/paystack/verify/${encodeURIComponent(transaction.reference||data.reference)}`,{method:'POST'});
         const vd=await vr.json(); if(!vr.ok) throw new Error(vd.error||'Payment verification failed');
         cart=[]; saveCart(); updateCart(); renderCartPage();
         showToast('Payment successful. Your order has been confirmed.');
       }catch(err){showToast(err.message||'Payment verification failed.');}
     },
     onCancel: () => showToast('Payment was cancelled. Your order is still awaiting payment.')
   });
 }catch(err){ console.error(err); showToast(err.message||'Unable to start payment.'); }
}
async function loadWalletSummary(){
 try{const token=localStorage.getItem('swh_token');if(!token)return null;return await api('/user/wallet');}catch(e){return null;}
}
async function depositToWallet(amountUsd){
 const token=localStorage.getItem('swh_token'); if(!token){location.href='/login/?return=/dashboard/';return;}
 const amount=Number(amountUsd); if(!Number.isFinite(amount)||amount<1){showToast('Enter at least $1.00');return;}
 try{showToast('Preparing wallet deposit...');const d=await api('/wallet/deposit',{method:'POST',body:JSON.stringify({amount_usd:amount})});window.location.href=d.authorization_url;}catch(e){showToast(e.message||'Unable to start deposit.');}
}
function renderProducts(limit){
 const grid=getById('productGrid'); if(!grid)return;
 const q=(getById('searchInput')?.value||'').toLowerCase().trim();
 let list=products.filter(p=>(currentFilter==='All'||p.category===currentFilter)&&(!q||`${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q)));
 if(limit)list=list.slice(0,limit);
 grid.innerHTML=list.map(p=>`<article class="product"><div class="product-img"><img src="${p.image_url}" alt="${p.name}"><span class="badge">${p.category}</span></div><div class="product-body"><div class="product-top"><h3>${p.name}</h3><div class="stars">${'★'.repeat(Math.round(p.rating||5))}${'☆'.repeat(5-Math.round(p.rating||5))}</div></div><p>${p.description||''}</p><div class="price-row"><span class="price">${money(p.price)}</span>${p.old_price?`<span class="old-price">${money(p.old_price)}</span>`:''}</div><div class="product-actions"><button class="mini-btn light" onclick="addToCart('${p._id}',false)">Add to Cart</button><button class="mini-btn" onclick="addToCart('${p._id}',true)">Buy Now</button><button class="mini-btn whatsapp-btn" onclick="whatsappProduct('${p._id}')">WhatsApp</button></div></div></article>`).join('')||'<div class="empty" style="grid-column:1/-1">No product found.</div>';
}
function renderFilters(){const el=getById('filters');if(!el)return;const cats=['All',...new Set(products.map(p=>p.category))];el.innerHTML=cats.map(f=>`<button class="filter-btn ${f===currentFilter?'active':''}" onclick="currentFilter='${f.replaceAll("'","\\'")}';renderFilters();renderProducts();">${f}</button>`).join('');}
function bindShop(){ getById('searchInput')?.addEventListener('input',()=>renderProducts()); fetchProducts(); }
function renderCartPage(){
 const el=getById('cartPageItems');if(!el)return;
 el.innerHTML=cart.length?cart.map(item=>`<div class="cart-item" style="grid-template-columns:96px 1fr auto"><img style="width:96px;height:96px" src="${item.image_url||item.img}" alt="${item.name}"><div><h4>${item.name}</h4><div class="cart-price">${money(item.price)} x ${item.qty}</div><div class="qty"><button onclick="changeQty('${item.id}',-1)">−</button><strong>${item.qty}</strong><button onclick="changeQty('${item.id}',1)">+</button></div></div><button class="remove" onclick="removeItem('${item.id}')">×</button></div>`).join(''):'<div class="empty">Your cart is empty. Go to the shop page and add products.</div>';
 updateCart();
 // Put authentication actions directly in every public hero without changing the existing hero layout.
 const hero = document.querySelector('.page-hero .page-hero-grid > div:first-child, .home-hero .home-hero-grid > div:first-child');
 if(hero && !hero.querySelector('.hero-auth-actions')){
   hero.insertAdjacentHTML('beforeend', `<div class="hero-auth-actions"><a class="btn" href="/login/">Login</a><a class="btn secondary" href="/register/">Register</a></div>`);
 }
}
function submitSuccess(e,msg){e.preventDefault();showToast(msg);e.target.reset();}
function startSiteClock(){
  const tick=()=>{ const els=document.querySelectorAll('#siteClock,.site-clock-value'); if(!els.length)return; const now=new Date(); const time=new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(now); const date=new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos',weekday:'short',day:'2-digit',month:'short'}).format(now); els.forEach(el=>el.textContent=`${date} · ${time}`); };
  tick(); setInterval(tick,1000);
}
function startHeroRoll(){
  const el=getById('heroRollingText'); if(!el)return;
  const phrases=['skincare products.','happy routines.','trusted skincare.','everyday confidence.']; let i=0;
  setInterval(()=>{el.classList.add('rolling-out');setTimeout(()=>{i=(i+1)%phrases.length;el.textContent=phrases[i];el.classList.remove('rolling-out');el.classList.add('rolling-in');setTimeout(()=>el.classList.remove('rolling-in'),420);},260);},2800);
}
window.addEventListener('DOMContentLoaded',()=>{if(getById('productGrid')) fetchProducts(); renderCartPage(); startSiteClock(); startHeroRoll(); checkMaintenanceMode();});

async function checkMaintenanceMode(){
  const path=location.pathname;
  if(path.startsWith('/admin/')||path.startsWith('/admin-login/')) return;
  try{
    const r=await fetch(`${API_BASE}/site/maintenance?_=${Date.now()}`);
    if(!r.ok)return;
    const d=await r.json();
    if(!d.enabled)return;
    const overlay=document.createElement('div');
    overlay.id='maintenanceOverlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(255,255,255,.98);display:grid;place-items:center;padding:24px;text-align:center;font-family:inherit;';
    overlay.innerHTML=`<div style="max-width:560px"><h1 style="margin-bottom:12px">Store Maintenance</h1><p style="line-height:1.7;color:#667085">${String(d.message||'We are currently performing scheduled maintenance. Please check back shortly.').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}</p><p style="font-size:.9rem;color:#98a2b3">The administrator dashboard remains available.</p></div>`;
    document.body.appendChild(overlay);
  }catch(_e){}
}
