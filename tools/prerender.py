"""Enregistre le contenu affiché de chaque page (version ordinateur) dans tools/prerender/,
pour l'inclure dans un <noscript> : lisible sans JavaScript et par les moteurs de recherche.
Usage : python3 tools/build.py && python3 tools/prerender.py && python3 tools/build.py"""
import threading, http.server, functools, socketserver, re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "prerender"; OUT.mkdir(exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(ROOT / "docs")))
threading.Thread(target=srv.serve_forever, daemon=True).start()
pages = [p.stem for p in (ROOT / "docs").glob("*.html") if p.stem != "404"]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1440, "height": 900})
    for name in pages:
        pg.goto(f"http://127.0.0.1:{srv.server_address[1]}/{name}.html"); pg.wait_for_timeout(500)
        html = pg.evaluate("document.getElementById('app').innerHTML")
        html = re.sub(r"<noscript>.*?</noscript>", "", html, flags=re.S)
        (OUT / f"{name}.html").write_text("<noscript>" + html + "</noscript>", encoding="utf-8")
        print(name, len(html))
    b.close()
srv.shutdown()
