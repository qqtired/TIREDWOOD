// Prepare immutable-v1 derivatives; exports are run separately in the shared Blender slot.
import fs from 'node:fs';
import path from 'node:path';
const plaza='/Users/tired/Desktop/tired.solutions/concepts_blender/plaza3';
const base=path.join(plaza,'v2-2026-10-11-pack1');
const source=path.join(plaza,'pavilions/models/source');
const replace=(s,a,b)=>{if(!s.includes(a))throw Error(`Missing source marker: ${a.slice(0,90)}`);return s.replace(a,b);};
const copy=(a,b)=>{fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(a,b);};
fs.mkdirSync(base,{recursive:true});
fs.cpSync(path.join(plaza,'kit/scripts'),path.join(base,'_kit/scripts'),{recursive:true});
copy(path.join(plaza,'kit/glb/manifest.json'),path.join(base,'_kit/glb/manifest.json'));
function topic(name,files){
 const dir=path.join(base,name);fs.mkdirSync(path.join(dir,'renders'),{recursive:true});
 for(const file of files)copy(path.join(source,file),path.join(dir,'source',file));
 return dir;
}
const pbFiles=['pb_lib.py','pb_props.py'];
const fish=topic('fishshowcase',[...pbFiles,'pb_fishshowcase.py']);
const semyon=topic('semyon',[...pbFiles,'pb_semyon.py']);
const mole=topic('mole',[...pbFiles,'pb_mole.py']);
const cafe=topic('cafe-cards',['gq_common.py','gq_cafe.py','gq_cardveranda.py']);
for(const dir of [fish,semyon,mole]){
 const file=path.join(dir,'source/pb_lib.py');let s=fs.readFileSync(file,'utf8');
 s=replace(s,"KIT = os.path.join(PLAZA3, 'kit')","KIT = os.path.join(os.path.dirname(os.path.dirname(HERE)), '_kit')");
 fs.writeFileSync(file,s);
 copy(path.join(plaza,'pavilions/models/manifest-pb.json'),path.join(dir,'manifest-pb.json'));
}
let s=fs.readFileSync(path.join(cafe,'source/gq_common.py'),'utf8');
s=replace(s,"KIT = '/Users/tired/Desktop/tired.solutions/concepts_blender/plaza3/kit'","KIT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '_kit')");
s=replace(s,"MODELS = '/Users/tired/Desktop/tired.solutions/concepts_blender/plaza3/pavilions/models'","MODELS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))");
fs.writeFileSync(path.join(cafe,'source/gq_common.py'),s);
copy(path.join(plaza,'pavilions/models/manifest-gq.json'),path.join(cafe,'manifest-gq.json'));
// Vertical trophies share one envelope; keep the original counter footprint and materials.
const ff=path.join(fish,'source/pb_fishshowcase.py');s=fs.readFileSync(ff,'utf8');
s=replace(s,'CX, CZ = -12.6, 20.4','CX, CZ = -12.0, 20.15');
s=replace(s,'BY0, BY1, BZ0, BZ1 = -1.38, 0.08, 0.86, 1.15','BY0, BY1, BZ0, BZ1 = -1.38, 0.08, 1.35, 1.35');
s=replace(s,'P_TOP = 1.42','P_TOP = 1.55');
s=replace(s,'WX, WY0, WY1, WTOP = 3.3, 1.25, 1.40, 4.24','WX, WY0, WY1, WTOP = 3.3, 1.25, 1.40, 7.79');
s=replace(s,'AW_Z, AW_DROP, AW_W = 2.32, 0.36, 6.2','AW_Z, AW_DROP, AW_W = 4.65, 0.16, 6.2');
s=replace(s,'BOARD_W, BOARD_H, BOARD_Z0 = 3.6, 1.65, 2.49','BOARD_W, BOARD_H, BOARD_Z0 = 6.0, 2.75, 4.90');
s=replace(s,'CREST_Z0, CREST_Z1 = 4.31, 4.99','CREST_Z0, CREST_Z1 = 7.86, 8.64');
s=replace(s,'SIGN_W, SIGN_H = 5.2, 0.42','SIGN_W, SIGN_H = 5.8, 0.50');
// Stretch the main wooden counter, and lift only the pedestal parts (not the ground).
const ca=s.indexOf('def counter('),pa=s.indexOf('def pedestal('),ta=s.indexOf('def tags(');
let counter=s.slice(ca,pa);
counter=counter.replaceAll('0.78','1.18').replaceAll('0.93','1.40').replaceAll('1.21','1.40').replaceAll('0.885','1.355').replaceAll('0.915','1.385').replaceAll('0.7)','1.10)').replaceAll('0.7),','1.10),').replaceAll('0.7))','1.10))').replaceAll('(0.7,','(1.10,');
let pedestal=s.slice(pa,ta).replace(/\b(?:0\.84|0\.98|1\.3|1\.36|1\.44|0\.99|1\.02|1\.255|1\.285|1\.14)\b/g,v=>({'0.84':'1.25','0.98':'1.32','1.3':'1.46','1.36':'1.52','1.44':'1.60','0.99':'1.33','1.02':'1.36','1.255':'1.41','1.285':'1.44','1.14':'1.37'}[v]));
s=s.slice(0,ca)+counter+pedestal+s.slice(ta);
s=replace(s,"((1, 0.0, 0.8, 0.3, 'brass'), (2, -FX, 0.56, 0.26, 'brass_dark'), (3, FX, 0.56, 0.26, 'brass_dark'))","((1, 0.0, 1.35, 0.50, 'brass'), (2, -FX, 1.35, 0.50, 'brass_dark'), (3, FX, 1.35, 0.50, 'brass_dark'))");
s=replace(s,'zc = 0.7','zc = 1.05');s=replace(s,'y0 = YF - 0.085','y0 = -1.60');
s=s.replaceAll('0.955','1.335').replaceAll('0.965','1.345').replaceAll('0.94)','1.32)');
const ps=s.indexOf('def places('),pe=s.indexOf('# ------------------------------------------------------------------ задняя',ps);
s=s.slice(0,ps)+`def places(pv):
    """Head-up catches with the same absolute-weight scale and envelope for every rank."""
    for k, x in ((1, 0.0), (2, -FX), (3, FX)):
        if k > 1:
            box(pv.mb,(x-0.24,-0.96,1.35),(x+0.24,-0.43,1.55),'steel',bev=0.01)
        pv.anchor(f'fish_{k}', x, -0.70, 1.55,
                  extras={'rank': k, 'pose': 'upright', 'len': 3.3, 'head': [1, 0, 0], 'max_h': 2.45,
                          'max_w': 1.55, 'tag': f'anchor_tag_{k}', 'note': 'tail down, head up; uniform scale from absolute mass'})


`+s.slice(pe);
// The enlarged field uses the whole width; preserve the two coral fish below it.
s=s.replaceAll('3.33','3.02');
s=replace(s,'xb = 2.75','xb = 3.05');
s=replace(s,'(XC + 0.05, YB + 0.05, 1.45)','(XC + 0.05, YB + 0.05, 1.60)');
s=replace(s,'    scale_hanging(pv)','    # The original scale stays reachable despite the higher awning.\n    with pv.mb.at(z=-2.33):\n        scale_hanging(pv)');
const notesAt=s.indexOf('    pv.notes += [',s.indexOf('def build():'));
s=s.slice(0,notesAt)+"    pv.notes = ['PACK1 v2: 6x2.75m board at4.90..7.65; canopy rear4.65; roof8.69; all trophies bottom1.55 maxH2.45 maxW1.55; footprint unchanged.']\n    return pv\n";
fs.writeFileSync(ff,s);
// Split planks around the transom: no coincident glass or wooden back faces.
const sf=path.join(semyon,'source/pb_lib.py');s=fs.readFileSync(sf,'utf8');
s=replace(s,"    n = 5\n    for i in range(n):\n        a, b = xa + dw * i / n + 0.006, xa + dw * (i + 1) / n - 0.006\n        box(mb, (a, y, 0.02), (b, y + 0.05, dh), sw, drop=('back',))\n    zw = dh * 0.62",`    n = 5
    zw = dh * 0.62
    wx0, wx1 = cx - 0.2, cx + 0.2
    for i in range(n):
        a, b = xa + dw * i / n + 0.006, xa + dw * (i + 1) / n - 0.006
        if not window or b <= wx0 or a >= wx1:
            box(mb, (a, y, 0.02), (b, y + 0.05, dh), sw, drop=('back',))
        else:
            box(mb, (a, y, 0.02), (b, y + 0.05, zw), sw, drop=('back',))
            box(mb, (a, y, zw + 0.36), (b, y + 0.05, dh), sw, drop=('back',))
            if a < wx0:
                box(mb, (a, y, zw), (wx0, y + 0.05, zw + 0.36), sw, drop=('back',))
            if b > wx1:
                box(mb, (wx1, y, zw), (b, y + 0.05, zw + 0.36), sw, drop=('back',))`);
