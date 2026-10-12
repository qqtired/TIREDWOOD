"""R5 construction source, pending a new native MCP slot and visual review.
Natural wide land masses and compact quay groups follow the actual R5 ImageGen
reference. The accepted main/inside water centrelines are unchanged.
"""
R5_REFERENCE='models/references/regatta-r5/regatta-r5-reference.png'
R5_LAYOUT=json.loads((BASE/'source/model-build/r5-layout.json').read_text())
R5_SEGMENTS={};R5_DISTANCES={};R5_FIELDS={}

def r5_smooth(a,b,value):
 t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def r5_mound(x,z,cx,cz,rx,rz,h):
 q=((x-cx)/rx)**2+((z-cz)/rz)**2
 return -.65 if q>=1 else -.35+h*(1-q)**.68

def r5_distance(path,x,z):
 key=(id(path),x,z)
 if key in R5_DISTANCES:return R5_DISTANCES[key]
 if id(path) not in R5_SEGMENTS:
  segments=[]
  for (ax,az),(bx,bz) in zip(path,path[1:]):
   dx=bx-ax;dz=bz-az;length=dx*dx+dz*dz
   if length>1e-12:segments.append((ax,az,dx,dz,1/length,min(ax,bx),max(ax,bx),min(az,bz),max(az,bz)))
  R5_SEGMENTS[id(path)]=segments
 best=1e30
 for ax,az,dx,dz,inverse,xmin,xmax,zmin,zmax in R5_SEGMENTS[id(path)]:
  lowerx=max(xmin-x,0,x-xmax);lowerz=max(zmin-z,0,z-zmax)
  if lowerx*lowerx+lowerz*lowerz>=best:continue
  t=max(0,min(1,((x-ax)*dx+(z-az)*dz)*inverse));xx=x-ax-dx*t;zz=z-az-dz*t;best=min(best,xx*xx+zz*zz)
 result=math.sqrt(best);R5_DISTANCES[key]=result;return result

def r5_inside_polygon(poly,x,z):
 inside=False
 for (ax,az),(bx,bz) in zip(poly,poly[1:]+poly[:1]):
  if (az>z)!=(bz>z) and x<(bx-ax)*(z-az)/(bz-az)+ax:inside=not inside
 return inside

def r5_supported_stairs(g,a,b,lo,hi,width=2.2):
 direction=(Vector(b)-Vector(a)).normalized();normal=Vector((-direction.y,direction.x));vertices=[]
 for point,height in [(a,lo-.10),(b,hi-.10)]:
  for side in [-1,1]:q=Vector(point)+normal*width*.5*side;vertices.append((q.x,height,q.y))
 for point in [a,b]:
  for side in [-1,1]:q=Vector(point)+normal*width*.5*side;vertices.append((q.x,lo-.45,q.y))
 g.poly(vertices,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],'stone',0,False)
 r4_stairs(g,a,b,lo,hi,width)

