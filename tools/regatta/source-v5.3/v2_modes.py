"""Substantive V2 construction, executed in build_kits globals by native MCP.
Planning routes are authored geometry, not claims of full physics acceptance.
"""
MOTIONS={};REUSED=[];V2BASEPOSE=pose
def consolidate_overview(name):
 """Merge truly static display geometry; keep every moving ancestor and anchor."""
 root=bpy.data.objects[name];active=bpy.data.objects.get(name+'_geometry');meshes=[]
 if not active:return
 for o in root.children_recursive:
  if o.type!='MESH':continue
  parent=o.parent;moving=False
  while parent and parent!=root:
   if any(pose(parent.name,clip,.31) is not None for clip in ['idle','action','success','failure']):moving=True;break
   parent=parent.parent
  if not moving:meshes.append(o)
 if len(meshes)<2:return
 bpy.ops.object.select_all(action='DESELECT')
 for o in meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=active;bpy.ops.object.join();root['static_meshes_merged']=len(meshes)
def motion(part,kind,amplitude=1,axis='y'):
 MOTIONS[part.name]={'kind':kind,'amplitude':amplitude,'axis':axis};part.ctrl['mechanism']=kind;part.ctrl['moving_pivot']=True
 return part
def pose(name,clip,t):
 m=MOTIONS.get(name)
 if m:
  s=sin(2*pi*t);p=sin(pi*t);a=m['amplitude'];axis=m['axis'];v=[0,0,0];i={'x':0,'y':1,'z':2}[axis]
  if clip=='idle':v[i]=.018*s;return {'rot':v}
  if clip=='action':
   if m['kind'] in ['wheel','carousel','counterwheel']:v[i]=a*2*pi*t;return {'rot':v}
   if m['kind'] in ['pendulum','sail','bell']:v[i]=a*s;return {'rot':v}
   if m['kind'] in ['lift','balloon','piston','sink','cart']:v[i]=a*p;return {'move':v}
   if m['kind']=='collapse':return {'move':(0,-a*p,0),'rot':(.10*s,0,.06*s)}
   if m['kind']=='trampoline':return {'scale':(1,1,1-.18*p)}
  if clip=='failure':
   v[i]=a*.08*s
   return {'rot':v} if m['kind'] in ['wheel','counterwheel','carousel','pendulum','sail','bell'] else {'move':v}
  if clip=='success' and m['kind']=='bell':return {'rot':(0,0,.4*s)}
 return V2BASEPOSE(name,clip,t)
