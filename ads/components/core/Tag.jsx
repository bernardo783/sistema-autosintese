import React from "react";
export function Tag({tone="roxo",children}){
  const s=tone==="roxo"?{background:"var(--brand-tinta)",color:"var(--as-roxo-claro)"}:{background:"transparent",color:"var(--muted)",border:"1px solid var(--line)"};
  return <span style={{display:"inline-block",padding:"4px 12px",borderRadius:"var(--r-pill)",fontSize:12,fontWeight:600,letterSpacing:".14em",textTransform:"uppercase",fontFamily:"var(--font)",...s}}>{children}</span>;
}