def r5_land_surface(g,name,bounds,field,route,branch,step=2.0):
 """Closed shared-vertex terrain, clipped away from both water corridors.
 Faceted top planes make broad geological forms; no extruded C-wall shell.
 All cell corners/edge midpoints/centre must pass water clearance checks.
 """
 xmin,xmax,zmin,zmax=bounds;nx=math.ceil((xmax-xmin)/step);nz=math.ceil((zmax-zmin)/step)
 part=P(name,parent=g.ctrl);vertices=[];cells=[];colours=[];edges={};checks=[]
 for iz in range(nz+1):
  for ix in range(nx+1):
   x=xmin+ix*step;z=zmin+iz*step;y=field(x,z);vertices.append((x,max(-.65,y),z))
 for iz in range(nz):
  for ix in range(nx):
   a=iz*(nx+1)+ix;ids=[a,a+1,a+nx+2,a+nx+1];corners=[vertices[i] for i in ids]
   if max(p[1] for p in corners)<-.54:continue
   samples=[(p[0],p[2]) for p in corners]+[((corners[k][0]+corners[(k+1)%4][0])/2,(corners[k][2]+corners[(k+1)%4][2])/2) for k in range(4)]+[(xmin+(ix+.5)*step,zmin+(iz+.5)*step)]
   main=min(r5_distance(route,x,z) for x,z in samples);inside=min(r5_distance(branch,x,z) for x,z in samples)
   if main<R5_LAYOUT['water']['mainClearance'] or inside<R5_LAYOUT['water']['insideClearance']:continue
   checks.append((main,inside));cells.extend([(ids[0],ids[1],ids[2]),(ids[0],ids[2],ids[3])])
   height=sum(p[1] for p in corners)/4;slope=(max(p[1] for p in corners)-min(p[1] for p in corners))/step
   colour='sandwet' if height<.30 else 'sand' if height<1.1 else 'olive' if height>3.4 and slope<.63 else 'cream' if slope>.8 else 'stone'
   for k in range(2):colours.append(colour)
   for u,v in zip(ids,ids[1:]+ids[:1]):
    key=tuple(sorted((u,v)));edges[key]=(edges.get(key,(0,u,v))[0]+1,u,v)
 used=sorted({i for face in cells for i in face});remap={old:new for new,old in enumerate(used)}
 tops=[vertices[i] for i in used];countTop=len(tops);volumeVertices=tops+[(x,-.9,z) for x,y,z in tops]
 volumeFaces=[tuple(remap[i] for i in face) for face in cells];faceColours=list(colours)
 # Bottom faces follow only occupied terrain cells, not a huge whole-world slab.
 volumeFaces.extend(tuple(remap[i]+countTop for i in reversed(face)) for face in cells);faceColours.extend(['stone']*len(cells))
 # Exposed sides reuse the same top/bottom indices to form a welded volume.
 for count,u,v in edges.values():
  if count!=1:continue
  a=remap[u];b=remap[v];volumeFaces.append((a,b,b+countTop,a+countTop));faceColours.append('stone')
 part.poly(volumeVertices,volumeFaces,'stone',0,False)
 if volumeFaces:part.backend.colors[-len(volumeFaces):]=[(*COL[colour],1) for colour in faceColours]
 R5_FIELDS[name]=(field,step)
 return {'node':name,'stepM':step,'topTriangles':len(cells),'volumeFaces':len(volumeFaces),'weldedVolumeSource':True,'minimumSampledMainClearance':min(c[0] for c in checks) if checks else None,'minimumSampledInsideClearance':min(c[1] for c in checks) if checks else None,'waterAcceptance':'construction samples only; full collision validation still pending'}

def r5_cliff_land(g,route,branch,cliffpath):
 # Overlapping broad mounds create genuine terrain depth. Variable centres,
 # heights and footprints break the regularity of the rejected C extrusions.
 mounds=[];travel=0;last=Vector(cliffpath[0])
 for i in range(3,len(cliffpath)-5,11):
  p=Vector(cliffpath[i]);t=(Vector(cliffpath[min(i+2,len(cliffpath)-1)])-Vector(cliffpath[max(0,i-2)])).normalized()
  for side in [-1,1]:
   normal=Vector((-t.y,t.x))*side;offset=23+3*sin(i*.31+side);centre=p+normal*offset
   h=11.5+4*sin(i*.27+side*.6)+2*cos(i*.11)
   mounds.append((centre.x,centre.y,21+3*sin(i*.19),25+4*cos(i*.17),h))
 def field(x,z):
  value=max((r5_mound(x,z,*m) for m in mounds),default=-.65)
  if value<=-.6:return -.65
  d=r5_distance(route,x,z);rough=.65*sin(x*.27+z*.14)+.42*cos(x*.43-z*.23)
  # Preserve a low shore shelf, rising into broad irregular rock shoulders.
  shelf=.15+.18*sin(z*.31+x*.14)
  y=shelf+(value+rough-shelf)*r5_smooth(11.3,18.0,d)
  # The downstream headland lowers before the fork: the beacon stays visible.
  endfade=1-.90*r5_smooth(-7,13,z)
  return max(-.65,min(y,value+rough)*endfade)
 check=r5_land_surface(g,'r5_natural_cliff_terrain',(-26,120,-100,26),field,route,branch,1.25)
 r5_cliff_green(g,mounds,field,route,branch)
 return check

