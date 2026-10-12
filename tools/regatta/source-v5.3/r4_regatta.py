"""Substantive Regatta world source after V2 rejection. Native MCP only.
Seven real 22/24m curves, harbour quarter, continuous S-channel cliffs and a
physically separate lighthouse fork. Playable ellipse and game files untouched.
"""
def r4_route():
 path=[];cliffs=[];arcs=[]
 def line(a,b):
  n=max(1,math.ceil((Vector(b)-Vector(a)).length/2));pts=[tuple(Vector(a)*(1-j/n)+Vector(b)*j/n) for j in range(n)]
  path.extend(pts);return pts
 def arc(cx,cz,r,start,end):
  n=math.ceil(abs(end-start)*r/1.5);pts=[(cx+r*cos(start+(end-start)*j/n),cz+r*sin(start+(end-start)*j/n)) for j in range(n)]
  path.extend(pts);arcs.append({'centre':[cx,cz],'radius':r,'start':start,'end':end});return pts
 line((-62,36),(-62,-64));arc(-38,-64,24,pi,3*pi/2);line((-38,-88),(54,-88));arc(54,-64,24,-pi/2,0);line((78,-64),(78,-56))
 cliffs+=arc(56,-56,22,0,pi/2);cliffs+=line((56,-34),(34,-34));cliffs+=arc(34,-12,22,-pi/2,-pi);cliffs+=arc(36,-12,24,pi,pi/2)
 arc(36,36,24,-pi/2,pi/2);line((36,60),(-38,60));arc(-38,36,24,pi/2,pi);path.append(path[0]);cliffs.append((36,12))
 return path,cliffs,arcs
def r4_distance(points,x,z):
 p=Vector((x,z));best=1e9
 for aa,bb in zip(points,points[1:]):
  a=Vector(aa);b=Vector(bb);d=b-a
  if d.length_squared<1e-9:continue
  u=max(0,min(1,(p-a).dot(d)/d.length_squared));best=min(best,(p-a-d*u).length)
 return best
def r4_inner_fillet(points,radius=6):
 arcs=[]
 for i in range(1,len(points)-1):
  a=Vector(points[i-1]);p=Vector(points[i]);b=Vector(points[i+1]);u=(p-a).normalized();v=(b-p).normalized();turn=math.atan2(u.x*v.y-u.y*v.x,u.dot(v));distance=radius*math.tan(abs(turn)/2);entry=p-u*distance;exit=p+v*distance;sign=1 if turn>0 else -1;centre=entry+Vector((-u.y,u.x))*sign*radius;start=math.atan2(entry.y-centre.y,entry.x-centre.x);arcs.append((entry,exit,centre,start,turn))
 out=[tuple(points[0])]
 for entry,exit,centre,start,turn in arcs:
  last=Vector(out[-1]);n=max(1,math.ceil((entry-last).length/.8));out.extend(tuple(last*(1-j/n)+entry*j/n) for j in range(1,n+1));n=max(2,math.ceil(abs(turn)*radius/.8));out.extend((centre.x+radius*cos(start+turn*j/n),centre.y+radius*sin(start+turn*j/n)) for j in range(1,n+1))
 last=Vector(out[-1]);end=Vector(points[-1]);n=max(1,math.ceil((end-last).length/.8));out.extend(tuple(last*(1-j/n)+end*j/n) for j in range(1,n+1));return out
def r4_land(g,poly,levels,colour='stone'):
 """Closed terraced land; levels=(Y,uniformScale) around the polygon centroid."""
 centre=Vector(((min(p[0] for p in poly)+max(p[0] for p in poly))/2,(min(p[1] for p in poly)+max(p[1] for p in poly))/2));n=len(poly);v=[];f=[]
 for y,s in levels:
  sx,sz=s if isinstance(s,tuple) else (s,s)
  for p in poly:q=Vector(p)-centre;q=centre+Vector((q.x*sx,q.y*sz));v.append((q.x,y,q.y))
 for j in range(len(levels)-1):
  for k in range(n):a=j*n+k;b=j*n+(k+1)%n;f.append((a,b,b+n,a+n))
 f.extend([tuple(range(n)),tuple(reversed([(len(levels)-1)*n+k for k in range(n)]))]);g.poly(v,f,colour,0)
