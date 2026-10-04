// Разбивка треугольников пиратов по частям (node tools/pirate-lab/budget-parts.ts) — только для разработки
import { PIRATE_DEFS } from '../../client/lobby/piratejelly.ts';
const tris = (g: { index: { count: number } | null; getAttribute(n: string): { count: number } }): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
for (const d of PIRATE_DEFS) {
  const parts = d.parts.map((p) => `${p.bone}:${Math.round(tris(p.geo))}`);
  console.log(d.id, Math.round(d.parts.reduce((s, p) => s + tris(p.geo), 0)), parts.join(' '));
}
