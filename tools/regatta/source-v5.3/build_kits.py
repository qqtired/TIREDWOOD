"""Six modular product-lab sets. Invoke through real headless Blender MCP only.
All references inspected: original six mode boards and three new social boards.
Canonical axes are GLB metres/+Y up/-Z front; Part handles Blender conversion.
"""
exec(compile(open('/Users/tired/Desktop/tired.solutions/reports/tiredwood-product-lab-v2-2026-10-12/source/model-build/labcore.py').read(),'labcore.py','exec'))
NAMES={'regatta-course':'Новый курс регаты','tower-course':'Каланча: проверяемые уступы','aqua-kit':'Модули аквапарка','social-picnic':'Не урони праздник','social-theatre':'Театр и джем','social-beach':'Мел, змей и прилив'}
REFS={'regatta-course':'../tiredwood-minigames-concepts-2026-10-12/art/originals/03-regatta.png','tower-course':'../tiredwood-minigames-concepts-2026-10-12/art/originals/04-tower.png','aqua-kit':'../tiredwood-minigames-concepts-2026-10-12/art/originals/05-aqua.png','social-picnic':'art/originals/01-picnic-theatre.png','social-theatre':'art/originals/01-picnic-theatre.png','social-beach':'art/originals/02-chalk-kite.png'}
PARTS={};ROOT=None
def P(name,offset=(0,0,0),parent=None):
 g=Part(name,offset,parent or ROOT);PARTS[name]=g;return g
def plank_deck(g,w,d,y=0,color='wood',n=10):
 for i in range(n):
  x=-w/2+(i+.5)*w/n;g.box((x,y-.08,0),(w/n-.012,.16,d),color if i%2 else 'woodhi',1)
 for x in [-w*.36,w*.36]:g.box((x,y-.17,0),(.13,.16,d*.92),'walnut',1)
 g.anchor('deck_top',(0,y,0))
def bolt(g,p,r=.028):g.blob(p,(r,r*.6,r),'metal',2,8,5)
def soft_pad(g,w,d,color='mint'):
 g.box((0,-.13,0),(w-.15,.22,d-.15),color,0)
 for x in [-w/2+.12,w/2-.12]:g.tube([(x,-.13,-d/2+.12),(x,-.13,d/2-.12)],.12,'cream',0,10)
 for z in [-d/2+.12,d/2-.12]:g.tube([(-w/2+.12,-.13,z),(w/2-.12,-.13,z)],.12,'coral',0,10)
 g.box((0,-.009,0),(w*.67,.018,d*.67),'cream',0);g.anchor('deck_top',(0,0,0))
def rope_rail(g,w,d,y=0,front=False):
 edges=[((-w/2,y,d/2),(w/2,y,d/2)),((-w/2,y,-d/2),(-w/2,y,d/2)),((w/2,y,-d/2),(w/2,y,d/2))]
 if front:edges.append(((-w/2,y,-d/2),(w/2,y,-d/2)))
 for a,b in edges:
  for pos in [a,b]:g.tube([pos,(pos[0],pos[1]+.83,pos[2])],[.035,.030],'walnut',1,8)
  g.tube([(a[0],a[1]+.61,a[2]),((a[0]+b[0])/2,y+.53,(a[2]+b[2])/2),(b[0],b[1]+.61,b[2])],.025,'cream',0,6)
def buoy(g,r=.35,h=1.55):
 g.profile((0,-.22,0),[(0,r*.80),(.13,r),(h*.75,r*.45),(h,r*.13)],'cream',0,16)
 g.profile((0,h*.34,0),[(0,r*.71),(.35,r*.52)],'coral',0,16)
 g.blob((0,h-.11,0),(r*.21,r*.21,r*.21),'coral',0,12,8)
 g.ring((0,-.12,0),r*.93,.045,'metal',2,'y',16)
def regatta_overview():
 g=P('regatta_full_course',(0,0,-115));route=[]
 # Six connected circular corners, r=20m, joined by tangent straights.
 for i in range(6):
  angle=i*pi/3;cx=36*cos(angle);cz=36*sin(angle)
  for j in range(17):
   a=angle-pi/6+j*pi/48;route.append((cx+20*cos(a),cz+20*sin(a)))
  end=route[-1];nexta=(i+1)*pi/3;nextc=(36*cos(nexta),36*sin(nexta));dest=(nextc[0]+20*cos(nexta-pi/6),nextc[1]+20*sin(nexta-pi/6))
  for j in range(1,9):u=j/9;route.append((end[0]*(1-u)+dest[0]*u,end[1]*(1-u)+dest[1]*u))
 v=[];f=[]
 for i,(x,z) in enumerate(route):
  prev=Vector(route[i-1]);nxt=Vector(route[(i+1)%len(route)]);t=(nxt-prev).normalized();half=9.5+1.4*sin(i*.065)
  v.extend([(x-t.y*half,.02,z+t.x*half),(x+t.y*half,.02,z-t.x*half)])
 for i in range(len(route)):j=(i+1)%len(route);f.append((2*i,2*j,2*j+1,2*i+1))
 g.poly(v,f,'glass',0,True)
 for i in range(0,len(route),6):
  x,z=route[i];prev=Vector(route[i-1]);nxt=Vector(route[(i+1)%len(route)]);t=(nxt-prev).normalized()
  for side in [-1,1]:
   xx=x-side*t.y*10;zz=z+side*t.x*10;g.profile((xx,-.1,zz),[(0,.30),(.15,.31),(1.2,.11),(1.5,.04)],'cream',0,12);g.profile((xx,.45,zz),[(0,.23),(.35,.17)],'coral',0,12)
 # A short inner line is separate and legible; it is an untested planning choice.
 g.tube([(-48,.12,-21),(-34,.12,-28),(-12,.12,-39),(17,.12,-49)],.11,'mint',0,8)
 for p,s in [((-18,.8,-5),(8,4.8,6)),((-24,.4,2),(6,3.8,5)),((-13,.5,5),(5,3.1,4)),((25,.1,4),(4,2.1,3))]:g.blob(p,s,'stone',0,20,12,.09)
 # Marina: actual piles, plank piers and low roofed port houses.
 for k in range(3):
  xx=-12+k*6
  for b in range(5):g.box((xx,-.08,28+b*1.0),(3.5,.16,.94),'woodhi' if b%2 else 'wood',1)
  for z in [28,32]:g.tube([(xx-1.5,-1.6,z),(xx-1.5,.8,z)],[.14,.11],'walnut',1,10);g.tube([(xx+1.5,-1.6,z),(xx+1.5,.8,z)],[.14,.11],'walnut',1,10)
 for x in [-10,-4,2]:
  g.box((x,1.4,38),(4.2,2.8,3.6),'cream',0);g.poly([(x-2.3,2.8,36),(x+2.3,2.8,36),(x,4.1,36),(x-2.3,2.8,40),(x+2.3,2.8,40),(x,4.1,40)],[(0,1,2),(3,5,4),(0,2,5,3),(1,4,5,2)],'terracotta',0)
 # Small lighthouse island: architectural lamp gallery and terracotta cap.
 g.profile((25,1.65,4),[(0,.95),(4.2,.64),(4.45,.80)],'cream',0,20)
 g.profile((25,6.1,4),[(0,.85),(.15,.85)],'walnut',1,20)
 for i in range(6):a=i*pi/3;g.tube([(25+.63*cos(a),6.25,4+.63*sin(a)),(25+.63*cos(a),7.25,4+.63*sin(a))],.045,'cream',0,8)
 g.profile((25,7.25,4),[(0,1.05),(.60,.08)],'terracotta',0,20)
 for name,pos in [('zone_marina',(-4,0,33)),('zone_cliffs',(-19,0,0)),('zone_lighthouse',(25,0,4)),('inner_line',(-12,0,-39)),('outer_line',(0,0,-61))]:g.anchor(name,pos)
 return {'planningOnly':True,'cornerCount':6,'cornerRadius':20,'laneWidth':[16.2,21.8],'zones':['marina','white cliffs','small lighthouse'],'physicsAcceptance':False}
