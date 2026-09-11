import React from "react";
import {Button} from "./Button.jsx";
export function Nav({links=[],cta="Falar com a AutoSíntese",logo="../../assets/logo-horizontal-branca.png",onCta}){
  const [open,setOpen]=React.useState(false);
  const [mobile,setMobile]=React.useState(typeof window!=="undefined"&&window.innerWidth<900);
  React.useEffect(()=>{const f=()=>setMobile(window.innerWidth<900);window.addEventListener("resize",f);return()=>window.removeEventListener("resize",f);},[]);
  return <nav style={{display:"flex",alignItems:"center",gap:24,padding:"18px 0",fontFamily:"var(--font)",position:"relative",flexWrap:"wrap"}}>
    <img src={logo} alt="AutoSíntese" style={{height:mobile?28:36}}/>
    {!mobile&&<div style={{display:"flex",gap:28,marginLeft:"auto"}}>{links.map(l=><a key={l.label} href={l.href||"#"} style={{color:"var(--txt)",opacity:.85,fontSize:15,fontWeight:500,textDecoration:"none"}}>{l.label}</a>)}</div>}
    {!mobile&&<Button size="sm" onClick={onCta}>{cta}</Button>}
    {mobile&&<button aria-label="Menu" onClick={()=>setOpen(o=>!o)} style={{marginLeft:"auto",width:44,height:44,borderRadius:999,border:"1px solid rgba(255,255,255,.25)",background:"transparent",color:"#fff",display:"grid",placeItems:"center",cursor:"pointer"}}>
      <span style={{display:"block",width:18,height:2,background:"#fff",boxShadow:open?"none":"0 -6px 0 #fff,0 6px 0 #fff",transform:open?"rotate(45deg)":"none"}}></span></button>}
    {mobile&&open&&<div style={{flexBasis:"100%",display:"flex",flexDirection:"column",gap:4,paddingBottom:8}}>
      {links.map(l=><a key={l.label} href={l.href||"#"} onClick={()=>setOpen(false)} style={{color:"#fff",fontSize:17,fontWeight:600,textDecoration:"none",padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,.12)"}}>{l.label}</a>)}
      <div style={{paddingTop:12}}><Button size="md" onClick={()=>{setOpen(false);onCta&&onCta();}} style={{width:"100%",justifyContent:"center"}}>{cta}</Button></div>
    </div>}
  </nav>;
}