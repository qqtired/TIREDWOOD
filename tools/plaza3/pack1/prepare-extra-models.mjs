import fs from 'node:fs';import path from 'node:path';
const plaza='/Users/tired/Desktop/tired.solutions/concepts_blender/plaza3',base=path.join(plaza,'v2-2026-10-11-pack1'),src=path.join(plaza,'pavilions/models/source');
const repl=(s,a,b)=>{if(!s.includes(a))throw Error(`Missing ${a.slice(0,80)}`);return s.replace(a,b);};
function topic(id,files){const dir=path.join(base,id);fs.mkdirSync(path.join(dir,'source'),{recursive:true});fs.mkdirSync(path.join(dir,'renders'),{recursive:true});for(const f of files)fs.copyFileSync(path.join(src,f),path.join(dir,'source',f));return dir;}
for(const [id,module] of [['sunset','pb_sunset'],['lighthouse-arch','pb_arch']]){
 const dir=topic(id,['pb_lib.py','pb_props.py',module+'.py']);let lib=fs.readFileSync(path.join(dir,'source/pb_lib.py'),'utf8');lib=repl(lib,"KIT = os.path.join(PLAZA3, 'kit')","KIT = os.path.join(os.path.dirname(os.path.dirname(HERE)), '_kit')");fs.writeFileSync(path.join(dir,'source/pb_lib.py'),lib);fs.copyFileSync(path.join(plaza,'pavilions/models/manifest-pb.json'),path.join(dir,'manifest-pb.json'));
 let s=fs.readFileSync(path.join(dir,'source',module+'.py'),'utf8');
 if(id==='sunset'){
  const a=s.indexOf('        # табличка «ЗАКАТ»'),b=s.indexOf('    # колонны набора',a);s=s.slice(0,a)+'        # PACK1: no plaque or plaque bracket above the entry.\n'+s.slice(b);
  const aa=s.indexOf('    xe_w, ze_w = wpt(ae,'),bb=s.indexOf('    # скамьи между колоннами',aa);s=s.slice(0,aa)+s.slice(bb);
  s=s.replaceAll('for a in (105, 165):','for a in (135,):');
  const marker='\n\ndef around(pv):';s=repl(s,marker,`\n    # Seats appended after all existing seat IDs; fixed to the single bench's local pose.\n    bx,bz=wpt(135,1.22,BX,BZ)\n    dx,dz=math.cos(math.radians(135)),math.sin(math.radians(135))\n    for seat,side in ((24,-1),(25,1)):\n        pv.point_w(f'seat_{seat}',bx-side*0.42*dz,bz+side*0.42*dx,0.0,face=(dx,dz),\n                   extras={'seat_id':seat,'floor_y':0.09,'seat_y':0.555,'note':'one two-seat bench facing the sea; local mount, ground-y kept by runtime'})\n${marker}`);
 } else {const a=s.indexOf('    # вывеска на двух крюках'),b=s.indexOf('    # резная коралловая рыба',a);s=s.slice(0,a)+'    # PACK1: title board and its hooks removed, carved fish retained.\n'+s.slice(b);}
 const na=s.indexOf('    pv.notes += [',s.indexOf('def build():'));
 if(na>=0)s=s.slice(0,na)+`    pv.notes=['PACK1 v2: ${id}; removed title plaques, preserved structural/model anchors; sunset has one sea-facing bench and seats24/25.']\n    return pv\n`;
 fs.writeFileSync(path.join(dir,'source',module+'.py'),s);
}
for(const [id,module] of [['rotunda','gq_rotunda'],['honor','gq_honor'],['online','gq_online'],['kursaal','gq_kursaal']]){
 const dir=topic(id,['gq_common.py',module+'.py']);let lib=fs.readFileSync(path.join(dir,'source/gq_common.py'),'utf8');lib=repl(lib,"KIT = '/Users/tired/Desktop/tired.solutions/concepts_blender/plaza3/kit'","KIT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '_kit')");lib=repl(lib,"MODELS = '/Users/tired/Desktop/tired.solutions/concepts_blender/plaza3/pavilions/models'","MODELS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))");fs.writeFileSync(path.join(dir,'source/gq_common.py'),lib);fs.copyFileSync(path.join(plaza,'pavilions/models/manifest-gq.json'),path.join(dir,'manifest-gq.json'));
 let s=fs.readFileSync(path.join(dir,'source',module+'.py'),'utf8');
 if(id==='rotunda'){const a=s.indexOf('def sign():'),b=s.indexOf('def inside():',a);s=s.slice(0,a)+'def sign():\n    # PACK1: sign plate and both supports removed.\n    pass\n\n\n'+s.slice(b);}
 if(id==='honor'){
  s=repl(s,"        scroll(mb, (sx * (PX - 0.06), 0.03, 4.3), (sx * (HW / 2 + 0.18), 0.03, 4.72), curl=0.08)",'');
  const a=s.indexOf('def header():'),b=s.indexOf('def main():',a);s=s.slice(0,a)+`def header():\n    # Cup and laurels sit directly on the existing canopy crossbar.\n    top=CZ+BH/2+0.10\n    cup(mb,0.0,0.03,top,s=0.85)\n    for sx in (-1,1):\n        laurel(mb,sx*0.14,0.03,top+0.02,sx,L=0.5)\n\n\n`+s.slice(b);
 }
 if(id==='kursaal'){
  s=repl(s,"    bx, by = pav.b(57.0, 1.25)","    bx, by = (4.2,1.0)");
  s=repl(s,"with mb.at(bx, by, 3.5, rz=pav.rz_world(0, 1)):","with mb.at(bx, by, 3.5, rz=0):");
  s=repl(s,"        mb.anchor('jackpot_face', (0, 0, 0), (3.2, 1.0, 0.65))",`        # Real cream/brass frame at the local field, without another text-sign anchor.
        box(mb,(-3.2,-0.035,-0.75),(3.2,0.06,-0.65),'enamel_cream',bev=0.008,drop=('back',))
        box(mb,(-3.2,-0.035,0.65),(3.2,0.06,0.75),'enamel_cream',bev=0.008,drop=('back',))
        for sx in (-1,1):
            a,b=sorted((sx*3.2,sx*3.3))
            box(mb,(a,-0.035,-0.75),(b,0.06,0.75),'enamel_cream',bev=0.008,drop=('back',))
        box(mb,(-3.2,0.035,-0.65),(3.2,0.075,0.65),'shutter_dark',drop=('back',))
        mb.anchor('jackpot_face',(0,0,0),(3.2,1.0,0.65))`);
  s=repl(s,"JackpotBoard: лицом на юг, в зал","PACK1 local field(4.2,3.5,1.0), west-facing afterrootyawPI/2; world(62,3.5,-3.2)");
 }
 if(id==='online'){
  s=repl(s,'FW, FH, FZ = 3.0, 2.0, 1.9','FW, FH, FZ = 3.0, 2.42, 2.11');
  s=repl(s,"FW, FH, (1024, 683), 'online'","FW, FH, (1024, 826), 'online'");
  const a=s.indexOf('    # фризовая вывеска'),b=s.indexOf('    # спина:',a);s=s.slice(0,a)+'    # PACK1: former title frieze reused by the taller live-list field.\n'+s.slice(b);
 }
 const na=s.indexOf('    pav.notes += [',s.indexOf('def main():')),nb=s.indexOf('    so, lives, pr, pv, st = pav.export',na);
 if(na>=0&&nb>na)s=s.slice(0,na)+`    pav.notes=['PACK1 v2: ${id}; title frame removed; cup/list or rest of pavilion preserved.']\n`+s.slice(nb);
 s=repl(s,"    if '--no-render' in ARGS:\n        return",`    if '--no-render' in ARGS:\n        bpy.ops.wm.save_as_mainfile(filepath=f'{SRC}/gq_pav_${id}.blend',compress=True)\n        return`);fs.writeFileSync(path.join(dir,'source',module+'.py'),s);
}
{
 const dir=topic('farm-arch',['pavlib.py','props.py','pav_farm_arch.py']);let lib=fs.readFileSync(path.join(dir,'source/pavlib.py'),'utf8');lib=repl(lib,"KIT = os.path.join(PLAZA3, 'kit')","KIT = os.path.join(os.path.dirname(os.path.dirname(HERE)), '_kit')");fs.writeFileSync(path.join(dir,'source/pavlib.py'),lib);fs.copyFileSync(path.join(plaza,'pavilions/models/manifest.json'),path.join(dir,'manifest.json'));
 let s=fs.readFileSync(path.join(dir,'source/pav_farm_arch.py'),'utf8');const a=s.indexOf('    # доска-вывеска на двух цепях'),b=s.indexOf('    # фонари на внешних',a);s=s.slice(0,a)+'    # PACK1: garden title board, chains and anchor removed.\n'+s.slice(b);s=s.replace(", 'sign_face_center_y': SIGN_ZC",'');
 s=repl(s,"    if '--no-render' in ARGS:\n        return","    if '--no-render' in ARGS:\n        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE,'pav_farm_arch.blend'),compress=True)\n        return");fs.writeFileSync(path.join(dir,'source/pav_farm_arch.py'),s);
}
const entries=[['sunset','pb_sunset'],['lighthouse-arch','pb_arch'],['rotunda','gq_rotunda'],['honor','gq_honor'],['online','gq_online'],['farm-arch','pav_farm_arch'],['kursaal','gq_kursaal']];
fs.writeFileSync(path.join(base,'build-extra.py'),`import bpy,sys,os,importlib,runpy\nbase=os.path.dirname(os.path.abspath(__file__))\nwant=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []\nfor topic,module in ${JSON.stringify(entries)}:\n    if want and module not in want: continue\n    src=os.path.join(base,topic,'source')\n    sys.path.insert(0,src)\n    for n in list(sys.modules):\n        if n.startswith(('pb_','gq_','pav_')) or n in ('pavlib','props','kitlib','pieces','stage'): del sys.modules[n]\n    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob,do_unlink=True)\n    if module.startswith('pb_'):\n        m=importlib.import_module(module);pv=m.build();so,lives,pr,info=pv.export(ao_kw=getattr(m,'AO',None));bpy.ops.wm.save_as_mainfile(filepath=os.path.join(base,topic,pv.id+'.blend'),compress=True)\n    else:\n        sys.argv=['blender','--','--no-render'];runpy.run_path(os.path.join(src,module+'.py'),run_name='__main__')\n    sys.path.remove(src)\nprint('PACK1 EXTRA EXPORT DONE',flush=True)\n`);
console.log(base+'/build-extra.py');