def tower_overview():
 g=P('tower_full_overview',(0,0,-40))
 g.profile((0,0,0),[(0,6.5),(3,6.5),(5,6.1),(28,6.0),(58,5.8),(88,5.6),(118,5.4),(148,5.2),(181,4.9),(183,6.2),(185,7.1)],'cream',0,48)
 # Stone/brick belts, broad terraces, supporting corbels and a connected spiral route.
 for y in [0,30,60,90,120,150,180]:
  r=6.2-y*.007;g.profile((0,y,0),[(0,r+.04),(.75,r+.05)],'terracotta' if int(y/30)%2 else 'stone',0,48)
 for y in [30,60,90,120,150,185]:
  g.profile((0,y-.32,0),[(0,8.4),(.32,8.4)],'wood',1,48)
  pts=[(8.2*cos(i*pi/24),y+.78,8.2*sin(i*pi/24)) for i in range(49)];g.tube(pts,.045,'walnut',1,8)
  for i in range(16):a=i*pi/8;g.tube([(8.2*cos(a),y,8.2*sin(a)),(8.2*cos(a),y+.90,8.2*sin(a))],.045,'walnut',1,8)
 for i in range(155):
  y=min(185,(i+1)*1.20);a=i*.235
  v=[(r*cos(t),yy,r*sin(t)) for yy in [y-.17,y] for r,t in [(6.7,a-.108),(10.2,a-.108),(10.2,a+.108),(6.7,a+.108)]]
  g.poly(v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'woodhi' if i%4==0 else 'wood',1)
  g.beam((6.0*cos(a),y-1.0,6.0*sin(a)),(9.8*cos(a),y-.18,9.8*sin(a)),.12,.14)
 # Bell gallery at the 185m route finish, roof above it.
 for i in range(8):a=i*pi/4;g.tube([(6.8*cos(a),185,6.8*sin(a)),(6.8*cos(a),190,6.8*sin(a))],.20,'cream',0,12)
 g.profile((0,190,0),[(0,7.7),(3.0,.10)],'terracotta',0,48)
 g.profile((0,187,0),[(0,1.05),(.15,1.1),(1.3,.60),(2.0,.30)],'copper',2,24)
 sectors=[(0,8),(8,20),(20,30),(30,42),(42,52),(52,60),(60,70),(70,82),(82,90),(90,101),(101,110),(110,120),(120,132),(132,142),(142,150),(150,163),(163,175),(175,185)]
 for i,(lo,hi) in enumerate(sectors):
  a=i*.84;g.anchor('sector_'+str(i+1).zfill(2),(8.9*cos(a),(lo+hi)/2,8.9*sin(a)))
 # Representative moving mechanisms are real separate nodes within this overview.
 mill=P('overview_windmill',(10,17,0),g.ctrl);mill.tube([(0,0,0),(0,0,-1.5)],.20,'walnut',1,12)
 for i in range(4):a=i*pi/2;mill.beam((.4*cos(a),.4*sin(a),0),(3.5*cos(a),3.5*sin(a),0),.62,.16,'woodhi',1)
 basket=P('overview_basket',(-9,43,0),g.ctrl);basket.tube([(0,4,0),(0,.8,0)],.040,'cream',0,8);plank_deck(basket,2.2,2.2)
 for z in [-1.1,1.1]:basket.box((0,.43,z),(2.2,.80,.12),'wood',1)
 for x in [-1.1,1.1]:basket.box((x,.43,0),(.12,.80,2.2),'wood',1)
 return {'planningOnly':True,'routeHeight':185,'buildingHeight':193,'belts':6,'namedSectors':18,'spiralRise':1.2,'spiralGap':'about 0.2m between ordinary ledges','physicsAcceptance':False}
def regatta():
 gate=P('race_gate',(0,0,0))
 for side in [-1,1]:
  x=side*6.50
  gate.profile((x,-.18,0),[(0,.45),(.20,.50),(3.50,.12),(3.68,.10)],'cream',0,16)
  gate.profile((x,.55,0),[(0,.35),(.58,.29)],'coral',0,16)
  gate.box((x,3.18,0),(.68,.33,.045),'coral',0);gate.box((x,3.18,-.035),(.30,.18,.022),'cream',0)
 gate.tube([(-6.50,3.43,0),(0,3.25,0),(6.50,3.43,0)],.035,'cream',0,8)
 for i in range(9):
  x=-5.4+i*1.35;gate.poly([(x-.16,3.16,0),(x+.16,3.16,0),(x,2.80,0)],[(0,1,2)],'mint' if i%2 else 'coral')
 for name,pos in [('gate_left',(-6,0,0)),('gate_right',(6,0,0)),('checkpoint',(0,0,0))]:gate.anchor(name,pos)
 b=P('course_buoy',(-9,0,-4));buoy(b)
 pier=P('harbor_pier',(9,0,-4));plank_deck(pier,4.2,3.6);rope_rail(pier,4.1,3.5)
 for x in [-1.8,1.8]:
  for z in [-1.3,1.3]:pier.tube([(x,-1.2,z),(x,.18,z)],[.10,.09],'walnut',1,10)
 rock=P('coastal_landmark',(0,0,7))
 for p,s in [((0,.1,0),(2.4,1.35,1.5)),((-1.8,-.1,.3),(1.4,.95,1.1)),((1.5,0,-.3),(1.1,1.05,1.3))]:rock.blob(p,s,'stone',0,16,10,.12)
 rock.profile((0,1.12,0),[(0,.45),(1.20,.19),(1.25,.01)],'leaf',0,10)
 full=regatta_overview()
 return {'race_gate':{'clearWidth':12,'height':3.5},'course_buoy':{'origin':'waterline'},'harbor_pier':{'deckTop':0},'coastal_landmark':{'collision':'none; exterior scenery'},'regatta_full_course':full}
def tower():
 pad=P('tower_platform',(0,0,0));plank_deck(pad,3.2,3.2)
 pad.box((0,-.18,0),(2.9,.12,2.9),'mint',0)
 rails=P('tower_rails',(0,0,0));rope_rail(rails,3.15,3.15)
 trap=P('trap_arm',(4.5,.75,0));trap.tube([(0,-.75,0),(0,.15,0)],[.15,.12],'walnut',1,12)
 trap.tube([(-1.5,0,0),(1.5,0,0)],.12,'coral',0,12)
 for x in [-1.35,1.35]:trap.ring((x,0,0),.12,.035,'cream',0,'x',12)
 trap.anchor('trap_pivot',(0,0,0))
 bell=P('checkpoint_bell',(-4.5,0,0));bell.tube([(0,0,0),(0,2.2,0)],.055,'walnut',1,10)
 bell.profile((0,1.30,0),[(0,.27),(.03,.28),(.15,.17),(.38,.10),(.42,.05)],'copper',2,20)
 bell.box((0,1.78,0),(.84,.10,.12),'walnut',1);bell.anchor('bell_target',(0,1.45,0))
 # Playable slice uses five declared deck anchors, not a fake 185-metre climb.
 slice_root=group('tower_slice',ROOT,(0,0,-8))
 pads=[(0,0,0,4,4),(4,1.2,0,3.2,3.2),(4,2.4,-4,3.2,3.2),(0,3.6,-4,3.2,3.2),(0,4.8,-8,4,3.2)]
 for i,(x,y,z,w,d) in enumerate(pads):
  g=P('slice_platform_'+str(i),(x,y,z),slice_root);plank_deck(g,w,d);g.anchor('slice_deck_'+str(i),(0,0,0))
  g.box((0,-.31,0),(w*.82,.18,d*.82),'mint' if i%2 else 'coral',0)
 full=tower_overview()
 return {'tower_platform':{'size':[3.2,.25,3.2],'deckTop':0},'tower_slice':{'height':4.8,'rise':1.2,'fullCourse':False},'trap_arm':{'pivotHeight':.75},'tower_full_overview':full}
