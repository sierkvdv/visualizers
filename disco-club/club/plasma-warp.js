// Physical warp entrance/exit plus a clear 3D tumble. Opacity is not used as the episode transition.
(function(root){
 root.ClubPlasmaWarpProfile=function(progress,time,entering){
  const p=Math.max(0,Math.min(1,progress)),w=1-p,scale=.025+.975*p;
  return {x:scale*(.25+.75*p),y:scale*(2.7-1.7*p),z:scale*(.35+.65*p),depth:-2.2*w,twist:(entering?1:-1)*w*2.3,tumble:time*.38};
 };
 root.ClubPlasmaWarpShader=function(source){
  if(source.includes('uniform float uPlasmaWarp;')||!source.includes('uPlasmaAmount'))return source;
  return source.replace('uniform sampler2D uPlasmaImage;','uniform float uPlasmaWarp;uniform sampler2D uPlasmaImage;').replace('vec2 st=(uv-uPlasmaLayout.xy)/scale+.5;',`vec2 local=(uv-uPlasmaLayout.xy)/scale;vec2 st=local+.5;if(abs(uPlasmaWarp)>.001){float radius=length(local);float angle=atan(local.y,local.x)+uPlasmaWarp*3.2*(1.-smoothstep(.05,.9,radius));st=vec2(cos(angle),sin(angle))*radius+.5;}`);
 };
 if(typeof renderer==='undefined'||root.clubPlasmaWarp)return;
 const base=renderer.render,patched=new WeakSet();let objects=0,draws=0,progress=0;
 function render(scene,camera){
  const info=root.clubPlasmaGlobe&&root.clubPlasmaGlobe.info();progress=info?info.envelope||0:0;
  for(const mesh of scene&&scene.children||[]){const mat=mesh.material,u=mat&&mat.uniforms;if(!u||!u.uPlasmaImage)continue;
   if(!mat.fragmentShader.includes('uniform float uPlasmaWarp;')){mat.fragmentShader=root.ClubPlasmaWarpShader(mat.fragmentShader);u.uPlasmaWarp={value:0};mat.needsUpdate=true;}
   if(!patched.has(mesh)&&(mesh.userData.clubPlasma3DHook||Function.prototype.toString.call(mesh.onBeforeRender).includes('uu.uPlasmaImage.value=visual.texture'))){const before=mesh.onBeforeRender;mesh.onBeforeRender=function(...args){before.apply(this,args);const uu=this.material&&this.material.uniforms;if(!uu||!uu.uPlasmaWarp)return;const p=root.clubPlasmaGlobe&&root.clubPlasmaGlobe.info();const visible=uu.uPlasmaAmount.value>.001;uu.uPlasmaAmount.value=visible?1:0;uu.uPlasmaWarp.value=p?(1-p.envelope)*(p.age<4?1:-1):0;};patched.add(mesh);}
  }
  // This exact scene contains the real globe, not the club or the other 3D effects.
  let group=null,filament=null;
  if(info&&camera&&camera.isPerspectiveCamera&&scene.children&&scene.children.length<9){for(const candidate of scene.children){if(!candidate.isGroup||candidate.children.length<40)continue;filament=candidate.children.find(m=>m.material&&m.material.uniforms&&m.material.uniforms.endpoint&&m.material.uniforms.pathCoord===undefined);if(filament){group=candidate;break;}}}
  if(!group)return base.call(this,scene,camera);
  const time=filament.material.uniforms.time.value,profile=root.ClubPlasmaWarpProfile(progress,time,info.age<4),position=group.position.clone(),quaternion=group.quaternion.clone(),scale=group.scale.clone(),cp=camera.position.clone(),cq=camera.quaternion.clone();
  group.scale.set(profile.x,profile.y,profile.z);group.position.z+=profile.depth;group.position.x+=(1-progress)*Math.sin(time*.7)*.5;group.position.y+=.08*Math.sin(time*.6);
  group.rotation.y+=profile.tumble;group.rotation.x+=.28*Math.sin(time*.52);group.rotation.z+=profile.twist+.13*Math.sin(time*.37);
  camera.position.x+=Math.sin(time*.43)*.45;camera.position.y+=Math.cos(time*.31)*.13;camera.position.z+=(1-progress)*1.8;camera.lookAt(0,-.1,0);objects=1;draws++;
  try{return base.call(this,scene,camera);}finally{group.position.copy(position);group.quaternion.copy(quaternion);group.scale.copy(scale);camera.position.copy(cp);camera.quaternion.copy(cq);}
 }
 renderer.render=render;
 root.clubPlasmaWarp={info:()=>({active:true,objects,draws,progress:+progress.toFixed(3),transition:'3d-vortex-warp',opacityFade:false})};
})(window);