def r5_cliff_green(g,mounds,field,route,branch):
 # V5.1 baseline vegetation; the bounded R5.2 variant supplies cohesive groups.
 for i,(x,z,rx,rz,h) in enumerate(mounds):
  if i%3:continue
  y=field(x,z)
  if y<3 or r5_distance(route,x,z)<12 or r5_distance(branch,x,z)<6:continue
  g.profile((x,y-.10,z),[(0,.32),(1.0,.66),(3.2,.30),(4.2,.04)],'leaf',0,12)

def apply_r5_terrain_colour():
 """Continuous corner colours remove square painted patches on the hill grid."""
 for name,(field,step) in R5_FIELDS.items():
  obj=next(o for o in PARTS[name].ctrl.children if o.type=='MESH');mesh=obj.data;attribute=mesh.color_attributes.get('Color');vertexColours=[];epsilon=step*.35
  for vertex in mesh.vertices:
   x,y,z=vertex.co.x,vertex.co.z,-vertex.co.y
   dx=(field(x+epsilon,z)-field(x-epsilon,z))/(2*epsilon);dz=(field(x,z+epsilon)-field(x,z-epsilon))/(2*epsilon);slope=math.hypot(dx,dz)
   base=COL['sandwet'] if y<.25 else COL['sand'] if y<1.0 else COL['cream'];grass=r5_smooth(2.5,5.0,y)*(1-r5_smooth(.55,1.10,slope))
   colour=tuple(base[i]*(1-grass)+COL['olive'][i]*grass for i in range(3));vertexColours.append((*colour,1))
  for loop in mesh.loops:attribute.data[loop.index].color=vertexColours[loop.vertex_index]

def r5_quay_pocket(g,name,poly,y):
 # A shallow local quay, not a stepped peninsula. Natural ground behind it.
 p=P(name,parent=g.ctrl);r4_land(p,poly,[(-.65,1),(y,1)],'stone')
 for a,b in zip(poly,poly[1:]+poly[:1]):
  if max(a[0],b[0])< -78:continue
  direction=Vector(b)-Vector(a);n=max(1,math.ceil(direction.length/1.6))
  for j in range(n):
   q=Vector(a)+direction*(j+.5)/n;p.box((q.x,y-.28,q.y),(1.55,.45,.75),'cream',0)
 return p

