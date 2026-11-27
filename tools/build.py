#!/usr/bin/env python3
"""Construit le site (dossier docs/) à partir des maquettes (src/pages/*.dc.html).

Usage : python3 tools/build.py
Le dossier docs/ est ce que GitHub Pages publie. Ne pas le modifier à la main :
modifier src/ puis relancer ce script.
"""
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = ROOT / "docs"
SITE_CFG = json.loads((SRC / "site.json").read_text(encoding="utf-8"))

# page de sortie : (maquette ordinateur, maquette mobile, titre, description)
PAGES = {
    "index": ("MainV2", "Mobile", "Basketball à L'Isle-Jourdain — BCL et USBL",
              "Basket Club Lislois (section féminine) et USBL (section masculine) : deux clubs, un même parquet à L'Isle-Jourdain."),
    "clubs": ("Clubs", "MClubs", "Les clubs", "Histoire, valeurs, bureaux et salles du BCL et de l'USBL."),
    "engagements": ("Engagements", "MEngagements", "Nos engagements", "Citoyenneté, sport santé et lutte contre les violences : ce que font le BCL et l'USBL au-delà du terrain."),
    "equipes": ("Equipes", "MEquipes", "Équipes et créneaux", "Toutes les équipes du BCL et de l'USBL, des U5 aux seniors, avec coachs et créneaux d'entraînement 2026-2027."),
    "matchs": ("Matchs", "MMatchs", "Matchs et résultats", "Calendrier, résultats et classements des équipes du BCL et de l'USBL."),
    "evenements": ("Evenements", "MEvenements", "Événements", "Agenda et retours en images des événements du BCL et de l'USBL."),
    "partenaires": ("Partenaires", "MPartenaires", "Partenaires", "Devenir partenaire du basket à L'Isle-Jourdain : offres et bon de commande."),
    "benevoles": ("Benevoles", "MBenevoles", "Bénévoles", "Rejoindre les bénévoles du BCL et de l'USBL."),
    "infos": ("Infos", "MInfos", "Infos et contact", "Inscription, catégories, pièces à fournir, salles, contact et mentions légales."),
}
SHARED = ["Header", "Footer", "MHeader", "MFooter", "MMenu"]

# lien de maquette -> page du site
LINKS = {
    "MainV2": "index.html", "Main": "index.html", "Mobile": "index.html",
    "Clubs": "clubs.html", "MClubs": "clubs.html",
    "Engagements": "engagements.html", "MEngagements": "engagements.html",
    "Equipes": "equipes.html", "MEquipes": "equipes.html",
    "Matchs": "matchs.html", "MMatchs": "matchs.html",
    "Evenements": "evenements.html", "MEvenements": "evenements.html",
    "Partenaires": "partenaires.html", "MPartenaires": "partenaires.html",
    "Benevoles": "benevoles.html", "MBenevoles": "benevoles.html",
    "Infos": "infos.html", "MInfos": "infos.html",
    "Boutique": "index.html", "MBoutique": "index.html",
    "MMenu": "#menu",
}

ASSETS = {p.stem: p for p in (SRC / "assets" / "img").iterdir()}
ASSETS.update({p.stem: p for p in (SRC / "assets" / "docs").iterdir()})


def asset_url(m):
    p = ASSETS.get(m.group(1))
    if not p:
        raise SystemExit(f"Image introuvable : {m.group(1)}")
    return f"assets/{p.parent.name}/{p.name}"


def link_url(m):
    name, hash_ = m.group(1), m.group(2) or ""
    target = LINKS.get(name)
    if target is None:
        raise SystemExit(f"Lien inconnu : {name}.dc.html")
    return target if target.startswith("#") else target + hash_


