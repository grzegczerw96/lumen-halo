// Tekstury dzianiny (kolor i mapa normalnych, 512 × 512) liczone piksel po pikselu. To najdłuższa część budowy modelu,
// więc strona liczy je w osobnym wątku (knit-worker.js), a główny wątek w tym czasie przewija stronę.
// Bez zależności (także bez three.js), żeby wątek wczytał tylko ten plik.
// Wiersze są zapisane od dołu (jak w teksturze WebGL), więc obraz wygląda tak samo jak dawny canvas z flipY.
export const KNIT_TS = 512;
export const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
export const vnoise = (x, y, per) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const g = (a, b) => hash(((a % per) + per) % per, ((b % per) + per) % per);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), lerp = (a, b, t) => a + (b - a) * t;
  return lerp(lerp(g(xi, yi), g(xi + 1, yi), sx), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), sx), sy);
};

export function knitData() {
  const TS = KNIT_TS, TP = 8;
  // Dzianina melanżowa jak na zdjęciach: splot skośny 2/2, każda nitka w nieco innym odcieniu,
  // a w nitce pojedyncze włókna, żeby z bliska powierzchnia nie była idealnie regularna
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
  const heather = new Float32Array(TS * TS);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let v = 0, a = 0.5, f = 40;
    for (let o = 0; o < 4; o++, a *= 0.5, f *= 2) v += a * vnoise(x / TS * f, y / TS * f, f);
    heather[y * TS + x] = v / 0.9375; // 0..1
  }
  const color = new Uint8Array(TS * TS * 4), normal = new Uint8Array(TS * TS * 4), hgt = new Float32Array(TS * TS);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const w = weave(x, y), m = heather[y * TS + x], i = ((TS - 1 - y) * TS + x) * 4;
    color[i] = color[i + 1] = color[i + 2] = Math.min(1, 0.8 + 0.07 * w.tone + 0.05 * w.h + 0.12 * Math.pow(m, 1.6)) * 255; color[i + 3] = 255;
    hgt[y * TS + x] = w.h + 0.5 * m; // mapa normalnych z wysokości splotu; grubsze nitki w plamach melanżu
  }
  const h = (x, y) => hgt[((y + TS) % TS) * TS + (x + TS) % TS];
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const nx = h(x - 1, y) - h(x + 1, y), ny = h(x, y + 1) - h(x, y - 1), l = Math.hypot(nx, ny, 1), i = ((TS - 1 - y) * TS + x) * 4;
    normal[i] = (nx / l * 0.5 + 0.5) * 255; normal[i + 1] = (ny / l * 0.5 + 0.5) * 255; normal[i + 2] = (1 / l * 0.5 + 0.5) * 255; normal[i + 3] = 255;
  }
  return { color, normal, size: TS };
}
