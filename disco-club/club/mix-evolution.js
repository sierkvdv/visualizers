// Additive evolution: original, new, and spatial transformations between them all remain available.
(function(root){
 const smooth=(a,b,x)=>{let v=Math.max(0,Math.min(1,(x-a)/(b-a)));return v*v*(3-2*v);};
 root.ClubMixProfile=function(age,variant){
  if(variant===0)return 0;
  if(variant===1)return 1;
  if(variant===2)return smooth(3,13,age);
  if(variant===3)return 1-smooth(4,15,age);
  return smooth(2,6,age)*(1-smooth(12,18,age));
 };
 root.ClubMixEvolutionShader=function(source){
  if(!source.includes('clubLightPrevious'))return source;
  if(!source.includes('uniform float uWeaveEvolution,uRingEvolution;')){
   source=source.replace('precision highp float;','precision highp float;uniform float uWeaveEvolution,uRingEvolution;');
   source=source.replace('return vec4(mapped*coverage,coverage);',`vec4 modern=vec4(mapped*coverage,coverage);
    vec4 original=clubLightPrevious(effect,uv,strength);
    if(uWeaveEvolution<.001)return original;
    if(uWeaveEvolution>.999)return modern;
    float growth=smoothstep(pattern-.025,pattern+.025,mix(-.06,1.06,uWeaveEvolution));
    return mix(original,modern,growth);`);
  }
  if(source.includes('uRingClock')&&!source.includes('float ringAmount=')){
   source=source.replace('vec2 uvEffect=uv;','float ringAmount=uRingMotion*uRingEvolution;vec2 uvEffect=uv;').replace('if(uRingMotion>.001)','if(ringAmount>.001)').replace('mix(1.,breathing,uRingMotion)','mix(1.,breathing,ringAmount)').replace('drift*uRingMotion','drift*ringAmount');
  }
  return source;
 };
 if(typeof renderer==='undefined'||root.clubMixEvolution)return;
 const base=renderer.render,materials=new Set();let age=0,key='',variant=2,amount=0,last=performance.now(),infoAt=-1e9,visible=false,changes=0;
 function render(scene,camera){
  const now=performance.now(),dt=Math.max(0,Math.min(.1,(now-last)/1000));last=now;
  if(now-infoAt>250){const i=root.clubVisualNext&&root.clubVisualNext.info();if(i){
   const k=[i.familyIndex,i.recipe,i.art].join(':');
   if(k!==key){key=k;age=0;variant=i.recipe%5;changes++;}
   visible=i.enabled&&(i.alpha>.08||(i.direction&&i.direction.legacy>.1));
  }infoAt=now;}
  if(visible)age+=dt;amount=root.ClubMixProfile(age,variant);
  for(const mesh of scene&&scene.children||[]){const mat=mesh.material,u=mat&&mat.uniforms;
   if(!u||!u.uWeaveEnabled)continue;
   const shader=root.ClubMixEvolutionShader(mat.fragmentShader);
   if(shader!==mat.fragmentShader){mat.fragmentShader=shader;if(!u.uWeaveEvolution)u.uWeaveEvolution={value:amount};if(!u.uRingEvolution)u.uRingEvolution={value:amount};mat.needsUpdate=true;}
   if(u.uWeaveEvolution){materials.add(mat);u.uWeaveEvolution.value=amount;u.uRingEvolution.value=amount;}
  }
  return base.call(this,scene,camera);
 }
 renderer.render=render;
 root.clubMixEvolution={info:()=>({variant,name:['original','new','original-to-new','new-to-original','original-new-original'][variant],age:+age.toFixed(2),amount:+amount.toFixed(3),materials:materials.size,appearances:changes}),restore(){if(renderer.render===render)renderer.render=base;for(const m of materials){m.uniforms.uWeaveEvolution.value=1;m.uniforms.uRingEvolution.value=1;}delete root.clubMixEvolution;}};
})(window);
