// Tryb sprawdzania (lumen.html?sprawdz): w rogu ekranu na bieżąco odstęp słuchawek albo piórka od najbliższego tekstu,
// rozmiar okna i liczba klatek na sekundę. Gdy model nachodzi na tekst, ten tekst dostaje czerwoną ramkę.
// Dozwolone: pola formularza Kontaktu (piórko może przechodzić pod nimi) i napis w stopce, na którym piórko ląduje.
const SEL = 'h1,h2,h3,p,.btn,.swatches,.opts,.sum,.clock b,.clock span,.track,.battery,.fact,.spec > div,.foot-cols a,.legal,.eb,.foot-mail,.spec-more,.lp';
const ALLOWED = '.kform .fld, .kform .seg, .kform .btn, .kform .consent, .kon-note, .wm';
const badge = document.createElement('div');
badge.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;padding:8px 10px;border-radius:10px;font:500 12px/1.35 system-ui,sans-serif;color:#fff;background:#1d1d1f;pointer-events:none;max-width:70vw;white-space:pre-line';
document.body.appendChild(badge);
const visible = (el) => { let o = 1; for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return 0; o *= +cs.opacity; } return o; };
// prostokąt samego tekstu (nagłówki i akapity bywają szersze niż ich tekst)
const textRect = (el) => {
  if (!/^(H1|H2|H3|P)$/.test(el.tagName)) return el.getBoundingClientRect();
  const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()];
  if (!rs.length) return el.getBoundingClientRect();
  return { left: Math.min(...rs.map((r) => r.left)), right: Math.max(...rs.map((r) => r.right)), top: Math.min(...rs.map((r) => r.top)), bottom: Math.max(...rs.map((r) => r.bottom)), width: 9 };
};
let marked = null, frames = 0, fps = 0, t0 = performance.now(), worst = Infinity;
(function count() { frames++; requestAnimationFrame(count); })();
setInterval(() => {
  const now = performance.now(); fps = Math.round(frames * 1000 / (now - t0)); frames = 0; t0 = now;
}, 1000);
setInterval(() => {
  const G = window.__lumen && window.__lumen.G, size = `${innerWidth}×${innerHeight}`;
  if (marked) { marked.style.outline = ''; marked = null; }
  if (!G) { badge.textContent = `${size} · ${fps} kl./s\n3D jeszcze się wczytuje`; return; }
  const b = G.box();
  if (b.op < 0.05 || b.x0 > 1e8) { badge.style.background = '#1d1d1f'; badge.textContent = `${size} · ${fps} kl./s\nmodel niewidoczny`; return; }
  let min = Infinity, hit = null;
  document.querySelectorAll(SEL).forEach((el) => {
    if (el.closest('.nav, .mmenu, dialog, .buybar') || el.closest(ALLOWED) || visible(el) < 0.08) return;
    const r = textRect(el);
    if (r.width < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
    const dx = Math.max(r.left - b.x1, b.x0 - r.right, 0), dy = Math.max(r.top - b.y1, b.y0 - r.bottom, 0);
    const gap = dx > 0 || dy > 0 ? Math.hypot(dx, dy) : -Math.min(b.x1 - r.left, r.right - b.x0, b.y1 - r.top, r.bottom - b.y0);
    if (gap < min) { min = gap; hit = el; }
  });
  worst = Math.min(worst, min);
  const what = b.feather ? 'piórko' : 'słuchawki';
  if (min < 0 && hit) { hit.style.outline = '2px solid #e5484d'; marked = hit; }
  badge.style.background = min < 0 ? '#c62f35' : min < 10 ? '#b26a00' : '#1d7a46';
  badge.textContent = `${size} · ${fps} kl./s\n${what}: ${min === Infinity ? 'brak tekstu obok' : (min < 0 ? 'NACHODZI ' : 'odstęp ') + Math.round(Math.abs(min)) + ' px'}\nnajmniejszy dotąd: ${worst === Infinity ? '–' : Math.round(worst) + ' px'}`;
}, 200);