def r5_harbour(g,route,branch):
 # Three overlapping low natural neighbourhood masses have broken shorelines.
 pockets=[(p['id'],p['footprint'],p['topY']) for p in R5_LAYOUT['quayPockets']]
 def ground(x,z):
  mounds=[(-97,-32,21,27,3.5),(-95,-4,20,24,4.5),(-93,22,20,20,2.8)]
  value=max(r5_mound(x,z,*m) for m in mounds)
  if x>-77.4+.8*sin(z*.20):return -.65
  y=value+.25*sin(x*.23+z*.31) if value>-.60 else -.65
  # Natural terrain must never bury a shop entrance or a local quay top.
  for name,poly,height in pockets:
   if r5_inside_polygon(poly,x,z):y=min(y,height-.14)
  for xx,zz,height in [(-94,-44,2.20),(-94,-26,2.85),(-94,-14,2.85)]:
   if abs(x-xx)<4.3 and abs(z-zz)<3.9:y=min(y,height-.14)
  return y
 check=r5_land_surface(g,'r5_harbour_natural_ground',(-120,-75,-64,45),ground,route,branch,1.5)
 for name,poly,y in pockets:r5_quay_pocket(g,name,poly,y)
 buildings=[(p['id'],p['asset'],p['position'],p['yaw']) for p in R5_LAYOUT['buildings']]
 for name,asset,pos,yaw in buildings:
  if name.startswith('cabin'):
   x,y,z=pos;r4_land(g,[(x-4,z-3.6),(x+4,z-3.6),(x+4.2,z+3.6),(x-3.8,z+3.7)],[(-.65,1),(y,1)],'stone')
  reuse_asset('game-opus/client/assets/plaza3/'+asset+'.glb','r5_port_'+name,g.ctrl,pos,yaw)
 # Short staircase pockets connect individual groups and the actual low quay.
 r5_supported_stairs(g,(-87.5,-31),(-92,-31),.76,2.85,2.2)
 r5_supported_stairs(g,(-88,-48),(-92,-48),.74,2.20,2.2)
 for definition in R5_LAYOUT['docks']:
  if definition['id']=='r5_repair_dock':continue
  name=definition['id'];pos=definition['position'];w=definition['width'];d=definition['depth']
  dock=P(name,pos,g.ctrl);plank_deck(dock,w,d)
  for x in [-w/2+.3,w/2-.3]:
   for z in [-d/2+.3,d/2-.3]:dock.tube([(x,-1.5,z),(x,.55,z)],.13,'walnut',1,10);dock.ring((x,.35,z),.14,.025,'cream',0,'y',12)
 repairSpec=next(p for p in R5_LAYOUT['docks'] if p['id']=='r5_repair_dock');repair=P(repairSpec['id'],repairSpec['position'],g.ctrl);plank_deck(repair,repairSpec['width'],repairSpec['depth'])
 for x in [-2.65,2.65]:repair.beam((x,0,-1.5),(x,2.6,-1.5),.16,.18)
 repair.beam((-2.75,2.6,-1.5),(2.75,2.6,-1.5),.18,.22);repair.poly([(-2.9,2.65,-1.7),(2.9,2.65,-1.7),(2.9,2.4,1.7),(-2.9,2.4,1.7)],[(0,1,2,3)],'mint',0)
 for i,(boat,x,z,yaw) in enumerate([('volzhanka',-74,-42,0),('northsilver',-74,-22,0),('albakor',-74,6,0),('albakor',-79.3,-48,pi/2)]):
  reuse_asset('game-opus/client/assets/ownboats/'+boat+'_lod1.glb','r5_moored_'+str(i),g.ctrl,(x,-.02 if i<3 else 1.30,z),yaw)
 # Green edges/benches frame real shop doors; they do not fill empty terrain.
 for i,(x,y,z) in enumerate([(-79,.76,-28),(-79,.76,-17),(-78,.74,13),(-92,2.85,-20)]):
  reuse_asset('game-opus/client/assets/plaza3/kit_green.glb','r5_door_oleander_'+str(i),g.ctrl,(x,y,z),node='planter_oleander')
  if i<2:reuse_asset('game-opus/client/assets/plaza3/kit_street.glb','r5_cafe_bench_'+str(i),g.ctrl,(x-.5,y,z+1.5),-pi/2,node='bench')
 return {'terrain':check,'buildingCount':len(buildings),'quayPockets':len(pockets),'quayHeights':[.72,.74],'upperLocalPads':[2.20,2.85]}

def r5_draw_water_plan(g,route,branch):
 strip(g,route,R5_LAYOUT['water']['mainWidth'],-.025,'glass');strip(g,branch,R5_LAYOUT['water']['insideWidth'],.025,'water')

def r5_lighthouse_land(g,poly):
 r4_land(g,poly,[(-.6,1),(.35,1),(1.9,.80),(2.1,.76)],'stone')
 centre=Vector((48.3,36));green=[tuple(centre+(Vector(p)-centre)*.67) for p in poly];g.poly([(x,2.115,z) for x,z in green],[tuple(range(len(green)))],'olive',0,False)

