// Give the original evolving psychedelic renderer the lead; keep every added family.
(function(root){
 if(!root.ClubMusicDirector||root.clubPsychedelicBalance)return;
 const proto=root.ClubMusicDirector.prototype,previous=proto.tick,instances=new WeakSet();
 proto.tick=function(dt,beat,energy,stand='groove'){
  if(!instances.has(this)){instances.add(this);this.mode='blend';this.age=0;this.hold=22;this.fade=1.3;}
  dt=Math.max(0,Math.min(.25,dt));energy=Math.max(0,Math.min(1,Number.isFinite(energy)?energy:.5));
  this.energy+=(energy-this.energy)*(1-Math.exp(-dt/2));this.slow+=(energy-this.slow)*(1-Math.exp(-dt/18));this.age+=dt;
  const phrase=Math.floor(beat/8),boundary=phrase!==this.lastBeat,event=stand!==this.lastStand;
  this.lastBeat=phrase;
  const rising=this.energy-this.slow>.065,musical=event&&(stand==='drop'||stand==='break')||rising&&boundary;
  if(this.age>8&&((musical&&this.age>this.hold*.65&&this.random()<.32)||((boundary||this.age>this.hold+3)&&this.age>=this.hold))){
   const weights={club:stand==='break'?.35:.15,blend:4.8,legacy:5.8,atlas:1.2,duet:2.5};
   if(this.energy<.25)weights.duet*=.7;
   for(const entry of this.history.slice(-3))weights[entry.mode]*=entry.mode==='legacy'?.7:entry.mode==='blend'?.55:.45;
   weights[this.mode]*=this.mode==='legacy'?.3:0;
   let n=this.random()*Object.values(weights).reduce((a,b)=>a+b,0),next='legacy';
   for(const [mode,weight] of Object.entries(weights)){n-=weight;if(n<=0){next=mode;break;}}
   this.mode=next;this.age=0;
   const ranges={club:[6,9],blend:[18,30],legacy:[28,46],atlas:[12,22],duet:[14,24]},range=ranges[next];
   this.hold=range[0]+Math.pow(this.random(),.8)*(range[1]-range[0]);
   this.fade=[.8,1.05,1.3][Math.floor(this.random()*3)];this.intensity=1;
   this.reason=musical?'muzikale verandering':'psychedelische basis en verweven accenten';this.changes++;
   this.history.push({mode:next,hold:+this.hold.toFixed(1),reason:this.reason});if(this.history.length>30)this.history.shift();
  }
  this.lastStand=stand;
  // Mixed passages retain a strong original layer; mapped additions reveal parts of it.
  const targets={club:[.12,.1,0],blend:[1,.5,.38],legacy:[1,0,0],atlas:[.15,1,1],duet:[.9,.72,.58]},v=targets[this.mode];
  const scale=this.intensity||1,k=1-Math.exp(-dt/(this.fade||1));
  this.exposure.legacy+=(v[0]*scale-this.exposure.legacy)*k;
  this.exposure.atlas+=(v[1]*scale-this.exposure.atlas)*k;
  this.exposure.full+=(v[2]-this.exposure.full)*k;
  return this.exposure;
 };
 root.clubPsychedelicBalance={info:()=>({enabled:proto.tick!==previous,originalLeads:true,allFamiliesPreserved:true}),restore(){proto.tick=previous;delete root.clubPsychedelicBalance;}};
})(window);

