// Slow picture deformation independently of geometry, and bound recursive image feedback.
(function(root){
 if(typeof renderer==='undefined'||root.clubImageMotionSafety)return;
 const base=renderer.render,states=new WeakMap();let pictureDraws=0,feedbackDraws=0,enabled=true;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 function render(scene,camera){
  const changed=[],now=performance.now();
  function set(u,k,v){if(u[k]){changed.push([u[k],u[k].value]);u[k].value=v;}}
  for(const mesh of scene&&scene.children||[]){const mat=mesh.material,u=mat&&mat.uniforms;if(!u||!enabled)continue;
   if(u.uImageTime&&u.uLookA&&u.uLookB){
    let state=states.get(mat);if(!state){state={at:now,time:u.uImageTime.value};states.set(mat,state);}
    const dt=clamp((now-state.at)/1000,0,.1);state.at=now;
    const mood=root.clubMusicMood;state.time+=dt*clamp(mood?mood.imageMotion:.4,.08,.65)*.4;
    set(u,'uImageTime',state.time);
    // Lens pictures were assigned the geometry clock; isolate that case without slowing other 3D forms.
    const a=Math.round(u.uLookA.value.x),b=Math.round(u.uLookB.value.x);
    const geometry=k=>k>=24||(k>=10&&k<=13)||k===15||k===17||k===18||k===21;
    if((a===16||b===16)&&!geometry(a)&&!geometry(b))set(u,'uGeometryTime',state.time);
    pictureDraws++;
   }
   if(u.tPrev&&u.uFzoom&&u.uFrot&&u.uKal&&u.uKal.value>=4){
    let state=states.get(mat);if(!state){state={at:now};states.set(mat,state);}
    const dt=clamp((now-state.at)/1000,1/240,1/20);state.at=now;
    // These transforms recur every frame: cap their per-second speed, including bass zoom pulses.
    set(u,'uFzoom',Math.exp(clamp(Math.log(Math.max(.01,u.uFzoom.value)),-.001,.001)*dt*60));
    set(u,'uFrot',clamp(u.uFrot.value,-.0012,.0012)*dt*60);
    set(u,'uTrail',Math.min(u.uTrail.value,.62));set(u,'uOil',Math.min(u.uOil.value,.0015));
    set(u,'uChroma',Math.min(u.uChroma.value,.002));feedbackDraws++;
   }
  }
  try{return base.call(this,scene,camera);}finally{for(let i=changed.length-1;i>=0;i--)changed[i][0].value=changed[i][1];}
 }
 renderer.render=render;
 root.clubImageMotionSafety={setEnabled(v){enabled=!!v;},info:()=>({enabled,pictureDraws,feedbackDraws,pictureClockFactor:.4,maxPictureClockRate:.26,maxFeedbackZoomPerSecond:Math.exp(.06),maxFeedbackRotationPerSecond:.072,trailMax:.62})};
})(window);
