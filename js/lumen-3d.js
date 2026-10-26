// Strona Lumen Halo, część 3D: płótno ze słuchawkami, zbliżenia w Design (lupa), rozkładanie na części w Danych
// i piórko w finale. Wczytuje ją lumen.js dopiero po starcie strony (na pierwszym ekranie jest samo zdjęcie),
// a model i tekstury liczy osobny wątek (halo-worker.js), więc przewijanie nie zacina się w trakcie wczytywania.
// Stan (położenie, obrót, skala, przemiana w piórko) przychodzi z lumen.js; ten moduł tylko go rysuje.
import * as THREE from 'three';
import { PALETTES, studioEnv, haloMaterials, unpackHalo } from './halo-model.js';
import { featherTexture, featherMesh } from './feather.js';

const { lerp, clamp, degToRad } = THREE.MathUtils;
// krótka przerwa dla przeglądarki między kolejnymi kawałkami pracy, żeby żadne zadanie nie blokowało przewijania
const pause = () => new Promise((r) => (window.scheduler?.yield ? scheduler.yield().then(r) : setTimeout(r, 0)));

export async function start(C) {
  const { $, $$, smooth, seg, rig, drag, L, halfH, halfW, MODEL_H, FL, KON_R } = C; // FL: długość piórka (feather.js)
  // model i tekstury liczy wątek; w tym czasie powstaje renderer i studio do odbić
  const worker = new Worker(new URL('./halo-worker.js', import.meta.url), { type: 'module' });
  const built = new Promise((res, rej) => { worker.onmessage = (e) => res(e.data); worker.onerror = rej; });
  worker.postMessage({ height: MODEL_H });

  // ---------- Scena ----------
  const canvas = C.canvas;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  await pause();
  scene.environment = studioEnv(renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  const sun = new THREE.DirectionalLight(0xfffaf2, 1.4);
  sun.position.set(1.5, 9, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 28;
  sun.shadow.blurSamples = 32;
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 24 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d4cc, 0.2);
  scene.add(sun, hemi);

  // utrata kontekstu karty graficznej (np. przy obciążeniu): po odzyskaniu odbicia studia trzeba policzyć od nowa,
  // inaczej słuchawki są ciemne, bez odbić
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => { scene.environment = studioEnv(renderer); });
  const data = await built;
  worker.terminate();
  const M = haloMaterials(renderer, data.knit);
  const { halo, anchors } = unpackHalo(data.model, M); // już wyśrodkowany i przeskalowany do MODEL_H
  const pivot = new THREE.Group();
  pivot.add(halo);
  scene.add(pivot);

  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, L.mobile ? 1.5 : 1.75));
    renderer.setSize(innerWidth, innerHeight); // także rozmiar płótna na stronie: obraz liczony dla tej samej wysokości, w której jest wyświetlany
    camera.aspect = L.aspect;
    camera.updateProjectionMatrix();
  }
  resize();

  // ---------- Finał: słuchawki przechodzą w piórko (wariant A, „przenikanie”) ----------
  // Słuchawki rozmywają się i znikają, a z rozmycia wyostrza się piórko (w miejscu słuchawek albo dopiero nad stopką).
  // Rozmycie i krycie robi płótno (lumen.js); tutaj tylko: do połowy przemiany (rig.wave < 0,5) widać słuchawki, potem piórko.
  // Piórko to tekstura rysowana na płótnie 2D (feather.js) na wygiętej powierzchni.
  let feather = null, fMesh = null, featherStarted = false;
  const fRev = { value: 9 }; // piórko odsłonięte w całości

  async function buildFeather() {
    if (featherStarted) return;
    featherStarted = true;
    const ft = await featherTexture(renderer);
    fMesh = featherMesh(ft, fRev);
    feather = new THREE.Group();
    feather.add(fMesh);
    feather.visible = false;
    // układ piórka jest zgodny z kamerą: obrót znosi obrót słuchawek w ujęciu Lekkość
    const lp = C.P.lek();
    feather.quaternion.setFromEuler(new THREE.Euler(lp.rx, lp.ry, lp.rz, 'YXZ')).invert();
    feather.position.copy(L.mobile ? new THREE.Vector3(0, 0.15, 0.4) : new THREE.Vector3(0.25, 0.35, 0.4)).applyQuaternion(feather.quaternion);
    feather.scale.setScalar(L.mobile ? 1.35 : 1);
    feather.updateMatrix();
    pivot.add(feather);
    await pause();
    // shader piórka kompiluje się teraz, a nie przy jego pierwszym pojawieniu się
    feather.visible = true;
    try { await renderer.compileAsync(scene, camera); } catch (e) { /* kompilacja przy pierwszej klatce */ }
    feather.visible = false;
    measureFeather(ft);
    G.ready = true;
  }
  function measureFeather(ft) {
    pivot.position.set(0, 0, 0); pivot.rotation.set(KON_R[0], KON_R[1], 0, 'YXZ'); pivot.scale.setScalar(1); pivot.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(fMesh), c = b.getCenter(new THREE.Vector3());
    // Dół widocznego piórka: tylko punkty siatki, przy których tekstura nie jest przezroczysta (płaszczyzna ma puste brzegi,
    // więc dół całej siatki leżał wyraźnie pod piórkiem i piórko „wisiało” nad literami)
    const p = fMesh.geometry.attributes.position, uv = fMesh.geometry.attributes.uv, v = new THREE.Vector3();
    const seen = (x, y) => { // najmocniejsze krycie w małym otoczeniu (cienkie promienie leżą między punktami siatki)
      let a = 0;
      for (let dy = -8; dy <= 8; dy += 4) for (let dx = -8; dx <= 8; dx += 4) {
        const X = clamp(x + dx, 0, ft.W - 1), Y = clamp(y + dy, 0, ft.H - 1); a = Math.max(a, ft.data[(Y * ft.W + X) * 4 + 3]);
      }
      return a > 60; // ok. 25% krycia: luźne, prawie przezroczyste końce puchu się nie liczą
    };
    let low = c.y;
    for (let i = 0; i < p.count; i++) {
      if (!seen(Math.round(uv.getX(i) * (ft.W - 1)), Math.round((1 - uv.getY(i)) * (ft.H - 1)))) continue;
      low = Math.min(low, v.fromBufferAttribute(p, i).applyMatrix4(fMesh.matrixWorld).y);
    }
    // h: od środka piórka do jego widocznego dołu, jako ułamek długości piórka (tej samej, którą featherAt ustawia na ekranie)
    G.featherOff = { x: c.x, y: c.y, h: (c.y - low) / (FL * feather.scale.x) };
    G.featherScale = feather.scale.x;
  }

  // ---------- Dane techniczne: słuchawki rozkładają się na części ----------
  // Pałąk z ramionami w górę, muszle na boki i w dół, w każdej muszli front i pierścień na zewnątrz, poduszka do środka
  // (te same przesunięcia co w renderach do Figmy). Po rozłożeniu widać tył części, więc materiały rysują obie strony.
  Object.values(M).forEach((m) => { m.side = THREE.DoubleSide; });
  const tiltsE = halo.children.filter((c) => c.isGroup), bandE = halo.children.find((c) => c.isMesh);
  const basePos = new Map(); halo.traverse((o) => basePos.set(o, o.position.clone()));
  let lastE = -1;
  function explode(e) {
    if (Math.abs(e - lastE) < 1e-4) return;
    lastE = e;
    basePos.forEach((p, o) => o.position.copy(p));
    bandE.position.y += 0.55 * e;
    tiltsE.forEach((t) => {
      const side = Math.sign(t.position.x), [cup, stem, pin, sleeve] = t.children;
      t.position.x += side * 0.55 * e; t.position.y -= 0.25 * e;
      for (const p of [stem, pin, sleeve]) p.position.y += 0.55 * e; // ramię zostaje przy pałąku
      const [face, lip, ring, cushion, driver] = cup.children;         // oś +z muszli = na zewnątrz
      face.position.z += 0.7 * e; lip.position.z += 0.7 * e; ring.position.z += 0.32 * e;
      cushion.position.z -= 0.45 * e; driver.position.z += 0.1 * e;
    });
  }

  // ---------- Anatomia: zbliżenia detali (lupa) ----------
  // Cechy pojawiają się pojedynczo: okrągłe zbliżenie stoi tuż obok modelu, po tej stronie, po której jest opisywana
  // część, z cienką linią do punktu i podpisem pod spodem. Gdy jedna cecha prawie zgaśnie, zaczyna pojawiać się następna,
  // a model w tym czasie dokręca się dalej. Zbliżenie to osobny widok kamery z bliska na model (ten sam model i światło),
  // renderowany do tekstury i rysowany w kole na tym samym płótnie. Cel i kierunek kamery są w układzie słuchawek
  // (x: prawa muszla, y: góra, z: przód), więc zbliżenie obraca się razem z modelem.
  const rim = new THREE.Object3D();
  rim.position.set(0.21, -0.42, 0.72); // brzeg ceramicznego frontu z przodu: ceramika, polerowana fazka i bok pierścienia
  anchors.face.parent.add(rim);
  const bandSide = new THREE.Object3D();
  bandSide.position.copy(anchors.band.position).add(new THREE.Vector3(0.85, -0.6, 0)); // prawy bok łuku pałąka: zewnętrzna strona dzianiny
  anchors.band.parent.add(bandSide);
  const armL = new THREE.Object3D(); // przegub nad lewą muszlą: widać go po obrocie w drugą stronę
  armL.position.set(-anchors.arm.position.x, anchors.arm.position.y, anchors.arm.position.z);
  anchors.foam.parent.add(armL);
  // kolejność cech jak w HTML: poduszki, pierścień, ceramika, pałąk, ramię
  const LP = [
    { at: anchors.foam, dir: [0.45, -0.05, 0.89], span: 0.85 }, // poduszki: lewa od strony ucha, przez szczelinę między muszlami
    { at: anchors.ring, dir: [0.75, 0.05, 0.66], span: 0.7 },   // pierścień z aluminium
    { at: rim, dir: [0.62, -0.18, 0.76], span: 0.55 },         // ceramiczna muszla: pod kątem, żeby było widać grubość
    { at: bandSide, dir: [0.55, 0.4, 0.73], span: 0.6 },       // pałąk z dzianiny: ukośnie na zewnętrzną stronę łuku, widać splot i przeszycie
    { at: armL, dir: [-0.6, 0.15, 0.8], span: 0.75 },          // ruchome ramię lewej muszli
  ];
  const lpEls = $$('.lp'), linesSvg = $('#lines');
  const NS = 'http://www.w3.org/2000/svg';
  LP.forEach((l, i) => {
    l.el = lpEls[i];
    l.line = document.createElementNS(NS, 'path'); l.line.setAttribute('fill', 'none'); l.line.setAttribute('stroke', '#1d1d1f'); l.line.setAttribute('stroke-width', '1');
    l.pulse = document.createElementNS(NS, 'circle'); l.pulse.setAttribute('r', '13'); l.pulse.setAttribute('fill', 'rgba(255,255,255,.4)'); l.pulse.setAttribute('stroke', '#fff');
    l.dot = document.createElementNS(NS, 'circle'); l.dot.setAttribute('r', '6'); l.dot.setAttribute('fill', '#fff'); l.dot.setAttribute('stroke', '#1d1d1f'); l.dot.setAttribute('stroke-width', '1.5');
    l.line.style.opacity = l.pulse.style.opacity = l.dot.style.opacity = 0;
    linesSvg.append(l.line, l.pulse, l.dot);
    l.rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, samples: 4 });
    l.mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { map: { value: l.rt.texture }, uA: { value: 0 }, uPx: { value: 132 }, uBg: { value: new THREE.Color('#efeeeb').convertLinearToSRGB() } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D map; uniform float uA, uPx; uniform vec3 uBg; varying vec2 vUv;
        void main() {
          const float M = 1.35;                  // połowa boku kwadratu / promień koła (zapas na cień)
          vec2 p = (vUv * 2.0 - 1.0) * M;
          float q = length(p), px = 2.0 / uPx;   // q = 1 na krawędzi koła, px = jeden piksel w tych jednostkach
          vec4 img = texture2D(map, p * 0.5 + 0.5);
          vec3 c = img.a > 0.001 ? linearToOutputTexel(vec4(toneMapping(img.rgb / img.a), 1.0)).rgb : uBg;
          c = mix(uBg, c, img.a);
          float inner = 1.0 - smoothstep(1.0 - 5.0 * px, 1.0 - 4.0 * px, q);   // zdjęcie w białej obwódce (4 px)
          float disc = 1.0 - smoothstep(1.0 - px, 1.0, q);
          float sh = 0.12 * exp(-pow(max(length(p - vec2(0.0, -0.07)) - 0.96, 0.0) * 5.0, 2.0)); // miękki cień pod kołem
          vec4 res = mix(vec4(vec3(0.0), sh), vec4(mix(vec3(1.0), c, inner), 1.0), disc);
          gl_FragColor = vec4(res.rgb, res.a * uA);
        }`,
    });
    l.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), l.mat);
    l.quad.frustumCulled = false;
  });
  const ovScene = new THREE.Scene(), ovCam = new THREE.OrthographicCamera(0, 1, 0, -1, -1, 1);
  LP.forEach((l) => ovScene.add(l.quad));
  const lpCam = new THREE.PerspectiveCamera(18, 1, 0.02, 60);
  const LP_M = 1.35, LP_LABEL_W = 300, LP_GAP = 40, LP_COMPACT_BOTTOM = 40; // zapas kwadratu wokół koła (cień); szerokość podpisu jak w CSS; odstęp koła od modelu; odstęp opisu od dołu (tablet, telefon)
  let lpA = 0, lpD = 120, lpTop = 200;
  // narożniki prostopadłościanu wokół modelu (układ obracanej grupy): z nich co klatkę wychodzi obrys modelu na ekranie
  const boxCorners = [];
  {
    pivot.position.set(0, 0, 0); pivot.rotation.set(0, 0, 0); pivot.scale.setScalar(1); pivot.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(halo);
    for (let k = 0; k < 8; k++) boxCorners.push(new THREE.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z));
  }
  // Tablet i telefon (L.compact): bez zbliżeń. Na modelu pulsuje punkt opisywanej części, a opis stoi zawsze w lewym
  // dolnym rogu z paskiem stanu nad nim (5 odcinków, aktywny wypełnia się przy przewijaniu); punkt i tekst przenikają się
  // z następnymi, więc nic się nie zderza.
  const lpBar = document.createElement('div');
  lpBar.className = 'lp-bar'; lpBar.setAttribute('aria-hidden', 'true');
  lpBar.innerHTML = '<i><b></b></i>'.repeat(5);
  $('#design').appendChild(lpBar);
  const lpBarFill = $$('b', lpBar);
  let lpTextY = 0;
  const wTmp = new THREE.Vector3(), dTmp = new THREE.Vector3(), cTmp = new THREE.Vector3();
  function placeLoupes() {
    const W = innerWidth, H = innerHeight;
    lpD = Math.min(0.1 * W, 0.155 * H);
    const res = Math.min(512, Math.round(lpD * 1.4 * Math.min(devicePixelRatio, 2)));
    LP.forEach((l) => l.rt.setSize(res, res));
    ovCam.right = W; ovCam.bottom = -H; ovCam.updateProjectionMatrix();
    lpTop = C.rel('.anat-head', '#design').bottom + 24; // koła nie wchodzą na tytuł
    // telefon i tablet: wszystkie opisy w jednym miejscu, wyrównane do dołu; pasek stanu nad najwyższym z nich
    const pad = Math.max(24, 0.045 * W), hMax = Math.max(...LP.map((l) => l.el.offsetHeight));
    lpTextY = H - LP_COMPACT_BOTTOM - hMax;
    lpBar.style.transform = `translate(${pad}px, ${lpTextY - 26}px)`;
    // strona każdej cechy: po której stronie obrysu modelu leży jej punkt w jej własnym ujęciu
    LP.forEach((l, i) => {
      const p = C.featPose(i);
      pivot.position.set(p.px, p.py, p.pz); pivot.rotation.set(p.rx, p.ry, p.rz, 'YXZ'); pivot.scale.setScalar(p.s); pivot.updateMatrixWorld(true);
      camera.position.set(0, p.camY, L.dist); camera.lookAt(0, p.camTY, 0); camera.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity;
      boxCorners.forEach((c) => { cTmp.copy(c).applyMatrix4(pivot.matrixWorld).project(camera); x0 = Math.min(x0, cTmp.x); x1 = Math.max(x1, cTmp.x); });
      l.at.getWorldPosition(wTmp).project(camera);
      l.left = wTmp.x < (x0 + x1) / 2;
    });
  }
  // v: postęp cech 0–5, a: krycie całej lupy. Renderuje widoczne zbliżenia do tekstur, ustawia koła, linie i podpisy.
  function drawLoupes(a, v) {
    if (a < 0.002) {
      if (lpA >= 0.002) {
        LP.forEach((l) => { l.el.style.visibility = 'hidden'; l.quad.visible = false; l.line.style.opacity = l.dot.style.opacity = l.pulse.style.opacity = 0; });
        lpBar.style.opacity = 0; lpA = a;
      }
      return;
    }
    lpA = a;
    const W = innerWidth, H = innerHeight, unit = halo.matrixWorld.getMaxScaleOnAxis(), compact = L.compact;
    // obrys modelu na ekranie
    let x0 = Infinity, x1 = -Infinity;
    boxCorners.forEach((c) => { cTmp.copy(c).applyMatrix4(pivot.matrixWorld).project(camera); const x = (cTmp.x * 0.5 + 0.5) * W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); });
    const pad = Math.max(24, 0.045 * W), top = lpTop;
    // pasek stanu (tablet, telefon): odcinki przed aktywnym pełne, aktywny wypełnia się w trakcie swojej cechy
    lpBar.style.opacity = compact ? a : 0;
    if (compact) lpBarFill.forEach((b, j) => { b.style.transform = `scaleX(${clamp(v - j + 0.15, 0, 1).toFixed(3)})`; });
    renderer.shadowMap.autoUpdate = false; // cienie policzone w głównym przebiegu
    LP.forEach((l, i) => {
      // cecha i pojawia się, gdy poprzednia już prawie zgasła, i gaśnie przed przejściem do następnej; ostatnia gaśnie z sekcją
      const vin = smooth(seg(v, i - 0.22, i + 0.15)), vout = i === 4 ? 1 : 1 - smooth(seg(v, i + 0.55, i + 0.85));
      const vis = i === 0 ? vout : vin * vout, show = a * vis;
      l.quad.visible = !compact && show > 0.002;
      if (show <= 0.002) { l.el.style.visibility = 'hidden'; l.line.style.opacity = l.dot.style.opacity = l.pulse.style.opacity = 0; return; }
      l.at.getWorldPosition(wTmp);
      const s = wTmp.clone().project(camera), ax = (s.x * 0.5 + 0.5) * W, ay = (-s.y * 0.5 + 0.5) * H;
      l.dot.setAttribute('cx', ax); l.dot.setAttribute('cy', ay); l.dot.style.opacity = show;
      l.pulse.setAttribute('cx', ax); l.pulse.setAttribute('cy', ay); l.pulse.style.opacity = show;
      const st = l.el.style;
      st.visibility = 'visible'; st.opacity = show;
      if (compact) { // tylko punkt i opis w stałym miejscu
        l.line.style.opacity = 0; l.el.classList.remove('l');
        st.transform = `translate(${pad}px, ${lpTextY + (1 - vin) * 8}px)`;
        return;
      }
      // zbliżenie: kamera z bliska wzdłuż kierunku w układzie słuchawek
      dTmp.set(...l.dir).normalize().transformDirection(halo.matrixWorld);
      lpCam.position.copy(wTmp).addScaledVector(dTmp, (l.span * unit) / 2 / Math.tan(degToRad(9)));
      lpCam.lookAt(wTmp);
      renderer.setRenderTarget(l.rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, lpCam);
      // koło: tuż za obrysem modelu, po stronie punktu (stałej dla cechy), na jego wysokości; przy pojawianiu się lekko rośnie
      const d = lpD * lerp(0.9, 1, smooth(seg(v, i - 0.22, i + 0.4))), left = l.left;
      const x = clamp(left ? x0 - LP_GAP - d / 2 : x1 + LP_GAP + d / 2, pad + d / 2, W - pad - d / 2);
      const y = clamp(ay - d * 0.35, top + d / 2, H - 150 - d / 2);
      l.quad.position.set(x, -y, 0); l.quad.scale.setScalar(d * LP_M);
      l.mat.uniforms.uA.value = show; l.mat.uniforms.uPx.value = d;
      // linia od brzegu koła do punktu na modelu
      const dx = ax - x, dy = ay - y, len = Math.hypot(dx, dy) || 1, r = d / 2 + 8;
      l.line.setAttribute('d', `M${(x + dx / len * r).toFixed(1)},${(y + dy / len * r).toFixed(1)} L${ax.toFixed(1)},${ay.toFixed(1)}`);
      l.line.style.opacity = show * 0.5;
      // podpis pod kołem, wyrównany do krawędzi bliżej modelu
      l.el.classList.toggle('l', left);
      st.transform = `translate(${left ? x + d / 2 - LP_LABEL_W : x - d / 2}px, ${y + d / 2 + 16 + (1 - vin) * 10}px)`;
    });
    renderer.setRenderTarget(null);
    renderer.shadowMap.autoUpdate = true;
    if (compact) return;
    renderer.autoClear = false;
    renderer.render(ovScene, ovCam);
    renderer.autoClear = true;
  }

  // ---------- Kolor słuchawek i światło ----------
  // Konfiguracja: do pierwszego kliknięcia próbki kolor prowadzi przewijanie, potem wybrany kolor. Poza sekcją
  // słuchawki są białe (Kreda). Użytkowanie: światło dnia według godziny, przy wejściu i wyjściu przenika się ze zwykłym.
  const SUN = [['#f1f5ff', 1.45], ['#fff0da', 1.55], ['#ffdcbc', 1.25]];
  const LOOK = ['ceramic', 'metal', 'cushion', 'band', 'inner'];
  const PAL = PALETTES.map((p, i) => ({ ...Object.fromEntries(LOOK.map((k) => [k, new THREE.Color(p[k])])), sun: new THREE.Color(SUN[i][0]), si: SUN[i][1] }));
  const cur = { ...Object.fromEntries(LOOK.map((k) => [k, PAL[0][k].clone()])), sun: PAL[0].sun.clone(), si: PAL[0].si };
  const light = { c: new THREE.Color('#fffaf2'), i: 1.4 };
  const lookTmp = new THREE.Color();
  function look(x, white, dt, picked, color) {
    if (!picked) {
      const k = Math.min(1, Math.floor(x)), f = x - k;
      LOOK.forEach((n) => cur[n].copy(PAL[k][n]).lerp(PAL[k + 1][n], f));
      cur.sun.copy(PAL[k].sun).lerp(PAL[k + 1].sun, f); cur.si = lerp(PAL[k].si, PAL[k + 1].si, f);
    } else { // po kliknięciu kolor dochodzi do wybranego w ok. 0,6 s
      const q = C.reduce ? 1 : 1 - Math.exp(-dt / 0.2), P1 = PAL[color];
      LOOK.forEach((n) => cur[n].lerp(P1[n], q));
      cur.sun.lerp(P1.sun, q); cur.si = lerp(cur.si, P1.si, q);
    }
    const P0 = PAL[0], set = (mat, n) => mat.color.copy(lookTmp.copy(cur[n]).lerp(P0[n], white));
    set(M.ceramic, 'ceramic'); set(M.metal, 'metal'); set(M.lip, 'metal'); set(M.polish, 'metal'); set(M.pivot, 'metal');
    set(M.cushion, 'cushion'); set(M.band, 'band'); set(M.inner, 'inner');
    light.c.copy(cur.sun).lerp(P0.sun, white); light.i = lerp(cur.si, P0.si, white);
  }
  const mixStops = (stops, h) => { // interpolacja kolorów/liczb wg godziny
    let i = 0; while (i < stops.length - 2 && h > stops[i + 1][0]) i++;
    const [h0, a] = stops[i], [h1, b] = stops[i + 1], t = clamp((h - h0) / (h1 - h0), 0, 1);
    return typeof a === 'number' ? lerp(a, b, t) : lookTmp.set(a).lerp(new THREE.Color(b), t);
  };
  const SUN_DAY = [[7, '#dce7ff'], [12, '#fff6ea'], [18.5, '#ffbd82'], [20.5, '#8ea4ff'], [23, '#7c92e3']];
  const SUN_I = [[7, 1.3], [12, 1.6], [18.5, 1.3], [20.5, 0.5], [23, 0.35]];
  const ENV_I = [[7, 1], [18, 0.95], [20.5, 0.5], [23, 0.4]];

  // ---------- Klatka ----------
  // F: stan z lumen.js (rozłożenie, kolor, godzina i jej udział w świetle, lupa, krycie płótna)
  function frame(t, dt, F) {
    explode(F.e);
    look(F.col, F.white, dt, F.picked, F.color);
    const bob = C.reduce ? 0 : Math.sin(t * 0.9) * 0.05 * rig.bob;
    pivot.position.set(rig.px, rig.py + bob, rig.pz);
    const sway = C.reduce ? 0 : Math.sin(t * 0.45) * 0.16 * rig.sway; // oferta: powolne kołysanie na boki
    pivot.rotation.set(rig.rx + drag.x, rig.ry + drag.y + sway, rig.rz, 'YXZ');
    pivot.scale.setScalar(rig.s);
    camera.position.set(0, rig.camY, L.dist);
    camera.lookAt(0, rig.camTY, 0);
    sun.color.copy(light.c); sun.intensity = light.i; scene.environmentIntensity = 1;
    if (F.dayMix > 0) {
      sun.color.lerp(mixStops(SUN_DAY, F.day), F.dayMix);
      sun.intensity = lerp(light.i, mixStops(SUN_I, F.day), F.dayMix);
      scene.environmentIntensity = lerp(1, mixStops(ENV_I, F.day), F.dayMix);
    }
    if (feather) {
      const on = rig.wave >= 0.5;
      halo.visible = !on; feather.visible = on;
      // gotowe piórko unosi się i lekko kołysze
      const k = C.reduce ? 0 : 1;
      fMesh.rotation.set(Math.sin(t * 0.6) * 0.05 * k, Math.sin(t * 0.45) * 0.08 * k, Math.sin(t * 0.7 + 1) * 0.04 * k);
      fMesh.position.y = Math.sin(t * 0.8) * 0.09 * k;
    }
    // płótno niewidoczne (np. na pierwszym ekranie): bez rysowania, karta graficzna odpoczywa
    if (F.opacity < 0.002 && F.lpA < 0.002 && lpA < 0.002) return;
    renderer.render(scene, camera);
    drawLoupes(F.lpA * rig.ent, F.lpV);
  }

  // shadery kompilują się teraz, w tle (tam, gdzie przeglądarka to umie), a nie przy pierwszym pojawieniu się słuchawek
  await pause();
  explode(0);
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* starsze przeglądarki: kompilacja przy pierwszej klatce */ }
  await pause();
  renderer.render(scene, camera);

  // diagnostyka (_pomiar.js): obrys modelu albo piórka na ekranie z rzutu wierzchołków w bieżącym ujęciu
  const vTmp = new THREE.Vector3();
  function box() {
    pivot.updateMatrixWorld(true); camera.updateMatrixWorld();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    const add = (m, k) => { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += k) { vTmp.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).project(camera); const x = (vTmp.x * 0.5 + 0.5) * innerWidth, y = (-vTmp.y * 0.5 + 0.5) * innerHeight; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } };
    const fe = feather && feather.visible && rig.wave > 0.5;
    // piórko: cała płaszczyzna (z przezroczystymi brzegami), więc obrys jest z zapasem
    if (fe) add(fMesh, 3); else halo.traverse((o) => { if (o.isMesh) add(o, 5); });
    return { x0: Math.round(x0), x1: Math.round(x1), y0: Math.round(y0), y1: Math.round(y1), op: +canvas.style.opacity, feather: fe, e: lastE.toFixed(2), wave: rig.wave.toFixed(2) };
  }

  const G = { ready: false, featherOff: null, featherScale: 1, resize, measure: placeLoupes, frame, buildDust: buildFeather, box, get dust() { return feather; } };
  return G;
}
