"""Only the measured failed D-islet and confirmed warm Regatta lighting.
Main R5.2 terrain/marina/route/cameras and the other five kits are not changed.
Source-only until root grants the next native slot.
"""
R53_ISLET=json.loads((BASE/'source/model-build/r53-islet.json').read_text())
R53_BASE_STAGE=stage
R53_BASE_REGATTA=regatta_overview

def r53_ledge(g,definition):
 poly=definition['footprint'];cx=sum(p[0] for p in poly)/len(poly);cz=sum(p[1] for p in poly)/len(poly);n=len(poly);vertices=[];faces=[]
 for y,scale in [(definition['bottomY'],.94),(definition['topY'],1)]:
  for x,z in poly:vertices.append((cx+(x-cx)*scale,y,cz+(z-cz)*scale))
 for i in range(n):a=i;b=(i+1)%n;faces.append((a,b,b+n,a+n))
 faces.extend([tuple(reversed(range(n))),tuple(n+i for i in range(n))]);p=P(definition['id'],parent=g.ctrl);p.poly(vertices,faces,'stone',0,False)
 # One continuous warm rock material; no alternating cream radial bands.
 if definition['green']:p.backend.colors[-1]=(*COL['olive'],1)

def r5_lighthouse_land(g,poly):
 # This override replaces the whole failed R5.2 ring body; it is not overlaid.
 for definition in R53_ISLET['layers']:r53_ledge(g,definition)
 for rock in R53_ISLET['rocks']:
  p=P(rock['id'],(rock['x'],rock['baseY'],rock['z']),g.ctrl)
  r52_rock(p,0,0,0,rock['rx'],rock['rz'],rock['height'],rock['seed'])
 # The original beacon remains exactly at2.13 on a real flush plinth/green pad.
 g.profile((48.3,1.98,36),[(0,1.04),(.15,1.04)],'stone',0,20)

def stage(mid,root):
 result=R53_BASE_STAGE(mid,root)
 if mid!='regatta-course':return result
 world=bpy.context.scene.world;nodes=world.node_tree.nodes;links=world.node_tree.links
 cameraSky=next(n for n in nodes if n.type=='BACKGROUND');output=next(n for n in nodes if n.type=='OUTPUT_WORLD')
 # Keep the camera sky blue without lighting every stone with saturated blue.
 illumination=nodes.new('ShaderNodeBackground');illumination.inputs[1].default_value=R53_ISLET['previewLighting']['blenderWorldStrength']
 normal=nodes.new('ShaderNodeTexCoord');separate=nodes.new('ShaderNodeSeparateXYZ');links.new(normal.outputs[1],separate.inputs[0])
 factor=nodes.new('ShaderNodeMapRange');factor.inputs[1].default_value=-1;factor.inputs[2].default_value=1;factor.inputs[3].default_value=0;factor.inputs[4].default_value=1;links.new(separate.outputs[2],factor.inputs[0])
 hemi=nodes.new('ShaderNodeMixRGB');hemi.inputs[1].default_value=(*linear(R53_ISLET['previewLighting']['runtimeHemiGround']),1);hemi.inputs[2].default_value=(*linear(R53_ISLET['previewLighting']['runtimeHemiSky']),1);links.new(factor.outputs[0],hemi.inputs[0]);links.new(hemi.outputs[0],illumination.inputs[0])
 lightPath=nodes.new('ShaderNodeLightPath');mix=nodes.new('ShaderNodeMixShader');links.new(lightPath.outputs[0],mix.inputs[0]);links.new(illumination.outputs[0],mix.inputs[1]);links.new(cameraSky.outputs[0],mix.inputs[2])
 for link in list(output.inputs[0].links):links.remove(link)
 links.new(mix.outputs[0],output.inputs[0])
 sun=bpy.data.objects.get('preview_day_sun')
 if sun:sun.data.color=linear(R53_ISLET['previewLighting']['runtimeSun']);sun.data.energy=R53_ISLET['previewLighting']['runtimeSunIntensity']
 bpy.context.scene['r53_confirmed_palette']=json.dumps(R53_ISLET['previewLighting']);bpy.context.scene['r53_geometry_acceptance']=False
 return result

def regatta_overview():
 result=R53_BASE_REGATTA();result['revision']='R5.3 local rejected-islet correction only';result['isletSource']=R53_ISLET;result['isletArtAcceptance']=False;result['otherTerrainGeometryChanged']=False
 return result
