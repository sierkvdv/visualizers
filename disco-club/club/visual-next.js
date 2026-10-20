// Shared musical envelope: raw level and sustained onsets, independent of band auto-gain.
(function(root){
  class MusicMood {
    constructor(){this.time=0;this.clock=0;this.level=0;this.slow=0;this.peak=.08;this.events=[];this.wasPulse=false;this.drive=0;this.motion=.16;this.build=0;this.phase='rust';this.flashAllowed=false;this.strongTime=0;this.quiet=true;this.slope=0;this.levelDb=null;}
    tick(dt,input){
      dt=Math.max(0,Math.min(.1,dt));this.time+=dt;
      const raw=input.raw||[0,0,0],level=raw.reduce((s,n)=>s+Math.max(0,Number.isFinite(n)?n:0),0);
      const previous=this.level;this.level+=(level-this.level)*(1-Math.exp(-dt/1.4));this.slow+=(level-this.slow)*(1-Math.exp(-dt/22));
      this.peak=Math.max(this.level,this.peak*Math.exp(-dt/120),.08);
      const hit=input.pulse>.8;if(hit&&!this.wasPulse)this.events.push(this.time);this.wasPulse=hit;
      this.events=this.events.filter(t=>this.time-t<8);
      const clamp=x=>Math.max(0,Math.min(1,x));const smooth=(x,a,b)=>{const v=clamp((x-a)/(b-a));return v*v*(3-2*v);};
      const rhythm=smooth(this.events.length,2,9),relative=this.level/this.peak;
      let strength=smooth(input.energy||0,.22,.78)*smooth(relative,.16,.6);
      let meter=Number.isFinite(input.levelDb)?input.levelDb:null;
      const liveMeter=root.clubAudioLevelDb;
      if(meter===null&&liveMeter&&Date.now()-liveMeter.time<2000)meter=liveMeter.db;
      if(meter===null&&typeof analyser!=='undefined'&&analyser&&(typeof native==='undefined'||!native)&&analyser.getFloatTimeDomainData){
        const samples=this.meterSamples||(this.meterSamples=new Float32Array(1024));analyser.getFloatTimeDomainData(samples);let sum=0;for(const v of samples)sum+=v*v;meter=20*Math.log10(Math.sqrt(sum/samples.length)+1e-10);
      }
      if(Number.isFinite(meter)){
        if(!Number.isFinite(this.levelDb))this.levelDb=meter;
        this.levelDb+=(meter-this.levelDb)*(1-Math.exp(-dt/1.8));
        strength*=Math.pow(smooth(this.levelDb,-34,-16),1.5);
      }
      const share=raw[0]/Math.max(.001,level);
      if(!Number.isFinite(this.bassShare))this.bassShare=share;
      this.bassShare+=(share-this.bassShare)*(1-Math.exp(-dt/2.8));
      const weight=smooth(this.bassShare,.20,.46);
      const target=strength*(.16+.84*rhythm)*(.12+.88*weight);
      this.drive+=(target-this.drive)*(1-Math.exp(-dt/(target>this.drive?5:1.8)));
      this.slope+=((this.level-previous)/Math.max(.001,dt)-this.slope)*(1-Math.exp(-dt/2));
      const rising=this.time>8&&this.slope>this.peak*.02&&input.energy>.32;
      const building=input.stand==='opbouw'&&input.energy>.2||rising&&rhythm<.8;
      this.build+=( (building?Math.min(1,Math.max(input.build||0,.25+this.drive*.6)):0)-this.build)*(1-Math.exp(-dt/8));
      this.quiet=this.drive<.3;
      this.phase=building&&this.build>.12?'opbouw':this.quiet?'rust':input.stand==='drop'&&this.drive>.6?'drop':'groove';
      const desired=this.phase==='opbouw'?.07+.38*this.build:.035+.965*Math.pow(this.drive,2.2);
      this.motion+=(desired-this.motion)*(1-Math.exp(-dt/3));this.clock+=dt*this.motion;
      if(!Number.isFinite(this.imageEnergy))this.imageEnergy=this.drive;
      this.imageEnergy+=(this.drive-this.imageEnergy)*(1-Math.exp(-dt/12));
      const pictureTarget=.28+1.07*Math.pow(Math.max(0,(this.imageEnergy-.25)/.75),1.6);
      if(!Number.isFinite(this.imageMotion)){this.imageMotion=this.motion;this.imageClock=this.clock;}
      this.imageMotion+=(pictureTarget-this.imageMotion)*(1-Math.exp(-dt/3));this.imageClock+=dt*this.imageMotion;
      if(!Number.isFinite(this.geometryMotion)){this.geometryMotion=.6;this.geometryClock=this.clock;}
      this.geometryMotion+=((.6+Math.pow(this.drive,.8))-this.geometryMotion)*(1-Math.exp(-dt/2.5));this.geometryClock+=dt*this.geometryMotion;
      if(!Number.isFinite(this.flowMotion)){this.flowMotion=.4;this.flowClock=this.clock;}
      this.flowMotion+=((.4+.9*this.drive)-this.flowMotion)*(1-Math.exp(-dt/2.8));this.flowClock+=dt*this.flowMotion;
      const strong=this.drive>.8&&this.bassShare>.4&&rhythm>.65&&input.energy>.68;
      this.strongTime=strong?this.strongTime+dt:0;
      this.flashAllowed=false;
      if(!Number.isFinite(this.bassEnvelope))this.bassEnvelope=0;
      const bassTarget=Math.max(0,Math.min(1,input.pulse||0))*.22;
      this.bassEnvelope+=(bassTarget-this.bassEnvelope)*(1-Math.exp(-dt/(bassTarget>this.bassEnvelope?.2:.65)));
      this.rhythm=rhythm;this.relative=relative;return this;
    }
    info(){return {levelDb:Number.isFinite(this.levelDb)?+this.levelDb.toFixed(1):null,bassShare:+(this.bassShare||0).toFixed(3),phase:this.phase,drive:+this.drive.toFixed(3),motion:+this.motion.toFixed(3),imageMotion:+(this.imageMotion||0).toFixed(3),imageEnergy:+(this.imageEnergy||0).toFixed(3),geometryMotion:+(this.geometryMotion||0).toFixed(3),flowMotion:+(this.flowMotion||0).toFixed(3),rhythm:+(this.rhythm||0).toFixed(3),relativeLevel:+(this.relative||0).toFixed(3),build:+this.build.toFixed(3),quiet:this.quiet,flashes:this.flashAllowed};}
  }
  root.ClubMusicMoodModel=MusicMood;
  if(typeof module!=='undefined'&&module.exports)module.exports=MusicMood;
  if(typeof clubHooks==='undefined')return;
  if(root.clubMusicMood){Object.setPrototypeOf(root.clubMusicMood,MusicMood.prototype);return;}
  const mood=root.clubMusicMood=new MusicMood();
  function sample(dt,now){
    const reg=root.clubRegie||{};
    mood.tick(dt,{raw:typeof rauw!=='undefined'?Array.from(rauw):[0,0,0],pulse:typeof pulse==='number'?pulse:0,energy:typeof energy==='number'?energy:0,stand:reg.stand||'groove',build:reg.stand==='opbouw'&&typeof beatPos==='number'?Math.max(0,Math.min(1,(beatPos-(reg.sinds||0))/16)):0});
    if(!mood.flashAllowed&&typeof strobeUntil!=='undefined'){strobeUntil=0;nextStrobe=Math.max(nextStrobe,now+5);}
  }
  clubHooks.unshift(sample);
  clubHooks.push(()=>{if(!mood.flashAllowed&&typeof strobeLight!=='undefined'){strobeLight.intensity=0;if(typeof strobeMat!=='undefined')strobeMat.color.setScalar(0);}});
  // The legacy VJ's own random flash mode also used the unscaled beat clock.
  const legacyIndex=clubHooks.findIndex(f=>Function.prototype.toString.call(f).includes('doel = loot(st)'));
  if(legacyIndex>=0){const original=clubHooks[legacyIndex];clubHooks[legacyIndex]=function(dt,now){
    const savedBeat=typeof beatPos==='number'?beatPos:null,savedPulse=typeof pulse==='number'?pulse:null;
    try{if(savedBeat!==null)beatPos=mood.clock*2;if(savedPulse!==null)pulse=savedPulse*mood.drive;original(dt*mood.motion,now);}
    finally{if(savedBeat!==null)beatPos=savedBeat;if(savedPulse!==null)pulse=savedPulse;}
  };}
  // Gate the show bus immediately after it is calculated, before room/effect consumers.
  const i=clubHooks.findIndex(f=>Function.prototype.toString.call(f).includes('showBeeld(dt)'));
  const sh=root.doolhof&&root.doolhof.show;
  if(i>=0&&sh){
    const original=clubHooks[i],color=sh.kleur,colors=[0,1,2].map(k=>color(k).clone());
    clubHooks[i]=function(dt,now){
      original(dt,now);
      if(!mood.flashAllowed)sh.flits=0;
      if(mood.quiet&&mood.phase!=='opbouw'){sh.stand='break';sh.drop=0;sh.opbouw=0;}
      for(let k=0;k<3;k++)colors[k].lerp(color(k),1-Math.exp(-dt*(mood.quiet?.18:mood.phase==='opbouw'?.8:4)));
    };
    sh.kleur=function(k,out){if(!mood.quiet&&mood.phase!=='opbouw')return color(k,out);const c=colors[((k|0)%3+3)%3];return out?out.copy(c):c;};
  }
})(typeof window==='undefined'?globalThis:window);

