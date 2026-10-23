// Model słuchawek Lumen Halo zbudowany w kodzie: geometria, materiały i tekstury rysowane w canvasie,
// plus studio do odbić. Jedno źródło dla prototypu halo-3d.html i strony lumen.html.
import * as THREE from 'three';

// Kolory ze zdjęć produktu: pałąk z dzianiny w odcieniu „mgły” (ciemniejszy od ceramiki), poduszki z gładkiej ekoskóry,
// wnętrze poduszki z szarej dzianiny
export const PALETTES = [
  { name: 'Kreda', cta: 'Wybierz Kredę', ceramic: '#efeeeb', band: '#a9a9ad', cushion: '#e5e4e1', metal: '#d0cdc8', inner: '#a4a4a6' },
  { name: 'Piasek', cta: 'Wybierz Piasek', ceramic: '#e4dbce', band: '#c9b9a1', cushion: '#cdbca4', metal: '#d8cdbb', inner: '#9a8d7b' },
  { name: 'Grafit', cta: 'Wybierz Grafit', ceramic: '#4a4a4d', band: '#424246', cushion: '#3a3a3d', metal: '#77777c', inner: '#2a2a2c' },
];

// Studio do odbić: szare tło i kilka softboksów, jak przy zdjęciach produktowych.
// Kontrast jasnych pasów i ciemnego tła sprawia, że aluminium wygląda jak metal, a nie biały plastik.
// Kopuła ma jaśniejszą górę i ciemną podłogę: na metalu daje to jasny pas u góry i ciemny u dołu (horyzont), jak na zdjęciach.
// Softboksy są kilka razy jaśniejsze od tła (wartości HDR), dzięki czemu odbicia na ceramice i aluminium mają wyraźne krawędzie.
export function studioEnv(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const dome = new THREE.SphereGeometry(20, 64, 32), dc = [], pp = dome.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const y = pp.getY(i) / 20, k = y > 0 ? 0.24 + 0.28 * y : 0.24 + 0.16 * y; // od 0,08 (podłoga) do 0,52 (sufit)
    dc.push(k, k, k * 1.02);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3));
  s.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const box = (w, h, x, y, z, k, warm = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k * 0.99, k * 0.97 * warm), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  box(18, 8, 0, 14, 2, 7);         // duży softboks nad produktem
  box(8, 12, -10, 5, 9, 8);        // światło główne z przodu po lewej
  box(9, 14, -15, 1, -2, 5);       // duża płaszczyzna z lewej: jasny pas na bocznym pierścieniu
  box(2.2, 16, 14, 2, -2, 7);      // wąski pas z prawej: ostra linia na krawędzi aluminium
  box(2.2, 16, -8, 2, -13, 4);     // pas z tyłu po lewej (kontra)
  box(10, 2.5, 4, -2, 14, 1);      // niskie wypełnienie z przodu (słabe, żeby dół poduszek pozostał w półcieniu)
  box(10, 9, 9, 4, 11, 2.2);       // duży, miękki softboks z przodu po prawej: rozjaśnia ceramiczny front jak na zdjęciach
  box(14, 3, 0, -9, 10, 0.02);     // czarna flaga nisko z przodu: ciemny refleks na dole metalu
  const tex = pmrem.fromScene(s, 0.012).texture;
  pmrem.dispose();
  return tex;
}