def regatta_overview():
 g=P('regatta_full_course',R5_LAYOUT['fullComponentDisplayOffset']);route,cliffpath,arcs=r4_route();branchControls=R5_LAYOUT['insideBranchControls'];branch=r4_inner_fillet(branchControls,R5_LAYOUT['water']['insideRadius'])
 r5_draw_water_plan(g,route,branch)
 harbour=r5_harbour(g,route,branch);terrain=r5_cliff_land(g,route,branch,cliffpath)
 # Bridge keeps its existing clear 21m water opening and >=5.5m underside.
 bridge=P('r5_cliff_bridge',(46,0,-34),g.ctrl)
 for z in [-11.5,11.5]:
  bridge.box((0,6.3,z),(2.6,12.6,2.0),'stone',0);bridge.box((0,12.8,z),(3.1,.4,2.6),'cream',0)
 for x in [-1.1,1.1]:bridge.beam((x,13,-13),(x,13,13),.22,.45,'walnut',1)
 for i in range(29):bridge.box((0,13.28,-13+(i+.5)*26/29),(2.8,.16,26/29-.02),'woodhi' if i%3 else 'wood',1)
 for x in [-1.28,1.28]:
  for z in range(-12,13,3):bridge.tube([(x,13.3,z),(x,14.2,z)],.05,'walnut',1,8)
  bridge.tube([(x,14,-13),(x,13.8,0),(x,14,13)],.04,'cream',0,8)
 # Same measured D-islet separation, with natural low skirts and a grassy cap.
 limit=math.acos((46.2-36)/14.6);poly=[(36+14.6*cos(-limit+2*limit*j/40),36+14.6*sin(-limit+2*limit*j/40)) for j in range(41)];safe=[(36+24*cos(-pi/2+pi*j/100),36+24*sin(-pi/2+pi*j/100)) for j in range(101)]
 checks=[{'point':[x,z],'safeDistance':r4_distance(safe,x,z),'innerDistance':r4_distance(branch,x,z)} for x,z in poly]
 assert min(p['safeDistance'] for p in checks)>9.2 and min(p['innerDistance'] for p in checks)>5.15
 r5_lighthouse_land(g,poly)
 beacon=P('r5_small_lighthouse',(48.3,2.13,36),g.ctrl);beacon.profile((0,0,0),[(0,.95),(4.8,.69),(5,.83)],'cream',0,24);beacon.profile((0,2.4,0),[(0,.82),(.65,.78)],'coral',0,24);beacon.profile((0,5,0),[(0,1.1),(.16,1.1)],'walnut',1,24)
 for i in range(8):a=i*pi/4;beacon.tube([(.84*cos(a),5.16,.84*sin(a)),(.84*cos(a),6.35,.84*sin(a))],.045,'walnut',1,8)
 beacon.blob((0,5.7,0),(.23,.35,.23),'copper',2,14,8);beacon.profile((0,6.35,0),[(0,1.2),(.65,.02)],'terracotta',0,24)
 for name,pos,half in [('r5_risk_gate',(40.48,0,36),5.7),('r5_merge_marker',(27,0,60),9.5)]:
  gate=P(name,pos,g.ctrl)
  if 'merge' in name:gate.ctrl.rotation_euler.z=pi/2
  for x in [-half,half]:gate.profile((x,-.12,0),[(0,.32),(.7,.28),(3.4,.08)],'cream',0,14);gate.box((x,2.8,0),(.5,.4,.08),'coral',0)
  # The streamer is attached to the outer stake and points away from water.
  # It is not a floating centre icon or a low barrier above the boat lane.
  flag=motion(P(name+'_streamer',(half,3.2,0),gate.ctrl),'sail',.15,'z');flag.poly([(0,0,0),(1.2,0,0),(.85,-.6,.02),(0,-.6,.02)],[(0,1,2,3)],'mint',0)
 for i in range(0,len(route)-1,12):
  x,z=route[i];t=(Vector(route[min(i+1,len(route)-1)])-Vector(route[max(0,i-1)])).normalized()
  for side in [-1,1]:
   xx=x-side*t.y*9.55;zz=z+side*t.x*9.55
   if r5_distance(branch,xx,zz)<5.65 or r5_distance(route,xx,zz)<9.50:continue
   g.profile((xx,-.13,zz),[(0,.26),(.12,.27),(.92,.08)],'cream',0,12);g.profile((xx,.3,zz),[(0,.18),(.24,.14)],'coral',0,12)
 anchors=R5_LAYOUT['anchors']
 for name,pos in anchors.items():g.anchor(name,pos)
 return {'planningOnly':True,'revision':'R5 natural landscape/compact harbour, third product iteration','reference':R5_REFERENCE,'referenceSha256':hashlib.sha256((BASE/R5_REFERENCE).read_bytes()).hexdigest(),'route':route,'arcs':arcs,'laneWidth':18,'innerBranchWidth':10,'innerBranch':branch,'innerBranchFilletRadius':6,'harbour':harbour,'naturalTerrain':terrain,'zoneAnchors':anchors,'bridgeUnderside':12.775,'bridgeWaterOpening':21,'lighthouseLandChecks':checks,'reusedGeometry':list(REUSED),'physicsAcceptance':False,'geometryAcceptance':'pending actual native export and near-camera critique'}
