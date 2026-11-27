/*
 * Service de l'espace admin du site BCL × USBL (Cloudflare Worker).
 *
 * - Comptes : super admin (tous les droits) ou éditeur d'un club (BCL ou USBL).
 *   Les comptes sont rangés dans Workers KV (jamais dans le dépôt public).
 * - Contenus : actus, événements, albums, bandeau = fichiers docs/data/*.json du dépôt GitHub.
 *   Chaque enregistrement est un commit signé du nom de la personne : historique complet, retour arrière possible.
 * - Photos : envoyées déjà redimensionnées par la page admin, rangées dans docs/uploads/.
 * - Demandes / suggestions : rangées dans Workers KV, visibles dans l'admin.
 *
 * Secrets (posés par GitHub Actions) : SITE_REPO_TOKEN, SETUP_CODE, SESSION_SECRET.
 */

const CONTENUS = ['actus', 'evenements', 'albums', 'bandeau'];
const CLUBS = ['bcl', 'usbl', 'commun'];
const SESSION_H = 12;            // durée d'une connexion, en heures
const PBKDF2_ITER = 25000;       // limité par le temps de calcul du plan gratuit
const MAX_UPLOAD = 2.5 * 1024 * 1024;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin'
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(req, env);
      Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e && e.stack || e);
      return json({ erreur: status === 500 ? 'Erreur du serveur, réessayez dans un instant.' : e.message }, status, cors);
    }
  }
};

// ---------------------------------------------------------------- routes
async function route(req, env) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;

  if (p === '/' && m === 'GET') return json({ ok: true, service: 'admin BCL × USBL' });
  if (p === '/setup' && m === 'POST') return setup(req, env);
  if (p === '/login' && m === 'POST') return login(req, env);
  if (p === '/invitation' && m === 'POST') return acceptInvite(req, env);

  const me = await auth(req, env);
  if (p === '/me' && m === 'GET') return json(publicUser(me));
  if (p === '/password' && m === 'POST') return changePassword(req, env, me);

  let r;
  if ((r = p.match(/^\/contenu\/([a-z]+)$/))) {
    if (!CONTENUS.includes(r[1])) throw err(404, 'Contenu inconnu.');
    if (m === 'GET') return getContent(env, r[1]);
    if (m === 'PUT') return putContent(req, env, me, r[1]);
  }
  if (p === '/photo' && m === 'POST') return upload(req, env, me);

  if (p === '/demandes' && m === 'GET') return listDemandes(env, me);
  if (p === '/demandes' && m === 'POST') return addDemande(req, env, me);
  if ((r = p.match(/^\/demandes\/([\w-]+)$/)) && m === 'PATCH') return updateDemande(req, env, me, r[1]);

  if (p === '/comptes' && m === 'GET') return listUsers(env, me);
  if (p === '/comptes' && m === 'POST') return createUser(req, env, me);
  if ((r = p.match(/^\/comptes\/(.+)\/invitation$/)) && m === 'POST') return reinvite(env, me, decodeURIComponent(r[1]));
  if ((r = p.match(/^\/comptes\/(.+)$/)) && m === 'DELETE') return deleteUser(env, me, decodeURIComponent(r[1]));

  throw err(404, 'Adresse inconnue.');
}

// ---------------------------------------------------------------- comptes et connexion
async function setup(req, env) {
  const b = await body(req);
  if (!env.SETUP_CODE || !safeEq(String(b.code || ''), env.SETUP_CODE)) { await slow(); throw err(403, 'Code d’installation incorrect.'); }
  const email = cleanEmail(b.email);
  if (await env.ADMIN_KV.get('user:' + email)) throw err(409, 'Ce compte existe déjà : connectez-vous.');
  const user = { email, nom: text(b.nom, 80, true), role: 'superadmin', club: null, cree: now() };
  Object.assign(user, await hashPassword(checkPassword(b.motDePasse)));
  await env.ADMIN_KV.put('user:' + email, JSON.stringify(user));
  return json({ jeton: await sign(env, email), compte: publicUser(user) });
}