def r4_bank(g,path,side):
 """A continuous connected cliff mass with a clear 18m channel beside it."""
 rows=[];v=[];f=[]
 for i,(x,z) in enumerate(path):
  t=(Vector(path[min(i+1,len(path)-1)])-Vector(path[max(0,i-1)])).normalized();normal=Vector((-t.y,t.x))*side;h=14+5*sin(i*.045)+2*sin(i*.11);rows.append((x,z,t,normal,h))
  for distance,y in [(9.8,-.6),(10.1,h*.46),(11.2,h),(19.5,h+.7),(20,-.6)]:v.append((x+normal.x*distance,y,z+normal.y*distance))
 for i in range(len(path)-1):
  for k in range(5):a=i*5+k;b=i*5+(k+1)%5;f.append((a,b,b+5,a+5))
 f.extend([tuple(reversed(range(5))),tuple((len(path)-1)*5+k for k in range(5))]);g.poly(v,f,'cream' if side==1 else 'stone',0)
 # Broad geological ledges and sparse cypress on the top, not loose boulders.
 for i in range(4,len(rows)-4,13):
  x,z,t,n,h=rows[i];g.beam((x+n.x*10.4,h*.46,z+n.y*10.4),(x+n.x*17,h*.46,z+n.y*17),.60,.48,'stone',0)
  if i%26==4:
   xx=x+n.x*16;zz=z+n.y*16;g.profile((xx,h+.3,zz),[(0,.36),(1.2,.48),(3.7,.12),(4,.025)],'leaf',0,12)
def r4_stairs(g,a,b,lo,hi,width=3.0):
 n=max(1,math.ceil(abs(hi-lo)/.25));v=Vector(b)-Vector(a);t=v.normalized();normal=Vector((-t.y,t.x));length=v.length/n
 for j in range(n):
  centre=Vector(a)+v*(j+.5)/n;y=lo+(hi-lo)*(j+1)/n;pts=[]
  for yy in [y-.25,y]:
   for along,across in [(-1,-1),(1,-1),(1,1),(-1,1)]:q=centre+t*along*length*.49+normal*across*width/2;pts.append((q.x,yy,q.y))
  g.poly(pts,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'stone',0)
