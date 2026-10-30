from pathlib import Path
import base64
import hashlib
import re
import sys

source = Path("/tmp/SENDWAYO-V7.html")
site = Path("site")
(site / "assets").mkdir(parents=True, exist_ok=True)
html = source.read_text()
original_bytes = source.stat().st_size
assert original_bytes == 22881979, f"Unexpected V7 size: {original_bytes}"
assert '<title>SENDWAYO EXPRESS - V7 CORRECCIONES PUNTUALES</title>' in html

pattern = re.compile(r"data:(image/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)")
assets = {}
def externalize(match):
    mime = match.group(1).lower()
    raw = base64.b64decode(re.sub(r"\s+", "", match.group(2)))
    digest = hashlib.sha256(raw).hexdigest()[:20]
    ext = {"image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif"}.get(mime, "bin")
    filename = f"{digest}.{ext}"
    if filename not in assets:
        (site / "assets" / filename).write_bytes(raw)
        assets[filename] = len(raw)
    return "assets/" + filename

html, replaced = pattern.subn(externalize, html)
assert replaced == 33, f"Expected 33 embedded images; found {replaced}"
assert len(assets) == 9, f"Expected 9 unique images; found {len(assets)}"

for url in [
    "https://cdn.tailwindcss.com",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js",
]:
    old = f'<script src="{url}"></script>'
    assert old in html, f"Missing expected script: {url}"
    html = html.replace(old, f'<script defer src="{url}"></script>', 1)

html = re.sub(r"<img\b(?![^>]*\bloading=)", '<img loading="lazy" decoding="async"', html, flags=re.I)

bridge = r'''<script id="sendwayo-early-access-bridge">
(function(){
  'use strict';
  function earlyShow(){
    var welcome=document.getElementById('welcome-landing');
    var login=document.getElementById('login-screen');
    if(welcome)welcome.classList.add('hidden');
    if(login){login.classList.remove('hidden');login.style.display='flex';}
    if(document.body)document.body.classList.remove('sendwayo-authenticated');
    var field=document.getElementById('login-usuario');
    if(field)field.focus({preventScroll:true});
  }
  window.v162_showLogin=earlyShow;
  function earlyLogin(){
    var started=Date.now();
    var error=document.getElementById('login-error');
    function waitForFirebase(){
      if(window.sendwayoFirebaseReady===true && window.intentarLogin!==earlyLogin){
        window.intentarLogin.call(window);
        return;
      }
      if(Date.now()-started>90000){
        if(error){error.textContent='La conexión segura todavía está iniciando. Espere unos segundos y vuelva a pulsar Entrar.';error.classList.remove('hidden');}
        return;
      }
      setTimeout(waitForFirebase,150);
    }
    waitForFirebase();
  }
  document.addEventListener('click',function(event){
    var loginButton=event.target.closest && event.target.closest('#login-screen button[onclick*="intentarLogin"]');
    if(loginButton){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      earlyLogin();return;
    }
    var welcomeButton=event.target.closest && event.target.closest('#welcome-landing button[onclick*="v162_showLogin"]');
    if(welcomeButton && window.v162_showLogin===earlyShow){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      earlyShow();
    }
  },true);
})();
</script>
'''
assert "</head>" in html
html = html.replace("</head>", bridge + "\n</head>", 1)
assert "data:image/" not in html
assert "sendwayo-early-access-bridge" in html

target = "SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html"
(site / target).write_text(html)
(site / "index.html").write_text(html)
assert (site / target).read_bytes() == (site / "index.html").read_bytes()
print(f"V7 original: {original_bytes:,} bytes")
print(f"Optimized HTML: {len(html.encode()):,} bytes")
print(f"Unique external images: {len(assets)} ({sum(assets.values()):,} bytes)")
print(f"Embedded image references replaced: {replaced}")
print("PASS: same V7 content, deduplicated images, early login bridge, deferred SDKs.")
