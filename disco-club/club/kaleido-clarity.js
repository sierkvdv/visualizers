// Bound dense kaleidoscopes without removing them or changing unrelated looks.
(function(root){
 root.ClubKaleidoLimits=function(trail,oil,hue){return {trail:Math.min(trail,.72),oil:Math.min(oil,.004),hue:Math.max(-.004,Math.min(.004,hue))};};
 if(typeof renderer==='undefined'||root.clubKaleidoClarity)return;
 const base=renderer.render,state=new WeakMap(),mipmapped=new WeakSet();let seen=-1e9,info=null,legacy=null,draws=0,denseAge=0,lastTick=performance.now(),cooldown=0,escapes=0;
 function render(scene,camera){
  const now=performance.now(),dt=Math.max(0,Math.min(.1,(now-lastTick)/1000));lastTick=now;
  if(now-seen>500){info=root.clubVisualNext&&root.clubVisualNext.info();legacy=root.clubVisual&&root.clubVisual.info();seen=now;}
  cooldown=Math.max(0,cooldown-dt);
  const dense=info&&info.direction&&info.direction.legacy>.65&&legacy&&legacy.nu&&legacy.nu.kal>=6;
  denseAge=dense?denseAge+dt:0;
  if(denseAge>18&&cooldown<=0&&root.clubVisualNext){denseAge=0;cooldown=24;escapes++;root.clubVisualNext.next(undefined,Math.floor(Math.random()*4));}
  const changed=[];function set(u,k,v){if(u[k]){changed.push([u[k],u[k].value]);u[k].value=v;}}
  for(const mesh of scene&&scene.children||[]){const mat=mesh.material,u=mat&&mat.uniforms;if(!u)continue;
   if(u.uTrail&&u.tPrev&&u.uKal&&u.uKal.value>=4){
    const limits=root.ClubKaleidoLimits(u.uTrail.value,u.uOil.value,u.uHue.value);
    let st=state.get(mat);if(!st){st={at:now,time:u.uT.value,rotation:u.uKalRot.value};state.set(mat,st);}
    const step=Math.max(0,Math.min(.1,(now-st.at)/1000));st.at=now;const mood=root.clubMusicMood;
    st.time+=step*(mood?mood.flowMotion||.4:.5)*.55;st.rotation+=step*(mood?mood.imageMotion||.28:.4)*.045;
    set(u,'uTrail',limits.trail);set(u,'uOil',limits.oil);set(u,'uHue',limits.hue);set(u,'uT',st.time);set(u,'uKalRot',st.rotation);draws++;
   }else if(u.uTrail&&u.uKal){state.delete(mat);}
   if(u.uLookA&&u.uLookB){for(const which of ['A','B']){const look=u['uLook'+which].value;if(Math.round(look.x)!==2)continue;
    const before=look.clone();changed.push([{set value(v){look.copy(v)}},before]);look.z=Math.min(look.z,8);look.w=Math.min(look.w,.65);
    const tex=u['u'+which].value,img=tex&&tex.image;if(tex&&img&&!mipmapped.has(tex)&&THREE.MathUtils.isPowerOfTwo(img.width)&&THREE.MathUtils.isPowerOfTwo(img.height)){tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());tex.needsUpdate=true;mipmapped.add(tex);}
   }}
  }
  try{return base.call(this,scene,camera);}finally{for(let i=changed.length-1;i>=0;i--)changed[i][0].value=changed[i][1];}
 }
 renderer.render=render;
 root.clubKaleidoClarity={info:()=>({draws,denseSeconds:+denseAge.toFixed(1),escapes,trailMax:.72,oilMax:.004,hueMax:.004}),restore(){if(renderer.render===render)renderer.render=base;delete root.clubKaleidoClarity;}};
})(window);
