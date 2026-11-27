"""Ouvre chaque page en local (ordinateur 1440 px et mobile 390 px), capture l'écran et relève les erreurs."""
import sys, threading, http.server, functools, socketserver
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
DOCS, SHOTS = ROOT / "docs", Path("/tmp/shots")
SHOTS.mkdir(exist_ok=True)
pages = sys.argv[1:] or ["index","clubs","engagements","equipes","matchs","evenements","partenaires","benevoles","infos"]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
H = functools.partial(Quiet, directory=str(DOCS))
srv = socketserver.TCPServer(("127.0.0.1", 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp in [("desk", {"width": 1440, "height": 900}), ("mob", {"width": 390, "height": 844})]:
        ctx = b.new_context(viewport=vp, device_scale_factor=1)
        for pg in pages:
            page = ctx.new_page(); errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.on("console", lambda m: m.type in ("error","warning") and errs.append(m.text))
            page.on("requestfailed", lambda r: errs.append("FAIL " + r.url))
            page.goto(f"http://127.0.0.1:{port}/{pg}.html"); page.wait_for_timeout(700)
            h = page.evaluate("document.documentElement.scrollHeight"); w = page.evaluate("document.documentElement.scrollWidth")
            page.screenshot(path=str(SHOTS / f"{pg}-{name}.png"), full_page=True)
            print(f"{pg:12} {name}: h={h} w={w} errors={errs[:5]}")
            page.close()
    b.close()
srv.shutdown()