// Two additional image-producing 3D scenes, isolated from the club and its avatars.
(function(root){
  root.ClubSpatialVisuals=function(renderer){
    const T=THREE,slots=[null,null],W=64,H=40,MAX=512;
    const fallback=new T.DataTexture(new Uint8Array([0,0,0,255]),1,1);fallback.needsUpdate=true;
    const archGeo=new T.BoxGeometry(1,1,1),ids=new Float32Array(MAX);for(let i=0;i<MAX;i++)ids[i]=i;
    archGeo.setAttribute('instanceId',new T.InstancedBufferAttribute(ids,1));
    const landGeo=new T.PlaneGeometry(18,24,100,80),voxelGeo=new T.BoxGeometry(1,1,1),pixels=new Float32Array(W*H*2);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)pixels.set([(x+.5)/W,(y+.5)/H],(y*W+x)*2);
    voxelGeo.setAttribute('pixel',new T.InstancedBufferAttribute(pixels,2));
    const sharedVertex=`varying vec3 color0;varying vec3 normal0;varying float depth0;varying vec3 local0;uniform float time,seed,bass;uniform vec3 palette;
      vec3 pal(float n){return .5+.5*cos(6.2831853*(palette+vec3(.0,.32,.65)+n));}`;
    const fragment=`precision highp float;varying vec3 color0;varying vec3 normal0;varying float depth0;varying vec3 local0;uniform float edgeStrength;
      void main(){vec3 n=normalize(normal0);float lit=.32+.68*max(0.,dot(n,normalize(vec3(-.4,.8,.5))));vec3 d=abs(abs(local0)-.5);float edge=1.-smoothstep(.008,.035,min(max(d.x,d.y),min(max(d.y,d.z),max(d.z,d.x))));
      vec3 c=color0*lit+color0*edge*edgeStrength;float fog=smoothstep(22.,118.,depth0);c=mix(c,vec3(.015,.025,.045),fog);gl_FragColor=vec4(c,1.);}`;
    function uniforms(){return {time:{value:0},seed:{value:0},bass:{value:0},palette:{value:new T.Vector3()},travel:{value:0},image:{value:fallback},variant:{value:0},edgeStrength:{value:.3}};}
    function makeSlot(){
      const scene=new T.Scene();scene.background=new T.Color(0x040713);const camera=new T.PerspectiveCamera(57,960/540,.1,150),u=uniforms();
      const architectureMaterial=new T.ShaderMaterial({uniforms:u,vertexShader:sharedVertex+`attribute float instanceId;uniform float travel,variant;uniform sampler2D image;
        void main(){vec3 local=position;float phase=time*.9+instanceId*.37+seed;
        local.xz*=1.+sin(phase)*(.07+bass*.13);local.y*=1.+sin(phase*.73)*.09+bass*.18;
        vec3 p=(instanceMatrix*vec4(local,1.)).xyz;p.x+=sin(time*.65+p.z*.12+seed)*(.25+bass*.3);p.y+=sin(time*.8+instanceId*.21)*.16;float cycle=floor((p.z+travel+115.)/126.);p.z=mod(p.z+travel+115.,126.)-115.;
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;normal0=normalMatrix*mat3(instanceMatrix)*normal;local0=position;depth0=-mv.z;
        color0=pal(fract(floor(instanceId/6.)*.021+cycle*.173+seed*.003));color0=variant<.5?mix(vec3(.7,.76,.83),color0,.2):mix(color0,vec3(.35,.43,.52),.28);
        vec3 artwork=texture2D(image,vec2(p.y*.075+instanceId*.013,p.z*.018+time*.018)).rgb;color0=mix(color0,artwork,.22+.2*sin(time*.045+seed)*sin(time*.045+seed));}`,fragmentShader:fragment});
      const architecture=new T.InstancedMesh(archGeo,architectureMaterial,MAX);architecture.frustumCulled=false;scene.add(architecture);
      const landMaterial=new T.ShaderMaterial({uniforms:u,side:T.DoubleSide,vertexShader:sharedVertex+`uniform sampler2D image;uniform float variant;
        void main(){vec2 st=uv+vec2(sin(time*.16+seed)*.09,time*.028);vec3 ink=texture2D(image,st).rgb;float h=dot(ink,vec3(.2126,.7152,.0722));
        vec3 p=vec3(position.x,h*3.4-1.5,position.y);if(variant>1.5&&variant<2.5){float a=position.y*.18+sin(time*.33)*.55;p=vec3(position.x,cos(a)*(3.5+bass*.5)+h*.8,sin(a)*(3.5+bass*.5));}
        if(variant>2.5&&variant<3.5){float a=position.x*.24+time*.12,b=position.y*.13;p=vec3(cos(a)*cos(b),sin(b),sin(a)*cos(b))*(3.2+h*1.5);}
        if(variant>4.5){float a=position.y*.21+time*.16;p=vec3(position.x*.65,cos(a+position.x*.25)*2.+h,sin(a)*5.);}
        p.y+=sin(position.x*.65+position.y*.45+time*1.1)*(.55+bass*.65)+cos(position.y*.7-time*.8)*.25+bass*h*.55;
        float eps=1./256.;float hx=dot(texture2D(image,st+vec2(eps,0.)).rgb-texture2D(image,st-vec2(eps,0.)).rgb,vec3(.2126,.7152,.0722));float hz=dot(texture2D(image,st+vec2(0.,eps)).rgb-texture2D(image,st-vec2(0.,eps)).rgb,vec3(.2126,.7152,.0722));
        normal0=normalMatrix*normalize(vec3(-hx*4.,1.,-hz*4.));color0=ink*.9+pal(h*.3)*.1;local0=vec3(0.);vec4 mv=modelViewMatrix*vec4(p,1.);depth0=-mv.z;gl_Position=projectionMatrix*mv;}`,fragmentShader:fragment});
      const land=new T.Mesh(landGeo,landMaterial);land.frustumCulled=false;scene.add(land);
      const voxelMaterial=new T.ShaderMaterial({uniforms:u,vertexShader:sharedVertex+`attribute vec2 pixel;uniform sampler2D image;uniform float variant;
        void main(){vec3 ink=texture2D(image,pixel).rgb;float h=dot(ink,vec3(.2126,.7152,.0722));vec3 p=position;
        p.y=(p.y+.5)*(.25+h*(3.5+bass*1.3))-1.5;vec3 base=(instanceMatrix*vec4(0.,0.,0.,1.)).xyz;p.xz*=.185;
        if(variant>3.5){float a=time*.22+length(base.xz)*.18;mat2 r=mat2(cos(a),-sin(a),sin(a),cos(a));base.xz=r*base.xz;base.xz*=1.+.17*sin(time*.4+length(base.xz));}
        p+=base;p.y+=sin(time*1.35+pixel.x*10.+pixel.y*12.+seed)*(.55+.75*bass);p.x+=sin(time*.65+pixel.y*8.)*.16;p.z+=cos(time*.8+pixel.x*8.)*.18;normal0=normalMatrix*normal;color0=ink*.93+pal(h*.3)*.07;local0=position;
        vec4 mv=modelViewMatrix*vec4(p,1.);depth0=-mv.z;gl_Position=projectionMatrix*mv;}`,fragmentShader:fragment});
      const voxels=new T.InstancedMesh(voxelGeo,voxelMaterial,W*H);voxels.frustumCulled=false;scene.add(voxels);
      const obj=new T.Object3D();for(let y=0;y<H;y++)for(let x=0;x<W;x++){obj.position.set((x-W/2)*.19,0,(y-H/2)*.19);obj.updateMatrix();voxels.setMatrixAt(y*W+x,obj.matrix);}voxels.instanceMatrix.needsUpdate=true;
      const target=new T.WebGLRenderTarget(960,540,{depthBuffer:true,stencilBuffer:false,minFilter:T.LinearFilter,magFilter:T.LinearFilter});
      return {scene,camera,u,architecture,land,voxels,target,architectureMaterial,landMaterial,voxelMaterial,key:null,frames:0,variant:0,count:0,travel:0};
    }
    function plan(slot,look){
      const key=look.family+':'+look.seed;if(slot.key===key)return;slot.key=key;slot.variant=look.family===12?look.recipe%7:look.recipe%6;slot.travel=0;
      slot.u.seed.value=look.seed;slot.u.palette.value.set(...look.palette);slot.u.image.value=look.texture;
      slot.u.variant.value=slot.variant;const obj=new T.Object3D();let count=0;
      const put=(x,y,z,w,h,d,rz=0,ry=0)=>{if(count>=MAX)return;obj.position.set(x,y,z);obj.scale.set(w,h,d);obj.rotation.set(0,ry,rz);obj.updateMatrix();slot.architecture.setMatrixAt(count++,obj.matrix);};
      const hash=n=>{const x=Math.sin(n*127.1+look.seed)*43758.5453;return x-Math.floor(x);};
      for(let row=0;row<30;row++){
        const z=-row*4.2,h=4.5+hash(row)*4,offset=Math.sin(row*.37+look.seed)*.45;
        if(slot.variant>=4){
          const sides=slot.variant===4?10:8;
          for(let k=0;k<sides;k++){const angle=k/sides*Math.PI*2+(slot.variant===5?row*.21:slot.variant===6?Math.sin(row*.23)*.4:0);const radius=slot.variant===6?4.2+hash(row)*2:4.2;put(Math.cos(angle)*radius,3.8+Math.sin(angle)*radius,z,slot.variant===6?1.2:.3,slot.variant===6?.35:1.8,.7,angle+Math.PI/2,row*.03);}
        }else if(slot.variant===0||slot.variant===2){const twist=slot.variant===2?Math.sin(row*.3+look.seed)*.18:0;put(-3+offset,h/2,z,.35,h,.6,twist);put(3+offset,h/2,z,.35,h,.6,twist);put(offset,h,z,6.6,.35,.6,twist);if(row%2===0)put(offset,.0,z,6.6,.12,1.4);}
        else if(slot.variant===1){for(const side of [-1,1]){for(let step=0;step<4;step++)put(side*(2.6+step*.6),.2+step*.6,z+step*.3,1.3,.25,1.5,0,side*.2);put(side*4.6,h*.65,z,1.8,1.8,1.8,row*.14,row*.3);}}
        else {for(const side of [-1,1]){put(side*(3.3+hash(row+13)*1.5),h*.5,z,1.7,h,1.6);put(side*2.5,h+1,z,1.6,.12,3.2,row*.04);}if(row%3===0)put(0,h+2,z,8,.2,.7);}
      }
      slot.architecture.count=count;slot.architecture.instanceMatrix.needsUpdate=true;slot.count=count;
    }
    function update(dt,now,bass,current,pending,imageNow=now,imageDt=dt){
      const target=renderer.getRenderTarget(),clear=renderer.autoClear,color=renderer.getClearColor(new T.Color()).clone(),clearAlpha=renderer.getClearAlpha();
      try{for(const [i,look] of [current,pending].entries()){
        if(!look||look.family<12||look.family>13)continue;const s=slots[i]||(slots[i]=makeSlot());plan(s,look);const lookTime=look.family===13?imageNow:now;s.u.time.value=lookTime;s.u.bass.value=look.family===13?0:Math.max(0,Math.min(1,bass));s.u.image.value=look.texture;
        const architecture=look.family===12;s.architecture.visible=architecture;const voxel=s.variant===1||s.variant===4;s.land.visible=!architecture&&!voxel;s.voxels.visible=!architecture&&voxel;
        if(architecture){s.travel+=Math.min(.1,dt)*(2.8+look.speed*2.2+s.u.bass.value*1.8);s.u.travel.value=s.travel;s.camera.fov=57;s.camera.position.set(Math.sin(lookTime*.23+look.seed)*.85,1.8+Math.sin(lookTime*.19)*.45,5);s.camera.lookAt(Math.sin(lookTime*.17)*1.1,2.4+Math.cos(lookTime*.21)*.6,-12);s.u.edgeStrength.value=.55;}
        else{s.camera.fov=48;s.camera.position.set(Math.sin(lookTime*.18+look.seed)*5.2,5.8+Math.sin(lookTime*.23)*1.5,(voxel?10:11)+Math.cos(lookTime*.18+look.seed)*2);s.camera.lookAt(0,s.variant===2?2:0,-2);s.u.edgeStrength.value=voxel?.12:0;}
        s.camera.updateProjectionMatrix();renderer.setClearColor(0x040713,1);renderer.setRenderTarget(s.target);renderer.autoClear=true;renderer.render(s.scene,s.camera);s.frames++;
      }}finally{renderer.setClearColor(color,clearAlpha);renderer.setRenderTarget(target);renderer.autoClear=clear;}
    }
    function probe(){const result=[];for(const [i,s] of slots.entries()){if(!s)continue;const b=new Uint8Array(4),samples=[];for(const [x,y] of [[480,270],[360,180],[600,360]]){renderer.readRenderTargetPixels(s.target,x,y,1,1,b);samples.push([...b]);}result.push({slot:i,samples});}return result;}
    return {update,probe,texture(i){return slots[i]?slots[i].target.texture:fallback;},info(){return {resolution:'960x540',slots:slots.filter(Boolean).map(s=>({family:+s.key.split(':')[0],variant:s.variant,frames:s.frames,travel:+s.travel.toFixed(2),camera:s.camera.position.toArray().map(v=>+v.toFixed(2)),architectureInstances:s.count,voxelInstances:W*H}))};},dispose(){for(const s of slots.filter(Boolean)){s.target.dispose();s.architectureMaterial.dispose();s.landMaterial.dispose();s.voxelMaterial.dispose();}archGeo.dispose();landGeo.dispose();voxelGeo.dispose();fallback.dispose();}};
  };
})(window);