async function login(req, env) {
  const b = await body(req);
  const email = cleanEmail(b.email);
  const ip = req.headers.get('CF-Connecting-IP') || 'x';
  const key = 'essais:' + ip;
  const essais = +(await env.ADMIN_KV.get(key) || 0);
  if (essais >= 8) throw err(429, 'Trop d’essais. Réessayez dans 15 minutes.');
  const user = await getUser(env, email);
  if (!user || !user.hash || !(await verifyPassword(String(b.motDePasse || ''), user))) {
    await env.ADMIN_KV.put(key, String(essais + 1), { expirationTtl: 900 });
    await slow();
    throw err(401, 'E-mail ou mot de passe incorrect.');
  }
  return json({ jeton: await sign(env, email), compte: publicUser(user) });
}

async function acceptInvite(req, env) {
  const b = await body(req);
  const user = await getUser(env, cleanEmail(b.email));
  const inv = user && user.invitation;
  if (!inv || !safeEq(String(b.code || ''), inv.code) || inv.expire < Date.now()) { await slow(); throw err(403, 'Invitation invalide ou expirée : demandez-en une nouvelle.'); }
  Object.assign(user, await hashPassword(checkPassword(b.motDePasse)));
  delete user.invitation;
  await env.ADMIN_KV.put('user:' + user.email, JSON.stringify(user));
  return json({ jeton: await sign(env, user.email), compte: publicUser(user) });
}

async function changePassword(req, env, me) {
  const b = await body(req);
  if (!(await verifyPassword(String(b.ancien || ''), me))) throw err(403, 'Mot de passe actuel incorrect.');
  Object.assign(me, await hashPassword(checkPassword(b.nouveau)));
  await env.ADMIN_KV.put('user:' + me.email, JSON.stringify(me));
  return json({ ok: true });
}

async function listUsers(env, me) {
  needSuper(me);
  const list = await env.ADMIN_KV.list({ prefix: 'user:' });
  const users = await Promise.all(list.keys.map((k) => env.ADMIN_KV.get(k.name, 'json')));
  return json(users.filter(Boolean).map(publicUser).sort((a, b) => a.nom.localeCompare(b.nom)));
}

async function createUser(req, env, me) {
  needSuper(me);
  const b = await body(req);
  const email = cleanEmail(b.email);
  if (await env.ADMIN_KV.get('user:' + email)) throw err(409, 'Un compte existe déjà avec cet e-mail.');
  const role = b.role === 'superadmin' ? 'superadmin' : 'editeur';
  const club = role === 'editeur' ? oneOf(b.club, ['bcl', 'usbl'], 'Club') : null;
  const user = { email, nom: text(b.nom, 80, true), role, club, cree: now(), creePar: me.email, invitation: newInvite() };
  await env.ADMIN_KV.put('user:' + email, JSON.stringify(user));
  return json({ compte: publicUser(user), invitation: user.invitation.code }, 201);
}

async function reinvite(env, me, email) {
  needSuper(me);
  const user = await getUser(env, cleanEmail(email));
  if (!user) throw err(404, 'Compte introuvable.');
  user.invitation = newInvite();
  await env.ADMIN_KV.put('user:' + user.email, JSON.stringify(user));
  return json({ invitation: user.invitation.code });
}

async function deleteUser(env, me, email) {
  needSuper(me);
  email = cleanEmail(email);
  if (email === me.email) throw err(400, 'Vous ne pouvez pas supprimer votre propre compte.');
  const user = await getUser(env, email);
  if (!user) throw err(404, 'Compte introuvable.');
  if (user.role === 'superadmin') {
    const list = await env.ADMIN_KV.list({ prefix: 'user:' });
    const supers = (await Promise.all(list.keys.map((k) => env.ADMIN_KV.get(k.name, 'json')))).filter((u) => u && u.role === 'superadmin');
    if (supers.length <= 2) throw err(400, 'Il faut garder au moins deux super admins (un par club).');
  }
  await env.ADMIN_KV.delete('user:' + email);
  return json({ ok: true });
}

function newInvite() {
  return { code: randomId(24), expire: Date.now() + 7 * 24 * 3600 * 1000 };
}

function publicUser(u) {
  return { email: u.email, nom: u.nom, role: u.role, club: u.club || null, actif: !!u.hash, invitationEnCours: !!u.invitation };
}