def reuse_asset(filepath,name,parent,pos=(0,0,0),yaw=0,scale=(1,1,1),node=None):
 src=WORKSPACE/filepath;before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(src));new=[o for o in bpy.data.objects if o not in before]
 if node:
  selected=next(o for o in new if o.name==node or o.name.startswith(node+'.'));keep={selected,*selected.children_recursive}
  selected.parent=None
  for o in new:
   if o not in keep:bpy.data.objects.remove(o,do_unlink=True)
  new=list(keep)
 holder=group(name,parent,pos);holder.rotation_euler.z=yaw;holder.scale=(scale[0],scale[2],scale[1])
 for o in new:
  if o.parent is None:o.parent=holder
  if o.type=='MESH' and o.data.color_attributes:
   old=o.data.color_attributes.active_color or o.data.color_attributes[0];oldname=old.name
   if old.domain=='POINT':
    colours=[tuple(d.color) for d in old.data];converted=o.data.color_attributes.new(name='r4_canonical_colour',type='FLOAT_COLOR',domain='CORNER')
    for loop in o.data.loops:converted.data[loop.index].color=colours[loop.vertex_index]
    o.data.color_attributes.remove(old);old=converted
   old.name='Color';o.data.color_attributes.active_color_index=list(o.data.color_attributes).index(old);o.data.color_attributes.render_color_index=list(o.data.color_attributes).index(old)
   for material in o.data.materials:
    if material and material.use_nodes:
     for shader_node in material.node_tree.nodes:
      if shader_node.type=='VERTEX_COLOR':shader_node.layer_name='Color'
      if shader_node.type=='ATTRIBUTE' and shader_node.attribute_name==oldname:shader_node.attribute_name='Color'
  if o.name.startswith('col_'):bpy.data.objects.remove(o,do_unlink=True)
 REUSED.append({'path':filepath,'node':node,'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'target':name,'purpose':'actual authored existing geometry reused inside exported planning component'})
 return holder
def rounded_outline(w,d,r,n=6):
 pts=[]
 for cx,cz,start in [(w/2-r,d/2-r,0),(-w/2+r,d/2-r,pi/2),(-w/2+r,-d/2+r,pi),(w/2-r,-d/2+r,3*pi/2)]:
  for i in range(n):a=start+i*pi/(2*(n-1));pts.append((cx+r*cos(a),cz+r*sin(a)))
 return pts
def inflatable(g,w,d,color='mint',thickness=.46):
 """Rounded, closed, convex cushion with truly flat top at local Y=0."""
 profiles=[(-thickness,w-.18,d-.18,.22),(-thickness+.08,w,d,.27),(-.14,w,d,.27),(0,w-.22,d-.22,.23)]
 v=[];f=[];n=24
 for y,ww,dd,r in profiles:v.extend((x,y,z) for x,z in rounded_outline(ww,dd,min(r,ww/3,dd/3)))
 for j in range(3):
  for k in range(n):a=j*n+k;b=j*n+(k+1)%n;f.append((a,b,b+n,a+n))
 g.poly(v,[tuple(reversed(face)) for face in f],color,0,True);g.poly(v,[tuple(range(n)),tuple(reversed([3*n+k for k in range(n)]))],'cream',0,False)
 seam=rounded_outline(w-.01,d-.01,min(.27,w/3,d/3));g.tube([(x,-.25,z) for x,z in seam+[seam[0]]],.010,'cream',0,6)
 for x in [-w*.31,w*.31]:
  for z in [-d*.34,d*.34]:g.box((x,-thickness+.07,z),(.17,.05,.10),'walnut',1);g.ring((x,-thickness+.11,z),.045,.012,'cream',0,'x',10)
 g.anchor('deck_top',(0,0,0))
def tower_point(a,y,r=13):return (r*-sin(a),y,r*cos(a))
def slab(g,a,y,width=2.4,length=2.18,r=13,color='wood'):
 da=length/(2*r);v=[]
 for yy in [y-.25,y]:
  for rr,aa in [(r-width/2,a-da),(r+width/2,a-da),(r+width/2,a+da),(r-width/2,a+da)]:v.append(tower_point(aa,yy,rr))
 g.poly(v,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],color,1)
 # Two radial floor beams and a diagonal anchored in the masonry spine.
 for aa in [a-da*.7,a+da*.7]:g.beam(tower_point(aa,y-.35,6.7),tower_point(aa,y-.35,r+width/2),.17,.24,'walnut',1)
 g.beam(tower_point(a,y-2.4,6.6),tower_point(a,y-.40,r+.7),.19,.22,'walnut',1)
def basket_shape(g,w=2.6,d=2.6):
 plank_deck(g,w,d)
 for z in [-d/2,d/2]:
  for j in range(5):g.box((0,.13+j*.17,z),(w,.095,.10),'woodhi',1)
 for x in [-w/2,w/2]:
  for j in range(5):g.box((x,.13+j*.17,0),(.10,.095,d),'wood',1)
 for x in [-w/2,w/2]:
  for z in [-d/2,d/2]:g.tube([(x,0,z),(x,1.1,z)],.060,'walnut',1,8)
def tower_overview():
 global MOTIONS,REUSED
 g=P('tower_full_overview',(0,0,-48));data=json.loads((BASE/'brief/tower-18-construction.json').read_text());checks=[]
 # Six genuinely different architectural belts; shaft narrows upwards.
 beltcols=['stone','terracotta','cream','stone','terracotta','cream']
 for b in range(6):
  lo=b*30;hi=lo+30 if b<5 else 185;r=7.6-b*.44
  g.profile((0,lo,0),[(0,r),(hi-lo-(.04 if b==5 else 0),r-.40)],beltcols[b],0,48)
  for y in [lo+.7,lo+14,hi-.6]:g.profile((0,y,0),[(0,r+.16),(.40,r+.16)],'cream' if b%2 else 'stone',0,48)
  # Recessed windows/shutters, stone pilasters, lower quoins, high timber gallery.
  for k in range(8):
   a=k*pi/4
   for yy in [lo+6,lo+21]:
    facadeRadius=r-.40*(yy-lo)/(hi-lo);p=P('tower_belt_'+str(b+1)+'_window_'+str(k)+'_'+str(int(yy)),tower_point(a,yy,facadeRadius+.025),g.ctrl);p.ctrl.rotation_euler.z=pi-a
    p.box((0,0,0),(1.25,2.35,.13),'dark',0)
    for x in [-.70,.70]:p.box((x,0,-.12),(.17,2.70,.24),'cream',0)
    p.box((0,1.32,-.12),(1.58,.22,.26),'cream',0);p.box((0,-1.32,-.12),(1.58,.22,.30),'stone',0)
    for x in [-.30,.30]:p.box((x,0,-.17),(.08,2.20,.14),'walnut',1)
   g.beam(tower_point(a,lo,r+.14),tower_point(a,hi,r-.28),.35,.35,'stone' if b%2 else 'cream',0)
  terraceY=hi;g.profile((0,terraceY-.44,0),[(0,9.15),(.44,9.15)],'wood',1,48)
  for k in range(16):
   a=k*pi/8;g.beam(tower_point(a,terraceY-2.4,r-.35),tower_point(a,terraceY-.44,9.1),.26,.32,'walnut',1)
   g.tube([tower_point(a,terraceY,8.95),tower_point(a,terraceY+.9,8.95)],.065,'walnut',1,8)
  g.tube([tower_point(i*pi/32,terraceY+.72,8.95) for i in range(65)],.045,'cream',0,8)
 for sector in data['sectors']:
  sid=sector['id'];lo=sector['from'];hi=sector['to'];kind=sector['kind'];a0=(sid-1)*2*pi/3;a1=sid*2*pi/3;amid=(a0+a1)/2;rise=hi-lo
  road=P('sector_'+str(sid).zfill(2)+'_'+kind,(0,0,0),g.ctrl);road.ctrl['sector']=sid;road.ctrl['title']=sector['title'];road.anchor('sector_'+str(sid).zfill(2),tower_point(amid,(lo+hi)/2));road.anchor('entry_'+str(sid).zfill(2),tuple(sector['entry'][k] for k in ['x','y','z']));road.anchor('exit_'+str(sid).zfill(2),tuple(sector['exit'][k] for k in ['x','y','z']))
  lift=sector['riseMechanism']!='stair';riseSteps={1:8,3:10,4:12,5:10,6:8,7:10,10:11,11:9,14:10,16:26,17:15,18:20}.get(sid,13);n=17 if sid==17 else max(13,riseSteps)
  route=[]
  for j in range(n+1):
   if j==0 and sid>1:continue # Shared entry uses the preceding exit slab.
   u=j/n;a=a0+(a1-a0)*u
   if sid==17 and j==9:continue
   if sid==17 and j>=10:
    a8=a0+(a1-a0)*8/17;gapAngle=(13*(a1-a0)/n-.025)/13+2*math.asin(3.4/26);a10=a8+gapAngle;a=a10+(a1-a10)*(j-10)/7
   if lift and .42<u<.58:continue
   y=(lo if u<.5 else hi) if lift else lo+rise*math.floor(u*riseSteps+1e-6)/riseSteps
   if sid==17:y=lo+.8*(j-(1 if j>=9 else 0)-(1 if j>=10 else 0))
   if kind=='cloud' and .05<u<.95:continue
   if kind=='collapse' and 0<j<n:
    moving=motion(P('s16_collapse_step_'+str(j),tower_point(a,y),g.ctrl),'collapse',2.4);moving.ctrl.rotation_euler.z=-a;plank_deck(moving,2.4,13*(a1-a0)/n-.025,n=6);road.beam(tower_point(a,y-1.4,6.5),tower_point(a,y-.32,14.2),.18,.20,'walnut',1)
   else:slab(road,a,y,width=2.4 if sid not in [6,14] else 2.0,length=13*(a1-a0)/n-.025,color='woodhi' if j%3==0 else 'wood')
   route.append(tower_point(a,y))
   if j%3==0:
    p=tower_point(a,y,14.2);road.tube([p,(p[0],y+.85,p[2])],.047,'walnut',1,8)
    if j>0:
     prev=tower_point(a-(a1-a0)/n*2.6,y-rise/n*2.6 if not lift else y,14.2);road.tube([(prev[0],prev[1]+.64,prev[2]),(p[0],y+.64,p[2])],.032,'cream',0,6)
  chord=26*sin((a1-a0)/(2*n)) if kind!='cloud' else 26*sin(.14*(a1-a0)/2)
  checks.append({'id':sid,'kind':kind,'entry':sector['entry'],'exit':sector['exit'],'riseSteps':riseSteps,'ordinaryMaxRise':round(rise/riseSteps,4) if not lift else None,'ordinaryStepChordMax':round(chord,4),'mainWidth':2.4 if sid not in [6,14] else 2.0,'riseMechanism':sector['riseMechanism'],'cloudApproachUsesOrdinaryJump':kind=='cloud','specialLevelAirGap':3.4 if sid==17 else None})
  pos=tower_point(amid,lo,13)
  def machine(label,offset=(0,0,0)):
   return P('s'+str(sid).zfill(2)+'_'+label,tuple(pos[i]+offset[i] for i in range(3)),g.ctrl)
  if kind=='roof':
   for u in [.25,.6,.85]:
    a=a0+(a1-a0)*u;y=lo+rise*u-1.5;p=P('s01_roof_'+str(u),tower_point(a,y),g.ctrl);p.ctrl.rotation_euler.z=-a;p.poly([(-1.8,0,-1.4),(1.8,0,-1.4),(0,1.05,-1.4),(-1.8,0,1.4),(1.8,0,1.4),(0,1.05,1.4)],[(0,1,2),(3,5,4),(0,2,5,3),(1,4,5,2)],'terracotta',0)
  elif kind=='pendulum' or (kind=='cloud' and sid==11):
   for k,u in enumerate([.24,.50,.76] if sid==3 else [.32,.70]):
    a=a0+(a1-a0)*u;y=lo+rise*u;fr=P('s'+str(sid)+'_sack_frame'+str(k),tower_point(a,y),g.ctrl);fr.ctrl.rotation_euler.z=-a
    for x in [-1.65,1.65]:fr.beam((x,0,0),(x,5.2,0),.19,.19)
    fr.beam((-1.8,5.2,0),(1.8,5.2,0),.22,.22);bag=motion(P('s'+str(sid)+'_pendulum'+str(k),(0,5,0),fr.ctrl),'pendulum',.50,'z');bag.tube([(0,0,0),(0,-3.5,0)],.045,'cream',0,8);bag.profile((0,-4.8,0),[(0,.08),(.22,.56),(1.1,.63),(1.45,.2),(1.52,.06)],'coral',0,20);bag.ring((0,-3.8,0),.63,.032,'cream',0,'y',20)
  if kind=='piston':
   for k,u in enumerate([.16,.38,.62,.84] if sid==4 else [.22,.5,.78]):
    a=a0+(a1-a0)*u;y=lo+rise*u;fr=P('s'+str(sid)+'_piston_frame'+str(k),tower_point(a,y+.75,10.6),g.ctrl);fr.ctrl.rotation_euler.z=-a
    fr.box((0,0,0),(1.4,1.6,.85),'walnut',1);fr.box((0,0,-.47),(1.15,1.32,.12),'mint',0)
    rod=motion(P('s'+str(sid)+'_piston'+str(k),(0,0,-.6),fr.ctrl),'piston',2.4,'z');rod.tube([(0,0,0),(0,0,-1.2)],.15,'metal',2,12);rod.box((0,0,-1.26),(1.05,1.08,.19),'coral',0);fr.blob((.48,.55,-.6),(.10,.10,.10),'copper',2,10,6)
  if kind=='cloud':
   for k in range(riseSteps):
    u=.14+.72*k/(riseSteps-1);a=a0+(a1-a0)*u;y=lo+rise*(k+1)/riseSteps;cl=motion(P('s'+str(sid)+'_cloud'+str(k),tower_point(a,y,13),g.ctrl),'sink',-1.4)
    inflatable(cl,2.7,2.5,'cream',.60)
    for x,z in [(-.8,-.7),(.65,-.75),(.85,.62),(-.55,.7)]:cl.blob((x,-.28,z),(.48,.24,.45),'white',0,12,7)
  if kind=='sail':
   for k,u in enumerate([.20,.54,.84] if sid==7 else [.25,.72]):
    a=a0+(a1-a0)*u;y=lo+rise*u;fr=P('s'+str(sid)+'_wind_frame'+str(k),tower_point(a,y),g.ctrl);fr.ctrl.rotation_euler.z=-a
    for x in [-1.35,1.35]:fr.beam((x,0,.7),(x,3.5,.7),.16,.16)
    sail=motion(P('s'+str(sid)+'_sail'+str(k),(0,3.2,.7),fr.ctrl),'sail',.30,'x');sail.poly([(-1.4,0,0),(1.4,0,0),(1.2,-2.5,.25),(-1.2,-2.5,.25)],[(0,1,2,3)],'mint' if k%2 else 'coral',0);sail.tube([(-1.4,0,0),(1.4,0,0)],.040,'cream',0,8)
  if kind=='basket' and sid==2:
   frame=machine('wheel_support',(0,5.5,-1.0));frame.beam((0,-5.5,1),(0,1,1),.40,.50);frame.beam((-6,-5.5,1),(0,1,1),.26,.32);frame.beam((6,-5.5,1),(0,1,1),.26,.32)
   wheel=motion(machine('wheel',(0,5.5,0)),'wheel',1,'z');wheel.ring((0,0,0),5.5,.16,'walnut',1,'z',40)
   for k in range(4):
    a=k*pi/2;wheel.beam((0,0,0),(5.5*cos(a),5.5*sin(a),0),.27,.28,'woodhi',1);bask=motion(P('s02_basket'+str(k),(5.5*cos(a),5.5*sin(a),0),wheel.ctrl),'counterwheel',-1,'z');basket_shape(bask)
   wheel.blob((0,0,0),(.42,.42,.30),'mint',0,16,9)
  elif kind=='basket':
   for k in range(2 if sid==12 else 1):
    offset=(-1.5 if k==0 else 1.5);ball=motion(machine('balloon'+str(k),(offset,0,0)),'balloon',rise)
    basket_shape(ball,2.4,2.4);ball.blob((0,6,0),(2.5,3.4,2.5),'mint' if k else 'coral',0,24,16)
    for x in [-1,1]:
     for z in [-1,1]:ball.tube([(x,.9,z),(x*1.55,4.2,z*1.55)],.035,'cream',0,8)
    for q in range(8):a=q*pi/4;ball.tube([(2.2*cos(a),4.6,2.2*sin(a)),(2.5*cos(a),6,2.5*sin(a)),(1.5*cos(a),8.3,1.5*sin(a))],.025,'cream',0,6)
  if kind=='trampoline':
   for k in range(2):
    tr=motion(machine('bounce'+str(k),(0,k*rise*.5,0)),'trampoline');inflatable(tr,3.1,3.4,'mint',.6);tr.profile((0,-.05,0),[(0,1.12),(.05,1.12)],'cream',0,24);tr.ring((0,-.08,0),1.28,.08,'coral',0,'y',24)
    if k==0 and sid==8:
     tr.box((0,-.7,0),(2.6,.28,2.9),'walnut',1)
     for x in [-1.22,1.22]:
      for z in [-1.1,1.1]:tr.ring((x,-.85,z),.27,.10,'metal',2,'x',14)
  if kind=='updraft':
   bellows=machine('bellows');bellows.box((0,-.55,0),(2.5,.4,2.5),'walnut',1)
   for y in [-.35,-.15,.05,.25]:bellows.profile((0,y,0),[(0,1.12),(.12,1.0)],'coral',0,16)
   stream=motion(machine('guide_stream',(0,1.2,0)),'lift',rise-1)
   for x in [-1.1,1.1]:stream.tube([(x,0,-.4),(x*.75,2,-.35),(x*.85,4.5,-.1)],.040,'cream',0,8)
   plank_deck(stream,2.8,2.8)
  if kind=='carousel':
   for k,u in enumerate([.28,.74]):
    a=a0+(a1-a0)*u;y=lo+rise*u;rot=motion(P('s10_carousel'+str(k),tower_point(a,y),g.ctrl),'carousel',1 if k==0 else -1)
    rot.profile((0,-1.5,0),[(0,.45),(1.2,.45),(1.5,.8)],'walnut',1,16);rot.box((0,-.10,0),(4.3,.20,2.4),'woodhi',1);rot.box((0,-.13,0),(2.4,.18,4.3),'mint',0)
  if kind=='bell':
   gallery=machine('bell_gallery',(0,rise,0));plank_deck(gallery,4.2,3.6);rope_rail(gallery,4.1,3.5)
   for x in [-1.7,1.7]:gallery.beam((x,0,0),(x,4.0,0),.24,.24)
   gallery.beam((-1.9,4,0),(1.9,4,0),.28,.28);bell=motion(P('s18_bell',(0,3.8,0),gallery.ctrl),'bell',.24,'z');bell.profile((0,-1.8,0),[(0,1.0),(.18,.95),(1.2,.52),(1.7,.25)],'copper',2,24);bell.tube([(0,0,0),(0,-1.9,0)],.09,'walnut',1,10)
 # Real lantern gallery on top; bell gallery at route endpoint remains distinct.
 for k in range(8):a=k*pi/4;g.tube([tower_point(a,185,5.0),tower_point(a,191,5.0)],.20,'cream',0,12)
 g.profile((0,191,0),[(0,6.5),(3.2,.08)],'terracotta',0,48)
 return {'planningOnly':True,'routeHeight':185,'buildingHeight':194.2,'belts':6,'namedSectors':18,'constructionInput':'brief/tower-18-construction.json','routeChecks':checks,'motionNodes':dict(MOTIONS),'physicsAcceptance':False,'note':'Lifts/bounces bridge the deliberate vertical gaps; full playable route still requires collision and timing implementation.'}
def filleted_route(nodes):
 arcs=[]
 for i,(x,z,r) in enumerate(nodes):
  vertex=Vector((x,z));prev=Vector(nodes[i-1][:2]);nxt=Vector(nodes[(i+1)%len(nodes)][:2]);u=(vertex-prev).normalized();v=(nxt-vertex).normalized();turn=math.atan2(u.x*v.y-u.y*v.x,u.dot(v));distance=r*math.tan(abs(turn)/2)
  assert distance<(vertex-prev).length*.85 and distance<(nxt-vertex).length*.85,'Specified planning corner cannot fit'
  entry=vertex-u*distance;exit=vertex+v*distance;sign=1 if turn>0 else -1;centre=entry+Vector((-u.y,u.x))*sign*r;start=math.atan2(entry.y-centre.y,entry.x-centre.x)
  points=[(centre.x+r*cos(start+turn*j/20),centre.y+r*sin(start+turn*j/20)) for j in range(21)];arcs.append((points,entry,exit,r))
 route=[]
 for i,(points,entry,exit,r) in enumerate(arcs):
  route+=points;dest=arcs[(i+1)%len(arcs)][1];count=max(1,math.ceil((dest-exit).length/2.2))
  route.extend(tuple(exit*(1-j/count)+dest*(j/count)) for j in range(1,count))
 return route
def strip(g,points,width,y,color):
 v=[];f=[]
 for i,(x,z) in enumerate(points):
  a=Vector(points[max(0,i-1)]);b=Vector(points[min(len(points)-1,i+1)]);t=(b-a).normalized();v.extend([(x-t.y*width/2,y,z+t.x*width/2),(x+t.y*width/2,y,z-t.x*width/2)])
 for i in range(len(points)-1):f.append((2*i,2*i+2,2*i+3,2*i+1))
 g.poly(v,f,color,0,False)
 if f:g.backend.colors[-len(f):]=[(*COL[color],1)]*len(f)
def regatta_overview():
 g=P('regatta_full_course',(0,0,-140));nodes=[(-52,-34,22),(32,-34,20),(52,-8,20),(34,36,24),(-16,48,22),(-54,22,22)];route=filleted_route(nodes);closed=route+[route[0]];strip(g,closed,18,-.02,'glass')
 # A real irregular shore inside the main corridor, with soft beach terraces.
 inner=[]
 for i,(x,z) in enumerate(route):
  t=(Vector(route[(i+1)%len(route)])-Vector(route[i-1])).normalized();inner.append((x-t.y*12,z+t.x*12))
 # Distinct safe outer line and marked narrow inner cliff branch.
 branch=[(20,-34),(29,-29),(36,-22),(42,-15),(47,-8)];strip(g,branch,10,.012,'water')
 def dist_to(points,x,z):
  best=1e9;p=Vector((x,z))
  for a,b in zip(points,points[1:]):
   a=Vector(a);b=Vector(b);d=b-a;t=max(0,min(1,(p-a).dot(d)/d.length_squared));best=min(best,(p-(a+d*t)).length)
  return best
 def inside(x,z):
  result=False
  for (ax,az),(bx,bz) in zip(route,route[1:]+route[:1]):
   if (az>z)!=(bz>z) and x<(bx-ax)*(z-az)/(bz-az)+ax:result=not result
  return result
 # Split the smooth inner shore along the real branch offsets. No square
 # terrain tiles, and no solid land beneath the branch water.
 def clipped(poly,a,b,side):
  a=Vector(a);b=Vector(b);t=(b-a).normalized();normal=Vector((-t.y,t.x))*side;out=[]
  def value(point):return (Vector(point)-a).dot(normal)-5.8
  for prev,current in zip(poly[-1:]+poly[:-1],poly):
   vp,vc=value(prev),value(current)
   if (vp>=0)!=(vc>=0):u=vp/(vp-vc);q=Vector(prev)*(1-u)+Vector(current)*u;out.append(tuple(q))
   if vc>=0:out.append(current)
  return out
 for side in [-1,1]:
  poly=list(inner)
  for a,b in zip(branch,branch[1:]):
   if poly:poly=clipped(poly,a,b,side)
  if len(poly)<3:continue
  g.poly([(x,.32,z) for x,z in poly],[tuple(reversed(range(len(poly))))],'sand',0)
  for i,a in enumerate(poly):
   b=poly[(i+1)%len(poly)];g.poly([(a[0],-.6,a[1]),(b[0],-.6,b[1]),(b[0],.32,b[1]),(a[0],.32,a[1])],[(0,1,2,3)],'sandwet',0)
 shorechecks=[]
 for i in range(0,len(route),9):
  x,z=route[i];t=(Vector(route[(i+1)%len(route)])-Vector(route[i-1])).normalized()
  for side in [-1,1]:
   xx=x-side*t.y*9.3;zz=z+side*t.x*9.3;g.profile((xx,-.15,zz),[(0,.26),(.14,.27),(.92,.09),(1.10,.04)],'cream',0,12);g.profile((xx,.27,zz),[(0,.20),(.27,.15)],'coral',0,12)
 for k,(p,r,h) in enumerate([((23,-18),3.8,8),((29,-9),4.2,10),((37,-3),4.0,8),((64,-26),3.2,7),((66,-16),3.0,6)]):
  x,z=p
  if dist_to(closed,x,z)<9+r or dist_to(branch,x,z)<5+r:continue
  vertices=[];faces=[];n=8
  for yy,scale in [(-.6,.90),(.6,1),(h*.65,.88),(h,.75)]:
   for j in range(n):a=j*2*pi/n;rr=r*scale*(.92+.08*sin(j*2.17+k));vertices.append((x+rr*cos(a),yy+(.25*sin(j*1.9) if yy>1 else 0),z+rr*.82*sin(a)))
  for layer in range(3):
   for j in range(n):a=layer*n+j;b=layer*n+(j+1)%n;faces.append((a,b,b+n,a+n))
  faces.extend([tuple(range(n)),tuple(reversed([3*n+j for j in range(n)]))]);g.poly(vertices,faces,'cream',0,False);shorechecks.append({'centre':[x,z],'radius':r,'mainClearance':round(dist_to(closed,x,z)-r,3),'branchClearance':round(dist_to(branch,x,z)-r,3)})
 # High gate framing the narrower line and a clear exit streamer.
 for k,(x,z) in enumerate([branch[0],branch[-1]]):
  for side in [-1,1]:g.profile((x+side*5.5,-.12,z),[(0,.36),(.8,.30),(4.8,.10)],'cream',0,14);g.box((x+side*5.5,3.4,z),(.60,.60,.10),'coral',0)
  g.tube([(x-5.5,4.7,z),(x,4.35,z),(x+5.5,4.7,z)],.04,'cream',0,8)
  if k==1:
   for i in range(3):g.poly([(x-1.2+i,3.8,z),(x-.65+i,3.8,z),(x-.9+i,3.1,z)],[(0,1,2)],'mint',0)
 # Marina on the actual western bank: accepted roof/arch/awning modules,
 # two different dock shapes, real boats and mooring fixtures.
 for name,x,z,w,d in [('marina_quay',-67,-12,7,28),('marina_finger',-69,12,10,3.8)]:
  dock=P(name,(x,.15,z),g.ctrl);plank_deck(dock,w,d)
  for xx in [-w/2+.35,w/2-.35]:
   for zz in [-d/2+.35,d/2-.35]:dock.tube([(xx,-1.8,zz),(xx,.75,zz)],.15,'walnut',1,10);dock.ring((xx,.60,zz),.17,.03,'cream',0,'y',12)
 roofkit='concepts_blender/plaza3/kit/glb/kit_roofs.glb';wallkit='concepts_blender/plaza3/kit/glb/kit_walls.glb';awningkit='concepts_blender/plaza3/kit/glb/kit_awnings.glb'
 for n,(x,z,yaw) in enumerate([(-68,-29,-pi/2),(-70,-4,-pi/2)]):
  house=P('marina_house_'+str(n),(x,.32,z),g.ctrl);house.ctrl.rotation_euler.z=yaw
  house.box((0,1.95,.2),(8.4,3.9,6.5),'cream',0)
  # Genuine 3m arcade segments replace box-fronts; roof geometry already approved.
  for xx in [-3,0,3]:reuse_asset(wallkit,'marina_arch_'+str(n)+'_'+str(xx),house.ctrl,(xx,0,-3.2),node='wall_arch_3m')
  reuse_asset(roofkit,'marina_roof_'+str(n),house.ctrl,(0,4.0,0),node='roof_hip_9x7');reuse_asset(awningkit,'marina_awning_'+str(n),house.ctrl,(0,3.2,-3.3),node='awning_3m_green' if n==0 else 'awning_3m_red')
 for n,(x,z,yaw) in enumerate([(-55,-19,pi),(-52,6,0),(-31,36,.4)]):reuse_asset('game-opus/client/assets/ownboats/volzhanka_lod1.glb','planning_boat_'+str(n),g.ctrl,(x,-.04,z),yaw,(1,1,1))
 # Lush, low centre island makes the coastline readable without hiding water.
 for p,s in [((-20,.10,6),(11,1.8,7)),((0,.10,17),(13,2.2,8)),((-14,.10,-7),(10,1.4,7))]:g.blob(p,s,'sand',0,18,10,.045)
 for x,z in [(-31,-12),(-24,5),(-10,25),(10,21)]:
  g.profile((x,.32,z),[(0,.50),(3.4,.28)],'walnut',1,12)
  for a in [i*pi/3 for i in range(6)]:g.tube([(x,3.5,z),(x+1.6*cos(a),4.5,z+1.6*sin(a)),(x+3.5*cos(a),3.9,z+3.5*sin(a))],[.24,.4,.07],'leaf',0,8)
 # Dedicated small coastal lighthouse on the south/east bank, outside the race.
 lx,lz=52,41;g.blob((lx,.5,lz),(5.8,2.1,6.5),'stone',0,20,12,.10);g.profile((lx,1.5,lz),[(0,1.4),(5.8,.91),(6.1,1.1)],'cream',0,24);g.profile((lx,4.6,lz),[(0,1.10),(.62,1.07)],'coral',0,24)
 g.profile((lx,7.6,lz),[(0,1.5),(.2,1.5)],'wood',1,24)
 for i in range(8):a=i*pi/4;g.tube([(lx+1.2*cos(a),7.8,lz+1.2*sin(a)),(lx+1.2*cos(a),9.3,lz+1.2*sin(a))],.060,'walnut',1,8)
 g.blob((lx,8.5,lz),(.32,.48,.32),'copper',2,14,8);g.profile((lx,9.3,lz),[(0,1.65),(.8,.05)],'terracotta',0,24)
 for name,pos in [('zone_marina',(-61,0,-12)),('zone_cliffs',(36,0,-22)),('zone_lighthouse',(52,0,41)),('inner_line',(36,0,-22)),('outer_line',(43,0,-30))]:g.anchor(name,pos)
 return {'planningOnly':True,'layoutNodes':nodes,'cornerCount':6,'cornerRadii':[n[2] for n in nodes],'laneWidth':18,'innerBranchWidth':10,'innerBranch':branch,'zones':['marina','white cliffs','small lighthouse'],'cliffClearanceChecks':shorechecks,'reusedGeometry':list(REUSED),'physicsAcceptance':False}
def make_slide(slide):
 profile=[(0,4),(2.0,3.8),(4.0,2.8),(7.0,1.3),(10.5,-.1),(13.5,-.35),(15,-.4)];v=[];f=[]
 for z,y in profile:v.extend([(-1.55,y,z),(1.55,y,z),(-1.55,y-.23,z),(1.55,y-.23,z)])
 for i in range(len(profile)-1):
  a=i*4;b=a+4;f.extend([(a,b,b+1,a+1),(a+2,a+3,b+3,b+2),(a,a+2,b+2,b),(a+1,b+1,b+3,a+3)])
 f.extend([(0,1,3,2),(24,26,27,25)]);slide.poly(v,f,'cream',0)
 for x in [-1.72,1.72]:
  slide.tube([(x,y+.25,z) for z,y in profile],.30,'mint',0,16)
  for z,y in profile[1:-1]:slide.tube([(x,y+.25,z-.055),(x,y+.25,z+.055)],.312,'cream',0,16)
 for z,y in profile[1:-2]:
  for x in [-1.25,1.25]:slide.tube([(x,-1,z),(x,y-.25,z)],.11,'walnut',1,10)
 for z,y in [(4,2.8),(7,1.3),(10.5,-.1)]:slide.tube([(-1.52,y-.11,z),(1.52,y-.11,z)],.012,'coral',0,8)
 slide.anchor('slide_entry',(0,4,0));slide.anchor('slide_exit',(0,-.4,15));return profile
def aqua():
 ferry=P('aqua_ferry',(-6,0,0));inflatable(ferry,2.4,2.4,'mint')
 for z in [-1.02,1.02]:
  for x in [-.94,.94]:ferry.tube([(x,-.04,z),(x,.62,z)],.035,'walnut',1,8)
  ferry.tube([(-.94,.52,z),(0,.46,z),(.94,.52,z)],.030,'cream',0,8)
 sink=P('aqua_sink',(-2.7,0,0));inflatable(sink,1.8,1.8,'coral')
 disc=P('aqua_sweeper_disc',(2.5,0,0));disc.profile((0,-.58,0),[(0,2.80),(.12,3),(.40,3),(.58,2.80)],'mint',0,40)
 disc.backend.colors[-1]=(*COL['cream'],1);disc.ring((0,-.25,0),2.97,.022,'cream',0,'y',40);disc.anchor('deck_top',(0,0,0))
 rotor=P('aqua_sweeper',(2.5,.65,0));rotor.tube([(-2.7,0,0),(2.7,0,0)],.19,'coral',0,16)
 for x in [-2.0,-1,1,2.0]:rotor.ring((x,0,0),.192,.012,'cream',0,'x',12)
 rotor.profile((0,-.65,0),[(0,.25),(.80,.20)],'mint',0,16);rotor.ring((0,-.08,0),.24,.026,'copper',2,'y',16);rotor.anchor('sweeper_pivot',(0,0,0))
 bag=P('aqua_pendulum',(-5,0,5.2));inflatable(bag,3.2,2.6,'cream')
 for x in [-1.25,1.25]:bag.tube([(x,-.18,0),(x,3.2,0)],.12,'walnut',1,12);bag.tube([(x,-.1,1.1),(x,2.8,0)],.07,'walnut',1,10)
 bag.beam((-1.4,3.2,0),(1.4,3.2,0),.25,.25)
 moving=P('aqua_pendulum_bag',(0,3.05,0),bag.ctrl);moving.tube([(0,0,0),(0,-1.55,0)],.040,'cream',0,8);moving.profile((0,-2.65,0),[(0,.06),(.20,.45),(.78,.47),(1.04,.18),(1.1,.05)],'coral',0,20);moving.ring((0,-2.22,0),.47,.024,'cream',0,'y',20)
 tramp=P('aqua_trampoline',(-.9,0,5.2));tramp.profile((0,-.38,0),[(0,.68),(.07,.80),(.24,.80),(.305,.69)],'mint',0,32);tramp.profile((0,-.025,0),[(0,.57),(.025,.57)],'charcoal',0,32);tramp.ring((0,-.17,0),.63,.17,'coral',0,'y',40);tramp.ring((0,-.17,0),.780,.010,'cream',0,'y',40);tramp.anchor('deck_top',(0,0,0));tramp.anchor('bounce_top',(0,0,0));tramp.backend.verts=[(v[0],v[1]*1.125,v[2]) for v in tramp.backend.verts]
 frame=P('aqua_lift_frame',(3.0,0,5.2))
 for x in [-1.36,1.36]:frame.tube([(x,-.50,0),(x,3.2,0)],.12,'walnut',1,12);frame.tube([(x,-.4,1.2),(x,2.7,0)],.07,'walnut',1,10)
 frame.beam((-1.50,3.2,0),(1.50,3.2,0),.24,.25);frame.ring((0,3.08,0),.23,.07,'copper',2,'x',18)
 frame.tube([(0,.05,0),(0,3.06,0)],.025,'cream',0,8);lift=P('aqua_lift',(3.0,0,5.2));inflatable(lift,2.4,2.4,'coral');lift.anchor('lift_deck',(0,0,0))
 slide=P('aqua_slide',(9,0,5.2));make_slide(slide)
 fullspec=aqua_full_overview()
 return {'aqua_ferry':{'size':[2.4,.46,2.4],'deckTop':0},'aqua_sink':{'size':[1.8,.46,1.8],'deckTop':0},'aqua_sweeper_disc':{'radius':3,'deckTop':0},'aqua_sweeper':{'pivot':'bar centre; disc separate','period':3.6},'aqua_pendulum_bag':{'pivot':'top suspension'},'aqua_trampoline':{'size':[1.6,.38,1.8],'deckTop':0,'bounce':12},'aqua_lift':{'deckTop':0,'frameSeparate':'aqua_lift_frame'},'aqua_full_course':fullspec}
def aqua_full_overview():
 full=P('aqua_full_course',(0,0,-65));nodes=[]
 def clone(name,source,pos,kind=None,amplitude=1,axis='y',scale=(1,1,1)):
  src=PARTS[source];p=P(name,pos,full.ctrl);p.backend.verts=[(v[0]*scale[0],v[1]*scale[2],v[2]*scale[1]) for v in src.backend.verts];p.backend.faces=list(src.backend.faces);p.backend.colors=list(src.backend.colors);p.backend.slots=list(src.backend.slots);p.backend.smooth=list(src.backend.smooth);p.anchor(name+'_top',(0,0,0));nodes.append({'node':name,'source':source,'position':pos,'kind':kind})
  if kind:motion(p,kind,amplitude,axis)
  return p
 def landing(name,pos,w=2.4,d=2.8):
  p=P(name,pos,full.ctrl);inflatable(p,w,d,'cream' if len(nodes)%2 else 'mint');p.anchor(name+'_top',(0,0,0));nodes.append({'node':name,'position':pos,'kind':'landing'});return p
 landing('aqua_start',(0,-.4,0),4.5,3)
 for i,pos in enumerate([(-4.5,-.45,0),(-8.2,-.15,1.4),(-11.9,.15,-1.2)]):clone('aqua_approach_pad_'+str(i),'aqua_sink',pos,scale=(2.2/1.8,1,2.2/1.8))
 landing('aqua_ferry_departure',(-15.6,-.4,0));landing('aqua_ferry_arrival',(-30.7,-.4,0));clone('aqua_course_ferry','aqua_ferry',(-18.1,-.4,0),'cart',-10,'x')
 for z in [-1.55,1.55]:full.tube([(-15.6,-.52,z),(-23,-.65,z),(-30.7,-.52,z)],.025,'cream',0,8)
 for i in range(4):clone('aqua_course_sink_'+str(i),'aqua_sink',(-34.3-i*3.2,-.45,[0,-.7,.5,-.5][i]),'sink',-1.95)
 landing('aqua_bounce_departure',(-47.6,-.4,0),2.8,3.6);clone('aqua_course_trampoline_low','aqua_trampoline',(-50.4,-.55,0),'trampoline');landing('aqua_bounce_step',(-53.5,1.6,0),2.6,4.4);clone('aqua_course_trampoline_high','aqua_trampoline',(-55.9,1.45,0),'trampoline');landing('aqua_slide_tower',(-59,4,0),4,4)
 # Rounded slide trough with real edge tubes, end lip and trestle legs.
 clone('aqua_course_slide','aqua_slide',(-59,0,0))
 landing('aqua_slide_exit',(-59,-.4,15),4,3)
 for i,pos in enumerate([(-59,-.3,21.6),(-30.6,2,27.4)]):
  clone('aqua_course_sweeper_disc_'+str(i),'aqua_sweeper_disc',pos);spin=clone('aqua_course_sweeper_'+str(i),'aqua_sweeper',(pos[0],pos[1]+.60,pos[2]),'carousel');spin.ctrl.rotation_euler.z=pi/2 if i else 0
 landing('aqua_bridge_departure',(-59,-.4,27.6),4.8,2.8);landing('aqua_bridge_arrival',(-42.4,-.4,27.6),3.2,2.8)
 bridge=P('aqua_course_sack_bridge',(-50.1,-.4,27.6),full.ctrl);plank_deck(bridge,13,1.8,n=30)
 for x in [-5,-1.5,1.5,5]:
  for z in [-.7,.7]:bridge.tube([(x,-1.3,z),(x,-.18,z)],.12,'walnut',1,10)
 for i,x in enumerate([-53,-49.6,-46.2]):
  frame=P('aqua_course_sack_frame_'+str(i),(x,-.4,27.6),full.ctrl)
  for side in [-1,1]:frame.tube([(0,-.2,side*.98),(0,3.35,side*.98)],.12,'walnut',1,10)
  frame.beam((0,3.35,-1.10),(0,3.35,1.10),.20,.20);clone('aqua_course_pendulum_bag_'+str(i),'aqua_pendulum_bag',(x,2.75,27.6),'pendulum',.95,'x')
 clone('aqua_course_lift_frame','aqua_lift_frame',(-39.1,-.4,27.6));clone('aqua_course_lift','aqua_lift',(-39.1,-.4,27.6),'lift',3.6);landing('aqua_lift_arrival',(-35.4,3.2,27.6),4.8,3.6)
 for i,(x,y,z,w,d) in enumerate([(-27.4,.9,28,1.6,1.6),(-23.8,-.2,27.6,2.5,2.8)]):landing('aqua_descent_'+str(i),(x,y,z),w,d)
 clone('aqua_course_meet_ferry_a','aqua_ferry',(-21.3,-.2,27.6),'cart',4.8,'x');clone('aqua_course_meet_ferry_b','aqua_ferry',(-7.2,-.2,27.6),'cart',-7,'x');landing('aqua_finish',(-3.6,-.2,27.6),4.8,4)
 for z in [26.2,29]:full.tube([(-23.8,-.3,z),(-13.5,-.42,z),(-3.6,-.3,z)],.025,'cream',0,8)
 for name,pos in [('course_start',(0,-.4,0)),('course_finish',(-3.6,-.2,27.6)),('zone_ferry',(-23,-.4,0)),('zone_sinks',(-39,-.45,0)),('zone_bounces',(-54,2,0)),('zone_slide',(-59,2,8)),('zone_sweepers',(-59,-.3,21.6)),('zone_sacks',(-49.6,1,27.6)),('zone_lift',(-39.1,2.5,27.6)),('zone_final_ferries',(-12,-.2,27.6))]:full.anchor(name,pos)
 return {'planningOnly':True,'sourceLayout':'source/demos/modes/aqua-overview.js R3','originalCourseOrigin':[-32.6,9],'parts':nodes,'trampolines':2,'sweepers':2,'slide':True,'bridgeSacks':3,'meetingFerries':2,'motionNodes':dict(MOTIONS),'physicsAcceptance':False,'timingAuthority':'runtime source; GLB action clip is a mechanism demonstration, not server simulation'}
