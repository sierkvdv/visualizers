// Selective, opaque effect mapping. The previous compositor remains in the shader for instant rollback.
(function(root){
 const uniformsGLSL='uniform float uWeaveEnabled,uWeaveStyle,uWeaveHasPartner;uniform sampler2D uWeavePartner;';
 const mappingGLSL=`
 vec4 clubLight(vec3 effect,vec2 uv,float strength){
  if(uWeaveEnabled<.5||uProjectClub<.5)return clubLightPrevious(effect,uv,strength);
  vec3 weights=vec3(.2126,.7152,.0722);float time=uProjectionClock;
  vec2 px=vec2(1./1280.,1./720.);
  vec3 ex=texture2D(tIn,uv+vec2(px.x*2.,0.)).rgb;
  vec3 ey=texture2D(tIn,uv+vec2(0.,px.y*2.)).rgb;
  float ink=dot(effect,weights),edge=length(effect-ex)+length(effect-ey);
  vec3 room=texture2D(uClubImage,uv).rgb;
  float roomEdge=length(room-texture2D(uClubImage,uv+vec2(px.x*2.,0.)).rgb)+length(room-texture2D(uClubImage,uv+vec2(0.,px.y*2.)).rgb);
  vec2 drift=vec2(sin(uv.y*7.+time*.22),cos(uv.x*6.-time*.19))*.025;
  vec3 partner=texture2D(uWeavePartner,uv+drift+(effect.rg-.5)*.035).rgb;
  float partnerInk=dot(partner,weights);
  float contour=clamp(edge*24.+ink*.22,0.,1.);
  float islands=clamp(ink*.8+(.5+.5*sin(ink*13.+time*.18))*.3,0.,1.);
  float roomTrace=clamp(roomEdge*6.+contour*.5+ink*.18,0.,1.);
  float ribbons=.5+.5*sin(uv.y*16.+sin(uv.x*8.+time*.28)*2.+ink*5.-time*.24);
  float veins=.5+.5*sin((effect.r-effect.b)*16.+uv.x*5.+time*.2);
  float crossInk=clamp(partnerInk*.75+contour*.55+ink*.25,0.,1.);
  float pattern=uWeaveStyle<.5?contour:uWeaveStyle<1.5?islands:uWeaveStyle<2.5?roomTrace:uWeaveStyle<3.5?ribbons:uWeaveStyle<4.5?veins:crossInk;
  float cutoff=mix(1.04,.28,clamp(strength,0.,1.));
  float selected=smoothstep(cutoff-.018,cutoff+.018,pattern);
  // Keep dark backgrounds transparent; isolated objects and luminous lines stay opaque.
  float shape=smoothstep(.022,.055,max(effect.r,max(effect.g,effect.b)));
  float coverage=selected*shape;
  float interlock=smoothstep(.52,.56,partnerInk*.65+veins*.35)*shape*uWeaveHasPartner;
  // The second effect contributes pigment inside the first effect's shapes, preserving its shading.
  vec3 pigment=partner*(.2+ink*1.05);
  vec3 mapped=mix(effect,pigment,interlock*.42);
  // Full episodes still exist. At the edges of their entrance/exit, use the same sharp map.
  float full=smoothstep(.72,.98,strength)*uTakeover;
  coverage=mix(coverage,1.,full);
  if(strength<.003)coverage=0.;
  return vec4(mapped*coverage,coverage);
 }`;
 root.ClubWeaveShader=function(source){
  if(!source.includes('vec4 clubLight(')||source.includes('clubLightPrevious'))return source;
  return source.replace('vec4 clubLight(','vec4 clubLightPrevious(').replace('void main(){',uniformsGLSL+mappingGLSL+'\nvoid main(){');
 };
 if(typeof renderer==='undefined'||root.clubVisualWeave)return;
 let enabled=true;try{enabled=localStorage.getItem('club-weave-enabled')!=='0';}catch(e){}
 const patched=new Map(),base=renderer.render;let legacy=null,atlas=null,legacyTime=-1e9,atlasTime=-1e9,draws=0,partnerDraws=0,lastInfoAt=-1e9,cachedRecipe=0;
 const empty=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);empty.needsUpdate=true;
 function render(scene,camera){
  const now=performance.now();
  for(const mesh of scene&&scene.children||[]){
   const mat=mesh.material,u=mat&&mat.uniforms;
   if(!u||!u.tIn||!u.uAlpha||!u.uClubImage||!u.uTakeover)continue;
   if(!mat.fragmentShader.includes('clubLightPrevious')){
    const source=mat.fragmentShader,next=root.ClubWeaveShader(source);if(source===next)continue;
    patched.set(mat,{source});u.uWeaveEnabled={value:enabled?1:0};u.uWeaveStyle={value:0};u.uWeaveHasPartner={value:0};u.uWeavePartner={value:empty};mat.fragmentShader=next;mat.needsUpdate=true;
   }
   const isAtlas=mat.fragmentShader.startsWith('precision highp float;varying vec2 vUv;');
   // Atlas' projection uses vUv; the original psychedelic compositor uses p.
   if(isAtlas){atlas=u.tIn.value;atlasTime=now;}else{legacy=u.tIn.value;legacyTime=now;}
   const partner=isAtlas?legacy:atlas,fresh=now-(isAtlas?legacyTime:atlasTime)<500;
   u.uWeaveEnabled.value=enabled?1:0;u.uWeavePartner.value=partner||empty;u.uWeaveHasPartner.value=enabled&&partner&&fresh?1:0;
   if(now-lastInfoAt>500){const info=root.clubVisualNext&&root.clubVisualNext.info();cachedRecipe=info?info.recipe:0;lastInfoAt=now;}u.uWeaveStyle.value=Math.floor(cachedRecipe/8)%6;
   draws++;if(u.uWeaveHasPartner.value)partnerDraws++;
  }
  return base.call(this,scene,camera);
 }
 renderer.render=render;
 function setEnabled(value){enabled=!!value;for(const [mat] of patched)mat.uniforms.uWeaveEnabled.value=enabled?1:0;try{localStorage.setItem('club-weave-enabled',enabled?'1':'0');}catch(e){}return enabled;}
 root.clubVisualWeave={setEnabled,restore:()=>setEnabled(false),info:()=>({enabled,materials:patched.size,draws,partnerDraws,instantRollback:true,styles:6})};
})(window);
