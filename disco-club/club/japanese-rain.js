// Sparse Japanese glyph trails. Drawn before the whole-scene warp so they bend with the room.
(function(root){
 if(typeof renderer==='undefined'||typeof clubHooks==='undefined'||typeof naTekenHooks==='undefined'||root.clubJapaneseRain)return;
 const T=THREE,glyphs=Array.from("\u30a2\u30a4\u30a6\u30a8\u30aa\u30ab\u30ad\u30af\u30b1\u30b3\u30b5\u30b7\u30b9\u30bb\u30bd\u30bf\u30c1\u30c4\u30c6\u30c8\u30ca\u30cb\u30cc\u30cd\u30ce\u30cf\u30d2\u30d5\u30d8\u30db\u30de\u30df\u30e0\u30e1\u30e2\u30e4\u30e6\u30e8\u30e9\u30ea\u30eb\u30ec\u30ed\u30ef\u30f2\u30f3\u6708\u5922\u5f71\u97f3\u591c\u7a7a\u7121\u9593\u5149");
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');
 ctx.font='bold 43px "Yu Gothic", "Meiryo", monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='white';ctx.shadowColor='white';ctx.shadowBlur=2;
 for(let i=0;i<64;i++)ctx.fillText(glyphs[i%glyphs.length],(i%8)*64+32,Math.floor(i/8)*64+32);
 const texture=new T.CanvasTexture(canvas);texture.minFilter=texture.magFilter=T.LinearFilter;texture.generateMipmaps=false;
 const positions=[],indices=[];for(let col=0;col<4;col++)for(let row=0;row<12;row++){positions.push(col,row,0);indices.push(col*12+row);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('glyphIndex',new T.Float32BufferAttribute(indices,1));
 const u={tGlyphs:{value:texture},uAge:{value:0},uAmount:{value:0},uHeight:{value:1440},uColumns:{value:3},uSeed:{value:1},uColor:{value:new T.Color(.1,.9,.58)}};
 const material=new T.ShaderMaterial({uniforms:u,vertexShader:`
 attribute float glyphIndex;uniform float uAge,uHeight,uColumns,uSeed;varying float vGlyph,vTail,vShow;
 float h(float x){return fract(sin(x*12.9898+uSeed*3.14)*43758.5453);}
 void main(){float col=position.x,row=position.y;float side=mod(col,2.);float x=mix(.12,.72,side)+h(col+2.)*.15;
  float head=.48+h(col+5.)*.45-uAge*(.029+h(col+11.)*.018);
  float y=head+row*.024; x+=sin(uAge*.4+col)*.002;
  vShow=step(col+.5,uColumns)*smoothstep(0.,.08,y)*(1.-smoothstep(.95,1.,y));
  vGlyph=floor(h(glyphIndex+floor(uAge*.7+row*.13)*1.71)*64.);
  vTail=pow(1.-row/13.,1.7);gl_Position=vec4(x*2.-1.,y*2.-1.,0.,1.);gl_PointSize=max(12.,uHeight*(.017+h(col+7.)*.004));
 }`,fragmentShader:`precision highp float;uniform sampler2D tGlyphs;uniform float uAmount;uniform vec3 uColor;varying float vGlyph,vTail,vShow;
 void main(){vec2 cell=vec2(mod(vGlyph,8.),7.-floor(vGlyph/8.));vec2 uv=(cell+vec2(gl_PointCoord.x,1.-gl_PointCoord.y))/8.;float ink=texture2D(tGlyphs,uv).a;
  float alpha=ink*uAmount*vTail*vShow*.75;if(alpha<.008)discard;
  vec3 color=mix(uColor,vec3(.7,1.,.87),pow(vTail,10.)*.7);gl_FragColor=vec4(color,alpha);
 }`,transparent:true,depthTest:false,depthWrite:false,blending:T.NormalBlending,toneMapped:false});
 const scene=new T.Scene(),camera=new T.Camera(),points=new T.Points(geometry,material);points.frustumCulled=false;scene.add(points);
 let enabled=true,active=false,age=0,hold=12,wait=10,envelope=0,draws=0,episodes=0;
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 function start(){if(!enabled)return;active=true;age=0;hold=10+Math.random()*4;episodes++;u.uSeed.value=Math.random()*100;u.uColumns.value=2+Math.floor(Math.random()*3);u.uColor.value.setRGB(.07, .72+Math.random()*.2,.35+Math.random()*.42);}
 function tick(dt){dt=Math.max(0,Math.min(.1,dt));age+=dt;
  if(!enabled||typeof S!=='undefined'&&(!S.visual||S.visual==='uit')){envelope=0;return;}
  if(!active&&age>=wait)start();
  if(active){const mood=root.clubMusicMood;envelope=smooth(age/1.8)*smooth((hold-age)/2)*(mood&&mood.quiet?.5:.8);if(age>=hold){active=false;age=0;envelope=0;wait=45+Math.random()*45;}}
 }
 function render(){if(!enabled||!active||envelope<.001)return;const old=renderer.getRenderTarget(),clear=renderer.autoClear;
  try{renderer.setRenderTarget(null);renderer.autoClear=false;u.uAge.value=age;u.uAmount.value=envelope;u.uHeight.value=renderer.domElement.height;renderer.render(scene,camera);draws++;}
  finally{renderer.autoClear=clear;renderer.setRenderTarget(old);}
 }
 clubHooks.push(tick);const warp=naTekenHooks.findIndex(h=>String(h).includes('copyFramebufferToTexture(origin,texture)'));if(warp<0)naTekenHooks.push(render);else naTekenHooks.splice(warp,0,render);
 root.clubJapaneseRain={preview:start,setEnabled(v){enabled=!!v;if(!enabled){active=false;envelope=0;}},info:()=>({enabled,active,amount:+envelope.toFixed(3),columns:u.uColumns.value,maxGlyphs:48,episodes,draws,glyphs:glyphs.length,bendsWithWholeSceneWarp:true}),restore(){let i=clubHooks.indexOf(tick);if(i>=0)clubHooks.splice(i,1);i=naTekenHooks.indexOf(render);if(i>=0)naTekenHooks.splice(i,1);geometry.dispose();material.dispose();texture.dispose();delete root.clubJapaneseRain;}};
})(window);