(function(root){
  'use strict';
  class MusicDirector {
    constructor(random=Math.random){this.random=random;this.mode='legacy';this.age=0;this.hold=18+random()*12;this.energy=.5;this.slow=.5;this.lastBeat=-1;this.lastStand='';this.history=[];this.exposure={legacy:.95,atlas:0,full:0};this.changes=0;this.reason='club laten ademen';}
    tick(dt,beat,energy,stand='groove'){
      dt=Math.max(0,Math.min(.25,dt));energy=Math.max(0,Math.min(1,Number.isFinite(energy)?energy:.5));
      this.energy+=(energy-this.energy)*(1-Math.exp(-dt/2));this.slow+=(energy-this.slow)*(1-Math.exp(-dt/18));this.age+=dt;
      const phrase=Math.floor(beat/8),boundary=phrase!==this.lastBeat,event=stand!==this.lastStand;
      this.lastBeat=phrase;
      const rising=this.energy-this.slow>.065;
      const musical=event&&(stand==='drop'||stand==='break')||rising&&boundary;
      // A musical event is an opportunity, not a mandatory cut. Long holds can continue.
      if(this.age>8&&((musical&&this.age>this.hold*.55&&this.random()<.42)||((boundary||this.age>this.hold+3)&&this.age>=this.hold))){
        const weights={club:stand==='break'?.6:.35,blend:1.8,legacy:2.5,atlas:4.5,duet:1.2};
        if(this.energy<.25){weights.club+=.1;weights.duet*=.7;}
        if(this.mode==='club'){weights.legacy+=.7;weights.atlas+=.7;}
        for(const entry of this.history.slice(-3))weights[entry.mode]*=.45;
        weights[this.mode]=0;
        let n=this.random()*Object.values(weights).reduce((a,b)=>a+b,0),next='club';
        for(const [mode,w] of Object.entries(weights)){n-=w;if(n<=0){next=mode;break;}}
        this.mode=next;this.age=0;
        const ranges={club:[6,11],blend:[12,23],legacy:[18,32],atlas:[24,45],duet:[15,28]},range=ranges[next];
        this.hold=range[0]+Math.pow(this.random(),.8)*(range[1]-range[0]);
        this.fade=[.35,.55,.8][Math.floor(this.random()*3)];this.intensity=1;
        this.reason=musical?'muzikale verandering':'nieuwe frase en variatie';this.changes++;
        this.history.push({mode:next,hold:+this.hold.toFixed(1),reason:this.reason});if(this.history.length>30)this.history.shift();
      }
      this.lastStand=stand;
      const targets={club:[0,.12],blend:[0,.62],legacy:[1,0],atlas:[0,1],duet:[0,.88]},v=targets[this.mode];
      const scale=this.intensity||1,k=1-Math.exp(-dt/(this.fade||.65));
      this.exposure.legacy+=(v[0]*scale-this.exposure.legacy)*k;this.exposure.atlas+=(v[1]*scale-this.exposure.atlas)*k;const fullTarget=["atlas","blend","duet"].includes(this.mode)?1:0;this.exposure.full+=(fullTarget-this.exposure.full)*k;
      return this.exposure;
    }
    info(){return {mode:this.mode,age:+this.age.toFixed(1),hold:+this.hold.toFixed(1),changes:this.changes,reason:this.reason,energy:+this.energy.toFixed(3),legacy:+this.exposure.legacy.toFixed(3),atlas:+this.exposure.atlas.toFixed(3),history:this.history.slice(-8)};}
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=MusicDirector;else root.ClubMusicDirector=MusicDirector;
})(typeof window==='undefined'?globalThis:window);

(function(root){
  class VisualMemory {
    constructor(storage,key='club-vj-evolution-v1',random=Math.random){
      this.storage=storage;this.key=key;this.random=random;this.rows=[];this.directions=[];this.rejected=0;
      try{const data=JSON.parse(storage.getItem(key)||'{}');const cutoff=Date.now()-14*86400000;this.rows=(data.rows||[]).filter(x=>x.time>cutoff).slice(-2048);this.directions=(data.directions||[]).filter(x=>x&&['club','blend','legacy','atlas','duet'].includes(x.mode)).slice(-24);}catch(e){}
    }
    signature(l){return [l.family,l.image,l.paletteId,l.sym,Math.round(l.speed*5),Math.round(l.coverage*5),l.recipe||0].join(':');}
    score(l){const signature=this.signature(l);let score=0;const recent=this.rows.slice(-64);for(let i=0;i<recent.length;i++){const r=recent[i],w=(i+1)/recent.length;if(r.signature===signature)score+=1000;if(r.family===l.family)score+=w*3;if(r.image===l.image)score+=w*2;if(r.paletteId===l.paletteId)score+=w;}return score;}
    choose(factory){let best=null,score=Infinity;for(let i=0;i<16;i++){const candidate=factory(),s=this.score(candidate);if(s<score){best=candidate;score=s;}if(!this.rows.some(r=>r.signature===this.signature(candidate))&&s<5)break;this.rejected++;}return best;}
    remember(l){this.rows.push({time:Date.now(),signature:this.signature(l),family:l.family,image:l.image,paletteId:l.paletteId});this.rows=this.rows.slice(-2048);this.save();}
    direction(entry){this.directions.push(entry);this.directions=this.directions.slice(-24);this.save();}
    save(){try{this.storage.setItem(this.key,JSON.stringify({rows:this.rows,directions:this.directions}));}catch(e){}}
    info(){return {rememberedLooks:this.rows.length,rememberedDirections:this.directions.length,rejectedSimilar:this.rejected,capacity:2048};}
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=VisualMemory;else root.ClubVisualMemory=VisualMemory;
})(typeof window==='undefined'?globalThis:window);

// Additional GPU scenes. No audio, network requests, or changes to the club's objects.
(function(root){
  root.ClubLivingVisuals=function(renderer){
    const T=THREE,N=12000,size=256;
    const type=renderer.capabilities.isWebGL2&&renderer.extensions.has('EXT_color_buffer_float')?T.HalfFloatType:T.UnsignedByteType;
    const options={type,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false,stencilBuffer:false};
    let growthA=new T.WebGLRenderTarget(size,size,options),growthB=new T.WebGLRenderTarget(size,size,options);
    const particleTarget=new T.WebGLRenderTarget(960,540,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false,stencilBuffer:false});
    const gu={state:{value:growthA.texture},stepSize:{value:new T.Vector2(1/size,1/size)},init:{value:1},advection:{value:0},flowTime:{value:0},seed:{value:Math.random()*100},feed:{value:.036},kill:{value:.06}};
    const growthMat=new T.ShaderMaterial({uniforms:gu,depthTest:false,depthWrite:false,
      vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`precision highp float;varying vec2 uv0;uniform sampler2D state;uniform vec2 stepSize;uniform float init,seed,feed,kill,advection,flowTime;
      float hash(float n){return fract(sin(n*127.1+seed)*43758.5453);}
      void main(){if(init>.5){float b=1.-smoothstep(.04,.075,distance(uv0,vec2(.5)));for(int i=0;i<16;i++){float z=float(i),angle=z*2.399963;float radius=i<8?.11+.018*z:.27+.1*hash(z+1.);vec2 p=vec2(.5)+vec2(cos(angle),sin(angle))*radius;b=max(b,1.-smoothstep(.018,.048,distance(uv0,p)));}gl_FragColor=vec4(1.-b*.5,b*.8,0.,1.);return;}
      vec2 uv=fract(uv0+vec2(sin(uv0.y*8.+flowTime*.7),cos(uv0.x*8.-flowTime*.6))*advection);vec2 q=texture2D(state,uv).rg,lap=-q;
      lap+=.2*(texture2D(state,uv+vec2(stepSize.x,0)).rg+texture2D(state,uv-vec2(stepSize.x,0)).rg+texture2D(state,uv+vec2(0,stepSize.y)).rg+texture2D(state,uv-vec2(0,stepSize.y)).rg);
      lap+=.05*(texture2D(state,uv+stepSize).rg+texture2D(state,uv-stepSize).rg+texture2D(state,uv+vec2(stepSize.x,-stepSize.y)).rg+texture2D(state,uv+vec2(-stepSize.x,stepSize.y)).rg);
      float react=q.x*q.y*q.y;vec2 d=vec2(lap.x-react+feed*(1.-q.x),.5*lap.y+react-(kill+feed)*q.y);
      gl_FragColor=vec4(clamp(q+d,0.,1.),0.,1.);}`});
    const growthScene=new T.Scene(),growthQuad=new T.Mesh(new T.PlaneGeometry(2,2),growthMat);growthScene.add(growthQuad);
    const flatCam=new T.OrthographicCamera(-1,1,1,-1,0,1);
    const pu={time:{value:0},alpha:{value:1},energy:{value:.5},bass:{value:0},formA:{value:0},formB:{value:1},morph:{value:0},seed:{value:Math.random()*100},palette:{value:new T.Vector3(.1,.3,.6)}};
    const geo=new T.BufferGeometry(),positions=new Float32Array(N*3),figures=new Float32Array(N*3),ids=new Float32Array(N);
    for(let i=0;i<N;i++){
      const a=i*2.39996323,z=1-2*(i+.5)/N,r=Math.sqrt(1-z*z);positions.set([Math.cos(a)*r,z,Math.sin(a)*r],i*3);ids[i]=i/N;
      // A recognisable procedural figure while the existing club models are not loaded yet.
      const h=i/N,angle=i*2.39996323;let y=(h-.5)*2.5,width=.25;
      if(h>.73){width=h>.87?(1-h)*2.4:.18;y=(h-.5)*2.5;}
      else if(h<.27)width=.12;
      else width=.2+.22*(.73-h);
      figures.set([Math.cos(angle)*width,y,Math.sin(angle)*width*.7],i*3);
    }
    geo.setAttribute('position',new T.BufferAttribute(positions,3));geo.setAttribute('figure',new T.BufferAttribute(figures,3));geo.setAttribute('id',new T.BufferAttribute(ids,1));
    const particleMat=new T.ShaderMaterial({uniforms:pu,transparent:true,depthWrite:false,depthTest:false,blending:T.AdditiveBlending,
      vertexShader:`precision highp float;attribute vec3 figure;attribute float id;uniform float time,energy,bass,formA,formB,morph,seed;uniform vec3 palette;varying vec3 col;varying float glow;
      vec3 shape(float f){float a=id*6.2831853*17.+seed,r=.65+.17*sin(id*37.+seed);if(f<.5){vec3 body=figure;float upper=smoothstep(-.7,.6,body.y);body.x+=sin(time*.9+body.y*1.6)*.065*upper;body.z+=sin(time*.7+body.y)*.05*upper;return body;}
      if(f<1.5){vec3 p=position*(1.4+.2*sin(time*.13+id*15.));return p+vec3(sin(p.y*3.+time*.18),cos(p.z*3.-time*.13),sin(p.x*3.+time*.15))*.35;}
      if(f<2.5){float b=id*6.2831853*113.;return vec3((.9+.27*cos(b))*cos(a),.27*sin(b),(.9+.27*cos(b))*sin(a));}
      if(f<3.5){float y=(id-.5)*3.;return vec3(sin(y*4.+seed)*.55,y,cos(y*3.+seed)*.5)+position*.1;}
      float b=id*6.2831853*97.;return vec3(cos(a)*sin(b),cos(b),sin(a)*sin(b))*(.65+.3*sin(a*5.+b*3.+seed));}
      void main(){vec3 p=mix(shape(formA),shape(formB),smoothstep(0.,1.,morph));float spin=time*.25;mat2 rot=mat2(cos(spin),-sin(spin),sin(spin),cos(spin));p.xz=rot*p.xz;
      p+=position*(.012+.025*bass)*sin(time*.45+id*40.);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((2.8+energy*2.8)*4.5/-mv.z,1.,7.);col=.5+.5*cos(6.2831853*(palette+vec3(id*.6)+time*.005));glow=.65+.35*sin(id*57.+time*.2);}`,
      fragmentShader:'precision highp float;uniform float alpha;varying vec3 col;varying float glow;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(col,(1.-smoothstep(.1,1.,r))*glow*alpha*.95);}'});
    const particleScene=new T.Scene(),points=new T.Points(geo,particleMat);points.frustumCulled=false;particleScene.add(points);
    const particleCam=new T.PerspectiveCamera(43,960/540,.1,20);particleCam.position.set(0,.05,4.5);particleCam.lookAt(0,0,0);
    let initialised=false,steps=0,particleFrames=0,growthFrames=0,source='procedural-figure',forms=[0],formAge=0,formHold=12+Math.random()*10,morphAge=0,sourceIndex=0,lastRecipe=-1,modelSamples=0;
    function captureFigure(){
      const available=typeof dancers!=='undefined'?dancers.filter(d=>d.type==='model'&&d.M):[];
      const preferred=available.filter(d=>d.M.type==='wizard');const pool=preferred.length?preferred:available;
      if(!pool.length)return;
      const chosen=pool[(sourceIndex++)%pool.length],meshSamples=[],v=new T.Vector3();chosen.root.updateMatrixWorld(true);
      const inverse=new T.Matrix4().copy(chosen.root.matrixWorld).invert();
      chosen.body.traverse(mesh=>{const attr=mesh.geometry&&mesh.geometry.attributes.position;if(!mesh.isMesh||!attr)return;if(mesh.skeleton)mesh.skeleton.update();const stride=Math.max(1,Math.floor(attr.count/4500));for(let i=0;i<attr.count;i+=stride){v.fromBufferAttribute(attr,i);if(mesh.isSkinnedMesh&&mesh.boneTransform)mesh.boneTransform(i,v);v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);if(Number.isFinite(v.x+v.y+v.z))meshSamples.push(v.clone());}});
      if(meshSamples.length<30)return;
      const box=new T.Box3().setFromPoints(meshSamples),center=box.getCenter(new T.Vector3()),extent=box.getSize(new T.Vector3()),scale=2.55/Math.max(extent.y,extent.x,extent.z,.1);
      for(let i=0;i<N;i++){const p=meshSamples[(i*37)%meshSamples.length];figures[i*3]=(p.x-center.x)*scale;figures[i*3+1]=(p.y-center.y)*scale;figures[i*3+2]=(p.z-center.z)*scale;}
      geo.attributes.figure.needsUpdate=true;source=chosen.M.file||chosen.M.type;modelSamples++;
    }
    function renderPass(scene,camera,target,clear=true){renderer.setRenderTarget(target);renderer.autoClear=clear;renderer.render(scene,camera);}
    function update(dt,now,energy,bass,needParticles,needGrowth,recipe,palette){
      if(!needParticles&&!needGrowth)return;
      const target=renderer.getRenderTarget(),autoClear=renderer.autoClear,color=renderer.getClearColor(new T.Color()).clone(),clearAlpha=renderer.getClearAlpha();
      try{
        renderer.setClearColor(0x000000,0);
        if(needGrowth){
          if(!initialised){gu.state.value=null;gu.init.value=1;renderPass(growthScene,flatCam,growthA);renderPass(growthScene,flatCam,growthB);gu.init.value=0;initialised=true;}
          gu.advection.value=Math.min(.1,dt)*.003;gu.flowTime.value=now;gu.feed.value=.034+.003*Math.sin(now*.009)+.002*Math.min(1,energy);gu.kill.value=.06+.0015*Math.sin(now*.006);
          for(let i=0;i<4;i++){gu.state.value=growthA.texture;renderPass(growthScene,flatCam,growthB);const t=growthA;growthA=growthB;growthB=t;steps++;}growthFrames++;
        }
        if(needParticles){
          if(recipe!==lastRecipe){captureFigure();lastRecipe=recipe;pu.seed.value=recipe;pu.palette.value.set(...palette);}
          formAge+=Math.min(.1,dt);morphAge+=Math.min(.1,dt);
          if(formAge>formHold){pu.formA.value=pu.formB.value;let next;do{next=Math.floor(Math.random()*5);}while(next===pu.formA.value||forms.slice(-2).includes(next));pu.formB.value=next;forms.push(next);if(forms.length>20)forms.shift();formAge=0;morphAge=0;formHold=12+Math.random()*10;}
          pu.morph.value=Math.max(0,Math.min(1,(morphAge-1.5)/4.5));pu.time.value=now;pu.energy.value=Math.min(1,energy);pu.bass.value=Math.min(1,bass);
          renderPass(particleScene,particleCam,particleTarget);particleFrames++;
        }
      }finally{renderer.setClearColor(color,clearAlpha);renderer.setRenderTarget(target);renderer.autoClear=autoClear;}
    }
    function probe(){
      const target=renderer.getRenderTarget(),clear=renderer.autoClear,out={};
      const rt=new T.WebGLRenderTarget(64,64,{depthBuffer:false,stencilBuffer:false}),u={t:{value:null}};
      const mat=new T.ShaderMaterial({uniforms:u,vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'precision highp float;varying vec2 p;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,p);}'}),sc=new T.Scene(),g=new T.PlaneGeometry(2,2);sc.add(new T.Mesh(g,mat));
      try{for(const [name,texture] of [['particles',particleTarget.texture],['growth',growthA.texture]]){u.t.value=texture;renderPass(sc,flatCam,rt);const data=new Uint8Array(64*64*4);renderer.readRenderTargetPixels(rt,0,0,64,64,data);let hash=2166136261,sum=0,sum2=0,nonzero=0,central=0;for(let i=0;i<data.length;i+=4){const n=data[i+1];sum+=n;sum2+=n*n;if(n>8){nonzero++;const pixel=i/4,x=pixel%64,y=Math.floor(pixel/64);if(x>=16&&x<48&&y>=16&&y<48)central++;}hash=Math.imul(hash^n,16777619)>>>0;}out[name]={hash,nonzero,centralNonzero:central,mean:sum/4096,variance:sum2/4096-(sum/4096)**2};}}finally{renderer.setRenderTarget(target);renderer.autoClear=clear;rt.dispose();mat.dispose();g.dispose();}return out;
    }
    return {update,probe,get particles(){return particleTarget.texture;},get growth(){return growthA.texture;},info(){return {particles:N,particleFrames,growthFrames,simulationSteps:steps,simulationSize:size,simulationType:type===T.HalfFloatType?'half-float':'byte',figureSource:source,modelSamples,morph:+pu.morph.value.toFixed(3),formAge:+formAge.toFixed(2),form:pu.formB.value,forms:forms.slice(-8)};},dispose(){growthA.dispose();growthB.dispose();particleTarget.dispose();growthMat.dispose();growthQuad.geometry.dispose();geo.dispose();particleMat.dispose();}};
  };
})(window);

