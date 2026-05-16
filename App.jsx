import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const LOGO_SRC = "/logo.png";
const EMAILS_CRM_URL = "https://seminariocriptoemails.vercel.app";

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

// ─── CSS responsivo global ────────────────────────────────────────────────────
const MOBILE_CSS = `
  *{box-sizing:border-box;}
  @media(max-width:640px){
    .sc-header{flex-direction:column!important;align-items:flex-start!important;gap:12px!important;}
    .sc-nav{width:100%!important;display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:6px!important;}
    .sc-nav button,.sc-nav a{font-size:12px!important;padding:8px 6px!important;text-align:center!important;}
    .sc-pad{padding:16px!important;}
    .sc-criticos{grid-template-columns:1fr!important;}
    .sc-metrics{grid-template-columns:repeat(2,1fr)!important;}
    .sc-table-wrap{overflow-x:auto!important;-webkit-overflow-scrolling:touch!important;}
    .sc-card-row{flex-direction:column!important;}
    .sc-hide-mobile{display:none!important;}
    .sc-filters{gap:6px!important;}
    .sc-filters button{font-size:11px!important;padding:5px 10px!important;}
    .sc-form-grid{grid-template-columns:1fr!important;}
    .sc-hist-table td,.sc-hist-table th{padding:8px!important;font-size:12px!important;}
    .sc-tl-item{flex-direction:column!important;gap:4px!important;}
  }
  @keyframes pulse{0%,100%{opacity:.7}50%{opacity:.3}}
`;

function injectCSS() {
  if (document.getElementById("sc-mobile-css")) return;
  const el = document.createElement("style");
  el.id = "sc-mobile-css";
  el.textContent = MOBILE_CSS;
  document.head.appendChild(el);
}
injectCSS();
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
  if(v==="mensual") return "Plan trader";
  if(v==="anual")   return "Plan inversor";
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

// ─── Drive helper con reintentos ─────────────────────────────────────────────
async function llamarDrive(accion, email) {
  if(!email||!email.includes("@")) return;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const url = `${supabaseUrl}/functions/v1/drive-access`;
  
  for(let intento = 1; intento <= 3; intento++) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ accion, email }),
      });
      const data = await res.json();
      if(data.ok) {
        console.log(`Drive ✓ ${accion}: ${email}`);
        return; // éxito, salir
      }
      console.warn(`Drive intento ${intento} falló:`, data.error||data);
    } catch(err) {
      console.warn(`Drive intento ${intento} error:`, err);
    }
    // Esperar antes de reintentar (500ms, 1500ms)
    if(intento < 3) await new Promise(r => setTimeout(r, intento * 500));
  }
  console.warn(`Drive: falló después de 3 intentos para ${email}`);
}

// ─── usePagination ────────────────────────────────────────────────────────────
function usePagination(items,pageSize){
  const [page,setPage]=useState(1);
  const totalPages=Math.max(1,Math.ceil(items.length/pageSize));
  useEffect(()=>{setPage(p=>Math.min(p,Math.max(1,Math.ceil(items.length/pageSize))));},[items,pageSize]);
  const rows=useMemo(()=>{const s=(page-1)*pageSize;return items.slice(s,s+pageSize);},[items,page,pageSize]);
  return{page,setPage,totalPages,rows};
}

