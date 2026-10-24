// Wątek, który liczy tekstury dzianiny i geometrię słuchawek (razem kilkaset milisekund, na telefonie ponad sekundę),
// żeby strona w tym czasie przewijała się płynnie. Wynik to bufory przekazywane bez kopiowania.
import { haloGeometry, centerHalo, packHalo } from './halo-model.js';
import { knitData } from './knit.js';

const MAT = ['ceramic', 'metal', 'lip', 'polish', 'pivot', 'cushion', 'band', 'inner'];
onmessage = ({ data: { height } }) => {
  const knit = knitData();
  const model = haloGeometry(Object.fromEntries(MAT.map((k) => [k, { name: k }])));
  centerHalo(model.halo, height);
  const { msg, buffers } = packHalo(model);
  postMessage({ knit, model: msg }, [knit.color.buffer, knit.normal.buffer, ...buffers]);
};
