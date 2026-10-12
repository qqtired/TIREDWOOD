// Подготовка отдельной версии курзала. Исходники PACK1 остаются неизменными.
// Экспортировать только этот source/gq_kursaal.py в согласованном слоте Blender с -- --no-render.
import fs from 'node:fs';
import path from 'node:path';
const plaza = '/Users/tired/Desktop/tired.solutions/concepts_blender/plaza3';
const before = path.join(plaza, 'v2-2026-10-11-pack1/kursaal');
const out = path.join(plaza, 'v3-2026-10-12-review3/kursaal');
fs.mkdirSync(path.join(out, 'source'), { recursive: true });
fs.mkdirSync(path.join(out, 'renders'), { recursive: true });
let common = fs.readFileSync(path.join(before, 'source/gq_common.py'), 'utf8');
common = common.replace("KIT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '_kit')", `KIT = ${JSON.stringify(path.join(plaza, 'v2-2026-10-11-pack1/_kit'))}`);
fs.writeFileSync(path.join(out, 'source/gq_common.py'), common);
fs.copyFileSync(path.join(before, 'manifest-gq.json'), path.join(out, 'manifest-gq.json'));
let source = fs.readFileSync(path.join(before, 'source/gq_kursaal.py'), 'utf8');
source = source.replace('    bx, by = (4.2,1.0)', '    bx, by = pav.b(57.0, 1.25)');
source = source.replace('with mb.at(bx, by, 3.5, rz=0):', 'with mb.at(bx, by, 3.5, rz=pav.rz_world(0, 1)):');
source = source.replace('PACK1 local field(4.2,3.5,1.0), west-facing afterrootyawPI/2; world(62,3.5,-3.2)', 'REVIEW3: field above original slot row; plane +Z faces into room; casino.mjs applies pavilion root');
const lining = `
# REVIEW3: continuous plaster and painted dado on inward wall faces only.
# No baked noisy AO, texture image, new shader, exterior change or closed doorway.
# The separate exported node is static at runtime and merged into the existing matte batch.
gq_common._add_sw('kursaal_dado', '#6D8B79', '#668271', 'p3_matte')
gq_common._add_sw('kursaal_plinth', '#4B6658', '#455D51', 'p3_matte')

def interior_finish(lmb):
    def run(a, b, normal):
        for z0,z1,sw in ((0.035,0.14,'kursaal_plinth'),(0.14,1.12,'kursaal_dado'),
                         (1.12,1.18,'stone_light'),(1.18,5.32,'plaster_cream')):
            bm=new_bm()
            vs=[bm.verts.new((a[0],a[1],z0)),bm.verts.new((b[0],b[1],z0)),
                bm.verts.new((b[0],b[1],z1)),bm.verts.new((a[0],a[1],z1))]
            oriented_face(bm,vs,normal)
            lmb.add_bm(bm,sw)
            bm.free()
    gap=0.018
    x0=TC[0]+math.sqrt(TR**2-(GW-TC[1])**2)-0.1
    # Gallery wall, with its north entry left open.
    for a,b in ((x0,6.5),(8.5,HX-0.4)):
        run((a,GW+0.4+gap),(b,GW+0.4+gap),(0,1,0))
    # East end carries the live leaderboard.
    run((HX-0.4-gap,GW+0.4),(HX-0.4-gap,BY-0.4),(-1,0,0))
    # Side entry and rear entry remain the exact original width.
    for a,b in ((TC[1]+0.9,0.1),(2.1,BY-0.4)):
        run((-HX+0.4+gap,a),(-HX+0.4+gap,b),(1,0,0))
    for a,b in ((-HX+0.4,3.5),(5.5,HX-0.4)):
        run((a,BY-0.4-gap),(b,BY-0.4-gap),(0,-1,0))

`;
source = source.replace('\ndef main():', lining + '\ndef main():');
source = source.replace('    ew = places()', "    ew = places()\n    pav.live('interior_finish',interior_finish,(0,0,0))");
source = source.replace("pav.notes=['PACK1 v2: kursaal; title frame removed; cup/list or rest of pavilion preserved.']", "pav.notes=['REVIEW3: original slots/arcade anchors; jackpot on slot wall; quiet cream plaster and green dado on inward faces; all entries and exterior preserved.']");
fs.writeFileSync(path.join(out, 'source/gq_kursaal.py'), source);
fs.writeFileSync(path.join(out, 'README.md'), '# Курзал REVIEW3\n\nПроизводная от сохранённого PACK1, v1/v2 не меняются. Внутренние стены: ровная кремовая штукатурка и зелёные панели, без изображений и дополнительного материала. Геометрия фасада и проёмов прежняя. Jackpot перенесён на стену над исходным рядом слотов.\n\nГенератор: tools/plaza3/review3/prepare-kursaal.mjs. Экспорт только source/gq_kursaal.py через Blender -b --factory-startup --python-exit-code 1 --python <source> -- --no-render. Затем GLB копируется в client/assets/plaza3/pav_kursaal_v3.glb, игровые точки обновляет tools/plaza3/casino.mjs.\n');
console.log(path.join(out, 'source/gq_kursaal.py'));