// Reuse the club's existing composer image: no second render of the 3D scene.
(function(root){
  root.ClubRoomProjection=function(renderer){
    const T=THREE,patched=new Map(),surfaces=[];
    const black=new T.DataTexture(new Uint8Array([0,0,0,255]),1,1);black.needsUpdate=true;
    const u={uClubImage:{value:black},uClubPixel:{value:new T.Vector2(1/1280,1/720)},uProjectClub:{value:0},uProjectionClock:{value:0},uPresentation:{value:new T.Vector4(1,0,0,0)},uTakeover:{value:0},uTransitionStyle:{value:0}};
    const glsl=`uniform sampler2D uClubImage;uniform vec2 uClubPixel;uniform float uProjectClub,uProjectionClock;uniform vec4 uPresentation;uniform float uTakeover,uTransitionStyle;
      vec4 clubLight(vec3 effect,vec2 uv,float strength){
        if(uProjectClub<.5)return vec4(effect,strength);
        vec3 room=texture2D(uClubImage,uv).rgb;
        vec3 right=texture2D(uClubImage,uv+vec2(uClubPixel.x*2.,0.)).rgb;
        vec3 up=texture2D(uClubImage,uv+vec2(0.,uClubPixel.y*2.)).rgb;
        float edge=smoothstep(.035,.28,length(room-right)+length(room-up));
        float highlight=1.-.55*smoothstep(.22,.85,max(room.r,max(room.g,room.b)));
        vec2 q=(uv-vec2(.5,.36))*vec2(3.2,3.);
        float foreground=1.-.3*exp(-dot(q,q)*1.8);
        float field=.5+.5*sin(uv.x*5.+sin(uv.y*6.+uProjectionClock*.08)*1.3+uProjectionClock*.045);
        float lightPatch=.65+.35*smoothstep(.28,.75,field);
        float lit=smoothstep(.008,.1,dot(effect,vec3(.2126,.7152,.0722)));
        float mask=(1.-edge*.75)*highlight*foreground*lightPatch*lit;
        vec3 light=max(effect,0.);light=light/(1.+max(light-vec3(.8),0.));
        float motion=uProjectionClock;vec2 movingCenter=vec2(.5,.51)+vec2(sin(motion*.3),cos(motion*.23))*.12;vec2 center=uv-movingCenter;
        float portal=1.-smoothstep(.30,.48,length(center*vec2(1.,1.18)));
        float ribbon=1.-smoothstep(.17,.27,abs(center.y+.13*sin(uv.x*5.+uProjectionClock*.5)));
        float sculpture=smoothstep(.025,.12,dot(effect,vec3(.2126,.7152,.0722)));
        float reveal=clamp(uPresentation.y*portal+uPresentation.z*ribbon+uPresentation.w*sculpture,0.,1.);
        vec3 source=mix(light*mask*1.05,effect,reveal);
        float wave=.5+.23*sin(uv.x*9.+sin(uv.y*7.+motion*.32)*2.+motion*.24)+.23*sin(uv.y*8.+uv.x*3.-motion*.28);
        float radial=clamp(length((uv-movingCenter)*vec2(1.,.75))*1.7,0.,1.);
        float stream=clamp(uv.x*.75+uv.y*.25+.08*sin(uv.y*15.+motion*.4),0.,1.);
        float detail=clamp(dot(room,vec3(.22,.56,.22))*.55+wave*.45,0.,1.);
        float panels=clamp(abs(uv.x-movingCenter.x)*1.75+.1*sin(uv.y*9.+motion*.3),0.,1.);
        float veil=clamp(.5+(uv.x-.5)*.65+(uv.y-.5)*.7+.07*sin(uv.x*7.-uv.y*4.+motion*.45),0.,1.);
        vec2 swirl=uv-movingCenter;float spiral=fract(atan(swirl.y,swirl.x)/6.2831853+length(swirl)*1.2+.5+motion*.06);
        float depthWave=clamp(.35+.25*sin(uv.y*9.+sin(uv.x*5.+motion*.2)*2.+motion*.35)+radial*.35,0.,1.);
        float field2=uTransitionStyle<.5?wave:uTransitionStyle<1.5?radial:uTransitionStyle<2.5?stream:uTransitionStyle<3.5?detail:uTransitionStyle<4.5?panels:uTransitionStyle<5.5?veil:uTransitionStyle<6.5?spiral:depthWave;
        float wipe=smoothstep(field2-.065,field2+.065,strength*1.2-.1);
        if(strength<.003)wipe=0.;if(strength>.97)wipe=1.;
        return vec4(mix(source*strength,effect*wipe,uTakeover),mix(reveal*strength,wipe,uTakeover));
      }`;
    function blend(mat,on){mat.blending=on?T.CustomBlending:T.NormalBlending;if(on){mat.blendEquation=T.AddEquation;mat.blendSrc=T.OneFactor;mat.blendDst=T.OneMinusSrcAlphaFactor;mat.blendSrcAlpha=T.ZeroFactor;mat.blendDstAlpha=T.OneFactor;}}
    let ready=false;
    function bind(on){
      const texture=typeof grade!=='undefined'&&grade&&grade.uniforms.tDiffuse.value;
      ready=!!texture;u.uClubImage.value=texture||black;
      if(typeof grade!=='undefined'&&grade&&grade.uniforms.res){const r=grade.uniforms.res.value;u.uClubPixel.value.set(1/Math.max(1,r.x),1/Math.max(1,r.y));}
      u.uProjectClub.value=on&&ready?1:0;u.uProjectionClock.value=root.clubMusicMood?clubMusicMood.flowClock:performance.now()/1000;
    }
    function patch(mat,on){
      if(!patched.has(mat)){
        patched.set(mat,{fragmentShader:mat.fragmentShader,blending:mat.blending,blendSrc:mat.blendSrc,blendDst:mat.blendDst,blendSrcAlpha:mat.blendSrcAlpha,blendDstAlpha:mat.blendDstAlpha,blendEquation:mat.blendEquation});
        Object.assign(mat.uniforms,u);
        mat.fragmentShader='precision highp float;uniform sampler2D tIn;uniform float uAlpha;varying vec2 vUv;'+glsl+'void main(){gl_FragColor=clubLight(texture2D(tIn,vUv).rgb,vUv,uAlpha);}';mat.needsUpdate=true;
      }
      bind(on);blend(mat,on);
    }
    function attach(texture){
      function material(){return new T.MeshBasicMaterial({map:texture,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false,depthTest:true,toneMapped:false});}
      for(const name of ['wall','floor']){
        const parent=name==='wall'?(typeof wallFx!=='undefined'?wallFx:null):(typeof floorFx!=='undefined'?floorFx:null);if(!parent)continue;
        const mesh=new T.Mesh(parent.geometry.clone(),material());mesh.position.z=.018;mesh.visible=false;parent.add(mesh);surfaces.push({mesh,kind:name});
      }
      if(typeof floorFx!=='undefined'&&typeof tiles!=='undefined'&&floorFx.parent){const mesh=new T.Mesh(floorFx.geometry.clone(),material());mesh.position.copy(floorFx.position);mesh.position.y+=.018;mesh.rotation.copy(floorFx.rotation);mesh.scale.copy(floorFx.scale);mesh.visible=false;floorFx.parent.add(mesh);surfaces.push({mesh,kind:'tiles'});}
    }
    function presentation(kind,dt,style=0){const full=kind>=4;u.uTakeover.value+=((full?1:0)-u.uTakeover.value)*(1.-Math.exp(-Math.min(dt,.1)/1.2));if(full&&u.uTakeover.value>.995)u.uTakeover.value=1;if(!full&&u.uTakeover.value<.005)u.uTakeover.value=0;if(full)u.uTransitionStyle.value=style%8;const a=1.-Math.exp(-Math.min(dt,.1)/1.8),v=u.uPresentation.value;v.x+=((kind===0?1:0)-v.x)*a;v.y+=((kind===1?1:0)-v.y)*a;v.z+=((kind===2?1:0)-v.z)*a;v.w+=((kind===3?1:0)-v.w)*a;}
    function strength(value){for(const {mesh,kind} of surfaces){mesh.material.opacity=value*(kind==='wall'?.85:.4);mesh.visible=value>.003&&(kind!=='tiles'||tiles.visible);}}
    function resetLegacy(){for(const [mat,saved] of patched){Object.assign(mat,saved);mat.needsUpdate=true;}patched.clear();}
    function dispose(){for(const [mat,saved] of patched){Object.assign(mat,saved);for(const key of Object.keys(u))delete mat.uniforms[key];mat.needsUpdate=true;}for(const {mesh} of surfaces){mesh.parent.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}black.dispose();}
    return {u,glsl,bind,blend,patch,attach,strength,presentation,resetLegacy,dispose,info:()=>({clubImageReady:ready,physicalSurfaces:surfaces.length,activeSurfaces:surfaces.filter(s=>s.mesh.visible).length,takeover:+u.uTakeover.value.toFixed(3),transition:['organic','radial','flow','image-contours','opening-panels','diagonal-veil','spiral','depth-waves'][Math.round(u.uTransitionStyle.value)],mode:u.uTakeover.value>.5?'full-visual':['club-light','depth-portal','flowing-ribbon','sculptural-overlay'][u.uPresentation.value.toArray().indexOf(Math.max(...u.uPresentation.value.toArray()))],weights:u.uPresentation.value.toArray(),fullScreenReplacement:u.uTakeover.value>.99})};
  };
})(window);