def load(name):
    text = (SRC / "pages" / f"{name}.dc.html").read_text(encoding="utf-8")
    # liens et images
    text = re.sub(r"/_blob/([0-9a-f]{32})", asset_url, text)
    if name == "MMenu":
        text = text.replace('href="Mobile.dc.html" aria-label="Fermer le menu"', 'href="#close-menu" aria-label="Fermer le menu"')
    text = re.sub(r"\b([A-Za-z0-9]+)\.dc\.html(#[\w-]+)?", link_url, text)

    body = re.search(r"<x-dc>(.*)</x-dc>", text, re.S).group(1)
    helmet = ""
    hm = re.search(r"<helmet>(.*?)</helmet>", body, re.S)
    if hm:
        helmet = hm.group(1)
        body = body.replace(hm.group(0), "")
    # balises de maquette -> <template> (autorisé partout, y compris dans <select> et <tbody>)
    body = re.sub(r"<sc-for\b", "<template data-sc-for", body)
    body = re.sub(r"<sc-if\b", "<template data-sc-if", body)
    body = re.sub(r"<dc-import\b", "<template data-dc-import", body)
    body = re.sub(r"</(sc-for|sc-if|dc-import)>", "</template>", body)
    # maquettes mobiles dessinées à 390 px : on les laisse occuper tout l'écran
    body = body.replace('style="width: 390px;', 'style="width: 100%;')
    body = body.replace("min-height: 844px", "min-height: 100vh")

    sm = re.search(r'<script type="text/x-dc"[^>]*?data-props=\'([^\']*)\'[^>]*>(.*?)</script>', text, re.S)
    defaults, logic = {}, "class Component extends DCLogic {}"
    if sm:
        for k, v in json.loads(sm.group(1)).items():
            if not k.startswith("$") and isinstance(v, dict) and "default" in v:
                defaults[k] = v["default"]
        logic = sm.group(2).strip()
    styles = "\n".join(s.strip() for s in re.findall(r"<style>(.*?)</style>", helmet, re.S))
    return {"body": body.strip(), "defaults": defaults, "logic": logic, "styles": styles}


def component_block(name, c):
    if "</script" in c["logic"].lower():
        raise SystemExit(f"Script invalide dans {name}")
    return (
        f'<template id="dc-c-{name}">\n{c["body"]}\n</template>\n'
        f"<script>DC.define({json.dumps(name)}, (function () {{\n{c['logic']}\nreturn Component;\n}})(), {json.dumps(c['defaults'], ensure_ascii=False)});</script>\n"
    )


HEAD = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">{robots}
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{base}assets/img/og-image.jpg">
<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/fonts/fonts.css">
<link rel="stylesheet" href="assets/css/site.css">
<style>
{styles}
</style>
<script src="assets/js/dc.js"></script>
<script src="assets/js/forms.js" defer></script>
<script src="assets/js/ui.js" defer></script>
<script src="assets/js/carte.js" defer></script>
</head>
<body>
<div id="app">{fallback}</div>
"""


def esc(s):
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


def build():
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SRC / "assets", OUT / "assets")
    shutil.copytree(SRC / "static", OUT, dirs_exist_ok=True)
    comps = {n: load(n) for n in SHARED}
    base = SITE_CFG.get("url", "").rstrip("/") + "/" if SITE_CFG.get("url") else ""
    prerender = ROOT / "tools" / "prerender"
    for slug, (desk, mob, title, desc) in PAGES.items():
        d, m = load(desk), load(mob)
        styles = "\n".join(dict.fromkeys(s for s in [d["styles"], m["styles"]] if s))
        full_title = title if slug == "index" else f"{title} — Basketball à L'Isle-Jourdain"
        fb = prerender / f"{slug}.html"
        fallback = fb.read_text(encoding="utf-8") if fb.exists() else ""
        robots = '\n<meta name="robots" content="noindex, nofollow">' if SITE_CFG.get("preview") else ""
        html = HEAD.format(title=esc(full_title), desc=esc(desc), base=base, styles=styles, fallback=fallback, robots=robots)
        for n in SHARED:
            html += component_block(n, comps[n])
        html += component_block(desk, d) + component_block(mob, m)
        html += f'<script>DC.boot({{desktop: {json.dumps(desk)}, mobile: {json.dumps(mob)}, menu: "MMenu", breakpoint: 899}});</script>\n'
        html += "</body>\n</html>\n"
        (OUT / f"{slug}.html").write_text(html, encoding="utf-8")
    # nom de domaine
    if SITE_CFG.get("domain"):
        (OUT / "CNAME").write_text(SITE_CFG["domain"] + "\n", encoding="utf-8")
        urls = "".join(f"<url><loc>{base}{'' if s == 'index' else s + '.html'}</loc></url>" for s in PAGES)
        (OUT / "sitemap.xml").write_text(
            f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n', encoding="utf-8")
        (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base}sitemap.xml\n", encoding="utf-8")
    # page 404 : chemins absolus selon l'adresse du site
    bp = SITE_CFG.get("basePath") or "/"
    p404 = OUT / "404.html"
    p404.write_text(p404.read_text(encoding="utf-8").replace('href="/', f'href="{bp}'), encoding="utf-8")
    if SITE_CFG.get("preview"):
        # préversion : interdit l'indexation par les moteurs de recherche
        (OUT / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
        p404.write_text(p404.read_text(encoding="utf-8").replace("<meta charset=\"utf-8\">", "<meta charset=\"utf-8\">\n<meta name=\"robots\" content=\"noindex, nofollow\">"), encoding="utf-8")
    print(f"Site construit dans {OUT} ({len(PAGES)} pages)")


if __name__ == "__main__":
    build()
