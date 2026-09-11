import React from "react";
export function Card({kicker,title,children,destaque=false,style}){
  return <div style={{background:destaque?"var(--grad-marca)":"var(--panel)",border:"1px solid var(--line)",borderRadius:"var(--r-lg)",padding:28,display:"flex",flexDirection:"column",gap:12,fontFamily:"var(--font)",color:"var(--txt)",...style}}>
    {kicker&&<div style={{fontSize:12,fontWeight:600,letterSpacing:".14em",textTransform:"uppercase",color:destaque?"rgba(255,255,255,.75)":"var(--muted)"}}>{kicker}</div>}
    {title&&<h3 style={{fontSize:24,fontWeight:800,letterSpacing:"-.02em",lineHeight:1.1,margin:0}}>{title}</h3>}
    <div style={{fontSize:16,lineHeight:1.55,color:destaque?"rgba(255,255,255,.85)":"var(--muted)"}}>{children}</div>
  </div>;
}