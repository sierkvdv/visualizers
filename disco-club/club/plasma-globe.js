// Additional plasma-globe episode. Reuses the existing final compositors; no audio or OBS changes.
(function(root){
 root.ClubPlasmaVisual=function(renderer){
  const T=THREE,u={time:{value:0},energy:{value:0},seed:{value:2.7}};
  const fragment=`precision highp float;varying vec2 vUv;uniform float time,energy,seed;
   void main(){
    vec2 p=(vUv-.5)*2.35;float r=length(p);if(r>1.04){gl_FragColor=vec4(0.);return;}
    float a=atan(p.y,p.x),z=sqrt(max(0.,1.-r*r));vec3 color=vec3(0.);float filaments=0.,halo=0.;
    for(int i=0;i<18;i++){
     float k=float(i),gold=k*2.39996323+seed;
     float depth=sin(k*2.71+seed+time*.19)*.83;
     float reach=sqrt(max(.12,1.-depth*depth));
     float theta=gold+time*(.13+.035*sin(k));
     float f=r/reach;
     float bend=sin(f*11.-time*1.8+k*2.1)*.09*f+sin(f*23.+time*1.1+k)*.035*f;
     float path=theta+.21*sin(time*.65+k*1.7)*f+bend;
     float distance=abs(sin(a-path))*r;
     float side=smoothstep(-.1,.25,cos(a-path));
     float rootMask=smoothstep(.035,.11,r)*(1.-smoothstep(.94,1.,f));
     float thread=exp(-distance*distance/(.000065+.00004*energy))*side*rootMask;
     float glow=exp(-distance*distance/.002)*side*rootMask;
     float forkDist=abs(sin(a-path-.12*sin(f*5.+k)))*r;
     float fork=exp(-forkDist*forkDist/.000045)*smoothstep(.4,.65,f)*(1.-smoothstep(.82,1.,f))*side*.45;
     float front=.6+.4*(depth*.5+.5);
     vec3 tint=mix(vec3(.32,.25,1.),vec3(1.,.16,.66),smoothstep(.35,1.,f));
     color+=tint*(thread*(.85+.3*energy)+glow*.15+fork*.5)*front;filaments+=(thread+fork)*front;halo+=glow*front;
     float tip=exp(-pow(f-.97,2.)*1900.-distance*distance*3200.)*side;
     color+=vec3(1.,.32,.75)*tip*front;
    }
    float nucleus=exp(-r*r*220.),aura=exp(-r*r*30.);
    color+=vec3(1.,.4,.9)*nucleus*1.2+vec3(.6,.08,.8)*aura*.17;
    float rim=exp(-pow(r-.985,2.)*6500.);
    vec3 n=vec3(p,z);float spec=pow(max(0.,dot(n,normalize(vec3(-.4,.65,1.)))),65.);
    color+=vec3(.18,.38,.9)*rim*.7+vec3(.6,.75,1.)*spec*.38+vec3(.015,.025,.06)*z;
    float alpha=clamp(filaments*.9+halo*.075+nucleus*.95+aura*.14+rim*.4+spec*.3+z*.015,0.,1.);
    color=color/(1.+max(color-vec3(.85),0.));gl_FragColor=vec4(color,alpha);
   }`;
  const mat=new T.ShaderMaterial({uniforms:u,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:fragment,depthTest:false,depthWrite:false}),geo=new T.PlaneGeometry(2,2),scene=new T.Scene(),cam=new T.Camera();scene.add(new T.Mesh(geo,mat));
  const target=new T.WebGLRenderTarget(512,512,{depthBuffer:false,stencilBuffer:false,minFilter:T.LinearFilter,magFilter:T.LinearFilter});let frames=0;
  return {texture:target.texture,render(time,energy,seed){u.time.value=time;u.energy.value=energy;u.seed.value=seed;const old=renderer.getRenderTarget(),clear=renderer.autoClear,color=renderer.getClearColor(new T.Color()).clone(),alpha=renderer.getClearAlpha();try{renderer.setRenderTarget(target);renderer.autoClear=true;renderer.setClearColor(0,0);renderer.render(scene,cam);frames++;}finally{renderer.setRenderTarget(old);renderer.autoClear=clear;renderer.setClearColor(color,alpha);}},info:()=>({frames,resolution:'512x512'}),dispose(){target.dispose();mat.dispose();geo.dispose();}};
 };
 root.ClubPlasmaShader=function(source){
  if(source.includes('uPlasmaAmount')||!source.includes('vec4 clubLight('))return source;
  source=source.replace('vec4 clubLight(','vec4 clubLightWithoutPlasma(');
  const wrapper=`uniform sampler2D uPlasmaImage;uniform float uPlasmaAmount,uPlasmaAspect,uPlasmaStyle;uniform vec3 uPlasmaLayout;
   vec4 clubLight(vec3 effect,vec2 uv,float strength){
    vec4 base=clubLightWithoutPlasma(effect,uv,strength);if(uPlasmaAmount<.001)return base;
    vec2 scale=vec2(uPlasmaLayout.z/uPlasmaAspect,uPlasmaLayout.z);
    vec2 st=(uv-uPlasmaLayout.xy)/scale+.5;
    if(min(st.x,st.y)<0.||max(st.x,st.y)>1.)return base;
    vec4 plasma=texture2D(uPlasmaImage,st);
    float shade=dot(effect,vec3(.2126,.7152,.0722));
    float stencil=smoothstep(.24,.55,shade+.3+.15*sin(uv.x*9.+uv.y*7.+uProjectionClock*.25));
    float select=uPlasmaStyle<.5?1.:uPlasmaStyle<1.5?mix(.65,1.,stencil):mix(.25,1.,stencil);
    vec3 strands=mix(plasma.rgb,plasma.rgb*(.35+effect*1.1),.25+.2*stencil);
    float alpha=plasma.a*uPlasmaAmount*select;
    return vec4(strands*alpha+base.rgb*(1.-alpha),alpha+base.a*(1.-alpha));
   }
  `;
  return source.replace('void main(){',wrapper+'\nvoid main(){');
 };
 if(typeof renderer==='undefined'||typeof clubHooks==='undefined'||root.clubPlasmaGlobe)return;
 const globe=root.ClubPlasmaVisual(renderer),base=renderer.render,materials=new Set();let enabled=true,clock=0,energy=0,age=0,envelope=0,nextAt=8,active=false,episode=0,seed=2.7,style=0,hold=20,lastInfo=-1e9,ownerAtlas=false,allowed=false,layout=new THREE.Vector3(.5,.49,.72),frames=0;
 const smooth=(a,b,v)=>{v=Math.max(0,Math.min(1,(v-a)/(b-a)));return v*v*(3-2*v);};
 function start(){active=true;age=0;episode++;seed=Math.random()*20;style=Math.floor(Math.random()*3);hold=18+Math.random()*6;layout.set(.5+Math.sin(seed)*.1,.48+Math.cos(seed)*.05,.64+Math.random()*.16);}
 function update(dt){
  dt=Math.max(0,Math.min(.1,dt));const mood=root.clubMusicMood;energy+=((mood?mood.drive:.4)-energy)*(1-Math.exp(-dt/2));clock+=dt*(.35+.65*energy);
  allowed=enabled&&!!S.visual&&S.visual!=='uit';
  if(!allowed){envelope=0;return;}
  age+=dt;if(!active&&age>=nextAt)start();
  if(active){envelope=smooth(0,3,age)*(1-smooth(hold-3,hold,age));if(age>=hold){active=false;envelope=0;age=0;nextAt=55+Math.random()*55;}}
  if(envelope>.001){globe.render(clock,energy,seed);frames++;}
 }
 function render(scene,camera){
  const now=performance.now();if(now-lastInfo>250){const i=root.clubVisualNext&&root.clubVisualNext.info();ownerAtlas=!!i&&i.alpha>.1;lastInfo=now;}
  for(const mesh of scene&&scene.children||[]){const mat=mesh.material,u=mat&&mat.uniforms;if(!u||!u.uWeaveEnabled||!u.uAlpha)continue;
   if(!mat.fragmentShader.includes('uPlasmaAmount')){mat.fragmentShader=root.ClubPlasmaShader(mat.fragmentShader);u.uPlasmaImage={value:globe.texture};u.uPlasmaAmount={value:0};u.uPlasmaAspect={value:1};u.uPlasmaStyle={value:style};u.uPlasmaLayout={value:layout};mat.needsUpdate=true;}
   materials.add(mat);const atlas=mat.fragmentShader.startsWith('precision highp float;varying vec2 vUv;');
   u.uPlasmaAmount.value=allowed&&atlas===ownerAtlas?envelope:0;u.uPlasmaAspect.value=innerWidth/Math.max(1,innerHeight);u.uPlasmaStyle.value=style;u.uPlasmaLayout.value=layout;
  }
  return base.call(this,scene,camera);
 }
 renderer.render=render;clubHooks.push(update);
 root.clubPlasmaGlobe={preview:start,setEnabled(v){enabled=!!v;if(!enabled){envelope=0;for(const m of materials)m.uniforms.uPlasmaAmount.value=0;}},info:()=>({enabled,active,age:+age.toFixed(1),envelope:+envelope.toFixed(3),episodes:episode,style,frames,resolution:'512x512',materials:materials.size,additional:true})};
})(window);
