import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const LOGO_SRC = "/logo.png";

// ─── Auth errors → español ────────────────────────────────────────────────────
function traducirError(msg) {
  if (!msg) return "Ocurrió un error inesperado";
  const m = msg.toLowerCase();
  if (m.includes("invalid login")||m.includes("invalid credentials")||m.includes("wrong password")) return "Email o contraseña incorrectos";
  if (m.includes("email not confirmed")) return "El email no fue confirmado. Revisá tu casilla";
  if (m.includes("too many requests")||m.includes("rate limit")) return "Demasiados intentos. Esperá unos minutos";
  if (m.includes("user not found")) return "No existe una cuenta con ese email";
  if (m.includes("network")||m.includes("fetch")) return "Error de conexión. Verificá tu internet";
  if (m.includes("password")) return "La contraseña no cumple los requisitos";
  if (m.includes("email")) return "El email ingresado no es válido";
  return msg;
}

// ─── Date input dark mode ─────────────────────────────────────────────────────
function applyDateColorScheme(dark) {
  let el = document.getElementById("sc-date-scheme");
  if (!el) { el = document.createElement("style"); el.id = "sc-date-scheme"; document.head.appendChild(el); }
  el.textContent = dark
    ? `input[type="date"]{color-scheme:dark;}input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(1);}`
    : `input[type="date"]{color-scheme:light;}`;
}

// ─── Utilidades de fecha ──────────────────────────────────────────────────────
function getToday() { return new Date(); }
function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function addDays(ds, days) {
  const d = new Date(`${ds}T12:00:00`); d.setDate(d.getDate()+Number(days||0)); return d;
}
function parseISODate(ds) { return ds ? new Date(`${ds}T12:00:00`) : null; }
function formatDate(ds) {
  if (!ds) return "-";
  return new Intl.DateTimeFormat("es-AR").format(new Date(`${ds}T12:00:00`));
}
function formatDateTime(ts) {
  if (!ts) return "-";
  return new Intl.DateTimeFormat("es-AR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(ts));
}
function diffDays(a,b) {
  const da=new Date(a.getFullYear(),a.getMonth(),a.getDate());
  const db=new Date(b.getFullYear(),b.getMonth(),b.getDate());
  return Math.floor((db-da)/86400000);
}
function monthKey(ds) {
  const d=new Date(`${ds}T12:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function monthLabel(key) {
  const [y,m]=key.split("-");
  const raw=new Intl.DateTimeFormat("es-AR",{month:"long",year:"numeric"}).format(new Date(Number(y),Number(m)-1,1));
  return raw.charAt(0).toUpperCase()+raw.slice(1);
}
function isSameMonth(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth();}

// ─── Negocio ──────────────────────────────────────────────────────────────────
const GRACE_DAYS=3, WARN_DAYS=2;
const PAGE={base:10,venc:10,deud:3,clases:3,ing:10,crit:3,hist:15,dorm:10};

function safeNum(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function money(v){return `USD ${safeNum(v)}`;}
function svcLabel(v){
  if(v==="mensual") return "Plan inversor mensual";
  if(v==="anual")   return "Plan inversor anual";
  return "Clases";
}
function svcAmount(v){return v==="mensual"?30:250;}
function svcDuration(v){return v==="mensual"?30:v==="anual"?365:0;}
function isValidEmail(e){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);}
function classRangeLabel(fi){
  if(!fi)return"-";
  const s=parseISODate(fi),e=addDays(fi,27);
  const fmt=d=>new Intl.DateTimeFormat("es-AR",{month:"long"}).format(d);
  return isSameMonth(s,e)?fmt(s):`${fmt(s)} / ${fmt(e)}`;
}
function resolveDueDate(c){
  if(c.fecha_vencimiento)return c.fecha_vencimiento;
  const dur=Number(c.duracion_dias||0);
  if(c.servicio==="clases"||!c.fecha_inicio||dur<=0)return null;
  return toISODate(addDays(c.fecha_inicio,dur));
}
function computeClient(c){
  const today=getToday();
  const isClases=c.servicio==="clases";
  const vencimiento=resolveDueDate(c);
  let estadoSistema="activo",dias=null;
  if(isClases){estadoSistema="clases";}
  else if(c.estado_manual==="sacar"){estadoSistema="sacar";}
  else if(vencimiento){
    const due=parseISODate(vencimiento);
    dias=diffDays(today,due);
    if(today>due){const ov=diffDays(due,today);estadoSistema=ov<=GRACE_DAYS?"gracia":"vencido";}
  }
  return{...c,isClases,vencimiento,dias,duracion_dias:safeNum(c.duracion_dias),estadoSistema,
    class_range_label:isClases?classRangeLabel(c.fecha_inicio):null,
    class_end_date:isClases&&c.fecha_inicio?toISODate(addDays(c.fecha_inicio,27)):null};
}

// ─── Analytics ───────────────────────────────────────────────────────────────
function buildDailySeriesForMonth(ingresos,year,month){
  const end=new Date(year,month+1,0);
  const rows=Array.from({length:end.getDate()},(_,i)=>({day:i+1,label:String(i+1).padStart(2,"0"),total:0,mensual:0,anual:0,clases:0,ventas:0}));
  ingresos.forEach(i=>{
    if(!i.fecha_pago)return;
    const d=parseISODate(i.fecha_pago);
    if(!d||d.getFullYear()!==year||d.getMonth()!==month)return;
    const row=rows[d.getDate()-1];
    const m=safeNum(i.monto);
    row.total+=m;row.ventas+=1;
    if(row[i.servicio]!==undefined)row[i.servicio]+=m;
  });
  return rows;
}
function buildBreakdown(arr){
  const b={mensual:0,anual:0,clases:0};
  arr.forEach(i=>{if(b[i.servicio]!==undefined)b[i.servicio]+=safeNum(i.monto);});
  return b;
}

// ─── XLSX export ─────────────────────────────────────────────────────────────
function exportXLSX(rows,cols,filename){
  function doExport(XLSX){
    const wsData=[cols.map(c=>c.label),...rows.map(r=>cols.map(c=>{const v=r[c.key];return v==null?"":String(v);}))];
    const ws=XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"]=cols.map(c=>({wch:Math.max(c.label.length+2,16)}));
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Datos");XLSX.writeFile(wb,filename);
  }
  if(window.XLSX){doExport(window.XLSX);return;}
  const s=document.createElement("script");
  s.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  s.onload=()=>doExport(window.XLSX);document.head.appendChild(s);
}

// ─── Historial ────────────────────────────────────────────────────────────────
async function logH(email,accion,entidad,eid,detalle){
  try{await supabase.from("historial_cambios").insert([{usuario_email:email,accion,entidad:entidad||null,entidad_id:eid||null,detalle:detalle||null}]);}catch(_){}
}
async function limpiarHistorial(){
  try{const c=new Date(Date.now()-24*3600000).toISOString();await supabase.from("historial_cambios").delete().lt("created_at",c);}catch(_){}
}

// ─── notas_cliente helper ─────────────────────────────────────────────────────
async function logNC(clienteId, userEmail, tipo, contenido, detalle){
  try{
    await supabase.from("notas_cliente").insert([{
      cliente_id: clienteId,
      usuario_email: userEmail||"—",
      tipo,
      contenido: contenido||"",
      detalle: detalle||null,
    }]);
  }catch(_){}
}

// ─── Drive helper ─────────────────────────────────────────────────────────────
async function llamarDrive(accion, email) {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-access`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ accion, email }),
    });
    const data = await res.json();
    if (!data.ok) console.warn("Drive:", data.error || data);
  } catch (err) {
    console.warn("Drive error:", err);
  }
}

// ─── usePagination ────────────────────────────────────────────────────────────
function usePagination(items,pageSize){
  const [page,setPage]=useState(1);
  const totalPages=Math.max(1,Math.ceil(items.length/pageSize));
  useEffect(()=>{setPage(p=>Math.min(p,Math.max(1,Math.ceil(items.length/pageSize))));},[items,pageSize]);
  const rows=useMemo(()=>{const s=(page-1)*pageSize;return items.slice(s,s+pageSize);},[items,page,pageSize]);
  return{page,setPage,totalPages,rows};
}

const FORM_DEF={nombre:"",email:"",telefono:"",servicio:"mensual",fecha_inicio:toISODate(getToday()),monto:30,duracion_dias:30,estado_manual:"activo",deuda_restante:0,notas:""};

