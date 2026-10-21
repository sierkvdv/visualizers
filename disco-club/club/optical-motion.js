// Optical family only: smooth local motion, without brightness pulses or changing other families.
(function(root){
 root.ClubOpticalShader=function(source){
  if(source.includes('uRingClock')||!source.includes('clubLightPrevious'))return source;
  const fn=source.includes('vec4 clubLightWithoutPlasma(')?'clubLightWithoutPlasma':'clubLight';
  const marker='vec4 '+fn+'(vec3 effect,vec2 uv,float strength){';
  if(!source.includes(marker))return source;
  const body=`uniform float uRingMotion,uRingClock;
 vec4 ${fn}(vec3 effect,vec2 uv,float strength){
  vec2 uvEffect=uv;
  if(uRingMotion>.001){
   float t=uRingClock;
   vec2 center=uv-.5;
   vec2 drift=vec2(sin(uv.y*15.+t*1.65)+.35*cos(uv.x*8.-t*.9),cos(uv.x*14.-t*1.4)+.3*sin(uv.y*9.+t))*vec2(.018,.015);
   float breathing=1.+.045*sin(t*1.1);
   uvEffect=.5+center*mix(1.,breathing,uRingMotion)+drift*uRingMotion;
   effect=texture2D(tIn,uvEffect).rgb;
  }
 `;
  return source.replace(marker,body).replace('texture2D(tIn,uv+vec2(px.x*2.,0.))','texture2D(tIn,uvEffect+vec2(px.x*2.,0.))').replace('texture2D(tIn,uv+vec2(0.,px.y*2.))','texture2D(tIn,uvEffect+vec2(0.,px.y*2.))');
 };
 if(typeof renderer==='undefined'||root.clubOpticalMotion)return;
 const base=renderer.render,materials=new Set();let amount=0,clock=0,last=performance.now(),seenAt=-1e9,family=-1,draws=0;
 function render(scene,camera){
  const now=performance.now(),dt=Math.max(0,Math.min(.1,(now-last)/1000));last=now;
  if(now-seenAt>250){const i=root.clubVisualNext&&root.clubVisualNext.info();family=i?i.familyIndex:-1;seenAt=now;}
  const target=family===5?1:0;amount+=(target-amount)*(1-Math.exp(-dt/1.2));
  const mood=root.clubMusicMood;clock+=dt*(mood?mood.flowMotion||.4:.5);
  for(const mesh of scene&&scene.children||[]){const mat=mesh.material,u=mat&&mat.uniforms;
   if(!u||!u.uWeaveEnabled||!mat.fragmentShader.startsWith('precision highp float;varying vec2 vUv;'))continue;
   if(!mat.fragmentShader.includes('uRingClock')){mat.fragmentShader=root.ClubOpticalShader(mat.fragmentShader);u.uRingClock={value:0};u.uRingMotion={value:0};mat.needsUpdate=true;materials.add(mat);}
   materials.add(mat);u.uRingClock.value=clock;u.uRingMotion.value=amount;draws++;
  }
  return base.call(this,scene,camera);
 }
 renderer.render=render;
 root.clubOpticalMotion={info:()=>({family,amount:+amount.toFixed(3),clock:+clock.toFixed(2),draws,materials:materials.size}),restore(){if(renderer.render===render)renderer.render=base;for(const m of materials)m.uniforms.uRingMotion.value=0;delete root.clubOpticalMotion;}};
})(window);