def aqua():
 ferry=P('aqua_ferry',(-5,0,0));plank_deck(ferry,2.4,2.4)
 for z in [-1.10,1.10]:
  for x in [-1.0,1.0]:ferry.tube([(x,0,z),(x,.62,z)],.028,'walnut',1,8)
  ferry.tube([(-1,.52,z),(0,.46,z),(1,.52,z)],.022,'cream',0,6)
 for x in [-.95,.95]:ferry.tube([(x,-.34,-1.0),(x,-.34,1.0)],.18,'mint',0,12)
 sink=P('aqua_sink',(0,0,0));soft_pad(sink,1.8,1.8,'coral');sink.blob((0,-.21,0),(.73,.21,.73),'mint',0,20,10)
 sweep=P('aqua_sweeper_disc',(5,0,0));sweep.profile((0,-.32,0),[(0,3.0),(.30,3.0),(.32,2.86)],'mint',0,32)
 sweep.ring((0,-.13,0),2.85,.13,'cream',0,'y',32);sweep.anchor('deck_top',(0,0,0))
 rotor=P('aqua_sweeper',(5,.65,0));rotor.tube([(-2.7,0,0),(2.7,0,0)],.13,'coral',0,14);rotor.tube([(0,-.65,0),(0,.15,0)],[.18,.15],'walnut',1,12);rotor.anchor('sweeper_pivot',(0,0,0))
 bag=P('aqua_pendulum',(-4.5,0,6))
 for x in [-1.15,1.15]:bag.tube([(x,0,0),(x,3.2,0)],[.08,.07],'walnut',1,10)
 bag.beam((-1.2,3.2,0),(1.2,3.2,0),.15,.15)
 moving=P('aqua_pendulum_bag',(0,3.05,0),bag.ctrl);moving.tube([(0,0,0),(0,-1.65,0)],.025,'cream',0,8);moving.profile((0,-2.4,0),[(0,.05),(.15,.32),(.58,.38),(.84,.17),(.89,.055)],'coral',0,18,1,.025)
 tramp=P('aqua_trampoline',(0,0,6));tramp.profile((0,-.25,0),[(0,.76),(.20,.80),(.25,.78)],'mint',0,24)
 tramp.ring((0,-.08,0),.72,.08,'copper',2,'y',24);tramp.profile((0,-.025,0),[(0,.66),(.025,.66)],'cream',0,24);tramp.anchor('bounce_top',(0,0,0))
 tramp.backend.verts=[(v[0],v[1]*1.125,v[2]) for v in tramp.backend.verts]
 lift=P('aqua_lift',(4.5,0,6));plank_deck(lift,2.4,2.4)
 for x in [-1.15,1.15]:lift.tube([(x,-.22,0),(x,3.2,0)],.08,'walnut',1,10)
 lift.anchor('lift_deck',(0,0,0))
 return {'aqua_ferry':{'size':[2.4,.45,2.4],'deckTop':0},'aqua_sink':{'size':[1.8,.45,1.8],'deckTop':0},'aqua_sweeper_disc':{'radius':3,'deckTop':0},'aqua_sweeper':{'pivot':'bar centre; no disc','period':3.6},'aqua_pendulum_bag':{'pivot':'top suspension'},'aqua_trampoline':{'size':[1.6,.25,1.8],'deckTop':0,'bounce':12},'aqua_lift':{'deckTop':0}}
def picnic():
 tray=P('carry_tray',(0,1.0,0))
 for i in range(7):tray.box((-.78+i*.26,0,0),(.245,.06,.88),'woodhi' if i%2 else 'wood',1)
 for z in [-.43,.43]:tray.box((0,.03,z),(1.8,.12,.07),'terracotta',0)
 for x in [-.87,.87]:tray.box((x,.03,0),(.07,.12,.9),'terracotta',0)
 tray.box((0,.044,0),(1.28,.014,.59),'cream',0)
 for z in [-.42,.42]:
  for x in [-.7,.7]:
   tray.tube([(x-.11,.02,z),(x-.11,.14,z),(x+.11,.14,z),(x+.11,.02,z)],.022,'mint',2,8)
   bolt(tray,(x-.11,.035,z));bolt(tray,(x+.11,.035,z))
 for name,pos in [('handle_front_left',(-.7,.14,-.42)),('handle_front_right',(.7,.14,-.42)),('handle_rear_left',(-.7,.14,.42)),('handle_rear_right',(.7,.14,.42))]:tray.anchor(name,pos)
 cake=P('party_cake',(0,1.06,0))
 cake.profile((0,0,0),[(0,.25),(.015,.275),(.045,.27),(.050,.26)],'cream',0,24)
 cake.profile((0,.045,0),[(0,.225),(.13,.24),(.15,.225),(.17,.24),(.30,.23),(.32,.22),(.34,.23),(.46,.22),(.48,.20)],'cream',0,24)
 for y in [.17,.34]:cake.profile((0,y,0),[(0,.236),(.018,.236)],'jam',3,24)
 for i in range(12):
  a=i*pi/6;y=.175 if i%2 else .345;cake.blob((.236*cos(a),y-.025,.236*sin(a)),(.023,.040 if i%3 else .055,.023),'white',0,6,4)
 for i in range(12):
  a=i*pi/6
  for y in [.065,.51]:cake.blob((.216*cos(a),y,.216*sin(a)),(.045,.028,.045),'white',0,8,5)
 for i in range(6):
  a=i*pi/3;cake.blob((.15*cos(a),.54,.15*sin(a)),(.045,.055,.042),'coral',0,10,6)
  cake.blob((.15*cos(a),.596,.15*sin(a)),(.018,.01,.018),'leaf',0,6,4)
 candle_root=group('candles',cake.ctrl,(0,.54,0))
 for i,x in enumerate([-.08,0,.08]):
  c=P('candle_'+str(i+1),(x,0,0),candle_root);c.tube([(0,0,0),(0,.135,0)],.011,'cream' if i%2 else 'coral',0,8);c.blob((0,.15,0),(.012,.023,.012),'copper',4,8,6)
 cake.anchor('cake_top',(0,.54,0));tray.anchor('cake_seat',(0,.06,0))
 return {'carry_tray':{'size':[1.8,.12,.9],'pivot':'centre','handles':4},'party_cake':{'diameter':.55,'height':.70,'pivot':'base','candles':'nested separate nodes'}}
