"""Product-lab geometry: authored parts with GLB-metre coordinates.
Backend utility copied from our fortress generator, whose originals stay frozen.
New geometry uses the plaza cream/coral/mint/walnut palette and vertex colours.
Only invoke from a granted headless MCP model window; never launches Blender.
"""
import bpy, math, json, os, struct, hashlib
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi
BASE=Path('/Users/tired/Desktop/tired.solutions/reports/tiredwood-product-lab-v2-2026-10-12')
WORKSPACE=BASE.parent.parent
def linear(code):
 raw=tuple(int(code.lstrip('#')[i:i+2],16)/255 for i in [0,2,4])
 return tuple(c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4 for c in raw)
COL={k:linear(v) for k,v in {'cream':'#F7F1E5','coral':'#CF6659','mint':'#76B8A3','walnut':'#85562F','wood':'#A97743','woodhi':'#C59458','metal':'#494C43','copper':'#B9904B','glass':'#549FA2','sand':'#D5B37B','sandwet':'#B69563','stone':'#CDBDA2','water':'#479CA9','jam':'#A84763','red':'#C5493D','white':'#FFF8DF','dark':'#2B2927','charcoal':'#2B2927','eye':'#A1D8C8','light':'#FFF8DF','olive':'#3F7C5B','fur':'#A97743','leaf':'#3F7C5B','terracotta':'#C9643B'}.items()}
MATS=[]
def materials():
 global MATS
 MATS=[]
 for name,rough,emit in [('lab_matte',.84,0),('lab_wood',.69,0),('lab_gloss',.35,0),('lab_jam',.20,0),('lab_flame',.45,.45)]:
  m=bpy.data.materials.new(name);m.use_nodes=True;m.use_backface_culling=False
  p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(1,1,1,1);p.inputs['Roughness'].default_value=rough
  vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Color';m.node_tree.links.new(vc.outputs['Color'],p.inputs['Base Color'])
  if emit:m.node_tree.links.new(vc.outputs['Color'],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=emit
  MATS.append(m)

class BackendGeo:
 def __init__(self,name,pivot=(0,0,0),parent=None):
  self.name=name; self.pivot=Vector(pivot); self.verts=[]; self.faces=[]; self.colors=[]; self.slots=[]; self.smooth=[]
  self.ctrl=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(self.ctrl); self.ctrl.location=pivot; self.ctrl.parent=parent
  self.ctrl.empty_display_size=.08
 def add(self,v,f,color='fur',mat=0,smooth=True,variation=.055):
  offset=len(self.verts); self.verts.extend([tuple(Vector(p)-self.pivot) for p in v]); self.faces.extend([tuple(offset+i for i in p) for p in f])
  c=COL[color] if isinstance(color,str) else color
  for idx in range(len(f)):
   shade=1+variation*sin((idx+offset)*1.741)
   self.colors.append(tuple(max(0,min(1,a*shade)) for a in c)+(1,)); self.slots.append(mat); self.smooth.append(smooth)
 def blob(self,c,s,color='fur',mat=0,n=12,m=8,deform=0):
  v=[(c[0],c[1],c[2]-s[2])]; f=[]
  for j in range(1,m):
   t=-pi/2+pi*j/m
   for k in range(n):
    a=2*pi*k/n; r=cos(t)*(1+deform*sin(a*3+t*2))
    v.append((c[0]+s[0]*r*cos(a),c[1]+s[1]*r*sin(a),c[2]+s[2]*sin(t)))
  v.append((c[0],c[1],c[2]+s[2])); top=len(v)-1
  for k in range(n): f.append((0,1+(k+1)%n,1+k))
  for j in range(m-2):
   for k in range(n):
    a=1+j*n+k;b=1+j*n+(k+1)%n;d=1+(j+1)*n+k;e=1+(j+1)*n+(k+1)%n
    f.append((a,b,e,d))
  for k in range(n): f.append((top,1+(m-2)*n+k,1+(m-2)*n+(k+1)%n))
  self.add(v,f,color,mat)
 def profile(self,c,profile,color='fur',mat=0,n=16,ell=.8,waves=0):
  v=[];f=[]
  for j,(z,r) in enumerate(profile):
   for k in range(n):
    a=2*pi*k/n; rr=r*(1+waves*sin(8*a+j*.2)); v.append((c[0]+rr*cos(a),c[1]+ell*rr*sin(a),c[2]+z))
  for j in range(len(profile)-1):
   for k in range(n): a=j*n+k;b=j*n+(k+1)%n;f.append((a,b,b+n,a+n))
  f.extend([tuple(reversed(range(n))),tuple((len(profile)-1)*n+k for k in range(n))]); self.add(v,f,color,mat);self.smooth[-2:]=[False,False]
 def tube(self,pts,rads,color='fur',mat=0,n=8,closed=True):
  v=[];f=[];pts=[Vector(x) for x in pts];previous_u=None
  if isinstance(rads,(int,float)): rads=[rads]*len(pts)
  for j,p in enumerate(pts):
   t=(pts[min(j+1,len(pts)-1)]-pts[max(0,j-1)]).normalized()
   u=previous_u-t*previous_u.dot(t) if previous_u is not None else t.cross(Vector((0,0,1)))
   if u.length<.01:u=t.cross(Vector((0,1,0)))
   u.normalize();previous_u=u.copy();w=t.cross(u).normalized()
   for k in range(n):v.append(tuple(p+rads[j]*(cos(2*pi*k/n)*u+sin(2*pi*k/n)*w)))
  for j in range(len(pts)-1):
   for k in range(n):a=j*n+k;b=j*n+(k+1)%n;f.append((a,b,b+n,a+n))
  if closed:f.extend([tuple(reversed(range(n))),tuple((len(pts)-1)*n+k for k in range(n))])
  self.add(v,f,color,mat)
 def beam(self,a,b,width,depth=None,color='wood',mat=1):
  depth=depth or width; a=Vector(a);b=Vector(b);t=(b-a).normalized();u=t.cross(Vector((0,1,0)))
  if u.length<.1:u=t.cross(Vector((1,0,0)))
  u.normalize();w=t.cross(u).normalized();v=[]
  for p in [a,b]:
   for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]:v.append(tuple(p+u*x*width/2+w*y*depth/2))
  self.add(v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],color,mat,False)
 def board(self,c,s,color='wood',mat=1):
  self.beam((c[0],c[1],c[2]-s[2]/2),(c[0],c[1],c[2]+s[2]/2),s[0],s[1],color,mat)
 def ring(self,c,r,minor,color='metal',mat=2,axis='y',n=16,k=4,start=0,arc=2*pi):
  v=[];f=[]
  for j in range(n+1):
   a=start+arc*j/n
   for i in range(k):
    b=2*pi*i/k; p=((r+minor*cos(b))*cos(a),minor*sin(b),(r+minor*cos(b))*sin(a))
    if axis=='z':p=(p[0],p[2],p[1])
    if axis=='x':p=(p[1],p[0],p[2])
    v.append(tuple(c[t]+p[t] for t in range(3)))
  for j in range(n):
   for i in range(k):a=j*k+i;b=j*k+(i+1)%k;f.append((a,b,b+k,a+k))
  self.add(v,f,color,mat)
 def jam(self,c,s,n=8):
  self.blob(c,s,'jam',3,n,4 if n<=8 else 6,.12)
  self.tube([c,(c[0]+.03,c[1]-.018,c[2]-s[2]-.05),(c[0]+.02,c[1]-.03,c[2]-s[2]-.16)],[s[0]*.22,s[0]*.16,.011],'jam',3,4 if n<=8 else 6)
 def finish(self):
  mesh=bpy.data.meshes.new(self.name+'_mesh');mesh.from_pydata(self.verts,[],self.faces);mesh.update()
  for m in MATS:mesh.materials.append(m)
  col=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
  for p in mesh.polygons:
   p.material_index=self.slots[p.index];p.use_smooth=self.smooth[p.index]
   for li in p.loop_indices:col.data[li].color=self.colors[p.index]
  # Authored closed components must have outward normals even when a GLB-XZ
  # perimeter is wound differently from Blender-XY. Keep the corner colours.
  import bmesh
  bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
  obj=bpy.data.objects.new(self.name+'_geometry',mesh);bpy.context.collection.objects.link(obj);obj.parent=self.ctrl
  return self.ctrl


