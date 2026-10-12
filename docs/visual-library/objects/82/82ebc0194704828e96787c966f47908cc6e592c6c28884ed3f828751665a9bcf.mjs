// Fit the actual GLB bounding corners in an inspector; no game scene or geometry changes.
export function fitModelCamera(camera,box,aspect,padding=1.12){
 const center={x:(box.min.x+box.max.x)/2,y:(box.min.y+box.max.y)/2,z:(box.min.z+box.max.z)/2};
 const half=[(box.max.x-box.min.x)/2,(box.max.y-box.min.y)/2,(box.max.z-box.min.z)/2];
 const norm=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);},dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
 const front=norm([.8,.55,1]),right=norm([front[2],0,-front[0]]),up=[front[1]*right[2],front[2]*right[0]-front[0]*right[2],-front[1]*right[0]];
 const tanV=Math.tan(camera.fov*Math.PI/360),tanH=tanV*aspect;let distance=0;
 for(let i=0;i<8;i++){const p=half.map((h,k)=>i&(1<<k)?h:-h);distance=Math.max(distance,dot(p,front)+padding*Math.max(Math.abs(dot(p,right))/tanH,Math.abs(dot(p,up))/tanV));}
 distance=Math.max(distance,.2);camera.aspect=aspect;camera.position.set(center.x+front[0]*distance,center.y+front[1]*distance,center.z+front[2]*distance);camera.lookAt(center.x,center.y,center.z);updateModelDepth(camera,center,box);camera.updateProjectionMatrix();
 return{center,distance,size:half.map(x=>x*2)};
}
export function updateModelDepth(camera,target,box){
 const cx=(box.min.x+box.max.x)/2,cy=(box.min.y+box.max.y)/2,cz=(box.min.z+box.max.z)/2;
 const radius=Math.hypot(box.max.x-box.min.x,box.max.y-box.min.y,box.max.z-box.min.z)/2;
 const distance=Math.hypot(camera.position.x-target.x,camera.position.y-target.y,camera.position.z-target.z);
 const near=Math.max(.001,distance*.02),far=Math.max(near*100,Math.hypot(camera.position.x-cx,camera.position.y-cy,camera.position.z-cz)+radius*1.2);
 if(Math.abs(camera.near-near)>1e-7||Math.abs(camera.far-far)>1e-7){camera.near=near;camera.far=far;camera.updateProjectionMatrix();}
 return{distance,near,far,farNearRatio:far/near};
}