def theatre():
 stage=P('theatre_stage',(0,0,0));plank_deck(stage,4.5,2.2,0,n=14)
 for x in [-2.12,2.12]:
  stage.box((x,1.58,.87),(.14,3.16,.15),'cream',0);stage.box((x,.16,.87),(.23,.32,.24),'stone',0)
 stage.beam((-2.2,3.08,.88),(2.2,3.08,.88),.13,.13,'walnut',1)
 stage.box((0,1.58,1.0),(4.2,3.0,.035),'mint',0)
 # Real pleated fabric panels; their origin is the outer upper hanging point.
 for sign,label in [(-1,'left'),(1,'right')]:
  curtain=P('curtain_'+label,(sign*2.02,2.98,.84),stage.ctrl);v=[];f=[];rows=14;cols=14
  for j in range(rows):
   y=-j/(rows-1)*2.91
   for i in range(cols):
    x=-sign*i/(cols-1)*1.30;z=-.06*cos(i/(cols-1)*8*pi)*(1+j/rows*.5);v.append((x,y,z))
  for j in range(rows-1):
   for i in range(cols-1):a=j*cols+i;f.append((a,a+1,a+1+cols,a+cols))
  curtain.poly(v,f,'coral',0,True)
  for x in [0,-sign*.25,-sign*.50,-sign*.75,-sign*1.0,-sign*1.25]:curtain.ring((x,.015,0),.027,.008,'copper',2,'x',8)
 umbrella=P('umbrella',(-3.35,0,-.9));umbrella.tube([(0,0,0),(0,.89,0)],.016,'walnut',1,10)
 umbrella.tube([(0,0,0),(-.02,-.08,0),(-.08,-.10,0),(-.115,-.06,0)],[.018]*4,'walnut',1,8)
 for i in range(8):
  a=i*pi/4;b=(i+1)*pi/4
  umbrella.poly([(0,1,0),(.4*cos(a),.82,.4*sin(a)),(.4*cos(b),.82,.4*sin(b))],[(0,1,2)],'coral' if i%2 else 'cream')
  umbrella.tube([(0,.98,0),(.23*cos(a),.93,.23*sin(a)),(.40*cos(a),.82,.40*sin(a))],[.012]*3,'walnut',1,6)
 crown=P('crown',(-3.35,0,1.0));v=[];f=[];n=16
 for j in range(3):
  for i in range(n):a=i*2*pi/n;y=[0,.12,.20 if i%2 else .24][j];v.append((.21*cos(a),y,.21*sin(a)))
 for j in range(2):
  for i in range(n):a=j*n+i;b=j*n+(i+1)%n;f.append((a,b,b+n,a+n))
 crown.poly(v,f,'copper',2,True);crown.ring((0,.03,0),.21,.017,'copper',2,'y',20)
 for i in range(0,n,2):a=i*2*pi/n;crown.blob((.21*cos(a),.24,.21*sin(a)),(.025,.025,.025),'copper',2,8,5)
 bell=P('bell',(3.35,0,-1.2));bell.profile((0,0,0),[(0,.115),(.025,.118),(.10,.079),(.22,.054),(.245,.018)],'copper',2,20)
 bell.tube([(0,.24,0),(0,.31,0)],.013,'walnut',1,8)
 clapper=P('bell_clapper',(0,.18,0),bell.ctrl);clapper.tube([(0,0,0),(0,-.16,0)],.008,'metal',2,6);clapper.blob((0,-.17,0),(.026,.024,.026),'metal',2,8,5)
 uke=P('ukulele',(3.35,.25,0))
 # The double-bout contour is a closed hollow-looking instrument body, not a sphere.
 contour=[(-.03,-.28),(-.087,-.26),(-.110,-.20),(-.087,-.12),(-.066,-.06),(-.090,0),(-.094,.06),(-.055,.105),(0,.116),(.055,.105),(.094,.06),(.090,0),(.066,-.06),(.087,-.12),(.110,-.20),(.087,-.26),(.03,-.28)]
 v=[(x,y,z) for z in [-.024,.024] for x,y in contour];n=len(contour);f=[tuple(reversed(range(n))),tuple(n+i for i in range(n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)];uke.poly(v,f,'wood',1,True)
 uke.box((0,.20,0),(.055,.26,.033),'walnut',1);uke.box((0,.37,0),(.088,.105,.034),'wood',1)
 uke.blob((0,-.043,-.026),(.038,.038,.004),'dark',0,14,8);uke.ring((0,-.043,-.031),.038,.004,'cream',0,'z',16)
 uke.box((0,-.195,-.032),(.080,.026,.013),'walnut',1)
 for x in [-.014,-.005,.005,.014]:uke.tube([(x,-.196,-.044),(x,.404,-.030)],.0016,'cream',0,4)
 for side in [-1,1]:
  for y in [.344,.393]:uke.blob((side*.051,y,0),(.012,.008,.014),'copper',2,6,4)
 uke.backend.verts=[(v[0],v[1],(v[2]-.17)*(.55/.702)) for v in uke.backend.verts]
 uke.anchor('instrument_grip',(0,0,0))
 uke.anchor('ukulele_grip',(0,0,0))
 drum=P('drum',(3.35,0,1.1));drum.profile((0,0,0),[(0,.20),(.20,.20)],'mint',0,24)
 drum.ring((0,.02,0),.20,.015,'copper',2,'y',24);drum.ring((0,.18,0),.20,.015,'copper',2,'y',24)
 membrane=P('drum_membrane',(0,.20,0),drum.ctrl);membrane.profile((0,0,0),[(0,.184),(.004,.184)],'cream',0,24)
 for i in range(8):a=i*pi/4;drum.ring((.20*cos(a),.10,.20*sin(a)),.028,.007,'copper',2,'y',8)
 drum.anchor('drum_grip',(0,.08,-.18))
 umbrella.anchor('umbrella_grip',(0,.12,0));bell.anchor('bell_grip',(0,.28,0))
 whistle=P('whistle',(3.35,.06,2));whistle.tube([(-.075,0,0),(.075,0,0)],.027,'woodhi',1,12);whistle.blob((.015,.025,0),(.013,.007,.010),'dark',0,8,4)
 return {'theatre_stage':{'size':[4.5,3.2,2.2],'front':'-Z','curtains':'nested'},'umbrella':{'pivot':'handle base'},'crown':{'diameter':.42},'bell':{'clapper':'nested'},'ukulele':{'pivot':'grip'},'drum':{'membrane':'nested'},'whistle':{'length':.15}}
def beach():
 gate=P('chalk_gate',(-3,0,0))
 for i in range(8):gate.ring((0,.89,0),.57,.032,'mint' if i%2 else 'cream',0,'z',4,start=i*pi/4,arc=pi/4)
 for x in [-.38,.38]:gate.box((x,.24,0),(.09,.48,.15),'walnut',1);gate.box((x,.025,0),(.27,.05,.15),'wood',1)
 gate.anchor('chalk_checkpoint',(0,.89,0))
 hurdle=P('chalk_hurdle',(-3,0,2));hurdle.tube([(-.48,.36,0),(.48,.36,0)],.17,'coral',0,16)
 for x in [-.54,.54]:hurdle.box((x,.21,0),(.08,.42,.26),'wood',1);hurdle.box((x,.026,0),(.22,.052,.30),'walnut',1)
 for x in [-.30,0,.30]:hurdle.ring((x,.36,0),.171,.008,'cream',0,'x',12)
 kite=P('kite_body',(0,2.2,0));corners=[(0,.55,0),(.45,0,0),(0,-.55,0),(-.45,0,0)]
 for i in range(4):kite.poly([(0,0,-.035),corners[i],corners[(i+1)%4]],[(0,1,2)],'mint' if i%2 else 'coral')
 kite.tube([corners[0],corners[2]],.012,'walnut',1,6);kite.tube([corners[1],corners[3]],.012,'walnut',1,6)
 for i in range(4):kite.tube([corners[i],corners[(i+1)%4]],.006,'cream',0,5)
 kite.anchor('kite_line',(0,0,.018))
 for i in range(4):
  tail=P('kite_tail'+str(i+1),(0,1.44-i*.19,0));tail.poly([(-.09,.08,0),(-.09,-.08,0),(0,0,-.025),(.09,.08,0),(.09,-.08,0)],[(0,1,2),(2,4,3)],'coral' if i%2 else 'cream');tail.blob((0,0,0),(.018,.020,.018),'cream',0,6,4)
 spool=P('spool',(0,.13,1.8))
 spool.tube([(-.10,0,0),(.10,0,0)],.033,'walnut',1,10)
 for x in [-.065,.065]:spool.tube([(x-.009,0,0),(x+.009,0,0)],.075,'wood',1,16)
 spool.tube([(-.055,0,0),(.055,0,0)],.051,'cream',0,16)
 for x in [-.046,-.027,-.008,.011,.030,.049]:spool.ring((x,0,0),.051,.005,'cream',0,'x',12)
 spool.anchor('line_out',(0,.051,0))
 spool.anchor('spool_grip',(0,0,0))
 foundation=P('sand_foundation',(3,0,-1.3));v=[];f=[]
 for y,w,d in [(0,1.15,1.0),(.10,1.15,1.0),(.45,1.08,.93)]:v.extend((x,y,z) for x,z in rounded_outline(w,d,.10))
 for j in range(2):
  for k in range(24):a=j*24+k;b=j*24+(k+1)%24;f.append((a,b,b+24,a+24))
 foundation.poly(v,[tuple(reversed(face)) for face in f],'sandwet',0,True);foundation.poly(v,[tuple(range(24)),tuple(reversed([48+k for k in range(24)]))],'sand',0);foundation.anchor('stack_top',(0,.45,0))
 arch=P('sand_arch',(3,0,.1))
 for x in [-.310,.310]:arch.box((x,.1125,0),(.23,.225,.7),'sandwet',0)
 # An actual open arch with broad wet-sand jambs and a semicircular crown.
 v=[];f=[];n=14
 for z in [-.35,.35]:
  for r in [.195,.425]:
   for i in range(n+1):a=i*pi/n;v.append((r*cos(a),.225+r*sin(a),z))
 layer=(n+1)*2
 for i in range(n):
  a=i;b=i+1;c=n+1+i;d=n+2+i
  f.extend([(a,b,d,c),(layer+a,layer+c,layer+d,layer+b),(a,layer+a,layer+b,b),(c,d,layer+d,layer+c)])
 arch.poly(v,f,'sand',0,True)
 for i in range(len(arch.backend.smooth)):arch.backend.smooth[i]=i%4 in [2,3]
 arch.anchor('stack_top',(0,.65,0))
 turret=P('sand_turret',(3,0,1.5));turret.profile((0,0,0),[(0,.275),(.10,.275),(.68,.23),(.75,.26),(.81,.26)],'sandwet',0,24)
 for i in range(8):a=i*pi/4;turret.box((.22*cos(a),.845,.22*sin(a)),(.115,.11,.115),'sand',0)
 turret.anchor('stack_top',(0,.90,0))
 brace=P('sand_brace',(1.8,0,3.2))
 for x in [-.58,.58]:brace.tube([(x,0,0),(x,.51,0)],[.027,.022],'walnut',1,8)
 brace.poly([(-.55,.04,0),(.55,.04,0),(.55,.47,0),(-.55,.47,0)],[(0,1,2,3)],'cream');brace.poly([(-.55,.17,-.005),(.55,.17,-.005),(.55,.26,-.005),(-.55,.26,-.005)],[(0,1,2,3)],'mint')
 shovel=P('shovel',(-1.1,0,3.2));shovel.tube([(0,.09,0),(0,.42,0)],.012,'walnut',1,8);shovel.blob((0,.07,0),(.058,.07,.012),'metal',2,12,7);shovel.ring((0,.425,0),.035,.010,'wood',1,'z',12)
 shell=P('shell',(-1.55,0,3.2));shell.blob((0,.025,0),(.075,.026,.065),'cream',0,16,8)
 for i in range(-3,4):x=i*.016;shell.tube([(x,.041,-.04),(x*.6,.05,.04)],.0025,'coral',0,4)
 return {'chalk_gate':{'size':[1.2,1.5,.15]},'chalk_hurdle':{'size':[1.3,.55,.3]},'kite_body':{'size':[.9,1.1,.04],'pivot':'centre'},'kite_tails':{'independent':4},'spool':{'lineAnchor':'line_out'},'sand_forms':{'separate':True,'stackAnchors':True},'sand_brace':{'origin':'base'}}

def pose(name,clip,t):
 s=sin(2*pi*t);p=sin(pi*t)
 if clip=='idle':
  if name=='overview_basket':return {'rot':(0,0,.025*s)}
  if name in ['trap_arm','aqua_sweeper']:return {'rot':(0,.025*s,0)}
  if name.startswith('kite_tail'):return {'rot':(0,0,.08*s)}
  if name in ['course_buoy','aqua_ferry','aqua_sink']:return {'move':(0,.022*s,0)}
  if name=='candles' or name.startswith('candle_'):return {'rot':(.025*s,0,0)}
  if name.startswith('curtain'):return {'rot':(0,.015*s,0)}
  return None
 if clip=='action':
  if name=='overview_windmill':return {'rot':(0,0,2*pi*t)}
  if name=='overview_basket':return {'move':(0,.4*s,0),'rot':(0,0,.05*s)}
  if name=='course_buoy':return {'rot':(.045*s,0,.035*s)}
  if name in ['trap_arm','aqua_sweeper']:return {'rot':(0,2*pi*t,0)}
  if name=='aqua_pendulum_bag':return {'rot':(0,0,.48*s)}
  if name=='aqua_ferry':return {'move':(1.2*s,0,0)}
  if name=='aqua_sink':return {'move':(0,-.75*p,0)}
  if name=='aqua_lift':return {'move':(0,1.2*p,0)}
  if name=='aqua_trampoline':return {'scale':(1,1,.70+.30*cos(t*2*pi))}
  if name=='carry_tray':return {'rot':(0,0,.14*s)}
  if name=='party_cake':return {'move':(.12*s,0,0),'rot':(0,0,.08*s)}
  if name.startswith('curtain'):return {'move':((-.45 if 'left' in name else .45)*p,0,0)}
  if name in ['bell_clapper','bell']:return {'rot':(0,0,.32*s)}
  if name=='ukulele':return {'rot':(0,0,.07*s)}
  if name=='drum_membrane':return {'scale':(1,1,.82+.18*cos(t*6*pi))}
  if name=='whistle':return {'move':(0,.06*p,0)}
  if name=='kite_body':return {'rot':(0,.09*s,.14*s)}
  if name=='spool':return {'rot':(2*pi*t,0,0)}
  if name.startswith('kite_tail'):return {'rot':(.14*s,0,.18*s)}
  if name=='chalk_hurdle':return {'scale':(1,1,.84+.16*cos(t*2*pi))}
 if clip=='success':
  if name=='course_buoy':return {'move':(0,.07*p,0)}
  if name in ['party_cake','crown','checkpoint_bell','kite_body','sand_turret']:return {'move':(0,.10*p,0)}
  if name.startswith('candle_'):return {'scale':(1+.08*p,1+.08*p,1+.08*p)}
  if name=='aqua_trampoline':return {'scale':(1+.06*p,1+.06*p,1+.14*p)}
 if clip=='failure':
  if name=='course_buoy':return {'rot':(0,0,.14*p)}
  if name in ['party_cake','sand_arch','sand_turret']:return {'rot':(0,0,.65*p),'move':(.12*p,-.08*p,0)}
  if name in ['carry_tray','chalk_hurdle','kite_body']:return {'rot':(0,0,-.24*p)}
  if name in ['bell','umbrella','crown']:return {'move':(0,-.16*p,0),'rot':(.26*p,0,.24*p)}
  if name in ['aqua_ferry','aqua_sink']:return {'move':(0,-.12*p,0)}
  if name=='trap_arm':return {'rot':(0,.32*p,0)}
 return None

def preview_actor(pos,scale=1.0,yaw=0,hold=False,bodycolor=None):
 src=WORKSPACE/'concepts_blender/plaza3/npc/models/jelly_base.glb';before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(src));new=[o for o in bpy.data.objects if o not in before];roots=[o for o in new if o.parent is None]
 holder=group('preview_reused_jelly',None,pos);holder.scale=(scale,)*3;holder.rotation_euler.z=yaw
 if hold:
  for o in new:
   if o.name.startswith('hand.'):
    o.location.z+=.30;o.location.y+=.14
 if bodycolor:
  for o in new:
   if o.type=='MESH' and (o.name.startswith('body') or o.name.startswith('hand.')):
    o.data=o.data.copy()
    for attr in o.data.color_attributes:
     for datum in attr.data:
      c=datum.color
      if c[0]>c[1]*1.4 and c[0]>c[2]*1.1:
       shade=max(.30,min(1.15,c[0]));datum.color=(*(value*shade for value in COL[bodycolor]),c[3])
    for i,mat in enumerate(o.data.materials):
     m=mat.copy();o.data.materials[i]=m
     if m.use_nodes:
      for node in m.node_tree.nodes:
       if node.type=='BSDF_PRINCIPLED':
        c=node.inputs['Base Color'].default_value
        if c[0]>c[1]*1.4 and c[0]>c[2]*1.1:node.inputs['Base Color'].default_value=(*COL[bodycolor],c[3])
 for o in roots:o.parent=holder
 return holder,{'path':str(src.relative_to(WORKSPACE)),'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'purpose':'render staging only; GLB kit export excludes this actor','renderBodyColor':bodycolor}
def bind_hands(holder,anchor_names):
 from mathutils import Matrix
 hands=sorted([o for o in holder.children_recursive if o.type=='MESH' and o.name.startswith('hand.')],key=lambda o:o.name)
 result=[]
 for hand,name in zip(hands,anchor_names):
  centre=sum((Vector(v) for v in hand.bound_box),Vector())/8;hand.data=hand.data.copy();hand.data.transform(Matrix.Translation(-centre));hand.location=(0,0,0)
  for c in list(hand.constraints):hand.constraints.remove(c)
  c=hand.constraints.new('COPY_LOCATION');c.target=bpy.data.objects[name];c.owner_space='WORLD';c.target_space='WORLD'
  result.append({'hand':hand.name,'anchor':name})
 bpy.context.view_layer.update()
 for pair in result:
  hand=bpy.data.objects[pair['hand']];target=bpy.data.objects[pair['anchor']];centre=sum((hand.matrix_world@Vector(v) for v in hand.bound_box),Vector())/8;pair['errorM']=float((centre-target.matrix_world.translation).length)
 return result
def preview_boat(pos,yaw=0):
 src=WORKSPACE/'game-opus/client/assets/ownboats/volzhanka_lod1.glb';before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(src));new=[o for o in bpy.data.objects if o not in before];holder=group('preview_reused_coastal_boat',None,pos);holder.rotation_euler.z=yaw;holder.scale=(.8,)*3
 for o in new:
  if o.parent is None:o.parent=holder
  if o.name.startswith('col_'):o.hide_render=True
 return {'path':str(src.relative_to(WORKSPACE)),'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'purpose':'coastal boat in Blender planning render; playable demo retains actual race BoatModel'}
def stage(mid,root):
 scene=bpy.context.scene
 try:scene.render.engine='CYCLES'
 except TypeError as e:print('Engine enum rejected',str(e));raise
 scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1200;scene.render.resolution_y=850;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
 world=bpy.data.worlds.new('lab_bright_day');world.use_nodes=True;scene.world=world;bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.58,.74,.84,1);bg.inputs['Strength'].default_value=.65
 scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
 # Authored actors are reused in the Blender evidence composition, never recreated as balls.
 poses={'social-picnic':[(0,-.02,-1.02),(0,-.02,1.02)],'social-theatre':[(-.65,0,-.25),(.80,0,-.25)],'social-beach':[(-1.45,-.02,1),(1.40,-.02,.9)],'regatta-course':[(-78.5,.52,-194)],'tower-course':[(0,0,-35)],'aqua-kit':[(0,-.4,-65)]}
 reused=[]
 for i,p in enumerate(poses[mid]):
  holder,proof=preview_actor(p,yaw=(pi if i==0 else 0) if mid=='social-picnic' else 0,hold=mid in ['social-picnic','social-theatre'],bodycolor=('mint' if i==0 else 'coral') if mid.startswith('social-') else None)
  if mid=='social-picnic':
   side='front' if i==0 else 'rear';proof['grips']=bind_hands(holder,['handle_'+side+'_left','handle_'+side+'_right'])
  reused.append(proof)
 bpy.context.view_layer.update();bounds=[]
 subject=bpy.data.objects.get('tower_full_overview') if mid=='tower-course' else bpy.data.objects.get('regatta_full_course') if mid=='regatta-course' else bpy.data.objects.get('aqua_full_course') if mid=='aqua-kit' else root
 if subject!=root:
  visible={subject,*subject.children_recursive}
  for o in root.children_recursive:
   if o not in visible:o.hide_render=True
 for o in subject.children_recursive:
  if o.type=='MESH':bounds.extend([o.matrix_world@Vector(v) for v in o.bound_box])
 lo=Vector(tuple(min(v[i] for v in bounds) for i in range(3)));hi=Vector(tuple(max(v[i] for v in bounds) for i in range(3)));center=(lo+hi)*.5;size=hi-lo;span=max(size.x,size.y,size.z,4)
 # Sand and sea are intentionally calm; the real props remain the focal shapes.
 groundY=-.85 if mid=='aqua-kit' else -.15 if mid=='regatta-course' else -.02
 ground=Part('preview_ground',parent=None);ground.box((0,groundY-.035,0),(span*6,.07,span*6),'water' if mid in ['regatta-course','aqua-kit'] else 'sand',0);ground.finish()
 def light(name,loc,power,extent):
  data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=extent;o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
 light('preview_sun',center+Vector((-span,-span,span*1.6)),350*span,span)
 light('preview_fill',center+Vector((span,span,span)),150*span,span)
 if mid in ['regatta-course','tower-course']:
  sun=bpy.data.lights.new('preview_day_sun','SUN');sun.energy=2.2;sun.angle=.16;o=bpy.data.objects.new('preview_day_sun',sun);bpy.context.collection.objects.link(o);o.rotation_euler=(.55,-.5,-.45)
 data=bpy.data.cameras.new('lab_camera');cam=bpy.data.objects.new('lab_camera',data);bpy.context.collection.objects.link(cam);scene.camera=cam
 cam.location=center+Vector((span*.85,span*1.2,span*.9));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=span*1.32
 if mid=='tower-course':
  scene.render.resolution_x=1240;scene.render.resolution_y=2100;cam.location=center+Vector((span*.70,span*1.10,span*.28));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();data.ortho_scale=span*1.10
 return reused
