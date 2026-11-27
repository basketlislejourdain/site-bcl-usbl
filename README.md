# Site commun BCL × USBL — Basketball à L'Isle-Jourdain

Site du **Basket Club Lislois** (section féminine) et de l'**USBL** (section masculine).
Site statique hébergé gratuitement sur **GitHub Pages**, nom de domaine chez **OVH**.

## Organisation du dépôt

| Dossier | Contenu |
| --- | --- |
| `src/pages/` | Les pages, reprises des maquettes validées (`X.dc.html` = version ordinateur, `MX.dc.html` = version mobile ; `Header`, `Footer`, `MHeader`, `MFooter`, `MMenu` = éléments communs). |
| `src/assets/` | Images, PDF du planning, polices (hébergées ici, sans appel à Google), styles et scripts. |
| `src/static/` | Fichiers copiés tels quels (page 404…). |
| `src/site.json` | Nom de domaine du site. |
| `tools/` | Scripts de construction et de vérification. |
| `docs/` | **Le site publié** (généré : ne pas modifier à la main), sauf `docs/data/` et `docs/uploads/`. |
| `docs/data/` | Contenus gérés par l'espace admin : `actus.json`, `evenements.json`, `albums.json`, `bandeau.json`. Lus par les pages à chaque visite ; jamais effacés par la construction (valeurs de départ dans `src/data-initial/`). |

Les pages s'affichent grâce à `src/assets/js/dc.js`, un petit moteur qui reprend la syntaxe des maquettes
(`{{valeur}}`, boucles `sc-for`, conditions `sc-if`, éléments communs `dc-import`). Sous 900 px de large,
c'est la version mobile qui s'affiche.

Les boutons « Envoyer » (contact, partenariat) ouvrent la messagerie du visiteur avec un e-mail pré-rempli
vers le bon club (`src/assets/js/forms.js`) : pas de serveur, pas de données stockées.

## Modifier le site

1. Modifier les fichiers dans `src/` (texte des pages, images…).
2. Reconstruire :
   ```bash
   pip install playwright && playwright install chromium   # une seule fois
   python3 tools/build.py        # construit docs/
   python3 tools/prerender.py    # version lisible sans JavaScript (moteurs de recherche)
   python3 tools/build.py
   python3 tools/check.py        # vérifie chaque page (ordinateur + mobile), captures dans /tmp/shots
   ```
3. Envoyer sur GitHub (`git commit` puis `git push`) : le site est mis à jour en une à deux minutes.

## Préversion (avant la publication officielle)

Tant que `src/site.json` contient `"preview": true`, chaque page porte la consigne `noindex` : le site est en ligne
à l'adresse GitHub (`https://basketlislejourdain.github.io/site-bcl-usbl/`) mais les moteurs de recherche ne le
référencent pas. On partage le lien uniquement avec les gens du club.

**Le jour du lancement** : dans `src/site.json`, mettre `"preview": false`, renseigner `"domain"` (ex. `basket-lislois.fr`),
`"url"` (`https://basket-lislois.fr`) et `"basePath": "/"`, reconstruire, puis suivre les étapes ci-dessous.

## Mise en ligne (à faire une fois)

### GitHub Pages
Dans le dépôt : **Settings → Pages** → *Build and deployment* : **Deploy from a branch**, branche `main`, dossier `/docs`.
Puis **Custom domain** : saisir le nom de domaine, et cocher **Enforce HTTPS** dès que c'est proposé.

### OVH (zone DNS du domaine)
Espace client OVH → **Noms de domaine** → le domaine → **Zone DNS** :

| Type | Sous-domaine | Cible |
| --- | --- | --- |
| A | *(vide)* | 185.199.108.153 |
| A | *(vide)* | 185.199.109.153 |
| A | *(vide)* | 185.199.110.153 |
| A | *(vide)* | 185.199.111.153 |
| AAAA | *(vide)* | 2606:50c0:8000::153 |
| AAAA | *(vide)* | 2606:50c0:8001::153 |
| AAAA | *(vide)* | 2606:50c0:8002::153 |
| AAAA | *(vide)* | 2606:50c0:8003::153 |
| CNAME | www | `NOM-DU-COMPTE.github.io.` |

Supprimer les anciennes entrées A / AAAA / CNAME du domaine nu et de `www` qui pointent vers OVH.
La propagation prend de quelques minutes à quelques heures. Si un hébergement web OVH n'était plus utile,
attention aux **adresses e-mail** liées au domaine avant de le résilier.

## Reste à compléter avant le lancement

- **Tarifs 2026-2027** et réductions familles (page Infos) : `[xxx €]`, « [à préciser] ».
- **Matchs** : widgets gratuits Score'n'co « Matchs de la semaine » (BCL n° 196218, USBL n° 49060) sur l'accueil et la page Matchs. Les blocs de démonstration de la page Matchs (onglets, calendrier, « Suivre une équipe ») sont masqués (`showDemo`).
- **Actus de l'accueil** : deux visuels `[Photo]`, et `[x] jours` dans le texte des partenaires.
- **Carte des salles** (accueil, infos).
- Photos Halle Louise-Michel et salle polyvalente ; documents à télécharger (statuts, règlement, PV d'AG, projet de club).
- Dates des événements ; nombre de licenciés ; assurance pendant l'essai ; téléphone éventuel ; boutique.
- Espace administrateur (actus).

## Espace admin

Adresse : `https://basketlislejourdain.github.io/site-bcl-usbl/admin/` (non référencée).

- **Page** : `src/static/admin/index.html` (copiée dans `docs/admin/`). Elle lit l'adresse du service dans `docs/admin/api.json`, écrite automatiquement à chaque publication du service.
- **Service** : `worker/` (Cloudflare Worker), publié par `.github/workflows/admin-worker.yml` à chaque modification du dossier `worker/`. Comptes et demandes dans Workers KV ; contenus et photos enregistrés dans ce dépôt (un commit par modification, signé du nom de la personne).
- **Rôles** : super admin (tous les droits, gestion des comptes ; il en faut toujours au moins deux) ; éditeur BCL / éditeur USBL (actus, agenda, photos, bandeau de son club et contenus communs).
- **Secrets GitHub nécessaires** (Settings → Secrets and variables → Actions) :
  - `CLOUDFLARE_API_TOKEN` : clé Cloudflare (modèle « Edit Cloudflare Workers ») ;
  - `SITE_REPO_TOKEN` : clé GitHub « fine-grained », dépôt `site-bcl-usbl` seulement, permission *Contents : Read and write*. **Expire au bout d'un an : la renouveler** puis relancer la publication du service (onglet Actions → « Admin — publier le service Cloudflare » → Run workflow) ;
  - `ADMIN_SETUP_CODE` : phrase secrète pour créer les comptes super admin via `…/admin/#installation`.
- Chaque publication du service déconnecte les personnes connectées (nouvelle clé de session) : il suffit de se reconnecter.