const RECEPTOR_DIRECTO = "Cristian";
const VENDEDORES = ["Leonardo Bejarano", "Leonardo Steimberg", "Bahiano"];
const RECEPTORES_VENTA = [RECEPTOR_DIRECTO, ...VENDEDORES];
const FORM_DEF={nombre:"",email:"",telefono:"",servicio:"mensual",fecha_inicio:toISODate(getToday()),monto:30,duracion_dias:30,estado_manual:"activo",deuda_restante:0,notas:"",vendedor:"",transferido:true};
function ventaYaRecibida(vendedor){return !vendedor||vendedor===RECEPTOR_DIRECTO;}
function normalizarReceptorVenta(vendedor){
  const raw=(vendedor||"").trim();
  if(!raw)return"";
  const found=RECEPTORES_VENTA.find(v=>v.toLowerCase()===raw.toLowerCase());
  return found||raw;
}

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
function ReceptorVentaModal({open,valorInicial="",onConfirm,onCancel,t}){
  const btn=makeBtn(t);
  const [seleccion,setSeleccion]=useState(valorInicial||"");
  useEffect(()=>{ if(open) setSeleccion(valorInicial||""); },[open,valorInicial]);
  useEffect(()=>{
    if(!open) return;
    function onKey(e){
      if(e.key==="Escape") onCancel();
      if(e.key==="Enter" && seleccion) onConfirm(seleccion);
    }
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[open,seleccion,onConfirm,onCancel]);
  if(!open) return null;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(8,14,26,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,zIndex:2100}} onClick={onCancel}>
      <div onClick={e=>e.stopPropagation()} style={{background:t.cardBg,borderRadius:18,padding:28,border:`1px solid ${t.cardBorder}`,maxWidth:520,width:"100%",boxShadow:"0 32px 80px rgba(0,0,0,0.6)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:18}}>
          <div>
            <h3 style={{margin:"0 0 6px",color:t.text,fontSize:20,fontWeight:900}}>¿Quién recibió la plata?</h3>
            <p style={{margin:0,color:t.textMuted,fontSize:13,lineHeight:1.6}}>Elegí el receptor de esta renovación. Si no fue Cristian, se suma automáticamente a ventas pendientes de recepción.</p>
          </div>
          <button onClick={onCancel} style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:22,lineHeight:1,padding:0}}>×</button>
        </div>

        <div style={{display:"grid",gap:10,marginBottom:20}}>
          {RECEPTORES_VENTA.map(v=>{
            const active=seleccion===v;
            const esDirecto=v===RECEPTOR_DIRECTO;
            return(
              <button
                key={v}
                type="button"
                onClick={()=>setSeleccion(v)}
                style={{
                  width:"100%",textAlign:"left",padding:"14px 16px",borderRadius:12,cursor:"pointer",
                  border:active?`1px solid ${t.accent}`:`1px solid ${t.cardBorder}`,
                  background:active?(t.dark?"rgba(200,151,42,0.16)":"rgba(232,184,75,0.14)"):(t.dark?"#0d1526":"#f8f6f3"),
                  boxShadow:active?"0 0 0 1px rgba(200,151,42,0.18) inset":"none"
                }}
              >
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:800,color:t.text}}>{v}</div>
                    <div style={{fontSize:12,color:t.textMuted,marginTop:3}}>{esDirecto?"Ingreso recibido directamente":"Queda pendiente hasta que se marque como recibido"}</div>
                  </div>
                  <div style={{padding:"4px 10px",borderRadius:999,fontSize:11,fontWeight:800,background:esDirecto?"#d1fae5":"#fef3c7",color:esDirecto?"#065f46":"#92400e",whiteSpace:"nowrap"}}>
                    {esDirecto?"Directo":"Pendiente"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
          <button style={btn(false)} onClick={onCancel}>Cancelar</button>
          <button style={{...btn(false,true),opacity:seleccion?1:0.55}} onClick={()=>seleccion&&onConfirm(seleccion)} disabled={!seleccion}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

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

// ─── Panel detalle cliente — historial unificado por nombre ───────────────────
const TL_PAGE = 5;
function ClienteDetailModal({cliente,ingresos,allClientes,userEmail,onClose,onAbrirRenovar,onEliminar,onNotaGuardada,t}){
  if(!cliente)return null;
  const S=makeS(t);const btn=makeBtn(t);
  const [nuevaNota,setNuevaNota]=useState("");
  const [sending,setSending]=useState(false);
  const [copiado,setCopiado]=useState(false);
  const [timeline,setTimeline]=useState([]);
  const [loadingTL,setLoadingTL]=useState(true);
  const [tlPage,setTlPage]=useState(1);

  // Buscar TODOS los registros con el mismo nombre (mismo cliente, distintos servicios)
  const mismoNombre = useMemo(()=>
    (allClientes||[]).filter(c=>c.nombre?.trim().toLowerCase()===cliente.nombre?.trim().toLowerCase())
  ,[allClientes,cliente.nombre]);

  const todosLosIds = useMemo(()=>mismoNombre.map(c=>c.id),[mismoNombre]);

  // Todos los pagos de todos los registros con ese nombre
  const pagosTotales=useMemo(()=>
    ingresos.filter(i=>todosLosIds.includes(i.cliente_id))
      .sort((a,b)=>(b.fecha_pago||"").localeCompare(a.fecha_pago||""))
  ,[ingresos,todosLosIds]);

  const totalPagado=pagosTotales.reduce((a,i)=>a+safeNum(i.monto),0);
  const totalDeuda=mismoNombre.reduce((a,c)=>a+safeNum(c.deuda_restante),0);

  const tlTotal=Math.max(1,Math.ceil(timeline.length/TL_PAGE));
  const tlRows=useMemo(()=>{const s=(tlPage-1)*TL_PAGE;return timeline.slice(s,s+TL_PAGE);},[timeline,tlPage]);

  useEffect(()=>{
    // Cargar timeline de todos los IDs del mismo cliente
    if(todosLosIds.length===0){setLoadingTL(false);return;}
    supabase.from("notas_cliente").select("*")
      .in("cliente_id", todosLosIds)
      .order("created_at",{ascending:false})
      .then(({data})=>{setTimeline(data||[]);setLoadingTL(false);});
  },[todosLosIds.join(",")]);

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
      setTlPage(1);setNuevaNota("");
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

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(8,14,26,0.82)",zIndex:1500,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"24px 16px",overflowY:"auto"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:t.cardBg,borderRadius:20,border:`1px solid ${t.cardBorder}`,maxWidth:680,width:"100%",boxShadow:"0 32px 80px rgba(0,0,0,0.6)",marginTop:8,marginBottom:24,display:"flex",flexDirection:"column"}}>

        {/* Header */}
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
            <button onClick={onClose} style={{...btn(false),padding:"8px 14px",flexShrink:0,marginLeft:12}}>Cerrar</button>
          </div>

          {/* KPIs unificados */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
            {[["Pagos totales",pagosTotales.length],["Total cobrado",`USD ${totalPagado}`],["Deuda",totalDeuda>0?`USD ${totalDeuda}`:"—"]].map(([l,v])=>(
              <div key={l} style={{background:t.dark?"#0d1526":"#f8f6f3",borderRadius:12,padding:"12px 14px",border:`1px solid ${t.cardBorder}`}}>
                <div style={{fontSize:10,color:t.textMuted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:5}}>{l}</div>
                <div style={{fontSize:18,fontWeight:800,color:t.text}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Servicios activos — uno por cada registro con ese nombre */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:t.textMuted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>Servicios activos</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {mismoNombre.map(c=>(
                <div key={c.id} style={{padding:"8px 14px",borderRadius:10,background:t.dark?"#0d1526":"#f8f6f3",border:`1px solid ${t.cardBorder}`,fontSize:13}}>
                  <span style={{fontWeight:700,color:t.accent}}>{svcLabel(c.servicio)}</span>
                  <span style={{color:t.textMuted,marginLeft:8}}>{c.vencimiento?`vence ${formatDate(c.vencimiento)}`:c.servicio==="clases"?"activo":""}</span>
                  {safeNum(c.deuda_restante)>0&&<span style={{color:"#ef4444",marginLeft:8,fontWeight:700}}>debe USD {c.deuda_restante}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Contenido scrollable */}
        <div style={{padding:"0 28px 28px",flexShrink:0}}>

          {/* Nueva nota */}
          <div style={{borderTop:`1px solid ${t.tdBorder}`,paddingTop:18,marginBottom:18}}>
            <label style={{fontSize:11,color:t.textMuted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",display:"block",marginBottom:8}}>Agregar nota</label>
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
              <h4 style={{margin:0,color:t.text,fontSize:14,fontWeight:700}}>Historial completo</h4>
              {timeline.length>0&&<span style={{color:t.textMuted,fontSize:12}}>{timeline.length} registro{timeline.length!==1?"s":""}</span>}
            </div>
            {loadingTL?(
              <div style={{color:t.textMuted,fontSize:13}}>Cargando...</div>
            ):timeline.length===0?(
              <div style={{color:t.textMuted,fontSize:13}}>Sin registros todavía.</div>
            ):(
              <>
                <div style={{display:"grid",gap:8}}>
                  {tlRows.map(item=>{
                    const{icon,color,bg}=tipoStyle(item.tipo);
                    return(
                      <div key={item.id} className="sc-tl-item" style={{display:"flex",gap:10,padding:"10px 12px",borderRadius:10,background:bg,border:`1px solid ${t.cardBorder}`}}>
                        <div style={{fontSize:16,flexShrink:0,lineHeight:1.5}}>{icon}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontSize:12,fontWeight:700,color}}>{tipoLabel(item.tipo)}</span>
                            <span style={{fontSize:11,color:t.textMuted,whiteSpace:"nowrap"}}>{formatDateTime(item.created_at)}</span>
                          </div>
                          {item.contenido&&<div style={{fontSize:12,color:t.text,marginTop:3,lineHeight:1.5}}>{item.contenido}</div>}
                          {item.detalle&&<div style={{fontSize:11,color:t.textMuted,marginTop:2}}>{Object.entries(item.detalle).map(([k,v])=>`${k}: ${v}`).join(" · ")}</div>}
                          <div style={{fontSize:11,color:t.textMuted,marginTop:2}}>por {item.usuario_email}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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

          {/* Todos los pagos unificados */}
          {pagosTotales.length>0&&(
            <div style={{borderTop:`1px solid ${t.tdBorder}`,paddingTop:16,marginBottom:18}}>
              <h4 style={{margin:"0 0 10px",color:t.text,fontSize:14,fontWeight:700}}>Pagos registrados</h4>
              <div style={{borderRadius:10,border:`1px solid ${t.cardBorder}`,overflow:"hidden",maxHeight:200,overflowY:"auto"}}>
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

function MetricCard({title,value,sub,accent,trend,subValue,t}){
  const S=makeS(t);
  return(
    <div style={{...S.card,borderTop:accent?`3px solid ${t.accent}`:undefined}}>
      <div style={{fontSize:11,color:t.textMuted,marginBottom:8,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>{title}</div>
      <div style={{fontSize:26,fontWeight:800,color:accent?t.accent:t.text,letterSpacing:"-0.02em",display:"flex",alignItems:"center",gap:8}}>
        {value}
        {trend!=null&&<span style={{fontSize:13,fontWeight:700,color:trend>0?"#22c55e":trend<0?"#ef4444":t.textMuted}}>{trend>0?"↑":trend<0?"↓":"→"} {Math.abs(trend)}%</span>}
      </div>
      {subValue!=null&&<div style={{marginTop:4,fontSize:13,color:t.textMuted,fontWeight:600}}>{subValue}</div>}
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
  const items=[{key:"mensual",label:"Plan trader"},{key:"anual",label:"Plan inversor"},{key:"clases",label:"Clases"}];
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
  const slices=[{key:"mensual",label:"Plan trader",color:t.accent},{key:"anual",label:"Plan inversor",color:"#5b8dee"},{key:"clases",label:"Clases",color:"#34d399"}];
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
    <div style={{position:isModal?"relative":undefined,width:"100%",maxWidth:isModal?860:undefined,background:t.cardBg,borderRadius:16,padding:28,boxShadow:isModal?"0 32px 80px rgba(0,0,0,0.5)":undefined,border:`1px solid ${t.cardBorder}`}}>
      {isModal&&<div style={{position:"absolute",top:28,right:28}}><button onClick={onCancelar} style={btn(false)}>Cerrar</button></div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:22,paddingRight:isModal?110:0}}>
        <div>
          <h3 style={{margin:0,color:t.text,fontSize:18,fontWeight:800}}>{title}</h3>
          {subtitle&&<div style={{color:t.textMuted,fontSize:13,marginTop:4}}>{subtitle}</div>}
        </div>
      </div>
      <div className="sc-form-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16}}>
        {/* Nombre siempre primero */}
        <Field label="Nombre y apellido" t={t}>
          <input autoFocus style={S.input} placeholder="Ej: Luis Pérez" value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})}/>
        </Field>
        {/* Servicio al lado del nombre — así el usuario elige clases antes de ver el campo email */}
        <Field label="Servicio" t={t}>
          <select style={S.input} value={form.servicio} onChange={e=>{const s=e.target.value;setForm({...form,servicio:s,monto:svcAmount(s),duracion_dias:svcDuration(s),email:s==="clases"?"":form.email});}}>
            <option value="mensual">Plan trader</option>
            <option value="anual">Plan inversor</option>
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
        <Field label="Quién recibió la plata" t={t}>
          <select style={S.input} value={form.vendedor||""} onChange={e=>{const vendedor=e.target.value;setForm({...form,vendedor,transferido:ventaYaRecibida(vendedor)});}}>
            <option value="">Seleccionar...</option>
            {RECEPTORES_VENTA.map(v=>(<option key={v} value={v}>{v}{v===RECEPTOR_DIRECTO?" (directo)":""}</option>))}
          </select>
        </Field>
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
          <div className="sc-table-wrap" style={{overflowX:"auto"}}>
            <table className="sc-hist-table" style={S.table}>
              <thead><TableHeader cols={["Fecha y hora","Usuario","Acción","Cliente","Detalle"]} t={t}/></thead>
              <tbody>
                {pag.rows.map(h=>(
                  <tr key={h.id}>
                    <td style={{...S.td,whiteSpace:"nowrap",fontSize:13}}>{formatDateTime(h.created_at)}</td>
                    <td style={{...S.td,fontSize:13}}>{h.usuario_email||"-"}</td>
                    <td style={S.td}><span style={badge(h.accion)}>{h.accion||"-"}</span></td>
                    <td style={{...S.td,fontWeight:600}}>{h.detalle?.nombre||h.entidad||"-"}</td>
                    <td style={{...S.td,color:t.textMuted,fontSize:12,maxWidth:320,wordBreak:"break-word",whiteSpace:"normal",lineHeight:1.5}}>
                      {h.detalle?Object.entries(h.detalle).filter(([k])=>k!=="nombre").map(([k,v])=>`${k}: ${v}`).join(" · "):"—"}
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
  const[receptorVentaModal,setReceptorVentaModal]=useState(null);
  const[busquedaRapida,setBusquedaRapida]=useState(false);
  const[ingDesde,setIngDesde]=useState("");
  const[ingHasta,setIngHasta]=useState("");
  const[emailSaved,setEmailSaved]=useState(null);

  const toast=useToast();

  const baseRef=useRef(null);const vencRef=useRef(null);
  const deudRef=useRef(null);const clasesRef=useRef(null);
  const ingRef=useRef(null);const critRef=useRef(null);const pendRef=useRef(null);const pendGrafRef=useRef(null);

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
    if(!normalizarReceptorVenta(f.vendedor)){toast.error("Indicá quién recibió la plata");return null;}
    return{nombre,email:emailVal};
  }
  function buildPayload(f,nombre,emailVal){
    const dur=f.servicio==="clases"?0:Number(f.duracion_dias||0);
    const vendedor=normalizarReceptorVenta(f.vendedor);
    return{...f,nombre,email:emailVal,estado_manual:"activo",monto:Number(f.monto||0),duracion_dias:dur,deuda_restante:Number(f.deuda_restante||0),telefono:f.telefono||"",
      vendedor,transferido:ventaYaRecibida(vendedor),
      fecha_vencimiento:f.servicio==="clases"||dur<=0?null:toISODate(addDays(f.fecha_inicio,dur))};
  }
  function buildIng(cid,nombre,emailVal,servicio,monto,fecha,notas,vendedor){
    const receptor=normalizarReceptorVenta(vendedor);
    return{cliente_id:cid,cliente_nombre:nombre,email:emailVal,servicio,monto:Number(monto||0),fecha_pago:fecha,notas:notas||"",vendedor:receptor,transferido:ventaYaRecibida(receptor)};
  }
  function pedirReceptorVenta(valorInicial=""){
    return new Promise(resolve=>{
      setReceptorVentaModal({
        open:true,
        valorInicial:normalizarReceptorVenta(valorInicial)||"",
        onCancel:()=>{setReceptorVentaModal(null);resolve(null);},
        onConfirm:(receptor)=>{setReceptorVentaModal(null);resolve(normalizarReceptorVenta(receptor));},
      });
    });
  }

  async function guardarCliente(){
    const v=validateForm(form);if(!v)return;
    // Solo validar duplicado de email si hay email y no es clases
    if(form.servicio!=="clases"&&v.email){
      const dup=clientes.find(c=>c.email?.toLowerCase()===v.email);
      if(dup){toast.error(`Ya existe un cliente con el email ${v.email}`);return;}
    }
    setGuardando(true);
    const payload=buildPayload(form,v.nombre,v.email);
    const{data:ins,error}=await supabase.from("clientes").insert([payload]).select().single();
    if(error){setGuardando(false);toast.error("No se pudo guardar el cliente");return;}
    await supabase.from("ingresos").insert([buildIng(ins.id,ins.nombre,ins.email,ins.servicio,ins.monto,toISODate(getToday()),ins.notas,ins.vendedor)]);
    await logH(user?.email,"guardó nuevo cliente","cliente",ins.id,{nombre:ins.nombre,email:ins.email,servicio:ins.servicio,monto:ins.monto});
    await logNC(ins.id,user?.email,"alta",`Cliente dado de alta. Servicio: ${svcLabel(ins.servicio)} · Monto: USD ${ins.monto}`,{servicio:ins.servicio,monto:ins.monto});
    setGuardando(false);setShowForm(false);setForm(FORM_DEF);
    toast.success(`${v.nombre} agregado correctamente`);refetch();
    llamarDrive("compartir", ins.email); // en paralelo, no bloquea
  }
  async function guardarRenovacion(){
    const v=validateForm(renovarForm);if(!v)return;
    setRenovando(true);
    const payload=buildPayload(renovarForm,v.nombre,v.email);
    const{error:eC}=await supabase.from("clientes").update(payload).eq("id",renovarForm.id);
    if(eC){setRenovando(false);toast.error("No se pudo renovar el cliente");return;}
    await supabase.from("ingresos").insert([buildIng(renovarForm.id,v.nombre,v.email,renovarForm.servicio,renovarForm.monto,toISODate(getToday()),renovarForm.notas,renovarForm.vendedor)]);
    await logH(user?.email,"renovación de cliente","cliente",renovarForm.id,{nombre:v.nombre,servicio:renovarForm.servicio,monto:renovarForm.monto});
    await logNC(renovarForm.id,user?.email,"renovación",`Renovación de plan. Servicio: ${svcLabel(renovarForm.servicio)} · Monto: USD ${renovarForm.monto} · Recibió: ${renovarForm.vendedor}`,{servicio:renovarForm.servicio,monto:renovarForm.monto});
    setRenovando(false);setShowRenovar(false);
    toast.success(`${v.nombre} renovado correctamente`);refetch();
    llamarDrive("compartir", v.email); // en paralelo, no bloquea
  }
  async function renovarRapido(cliente){
    const vendedor=await pedirReceptorVenta("");
    if(!vendedor)return;
    const today=getToday();
    const dur=cliente.servicio==="clases"?0:Number(cliente.duracion_dias||svcDuration(cliente.servicio));
    const va=cliente.vencimiento||cliente.fecha_vencimiento||null;

    // Calcular días restantes del plan
    // Si está vencido: le quedan (dur - días_pasados_desde_vencimiento)
    // Si está activo/por vencer: arranca desde el vencimiento
    let diasRestantes = dur;
    let fb = toISODate(today); // fecha_inicio = hoy (es cuando paga)

    if (va && dur > 0) {
      const due = parseISODate(va);
      if (today > due) {
        // Está vencido — calcular cuántos días pasaron desde el vencimiento
        const diasVencido = diffDays(due, today);
        diasRestantes = Math.max(1, dur - diasVencido);
      }
      // Si está activo o en gracia sin vencer aún, da los 30 días completos
    }

    const nv = cliente.servicio==="clases"||dur<=0 ? null : toISODate(addDays(toISODate(today), diasRestantes));
    const payload={nombre:cliente.nombre||"",email:(cliente.email||"").trim().toLowerCase(),servicio:cliente.servicio,fecha_inicio:fb,monto:Number(cliente.monto||0),duracion_dias:diasRestantes,estado_manual:"activo",deuda_restante:Number(cliente.deuda_restante||0),notas:cliente.notas||"",telefono:cliente.telefono||"",vendedor,transferido:ventaYaRecibida(vendedor),fecha_vencimiento:nv};
    const{error:eC}=await supabase.from("clientes").update(payload).eq("id",cliente.id);
    if(eC){toast.error("No se pudo renovar el cliente");return;}
    await supabase.from("ingresos").insert([buildIng(cliente.id,cliente.nombre||"",(cliente.email||"").trim().toLowerCase(),cliente.servicio,cliente.monto,toISODate(today),cliente.notas,vendedor)]);
    await logH(user?.email,"renovó rápido cliente","cliente",cliente.id,{nombre:cliente.nombre,servicio:cliente.servicio,monto:cliente.monto});
    await logNC(cliente.id,user?.email,"renovación",`Renovación rápida. Servicio: ${svcLabel(cliente.servicio)} · Monto: USD ${cliente.monto} · Días: ${diasRestantes} · Recibió: ${vendedor}`,{servicio:cliente.servicio,monto:cliente.monto,dias:diasRestantes});
    toast.success(`✓ ${cliente.nombre} renovado — vence ${formatDate(nv)}`);refetch();
    llamarDrive("compartir", (cliente.email||"").trim().toLowerCase());
  }
  async function eliminarClienteConfirmado(cliente){
    // Quitar de pantalla inmediatamente sin destello
    setClientes(prev=>prev.filter(c=>c.id!==cliente.id));
    setClienteDetalle(null);
    const{error}=await supabase.from("clientes").delete().eq("id",cliente.id);
    if(error){toast.error("No se pudo eliminar");refetch();return;}
    await logH(user?.email,"eliminó cliente","cliente",cliente.id,{nombre:cliente.nombre,email:cliente.email});
    toast.success(`${cliente.nombre} eliminado`);
    llamarDrive("revocar",(cliente.email||"").trim().toLowerCase()); // en paralelo
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
  async function actualizarEmail(id, nuevoEmail) {
    const clienteActual = clientes.find(c => c.id === id);
    const emailAnterior = (clienteActual?.email || "").trim().toLowerCase();
    const emailNuevo = nuevoEmail.trim().toLowerCase();
    if (emailAnterior === emailNuevo) return; // no cambió nada
    const {error} = await supabase.from("clientes").update({email: emailNuevo}).eq("id", id);
    if (error) { toast.error("No se pudo actualizar el email"); return; }
    setEmailSaved(id); setTimeout(() => setEmailSaved(null), 2000);
    fetchClientes();
    // Revocar acceso al email anterior y dar acceso al nuevo
    if (emailAnterior && emailAnterior.includes("@")) llamarDrive("revocar", emailAnterior);
    if (emailNuevo && emailNuevo.includes("@")) llamarDrive("compartir", emailNuevo);
  }
  async function actualizarNombre(id, nuevoNombre) {
    if (!nuevoNombre.trim()) return;
    const {error} = await supabase.from("clientes").update({nombre: nuevoNombre.trim()}).eq("id", id);
    if (error) { toast.error("No se pudo actualizar el nombre"); return; }
    setClientes(prev => prev.map(c => c.id === id ? {...c, nombre: nuevoNombre.trim()} : c));
  }
  async function actualizarVencimiento(id, nuevaFecha) {
    if (!nuevaFecha) return;
    const {error} = await supabase.from("clientes").update({fecha_vencimiento: nuevaFecha}).eq("id", id);
    if (error) { toast.error("No se pudo actualizar el vencimiento"); return; }
    // Actualizar local — se refleja en dashboard/gráficos porque computed depende de clientes
    setClientes(prev => prev.map(c => c.id === id ? {...c, fecha_vencimiento: nuevaFecha} : c));
    toast.success("Vencimiento actualizado");
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
      vendedor:RECEPTOR_DIRECTO,
      transferido:true,
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
    setRenovarForm({id:cliente.id,nombre:cliente.nombre||"",email:cliente.email||"",telefono:cliente.telefono||"",servicio:cliente.servicio||"mensual",fecha_inicio:fb,monto:safeNum(cliente.monto),duracion_dias:cliente.servicio==="clases"?0:safeNum(cliente.duracion_dias||svcDuration(cliente.servicio)),deuda_restante:safeNum(cliente.deuda_restante),notas:cliente.notas||"",vendedor:"",transferido:true});
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
  const vencenEstaSemana=useMemo(()=>computed.filter(c=>c.dias!=null&&c.dias>=0&&c.dias<=7&&c.estadoSistema==="activo").length,[computed]);

  // Deudores con alerta — calcular meses gracia según monto pagado
  // 100 = 4 meses, 150 = 5 meses, 200 = 7 meses, resto = 1 mes
  function mesesGracia(montoDeuda) {
    const m = safeNum(montoDeuda);
    if (m >= 200) return 7;
    if (m >= 150) return 5;
    if (m >= 100) return 4;
    return 1;
  }
  const deudoresConAlerta = useMemo(() => {
    return computed.filter(c => {
      if (safeNum(c.deuda_restante) <= 0) return false;
      if (!c.fecha_inicio) return false;
      const inicio = parseISODate(c.fecha_inicio);
      if (!inicio) return false;
      const meses = mesesGracia(c.monto);
      // Alertar a partir de los 33 días (1 mes + 3 gracia)
      const diasLimite = meses * 30 + 3;
      const diasDesdeInicio = diffDays(inicio, getToday());
      return diasDesdeInicio >= diasLimite;
    });
  }, [computed]);
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

  // Ventas pendientes de transferencia a Cristian
  const pendientesTransferencia=useMemo(()=>
    ingresos.filter(i=>i.vendedor&&i.vendedor!==RECEPTOR_DIRECTO&&i.transferido===false)
  ,[ingresos]);
  const pendientesGrafPag=usePagination(pendientesTransferencia,5);
  const pendientesOperPag=usePagination(pendientesTransferencia,5);

  async function marcarTransferido(id, ingreso){
    const{error}=await supabase.from("ingresos").update({transferido:true}).eq("id",id);
    if(error){toast.error("No se pudo actualizar");return;}
    setIngresos(prev=>prev.map(i=>i.id===id?{...i,transferido:true}:i));
    // Registrar en historial
    await logH(user?.email,"recibió transferencia","ingreso",id,{nombre:ingreso?.cliente_nombre,vendedor:ingreso?.vendedor,monto:ingreso?.monto});
    await logNC(ingreso?.cliente_id,user?.email,"pago",`Transferencia recibida de ${ingreso?.vendedor}. Monto: ${ingreso?.monto} USD`,{vendedor:ingreso?.vendedor,monto:ingreso?.monto});
    toast.success(`✓ ${ingreso?.monto} USD recibidos de ${ingreso?.vendedor}`);
  }

  async function actualizarVendedor(id,vendedor){
    const receptor=normalizarReceptorVenta(vendedor);
    const transferido=ventaYaRecibida(receptor);
    const{error}=await supabase.from("clientes").update({vendedor:receptor,transferido}).eq("id",id);
    if(error){toast.error("No se pudo actualizar");return;}
    setClientes(prev=>prev.map(c=>c.id===id?{...c,vendedor:receptor,transferido}:c));
  }
  const today=getToday();
  const curMK=monthKey(toISODate(today));
  const prevMD=new Date(today.getFullYear(),today.getMonth()-1,1);
  const curMI=useMemo(()=>ingresos.filter(i=>{const d=parseISODate(i.fecha_pago);return d&&d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth();}),[ingresos]);
  const prevMI=useMemo(()=>ingresos.filter(i=>{const d=parseISODate(i.fecha_pago);return d&&d.getFullYear()===prevMD.getFullYear()&&d.getMonth()===prevMD.getMonth();}),[ingresos]);
  const ingMes=curMI.reduce((a,i)=>a+safeNum(i.monto),0);
  const ingMesAnt=prevMI.reduce((a,i)=>a+safeNum(i.monto),0);
  const trendMes=ingMesAnt>0?Math.round(((ingMes-ingMesAnt)/ingMesAnt)*100):null;
  const dashStats=useMemo(()=>({ingMes,ventasMes:curMI.length,bkMes:buildBreakdown(curMI),bkTotal:buildBreakdown(ingresos)}),[ingresos,curMI,ingMes]);

  // Promedio de ventas nuevas por día del mes actual
  // = total nuevos clientes (planes) este mes / días transcurridos del mes
  const ventaPromedioDia=useMemo(()=>{
    const nuevosDelMes=curMI.filter(i=>{
      if(i.servicio!=="mensual"&&i.servicio!=="anual")return false;
      const anteriores=ingresos.filter(j=>j.cliente_id===i.cliente_id&&j.fecha_pago<i.fecha_pago);
      return anteriores.length===0;
    });
    const diasTranscurridos=today.getDate(); // día actual del mes
    if(diasTranscurridos===0)return 0;
    const promedio=nuevosDelMes.length/diasTranscurridos;
    return Math.round(promedio*100)/100;
  },[curMI,ingresos,today]);
  const resumenMensual=useMemo(()=>{
    const map=new Map();
    ingresos.forEach(i=>{
      if(!i.fecha_pago)return;
      const key=monthKey(i.fecha_pago);
      if(key<"2026-03")return; // solo desde marzo 2026 en adelante
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
      {receptorVentaModal&&<ReceptorVentaModal open={!!receptorVentaModal} valorInicial={receptorVentaModal.valorInicial} onConfirm={receptorVentaModal.onConfirm} onCancel={receptorVentaModal.onCancel} t={t}/>}
      {busquedaRapida&&<BusquedaRapida clientes={computed} onSelect={c=>setClienteDetalle(c)} onClose={()=>setBusquedaRapida(false)} t={t}/>}
      {clienteDetalle&&(
        <ClienteDetailModal cliente={clienteDetalle} ingresos={ingresos} allClientes={computed} userEmail={user?.email} onClose={()=>setClienteDetalle(null)}
          onAbrirRenovar={c=>{setClienteDetalle(null);abrirRenovar(c);}}
          onEliminar={c=>{setClienteDetalle(null);askConfirm("Eliminar cliente",`¿Confirmas que querés eliminar a ${c.nombre}? Esta acción no se puede deshacer.`,()=>eliminarClienteConfirmado(c),{danger:true,label:"Eliminar"});}}
          onNotaGuardada={()=>toast.success("Nota guardada")}
          t={t}/>
      )}
      {pagoCliente&&<PagoModal cliente={pagoCliente} onClose={()=>setPagoCliente(null)} onConfirm={registrarPagoParcial} t={t}/>}
      {showRenovar&&<ClienteForm title="Renovar cliente" subtitle="Actualizar plan y registrar nuevo ingreso" form={renovarForm} setForm={setRenovarForm} onGuardar={guardarRenovacion} onCancelar={()=>setShowRenovar(false)} guardando={renovando} isModal t={t}/>}

      <div style={{maxWidth:1320,margin:"0 auto",padding:"24px 28px"}} className="sc-pad">

        {/* ── Header ── */}
        <div className="sc-header" style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",marginBottom:28,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <img src={LOGO_SRC} alt="Logo" style={{width:44,height:44,objectFit:"contain"}} onError={e=>{e.target.style.display="none";}}/>
            <div>
              <h1 style={{margin:0,fontSize:22,fontWeight:900,color:t.text,letterSpacing:"-0.03em"}}>Seminario Cripto</h1>
              <div className="sc-hide-mobile" style={{color:t.textMuted,fontSize:13,marginTop:2}}>Panel de gestión comercial y operativa</div>
            </div>
          </div>
          <div className="sc-nav" style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <button onClick={()=>setBusquedaRapida(true)} style={navBtn(false)}>🔍 Buscar</button>
            <button style={navBtn(activeView==="operativa")} onClick={()=>handleSetView("operativa")}>
              Operativa
              {totalCriticos>0&&<span style={{marginLeft:5,background:"#ef4444",color:"#fff",borderRadius:999,fontSize:10,fontWeight:800,padding:"1px 5px",verticalAlign:"middle"}}>{totalCriticos}</span>}
            </button>
            <button style={navBtn(activeView==="dashboard")} onClick={()=>handleSetView("dashboard")}>Dashboard</button>
            <button style={navBtn(activeView==="graficos")} onClick={()=>handleSetView("graficos")}>Gráficos</button>
            <button style={navBtn(activeView==="historial")} onClick={()=>handleSetView("historial")}>Historial</button>
            <a href={EMAILS_CRM_URL} style={{...navBtn(false),textDecoration:"none",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>CRM</a>
            <button style={{...btn(false,true),padding:"10px 14px"}} onClick={()=>setShowForm(!showForm)}>{showForm?"Cerrar":"+ Nuevo"}</button>
            <button onClick={()=>setDark(!dark)} style={{padding:"10px 12px",borderRadius:10,border:`1px solid ${t.navInBr}`,background:t.navInBg,cursor:"pointer",color:t.text,fontSize:15}}>{dark?"☀":"☾"}</button>
            <button onClick={logout} style={{padding:"10px 12px",borderRadius:10,border:`1px solid ${t.navInBr}`,background:t.navInBg,cursor:"pointer",fontWeight:600,color:t.text,fontSize:13}}>Salir</button>
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
              <MetricCard title="Clientes" value={resumen.activos+resumen.gracia+resumen.sacar} subValue={`${resumen.activos} activos`} t={t}/>
              <MetricCard title="Ventas por día" value={`${ventaPromedioDia}`} sub="nuevos planes ÷ días con ventas" t={t}/>
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
            {/* Ventas por día — histórico mensual */}
            {(()=>{
              const hoy=getToday();
              const data=resumenConTrend.map(r=>{
                const ingMesR=ingresos.filter(i=>
                  i.fecha_pago&&monthKey(i.fecha_pago)===r.key&&
                  (i.servicio==="mensual"||i.servicio==="anual")
                );
                const nuevos=ingMesR.filter(i=>{
                  const ant=ingresos.filter(j=>j.cliente_id===i.cliente_id&&j.fecha_pago<i.fecha_pago);
                  return ant.length===0;
                });
                // Para el mes actual usar días transcurridos, para meses pasados usar días del mes
                const [y,m]=r.key.split("-");
                const esMesActual=r.key===curMK;
                const dias=esMesActual?hoy.getDate():new Date(Number(y),Number(m),0).getDate();
                const vpd=dias>0?Math.round((nuevos.length/dias)*100)/100:0;
                return{key:r.key,nuevos:nuevos.length,dias,vpd,esMesActual};
              });
              const maxVpd=Math.max(...data.map(d=>d.vpd),0.01);
              return(
                <div style={S.card}>
                  <h3 style={{marginTop:0,color:t.text,fontWeight:700,fontSize:16,marginBottom:6}}>Ventas por día — histórico</h3>
                  <div style={{color:t.textMuted,fontSize:13,marginBottom:18}}>Nuevos clientes (planes) ÷ días transcurridos del mes</div>
                  <div style={{display:"grid",gap:12}}>
                    {data.map(d=>{
                      const pct=Math.max((d.vpd/maxVpd)*100,d.vpd>0?4:0);
                      return(
                        <div key={d.key}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontSize:13,color:t.text}}>
                            <span style={{fontWeight:d.esMesActual?800:500}}>
                              {monthLabel(d.key)}{d.esMesActual?" ★":""}
                            </span>
                            <div style={{display:"flex",alignItems:"center",gap:12}}>
                              <span style={{color:t.textMuted,fontSize:12}}>{d.nuevos} ventas en {d.dias} días</span>
                              <strong style={{color:d.vpd>=2.5?"#22c55e":d.vpd>=1.5?"#f59e0b":"#ef4444",fontSize:15}}>
                                {d.vpd} v/día
                              </strong>
                            </div>
                          </div>
                          <div style={{height:8,background:t.barBg,borderRadius:999,overflow:"hidden"}}>
                            <div style={{width:`${pct}%`,height:"100%",borderRadius:999,
                              background:d.vpd>=2.5?"#22c55e":d.vpd>=1.5?"#f59e0b":"#ef4444"}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{marginTop:16,display:"flex",gap:16,fontSize:12,color:t.textMuted,flexWrap:"wrap"}}>
                    <span style={{color:"#22c55e",fontWeight:700}}>● ≥ 2.5 ventas/día — excelente</span>
                    <span style={{color:"#f59e0b",fontWeight:700}}>● ≥ 1.5 ventas/día — bueno</span>
                    <span style={{color:"#ef4444",fontWeight:700}}>● &lt; 1.5 ventas/día — a mejorar</span>
                  </div>
                </div>
              );
            })()}

            {/* Ventas pendientes de recepción */}
            {(() => {
              if(pendientesTransferencia.length===0)return null;
              const vendedorStats = VENDEDORES.reduce((acc,v)=>({...acc,[v]:{total:0,count:0}}),...[{}]);
              pendientesTransferencia.forEach(i=>{
                if(i.vendedor&&vendedorStats[i.vendedor]){
                  vendedorStats[i.vendedor].total+=safeNum(i.monto);
                  vendedorStats[i.vendedor].count+=1;
                }
              });
              return(
                <div ref={pendGrafRef} style={S.card}>
                  <h3 style={{marginTop:0,color:t.text,fontWeight:700,fontSize:16,marginBottom:18}}>Ventas pendientes de recepción</h3>
                  <div style={{display:"grid",gap:16}}>
                    {VENDEDORES.map(v=>{
                      const st=vendedorStats[v];
                      if(st.count===0)return null;
                      return(
                        <div key={v} style={{padding:"14px 16px",borderRadius:12,background:t.dark?"#0d1526":"#f8f6f3",border:`1px solid ${t.cardBorder}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                            <span style={{fontWeight:700,color:t.text,fontSize:15}}>{v}</span>
                            <span style={{fontWeight:800,color:t.accent,fontSize:15}}>USD {st.total}</span>
                          </div>
                          <div style={{display:"flex",gap:16,fontSize:12,color:t.textMuted}}>
                            <span>{st.count} venta{st.count!==1?"s":""}</span>
                            <span style={{color:"#f59e0b",fontWeight:700}}>pendiente de recepción</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
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
              <MetricCard title="Clientes" value={resumen.activos+resumen.gracia+resumen.sacar} subValue={`${resumen.activos} activos`} t={t}/>
              <MetricCard title="Ventas por día" value={`${ventaPromedioDia}`} sub="nuevos planes ÷ días con ventas" t={t}/>
              <MetricCard title="Tasa de renovación" value={tasaRenovacion!=null?`${tasaRenovacion}%`:"—"} sub="clientes que renovaron vs mes anterior" t={t}/>
            </div>
            <BreakdownCard title="Ingresos por tipo (mes)" breakdown={dashStats.bkMes} t={t}/>
            <BreakdownCard title="Ingresos totales por tipo" breakdown={dashStats.bkTotal} t={t}/>
            {/* Detalle ingresos con filtro fecha */}
            <div ref={ingRef} style={S.card}>
              <div className="sc-card-row" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:12}}>
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
            <div className="sc-metrics" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:14,marginBottom:20}}>
              {[
                ["Clientes",resumen.activos+resumen.gracia+resumen.sacar,false,null,`${resumen.activos} activos`],
                ["En gracia",resumen.gracia,false,null,null],
                ["Vencen esta semana",vencenEstaSemana,false,null,null],
                ["Deudores",resumen.deudores,false,()=>deudRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),null],
                ["Clases",resumen.clases,false,()=>clasesRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),null],
                ...(pendientesTransferencia.length>0?[["Pendientes",`${pendientesTransferencia.reduce((a,c)=>a+safeNum(c.monto),0)} USD`,false,()=>pendRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),"por recibir"]]:[]),
                ["Ingresos totales",`USD ${resumen.ingresos}`,true,null,null],
              ].map(([l,v,a,onClick,subVal])=>(
                <div key={l} onClick={onClick||undefined}
                  style={{...S.card,borderTop:a?`3px solid ${t.accent}`:l==="Vencen esta semana"&&vencenEstaSemana>0?`3px solid #f59e0b`:undefined,cursor:onClick?"pointer":undefined,transition:"box-shadow 0.15s"}}
                  onMouseEnter={e=>{if(onClick)e.currentTarget.style.boxShadow="0 4px 20px rgba(0,0,0,0.15)";}}
                  onMouseLeave={e=>{if(onClick)e.currentTarget.style.boxShadow=S.card.boxShadow;}}>
                  <div style={{fontSize:11,color:t.textMuted,marginBottom:6,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>{l}</div>
                  <div style={{fontSize:24,fontWeight:800,color:a?t.accent:l==="Vencen esta semana"&&vencenEstaSemana>0?"#f59e0b":t.text,letterSpacing:"-0.02em"}}>{v}</div>
                  {subVal&&<div style={{fontSize:13,color:t.textMuted,fontWeight:600,marginTop:4}}>{subVal}</div>}
                  {onClick&&<div style={{fontSize:11,color:t.textMuted,marginTop:4}}>{l==="Deudores"||l==="Clases"?"Clic para ir":"Clic para filtrar"}</div>}
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
              <div className="sc-criticos" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,alignItems:"stretch"}}>
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
              <div className="sc-filters" style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
                {[
                  ["Todos","todos","#6b7280"],
                  ["Activos","activo","#22c55e"],
                  ["En gracia","gracia","#f59e0b"],
                  ["Vencidos","vencido","#ef4444"],
                  ["Plan trader","mensual",t.accent],
                  ["Plan inversor","anual","#5b8dee"],
                  ["Clases","clases","#a78bfa"],
                ].map(([label,val,color])=>(
                  <button key={val} onClick={()=>setFiltro(val)}
                    style={{padding:"6px 14px",borderRadius:999,border:`2px solid ${filtro===val?color:t.cardBorder}`,background:filtro===val?color:"transparent",color:filtro===val?"#fff":t.textMuted,fontWeight:700,fontSize:12,cursor:"pointer",transition:"all 0.15s"}}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:18}}>
                <input style={{...S.input,maxWidth:340}} placeholder="Buscar por nombre, email o teléfono" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
              </div>
              <div className="sc-table-wrap" style={{overflowX:"auto"}}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Cliente","Email","Servicio","Vencimiento","Días","Estado","Acciones"]} t={t}/></thead>
                  <tbody>
                    {!loading&&basePag.rows.map(c=>(
                      <tr key={c.id}>
                        {/* Nombre editable — Enter guarda, Esc cancela, clic en ícono abre ficha */}
                        <td style={{...S.td,fontWeight:700}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <input value={c.nombre||""}
                              onChange={e=>setClientes(prev=>prev.map(cl=>cl.id===c.id?{...cl,nombre:e.target.value}:cl))}
                              onBlur={e=>actualizarNombre(c.id,e.target.value)}
                              onKeyDown={e=>{
                                if(e.key==="Enter"){e.target.blur();}
                                if(e.key==="Escape"){setClientes(prev=>prev.map(cl=>cl.id===c.id?{...cl,nombre:c.nombre}:cl));e.target.blur();}
                              }}
                              style={{flex:1,padding:"6px 10px",borderRadius:8,border:`1px solid ${t.inputBorder}`,fontSize:13,fontWeight:700,boxSizing:"border-box",background:t.inputBg,color:t.accent}}/>
                            {/* Ícono para abrir ficha */}
                            <span title="Ver ficha" onClick={()=>setClienteDetalle(c)} style={{cursor:"pointer",color:t.textMuted,fontSize:14,flexShrink:0,padding:"2px 4px",borderRadius:6}} onMouseEnter={e=>e.currentTarget.style.color=t.accent} onMouseLeave={e=>e.currentTarget.style.color=t.textMuted}>↗</span>
                            {nuevosEsteMes.has(c.id)&&<span style={{fontSize:10,fontWeight:800,padding:"2px 6px",borderRadius:999,background:t.accentGrad,color:"#0f172a",whiteSpace:"nowrap"}}>NUEVO</span>}
                          </div>
                        </td>
                        {/* Email editable */}
                        <td style={S.td}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <input value={c.email||""} onChange={e=>setClientes(prev=>prev.map(cl=>cl.id===c.id?{...cl,email:e.target.value}:cl))} onBlur={e=>actualizarEmail(c.id,e.target.value)}
                              style={{flex:1,padding:"6px 10px",borderRadius:8,border:`1px solid ${t.inputBorder}`,fontSize:13,boxSizing:"border-box",background:t.inputBg,color:t.inputText}}/>
                            {emailSaved===c.id&&<span style={{fontSize:11,color:"#22c55e",fontWeight:700,whiteSpace:"nowrap"}}>✓</span>}
                          </div>
                        </td>
                        <td style={S.td}>{svcLabel(c.servicio)}</td>
                        {/* Vencimiento editable */}
                        <td style={S.td}>
                          {c.servicio==="clases"?"-":(
                            <input type="date" value={c.vencimiento||""} onChange={e=>setClientes(prev=>prev.map(cl=>cl.id===c.id?{...cl,fecha_vencimiento:e.target.value,vencimiento:e.target.value}:cl))} onBlur={e=>actualizarVencimiento(c.id,e.target.value)}
                              style={{padding:"5px 8px",borderRadius:8,border:`1px solid ${t.inputBorder}`,fontSize:12,background:t.inputBg,color:t.inputText,width:130}}/>
                          )}
                        </td>
                        {/* Días con color */}
                        <td style={S.td}>
                          {c.vencimiento!=null?(
                            <span style={{fontWeight:700,color:c.dias<0?"#ef4444":c.dias<=5?"#f59e0b":"#22c55e"}}>
                              {c.dias}
                            </span>
                          ):"-"}
                        </td>
                        <td style={S.td}><span style={badgeStyle(c.estadoSistema)}>{c.estadoSistema.toUpperCase()}</span></td>
                        <td style={S.td}>
                          <div style={{display:"flex",gap:5,alignItems:"center"}}>
                            <button title="Renovación rápida" style={{...btn(true),padding:"7px 11px",fontSize:13}} onClick={()=>askConfirm("Renovar cliente",`¿Renovar a ${c.nombre} con el mismo plan?`,()=>renovarRapido(c),{label:"Renovar"})}>✔</button>
                            <button title="Renovar con cambios" style={{...btn(false),padding:"7px 11px",fontSize:13}} onClick={()=>abrirRenovar(c)}>✏️</button>
                            {c.telefono&&(
                              <a href={`https://wa.me/${c.telefono.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                                style={{...btn(false),padding:"7px 11px",fontSize:13,textDecoration:"none",color:"#22c55e",background:"rgba(34,197,94,0.12)"}} title="WhatsApp">💬</a>
                            )}
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

            {/* Alerta deudores vencidos */}
            {deudoresConAlerta.length>0&&(
              <div style={{...S.card,marginBottom:24,border:`2px solid #ef4444`,background:dark?"#1a0a0a":"#fff5f5"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <span style={{fontSize:20}}>🚨</span>
                  <div>
                    <h3 style={{margin:0,color:"#ef4444",fontWeight:800,fontSize:17}}>Deudas vencidas — requieren atención</h3>
                    <div style={{color:t.textMuted,fontSize:13,marginTop:3}}>
                      Estos clientes superaron el período de gracia según el monto que abonaron. Considerá pasarlos a plan mensual o gestionar el cobro.
                    </div>
                  </div>
                </div>
                <div style={{display:"grid",gap:8}}>
                  {deudoresConAlerta.map(c=>{
                    const meses=mesesGracia(c.monto);
                    const diasDesde=diffDays(parseISODate(c.fecha_inicio),getToday());
                    return(
                      <div key={c.id} className="sc-card-row" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:10,background:dark?"#2a0a0a":"#fff",border:"1px solid #fca5a5",gap:10,flexWrap:"wrap"}}>
                        <div style={{cursor:"pointer"}} onClick={()=>setClienteDetalle(c)}>
                          <span style={{fontWeight:700,color:t.accent,fontSize:14}}>{c.nombre}</span>
                          <span style={{color:t.textMuted,fontSize:12,marginLeft:10}}>{svcLabel(c.servicio)} · Pagó USD {c.monto} · Debe USD {c.deuda_restante}</span>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <span style={{fontSize:12,color:"#ef4444",fontWeight:600}}>{diasDesde} días desde el inicio ({meses} meses de gracia ya vencidos)</span>
                          <button style={{...btn(false,true),padding:"6px 12px",fontSize:12}} onClick={()=>setPagoCliente(c)}>Registrar pago</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pendientes de transferencia */}
            {pendientesTransferencia.length>0&&(
              <div ref={pendRef} style={{...S.card,marginBottom:24,border:`2px solid #f59e0b`,background:dark?"#1a1200":"#fffbeb"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                  <div>
                    <h3 style={{margin:0,color:"#92400e",fontWeight:800,fontSize:17}}>
                      Ventas pendientes de recepción
                      <span style={{marginLeft:10,background:"#f59e0b",color:"#fff",borderRadius:999,fontSize:13,fontWeight:800,padding:"3px 10px"}}>{pendientesTransferencia.length}</span>
                    </h3>
                  </div>
                </div>
                <div style={{display:"grid",gap:8}}>
                  {pendientesOperPag.rows.map(c=>(
                    <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:10,background:dark?"#2a1800":"#fff",border:"1px solid #fde68a",gap:10,flexWrap:"wrap"}}>
                      <div>
                        <span style={{fontWeight:700,color:t.text,fontSize:14}}>{c.cliente_nombre}</span>
                        <span style={{color:t.textMuted,fontSize:12,marginLeft:10}}>{svcLabel(c.servicio)} · {c.monto} USD</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,fontWeight:700,color:"#92400e",padding:"3px 10px",borderRadius:999,background:"#fef3c7"}}>{c.vendedor}</span>
                        <span style={{fontSize:12,color:t.textMuted}}>{formatDate(c.fecha_pago)}</span>
                        <button style={{...btn(false,true),padding:"6px 14px",fontSize:12}} onClick={()=>askConfirm("Marcar como recibido",`¿Confirmás que ${c.vendedor} ya te transfirió ${c.monto} USD por ${c.cliente_nombre}?`,()=>marcarTransferido(c.id,c),{label:"Recibido ✓"})}>
                          Marcar recibido
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination page={pendientesOperPag.page} totalPages={pendientesOperPag.totalPages} setPage={pendientesOperPag.setPage} sectionRef={pendRef} t={t}/>
              </div>
            )}

            {/* Resumen mensual */}
            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr)",gap:24}}>
              <div style={S.card}>
                <h3 style={{marginTop:0,color:t.text,fontWeight:800,fontSize:18,marginBottom:16}}>Resumen mensual</h3>
                <div className="sc-table-wrap" style={{overflowX:"auto"}}>
                  <table style={S.table}>
                    <thead><TableHeader cols={["Mes","Plan trader","Plan inversor","Clases","Total","Tendencia"]} t={t}/></thead>
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
                    );<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CRM Seminario Cripto</title>
  <link rel="icon" type="image/png" href="./uploads/favicon.png" />
  <link rel="shortcut icon" type="image/png" href="./uploads/favicon.png" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── DARK THEME (default) ── */
    body.dark {
      --sidebar-bg: #0B0E17;
      --bg:       #0B0E17;
      --surface:  #111520;
      --surface2: #171C2E;
      --border:   rgba(255,255,255,0.07);
      --border2:  rgba(255,255,255,0.13);
      --text:     #E2DFDA;
      --muted:    rgba(226,223,218,0.45);
      --hover:    rgba(255,255,255,0.04);
      --input-bg: #0B0E17;
      --scrollbar: rgba(255,255,255,0.1);
    }

    /* ── LIGHT THEME ── */
    body.light {
      --sidebar-bg: #FFFFFF;
      --bg:       #F4F2EE;
      --surface:  #FFFFFF;
      --surface2: #EAE8E3;
      --border:   rgba(0,0,0,0.08);
      --border2:  rgba(0,0,0,0.14);
      --text:     #1A1714;
      --muted:    rgba(26,23,20,0.48);
      --hover:    rgba(0,0,0,0.03);
      --input-bg: #F4F2EE;
      --scrollbar: rgba(0,0,0,0.12);
    }

    /* ── SHARED ── */
    body {
      --gold:      #C9A84C;
      --gold-dim:  rgba(201,168,76,0.12);
      --gold-dim2: rgba(201,168,76,0.22);
      --green:     oklch(0.62 0.17 145);
      --green-dim: oklch(0.62 0.17 145 / 0.12);
      --red:       oklch(0.60 0.18 25);
      --red-dim:   oklch(0.60 0.18 25 / 0.12);
      --blue:      oklch(0.60 0.14 240);
      --blue-dim:  oklch(0.60 0.14 240 / 0.12);
    }

    html, body { height: 100%; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 13px;
      line-height: 1.5;
      overflow: hidden;
      transition: background 0.2s, color 0.2s;
    }

    input[type="datetime-local"]::-webkit-calendar-picker-indicator {
      filter: invert(1);
      opacity: 0.85;
      cursor: pointer;
    }
    body.light input[type="datetime-local"]::-webkit-calendar-picker-indicator {
      filter: invert(0);
      opacity: 0.7;
    }

    #root { height: 100vh; display: flex; flex-direction: column; }
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 4px; }
  </style>
</head>
<body class="dark">
<div id="root"></div>
<script type="text/babel">

// ── SUPABASE CLIENT ────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://yrkpmkbfgearjdjhyejy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5bCPc-s6x6swbFjMlxgiRA_u8mwGMAF';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const DEFAULT_WHATSAPP_URL = 'https://api.whatsapp.com/send/?phone=5492234664407&text&type=phone_number&app_absent=0';
const DEFAULT_TEST_EMAIL = 'crisdalessandro19@gmail.com';
const SEND_EMAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-email`;
  const EMAIL_LOGO_DATA_URI = 'data:image/png;base64,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';

const RESEND_FREE_MONTHLY_LIMIT = 3000;
const RESEND_FREE_DAILY_LIMIT = 100;

const EMAIL_TEMPLATES = [
  {
    id: 'newsletter',
    label: 'Newsletter semanal',
    asunto: 'El mercado habló. ¿Estás leyendo bien la señal?',
    preheader: 'Lo que pocos están viendo esta semana en cripto.',
    body: `<div style="background:#0B0E17;padding:24px 0;font-family:'DM Sans',Arial,sans-serif;color:#E9EDF6;">
  <div style="max-width:640px;margin:0 auto;background:#131A2A;border:1px solid #232B3D;border-radius:18px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.35);">
    <div style="background:#0B0E17;padding:28px 34px;border-bottom:1px solid #232B3D;text-align:center;">
      <img src="{{LOGO_URL}}" alt="Seminario Cripto" style="width:62px;height:62px;object-fit:contain;margin:0 auto 14px;display:block;" />
      <div style="font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#D4AF37;font-weight:700;">Seminario Cripto</div>
      <h1 style="margin:14px 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:40px;line-height:1.08;color:#FFFFFF;">Newsletter Semanal</h1>
      <div style="font-size:13px;color:#8F97A8;text-transform:uppercase;letter-spacing:0.08em;">[FECHA]</div>
    </div>
    <div style="padding:34px 36px;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:19px;line-height:1.55;color:#F5F7FB;">Esta semana el mercado mandó señales claras.<br/>Pero la mayoría no las está leyendo bien.<br/>Acá te contamos qué está pasando — y qué hacer con eso.</div>
      <div style="margin:30px 0 24px;display:flex;align-items:center;gap:14px;"><div style="height:1px;background:#2B3347;flex:1;"></div><div style="width:7px;height:7px;border-radius:999px;background:#D4AF37;"></div><div style="height:1px;background:#2B3347;flex:1;"></div></div>
      <div style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#D4AF37;font-weight:700;margin-bottom:18px;">Noticias de la semana</div>
      <div style="border-left:3px solid #D4AF37;padding-left:16px;margin-bottom:20px;">
        <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#D4AF37;font-weight:700;margin-bottom:8px;">Bitcoin</div>
        <div style="font-size:28px;line-height:1.2;color:#FFFFFF;font-weight:800;margin-bottom:10px;">BTC recupera estructura y vuelve a zona clave</div>
        <div style="font-size:15px;line-height:1.7;color:#C7CDDA;">Después de semanas de ruido, Bitcoin está mostrando una reacción más ordenada en una zona que el mercado no puede ignorar. Si sostiene esta recuperación, puede abrir una nueva etapa de compresión antes del próximo movimiento relevante.</div>
      </div>
      <div style="border-left:3px solid #D4AF37;padding-left:16px;margin-bottom:20px;">
        <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#D4AF37;font-weight:700;margin-bottom:8px;">Ethereum</div>
        <div style="font-size:28px;line-height:1.2;color:#FFFFFF;font-weight:800;margin-bottom:10px;">ETH acumula mientras el foco sigue en BTC</div>
        <div style="font-size:15px;line-height:1.7;color:#C7CDDA;">Ethereum empieza a mostrar señales de fortaleza relativa. No es ruido de corto plazo: cuando el mercado gira sin avisar, estos detalles suelen ser los primeros en anticiparlo.</div>
      </div>
      <div style="border-left:3px solid #D4AF37;padding-left:16px;margin-bottom:28px;">
        <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#D4AF37;font-weight:700;margin-bottom:8px;">Altcoins</div>
        <div style="font-size:28px;line-height:1.2;color:#FFFFFF;font-weight:800;margin-bottom:10px;">Empiezan a verse señales de rotación</div>
        <div style="font-size:15px;line-height:1.7;color:#C7CDDA;">Cuando el dinero empieza a distribuirse mejor dentro del mercado, las oportunidades cambian. No se trata de comprar por impulso, sino de identificar qué activos empiezan a liderar de verdad.</div>
      </div>
      <div style="background:#192235;border:1px solid #2C3650;border-radius:16px;padding:26px 28px;margin:0 0 28px;">
        <div style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#D4AF37;font-weight:700;margin-bottom:10px;">Análisis / Seminario Cripto</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:#FFFFFF;font-weight:700;margin-bottom:14px;">¿Cuándo entrar? La pregunta que más nos hacen.</div>
        <div style="font-size:15px;line-height:1.8;color:#D9DEEA;">El timing perfecto no existe. Lo que sí existe es un método. Los que esperan una “señal definitiva” suelen perder la entrada. Los que operan con criterio, gestión de riesgo y contexto claro, son los que terminan capitalizando.</div>
        <div style="margin-top:16px;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.15);border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.6;color:#E7C868;">⚠️ Contexto de mercado: volatilidad moderada-alta. La gestión del riesgo sigue siendo prioridad antes de cualquier entrada.</div>
      </div>
      <div style="text-align:center;padding:10px 6px 0;">
        <div style="font-size:32px;line-height:1.25;color:#FFFFFF;font-weight:800;margin-bottom:14px;">Si aún no formás parte del seguimiento en tiempo real...</div>
        <div style="max-width:520px;margin:0 auto 10px;font-size:18px;line-height:1.7;color:#C7CDDA;">Cada semana analizamos el mercado en vivo, respondemos dudas y compartimos operativas concretas. Sin filtros, sin humo.</div>
        <div style="font-size:15px;line-height:1.7;color:#E7C868;font-weight:700;margin-bottom:18px;">Accedé al análisis en tiempo real antes de que cierre el acceso.</div>
        {{WHATSAPP_BUTTON}}
      </div>
      <div style="margin-top:28px;padding-top:22px;border-top:1px solid #2B3347;font-size:15px;line-height:1.8;color:#C7CDDA;">El mercado no espera. Pero tampoco hay que correr — hay que entender.<br/>Nos vemos adentro.</div>
      <div style="margin-top:22px;display:flex;align-items:center;gap:14px;">
        <img src="{{LOGO_URL}}" alt="Seminario Cripto" style="width:42px;height:42px;object-fit:contain;display:block;" />
        <div><div style="font-size:22px;font-weight:800;color:#FFFFFF;">Seminario Cripto</div><div style="font-size:14px;color:#9AA3B5;">Educación financiera con criterio</div></div>
      </div>
    </div>
    <div style="background:#0B0E17;padding:16px 24px;border-top:1px solid #232B3D;text-align:center;font-size:12px;line-height:1.6;color:#7F8797;">Recibís este email porque te suscribiste o tuviste contacto con Seminario Cripto.<br/>Para darte de baja, respondé este email con “BAJA” en el asunto.</div>
  </div>
</div>`
  },
  {
    id: 'educativo',
    label: 'Contenido educativo',
    asunto: 'Una idea simple que puede cambiar tu lectura de mercado',
    preheader: 'Menos ruido, más criterio: una lección útil para esta semana.',
    body: `<div style="background:#0B0E17;padding:24px 0;font-family:'DM Sans',Arial,sans-serif;color:#E9EDF6;">
  <div style="max-width:640px;margin:0 auto;background:#131A2A;border:1px solid #232B3D;border-radius:18px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.35);">
    <div style="background:#0B0E17;padding:28px 34px;border-bottom:1px solid #232B3D;text-align:center;">
      <img src="{{LOGO_URL}}" alt="Seminario Cripto" style="width:62px;height:62px;object-fit:contain;margin:0 auto 14px;display:block;" />
      <div style="font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#D4AF37;font-weight:700;">Seminario Cripto</div>
      <h1 style="margin:14px 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.08;color:#FFFFFF;">Idea de la Semana</h1>
      <div style="font-size:13px;color:#8F97A8;text-transform:uppercase;letter-spacing:0.08em;">[FECHA]</div>
    </div>
    <div style="padding:34px 36px;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:19px;line-height:1.55;color:#F5F7FB;">El mercado no se entiende con una sola señal.<br/>Se entiende leyendo contexto, estructura y confirmación.</div>
      <div style="margin:30px 0 24px;display:flex;align-items:center;gap:14px;"><div style="height:1px;background:#2B3347;flex:1;"></div><div style="width:7px;height:7px;border-radius:999px;background:#D4AF37;"></div><div style="height:1px;background:#2B3347;flex:1;"></div></div>
      <div style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#D4AF37;font-weight:700;margin-bottom:18px;">Concepto principal</div>
      <div style="font-size:30px;line-height:1.2;color:#FFFFFF;font-weight:800;margin-bottom:12px;">No alcanza con ver una vela o una línea aislada</div>
      <div style="font-size:15px;line-height:1.8;color:#C7CDDA;margin-bottom:18px;">Una de las confusiones más comunes es creer que una sola referencia alcanza para operar. La realidad es otra: el mercado se entiende cuando combinás estructura, zonas relevantes y confirmaciones. Ahí es donde el análisis deja de ser superficial y pasa a tener criterio.</div>
      <div style="display:grid;gap:14px;margin-bottom:28px;">
        <div style="background:#192235;border:1px solid #2C3650;border-radius:14px;padding:18px;">
          <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#D4AF37;font-weight:700;margin-bottom:6px;">1. Estructura</div>
          <div style="font-size:15px;line-height:1.7;color:#D9DEEA;">Definí si el mercado está impulsando, retrocediendo o simplemente lateralizando. Sin eso, cualquier entrada queda aislada.</div>
        </div>
        <div style="background:#192235;border:1px solid #2C3650;border-radius:14px;padding:18px;">
          <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#D4AF37;font-weight:700;margin-bottom:6px;">2. Zonas</div>
          <div style="font-size:15px;line-height:1.7;color:#D9DEEA;">Buscá niveles en los que el precio ya mostró interés real. Ahí es donde el mercado suele reaccionar con más claridad.</div>
        </div>
        <div style="background:#192235;border:1px solid #2C3650;border-radius:14px;padding:18px;">
          <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#D4AF37;font-weight:700;margin-bottom:6px;">3. Confirmación</div>
          <div style="font-size:15px;line-height:1.7;color:#D9DEEA;">No adivines. Esperá la reacción que valide la idea: throwback, pullback o la señal que uses dentro de tu método.</div>
        </div>
      </div>
      <div style="background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.15);border-radius:12px;padding:15px 16px;font-size:15px;line-height:1.7;color:#E7C868;margin-bottom:28px;">💡 Lección práctica: cuando falta confirmación, lo más profesional no es entrar “por si arranca”, sino esperar.</div>
      <div style="text-align:center;padding:10px 6px 0;">
        <div style="font-size:30px;line-height:1.25;color:#FFFFFF;font-weight:800;margin-bottom:14px;">Si querés bajar esto a operativas concretas...</div>
        <div style="max-width:520px;margin:0 auto 10px;font-size:18px;line-height:1.7;color:#C7CDDA;">En Seminario Cripto trabajamos estas ideas con contexto real de mercado, para que no queden solo en teoría.</div>
        {{WHATSAPP_BUTTON}}
      </div>
    </div>
  </div>
</div>`
  },
  {
    id: 'discord',
    label: 'Invitación comunidad',
    asunto: 'Te abrimos la puerta al seguimiento en tiempo real',
    preheader: 'Entrá a la comunidad y seguí el mercado con contexto.',
    body: `<div style="background:#0B0E17;padding:24px 0;font-family:'DM Sans',Arial,sans-serif;color:#E9EDF6;">
  <div style="max-width:640px;margin:0 auto;background:#131A2A;border:1px solid #232B3D;border-radius:18px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.35);">
    <div style="background:#0B0E17;padding:28px 34px;border-bottom:1px solid #232B3D;text-align:center;">
      <img src="{{LOGO_URL}}" alt="Seminario Cripto" style="width:62px;height:62px;object-fit:contain;margin:0 auto 14px;display:block;" />
      <div style="font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#D4AF37;font-weight:700;">Seminario Cripto</div>
      <h1 style="margin:14px 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.08;color:#FFFFFF;">Acceso a la Comunidad</h1>
      <div style="font-size:13px;color:#8F97A8;text-transform:uppercase;letter-spacing:0.08em;">Seguimiento en tiempo real</div>
    </div>
    <div style="padding:34px 36px;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:19px;line-height:1.55;color:#F5F7FB;">No se trata de mirar el mercado solo.<br/>Se trata de tener contexto, criterio y un lugar donde aterrizar cada movimiento.</div>
      <div style="margin:30px 0 24px;display:flex;align-items:center;gap:14px;"><div style="height:1px;background:#2B3347;flex:1;"></div><div style="width:7px;height:7px;border-radius:999px;background:#D4AF37;"></div><div style="height:1px;background:#2B3347;flex:1;"></div></div>
      <div style="font-size:30px;line-height:1.2;color:#FFFFFF;font-weight:800;margin-bottom:14px;">¿Qué encontrás adentro?</div>
      <div style="display:grid;gap:14px;margin-bottom:28px;">
        <div style="background:#192235;border:1px solid #2C3650;border-radius:14px;padding:18px;">
          <div style="font-size:16px;line-height:1.7;color:#D9DEEA;"><strong style="color:#FFFFFF;">Análisis semanales</strong> con lectura de contexto y niveles relevantes.</div>
        </div>
        <div style="background:#192235;border:1px solid #2C3650;border-radius:14px;padding:18px;">
          <div style="font-size:16px;line-height:1.7;color:#D9DEEA;"><strong style="color:#FFFFFF;">Seguimiento en tiempo real</strong> para acompañar el mercado cuando más importa.</div>
        </div>
        <div style="background:#192235;border:1px solid #2C3650;border-radius:14px;padding:18px;">
          <div style="font-size:16px;line-height:1.7;color:#D9DEEA;"><strong style="color:#FFFFFF;">Espacio para dudas y criterio</strong>, sin humo ni señales vacías.</div>
        </div>
      </div>
      <div style="background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.15);border-radius:12px;padding:15px 16px;font-size:15px;line-height:1.7;color:#E7C868;margin-bottom:28px;">⚠️ Importante: el acceso puede cerrarse momentáneamente según la disponibilidad de cupos.</div>
      <div style="text-align:center;padding:10px 6px 0;">
        <div style="font-size:30px;line-height:1.25;color:#FFFFFF;font-weight:800;margin-bottom:14px;">Si querés formar parte, el siguiente paso es simple</div>
        <div style="max-width:520px;margin:0 auto 10px;font-size:18px;line-height:1.7;color:#C7CDDA;">Escribinos por WhatsApp y te contamos cómo ingresar al seguimiento y a la comunidad.</div>
        {{WHATSAPP_BUTTON}}
      </div>
    </div>
  </div>
</div>`
  },
  {
    id: 'reactivacion',
    label: 'Reactivación',
    asunto: 'Hace tiempo que no hablamos. Esto puede interesarte.',
    preheader: 'Volvemos a escribirte porque el mercado abrió una oportunidad.',
    body: `<div style="background:#0B0E17;padding:24px 0;font-family:'DM Sans',Arial,sans-serif;color:#E9EDF6;">
  <div style="max-width:640px;margin:0 auto;background:#131A2A;border:1px solid #232B3D;border-radius:18px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.35);">
    <div style="background:#0B0E17;padding:28px 34px;border-bottom:1px solid #232B3D;text-align:center;">
      <img src="{{LOGO_URL}}" alt="Seminario Cripto" style="width:62px;height:62px;object-fit:contain;margin:0 auto 14px;display:block;" />
      <div style="font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#D4AF37;font-weight:700;">Seminario Cripto</div>
      <h1 style="margin:14px 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.08;color:#FFFFFF;">Volvamos a Conectar</h1>
      <div style="font-size:13px;color:#8F97A8;text-transform:uppercase;letter-spacing:0.08em;">Una actualización que vale la pena ver</div>
    </div>
    <div style="padding:34px 36px;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:19px;line-height:1.55;color:#F5F7FB;">Hace tiempo que no hablamos.<br/>Pero el mercado está en una etapa donde volver a mirar puede tener mucho sentido.</div>
      <div style="margin:30px 0 24px;display:flex;align-items:center;gap:14px;"><div style="height:1px;background:#2B3347;flex:1;"></div><div style="width:7px;height:7px;border-radius:999px;background:#D4AF37;"></div><div style="height:1px;background:#2B3347;flex:1;"></div></div>
      <div style="font-size:30px;line-height:1.2;color:#FFFFFF;font-weight:800;margin-bottom:14px;">¿Por qué te escribimos ahora?</div>
      <div style="font-size:15px;line-height:1.8;color:#C7CDDA;margin-bottom:20px;">Porque el mercado no ofrece muchas ventanas claras por año. Y cuando aparecen, lo peor que se puede hacer es mirarlas sin contexto. En Seminario Cripto seguimos el panorama actual con criterio, sin vender humo y sin convertir todo en una urgencia artificial.</div>
      <div style="background:#192235;border:1px solid #2C3650;border-radius:16px;padding:22px 24px;margin-bottom:24px;">
        <div style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#D4AF37;font-weight:700;margin-bottom:10px;">Lo que cambió</div>
        <div style="font-size:16px;line-height:1.8;color:#D9DEEA;">• El mercado empezó a dar señales más ordenadas.<br/>• Se abrió una etapa de análisis más interesante.<br/>• Volvimos a reforzar el seguimiento y la lectura operativa dentro de la comunidad.</div>
      </div>
      <div style="text-align:center;padding:10px 6px 0;">
        <div style="font-size:30px;line-height:1.25;color:#FFFFFF;font-weight:800;margin-bottom:14px;">Si querés retomar el contacto, este es el momento</div>
        <div style="max-width:520px;margin:0 auto 10px;font-size:18px;line-height:1.7;color:#C7CDDA;">Escribinos por WhatsApp y te contamos en qué etapa estamos y cómo sumarte de nuevo.</div>
        {{WHATSAPP_BUTTON}}
      </div>
    </div>
  </div>
</div>`
  }
];

function csvEscape(value) {
  const v = String(value ?? '');
  return `"${v.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows, delimiter = ';') {
  const normalizedRows = rows.map(row => row.map(csvEscape).join(delimiter));
  const content = ['sep=' + delimiter, ...normalizedRows].join('\r\n');
  const blob = new Blob(["\ufeff" + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportContactsCsv(contacts) {
  const today = new Date().toISOString().slice(0,10);
  const headers = [
    'Nombre',
    'Email',
    'Fecha de ingreso',
    'Emails recibidos',
    'Aperturas',
    'Tasa de apertura',
    'Segmento sugerido'
  ];

  const rows = contacts.map(c => {
    const recibidos = Number(c.emailsRecibidos || 0);
    const abiertos = Number(c.abiertos || 0);
    const tasa = recibidos > 0 ? `${Math.round((abiertos / recibidos) * 100)}%` : 'Sin datos';
    const segmento = recibidos > 0 && (abiertos / recibidos) >= 0.5 ? 'Contacto activo' : 'Sin tracking / general';

    return [
      c.nombre || '',
      c.email || '',
      c.ingreso || '',
      recibidos,
      abiertos,
      tasa,
      segmento
    ];
  });

  downloadCsv(`contactos-seminario-cripto-${today}.csv`, [headers, ...rows], ';');
}

function quotaInfo(contactCount, weeklyFrequency = 2) {
  const monthly = contactCount * weeklyFrequency * 4;
  const monthlyPct = Math.round((monthly / RESEND_FREE_MONTHLY_LIMIT) * 100);
  const batches = Math.max(1, Math.ceil(contactCount / RESEND_FREE_DAILY_LIMIT));
  const dailyOk = contactCount <= RESEND_FREE_DAILY_LIMIT;
  return { monthly, monthlyPct, batches, dailyOk };
}


const ARG_TZ = 'America/Argentina/Buenos_Aires';

function formatArgentinaDateTime(value, withTime = true) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const opts = withTime
    ? { timeZone: ARG_TZ, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }
    : { timeZone: ARG_TZ, day:'2-digit', month:'2-digit', year:'numeric' };
  return new Intl.DateTimeFormat('es-AR', opts).format(date).replace(',', '');
}

function todayArgentinaLong() {
  const now = new Date();
  const txt = new Intl.DateTimeFormat('es-AR', {
    timeZone: ARG_TZ,
    weekday:'long',
    day:'numeric',
    month:'long',
    year:'numeric'
  }).format(now);
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function isFutureArgentina(value) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}


// ── CONTACTOS DE RESPALDO LOCAL (solo se usan si Supabase no devuelve datos) ──
const FALLBACK_CONTACTS = [];

const MOCK_EMAILS = [];
const MOCK_ACTIVIDAD = [];

// ── THEME CONTEXT ──────────────────────────────────────────────────────────
const ThemeCtx = React.createContext({ dark: true, toggle: () => {} });

// ── ICONS ──────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 14, color = 'currentColor' }) => {
  const icons = {
    dashboard: <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" fill={color}/><rect x="9" y="1" width="6" height="6" rx="1.5" fill={color} opacity=".45"/><rect x="1" y="9" width="6" height="6" rx="1.5" fill={color} opacity=".45"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill={color} opacity=".45"/></svg>,
    contacts:  <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" fill={color}/><path d="M2 13c0-2.8 2.7-5 6-5s6 2.2 6 5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/></svg>,
    emails:    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke={color} strokeWidth="1.4"/><path d="M1 5l7 5 7-5" stroke={color} strokeWidth="1.4" strokeLinecap="round"/></svg>,
    activity:  <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M1 8h3l2-5 3 10 2-7 2 2h2" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    settings:  <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke={color} strokeWidth="1.4"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke={color} strokeWidth="1.4" strokeLinecap="round"/></svg>,
    send:      <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M14 2L1 7l5 2m8-7l-6 13-2-4m8-9L6 9" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    eye:       <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><ellipse cx="8" cy="8" rx="7" ry="4.5" stroke={color} strokeWidth="1.4"/><circle cx="8" cy="8" r="2" fill={color}/></svg>,
    eyeOff:    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12" stroke={color} strokeWidth="1.4" strokeLinecap="round"/><path d="M6.2 6.2A2.2 2.2 0 009.8 9.8" stroke={color} strokeWidth="1.4" strokeLinecap="round"/><path d="M3.2 5.5C4.5 4.2 6.1 3.5 8 3.5c3.8 0 6.5 3.1 7 4.5-.2.7-1 1.7-2.1 2.6" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M10.4 12.1c-.7.3-1.5.4-2.4.4-3.8 0-6.5-3.1-7-4.5.2-.6.8-1.5 1.7-2.3" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    click:     <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M6 1v8l2.5-2 1.5 4 1.5-.5-1.5-4H13L6 1z" fill={color}/></svg>,
    user:      <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke={color} strokeWidth="1.4"/><path d="M2 14c0-2.8 2.7-5 6-5s6 2.2 6 5" stroke={color} strokeWidth="1.4" strokeLinecap="round"/></svg>,
    plus:      <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke={color} strokeWidth="1.8" strokeLinecap="round"/></svg>,
    close:     <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke={color} strokeWidth="1.6" strokeLinecap="round"/></svg>,
    check:     <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M2 8l4.5 5L14 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    whatsapp:  <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill={color} opacity=".15"/><path d="M11.5 9.8c-.2.6-1.2 1.1-1.7 1.2-.9.1-1.6-.2-3.5-1.9C4.5 7.5 4 6.5 4.1 5.6c.1-.5.5-1.4 1.1-1.6.3-.1.5 0 .7.3l.7 1.4c.1.3 0 .5-.2.7l-.3.4c.2.4.9 1.2 1.5 1.6l.5-.2c.2-.1.5-.1.7.1l1.2.9c.3.2.3.4.2.6z" fill={color}/></svg>,
    calendar:  <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="12" rx="2" stroke={color} strokeWidth="1.4"/><path d="M1 7h14M5 1v4M11 1v4" stroke={color} strokeWidth="1.4" strokeLinecap="round"/></svg>,
    trash:     <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    edit:      <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-8 8H3v-3l8-8z" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/></svg>,
    moon:      <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M13.5 10A6 6 0 016 2.5a6 6 0 100 11 6 6 0 007.5-3.5z" fill={color}/></svg>,
    sun:       <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" fill={color}/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke={color} strokeWidth="1.4" strokeLinecap="round"/></svg>,
  };
  return icons[name] || null;
};

// ── BADGE ──────────────────────────────────────────────────────────────────
const Badge = ({ label }) => {
  const map = {
    cliente:     { bg: 'var(--blue-dim)',  text: 'var(--blue)'  },
    'ex-cliente':{ bg: 'var(--gold-dim)',  text: 'var(--gold)'  },
    lead:        { bg: 'var(--green-dim)', text: 'var(--green)' },
    activo:      { bg: 'var(--green-dim)', text: 'var(--green)' },
    inactivo:    { bg: 'var(--border)',    text: 'var(--muted)' },
    enviado:     { bg: 'var(--green-dim)', text: 'var(--green)' },
    programado:  { bg: 'var(--blue-dim)',  text: 'var(--blue)'  },
    archivado:   { bg: 'var(--border)',    text: 'var(--muted)' },
    borrador:    { bg: 'var(--border)',    text: 'var(--muted)' },
  };
  const display = String(label || '').charAt(0).toUpperCase() + String(label || '').slice(1);
  const c = map[label] || { bg: 'var(--border)', text: 'var(--muted)' };
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', padding:'2px 8px',
      borderRadius:99, fontSize:11, fontWeight:600,
      background:c.bg, color:c.text, letterSpacing:'0.02em'
    }}>{display}</span>
  );
};

// ── STAT CARD ──────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, icon, accent }) => (
  <div style={{
    background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10,
    padding:'18px 20px', display:'flex', flexDirection:'column', gap:8,
    position:'relative', overflow:'hidden'
  }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
      <div style={{ fontSize:11, color:'var(--muted)', fontWeight:500, letterSpacing:'0.05em', textTransform:'uppercase' }}>{label}</div>
      <Icon name={icon} size={15} color={accent||'var(--gold)'} />
    </div>
    <div style={{ fontSize:28, fontWeight:700, color:'var(--text)', lineHeight:1 }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:'var(--muted)' }}>{sub}</div>}
    <div style={{ position:'absolute', right:-10, bottom:-10, width:60, height:60, borderRadius:'50%', background:accent||'var(--gold)', opacity:0.05 }}></div>
  </div>
);


// ── CONTROL DE CUOTA ───────────────────────────────────────────────────────
const QuotaPanel = ({ enviadosMes = 0 }) => {
  const limite = RESEND_FREE_MONTHLY_LIMIT;
  const usados = Math.max(0, Number(enviadosMes || 0));
  const disponibles = Math.max(0, limite - usados);
  const pct = Math.min(100, Math.round((usados / limite) * 100));

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:18 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div style={{ fontWeight:700, fontSize:13 }}>Cuota mensual Resend</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>{pct}%</div>
      </div>

      <div style={{ height:8, borderRadius:99, background:'var(--bg)', border:'1px solid var(--border)', overflow:'hidden', marginBottom:14 }}>
        <div style={{ width:`${pct}%`, height:'100%', background:'var(--gold)', borderRadius:99 }} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
        <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:12 }}>
          <div style={{ color:'var(--muted)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Enviados</div>
          <div style={{ fontSize:22, fontWeight:800 }}>{usados}</div>
        </div>
        <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:12 }}>
          <div style={{ color:'var(--muted)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Disponibles</div>
          <div style={{ fontSize:22, fontWeight:800 }}>{disponibles}</div>
        </div>
        <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:12 }}>
          <div style={{ color:'var(--muted)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Límite</div>
          <div style={{ fontSize:22, fontWeight:800 }}>{limite}</div>
        </div>
      </div>
    </div>
  );
};

// ── MODAL NUEVO CONTACTO ───────────────────────────────────────────────────
const ModalNuevoContacto = ({ onClose, onSave, initial = null }) => {
  const [form, setForm] = React.useState({
    id: initial?.id || null,
    nombre: initial?.nombre || '',
    email: initial?.email || ''
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const isEdit = Boolean(initial?.id);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={onClose}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:14, padding:28, width:'100%', maxWidth:420, boxShadow:'0 24px 80px rgba(0,0,0,0.5)' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
          <div>
            <div style={{ fontWeight:600, fontSize:15 }}>{isEdit ? 'Editar contacto' : 'Nuevo contacto'}</div>
            <div style={{ color:'var(--muted)', fontSize:12, marginTop:3 }}>{isEdit ? 'Actualizá los datos del contacto.' : 'Agregá un contacto a la base general.'}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:4 }}><Icon name="close" size={16} color="var(--muted)" /></button>
        </div>
        {[{label:'Nombre completo',key:'nombre',type:'text',ph:'Ej: Martín Rodríguez'},{label:'Email',key:'email',type:'email',ph:'correo@ejemplo.com'}].map(f=>(
          <div key={f.key} style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>{f.label}</div>
            <input type={f.type} placeholder={f.ph} value={form[f.key]} onChange={e=>set(f.key,e.target.value)}
              style={{ width:'100%', padding:'9px 12px', borderRadius:7, border:'1px solid var(--border2)', background:'var(--input-bg)', color:'var(--text)', fontSize:13, outline:'none', fontFamily:'DM Sans, sans-serif' }} />
          </div>
        ))}
        <button onClick={()=>{ if(form.nombre&&form.email){onSave(form);onClose();} }} style={{
          width:'100%', padding:'11px', borderRadius:8, background:'var(--gold)', border:'none',
          color:'#0B0E17', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans, sans-serif', letterSpacing:'0.05em'
        }}>{isEdit ? 'GUARDAR CAMBIOS' : 'AGREGAR CONTACTO'}</button>
      </div>
    </div>
  );
};

// ── TOAST ──────────────────────────────────────────────────────────────────
const Toast = ({ msg, visible, tone='success' }) => {
  const iconColor = tone==='error' ? 'var(--red)' : 'var(--green)';
  const iconName = tone==='error' ? 'close' : 'check';
  return (
    <div style={{
      position:'fixed', bottom:24, left:'50%',
      transform:`translateX(-50%) translateY(${visible?0:20}px)`,
      background:'var(--surface)', border:'1px solid var(--border2)',
      borderRadius:12, padding:'12px 16px', minWidth:280, maxWidth:'min(92vw, 440px)',
      fontSize:13, fontWeight:500, color:'var(--text)',
      opacity:visible?1:0, transition:'all 0.25s', pointerEvents:'none',
      display:'flex', alignItems:'center', gap:10, zIndex:2000,
      boxShadow:'0 14px 40px rgba(0,0,0,0.35)'
    }}>
      <div style={{ width:24, height:24, borderRadius:'50%', display:'grid', placeItems:'center', background:tone==='error'?'var(--red-dim)':'var(--green-dim)' }}>
        <Icon name={iconName} size={12} color={iconColor} />
      </div>
      <div style={{ flex:1 }}>{msg}</div>
    </div>
  );
};

// ── MODAL CONFIRMACIÓN ───────────────────────────────────────────────────────
const ModalConfirmacion = ({ open, title, message, confirmLabel='Confirmar', cancelLabel='Cancelar', onCancel, onConfirm }) => {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={onCancel}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:16, padding:24, width:'100%', maxWidth:430, boxShadow:'0 24px 80px rgba(0,0,0,0.5)' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <div style={{ width:40, height:40, borderRadius:12, display:'grid', placeItems:'center', background:'var(--gold-dim)' }}>
            <Icon name="trash" size={16} color="var(--gold)" />
          </div>
          <div>
            <div style={{ fontSize:16, fontWeight:700 }}>{title}</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>Confirmá la acción para continuar.</div>
          </div>
        </div>
        <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6, marginBottom:22 }}>{message}</div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button onClick={onCancel} style={{ padding:'10px 16px', borderRadius:8, border:'1px solid var(--border2)', background:'transparent', color:'var(--text)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>{cancelLabel}</button>
          <button onClick={onConfirm} style={{ padding:'10px 16px', borderRadius:8, border:'none', background:'var(--gold)', color:'#0B0E17', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans, sans-serif', letterSpacing:'0.04em' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

// ── DASHBOARD ──────────────────────────────────────────────────────────────
const Dashboard = ({ contacts, emails, actividad, onOpenEmail, enviadosMes = 0 }) => {
  const contactosTotales = contacts.length;
  const emailsEnviados = emails.filter(e=>e.estado==='enviado').length;
  const emailsBorrador = emails.filter(e=>e.estado==='borrador').length;
  const emailsProgramados = emails.filter(e=>e.estado==='programado').length;
  const totalAperturas = emails.reduce((s,e)=>s+e.abiertos,0);
  const totalEnviados  = emails.reduce((s,e)=>s+e.enviados,0);
  const tasaApertura   = totalEnviados>0?Math.round((totalAperturas/totalEnviados)*100):0;
  const totalClics     = emails.reduce((s,e)=>s+e.clics,0);
  const proximo        = emails.filter(e=>e.estado==='programado' && isFutureArgentina(e.programado_para)).sort((a,b)=>new Date(a.programado_para)-new Date(b.programado_para))[0];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, padding:'24px 28px', overflowY:'auto', flex:1 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:4 }}>Bienvenido</div>
          <div style={{ fontSize:22, fontWeight:700, letterSpacing:'-0.02em' }}>Centro Operativo</div>
        </div>
        <div style={{ fontSize:11, color:'var(--muted)', textAlign:'right' }}>
          <div>{todayArgentinaLong()}</div>
          {proximo && <div style={{ color:'var(--gold)', marginTop:2 }}>Próximo envío: {formatArgentinaDateTime(proximo.programado_para)}</div>}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        <StatCard label="Contactos" value={contactosTotales} icon="contacts" />
        <StatCard label="Borradores" value={emailsBorrador} icon="emails" accent="var(--blue)" />
        <StatCard label="Emails enviados" value={enviadosMes || totalEnviados || emailsEnviados} icon="send" accent="var(--green)" />
        <StatCard label="Apertura" value={`${tasaApertura}%`} icon="eye" accent="var(--green)" />
      </div>

      {proximo && (
        <div style={{ background:'var(--gold-dim)', border:'1px solid var(--gold-dim2)', borderRadius:10, padding:'14px 18px', display:'flex', alignItems:'center', gap:14 }}>
          <Icon name="calendar" size={16} color="var(--gold)" />
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:600, color:'var(--gold)', fontSize:12, marginBottom:2 }}>Próximo email programado</div>
            <div style={{ color:'var(--muted)', fontSize:12 }}>"{proximo.asunto}" · {formatArgentinaDateTime(proximo.programado_para)}</div>
          </div>
          <button onClick={()=>onOpenEmail && onOpenEmail(proximo.id)} style={{ background:'var(--gold)', color:'#0B0E17', border:'none', borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>VER EMAIL</button>
        </div>
      )}


      <div style={{ display:'grid', gridTemplateColumns:'1.1fr 0.9fr', gap:16 }}>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px 10px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontWeight:600, fontSize:13 }}>Calendario de campañas</div>
            <Icon name="calendar" size={13} color="var(--muted)" />
          </div>
          {emails.filter(e=>['borrador','programado'].includes(e.estado)).slice(0,5).length === 0 ? (
            <div style={{ padding:18, color:'var(--muted)', fontSize:12 }}>Todavía no hay campañas internas creadas.</div>
          ) : emails.filter(e=>['borrador','programado'].includes(e.estado)).slice(0,5).map((e,i)=>(
            <div key={e.id} style={{ padding:'12px 18px', display:'flex', alignItems:'center', gap:12, borderBottom:i<4?'1px solid var(--border)':'none' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:700 }}>{e.asunto}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{e.estado === 'programado' && e.programado_para ? formatArgentinaDateTime(e.programado_para) : 'Sin fecha programada'}</div>
              </div>
              <Badge label={e.estado === 'listo' ? 'borrador' : e.estado} />
            </div>
          ))}
        </div>
        <QuotaPanel enviadosMes={enviadosMes || totalEnviados} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Últimos emails */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px 10px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontWeight:600, fontSize:13 }}>Últimos emails</div>
            <Icon name="emails" size={13} color="var(--muted)" />
          </div>
          {emails.slice(0,4).map((e,i)=>(
            <div key={e.id} style={{ padding:'11px 18px', display:'flex', alignItems:'center', gap:12, borderBottom:i<3?'1px solid var(--border)':'none' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:500, fontSize:12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.asunto}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{e.fecha}</div>
              </div>
              <Badge label={e.estado === 'listo' ? 'borrador' : e.estado} />
              {e.estado==='enviado' && (
                <div style={{ fontSize:11, color:'var(--muted)', textAlign:'right', flexShrink:0 }}>
                  <div style={{ color:'var(--green)', fontWeight:600 }}>{Math.round((e.abiertos/e.enviados)*100)}%</div>
                  <div>apertura</div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Actividad reciente */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px 10px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontWeight:600, fontSize:13 }}>Actividad reciente</div>
            <Icon name="activity" size={13} color="var(--muted)" />
          </div>
          {actividad.slice(0,5).map((a,i)=>{
            const cm = { enviado:'var(--blue)', apertura:'var(--gold)', clic:'var(--green)', nuevo:'var(--green)', nuevo_contacto:'var(--green)', contacto_eliminado:'var(--red)', contacto_actualizado:'var(--blue)', email_borrador:'var(--blue)', email_programado:'var(--gold)', email_archivado:'var(--muted)', email_eliminado:'var(--red)' };
            return (
              <div key={a.id} style={{ padding:'10px 18px', display:'flex', alignItems:'flex-start', gap:10, borderBottom:i<4?'1px solid var(--border)':'none' }}>
                <div style={{ width:26, height:26, borderRadius:99, flexShrink:0, background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', marginTop:1 }}>
                  <Icon name={a.icon} size={12} color={cm[a.tipo]} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, lineHeight:1.4 }}>{a.msg}</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{a.tiempo} · {a.fecha}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── CONTACTOS ──────────────────────────────────────────────────────────────
const Contactos = ({ contacts, setContacts, onActivity }) => {
  const [busqueda, setBusqueda] = React.useState('');
  const [showModal, setShowModal] = React.useState(false);
  const [editingContact, setEditingContact] = React.useState(null);
  const [local, setLocal] = React.useState(contacts);
  const [toast, setToast] = React.useState({ visible:false, msg:'', tone:'success' });
  const [confirmDelete, setConfirmDelete] = React.useState({ open:false, contacto:null });

  React.useEffect(() => { setLocal(contacts); }, [contacts]);

  const showToast = (msg, tone='success') => { setToast({visible:true,msg,tone}); setTimeout(()=>setToast({visible:false,msg:'',tone:'success'}),2500); };

  const filtered = local.filter(c=>{
    const ms = c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.email.toLowerCase().includes(busqueda.toLowerCase());
    return ms;
  });

  const handleSave = async form => {
    const payload = {
      nombre: form.nombre.trim(),
      email: form.email.trim().toLowerCase(),
      // Campos internos requeridos por la tabla actual. No se muestran ni se gestionan manualmente.
      tipo: 'cliente',
      estado: 'activo'
    };

    if (!payload.nombre || !payload.email) {
      showToast('Completá el nombre y el email para continuar.', 'error');
      return;
    }

    try {
      let data, error;

      if (form.id) {
        const res = await db
          .from('contactos')
          .update(payload)
          .eq('id', form.id)
          .select()
          .single();
        data = res.data;
        error = res.error;
      } else {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/contactos?on_conflict=email`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `Error HTTP ${res.status}`);
        }

        const rows = await res.json();
        data = Array.isArray(rows) ? rows[0] : rows;
      }

      if (error) throw error;

      const actualizado = {
        id: data.id,
        nombre: data.nombre,
        email: data.email,
        tipo: data.tipo,
        estado: data.estado,
        ingreso: data.ingreso ? String(data.ingreso).split('T')[0] : (data.created_at ? String(data.created_at).split('T')[0] : new Date().toISOString().split('T')[0]),
        emailsRecibidos: 0,
        ultimoEmail: '-',
        abiertos: 0,
      };

      setLocal(c => form.id ? c.map(x => x.id === actualizado.id ? actualizado : x) : [actualizado, ...c.filter(x => x.email !== actualizado.email)]);
      if (setContacts) setContacts(c => form.id ? c.map(x => x.id === actualizado.id ? actualizado : x) : [actualizado, ...c.filter(x => x.email !== actualizado.email)]);
      setEditingContact(null);
      showToast(form.id ? 'Contacto actualizado correctamente.' : 'Contacto guardado correctamente.');
      if (onActivity) await onActivity(form.id ? 'contacto_actualizado' : 'nuevo_contacto', form.id ? `Contacto actualizado: ${actualizado.nombre}` : `Contacto creado: ${actualizado.nombre}`, { contacto_id: actualizado.id, email: actualizado.email });
    } catch (err) {
      console.error('Error guardando contacto:', err);
      showToast('No se pudo guardar el contacto. Intentá nuevamente.', 'error');
    }
  };

  const requestDelete = contacto => {
    setConfirmDelete({ open:true, contacto });
  };

  const handleDelete = async contacto => {
    if (!contacto) return;

    try {
      const { error } = await db
        .from('contactos')
        .delete()
        .eq('id', contacto.id);

      if (error) throw error;

      setLocal(cs => cs.filter(x => x.id !== contacto.id));
      if (setContacts) setContacts(cs => cs.filter(x => x.id !== contacto.id));
      showToast('Contacto eliminado correctamente.');
      if (onActivity) await onActivity('contacto_eliminado', `Contacto eliminado: ${contacto.nombre}`, { contacto_id: contacto.id, email: contacto.email });
    } catch (err) {
      console.error('Error eliminando contacto:', err);
      showToast('No se pudo eliminar el contacto. Intentá nuevamente.', 'error');
    } finally {
      setConfirmDelete({ open:false, contacto:null });
    }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <div style={{ padding:'20px 28px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:12, alignItems:'center' }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:17, fontWeight:700, marginBottom:2 }}>Contactos</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>{local.length} contactos en total</div>
        </div>
        <input placeholder="Buscar..." value={busqueda} onChange={e=>setBusqueda(e.target.value)}
          style={{ padding:'8px 14px', borderRadius:8, border:'1px solid var(--border2)', background:'var(--input-bg)', color:'var(--text)', fontSize:12, outline:'none', width:220, fontFamily:'DM Sans, sans-serif' }} />
        <button onClick={()=>exportContactsCsv(local)} style={{ display:'flex', alignItems:'center', gap:7, background:'transparent', color:'var(--text)', border:'1px solid var(--border2)', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
          EXPORTAR CSV
        </button>
        <button onClick={()=>{ setEditingContact(null); setShowModal(true); }} style={{ display:'flex', alignItems:'center', gap:7, background:'var(--gold)', color:'#0B0E17', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans, sans-serif', letterSpacing:'0.04em' }}>
          <Icon name="plus" size={12} color="#0B0E17" /> NUEVO
        </button>
      </div>

      <div style={{ padding:'10px 28px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'flex-end' }}>
        <div style={{ fontSize:12, color:'var(--muted)', alignSelf:'center' }}>{filtered.length} resultados</div>
      </div>

      <div style={{ flex:1, overflowY:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'var(--surface)' }}>
              {['Nombre','Email','Ingreso','Emails recibidos','Tasa apertura',''].map(h=>(
                <th key={h} style={{ padding:'10px 20px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--muted)', letterSpacing:'0.08em', textTransform:'uppercase', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c=>(
              <tr key={c.id} style={{ borderBottom:'1px solid var(--border)', transition:'background 0.1s' }}
                onMouseEnter={e=>e.currentTarget.style.backgroundColor='var(--hover)'}
                onMouseLeave={e=>e.currentTarget.style.backgroundColor='transparent'}>
                <td style={{ padding:'12px 20px', fontWeight:500 }}>{c.nombre}</td>
                <td style={{ padding:'12px 20px', color:'var(--muted)', fontFamily:'DM Mono, monospace', fontSize:12 }}>{c.email}</td>
                <td style={{ padding:'12px 20px', color:'var(--muted)', fontSize:12 }}>{c.ingreso}</td>
                <td style={{ padding:'12px 20px', textAlign:'center', fontWeight:600 }}>{c.emailsRecibidos}</td>
                <td style={{ padding:'12px 20px', textAlign:'center' }}>
                  {c.emailsRecibidos>0
                    ? <span style={{ color:'var(--green)', fontWeight:600 }}>{Math.round((c.abiertos/c.emailsRecibidos)*100)}%</span>
                    : <span style={{ color:'var(--muted)' }}>—</span>}
                </td>
                <td style={{ padding:'12px 20px' }}>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={()=>{ setEditingContact(c); setShowModal(true); }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:4 }}><Icon name="edit" size={13} color="var(--muted)" /></button>
                    <button onClick={()=>requestDelete(c)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:4 }}><Icon name="trash" size={13} color="var(--muted)" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showModal && <ModalNuevoContacto initial={editingContact} onClose={()=>{ setShowModal(false); setEditingContact(null); }} onSave={handleSave} />}
      <ModalConfirmacion
        open={confirmDelete.open}
        title="Eliminar contacto"
        message={confirmDelete.contacto ? `Se eliminará a ${confirmDelete.contacto.nombre} de la lista de contactos. Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onCancel={()=>setConfirmDelete({ open:false, contacto:null })}
        onConfirm={()=>handleDelete(confirmDelete.contacto)}
      />
      <Toast msg={toast.msg} visible={toast.visible} tone={toast.tone} />
    </div>
  );
};

// ── EMAILS VIEW ────────────────────────────────────────────────────────────
const EmailsView = ({ emails, setEmails, contacts, onActivity, openEmailId, mode='redactar' }) => {
  const emptyForm = { asunto:'', preheader:'', html_body:'', segmento:'todos', programado_para:'' };
  const [selected, setSelected] = React.useState(null);
  const [emailFiltro, setEmailFiltro] = React.useState(mode === 'enviados' ? 'enviado' : 'borrador');
  const [showEditor, setShowEditor] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const [editingEmailId, setEditingEmailId] = React.useState(null);
  const [toast, setToast] = React.useState({ visible:false, msg:'', tone:'success' });
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState({ open:false, email:null });
  const [confirmProgram, setConfirmProgram] = React.useState({ open:false });
  const [pendingSend, setPendingSend] = React.useState({ open:false, tipo:'' });
  const [confirmTemplate, setConfirmTemplate] = React.useState({ open:false, template:null });
  const [confirmDiscard, setConfirmDiscard] = React.useState({ open:false, action:null });

  React.useEffect(() => {
    setEmailFiltro(mode === 'enviados' ? 'enviado' : 'borrador');
    setSelected(null);
    setShowEditor(false);
  }, [mode]);

  React.useEffect(() => {
    if (selected) {
      const fresh = emails.find(e => e.id === selected.id);
      if (fresh) setSelected(fresh);
    }
  }, [emails]);

  React.useEffect(() => {
    if (openEmailId) {
      const target = emails.find(e => e.id === openEmailId);
      if (target) {
        setSelected(target);
        setShowEditor(false);
      }
    }
  }, [openEmailId, emails]);

  const showToast = (msg, tone='success') => {
    setToast({ visible:true, msg, tone });
    setTimeout(()=>setToast({ visible:false, msg:'', tone:'success' }), 2600);
  };

  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  const hasUnsavedChanges = () => {
    return Boolean(
      form.asunto.trim() ||
      form.preheader.trim() ||
      form.html_body.trim() ||
      form.programado_para ||
      editingEmailId
    );
  };

  const runAfterDiscard = (action) => {
    setConfirmDiscard({ open:false, action:null });
    if (typeof action === 'function') action();
  };

  const requestDiscard = (action) => {
    if (showEditor && hasUnsavedChanges()) {
      setConfirmDiscard({ open:true, action });
      return;
    }
    action();
  };

  const resetEditor = () => {
    setForm(emptyForm);
    setEditingEmailId(null);
    setShowEditor(false);
    setSaving(false);
  };

  const openNewEmail = () => {
    const action = () => {
      setSelected(null);
      setEditingEmailId(null);
      setForm(emptyForm);
      setShowEditor(true);
    };
    requestDiscard(action);
  };

  const openEditEmail = (email) => {
    if (!email) return;
    setEditingEmailId(email.id);
    setForm({
      asunto: email.asunto || '',
      preheader: email.preheader || '',
      html_body: email.html_body || '',
      segmento: email.segmento || 'todos',
      programado_para: email.programado_para ? String(email.programado_para).slice(0,16) : ''
    });
    setShowEditor(true);
  };



  const applyTemplate = (template) => {
    if (!template) return;
    setForm(f=>({ ...f, asunto:template.asunto, preheader:template.preheader, html_body:template.body }));
    setConfirmTemplate({ open:false, template:null });
    showToast(`Plantilla aplicada: ${template.label}.`);
  };

  const activeContacts = contacts.filter(c => {
    const recibidos = Number(c.emailsRecibidos || 0);
    const abiertos = Number(c.abiertos || 0);
    if (!recibidos) return false;
    return (abiertos / recibidos) >= 0.5;
  });

  const destinatariosCount = () => form.segmento === 'activos' ? activeContacts.length : contacts.length;
  const destinatariosTexto = () => form.segmento === 'activos'
    ? `${activeContacts.length} contactos activos`
    : `${contacts.length} contactos`;


  const mapEmailRow = (row) => ({
    id: row.id,
    asunto: row.asunto || '',
    preheader: row.preheader || '',
    html_body: row.html_body || '',
    segmento: row.segmento || 'todos',
    fecha: row.created_at ? String(row.created_at).split('T')[0] : '-',
    created_at: row.created_at || null,
    programado_para: row.programado_para || null,
    enviado_en: row.enviado_en || null,
    enviados: 0,
    abiertos: 0,
    clics: 0,
    estado: row.estado || 'borrador',
  });

  const filteredEmails = emails.filter(e => {
    if (emailFiltro === 'borrador') return e.estado === 'borrador' || e.estado === 'listo';
    if (emailFiltro === 'enviado') return e.estado === 'enviado';
    return e.estado === emailFiltro;
  });

  const qualityIssues = () => {
    const issues = [];
    const asunto = form.asunto.trim();
    const preheader = form.preheader.trim();
    const bodyText = String(form.html_body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    if (!asunto) issues.push('Falta asunto.');
    else if (asunto.length < 12) issues.push('El asunto es muy corto.');

    if (!preheader) issues.push('Falta preheader.');
    if (!bodyText) issues.push('Falta contenido.');
    else if (bodyText.length < 180) issues.push('El contenido parece demasiado corto para una newsletter.');

    return issues;
  };

  const qualityStatus = () => {
    const issues = qualityIssues();
    return issues.length ? issues : ['Contenido listo para revisión.'];
  };

  const batchInfoText = () => {
    const info = quotaInfo(destinatariosCount(), 1);
    return info.dailyOk
      ? `La base actual entra en una sola tanda diaria (${destinatariosCount()} contactos).`
      : `La base actual supera 100 contactos. Al conectar Resend habrá que dividirlo en ${info.batches} tandas.`;
  };

  const saveEmail = async (estado) => {
    const asunto = form.asunto.trim();
    const html = form.html_body.trim();
    if (!asunto || !html) {
      showToast('Completá asunto y contenido para guardar el email.', 'error');
      return;
    }
    if (estado === 'programado' && !form.programado_para) {
      showToast('Elegí fecha y hora para programar el envío.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        asunto,
        preheader: form.preheader.trim() || null,
        html_body: html,
        segmento: form.segmento || 'todos',
        estado,
        programado_para: estado === 'programado' ? new Date(form.programado_para).toISOString() : null,
      };

      let data, error;
      if (editingEmailId) {
        const res = await db.from('emails').update(payload).eq('id', editingEmailId).select().single();
        data = res.data;
        error = res.error;
      } else {
        const res = await db.from('emails').insert(payload).select().single();
        data = res.data;
        error = res.error;
      }
      if (error) throw error;

      const actualizado = mapEmailRow(data);
      setEmails(e => editingEmailId ? e.map(x => x.id === actualizado.id ? actualizado : x) : [actualizado, ...e]);
      setSelected(actualizado);
      resetEditor();

      const desc = estado === 'programado'
        ? `Email programado: ${asunto}`
        : (editingEmailId ? `Email actualizado como borrador: ${asunto}` : `Email guardado como borrador: ${asunto}`);
      const activityType = estado === 'programado' ? 'email_programado' : 'email_borrador';
      if (onActivity) await onActivity(activityType, desc, { email_id: data.id, segmento: form.segmento || 'todos' });

      showToast(estado === 'programado' ? 'Email programado correctamente.' : (editingEmailId ? 'Borrador actualizado correctamente.' : 'Borrador guardado correctamente.'));
    } catch (err) {
      console.error('Error guardando email:', err);
      showToast('No se pudo guardar el email. Revisá la conexión.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePrimarySave = () => {
    if (form.programado_para) {
      setConfirmProgram({ open:true });
      return;
    }
    saveEmail('borrador');
  };

  const deleteEmail = async (email) => {
    if (!email) return;
    try {
      const { error } = await db.from('emails').delete().eq('id', email.id);
      if (error) throw error;
      setEmails(e => e.filter(x => x.id !== email.id));
      if (selected?.id === email.id) setSelected(null);
      setConfirmDelete({ open:false, email:null });
      if (onActivity) await onActivity('email_eliminado', `Email eliminado: ${email.asunto}`, { email_id: email.id });
      showToast('Email eliminado correctamente.');
    } catch (err) {
      console.error('Error eliminando email:', err);
      showToast('No se pudo eliminar el email.', 'error');
    }
  };

  const archiveEmail = async (email) => {
    if (!email) return;
    try {
      const { data, error } = await db
        .from('emails')
        .update({ estado:'archivado', programado_para:null })
        .eq('id', email.id)
        .select()
        .single();
      if (error) throw error;
      const actualizado = mapEmailRow(data);
      setEmails(e => e.map(x => x.id === actualizado.id ? actualizado : x));
      setSelected(actualizado);
      if (onActivity) await onActivity('email_archivado', `Email archivado: ${email.asunto}`, { email_id: email.id });
      showToast('Email archivado correctamente.');
    } catch (err) {
      console.error('Error archivando email:', err);
      showToast('No se pudo archivar el email.', 'error');
    }
  };

  const restoreEmail = async (email) => {
    if (!email) return;
    try {
      const { data, error } = await db
        .from('emails')
        .update({ estado:'borrador', programado_para:null })
        .eq('id', email.id)
        .select()
        .single();
      if (error) throw error;
      const actualizado = mapEmailRow(data);
      setEmails(e => e.map(x => x.id === actualizado.id ? actualizado : x));
      setSelected(actualizado);
      if (onActivity) await onActivity('email_borrador', `Email restaurado a borradores: ${email.asunto}`, { email_id: email.id });
      showToast('Email restaurado a borradores.');
    } catch (err) {
      console.error('Error restaurando email:', err);
      showToast('No se pudo restaurar el email.', 'error');
    }
  };


  const cancelSchedule = async (email) => {
    if (!email) return;
    try {
      const { data, error } = await db
        .from('emails')
        .update({ estado:'borrador', programado_para:null })
        .eq('id', email.id)
        .select()
        .single();
      if (error) throw error;
      const actualizado = mapEmailRow(data);
      setEmails(e => e.map(x => x.id === actualizado.id ? actualizado : x));
      setSelected(actualizado);
      if (onActivity) await onActivity('email_borrador', `Programación cancelada: ${email.asunto}`, { email_id: email.id });
      showToast('Programación cancelada. El email volvió a borrador.');
    } catch (err) {
      console.error('Error cancelando programación:', err);
      showToast('No se pudo cancelar la programación.', 'error');
    }
  };

  const fechaProgramada = (email) => {
    if (!email?.programado_para) return null;
    return formatArgentinaDateTime(email.programado_para);
  };

  const showPendingSend = (tipo) => {
    setPendingSend({ open:true, tipo });
  };

  const invokeSendEmailFunction = async (payload) => {
    const response = await fetch(SEND_EMAIL_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `Error HTTP ${response.status}`);
    }

    return data;
  };

  const executePendingSend = async () => {
    const tipo = pendingSend.tipo;
    setPendingSend({ open:false, tipo:'' });

    try {
      setSaving(true);

      if (tipo === 'prueba') {
        const source = showEditor ? form : (selected || {});
        const asunto = (source.asunto || '').trim() || 'Prueba Seminario Cripto';
        const html = (source.html_body || '').trim();

        if (!html) {
          showToast('No hay contenido para enviar la prueba.', 'error');
          return;
        }

        await invokeSendEmailFunction({
          action: 'test',
          test_to: DEFAULT_TEST_EMAIL,
          asunto,
          preheader: source.preheader || '',
          html_body: html,
          segmento: source.segmento || 'todos',
        });

        if (onActivity) {
          await onActivity('email_prueba', `Email de prueba enviado a ${DEFAULT_TEST_EMAIL}`, { asunto });
        }

        showToast(`Prueba enviada a ${DEFAULT_TEST_EMAIL}.`);
        return;
      }

      if (tipo === 'ahora') {
        const emailId = selected?.id || editingEmailId;

        if (!emailId) {
          showToast('Guardá el email como borrador antes de enviarlo.', 'error');
          return;
        }

        await invokeSendEmailFunction({
          action: 'send_now',
          email_id: emailId,
          segmento: selected?.segmento || form.segmento || 'todos',
        });

        const nowIso = new Date().toISOString();

        setEmails(e => e.map(x => x.id === emailId ? { ...x, estado:'enviado', enviado_en:nowIso, programado_para:null } : x));
        setSelected(s => s && s.id === emailId ? { ...s, estado:'enviado', enviado_en:nowIso, programado_para:null } : s);

        if (onActivity) {
          await onActivity('email_enviado', `Email enviado: ${(selected?.asunto || form.asunto || '').trim()}`, { email_id: emailId });
        }

        showToast('Email enviado correctamente.');
      }
    } catch (err) {
      console.error('Error enviando email:', err);
      showToast(err.message || 'No se pudo enviar el email.', 'error');
    } finally {
      setSaving(false);
    }
  };


  const escapeHtml = (str='') => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const buildWhatsappButtonHtml = () => `
    <div style="text-align:center;margin:24px 0 6px;">
      <a href="${DEFAULT_WHATSAPP_URL}" target="_blank" rel="noreferrer" style="display:inline-flex;align-items:center;justify-content:center;background:#D4AF37;color:#0B0E17;text-decoration:none;border-radius:10px;padding:16px 30px;font-size:14px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;">Quiero formar parte</a>
    </div>`;

  const formatEmailTemplateDate = (dateValue) => {
    if (!dateValue) return 'FECHA A DEFINIR';
    try {
      return new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(new Date(dateValue)).toUpperCase();
    } catch {
      return 'FECHA A DEFINIR';
    }
  };

  const buildEmailPreviewHtml = (body, dateValue) => {
    const raw = String(body || '').trim();
    if (!raw) {
      return `<div style="padding:28px 24px;text-align:center;color:#9AA3B5;font-size:14px;">Sin contenido.</div>`;
    }
    const fecha = formatEmailTemplateDate(dateValue);
    const looksLikeHtml = /<[^>]+>/.test(raw);
    if (looksLikeHtml) {
      return raw
        .replace(/\{\{WHATSAPP_BUTTON\}\}/g, buildWhatsappButtonHtml())
        .replace(/\{\{LOGO_URL\}\}/g, EMAIL_LOGO_DATA_URI)
        .replace(/\[FECHA\]/g, fecha);
    }
    const paragraphs = escapeHtml(raw).split(/\n{2,}/).map(part => `<p style="margin:0 0 16px;">${part.replace(/\n/g, '<br/>')}</p>`).join('');
    return `
      <div style="background:#131A2A;padding:34px 36px;color:#E9EDF6;font-family:'DM Sans',Arial,sans-serif;">
        <div style="text-align:center;margin-bottom:18px;"><img src="${EMAIL_LOGO_DATA_URI}" alt="Seminario Cripto" style="width:58px;height:58px;object-fit:contain;display:block;margin:0 auto 10px;"/><div style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#D4AF37;font-weight:700;">Seminario Cripto</div><div style="font-size:13px;color:#8F97A8;margin-top:8px;">${fecha}</div></div>
        <div style="font-size:15px;line-height:1.8;color:#D9DEEA;">${paragraphs}</div>
        ${buildWhatsappButtonHtml()}
      </div>`;
  };

  const emailPreviewBody = (body, dateValue) => {
    return (
      <div style={{ background:'#0B0E17', border:'1px solid var(--border)', borderRadius:16, padding:18 }}>
        <div style={{ maxWidth:700, margin:'0 auto', borderRadius:18, overflow:'hidden' }} dangerouslySetInnerHTML={{ __html: buildEmailPreviewHtml(body, dateValue) }} />
      </div>
    );
  };

  const duplicateEmail = async (email) => {
    if (!email) return;
    try {
      const payload = {
        asunto: `Copia de ${email.asunto}`,
        preheader: email.preheader || null,
        html_body: email.html_body || '',
        segmento: 'todos',
        estado: 'borrador',
        programado_para: null,
      };
      const { data, error } = await db.from('emails').insert(payload).select().single();
      if (error) throw error;
      const nuevo = mapEmailRow(data);
      setEmails(e => [nuevo, ...e]);
      setSelected(nuevo);
      setEditingEmailId(nuevo.id);
      setForm({
        asunto: nuevo.asunto,
        preheader: nuevo.preheader || '',
        html_body: nuevo.html_body || '',
        segmento: 'todos',
        programado_para: ''
      });
      setShowEditor(true);
      if (onActivity) await onActivity('email_borrador', `Email duplicado como borrador: ${nuevo.asunto}`, { email_id: nuevo.id });
      showToast('Email duplicado y abierto para edición.');
    } catch (err) {
      console.error('Error duplicando email:', err);
      showToast('No se pudo duplicar el email.', 'error');
    }
  };

  return (
    <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
      <div style={{ width:370, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'20px 20px 14px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
            <div>
              <div style={{ fontSize:17, fontWeight:700 }}>{mode === 'enviados' ? 'Enviados' : 'Redactar'}</div>
            </div>
            {mode !== 'enviados' && (
              <button onClick={openNewEmail} style={{ display:'flex', alignItems:'center', gap:7, background:'var(--gold)', color:'#0B0E17', border:'none', borderRadius:8, padding:'8px 12px', fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:'DM Sans, sans-serif', letterSpacing:'0.04em' }}>
                <Icon name="plus" size={12} color="#0B0E17" /> NUEVO
              </button>
            )}
          </div>
        </div>
        {mode !== 'enviados' && (
          <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', display:'flex', gap:6, flexWrap:'wrap' }}>
            {[
              ['borrador','Borradores'],
              ['programado','Programados'],
              ['archivado','Archivados']
            ].map(([id,label])=>(
              <button key={id} onClick={()=>setEmailFiltro(id)} style={{
                padding:'5px 9px', borderRadius:99, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans, sans-serif',
                border:`1px solid ${emailFiltro===id?'var(--gold)':'var(--border)'}`,
                background:emailFiltro===id?'var(--gold-dim)':'transparent',
                color:emailFiltro===id?'var(--gold)':'var(--muted)'
              }}>{label}</button>
            ))}
          </div>
        )}
        <div style={{ overflowY:'auto', flex:1 }}>
          {filteredEmails.length === 0 ? (
            <div style={{ padding:24, color:'var(--muted)', fontSize:12, lineHeight:1.6 }}>
              <div style={{ width:38, height:38, borderRadius:12, background:'var(--gold-dim)', display:'grid', placeItems:'center', marginBottom:12 }}>
                <Icon name="emails" size={18} color="var(--gold)" />
              </div>
              <div style={{ color:'var(--text)', fontWeight:700, marginBottom:4 }}>{mode === 'enviados' ? 'No hay emails enviados.' : 'No hay emails en esta sección.'}</div>
              <div>{mode === 'enviados' ? 'El historial de envíos va a aparecer acá.' : 'Redactá, programá o archivá emails desde esta sección.'}</div>
            </div>
          ) : filteredEmails.map(e=>(
            <div key={e.id} onClick={()=>requestDiscard(()=>{ setSelected(e); setShowEditor(false); })} style={{
              padding:'14px 20px', borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background 0.1s',
              background:selected?.id===e.id?'var(--surface2)':'transparent'
            }}
            onMouseEnter={ev=>{ if(selected?.id!==e.id) ev.currentTarget.style.background='var(--hover)'; }}
            onMouseLeave={ev=>{ if(selected?.id!==e.id) ev.currentTarget.style.background='transparent'; }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6, gap:10 }}>
                <div style={{ fontWeight:600, fontSize:12, lineHeight:1.35, flex:1 }}>{e.asunto}</div>
                <Badge label={e.estado === 'listo' ? 'borrador' : e.estado} />
              </div>
              <div style={{ display:'flex', gap:14, fontSize:11, color:'var(--muted)' }}>
                <span>{e.estado === 'programado' && e.programado_para ? formatArgentinaDateTime(e.programado_para) : e.fecha}</span>
                {e.estado==='enviado' && <><span style={{ color:'var(--green)' }}>{e.enviados} enviados</span><span>{e.enviados ? Math.round((e.abiertos/e.enviados)*100) : 0}% abiertos</span></>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>
        {showEditor ? (
          <div style={{ maxWidth:850 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
              <div>
                <div style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>{editingEmailId ? 'Editar email' : 'Nuevo email'}</div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>Armá el contenido, guardalo como borrador o dejalo programado.</div>
              </div>
              <button onClick={()=>requestDiscard(resetEditor)} style={{ background:'transparent', border:'1px solid var(--border2)', color:'var(--text)', borderRadius:8, padding:'8px 12px', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontSize:12, fontWeight:700 }}>CANCELAR</button>
            </div>

            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:20, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

                <div style={{ gridColumn:'1 / -1' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Plantillas rápidas</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {EMAIL_TEMPLATES.map(t=>(
                      <button key={t.id} onClick={()=>{
                        if (!form.asunto && !form.preheader && !form.html_body) {
                          applyTemplate(t);
                          return;
                        }
                        setConfirmTemplate({ open:true, template:t });
                      }} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid var(--border2)', background:'var(--surface2)', color:'var(--text)', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontSize:12, fontWeight:700 }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ gridColumn:'1 / -1' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Asunto</div>
                    <div style={{ fontSize:11, color:form.asunto.length>70?'var(--gold)':'var(--muted)' }}>{form.asunto.length}/70</div>
                  </div>
                  <input value={form.asunto} onChange={e=>set('asunto', e.target.value)} placeholder="Ej: Bitcoin vuelve a una zona clave" style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border2)', background:'var(--input-bg)', color:'var(--text)', outline:'none', fontFamily:'DM Sans, sans-serif' }} />
                </div>
                <div style={{ gridColumn:'1 / -1' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Preheader</div>
                    <div style={{ fontSize:11, color:form.preheader.length>110?'var(--gold)':'var(--muted)' }}>{form.preheader.length}/110</div>
                  </div>
                  <input value={form.preheader} onChange={e=>set('preheader', e.target.value)} placeholder="Texto corto que aparece como vista previa del email" style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border2)', background:'var(--input-bg)', color:'var(--text)', outline:'none', fontFamily:'DM Sans, sans-serif' }} />
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Destinatarios</div>
                  <select value={form.segmento} onChange={e=>set('segmento', e.target.value)} style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border2)', background:'var(--input-bg)', color:'var(--text)', fontFamily:'DM Sans, sans-serif', outline:'none' }}>
                    <option value="todos">Todos los contactos ({contacts.length})</option>
                    <option value="activos">Contactos activos ({activeContacts.length})</option>
                  </select>
                  <div style={{ marginTop:6, fontSize:11, color:'var(--muted)' }}>Activos = contactos que abren al menos el 50% de los emails. Hasta conectar Resend y tener envíos reales, este segmento puede figurar en 0.</div>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Programar para <span style={{ color:'var(--muted)', fontWeight:500 }}>(opcional)</span></div>
                  <input type="datetime-local" value={form.programado_para} onChange={e=>set('programado_para', e.target.value)} style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border2)', background:'var(--input-bg)', color:'var(--text)', outline:'none', fontFamily:'DM Sans, sans-serif' }} />
                  <div style={{ marginTop:6, fontSize:11, color:'var(--muted)' }}>Si completás fecha y hora, al guardar queda programado automáticamente.</div>
                </div>
                <div style={{ gridColumn:'1 / -1' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Contenido</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>Las plantillas rápidas ya traen estructura premium tipo newsletter. El botón de WhatsApp se inserta automáticamente en el punto clave del mail.</div>
                  <textarea value={form.html_body} onChange={e=>set('html_body', e.target.value)} placeholder="Pegá acá el contenido del email. Si aplicás una plantilla rápida, acá vas a ver la estructura HTML lista para editar." rows={12} style={{ width:'100%', padding:'12px', borderRadius:8, border:'1px solid var(--border2)', background:'var(--input-bg)', color:'var(--text)', outline:'none', resize:'vertical', fontFamily:'DM Sans, sans-serif', lineHeight:1.6 }} />
                </div>
                <div style={{ gridColumn:'1 / -1', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:10, padding:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Botón automático del email</div>
                  <a href={DEFAULT_WHATSAPP_URL} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, background:'var(--gold)', color:'#0B0E17', textDecoration:'none', borderRadius:8, padding:'10px 14px', fontSize:12, fontWeight:800, letterSpacing:'0.04em' }}>
                    Contactar por WhatsApp
                  </a>
                  <div style={{ marginTop:8, color:'var(--muted)', fontSize:11 }}>Este botón se agrega automáticamente al final de todos los emails. No tenés que pegar el link manualmente.</div>
                </div>
                <div style={{ gridColumn:'1 / -1' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Vista previa final</div>
                  {emailPreviewBody(form.html_body, form.programado_para || null)}
                </div>
              </div>
              <div style={{ padding:'14px 20px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                <div style={{ fontSize:11, color:'var(--muted)' }}>Destinatarios seleccionados: <strong style={{ color:'var(--text)' }}>{destinatariosTexto()}</strong></div>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <button disabled={saving} onClick={()=>showPendingSend('prueba')} style={{ padding:'10px 14px', borderRadius:8, border:'1px solid var(--border2)', background:'transparent', color:'var(--text)', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontSize:12, fontWeight:700 }}>ENVIAR PRUEBA</button>
                  <button disabled={saving} onClick={()=>showPendingSend('ahora')} style={{ padding:'10px 14px', borderRadius:8, border:'1px solid var(--gold-dim2)', background:'var(--gold-dim)', color:'var(--gold)', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontSize:12, fontWeight:800 }}>ENVIAR AHORA</button>
                  <button disabled={saving} onClick={handlePrimarySave} style={{ padding:'10px 14px', borderRadius:8, border:'1px solid var(--border2)', background:'transparent', color:'var(--text)', cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontSize:12, fontWeight:700 }}>GUARDAR</button>
                </div>
              </div>
            </div>
          </div>
        ) : selected ? (
          <div style={{ maxWidth:850 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
              <div>
                <div style={{ fontSize:20, fontWeight:800, marginBottom:6, lineHeight:1.3 }}>{selected.asunto}</div>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <Badge label={selected.estado === 'listo' ? 'borrador' : selected.estado} />
                  <span style={{ fontSize:12, color:'var(--muted)' }}>{selected.fecha}</span>
                </div>
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'flex-end' }}>
                {selected.estado !== 'enviado' && selected.estado !== 'archivado' && <button onClick={()=>openEditEmail(selected)} style={{ background:'transparent', color:'var(--text)', border:'1px solid var(--border2)', borderRadius:8, padding:'8px 12px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>EDITAR</button>}
                <button onClick={()=>duplicateEmail(selected)} style={{ background:'transparent', color:'var(--text)', border:'1px solid var(--border2)', borderRadius:8, padding:'8px 12px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>DUPLICAR</button>
                {selected.estado === 'programado' && <button onClick={()=>cancelSchedule(selected)} style={{ background:'var(--gold-dim)', color:'var(--gold)', border:'1px solid var(--gold-dim2)', borderRadius:8, padding:'8px 12px', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>CANCELAR PROGRAMACIÓN</button>}
                {selected.estado !== 'archivado' && <button onClick={()=>showPendingSend('prueba')} style={{ background:'transparent', color:'var(--text)', border:'1px solid var(--border2)', borderRadius:8, padding:'8px 12px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>ENVIAR PRUEBA</button>}
                {selected.estado !== 'archivado' && <button onClick={()=>showPendingSend('ahora')} style={{ background:'var(--gold-dim)', color:'var(--gold)', border:'1px solid var(--gold-dim2)', borderRadius:8, padding:'8px 12px', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>ENVIAR AHORA</button>}
                {selected.estado !== 'archivado' && <button onClick={()=>archiveEmail(selected)} style={{ background:'transparent', color:'var(--muted)', border:'1px solid var(--border2)', borderRadius:8, padding:'8px 12px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>ARCHIVAR</button>}
                {selected.estado === 'archivado' && <button onClick={()=>restoreEmail(selected)} style={{ background:'var(--gold-dim)', color:'var(--gold)', border:'1px solid var(--gold-dim2)', borderRadius:8, padding:'8px 12px', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>RESTAURAR</button>}
                <button onClick={()=>setConfirmDelete({ open:true, email:selected })} style={{ background:'transparent', color:'var(--muted)', border:'1px solid var(--border2)', borderRadius:8, padding:'8px 12px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>ELIMINAR</button>
              </div>
            </div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--muted)', display:'flex', flexDirection:'column', gap:5 }}>
                <span>De: <strong style={{ color:'var(--text)' }}>Seminario Cripto</strong></span>
                <span>Asunto: <strong style={{ color:'var(--text)' }}>{selected.asunto}</strong></span>
                {selected.preheader && <span>Preheader: <strong style={{ color:'var(--text)' }}>{selected.preheader}</strong></span>}
                {selected.estado === 'programado' && selected.programado_para && <span>Programado para: <strong style={{ color:'var(--gold)' }}>{fechaProgramada(selected)}</strong></span>}
                <span>Destinatarios: <strong style={{ color:'var(--text)' }}>{selected.segmento === 'activos' ? 'Contactos activos' : 'Todos los contactos'}</strong></span>
              </div>
              <div style={{ padding:'24px', fontSize:13, color:'var(--text)', lineHeight:1.8 }}>{emailPreviewBody(selected.html_body, selected.programado_para || selected.enviado_en || selected.created_at || null)}</div>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--muted)', gap:12, textAlign:'center' }}>
            <Icon name="emails" size={36} color="var(--border2)" />
            <div style={{ fontSize:15, color:'var(--text)', fontWeight:700 }}>{mode === 'enviados' ? 'Seleccioná un email enviado' : 'Seleccioná un borrador o redactá uno nuevo'}</div>
            {mode !== 'enviados' && (
              <button onClick={openNewEmail} style={{ marginTop:4, display:'flex', alignItems:'center', gap:7, background:'var(--gold)', color:'#0B0E17', border:'none', borderRadius:8, padding:'10px 14px', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                <Icon name="plus" size={12} color="#0B0E17" /> NUEVO EMAIL
              </button>
            )}
          </div>
        )}
      </div>

      <ModalConfirmacion
        open={confirmTemplate.open}
        title="Aplicar plantilla"
        message={confirmTemplate.template ? `Se reemplazará el contenido actual del borrador por la plantilla “${confirmTemplate.template.label}”.` : ''}
        confirmLabel="Aplicar plantilla"
        cancelLabel="Cancelar"
        onCancel={()=>setConfirmTemplate({ open:false, template:null })}
        onConfirm={()=>applyTemplate(confirmTemplate.template)}
      />
      <ModalConfirmacion
        open={confirmDiscard.open}
        title="Cambios sin guardar"
        message="Tenés cambios sin guardar en este email. Si salís ahora, se van a perder."
        confirmLabel="Salir sin guardar"
        cancelLabel="Volver"
        onCancel={()=>setConfirmDiscard({ open:false, action:null })}
        onConfirm={()=>runAfterDiscard(confirmDiscard.action)}
      />
      <ModalConfirmacion
        open={pendingSend.open}
        title={pendingSend.tipo === 'prueba' ? 'Enviar prueba real' : 'Enviar ahora'}
        message={pendingSend.tipo === 'prueba'
          ? `Se enviará una prueba real a ${DEFAULT_TEST_EMAIL}.`
          : `Se enviará este email a los destinatarios seleccionados. Si editaste contenido en pantalla, guardalo antes de enviar para que Resend use la última versión.`}
        confirmLabel={pendingSend.tipo === 'prueba' ? 'Enviar prueba' : 'Enviar ahora'}
        cancelLabel="Cancelar"
        onCancel={()=>setPendingSend({ open:false, tipo:'' })}
        onConfirm={executePendingSend}
      />
      <ModalConfirmacion
        open={confirmProgram.open}
        title="Guardar como programado"
        message={`Se programará este email para ${form.programado_para ? formatArgentinaDateTime(new Date(form.programado_para)) : 'la fecha seleccionada'} y quedará preparado para los destinatarios seleccionados (${destinatariosCount()}). ${batchInfoText()} ${qualityIssues().length ? `Revisar antes de enviar: ${qualityIssues().join(' ')}` : 'Control de calidad OK.'}`}
        confirmLabel="Guardar programado"
        cancelLabel="Volver"
        onCancel={()=>setConfirmProgram({ open:false })}
        onConfirm={()=>{ setConfirmProgram({ open:false }); saveEmail('programado'); }}
      />
      <ModalConfirmacion
        open={confirmDelete.open}
        title="Eliminar email"
        message={confirmDelete.email ? `Se eliminará el email “${confirmDelete.email.asunto}”. Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onCancel={()=>setConfirmDelete({ open:false, email:null })}
        onConfirm={()=>deleteEmail(confirmDelete.email)}
      />
      <Toast msg={toast.msg} visible={toast.visible} tone={toast.tone} />
    </div>
  );
};


// ── RECIBIDOS VIEW ─────────────────────────────────────────────────────────
const RespuestasView = ({ respuestas, setRespuestas }) => {
  const [selected, setSelected] = React.useState(null);
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [replyOpen, setReplyOpen] = React.useState(false);
  const [replyText, setReplyText] = React.useState('');
  const [replySending, setReplySending] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState({ open:false, ids:[], label:'emails recibidos' });
  const [toast, setToast] = React.useState({ visible:false, msg:'', tone:'success' });

  const showToast = (msg, tone='success') => {
    setToast({ visible:true, msg, tone });
    setTimeout(()=>setToast({ visible:false, msg:'', tone:'success' }), 2600);
  };

  const escapeHtml = (str='') => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const stripHtml = (html = '') => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').trim();
  };

  const limpiarRespuesta = (body = '') => {
    let s = String(body || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    const cortes = [
      /\n\s*El\s+.+?\s+escribió:\s*/i,
      /\n\s*On\s+.+?\s+wrote:\s*/i,
      /\n\s*De:\s*.+/i,
      /\n\s*From:\s*.+/i,
      /\n\s*-{2,}\s*Mensaje original\s*-{2,}/i,
      /\n\s*-{2,}\s*Original Message\s*-{2,}/i,
      /\n\s*_{5,}\s*/i,
    ];

    for (const rx of cortes) {
      const m = s.search(rx);
      if (m > 0) s = s.slice(0, m).trim();
    }

    s = s
      .split('\n')
      .filter(line => !line.trim().startsWith('>'))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return s;
  };

  const bodyVisible = (r) => {
    const textBody = limpiarRespuesta(r?.text_body || '');
    if (textBody) return textBody;

    const htmlBody = limpiarRespuesta(stripHtml(r?.html_body || ''));
    if (htmlBody) return htmlBody;

    return '';
  };

  const fechaAR = (value, withTime = true) => {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const opts = withTime
      ? { timeZone:'America/Argentina/Buenos_Aires', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }
      : { timeZone:'America/Argentina/Buenos_Aires', day:'2-digit', month:'2-digit', year:'numeric' };
    return new Intl.DateTimeFormat('es-AR', opts).format(date).replace(',', '');
  };

  const haceTiempo = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const diffMin = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `hace ${diffHr} h`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays === 1) return 'ayer';
    if (diffDays < 7) return `hace ${diffDays} días`;
    return fechaAR(date, false);
  };

  const mapRespuestaLocal = (r) => ({
    id: r.id,
    from_email: r.from_email || '',
    from_name: r.from_name || '',
    to_email: r.to_email || '',
    subject: r.subject || '(sin asunto)',
    text_body: r.text_body || '',
    html_body: r.html_body || '',
    message_id: r.message_id || '',
    resend_email_id: r.resend_email_id || '',
    leido: Boolean(r.leido),
    created_at: r.created_at,
    fecha: fechaAR(r.created_at),
    tiempo: haceTiempo(r.created_at),
  });

  const cargarRecibidos = async (silent = false) => {
    setLoading(true);
    try {
      const { data, error } = await db
        .from('email_respuestas')
        .select('id,resend_email_id,message_id,from_email,from_name,to_email,subject,text_body,html_body,leido,created_at')
        .order('created_at', { ascending:false })
        .limit(100);

      if (error) throw error;

      const mapped = (data || []).map(mapRespuestaLocal);
      setRespuestas(mapped);
      setSelectedIds([]);

      setSelected(prev => {
        if (!mapped.length) return null;
        if (prev) return mapped.find(r => r.id === prev.id) || mapped[0];
        return mapped[0];
      });

      if (!silent) showToast(`Recibidos actualizados · ${mapped.length}`, 'success');
    } catch (err) {
      console.error('No se pudieron cargar recibidos:', err);
      showToast(`No se pudieron cargar recibidos: ${err?.message || 'error desconocido'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    cargarRecibidos(true);
  }, []);

  React.useEffect(() => {
    if (!selected && respuestas.length) setSelected(respuestas[0]);
  }, [respuestas]);

  React.useEffect(() => {
    setReplyOpen(false);
    setReplyText('');
  }, [selected?.id]);

  const marcarLeida = async (respuesta) => {
    if (!respuesta || respuesta.leido) return;

    setRespuestas(list => list.map(r => r.id === respuesta.id ? { ...r, leido:true } : r));
    setSelected(s => s && s.id === respuesta.id ? { ...s, leido:true } : s);

    try {
      const { error } = await db.from('email_respuestas').update({ leido:true }).eq('id', respuesta.id);
      if (error) throw error;
    } catch (err) {
      console.warn('No se pudo marcar como leída en Supabase:', err);
    }
  };

  const toggleSeleccion = (id, event) => {
    event.stopPropagation();
    setSelectedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  };

  const seleccionarTodos = () => {
    if (!respuestas.length) return;
    if (selectedIds.length === respuestas.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(respuestas.map(r => r.id));
    }
  };

  const pedirEliminarIds = (ids, label = 'emails recibidos') => {
    if (!ids.length) return showToast('No hay emails seleccionados para eliminar.', 'error');
    setDeleteConfirm({ open:true, ids, label });
  };

  const confirmarEliminacion = async () => {
    const ids = deleteConfirm.ids || [];
    if (!ids.length) return setDeleteConfirm({ open:false, ids:[], label:'emails recibidos' });

    const prev = respuestas;
    const next = respuestas.filter(r => !ids.includes(r.id));
    setRespuestas(next);
    setSelectedIds([]);
    if (selected && ids.includes(selected.id)) setSelected(next[0] || null);
    setDeleteConfirm({ open:false, ids:[], label:'emails recibidos' });

    try {
      const { error } = await db.from('email_respuestas').delete().in('id', ids);
      if (error) throw error;
      showToast(ids.length === 1 ? 'Email recibido eliminado.' : 'Emails recibidos eliminados.', 'success');
    } catch (err) {
      console.error('No se pudieron eliminar recibidos:', err);
      showToast(`No se pudo eliminar: ${err?.message || 'error desconocido'}`, 'error');
      setRespuestas(prev);
      if (selected && ids.includes(selected.id)) setSelected(prev.find(r => r.id === selected.id) || prev[0] || null);
    }
  };

  const eliminarRecibido = async (respuesta) => {
    if (!respuesta) return;
    pedirEliminarIds([respuesta.id], 'email recibido');
  };

  const eliminarDesdeHeader = async () => {
    const ids = selectedIds.length ? selectedIds : respuestas.map(r => r.id);
    const label = selectedIds.length ? 'emails seleccionados' : 'emails recibidos';
    pedirEliminarIds(ids, label);
  };

  const abrirRespuesta = () => {
    if (!selected?.from_email) return;
    setReplyOpen(true);
  };

  const enviarRespuestaCRM = async () => {
    if (!selected?.from_email) return showToast('No hay destinatario para responder.', 'error');
    if (!replyText.trim()) return showToast('Escribí una respuesta antes de enviar.', 'error');

    setReplySending(true);
    try {
      const subject = selected.subject && selected.subject.toLowerCase().startsWith('re:')
        ? selected.subject
        : `Re: ${selected.subject || ''}`;

      const html = `
        <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#111827;">
          ${escapeHtml(replyText.trim()).replace(/\n/g, '<br/>')}
          <br/><br/>
          <div style="font-size:13px;color:#6B7280;">
            Seminario Cripto
          </div>
        </div>
      `;

      const response = await fetch(SEND_EMAIL_FUNCTION_URL, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          action:'test',
          test_to:selected.from_email,
          asunto:subject,
          preheader:'Respuesta de Seminario Cripto',
          html_body:html
        })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      showToast('Respuesta enviada desde el CRM.', 'success');
      setReplyText('');
      setReplyOpen(false);
    } catch (err) {
      console.error('No se pudo enviar la respuesta:', err);
      showToast(`No se pudo enviar la respuesta: ${err?.message || 'error desconocido'}`, 'error');
    } finally {
      setReplySending(false);
    }
  };

  const sinRespuestas = !respuestas.length;
  const noLeidas = respuestas.filter(r => !r.leido).length;
  const allSelected = respuestas.length > 0 && selectedIds.length === respuestas.length;

  return (
    <div style={{ flex:1, overflow:'hidden', display:'grid', gridTemplateColumns:'360px 1fr' }}>
      <div style={{ borderRight:'1px solid var(--border)', background:'var(--surface)', overflowY:'auto' }}>
        <div style={{ padding:'22px 18px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
            <div>
              <div style={{ fontSize:17, fontWeight:800 }}>Recibidos</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button
                title={allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                onClick={seleccionarTodos}
                disabled={!respuestas.length}
                style={{
                  width:34, height:34, display:'inline-flex', alignItems:'center', justifyContent:'center',
                  border:'1px solid var(--border2)', background:allSelected?'var(--gold-dim)':'var(--bg)', color:'var(--text)', borderRadius:9,
                  cursor:!respuestas.length?'not-allowed':'pointer', fontFamily:'DM Sans, sans-serif', fontSize:15, lineHeight:1, opacity:!respuestas.length?0.45:1
                }}
              >
                {allSelected ? '☑' : '☐'}
              </button>
              <button
                title={selectedIds.length ? `Eliminar ${selectedIds.length} seleccionados` : 'Eliminar todos los recibidos'}
                onClick={eliminarDesdeHeader}
                disabled={!respuestas.length}
                style={{
                  width:34, height:34, display:'inline-flex', alignItems:'center', justifyContent:'center',
                  border:'1px solid var(--border2)', background:'var(--bg)', color:'var(--muted)', borderRadius:9,
                  cursor:!respuestas.length?'not-allowed':'pointer', fontFamily:'DM Sans, sans-serif', fontSize:16, lineHeight:1, opacity:!respuestas.length?0.45:1
                }}
              >
                🗑
              </button>
              <button
                title="Actualizar recibidos"
                onClick={()=>cargarRecibidos(false)}
                disabled={loading}
                style={{
                  width:34, height:34, display:'inline-flex', alignItems:'center', justifyContent:'center',
                  border:'1px solid var(--border2)', background:'var(--bg)', color:'var(--text)', borderRadius:9,
                  cursor:loading?'wait':'pointer', fontFamily:'DM Sans, sans-serif', fontSize:17, lineHeight:1
                }}
              >
                {loading ? '⟳' : '↻'}
              </button>
            </div>
          </div>

          <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
            <Badge label={`${respuestas.length} recibidos`} />
            <Badge label={`${noLeidas} sin leer`} />
            {selectedIds.length > 0 && <Badge label={`${selectedIds.length} seleccionados`} />}
          </div>
        </div>

        {sinRespuestas ? (
          <div style={{ padding:20, color:'var(--muted)', fontSize:13, lineHeight:1.7 }}>
            Todavía no entraron respuestas. Tocá el ícono de actualizar para revisar nuevos emails recibidos.
          </div>
        ) : respuestas.map(r => (
          <div key={r.id} style={{
            display:'grid', gridTemplateColumns:'32px 1fr', alignItems:'stretch',
            borderBottom:'1px solid var(--border)', background:selected?.id===r.id?'var(--gold-dim)':'transparent'
          }}>
            <button
              onClick={(e)=>toggleSeleccion(r.id, e)}
              title={selectedIds.includes(r.id) ? 'Quitar selección' : 'Seleccionar'}
              style={{
                border:'none', background:'transparent', color:selectedIds.includes(r.id)?'var(--gold)':'var(--muted)',
                cursor:'pointer', fontSize:16, fontFamily:'DM Sans, sans-serif'
              }}
            >
              {selectedIds.includes(r.id) ? '☑' : '☐'}
            </button>
            <button onClick={()=>{ setSelected(r); marcarLeida(r); }} style={{
              width:'100%', border:'none', background:'transparent',
              color:'var(--text)', textAlign:'left', padding:'14px 16px 14px 0', cursor:'pointer', fontFamily:'DM Sans, sans-serif'
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'center' }}>
                <div style={{ fontSize:13, fontWeight:r.leido?600:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {r.from_name || r.from_email}
                </div>
                {!r.leido && <span style={{ width:8, height:8, borderRadius:99, background:'var(--gold)', flexShrink:0 }} />}
              </div>
              <div style={{ fontSize:12, fontWeight:700, marginTop:5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.subject}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:5 }}>{r.tiempo} · {r.fecha}</div>
            </button>
          </div>
        ))}
      </div>

      <div style={{ overflowY:'auto', padding:'24px 28px', background:'var(--bg)' }}>
        {!selected ? (
          <div style={{ color:'var(--muted)' }}>Seleccioná un email recibido.</div>
        ) : (
          <div style={{ maxWidth:850 }}>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-start' }}>
                  <div>
                    <div style={{ fontSize:20, fontWeight:800, lineHeight:1.3 }}>{selected.subject}</div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginTop:8 }}>
                      De: <strong style={{ color:'var(--text)' }}>{selected.from_name || selected.from_email}</strong> &lt;{selected.from_email}&gt;
                    </div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginTop:3 }}>Para: {selected.to_email}</div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginTop:3 }}>{selected.fecha}</div>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <button onClick={()=>eliminarRecibido(selected)} title="Eliminar recibido" style={{
                      width:38, height:38, borderRadius:8, border:'1px solid var(--border2)', background:'transparent', color:'var(--muted)',
                      cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontSize:18, lineHeight:1
                    }}>🗑</button>
                    <button onClick={abrirRespuesta} style={{
                      padding:'10px 14px', borderRadius:8, border:'1px solid var(--gold-dim2)', background:'var(--gold)', color:'#0B0E17',
                      cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontSize:12, fontWeight:800, letterSpacing:'0.04em'
                    }}>RESPONDER</button>
                  </div>
                </div>
              </div>

              <div style={{ padding:20 }}>
                <div style={{ whiteSpace:'pre-wrap', lineHeight:1.7, fontSize:14, color:'var(--text)' }}>
                  {bodyVisible(selected) || 'Este email fue recibido, pero quedó guardado sin cuerpo. Los próximos recibidos deberían entrar con cuerpo completo después de actualizar la función inbound.'}
                </div>

                {replyOpen && (
                  <div style={{ marginTop:22, borderTop:'1px solid var(--border)', paddingTop:18 }}>
                    <div style={{ fontSize:13, fontWeight:800, marginBottom:8 }}>Responder desde el CRM</div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginBottom:10 }}>
                      Para: <strong style={{ color:'var(--text)' }}>{selected.from_email}</strong>
                    </div>
                    <textarea
                      value={replyText}
                      onChange={e=>setReplyText(e.target.value)}
                      placeholder="Escribí la respuesta..."
                      style={{
                        width:'100%', minHeight:150, resize:'vertical', border:'1px solid var(--border2)', borderRadius:10,
                        background:'var(--input-bg)', color:'var(--text)', padding:'13px 14px', fontFamily:'DM Sans, sans-serif',
                        fontSize:14, outline:'none', lineHeight:1.6
                      }}
                    />
                    <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:12 }}>
                      <button onClick={()=>{ setReplyOpen(false); setReplyText(''); }} disabled={replySending} style={{
                        padding:'10px 14px', borderRadius:8, border:'1px solid var(--border2)', background:'transparent', color:'var(--text)',
                        cursor:replySending?'wait':'pointer', fontFamily:'DM Sans, sans-serif', fontSize:12, fontWeight:800
                      }}>CANCELAR</button>
                      <button onClick={enviarRespuestaCRM} disabled={replySending} style={{
                        padding:'10px 14px', borderRadius:8, border:'1px solid var(--gold-dim2)', background:'var(--gold)', color:'#0B0E17',
                        cursor:replySending?'wait':'pointer', fontFamily:'DM Sans, sans-serif', fontSize:12, fontWeight:800
                      }}>{replySending ? 'ENVIANDO...' : 'ENVIAR RESPUESTA'}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {deleteConfirm.open && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(5,8,15,.68)', backdropFilter:'blur(4px)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:20
        }}>
          <div style={{
            width:'min(440px, 100%)', background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:16, boxShadow:'0 24px 80px rgba(0,0,0,.42)', overflow:'hidden'
          }}>
            <div style={{ padding:'22px 24px 14px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{
                  width:38, height:38, borderRadius:999, background:'rgba(220,53,69,.13)', color:'#ff6b6b',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:19
                }}>🗑</div>
                <div>
                  <div style={{ fontSize:18, fontWeight:900, color:'var(--text)' }}>Eliminar recibidos</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:3 }}>Esta acción no se puede deshacer.</div>
                </div>
              </div>
              <div style={{ marginTop:18, fontSize:14, lineHeight:1.6, color:'var(--text)' }}>
                ¿Querés eliminar <strong>{deleteConfirm.ids.length}</strong> {deleteConfirm.label}?
              </div>
            </div>
            <div style={{
              padding:'16px 24px 22px', display:'flex', justifyContent:'flex-end', gap:10,
              borderTop:'1px solid var(--border)'
            }}>
              <button onClick={()=>setDeleteConfirm({ open:false, ids:[], label:'emails recibidos' })} style={{
                padding:'10px 14px', borderRadius:9, border:'1px solid var(--border2)', background:'transparent', color:'var(--text)',
                cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontSize:12, fontWeight:800
              }}>CANCELAR</button>
              <button onClick={confirmarEliminacion} style={{
                padding:'10px 14px', borderRadius:9, border:'1px solid rgba(220,53,69,.35)', background:'#dc3545', color:'#fff',
                cursor:'pointer', fontFamily:'DM Sans, sans-serif', fontSize:12, fontWeight:900, letterSpacing:'.04em'
              }}>ELIMINAR</button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast.msg} visible={toast.visible} tone={toast.tone} />
    </div>
  );
};

// ── ACTIVIDAD VIEW ─────────────────────────────────────────────────────────
const ActividadView = ({ actividad }) => {
  const cm = {
    enviado:'var(--blue)', apertura:'var(--gold)', clic:'var(--green)', nuevo:'var(--green)',
    nuevo_contacto:'var(--green)', contacto_eliminado:'var(--red)', contacto_actualizado:'var(--blue)', email_borrador:'var(--blue)', email_programado:'var(--gold)', email_archivado:'var(--muted)', email_eliminado:'var(--red)'
  };
  const bm = {
    enviado:'var(--blue-dim)', apertura:'var(--gold-dim)', clic:'var(--green-dim)', nuevo:'var(--green-dim)',
    nuevo_contacto:'var(--green-dim)', contacto_eliminado:'var(--red-dim)', contacto_actualizado:'var(--blue-dim)', email_borrador:'var(--blue-dim)', email_programado:'var(--gold-dim)', email_archivado:'var(--border)', email_eliminado:'var(--red-dim)'
  };
  const label = {
    enviado:'Envío', apertura:'Apertura', clic:'Clic', nuevo:'Nuevo', nuevo_contacto:'Contacto', contacto_eliminado:'Contacto', contacto_actualizado:'Contacto',
    email_borrador:'Email', email_programado:'Email', email_archivado:'Email', email_eliminado:'Email'
  };
  return (
    <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:17, fontWeight:700 }}>Actividad del sistema</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>Registro real de acciones del CRM.</div>
        </div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>{actividad.length} eventos</div>
      </div>
      {actividad.length === 0 ? (
        <div style={{ height:'65vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', color:'var(--muted)', gap:12 }}>
          <Icon name="activity" size={36} color="var(--border2)" />
          <div style={{ fontSize:15, color:'var(--text)', fontWeight:700 }}>Todavía no hay actividad registrada.</div>
          <div style={{ fontSize:13 }}>Cuando crees contactos, borres registros o guardes emails, aparecerá acá.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {actividad.map((a,i)=>(
            <div key={a.id || i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 18px', display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:36, height:36, borderRadius:99, flexShrink:0, background:bm[a.tipo] || 'var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon name={a.icon} size={15} color={cm[a.tipo] || 'var(--muted)'} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:13 }}>{a.msg}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{a.tiempo} · {a.fecha}</div>
              </div>
              <div style={{ fontSize:10, fontWeight:700, color:cm[a.tipo] || 'var(--muted)', background:bm[a.tipo] || 'var(--border)', padding:'3px 10px', borderRadius:99, textTransform:'uppercase', letterSpacing:'0.08em' }}>{label[a.tipo] || a.tipo}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── CONFIGURACIÓN ──────────────────────────────────────────────────────────
const ConfigView = ({ dark, contacts = [] }) => {
  const StatusPill = ({ label, tone = 'ok' }) => {
    const map = {
      ok:      { bg:'var(--green-dim)', color:'var(--green)' },
      pending: { bg:'var(--gold-dim)',  color:'var(--gold)'  },
      muted:   { bg:'var(--border)',    color:'var(--muted)' },
    };
    const c = map[tone] || map.muted;
    return (
      <span style={{
        display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:99,
        background:c.bg, color:c.color, fontSize:11, fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase'
      }}>{label}</span>
    );
  };

  const Sect = ({ title, subtitle, children }) => (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', marginBottom:16 }}>
      <div style={{ padding:'15px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', gap:14 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:13 }}>{title}</div>
          {subtitle && <div style={{ color:'var(--muted)', fontSize:11, marginTop:2 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding:'18px 20px' }}>{children}</div>
    </div>
  );

  const Row = ({ label, value, status, tone }) => (
    <div style={{ display:'grid', gridTemplateColumns:'180px 1fr auto', gap:14, alignItems:'center', padding:'11px 0', borderBottom:'1px solid var(--border)' }}>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>
      <div style={{ fontSize:13, color:'var(--text)', wordBreak:'break-word' }}>{value}</div>
      {status ? <StatusPill label={status} tone={tone} /> : <span />}
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>
      <div style={{ maxWidth:760 }}>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:17, fontWeight:700 }}>Configuración</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>Estado general del panel operativo.</div>
        </div>

        <Sect title="Conexión Supabase" subtitle="Base de datos principal del sistema.">
          <Row label="Estado" value="Conectado a Supabase" status="Activo" tone="ok" />
          <Row label="Proyecto" value="seminariocripto" status="Operativo" tone="ok" />
          <Row label="Contactos" value={`${contacts.length} contactos cargados`} status="OK" tone="ok" />
          <div style={{ paddingTop:11, fontSize:11, color:'var(--muted)', lineHeight:1.6 }}>
            Las credenciales no se muestran en pantalla por seguridad. La conexión ya está configurada internamente en el panel.
          </div>
        </Sect>

        <Sect title="Email de envío" subtitle="Remitente que se usará para las campañas.">
          <Row label="Remitente" value="Seminario Cripto" status="Definido" tone="ok" />
          <Row label="Email" value="Pendiente hasta configurar dominio propio" status="Pendiente" tone="pending" />
          <Row label="Dominio" value="Pendiente" status="Pendiente" tone="pending" />
        </Sect>

        <Sect title="Automatización" subtitle="Envío programado de newsletters.">
          <Row label="Proveedor" value="Resend" status="Pendiente" tone="pending" />
          <Row label="Módulo emails" value="Borradores, programación interna y duplicado disponibles" status="Operativo" tone="ok" />
          <Row label="WhatsApp" value="Link principal de contacto configurado" status="OK" tone="ok" />
          <Row label="CTA automático" value="Botón de WhatsApp agregado automáticamente en emails" status="OK" tone="ok" />
          <div style={{ paddingTop:11, fontSize:11, color:'var(--muted)', lineHeight:1.6 }}>
            La automatización final se activa después de configurar el dominio y validar el remitente.
          </div>
        </Sect>


        <Sect title="Backups manuales" subtitle="Exportaciones simples para resguardar datos.">
          <Row label="Contactos" value="Exportación CSV disponible desde la pestaña Contactos" status="Listo" tone="ok" />
          <Row label="Emails" value="Historial guardado en Supabase" status="Operativo" tone="ok" />
          <Row label="Actividad" value="Registro operativo guardado en Supabase" status="Operativo" tone="ok" />
        </Sect>

        <Sect title="Sistema" subtitle="Información interna del panel.">
          <Row label="Versión" value="CRM Seminario Cripto — REDACTAR ENVIADOS OK 04/05" status="Actual" tone="ok" />
          <Row label="Datos demo" value="Contactos, emails y actividad falsa removidos" status="Limpio" tone="ok" />
          <Row label="Tema" value={dark ? 'Modo oscuro activo' : 'Modo claro activo'} status="OK" tone="ok" />
        </Sect>
      </div>
    </div>
  );
};

// ── AUTH ───────────────────────────────────────────────────────────────────
const USERS = [
  { email: 'crisdalessandro19@gmail.com', password: 'Pa$teur16567L', nombre: 'Cris' },
  { email: 'bahianoinversiones@gmail.com', password: 'Seninario7L', nombre: 'Bahiano' },
];

const Login = ({ onLogin }) => {
  const [email, setEmail]       = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError]       = React.useState('');
  const [loading, setLoading]   = React.useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      const user = USERS.find(u => u.email === email.trim() && u.password === password);
      if (user) {
        onLogin(user);
      } else {
        setError('Email o contraseña incorrectos.');
        setLoading(false);
      }
    }, 600);
  };

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 20
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo + título */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <img src="uploads/favicon.png" alt="Seminario Cripto" style={{ width: 52, height: 52, objectFit: 'contain', marginBottom: 14 }} />
          <div style={{ fontSize: 11, letterSpacing: '0.2em', color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Seminario Cripto</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>CRM Seminario Cripto</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Ingresá para continuar</div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '28px 28px 24px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.3)'
        }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</div>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com" required
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: `1px solid ${error ? 'var(--red)' : 'var(--border2)'}`,
                background: 'var(--input-bg)', color: 'var(--text)',
                fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif',
                transition: 'border-color 0.15s'
              }}
              onFocus={e => e.target.style.borderColor = 'var(--gold)'}
              onBlur={e => e.target.style.borderColor = error ? 'var(--red)' : 'var(--border2)'}
            />
          </div>

          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Contraseña</div>
            <div style={{ position:'relative' }}>
              <input
                type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{
                  width: '100%', padding: '10px 42px 10px 14px', borderRadius: 8,
                  border: `1px solid ${error ? 'var(--red)' : 'var(--border2)'}`,
                  background: 'var(--input-bg)', color: 'var(--text)',
                  fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif',
                  transition: 'border-color 0.15s'
                }}
                onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                onBlur={e => e.target.style.borderColor = error ? 'var(--red)' : 'var(--border2)'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                style={{
                  position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                  width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center',
                  background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', padding:0
                }}
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} size={16} color="var(--muted)" />
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: 'var(--red-dim)', border: '1px solid rgba(220,80,60,0.2)',
              borderRadius: 8, padding: '9px 14px', marginBottom: 16,
              fontSize: 12, color: 'var(--red)'
            }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '12px', borderRadius: 8,
            background: loading ? 'rgba(201,168,76,0.5)' : 'var(--gold)',
            color: '#0B0E17', border: 'none', fontSize: 13, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.08em',
            transition: 'background 0.15s'
          }}>
            {loading ? 'INGRESANDO...' : 'INGRESAR'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--muted)' }}>
          Acceso restringido — Solo usuarios autorizados
        </div>
      </div>
    </div>
  );
};
const INGRESOS_APP_URL = "https://project-7km8d.vercel.app";
const NAV = [
  { id:'dashboard',  label:'Dashboard',     icon:'dashboard' },
  { id:'contactos',  label:'Contactos',     icon:'contacts'  },
  { id:'respuestas', label:'Recibidos',     icon:'emails'    },
  { id:'redactar',   label:'Redactar',      icon:'edit'      },
  { id:'enviados',   label:'Enviados',      icon:'send'      },
  { id:'actividad',  label:'Actividad',     icon:'activity'  },
  { id:'config',     label:'Configuración', icon:'settings'  },
];

// ── APP ROOT ───────────────────────────────────────────────────────────────
function App() {
  const [user, setUser]         = React.useState(null);
  const [view, setView]         = React.useState('dashboard');
  const [dark, setDark]         = React.useState(true);
  const [contacts, setContacts] = React.useState([]);
  const [emails, setEmails]     = React.useState([]);
  const [enviadosMes, setEnviadosMes] = React.useState(0);
  const [respuestas, setRespuestas] = React.useState([]);
  const [openEmailId, setOpenEmailId] = React.useState(null);
  const [actividad, setActividad] = React.useState([]);
  const [loading, setLoading]   = React.useState(true);
  const [connected, setConnected] = React.useState(false);
  const [connectionMode, setConnectionMode] = React.useState('Cargando datos...');


  // Cargar datos reales desde Supabase
  React.useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const mapContacto = (c) => ({
      id: c.id || c.email,
      nombre: c.nombre || '',
      email: c.email || '',
      tipo: c.tipo || 'cliente',
      estado: c.estado || 'activo',
      ingreso: c.ingreso ? String(c.ingreso).split('T')[0] : (c.created_at ? String(c.created_at).split('T')[0] : '-'),
      emailsRecibidos: c.emailsRecibidos || 0,
      ultimoEmail: c.ultimoEmail || '-',
      abiertos: c.abiertos || 0,
    });

    const mapEmail = (e) => ({
      id: e.id,
      asunto: e.asunto || '',
      preheader: e.preheader || '',
      html_body: e.html_body || '',
      segmento: e.segmento || 'todos',
      fecha: e.created_at ? formatArgentinaDateTime(e.created_at, false) : '-',
      programado_para: e.programado_para || null,
      enviado_en: e.enviado_en || null,
      enviados: 0,
      abiertos: 0,
      clics: 0,
      estado: e.estado || 'borrador',
    });

    const mapActividad = (a) => ({
      id: a.id,
      tipo: a.tipo,
      msg: a.descripcion,
      tiempo: formatTiempo(a.created_at),
      fecha: formatArgentinaDateTime(a.created_at),
      icon: {
        enviado:'send', apertura:'eye', clic:'click', nuevo:'user', nuevo_contacto:'user', contacto_eliminado:'trash', contacto_actualizado:'edit',
        email_borrador:'emails', email_programado:'calendar', email_archivado:'archive', email_eliminado:'trash'
      }[a.tipo] || 'activity',
    });

    async function fetchRest(table, query = 'select=*') {
      const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
      const res = await fetch(url, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${table}: ${res.status} ${txt}`);
      }
      return await res.json();
    }

    function mergeContacts(baseContacts, realContacts) {
      const map = new Map();
      const put = (row, source) => {
        if (!row || !row.email) return;
        const email = String(row.email).trim().toLowerCase();
        if (!email) return;
        const prev = map.get(email) || {};
        map.set(email, { ...prev, ...row, email, source });
      };
      (baseContacts || []).forEach(c => put(c, 'base'));
      (realContacts || []).forEach(c => put(c, 'supabase'));
      return Array.from(map.values()).sort((a, b) => {
        const da = new Date(a.created_at || a.ingreso || 0).getTime();
        const db = new Date(b.created_at || b.ingreso || 0).getTime();
        return db - da;
      });
    }


    const mapRespuesta = (r) => ({
      id: r.id,
      from_email: r.from_email || '',
      from_name: r.from_name || '',
      to_email: r.to_email || '',
      subject: r.subject || '(sin asunto)',
      text_body: r.text_body || '',
      html_body: r.html_body || '',
      message_id: r.message_id || '',
      resend_email_id: r.resend_email_id || '',
      leido: Boolean(r.leido),
      created_at: r.created_at,
      fecha: r.created_at ? formatArgentinaDateTime(r.created_at) : '-',
      tiempo: r.created_at ? formatTiempo(r.created_at) : '',
    });

    async function loadData() {
      setLoading(true);
      try {
        let ctData = [];
        let emData = [];
        let acData = [];
        let rpData = [];
        let enviosMesCount = 0;
        let modo = 'Supabase';

        // 1) Intento normal con supabase-js
        const ctRes = await db.from('contactos').select('id,nombre,email,tipo,estado,ingreso,created_at').order('created_at', { ascending: false });
        if (ctRes.error) throw ctRes.error;
        ctData = ctRes.data || [];

        // 2) Si por algún motivo supabase-js vuelve vacío, pruebo REST directo.
        if (!ctData.length) {
          try {
            ctData = await fetchRest('contactos', 'select=id,nombre,email,tipo,estado,ingreso,created_at&order=created_at.desc');
            modo = 'Supabase REST';
          } catch (restErr) {
            console.error('Error REST contactos:', restErr);
          }
        }

        // 3) Emails y actividad: si están vacíos, se dejan vacíos. No hay datos falsos.
        try {
          const emRes = await db.from('emails').select('*').order('created_at', { ascending: false });
          if (!emRes.error) emData = emRes.data || [];
        } catch (_) {}

        try {
          const acRes = await db.from('actividad').select('*').order('created_at', { ascending: false }).limit(20);
          if (!acRes.error) acData = acRes.data || [];
        } catch (_) {}


        try {
          const rpRes = await db.from('email_respuestas').select('*').order('created_at', { ascending: false }).limit(100);
          if (!rpRes.error) rpData = rpRes.data || [];
        } catch (_) {}

        try {
          const now = new Date();
          const desde = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          const hasta = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
          const evRes = await db
            .from('envios')
            .select('id', { count:'exact', head:true })
            .gte('enviado_en', desde)
            .lt('enviado_en', hasta);
          if (!evRes.error && typeof evRes.count === 'number') enviosMesCount = evRes.count;
        } catch (_) {}

        // 4) Modo real: el panel muestra SOLO lo que existe en Supabase.
        // No hay respaldo local ni contactos inventados en pantalla.
        setContacts((ctData || []).map(mapContacto));
        setEmails(emData.map(mapEmail));
        setEnviadosMes(enviosMesCount);
        setRespuestas(rpData.map(mapRespuesta));
        setActividad(acData.map(mapActividad));

        setConnected(true);
        setConnectionMode('Online');
      } catch(e) {
        console.error('No se pudieron cargar datos reales:', e);
        setContacts([]);
        setEmails([]);
        setEnviadosMes(0);
        setRespuestas([]);
        setActividad([]);
        setConnected(false);
        setConnectionMode('Sin conexión');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  if (!user) return <Login onLogin={u => setUser(u)} />;

  function formatTiempo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 60) return `hace ${min} min`;
    const hs = Math.floor(min / 60);
    if (hs < 24) return `hace ${hs}h`;
    return `hace ${Math.floor(hs/24)} días`;
  }

  const toggleTheme = () => {
    setDark(d => {
      document.body.className = d ? 'light' : 'dark';
      return !d;
    });
  };

  const registerActivity = async (tipo, descripcion, metadata = {}) => {
    try {
      const { data, error } = await db
        .from('actividad')
        .insert({ tipo, descripcion, metadata })
        .select()
        .single();
      if (error) throw error;
      const item = {
        id: data.id,
        tipo: data.tipo,
        msg: data.descripcion,
        tiempo: 'recién',
        icon: {
          enviado:'send', apertura:'eye', clic:'click', nuevo:'user', nuevo_contacto:'user', contacto_eliminado:'trash', contacto_actualizado:'edit',
          email_borrador:'emails', email_programado:'calendar', email_archivado:'archive', email_eliminado:'trash'
        }[data.tipo] || 'activity',
      };
      setActividad(a => [item, ...a].slice(0, 50));
      return item;
    } catch (err) {
      console.error('No se pudo registrar actividad:', err);
      return null;
    }
  };

  const renderView = () => {
    switch(view) {
      case 'dashboard': return <Dashboard contacts={contacts} emails={emails} actividad={actividad} enviadosMes={enviadosMes} onOpenEmail={(id)=>{ setOpenEmailId(id); setView('redactar'); }} />;
      case 'contactos': return <Contactos contacts={contacts} setContacts={setContacts} onActivity={registerActivity} />;
      case 'respuestas': return <RespuestasView respuestas={respuestas} setRespuestas={setRespuestas} />;
      case 'enviados': return <EmailsView emails={emails} setEmails={setEmails} contacts={contacts} onActivity={registerActivity} openEmailId={openEmailId} mode="enviados" />;
      case 'redactar': return <EmailsView emails={emails} setEmails={setEmails} contacts={contacts} onActivity={registerActivity} openEmailId={openEmailId} mode="redactar" />;
      case 'actividad': return <ActividadView actividad={actividad} />;
      case 'config':    return <ConfigView dark={dark} contacts={contacts} />;
      default:          return null;
    }
  };

  const navColor    = idx => view===NAV[idx].id ? 'var(--gold)' : 'var(--muted)';
  const navIconCol  = idx => view===NAV[idx].id ? 'var(--gold)' : 'rgba(150,140,130,0.7)';

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>

      {/* ── Sidebar ── */}
      <div style={{ width:210, backgroundColor:'var(--sidebar-bg)', backgroundImage:'none', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', flexShrink:0, overflow:'hidden', isolation:'isolate' }}>

        {/* Logo block */}
        <div style={{ padding:'18px 16px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10, backgroundColor:'var(--sidebar-bg)', backgroundImage:'none' }}>
          <img src="uploads/favicon.png" alt="Seminario Cripto" style={{ width:32, height:32, objectFit:'contain', flexShrink:0 }} />
          <div>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.06em', color:'var(--gold)', textTransform:'uppercase', lineHeight:1.2 }}>Seminario Cripto</div>
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>CRM Seminario Cripto</div>
          </div>
        </div>
        {/* Nav */}
        <nav style={{ flex:1, padding:'10px 8px', backgroundColor:'var(--sidebar-bg)', backgroundImage:'none' }}>
          {NAV.map((item,idx) => (
            <button key={item.id} onClick={()=>setView(item.id)} style={{
              display:'flex', alignItems:'center', gap:10, width:'100%',
              padding:'9px 12px', borderRadius:8, border:'none', cursor:'pointer',
              fontFamily:'DM Sans, sans-serif', textAlign:'left', transition:'all 0.12s', marginBottom:2,
              backgroundColor: view===item.id ? 'var(--gold-dim)' : 'transparent', backgroundImage:'none',
              color:       view===item.id ? 'var(--gold)'    : 'var(--muted)',
              fontSize:13, fontWeight: view===item.id ? 600 : 400,
            }}
            onMouseEnter={e=>{ if(view!==item.id) e.currentTarget.style.backgroundColor='var(--hover)'; }}
            onMouseLeave={e=>{ if(view!==item.id) e.currentTarget.style.backgroundColor='transparent'; }}>
              <Icon name={item.icon} size={14} color={view===item.id?'var(--gold)':'var(--muted)'} />
              {item.label}
            </button>
          ))}
        
          <a href={INGRESOS_APP_URL} style={{
            display:'flex', alignItems:'center', gap:10, width:'100%',
            padding:'9px 12px', borderRadius:8, border:'none', cursor:'pointer',
            fontFamily:'DM Sans, sans-serif', textAlign:'left', transition:'all 0.12s', marginBottom:2,
            backgroundColor:'transparent', backgroundImage:'none',
            color:'var(--muted)', fontSize:13, fontWeight:400, textDecoration:'none'
          }}>Software ingresos</a>
</nav>

        {/* Theme toggle + status + user */}
        <div style={{ padding:'12px 14px', borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:10, backgroundColor:'var(--sidebar-bg)', backgroundImage:'none' }}>
          {/* User info */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{
                width:26, height:26, borderRadius:'50%', background:'var(--gold-dim)',
                border:'1.5px solid var(--gold)', display:'flex', alignItems:'center',
                justifyContent:'center', fontSize:11, fontWeight:700, color:'var(--gold)', flexShrink:0
              }}>{user.nombre[0]}</div>
              <div style={{ fontSize:11, fontWeight:500, color:'var(--text)' }}>{user.nombre}</div>
            </div>
            <button onClick={() => setUser(null)} style={{
              background:'none', border:'none', color:'var(--muted)', cursor:'pointer',
              fontSize:10, fontFamily:'DM Sans, sans-serif', padding:'3px 6px',
              borderRadius:5, transition:'color 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
            >Salir</button>
          </div>

          {/* Dark/Light toggle */}
          <button onClick={toggleTheme} style={{
            display:'flex', alignItems:'center', gap:8, width:'100%',
            background:'var(--hover)', border:'1px solid var(--border)', borderRadius:8,
            padding:'8px 12px', cursor:'pointer', fontFamily:'DM Sans, sans-serif',
            color:'var(--muted)', fontSize:12, fontWeight:500, transition:'all 0.15s'
          }}
          onMouseEnter={e=>e.currentTarget.style.borderColor='var(--gold)'}
          onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
            <Icon name={dark?'sun':'moon'} size={13} color="var(--gold)" />
            {dark ? 'Modo claro' : 'Modo oscuro'}
          </button>

          {/* Connection status */}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background: connected ? 'var(--green)' : 'var(--gold)', opacity: connected ? 1 : 0.5, flexShrink:0 }}></div>
            <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.4 }}>{connectionMode}</div>
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        {renderView()}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
</body>
</html>

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
