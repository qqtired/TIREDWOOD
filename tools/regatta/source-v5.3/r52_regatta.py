"""Bounded R5.2 art correction after actual R5.1 critique; source-only/frozen.
Same water lines, camera nodes and collider reservation. No new map version.
Load after r5_regatta only for a root-granted v5.2 native build.
"""
R52_BASE_CLIFF=r5_cliff_land
R52_BASE_CONSOLIDATE=consolidate_overview
R52_BASE_STAGE=stage
R52_BASE_REGATTA=regatta_overview
R52_DETAILS=[]

def r5_cliff_green(g,mounds,field,route,branch):
 # R5.2 replaces scattered baseline cypress with three coherent groups below.
 return None

def r5_land_surface(g,name,bounds,field,route,branch,step=2):
 """Irregular large facets; discarded-cell cut stays below the water.
 The visible wetline is a field/water intersection, not the grid silhouette.
 """
 step=2.4 if 'cliff' in name else 1.8
 xmin,xmax,zmin,zmax=bounds;nx=math.ceil((xmax-xmin)/step);nz=math.ceil((zmax-zmin)/step)
 part=P(name,parent=g.ctrl);vertices=[];cells=[];edges={};checks=[];colours=[]
 for iz in range(nz+1):
  for ix in range(nx+1):
   jitter=0 if ix in [0,nx] or iz in [0,nz] else step*.24
   x=xmin+ix*step+jitter*sin(ix*17.72+iz*9.13);z=zmin+iz*step+jitter*cos(ix*7.61-iz*13.37)
   raw=field(x,z);margin=min(r5_distance(route,x,z)-R5_LAYOUT['water']['mainClearance'],r5_distance(branch,x,z)-R5_LAYOUT['water']['insideClearance'])
   # Both runtime local waterY0 and the art waterY0 cover the irregular cut.
   y=min(raw,-.35+max(0,raw+.35)*r5_smooth(0,2.8,margin));vertices.append((x,max(-.65,y),z))
 for iz in range(nz):
  for ix in range(nx):
   a=iz*(nx+1)+ix;ids=[a,a+1,a+nx+2,a+nx+1];corners=[vertices[i] for i in ids]
   if max(p[1] for p in corners)<-.54:continue
   samples=[(p[0],p[2]) for p in corners]+[((corners[k][0]+corners[(k+1)%4][0])/2,(corners[k][2]+corners[(k+1)%4][2])/2) for k in range(4)]+[(sum(p[0] for p in corners)/4,sum(p[2] for p in corners)/4)]
   main=min(r5_distance(route,x,z) for x,z in samples);inside=min(r5_distance(branch,x,z) for x,z in samples)
   if main<R5_LAYOUT['water']['mainClearance'] or inside<R5_LAYOUT['water']['insideClearance']:continue
   def area(tri):
    aa,bb,cc=[vertices[i] for i in tri];return (bb[0]-aa[0])*(cc[2]-aa[2])-(bb[2]-aa[2])*(cc[0]-aa[0])
   first=[(ids[0],ids[1],ids[2]),(ids[0],ids[2],ids[3])];second=[(ids[0],ids[1],ids[3]),(ids[1],ids[2],ids[3])]
   sf=min(area(t) for t in first);ss=min(area(t) for t in second)
   chosen=first if sf>0 and (ss<=0 or sin(ix*2.3+iz*3.1)>0) else second
   assert min(area(t) for t in chosen)>1e-6,'Irregular terrain cell inverted'
   cells.extend(chosen);checks.append((main,inside));colours.extend(['stone','stone'])
   for u,v in zip(ids,ids[1:]+ids[:1]):
    key=tuple(sorted((u,v)));edges[key]=(edges.get(key,(0,u,v))[0]+1,u,v)
 used=sorted({i for face in cells for i in face});remap={old:new for new,old in enumerate(used)};tops=[vertices[i] for i in used];countTop=len(tops)
 vv=tops+[(x,-.9,z) for x,y,z in tops];ff=[tuple(remap[i] for i in face) for face in cells];cc=list(colours)
 ff.extend(tuple(remap[i]+countTop for i in reversed(face)) for face in cells);cc.extend(['stone']*len(cells))
 for count,u,v in edges.values():
  if count==1:a=remap[u];b=remap[v];ff.append((a,b,b+countTop,a+countTop));cc.append('stone')
 part.poly(vv,ff,'stone',0,False)
 if ff:part.backend.colors[-len(ff):]=[(*COL[c],1) for c in cc]
 R5_FIELDS[name]=(field,step)
 return {'node':name,'irregularFacetStep':step,'vertexJitterFraction':.24,'topTriangles':len(cells),'weldedVolumeSource':True,'cutMaxYAtClearance':-.35,'wetline':'continuous field intersection with waterY0','minimumSampledMainClearance':min(c[0] for c in checks) if checks else None,'minimumSampledInsideClearance':min(c[1] for c in checks) if checks else None,'nativeGeometryAcceptance':False}

