// Avant la publication : crée (une seule fois) l'espace de stockage des comptes et des demandes,
// inscrit son identifiant dans wrangler.toml, et note l'adresse du service pour la page admin.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
const api = async (path, init = {}) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const j = await r.json();
  if (!j.success) throw new Error(`${path} : ${JSON.stringify(j.errors)}`);
  return j.result;
};
const TITLE = 'admin-bcl-usbl';
let ns = (await api('storage/kv/namespaces?per_page=100')).find((n) => n.title === TITLE);
if (!ns) { ns = await api('storage/kv/namespaces', { method: 'POST', body: JSON.stringify({ title: TITLE }) }); console.log('Stockage créé :', ns.id); }
const toml = 'worker/wrangler.toml';
writeFileSync(toml, readFileSync(toml, 'utf8').replace('__KV_ID__', ns.id));
// Adresse ….workers.dev du compte : créée ici si elle n'existe pas encore
let sub = null;
try { sub = (await api('workers/subdomain')).subdomain; } catch (e) { console.log('Pas encore d’adresse workers.dev :', e.message); }
for (const name of ['basket-lislejourdain', 'basket-lislejourdain-32', 'bcl-usbl-' + Math.random().toString(36).slice(2, 6)]) {
  if (sub) break;
  try { sub = (await api('workers/subdomain', { method: 'PUT', body: JSON.stringify({ subdomain: name }) })).subdomain; console.log('Adresse workers.dev créée :', sub); }
  catch (e) { console.log('Nom « ' + name + ' » indisponible :', e.message); }
}
if (!sub) throw new Error('Impossible de créer l’adresse workers.dev : ouvrez « Workers & Pages » dans Cloudflare et choisissez un sous-domaine, puis relancez.');
const url = `https://admin-bcl-usbl.${sub}.workers.dev`;
mkdirSync('docs/admin', { recursive: true });
writeFileSync('docs/admin/api.json', JSON.stringify({ url }, null, 1) + '\n');
console.log('Adresse du service :', url);
