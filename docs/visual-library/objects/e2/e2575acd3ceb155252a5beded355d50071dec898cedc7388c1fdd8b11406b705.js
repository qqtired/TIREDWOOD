// Сводки по найденным моделям (данные уже сопоставлены в build.mjs).
import { state } from './lib.js';

export const models = () => state.data.models;
// несколько файлов на одну культуру (старое и новое имя): свежий — первым
export const cropModels = (id) => models().filter((m) => m.category === 'crop' && m.ref?.id === id).sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
export const cosmeticModel = (id) => models().find((m) => m.category === 'cosmetic' && m.ref?.id === id);
export const petModel = (id) => models().find((m) => m.category === 'pet' && m.ref?.id === id);
export const petModels = () => models().filter((m) => m.category === 'pet');

/** сколько стадий роста реально есть у культуры (узлы stageN внутри GLB или файлы по стадиям) */
export function cropStageCount(id) {
  const ms = cropModels(id);
  let n = 0;
  for (const m of ms) {
    const st = (m.variants || []).filter((v) => /^stage[-_ ]?\d+$/i.test(v.name)).length;
    n += st || 1;
  }
  return Math.min(n, 4);
}

/** сколько разных инструментов есть (грабли, лопатка, лейка, ведро): по именам файлов и узлов, один GLB может хранить все */
function toolFamilies(list) {
  const fam = new Set();
  for (const m of list) {
    for (const n of [m.name, ...(m.variants || []).map((v) => v.name)]) {
      const t = String(n).toLowerCase();
      if (/rake/.test(t)) fam.add('rake');
      if (/trowel|shovel/.test(t)) fam.add('shovel');
      if (/watering|(^|[_-])can([_-]|$)/.test(t)) fam.add('can');
      if (/bucket/.test(t)) fam.add('bucket');
    }
  }
  return fam.size || list.length;
}

export function readiness() {
  const d = state.data;
  const byCat = {};
  for (const m of d.models) (byCat[m.category] ||= []).push(m);
  const out = [];
  const exp = d.expected;
  const labels = d.meta.categoryLabels;
  const found = {
    crop: d.crops.reduce((a, c) => a + cropStageCount(c.id), 0),
    cosmetic: (byCat.cosmetic || []).length,
    pet: new Set((byCat.pet || []).map((m) => m.ref?.id || m.name)).size,
    npc: (byCat.npc || []).length,
    boss: (byCat.boss || []).length,
    tool: toolFamilies(byCat.tool || []),
    prop: (byCat.prop || []).length + (byCat.bed || []).length,
  };
  for (const k of ['crop', 'cosmetic', 'pet', 'npc', 'boss', 'tool', 'prop']) {
    if (!exp[k]) continue;
    out.push({ key: k, label: k === 'prop' ? 'Грядка, объекты, постройки' : labels[k], found: found[k], expected: exp[k].count, note: exp[k].note });
  }
  return out;
}

/** цвет по бюджету треугольников: ok / mid (меньше нижней границы) / bad (выше верхней) */
export function budgetClass(tris, budget) {
  if (!budget) return '';
  return tris > budget[1] ? 'bad' : tris >= budget[0] ? 'ok' : 'mid';
}
export const budgetOf = (category) => state.data.assets.budgets[category] || null;