def r5_quay_pocket(g,name,poly,y):
 p=P(name,parent=g.ctrl);r4_land(p,poly,[(-.65,1),(y,1)],'stone')
 for a,b in zip(poly,poly[1:]+poly[:1]):
  if max(a[0],b[0])<-78:continue
  # One oriented continuous cap per shoreline segment, without projecting teeth.
  p.beam((a[0],y-.15,a[1]),(b[0],y-.15,b[1]),.36,.62,'cream',0)
 return p

def r52_rock(part,x,y,z,rx,rz,height,seed):
 vertices=[];faces=[];n=7
 for level,scale in [(0,.90),(.25,1),(.72,.87),(1,.63)]:
  for k in range(n):
   a=k*2*pi/n;rough=1+.12*sin(k*2.13+seed);vertices.append((x+rx*scale*rough*cos(a),y+height*level+height*.09*sin(k*1.77+seed)*level,z+rz*scale*rough*sin(a)))
 for layer in range(3):
  for k in range(n):a=layer*n+k;b=layer*n+(k+1)%n;faces.append((a,b,b+n,a+n))
 faces.extend([tuple(reversed(range(n))),tuple(3*n+k for k in range(n))]);part.poly(vertices,faces,'stone' if seed%2 else 'cream',0,False)

def r5_cliff_land(g,route,branch,cliffpath):
 check=R52_BASE_CLIFF(g,route,branch,cliffpath);field,step=R5_FIELDS['r5_natural_cliff_terrain'];selected=[]
 for target in [(88,-36),(58,-64),(18,-47),(16,0),(58,-7)]:
  candidates=[]
  for dx in range(-12,13,3):
   for dz in range(-12,13,3):
    x=target[0]+dx;z=target[1]+dz;y=field(x,z)
    if y<4 or r5_distance(route,x,z)<14 or r5_distance(branch,x,z)<10:continue
    if any(math.hypot(x-a,z-b)<18 for a,b in selected):continue
    slope=math.hypot(field(x+1,z)-field(x-1,z),field(x,z+1)-field(x,z-1))/2
    if slope>.55:continue
    candidates.append((math.hypot(dx,dz)+slope*5,x,z,y))
  if not candidates:continue
  score,x,z,y=min(candidates);selected.append((x,z));group=P('r52_rock_ledge_'+str(len(selected)),parent=g.ctrl)
  for k,(ox,oz,rx,rz,h) in enumerate([(-2.8,-1.0,2.7,2.0,2.6),(.8,1.8,2.0,2.6,3.1),(3.0,-1.4,2.3,1.8,2.1)]):
   xx=x+ox;zz=z+oz
   if r5_distance(route,xx,zz)<9.35+math.hypot(rx,rz)+.5 or r5_distance(branch,xx,zz)<5.25+math.hypot(rx,rz)+.5:continue
   ground=min(field(xx+u*rx,zz+v*rz) for u in [-1,1] for v in [-1,1]);r52_rock(group,xx,ground-.4,zz,rx,rz,h,len(selected)*3+k)
  if len(selected)<=3:
   green=P('r52_green_cluster_'+str(len(selected)),parent=g.ctrl)
   for k,(ox,oz,h) in enumerate([(-.5,.2,3.8),(2.2,2.5,4.7),(-2.0,2.8,3.0)]):
    xx=x+ox;zz=z+oz;yy=field(xx,zz)-.3;green.profile((xx,yy,zz),[(0,.15),(.6,.23)],'walnut',1,10);green.profile((xx,yy+.4,zz),[(0,.37),(h*.30,.65),(h*.78,.30),(h,.03)],'leaf',0,12)
   for k,(ox,oz) in enumerate([(-2.5,1),(1.5,-1),(3.5,2)]):xx=x+ox;zz=z+oz;green.blob((xx,field(xx,zz)+.45,zz),(1.3,.8,1.0),'olive',0,12,8,.08)
 R52_DETAILS.append({'largeRockGroups':len(selected),'greenGroups':min(3,len(selected)),'positions':selected,'nativeContactAcceptance':False});return check

