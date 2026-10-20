// Gentle broadcast-only display correction; no audio or render-loop changes.
(()=>{
 if(!new URLSearchParams(location.search).has('uitzenden'))return;
 const canvas=typeof renderer!=='undefined'?renderer.domElement:null;if(!canvas)return;
 const id='club-broadcast-tones';if(document.getElementById(id))return;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id=id;svg.setAttribute('width','0');svg.setAttribute('height','0');svg.style.position='absolute';svg.style.pointerEvents='none';
 svg.innerHTML='<defs><filter id="club-broadcast-lift" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="gamma" amplitude="1" exponent="0.90" offset="0"/><feFuncG type="gamma" amplitude="1" exponent="0.90" offset="0"/><feFuncB type="gamma" amplitude="1" exponent="0.90" offset="0"/></feComponentTransfer><feColorMatrix type="saturate" values="1.05"/></filter></defs>';
 document.body.appendChild(svg);const original=canvas.style.filter;canvas.style.filter=(original?original+' ':'')+'url(#club-broadcast-lift)';
 window.clubBroadcastColor={gamma:.90,saturation:1.05,restore(){canvas.style.filter=original;svg.remove();delete window.clubBroadcastColor;}};
})();
