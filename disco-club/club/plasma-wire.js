// Present the existing morphing plasma as large floating 3D strands, without glass.
(function(root){
 if(typeof renderer==='undefined'||(root.clubPlasmaWire&&root.clubPlasmaWire.version===5))return;
 if(root.clubPlasmaWire)root.clubPlasmaWire.setEnabled(false);
  root.ClubPlasmaWireMotion=function(time,episode,energy){
  const p=episode*2.39996323,t=time;
  return {scale:4.4+.50*Math.sin(t*.31+p)+.25*Math.sin(t*.73-p),
   x:.13*Math.sin(t*.37+p)+.035*Math.sin(t*.79),y:.085*Math.sin(t*.29-p),
   rx:.32*Math.sin(t*.51+p),ry:t*.24+p,rz:.26*Math.sin(t*.41-p)+t*.08};
 };
 const base=renderer.render,patched=new WeakSet();let enabled=true,draws=0,motion=root.ClubPlasmaWireMotion(0,1,0);
 function render(scene,camera){
  for(const mesh of scene&&scene.children||[]){const u=mesh.material&&mesh.material.uniforms;
   if(!u||!u.uPlasmaLayout||!mesh.userData.clubPlasma3DHook||patched.has(mesh))continue;
   const before=mesh.onBeforeRender,layout=new THREE.Vector3();
   mesh.onBeforeRender=function(...args){before.apply(this,args);const uu=this.material&&this.material.uniforms;
    if(enabled&&uu&&uu.uPlasmaAmount.value>.001){layout.copy(uu.uPlasmaLayout.value);layout.z*=motion.scale;layout.x+=motion.x;layout.y+=motion.y;uu.uPlasmaLayout.value=layout;}
   };patched.add(mesh);
  }
  let group;
  if(camera&&camera.isPerspectiveCamera&&scene.children&&scene.children.length<9)group=scene.children.find(g=>g.isGroup&&g.children.length>=40&&g.children.some(m=>m.material&&m.material.uniforms&&m.material.uniforms.endpoint));
  if(!enabled||!group)return base.call(this,scene,camera);
  const hidden=group.children.filter(m=>m.isMesh&&!(m.material&&m.material.uniforms&&m.material.uniforms.endpoint));
    const filament=group.children.find(m=>m.material&&m.material.uniforms&&m.material.uniforms.endpoint),u=filament.material.uniforms;
  const info=root.clubPlasmaGlobe&&root.clubPlasmaGlobe.info();motion=root.ClubPlasmaWireMotion(u.time.value,info?info.episodes||1:1,u.energy.value);
  const visibility=hidden.map(m=>m.visible),zoom=camera.zoom,quaternion=group.quaternion.clone();
  group.rotateX(motion.rx);group.rotateY(motion.ry);group.rotateZ(motion.rz);
  hidden.forEach(m=>{m.visible=false;});camera.zoom=zoom*1.15;camera.updateProjectionMatrix();draws++;
  try{return base.call(this,scene,camera);}finally{hidden.forEach((m,i)=>{m.visible=visibility[i];});group.quaternion.copy(quaternion);camera.zoom=zoom;camera.updateProjectionMatrix();}
 }
 renderer.render=render;
 root.clubPlasmaWire={version:5,setEnabled(v){enabled=!!v;},info:()=>({enabled,draws,glass:false,solidCore:false,layoutScale:+motion.scale.toFixed(3),position:[+motion.x.toFixed(3),+motion.y.toFixed(3)],rotation:[motion.rx,motion.ry,motion.rz],cameraScale:1.15})};
})(window);