def C(point):
 """Desired GLB +Y-up/-Z-front -> Blender coordinates; exporter reverses it."""
 return (point[0],-point[2],point[1])
class Part:
 def __init__(self,name,offset=(0,0,0),parent=None):
  self.name=name;self.offset=Vector(offset);self.backend=BackendGeo(name,C(offset),parent);self.ctrl=self.backend.ctrl;self.anchors={};self.anchorNodes={}
 def P(self,p):return C(Vector(p)+self.offset)
 def blob(self,c,s,color='cream',mat=0,n=16,m=10,deform=0):self.backend.blob(self.P(c),(s[0],s[2],s[1]),color,mat,n,m,deform)
 def profile(self,c,profile,color='cream',mat=0,n=24,ell=1,waves=0):self.backend.profile(self.P(c),profile,color,mat,n,ell,waves)
 def tube(self,points,radii,color='walnut',mat=1,n=8,closed=True):self.backend.tube([self.P(p) for p in points],radii,color,mat,n,closed)
 def beam(self,a,b,width,depth=None,color='walnut',mat=1):self.backend.beam(self.P(a),self.P(b),width,depth,color,mat)
 def box(self,c,s,color='wood',mat=1):self.backend.board(self.P(c),(s[0],s[2],s[1]),color,mat)
 def ring(self,c,r,minor,color='mint',mat=0,axis='z',n=24,k=6,start=0,arc=2*pi):self.backend.ring(self.P(c),r,minor,color,mat,{'x':'x','y':'z','z':'y'}[axis],n,k,start,arc)
 def poly(self,vertices,faces,color='cream',mat=0,smooth=False):self.backend.add([self.P(v) for v in vertices],faces,color,mat,smooth)
 def anchor(self,name,pos):
  if name in self.anchorNodes:return bpy.data.objects[self.anchorNodes[name]]
  realname=name if name not in bpy.data.objects else self.name+'_'+name
  obj=bpy.data.objects.new(realname,None);bpy.context.collection.objects.link(obj);obj.parent=self.ctrl;obj.location=C(pos);obj.empty_display_size=.05;obj['anchor']=name;self.anchors[name]=list(pos);self.anchorNodes[name]=obj.name;return obj
 def finish(self):return self.backend.finish()

