import React from "react";
export function Input({label,hint,...rest}){
  return <label style={{display:"flex",flexDirection:"column",gap:8,fontFamily:"var(--font)",color:"var(--txt)"}}>
    {label&&<span style={{fontSize:13,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",color:"var(--txt)"}}>{label}</span>}
    <input {...rest} style={{background:"var(--bg-2)",border:"1px solid var(--line)",color:"var(--txt)",borderRadius:"var(--r-pill)",padding:"14px 20px",fontSize:16,fontFamily:"var(--font)",outline:"none"}}
      onFocus={e=>e.currentTarget.style.boxShadow="var(--focus)"} onBlur={e=>e.currentTarget.style.boxShadow=""}/>
    {hint&&<span style={{fontSize:13,color:"var(--muted)"}}>{hint}</span>}
  </label>;
}