def regatta_overview():
 g=P('regatta_full_course',(0,0,-170));route,cliffpath,arcs=r4_route();strip(g,route,18,-.012,'glass');branchControls=[(36,12),(41,15),(41,23),(40,48),(39,56),(36,60)];branch=r4_inner_fillet(branchControls,6);strip(g,branch,10,.012,'water');placementChecks=[]
 # Western coast: three real levels and visible stairs form a harbour town.
 coast=[(-124,-94),(-76,-94),(-75,-53),(-75,-20),(-76,20),(-80,43),(-95,70),(-124,76)];r4_land(g,coast,[(-.6,1),(.5,1),(.5,(.68,1)),(3.5,(.68,1)),(3.5,(.18,1)),(7.5,(.18,1))],'stone')
 quay=P('r4_harbour_lower_quay',(-78.5,.52,-24),g.ctrl);plank_deck(quay,6.5,57,n=20)
 for z in range(-51,5,4):reuse_asset('game-opus/client/assets/plaza3/kit_embankment.glb','r4_quay_'+str(z),g.ctrl,(-75.5,.5,z),-pi/2,node='quay_wall_2m')
 r4_stairs(g,(-81.1,-17),(-81.1,-8),.52,3.52);r4_stairs(g,(-93.4,-41),(-93.4,-29),3.52,7.52)
 for name,x,y,z,w in [('r4_middle_stair_landing',-82.6,3.54,-8,3.4),('r4_upper_stair_landing',-95.0,7.54,-29,3.5)]:landing=P(name,(x,y,z),g.ctrl);plank_deck(landing,w,3)
 buildings=[
  ('cafe','game-opus/client/assets/plaza3/pav_cafe.glb',(-88.5,3.52,-28),-pi/2),
  ('fishyard','game-opus/client/assets/plaza3/pav_fishyard.glb',(-88.0,3.52,-56),-pi/2),
  ('veranda','game-opus/client/assets/plaza3/pav_cardveranda.glb',(-78.5,.52,13),-pi/2),
  ('cabin1','game-opus/client/assets/plaza3/pav_cabins.glb',(-100,7.52,-52),-.08),
  ('cabin2','game-opus/client/assets/plaza3/pav_cabins.glb',(-100,7.52,-28),.08),
  ('cabin3','game-opus/client/assets/plaza3/pav_cabins.glb',(-100,7.52,-6),-pi/2),
  ('clubhouse','game-opus/client/assets/plaza3/pav_billiards.glb',(-88.5,3.52,29),-pi/2)
 ]
 for name,src,pos,yaw in buildings:reuse_asset(src,'r4_port_'+name,g.ctrl,pos,yaw)
 # Actual boat-pier plus two smaller fingers and a distinct maintenance dock.
 reuse_asset('game-opus/client/assets/ownboats/boat-pier.glb','r4_port_boatpier',g.ctrl,(-88,.52,-17),pi/2,(.85,1,.7))
 for i,z in enumerate([-40,-3]):
  finger=P('r4_dock_finger_'+str(i),(-81,.52,z),g.ctrl);plank_deck(finger,12.4,3.6)
  for x in [-5.5,5.5]:
   for zz in [-1.3,1.3]:finger.tube([(x,-1.5,zz),(x,.55,zz)],.14,'walnut',1,10);finger.ring((x,.36,zz),.16,.026,'cream',0,'y',12)
 repair=P('r4_repair_dock',(-78.5,.52,-65),g.ctrl);plank_deck(repair,6,8)
 for x in [-3.8,3.8]:repair.beam((x,0,2),(x,3.3,2),.18,.18)
 repair.beam((-4,3.3,2),(4,3.3,2),.22,.24);repair.poly([(-4,3.3,2),(4,3.3,2),(4,2.9,-2),(-4,2.9,-2)],[(0,1,2,3)],'mint',0)
 moorings=[('volzhanka',-73.6,-39,0),('albakor',-74.0,-27,0),('northsilver',-74.1,-10,0),('volzhanka',-79.5,6,pi/2),('albakor',-81.5,-68,pi/2)]
 for i,(boat,x,z,yaw) in enumerate(moorings):reuse_asset('game-opus/client/assets/ownboats/'+boat+'_lod1.glb','r4_moored_'+str(i),g.ctrl,(x,-.02,z) if i<4 else (-78.5,1.13,-65),yaw)
 for i,z in enumerate([-49,-32,-18,2]):
  reuse_asset('game-opus/client/assets/plaza3/kit_green.glb','r4_oleander_'+str(i),g.ctrl,(-84,3.52,z),node='planter_oleander');reuse_asset('game-opus/client/assets/plaza3/kit_street.glb','r4_bench_'+str(i),g.ctrl,(-84.5,3.52,z),-pi/2,node='bench')
 # Two connected stratified cliff banks create a real shaded S-channel.
 r4_bank(g,cliffpath,1);r4_bank(g,cliffpath,-1)
 bridge=P('r4_cliff_bridge',(46,0,-34),g.ctrl)
 for z in [-11.5,11.5]:
  bridge.box((0,6.3,z),(2.6,12.6,2.0),'stone',0);bridge.box((0,12.8,z),(3.1,.4,2.6),'cream',0)
 for x in [-1.1,1.1]:bridge.beam((x,13.0,-13),(x,13.0,13),.22,.45,'walnut',1)
 for i in range(29):z=-13+(i+.5)*26/29;bridge.box((0,13.28,z),(2.8,.16,26/29-.02),'woodhi' if i%3 else 'wood',1)
 for x in [-1.28,1.28]:
  for z in range(-12,13,3):bridge.tube([(x,13.3,z),(x,14.2,z)],.050,'walnut',1,8)
  bridge.tube([(x,14,-13),(x,13.8,0),(x,14,13)],.040,'cream',0,8)
 # Real D-islet: radius 14.6 stays 9.4m from safe centreline. Inner bank is
 # clipped at X46.2, with every shoreline vertex measured against both paths.
 limit=math.acos((46.2-36)/14.6);poly=[(36+14.6*cos(-limit+2*limit*j/40),36+14.6*sin(-limit+2*limit*j/40)) for j in range(41)]
 safe=[(36+24*cos(-pi/2+pi*j/100),36+24*sin(-pi/2+pi*j/100)) for j in range(101)]
 for x,z in poly:placementChecks.append({'point':[round(x,4),round(z,4)],'safeDistance':r4_distance(safe,x,z),'innerDistance':r4_distance(branch,x,z)})
 assert min(p['safeDistance'] for p in placementChecks)>9.2,'D-islet overlaps safe water'
 assert min(p['innerDistance'] for p in placementChecks)>5.15,'D-islet overlaps risk water'
 r4_land(g,poly,[(-.6,1),(.4,1),(2.5,.82)],'stone');beacon=P('r4_small_lighthouse',(48.3,2.5,36),g.ctrl)
 beacon.profile((0,0,0),[(0,.95),(4.8,.69),(5.0,.83)],'cream',0,24);beacon.profile((0,2.4,0),[(0,.82),(.65,.78)],'coral',0,24);beacon.profile((0,5,0),[(0,1.1),(.16,1.1)],'walnut',1,24)
 for i in range(8):a=i*pi/4;beacon.tube([(.84*cos(a),5.16,.84*sin(a)),(.84*cos(a),6.35,.84*sin(a))],.045,'walnut',1,8)
 beacon.blob((0,5.7,0),(.23,.35,.23),'copper',2,14,8);beacon.profile((0,6.35,0),[(0,1.2),(.65,.02)],'terracotta',0,24)
 # High risk gate brackets the true inside channel; boost is beyond reunion.
 for name,pos in [('r4_risk_gate',(40.5,0,21)),('r4_merge_marker',(27,0,60))]:
  gate=P(name,pos,g.ctrl)
  half=9.5 if name=='r4_merge_marker' else 5.5
  if name=='r4_merge_marker':gate.ctrl.rotation_euler.z=pi/2
  for x in [-half,half]:gate.profile((x,-.12,0),[(0,.32),(.7,.28),(4,.08)],'cream',0,14);gate.box((x,2.9,0),(.55,.45,.08),'coral',0)
  flag=motion(P(name+'_streamer',(0,3.6,0),gate.ctrl),'sail',.15,'z');flag.poly([(-1,0,0),(1,0,0),(.65,-.6,.02),(-.65,-.6,.02)],[(0,1,2,3)],'mint',0)
 for i in range(0,len(route)-1,12):
  x,z=route[i];t=(Vector(route[min(i+1,len(route)-1)])-Vector(route[max(0,i-1)])).normalized()
  for side in [-1,1]:xx=x-side*t.y*9.2;zz=z+side*t.x*9.2;g.profile((xx,-.13,zz),[(0,.26),(.12,.27),(.92,.08)],'cream',0,12);g.profile((xx,.3,zz),[(0,.18),(.24,.14)],'coral',0,12)
 anchors={'zone_marina':(-62,0,-28),'zone_cliffs':(46,0,-34),'zone_lighthouse':(48.3,0,36),'inner_line':(40.5,0,36),'outer_line':(60,0,36),'fork_entry':(36,0,12),'fork_exit':(36,0,60),'game_camera_marina':(-62,3,-22),'game_look_marina':(-62,.6,-49),'game_camera_cliffs':(72.9,3,-40.7),'game_look_cliffs':(49,.6,-32),'game_camera_lighthouse':(20,3,12),'game_look_lighthouse':(43,.6,32)}
 for name,pos in anchors.items():g.anchor(name,pos)
 return {'planningOnly':True,'revision':'substantive R4 world, third product iteration','route':route,'cornerCount':len(arcs),'arcs':arcs,'laneWidth':18,'innerBranchWidth':10,'innerBranch':branch,'innerBranchControls':branchControls,'innerBranchFilletRadius':6,'zoneAnchors':anchors,'portBuildingCount':7,'portLevels':[.5,3.5,7.5],'continuousCliffBanks':2,'bridgeUnderside':12.775,'bridgeWaterOpening':21,'lighthouseLandChecks':placementChecks,'reusedGeometry':list(REUSED),'physicsAcceptance':False,'note':'The playable control ellipse is unchanged; this authored world still needs low camera critique and full collision/timing work.'}
