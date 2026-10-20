// Shorter visible holds for spatial episodes; existing transitions remain intact.
(function(root){
 root.ClubSpatialTiming=function(read,next,random=Math.random){
  const spatial=new Set([6,10,12,13,21,24,25,26,27,28,29]);
  let key='',age=0,limit=20,requested=false,changes=0;
  return {tick(dt){const i=read();if(!i)return;
   const k=[i.familyIndex,i.recipe,i.art].join(':');
   if(k!==key){key=k;age=0;limit=i.familyIndex===6?12+random()*4:18+random()*6;requested=false;}
   if(!spatial.has(i.familyIndex)||!i.enabled||i.alpha<.1||i.transition)return;
   age+=Math.max(0,Math.min(1,dt));
   if(age>=limit&&!requested){requested=true;changes++;next();}
  },info:()=>({visibleSeconds:+age.toFixed(1),limitSeconds:+limit.toFixed(1),requested,changes})};
 };
 if(typeof clubHooks==='undefined'||root.clubSpatialTiming)return;
 const timer=root.ClubSpatialTiming(()=>root.clubVisualNext&&root.clubVisualNext.info(),()=>root.clubVisualNext.next());
 let elapsed=0;
 function tick(dt){elapsed+=Math.max(0,Math.min(.1,dt));if(elapsed>=.5){const step=elapsed;elapsed=0;timer.tick(step);}}
 root.clubSpatialTiming={info:timer.info,restore(){const i=clubHooks.indexOf(tick);if(i>=0)clubHooks.splice(i,1);delete root.clubSpatialTiming;}};
 clubHooks.push(tick);
})(window);
