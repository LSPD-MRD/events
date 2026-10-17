const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status:s, headers:{'Content-Type':'application/json; charset=utf-8', ...h} });
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/\n/g,''))));
const RESERVED = ['panel','public','worker','api'];
const okSlug = s => typeof s==='string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length<=60 && !RESERVED.includes(s);
const okHtml = h => typeof h==='string' && h.length<200000 && (h.match(/<script/gi)||[]).length===1 && !/<[^>]+\son[a-z]+\s*=|javascript:|<iframe|<object|<embed/i.test(h);
const okText = v => v===undefined || (typeof v==='string' && v.length<300 && !/[<>]/.test(v));
const okEntry = e => e && ['live','soon','archived'].includes(e.status) && typeof e.href==='string' && /^([a-z0-9-]+\/)?$/.test(e.href) && ['icon','title','desc','date'].every(k=>okText(e[k]));
const gh = (env,path,init={}) => fetch(`https://api.github.com/repos/${env.OWNER}/${env.REPO}/contents/${path}`+(init.method?'':`?ref=${env.BRANCH}`),{...init,headers:{Authorization:`Bearer ${env.GH_TOKEN}`,Accept:'application/vnd.github+json','User-Agent':'mrd-panel','Content-Type':'application/json'}});
async function read(env,path){const r=await gh(env,path);if(r.status===404)return null;if(!r.ok)throw new Error('GitHub '+r.status);const f=await r.json();return{sha:f.sha,text:unb64(f.content)};}
async function write(env,path,text,message){const f=await read(env,path);const r=await gh(env,path,{method:'PUT',body:JSON.stringify({message,content:b64(text),branch:env.BRANCH,sha:f&&f.sha})});if(!r.ok)throw new Error('GitHub '+r.status);}
const parse = t => JSON.parse(t.slice(t.indexOf('['),t.lastIndexOf(']')+1));
const serialize = l => 'const EVENTS = '+JSON.stringify(l,null,2)+';\n';
const parseContent = t => {const a=t.indexOf('{'),z=t.lastIndexOf('}');return JSON.parse(t.slice(a,z+1));};
const serializeContent = o => 'window.EVENT_CONTENT = '+JSON.stringify(o,null,2)+';\n';
function extractPage(html){const start=html.search(/<div\s+class=["']page["'][^>]*>/i);if(start<0)return null;const tags=/<\/?div\b[^>]*>/gi;tags.lastIndex=start;let depth=0,m;while((m=tags.exec(html))){if(/^<\s*\//.test(m[0]))depth--;else if(!/\/\s*>$/.test(m[0]))depth++;if(depth===0)return html.slice(start,tags.lastIndex);}return null;}
const enc = s => new TextEncoder().encode(s);
const hex = b => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const hash = async s => hex(await crypto.subtle.digest('SHA-256',enc(s)));
const randomToken = (n=32) => {const a=crypto.getRandomValues(new Uint8Array(n));return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');};
async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',enc(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc(salt),iterations:150000,hash:'SHA-256'},key,256));}
const normUser = s => String(s||'').trim().toLowerCase();
const publicUser = u => ({id:u.id,username:u.username,grade:u.grade,role:u.role,active:!!u.active});
async function getUser(req,env){const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return null;const th=await hash(token);const row=await env.DB.prepare('SELECT u.id,u.username,u.grade,u.role,u.active,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').bind(th).first();if(!row||!row.active||row.expires_at<Date.now()){if(row)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(th).run();return null;}return row;}
const isOwner = u => u && u.role==='owner';
const canPublish = u => u && ['owner','admin','editor'].includes(u.role);
export default { async fetch(req,env) {
 const origin=req.headers.get('Origin')||'';
 const allowed=env.ALLOWED_ORIGIN||'';
 const cors={'Access-Control-Allow-Origin':allowed==='*'?'*':(origin===allowed?origin:allowed),'Vary':'Origin','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Setup-Key','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Max-Age':'86400'};
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return json({error:'méthode refusée'},405,cors);
 if(!env.DB)return json({error:'Base D1 non configurée. Suivre le README pour créer la base et exécuter schema.sql.'},503,cors);
 const route=new URL(req.url).pathname;
 let b={};try{b=await req.json();}catch{return json({error:'requête illisible'},400,cors);}
 try {
  if(route==='/auth/setup-owner'){
   if(!env.OWNER_SETUP_KEY||req.headers.get('X-Setup-Key')!==env.OWNER_SETUP_KEY)return json({error:'clé de configuration invalide'},403,cors);
   const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role='owner'").first();
   if(count.n>0)return json({error:'Le compte Owner existe déjà. Route de configuration verrouillée.'},409,cors);
   const username=normUser(b.username),password=String(b.password||''),grade=String(b.grade||'Owner');
   if(!/^[a-z0-9._-]{3,32}$/.test(username)||password.length<14||password.length>128)return json({error:'Identifiant invalide ou mot de passe trop court (14 caractères minimum).'},400,cors);
   const salt=randomToken(16),ph=await passwordHash(password,salt);
   await env.DB.prepare('INSERT INTO users(username,password_hash,salt,grade,role,active,created_at) VALUES(?,?,?,?,?,?,?)').bind(username,ph,salt,grade.slice(0,60),'owner',1,Date.now()).run();
   return json({ok:true,message:'Compte Owner créé. Supprime/rotate la clé OWNER_SETUP_KEY après configuration.'},201,cors);
  }
  if(route==='/auth/login'){
   const username=normUser(b.username),password=String(b.password||'');
   if(!/^[a-z0-9._-]{3,32}$/.test(username)||password.length>128)return json({error:'Identifiant ou mot de passe incorrect.'},401,cors);
   const now=Date.now();
   const attempts=await env.DB.prepare('SELECT attempts,window_until FROM login_attempts WHERE username=?').bind(username).first();
   if(attempts && attempts.window_until>now && attempts.attempts>=8)return json({error:'Trop de tentatives. Réessaie dans quelques minutes.'},429,cors);
   const u=await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
   const candidate=u ? await passwordHash(password,u.salt) : '';
   if(!u||!u.active||candidate!==u.password_hash){
    const next=attempts&&attempts.window_until>now?attempts.attempts+1:1, until=attempts&&attempts.window_until>now?attempts.window_until:now+10*60*1000;
    await env.DB.prepare('INSERT INTO login_attempts(username,attempts,window_until) VALUES(?,?,?) ON CONFLICT(username) DO UPDATE SET attempts=excluded.attempts,window_until=excluded.window_until').bind(username,next,until).run();
    return json({error:'Identifiant ou mot de passe incorrect.'},401,cors);
   }
   await env.DB.prepare('DELETE FROM login_attempts WHERE username=?').bind(username).run();
   const token=randomToken(32),expires=Date.now()+12*60*60*1000;
   await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await hash(token),u.id,expires,Date.now()).run();
   return json({token,expiresAt:expires,user:publicUser(u)},200,cors);
  }
  const user=await getUser(req,env);
  if(!user)return json({error:'Session absente ou expirée. Reconnecte-toi.'},401,cors);
  if(route==='/auth/me')return json({user:publicUser(user)},200,cors);
  if(route==='/auth/logout'){const token=(req.headers.get('Authorization')||'').replace(/^Bearer\\s+/i,'');if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run();return json({ok:true},200,cors);}
  if(route==='/users/list'){
   if(!isOwner(user))return json({error:'Réservé au Owner.'},403,cors);
   const result=await env.DB.prepare('SELECT id,username,grade,role,active,created_at FROM users ORDER BY created_at DESC').all();
   return json({users:result.results||[]},200,cors);
  }
  if(route==='/users/create'){
   if(!isOwner(user))return json({error:'Réservé au Owner.'},403,cors);
   const username=normUser(b.username),password=String(b.password||''),grade=String(b.grade||'').trim(),role=String(b.role||'editor');
   if(!/^[a-z0-9._-]{3,32}$/.test(username))return json({error:'Identifiant : 3 à 32 caractères (lettres, chiffres, point, tiret, underscore).'},400,cors);
   if(password.length<12||password.length>128)return json({error:'Le mot de passe doit contenir au moins 12 caractères.'},400,cors);
   if(!['admin','editor','viewer'].includes(role))return json({error:'Rôle non autorisé.'},400,cors);
   if(!grade||grade.length>60)return json({error:'Grade invalide.'},400,cors);
   const salt=randomToken(16),ph=await passwordHash(password,salt);
   try{const r=await env.DB.prepare('INSERT INTO users(username,password_hash,salt,grade,role,active,created_at) VALUES(?,?,?,?,?,1,?)').bind(username,ph,salt,grade,role,Date.now()).run();return json({ok:true,id:r.meta?.last_row_id},201,cors);}catch(e){return json({error:'Cet identifiant existe déjà.'},409,cors);}
  }
  if(route==='/users/disable'){
   if(!isOwner(user))return json({error:'Réservé au Owner.'},403,cors);
   const id=Number(b.id);if(!Number.isInteger(id)||id===user.id)return json({error:'Compte invalide.'},400,cors);
   await env.DB.prepare('UPDATE users SET active=0 WHERE id=? AND role<>?').bind(id,'owner').run();
   await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
   return json({ok:true},200,cors);
  }
  if(route==='/ping')return json({ok:true,architecture:'unified-portal-auth',user:publicUser(user)},200,cors);
  if(route==='/publish'){
   if(!canPublish(user))return json({error:'Ton grade ne permet pas de publier.'},403,cors);
   if(!okSlug(b.slug)||!okHtml(b.html)||!okEntry(b.card)||b.card.href!==b.slug+'/'||typeof b.config!=='string'||b.config.length>200000)return json({error:'données refusées'},400,cors);
   JSON.parse(b.config);
   const cf=await read(env,'public/events-content.js');const contents=cf?parseContent(cf.text):{};
   const full=b.html.replace(/\\.\\.\\/public\\//g,'./public/').replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi,'');
   const extracted=extractPage(full);if(!extracted)return json({error:'structure de page invalide'},400,cors);
   contents[b.slug]=extracted;
   await write(env,'public/events-content.js',serializeContent(contents),`Contenu événement ${b.slug} (${user.username})`);
   const f=await read(env,'public/events-data.js');const list=parse(f.text),i=list.findIndex(x=>x.href===b.card.href);
   if(i<0)list.unshift(b.card);else list[i]=b.card;
   await write(env,'public/events-data.js',serialize(list),`Portail : ${b.slug} (${user.username})`);
   return json({ok:true,mode:'integrated',message:'Événement publié dans le portail centralisé.'},200,cors);
  }
  if(route==='/portal'){
   if(!canPublish(user))return json({error:'Ton grade ne permet pas de modifier le portail.'},403,cors);
   if(!Array.isArray(b.list)||b.list.length>200||!b.list.every(okEntry))return json({error:'données refusées'},400,cors);
   await write(env,'public/events-data.js',serialize(b.list),`Portail mis à jour (${user.username})`);
   return json({ok:true},200,cors);
  }
  return json({error:'route inconnue'},404,cors);
 } catch(e){return json({error:e.message||'Erreur serveur'},500,cors);}
}};
