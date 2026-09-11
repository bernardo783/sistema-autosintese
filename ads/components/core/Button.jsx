import React from "react";
export function Button({variant="primary",size="md",children,icon,style,...rest}){
  const pad=size==="sm"?"8px 16px":size==="lg"?"16px 32px":"12px 24px";
  const fs=size==="sm"?14:size==="lg"?18:16;
  const base={display:"inline-flex",alignItems:"center",gap:10,padding:pad,fontSize:fs,fontWeight:600,fontFamily:"var(--font)",borderRadius:"var(--r-pill)",border:"1px solid transparent",cursor:"pointer",transition:"all var(--dur) var(--ease)",lineHeight:1.2};
  const v={
    primary:{background:"var(--brand)",color:"var(--on-brand)",boxShadow:"var(--shadow-roxa)"},
    secondary:{background:"transparent",color:"var(--txt)",borderColor:"var(--line)"},
    ghost:{background:"transparent",color:"var(--as-roxo-claro)"}
  }[variant];
  return <button style={{...base,...v,...style}} {...rest}
    onMouseEnter={e=>{e.currentTarget.style.filter="brightness(1.12)";}}
    onMouseLeave={e=>{e.currentTarget.style.filter="";e.currentTarget.style.transform="";}}
    onMouseDown={e=>{e.currentTarget.style.transform="scale(.99)";e.currentTarget.style.filter="brightness(.9)";}}
    onMouseUp={e=>{e.currentTarget.style.transform="";}}>{icon}{children}</button>;
}