// Zwraca grupę z modelem w jednostkach z pomiarów (1 j. ≈ 5 cm) i materiały, którymi zmienia się kolor.
export function buildHalo(renderer) {
  // Tekstury rysowane w canvasie, bez plików graficznych
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const canvasTex = (s, px, srgb) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = s;
    const g = cv.getContext('2d'), img = g.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const v = px(x, y) * 255, i = (y * s + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  // Dzianina melanżowa jak na zdjęciach: splot skośny 2/2, każda nitka w nieco innym odcieniu,
  // a w nitce pojedyncze włókna, żeby z bliska powierzchnia nie była idealnie regularna
  const TS = 512, TP = 8;
  const weave = (x, y) => {
    const i = (x / TP) | 0, j = (y / TP) | 0, fx = (x % TP + 0.5) / TP, fy = (y % TP + 0.5) / TP;
    const up = ((i - j + 4000) % 4 < 2) !== (hash(i * 1.7, j * 2.3) < 0.12); // co ~8. przeplot odwrócony: splot mniej „graficzny”
    const across = up ? fx : fy, along = up ? y : x, th = up ? i : j + 997;
    const fiber = hash(th * 13.1 + across * 7.3, along * 0.37);
    const h = Math.pow(Math.sin(Math.PI * across), 0.7) * (0.8 + 0.2 * fiber);
    return { h, tone: 0.65 * hash(th, (along / (TP * 3)) | 0) + 0.35 * fiber };
  };
  // Melanż: plamki jaśniejszych i ciemniejszych włókien w skali kilku milimetrów (szum zawijany na brzegach kafla).
  // Splot jest za drobny, żeby go widzieć z daleka; dopiero ten szum daje „ziarno” dzianiny jak na zdjęciach.
  const vnoise = (x, y, per) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const g = (a, b) => hash(((a % per) + per) % per, ((b % per) + per) % per);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), lerp = THREE.MathUtils.lerp;
    return lerp(lerp(g(xi, yi), g(xi + 1, yi), sx), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), sx), sy);
  };
  const heather = new Float32Array(TS * TS);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let v = 0, a = 0.5, f = 40;
    for (let o = 0; o < 4; o++, a *= 0.5, f *= 2) v += a * vnoise(x / TS * f, y / TS * f, f);
    heather[y * TS + x] = v / 0.9375; // 0..1
  }
  const knitColor = (rx, ry) => {
    const t = canvasTex(TS, (x, y) => { const w = weave(x, y), m = heather[y * TS + x]; return Math.min(1, 0.8 + 0.07 * w.tone + 0.05 * w.h + 0.12 * Math.pow(m, 1.6)); }, true);
    t.repeat.set(rx, ry); return t;
  };
  // Mapa normalnych z wysokości splotu (zamiast bump mapy, bo normal mapa zapisuje się w pliku .glb)
  const normalCanvas = (hf, K) => {
    const hgt = new Float32Array(TS * TS);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) hgt[y * TS + x] = hf(x, y);
    const h = (x, y) => hgt[((y + TS) % TS) * TS + (x + TS) % TS];
    const cv = document.createElement('canvas'); cv.width = cv.height = TS;
    const g = cv.getContext('2d'), img = g.createImageData(TS, TS), n = new THREE.Vector3();
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      n.set((h(x - 1, y) - h(x + 1, y)) * K, (h(x, y + 1) - h(x, y - 1)) * K, 1).normalize();
      const i = (y * TS + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  };
  const knitNormal = normalCanvas((x, y) => weave(x, y).h + 0.5 * heather[y * TS + x], 1); // grubsze nitki w plamach melanżu
  const normalTex = (cv, rx, ry) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; t.repeat.set(rx, ry);
    return t;
  };
  const knitNormalTex = (rx, ry) => normalTex(knitNormal, rx, ry);
  // Ekoskóra poduszek (na zdjęciach gładka, matowa, z drobnym ziarnem): szum w skali ułamka milimetra
  const grain = (x, y) => { let v = 0, a = 0.5, f = 96; for (let o = 0; o < 3; o++, a *= 0.5, f *= 2) v += a * vnoise(x / TS * f, y / TS * f, f); return v; };
  const leatherNormal = normalCanvas((x, y) => grain(x, y) * 1.4, 1);
  const leatherColor = canvasTex(TS, (x, y) => 0.95 + 0.05 * heather[y * TS + x], true);
  leatherColor.repeat.set(6, 2);
  // Szczotkowane aluminium: drobne rysy wzdłuż obwodu (mapa chropowatości)
  const rows = Array.from({ length: 256 }, () => Math.random());
  const brushed = canvasTex(256, (x, y) => 0.8 + 0.12 * rows[y] + 0.08 * Math.random());
  brushed.repeat.set(1, 12);

  const P0 = PALETTES[0];
  // vertexColors: true = mnożenie przez wypalone cieniowanie zagłębień (bakeAO)
  // Na zdjęciach nic nie błyszczy: ceramika i ekoskóra są matowe, aluminium satynowe (szczotkowane), lustrzana jest tylko wąska fazka przy froncie
  const fabric = (rx, ry) => new THREE.MeshPhysicalMaterial({ color: P0.band, map: knitColor(rx, ry), vertexColors: true, roughness: 0.95, sheen: 0.3, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff'), normalMap: knitNormalTex(rx, ry), normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: 0.6 });
  const M = {
    ceramic: new THREE.MeshPhysicalMaterial({ color: P0.ceramic, vertexColors: true, roughness: 0.6, clearcoat: 0.08, clearcoatRoughness: 0.5, envMapIntensity: 0.9 }),
    // (anizotropia na toczonej geometrii rozmywała odbicia w szarą plamę; satynę daje sama chropowatość z rysami)
    metal: new THREE.MeshPhysicalMaterial({ color: P0.metal, vertexColors: true, metalness: 1, roughness: 0.3, roughnessMap: brushed, envMapIntensity: 1.15 }),
    lip: new THREE.MeshPhysicalMaterial({ color: P0.metal, metalness: 1, roughness: 0.1, envMapIntensity: 1.3 }), // polerowana fazka wokół frontu: cienka jasna linia
    polish: new THREE.MeshPhysicalMaterial({ color: P0.metal, vertexColors: true, metalness: 1, roughness: 0.32, roughnessMap: brushed, envMapIntensity: 1.15 }), // tuleje i przeguby
    pivot: new THREE.MeshStandardMaterial({ color: '#2a2a2c', metalness: 0.6, roughness: 0.45 }), // ciemny trzpień przegubu w szczelinie nad muszlą
    cushion: new THREE.MeshPhysicalMaterial({ color: P0.cushion, map: leatherColor, vertexColors: true, roughness: 0.55, normalMap: normalTex(leatherNormal, 6, 2), normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 0.62 }), // bez połysku na krawędziach: brzeg białej poduszki nie zlewa się z jasnym tłem
    band: fabric(8, 1.5), // splot w większej skali niż na poduszkach: na zdjęciach wzór dzianiny pałąka jest wyraźnie widoczny
    // tkanina akustyczna w otworze poduszki: wyraźny splot, w półcieniu także gdy model jest obrócony otworem do światła
    inner: new THREE.MeshStandardMaterial({ color: P0.inner, map: knitColor(1, 1), normalMap: knitNormalTex(1, 1), normalScale: new THREE.Vector2(1.4, 1.4), vertexColors: true, roughness: 1, envMapIntensity: 0.5, side: THREE.DoubleSide }),
  };

  const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };
  const v2 = (pts) => pts.map(([r, h]) => new THREE.Vector2(r, h));
  // profile są zapisane od frontu w dół; odwrócenie kolejności kieruje ściany na zewnątrz
  const lathe = (pts, mat) => { const m = mesh(new THREE.LatheGeometry(v2(pts).reverse(), 128), mat); m.rotation.x = Math.PI / 2; return m; };
  const se = (c, n) => Math.sign(c) * Math.pow(Math.abs(c), 2 / n); // superelipsa: n=2 koło, większe n = bardziej kwadratowo
  const lerp = THREE.MathUtils.lerp;

  // Siatka z funkcji (u, v) → punkt. Na zamkniętych szwach normalne są uśredniane, żeby nie było widać krawędzi.
  function gridGeo(nu, nv, f, closeU, closeV) {
    const pos = [], uv = [], idx = [], p = new THREE.Vector3();
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { f(i / nu, j / nv, p); pos.push(p.x, p.y, p.z); uv.push(i / nu, j / nv); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, b, d, a, d, c); // kolejność wierzchołków = ściany skierowane na zewnątrz
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const n = g.attributes.normal, t = new THREE.Vector3();
    const weld = (k1, k2) => { t.set(n.getX(k1) + n.getX(k2), n.getY(k1) + n.getY(k2), n.getZ(k1) + n.getZ(k2)).normalize(); n.setXYZ(k1, t.x, t.y, t.z); n.setXYZ(k2, t.x, t.y, t.z); };
    if (closeU) for (let j = 0; j <= nv; j++) weld(j * (nu + 1), j * (nu + 1) + nu);
    if (closeV) for (let i = 0; i <= nu; i++) weld(i, nv * (nu + 1) + i);
    return g;
  }

  // Proporcje: widok z boku i 3/4 według zdjęć produktu (do-ai-3d/3-kreda.png, 5-grafit.png), widok z przodu według
  // generatora 3D (Meshy, z przodu: wysokość poduszki D = 250 px). 1 j. ≈ 5 cm, poduszka Ø ok. 1,98 (= D):
  const R = 0.93;          // promień metalowego pierścienia z tyłu, przy poduszce
  const RF = 0.875;        // promień ceramicznego frontu; pierścień rozszerza się od frontu do tyłu jak szeroka fazka
  const RC = 0.99;         // poduszka wystaje ponad pierścień (na zdjęciach jej góra jest wyraźnie wyżej niż pierścień)
  const HEAD = 0.62;       // połowa odstępu między poduszkami w połowie wysokości: ok. 0,6 D (generator: 0,53 D przy grubszych poduszkach)
  const CUSH = 0.5;        // grubość poduszki ok. 0,25 D (zdjęcia: 0,24 D, generator: 0,42 D)
  const SHELL = 0.22;      // front + pierścień ok. 0,11 D
  const TILT = THREE.MathUtils.degToRad(10); // generator z przodu: odstęp maleje z 0,53 D do 0,40 D o 1/3 D niżej, czyli ok. 10° na stronę
  const ARM_Z = 0.11;      // przegub stoi na środku pierścienia
  // Połączenie z pałąkiem (zbliżenie na zdjęciu Grafit): tuleja, pod nią przegub, ciemna szczelina nad pierścieniem.
  // Obie części stoją w osi pochylonej muszli (jak w generatorze), więc pałąk schodzi do nich skośnie, do środka.
  const STEM_Y0 = R + 0.045, STEM_L = 0.14, SLEEVE_L = 0.22;
  const STEM_TOP = STEM_Y0 + STEM_L, SLEEVE_TOP = STEM_TOP + 0.01 + SLEEVE_L; // w układzie pochylonej muszli
  const ARM_X = HEAD + CUSH + ARM_Z * Math.cos(TILT) + SLEEVE_TOP * Math.sin(TILT); // koniec pałąka w układzie słuchawek
  const BAND_Y = SLEEVE_TOP * Math.cos(TILT) - ARM_Z * Math.sin(TILT);
  // Pałąk: łuk elipsy przedłużony o kąt A0 poniżej poziomu, tak że końce schodzą do środka dokładnie w osi tulei.
  // Szczyt (oś pałąka) ok. 0,95 D nad końcami (generator: zewnętrzna krawędź 1,06 D nad tulejami).
  const BAND_H = 1.88;
  let A0 = TILT, BA = ARM_X, BB = BAND_H;
  for (let k = 0; k < 8; k++) { BA = ARM_X / Math.cos(A0); BB = BAND_H / (1 + Math.sin(A0)); A0 = Math.atan(Math.tan(TILT) * BB / BA); }
  const BAND_CY = BAND_Y + BB * Math.sin(A0);
  // Zwęża się ku końcom (szerokość ok. 0,21 D przy tulejach, ok. 0,29 D na górze), jest płaski i cienki (ok. 0,9 cm),
  // tylko końce nad tulejami są grubsze i zaokrąglone.
  const BAND_WE = 0.21, BAND_WC = 0.29;   // połowa szerokości: przy tulejach / na górze
  const BAND_TE = 0.14, BAND_TC = 0.085; // połowa grubości: przy tulejach / na górze
  const SLV = { hx: 0.128, hz: 0.19 }, STEM = { hx: 0.118, hz: 0.176 }; // półosie przekroju tulei i przegubu (x = grubość)

  // Cieniowanie zagłębień (ambient occlusion) wypalone w kolorach wierzchołków:
  // tam, gdzie części się stykają, dochodzi mniej światła, więc są ciemniejsze
  function bakeAO(geo, f) {
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { const a = f(v.fromBufferAttribute(p, i), i); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = a; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }
  const gauss = (d, w) => Math.exp(-(d / w) * (d / w));

  // Poduszka: miękki pierścień o zaokrąglonym przekroju, z owalnym otworem na ucho
  // (otwór ok. 0,57 wysokości poduszki, proporcje 0,57 : 1 — pomiar lewej poduszki na zdjęciu Grafit)
  const AX = 0.33, AY = 0.56;
  const CUSH_N = 2.6; // przekrój poduszki: mniejsze n = bardziej wypukłe boki
  const holeR = (c, s) => 1 / Math.hypot(c / AX, s / AY);
  // Szwy: ekoskóra jest zszyta na obu krawędziach strony przy uchu (od zewnątrz i przy otworze). Płytki rowek
  // z cieniem rysuje kontur poduszki, więc biała poduszka nie zlewa się w jedną płaską plamę.
  const CUSH_NU = 240, CUSH_NV = 96;
  const SEAMS = [Math.PI * 1.75, Math.PI * 1.25]; // kąty w przekroju: zewnętrzna i wewnętrzna krawędź strony przy uchu
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const seam = (ph, w) => Math.max(...SEAMS.map((a) => gauss(angDiff(ph, a), w)));
  // Zmarszczki: przy otworze skóra zawija się do środka i układa w nieregularne fałdy (ok. 30 na obwodzie,
  // każda innej długości i głębokości), jak w prawdziwych nausznikach z pianki pokrytej ekoskórą
  const PLEATS = 26;
  const pleatAt = (th, ph) => {
    const w = gauss(angDiff(ph, Math.PI * 1.22), 0.36);   // tylko przy krawędzi otworu: od strony ucha i na ściance
    if (w < 0.01) return 0;
    const x = th / (Math.PI * 2) * PLEATS;                // szum zawijany na obwodzie: fałdy różnej szerokości i wysokości
    const n = 0.65 * vnoise(x, 0.5, PLEATS) + 0.35 * vnoise(x * 2, 7.5, PLEATS * 2);
    return w * THREE.MathUtils.smoothstep(n, 0.35, 0.85);
  };
  function cushionGeo() {
    return bakeAO(gridGeo(CUSH_NU, CUSH_NV, (u, v, p) => {
      const th = u * Math.PI * 2, ph = v * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const ri = holeR(c, s), k = (1 - 0.09 * seam(ph, 0.06)) * (1 + 0.035 * pleatAt(th, ph)); // rowek szwu, wypukłe fałdy
      const r = (ri + RC) / 2 + k * ((RC - ri) / 2) * se(Math.cos(ph), CUSH_N);
      p.set(r * c, r * s, -CUSH / 2 + k * (CUSH / 2) * se(Math.sin(ph), CUSH_N));
    }, true, true), (p, i) => {
      const r = Math.hypot(p.x, p.y), ri = holeR(p.x / r, p.y / r), depth = -p.z / CUSH; // 0 przy obudowie, 1 przy uchu
      const t = THREE.MathUtils.clamp((r - ri) / (RC - ri), 0, 1);                     // 0 ścianka otworu, 1 bok
      const th = (i % (CUSH_NU + 1)) / CUSH_NU * Math.PI * 2, ph = Math.floor(i / (CUSH_NU + 1)) / CUSH_NV * Math.PI * 2;
      const valley = gauss(angDiff(ph, Math.PI * 1.22), 0.36) * (1 - pleatAt(th, ph)); // cień między fałdami
      // mocniejsza fuga przy pierścieniu, półcień na zewnętrznym boku i w otworze, cień w szwach i między fałdami
      return (1 - 0.68 * Math.exp(-depth / 0.14)) * (1 - 0.5 * (1 - t) * (1 - depth)) * (1 - 0.16 * t * gauss(depth - 0.5, 0.45)) * (1 - 0.38 * seam(ph, 0.08)) * (1 - 0.22 * valley);
    });
  }

  // Wnętrze muszli w otworze poduszki: szara tkanina akustyczna naciągnięta na przetwornik. Spod tkaniny widać
  // lekko wypukłą kopułkę i pierścień przetwornika, a przy brzegach tkanina chowa się w cieniu poduszki.
  const driverGeo = (() => {
    const g = gridGeo(96, 32, (u, v, p) => {
      const a = u * Math.PI * 2, rho = v;
      const z = -0.03 - 0.022 * (1 - rho * rho) * (rho < 0.5 ? 1 : 0.6) - 0.009 * gauss(rho - 0.68, 0.06);
      p.set(Math.cos(a) * (AX + 0.04) * rho, Math.sin(a) * (AY + 0.04) * rho, z);
    }, true, false);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 0.5, pos.getY(i) / 0.5); // płaskie UV: splot bez zawirowań
    return bakeAO(g, (p) => {
      const rho = Math.hypot(p.x / (AX + 0.04), p.y / (AY + 0.04));
      return (1 - 0.6 * THREE.MathUtils.smoothstep(rho, 0.55, 1)) * (1 - 0.18 * gauss(rho - 0.72, 0.04));
    });
  })();

  // Muszla (oś lokalna +z = na zewnątrz): płaski matowy front z ceramiki, wąska polerowana fazka,
  // satynowy pierścień rozszerzający się ku tyłowi, poduszka. Profile toczone są w układzie (promień, h);
  // góra muszli, gdzie stoi przegub, to punkt (0, -R) przy h = ARM_Z.
  const nearArm = (p) => gauss(Math.hypot(p.x, p.z + R, p.y - ARM_Z), 0.25);
  function cup() {
    const g = new THREE.Group();
    const face = lathe([[0, SHELL], [RF - 0.04, SHELL], [RF - 0.012, SHELL - 0.002], [RF - 0.002, SHELL - 0.008]], M.ceramic);
    bakeAO(face.geometry, (p) => 1 - 0.2 * nearArm(p)); // cień przegubu na górze frontu
    const lip = lathe([[RF - 0.006, SHELL - 0.006], [RF + 0.006, SHELL - 0.01], [RF + 0.02, SHELL - 0.022]], M.lip);
    const ring = lathe([[RF + 0.016, SHELL - 0.02], [RF + 0.03, SHELL - 0.03], [R + 0.01, 0.06], [R + 0.012, 0.035], [R, 0.012], [R - 0.05, 0]], M.metal);
    bakeAO(ring.geometry, (p) => (1 - 0.6 * Math.exp(-p.y / 0.05)) * (1 - 0.5 * nearArm(p)));
    g.add(face, lip, ring, mesh(cushionGeo(), M.cushion));
    g.add(mesh(driverGeo, M.inner));
    return g;
  }

  // Kolumna o przekroju superelipsy, z zaokrąglonymi krawędziami (promień rf) i zamkniętymi końcami.
  // Profil to pary [o ile przekrój jest zwężony, wysokość]: dno, zaokrąglenie, bok, zaokrąglenie, wieczko.
  function columnGeo(hx, hz, y0, y1, n, rf) {
    const prof = [[hx, y0]], q = 6;
    for (let k = 0; k <= q; k++) { const a = k / q * Math.PI / 2; prof.push([rf * (1 - Math.sin(a)), y0 + rf * (1 - Math.cos(a))]); }
    for (let k = 0; k <= q; k++) { const a = k / q * Math.PI / 2; prof.push([rf * (1 - Math.cos(a)), y1 - rf + rf * Math.sin(a)]); }
    prof.push([hx, y1]);
    return gridGeo(prof.length - 1, 64, (u, v, p) => {
      const [d, y] = prof[Math.round(u * (prof.length - 1))], ph = v * Math.PI * 2;
      p.set(se(Math.cos(ph), n) * (hx - d), y, se(Math.sin(ph), n) * (hz - d));
    }, false, true);
  }
  // Tuleja: wchodzi od dołu w zaokrąglony koniec pałąka; tam, gdzie znika w dzianinie, i przy przegubie jest ciemniejsza
  const sleeveGeo = bakeAO(columnGeo(SLV.hx, SLV.hz, STEM_TOP + 0.01, SLEEVE_TOP + 0.14, 2.6, 0.012),
    (p) => (1 - 0.35 * Math.exp(-(p.y - STEM_TOP) / 0.03)) * (1 - 0.5 * Math.exp(-Math.max(SLEEVE_TOP + 0.01 - p.y, 0) / 0.03) * (p.y > SLEEVE_TOP - 0.05 ? 1 : 0)));
  // Przegub: odrobinę węższy; pod nim ciemny trzpień i szczelina nad pierścieniem, która oddziela metal od muszli
  const stemGeo = bakeAO(columnGeo(STEM.hx, STEM.hz, STEM_Y0, STEM_TOP, 2.6, 0.012), (p) => (1 - 0.5 * Math.exp(-(p.y - STEM_Y0) / 0.035)) * (1 - 0.25 * Math.exp(-(STEM_TOP - p.y) / 0.025)));

  const halo = new THREE.Group(), tilts = {}, cups = {};
  [-1, 1].forEach((side) => {
    const tilt = new THREE.Group(); // pochylenie wokół krawędzi poduszki: dół muszli idzie do środka
    tilt.position.x = side * (HEAD + CUSH);
    tilt.rotation.z = -side * TILT;
    const c = cup();
    c.rotation.y = side * Math.PI / 2;
    tilt.add(c);
    cups[side] = c;
    const stem = mesh(stemGeo, M.polish);
    stem.position.x = side * ARM_Z;
    const pin = mesh(new THREE.CylinderGeometry(0.065, 0.065, STEM_Y0 - R + 0.04, 24), M.pivot);
    pin.position.set(side * ARM_Z, (STEM_Y0 + R - 0.03) / 2, 0);
    const sleeve = mesh(sleeveGeo, M.polish);
    sleeve.position.x = side * ARM_Z;
    tilt.add(stem, pin, sleeve);
    halo.add(tilt);
    tilts[side] = tilt;
  });

  // Pałąk: płaski pas, który zwęża się i pogrubia ku końcom; końce są zaokrąglone jak obszyte poduszeczki,
  // z których od dołu wychodzą tuleje. Wzdłuż obu krawędzi przeszycie.
  const arcPts = [];
  for (let k = 0; k <= 320; k++) {
    const a = -A0 + (Math.PI + 2 * A0) * k / 320;
    arcPts.push(new THREE.Vector3(BA * Math.cos(a), BAND_CY + BB * Math.sin(a), 0));
  }
  const arc = new THREE.CatmullRomCurve3(arcPts, false, 'centripetal');
  const arcLen = arc.getLength();
  const Z = new THREE.Vector3(0, 0, 1), C = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3();
  halo.add(mesh(bakeAO(gridGeo(320, 120, (u, v, p) => {
    arc.getPointAt(u, C); arc.getTangentAt(u, T);
    N.crossVectors(T, Z);
    const mid = Math.sin(Math.PI * u); // 0 na końcach, 1 na szczycie
    const W = lerp(BAND_WE, BAND_WC, Math.pow(mid, 1.3)), Tk = lerp(BAND_TE, BAND_TC, Math.pow(mid, 0.6));
    const d = Math.min(u, 1 - u) * arcLen, s = d < Tk ? Tk * (1 - Math.sqrt(1 - ((Tk - d) / Tk) ** 2)) : 0; // zaokrąglony koniec
    const ph = v * Math.PI * 2, sz = se(Math.sin(ph), 4) * (W - s);
    let sx = se(Math.cos(ph), 4) * (Tk - s);
    sx -= Math.sign(sx) * 0.01 * gauss(Math.abs(sz) / (W - s) - 0.88, 0.025) * (1 - s / Tk);
    p.copy(C).addScaledVector(N, sx).addScaledVector(Z, sz);
  }, false, true), (p) => 1 - 0.3 * Math.exp(-Math.max(p.y - BAND_Y, 0) / 0.05)), M.band));

  // Punkty zaczepienia opisów cech (np. linie w sekcji Anatomia): puste obiekty przypięte do części modelu,
  // więc ich położenie na ekranie wynika z bieżącego obrotu słuchawek. Prawa muszla: oś +x, lewa: -x, przód: +z.
  const anchor = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
  const anchors = {
    ring: anchor(tilts[1], SHELL * 0.45, -0.42, 0.8),                // dolna, przednia część pierścienia prawej muszli
    face: anchor(tilts[1], SHELL + 0.004, 0.18, 0.22),               // środek ceramicznego frontu
    band: anchor(halo, 0, BAND_CY + BB + BAND_TC, BAND_WC * 0.4),    // szczyt pałąka
    arm: anchor(tilts[1], ARM_Z, STEM_Y0 + STEM_L * 0.5, STEM.hz),   // przegub nad prawą muszlą
    foam: anchor(tilts[-1], CUSH + 0.005, -0.6, 0.38),               // poduszka lewej muszli od strony ucha
  };

  // Prowadnice do animacji (np. wiązki światła w lumen.html): krawędź pierścienia w układzie muszli (okrąg o promieniu
  // ringR na wysokości ringH, góra przy y = +ringR), oś tulei w układzie pochylenia i oś pałąka w układzie słuchawek.
  const guides = { cups, tilts, ringR: R + 0.012, ringH: 0.05, stemX: ARM_Z, stemY0: STEM_Y0, sleeveTop: SLEEVE_TOP + 0.14, arc };

  return { halo, M, anchors, guides };
}

// Skaluje model do zadanej wysokości i ustawia jego środek w (0, 0, 0) grupy-rodzica.
export function centerHalo(halo, height) {
  halo.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(halo, true);
  const s = height / (box.max.y - box.min.y);
  halo.scale.setScalar(s);
  halo.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-s);
  return s;
}
