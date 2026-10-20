// Present the existing morphing plasma as large floating 3D strands, without glass.
(function(root){
 if(typeof renderer==='undefined'||root.clubPlasmaWire)return;
 const base=renderer.render,patched=new WeakSet();let enabled=true,draws=0;
 function render(scene,camera){
  for(const mesh of scene&&scene.children||[]){const u=mesh.material&&mesh.material.uniforms;
   if(!u||!u.uPlasmaLayout||!mesh.userData.clubPlasma3DHook||patched.has(mesh))continue;
   const before=mesh.onBeforeRender,layout=new THREE.Vector3();
   mesh.onBeforeRender=function(...args){before.apply(this,args);const uu=this.material&&this.material.uniforms;
    if(enabled&&uu&&uu.uPlasmaAmount.value>.001){layout.copy(uu.uPlasmaLayout.value);layout.z*=1.4;uu.uPlasmaLayout.value=layout;}
   };patched.add(mesh);
  }
  let group;
  if(camera&&camera.isPerspectiveCamera&&scene.children&&scene.children.length<9)group=scene.children.find(g=>g.isGroup&&g.children.length>=40&&g.children.some(m=>m.material&&m.material.uniforms&&m.material.uniforms.endpoint));
  if(!enabled||!group)return base.call(this,scene,camera);
  const hidden=group.children.filter(m=>m.isMesh&&!(m.material&&m.material.uniforms&&m.material.uniforms.endpoint));
  const visibility=hidden.map(m=>m.visible),zoom=camera.zoom;
  hidden.forEach(m=>{m.visible=false;});camera.zoom=zoom*1.15;camera.updateProjectionMatrix();draws++;
  try{return base.call(this,scene,camera);}finally{hidden.forEach((m,i)=>{m.visible=visibility[i];});camera.zoom=zoom;camera.updateProjectionMatrix();}
 }
 renderer.render=render;
 root.clubPlasmaWire={setEnabled(v){enabled=!!v;},info:()=>({enabled,draws,glass:false,solidCore:false,layoutScale:1.4,cameraScale:1.15})};
})(window);
