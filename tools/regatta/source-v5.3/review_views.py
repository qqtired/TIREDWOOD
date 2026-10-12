"""Next-window source only. Real camera views; never starts a Blender process.
Load build_kits first, then call aqua_game_views only after root native MCP GO.
"""
def aqua_game_views(version='v3',selected=None):
 mf=BASE/'models/manifest.json';manifest=json.loads(mf.read_text());entry=next(e for e in manifest['kits'] if e['id']=='aqua-kit');bpy.ops.wm.open_mainfile(filepath=str(BASE/entry['blend']));scene=bpy.context.scene;cam=scene.camera
 for o in bpy.data.objects:
  if o.name.startswith('preview_reused_jelly'):
   for mesh in o.children_recursive:mesh.hide_render=True
 # Source jelly GLB actual metric height is 1.58m; scale gives exactly 1.6m.
 presets=[
  {'id':'slide-bounces','title':'Горка: борта, опоры и два батута','actor':(-59,4,-65),'camera':(-48,7.5,-49),'target':(-57,1.8,-59),'purpose':'Authored slide, soft edge tubes, trestles and two different-height trampolines'},
  {'id':'sweeper','title':'Вертушка: мягкое основание и рабочая площадка','actor':(-60.7,-.3,-45),'camera':(-50,3.6,-38),'target':(-59,.15,-43.4),'purpose':'Flat working disc, thick inflated edge, cream seam, rotor bearing and padded arm; actor stands outside the displayed bar'},
  {'id':'meeting-ferries','title':'Паромы: поза пересадки у финиша','actor':(-16.7,-.2,-37.4),'camera':(-8,3.5,-30),'target':(-15,-.1,-37.4),'purpose':'Meeting transfer pose, separate ferry rails/cleats and finish landing; not full timing/physics acceptance'}
 ]
 views=[];actor=None
 for preset in presets:
  if selected and preset['id'] not in selected:continue
  if actor:
   for o in actor.children_recursive:o.hide_render=True
  delta=Vector(preset['camera'])-Vector(preset['actor']);yaw=math.atan2(delta.x,delta.z)+pi
  actor,reuseProof=preview_actor(preset['actor'],scale=1.6/1.58,yaw=yaw,bodycolor='coral');actor['metric_height']=1.6
  if preset['id']=='meeting-ferries':
   bpy.data.objects['aqua_course_meet_ferry_a'].location.x=-16.7;bpy.data.objects['aqua_course_meet_ferry_b'].location.x=-14.0
  bpy.context.view_layer.update();cam.data.type='PERSP';cam.data.lens=38;cam.location=C(preset['camera']);cam.rotation_euler=(Vector(C(preset['target']))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.cycles.samples=24
  renderfile=BASE/'models/renders'/f'aqua-{version}-{preset["id"]}.png';blend=BASE/'models/blender'/f'aqua-{version}-{preset["id"]}.blend';scene.render.filepath=str(renderfile);scene['review_view']=preset['id'];scene['not_game_physics_acceptance']=True;bpy.ops.wm.save_as_mainfile(filepath=str(blend));bpy.ops.render.render(write_still=True)
  receipt=f'models/evidence/mcp-aqua-{preset["id"]}-{version}.json' if selected else f'models/evidence/mcp-aqua-gameviews-{version}.json';views.append({'id':'aqua-'+preset['id'],'kit':'aqua-kit','title':preset['title'],'render':str(renderfile.relative_to(BASE)),'blend':str(blend.relative_to(BASE)),'nativeMcpReceipt':receipt,'sourceGLB':entry['glb'],'sourceGLBHash':hashlib.sha256((BASE/entry['glb']).read_bytes()).hexdigest(),'actorHeightM':1.6,'reusedActor':reuseProof,'camera':preset['camera'],'target':preset['target'],'purpose':preset['purpose'],'background':bpy.app.background,'pid':os.getpid()})
 ids={v['id'] for v in views};manifest['aquaReviewViews']=[v for v in manifest.get('aquaReviewViews',[]) if v['id'] not in ids]+views;manifest['features']=[f for f in manifest.get('features',[]) if f['id'] not in ids]+views;mf.write_text(json.dumps(manifest,ensure_ascii=False,indent=2));(BASE/'models/evidence'/f'aqua-gameviews-{version}.json').write_text(json.dumps(manifest['aquaReviewViews'],ensure_ascii=False,indent=2));print('AQUA_REAL_REVIEW_VIEWS',json.dumps([v['render'] for v in views]));return views

def regatta_game_views(version='v4',selected=None):
 mf=BASE/'models/manifest.json';manifest=json.loads(mf.read_text());entry=next(e for e in manifest['kits'] if e['id']=='regatta-course');assert entry['version'].startswith(('v4','v5')),'Do not render rejected V2 as a new world';bpy.ops.wm.open_mainfile(filepath=str(BASE/entry['blend']));scene=bpy.context.scene;cam=scene.camera;full=bpy.data.objects['regatta_full_course'];loc=full.matrix_world.translation;offset=Vector((loc.x,loc.z,-loc.y));views=[]
 for o in bpy.data.objects:
  if o.name.startswith('preview_reused_jelly'):
   for mesh in o.children_recursive:mesh.hide_render=True
 presets=[('marina',(-62,-.02,-28),(0,-1),'Порт: три уровня берега, настоящие фасады, доки и лодки'),('cliffs',(67.9,-.02,-37.5),(-.84,.54),'Пролив: связные белые стенки, мост и светлый выход'),('lighthouse',(26,-.02,12),(1,0),'Маячный выбор: два физически разных водных коридора')]
 if entry['version'].startswith('v5'):
  layout=json.loads((BASE/'source/model-build/r5-layout.json').read_text());presets=[(view,layout['stagingBoats'][view]['position'],layout['stagingBoats'][view]['forward'],title) for view,pos,forward,title in presets]
 for view,pos,forward,title in presets:
  if selected and view not in selected:continue
  for o in bpy.data.objects:
   if o.name.startswith('preview_reused_coastal_boat'):
    for child in o.children_recursive:child.hide_render=True
  reuseProof=preview_boat(Vector(pos)+offset,math.atan2(-forward[0],-forward[1]));cameraNode=bpy.data.objects['game_camera_'+view];lookNode=bpy.data.objects['game_look_'+view];cam.location=cameraNode.matrix_world.translation;cam.rotation_euler=(lookNode.matrix_world.translation-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='PERSP';cam.data.sensor_fit='VERTICAL';cam.data.sensor_height=24;cam.data.lens=24/(2*math.tan(math.radians(34)));scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.cycles.samples=24
  renderfile=BASE/'models/renders'/f'regatta-{version}-{view}.png';blend=BASE/'models/blender'/f'regatta-{version}-{view}.blend';scene.render.filepath=str(renderfile);scene['review_view']=view;scene['not_game_physics_acceptance']=True;bpy.ops.wm.save_as_mainfile(filepath=str(blend));bpy.ops.render.render(write_still=True);receipt=f'models/evidence/mcp-regatta-{view}-{version}.json' if selected else f'models/evidence/mcp-regatta-gameviews-{version}.json';views.append({'id':'regatta-'+view,'kit':'regatta-course','title':title,'render':str(renderfile.relative_to(BASE)),'blend':str(blend.relative_to(BASE)),'nativeMcpReceipt':receipt,'sourceGLB':entry['glb'],'sourceGLBHash':hashlib.sha256((BASE/entry['glb']).read_bytes()).hexdigest(),'reusedBoat':reuseProof,'cameraAnchor':'game_camera_'+view,'lookAnchor':'game_look_'+view,'purpose':'Actual Blender frame from proposed game camera; not a runtime regatta screenshot','background':bpy.app.background,'pid':os.getpid()})
 ids={v['id'] for v in views};manifest['regattaReviewViews']=[v for v in manifest.get('regattaReviewViews',[]) if v['id'] not in ids]+views;manifest['features']=[f for f in manifest.get('features',[]) if f['id'] not in ids]+views;mf.write_text(json.dumps(manifest,ensure_ascii=False,indent=2));(BASE/'models/evidence'/f'regatta-gameviews-{version}.json').write_text(json.dumps(manifest['regattaReviewViews'],ensure_ascii=False,indent=2));print('REGATTA_REAL_REVIEW_VIEWS',json.dumps([v['render'] for v in views]));return views
