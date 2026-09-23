const API = (window.SWH_API_BASE_URL || '__API_BASE_URL__').replace(/\/$/, '');
const getToken=()=>localStorage.getItem('swh_token');
const getPendingToken=()=>localStorage.getItem('swh_pending_token');
const saveSession=d=>{localStorage.setItem('swh_token',d.token);localStorage.setItem('swh_user',JSON.stringify(d.user));localStorage.removeItem('swh_pending_token');};
const savePending=d=>{localStorage.setItem('swh_pending_token',d.pendingToken);localStorage.setItem('swh_pending_user',JSON.stringify(d.user));};
const sessionUser=()=>{try{return JSON.parse(localStorage.getItem('swh_user')||'null')}catch{return null}};
const authHeaders=()=>({Authorization:`Bearer ${getToken()}`});
async function api(path,options={}){const headers={...(options.headers||{})}; const token=options.pending ? getPendingToken() : getToken(); if(token)headers.Authorization=`Bearer ${token}`; if(options.body && !(options.body instanceof FormData))headers['Content-Type']='application/json'; const r=await fetch(`${API}${path}`,{...options,headers}); const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||d.message||'Request failed'); return d;}
function logout(target='/'){localStorage.removeItem('swh_token');localStorage.removeItem('swh_user');localStorage.removeItem('swh_pending_token');localStorage.removeItem('swh_pending_user');location.href=target;}
async function requireUser(){try{const d=await api('/auth/me');return d.user}catch(e){logout();}}
async function requireAdmin(){const u=await requireUser();if(u?.role!=='admin'){location.href='/admin/';return null}return u;}
function toggleField(id, button){const el=document.getElementById(id);if(!el)return;const show=el.type==='password';el.type=show?'text':'password';if(button){button.textContent=show?'Hide':'Show';button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',show?'Hide password':'Show password');}}
