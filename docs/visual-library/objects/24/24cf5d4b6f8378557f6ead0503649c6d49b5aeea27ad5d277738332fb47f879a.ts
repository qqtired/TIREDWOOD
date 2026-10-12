// Code-built interpretation of the four supplied Tokarevsky reference photographs.
// Photos are references only: no remote/published image assets or additional textures.
import * as THREE from 'three';
import { mergeColored, paint, place, staticMesh } from '../render/kit.ts';

export class TokarevLighthouse {
  readonly group = new THREE.Group();
  readonly lampAnchor = new THREE.Object3D();
  readonly lamp: THREE.Mesh;

  constructor() {
    this.group.name = 'tokarevsky-lighthouse';
    const parts: THREE.BufferGeometry[] = [];
    const white = 0xe9e8df, trim = 0xf5f1df, soot = 0x282d2e, red = 0xcc352c;
    const add = (g: THREE.BufferGeometry, c: number, x: number, y: number, z: number) => parts.push(place(paint(g,c),x,y,z));
    const cylinder = (rt: number, rb: number, h: number, y: number, c: number, n = 32) => add(new THREE.CylinderGeometry(rt,rb,h,n).rotateY(n===8 ? Math.PI/8 : 0),c,0,y,0);
    // The eight-sided base is deliberately wider than the round upper storey.
    cylinder(1.54,1.54,.36,.18,soot,8);
    cylinder(1.46,1.46,4.05,2.385,white,8);
    cylinder(1.48,1.46,.14,4.48,trim,8);
    cylinder(1.57,1.48,.16,4.63,trim,8);
    cylinder(1.57,1.57,.13,4.775,white,8);
    cylinder(1.2,1.2,3.76,6.72,white);
    cylinder(1.24,1.2,.14,8.67,trim);
    cylinder(1.44,1.24,.18,8.83,trim);
    cylinder(1.51,1.51,.13,8.985,white);
    cylinder(1.51,1.51,.055,9.077,0xa5a496);
    // Narrow framed openings: front door in octagon, upper dark window and rear slit.
    add(new THREE.BoxGeometry(.73,2.24,.085),trim,0,1.48,-1.36);
    add(new THREE.BoxGeometry(.53,2.04,.035),0x394442,0,1.45,-1.416);
    add(new THREE.BoxGeometry(.027,1.94,.02),0x65726b,0,1.45,-1.438);
    add(new THREE.SphereGeometry(.025,6,4),0xc6b689,.17,1.37,-1.46);
    for (const z of [-1.19,1.19]) {
      add(new THREE.BoxGeometry(.57,1.27,.065),trim,0,5.72,z);
      add(new THREE.BoxGeometry(.4,1.12,.072),0x263e43,0,5.73,z + Math.sign(z)*.022);
      add(new THREE.BoxGeometry(.43,.055,.11),0xb3b8a8,0,5.14,z);
    }
    // Fine horizontal masonry joints and irregular mortar highlights, merged into the shell.
    for (let y=5.04;y<8.54;y+=.29) cylinder(1.204,1.204,.007,y,0xd9d9ce);
    for (let i=0;i<28;i++) {
      const a=i*2.399963, y=5.12+(i%11)*.3;
      add(new THREE.BoxGeometry(.055,.018,.012).rotateY(-a), i%3 ? 0xd8d9cd : 0xf0ede1,Math.sin(a)*1.204,y,Math.cos(a)*1.204);
    }
    // Open gallery railing, two continuous rings with thin vertical pickets.
    for (const y of [9.31,9.78]) add(new THREE.TorusGeometry(1.43,.025,5,40).rotateX(Math.PI/2),trim,0,y,0);
    for (let i=0;i<24;i++) {
      const a=i*Math.PI*2/24;
      add(new THREE.CylinderGeometry(.018,.018,.69,5),white,Math.sin(a)*1.43,9.435,Math.cos(a)*1.43);
    }
    // Lantern lower drum, slender glazing bars and bright roof with overhanging lip.
    cylinder(.81,.81,.27,9.235,white,12);
    cylinder(.86,.86,.065,9.405,trim,12);
    cylinder(.86,.86,.075,10.26,trim,12);
    for (let i=0;i<12;i++) {
      const a=i*Math.PI/6;
      add(new THREE.CylinderGeometry(.025,.025,.85,5),white,Math.sin(a)*.827,9.82,Math.cos(a)*.827);
    }
    cylinder(1.02,1.02,.085,10.337,red);
    cylinder(.15,1.02,.69,10.725,red);
    cylinder(.14,.2,.18,11.16,red,16);
    add(new THREE.SphereGeometry(.165,16,12),red,0,11.38,0);
    cylinder(.022,.044,.49,11.735,soot,8);
    // Small red auxiliary beacon on the balcony, visible in the reference photographs.
    cylinder(.12,.15,.16,9.185,red,12); // central support remains hidden inside the lantern drum
    add(new THREE.CylinderGeometry(.095,.115,.36,10),red,-1.16,9.38,0);
    add(new THREE.ConeGeometry(.14,.12,12),red,-1.16,9.62,0);
    add(new THREE.BoxGeometry(.075,.012,.07),0xf4ba85,-1.16,9.48,-.082);
    const opaque=staticMesh(mergeColored(parts),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.89,metalness:.025}),true);
    this.group.add(opaque);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(.82,.82,.79,12,1,true),new THREE.MeshStandardMaterial({color:0x72938f,roughness:.18,metalness:.08,transparent:true,opacity:.32,depthWrite:false,side:THREE.DoubleSide}));
    glass.position.y=9.825; this.group.add(glass);
    this.lampAnchor.name='lighthouse-lamp-anchor'; this.lampAnchor.position.y=9.73;
    this.group.add(this.lampAnchor);
    this.lamp=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.46,16),new THREE.MeshBasicMaterial({color:0xffe4a2}));
    this.lamp.name='lighthouse-fresnel-lamp';
    this.lampAnchor.add(this.lamp);
  }

  /** Storm owns the policy. The opaque landmark/glazing remain visible when its lamp is off. */
  setLampEnabled(on: boolean): void { this.lamp.visible=on; }
}