// Deep SamSo VJ atlas. Additive visual episodes; can be loaded while the scene is running.
(() => {
  'use strict';
  if (window.clubVisualNext && window.clubVisualNext.version !== 'atlas-26') { window.clubVisualNext.restore(); delete window.clubVisualNext; }
  if (window.clubVisualNext || typeof THREE === 'undefined' || typeof naTekenHooks === 'undefined' || typeof clubHooks === 'undefined') return;
  const names = ['Vloeibaar pigment','Spiegelgalerij','Glasrozet','Chroomweefsel','Aurora','Optische druk','Drijvende collages','Sterrenstof','Contourlandschap','Zijden portalen','Transformerende deeltjes','Levend koraal','Onmogelijke architectuur','Beeldlandschappen','Lichtnevel','Gyroide weefsel','Vloeibare lenzen','Lichtlinten','Organische cellen','Oneindige beeldtunnel','Magnetische inktstromen','Zwevende orbitale ringen','Interferentiezijde','Vloeibaar facetmozaiek','Knoopsculptuur','Dubbele lichthelix','Golvend parelveld','Kristalzwerm','Orbitale mobiel','Spiraaltrappen'];
  const imageFamilies=new Set([1,2,3,6,8,9,13,15,16,19,23]);
  const files = ['tex/graffiti-1.jpg','tex/graffiti-2.jpg','tex/graffiti-3.jpg',...['arcade','bass-tempel','uv-jungle','rave-flyers','paddenstoelen','neonsteeg','kosmos','chroom','slijmhol','staal'].map(n=>'tex/doolhof/'+n+'.jpg'),...['jellyfish', 'solar-orbits', 'crystal-cavern', 'neon-city', 'cosmic-eye', 'coral-garden', 'mechanical-clock', 'lotus', 'alien-canopy', 'liquid-marble', 'portal-arches', 'deep-sea', 'circuit-world', 'desert-moons', 'prismatic-wings', 'woven-ribbons', 'floating-islands', 'sound-machines', 'star-map', 'botanical-spirals', 'glass-shards', 'retro-landscape', 'luminous-fungi', 'orbital-station'].map(n=>'tex/atlas26/'+n+'.svg')];
  const rand=(a,b)=>a+Math.random()*(b-a), pick=a=>a[Math.floor(Math.random()*a.length)];
  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  function bag(n){let q=[],last=-1;return ()=>{if(!q.length){q=shuffle(Array.from({length:n},(_,i)=>i));if(q[0]===last)[q[0],q[1]]=[q[1],q[0]];}return last=q.shift();};}
  const nextFamily=bag(names.length),nextArt=bag(files.length),nextPalette=bag(9);
  let storage;try{storage=window.localStorage;}catch(e){}
  const memory=new window.ClubVisualMemory(storage,'club-vj-evolution-v1-'+(new URLSearchParams(location.search).has('uitzenden')?'broadcast':'visitor'));
  const life=window.ClubLivingVisuals(renderer);
  const spatial=window.ClubSpatialVisuals(renderer);
  let lastDt=1/60,lastDirection=0;
  const fallbackCanvas=document.createElement('canvas');fallbackCanvas.width=fallbackCanvas.height=32;
  const g=fallbackCanvas.getContext('2d'),grad=g.createLinearGradient(0,0,32,32);grad.addColorStop(0,'#ee258e');grad.addColorStop(.5,'#242044');grad.addColorStop(1,'#14eac5');g.fillStyle=grad;g.fillRect(0,0,32,32);
  const fallback=new THREE.CanvasTexture(fallbackCanvas);fallback.minFilter=THREE.LinearFilter;fallback.generateMipmaps=false;
  const cache=new Map();let loads=0;
  async function art(index){
    if(cache.has(index)){const item=cache.get(index);item.used=performance.now();return item.promise;}
    const item={used:performance.now(),texture:null,promise:null};cache.set(index,item);
    item.promise=new Promise(resolve=>{const image=new Image();image.onload=()=>{const scale=Math.min(1,1024/Math.max(image.width,image.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.width*scale));c.height=Math.max(1,Math.round(image.height*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);const t=new THREE.CanvasTexture(c);t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.wrapS=t.wrapT=THREE.MirroredRepeatWrapping;t.generateMipmaps=false;if(cache.get(index)!==item){t.dispose();resolve(fallback);return;}item.texture=t;loads++;resolve(t);prune();};image.onerror=()=>resolve(fallback);image.src=new URL(files[index],document.baseURI).href;});return item.promise;
  }
  const projection=window.ClubRoomProjection(renderer);
  const uniforms={uSpatialA:{value:spatial.texture(0)},uSpatialB:{value:spatial.texture(1)},uLife:{value:life.particles},uGrowth:{value:life.growth},uA:{value:fallback},uB:{value:fallback},uTime:{value:0},uImageTime:{value:0},uGeometryTime:{value:0},uFlowTime:{value:0},uImageIntensity:{value:0},uBeat:{value:0},uBass:{value:0},uEnergy:{value:0},uAspect:{value:1},uMix:{value:0},uAlpha:{value:0},uCompose:{value:new THREE.Vector4()},uArtwork:{value:0},uMaskFrom:{value:0},uMaskBlend:{value:1},uLookA:{value:new THREE.Vector4()},uLookB:{value:new THREE.Vector4()},uPaletteA:{value:new THREE.Vector3()},uPaletteB:{value:new THREE.Vector3()}};
  const fragment=`precision highp float;
  varying vec2 vUv;uniform sampler2D uA,uB,uLife,uGrowth,uSpatialA,uSpatialB;uniform float uTime,uImageTime,uGeometryTime,uFlowTime,uImageIntensity,uBeat,uBass,uEnergy,uAspect,uMix,uAlpha,uArtwork,uMaskFrom,uMaskBlend;uniform vec4 uCompose;uniform vec4 uLookA,uLookB;uniform vec3 uPaletteA,uPaletteB;
  #define TAU 6.28318530718
  mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
  float field(vec2 p){return .57*noise(p)+.28*noise(p*2.07+4.)+.15*noise(p*4.13-7.);}
  vec3 palette(float x,vec3 k){return .5+.5*cos(TAU*(vec3(.04,.36,.65)+k+vec3(1.,.83,.67)*x));}
  vec3 picture(sampler2D image,vec2 p){return texture2D(image,p).rgb;}
  // One artwork, eight spatial interpretations. No beat-driven sampling or extra render pass.
  vec3 artwork(sampler2D image,vec2 uv,float seed,float t){
    float mode=mod(floor(seed),8.);vec2 v=uv-.5;
    float drift=t*.13+seed;float evolution=.5+.5*sin(t*.037+seed);
    vec2 warped=v;
    if(mode<.5){warped=rot(.24*sin(drift*.43))*v*(.75+.3*evolution);warped+=vec2(t*.013,sin(drift*.6)*.16);}
    else if(mode<1.5){warped+=vec2(sin(v.y*7.+drift),cos(v.x*5.-drift*.8))*(.035+.085*evolution);}
    else if(mode<2.5){float r=length(v),a=atan(v.y,v.x)+.6*sin(r*5.-drift);warped=vec2(cos(a),sin(a))*r;}
    else if(mode<3.5){vec2 tile=floor(v*3.);vec2 local=fract(v*3.)-.5;warped=(tile+rot(.65*sin(drift*.7+dot(tile,vec2(1.7,2.3))))*local)/3.;}
    else if(mode<4.5){warped=vec2(v.x+sin(v.y*9.+drift)*.12,v.y+sin(drift*.6)*.15);}
    else if(mode<5.5){float lens=1.+.45*sin(length(v)*6.-drift);warped=rot(.2*sin(drift*.5))*v*lens;}
    else if(mode<6.5){vec2 center=vec2(sin(drift*.4),cos(drift*.33))*.28;vec2 d=v-center;warped=center+d*(1.+.45*exp(-dot(d,d)*5.)*sin(drift*.6));}
    else{vec2 axis=vec2(cos(drift*.2),sin(drift*.2));warped=v+axis*sin(dot(v,vec2(-axis.y,axis.x))*12.+drift)*.13;}
    vec3 ink=picture(image,warped+.5);return ink;
  }
  vec3 paint(vec2 p,vec4 look,vec3 pal,sampler2D image,sampler2D spatialImage){
    float kind=look.x,seed=look.y,sym=look.z,tempo=look.w;
    bool imageFamily=(kind>.5&&kind<2.5)||(kind>5.5&&kind<6.5)||(kind>7.5&&kind<9.5)||(kind>15.5&&kind<16.5)||(kind>18.5&&kind<19.5)||(kind>22.5&&kind<23.5);
    bool geometryFamily=kind>23.5||(kind>9.5&&kind<13.5)||(kind>14.5&&kind<18.5)||(kind>20.5&&kind<21.5);
    float gain=1.;
    if(kind>3.5&&kind<4.5)gain=2.3;
    if(kind>5.5&&kind<6.5)gain=2.8;
    if(kind>6.5&&kind<7.5)gain=1.5;
    if(kind>7.5&&kind<8.5)gain=4.;
    if(kind>8.5&&kind<9.5)gain=2.5;
    if(kind>13.5&&kind<15.5)gain=2.;
    if(kind>16.5&&kind<18.5)gain=1.6;
    if(kind>19.5&&kind<20.5||kind>21.5)gain=2.;
    float clock=geometryFamily?uGeometryTime:imageFamily&&kind<22.5?uImageTime:uFlowTime;
    float t=clock*mix(.7,1.05,clamp((tempo-.45)/.65,0.,1.))*gain;
    vec2 q=rot(seed*.23+t*.017)*p; q*=1.+(imageFamily?.13:.11)*sin(t*(imageFamily?.1:.073)+seed); q+=vec2(sin(t*.091+seed),cos(t*.067+seed))*.12;float radius=length(q),angle=atan(q.y,q.x),hit=0.;
    vec3 c=vec3(0.);vec2 uv;
    if(kind<.5){
      vec2 flow=vec2(field(q*2.+t*.22+seed),field(q*2.-t*.17+seed+8.));
      float n=field(q*3.+flow*3.5+vec2(t*.1,-t*.14));
      c=palette(n*1.5+sin(n*12.-t*.3)*.1,pal);c*=.35+.75*smoothstep(.12,.85,n);c+=pow(.5+.5*sin(n*30.+t*.2),12.)*.2;
    }else if(kind<1.5){
      vec2 v=rot(.1*sin(t*.09))*q;float depth=1./max(abs(v.y)+.18,.08);uv=vec2(v.x*depth*.55+t*.018,depth*.28-t*.06);
      vec2 cell=fract(uv*vec2(2.,1.));float edge=smoothstep(.008,.035,min(min(cell.x,1.-cell.x),min(cell.y,1.-cell.y)));
      c=artwork(image,uv,seed,t)*edge*(.6+.4/(1.+depth*.03));c+=palette(depth*.04+t*.02,pal)*(1.-edge)*.35;
    }else if(kind<2.5){
      float segment=TAU/sym;float a=abs(mod(angle+t*.035+segment*.5,segment)-segment*.5);
      uv=vec2(cos(a),sin(a))*radius*(1.4+.12*sin(t*.13))+vec2(.2*sin(t*.04),t*.018);
      vec3 pic=artwork(image,uv+.5,seed,t);float seams=pow(.5+.5*cos(a*sym),24.);
      c=pic*(.72+.35*palette(radius*.6,pal))+seams*palette(radius+t*.02,pal)*.18;
    }else if(kind<3.5){
      float f=sin(q.x*5.+sin(q.y*4.+t*.2))+cos(q.y*6.-t*.16)+sin((q.x+q.y)*3.+seed);
      vec2 normal=normalize(vec2(cos(q.x*5.+sin(q.y*4.+t*.2))*5.,-sin(q.y*6.-t*.16)*6.)+.001);
      vec3 chrome=artwork(image,normal*.3+q*.17+vec2(t*.012,.5),seed,t);
      float light=pow(max(0.,dot(normal,normalize(vec2(.8,.5)))),8.);
      c=chrome*(.25+.6*smoothstep(-1.5,1.5,f))+palette(f*.15,pal)*light*.7;
    }else if(kind<4.5){
      c=vec3(.015,.025,.06);for(int i=0;i<6;i++){float z=float(i);float wave=sin(q.x*(1.4+z*.23)+t*(.12+z*.014)+seed+z)*.23+sin(q.x*3.-t*.1+z)*.08;
      float ribbon=exp(-abs(q.y-wave+(z-2.5)*.085)*(22.+z*3.));c+=palette(z*.15+q.x*.1+t*.009,pal)*ribbon*(.2+.5*field(q*3.+z));}
    }else if(kind<5.5){
      vec2 v=rot(t*.018)*q*(5.+sym*.3);vec2 tile=floor(v);vec2 f=fract(v)-.5;
      float n=sin(length(f+vec2(.17*sin(t*.2),0.))*16.-t*.5+hash(tile+seed)*TAU);
      float ink=smoothstep(-.08,.08,n);c=mix(palette(hash(tile)*.3,pal)*.13,palette(.3+hash(tile)*.35,pal),ink);
    }else if(kind<6.5){
      c=palette(q.y*.15,pal)*.05;for(int i=0;i<4;i++){float z=float(i);vec2 v=rot(.18*sin(t*.07+z)+z*.6)*(q-vec2(sin(z*2.+seed+t*.035),cos(z*3.+t*.025))*.48);
      vec2 size=vec2(.24+z*.025,.32-z*.025);float mask=1.-smoothstep(-.006,.006,max(abs(v.x)-size.x,abs(v.y)-size.y));
      vec2 pu=v/(size*2.)+.5;vec3 pic=artwork(image,pu+vec2(z*.19,t*.008),seed,t);c=mix(c,pic*(.85+.15*palette(z*.2,pal)),mask*.88);}
    }else if(kind<7.5){
      vec2 v=rot(t*.012)*q;float a=angle*(2.+mod(sym,5.))+sin(radius*6.-t*.25)*2.;
      float rings=pow(.5+.5*cos(radius*28.-t*.5+sin(a)),10.);c=palette(radius*.4+t*.012,pal)*rings*.65;
      vec2 grid=v*36.;vec2 cell=floor(grid),f=fract(grid)-.5;float star=pow(max(0.,1.-length(f)*2.5),12.)*step(.985,hash(cell+seed));c+=star*(.6+.3*sin(t*.2+hash(cell)*TAU));
    }else if(kind<8.5){
      float n=field(q*2.+vec2(t*.02,-t*.015)+seed);float lines=pow(.5+.5*cos(n*(32.+sym)),14.);
      vec3 pic=artwork(image,q*.35+vec2(.5,t*.005),seed,t);c=palette(n*1.8,pal)*(.08+lines*.8)+pic*lines*.3;
    }else if(kind<9.5){
      vec2 v=rot(sin(t*.04)*.8)*q;float fold=sin(v.y*5.+sin(v.x*3.+t*.12)*1.8+t*.1);
      uv=vec2(v.x*.7+fold*.22,v.y*.7+t*.014);vec3 pic=artwork(image,uv+.5,seed,t);float silk=.25+.75*pow(abs(cos(v.y*7.+fold+t*.1)),.5);
      c=pic*silk+palette(fold*.3+v.x*.2,pal)*pow(.5+.5*sin(v.y*14.+fold),18.)*.3;
    }
    if(kind>9.5&&kind<10.5){c=texture2D(uLife,p/vec2(uAspect,1.6)+.5).rgb;}
    if(kind>10.5&&kind<11.5){
      vec2 gv=rot(.22*sin(t*.18+seed))*p;gv/=1.45+gv.y*.18;gv=gv*.31+vec2(.5)+vec2(sin(t*.23),cos(t*.19))*.025;gv+=vec2(sin(gv.y*10.+t*.4),cos(gv.x*9.-t*.32))*.035;
      vec2 sample0=texture2D(uGrowth,gv).rg;float h=sample0.y,eps=1./256.;
      float hx=texture2D(uGrowth,gv+vec2(eps,0)).g-texture2D(uGrowth,gv-vec2(eps,0)).g;
      float hy=texture2D(uGrowth,gv+vec2(0,eps)).g-texture2D(uGrowth,gv-vec2(0,eps)).g;
      vec3 normal=normalize(vec3(-hx*9.,-hy*9.,.3));float light=max(0.,dot(normal,normalize(vec3(-.4,.65,.7))));
      vec3 tissue=palette(h*1.7+sample0.x*.25,pal);float rim=pow(1.-max(0.,normal.z),2.);
      c=mix(vec3(.015,.025,.045),tissue,smoothstep(.015,.2,h))*(.32+light*.85)+palette(h*.6+.3,pal)*rim*.3;
    }
    if(kind>11.5&&kind<13.5)c=texture2D(spatialImage,p/vec2(uAspect,1.6)+.5).rgb;
    if(kind>13.5&&kind<14.5){
      vec3 ray=normalize(vec3(q,1.25));float density=0.;c=vec3(.006,.012,.035);
      for(int i=0;i<12;i++){float z=float(i)*.22+t*.055;vec2 pos=ray.xy*(1.+float(i)*.18);pos=rot(z*.6)*pos;float cloud=field(pos*2.2+vec2(z,-z*.7)+seed);float wisps=pow(max(0.,1.-abs(cloud-.5)*2.),5.);vec3 ink=artwork(image,pos*.2+vec2(.5,z*.04),seed,t);c+=mix(palette(cloud+z*.1,pal),ink,.35)*wisps*.115;density+=wisps;}
      c*=1.+hit*.12;
    }
    if(kind>14.5&&kind<15.5){
      vec3 v=vec3(q*2.3,t*.13+seed);float f=dot(sin(v),cos(v.yzx));float ridge=exp(-abs(f)*9.);float inner=exp(-abs(f-.48)*11.);vec2 refract=q*.34+vec2(sin(v.z+v.y),cos(v.z+v.x))*.18;
      c=artwork(image,refract+.5,seed,t)*(.2+ridge*.8)+palette(f*.35+t*.018,pal)*(ridge*.7+inner*.28);
    }
    if(kind>15.5&&kind<16.5){
      vec2 bend=vec2(0.);float shine=0.;for(int i=0;i<5;i++){float k=float(i);vec2 center=vec2(sin(t*(.16+k*.017)+k*2.+seed),cos(t*(.13+k*.021)+k*3.))*.75;vec2 d=q-center;float r=.25+.12*sin(t*.2+k);float lens=exp(-dot(d,d)/(r*r));bend+=d*lens*(1.2+hit*.3);shine+=pow(lens,4.)*.14;}
      c=artwork(image,q*.45+bend+.5,seed,t);c=mix(c,palette(length(bend)*2.+t*.01,pal),.16)+shine;
    }
    if(kind>16.5&&kind<17.5){
      c=vec3(.008,.014,.028);for(int i=0;i<9;i++){float k=float(i);float wave=sin(q.x*(1.4+k*.16)+t*(.3+k*.025)+seed+k)*(.35+k*.025)+sin(q.x*3.2-t*.23+k)*.12;float d=abs(q.y-wave+(k-4.)*.055);float ribbon=exp(-d*(18.+k*2.));vec3 ink=artwork(image,vec2(q.x*.3+.5,wave*.5+.5),seed,t);c+=mix(palette(k*.12+q.x*.2+t*.02,pal),ink,.42)*ribbon*.42;}
    }
    if(kind>17.5&&kind<18.5){
      vec2 grid=q*(3.+mod(sym,4.));vec2 cell=floor(grid),f=fract(grid);float nearest=10.,second=10.;vec2 chosen=cell;
      for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(float(i),float(j));vec2 id=cell+g;vec2 center=.5+.38*sin(vec2(hash(id+seed),hash(id+seed+13.))*TAU+t*.27);float d=length(g+center-f);if(d<nearest){second=nearest;nearest=d;chosen=id;}else second=min(second,d);}
      float edge=exp(-(second-nearest)*18.);vec2 lens=q*.3+(f-.5)*(.3+nearest*.2);c=artwork(image,lens+.5,seed,t)*(.35+.65*(1.-nearest));c+=palette(hash(chosen+seed)+t*.015,pal)*edge*.65;
    }
    if(kind>18.5&&kind<19.5){
      float depth=-log(max(radius,.025));float twist=.14*sin(t*.09+depth);uv=vec2(angle/TAU+twist+t*.025,depth*.4-t*.065);vec3 ink=artwork(image,uv,seed,t);float frame=pow(.5+.5*cos(depth*(7.+mod(sym,5.))-t*.6),14.);c=ink*(.45+.55*frame)+palette(depth*.13+t*.015,pal)*frame*.2;c*=smoothstep(.015,.1,radius);
    }
    if(kind>19.5&&kind<20.5){
      c=vec3(.012,.018,.035);vec2 v=q;
      for(int i=0;i<14;i++){float k=float(i),phase=k*.43+seed;float path=.47*sin(v.x*(1.4+k*.07)+t*.18+phase)+.14*sin(v.x*4.-t*.11+k);float d=abs(v.y-path+(k-6.5)*.063);float ink=exp(-d*(24.+k*2.));c+=palette(k*.075+v.x*.08,pal)*ink*.32;}
    }
    if(kind>20.5&&kind<21.5){
      c=vec3(.009,.013,.028);for(int i=0;i<11;i++){float k=float(i);vec2 center=vec2(sin(t*.34+k*.8+seed),cos(t*.29+k*.9))*.43;vec2 v=rot(t*.25+k*.48)*(q-center);float tilt=.3+.6*(.5+.5*sin(t*.23+k));float d=abs(length(v*vec2(1.,1./tilt))-(.16+k*.037));float ring=exp(-d*75.);float shadow=exp(-d*18.);c+=palette(k*.11+t*.007,pal)*(ring*.7+shadow*.05);}
    }
    if(kind>21.5&&kind<22.5){
      float a=sin(length(q-vec2(.3*sin(t*.12),.25*cos(t*.09)))*9.-t*.17);float b=cos(dot(q,vec2(cos(t*.06),sin(t*.06)))*8.+sin(q.y*3.+t*.11));float weave=pow(.5+.5*sin((a+b)*3.),3.);c=palette(a*.12+b*.2+t*.006,pal)*(.12+.66*weave);c+=palette(b*.2+.4,pal)*pow(max(0.,1.-abs(a-b)),5.)*.18;
    }
    if(kind>22.5&&kind<23.5){
      vec2 v=q*3.2;vec2 cell=floor(v),f=fract(v)-.5;float seed2=hash(cell+seed);vec2 bend=vec2(sin(t*.12+seed2*6.),cos(t*.1+seed2*5.))*.14;vec2 uv=(cell+rot(.3*sin(t*.08+seed2*6.))*f+bend)/3.2+.5;float border=smoothstep(.44,.49,max(abs(f.x),abs(f.y)));vec3 pic=artwork(image,uv,seed,t);c=pic*(.65+.35*sin(seed2*6.+t*.07)*sin(seed2*6.+t*.07));c=mix(c,palette(seed2+t*.01,pal)*.3,border);
    }
    if(kind>23.5){
      c=vec3(.007,.012,.025);float form=kind-24.;
      for(int i=0;i<48;i++){
        float k=float(i),a=k*TAU/48.,phase=t*.36+seed;vec3 v;
        if(form<.5){float r=.46+.17*cos(3.*a+phase*.6);v=vec3(r*cos(2.*a),r*sin(2.*a),.34*sin(3.*a+phase*.6));}
        else if(form<1.5){float lane=mod(k,2.)*3.14159;float h=floor(k/2.)/23.;v=vec3(.42*cos(h*TAU*2.+phase+lane),(h-.5)*1.55,.42*sin(h*TAU*2.+phase+lane));}
        else if(form<2.5){vec2 grid=vec2(mod(k,8.),floor(k/8.));v=vec3((grid.x-3.5)*.2,.3*sin(grid.x*.8+grid.y*.7+phase),(grid.y-2.5)*.24);}
        else if(form<3.5){float r=.4+.25*sin(k*2.7+phase*.5);v=vec3(cos(k*2.4+phase*.25)*r,sin(k*1.3+phase*.4)*r,sin(k*3.1-phase*.2)*r);}
        else if(form<4.5){float orbit=floor(k/12.)+1.;v=vec3(cos(a*4.+phase/orbit)*orbit*.18,sin(a*4.+phase/orbit)*orbit*.18,sin(a*8.+phase)*.25);}
        else{v=vec3(cos(k*.48+phase*.45)*.46,(k/47.-.5)*1.6,sin(k*.48+phase*.45)*.46);}
        v.xz=rot(phase*.28)*v.xz;v.yz=rot(.4*sin(phase*.21))*v.yz;
        float depth=2.3+v.z;vec2 center=v.xy*1.85/depth;float size=(form>4.5?.062:.045+.013*sin(k+phase*.3))*1.85/depth;
        vec2 d=(q-center)/size;float d2=dot(d,d);if(form>2.5&&form<3.5)d2=pow(abs(d.x)+abs(d.y)*.75,2.);if(form>4.5){d.x*=.6;d.y*=1.8;d2=pow(max(abs(d.x),abs(d.y)),2.);}float sphere=sqrt(max(0.,1.-d2));float light=max(0.,dot(normalize(vec3(d,sphere)),normalize(vec3(-.4,.7,1.))));
        float mask=1.-smoothstep(.82,1.,d2);vec3 ink=palette(k*.037+seed*.01+v.z*.15,pal)*(.18+.7*light)+pow(light,18.)*.6;
        c=mix(c,ink,mask*.88);
      }
    }
    c*=.96;float vignette=1.-smoothstep(.35,1.7,length(p));return max(c,0.)*(.78+.22*vignette);
  }
  float maskField(float style,vec2 p,vec2 flow,vec3 a,float seed,float t){
    float pattern=.5;
    if(style<.5)pattern=field(p*2.4+flow*2.+seed+t*.035);
    else if(style<1.5)pattern=.5+.5*sin(length(p+flow*.2)*(5.+uCompose.z*5.)-t*.22);
    else if(style<2.5)pattern=.5+.5*sin(p.x*3.7+p.y*2.1+flow.x*7.+t*.18);
    else if(style<3.5)pattern=clamp(dot(a,vec3(.2126,.7152,.0722))*.85+field(p*3.+t*.03)*.3,0.,1.);
    else if(style<4.5){vec2 v=rot(t*.07+seed)*p;pattern=.5+.5*sin(v.x*8.+sin(v.y*5.+t*.14)*2.);}
    else if(style<5.5){float portal=length(p-vec2(sin(t*.13),cos(t*.11))*.42);pattern=clamp(portal*.6+flow.x*.35,0.,1.);}
    else if(style<6.5)pattern=.5+.5*sin(atan(p.y,p.x)*3.+length(p)*5.-t*.24+flow.x);
    else if(style<7.5)pattern=.5+.5*sin(p.y*9.+sin(p.x*4.+t*.21)*2.-t*.3);
    else if(style<8.5){vec2 cell=p*4.+vec2(t*.09,-t*.07);pattern=.5+.5*cos(length(fract(cell)-.5)*7.+t*.14);}
    else pattern=clamp(field(p*3.+flow+seed)*.55+dot(a,vec3(.2126,.7152,.0722))*.45,0.,1.);
    return pattern;
  }
  void main(){
    vec2 p=(vUv-.5)*vec2(uAspect,1.6);float t=uTime;float seed=uLookA.y;
    vec2 flow=vec2(field(p*1.8+vec2(t*.065,seed)),field(p*1.8+vec2(seed,-t*.055)))-.5;
    float warp=uCompose.y*.85;
    vec3 a=paint(p+flow*warp*uMix,uLookA,uPaletteA,uA,uSpatialA);
    vec3 b=paint(p-flow*warp*(1.-uMix),uLookB,uPaletteB,uB,uSpatialB);
    float pattern=mix(maskField(uMaskFrom,p,flow,a,seed,t),maskField(uCompose.x,p,flow,a,seed,t),smoothstep(0.,1.,uMaskBlend));
    float m=smoothstep(pattern-.12,pattern+.12,mix(-.25,1.25,smoothstep(0.,1.,uMix)));
    vec3 c=mix(a,b,m);
    // Second source also supplies local pigment/refraction, rather than a black fade.
    float interaction=sin(3.14159265*uMix)*uCompose.w;
    vec3 weave=a*(.55+b*.9);c=mix(c,weave,interaction*.32);
    vec2 imageUV=p*.27+.5+flow*.18+vec2(t*.008,-t*.006);
    vec3 artA=picture(uA,imageUV),artB=picture(uB,imageUV-flow*.2);
    float reveal=field(p*1.5+flow*2.+vec2(t*.035,seed));
    float artMask=smoothstep(.36,.72,reveal)*uArtwork;
    vec3 art=mix(artA,artB,m);c=mix(c,c*.55+art*.75,artMask);
    c=c/(1.+max(c-vec3(1.),0.));gl_FragColor=vec4(c,uAlpha);
  }`;
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:fragment,transparent:true,depthTest:false,depthWrite:false});
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);quad.frustumCulled=false;const scene2=new THREE.Scene();scene2.add(quad);const camera2=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const projectedTarget=new THREE.WebGLRenderTarget(1280,720,{depthBuffer:false,stencilBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
  const projectedUniforms=Object.assign({tIn:{value:projectedTarget.texture},uAlpha:{value:0}},projection.u);
  const projectedMaterial=new THREE.ShaderMaterial({uniforms:projectedUniforms,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'precision highp float;varying vec2 vUv;uniform sampler2D tIn;uniform float uAlpha;'+projection.glsl+'void main(){gl_FragColor=clubLight(texture2D(tIn,vUv).rgb,vUv,uAlpha);}',transparent:true,depthTest:false,depthWrite:false});
  const projectedGeometry=new THREE.PlaneGeometry(2,2),projectedQuad=new THREE.Mesh(projectedGeometry,projectedMaterial),projectedScene=new THREE.Scene();projectedQuad.frustumCulled=false;projectedScene.add(projectedQuad);projection.attach(projectedTarget.texture);
  let current=null,pending=null,mix=0,elapsed=0,alpha=0,frameCount=0,frameMs=0,failures=0,enabled=true,force=null;
  const history=[],removed=[];let testSeconds=0,pendingAge=0,transitionLength=4,transitioning=false;
  let maskFrom=0;let compositionAge=0,compositionHold=rand(14,33),compositionChanges=0;
  let composition={style:Math.floor(rand(0,10)),warp:rand(.08,.25),scale:Math.random(),weave:0,art:rand(.12,.22)};
  let targetComposition={...composition};const compositionHistory=[];
  function look(family){
    const selected=family===undefined?nextFamily():family;
    return memory.choose(()=>{const palette=nextPalette();return {family:selected,image:nextArt(),seed:rand(0,400),sym:pick([3,4,5,6,7,8,10,12]),speed:rand(.45,1.1),paletteId:palette,palette:[palette/9,rand(-.15,.15),rand(-.1,.1)],recipe:Math.floor(rand(0,64)),duration:rand(22,40),artAccent:Math.random()<.3,coverage:pick([.22,.35,.48,.72,.9]),texture:fallback};});
  }
  function assign(which,l){uniforms['u'+which].value=l.texture;uniforms['uLook'+which].value.set(l.family,l.seed,l.sym,l.speed);uniforms['uPalette'+which].value.set(...l.palette);}
  function prune(){const keep=new Set([current&&current.image,pending&&pending.image]);const old=[...cache.entries()].filter(([i])=>!keep.has(i)).sort((a,b)=>a[1].used-b[1].used);while(cache.size>6&&old.length){const [i,x]=old.shift();if(x.texture)x.texture.dispose();cache.delete(i);}}
  async function prepare(family){if(pending)return;let candidate=look(family);if(candidate.family===current.family&&family===undefined)candidate=look(nextFamily());pending=candidate;pendingAge=0;candidate.texture=await art(candidate.image);if(pending===candidate)candidate.ready=true;}
  function record(){memory.remember(current);history.push({family:names[current.family],image:files[current.image],seed:+current.seed.toFixed(2)});if(history.length>40)history.shift();prune();}
  current=look();assign('A',current);const first=current;art(first.image).then(t=>{first.texture=t;if(current===first)assign('A',current);});record();
  // The original VJ update/render hooks remain active, including all five effects and LED looks.
  let episodes=0;
  const director=new window.ClubMusicDirector();
  director.history=memory.directions.slice(-3);
  let direction={legacy:0,atlas:0};
  const previousVisual=window.clubVisual;
  function update(dt,now){
    if(!enabled)return;lastDt=dt;const active=S.visual&&S.visual!=='uit';const sh=window.doolhof&&doolhof.show||{};frameMs+=(dt*1000-frameMs)*.03;frameCount++;
    if(!active){projection.strength(0);alpha*=Math.exp(-dt*2);uniforms.uAlpha.value=alpha;return;}elapsed+=dt*(.65+.35*(window.clubMusicMood?clubMusicMood.drive:1));
    if((elapsed>4||testSeconds>0)&&!pending)prepare();
    if(pending&&pending.ready)pendingAge+=dt;
    const beat=typeof beatPos==='number'?beatPos:now*2;const boundary=Math.floor(beat)%8===0;
    if(pending&&pending.ready){
      assign('B',pending);
      const changing=elapsed>=current.duration&&(boundary||elapsed>current.duration+4)||force!==null||testSeconds>0&&elapsed>=testSeconds;
      if(changing)transitioning=true;
      if(transitioning){
        mix+=dt/(testSeconds>0?1.5:transitionLength);
        if(mix>=1){current=pending;pending=null;mix=0;elapsed=0;pendingAge=0;force=null;transitioning=false;transitionLength=rand(3,5);assign('A',current);assign('B',current);record();}
      }else mix=0;
    }else {mix=0;assign('B',current);}
    compositionAge+=dt*(window.clubMusicMood?clubMusicMood.motion:1);
    if(compositionAge>compositionHold){
      let style;do{style=Math.floor(rand(0,10));}while(style===targetComposition.style);
      maskFrom=composition.style;
      targetComposition={style,warp:rand(.08,.28),scale:Math.random(),weave:0,art:rand(.1,.24)};
      compositionAge=0;compositionHold=rand(14,38);compositionChanges++;
      compositionHistory.push(style);if(compositionHistory.length>24)compositionHistory.shift();
    }
    // Change masks at a weak secondary layer; all continuous controls drift gently.
    composition.style=targetComposition.style;
    uniforms.uMaskFrom.value=maskFrom;uniforms.uMaskBlend.value=Math.min(1,compositionAge/8);
    const ease=1-Math.exp(-dt/6);
    for(const key of ['warp','scale','weave','art'])composition[key]+=(targetComposition[key]-composition[key])*ease;
    uniforms.uCompose.value.set(composition.style,composition.warp,composition.scale,composition.weave);
    const accentPhase=(elapsed-9)/4;
    const accent=current.artAccent&&accentPhase>0&&accentPhase<1&&!transitioning?Math.sin(accentPhase*Math.PI)**2:0;
    uniforms.uArtwork.value=composition.art*accent;
    uniforms.uFlowTime.value=window.clubMusicMood?clubMusicMood.flowClock||clubMusicMood.clock:now;uniforms.uGeometryTime.value=window.clubMusicMood?clubMusicMood.geometryClock||clubMusicMood.clock:now;uniforms.uImageIntensity.value=window.clubMusicMood?Math.max(0,Math.min(1,(clubMusicMood.imageEnergy-.25)/.75)):1;uniforms.uImageTime.value=window.clubMusicMood?clubMusicMood.imageClock||clubMusicMood.clock:now;uniforms.uTime.value=window.clubMusicMood?clubMusicMood.clock:now;uniforms.uBeat.value=window.clubMusicMood?clubMusicMood.clock*2:beat;uniforms.uBass.value=typeof pulse==='number'?pulse:0;uniforms.uEnergy.value=typeof energy==='number'?energy:.5;
    uniforms.uMix.value=mix;uniforms.uAspect.value=innerWidth/Math.max(1,innerHeight);
    let wanted=0;
    if(active){const phase=elapsed/current.duration;const breathe=.5-.5*Math.cos(Math.PI*2*Math.min(1,phase));wanted=S.visual==='vol'?1:S.visual==='auto'?current.coverage*(.35+.65*breathe):S.visual==='golf'?.15+.7*breathe:.22+.28*(sh.drop||0);if(S.visual==='flits')wanted=.2+.35*Math.min(1,uniforms.uBass.value);if(sh.stand==='break')wanted*=.8;}
    direction=director.tick(dt,beat,window.clubMusicMood?clubMusicMood.drive:(typeof energy==='number'?energy:.5),window.clubMusicMood&&clubMusicMood.quiet?'break':sh.stand||'groove');
    episodes=director.changes;
    if(episodes>lastDirection){memory.direction(director.history[director.history.length-1]);lastDirection=episodes;}
    if (!testSeconds && force===null && S.visual==='auto') wanted=current.recipe%8>=4&&Number.isFinite(direction.full)?direction.full:direction.atlas;
    if(testSeconds>0&&S.visual==='auto')wanted=1;
    const mood=window.clubMusicMood;
    projection.presentation(current.recipe%8,dt,Math.floor(current.recipe/8));
    if(mood){
      uniforms.uBass.value=mood.bassEnvelope*mood.drive;uniforms.uEnergy.value*=mood.drive;
      if(S.visual==='auto'&&current.recipe%8<4)wanted=Math.min(wanted,imageFamilies.has(current.family)?.64+.3*mood.imageEnergy:mood.phase==='opbouw'?.65+.2*mood.build:mood.quiet?.64:.78+.16*mood.drive);
      if(!mood.flashAllowed&&typeof strobeLight!=='undefined'){strobeLight.intensity=0;if(typeof strobeMat!=='undefined')strobeMat.color.setScalar(0);if(typeof strobeUntil!=='undefined')strobeUntil=0;}
      if(window.doolhof&&doolhof.effect&&doolhof.effect.U){const u=doolhof.effect.U;
        const oldLook=window.clubVisual&&clubVisual.info().nu;const fluid=oldLook&&['vloeistof','warp'].includes(oldLook.fx);u.uT.value=mood.flowClock;u.uTel.value=mood.clock*2;u.uReis.value=mood.geometryClock*.7;
        if(!mood.flashAllowed)u.uFlits.value=0;u.uPuls.value=0;u.uBas.value=0;u.uEn.value=mood.imageEnergy;
      }
    }
    alpha+=(wanted-alpha)*(1.-Math.exp(-dt*4));uniforms.uAlpha.value=alpha;projection.strength(S.visual==='auto'?alpha*(.8+.2*(mood?mood.imageEnergy:1)):0);
    const debug=document.getElementById('vj-diagnostics');if(debug&&frameCount%15===0)debug.textContent=JSON.stringify(api.info(),null,2);
  }
  // Preserve the entire original render hook, including every existing style and control.
  const legacyIndex=naTekenHooks.findIndex(h=>Function.prototype.toString.call(h).includes('const fm = fxMat(nu.fx)'));
  const legacyRender=legacyIndex>=0?naTekenHooks[legacyIndex]:null;
  function directedLegacy(){
    if(S.visual!=='auto'||testSeconds>0){projection.resetLegacy();return legacyRender();}
    const renderBefore=renderer.render;
    renderer.render=function(s,c){
      const quad=s&&s.children&&s.children.find(x=>x.material&&x.material.uniforms&&x.material.uniforms.tIn&&x.material.uniforms.uAlpha);
      const u=quad&&quad.material.uniforms.uAlpha,old=u&&u.value;
      if(quad)projection.patch(quad.material,true);
      const mood=window.clubMusicMood,changed=[];
      const uniforms=s&&s.children&&s.children[0]&&s.children[0].material&&s.children[0].material.uniforms;
      function set(k,v){if(uniforms&&uniforms[k]){changed.push([uniforms[k],uniforms[k].value]);uniforms[k].value=v;}}
      if(mood&&uniforms){
        set('uFlits',0);set('uInvert',0);set('uBas',0);set('uPuls',0);set('uDrop',0);set('uStand',0);set('uEn',mood.imageEnergy);
        if(uniforms.tFx){
          const oldLook=window.clubVisual&&clubVisual.info().nu;set('uT',mood.flowClock);set('uPuls',0);
          set('uFrot',(uniforms.uFrot?uniforms.uFrot.value:0)*mood.motion);
          set('uFzoom',1+((uniforms.uFzoom?uniforms.uFzoom.value:1)-1)*mood.motion);
          set('uWarp',(uniforms.uWarp?uniforms.uWarp.value:0)*(.2+.8*mood.drive));
          set('uChroma',(uniforms.uChroma?uniforms.uChroma.value:0)*mood.drive);
          set('uKalRot',(uniforms.uKalRot?uniforms.uKalRot.value:0)*0+(mood.imageClock||mood.clock)*.08);
        }
      }
      if(u)u.value=(current.recipe%8>=4?1:(.4+.35*(mood?mood.imageEnergy:.7)))*direction.legacy;
      try{return renderBefore.call(this,s,c);}finally{for(const [uniform,value] of changed)uniform.value=value;if(u)u.value=old;}
    };
    try{return legacyRender();}finally{renderer.render=renderBefore;}
  }
  if(legacyRender)naTekenHooks[legacyIndex]=directedLegacy;
  function render(){
    if(!enabled||alpha<.003)return;
    const target=renderer.getRenderTarget(),clear=renderer.autoClear,color=renderer.getClearColor(new THREE.Color()).clone(),clearAlpha=renderer.getClearAlpha();
    try{
      const families=[current.family,pending&&pending.family];
      life.update(lastDt*(window.clubMusicMood?clubMusicMood.geometryMotion:1),uniforms.uGeometryTime.value,uniforms.uEnergy.value,uniforms.uBass.value,families.includes(10),families.includes(11),current.recipe,current.palette);uniforms.uGrowth.value=life.growth;
      spatial.update(lastDt*(window.clubMusicMood?clubMusicMood.geometryMotion:1),uniforms.uGeometryTime.value,uniforms.uBass.value,current,pending,uniforms.uImageTime.value,lastDt*(window.clubMusicMood?clubMusicMood.imageMotion:1));uniforms.uSpatialA.value=spatial.texture(0);uniforms.uSpatialB.value=spatial.texture(1);
      uniforms.uAlpha.value=1;renderer.setRenderTarget(projectedTarget);renderer.setClearColor(0,0);renderer.autoClear=true;renderer.render(scene2,camera2);uniforms.uAlpha.value=alpha;
      projection.bind(S.visual!=='vol');projection.blend(projectedMaterial,S.visual!=='vol');projectedUniforms.uAlpha.value=alpha;
      renderer.setRenderTarget(target);renderer.autoClear=false;renderer.render(projectedScene,camera2);
    }catch(e){failures++;if(failures>2)api.restore();console.error('VJ club projection',e);}
    finally{uniforms.uAlpha.value=alpha;renderer.setClearColor(color,clearAlpha);renderer.setRenderTarget(target);renderer.autoClear=clear;}
  }
  const api=window.clubVisualNext={version:'atlas-26',info:()=>({version:'atlas-26',projection:projection.info(),music:window.clubMusicMood&&clubMusicMood.info(),composition:{layers:transitioning?2:1,mask:composition.style,changes:compositionChanges,history:compositionHistory.slice(-8),warp:+composition.warp.toFixed(3),artwork:+uniforms.uArtwork.value.toFixed(3),secondary:pending&&names[pending.family],mix:+mix.toFixed(3)},enabled,familyCount:names.length,familiesSeen:[...new Set(history.map(x=>x.family))],living:life.info(),spatial:spatial.info(),memory:memory.info(),visualMode:S.visual,direction:director.info(),legacyPreserved:window.clubVisual===previousVisual,episodes,originalOnly:alpha<.003,family:names[current.family],familyIndex:current.family,recipe:current.recipe,art:files[current.image],artworkSources:files.length,artworkInterpretation:Math.floor(current.seed)%8,artworkInterpretations:8,transitionPatterns:10,loadedTextures:loads,cachedTextures:cache.size,history:history.slice(-12),alpha:+alpha.toFixed(3),averageFrameMs:+frameMs.toFixed(1),frames:frameCount,errors:failures,transition:transitioning}),probe:()=>({living:life.probe(),spatial:spatial.probe()}),frameProbe(){const data=new Uint8Array(1280*720*4),rgb=[];renderer.readRenderTargetPixels(projectedTarget,0,0,1280,720,data);for(let y=0;y<90;y++)for(let x=0;x<160;x++){const k=((y*8+4)*1280+x*8+4)*4;rgb.push(data[k],data[k+1],data[k+2]);}return {width:160,height:90,rgb};},next(family,presentationKind){force=family===undefined?nextFamily():family;if(pending)pending=null;prepare(force);if(Number.isInteger(presentationKind)&&presentationKind>=0&&presentationKind<8){pending.recipe=Math.floor(pending.recipe/8)*8+presentationKind;director.mode='atlas';director.age=0;director.hold=35;director.intensity=1;}},test(seconds){testSeconds=seconds;current.duration=seconds;},restore(){enabled=false;if(legacyRender){const i=naTekenHooks.indexOf(directedLegacy);if(i>=0)naTekenHooks[i]=legacyRender;}clubHooks.splice(clubHooks.indexOf(update),1);naTekenHooks.splice(naTekenHooks.indexOf(render),1);for(const x of removed.slice().reverse())x.list.splice(Math.min(x.index,x.list.length),0,x.hook);window.clubVisual=previousVisual;projection.dispose();projectedTarget.dispose();projectedMaterial.dispose();projectedGeometry.dispose();spatial.dispose();life.dispose();material.dispose();quad.geometry.dispose();for(const x of cache.values())if(x.texture)x.texture.dispose();fallback.dispose();},setEnabled(on){enabled=!!on;}};
  // Keep window.clubVisual and all its existing controls unchanged.
  clubHooks.push(update);naTekenHooks.push(render);
})();


