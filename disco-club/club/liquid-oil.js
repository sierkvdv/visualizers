// Rounded, continuously flowing oil in the existing compositors; preserve their mapping and club mix.
(function(root){
 if(typeof renderer==='undefined'||typeof clubHooks==='undefined'||root.clubLiquidOil)return;
 const base=renderer.render,materials=new Set();let enabled=true,clock=0,atlas=0,legacy=0,draws=0;
 const glsl=`uniform float uLiquidOil,uLiquidClock;uniform vec2 uLiquidPalette;
 float liquidHeight(vec2 p,float t){
  vec2 v=p;v+=vec2(sin(p.y*1.65+t*.38),cos(p.x*1.5-t*.29))*.64;
  v+=vec2(sin(v.y*2.1-t*.31),cos(v.x*1.85+t*.34))*.37;
  return sin(v.x*1.65+sin(v.y*1.3+t*.21))*.5+cos(v.y*1.55+sin(v.x*1.4-t*.26))*.5;
 }
 vec3 liquidColor(vec2 uv){
  vec2 p=(uv-.5)*vec2(4.4,2.5);float t=uLiquidClock,h=liquidHeight(p,t),e=.015;
  vec2 g=vec2(liquidHeight(p+vec2(e,0.),t)-h,liquidHeight(p+vec2(0.,e),t)-h)/e;
  vec3 n=normalize(vec3(-g*.65,1.));float light=max(0.,dot(n,normalize(vec3(-.4,.6,.8))));
  float gloss=pow(max(0.,dot(reflect(normalize(vec3(.4,-.6,-.8)),n),vec3(0.,0.,1.))),25.);
  vec3 tint=.5+.5*cos(6.2831853*(vec3(.08,.37,.64)+h*.29+uLiquidPalette.x+t*.012));
  float bands=.5+.5*sin(h*8.+length(g)*.8-t*.35+uLiquidPalette.y);
  return tint*(.3+.52*light+.25*bands)+vec3(.65,.78,.9)*gloss*.7;
 }
 `;
 function tick(dt){dt=Math.max(0,Math.min(.1,dt));const mood=root.clubMusicMood;clock+=dt*(.35+.5*(mood?mood.drive:.4));
  const i=root.clubVisualNext&&root.clubVisualNext.info(),old=root.clubVisual&&root.clubVisual.info();
  const a=enabled&&i&&i.familyIndex===0?1:0,l=enabled&&old&&old.nu&&old.nu.fx==='vloeistof'?1:0,k=1-Math.exp(-dt/1.5);
  atlas+=(a-atlas)*k;legacy+=(l-legacy)*k;
 }
 function render(scene,camera){
  for(const mesh of scene&&scene.children||[]){const m=mesh.material,u=m&&m.uniforms;if(!u||!u.tIn||!u.uProjectClub||!u.uWeaveEnabled)continue;
   if(!materials.has(m)){
    const marker='void main(){gl_FragColor=clubLight(texture2D(tIn,vUv).rgb,vUv,uAlpha);}';if(!m.fragmentShader.includes(marker))continue;
    u.uLiquidOil={value:0};u.uLiquidClock={value:0};u.uLiquidPalette={value:new THREE.Vector2(Math.random(),Math.random()*6.28)};
    const anchor=m.fragmentShader.includes('vec4 clubLightPrevious(')?'vec4 clubLightPrevious(':'vec4 clubLight(';m.fragmentShader=m.fragmentShader.replace(anchor,glsl+anchor).replace(marker,'void main(){vec3 source=texture2D(tIn,vUv).rgb;if(uLiquidOil>.001)source=mix(source,liquidColor(vUv),uLiquidOil);gl_FragColor=clubLight(source,vUv,uAlpha);}');m.fragmentShader=m.fragmentShader.replace('float ink=dot(effect,weights),edge=length(effect-ex)+length(effect-ey);','float ink=dot(effect,weights),edge=length(effect-ex)+length(effect-ey);edge=mix(edge,length(dFdx(effect))+length(dFdy(effect)),uLiquidOil);');m.extensions.derivatives=true;m.needsUpdate=true;materials.add(m);
   }
   const modern=m.fragmentShader.startsWith('precision highp float;varying vec2 vUv;');u.uLiquidOil.value=enabled?(modern?atlas:legacy):0;u.uLiquidClock.value=clock;draws++;
  }
  return base.call(this,scene,camera);
 }
 renderer.render=render;clubHooks.push(tick);
 root.clubLiquidOil={setEnabled(v){enabled=!!v;for(const m of materials)m.uniforms.uLiquidOil.value=0;},info:()=>({enabled,atlas:+atlas.toFixed(3),legacy:+legacy.toFixed(3),draws,materials:materials.size,roundedFlow:true})};
})(window);