async function getUser(env, email) { return email ? env.ADMIN_KV.get('user:' + email, 'json') : null; }

async function auth(req, env) {
  const h = req.headers.get('Authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [payload, sig] = tok.split('.');
  if (!payload || !sig || !safeEq(sig, await hmac(env, payload))) throw err(401, 'Session expirée : reconnectez-vous.');
  const data = JSON.parse(b64d(payload));
  if (data.exp < Date.now()) throw err(401, 'Session expirée : reconnectez-vous.');
  const user = await getUser(env, data.email);
  if (!user || !user.hash) throw err(401, 'Compte désactivé.');
  return user;
}

async function sign(env, email) {
  const payload = b64e(JSON.stringify({ email, exp: Date.now() + SESSION_H * 3600 * 1000 }));
  return payload + '.' + (await hmac(env, payload));
}

function needSuper(me) { if (me.role !== 'superadmin') throw err(403, 'Réservé aux super admins.'); }

// ---------------------------------------------------------------- contenus (fichiers du dépôt)
async function getContent(env, name) {
  const f = await gh(env, 'GET', `contents/docs/data/${name}.json?ref=${env.BRANCH}`);
  return json({ data: JSON.parse(b64dUtf8(f.content)), version: f.sha });
}

async function putContent(req, env, me, name) {
  const b = await body(req);
  const cur = await gh(env, 'GET', `contents/docs/data/${name}.json?ref=${env.BRANCH}`);
  if (b.version && b.version !== cur.sha) throw err(409, 'Quelqu’un d’autre vient de modifier ce contenu : rechargez la page avant d’enregistrer.');
  const raw = JSON.parse(b64dUtf8(cur.content));
  let before; try { before = clean(name, raw); } catch { before = raw; }   // même mise en forme des deux côtés
  const after = clean(name, b.data);
  const resume = checkRights(me, name, before, after);
  if (!resume) return json({ version: cur.sha, inchange: true });
  const res = await gh(env, 'PUT', `contents/docs/data/${name}.json`, {
    message: `Admin (${me.nom}) : ${resume}`,
    content: b64eUtf8(JSON.stringify(after, null, 1) + '\n'),
    sha: cur.sha, branch: env.BRANCH,
    author: { name: me.nom, email: 'admin@basket-lislejourdain.invalid' }
  });
  return json({ version: res.content.sha });
}

// Un éditeur ne touche qu'aux contenus de son club et aux contenus communs.
function checkRights(me, name, before, after) {
  const ok = (club) => me.role === 'superadmin' || club === me.club || club === 'commun';
  if (name === 'bandeau') {
    if (JSON.stringify(before) === JSON.stringify(after)) return '';
    if (!ok(before.club) || !ok(after.club)) throw err(403, 'Ce bandeau appartient à l’autre club.');
    return after.actif ? 'bandeau d’alerte « ' + after.message.slice(0, 60) + ' »' : 'bandeau d’alerte retiré';
  }
  const old = new Map(before.map((x) => [x.id, x]));
  const neu = new Map(after.map((x) => [x.id, x]));
  const changes = [];
  for (const [id, x] of neu) {
    const o = old.get(id);
    if (o && JSON.stringify(o) === JSON.stringify(x)) continue;
    if ((o && !ok(o.club)) || !ok(x.club)) throw err(403, `« ${x.titre} » appartient à l’autre club : vous ne pouvez pas le modifier.`);
    changes.push((o ? 'modifie ' : 'ajoute ') + '« ' + x.titre + ' »');
  }
  for (const [id, o] of old) {
    if (neu.has(id)) continue;
    if (!ok(o.club)) throw err(403, `« ${o.titre} » appartient à l’autre club : vous ne pouvez pas le supprimer.`);
    changes.push('supprime « ' + o.titre + ' »');
  }
  const label = { actus: 'actus', evenements: 'agenda', albums: 'galerie' }[name];
  return changes.length ? label + ' — ' + changes.join(', ').slice(0, 300) : (JSON.stringify(before) === JSON.stringify(after) ? '' : label + ' — nouvel ordre');
}

// Vérifie et nettoie les données envoyées (champs connus seulement, longueurs limitées)
function clean(name, d) {
  if (name === 'bandeau') {
    const o = d || {};
    return { actif: !!o.actif, message: text(o.message, 220), lien: link(o.lien), texteLien: text(o.texteLien, 40), fin: date(o.fin), club: oneOf(o.club || 'commun', CLUBS, 'Club') };
  }
  if (!Array.isArray(d)) throw err(400, 'Données invalides.');
  if (d.length > 300) throw err(400, 'Trop d’éléments.');
  const ids = new Set();
  return d.map((o) => {
    const id = slugId(o.id);
    if (ids.has(id)) throw err(400, 'Identifiant en double : ' + id);
    ids.add(id);
    const base = { id, club: oneOf(o.club, CLUBS, 'Club'), titre: text(o.titre, 140, true) };
    if (name === 'actus') return { ...base, rubrique: text(o.rubrique, 40), date: date(o.date, true), dateTexte: text(o.dateTexte, 40), image: media(o.image), lien: link(o.lien), fin: date(o.fin) };
    if (name === 'evenements') return { ...base, type: oneOf(o.type, ['Stages', 'Tournois', 'Soirées', 'Engagement', 'Assemblées'], 'Type'), date: date(o.date), dateFin: date(o.dateFin), mois: month(o.mois), periode: text(o.periode, 40), heure: text(o.heure, 30), lieu: text(o.lieu, 120), details: text(o.details, 300) };
    if (name === 'albums') {
      if (!o.mineursFloutes) throw err(400, `Album « ${base.titre} » : confirmez que les visages des mineurs sont floutés (ou qu’il n’y en a pas).`);
      const photos = Array.isArray(o.photos) ? o.photos.map(media).filter(Boolean).slice(0, 60) : [];
      return { ...base, sousTitre: text(o.sousTitre, 140), date: date(o.date, true), description: text(o.description, 1500), photos, mineursFloutes: true };
    }
    return base;
  });
}

// ---------------------------------------------------------------- photos
async function upload(req, env, me) {
  const b = await body(req, MAX_UPLOAD * 1.4);
  const type = oneOf(b.type, ['image/jpeg', 'image/png', 'image/webp'], 'Format');
  const raw = String(b.donnees || '').replace(/^data:[^,]+,/, '');
  if (raw.length * 0.75 > MAX_UPLOAD) throw err(413, 'Photo trop lourde.');
  const d = new Date();
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type];
  const base = slugId(String(b.nom || 'photo').replace(/\.[a-z0-9]+$/i, '')).slice(0, 40) || 'photo';
  const path = `uploads/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${base}-${randomId(6)}.${ext}`;
  await gh(env, 'PUT', `contents/docs/${path}`, {
    message: `Admin (${me.nom}) : photo ${base}`, content: raw, branch: env.BRANCH,
    author: { name: me.nom, email: 'admin@basket-lislejourdain.invalid' }
  });
  return json({ chemin: path }, 201);
}

