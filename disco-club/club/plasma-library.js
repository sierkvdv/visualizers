// One hundred additional spatial filament designs. Existing icons and radial recipes stay available.
(function(root){
 if(root.clubPlasmaLibrary||typeof renderer==='undefined')return;
 const T=THREE,TAU=Math.PI*2,families=['jellyfish','lotus','dragon','butterfly','crystal','portal','neuron','orbit','spiral','mask'];
 const names=[],forms=[],sin=Math.sin,cos=Math.cos;
 for(let family=0;family<10;family++)for(let variant=0;variant<10;variant++){
  const paths=[],v=variant,n=3+v%6,phase=v*.57;
  for(let k=0;k<20;k++){
   const points=[],a=k*TAU/20;
   for(let j=0;j<8;j++){
    const s=j/7,t=s*TAU,b=a+phase;let x,y,z;
    if(family===0){ // Bell ribs, inner rings and trailing tentacles.
     if(k<10){const q=s*Math.PI; x=cos(b)*sin(q);y=.35+.65*cos(q);z=sin(b)*sin(q)*(.6+v*.025);}
     else {x=cos(b)*(.45+.15*sin(s*(2+v%3)*Math.PI+b));y=.25-s*1.7;z=sin(b)*.45+.22*sin(s*TAU+b);}
    }else if(family===1){ // Layered lotus petals, different petal counts and folds.
     const petal=k%n*TAU/n,layer=Math.floor(k/n),r=sin(s*Math.PI)*(.8-layer*.12),q=petal+(s-.5)*(.7+v*.06);
     x=r*cos(q);z=r*sin(q);y=-.55+sin(s*Math.PI)*(.65+layer*.13)+.3*s*cos(v*.4);
    }else if(family===2){ // Long dragon spine with curled ribs, crest and tail.
     const q=-1+2*s,turn=q*(1.2+v*.12),r=.15+.22*sin(s*Math.PI);
     x=q;y=.42*sin(turn*2+phase)+r*cos(a);z=.42*cos(turn+phase)+r*sin(a)*(k%3===0?1.8:1);
    }else if(family===3){ // Four curling wings around a dimensional thorax.
     const sign=k%2?1:-1,upper=k%4<2,wing=sin(s*Math.PI),r=.48+.09*Math.floor(k/4);
     x=sign*wing*r*(1+.3*sin(s*(2+v%4)*Math.PI));y=(upper?1:-1)*wing*(upper?.95:.6)+.2*cos(t);z=.22*sin(t+phase)+.15*cos(a)*wing;
    }else if(family===4){ // Faceted crowns, cages and double-ended mineral shards.
     const corners=3+v%5,step=Math.floor(s*corners),f=s*corners-step,q0=step*TAU/corners+b,q1=q0+TAU/corners;
     const r=k<10?.75:.35,h=k<10?.55:1.05;
     x=r*((1-f)*cos(q0)+f*cos(q1));z=r*((1-f)*sin(q0)+f*sin(q1));y=(k%2?1:-1)*h*(1-.75*sin(s*Math.PI));
    }else if(family===5){ // Twisted portals, cog rings and interlinked arches.
     const q=t+(k%4)*.25,r=.62+.09*sin(n*q+phase)+.035*Math.floor(k/4);
     x=r*cos(q);y=r*sin(q);z=.18*sin(q*(1+v%3)+a)+.05*(k-10);
    }else if(family===6){ // Branching neuron arbor with forked, curling endings.
     const fork=k%3-1,r=.12+s*.95,q=b+fork*.6*s*s;
     x=r*cos(q);y=r*sin(q)*(.65+v*.035);z=.5*sin(a*2+phase)*s+.22*sin(s*Math.PI*2)*fork;
    }else if(family===7){ // Tilted orbital ribbons, atomic cages and nested satellites.
     const tilt=(k%5)*Math.PI/5+phase,r=.48+.035*k,q=t*(1+v%2)+a;
     x=r*cos(q);y=r*sin(q)*cos(tilt);z=r*sin(q)*sin(tilt)+.13*sin(q*(2+v%3));
    }else if(family===8){ // Split helices, tornado funnels and braided spirals.
     const q=s*TAU*(1+v%3)+a,r=(.12+.7*s)*(.7+.3*cos(v*.6));
     x=r*cos(q);y=-1+2*s;z=r*sin(q);if(v>=5){const tmp=y;y=z;z=tmp;}
    }else{ // Horned ceremonial masks with eyes, tusks and headdresses.
     if(k<4){const side=k%2?1:-1;x=side*.32+.23*cos(t);y=.18+.13*sin(t);z=.4+.06*cos(t);}
     else if(k<10){const side=k%2?1:-1;x=side*(.48+.25*sin(s*Math.PI));y=.4+s*.65;z=.12+.3*sin(s*Math.PI+phase);}
     else if(k<16){x=.65*cos(t);y=.8*sin(t);z=.15*sin(t*2+phase)+(k-13)*.055;}
     else{x=-.42+.84*s;y=-.4-.13*sin(s*Math.PI)+.05*(k-18);z=.4+.13*sin(s*n*Math.PI);}
    }
    points.push([x,y,z]);
   }paths.push(points);
  }
  names.push(families[family]+'-'+(variant+1));forms.push(paths);
 }
 const states=new WeakMap(),base=renderer.render;let enabled=true,forced=null,last=null,draws=0;
 const smooth=(a,b,x)=>{x=Math.max(0,Math.min(1,(x-a)/(b-a)));return x*x*(3-2*x);};
 const pickExcept=n=>(n+1+Math.floor(Math.random()*(forms.length-1)))%forms.length;
 function install(group){const tubes=group.children.filter(m=>m.material&&m.material.uniforms&&m.material.uniforms.endpoint),state={episode:-1,a:0,b:1,c:2,selected:false,amount:0,morph:0,leg:0};
  tubes.forEach((mesh,i)=>{const before=mesh.onBeforeRender;
   mesh.onBeforeRender=function(...args){before.apply(this,args);const u=mesh.material.uniforms;if(!enabled||!state.selected||!u.iconCurve)return;
    const a=forms[state.leg?state.b:state.a][Math.floor(i/2)],b=forms[state.leg?state.c:state.b][Math.floor(i/2)];
    u.iconAmount.value=state.amount;for(let j=0;j<8;j++)u.iconCurve.value[j].set(a[j][0]+(b[j][0]-a[j][0])*state.morph,a[j][1]+(b[j][1]-a[j][1])*state.morph,a[j][2]+(b[j][2]-a[j][2])*state.morph);
   };
  });return state;
 }
 renderer.render=function(scene,camera){const group=camera&&camera.isPerspectiveCamera&&scene.children&&scene.children.length<9&&scene.children.find(g=>g.isGroup&&g.children.length>=40&&g.children.some(m=>m.material&&m.material.uniforms&&m.material.uniforms.endpoint));
  if(group){let state=states.get(group);if(!state){state=install(group);states.set(group,state);}const info=root.clubPlasmaGlobe.info(),episode=info.episodes||1;
   if(state.episode!==episode){state.episode=episode;state.selected=forced!==null||Math.random()<.85;state.a=forced===null?Math.floor(Math.random()*forms.length):forced;state.b=pickExcept(state.a);state.c=pickExcept(state.b);forced=null;}
   state.amount=smooth(2.5,5,info.age)*(1-smooth(18,22,info.age));state.leg=info.age>=12?1:0;state.morph=state.leg?smooth(12,18,info.age):smooth(6,12,info.age);
   last={from:names[state.leg?state.b:state.a],to:names[state.leg?state.c:state.b],morph:state.morph,selected:state.selected};draws++;
  }return base.call(this,scene,camera);
 };
 root.clubPlasmaLibrary={names:()=>names.slice(),paths:n=>forms[n],preview(name){forced=typeof name==='number'?Math.max(0,Math.min(99,name)):Math.max(0,names.indexOf(name));root.clubPlasmaGlobe.preview();},setEnabled(v){enabled=!!v;},info:()=>({enabled,designs:forms.length,families:families.slice(),existingDesignsPreserved:true,draws,...last})};
})(window);
