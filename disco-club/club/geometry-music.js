// Restore music deformation only on spatial terrain/voxel geometry.
(()=>{
 if(typeof renderer==='undefined'||window.clubGeometryMusic)return;
 const base=renderer.render;let draws=0,lastBass=0;
 const api=window.clubGeometryMusic={info:()=>({draws,bass:lastBass}),restore(){if(renderer.render===render)renderer.render=base;delete window.clubGeometryMusic;}};
 function render(scene,camera){
  const mood=window.clubMusicMood;const changed=[];
  if(mood&&scene&&scene.children){for(const mesh of scene.children){
   const mat=mesh.material,u=mat&&mat.uniforms,src=mat&&mat.vertexShader;
   if(!mesh.visible||!u||!u.bass||!u.variant||!u.edgeStrength||!src)continue;
   if(!src.includes('attribute vec2 pixel')&&!src.includes('vec2 st=uv+'))continue;
   changed.push([u,u.bass.value]);
   lastBass=Math.min(.8,Math.max(0,(mood.bassEnvelope||0)*3.4*(.25+.75*(mood.drive||0))));
   u.bass.value=lastBass;draws++;
  }}
  try{return base.call(this,scene,camera);}finally{for(const [u,b] of changed)u.bass.value=b;}
 }
 renderer.render=render;
})();