// ---------------------------------------------------------------- demandes et suggestions
async function addDemande(req, env, me) {
  const b = await body(req);
  const id = Date.now().toString(36) + '-' + randomId(4);
  const d = { id, type: oneOf(b.type, ['Correction', 'Idée', 'Photo à ajouter', 'Nouvelle page', 'Autre'], 'Type'), page: text(b.page, 80), message: text(b.message, 3000, true),
    auteur: me.nom, email: me.email, club: me.club, date: now(), statut: 'Reçue' };
  await env.ADMIN_KV.put('demande:' + id, JSON.stringify(d));
  return json(d, 201);
}

async function listDemandes(env, me) {
  const list = await env.ADMIN_KV.list({ prefix: 'demande:' });
  const all = (await Promise.all(list.keys.map((k) => env.ADMIN_KV.get(k.name, 'json')))).filter(Boolean);
  const mine = me.role === 'superadmin' ? all : all.filter((d) => d.email === me.email);
  return json(mine.sort((a, b) => b.date.localeCompare(a.date)));
}

async function updateDemande(req, env, me, id) {
  needSuper(me);
  const d = await env.ADMIN_KV.get('demande:' + id, 'json');
  if (!d) throw err(404, 'Demande introuvable.');
  const b = await body(req);
  d.statut = oneOf(b.statut, ['Reçue', 'En cours', 'Faite', 'Refusée'], 'Statut');
  if (b.reponse !== undefined) d.reponse = text(b.reponse, 1000);
  d.majPar = me.nom; d.maj = now();
  await env.ADMIN_KV.put('demande:' + id, JSON.stringify(d));
  return json(d);
}