def build(mid,version='v2',render=True):
 global ROOT,PARTS,MOTIONS,REUSED
 assert mid in NAMES;assert version!='v1','V1 is frozen; use a new revision';clear();ROOT=group(mid);PARTS={};MOTIONS={};REUSED=[]
 if mid=='regatta-course' and version.startswith('v4'):exec(compile((BASE/'source/model-build/r4_regatta.py').read_text(),'r4_regatta.py','exec'),globals())
 if mid=='regatta-course' and version.startswith('v5'):
  exec(compile((BASE/'source/model-build/r4_regatta.py').read_text(),'r4_regatta.py','exec'),globals())
  exec(compile((BASE/'source/model-build/r5_regatta.py').read_text(),'r5_regatta.py','exec'),globals())
  if version.startswith(('v5.2','v5.3')):exec(compile((BASE/'source/model-build/r52_regatta.py').read_text(),'r52_regatta.py','exec'),globals())
  if version.startswith('v5.3'):exec(compile((BASE/'source/model-build/r53_islet.py').read_text(),'r53_islet.py','exec'),globals())
 spec={'regatta-course':regatta,'tower-course':tower,'aqua-kit':aqua,'social-picnic':picnic,'social-theatre':theatre,'social-beach':beach}[mid]()
 for p in PARTS.values():p.finish()
 if mid=='regatta-course' and version.startswith('v5'):apply_r5_terrain_colour()
 for overview in ['regatta_full_course','tower_full_overview','aqua_full_course']:
  if overview in bpy.data.objects:consolidate_overview(overview)
 objects=[p.ctrl for p in PARTS.values() if any(pose(p.name,clip,.31) is not None for clip in ['idle','action','success','failure'])]
 durations={'idle':2,'action':3.6 if mid in ['tower-course','aqua-kit'] else 2.4,'success':1.2,'failure':1.2}
 clips=bake(mid,objects,durations,pose);bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
 for name in ['glb','blender','renders','evidence','source-v1']:(BASE/'models'/name).mkdir(parents=True,exist_ok=True)
 glb=BASE/'models/glb'/f'{mid}-{version}.glb';blend=BASE/'models/blender'/f'{mid}-{version}.blend';renderfile=BASE/'models/renders'/f'{mid}-{version}.png'
 meta=export(ROOT,glb)
 snapshots=BASE/'models/source-v1'/f'{mid}-{version}';snapshots.mkdir(parents=True,exist_ok=True)
 for name in ['build_kits.py','labcore.py','contracts.json','v2_modes.py','r4_regatta.py','r5_regatta.py','r52_regatta.py','r53_islet.py','r53-islet.json','r5-layout.json','review_views.py']:
  dest=snapshots/name
  if not dest.exists():dest.write_text((BASE/'source/model-build'/name).read_text())
 reused=stage(mid,ROOT);scene=bpy.context.scene;scene.render.filepath=str(renderfile);scene['headless_mcp']=bpy.app.background;scene['concept_only']=True;scene['kit']=mid;scene['reference']=REFS[mid]
 bpy.ops.wm.save_as_mainfile(filepath=str(blend))
 if render:bpy.ops.render.render(write_still=True)
 evidence={'id':mid,'version':version,'pid':os.getpid(),'background':bpy.app.background,'blender':bpy.app.version_string,'transport':'real execute_blender_code via headless MCP','spec':spec,'parts':{name:{'node':p.ctrl.name,'anchors':p.anchors,'anchorNodes':p.anchorNodes,'displayOffset':list(p.offset)} for name,p in PARTS.items()},'glb':meta,'clipTimings':clips,'reference':REFS[mid],'referenceSha256':hashlib.sha256((BASE/REFS[mid]).read_bytes()).hexdigest(),'reusedInRender':reused,'reusedGeometry':list(REUSED),'motionNodes':dict(MOTIONS),'sourceSnapshot':str(snapshots.relative_to(BASE))}
 ev=BASE/'models/evidence'/f'{mid}-{version}-checks.json';ev.write_text(json.dumps(evidence,ensure_ascii=False,indent=2))
 mf=BASE/'models/manifest.json';manifest=json.loads(mf.read_text()) if mf.exists() else {'units':'m','up':'+Y','front':'-Z','kits':[],'models':[]}
 declared=json.loads((BASE/'source/model-build/contracts.json').read_text())['kits'][mid]['components']
 entry={'id':mid,'name':NAMES[mid],'glb':str(glb.relative_to(BASE)),'blend':str(blend.relative_to(BASE)),'render':str(renderfile.relative_to(BASE)),'triangles':meta['triangles'],'clips':meta['clips'],'parts':list(dict.fromkeys(list(PARTS)+declared)),'anchors':{name:p.anchors for name,p in PARTS.items() if p.anchors},'anchorNodes':{name:p.anchorNodes for name,p in PARTS.items() if p.anchors},'mcpEvidence':str(ev.relative_to(BASE)),'version':version,'animationStatus':'exported rigid-part clips; demos retain their scoped procedural mechanics'}
 entry['nativeMcpReceipt']='models/evidence/mcp-'+mid+'-'+version+'.json';entry['reusedGeometry']=list(REUSED);entry['motionNodes']=dict(MOTIONS)
 if mid=='regatta-course' and version.startswith(('v5.2','v5.3')):
  entry['routePlanOverlay']={'node':'route_plan_overlay','defaultVisible':False,'extra':'planOverlayOnly','purpose':'optional planning only; artwork and game views hide it'}
  entry['visualStatus']=version+' bounded source correction exported; root art/live acceptance pending'
 for key in ['kits','models']:manifest[key]=[m for m in manifest[key] if m['id']!=mid]+[entry]
 mf.write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print('PRODUCT_KIT_RESULT',json.dumps({'id':mid,'version':version,'triangles':meta['triangles'],'clips':meta['clips'],'background':bpy.app.background,'pid':os.getpid()},ensure_ascii=False));return evidence

