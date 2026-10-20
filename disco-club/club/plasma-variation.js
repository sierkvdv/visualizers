// Additive plasma recipes: retain the glass globe and morph its actual 3D geometry.
(function(root){
 if(typeof renderer==='undefined'||root.clubPlasmaVariation)return;
 const T=THREE,base=renderer.render,states=new WeakMap();
 const names=['globe','petal-star','twisted-capsule','plasma-ring','double-lobe','ripple-shell'];
 const palettes=[['#3438ff','#ff29ad'],['#00d9ed','#a375ff'],['#ff8529','#ffeab0'],['#39efbd','#228bff'],['#fb3888','#ffc453'],['#b78cff','#e9f6ff'],['#83e935','#00cfb1'],['#286eff','#ff744c']];
 let forced=null,last=null,draws=0;
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 function point(d,kind,time,energy,out){
  const x=d.x,y=d.y,z=d.z,phi=Math.atan2(z,x),theta=Math.acos(Math.max(-1,Math.min(1,y)));
  let r=1.2;
  if(kind===1){r*=.82+.23*Math.cos(phi*5+time*.65)*Math.sin(theta)**2+.09*Math.sin(theta*4-time);out.set(x*r,y*r,z*r);}
  else if(kind===2){const a=y*.9+time*.3,c=Math.cos(a),s=Math.sin(a);out.set((x*c-z*s)*.76,y*1.43,(x*s+z*c)*.76);}
  else if(kind===3){const a=theta*2,minor=.29+.045*Math.sin(phi*3-time*.85);r=.86+minor*Math.cos(a);out.set(r*Math.cos(phi),minor*Math.sin(a),r*Math.sin(phi));}
  else if(kind===4){r*=.63+.48*Math.abs(y)+.08*Math.sin(phi*3+time*.7)*Math.sin(theta);out.set(x*r,y*r*1.17,z*r);}
  else if(kind===5){r*=.9+.11*Math.sin(theta*7+phi*3-time*(.8+energy*.5));out.set(x*r,y*r,z*r);}
  else out.set(x*r,y*r,z*r);
  return out;
 }
 function init(group){
  const tubes=group.children.filter(m=>m.material&&m.material.uniforms&&m.material.uniforms.endpoint);
  const surfaces=group.children.filter(m=>m.geometry&&m.geometry.parameters&&m.geometry.parameters.radius>1);
  const cores=group.children.filter(m=>m.geometry&&m.geometry.parameters&&m.geometry.parameters.radius<.3);
  for(const mesh of surfaces){mesh.userData.plasmaOriginal=Float32Array.from(mesh.geometry.attributes.position.array);}
  for(const mesh of tubes){const m=mesh.material,u=m.uniforms;mesh.userData.plasmaDirection=u.endpoint.value.clone().normalize();
   u.plasmaA={value:new T.Color()};u.plasmaB={value:new T.Color()};
   m.vertexShader=m.vertexShader.replace('normalize(endpoint+vec3(sin(time*.5+seed),cos(time*.43+seed*2.),sin(time*.39-seed))*.09)*1.18','endpoint+vec3(sin(time*.5+seed),cos(time*.43+seed*2.),sin(time*.39-seed))*.025');
   m.fragmentShader=m.fragmentShader.replace('uniform float glow,energy;','uniform float glow,energy;uniform vec3 plasmaA,plasmaB;').replace('mix(vec3(.2,.22,1.),vec3(1.,.16,.68),','mix(plasmaA,plasmaB,');m.needsUpdate=true;
  }
  return {tubes,surfaces,cores,tick:-1,episode:-1,a:0,b:0,p:0,q:0};
 }
 const v=new T.Vector3(),a=new T.Vector3(),b=new T.Vector3(),ca=new T.Color(),cb=new T.Color(),temp=new T.Color();
 function render(scene,camera){
  let group;
  if(camera&&camera.isPerspectiveCamera&&scene.children&&scene.children.length<9)group=scene.children.find(g=>g.isGroup&&g.children.length>=40&&g.children.some(m=>m.material&&m.material.uniforms&&m.material.uniforms.endpoint));
  if(!group)return base.call(this,scene,camera);
  let state=states.get(group);if(!state){state=init(group);states.set(group,state);}
  const info=root.clubPlasmaGlobe&&root.clubPlasmaGlobe.info()||{age:8,episodes:1};
  const episode=info.episodes||1,time=state.tubes[0].material.uniforms.time.value,energy=state.tubes[0].material.uniforms.energy.value;
  if(state.episode!==episode){state.episode=episode;state.a=Math.floor(Math.random()*names.length);state.b=(state.a+1+Math.floor(Math.random()*(names.length-1)))%names.length;state.p=Math.floor(Math.random()*palettes.length);state.q=(state.p+1+Math.floor(Math.random()*(palettes.length-1)))%palettes.length;}
  const from=forced===null?state.a:forced,to=forced===null?state.b:forced,morph=smooth((info.age-5)/10);
  ca.set(palettes[state.p][0]).lerp(temp.set(palettes[state.q][0]),morph);cb.set(palettes[state.p][1]).lerp(temp.set(palettes[state.q][1]),morph);
  // Geometry follows its own continuous clock; amplitude changes gently with musical energy.
  if(Math.floor(time*30)!==state.tick){state.tick=Math.floor(time*30);
   for(const mesh of state.surfaces){const attr=mesh.geometry.attributes.position,original=mesh.userData.plasmaOriginal;
    for(let i=0;i<attr.count;i++){v.fromArray(original,i*3).normalize();point(v,from,time,energy,a);point(v,to,time,energy,b);a.lerp(b,morph);attr.setXYZ(i,a.x,a.y,a.z);}
    attr.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
   }
  }
  for(const mesh of state.tubes){const u=mesh.material.uniforms;point(mesh.userData.plasmaDirection,from,time,energy,a);point(mesh.userData.plasmaDirection,to,time,energy,b);u.endpoint.value.copy(a.lerp(b,morph).multiplyScalar(.98));u.plasmaA.value.copy(ca);u.plasmaB.value.copy(cb);}
  for(const mesh of state.cores){mesh.material.color.copy(cb);if(mesh.material.emissive)mesh.material.emissive.copy(ca).multiplyScalar(.5);}
  for(const light of group.children)if(light.isPointLight)light.color.copy(cb);
  // Some recipes expose veins instead of an equally prominent glass shell every time.
  const glass=state.surfaces.find(m=>m.material.isMeshPhysicalMaterial);if(glass){glass.material.color.copy(ca).lerp(temp.set('#ffffff'),.7);glass.material.opacity=.12+.11*(1-morph)*(from===0?1:.35);}
  last={from:names[from],to:names[to],morph:+morph.toFixed(3),palette:state.p,nextPalette:state.q,shapes:names.length,palettes:palettes.length};draws++;
  return base.call(this,scene,camera);
 }
 renderer.render=render;
 root.clubPlasmaVariation={info:()=>({active:true,draws,...last}),setVariant(n){forced=Number.isInteger(n)&&n>=0&&n<names.length?n:null;},names:()=>names.slice()};
})(window);