// ---------------------------------------------------------------- GitHub
async function gh(env, method, path, payload) {
  const r = await fetch(`https://api.github.com/repos/${env.REPO}/${path}`, {
    method,
    headers: { Authorization: 'Bearer ' + env.SITE_REPO_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'admin-bcl-usbl', 'X-GitHub-Api-Version': '2022-11-28', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    body: payload ? JSON.stringify(payload) : undefined
  });
  if (r.status === 409 || r.status === 422) throw err(409, 'Conflit d’enregistrement : rechargez la page et réessayez.');
  if (!r.ok) { console.error('GitHub', r.status, await r.text()); throw err(502, 'GitHub ne répond pas correctement, réessayez dans un instant.'); }
  return r.json();
}

// ---------------------------------------------------------------- outils
function json(o, status = 200, headers = {}) {
  return new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}
function err(status, message) { const e = new Error(message); e.status = status; return e; }
async function body(req, max = 64 * 1024) {
  const t = await req.text();
  if (t.length > max) throw err(413, 'Envoi trop volumineux.');
  try { return JSON.parse(t || '{}'); } catch { throw err(400, 'Données illisibles.'); }
}
function text(v, max, required) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (required && !s) throw err(400, 'Un champ obligatoire est vide.');
  if (s.length > max) throw err(400, `Texte trop long (${max} caractères maximum).`);
  return s;
}
function oneOf(v, list, label) { if (!list.includes(v)) throw err(400, label + ' invalide.'); return v; }
function date(v, required) {
  const s = String(v || '');
  if (!s) { if (required) throw err(400, 'Date obligatoire.'); return ''; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw err(400, 'Date invalide.');
  return s;
}
function month(v) { const s = String(v || ''); if (s && !/^\d{4}-\d{2}$/.test(s)) throw err(400, 'Mois invalide.'); return s; }
function link(v) {
  const s = text(v, 300);
  if (!s) return '';
  if (/^(https?:\/\/|mailto:)/i.test(s) || /^[\w-]+\.html(#[\w-]*)?$/.test(s) || /^#[\w-]+$/.test(s)) return s;
  throw err(400, 'Lien invalide : utilisez une adresse complète (https://…) ou une page du site.');
}
function media(v) {
  const s = String(v || '');
  if (!s) return '';
  if (/^(assets\/img|uploads\/\d{4}\/\d{2})\/[\w.-]+\.(jpe?g|png|webp)$/i.test(s)) return s;
  throw err(400, 'Photo invalide.');
}
function slugId(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || randomId(8);
}
function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.length > 120) throw err(400, 'Adresse e-mail invalide.');
  return e;
}
function checkPassword(p) {
  p = String(p || '');
  if (p.length < 10) throw err(400, 'Mot de passe trop court : 10 caractères minimum.');
  if (p.length > 200) throw err(400, 'Mot de passe trop long.');
  return p;
}
function now() { return new Date().toISOString(); }
function randomId(n) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a, (x) => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join('');
}
function safeEq(a, b) {
  a = String(a); b = String(b);
  let r = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}
function slow() { return new Promise((r) => setTimeout(r, 400)); }
const enc = new TextEncoder();
function b64e(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64d(s) { return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))); }
function b64eUtf8(s) { const bytes = enc.encode(s); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }
function b64dUtf8(s) { const bin = atob(String(s).replace(/\n/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); }
async function hmac(env, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function derive(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
async function hashPassword(p) { const salt = randomId(16); return { salt, iter: PBKDF2_ITER, hash: await derive(p, salt, PBKDF2_ITER) }; }
async function verifyPassword(p, u) { return u.hash && safeEq(await derive(p, u.salt, u.iter || PBKDF2_ITER), u.hash); }
