// One optional GPU pass over the already combined club and visual layers. No feedback or audio.
(function(root){
 if(typeof renderer==='undefined'||typeof naTekenHooks==='undefined'||typeof clubHooks==='undefined'||(root.clubWholeSceneWarp&&root.clubWholeSceneWarp.version===2))return;
 if(root.clubWholeSceneWarp)root.clubWholeSceneWarp.restore();
 const T=THREE,scene=new T.Scene(),camera=new T.Camera(),origin=new T.Vector2(0,0);
 const u={tFrame:{value:null},uAmount:{value:0},uClock:{value:0},uMode:{value:0},uAspect:{value:1},uCenter:{value:new T.Vector2(.5,.5)}};
 const material=new T.ShaderMaterial({uniforms:u,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
 precision highp float;varying vec2 vUv;uniform sampler2D tFrame;uniform float uAmount,uClock,uMode,uAspect;uniform vec2 uCenter;
 void main(){
  vec2 p=(vUv-uCenter)*vec2(uAspect,1.);float r=length(p),t=uClock;
  float edge=sin(vUv.x*3.14159265)*sin(vUv.y*3.14159265);
  float a=uAmount*edge;
  vec2 q=p;
  if(uMode<.5){float turn=a*.32*sin(t*.5-r*2.2)*exp(-r*r*.7);float c=cos(turn),s=sin(turn);q=mat2(c,-s,s,c)*p;}
  else if(uMode<1.5){q+=vec2(sin(p.y*4.+t*.8),sin(p.x*3.-t*.6))*vec2(.085,.055)*a;}
  else if(uMode<2.5){float lens=1.+a*.12*sin(r*5.-t*.65);q=p*lens;float turn=a*.12*sin(t*.4);float c=cos(turn),s=sin(turn);q=mat2(c,-s,s,c)*q;}
  else{
   vec2 moving=vec2(sin(t*.52)*.48+sin(t*.23)*.12,cos(t*.39)*.23);
   vec2 d=p-moving;float radius=length(d);
   float lens=exp(-dot(d,d)/.115);
   float wake=sin(radius*17.-t*1.25)*exp(-radius*5.)*.035;
   q=p-d*a*(lens*.44+wake);
  }
  vec2 uv=q/vec2(uAspect,1.)+uCenter;
  uv=1.-abs(mod(uv,2.)-1.);
  gl_FragColor=texture2D(tFrame,uv);
 }`,depthTest:false,depthWrite:false,blending:T.NoBlending,toneMapped:false});
 const geometry=new T.PlaneGeometry(2,2);scene.add(new T.Mesh(geometry,material));
 let texture=null,width=0,height=0,enabled=true,active=false,age=0,wait=12,hold=9,clock=0,envelope=0,episodes=0,draws=0,errors=0;
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 function start(mode){if(!enabled)return;active=true;age=0;hold=8+Math.random()*3;episodes++;u.uMode.value=Number.isInteger(mode)&&mode>=0&&mode<4?mode:Math.floor(Math.random()*4);u.uCenter.value.set(.42+Math.random()*.16,.43+Math.random()*.14);}
 function tick(dt){dt=Math.max(0,Math.min(.1,dt));const mood=root.clubMusicMood,drive=mood?Math.max(0,Math.min(1,mood.drive)):.5;
  clock+=dt*(.35+.5*drive);age+=dt;
  if(!enabled||typeof S!=='undefined'&&(!S.visual||S.visual==='uit')){envelope=0;return;}
  if(!active&&age>=wait)start();
  if(active){envelope=smooth(age/2)*smooth((hold-age)/2)*(mood&&mood.quiet?.25:.35+.65*drive);if(age>=hold){active=false;age=0;envelope=0;wait=65+Math.random()*45;}}
 }
 function render(){if(!enabled||!active||envelope<.001)return;
  const old=renderer.getRenderTarget(),clear=renderer.autoClear;
  try{
   renderer.setRenderTarget(null);const w=renderer.domElement.width,h=renderer.domElement.height;if(!w||!h)return;
   if(!texture||w!==width||h!==height){if(texture)texture.dispose();width=w;height=h;texture=new T.DataTexture(new Uint8Array(w*h*3),w,h,T.RGBFormat);texture.minFilter=texture.magFilter=T.LinearFilter;texture.generateMipmaps=false;texture.flipY=false;texture.needsUpdate=true;u.tFrame.value=texture;}
   renderer.copyFramebufferToTexture(origin,texture);
   u.uAmount.value=envelope;u.uClock.value=clock;u.uAspect.value=w/h;
   renderer.autoClear=false;renderer.render(scene,camera);draws++;
  }catch(e){errors++;enabled=false;console.error('Whole-scene warp disabled after render error',e);}
  finally{renderer.autoClear=clear;renderer.setRenderTarget(old);}
 }
 clubHooks.push(tick);naTekenHooks.push(render);
 root.clubWholeSceneWarp={version:2,preview:start,setEnabled(v){enabled=!!v;if(!enabled){active=false;envelope=0;}},info:()=>({enabled,active,age:+age.toFixed(2),amount:+envelope.toFixed(3),mode:u.uMode.value,variants:4,lensWave:u.uMode.value===3,episodes,draws,errors,resolution:[width,height],extraGpuPasses:active&&envelope>.001?1:0,feedback:false}),restore(){const a=clubHooks.indexOf(tick),b=naTekenHooks.indexOf(render);if(a>=0)clubHooks.splice(a,1);if(b>=0)naTekenHooks.splice(b,1);if(texture)texture.dispose();geometry.dispose();material.dispose();delete root.clubWholeSceneWarp;}};
})(window);