def clear():
 assert bpy.app.background,'Headless MCP required'
 if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
 for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
 for block in [bpy.data.meshes,bpy.data.materials,bpy.data.actions,bpy.data.cameras,bpy.data.lights]:
  for data in list(block):
   if data.users==0:block.remove(data)
 materials()
def group(name,parent=None,offset=(0,0,0)):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;o.location=C(offset);return o
def bake(mid,objects,durations,pose):
 rests={o.name:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o in objects};meta=[]
 for clip,seconds in durations.items():
  frames=math.ceil(seconds*24)+1;acts={}
  for o in objects:o.animation_data_create();a=bpy.data.actions.new(mid+'_'+clip+'_'+o.name);o.animation_data.action=a;acts[o.name]=a
  for f in sorted(set([1,round(frames*.16),round(frames*.33),round(frames*.5),round(frames*.67),round(frames*.84),frames])):
   t=(f-1)/(frames-1)
   for o in objects:
    loc,rot,scale=rests[o.name];o.location=loc.copy();o.rotation_euler=rot.copy();o.scale=scale.copy();p=pose(o.name,clip,t) or {}
    if 'move' in p:o.location+=Vector(C(p['move']))
    if 'rot' in p:r=p['rot'];o.rotation_euler.x+=r[0];o.rotation_euler.y-=r[2];o.rotation_euler.z+=r[1]
    if 'scale' in p:o.scale=tuple(scale[i]*p['scale'][i] for i in range(3))
    o.keyframe_insert('location',frame=f);o.keyframe_insert('rotation_euler',frame=f);o.keyframe_insert('scale',frame=f)
  for o in objects:
   ad=o.animation_data;a=acts[o.name];ad.action=None;tr=ad.nla_tracks.new();tr.name=mid+'_'+clip;st=tr.strips.new(mid+'_'+clip,1,a);st.extrapolation='NOTHING';tr.mute=True;loc,rot,scale=rests[o.name];o.location=loc;o.rotation_euler=rot;o.scale=scale
  meta.append({'name':mid+'_'+clip,'keySeconds':(frames-1)/24,'requestedSeconds':seconds})
 bpy.context.scene.render.fps=24;return meta
def summary(file):
 data=Path(file).read_bytes();n=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+n]);meshtris=[sum(g['accessors'][p['indices']]['count']//3 for p in m['primitives'] if 'indices' in p) for m in g.get('meshes',[])];tris=sum(meshtris[node['mesh']] for node in g.get('nodes',[]) if 'mesh' in node)
 return {'triangles':tris,'uniqueGeometryTriangles':sum(meshtris),'clips':[a['name'] for a in g.get('animations',[])],'channels':[len(a['channels']) for a in g.get('animations',[])],'materials':[m.get('name') for m in g.get('materials',[])],'nodes':[n.get('name') for n in g.get('nodes',[])],'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
def export(root,path):
 bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
 for o in root.children_recursive:o.select_set(True)
 bpy.context.view_layer.objects.active=root
 kw={'filepath':str(path),'export_format':'GLB','use_selection':True,'export_animations':True,'export_animation_mode':'NLA_TRACKS','export_force_sampling':True,'export_frame_range':False,'export_skins':False,'export_yup':True,'export_materials':'EXPORT','export_extras':True,'export_texcoords':False}
 props=bpy.ops.export_scene.gltf.get_rna_type().properties.keys();bpy.ops.export_scene.gltf(**{k:v for k,v in kw.items() if k in props})
 return summary(path)
