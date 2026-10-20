// Actual Japanese phrases on physical club surfaces. Existing glyph rain is an occasional accent.
(function(root){
 if(typeof scene==='undefined'||typeof camera==='undefined'||typeof clubHooks==='undefined'||(root.clubJapaneseWordArt&&root.clubJapaneseWordArt.version===8))return;
 if(root.clubJapaneseWordArt)root.clubJapaneseWordArt.restore();
 const T=THREE,entries=[
  ['\u81ea\u7531\u306b\u8e0a\u308c','Dance freely'],['\u81ea\u6211\u306f\u30aa\u30d5\u30e9\u30a4\u30f3','Ego offline'],['\u5e38\u8b58\u3092\u7591\u3048','Question convention'],['\u611b\u3068\u4f4e\u97f3','Love and bass'],['\u4f4e\u97f3\u4e2d\u6bd2','Bass addiction'],
  ['\u5922\u3068\u73fe\u5b9f\u306e\u3042\u3044\u3060','Between dreams and reality'],['\u9b42\u3092\u89e3\u304d\u653e\u3066','Free your soul'],['\u5b87\u5b99\u3068\u8e0a\u308c','Dance with the cosmos'],['\u6b63\u6c17\u306f\u4f11\u61a9\u4e2d','Sanity is on a break'],
  ['\u73fe\u5b9f\u3092\u30d0\u30b0\u3089\u305b\u308d','Glitch reality'],['\u666e\u901a\u306a\u3093\u3066\u3044\u3089\u306a\u3044','Who needs normal'],['\u4eca\u591c\u306f\u5225\u6b21\u5143','Another dimension tonight'],['\u97f3\u306b\u6eb6\u3051\u308d','Melt into sound'],
  ['\u5fc3\u306f\u81ea\u7531','The heart is free'],['\u5883\u754c\u3092\u8d8a\u3048\u308d','Cross the boundary'],['\u9000\u5c48\u3092\u3076\u3063\u58ca\u305b','Smash boredom'],['\u30ce\u30a4\u30ba\u306e\u4e2d\u306b\u611b','Love in the noise'],['\u5922\u306b\u306a\u308c','Become the dream']
  ,['\u5bff\u53f8','Sushi'],['\u9152','Sake'],['\u5929\u3077\u3089','Tempura'],['\u8c46\u8150','Tofu'],['\u30d3\u30fc\u30eb','Beer / biiru'],['\u5e3d\u5b50','Hat / boushi'],['\u512a\u3057\u3044','Kind / yasashii'],['\u304b\u3063\u3053\u3044\u3044','Cool / kakkoii'],['\u30a2\u30b7\u30c3\u30c9','Acid'],['\u30ad\u30ce\u30b3','Mushroom'],['\u3067\u3059','Desu'],['\u30b7\u30a8\u30eb\u30af\u3055\u3093','Shi-e-ru-ku-san / Sierk'],['\u5e7b\u899a','Hallucination'],['\u97f3\u697d','Music']
 ];
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);
 texture.minFilter=texture.magFilter=T.LinearFilter;texture.generateMipmaps=false;
 const u={tWords:{value:texture},uLevel:{value:0},uTime:{value:0},uColor:{value:new T.Color(.15,1,.68)},uColorB:{value:new T.Color(1,.1,.5)},uStyle:{value:0},uSeed:{value:1}};
 const material=new T.ShaderMaterial({uniforms:u,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`
 precision highp float;varying vec2 vUv;uniform sampler2D tWords;uniform float uLevel,uTime,uSeed,uStyle;uniform vec3 uColor,uColorB;
 void main(){float jumpPhase=fract(uTime/1.35);if(jumpPhase<.035)discard;
  float burst=max(1.-step(.19,jumpPhase),smoothstep(.8,.98,sin(uTime*6.1+uSeed)));float band=floor(vUv.y*22.),tick=floor(uTime*24.);
  vec2 uv=vUv;uv.x+=sin(band*4.7+tick*2.3)*burst*.15;
  uv.y+=sin(floor(vUv.x*9.)*7.1+tick)*burst*.018;
  float offset=burst*(.008+.018*abs(sin(tick*1.7)));
  float center=texture2D(tWords,uv).a,red=texture2D(tWords,uv+vec2(offset,0.)).a,blue=texture2D(tWords,uv-vec2(offset,0.)).a;
  float alpha=max(center,max(red,blue)*burst)*uLevel;if(alpha<.008)discard;
  vec3 palette=.55+.45*cos(vec3(0.,2.1,4.2)+uTime*.95+vUv.x*7.+vUv.y*3.+uSeed);
  vec3 base=uColor;
  if(uStyle>.5&&uStyle<1.5)base=mix(uColor,uColorB,.5+.5*sin(vUv.x*5.+uTime*.6));
  if(uStyle>1.5)base=palette;
  vec3 separated=vec3(red,center*.85,blue);vec3 color=mix(base,separated,burst*.95);
  gl_FragColor=vec4(color,alpha);
 }`,transparent:true,depthWrite:false,depthTest:true,blending:T.NormalBlending,toneMapped:false});
 const spots=[];
 function spot(name,w,h,parent,pos,ry=0){const mesh=new T.Mesh(new T.PlaneGeometry(w,h),material);mesh.position.set(...pos);mesh.rotation.y=ry;mesh.visible=false;mesh.renderOrder=12;parent.add(mesh);spots.push({name,mesh});}
 if(typeof wallFx!=='undefined'&&wallFx)spot('dj-screen',13.4,3.35,wallFx,[0,0,.28]);
 const room=typeof ROOM==='number'?ROOM:14;
 spot('left-wall',9.5,2.375,scene,[-room+.12,4.1,-2],Math.PI/2);
 spot('right-wall',9.5,2.375,scene,[room-.12,4.1,-2],-Math.PI/2);
 spot('front-wall',9.5,2.375,scene,[0,4.1,room-.12],Math.PI);
 spot('floor-projection',8,2,scene,[0,.07,0]);spots[spots.length-1].mesh.rotation.x=-Math.PI/2;
 spot('floating-projection',5.8,1.45,scene,[0,0,0]);const floating=spots[spots.length-1],floatTarget=new T.Vector3(),forward=new T.Vector3(),offset=new T.Vector3(),tilt=new T.Quaternion(),euler=new T.Euler();
 const noise=n=>{const x=Math.sin(n*127.1+u.uSeed.value*31.7)*43758.5453;return x-Math.floor(x);};
 function moveFloating(dt,immediate=false){camera.getWorldPosition(floatTarget);camera.getWorldDirection(forward);floatTarget.addScaledVector(forward,7.5);const jump=burstIndex,phase=Math.max(0,burstAge),tear=phase<.13?1:0,stutter=Math.floor(age*24);
  const halfH=7.5*Math.tan(camera.fov*Math.PI/360),halfW=halfH*camera.aspect;offset.set((noise(jump+1)-.5)*halfW*1.8+tear*(noise(stutter+70)-.5)*1.3,(noise(jump+21)-.5)*halfH*1.7+tear*(noise(stutter+90)-.5)*.6,0).applyQuaternion(camera.quaternion);floatTarget.add(offset);
  floating.mesh.position.copy(floatTarget);
  euler.set((noise(jump+41)-.5)*.6,(noise(jump+51)-.5)*.9,(noise(jump+61)-.5)*2.2+tear*(noise(stutter+110)-.5)*.4);tilt.setFromEuler(euler);floating.mesh.quaternion.copy(camera.quaternion).multiply(tilt);
 }
 const overlayScene=new T.Scene(),overlay=new T.Mesh(spots[0].mesh.geometry,material);overlay.matrixAutoUpdate=false;overlayScene.add(overlay);
 function renderWords(){if(!enabled||!active||!selected||level<.001||typeof clubPrefsAvatar!=='undefined'&&clubPrefsAvatar)return;
  const old=renderer.getRenderTarget(),clear=renderer.autoClear,depth=material.depthTest;
  try{selected.mesh.updateWorldMatrix(true,false);overlay.geometry=selected.mesh.geometry;overlay.matrix.copy(selected.mesh.matrixWorld);overlay.matrixWorldNeedsUpdate=true;renderer.setRenderTarget(null);renderer.autoClear=false;material.depthTest=false;renderer.render(overlayScene,camera);}
  finally{material.depthTest=depth;renderer.autoClear=clear;renderer.setRenderTarget(old);}
 }
 let enabled=true,active=false,age=0,hold=20,wait=8,index=-1,episodes=0,selected=null,level=0,size=1,burstIndex=0,burstAt=.5,burstAge=-1,burstDuration=.4,burstCount=0;
 const p=new T.Vector3(),eye=new T.Vector3(),normal=new T.Vector3(),toward=new T.Vector3();
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 function choose(){scene.updateMatrixWorld(true);camera.getWorldPosition(eye);let best=null,score=-1e9;
  for(const spot of spots){if(spot===floating)continue;spot.mesh.getWorldPosition(p);toward.subVectors(eye,p).normalize();spot.mesh.getWorldDirection(normal);const facing=normal.dot(toward);p.project(camera);const visible=p.z>-1&&p.z<1&&Math.abs(p.x)<1.1&&Math.abs(p.y)<1.1&&facing>0;
   const s=(visible?10:0)+(spot.name==='dj-screen'?.25:spot.name==='floor-projection'?-.2:0)+facing-Math.abs(p.x)*.5-Math.abs(p.y)*.3;if(s>score){score=s;best=spot;}}
  if(score<9||Math.random()<.9){moveFloating(0,true);return floating;}return best;
 }
 function draw(){ctx.clearRect(0,0,1024,256);let size=112;ctx.font='bold '+size+'px "Yu Gothic", "Meiryo", sans-serif';const width=ctx.measureText(entries[index][0]).width;if(width>930)size*=930/width;
  ctx.font='bold '+size+'px "Yu Gothic", "Meiryo", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='white';ctx.shadowColor='white';ctx.shadowBlur=7;ctx.fillText(entries[index][0],512,128);texture.needsUpdate=true;
 }
 function start(which){if(!enabled)return;let next=Number.isInteger(which)&&which>=0&&which<entries.length?which:Math.floor(Math.random()*entries.length);if(next===index)next=(next+1)%entries.length;index=next;draw();active=true;age=0;burstIndex=0;burstAge=-1;burstAt=.5+Math.random();burstCount=0;hold=18+Math.random()*6;episodes++;selected=choose();u.uSeed.value=Math.random()*20;const hue=Math.random();u.uColor.value.setHSL(hue,.85,.62);u.uColorB.value.setHSL((hue+.22+Math.random()*.4)%1,.9,.6);const style=Math.random();u.uStyle.value=style<.5?0:style<.85?1:2;size=.65+Math.random()*1.05;
  for(const spot of spots)spot.mesh.scale.setScalar(spot===floating?size:Math.min(1,size));
  for(const spot of spots)spot.mesh.visible=spot===selected;
  if(root.clubJapaneseRain){root.clubJapaneseRain.setEnabled(false);if(Math.random()<.2){root.clubJapaneseRain.setEnabled(true);root.clubJapaneseRain.preview();}}
 }
 if(root.clubJapaneseRain)root.clubJapaneseRain.setEnabled(false);
 function tick(dt){dt=Math.max(0,Math.min(.1,dt));age+=dt;
  if(!enabled||typeof S!=='undefined'&&(!S.visual||S.visual==='uit')){u.uLevel.value=0;return;}
  if(!active&&age>=wait)start();
  if(active){
   if(age>=burstAt&&burstCount<5){burstIndex++;burstCount++;burstAge=0;burstDuration=.24+Math.random()*.38;burstAt=age+3.2+Math.random()*2.5;
    size=.5+Math.random()*2.1;for(const spot of spots)spot.mesh.scale.setScalar(spot===floating?size:Math.min(1,size));
   }else if(burstAge>=0)burstAge+=dt;
   if(selected===floating)moveFloating(dt);level=burstAge>=0&&burstAge<burstDuration?smooth(burstAge/.025)*smooth((burstDuration-burstAge)/.035):0;u.uLevel.value=level;u.uTime.value=Math.max(0,burstAge)+.07;

   if(age>=hold){active=false;age=0;level=0;u.uLevel.value=0;wait=30+Math.random()*30;for(const s of spots)s.mesh.visible=false;if(root.clubJapaneseRain)root.clubJapaneseRain.setEnabled(false);}
  }
 }
 clubHooks.push(tick);const warp=naTekenHooks.findIndex(h=>String(h).includes('copyFramebufferToTexture(origin,texture)'));if(warp<0)naTekenHooks.push(renderWords);else naTekenHooks.splice(warp,0,renderWords);
 root.clubJapaneseWordArt={version:8,preview:start,phrases:()=>entries.map(([japanese,meaning])=>({japanese,meaning})),info:()=>({enabled,active,episodes,phrase:index>=0?entries[index][0]:null,meaning:index>=0?entries[index][1]:null,surface:selected&&selected.name,opacity:+level.toFixed(3),phrases:entries.length,colorStyle:["solid","duotone","rainbow"][u.uStyle.value],size:+size.toFixed(2),physicalSurfaces:spots.length-1,hardGlitch:true,travellingProjection:true,teleporting:true,shortBursts:true,burstCount,burstDuration:+burstDuration.toFixed(2)}),setEnabled(v){enabled=!!v;if(!enabled){u.uLevel.value=0;for(const s of spots)s.mesh.visible=false;}},restore(){const i=clubHooks.indexOf(tick);if(i>=0)clubHooks.splice(i,1);const hook=naTekenHooks.indexOf(renderWords);if(hook>=0)naTekenHooks.splice(hook,1);for(const s of spots){s.mesh.parent.remove(s.mesh);s.mesh.geometry.dispose();}material.dispose();texture.dispose();delete root.clubJapaneseWordArt;}};
})(window);