def r5_lighthouse_land(g,poly):
 # Keep the new irregular mass entirely inside the previously measured D-envelope.
 centre=Vector((48.3,36));arc=[tuple(centre+(Vector(p)-centre)*(.94+.025*sin(i*1.83))) for i,p in enumerate(poly)]
 a=Vector(arc[-1]);b=Vector(arc[0]);left=[]
 for j in range(1,9):
  t=j/9;q=a*(1-t)+b*t;q.x+=.38*sin(pi*t)+.10*sin(3*pi*t);left.append(tuple(q))
 boundary=arc+left;n=len(boundary);vertices=[];faces=[];colours=[]
 for ring,(height,scale) in enumerate([(-.4,1),(.24,.98),(1.35,.76),(2.10,.55)]):
  for i,p in enumerate(boundary):q=centre+(Vector(p)-centre)*scale;vertices.append((q.x,height+(0 if ring==0 else .12*sin(i*1.57+ring)),q.y))
 for ring in range(3):
  for i in range(n):a=ring*n+i;b=ring*n+(i+1)%n;faces.append((a,b,b+n,a+n));colours.append('cream' if i%3 else 'stone')
 vertices.append((48.3,2.10,36));cap=len(vertices)-1
 for i in range(n):faces.append((cap,3*n+i,3*n+(i+1)%n));colours.append('olive')
 faces.append(tuple(reversed(range(n))));colours.append('stone');g.poly(vertices,faces,'stone',0,False);g.backend.colors[-len(faces):]=[(*COL[c],1) for c in colours]
 for i,(x,z,rx,rz,h) in enumerate([(47.4,30.5,.70,.9,1.15),(49,36,.75,1.1,.95),(47.6,42.5,.70,.9,1.1)]):r52_rock(g,x,-.28,z,rx,rz,h,i)
 # The existing lighthouse base remains at2.13 with a real supporting plinth.
 g.profile((48.3,1.98,36),[(0,1.04),(.15,1.04)],'stone',0,20)

def r5_draw_water_plan(g,route,branch):
 overlay=P('route_plan_overlay',parent=g.ctrl);overlay.ctrl['planOverlayOnly']=True;overlay.ctrl['defaultPlanVisible']=False
 strip(overlay,route,R5_LAYOUT['water']['mainWidth'],.04,'glass');strip(overlay,branch,R5_LAYOUT['water']['insideWidth'],.07,'water')

def consolidate_overview(name):
 if name!='regatta_full_course':return R52_BASE_CONSOLIDATE(name)
 root=bpy.data.objects[name];active=bpy.data.objects.get(name+'_geometry');meshes=[]
 for obj in root.children_recursive:
  if obj.type!='MESH':continue
  parent=obj.parent;excluded=False
  while parent and parent!=root:
   if parent.get('planOverlayOnly') or any(pose(parent.name,clip,.31) is not None for clip in ['idle','action','success','failure']):excluded=True;break
   parent=parent.parent
  if not excluded:meshes.append(obj)
 if active and len(meshes)>1:
  bpy.ops.object.select_all(action='DESELECT')
  for obj in meshes:obj.select_set(True)
  bpy.context.view_layer.objects.active=active;bpy.ops.object.join();root['static_meshes_merged']=len(meshes)

def stage(mid,root):
 result=R52_BASE_STAGE(mid,root)
 if mid!='regatta-course':return result
 scene=bpy.context.scene
 for obj in root.children_recursive:
  if obj.name=='route_plan_overlay' or obj.parent and obj.parent.name=='route_plan_overlay':obj.hide_render=True
 sky=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND');sky.inputs['Color'].default_value=(.24,.45,.80,1)
 if 'preview_day_sun' in bpy.data.objects:bpy.data.objects['preview_day_sun'].data.color=(1.0,.96,.88)
 # Match the component-local water surface used by the actual game placement.
 if 'preview_ground_geometry' in bpy.data.objects:
  obj=bpy.data.objects['preview_ground_geometry'];obj.location.z+=.15
 scene['route_overlay_art_hidden']=True;scene['r52_geometry_acceptance']=False;root['r52_source_details']=json.dumps(R52_DETAILS)
 return result

def regatta_overview():
 result=R52_BASE_REGATTA();result['revision']='R5.2 bounded coastal art correction, same route/cameras';result['artAcceptance']=False
 result['routePlanOverlay']={'node':'route_plan_overlay','defaultVisible':False,'extra':'planOverlayOnly','gameLoaderMustHideByDefault':True,'enableOnlyForPlanning':True};result['r52SourceDetails']=R52_DETAILS
 return result
