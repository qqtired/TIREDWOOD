// ground footprint of a perspective camera looking at the hero (origin), pitch below horizon, vFOV, distance
function foot(vfovDeg, pitchDeg, dist, aspect=16/9){
  const v=vfovDeg*Math.PI/180, p=pitchDeg*Math.PI/180;
  const h=dist*Math.sin(p), back=dist*Math.cos(p); // camera at (0,h,+back) looking toward -z... camera south of hero
  const th=Math.tan(v/2), tw=th*aspect;
  // camera basis
  const f=[0,-Math.sin(p),-Math.cos(p)]; const r=[1,0,0]; const u=[0,Math.cos(p),-Math.sin(p)];
  const pts={};
  for(const [name,sx,sy] of [['TL',-1,1],['TR',1,1],['BL',-1,-1],['BR',1,-1],['T',0,1],['B',0,-1],['L',-1,0],['R',1,0]]){
    const d=[f[0]+r[0]*sx*tw+u[0]*sy*th, f[1]+r[1]*sx*tw+u[1]*sy*th, f[2]+r[2]*sx*tw+u[2]*sy*th];
    const t=-h/d[1]; pts[name]=[+(d[0]*t).toFixed(1), +((back+d[2]*t)).toFixed(1)];
  }
  return {h:+h.toFixed(1), back:+back.toFixed(1), pts, widthAtHero:+(2*dist*tw).toFixed(1)};
}
for (const [fov,pitch,dist] of [[40,60,30],[35,62,36],[38,60,34],[36,62,35],[34,64,36],[38,63,33]]) console.log(fov,pitch,dist, JSON.stringify(foot(fov,pitch,dist)));