FEATURES={
 'picnic-carry':('social-picnic',['carry_tray','party_cake']),
 'one-take-theatre':('social-theatre',['theatre_stage','umbrella','crown','bell']),
 'chalk-relay':('social-beach',['chalk_gate','chalk_hurdle']),
 'tandem-kite':('social-beach',['kite_body','kite_tail1','kite_tail2','kite_tail3','kite_tail4','spool']),
 'tide-tower':('social-beach',['sand_foundation','sand_arch','sand_turret','sand_brace','shovel','shell']),
 'reply-jam':('social-theatre',['ukulele','drum','whistle'])
}
FEATURE_TITLES={'picnic-carry':'Не урони праздник','one-take-theatre':'Театр одного дубля','chalk-relay':'Меловая эстафета','tandem-kite':'Змей на двоих','tide-tower':'Башня прилива','reply-jam':'Джем с ответом'}
def duplicate_tree(obj,parent=None,suffix='_scene_copy'):
 copy=obj.copy();copy.name=obj.name+suffix;copy.animation_data_clear();bpy.context.collection.objects.link(copy);copy.parent=parent
 for child in obj.children:duplicate_tree(child,copy,suffix)
 return copy
def feature_scene(feature,version='v2'):
 """A saved Blender composition of the actual feature parts, not an ImageGen render."""
 assert bpy.app.background
 mid,keep=FEATURES[feature];mf=BASE/'models/manifest.json';manifest=json.loads(mf.read_text());entry=next(e for e in manifest['kits'] if e['id']==mid)
 bpy.ops.wm.open_mainfile(filepath=str(BASE/entry['blend']));root=bpy.data.objects[mid];scene=bpy.context.scene
 for o in root.children_recursive:
  ancestor=o;show=False
  while ancestor and ancestor!=root:
   if ancestor.name in keep:show=True;break
   ancestor=ancestor.parent
  o.hide_render=not show
 def move(name,pos):
  o=bpy.data.objects[name];o.location=C(pos);o.rotation_euler=(0,0,0);return o
 actors=[o for o in bpy.data.objects if o.name.startswith('preview_reused_jelly') and o.parent is None]
 contacts=[]
 if feature=='picnic-carry':
  move('carry_tray',(0,1.0,0));move('party_cake',(0,1.06,0))
  for i,o in enumerate(actors):o.location=C((0,-.02,-1.02 if i==0 else 1.02));o.rotation_euler.z=pi if i==0 else 0
 elif feature=='one-take-theatre':
  move('umbrella',(.65,1.05,-.85));move('crown',(-.65,1.48,-.25));move('bell',(.95,.92,-.90));contacts+=bind_hands(actors[1],['umbrella_grip','bell_grip'])
 elif feature=='chalk-relay':
  gate=move('chalk_gate',(-1.8,0,0));move('chalk_hurdle',(0,0,1.05));other=duplicate_tree(gate,root);other.location=C((1.8,0,-.8))
  for i,o in enumerate(actors):o.location=C((-1.4 if i==0 else 1.1,0,1.6));o.rotation_euler.z=0
 elif feature=='tandem-kite':
  move('kite_body',(0,3.2,0))
  for i in range(4):move('kite_tail'+str(i+1),(0,2.45-i*.19,0))
  move('spool',(-1.2,.95,.70));materials();line=Part('preview_kite_line',parent=root);line.tube([(-1.2,.99,.70),(-.6,2.1,.30),(0,3.2,.015)],.007,'cream',0,6);line.finish()
  for i,o in enumerate(actors):o.location=C((-.65 if i==0 else 1.15,0,1.4))
  contacts+=bind_hands(actors[0],['spool_grip'])
 elif feature=='tide-tower':
  move('sand_foundation',(0,0,0));move('sand_arch',(0,.45,0));top=move('sand_turret',(0,1.10,0));move('sand_brace',(1.35,0,.2));move('shovel',(-1.1,0,.45));move('shell',(-.9,0,.5))
  upper=duplicate_tree(bpy.data.objects['sand_foundation'],root);upper.location=C((0,2.0,0));cap=duplicate_tree(top,root);cap.location=C((0,2.45,0))
  for i,o in enumerate(actors):o.location=C((-1.4 if i==0 else 1.4,0,.9))
 elif feature=='reply-jam':
  move('ukulele',(-.9,.95,-.60));move('drum',(.9,.95,-.59));bpy.data.objects['drum'].rotation_euler.x=-pi/2;move('whistle',(0,1.02,.30))
  for i,o in enumerate(actors):o.location=C((-.9 if i==0 else .9,0,0))
  contacts+=bind_hands(actors[0],['ukulele_grip']);contacts+=bind_hands(actors[1],['drum_grip']);caller,proof=preview_actor((0,0,.85),bodycolor='cream');anchor=group('preview_whistle_hand_grip',bpy.data.objects['whistle'],(-.035,0,0));contacts+=bind_hands(caller,[anchor.name])
 cam=scene.camera;cam.location=C((7,4.8,-9));cam.rotation_euler=(Vector(C((0,1.25,0)))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=7.1;scene.cycles.samples=24
 renderfile=BASE/'models/renders'/f'{feature}-{version}.png';blend=BASE/'models/blender'/f'{feature}-{version}.blend';scene.render.filepath=str(renderfile);scene['feature']=feature;scene['modelSource']=entry['glb'];bpy.ops.wm.save_as_mainfile(filepath=str(blend));bpy.ops.render.render(write_still=True)
 manifest['features']= [e for e in manifest.get('features',[]) if e['id']!=feature]+[{'id':feature,'kit':mid,'title':FEATURE_TITLES[feature],'render':str(renderfile.relative_to(BASE)),'blend':str(blend.relative_to(BASE)),'version':version,'sourceGLB':entry['glb'],'nativeMcpReceipt':f'models/evidence/mcp-{feature}-{version}.json','contacts':contacts,'purpose':'actual authored/reused Blender composition; not game playtest evidence'}]
 mf.write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print('PRODUCT_FEATURE_RESULT',json.dumps(manifest['features'][-1],ensure_ascii=False));return manifest['features'][-1]

def picnic_pose(version='v2',critical=False):
 """Two real contact poses; the same parent tilts tray and cake, hands track grips."""
 mf=BASE/'models/manifest.json';manifest=json.loads(mf.read_text());entry=next(e for e in manifest['kits'] if e['id']=='social-picnic');bpy.ops.wm.open_mainfile(filepath=str(BASE/entry['blend']));scene=bpy.context.scene;tray=bpy.data.objects['carry_tray'];cake=bpy.data.objects['party_cake'];cargo=group('picnic_shared_cargo',bpy.data.objects['social-picnic'],(0,1,0));tray.parent=cargo;tray.location=(0,0,0);tray.rotation_euler=(0,0,0);cake.parent=cargo;cake.location=C((.59 if critical else 0,.06,0));cake.rotation_euler=(0,0,0);cargo.rotation_euler.y=.24 if critical else 0
 actors=[o for o in bpy.data.objects if o.name.startswith('preview_reused_jelly') and o.parent is None];contacts=[]
 for i,o in enumerate(actors):
  o.location=C((0,-.02,-1.02 if i==0 else 1.02));o.rotation_euler.z=pi if i==0 else 0;side='front' if i==0 else 'rear';contacts+=bind_hands(o,['handle_'+side+'_left','handle_'+side+'_right'])
 cam=scene.camera;cam.location=C((6,3.3,-1.7));cam.rotation_euler=(Vector(C((0,.95,0)))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=4.5;scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.cycles.samples=24
 suffix='critical' if critical else 'hold';renderfile=BASE/'models/renders'/f'picnic-carry-{version}-{suffix}.png';blend=BASE/'models/blender'/f'picnic-carry-{version}-{suffix}.blend';scene.render.filepath=str(renderfile);scene['feature']='picnic-carry';scene['gripErrorMaxM']=max(p['errorM'] for p in contacts);bpy.ops.wm.save_as_mainfile(filepath=str(blend));bpy.ops.render.render(write_still=True)
 proof={'id':'picnic-carry','pose':suffix,'kit':'social-picnic','render':str(renderfile.relative_to(BASE)),'blend':str(blend.relative_to(BASE)),'sourceGLB':entry['glb'],'version':version,'contacts':contacts,'sharedCargoTiltRadians':.24 if critical else 0,'cakeSlideLocalX':.59 if critical else 0,'background':bpy.app.background,'pid':os.getpid()};(BASE/'models/evidence'/f'picnic-carry-{version}-{suffix}.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2));manifest['features']=[e for e in manifest.get('features',[]) if e['id']!='picnic-carry-'+suffix]+[dict(proof,id='picnic-carry-'+suffix)];mf.write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print('PRODUCT_PICNIC_POSE',json.dumps(proof,ensure_ascii=False));return proof

def tower_detail_views(version='v2'):
 mf=BASE/'models/manifest.json';manifest=json.loads(mf.read_text());entry=next(e for e in manifest['kits'] if e['id']=='tower-course');bpy.ops.wm.open_mainfile(filepath=str(BASE/entry['blend']));scene=bpy.context.scene;cam=scene.camera;views=[]
 for name,y in [('lower',31),('middle',93),('upper',155)]:
  target=Vector(C((0,y,-48)));cam.location=Vector(C((58,y+13,-125)));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=77;scene.render.resolution_x=1240;scene.render.resolution_y=1100;scene.cycles.samples=24;renderfile=BASE/'models/renders'/f'tower-course-{version}-{name}.png';scene.render.filepath=str(renderfile);bpy.ops.render.render(write_still=True);views.append(str(renderfile.relative_to(BASE)))
 entry['detailRenders']=views
 for key in ['kits','models']:
  for item in manifest[key]:
   if item['id']=='tower-course':item['detailRenders']=views
 mf.write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print('TOWER_DETAIL_VIEWS',json.dumps(views));return views

exec(compile((BASE/'source/model-build/v2_modes.py').read_text(),'v2_modes.py','exec'))