// ─── Tema premium ─────────────────────────────────────────────────────────────
function getT(dark){
  return{
    bg:               dark?"#080e1a":"#f0ede8",
    cardBg:           dark?"#111827":"#ffffff",
    cardBorder:       dark?"#1e2d45":"#e2ddd7",
    cardShadow:       dark?"0 4px 24px rgba(0,0,0,0.5)":"0 2px 16px rgba(15,23,42,0.07)",
    text:             dark?"#f0f4ff":"#0f172a",
    textMuted:        dark?"#8899bb":"#64748b",
    accent:           "#c8972a",
    accentGrad:       "linear-gradient(135deg,#e8b84b 0%,#c8972a 60%,#a07020 100%)",
    inputBg:          dark?"#0d1526":"#fafaf9",
    inputBorder:      dark?"#1e2d45":"#d4cfc9",
    inputText:        dark?"#f0f4ff":"#0f172a",
    thBg:             dark?"#0d1526":"#f8f6f3",
    tdBorder:         dark?"#1a2540":"#ede9e4",
    btnDkBg:          dark?"#c8972a":"#0f172a",
    btnDkTx:          dark?"#0f172a":"#fff",
    btnLtBg:          dark?"#1a2540":"#ede9e4",
    btnLtTx:          dark?"#c8d4f0":"#374151",
    navActBg:         dark?"#c8972a":"#0f172a",
    navActTx:         dark?"#0f172a":"#fff",
    navInBg:          dark?"#111827":"#fff",
    navInTx:          dark?"#c8d4f0":"#374151",
    navInBr:          dark?"#1e2d45":"#d4cfc9",
    barBg:            dark?"#1a2540":"#ede9e4",
    dark,
  };
}
function makeS(t){
  return{
    card: {background:t.cardBg,borderRadius:16,padding:24,boxShadow:t.cardShadow,border:`1px solid ${t.cardBorder}`},
    input:{width:"100%",padding:"11px 14px",borderRadius:10,border:`1px solid ${t.inputBorder}`,fontSize:14,outline:"none",boxSizing:"border-box",background:t.inputBg,color:t.inputText},
    label:{display:"block",fontSize:11,fontWeight:700,color:t.textMuted,marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"},
    table:{width:"100%",borderCollapse:"collapse",fontSize:14},
    td:   {padding:"11px 14px",borderBottom:`1px solid ${t.tdBorder}`,color:t.text},
    thRow:{background:t.thBg},
  };
}
function makeBtn(t){
  return function btn(dark=false,gold=false){
    if(gold)return{padding:"11px 20px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:800,fontSize:14,background:t.accentGrad,color:"#0f172a"};
    return{padding:"10px 16px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,fontSize:14,background:dark?t.btnDkBg:t.btnLtBg,color:dark?t.btnDkTx:t.btnLtTx};
  };
}
function makeNavBtn(t){
  return function navBtn(active){
    return{padding:"10px 18px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:14,
      border:active?"none":`1px solid ${t.navInBr}`,background:active?t.navActBg:t.navInBg,color:active?t.navActTx:t.navInTx};
  };
}
function badgeStyle(status){
  const b={display:"inline-block",padding:"4px 10px",borderRadius:999,fontSize:11,fontWeight:700,letterSpacing:"0.05em",border:"1px solid transparent"};
  if(status==="activo")  return{...b,background:"#d1fae5",color:"#065f46",borderColor:"#6ee7b7"};
  if(status==="gracia")  return{...b,background:"#fef3c7",color:"#92400e",borderColor:"#fde68a"};
  if(status==="vencido") return{...b,background:"#fee2e2",color:"#991b1b",borderColor:"#fca5a5"};
  if(status==="clases")  return{...b,background:"#ede9fe",color:"#5b21b6",borderColor:"#c4b5fd"};
  if(status==="sacar")   return{...b,background:"#fee2e2",color:"#991b1b",borderColor:"#fca5a5"};
  return{...b,background:"#f1f5f9",color:"#334155",borderColor:"#cbd5e1"};
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({rows=5,cols=5,t}){
  return(
    <div style={{padding:"8px 0"}}>
      <style>{`@keyframes pulse{0%,100%{opacity:.7}50%{opacity:.3}}`}</style>
      {Array.from({length:rows}).map((_,r)=>(
        <div key={r} style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:12,padding:"13px 14px",borderBottom:`1px solid ${t.tdBorder}`}}>
          {Array.from({length:cols}).map((_,c)=>(
            <div key={c} style={{height:13,borderRadius:6,background:t.dark?"#1a2540":"#ede9e4",animation:"pulse 1.5s ease-in-out infinite",width:c===0?"75%":"55%"}}/>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function ToastContainer({toasts,remove}){
  return(
    <div style={{position:"fixed",bottom:24,right:24,zIndex:9999,display:"flex",flexDirection:"column",gap:10,pointerEvents:"none"}}>
      {toasts.map(t=>(
        <div key={t.id} style={{
          pointerEvents:"all",
          background:t.type==="error"?"#1a0a0a":t.type==="success"?"#0a1a0f":"#111827",
          border:`1px solid ${t.type==="error"?"#7f1d1d":t.type==="success"?"#14532d":"#1e2d45"}`,
          borderLeft:`4px solid ${t.type==="error"?"#ef4444":t.type==="success"?"#22c55e":"#c8972a"}`,
          borderRadius:12,padding:"14px 18px",color:"#f0f4ff",fontSize:14,fontWeight:500,
          minWidth:280,maxWidth:380,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
          display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,
        }}>
          <span>{t.msg}</span>
          <button onClick={()=>remove(t.id)} style={{background:"none",border:"none",color:"#8899bb",cursor:"pointer",fontSize:18,lineHeight:1,padding:0}}>×</button>
        </div>
      ))}
    </div>
  );
}
function useToast(){
  const [toasts,setToasts]=useState([]);
  const add=useCallback((msg,type="info",duration=4200)=>{
    const id=Date.now()+Math.random();
    setToasts(ts=>[...ts,{id,msg,type}]);
    if(duration>0)setTimeout(()=>setToasts(ts=>ts.filter(t=>t.id!==id)),duration);
    return id;
  },[]);
  const remove=useCallback(id=>setToasts(ts=>ts.filter(t=>t.id!==id)),[]);
  return{toasts,remove,success:m=>add(m,"success"),error:m=>add(m,"error"),info:m=>add(m,"info")};
}

// ─── Confirm modal ────────────────────────────────────────────────────────────
function ConfirmModal({open,title,message,confirmLabel="Confirmar",danger=false,onConfirm,onCancel,t}){
  if(!open)return null;
  const btn=makeBtn(t);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(8,14,26,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,zIndex:2000}}>
      <div style={{background:t.cardBg,borderRadius:18,padding:36,border:`1px solid ${t.cardBorder}`,maxWidth:420,width:"100%",boxShadow:"0 32px 80px rgba(0,0,0,0.6)"}}>
        <h3 style={{margin:"0 0 12px",color:t.text,fontSize:19,fontWeight:900}}>{title}</h3>
        <p style={{margin:"0 0 28px",color:t.textMuted,fontSize:14,lineHeight:1.65}}>{message}</p>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button style={btn(false)} onClick={onCancel}>Cancelar</button>
          <button style={danger?{padding:"10px 18px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,fontSize:14,background:"#ef4444",color:"#fff"}:btn(false,true)} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Búsqueda rápida (antes Ctrl+K) ──────────────────────────────────────────
function BusquedaRapida({clientes,onSelect,onClose,t}){
  const S=makeS(t);
  const [q,setQ]=useState("");
  const ref=useRef(null);
  useEffect(()=>{ref.current?.focus();},[]);
  // Escape key closes the modal
  useEffect(()=>{
    function onKey(e){if(e.key==="Escape")onClose();}
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[onClose]);
  const results=useMemo(()=>{
    if(!q.trim())return[];
    const lo=q.toLowerCase();
    return clientes.filter(c=>`${c.nombre||""} ${c.email||""} ${c.telefono||""}`.toLowerCase().includes(lo)).slice(0,9);
  },[clientes,q]);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(8,14,26,0.8)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"72px 24px",zIndex:3000}} onClick={onClose}>
      <div style={{background:t.cardBg,borderRadius:18,border:`1px solid ${t.cardBorder}`,width:"100%",maxWidth:560,boxShadow:"0 32px 80px rgba(0,0,0,0.6)",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${t.tdBorder}`,display:"flex",alignItems:"center",gap:12}}>
          <span style={{color:t.textMuted,fontSize:17}}>🔍</span>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)}
            placeholder="Nombre, email o teléfono..."
            style={{flex:1,border:"none",outline:"none",background:"transparent",color:t.text,fontSize:15}}/>
          {/* × button instead of Esc label */}
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:t.textMuted,fontSize:20,lineHeight:1,padding:"0 2px",display:"flex",alignItems:"center"}}>×</button>
        </div>
        {results.length>0?(
          <div style={{maxHeight:380,overflowY:"auto"}}>
            {results.map(c=>(
              <div key={c.id} onClick={()=>{onSelect(c);onClose();}}
                style={{padding:"14px 20px",cursor:"pointer",borderBottom:`1px solid ${t.tdBorder}`,display:"flex",justifyContent:"space-between",alignItems:"center",transition:"background 0.1s"}}
                onMouseEnter={e=>e.currentTarget.style.background=t.dark?"#1a2540":"#f8f6f3"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div>
                  <div style={{fontWeight:700,color:t.text,fontSize:14}}>{c.nombre}</div>
                  <div style={{color:t.textMuted,fontSize:12,marginTop:2}}>
                    {c.email}{c.telefono?` · ${c.telefono}`:""}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={badgeStyle(c.estadoSistema)}>{c.estadoSistema?.toUpperCase()}</span>
                  {c.vencimiento&&<span style={{fontSize:11,color:t.textMuted}}>vence {formatDate(c.vencimiento)}</span>}
                </div>
              </div>
            ))}
          </div>
        ):q.trim()?(
          <div style={{padding:28,textAlign:"center",color:t.textMuted,fontSize:14}}>Sin resultados para <strong style={{color:t.text}}>"{q}"</strong></div>
        ):(
          <div style={{padding:28,textAlign:"center",color:t.textMuted,fontSize:13}}>Escribí para buscar entre tus clientes</div>
        )}
      </div>
    </div>
  );
}

// ─── Panel detalle cliente ────────────────────────────────────────────────────
const TL_PAGE = 5; // ítems por página en el timeline
function ClienteDetailModal({cliente,ingresos,userEmail,onClose,onAbrirRenovar,onEliminar,onNotaGuardada,t}){
  if(!cliente)return null;
  const S=makeS(t);const btn=makeBtn(t);
  const [nuevaNota,setNuevaNota]=useState("");
  const [sending,setSending]=useState(false);
  const [copiado,setCopiado]=useState(false);
  const [timeline,setTimeline]=useState([]);
  const [loadingTL,setLoadingTL]=useState(true);
  const [tlPage,setTlPage]=useState(1);

  const pagosTotales=useMemo(()=>
    ingresos.filter(i=>i.cliente_id===cliente.id)
      .sort((a,b)=>(b.fecha_pago||"").localeCompare(a.fecha_pago||""))
  ,[ingresos,cliente.id]);
  const totalPagado=pagosTotales.reduce((a,i)=>a+safeNum(i.monto),0);

  // Timeline pagination
  const tlTotal=Math.max(1,Math.ceil(timeline.length/TL_PAGE));
  const tlRows=useMemo(()=>{
    const s=(tlPage-1)*TL_PAGE;
    return timeline.slice(s,s+TL_PAGE);
  },[timeline,tlPage]);

  useEffect(()=>{
    supabase.from("notas_cliente").select("*").eq("cliente_id",cliente.id)
      .order("created_at",{ascending:false})
      .then(({data})=>{setTimeline(data||[]);setLoadingTL(false);});
  },[cliente.id]);

  async function enviarNota(){
    if(!nuevaNota.trim())return;
    setSending(true);
    const{error}=await supabase.from("notas_cliente").insert([{
      cliente_id:cliente.id, usuario_email:userEmail||"—",
      tipo:"nota", contenido:nuevaNota.trim(), detalle:null,
    }]);
    if(!error){
      const nuevo={id:Date.now(),created_at:new Date().toISOString(),usuario_email:userEmail||"—",tipo:"nota",contenido:nuevaNota.trim(),detalle:null};
      setTimeline(prev=>[nuevo,...prev]);
      setTlPage(1);
      setNuevaNota("");
      onNotaGuardada&&onNotaGuardada();
    }
    setSending(false);
  }

  function copiarEmail(){
    navigator.clipboard?.writeText(cliente.email).then(()=>{setCopiado(true);setTimeout(()=>setCopiado(false),2000);});
  }

  function tipoStyle(tipo){
    if(tipo==="nota")return{icon:"📝",color:"#5b8dee",bg:"rgba(91,141,238,0.1)"};
    if(tipo==="renovación"||tipo==="renovacion"||tipo==="alta")return{icon:"🔄",color:"#22c55e",bg:"rgba(34,197,94,0.1)"};
    if(tipo==="pago")return{icon:"💰",color:t.accent,bg:"rgba(200,151,42,0.1)"};
    if(tipo==="estado")return{icon:"🔖",color:"#a78bfa",bg:"rgba(167,139,250,0.1)"};
    return{icon:"📌",color:t.textMuted,bg:t.dark?"#1a2540":"#f1f5f9"};
  }
  function tipoLabel(tipo){
    if(tipo==="nota")return"Nota";
    if(tipo==="renovación"||tipo==="renovacion")return"Renovación";
    if(tipo==="alta")return"Alta de cliente";
    if(tipo==="pago")return"Pago registrado";
    if(tipo==="estado")return"Cambio de estado";
    return tipo;
  }

  // Overlay cierra al tocar fuera del card
  return(
    <div
      style={{position:"fixed",inset:0,background:"rgba(8,14,26,0.82)",zIndex:1500,
        display:"flex",alignItems:"flex-start",justifyContent:"center",
        padding:"24px 16px",overflowY:"auto"}}
      onClick={onClose}
    >
      {/* Card — stopPropagation evita que el click interno cierre el modal */}
      <div
        onClick={e=>e.stopPropagation()}
        style={{background:t.cardBg,borderRadius:20,border:`1px solid ${t.cardBorder}`,
          maxWidth:680,width:"100%",boxShadow:"0 32px 80px rgba(0,0,0,0.6)",
          marginTop:8,marginBottom:24,
          display:"flex",flexDirection:"column"}}
      >
        {/* ── Header fijo ── */}
        <div style={{padding:"24px 28px 0",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
            <div>
              <h2 style={{margin:0,color:t.text,fontSize:21,fontWeight:900,letterSpacing:"-0.02em"}}>{cliente.nombre}</h2>
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6,flexWrap:"wrap"}}>
                <span style={{color:t.textMuted,fontSize:13}}>{cliente.email}</span>
                <button onClick={copiarEmail} style={{background:"none",border:"none",cursor:"pointer",color:copiado?"#22c55e":t.textMuted,fontSize:12,padding:"2px 8px",borderRadius:6,fontWeight:copiado?700:400}}>
                  {copiado?"✓ Copiado":"Copiar email"}
                </button>
                {cliente.telefono&&(
                  <a href={`https://wa.me/${cliente.telefono.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                    style={{color:"#22c55e",fontSize:12,fontWeight:700,textDecoration:"none",padding:"3px 10px",borderRadius:6,background:"rgba(34,197,94,0.12)"}}>
                    WhatsApp ↗
                  </a>
                )}
              </div>
            </div>
            {/* Cerrar siempre visible en top-right */}
            <button onClick={onClose} style={{...btn(false),padding:"8px 14px",flexShrink:0,marginLeft:12}}>Cerrar</button>
          </div>

          {/* KPIs */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
            {[["Pagos registrados",pagosTotales.length],["Total pagado",`USD ${totalPagado}`],["Deuda",cliente.deuda_restante>0?`USD ${cliente.deuda_restante}`:"—"]].map(([l,v])=>(
              <div key={l} style={{background:t.dark?"#0d1526":"#f8f6f3",borderRadius:12,padding:"12px 14px",border:`1px solid ${t.cardBorder}`}}>
                <div style={{fontSize:10,color:t.textMuted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:5}}>{l}</div>
                <div style={{fontSize:18,fontWeight:800,color:t.text}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Datos */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
            {[
              ["Servicio",svcLabel(cliente.servicio)],
              ["Estado",<span style={badgeStyle(cliente.estadoSistema)}>{cliente.estadoSistema?.toUpperCase()}</span>],
              ["Vencimiento",formatDate(cliente.vencimiento)],
              ["Días restantes",cliente.dias!=null?String(cliente.dias):"—"],
              ["Inicio",formatDate(cliente.fecha_inicio)],
              ["Teléfono",cliente.telefono||"—"],
            ].map(([l,v])=>(
              <div key={l}>
                <div style={{fontSize:10,color:t.textMuted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:3}}>{l}</div>
                <div style={{fontSize:13,color:t.text,fontWeight:500}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Contenido scrollable ── */}
        <div style={{padding:"0 28px 28px",flexShrink:0}}>

          {/* Nueva nota */}
          <div style={{borderTop:`1px solid ${t.tdBorder}`,paddingTop:18,marginBottom:18}}>
            <label style={{fontSize:11,color:t.textMuted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",display:"block",marginBottom:8}}>
              Agregar nota
            </label>
            <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
              <textarea value={nuevaNota} onChange={e=>setNuevaNota(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey))enviarNota();}}
                placeholder="Escribí una observación o seguimiento..."
                rows={2}
                style={{flex:1,padding:"10px 14px",borderRadius:10,border:`1px solid ${t.inputBorder}`,fontSize:13,outline:"none",boxSizing:"border-box",background:t.inputBg,color:t.inputText,resize:"none",fontFamily:"inherit",lineHeight:1.5}}/>
              <button onClick={enviarNota} disabled={sending||!nuevaNota.trim()}
                style={{...btn(false,true),padding:"10px 16px",opacity:(!nuevaNota.trim()||sending)?0.5:1,flexShrink:0}}>
                {sending?"...":"Guardar"}
              </button>
            </div>
            <div style={{color:t.textMuted,fontSize:11,marginTop:4}}>Ctrl+Enter para guardar rápido</div>
          </div>

          {/* Timeline paginado */}
          <div style={{marginBottom:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <h4 style={{margin:0,color:t.text,fontSize:14,fontWeight:700}}>Historial del cliente</h4>
              {timeline.length>0&&<span style={{color:t.textMuted,fontSize:12}}>{timeline.length} registro{timeline.length!==1?"s":""}</span>}
            </div>
            {loadingTL?(
              <div style={{color:t.textMuted,fontSize:13,padding:"8px 0"}}>Cargando...</div>
            ):timeline.length===0?(
              <div style={{color:t.textMuted,fontSize:13,padding:"8px 0"}}>Sin registros todavía.</div>
            ):(
              <>
                <div style={{display:"grid",gap:8}}>
                  {tlRows.map(item=>{
                    const{icon,color,bg}=tipoStyle(item.tipo);
                    return(
                      <div key={item.id} style={{display:"flex",gap:10,padding:"10px 12px",borderRadius:10,background:bg,border:`1px solid ${t.cardBorder}`}}>
                        <div style={{fontSize:16,flexShrink:0,lineHeight:1.5}}>{icon}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontSize:12,fontWeight:700,color}}>{tipoLabel(item.tipo)}</span>
                            <span style={{fontSize:11,color:t.textMuted,whiteSpace:"nowrap"}}>{formatDateTime(item.created_at)}</span>
                          </div>
                          {item.contenido&&<div style={{fontSize:12,color:t.text,marginTop:3,lineHeight:1.5}}>{item.contenido}</div>}
                          {item.detalle&&<div style={{fontSize:11,color:t.textMuted,marginTop:2}}>
                            {Object.entries(item.detalle).map(([k,v])=>`${k}: ${v}`).join(" · ")}
                          </div>}
                          <div style={{fontSize:11,color:t.textMuted,marginTop:2}}>por {item.usuario_email}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Paginación inline del timeline */}
                {tlTotal>1&&(
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
                    <span style={{fontSize:12,color:t.textMuted}}>Página {tlPage} de {tlTotal}</span>
                    <div style={{display:"flex",gap:6}}>
                      <button style={{...btn(false),padding:"5px 11px",fontSize:12}} onClick={()=>setTlPage(p=>Math.max(1,p-1))} disabled={tlPage===1}>Anterior</button>
                      {Array.from({length:tlTotal},(_,i)=>i+1).map(n=>(
                        <button key={n} style={{...btn(n===tlPage),padding:"5px 9px",fontSize:12}} onClick={()=>setTlPage(n)}>{n}</button>
                      ))}
                      <button style={{...btn(false),padding:"5px 11px",fontSize:12}} onClick={()=>setTlPage(p=>Math.min(tlTotal,p+1))} disabled={tlPage===tlTotal}>Siguiente</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Pagos en ingresos */}
          {pagosTotales.length>0&&(
            <div style={{borderTop:`1px solid ${t.tdBorder}`,paddingTop:16,marginBottom:18}}>
              <h4 style={{margin:"0 0 10px",color:t.text,fontSize:14,fontWeight:700}}>Pagos en tabla de ingresos</h4>
              <div style={{borderRadius:10,border:`1px solid ${t.cardBorder}`,overflow:"hidden"}}>
                <table style={S.table}>
                  <thead><tr style={S.thRow}>{["Fecha","Servicio","Monto","Notas"].map(h=>(
                    <th key={h} style={{...S.td,fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:t.textMuted}}>{h}</th>
                  ))}</tr></thead>
                  <tbody>{pagosTotales.map(i=>(
                    <tr key={i.id}>
                      <td style={S.td}>{formatDate(i.fecha_pago)}</td>
                      <td style={S.td}>{svcLabel(i.servicio)}</td>
                      <td style={{...S.td,color:t.accent,fontWeight:700}}>{money(i.monto)}</td>
                      <td style={S.td}>{i.notas||"—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Acciones */}
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",paddingTop:4}}>
            <button style={btn(false)} onClick={()=>{onClose();onAbrirRenovar(cliente);}}>Renovar</button>
            <button style={{...btn(false),background:"rgba(239,68,68,0.1)",color:"#ef4444"}} onClick={()=>onEliminar(cliente)}>Eliminar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PagoModal ────────────────────────────────────────────────────────────────
function PagoModal({cliente,onClose,onConfirm,t}){
  const S=makeS(t);const btn=makeBtn(t);
  const [monto,setMonto]=useState("");
  if(!cliente)return null;
  const deuda=safeNum(cliente.deuda_restante);
  const montoN=Number(monto)||0;
  const restante=Math.max(0,deuda-montoN);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(8,14,26,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,zIndex:2000}} onClick={onClose}>
      <div style={{background:t.cardBg,borderRadius:18,padding:32,border:`1px solid ${t.cardBorder}`,maxWidth:400,width:"100%",boxShadow:"0 32px 80px rgba(0,0,0,0.6)"}} onClick={e=>e.stopPropagation()}>
        <h3 style={{margin:"0 0 4px",color:t.text,fontSize:18,fontWeight:800}}>Registrar pago parcial</h3>
        <p style={{margin:"0 0 20px",color:t.textMuted,fontSize:13}}>
          <strong style={{color:t.text}}>{cliente.nombre}</strong> · Deuda total: <strong style={{color:"#ef4444"}}>USD {deuda}</strong>
        </p>
        <div style={{marginBottom:8}}>
          <label style={S.label}>Monto a abonar hoy ({formatDate(toISODate(getToday()))}) (USD)</label>
          <input type="number" style={S.input} placeholder="0" min="1" max={deuda} value={monto}
            onChange={e=>setMonto(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&montoN>0&&montoN<=deuda&&onConfirm(cliente,montoN)}/>
        </div>
        {montoN>0&&montoN<=deuda&&(
          <div style={{marginBottom:20,padding:"10px 14px",borderRadius:10,background:t.dark?"#0d1526":"#f8f6f3",fontSize:13,color:t.textMuted}}>
            Deuda restante después del pago: <strong style={{color:restante===0?"#22c55e":"#ef4444"}}>USD {restante}</strong>
            {restante===0&&<span style={{color:"#22c55e",marginLeft:8,fontWeight:700}}>✓ Deuda cancelada</span>}
          </div>
        )}
        {montoN>deuda&&deuda>0&&(
          <div style={{marginBottom:20,padding:"10px 14px",borderRadius:10,background:"rgba(239,68,68,0.1)",fontSize:13,color:"#ef4444"}}>
            El monto supera la deuda actual de USD {deuda}
          </div>
        )}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button style={btn(false)} onClick={onClose}>Cancelar</button>
          <button style={{...btn(false,true),opacity:montoN<=0||montoN>deuda?0.5:1}} disabled={montoN<=0||montoN>deuda}
            onClick={()=>onConfirm(cliente,montoN)}>
            Registrar ingreso
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function Pagination({page,totalPages,setPage,sectionRef,t}){
  const btn=makeBtn(t);
  if(totalPages<=1)return null;
  function goTo(n){setPage(n);setTimeout(()=>sectionRef?.current?.scrollIntoView({behavior:"smooth",block:"start"}),50);}
  return(
    <div style={{marginTop:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
      <div style={{color:t.textMuted,fontSize:13}}>Página {page} de {totalPages}</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <button style={{...btn(false),padding:"7px 13px",fontSize:13}} onClick={()=>goTo(Math.max(1,page-1))} disabled={page===1}>Anterior</button>
        {Array.from({length:totalPages},(_,i)=>i+1).map(n=>(
          <button key={n} style={{...btn(n===page),padding:"7px 11px",fontSize:13}} onClick={()=>goTo(n)}>{n}</button>
        ))}
        <button style={{...btn(false),padding:"7px 13px",fontSize:13}} onClick={()=>goTo(Math.min(totalPages,page+1))} disabled={page===totalPages}>Siguiente</button>
      </div>
    </div>
  );
}

function TableHeader({cols,t}){
  const S=makeS(t);
  return(
    <tr style={S.thRow}>
      {cols.map(h=>(<th key={h} style={{textAlign:"left",...S.td,color:t.textMuted,fontWeight:700,fontSize:11,letterSpacing:"0.06em",textTransform:"uppercase"}}>{h}</th>))}
    </tr>
  );
}

function MetricCard({title,value,sub,accent,trend,t}){
  const S=makeS(t);
  return(
    <div style={{...S.card,borderTop:accent?`3px solid ${t.accent}`:undefined}}>
      <div style={{fontSize:11,color:t.textMuted,marginBottom:8,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>{title}</div>
      <div style={{fontSize:26,fontWeight:800,color:accent?t.accent:t.text,letterSpacing:"-0.02em",display:"flex",alignItems:"center",gap:8}}>
        {value}
        {trend!=null&&<span style={{fontSize:13,fontWeight:700,color:trend>0?"#22c55e":trend<0?"#ef4444":t.textMuted}}>{trend>0?"↑":trend<0?"↓":"→"} {Math.abs(trend)}%</span>}
      </div>
      {sub&&<div style={{marginTop:5,fontSize:12,color:t.textMuted}}>{sub}</div>}
    </div>
  );
}

function BarList({items,t}){
  const max=Math.max(...items.map(i=>i.value),1);
  return(
    <div style={{display:"grid",gap:14}}>
      {items.map(({label,value})=>{
        const pct=Math.max((value/max)*100,value>0?4:0);
        return(
          <div key={label}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:14,color:t.text}}>
              <span>{label}</span><strong style={{color:t.accent}}>{money(value)}</strong>
            </div>
            <div style={{height:8,background:t.barBg,borderRadius:999,overflow:"hidden"}}>
              <div style={{width:`${pct}%`,height:"100%",background:t.accentGrad,borderRadius:999}}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BreakdownCard({title,breakdown,t}){
  const S=makeS(t);
  const items=[{key:"mensual",label:"Plan inversor mensual"},{key:"anual",label:"Plan inversor anual"},{key:"clases",label:"Clases"}];
  return(
    <div style={S.card}>
      <h3 style={{marginTop:0,color:t.text,fontWeight:700,fontSize:16,marginBottom:18}}>{title}</h3>
      <BarList items={items.map(({key,label})=>({label,value:safeNum(breakdown[key])}))} t={t}/>
    </div>
  );
}

// ─── Gráfico línea ────────────────────────────────────────────────────────────
function LineChart({ingresos,t}){
  const today=getToday();
  const availableMonths=useMemo(()=>{
    const keys=new Set();
    ingresos.forEach(i=>{if(i.fecha_pago)keys.add(monthKey(i.fecha_pago));});
    keys.add(monthKey(toISODate(today)));
    return Array.from(keys).sort().reverse();
  },[ingresos]);
  const[sel,setSel]=useState(monthKey(toISODate(today)));
  const[tip,setTip]=useState(null);
  const data=useMemo(()=>{const[y,m]=sel.split("-");return buildDailySeriesForMonth(ingresos,Number(y),Number(m)-1);},[ingresos,sel]);
  const S=makeS(t);
  const W=760,H=220,PL=50,PR=16,PT=16,PB=36,cW=W-PL-PR,cH=H-PT-PB;
  const maxVal=Math.max(...data.map(d=>d.total),1);
  const pts=data.map((d,i)=>({x:PL+(i/Math.max(data.length-1,1))*cW,y:PT+cH-(d.total/maxVal)*cH,d}));
  const pathD=pts.map((p,i)=>`${i===0?"M":"L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaD=`${pathD} L ${pts[pts.length-1].x.toFixed(1)} ${(PT+cH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(PT+cH).toFixed(1)} Z`;
  const yT=[0,.25,.5,.75,1].map(f=>({val:Math.round(maxVal*f),y:PT+cH-f*cH}));
  return(
    <div>
      <div style={{marginBottom:16}}>
        <select value={sel} onChange={e=>setSel(e.target.value)} style={{...S.input,width:"auto",minWidth:200}}>
          {availableMonths.map(k=>(<option key={k} value={k}>{monthLabel(k)}</option>))}
        </select>
      </div>
      <div style={{position:"relative",width:"100%",overflowX:"auto"}}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",display:"block"}}>
          <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={t.accent} stopOpacity=".22"/><stop offset="100%" stopColor={t.accent} stopOpacity=".01"/></linearGradient></defs>
          {yT.map(tk=>(<g key={tk.val}><line x1={PL} y1={tk.y} x2={W-PR} y2={tk.y} stroke={t.tdBorder} strokeWidth="1"/><text x={PL-6} y={tk.y+4} textAnchor="end" fontSize="11" fill={t.textMuted}>{tk.val}</text></g>))}
          {pts.filter((_,i)=>i%5===0||i===pts.length-1).map(p=>(<text key={p.d.day} x={p.x} y={H-6} textAnchor="middle" fontSize="11" fill={t.textMuted}>{p.d.label}</text>))}
          <path d={areaD} fill="url(#ag)"/>
          <path d={pathD} fill="none" stroke={t.accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
          {pts.map(p=>(<rect key={p.d.day} x={p.x-cW/data.length/2} y={PT} width={cW/data.length} height={cH} fill="transparent" onMouseEnter={()=>setTip(p)} onMouseLeave={()=>setTip(null)}/>))}
          {tip&&<circle cx={tip.x} cy={tip.y} r="5" fill={t.accent} stroke={t.cardBg} strokeWidth="2"/>}
        </svg>
        {tip&&(
          <div style={{position:"absolute",top:Math.max(0,tip.y-8),left:Math.min(tip.x+10,W-145),background:t.cardBg,border:`1px solid ${t.cardBorder}`,borderRadius:12,padding:"10px 14px",pointerEvents:"none",zIndex:10,fontSize:13,boxShadow:t.cardShadow,minWidth:130}}>
            <div style={{fontWeight:700,color:t.text,marginBottom:4}}>Día {tip.d.day}</div>
            <div style={{color:t.accent,fontWeight:800,fontSize:15}}>USD {tip.d.total}</div>
            <div style={{color:t.textMuted,fontSize:12,marginTop:4}}>{tip.d.ventas} venta{tip.d.ventas!==1?"s":""}</div>
            {tip.d.mensual>0&&<div style={{color:t.textMuted,fontSize:12}}>Mensual: USD {tip.d.mensual}</div>}
            {tip.d.anual>0&&<div style={{color:t.textMuted,fontSize:12}}>Anual: USD {tip.d.anual}</div>}
            {tip.d.clases>0&&<div style={{color:t.textMuted,fontSize:12}}>Clases: USD {tip.d.clases}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Torta ────────────────────────────────────────────────────────────────────
function PieChart({breakdown,title,t}){
  const S=makeS(t);
  const[hov,setHov]=useState(null);
  const slices=[{key:"mensual",label:"Plan inversor mensual",color:t.accent},{key:"anual",label:"Plan inversor anual",color:"#5b8dee"},{key:"clases",label:"Clases",color:"#34d399"}];
  const total=slices.reduce((a,s)=>a+safeNum(breakdown[s.key]),0);
  if(total===0)return(<div style={S.card}><h3 style={{marginTop:0,color:t.text,fontWeight:700,fontSize:16,marginBottom:12}}>{title}</h3><div style={{color:t.textMuted}}>Sin datos disponibles.</div></div>);
  const CX=90,CY=90,R=72,RI=40;let angle=-Math.PI/2;
  const paths=slices.map(s=>{
    const val=safeNum(breakdown[s.key]);
    const sw=(val/total)*2*Math.PI;
    const x1=CX+R*Math.cos(angle),y1=CY+R*Math.sin(angle);
    const x2=CX+R*Math.cos(angle+sw),y2=CY+R*Math.sin(angle+sw);
    const xi1=CX+RI*Math.cos(angle),yi1=CY+RI*Math.sin(angle);
    const xi2=CX+RI*Math.cos(angle+sw),yi2=CY+RI*Math.sin(angle+sw);
    const lg=sw>Math.PI?1:0;
    const d=`M ${xi1} ${yi1} L ${x1} ${y1} A ${R} ${R} 0 ${lg} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${RI} ${RI} 0 ${lg} 0 ${xi1} ${yi1} Z`;
    angle+=sw;
    return{...s,val,pct:Math.round((val/total)*100),d};
  }).filter(s=>s.val>0);
  return(
    <div style={S.card}>
      <h3 style={{marginTop:0,color:t.text,fontWeight:700,fontSize:16,marginBottom:16}}>{title}</h3>
      <div style={{display:"flex",alignItems:"center",gap:24,flexWrap:"wrap"}}>
        <svg viewBox="0 0 180 180" style={{width:170,flexShrink:0}}>
          {paths.map(p=>(<path key={p.key} d={p.d} fill={p.color} opacity={hov&&hov!==p.key?.35:1} style={{cursor:"pointer",transition:"opacity 0.15s"}} onMouseEnter={()=>setHov(p.key)} onMouseLeave={()=>setHov(null)}/>))}
          <text x={CX} y={CY-7} textAnchor="middle" fontSize="12" fontWeight="700" fill={t.textMuted}>TOTAL</text>
          <text x={CX} y={CY+10} textAnchor="middle" fontSize="14" fontWeight="800" fill={t.accent}>{total}</text>
        </svg>
        <div style={{display:"grid",gap:10}}>
          {paths.map(p=>(<div key={p.key} style={{display:"flex",alignItems:"center",gap:10,opacity:hov&&hov!==p.key?.35:1,transition:"opacity 0.15s"}} onMouseEnter={()=>setHov(p.key)} onMouseLeave={()=>setHov(null)}><div style={{width:11,height:11,borderRadius:3,background:p.color,flexShrink:0}}/><div><div style={{fontSize:13,fontWeight:600,color:t.text}}>{p.label}</div><div style={{fontSize:12,color:t.textMuted}}>USD {p.val} · {p.pct}%</div></div></div>))}
        </div>
      </div>
    </div>
  );
}

// ─── ClienteCard (paneles críticos) ──────────────────────────────────────────
// nameColor: color fijo para el nombre — oscuro sobre fondos claros (gracia/vencidos), claro sobre oscuros (por vencer dark mode)
function ClienteCard({cliente,accentBorder,accentBg,accentText,nameColor,dateLabel,onRenovarRapido,onAbrirRenovar,onEliminar,onVerDetalle,t}){
  const btn=makeBtn(t);
  return(
    <div style={{border:`1px solid ${accentBorder}`,background:accentBg,borderRadius:12,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,transition:"box-shadow 0.15s"}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 2px 12px rgba(0,0,0,0.15)`}
      onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
      <div style={{cursor:"pointer",flex:1}} onClick={()=>onVerDetalle(cliente)}>
        <div style={{fontWeight:700,color:nameColor||t.text,fontSize:14}}>{cliente.nombre}</div>
        <div style={{fontSize:12,color:accentText,marginTop:2}}>{svcLabel(cliente.servicio)} · {dateLabel} {formatDate(cliente.vencimiento)}</div>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button style={{...btn(true),padding:"7px 11px",fontSize:13}} title="Renovar" onClick={()=>onRenovarRapido(cliente)}>✔</button>
        <button style={{...btn(false),padding:"7px 11px",fontSize:13}} title="Editar" onClick={()=>onAbrirRenovar(cliente)}>✏️</button>
        <button style={{...btn(false),padding:"7px 11px",fontSize:13}} title="Eliminar" onClick={()=>onEliminar(cliente)}>🗑</button>
      </div>
    </div>
  );
}

function CriticosPanel({titulo,badgeBg,badgeColor,clientes,rows,page,totalPages,setPage,accentBorder,accentBg,accentText,nameColor,dateLabel,onRenovarRapido,onAbrirRenovar,onEliminar,onVerDetalle,sectionRef,t}){
  const S=makeS(t);
  return(
    <div style={{...S.card,display:"flex",flexDirection:"column",minHeight:280}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:800,color:t.text}}>{titulo}</div>
        <div style={{minWidth:30,height:30,borderRadius:999,display:"flex",alignItems:"center",justifyContent:"center",background:badgeBg,color:badgeColor,fontWeight:800,fontSize:13}}>{clientes.length}</div>
      </div>
      <div style={{flex:1}}>
        {clientes.length?(
          <div style={{display:"grid",gap:8}}>
            {rows.map(c=>(<ClienteCard key={c.id} cliente={c} accentBorder={accentBorder} accentBg={accentBg} accentText={accentText} nameColor={nameColor} dateLabel={dateLabel} onRenovarRapido={onRenovarRapido} onAbrirRenovar={onAbrirRenovar} onEliminar={onEliminar} onVerDetalle={onVerDetalle} t={t}/>))}
          </div>
        ):(
          <div style={{color:t.textMuted,fontSize:13}}>Sin clientes en esta categoría.</div>
        )}
      </div>
      <Pagination page={page} totalPages={totalPages} setPage={setPage} sectionRef={sectionRef} t={t}/>
    </div>
  );
}

// ─── ClienteForm ─────────────────────────────────────────────────────────────
function ClienteForm({title,subtitle,form,setForm,onGuardar,onCancelar,guardando,isModal=false,t}){
  const S=makeS(t);const btn=makeBtn(t);
  const isClases=form.servicio==="clases";
  const inner=(
    <div style={{width:"100%",maxWidth:isModal?860:undefined,background:t.cardBg,borderRadius:16,padding:28,boxShadow:isModal?"0 32px 80px rgba(0,0,0,0.5)":undefined,border:`1px solid ${t.cardBorder}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
        <div>
          <h3 style={{margin:0,color:t.text,fontSize:18,fontWeight:800}}>{title}</h3>
          {subtitle&&<div style={{color:t.textMuted,fontSize:13,marginTop:4}}>{subtitle}</div>}
        </div>
        {isModal&&<button onClick={onCancelar} style={btn(false)}>Cerrar</button>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16}}>
        {/* Nombre siempre primero */}
        <Field label="Nombre y apellido" t={t}>
          <input style={S.input} placeholder="Ej: Luis Pérez" value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})}/>
        </Field>
        {/* Servicio al lado del nombre — así el usuario elige clases antes de ver el campo email */}
        <Field label="Servicio" t={t}>
          <select style={S.input} value={form.servicio} onChange={e=>{const s=e.target.value;setForm({...form,servicio:s,monto:svcAmount(s),duracion_dias:svcDuration(s),email:s==="clases"?"":form.email});}}>
            <option value="mensual">Plan inversor mensual</option>
            <option value="anual">Plan inversor anual</option>
            <option value="clases">Clases</option>
          </select>
        </Field>
        {/* Email solo para planes — clases no lo necesita */}
        {!isClases&&(
          <Field label="Email" t={t}>
            <input style={S.input} placeholder="correo@ejemplo.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
          </Field>
        )}
        <Field label="Teléfono / WhatsApp" t={t}>
          <input style={S.input} placeholder="Ej: 5491112345678" value={form.telefono||""} onChange={e=>setForm({...form,telefono:e.target.value})}/>
        </Field>
        <Field label={isModal?"Fecha de renovación":"Fecha de inicio"} t={t}>
          <input type="date" style={S.input} value={form.fecha_inicio} onChange={e=>setForm({...form,fecha_inicio:e.target.value})}/>
        </Field>
        <Field label="Monto (USD)" t={t}>
          <input type="number" style={S.input} placeholder="0" value={form.monto} onChange={e=>setForm({...form,monto:e.target.value})}/>
        </Field>
        {!isClases&&(
          <Field label="Duración (días)" t={t}>
            <input type="number" style={S.input} placeholder="30" value={form.duracion_dias} onChange={e=>setForm({...form,duracion_dias:e.target.value})}/>
          </Field>
        )}
        <Field label="Deuda restante (USD)" t={t}>
          <input type="number" style={S.input} placeholder="0" value={form.deuda_restante} onChange={e=>setForm({...form,deuda_restante:e.target.value})}/>
        </Field>
        <Field label="Notas" spanAll t={t}>
          <input style={S.input} placeholder="Observaciones opcionales" value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})}/>
        </Field>
      </div>
      <div style={{marginTop:20,display:"flex",justifyContent:"flex-end",gap:10}}>
        {isModal&&<button onClick={onCancelar} style={btn(false)}>Cancelar</button>}
        <button style={btn(false,true)} onClick={onGuardar}>{guardando?"Guardando...":isModal?"Confirmar renovación":"Guardar cliente"}</button>
      </div>
    </div>
  );
  if(!isModal)return inner;
  return(<div style={{position:"fixed",inset:0,background:"rgba(8,14,26,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,zIndex:1000}} onClick={onCancelar}><div onClick={e=>e.stopPropagation()}>{inner}</div></div>);
}
function Field({label,children,spanAll=false,t}){
  const S=makeS(t);
  return(<div style={{gridColumn:spanAll?"1 / -1":"auto"}}><label style={S.label}>{label}</label>{children}</div>);
}

// ─── Vista Historial ──────────────────────────────────────────────────────────
function HistorialView({t}){
  const S=makeS(t);
  const[hist,setHist]=useState([]);
  const[loading,setLoading]=useState(true);
  const ref=useRef(null);
  const pag=usePagination(hist,PAGE.hist);
  useEffect(()=>{
    supabase.from("historial_cambios").select("*").order("created_at",{ascending:false}).limit(200)
      .then(({data,error})=>{if(!error)setHist(data||[]);setLoading(false);});
  },[]);
  function badge(accion){
    const b={display:"inline-block",padding:"3px 9px",borderRadius:999,fontSize:11,fontWeight:700,border:"1px solid transparent"};
    if(accion?.includes("eliminó"))return{...b,background:"#fee2e2",color:"#991b1b",borderColor:"#fca5a5"};
    if(accion?.includes("renovó")||accion?.includes("renovación"))return{...b,background:"#ede9fe",color:"#5b21b6",borderColor:"#c4b5fd"};
    if(accion?.includes("guardó")||accion?.includes("nuevo"))return{...b,background:"#d1fae5",color:"#065f46",borderColor:"#6ee7b7"};
    if(accion?.includes("pago"))return{...b,background:"#fff7ed",color:"#9a3412",borderColor:"#fdba74"};
    return{...b,background:"#f1f5f9",color:"#334155",borderColor:"#cbd5e1"};
  }
  return(
    <div ref={ref} style={S.card}>
      <div style={{marginBottom:20}}>
        <h3 style={{margin:0,color:t.text,fontWeight:800,fontSize:20}}>Historial de cambios</h3>
      </div>
      {loading?<Skeleton rows={6} cols={5} t={t}/>:hist.length===0?(
        <div style={{color:t.textMuted,padding:24,textAlign:"center"}}>Sin registros en las últimas 24 horas.</div>
      ):(
        <>
          <div style={{overflowX:"auto"}}>
            <table style={S.table}>
              <thead><TableHeader cols={["Fecha y hora","Usuario","Acción","Cliente","Detalle"]} t={t}/></thead>
              <tbody>
                {pag.rows.map(h=>(
                  <tr key={h.id}>
                    <td style={{...S.td,whiteSpace:"nowrap",fontSize:13}}>{formatDateTime(h.created_at)}</td>
                    <td style={{...S.td,fontSize:13}}>{h.usuario_email||"-"}</td>
                    <td style={S.td}><span style={badge(h.accion)}>{h.accion||"-"}</span></td>
                    <td style={{...S.td,fontWeight:600}}>{h.detalle?.nombre||h.entidad||"-"}</td>
                    <td style={{...S.td,color:t.textMuted,fontSize:12,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {h.detalle?Object.entries(h.detalle).filter(([k])=>k!=="nombre").map(([k,v])=>`${k}: ${v}`).join(" · ").slice(0,90):"—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pag.page} totalPages={pag.totalPages} setPage={pag.setPage} sectionRef={ref} t={t}/>
        </>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function App(){
  const[user,setUser]=useState(null);
  const[emailLogin,setEmailLogin]=useState("");
  const[password,setPassword]=useState("");
  const[showPwd,setShowPwd]=useState(false);
  const[clientes,setClientes]=useState([]);
  const[ingresos,setIngresos]=useState([]);
  const[loading,setLoading]=useState(true);
  const[activeView,setActiveView]=useState("operativa");
  const[showForm,setShowForm]=useState(false);
  const[showRenovar,setShowRenovar]=useState(false);
  const[guardando,setGuardando]=useState(false);
  const[renovando,setRenovando]=useState(false);
  const[busqueda,setBusqueda]=useState("");
  const[filtro,setFiltro]=useState("todos");
  const[form,setForm]=useState(FORM_DEF);
  const[renovarForm,setRenovarForm]=useState({...FORM_DEF,id:null});
  const[dark,setDark]=useState(false);
  const[clienteDetalle,setClienteDetalle]=useState(null);
  const[pagoCliente,setPagoCliente]=useState(null);
  const[confirm,setConfirm]=useState(null);
  const[busquedaRapida,setBusquedaRapida]=useState(false);
  const[ingDesde,setIngDesde]=useState("");
  const[ingHasta,setIngHasta]=useState("");
  const[emailSaved,setEmailSaved]=useState(null);

  const toast=useToast();

  const baseRef=useRef(null);const vencRef=useRef(null);
  const deudRef=useRef(null);const clasesRef=useRef(null);
  const ingRef=useRef(null);const critRef=useRef(null);const dormRef=useRef(null);

  useEffect(()=>{applyDateColorScheme(dark);},[dark]);

  const t=getT(dark);const S=makeS(t);const btn=makeBtn(t);const navBtn=makeNavBtn(t);

  // Ctrl+K
  useEffect(()=>{
    function onKey(e){if((e.ctrlKey||e.metaKey)&&e.key==="k"){e.preventDefault();setBusquedaRapida(true);}}
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[]);

  function askConfirm(title,message,onConfirm,{danger=false,label="Confirmar"}={}){
    setConfirm({title,message,onConfirm,danger,label});
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setUser(data.session?.user||null));
    const{data:listener}=supabase.auth.onAuthStateChange((_e,s)=>setUser(s?.user||null));
    return()=>listener.subscription.unsubscribe();
  },[]);
  async function login(){
    const{error}=await supabase.auth.signInWithPassword({email:emailLogin,password});
    if(error)toast.error(traducirError(error.message));
  }
  async function logout(){await supabase.auth.signOut();}

  // ── Fetch ──────────────────────────────────────────────────────────────────
  async function fetchClientes(){
    setLoading(true);
    const{data,error}=await supabase.from("clientes").select("*").order("id",{ascending:false});
    if(error){toast.error("No se pudieron cargar los clientes");setLoading(false);return;}
    setClientes(data||[]);setLoading(false);
  }
  async function fetchIngresos(){
    const{data,error}=await supabase.from("ingresos").select("*").order("fecha_pago",{ascending:false});
    if(error){toast.error("No se pudieron cargar los ingresos");return;}
    setIngresos(data||[]);
  }
  async function refetch(){await Promise.all([fetchClientes(),fetchIngresos()]);}
  useEffect(()=>{fetchClientes();fetchIngresos();limpiarHistorial();},[]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function validateForm(f){
    const nombre=f.nombre.trim();const emailVal=f.email.trim().toLowerCase();
    if(!nombre){toast.error("Falta el nombre y apellido");return null;}
    // Email solo requerido para planes — clases no lo necesita
    if(f.servicio!=="clases"){
      if(!emailVal){toast.error("Falta el email");return null;}
      if(!isValidEmail(emailVal)){toast.error("El email no es válido");return null;}
    }
    if(f.servicio!=="clases"&&Number(f.duracion_dias||0)<=0){toast.error("Falta la duración en días");return null;}
    return{nombre,email:emailVal};
  }
  function buildPayload(f,nombre,emailVal){
    const dur=f.servicio==="clases"?0:Number(f.duracion_dias||0);
    return{...f,nombre,email:emailVal,estado_manual:"activo",monto:Number(f.monto||0),duracion_dias:dur,deuda_restante:Number(f.deuda_restante||0),telefono:f.telefono||"",
      fecha_vencimiento:f.servicio==="clases"||dur<=0?null:toISODate(addDays(f.fecha_inicio,dur))};
  }
  function buildIng(cid,nombre,emailVal,servicio,monto,fecha,notas){
    return{cliente_id:cid,cliente_nombre:nombre,email:emailVal,servicio,monto:Number(monto||0),fecha_pago:fecha,notas:notas||""};
  }

  async function guardarCliente(){
    const v=validateForm(form);if(!v)return;
    const dup=clientes.find(c=>c.email?.toLowerCase()===v.email);
    if(dup){toast.error(`Ya existe un cliente con el email ${v.email}`);return;}
    setGuardando(true);
    const payload=buildPayload(form,v.nombre,v.email);
    const{data:ins,error}=await supabase.from("clientes").insert([payload]).select().single();
    if(error){setGuardando(false);toast.error("No se pudo guardar el cliente");return;}
    await supabase.from("ingresos").insert([buildIng(ins.id,ins.nombre,ins.email,ins.servicio,ins.monto,ins.fecha_inicio,ins.notas)]);
    await logH(user?.email,"guardó nuevo cliente","cliente",ins.id,{nombre:ins.nombre,email:ins.email,servicio:ins.servicio,monto:ins.monto});
    await logNC(ins.id,user?.email,"alta",`Cliente dado de alta. Servicio: ${svcLabel(ins.servicio)} · Monto: USD ${ins.monto}`,{servicio:ins.servicio,monto:ins.monto});
    llamarDrive("compartir", ins.email); // compartir carpeta Cursos
    setGuardando(false);setShowForm(false);setForm(FORM_DEF);
    toast.success(`${v.nombre} agregado correctamente`);refetch();
  }
  async function guardarRenovacion(){
    const v=validateForm(renovarForm);if(!v)return;
    setRenovando(true);
    const payload=buildPayload(renovarForm,v.nombre,v.email);
    const{error:eC}=await supabase.from("clientes").update(payload).eq("id",renovarForm.id);
    if(eC){setRenovando(false);toast.error("No se pudo renovar el cliente");return;}
    await supabase.from("ingresos").insert([buildIng(renovarForm.id,v.nombre,v.email,renovarForm.servicio,renovarForm.monto,toISODate(getToday()),renovarForm.notas)]);
    await logH(user?.email,"renovación de cliente","cliente",renovarForm.id,{nombre:v.nombre,servicio:renovarForm.servicio,monto:renovarForm.monto});
    await logNC(renovarForm.id,user?.email,"renovación",`Renovación de plan. Servicio: ${svcLabel(renovarForm.servicio)} · Monto: USD ${renovarForm.monto}`,{servicio:renovarForm.servicio,monto:renovarForm.monto});
    llamarDrive("compartir", v.email); // mantener/renovar acceso Drive
    setRenovando(false);setShowRenovar(false);
    toast.success(`${v.nombre} renovado correctamente`);refetch();
  }
  async function renovarRapido(cliente){
    const today=getToday();
    const dur=cliente.servicio==="clases"?0:Number(cliente.duracion_dias||svcDuration(cliente.servicio));
    const va=cliente.vencimiento||cliente.fecha_vencimiento||null;
    let fb=toISODate(today);
    if(va&&(cliente.estadoSistema==="activo"||cliente.estadoSistema==="gracia"))fb=va;
    const nv=cliente.servicio==="clases"||dur<=0?null:toISODate(addDays(fb,dur));
    const payload={nombre:cliente.nombre||"",email:(cliente.email||"").trim().toLowerCase(),servicio:cliente.servicio,fecha_inicio:fb,monto:Number(cliente.monto||0),duracion_dias:dur,estado_manual:"activo",deuda_restante:Number(cliente.deuda_restante||0),notas:cliente.notas||"",telefono:cliente.telefono||"",fecha_vencimiento:nv};
    const{error:eC}=await supabase.from("clientes").update(payload).eq("id",cliente.id);
    if(eC){toast.error("No se pudo renovar el cliente");return;}
    await supabase.from("ingresos").insert([buildIng(cliente.id,cliente.nombre||"",(cliente.email||"").trim().toLowerCase(),cliente.servicio,cliente.monto,toISODate(today),cliente.notas)]);
    await logH(user?.email,"renovó rápido cliente","cliente",cliente.id,{nombre:cliente.nombre,servicio:cliente.servicio,monto:cliente.monto});
    await logNC(cliente.id,user?.email,"renovación",`Renovación rápida. Servicio: ${svcLabel(cliente.servicio)} · Monto: USD ${cliente.monto}`,{servicio:cliente.servicio,monto:cliente.monto});
    llamarDrive("compartir", (cliente.email||"").trim().toLowerCase()); // mantener acceso Drive
    toast.success(`${cliente.nombre} renovado con el mismo plan`);refetch();
  }
  async function eliminarClienteConfirmado(cliente){
    // Quitar de pantalla inmediatamente sin destello
    setClientes(prev=>prev.filter(c=>c.id!==cliente.id));
    setIngresos(prev=>prev.filter(i=>i.cliente_id!==cliente.id));
    setClienteDetalle(null);
    const{error}=await supabase.from("clientes").delete().eq("id",cliente.id);
    if(error){toast.error("No se pudo eliminar");refetch();return;}
    await logH(user?.email,"eliminó cliente","cliente",cliente.id,{nombre:cliente.nombre,email:cliente.email});
    llamarDrive("revocar",(cliente.email||"").trim().toLowerCase());
    toast.success(`${cliente.nombre} eliminado`);
  }
  async function eliminarIngreso(id){
    const ing=ingresos.find(i=>i.id===id);
    const{error}=await supabase.from("ingresos").delete().eq("id",id);
    if(error){toast.error("No se pudo eliminar el ingreso");return;}
    await logH(user?.email,"eliminó ingreso","ingreso",id,{cliente:ing?.cliente_nombre,monto:ing?.monto});
    toast.success("Ingreso eliminado");fetchIngresos();
  }
  async function cambiarEstado(id,value){
    // Actualización optimista — cambia en pantalla de inmediato sin destello
    setClientes(prev=>prev.map(c=>c.id===id?{...c,estado_manual:value}:c));
    const{error}=await supabase.from("clientes").update({estado_manual:value}).eq("id",id);
    if(error){
      toast.error("No se pudo actualizar");
      // Revertir si falló
      fetchClientes();return;
    }
    const c=clientes.find(cl=>cl.id===id);
    await logH(user?.email,"cambió estado manual","cliente",id,{nombre:c?.nombre,estado:value});
    await logNC(id,user?.email,"estado",`Estado cambiado a: ${value}`,{estado:value});
  }
  async function actualizarEmail(id,nuevoEmail){
    const{error}=await supabase.from("clientes").update({email:nuevoEmail}).eq("id",id);
    if(error){toast.error("No se pudo actualizar el email");return;}
    setEmailSaved(id);setTimeout(()=>setEmailSaved(null),2000);
    fetchClientes();
  }
  async function registrarPagoParcial(cliente,monto){
    if(!monto||monto<=0){toast.error("Ingresá un monto válido");return;}
    if(monto>safeNum(cliente.deuda_restante)){toast.error(`El monto supera la deuda actual (USD ${cliente.deuda_restante})`);return;}
    const nuevaDeuda=Math.max(0,safeNum(cliente.deuda_restante)-monto);
    const fechaHoy=toISODate(getToday());
    // 1. Actualizar deuda en la tabla clientes
    const{error:eD}=await supabase.from("clientes").update({deuda_restante:nuevaDeuda}).eq("id",cliente.id);
    if(eD){toast.error("No se pudo registrar el pago");return;}
    // 2. Registrar como ingreso real con la fecha de hoy
    await supabase.from("ingresos").insert([{
      cliente_id:cliente.id,
      cliente_nombre:cliente.nombre,
      email:cliente.email,
      servicio:cliente.servicio,
      monto:Number(monto),
      fecha_pago:fechaHoy,
      notas:`Pago parcial de deuda. Deuda restante: USD ${nuevaDeuda}`,
    }]);
    await logH(user?.email,"registró pago parcial","cliente",cliente.id,{nombre:cliente.nombre,monto_abonado:monto,deuda_restante:nuevaDeuda});
    await logNC(cliente.id,user?.email,"pago",`Pago de USD ${monto} aplicado a deuda. Deuda restante: USD ${nuevaDeuda}`,{monto_abonado:monto,deuda_restante:nuevaDeuda});
    setPagoCliente(null);
    toast.success(`Pago USD ${monto} registrado. Deuda restante: USD ${nuevaDeuda}`);
    refetch();
  }
  function abrirRenovar(cliente){
    const va=cliente.vencimiento||cliente.fecha_vencimiento||null;
    let fb=toISODate(getToday());
    if(va&&(cliente.estadoSistema==="activo"||cliente.estadoSistema==="gracia"))fb=va;
    setRenovarForm({id:cliente.id,nombre:cliente.nombre||"",email:cliente.email||"",telefono:cliente.telefono||"",servicio:cliente.servicio||"mensual",fecha_inicio:fb,monto:safeNum(cliente.monto),duracion_dias:cliente.servicio==="clases"?0:safeNum(cliente.duracion_dias||svcDuration(cliente.servicio)),deuda_restante:safeNum(cliente.deuda_restante),notas:cliente.notas||""});
    setShowRenovar(true);
  }
  function handleSetView(v){setActiveView(v);setShowForm(false);}

  // ── Datos derivados ───────────────────────────────────────────────────────
  const computed=useMemo(()=>clientes.map(computeClient),[clientes]);
  const filtered=useMemo(()=>computed.filter(c=>{
    const txt=`${c.nombre||""} ${c.email||""} ${c.telefono||""}`.toLowerCase();
    const okB=txt.includes(busqueda.toLowerCase());
    const okF=filtro==="todos"||c.servicio===filtro||c.estadoSistema===filtro;
    return okB&&okF;
  }),[computed,busqueda,filtro]);
  const deudores=useMemo(()=>computed.filter(c=>Number(c.deuda_restante||0)>0),[computed]);
  const clasesList=useMemo(()=>computed.filter(c=>c.servicio==="clases"),[computed]);
  const vencimientos=useMemo(()=>computed.filter(c=>c.servicio!=="clases").sort((a,b)=>(!a.vencimiento?1:!b.vencimiento?-1:a.vencimiento.localeCompare(b.vencimiento))),[computed]);
  const vencimientosCriticos=useMemo(()=>{
    const pv=[],g=[],v=[];
    computed.forEach(c=>{
      if(!c.vencimiento)return;
      if(c.estadoSistema==="activo"&&c.dias>=0&&c.dias<=WARN_DAYS)pv.push(c);
      else if(c.estadoSistema==="gracia")g.push(c);
      else if(c.estadoSistema==="vencido")v.push(c);
    });
    return{hoy:pv,gracia:g,vencidos:v};
  },[computed]);
  const totalCriticos=vencimientosCriticos.hoy.length+vencimientosCriticos.gracia.length+vencimientosCriticos.vencidos.length;
  const dormantes=useMemo(()=>{
    const cutoff=new Date(Date.now()-60*86400000);
    return computed.filter(c=>{
      if(c.estadoSistema!=="activo")return false;
      const ui=ingresos.filter(i=>i.cliente_id===c.id).sort((a,b)=>(b.fecha_pago||"").localeCompare(a.fecha_pago||""))[0];
      if(!ui)return false;
      const fd=parseISODate(ui.fecha_pago);
      return fd&&fd<cutoff;
    });
  },[computed,ingresos]);
  const resumen=useMemo(()=>{
    const b={activos:0,gracia:0,sacar:0,deudores:0,clases:0,ingresos:0};
    computed.forEach(c=>{
      if(c.estadoSistema==="activo")b.activos++;
      if(c.estadoSistema==="gracia")b.gracia++;
      if(c.estadoSistema==="sacar"||c.estadoSistema==="vencido")b.sacar++;
      if(Number(c.deuda_restante||0)>0)b.deudores++;
      if(c.servicio==="clases")b.clases++;
      b.ingresos+=Number(c.monto||0);
    });
    return b;
  },[computed]);
  const totalDeuda=useMemo(()=>deudores.reduce((a,c)=>a+safeNum(c.deuda_restante),0),[deudores]);
  const today=getToday();
  const curMK=monthKey(toISODate(today));
  const prevMD=new Date(today.getFullYear(),today.getMonth()-1,1);
  const curMI=useMemo(()=>ingresos.filter(i=>{const d=parseISODate(i.fecha_pago);return d&&d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth();}),[ingresos]);
  const prevMI=useMemo(()=>ingresos.filter(i=>{const d=parseISODate(i.fecha_pago);return d&&d.getFullYear()===prevMD.getFullYear()&&d.getMonth()===prevMD.getMonth();}),[ingresos]);
  const ingMes=curMI.reduce((a,i)=>a+safeNum(i.monto),0);
  const ingMesAnt=prevMI.reduce((a,i)=>a+safeNum(i.monto),0);
  const trendMes=ingMesAnt>0?Math.round(((ingMes-ingMesAnt)/ingMesAnt)*100):null;
  const dashStats=useMemo(()=>({ingMes,ventasMes:curMI.length,bkMes:buildBreakdown(curMI),bkTotal:buildBreakdown(ingresos)}),[ingresos,curMI,ingMes]);
  const resumenMensual=useMemo(()=>{
    const map=new Map();
    ingresos.forEach(i=>{
      if(!i.fecha_pago)return;
      const key=monthKey(i.fecha_pago);
      if(!map.has(key))map.set(key,{key,mensual:0,anual:0,clases:0,total:0,vM:0,vA:0,vC:0});
      const r=map.get(key);const m=Number(i.monto||0);
      if(i.servicio==="mensual"){r.mensual+=m;r.vM++;}
      else if(i.servicio==="anual"){r.anual+=m;r.vA++;}
      else{r.clases+=m;r.vC++;}
      r.total+=m;
    });
    return Array.from(map.values()).sort((a,b)=>a.key.localeCompare(b.key));
  },[ingresos]);
  const resumenConTrend=useMemo(()=>resumenMensual.map((r,i)=>{
    const prev=resumenMensual[i-1];
    const trend=prev&&prev.total>0?Math.round(((r.total-prev.total)/prev.total)*100):null;
    return{...r,trend};
  }),[resumenMensual]);
  const maxTotal=resumenMensual.length?Math.max(...resumenMensual.map(r=>r.total)):1;
  const tasaRenovacion=useMemo(()=>{
    const vc=computed.filter(c=>{if(!c.vencimiento)return false;return monthKey(c.vencimiento)===monthKey(toISODate(prevMD));});
    if(vc.length===0)return null;
    const rn=vc.filter(c=>curMI.some(i=>i.cliente_id===c.id));
    return Math.round((rn.length/vc.length)*100);
  },[computed,curMI]);
  const ingFiltrados=useMemo(()=>ingresos.filter(i=>{
    if(!i.fecha_pago)return true;
    if(ingDesde&&i.fecha_pago<ingDesde)return false;
    if(ingHasta&&i.fecha_pago>ingHasta)return false;
    return true;
  }),[ingresos,ingDesde,ingHasta]);
  const nuevosEsteMes=useMemo(()=>{
    const mk=monthKey(toISODate(today));
    return new Set(ingresos.filter(i=>i.fecha_pago&&monthKey(i.fecha_pago)===mk&&ingresos.filter(j=>j.cliente_id===i.cliente_id).length===1).map(i=>i.cliente_id));
  },[ingresos]);

  const basePag=usePagination(filtered,PAGE.base);
  const vencPag=usePagination(vencimientos,PAGE.venc);
  const deudPag=usePagination(deudores,PAGE.deud);
  const clasPag=usePagination(clasesList,PAGE.clases);
  const ingPag=usePagination(ingFiltrados,PAGE.ing);
  const cHoyPag=usePagination(vencimientosCriticos.hoy,PAGE.crit);
  const cGrPag=usePagination(vencimientosCriticos.gracia,PAGE.crit);
  const cVePag=usePagination(vencimientosCriticos.vencidos,PAGE.crit);
  const dormPag=usePagination(dormantes,PAGE.dorm);
  useEffect(()=>{basePag.setPage(1);},[busqueda,filtro]);

  // ── Login ─────────────────────────────────────────────────────────────────
  if(!user){
    return(
      <>
        <ToastContainer toasts={toast.toasts} remove={toast.remove}/>
        <div style={{display:"flex",minHeight:"100vh",alignItems:"center",justifyContent:"center",background:"#080e1a",padding:24}}>
          <div style={{width:390,background:"#111827",borderRadius:20,padding:36,border:"1px solid #1e2d45",boxShadow:"0 8px 48px rgba(0,0,0,0.7)"}}>
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:32}}>
              <img src={LOGO_SRC} alt="Logo" style={{width:50,height:50,objectFit:"contain"}} onError={e=>{e.target.style.display="none";}}/>
              <div>
                <div style={{fontSize:22,fontWeight:900,color:"#f0f4ff",letterSpacing:"-0.02em"}}>Seminario Cripto</div>
                <div style={{fontSize:13,color:"#8899bb",marginTop:2}}>Sistema de gestión interno</div>
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:"#8899bb",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Email</label>
              <input placeholder="correo@ejemplo.com" value={emailLogin} onChange={e=>setEmailLogin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}
                style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1px solid #1e2d45",fontSize:14,outline:"none",boxSizing:"border-box",background:"#0d1526",color:"#f0f4ff"}}/>
            </div>
            <div style={{position:"relative",marginBottom:22}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:"#8899bb",marginBottom:5,letterSpacing:"0.06em",textTransform:"uppercase"}}>Contraseña</label>
              <input type={showPwd?"text":"password"} placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}
                style={{width:"100%",padding:"11px 44px 11px 14px",borderRadius:10,border:"1px solid #1e2d45",fontSize:14,outline:"none",boxSizing:"border-box",background:"#0d1526",color:"#f0f4ff"}}/>
              <span onClick={()=>setShowPwd(!showPwd)} style={{position:"absolute",right:12,bottom:11,cursor:"pointer",color:"#8899bb",display:"flex",alignItems:"center"}}>
                {showPwd?(
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ):(
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </span>
            </div>
            <button onClick={login} style={{width:"100%",padding:"13px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:800,fontSize:15,background:"linear-gradient(135deg,#e8b84b 0%,#c8972a 60%,#a07020 100%)",color:"#0f172a"}}>
              Ingresar
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── App ───────────────────────────────────────────────────────────────────
  return(
    <div style={{minHeight:"100vh",background:t.bg,color:t.text,fontFamily:"'Inter','Segoe UI',Arial,sans-serif"}}>
      <ToastContainer toasts={toast.toasts} remove={toast.remove}/>
      {confirm&&<ConfirmModal open={!!confirm} title={confirm.title} message={confirm.message} confirmLabel={confirm.label} danger={confirm.danger} onConfirm={()=>{confirm.onConfirm();setConfirm(null);}} onCancel={()=>setConfirm(null)} t={t}/>}
      {busquedaRapida&&<BusquedaRapida clientes={computed} onSelect={c=>setClienteDetalle(c)} onClose={()=>setBusquedaRapida(false)} t={t}/>}
      {clienteDetalle&&(
        <ClienteDetailModal cliente={clienteDetalle} ingresos={ingresos} userEmail={user?.email} onClose={()=>setClienteDetalle(null)}
          onAbrirRenovar={c=>{setClienteDetalle(null);abrirRenovar(c);}}
          onEliminar={c=>{setClienteDetalle(null);askConfirm("Eliminar cliente",`¿Confirmas que querés eliminar a ${c.nombre}? Esta acción no se puede deshacer.`,()=>eliminarClienteConfirmado(c),{danger:true,label:"Eliminar"});}}
          onNotaGuardada={()=>toast.success("Nota guardada")}
          t={t}/>
      )}
      {pagoCliente&&<PagoModal cliente={pagoCliente} onClose={()=>setPagoCliente(null)} onConfirm={registrarPagoParcial} t={t}/>}
      {showRenovar&&<ClienteForm title="Renovar cliente" subtitle="Actualizar plan y registrar nuevo ingreso" form={renovarForm} setForm={setRenovarForm} onGuardar={guardarRenovacion} onCancelar={()=>setShowRenovar(false)} guardando={renovando} isModal t={t}/>}

      <div style={{maxWidth:1320,margin:"0 auto",padding:"24px 28px"}}>

        {/* ── Header ── */}
        <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",marginBottom:28,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <img src={LOGO_SRC} alt="Logo" style={{width:44,height:44,objectFit:"contain"}} onError={e=>{e.target.style.display="none";}}/>
            <div>
              <h1 style={{margin:0,fontSize:24,fontWeight:900,color:t.text,letterSpacing:"-0.03em"}}>Seminario Cripto</h1>
              <div style={{color:t.textMuted,fontSize:13,marginTop:2}}>Panel de gestión comercial y operativa</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            {/* Búsqueda rápida — mismo estilo que botones de navegación */}
            <button onClick={()=>setBusquedaRapida(true)} style={navBtn(false)}>
              🔍 Búsqueda rápida
            </button>
            <button style={navBtn(activeView==="operativa")} onClick={()=>handleSetView("operativa")}>
              Operativa
              {totalCriticos>0&&<span style={{marginLeft:7,background:"#ef4444",color:"#fff",borderRadius:999,fontSize:11,fontWeight:800,padding:"2px 7px",verticalAlign:"middle"}}>{totalCriticos}</span>}
            </button>
            <button style={navBtn(activeView==="dashboard")} onClick={()=>handleSetView("dashboard")}>Dashboard</button>
            <button style={navBtn(activeView==="graficos")} onClick={()=>handleSetView("graficos")}>Gráficos</button>
            <button style={navBtn(activeView==="historial")} onClick={()=>handleSetView("historial")}>Historial</button>
            <button style={{...btn(false,true),padding:"10px 18px"}} onClick={()=>setShowForm(!showForm)}>{showForm?"Cerrar":"+ Nuevo cliente"}</button>
            <button onClick={()=>setDark(!dark)} title={dark?"Modo claro":"Modo oscuro"}
              style={{padding:"10px 14px",borderRadius:10,border:`1px solid ${t.navInBr}`,background:t.navInBg,cursor:"pointer",color:t.text,fontSize:16}}>
              {dark?"☀":"☾"}
            </button>
            <button onClick={logout} style={{padding:"10px 16px",borderRadius:10,border:`1px solid ${t.navInBr}`,background:t.navInBg,cursor:"pointer",fontWeight:600,color:t.text,fontSize:14}}>Salir</button>
          </div>
        </div>

        {showForm&&(
          <div style={{marginBottom:24}}>
            <ClienteForm title="Alta de cliente" form={form} setForm={setForm} onGuardar={guardarCliente} onCancelar={()=>setShowForm(false)} guardando={guardando} t={t}/>
          </div>
        )}

        {/* ── HISTORIAL ── */}
        {activeView==="historial"&&<HistorialView t={t}/>}

        {/* ── GRÁFICOS ── */}
        {activeView==="graficos"&&(
          <div style={{display:"grid",gap:24}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14}}>
              <MetricCard title="Ingresos del mes" value={money(ingMes)} accent trend={trendMes} sub={trendMes!=null?`vs mes anterior (USD ${ingMesAnt})`:undefined} t={t}/>
              <MetricCard title="Ventas del mes" value={dashStats.ventasMes} t={t}/>
              <MetricCard title="Clientes activos" value={resumen.activos} t={t}/>
              <MetricCard title="Tasa de renovación" value={tasaRenovacion!=null?`${tasaRenovacion}%`:"—"} sub="vs mes anterior" t={t}/>
            </div>
            <div style={S.card}>
              <h3 style={{marginTop:0,color:t.text,fontWeight:700,fontSize:16,marginBottom:16}}>Fluctuación de ingresos</h3>
              <LineChart ingresos={ingresos} t={t}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:24}}>
              <PieChart breakdown={dashStats.bkMes} title="Ingresos por tipo — mes actual" t={t}/>
              <PieChart breakdown={dashStats.bkTotal} title="Ingresos totales por tipo" t={t}/>
            </div>
            <div style={S.card}>
              <h3 style={{marginTop:0,color:t.text,fontWeight:700,fontSize:16,marginBottom:18}}>Evolución mensual</h3>
              {resumenConTrend.length===0?<div style={{color:t.textMuted}}>Sin datos históricos.</div>:(
                <div style={{display:"grid",gap:14}}>
                  {resumenConTrend.map(r=>{
                    const pct=Math.max((r.total/maxTotal)*100,4);
                    const isCur=r.key===curMK;
                    return(
                      <div key={r.key}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:14,color:t.text}}>
                          <span style={{fontWeight:isCur?800:600}}>{monthLabel(r.key)}{isCur?" ★":""}</span>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            {r.trend!=null&&<span style={{fontSize:12,fontWeight:700,color:r.trend>0?"#22c55e":r.trend<0?"#ef4444":t.textMuted}}>{r.trend>0?"↑":r.trend<0?"↓":"→"} {Math.abs(r.trend)}%</span>}
                            <strong style={{color:t.accent}}>USD {r.total}</strong>
                          </div>
                        </div>
                        <div style={{height:8,background:t.barBg,borderRadius:999,overflow:"hidden"}}>
                          <div style={{width:`${pct}%`,height:"100%",background:t.accentGrad,borderRadius:999}}/>
                        </div>
                        <div style={{marginTop:5,color:t.textMuted,fontSize:12}}>Mensuales: {r.vM} · Anuales: {r.vA} · Clases: {r.vC}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {activeView==="dashboard"&&(
          <div style={{display:"grid",gap:24}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14}}>
              <MetricCard title="Ingresos del mes" value={money(ingMes)} accent trend={trendMes} t={t}/>
              <MetricCard title="Ventas del mes" value={dashStats.ventasMes} t={t}/>
              <MetricCard title="Tasa de renovación" value={tasaRenovacion!=null?`${tasaRenovacion}%`:"—"} sub="clientes que renovaron vs mes anterior" t={t}/>
            </div>
            <BreakdownCard title="Ingresos por tipo (mes)" breakdown={dashStats.bkMes} t={t}/>
            <BreakdownCard title="Ingresos totales por tipo" breakdown={dashStats.bkTotal} t={t}/>
            {/* Detalle ingresos con filtro fecha */}
            <div ref={ingRef} style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:12}}>
                <h3 style={{margin:0,color:t.text,fontWeight:700,fontSize:16}}>Detalle de ingresos</h3>
                <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <label style={{...S.label,marginBottom:0,whiteSpace:"nowrap"}}>Desde</label>
                    <input type="date" style={{...S.input,width:"auto",padding:"7px 12px",fontSize:13}} value={ingDesde} onChange={e=>setIngDesde(e.target.value)}/>
                    <label style={{...S.label,marginBottom:0,whiteSpace:"nowrap"}}>Hasta</label>
                    <input type="date" style={{...S.input,width:"auto",padding:"7px 12px",fontSize:13}} value={ingHasta} onChange={e=>setIngHasta(e.target.value)}/>
                    {(ingDesde||ingHasta)&&<button style={{...btn(false),padding:"7px 12px",fontSize:12}} onClick={()=>{setIngDesde("");setIngHasta("");}}>Limpiar</button>}
                  </div>
                  <button style={{...btn(false),padding:"8px 14px",fontSize:13}}
                    onClick={()=>exportXLSX(ingFiltrados,[
                      {key:"fecha_pago",label:"Fecha"},{key:"cliente_nombre",label:"Nombre"},
                      {key:"email",label:"Email"},{key:"servicio",label:"Servicio"},
                      {key:"monto",label:"Monto"},{key:"notas",label:"Notas"},
                    ],"ingresos_seminario_cripto.xlsx")}>
                    Exportar Excel
                  </button>
                </div>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Fecha","Nombre","Email","Servicio","Monto","Notas","Eliminar"]} t={t}/></thead>
                  <tbody>
                    {ingPag.rows.map(i=>(
                      <tr key={i.id}>
                        <td style={S.td}>{i.fecha_pago?formatDate(i.fecha_pago):"-"}</td>
                        <td style={{...S.td,fontWeight:700}}>{i.cliente_nombre||"-"}</td>
                        <td style={S.td}>{i.email||"-"}</td>
                        <td style={S.td}>{svcLabel(i.servicio)}</td>
                        <td style={{...S.td,color:t.accent,fontWeight:700}}>{money(i.monto)}</td>
                        <td style={S.td}>{i.notas||"-"}</td>
                        <td style={S.td}><button style={{...btn(false),padding:"6px 11px",fontSize:13}} onClick={()=>askConfirm("Eliminar ingreso","¿Confirmas que querés eliminar este ingreso?",()=>eliminarIngreso(i.id),{danger:true,label:"Eliminar"})}>🗑</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!ingFiltrados.length&&<div style={{padding:24,textAlign:"center",color:t.textMuted}}>No hay ingresos para el período seleccionado.</div>}
              </div>
              <Pagination page={ingPag.page} totalPages={ingPag.totalPages} setPage={ingPag.setPage} sectionRef={ingRef} t={t}/>
            </div>
          </div>
        )}

        {/* ── OPERATIVA ── */}
        {activeView==="operativa"&&(
          <>
            {/* Métricas */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,marginBottom:28}}>
              {[["Activos",resumen.activos,false],["En gracia",resumen.gracia,false],["Para sacar",resumen.sacar,false],["Deudores",resumen.deudores,false],["Clases",resumen.clases,false],["Ingresos totales",`USD ${resumen.ingresos}`,true]].map(([l,v,a])=>(
                <div key={l} style={{...S.card,borderTop:a?`3px solid ${t.accent}`:undefined}}>
                  <div style={{fontSize:11,color:t.textMuted,marginBottom:6,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>{l}</div>
                  <div style={{fontSize:24,fontWeight:800,color:a?t.accent:t.text,letterSpacing:"-0.02em"}}>{v}</div>
                </div>
              ))}
            </div>

            {/* Críticos */}
            <div ref={critRef} style={{...S.card,marginBottom:24,padding:24}}>
              <div style={{marginBottom:20}}>
                <h3 style={{margin:0,fontSize:20,fontWeight:800,color:t.text,letterSpacing:"-0.02em"}}>
                  Vencimientos críticos
                  {totalCriticos>0&&<span style={{marginLeft:10,background:"#ef4444",color:"#fff",borderRadius:999,fontSize:13,fontWeight:800,padding:"3px 10px"}}>{totalCriticos}</span>}
                </h3>
                <div style={{color:t.textMuted,fontSize:13,marginTop:4}}>Clic en el nombre del cliente para ver su ficha completa.</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,alignItems:"stretch"}}>
                {/* Por vencer: fondo oscuro en dark mode → nombre claro; fondo claro en light → nombre oscuro */}
                <CriticosPanel titulo="Por vencer" badgeBg="#fff7ed" badgeColor="#9a3412"
                  clientes={vencimientosCriticos.hoy} {...cHoyPag}
                  accentBorder={dark?"#3a2000":"#fdba74"} accentBg={dark?"#1a1000":"#fff7ed"} accentText={dark?"#fdba74":"#9a3412"}
                  nameColor={dark?t.text:"#1a0a00"}
                  dateLabel="vence"
                  onRenovarRapido={c=>askConfirm("Renovar cliente",`¿Renovar a ${c.nombre} con el mismo plan?`,()=>renovarRapido(c),{label:"Renovar"})}
                  onAbrirRenovar={abrirRenovar}
                  onEliminar={c=>askConfirm("Eliminar cliente",`¿Eliminar a ${c.nombre}? No se puede deshacer.`,()=>eliminarClienteConfirmado(c),{danger:true,label:"Eliminar"})}
                  onVerDetalle={setClienteDetalle} sectionRef={critRef} t={t}/>
                {/* En gracia: fondo siempre claro (amarillo) → nombre siempre oscuro fijo */}
                <CriticosPanel titulo="En gracia" badgeBg="#fef3c7" badgeColor="#92400e"
                  clientes={vencimientosCriticos.gracia} {...cGrPag}
                  accentBorder="#fde68a" accentBg="#fffbeb" accentText="#92400e"
                  nameColor="#1a0e00"
                  dateLabel="venció"
                  onRenovarRapido={c=>askConfirm("Renovar cliente",`¿Renovar a ${c.nombre} con el mismo plan?`,()=>renovarRapido(c),{label:"Renovar"})}
                  onAbrirRenovar={abrirRenovar}
                  onEliminar={c=>askConfirm("Eliminar cliente",`¿Eliminar a ${c.nombre}? No se puede deshacer.`,()=>eliminarClienteConfirmado(c),{danger:true,label:"Eliminar"})}
                  onVerDetalle={setClienteDetalle} sectionRef={critRef} t={t}/>
                {/* Vencidos: fondo siempre claro (rosa) → nombre siempre oscuro fijo */}
                <CriticosPanel titulo="Vencidos" badgeBg="#fee2e2" badgeColor="#991b1b"
                  clientes={vencimientosCriticos.vencidos} {...cVePag}
                  accentBorder="#fca5a5" accentBg="#fef2f2" accentText="#991b1b"
                  nameColor="#1a0000"
                  dateLabel="venció"
                  onRenovarRapido={c=>askConfirm("Renovar cliente",`¿Renovar a ${c.nombre} con el mismo plan?`,()=>renovarRapido(c),{label:"Renovar"})}
                  onAbrirRenovar={abrirRenovar}
                  onEliminar={c=>askConfirm("Eliminar cliente",`¿Eliminar a ${c.nombre}? No se puede deshacer.`,()=>eliminarClienteConfirmado(c),{danger:true,label:"Eliminar"})}
                  onVerDetalle={setClienteDetalle} sectionRef={critRef} t={t}/>
              </div>
            </div>

            {/* Base operativa */}
            <div ref={baseRef} style={{...S.card,marginBottom:24}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap",marginBottom:18}}>
                <div>
                  <h3 style={{margin:0,color:t.text,fontWeight:800,fontSize:18}}>Base operativa</h3>
                  <div style={{color:t.textMuted,fontSize:13,marginTop:4}}>{loading?"Cargando datos...":"Gestión central de clientes, renovaciones y clases."}</div>
                </div>
                <button style={{...btn(false),padding:"8px 14px",fontSize:13}}
                  onClick={()=>exportXLSX(filtered,[
                    {key:"nombre",label:"Nombre"},{key:"email",label:"Email"},{key:"telefono",label:"Teléfono"},{key:"servicio",label:"Servicio"},
                    {key:"vencimiento",label:"Vencimiento"},{key:"estadoSistema",label:"Estado"},{key:"monto",label:"Monto"},{key:"deuda_restante",label:"Deuda"},
                  ],"clientes_seminario_cripto.xlsx")}>
                  Exportar Excel
                </button>
              </div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:18}}>
                <input style={{...S.input,maxWidth:340}} placeholder="Buscar por nombre, email o teléfono" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
                <select style={{...S.input,maxWidth:220}} value={filtro} onChange={e=>setFiltro(e.target.value)}>
                  <option value="todos">Todos</option>
                  <option value="mensual">Mensual</option>
                  <option value="anual">Anual</option>
                  <option value="clases">Clases</option>
                  <option value="gracia">En gracia</option>
                  <option value="sacar">Sacar</option>
                </select>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Cliente","Email","Servicio","Vencimiento","Días","Estado","Estado manual","Acciones"]} t={t}/></thead>
                  <tbody>
                    {!loading&&basePag.rows.map(c=>(
                      <tr key={c.id}>
                        <td style={{...S.td,fontWeight:700}}>
                          <div style={{display:"flex",alignItems:"center",gap:7}}>
                            <span style={{cursor:"pointer",color:t.accent}} onClick={()=>setClienteDetalle(c)}>{c.nombre}</span>
                            {nuevosEsteMes.has(c.id)&&<span style={{fontSize:10,fontWeight:800,padding:"2px 6px",borderRadius:999,background:t.accentGrad,color:"#0f172a"}}>NUEVO</span>}
                          </div>
                        </td>
                        <td style={S.td}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <input value={c.email||""} onChange={e=>setClientes(prev=>prev.map(cl=>cl.id===c.id?{...cl,email:e.target.value}:cl))} onBlur={e=>actualizarEmail(c.id,e.target.value)}
                              style={{flex:1,padding:"6px 10px",borderRadius:8,border:`1px solid ${t.inputBorder}`,fontSize:13,boxSizing:"border-box",background:t.inputBg,color:t.inputText}}/>
                            {emailSaved===c.id&&<span style={{fontSize:11,color:"#22c55e",fontWeight:700,whiteSpace:"nowrap"}}>✓ guardado</span>}
                          </div>
                        </td>
                        <td style={S.td}>{svcLabel(c.servicio)}</td>
                        <td style={S.td}>{c.vencimiento?formatDate(c.vencimiento):"-"}</td>
                        <td style={S.td}>{c.vencimiento!=null?c.dias:"-"}</td>
                        <td style={S.td}><span style={badgeStyle(c.estadoSistema)}>{c.estadoSistema.toUpperCase()}</span></td>
                        <td style={S.td}>
                          <select style={{...S.input,padding:"8px 12px"}} value={c.estado_manual} onChange={e=>cambiarEstado(c.id,e.target.value)}>
                            <option value="activo">Activo</option>
                            <option value="sacar">Sacar</option>
                          </select>
                        </td>
                        <td style={S.td}>
                          <div style={{display:"flex",gap:6}}>
                            <button title="Renovación rápida" style={{...btn(true),padding:"7px 11px",fontSize:13}} onClick={()=>askConfirm("Renovar cliente",`¿Renovar a ${c.nombre} con el mismo plan?`,()=>renovarRapido(c),{label:"Renovar"})}>✔</button>
                            <button title="Renovar con cambios" style={{...btn(false),padding:"7px 11px",fontSize:13}} onClick={()=>abrirRenovar(c)}>✏️</button>
                            <button title="Eliminar" style={{...btn(false),padding:"7px 11px",fontSize:13}} onClick={()=>askConfirm("Eliminar cliente",`¿Eliminar a ${c.nombre}? No se puede deshacer.`,()=>eliminarClienteConfirmado(c),{danger:true,label:"Eliminar"})}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {loading&&<Skeleton rows={5} cols={8} t={t}/>}
                {!filtered.length&&!loading&&<div style={{padding:24,textAlign:"center",color:t.textMuted}}>No hay resultados.</div>}
              </div>
              <Pagination page={basePag.page} totalPages={basePag.totalPages} setPage={basePag.setPage} sectionRef={baseRef} t={t}/>
            </div>

            {/* Vencimientos */}
            <div ref={vencRef} style={{...S.card,marginBottom:24}}>
              <h3 style={{marginTop:0,color:t.text,fontWeight:800,fontSize:18,marginBottom:16}}>Vencimientos</h3>
              <div style={{overflowX:"auto"}}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Cliente","Servicio","Vence","Días","Estado"]} t={t}/></thead>
                  <tbody>
                    {vencPag.rows.map(c=>(
                      <tr key={c.id}>
                        <td style={{...S.td,fontWeight:700,cursor:"pointer",color:t.accent}} onClick={()=>setClienteDetalle(c)}>{c.nombre}</td>
                        <td style={S.td}>{svcLabel(c.servicio)}</td>
                        <td style={S.td}>{c.vencimiento?formatDate(c.vencimiento):"-"}</td>
                        <td style={S.td}>{c.vencimiento!=null?c.dias:"-"}</td>
                        <td style={S.td}><span style={badgeStyle(c.estadoSistema)}>{c.estadoSistema.toUpperCase()}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={vencPag.page} totalPages={vencPag.totalPages} setPage={vencPag.setPage} sectionRef={vencRef} t={t}/>
            </div>

            {/* Deudores */}
            <div ref={deudRef} style={{...S.card,marginBottom:24}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
                <div>
                  <h3 style={{margin:0,color:t.text,fontWeight:800,fontSize:18}}>Deudores</h3>
                  {deudores.length>0&&<div style={{color:"#ef4444",fontSize:13,fontWeight:700,marginTop:4}}>Deuda total acumulada: <strong>USD {totalDeuda}</strong></div>}
                </div>
                <button style={{...btn(false),padding:"8px 14px",fontSize:13}}
                  onClick={()=>exportXLSX(deudores,[
                    {key:"nombre",label:"Nombre"},{key:"email",label:"Email"},{key:"servicio",label:"Servicio"},
                    {key:"monto",label:"Monto pagado"},{key:"deuda_restante",label:"Deuda restante"},{key:"notas",label:"Notas"},
                  ],"deudores_seminario_cripto.xlsx")}>
                  Exportar Excel
                </button>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Cliente","Servicio","Pagado","Resta","Notas","Acción"]} t={t}/></thead>
                  <tbody>
                    {deudPag.rows.map(c=>(
                      <tr key={c.id}>
                        <td style={{...S.td,fontWeight:700,cursor:"pointer",color:t.accent}} onClick={()=>setClienteDetalle(c)}>{c.nombre}</td>
                        <td style={S.td}>{svcLabel(c.servicio)}</td>
                        <td style={S.td}>USD {c.monto}</td>
                        <td style={{...S.td,color:"#ef4444",fontWeight:700}}>USD {c.deuda_restante}</td>
                        <td style={S.td}>{c.notas||"-"}</td>
                        <td style={S.td}><button style={{...btn(false,true),padding:"6px 12px",fontSize:12}} onClick={()=>setPagoCliente(c)}>Registrar pago</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!deudores.length&&<div style={{padding:24,textAlign:"center",color:t.textMuted}}>Sin deudores registrados.</div>}
              </div>
              <Pagination page={deudPag.page} totalPages={deudPag.totalPages} setPage={deudPag.setPage} sectionRef={deudRef} t={t}/>
            </div>

            {/* Clases */}
            <div ref={clasesRef} style={{...S.card,marginBottom:24}}>
              <h3 style={{marginTop:0,color:t.text,fontWeight:800,fontSize:18,marginBottom:16}}>Clases</h3>
              <div style={{overflowX:"auto"}}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Alumno","Inicio","Mes","Monto","Notas"]} t={t}/></thead>
                  <tbody>
                    {clasPag.rows.map(c=>(
                      <tr key={c.id}>
                        <td style={{...S.td,fontWeight:700,cursor:"pointer",color:t.accent}} onClick={()=>setClienteDetalle(c)}>{c.nombre}</td>
                        <td style={S.td}>{formatDate(c.fecha_inicio)}</td>
                        <td style={S.td}>{monthLabel(monthKey(c.fecha_inicio))}</td>
                        <td style={{...S.td,color:t.accent,fontWeight:700}}>USD {c.monto}</td>
                        <td style={S.td}>{c.notas||"-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!clasesList.length&&<div style={{padding:24,textAlign:"center",color:t.textMuted}}>Sin alumnos registrados.</div>}
              </div>
              <Pagination page={clasPag.page} totalPages={clasPag.totalPages} setPage={clasPag.setPage} sectionRef={clasesRef} t={t}/>
            </div>

            {/* Dormantes */}
            {dormantes.length>0&&(
              <div ref={dormRef} style={{...S.card,marginBottom:24,border:`1px solid ${dark?"#3a2000":"#fdba74"}`}}>
                <div style={{marginBottom:16}}>
                  <h3 style={{margin:0,color:t.text,fontWeight:800,fontSize:18}}>⚠ Clientes dormantes</h3>
                  <div style={{color:t.textMuted,fontSize:13,marginTop:4}}>Activos pero sin ingreso registrado en los últimos 60 días. Pueden necesitar seguimiento.</div>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={S.table}>
                    <thead><TableHeader cols={["Cliente","Email","Teléfono","Servicio","Vencimiento","Estado"]} t={t}/></thead>
                    <tbody>
                      {dormPag.rows.map(c=>(
                        <tr key={c.id}>
                          <td style={{...S.td,fontWeight:700,cursor:"pointer",color:t.accent}} onClick={()=>setClienteDetalle(c)}>{c.nombre}</td>
                          <td style={S.td}>{c.email||"-"}</td>
                          <td style={S.td}>
                            {c.telefono?(
                              <a href={`https://wa.me/${c.telefono.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" style={{color:"#22c55e",fontWeight:600,textDecoration:"none"}}>{c.telefono} ↗</a>
                            ):"-"}
                          </td>
                          <td style={S.td}>{svcLabel(c.servicio)}</td>
                          <td style={S.td}>{c.vencimiento?formatDate(c.vencimiento):"-"}</td>
                          <td style={S.td}><span style={badgeStyle(c.estadoSistema)}>{c.estadoSistema.toUpperCase()}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={dormPag.page} totalPages={dormPag.totalPages} setPage={dormPag.setPage} sectionRef={dormRef} t={t}/>
              </div>
            )}

            {/* Resumen mensual */}
            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.2fr) minmax(0,0.8fr)",gap:24}}>
              <div style={S.card}>
                <h3 style={{marginTop:0,color:t.text,fontWeight:800,fontSize:18,marginBottom:16}}>Resumen mensual</h3>
                <div style={{overflowX:"auto"}}>
                  <table style={S.table}>
                    <thead><TableHeader cols={["Mes","Mensual","Anual","Clases","Total","Tendencia"]} t={t}/></thead>
                    <tbody>
                      {resumenConTrend.map(r=>(
                        <tr key={r.key}>
                          <td style={{...S.td,fontWeight:700}}>{monthLabel(r.key)}</td>
                          <td style={S.td}>USD {r.mensual}</td>
                          <td style={S.td}>USD {r.anual}</td>
                          <td style={S.td}>USD {r.clases}</td>
                          <td style={{...S.td,fontWeight:800,color:t.accent}}>USD {r.total}</td>
                          <td style={S.td}>
                            {r.trend!=null&&<span style={{fontSize:12,fontWeight:700,color:r.trend>0?"#22c55e":r.trend<0?"#ef4444":t.textMuted}}>{r.trend>0?"↑":r.trend<0?"↓":"→"} {Math.abs(r.trend)}%</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={S.card}>
                <h3 style={{marginTop:0,color:t.text,fontWeight:800,fontSize:18,marginBottom:16}}>Vista rápida</h3>
                <div style={{display:"grid",gap:16}}>
                  {resumenConTrend.map(r=>{
                    const pct=Math.max((r.total/maxTotal)*100,4);
                    return(
                      <div key={r.key}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:14,color:t.text}}>
                          <span style={{fontWeight:600}}>{monthLabel(r.key)}</span>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            {r.trend!=null&&<span style={{fontSize:11,fontWeight:700,color:r.trend>0?"#22c55e":r.trend<0?"#ef4444":t.textMuted}}>{r.trend>0?"↑":r.trend<0?"↓":"→"}{Math.abs(r.trend)}%</span>}
                            <strong style={{color:t.accent}}>USD {r.total}</strong>
                          </div>
                        </div>
                        <div style={{height:8,background:t.barBg,borderRadius:999,overflow:"hidden"}}>
                          <div style={{width:`${pct}%`,height:"100%",background:t.accentGrad,borderRadius:999}}/>
                        </div>
                        <div style={{marginTop:5,color:t.textMuted,fontSize:12}}>Mensuales: {r.vM} · Anuales: {r.vA} · Clases: {r.vC}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
