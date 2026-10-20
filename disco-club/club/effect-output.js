// Post-composer overlays belong on the visible canvas, never a leftover offscreen target.
(function(root){
 if(typeof renderer==='undefined'||typeof naTekenHooks==='undefined'||root.clubEffectOutput)return;
 let corrected=0;
 function visibleOutput(){if(renderer.getRenderTarget()!==null){renderer.setRenderTarget(null);corrected++;}}
 naTekenHooks.unshift(visibleOutput);visibleOutput();
 root.clubEffectOutput={info:()=>({active:true,corrected,firstHook:naTekenHooks[0]===visibleOutput})};
})(window);
