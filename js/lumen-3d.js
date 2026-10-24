// Strona Lumen Halo, część 3D: płótno ze słuchawkami, zbliżenia w Design (lupa), rozkładanie na części w Danych
// i piórko w finale. Wczytuje ją lumen.js dopiero po starcie strony (na pierwszym ekranie jest samo zdjęcie),
// a model i tekstury liczy osobny wątek (halo-worker.js), więc przewijanie nie zacina się w trakcie wczytywania.
// Stan (położenie, obrót, skala, przemiana w piórko) przychodzi z lumen.js; ten moduł tylko go rysuje.
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { PALETTES, studioEnv, haloMaterials, unpackHalo } from './halo-model.js';

const { lerp, clamp, degToRad } = THREE.MathUtils;
// krótka przerwa dla przeglądarki między kolejnymi kawałkami pracy, żeby żadne zadanie nie blokowało przewijania
const pause = () => new Promise((r) => (window.scheduler?.yield ? scheduler.yield().then(r) : setTimeout(r, 0)));

export async function start(C) {
  const { $, $$, smooth, seg, rig, drag, L, halfH, halfW, MODEL_H, FL, KON_R } = C;
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

  const data = await built;
  worker.terminate();
  const M = haloMaterials(renderer, data.knit);
  const { halo, anchors } = unpackHalo(data.model, M); // już wyśrodkowany i przeskalowany do MODEL_H
  const pivot = new THREE.Group();
  pivot.add(halo);
  scene.add(pivot);

  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, L.mobile ? 1.5 : 1.75));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = L.aspect;
    camera.updateProjectionMatrix();
  }
  resize();

  // ---------- Lekkość: słuchawki rozsypują się w drobinki, które składają się w piórko ----------
  // Piórko to tekstura rysowana na płótnie 2D (stosina, chorągiewki, puch u nasady) na wygiętej powierzchni:
  // łuk z obu końców, szczyt po prawej podwinięty, puch po lewej. Drobinki są losowane z powierzchni modelu
  // i z tekstury piórka (tam, gdzie jest gęsta), więc lądują dokładnie na nim. Płaszczyzna tnąca „zjada” bryłę,
  // drobinki lecą w kolejności od nasady do szczytu, a za nimi z tekstury wyłania się prawdziwe piórko.
  const clipLocal = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e3), clipWorld = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e3);
  Object.values(M).forEach((m) => { m.clippingPlanes = [clipWorld]; });
  const RUN = 1.6; // tempo fali: drobinka rusza, gdy uW · RUN minie jej miejsce na piórku (0 nasada, 1 szczyt)
  let dust = null, feather = null, fMesh = null, fShadow = null, cutX = null, cutK = null;
  const fRev = { value: 0 };

  // rysowanie trwa kilkaset milisekund, więc idzie kawałkami z przerwami (pause), żeby nie zacinać przewijania
  async function featherTexture() {
    const W = 2048, H = 768, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const yc = H / 2, xb = 60, xt = W - 170, // za szczytem stosiny zostaje miejsce na końce promieni
      X = (u) => xb + u * (xt - xb);
    g.lineCap = 'round';
    // puch u nasady: długie, miękkie, kręte promienie z drobnymi odgałęzieniami. Rysowany na osobnej warstwie i rozmyty
    // raz w całości (filtr przy każdej kresce zajmował kilkanaście sekund i zamrażał stronę po wczytaniu)
    const down = document.createElement('canvas'); down.width = W; down.height = H;
    { const g = down.getContext('2d'); g.lineCap = 'round';
    for (let i = 0; i < 1500; i++) {
      if (i % 250 === 249) await pause();
      const u = 0.05 + 0.55 * Math.pow(rnd(), 0.85), s = rnd() < 0.5 ? -1 : 1;
      const len = H * (0.22 + 0.32 * rnd()) * (1 - Math.abs(u - 0.33) * 1.2);
      let a = s * (0.75 + 0.75 * rnd()), x = X(u), y = yc;
      g.strokeStyle = `rgba(255,255,255,${0.42 + 0.28 * rnd()})`; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(x, y);
      const pts = [];
      for (let k = 0; k < 16; k++) {
        a += (rnd() - 0.5) * 0.5 - s * 0.03; // promień skręca w stronę szczytu i faluje
        x += Math.cos(a * 0.9) * len / 16 + len / 60; y += Math.sin(a) * len / 16;
        g.lineTo(x, y); pts.push([x, y, a]);
      }
      g.stroke();
      g.strokeStyle = i % 3 ? 'rgba(255,255,255,0.32)' : 'rgba(150,150,160,0.14)'; g.lineWidth = 0.9; // co trzeci promień z szarymi odgałęzieniami: puch ma cień i objętość
      g.beginPath();
      for (const [px, py, pa] of pts) for (const d of [-1, 1]) {
        const b = pa + d * (0.9 + 0.5 * rnd()), l = 5 + 10 * rnd();
        g.moveTo(px, py); g.lineTo(px + Math.cos(b) * l, py + Math.sin(b) * l);
      }
      g.stroke();
    }
    }
    await pause();
    g.filter = 'blur(0.6px)';
    g.drawImage(down, 0, 0);
    g.filter = 'none';
    // chorągiewki: gęste promienie skośne ku szczytowi, lekko wygięte, w pękach z rozszczepieniami.
    // Dolna (wewnętrzna) jest szersza, szczyt zaokrąglony.
    const env = (u, s) => {
      if (u < 0.42) return 0;
      const p = u < 0.66 ? 1 - ((0.66 - u) / 0.26) ** 2 * 0.7 : Math.max(0, 1 - ((u - 0.66) / 0.335) ** 2) ** 0.75 * (1 - 0.3 * smooth((u - 0.8) / 0.2)); // szczyt węższy i zaokrąglony
      return H * 0.44 * (s > 0 ? 1 : lerp(0.8, 1, smooth((u - 0.7) / 0.3))) * Math.max(0, p);
    };
    for (const s of [-1, 1]) {
      await pause();
      let clump = 0, jit = 0, cut = 1, n = 0;
      for (let u = 0.42; u < 0.995; u += 1 / 1100) {
        if (++n % 300 === 0) await pause();
        if (clump-- <= 0) { clump = 6 + rnd() * 22 | 0; jit = (rnd() - 0.5) * 0.04; cut = 1 - 0.05 * rnd(); if (u < 0.88 && rnd() < 0.12) u += 0.002 + 0.003 * rnd(); }
        const E = env(u, s) * cut; if (E < 2) continue;
        const al = lerp(0.78 - 0.32 * u, 0.2, smooth((u - 0.86) / 0.14)) + jit, // przy szczycie promienie biegną prawie wzdłuż stosiny i zbiegają się w szpic
          x0 = X(u), fw = E / Math.tan(al), q = Math.min(1, (xt + 130 - x0) / fw), // promienie przy szczycie skracają się i schodzą do osi
          x1 = x0 + fw * q, y1 = yc + s * E * q;
        const gr = g.createLinearGradient(x0, yc, x1, y1);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.36)'); gr.addColorStop(1, 'rgba(255,255,255,0.06)');
        g.strokeStyle = gr; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(x0, yc); g.quadraticCurveTo(x0 + (x1 - x0) * 0.25, yc + s * E * 0.72, x1, y1); g.stroke();
        if (rnd() < 0.3) { // luźne końce promieni wystają poza brzeg, więc brzeg chorągiewki jest miękki
          const l = 6 + 22 * rnd() * (1 - u), dx = Math.cos(al) * l, dy = s * Math.sin(al) * l;
          g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 0.9;
          g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 + dx, y1 + dy); g.stroke();
        }
        if (rnd() < 0.55) { // cieńsze, szare promienie dają rysunek splotu widoczny na jasnym piórku
          g.strokeStyle = 'rgba(140,140,150,0.16)'; g.lineWidth = 0.7;
          g.beginPath(); g.moveTo(x0, yc); g.quadraticCurveTo(x0 + (x1 - x0) * 0.25, yc + s * E * 0.72, x1, y1); g.stroke();
        }
      }
    }
    // stosina: zwęża się ku szczytowi; u nasady gołe, półprzezroczyste dutki
    const sw = (u) => 9 * (1 - u) + 1.4;
    g.fillStyle = 'rgba(252,252,253,0.95)';
    g.beginPath();
    for (let u = 0; u <= 1; u += 0.01) g.lineTo(X(u), yc - sw(u) / 2);
    for (let u = 1; u >= 0; u -= 0.01) g.lineTo(X(u), yc + sw(u) / 2);
    g.fill();
    g.strokeStyle = 'rgba(140,140,150,0.45)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(X(0.08), yc + 1); g.lineTo(X(0.97), yc + 0.5); g.stroke();
    await pause();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const data = g.getImageData(0, 0, W, H).data;
    return { t, data, W, H };
  }

  // Kształt piórka w jego układzie (oś x w prawo, y w górę, z do kamery). u: wzdłuż (0 nasada po lewej, 1 szczyt po prawej),
  // v: w poprzek (0,5 = stosina). Stosina idzie łukiem, oba końce w górę, a szczyt mocniej; chorągiewka jest pochylona do kamery
  // jak u piórka oglądanego lekko z góry i obraca się ku szczytowi, który zwija się przodem do widza.
  const FWD = FL * 768 / 2048;
  const shaftAt = (u) => new THREE.Vector3((u - 0.5) * FL, 0.42 * (2 * u - 1) ** 2 + 0.45 * Math.max(0, u - 0.7) ** 2 / 0.09 - 0.25, -0.35 * (2 * u - 1) ** 2);
  function featherPoint(u, v, out = new THREE.Vector3()) {
    const Cp = shaftAt(u), T = shaftAt(Math.min(1, u + 0.002)).sub(shaftAt(Math.max(0, u - 0.002))).normalize();
    const th = lerp(0.62, 0.12, smooth((u - 0.4) / 0.6));
    const D = new THREE.Vector3(-T.y, T.x, 0).normalize().multiplyScalar(Math.cos(th)).add(new THREE.Vector3(0, 0, Math.sin(th)));
    D.addScaledVector(T, -D.dot(T)).normalize();
    const N = new THREE.Vector3().crossVectors(T, D), w = (v - 0.5) * FWD;
    return out.copy(Cp).addScaledVector(D, w).addScaledVector(N, -0.32 * w * w * (1 - 0.7 * smooth((u - 0.75) / 0.25))); // przy szczycie chorągiewka się prostuje
  }

  async function buildFeather() {
    const ft = await featherTexture();
    const geo = new THREE.PlaneGeometry(1, 1, 200, 60), p = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { featherPoint(uv.getX(i), uv.getY(i), v); p.setXYZ(i, v.x, v.y, v.z); }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: ft.t, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, emissive: '#ffffff', emissiveMap: ft.t, emissiveIntensity: 0.12 });
    // piórko wyłania się od nasady do szczytu, w tym samym tempie, w jakim gasną drobinki
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uRev = fRev;
      sh.fragmentShader = 'uniform float uRev;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n  diffuseColor.a *= smoothstep(0.3, 0.55, uRev - vMapUv.x);');
    };
    fMesh = new THREE.Mesh(geo, mat);
    fMesh.renderOrder = 2;
    // miękki cień pod piórkiem: unosi się w powietrzu, więc cień jest daleko i rozmyty
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 64;
    const sg = sc.getContext('2d'), rg = sg.createRadialGradient(128, 32, 0, 128, 32, 128);
    rg.addColorStop(0, 'rgba(0,0,0,0.2)'); rg.addColorStop(0.45, 'rgba(0,0,0,0.08)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    sg.setTransform(1, 0, 0, 0.25, 0, 24); sg.fillStyle = rg; sg.fillRect(0, -96, 256, 256);
    fShadow = new THREE.Mesh(new THREE.PlaneGeometry(FL * 0.62, FL * 0.13), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
    fShadow.position.set(0.2, -2.1, -0.6);
    feather = new THREE.Group();
    feather.add(fMesh, fShadow);
    feather.visible = false;
    // układ piórka jest zgodny z kamerą: obrót znosi obrót słuchawek w ujęciu Lekkość
    const lp = C.P.lek();
    feather.quaternion.setFromEuler(new THREE.Euler(lp.rx, lp.ry, lp.rz, 'YXZ')).invert();
    feather.position.copy(L.mobile ? new THREE.Vector3(0, 0.15, 0.4) : new THREE.Vector3(0.25, 0.35, 0.4)).applyQuaternion(feather.quaternion);
    feather.scale.setScalar(L.mobile ? 1.35 : 1); // na telefonie słuchawki są małe, a piórko ma wypełnić szerokość ekranu
    feather.updateMatrix();
    pivot.add(feather);
    return ft;
  }

  let dustStarted = false;
  async function buildDust() {
    if (dustStarted) return;
    dustStarted = true;
    const ft = await buildFeather();
    await pause();
    const N = L.mobile ? 28000 : 42000;
    // drobinki losowane z modelu złożonego w położeniu zerowym; pętla rysuje między kawałkami pracy i przestawia model,
    // więc ustawienie zerowe jest przywracane przed każdym kawałkiem
    const zero = () => { pivot.position.set(0, 0, 0); pivot.rotation.set(0, 0, 0); pivot.scale.setScalar(1); explode(0); pivot.updateMatrixWorld(true); };
    const meshes = []; halo.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3();
    const areas = [];
    for (const m of meshes) {
      zero();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, p = g.attributes.position; let a = 0;
      for (let i = 0; i < p.count; i += 3) { A.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); B.fromBufferAttribute(p, i + 1).applyMatrix4(m.matrixWorld); Cc.fromBufferAttribute(p, i + 2).applyMatrix4(m.matrixWorld); a += B.sub(A).cross(Cc.sub(A)).length() / 2; }
      areas.push(a);
      await pause();
    }
    const total = areas.reduce((s, a) => s + a, 0), hp = [], v = new THREE.Vector3();
    for (const [k, m] of meshes.entries()) {
      zero();
      const s = new MeshSurfaceSampler(m).build(), n = Math.round(N * areas[k] / total);
      for (let i = 0; i < n; i++) { s.sample(v); hp.push(v.clone().applyMatrix4(m.matrixWorld)); }
      await pause();
    }
    // cele na piórku: punkty tekstury losowane proporcjonalnie do krycia, przeniesione na wygiętą powierzchnię
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const fe = [];
    while (fe.length < hp.length) {
      const x = rnd() * ft.W | 0, y = rnd() * ft.H | 0;
      if (rnd() * 255 > ft.data[(y * ft.W + x) * 4 + 3]) continue;
      const u = (x + 0.5) / ft.W;
      fe.push({ u, p: featherPoint(u, 1 - (y + 0.5) / ft.H).applyMatrix4(feather.matrix) });
      if (fe.length % 8000 === 0) await pause();
    }
    // pary: kolejność rozsypywania słuchawek (wzdłuż x) = kolejność składania piórka (od nasady do szczytu)
    hp.sort((a, b) => a.x - b.x); fe.sort((a, b) => a.u - b.u);
    const n = hp.length, start = new Float32Array(n * 3), end = new Float32Array(n * 3), k = new Float32Array(n), r3 = new Float32Array(n * 3);
    cutX = new Float32Array(n); cutK = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      hp[i].toArray(start, i * 3); fe[i].p.toArray(end, i * 3);
      k[i] = cutK[i] = fe[i].u; cutX[i] = hp[i].x;
      r3[i * 3] = rnd() * 2 - 1; r3[i * 3 + 1] = rnd() * 2 - 1; r3[i * 3 + 2] = rnd() * 2 - 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(start, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 3));
    g.setAttribute('aK', new THREE.BufferAttribute(k, 1));
    g.setAttribute('aRnd', new THREE.BufferAttribute(r3, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uW: { value: 0 }, uTime: { value: 0 }, uSize: { value: 17 }, uPR: { value: renderer.getPixelRatio() } },
      vertexShader: `
        uniform float uW, uTime, uSize, uPR;
        attribute vec3 aEnd, aRnd; attribute float aK;
        varying float vA; varying vec3 vC;
        void main() {
          float d = uW * ${RUN.toFixed(2)} - aK;      // ile czasu minęło od przejścia płaszczyzny
          float e = smoothstep(0.0, 0.35, d);
          float s = sin(3.14159 * e);
          vec3 p = mix(position, aEnd, e) + aRnd * 0.26 * s + vec3(0.0, 0.32 * s, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uPR / -mv.z;
          vA = step(0.0, d) * (1.0 - smoothstep(0.32, 0.6, d)); // po wylądowaniu drobinka gaśnie, a w jej miejscu jest już piórko
          // na białym tle Kontaktu drobinki są szare (jak w storyboardzie), część jaśniejsza, żeby chmura miała głębię
          vC = aRnd.x > 0.35 ? vec3(0.62, 0.62, 0.66) : aRnd.x > -0.4 ? vec3(0.45, 0.45, 0.49) : vec3(0.82, 0.82, 0.85);
        }`,
      fragmentShader: `
        varying float vA; varying vec3 vC;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = vA * 0.75 * (1.0 - smoothstep(0.12, 0.25, dot(c, c)));
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC, a);
        }`,
    });
    dust = new THREE.Points(g, mat);
    dust.frustumCulled = false;
    dust.visible = false;
    pivot.add(dust);
    await pause();
    measureFeather();
    G.ready = true;
  }
  // położenie płaszczyzny tnącej: tuż za ostatnią drobinką, która już ruszyła (kolejność drobinek jest posortowana)
  function cutAt(front) {
    let lo = 0, hi = cutK.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cutK[m] < front) lo = m + 1; else hi = m; }
    return lo === 0 ? -1e3 : lo >= cutX.length ? 1e3 : cutX[lo];
  }
  function measureFeather() {
    pivot.position.set(0, 0, 0); pivot.rotation.set(KON_R[0], KON_R[1], 0, 'YXZ'); pivot.scale.setScalar(1); pivot.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(fMesh), c = b.getCenter(new THREE.Vector3());
    // h: połowa wysokości piórka względem jego szerokości (piórko leży na linii liter, więc środek jest nad nią)
    G.featherOff = { x: c.x, y: c.y, h: (b.max.y - b.min.y) / (b.max.x - b.min.x) * 0.6 };
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
    if (dust) {
      dust.visible = rig.wave > 0.0005;
      dust.material.uniforms.uW.value = rig.wave;
      dust.material.uniforms.uTime.value = t;
      const cut = rig.wave > 0.0005 ? cutAt(rig.wave * RUN) : -1e3;
      clipLocal.set(new THREE.Vector3(1, 0, 0), -cut);
      feather.visible = dust.visible;
      fRev.value = rig.wave * RUN;
      // gotowe piórko unosi się i lekko kołysze; zaczyna dopiero, gdy drobinki już zgasły, żeby się z nimi nie rozjechało
      const k = C.reduce ? 0 : smooth((rig.wave - 0.95) / 0.05);
      fMesh.rotation.set(Math.sin(t * 0.6) * 0.05 * k, Math.sin(t * 0.45) * 0.08 * k, Math.sin(t * 0.7 + 1) * 0.04 * k);
      fMesh.position.y = Math.sin(t * 0.8) * 0.09 * k;
      fShadow.visible = false;
      pivot.updateMatrixWorld(true);
      clipWorld.copy(clipLocal).applyMatrix4(pivot.matrixWorld);
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
    if (fe) add(fMesh, 3); // cała płaszczyzna piórka (z przezroczystymi brzegami), więc obrys jest z zapasem else halo.traverse((o) => { if (o.isMesh) add(o, 5); });
    return { x0: Math.round(x0), x1: Math.round(x1), y0: Math.round(y0), y1: Math.round(y1), op: +canvas.style.opacity, feather: fe, e: lastE.toFixed(2), wave: rig.wave.toFixed(2) };
  }

  const G = { ready: false, featherOff: null, featherScale: 1, resize, measure: placeLoupes, frame, buildDust, box, get dust() { return dust; } };
  return G;
}
