// Actual spatial plasma paths: no image planes. Existing radial recipes remain in the mix.
(function(root){
 const names=['skull','mushroom','tengu','torii'];
 const line=(a,b)=>s=>a.map((v,i)=>v+(b[i]-v)*s);
 const ellipse=(x,y,z,rx,ry,depth=0)=>s=>[x+rx*Math.cos(s*Math.PI*2),y+ry*Math.sin(s*Math.PI*2),z+depth*Math.sin(s*Math.PI*2)];
 function paths(kind){const p=[],add=f=>p.push(Array.from({length:8},(_,i)=>f(i/7))),L=(a,b)=>add(line(a,b)),E=(...a)=>add(ellipse(...a));
  if(kind===0){
   E(0,.18,.05,.73,.84,.12);add(s=>{const a=s*Math.PI;return [.56*Math.cos(a),-.43-.42*Math.sin(a),.34];});
   E(-.3,.18,.47,.22,.23,.035);E(.3,.18,.47,.22,.23,-.035);
   L([0,.02,.55],[-.12,-.25,.51]);L([-.12,-.25,.51],[.12,-.25,.51]);
   add(s=>[-.46+s*.92,-.48+.05*Math.sin(s*Math.PI),.43]);
   for(let i=0;i<6;i++)L([-.35+i*.14,-.48,.43],[-.32+i*.13,-.7,.39]);
   for(const x of [-.59,.59])add(s=>[x*(.8+.2*Math.sin(s*Math.PI)),.75-1.1*s,.05-.55*Math.sin(s*Math.PI)]);
   E(0,.23,-.4,.58,.7,.03);
   for(const sign of [-1,1]){add(s=>[sign*(.1+.48*s),.42+.13*Math.sin(s*Math.PI),.45]);add(s=>[sign*(.48+.2*s),-.3+.24*s,.42-.14*s]);}
  }else if(kind===1){
   add(s=>[Math.cos(s*Math.PI*2),.15,.58*Math.sin(s*Math.PI*2)]);
   add(s=>[-Math.cos(s*Math.PI),.15+.78*Math.sin(s*Math.PI),0]);
   add(s=>[-Math.cos(s*Math.PI),.15+.66*Math.sin(s*Math.PI),.38*Math.sin(s*Math.PI)]);
   for(let i=0;i<4;i++){const a=i*Math.PI/2;add(s=>[Math.cos(a)*Math.sin(s*Math.PI/2),.15+.78*Math.cos(s*Math.PI/2),Math.sin(a)*.58*Math.sin(s*Math.PI/2)]);}
   for(const x of [-.18,.18])add(s=>[x+.055*Math.sin(s*3.),-.95+s*1.1,.12]);
   L([0,-.95,-.17],[0,.15,-.17]);add(s=>[.24*Math.cos(s*Math.PI*2),-.95,.19*Math.sin(s*Math.PI*2)]);
   for(let i=0;i<7;i++){const a=i*Math.PI*2/7;add(s=>[Math.cos(a)*(.18+s*.8),.12-.08*Math.sin(s*Math.PI),Math.sin(a)*(.12+s*.45)]);}
   E(-.32,.62,.31,.12,.085,.03);E(.36,.57,.32,.15,.09,-.03);
  }else if(kind===2){
   E(0,.03,.03,.61,.95,.12);
   for(const sign of [-1,1]){
    add(s=>[sign*(.1+.43*s),.27+.13*Math.sin(s*Math.PI)-.1*s,.35]);
    add(s=>[sign*(.1+.43*s),.27-.065*Math.sin(s*Math.PI)-.1*s,.35]);
    add(s=>[sign*(.08+.5*s),.48+.13*Math.sin(s*Math.PI)-.18*s,.3]);
   }
   L([-.09,.25,.38],[-.08,.18,1.16]);L([.09,.25,.38],[.08,.18,1.16]);
   add(s=>[.085*Math.cos(s*Math.PI*2),.18+.075*Math.sin(s*Math.PI*2),1.16]);
   L([0,-.03,.39],[0,.1,1.12]);
   add(s=>[-.35+s*.7,-.43+.06*Math.cos(s*Math.PI*2),.34]);
   add(s=>[-.28+s*.56,-.56-.04*Math.sin(s*Math.PI),.3]);
   for(const sign of [-1,1]){
    add(s=>[sign*(.52+.24*Math.sin(s*Math.PI)),.5-.65*s,-.04]);
    add(s=>[sign*(.39+.16*Math.sin(s*Math.PI)),.12-.83*s,.29]);
   }
   E(0,.66,.23,.095,.13,.02);
   for(const sign of [-1,1])add(s=>[sign*(.12+.26*s),-.78+.16*s,.18+.08*s]);

  }else{
   for(const z of [-.15,.15]){
    add(s=>[-1.1+2.2*s,.82+.16*Math.pow(2*s-1,2),z]);
    L([-.99,.64,z],[.99,.64,z]);L([-.88,.29,z],[.88,.29,z]);
    for(const sign of [-1,1])L([sign*.6,.72,z],[sign*.75,-1.,z]);
   }
   for(const sign of [-1,1]){L([sign*.99,.64,-.15],[sign*.99,.64,.15]);L([sign*.75,-1.,-.15],[sign*.75,-1.,.15]);}
   L([0,.64,.15],[0,.29,.15]);add(s=>[-.6+1.2*s,.25-.13*Math.sin(s*Math.PI),.18]);
   for(let i=0;i<4;i++){const x=-.36+i*.24;add(s=>[x+.035*Math.sin(s*Math.PI*4),.13-s*.21,.2]);}
  }
  if(p.length!==20)throw new Error('Plasma icon needs twenty spatial paths: '+names[kind]+' '+p.length);
  return p;
 }
 root.ClubPlasmaIconPaths=paths;
 if(typeof renderer==='undefined'||root.clubPlasmaIcons)return;
 const T=THREE,base=renderer.render,states=new WeakMap(),forms=names.map((_,i)=>paths(i));
 let enabled=true,forced=null,last=null,draws=0;
 const smooth=(a,b,x)=>{x=Math.max(0,Math.min(1,(x-a)/(b-a)));return x*x*(3-2*x);};
 const spline=`uniform vec3 iconCurve[8];uniform float iconAmount;uniform mat3 iconBasis;
 vec3 iconPoint(float s){float f=clamp(s,0.,1.)*7.;int j=int(min(6.,floor(f)));float t=f-float(j);vec3 a=iconCurve[max(0,j-1)],b=iconCurve[j],c=iconCurve[j+1],d=iconCurve[min(7,j+2)];return .5*((2.*b)+(-a+c)*t+(2.*a-5.*b+4.*c-d)*t*t+(-a+3.*b-3.*c+d)*t*t*t);}
 vec3 path(float s){vec3 p=iconPoint(s);p+=vec3(sin(s*12.+time*1.4+seed),cos(s*14.-time*1.1+seed),sin(s*9.+time*.9-seed))*.009*(.6+.4*energy);return mix(plasmaOriginalPath(s),iconBasis*p,iconAmount);}
 `;
 function init(group){const tubes=group.children.filter(m=>m.material&&m.material.uniforms&&m.material.uniforms.endpoint),state={tubes,episode:-1,a:0,b:1,original:false};
  for(const mesh of tubes){const m=mesh.material,u=m.uniforms;u.iconCurve={value:Array.from({length:8},()=>new T.Vector3())};u.iconAmount={value:0};u.iconBasis={value:new T.Matrix3()};
   m.vertexShader=m.vertexShader.replace('vec3 path(float s){','vec3 plasmaOriginalPath(float s){').replace('void main(){',spline+'void main(){');m.needsUpdate=true;
   const before=mesh.onBeforeRender,q=new T.Quaternion(),desired=new T.Quaternion(),e=new T.Euler(),matrix=new T.Matrix4();
   mesh.onBeforeRender=function(...args){before.apply(this,args);const t=u.time.value;e.set(.13*Math.sin(t*.31),.34+.4*Math.sin(t*.23),.12*Math.sin(t*.27));desired.setFromEuler(e);q.copy(group.quaternion).invert().multiply(desired);matrix.makeRotationFromQuaternion(q);u.iconBasis.value.setFromMatrix4(matrix);};
  }return state;
 }
 function render(scene,camera){let group;if(camera&&camera.isPerspectiveCamera&&scene.children&&scene.children.length<9)group=scene.children.find(g=>g.isGroup&&g.children.length>=40&&g.children.some(m=>m.material&&m.material.uniforms&&m.material.uniforms.endpoint));
  if(!group)return base.call(this,scene,camera);let state=states.get(group);if(!state){state=init(group);states.set(group,state);}
  const info=root.clubPlasmaGlobe&&root.clubPlasmaGlobe.info()||{age:8,episodes:1},episode=info.episodes||1;
  if(state.episode!==episode){state.episode=episode;state.a=forced===null?Math.floor(Math.random()*4):forced;state.b=(state.a+1+Math.floor(Math.random()*3))%4;state.original=forced===null&&Math.random()<.25;forced=null;}
  const amount=enabled&&!state.original?smooth(2.5,6,info.age)*(1-smooth(17,21,info.age)):0,morph=smooth(10,15,info.age);
  for(let i=0;i<state.tubes.length;i++){const u=state.tubes[i].material.uniforms,k=Math.floor(i/2);u.iconAmount.value=amount;for(let j=0;j<8;j++)u.iconCurve.value[j].fromArray(forms[state.a][k][j]).lerp(newPoint.fromArray(forms[state.b][k][j]),morph);}
  last={from:names[state.a],to:names[state.b],amount:+amount.toFixed(3),morph:+morph.toFixed(3),original:state.original};draws++;return base.call(this,scene,camera);
 }
 const newPoint=new T.Vector3();renderer.render=render;
 root.clubPlasmaIcons={preview(name){const n=names.indexOf(name);forced=n<0?Math.floor(Math.random()*4):n;if(root.clubPlasmaGlobe)root.clubPlasmaGlobe.preview();},setEnabled(v){enabled=!!v;},info:()=>({enabled,icons:names.slice(),draws,...last,real3D:true,oldRecipesPreserved:true})};
})(window);