s=replace(s,"box(mb, (wx0, y - 0.005, zw), (wx1, y + 0.01, zw + 0.36), 'glass_dark', drop=('back',))","box(mb, (wx0 + 0.004, y + 0.022, zw + 0.004), (wx1 - 0.004, y + 0.028, zw + 0.356), 'glass_dark', drop=('back',))");
const wa=s.indexOf('    if window:\n',s.indexOf('def plank_door')),wb=s.indexOf('    for z in (0.3,',wa);
let win=s.slice(wa,wb).replaceAll('y - 0.03','y - 0.055').replaceAll('y - 0.02','y - 0.055').replaceAll(', y,',', y - 0.025,');
s=s.slice(0,wa)+win+s.slice(wb);fs.writeFileSync(sf,s);
// 3D local symbols become part of the existing static material batches.
const cf=path.join(cafe,'source/gq_cafe.py');s=fs.readFileSync(cf,'utf8');
s=replace(s,"    with mb.at(3.0, 0.0, 4.6 - 0.4):\n        P.sign_plate(mb, 2.8, 0.8)",`    # Cream stone seagull relief, 2.5cm clear of the wall, no rectangular sign.
    with mb.at(3.0, 0.0, 4.6):
        wing = [(-0.90,0.33),(-0.52,0.19),(-0.15,0.04),(0.0,0.09),(0.15,0.04),(0.52,0.19),(0.90,0.33),(0.72,-0.02),(0.33,-0.20),(0.10,-0.12),(0.04,-0.42),(-0.05,-0.45),(-0.13,-0.13),(-0.35,-0.20),(-0.72,-0.02)]
        prism(mb, wing, -0.145, -0.025, 'stone_light', axis='y')
        icosphere(mb, 0.105, 'stone_light', c=(0.045,-0.095,0.14), sub=1, scale=(1.0,0.6,1.0))
        prism(mb, [(0.095,0.16),(0.26,0.105),(0.10,0.095)], -0.135, -0.07, 'stone_light', axis='y')
        face_anchor(mb, 'seagull', (0,-0.025,0), 0.90,0.425)`);
s=replace(s,"    if '--no-render' in ARGS:\n        return","    if '--no-render' in ARGS:\n        bpy.ops.wm.save_as_mainfile(filepath=f'{SRC}/gq_pav_cafe.blend', compress=True)\n        return");fs.writeFileSync(cf,s);
const vf=path.join(cafe,'source/gq_cardveranda.py');s=fs.readFileSync(vf,'utf8');s=replace(s,'ZB = 2.55','ZB = 3.53');s=replace(s,'ZT = 2.8','ZT = 3.78');
const sa=s.indexOf('def sign('),sb=s.indexOf('def places(',sa);
s=s.slice(0,sa)+`def sign():
    # Local west-facing wooden medallion; follows the pavilion placement.
    x, y = W(XW - 0.24, 0.8)
    with mb.at(x,y,3.30,rz=pav.rz_world(-1,0)):
        with mb.at(rx=90):
            lathe(mb, [(0,0),(0.495,0),(0.525,0.02),(0.525,0.08),(0.495,0.10),(0,0.10)],32,'wood_honey',smooth=False)
        for dx in (-0.33,0.33):
            tube(mb,[(dx,0,0.40),(dx,0,ZB-3.30)],0.012,4,IRON)
        for i, (ang, sw, emblem) in enumerate(((-18,'enamel_cream','heart'),(0,'enamel_cream','spade'),(18,'enamel_cream','heart'))):
            with mb.at(0,-0.125-i*0.060,-0.29,ry=ang):
                prism(mb,[(-0.26,0),(0.26,0),(0.26,0.72),(-0.26,0.72)],-0.025,0,sw,axis='y')
                poly=([(-0.12,0.43),(-0.14,0.53),(-0.09,0.60),(0,0.54),(0.09,0.60),(0.14,0.53),(0.12,0.43),(0,0.32)] if emblem=='heart' else [(0,0.62),(-0.13,0.47),(-0.10,0.38),(-0.02,0.40),(-0.05,0.30),(0.05,0.30),(0.02,0.40),(0.10,0.38),(0.13,0.47)])
                prism(mb,poly,-0.049,-0.035,'fab_red' if emblem=='heart' else 'enamel_ink',axis='y')
        face_anchor(mb,'cards_medallion',(0,-0.10,0),0.525,0.525)


`+s.slice(sb);
s=replace(s,"    if '--no-render' in ARGS:\n        return","    if '--no-render' in ARGS:\n        bpy.ops.wm.save_as_mainfile(filepath=f'{SRC}/gq_pav_cardveranda.blend', compress=True)\n        return");
s=replace(s,"'height_m': 3.2","'height_m': 3.8");fs.writeFileSync(vf,s);
// A continuous sloping joint, preserving the rest of the mole and fishing anchors.
const mf=path.join(mole,'source/pb_mole.py');s=fs.readFileSync(mf,'utf8');
s=replace(s,"    wbox(pv, -24.6, 43.5, -24.02, 46.0, -0.64, -0.25, 'stone_step', bev=0.03, exposed=('w', 'top', 'n', 's'), drop=('bottom', 'e'))","    # PACK1: the transverse threshold is removed; ramp is built below.");
s=replace(s,"    wbox(pv, px + 0.05, pz - 0.56, px + 0.11, pz + 0.56, 1.66, 2.14, 'pb_turq_dk', bev=0.012)","    wbox(pv, px + 0.05, pz - 0.76, px + 0.11, pz + 0.76, 1.34, 2.26, 'pb_turq_dk', bev=0.012)");
s=replace(s,"    wbox(pv, px + 0.11, pz - 0.5, px + 0.126, pz + 0.5, 1.72, 2.08, 'enamel_cream', drop=('w',))","    wbox(pv, px + 0.11, pz - 0.7, px + 0.126, pz + 0.7, 1.40, 2.20, 'enamel_cream', drop=('w',))");
s=replace(s,"pv.sign_w('udalaya', px + 0.136, pz, 1.9, 1.0, 0.36","pv.sign_w('udalaya', px + 0.151, pz, 1.8, 1.4, 0.80");
s=replace(s,"    pv.col_w('mole', -62.0, 43.5, -24.0, 46.5, -2.0, TOP)","    pv.col_w('mole', -62.0, 43.5, -28.0, 46.5, -2.0, TOP)\n    for i in range(5):\n        x0=-28.0+i*0.4\n        pv.col_w(f'ramp_{i}',x0,43.5,x0+0.4,46.5,-2.0,-0.4+i*0.1)\n    pv.col_w('landing',-26.0,43.5,-24.0,46.5,-2.0,0.0)");
s=replace(s,"    pv.col_w('step', -24.6, 43.5, -24.0, 46.0, TOP, -0.25)","");
s=replace(s,"-65.32, 45.68, -65.12, 46.82","-65.32, 45.48, -65.10, 47.02");
s=replace(s,"    run(pv, rng, 'x', 43.5, -62.0, -24.0, -1, ext=(0.0, 0.0))","    for a,b in ((-62.0,-28.0),(-28.0,-26.0),(-26.0,-24.0)):\n        run(pv, rng, 'x', 43.5, a, b, -1, ext=(0.0, 0.0))");
s=replace(s,"    run(pv, rng, 'x', 46.5, -62.0, -24.0, 1, ext=(0.0, 0.0))","    for a,b in ((-62.0,-28.0),(-28.0,-26.0),(-26.0,-24.0)):\n        run(pv, rng, 'x', 46.5, a, b, 1, ext=(0.0, 0.0))");
s=replace(s,"    slabs(pv, rng, -62.0, -24.6, 43.88, 46.12, 2, 1.17)","    for a,b in ((-62.0,-28.0),(-28.0,-26.0),(-26.0,-24.38)):\n        slabs(pv,rng,a,b,43.88,46.12,2,1.17)");
// Slice the original top slab cells at -28/-26 first, then slope every near-joint vertex.
// No fishing spot lies in this range. Only the -27 bollard follows the ramp.
s=replace(s,"    places_and_cols(pv)\n",`    places_and_cols(pv)
    deform_joint(pv)
`);
const ba=s.indexOf('def build(');
s=s.slice(0,ba)+`def deform_joint(pv):
    """Map the existing joint to the agreed ramp, leaving the submerged base fixed."""
    def lift(wx):
        return max(0.0,min(0.5,(wx+28.0)*0.25))
    for i, v in enumerate(pv.mb.V):
        wx,wz=pv.w(v[0],v[1])
        if wx > -28.00001 and 43.37 <= wz <=46.63:
            h=max(0.0,min(1.0,(v[2]+2.0)/1.5))
            pv.mb.V[i]=(v[0],v[1],v[2]+lift(wx)*h)
    for name, matrix in pv.mb.anchors:
        if name.startswith('prop__pb_bollard'):
            wx,wz=pv.w(matrix.translation.x,matrix.translation.y)
            matrix.translation.z+=lift(wx)
    for i,v in enumerate(pv.props.V):
        wx,wz=pv.w(v[0],v[1])
        if -28 <= wx <= -26 and 43.3 <= wz <=43.9:
            pv.props.V[i]=(v[0],v[1],v[2]+lift(wx))
    for item in pv.mb.A:
        pass


`+s.slice(ba);
// MB anchor storage is adjusted in Blender after finalize; remove unsupported placeholder here.
s=replace(s,'    for item in pv.mb.A:\n        pass\n','');
fs.writeFileSync(mf,s);
const entry=`import bpy,sys,os,importlib,runpy
base=os.path.dirname(os.path.abspath(__file__))
want=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
for topic,module in [('fishshowcase','pb_fishshowcase'),('semyon','pb_semyon'),('mole','pb_mole'),('cafe-cards','gq_cafe'),('cafe-cards','gq_cardveranda')]:
    if want and module not in want: continue
    src=os.path.join(base,topic,'source')
    sys.path.insert(0,src)
    for n in list(sys.modules):
        if n.startswith(('pb_','gq_')) or n in ('kitlib','pieces','stage'): del sys.modules[n]
    if module.startswith('pb_'):
        for ob in list(bpy.data.objects): bpy.data.objects.remove(ob,do_unlink=True)
        m=importlib.import_module(module)
        pv=m.build()
        so,lives,pr,info=pv.export(ao_kw=getattr(m,'AO',None))
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(base,topic,pv.id+'.blend'),compress=True)
    else:
        sys.argv=['blender','--','--no-render']
        runpy.run_path(os.path.join(src,module+'.py'),run_name='__main__')
    sys.path.remove(src)
print('PACK1 EXPORT DONE',flush=True)
`;
fs.writeFileSync(path.join(base,'build.py'),entry);
console.log(`Prepared ${base}`);
