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

// ─── CSS responsivo global ────────────────────────────────────────────────────
const MOBILE_CSS = `
  *{box-sizing:border-box;}
  html{scroll-behavior:smooth;}
  body{margin:0;background:#f3f0ea;}
  button,input,select,textarea{font-family:inherit;}
  button{transition:transform .16s ease, box-shadow .16s ease, background .16s ease, border-color .16s ease, opacity .16s ease, color .16s ease;}
  button:not(:disabled):hover{transform:translateY(-1px);}
  button:disabled{cursor:not-allowed;opacity:.55;}
  input,select,textarea{transition:border-color .16s ease, box-shadow .16s ease, background .16s ease;}
  input:focus,select:focus,textarea:focus{box-shadow:0 0 0 4px rgba(178,124,24,.13)!important;border-color:#b27c18!important;}
  table tbody tr{transition:background .14s ease, box-shadow .14s ease;}
  table tbody tr:hover{background:rgba(17,24,39,.025);}
  ::selection{background:rgba(178,124,24,.24);}
  ::-webkit-scrollbar{width:10px;height:10px;}
  ::-webkit-scrollbar-track{background:transparent;}
  ::-webkit-scrollbar-thumb{background:rgba(100,116,139,.32);border-radius:999px;border:2px solid transparent;background-clip:content-box;}
  ::-webkit-scrollbar-thumb:hover{background:rgba(178,124,24,.52);border:2px solid transparent;background-clip:content-box;}
  .sc-app-shell{background-image:linear-gradient(180deg,#f5f2ed 0%,#eee9e1 100%);}
  .sc-dark{background-image:linear-gradient(180deg,#0b1220 0%,#070b13 100%);}
  .sc-topbar{position:relative;z-index:1;background:rgba(255,255,255,.82);border:1px solid rgba(226,221,215,.95);box-shadow:0 10px 28px rgba(16,24,40,.055);backdrop-filter:blur(10px);}
  .sc-dark .sc-topbar{background:rgba(17,24,39,.82);border-color:#263754;box-shadow:0 12px 30px rgba(0,0,0,.26);}
  .sc-card-premium{transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease;}
  .sc-card-premium:hover{box-shadow:0 16px 38px rgba(16,24,40,.085);border-color:rgba(178,124,24,.34);}
  .sc-dark .sc-card-premium:hover{box-shadow:0 18px 42px rgba(0,0,0,.34);border-color:rgba(214,163,55,.34);}
  .sc-soft-card{background:rgba(255,255,255,.84);border:1px solid rgba(228,221,211,.95);box-shadow:0 14px 36px rgba(16,24,40,.06);}
  .sc-dark .sc-soft-card{background:rgba(17,24,39,.90);border-color:#263754;box-shadow:0 18px 42px rgba(0,0,0,.30);}
  .sc-section-title{letter-spacing:-.035em;}
  .sc-action-icon{width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;}
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
function dateOnly(ds){
  if(!ds)return null;
  return String(ds).slice(0,10);
}
function parseISODate(ds) {
  const d=dateOnly(ds);
  return d ? new Date(`${d}T12:00:00`) : null;
}
function formatDate(ds) {
  const d=dateOnly(ds);
  if (!d) return "-";
  return new Intl.DateTimeFormat("es-AR").format(new Date(`${d}T12:00:00`));
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
  const d=parseISODate(ds);
  if(!d||Number.isNaN(d.getTime()))return null;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function monthLabel(key) {
  const [y,m]=key.split("-");
  const raw=new Intl.DateTimeFormat("es-AR",{month:"long",year:"numeric"}).format(new Date(Number(y),Number(m)-1,1));
  return raw.charAt(0).toUpperCase()+raw.slice(1);
}
function isSameMonth(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth();}

function startOfWeekMonday(date){
  const d=new Date(date.getFullYear(),date.getMonth(),date.getDate(),12,0,0);
  const day=d.getDay();
  const diff=(day===0?-6:1-day);
  d.setDate(d.getDate()+diff);
  return d;
}
function endOfWeekMonday(date){
  const d=startOfWeekMonday(date);
  d.setDate(d.getDate()+6);
  return d;
}
function weekKeyFromDate(date){return toISODate(startOfWeekMonday(date));}
function weekLabelFromStart(startISO){
  const s=parseISODate(startISO);
  if(!s)return "-";
  const e=new Date(s);e.setDate(e.getDate()+6);
  return `${formatDate(toISODate(s))} al ${formatDate(toISODate(e))}`;
}
function weekDayLabel(ds){
  const d=parseISODate(ds);
  if(!d)return "-";
  const raw=new Intl.DateTimeFormat("es-AR",{weekday:"short",day:"2-digit",month:"2-digit"}).format(d);
  return raw.charAt(0).toUpperCase()+raw.slice(1);
}

// ─── Negocio ──────────────────────────────────────────────────────────────────
const GRACE_DAYS=3, WARN_DAYS=2;
const INICIO_INGRESOS_HISTORICOS="2026-03";
const PAGE={base:10,venc:10,deud:3,clases:3,ing:10,crit:3,hist:15,dorm:10,caja:10};

function safeNum(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function money(v){return `USD ${safeNum(v)}`;}

function normCajaText(v){
  return String(v||"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .trim()
    .toLowerCase();
}

function normalizeServicio(v){
  const raw=String(v||"").trim().toLowerCase();
  if(raw==="mensual"||raw==="plan trader"||raw==="trader")return "mensual";
  if(raw==="anual"||raw==="plan inversor"||raw==="inversor")return "anual";
  if(raw==="clases"||raw==="clase")return "clases";
  return raw||"mensual";
}
function svcLabel(v){
  const s=normalizeServicio(v);
  if(s==="mensual") return "Plan trader";
  if(s==="anual")   return "Plan inversor";
  return "Clases";
}
function svcAmount(v){return normalizeServicio(v)==="mensual"?35:350;}
function svcDuration(v){const s=normalizeServicio(v);return s==="mensual"?30:s==="anual"?365:0;}
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
  const servicio=normalizeServicio(c.servicio);
  const cNorm={...c,servicio};
  const isClases=servicio==="clases";
  const vencimiento=resolveDueDate(c);
  let estadoSistema="activo",dias=null;
  if(isClases){estadoSistema=cNorm.estado_manual==="finalizado"?"finalizado":"clases";}
  else if(cNorm.estado_manual==="sacar"){estadoSistema="sacar";}
  else if(vencimiento){
    const due=parseISODate(vencimiento);
    dias=diffDays(today,due);
    if(today>due){const ov=diffDays(due,today);estadoSistema=ov<=GRACE_DAYS?"gracia":"vencido";}
  }
  return{...cNorm,isClases,vencimiento,dias,duracion_dias:safeNum(cNorm.duracion_dias),estadoSistema,
    class_range_label:isClases?classRangeLabel(cNorm.fecha_inicio):null,
    class_end_date:isClases&&cNorm.fecha_inicio?toISODate(addDays(cNorm.fecha_inicio,27)):null};
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
    const servicio=normalizeServicio(i.servicio);
    if(row[servicio]!==undefined)row[servicio]+=m;
  });
  return rows;
}
function buildBreakdown(arr){
  const b={mensual:0,anual:0,clases:0};
  arr.forEach(i=>{const servicio=normalizeServicio(i.servicio);if(b[servicio]!==undefined)b[servicio]+=safeNum(i.monto);});
  return b;
}
function esIngresoHistorico(i){
  const key=monthKey(i?.fecha_pago);
  return !!key&&key>=INICIO_INGRESOS_HISTORICOS;
}
function totalIngresosHistoricosPorMes(ingresos){
  const meses=new Map();
  ingresos.forEach(i=>{
    if(!esIngresoHistorico(i))return;
    const key=monthKey(i.fecha_pago);
    meses.set(key,(meses.get(key)||0)+safeNum(i.monto));
  });
  return Array.from(meses.values()).reduce((a,v)=>a+v,0);
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
    const { data } = await supabase.from("notas_cliente").insert([{
      cliente_id: clienteId,
      usuario_email: userEmail||"—",
      tipo,
      contenido: contenido||"",
      detalle: detalle||null,
    }]).select().single();
    return data||null;
  }catch(_){return null;}
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

const VENDEDORES = ["Bahiano", "Luigi"];
const vendedorPermitido = v => VENDEDORES.includes(v) ? v : "";
const FORM_DEF={nombre:"",email:"",telefono:"",servicio:"mensual",fecha_inicio:toISODate(getToday()),monto:35,duracion_dias:30,estado_manual:"activo",deuda_restante:0,notas:"",vendedor:"",transferido:true};

// ─── Tema premium ─────────────────────────────────────────────────────────────
function getT(dark){
  return{
    bg:               dark?"#0b1220":"#f2eee7",
    surface:          dark?"#111827":"#ffffff",
    cardBg:           dark?"#111827":"#fffdf9",
    cardBorder:       dark?"#263754":"#e3dbce",
    cardShadow:       dark?"0 18px 44px rgba(0,0,0,.30)":"0 14px 36px rgba(16,24,40,.060)",
    text:             dark?"#f7f9fc":"#0f172a",
    textMuted:        dark?"#9aa7bd":"#64748b",
    accent:           "#b27c18",
    accentSoft:       dark?"rgba(214,163,55,.13)":"#fbf3df",
    accentBorder:     dark?"rgba(214,163,55,.35)":"#e6cf9d",
    accentGrad:       "linear-gradient(135deg,#d9a43a 0%,#b27c18 100%)",
    navyGrad:         dark?"linear-gradient(135deg,#d9a43a 0%,#b27c18 100%)":"linear-gradient(135deg,#0f172a 0%,#1e293b 100%)",
    inputBg:          dark?"#0b1220":"#fffefa",
    inputBorder:      dark?"#30405c":"#d8d0c4",
    inputText:        dark?"#f7f9fc":"#0f172a",
    thBg:             dark?"#0b1220":"#f7f3ed",
    tdBorder:         dark?"#22304a":"#ece4d9",
    btnDkBg:          dark?"#d9a43a":"#0f172a",
    btnDkTx:          dark?"#0f172a":"#fff",
    btnLtBg:          dark?"#151f31":"#fffefa",
    btnLtTx:          dark?"#d8e0ef":"#334155",
    navActBg:         dark?"#d9a43a":"#0f172a",
    navActTx:         dark?"#0f172a":"#fff",
    navInBg:          dark?"#111827":"#fffefa",
    navInTx:          dark?"#d8e0ef":"#334155",
    navInBr:          dark?"#30405c":"#ded5c8",
    barBg:            dark?"#1a263a":"#e8e0d4",
    success:          "#079455",
    danger:           "#d92d20",
    warning:          "#dc8a00",
    dark,
  };
}
function makeS(t){
  return{
    card: {background:t.cardBg,borderRadius:22,padding:26,boxShadow:t.cardShadow,border:`1px solid ${t.cardBorder}`},
    input:{width:"100%",padding:"12px 14px",borderRadius:13,border:`1px solid ${t.inputBorder}`,fontSize:14,outline:"none",boxSizing:"border-box",background:t.inputBg,color:t.inputText,boxShadow:"inset 0 1px 0 rgba(255,255,255,.35)"},
    label:{display:"block",fontSize:10.5,fontWeight:850,color:t.textMuted,marginBottom:7,letterSpacing:"0.08em",textTransform:"uppercase"},
    table:{width:"100%",borderCollapse:"separate",borderSpacing:0,fontSize:14},
    td:   {padding:"14px 16px",borderBottom:`1px solid ${t.tdBorder}`,color:t.text,verticalAlign:"middle"},
    thRow:{background:t.thBg},
  };
}
function makeBtn(t){
  return function btn(dark=false,gold=false){
    if(gold)return{padding:"11px 20px",borderRadius:13,border:`1px solid ${t.dark?"rgba(255,255,255,.08)":"rgba(178,124,24,.22)"}`,cursor:"pointer",fontWeight:850,fontSize:14,background:t.accentGrad,color:"#0f172a",boxShadow:t.dark?"0 12px 28px rgba(0,0,0,.24)":"0 10px 24px rgba(178,124,24,.20)"};
    return{padding:"10px 16px",borderRadius:13,border:`1px solid ${dark?"transparent":t.navInBr}`,cursor:"pointer",fontWeight:760,fontSize:14,background:dark?t.navyGrad:t.btnLtBg,color:dark?t.btnDkTx:t.btnLtTx,boxShadow:dark?(t.dark?"0 12px 28px rgba(0,0,0,.24)":"0 10px 24px rgba(15,23,42,.12)"):"0 1px 0 rgba(255,255,255,.5)"};
  };
}

function useSafeBackdropClose(onClose, enabled=true){
  const backdropMouseDown=useRef(null);
  const onBackdropMouseDown=useCallback((e)=>{
    if(!enabled||e.button!==0)return;
    backdropMouseDown.current=e.target===e.currentTarget?{x:e.clientX,y:e.clientY}:null;
  },[enabled]);
  const onBackdropMouseUp=useCallback((e)=>{
    const start=backdropMouseDown.current;
    const moved=start&&(Math.abs(e.clientX-start.x)>4||Math.abs(e.clientY-start.y)>4);
    const selected=typeof window!=="undefined"&&window.getSelection&&String(window.getSelection()||"").length>0;
    if(enabled&&e.target===e.currentTarget&&start&&!moved&&!selected)onClose?.();
    backdropMouseDown.current=null;
  },[enabled,onClose]);
  const cancelBackdrop=useCallback((e)=>{
    backdropMouseDown.current=null;
    e.stopPropagation();
  },[]);
  return {
    backdropProps:{onMouseDown:onBackdropMouseDown,onMouseUp:onBackdropMouseUp,onClick:e=>e.stopPropagation()},
    modalProps:{onMouseDown:cancelBackdrop,onMouseUp:e=>e.stopPropagation(),onClick:e=>e.stopPropagation()}
  };
}

function makeNavBtn(t){
  return function navBtn(active){
    return{padding:"10px 17px",borderRadius:13,cursor:"pointer",fontWeight:820,fontSize:14,
      border:active?"1px solid transparent":`1px solid ${t.navInBr}`,
      background:active?t.navyGrad:t.navInBg,color:active?t.navActTx:t.navInTx,
      boxShadow:active?(t.dark?"0 12px 26px rgba(0,0,0,.26)":"0 9px 22px rgba(15,23,42,.12)"):"0 1px 0 rgba(255,255,255,.52)"};
  };
}
function badgeStyle(status){
  const b={display:"inline-flex",alignItems:"center",padding:"4px 10px",borderRadius:999,fontSize:10.5,fontWeight:850,letterSpacing:"0.055em",border:"1px solid transparent",textTransform:"uppercase"};
  if(status==="activo")  return{...b,background:"#ecfdf3",color:"#067647",borderColor:"#abefc6"};
  if(status==="gracia")  return{...b,background:"#fffaeb",color:"#b54708",borderColor:"#fedf89"};
  if(status==="vencido") return{...b,background:"#fef3f2",color:"#b42318",borderColor:"#fecdca"};
  if(status==="clases")  return{...b,background:"#f4f3ff",color:"#5925dc",borderColor:"#d9d6fe"};
  if(status==="finalizado") return{...b,background:"#f2f4f7",color:"#344054",borderColor:"#d0d5dd"};
  if(status==="sacar")   return{...b,background:"#fef3f2",color:"#b42318",borderColor:"#fecdca"};
  return{...b,background:"#f8fafc",color:"#334155",borderColor:"#d0d5dd"};
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
function ConfirmModal({open,title,message,confirmLabel="Confirmar",danger=false,onConfirm,onCancel,t,children,closeOnBackdrop=true}){
  const backdropMouseDown=useRef(null);
  useEffect(()=>{
    if(!open)return;
    const onKey=e=>{if(e.key==="Escape")onCancel?.();};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[open,onCancel]);
  if(!open)return null;
  const btn=makeBtn(t);
  const startBackdrop=e=>{
    if(e.button!==0)return;
    backdropMouseDown.current=e.target===e.currentTarget?{x:e.clientX,y:e.clientY}:null;
  };
  const endBackdrop=e=>{
    const start=backdropMouseDown.current;
    const moved=start&&(Math.abs(e.clientX-start.x)>4||Math.abs(e.clientY-start.y)>4);
    const selected=typeof window!=="undefined"&&window.getSelection&&String(window.getSelection()||"").length>0;
    if(closeOnBackdrop&&e.target===e.currentTarget&&start&&!moved&&!selected)onCancel?.();
    backdropMouseDown.current=null;
  };
  const cancelBackdrop=e=>{backdropMouseDown.current=null;e.stopPropagation();};
  return(
    <div
      style={{position:"fixed",inset:0,background:"rgba(8,14,26,0.72)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,zIndex:2000}}
      onMouseDown={startBackdrop}
      onMouseUp={endBackdrop}
      onClick={e=>e.stopPropagation()}
    >
      <div onMouseDown={cancelBackdrop} onMouseUp={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} style={{background:t.cardBg,borderRadius:18,padding:36,border:`1px solid ${t.cardBorder}`,maxWidth:440,width:"100%",boxShadow:"0 32px 80px rgba(0,0,0,0.6)"}}>
        <h3 style={{margin:"0 0 12px",color:t.text,fontSize:19,fontWeight:900}}>{title}</h3>
        <p style={{margin:"0 0 20px",color:t.textMuted,fontSize:14,lineHeight:1.65}}>{message}</p>
        {children}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
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
  const {backdropProps,modalProps}=useSafeBackdropClose(onClose);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(8,14,26,0.72)",backdropFilter:"blur(4px)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"72px 24px",zIndex:3000}} {...backdropProps}>
      <div style={{background:t.cardBg,borderRadius:18,border:`1px solid ${t.cardBorder}`,width:"100%",maxWidth:560,boxShadow:"0 32px 80px rgba(0,0,0,0.6)",overflow:"hidden"}} {...modalProps}>
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
function ClienteDetailModal({cliente,ingresos,allClientes,userEmail,onClose,onAbrirRenovar,onEliminar,onNotaGuardada,onEditarDeuda,t}){
  if(!cliente)return null;
  const S=makeS(t);const btn=makeBtn(t);
  const {backdropProps,modalProps}=useSafeBackdropClose(onClose);
  const [nuevaNota,setNuevaNota]=useState("");
  const [sending,setSending]=useState(false);
  const [copiado,setCopiado]=useState(false);
  const [timeline,setTimeline]=useState([]);
  const [loadingTL,setLoadingTL]=useState(true);
  const [tlPage,setTlPage]=useState(1);
  useEffect(()=>{
    const onKey=e=>{if(e.key==="Escape")onClose?.();};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[onClose]);

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

  function clienteDeIngreso(i){
    return (allClientes||[]).find(c=>String(c.id)===String(i?.cliente_id))
      || mismoNombre.find(c=>c.email&&i?.email&&c.email.toLowerCase()===String(i.email).toLowerCase())
      || mismoNombre.find(c=>c.nombre?.trim().toLowerCase()===String(i?.cliente_nombre||"").trim().toLowerCase())
      || null;
  }
  function infoPago(i){
    const c=clienteDeIngreso(i);
    const notas=String(i?.notas||"");
    const cobroOriginal=(notas.match(/Cobró\s+(Cristian|Bahiano|Baiano|Luigi)/i)||[])[1]
      || (notas.match(/(?:recibe|recibió|recibio)\s*:?\s*(Cristian|Bahiano|Baiano|Luigi)/i)||[])[1]
      || i?.vendedor||i?.recibe||c?.vendedor||"Cristian";
    const recibe=cobroOriginal==="Baiano"?"Bahiano":cobroOriginal;
    const recibidoFinal=(notas.match(/Transferencia recibida por\s+(Cristian|Bahiano|Baiano)/i)||[])[1];
    const finalNormalizado=recibidoFinal==="Baiano"?"Bahiano":recibidoFinal;
    const directoRecibe=(()=>{const r=String(recibe||"").trim().toLowerCase(); if(!r||r==="cristian"||r==="christian")return "Cristian"; if(r==="bahiano"||r==="baiano"||r==="bahiana"||r==="baiana")return "Bahiano"; return null;})();
    const esPendiente=!!recibe&&!directoRecibe;
    const transferido=!!finalNormalizado || (!esPendiente && !!directoRecibe);
    const estadoTransferencia=esPendiente
      ? (finalNormalizado?`Transferencia recibida por ${finalNormalizado}`:"Pendiente de recepción")
      : `Cobrado por ${directoRecibe||recibe}`;
    return{vendedor:esPendiente?recibe:"",recibe,transferido,estadoTransferencia,recibeFinal:finalNormalizado||directoRecibe||recibe};
  }
  function receptorPago(i){
    const info=infoPago(i);
    return `Quién se quedó con la venta: ${info.recibe} · ${info.estadoTransferencia}`;
  }
  function notasPagoLegibles(notas){
    const txt=String(notas||"")
      .replace(/pendiente_transferencia\s*:\s*true/gi,"Pendiente de recepción")
      .replace(/pendiente_transferencia\s*:\s*false/gi,"Cobrado")
      .replace(/recibe\s*:\s*/gi,"Cobró ")
      .replace(/recibio\s*:\s*/gi,"Cobró ")
      .replace(/recibió\s*:\s*/gi,"Cobró ")
      .replace(/_/g," ")
      .replace(/\s*·\s*/g," · ")
      .trim();
    return txt||"—";
  }
  const timelineCompleto=useMemo(()=>{
    const notas=(timeline||[]).map(n=>({...n,__kind:"nota"}));
    const notasTransferencia=new Set(
      notas
        .filter(n=>String(n.contenido||"").toLowerCase().includes("cristian recibió transferencia"))
        .map(n=>`${n.detalle?.vendedor||""}|${n.detalle?.monto||""}`)
    );
    const pagos=(pagosTotales||[]).flatMap(i=>{
      const info=infoPago(i);
      const base={
        id:`pago-${i.id}`,
        created_at:i.fecha_pago||i.created_at||new Date().toISOString(),
        usuario_email:i.usuario_email||"Sistema",
        tipo:"pago",
        contenido:`Pago registrado. Servicio: ${svcLabel(i.servicio)} · Monto: USD ${safeNum(i.monto)} · Quién se quedó con la venta: ${info.recibe} · ${info.estadoTransferencia}`,
        detalle:{
          ingreso_id:i.id,
          servicio:svcLabel(i.servicio),
          monto:safeNum(i.monto),
          recibio_venta:info.recibe,
          transferencia_a_cristian:info.estadoTransferencia
        },
        __kind:"pago"
      };
      const rows=[base];
      const key=`${info.vendedor||""}|${safeNum(i.monto)}`;
      if(info.vendedor&&info.transferido&&!notasTransferencia.has(key)){
        rows.push({
          id:`transferencia-${i.id}`,
          created_at:i.fecha_transferencia||i.updated_at||i.fecha_pago||i.created_at||new Date().toISOString(),
          usuario_email:i.usuario_email||"Sistema",
          tipo:"pago",
          contenido:`${info.recibeFinal||"Cristian"} recibió transferencia de ${info.vendedor}. Venta: ${i.cliente_nombre||cliente.nombre} · Monto: USD ${safeNum(i.monto)}`,
          detalle:{ingreso_id:i.id,vendedor:info.vendedor,recibe_final:info.recibeFinal||"Cristian",monto:safeNum(i.monto)},
          __kind:"transferencia"
        });
      }
      return rows;
    });
    return [...notas,...pagos].sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
  },[timeline,pagosTotales,allClientes,mismoNombre]);
  const tlTotal=Math.max(1,Math.ceil(timelineCompleto.length/TL_PAGE));
  const tlRows=useMemo(()=>{const s=(tlPage-1)*TL_PAGE;return timelineCompleto.slice(s,s+TL_PAGE);},[timelineCompleto,tlPage]);

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
    <div style={{position:"fixed",inset:0,background:"rgba(8,14,26,0.74)",backdropFilter:"blur(4px)",zIndex:1500,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"24px 16px",overflowY:"auto"}} {...backdropProps}>
      <div {...modalProps} style={{background:t.cardBg,borderRadius:20,border:`1px solid ${t.cardBorder}`,maxWidth:680,width:"100%",boxShadow:"0 32px 80px rgba(0,0,0,0.6)",marginTop:8,marginBottom:24,display:"flex",flexDirection:"column"}}>

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

          {/* Servicios activos — solo planes con vencimiento: Plan trader / Plan inversor */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:t.textMuted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>Servicios activos</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {mismoNombre.filter(c=>["mensual","anual"].includes(normalizeServicio(c.servicio))).map(c=>(
                <div key={c.id} style={{padding:"8px 14px",borderRadius:10,background:t.dark?"#0d1526":"#f8f6f3",border:`1px solid ${t.cardBorder}`,fontSize:13}}>
                  <span style={{fontWeight:700,color:t.accent}}>{svcLabel(c.servicio)}</span>
                  <span style={{color:t.textMuted,marginLeft:8}}>{c.vencimiento?`vence ${formatDate(c.vencimiento)}`:""}</span>
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
              {timelineCompleto.length>0&&<span style={{color:t.textMuted,fontSize:12}}>{timelineCompleto.length} registro{timelineCompleto.length!==1?"s":""}</span>}
            </div>
            {loadingTL?(
              <div style={{color:t.textMuted,fontSize:13}}>Cargando...</div>
            ):timelineCompleto.length===0?(
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
                  <thead><tr style={S.thRow}>{["Fecha","Servicio","Monto","Recibe / Estado","Notas"].map(h=>(
                    <th key={h} style={{...S.td,fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:t.textMuted}}>{h}</th>
                  ))}</tr></thead>
                  <tbody>{pagosTotales.map(i=>(
                    <tr key={i.id}>
                      <td style={S.td}>{formatDate(i.fecha_pago)}</td>
                      <td style={S.td}>{svcLabel(i.servicio)}</td>
                      <td style={{...S.td,color:t.accent,fontWeight:700}}>{money(i.monto)}</td>
                      <td style={{...S.td,fontSize:12,color:t.textMuted}}>{receptorPago(i)}</td>
                      <td style={S.td}>{notasPagoLegibles(i.notas)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Acciones */}
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",paddingTop:4,flexWrap:"wrap"}}>
            <button style={btn(false)} onClick={()=>onEditarDeuda&&onEditarDeuda(cliente)}>Editar deuda</button>
            <button style={btn(false)} onClick={()=>{onClose();onAbrirRenovar(cliente);}}>Renovar</button>
            <button style={{...btn(false),background:"rgba(239,68,68,0.1)",color:"#ef4444"}} onClick={()=>onEliminar(cliente)}>Eliminar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
// ─── DeudaModal ───────────────────────────────────────────────────────────────
function DeudaModal({cliente,onClose,onConfirm,t}){
  const S=makeS(t);const btn=makeBtn(t);
  const [monto,setMonto]=useState(String(safeNum(cliente?.deuda_restante)||""));
  const montoN=Math.max(0,safeNum(monto));
  const backdropMouseDown=useRef(null);
  useEffect(()=>{
    if(!cliente)return;
    const onKey=e=>{if(e.key==="Escape")onClose?.();};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[cliente,onClose]);
  if(!cliente)return null;
  const startBackdrop=e=>{if(e.button===0&&e.target===e.currentTarget)backdropMouseDown.current={x:e.clientX,y:e.clientY};else backdropMouseDown.current=null;};
  const endBackdrop=e=>{
    const start=backdropMouseDown.current;
    const moved=start&&(Math.abs(e.clientX-start.x)>4||Math.abs(e.clientY-start.y)>4);
    const selected=typeof window!=="undefined"&&window.getSelection&&String(window.getSelection()||"").length>0;
    if(e.target===e.currentTarget&&start&&!moved&&!selected)onClose?.();
    backdropMouseDown.current=null;
  };
  const cancelBackdrop=e=>{backdropMouseDown.current=null;e.stopPropagation();};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(8,14,26,0.72)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,zIndex:2100}} onMouseDown={startBackdrop} onMouseUp={endBackdrop} onClick={e=>e.stopPropagation()}>
      <div style={{background:t.cardBg,borderRadius:18,padding:32,border:`1px solid ${t.cardBorder}`,maxWidth:430,width:"100%",boxShadow:"0 32px 80px rgba(0,0,0,0.6)"}} onMouseDown={cancelBackdrop} onMouseUp={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
        <h3 style={{margin:"0 0 4px",color:t.text,fontSize:18,fontWeight:800}}>Editar deuda</h3>
        <p style={{margin:"0 0 20px",color:t.textMuted,fontSize:13}}>
          <strong style={{color:t.text}}>{cliente.nombre}</strong> · Esto no renueva, no crea ingreso y no cambia vencimiento.
        </p>
        <div style={{marginBottom:14}}>
          <label style={S.label}>Deuda pendiente (USD)</label>
          <input type="number" style={S.input} placeholder="0" min="0" value={monto}
            onChange={e=>setMonto(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&onConfirm(cliente,montoN)}
            autoFocus/>
        </div>
        <div style={{marginBottom:20,padding:"10px 14px",borderRadius:10,background:t.dark?"#0d1526":"#f8f6f3",fontSize:13,color:t.textMuted,lineHeight:1.45}}>
          Si ponés un monto mayor a cero, aparece en <strong style={{color:t.text}}>Deudores</strong> y en la ficha del cliente.
          Si ponés 0, sale de deudores.
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button style={btn(false)} onClick={onClose}>Cancelar</button>
          <button style={btn(false,true)} onClick={()=>onConfirm(cliente,montoN)}>Guardar deuda</button>
        </div>
      </div>
    </div>
  );
}

// ─── PagoModal ────────────────────────────────────────────────────────────────
function PagoModal({cliente,onClose,onConfirm,t}){
  const S=makeS(t);const btn=makeBtn(t);
  const [monto,setMonto]=useState("");
  const [recibe,setRecibe]=useState("Cristian");
  const backdropMouseDown=useRef(null);
  useEffect(()=>{
    if(!cliente)return;
    const onKey=e=>{if(e.key==="Escape")onClose?.();};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[cliente,onClose]);
  if(!cliente)return null;
  const deuda=safeNum(cliente.deuda_restante);
  const montoN=Number(monto)||0;
  const restante=Math.max(0,deuda-montoN);
  const puedeGuardar=montoN>0&&montoN<=deuda&&!!recibe;
  const startBackdrop=e=>{if(e.button===0&&e.target===e.currentTarget)backdropMouseDown.current={x:e.clientX,y:e.clientY};else backdropMouseDown.current=null;};
  const endBackdrop=e=>{
    const start=backdropMouseDown.current;
    const moved=start&&(Math.abs(e.clientX-start.x)>4||Math.abs(e.clientY-start.y)>4);
    const selected=typeof window!=="undefined"&&window.getSelection&&String(window.getSelection()||"").length>0;
    if(e.target===e.currentTarget&&start&&!moved&&!selected)onClose?.();
    backdropMouseDown.current=null;
  };
  const cancelBackdrop=e=>{backdropMouseDown.current=null;e.stopPropagation();};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(8,14,26,0.72)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,zIndex:2000}} onMouseDown={startBackdrop} onMouseUp={endBackdrop} onClick={e=>e.stopPropagation()}>
      <div style={{background:t.cardBg,borderRadius:18,padding:32,border:`1px solid ${t.cardBorder}`,maxWidth:430,width:"100%",boxShadow:"0 32px 80px rgba(0,0,0,0.6)"}} onMouseDown={cancelBackdrop} onMouseUp={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
        <h3 style={{margin:"0 0 4px",color:t.text,fontSize:18,fontWeight:800}}>Registrar pago de deuda</h3>
        <p style={{margin:"0 0 20px",color:t.textMuted,fontSize:13}}>
          <strong style={{color:t.text}}>{cliente.nombre}</strong> · Deuda total: <strong style={{color:"#ef4444"}}>USD {deuda}</strong>
        </p>
        <div style={{marginBottom:12}}>
          <label style={S.label}>Monto a abonar hoy ({formatDate(toISODate(getToday()))}) (USD)</label>
          <input type="number" style={S.input} placeholder="0" min="1" max={deuda} value={monto}
            onChange={e=>setMonto(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&puedeGuardar&&onConfirm(cliente,montoN,recibe)} />
        </div>
        <div style={{marginBottom:12}}>
          <label style={S.label}>Recibe el pago</label>
          <select style={S.input} value={recibe} onChange={e=>setRecibe(e.target.value)}>
            <option value="Cristian">Cristian</option>
            <option value="Bahiano">Bahiano</option>
            <option value="Luigi">Luigi</option>
          </select>
        </div>
        {montoN>0&&montoN<=deuda&&(
          <div style={{marginBottom:20,padding:"10px 14px",borderRadius:10,background:t.dark?"#0d1526":"#f8f6f3",fontSize:13,color:t.textMuted,lineHeight:1.45}}>
            Deuda restante después del pago: <strong style={{color:restante===0?"#22c55e":"#ef4444"}}>USD {restante}</strong>
            {restante===0&&<span style={{color:"#22c55e",marginLeft:8,fontWeight:700}}>✓ Deuda cancelada</span>}
            <br/>
            {recibe==="Luigi"?"Queda pendiente de recepción hasta marcarlo recibido.":`Entra a Caja de ${recibe} al registrarlo.`}
          </div>
        )}
        {montoN>deuda&&deuda>0&&(
          <div style={{marginBottom:20,padding:"10px 14px",borderRadius:10,background:"rgba(239,68,68,0.1)",fontSize:13,color:"#ef4444"}}>
            El monto supera la deuda actual de USD {deuda}
          </div>
        )}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button style={btn(false)} onClick={onClose}>Cancelar</button>
          <button style={{...btn(false,true),opacity:!puedeGuardar?0.5:1}} disabled={!puedeGuardar}
            onClick={()=>onConfirm(cliente,montoN,recibe)}>
            Registrar pago
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
      {cols.map((h,idx)=>(<th key={h} style={{textAlign:"left",...S.td,color:t.textMuted,fontWeight:850,fontSize:10.5,letterSpacing:"0.085em",textTransform:"uppercase",borderTop:idx===0?`1px solid ${t.tdBorder}`:undefined,background:t.thBg}}>{h}</th>))}
    </tr>
  );
}

function MetricCard({title,value,sub,accent,trend,subValue,t}){
  const S=makeS(t);
  return(
    <div className="sc-card-premium" style={{...S.card,position:"relative",overflow:"hidden",minHeight:124,padding:"22px 24px",borderLeft:accent?`4px solid ${t.accent}`:`1px solid ${t.cardBorder}`,display:"flex",flexDirection:"column",justifyContent:"center"}}>
      <div style={{fontSize:10.5,color:t.textMuted,marginBottom:11,fontWeight:850,letterSpacing:"0.085em",textTransform:"uppercase"}}>{title}</div>
      <div style={{fontSize:28,fontWeight:900,color:accent?t.accent:t.text,letterSpacing:"-0.045em",display:"flex",alignItems:"baseline",gap:8,lineHeight:1.05}}>
        {value}
        {trend!=null&&<span style={{fontSize:12,fontWeight:850,color:trend>0?t.success:trend<0?t.danger:t.textMuted}}>{trend>0?"↑":trend<0?"↓":"→"} {Math.abs(trend)}%</span>}
      </div>
      {subValue!=null&&<div style={{marginTop:8,fontSize:13,color:t.textMuted,fontWeight:650}}>{subValue}</div>}
      {sub&&<div style={{marginTop:8,fontSize:12.5,color:t.textMuted,lineHeight:1.35}}>{sub}</div>}
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
  const {backdropProps,modalProps}=useSafeBackdropClose(onCancelar,isModal);
  const isClases=form.servicio==="clases";
  useEffect(()=>{
    if(!isModal)return;
    const onKey=e=>{if(e.key==="Escape")onCancelar?.();};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[isModal,onCancelar]);
  const inner=(
    <div className="sc-card-premium" style={{width:"100%",maxWidth:isModal?860:undefined,background:t.cardBg,borderRadius:22,padding:30,boxShadow:isModal?(t.dark?"0 34px 90px rgba(0,0,0,.52)":"0 30px 76px rgba(15,23,42,.20)"):t.cardShadow,border:`1px solid ${t.cardBorder}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,paddingBottom:isModal?16:0,borderBottom:isModal?`1px solid ${t.tdBorder}`:undefined}}>
        <div>
          <h3 style={{margin:0,color:t.text,fontSize:20,fontWeight:900,letterSpacing:"-0.03em"}}>{title}</h3>
          {subtitle&&<div style={{color:t.textMuted,fontSize:13,marginTop:4}}>{subtitle}</div>}
        </div>
        {isModal&&<button onClick={onCancelar} style={btn(false)}>Cerrar</button>}
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
        <Field label="Recibe la venta" t={t}>
          <select style={S.input} value={vendedorPermitido(form.vendedor)} onChange={e=>setForm({...form,vendedor:e.target.value,transferido:e.target.value===""})}>
            <option value="">Cristian</option>
            <option value="Bahiano">Bahiano</option>
            <option value="Luigi">Luigi</option>
          </select>
        </Field>
        <Field label="Deuda restante (USD)" t={t}>
          <input type="number" style={S.input} placeholder="0" value={form.deuda_restante} onChange={e=>setForm({...form,deuda_restante:e.target.value})}/>
        </Field>
        <Field label="Notas" spanAll t={t}>
          <input style={S.input} placeholder="Observaciones opcionales" value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})}/>
        </Field>
      </div>
      <div style={{marginTop:24,display:"flex",justifyContent:"flex-end",gap:10,paddingTop:18,borderTop:`1px solid ${t.tdBorder}`}}>
        {isModal&&<button onClick={onCancelar} style={btn(false)}>Cancelar</button>}
        <button style={btn(false,true)} onClick={onGuardar}>{guardando?"Guardando...":isModal?"Confirmar renovación":"Guardar cliente"}</button>
      </div>
    </div>
  );
  if(!isModal)return inner;
  return(
    <div
      style={{position:"fixed",inset:0,background:"rgba(8,14,26,0.72)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,zIndex:1000}}
      {...backdropProps}
    >
      <div {...modalProps}>{inner}</div>
    </div>
  );
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
    if(accion?.includes("caja"))return{...b,background:"#ecfeff",color:"#155e75",borderColor:"#67e8f9"};
    if(accion?.includes("renovó")||accion?.includes("renovación"))return{...b,background:"#ede9fe",color:"#5b21b6",borderColor:"#c4b5fd"};
    if(accion?.includes("guardó")||accion?.includes("nuevo"))return{...b,background:"#d1fae5",color:"#065f46",borderColor:"#6ee7b7"};
    if(accion?.includes("pago"))return{...b,background:"#fff7ed",color:"#9a3412",borderColor:"#fdba74"};
    return{...b,background:"#f1f5f9",color:"#334155",borderColor:"#cbd5e1"};
  }
  function histEntidad(h){
    if(String(h.entidad||"").toLowerCase()==="caja"||String(h.entidad||"").toLowerCase()==="caja diaria"||String(h.accion||"").toLowerCase().includes("caja"))return "Caja diaria";
    return h.detalle?.nombre||h.entidad||"-";
  }
  function histDetalle(h){
    const d=h.detalle||null;
    if(!d)return "—";
    if(histEntidad(h)==="Caja diaria"){
      const partes=[];
      if(d.fecha)partes.push(`Fecha: ${formatDate(d.fecha)}`);
      if(d.recibe)partes.push(`Recibió: ${d.recibe}`);
      if(d.monto!=null)partes.push(`Monto: USD ${d.monto}`);
      if(d.saldo_cancelado!=null)partes.push(`Saldo neteado: USD ${Math.abs(Number(d.saldo_cancelado||0))}`);
      if(d.cantidad!=null)partes.push(`Registros afectados: ${d.cantidad}`);
      if(d.total!=null)partes.push(`Total eliminado: USD ${d.total}`);
      if(d.concepto){
        const conceptoHumano=String(d.concepto).replace(/_/g," ").replace(/^./,c=>c.toUpperCase());
        partes.push(`Concepto: ${conceptoHumano}`);
      }
      return partes.length?partes.join(" · "):"—";
    }
    const labels={
      email:"Email",servicio:"Servicio",monto:"Monto",recibe:"Cobró",recibio_venta:"Cobró",recibe_final:"Recibió finalmente",vendedor:"Vendedor",
      pendiente_transferencia:"Estado",ingreso_id:"Ingreso",fecha_recepcion:"Fecha de recepción",caja_id:"Caja",pendiente_id:"Pendiente",
      nota:"Nota",cliente:"Cliente",rollback:"Reversión",caja_eliminada:"Caja eliminada",origen:"Origen",venta:"Venta"
    };
    return Object.entries(d).filter(([k])=>k!=="nombre").map(([k,v])=>{
      let valor=v;
      if(k==="pendiente_transferencia")valor=v?"Pendiente de recepción":"Cobrado";
      if(k==="fecha_recepcion")valor=formatDate(v);
      if(typeof valor==="object"&&valor!==null)valor=Object.entries(valor).map(([kk,vv])=>`${labels[kk]||kk}: ${vv}`).join(", ");
      return `${labels[k]||k.replace(/_/g," ")}: ${valor}`;
    }).join(" · ")||"—";
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
              <thead><TableHeader cols={["Fecha y hora","Usuario","Acción","Cliente / sección","Detalle"]} t={t}/></thead>
              <tbody>
                {pag.rows.map(h=>(
                  <tr key={h.id}>
                    <td style={{...S.td,whiteSpace:"nowrap",fontSize:13}}>{formatDateTime(h.created_at)}</td>
                    <td style={{...S.td,fontSize:13}}>{h.usuario_email||"-"}</td>
                    <td style={S.td}><span style={badge(h.accion)}>{h.accion||"-"}</span></td>
                    <td style={{...S.td,fontWeight:600}}>{histEntidad(h)}</td>
                    <td style={{...S.td,color:t.textMuted,fontSize:12,maxWidth:320,wordBreak:"break-word",whiteSpace:"normal",lineHeight:1.5}}>
                      {histDetalle(h)}
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
  const[deudaCliente,setDeudaCliente]=useState(null);
  const[confirm,setConfirm]=useState(null);
  const[busquedaRapida,setBusquedaRapida]=useState(false);
  const[ingDesde,setIngDesde]=useState("");
  const[ingHasta,setIngHasta]=useState("");
  const[emailSaved,setEmailSaved]=useState(null);
  const[vendedorRenovacion,setVendedorRenovacion]=useState("");
  const[editIngreso,setEditIngreso]=useState(null);
  const[transferenciasRecibidas,setTransferenciasRecibidas]=useState([]);
  const[ventasPendientesNotas,setVentasPendientesNotas]=useState([]);
  const[cajaMovimientos,setCajaMovimientos]=useState([]);
  const[cajaForm,setCajaForm]=useState({fecha:toISODate(getToday()),recibe:"Cristian",monto:""});
  const[cajaEliminarFecha,setCajaEliminarFecha]=useState(toISODate(getToday()));

  const toast=useToast();

  const baseRef=useRef(null);const vencRef=useRef(null);
  const deudRef=useRef(null);const clasesRef=useRef(null);
  const ingRef=useRef(null);const critRef=useRef(null);const pendRef=useRef(null);const semanaActualRef=useRef(null);const cajaRef=useRef(null);

  useEffect(()=>{applyDateColorScheme(dark);},[dark]);

  const t=getT(dark);const S=makeS(t);const btn=makeBtn(t);const navBtn=makeNavBtn(t);

  // Ctrl+K
  useEffect(()=>{
    function onKey(e){if((e.ctrlKey||e.metaKey)&&e.key==="k"){e.preventDefault();setBusquedaRapida(true);}}
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[]);

  function askConfirm(title,message,onConfirm,{danger=false,label="Confirmar",showVendedor=false,showRecibeFinal=false,montoDefault=null,onConfirmFn=null}={}){
    setConfirm({title,message,onConfirm,danger,label,showVendedor,showRecibeFinal,montoDefault,montoRenovacion:montoDefault,recibeFinal:showRecibeFinal?"":"Cristian",onConfirmFn});
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
  async function fetchTransferenciasRecibidas(){
    const{data,error}=await supabase.from("notas_cliente").select("*").eq("tipo","pago").order("created_at",{ascending:false});
    if(error){setTransferenciasRecibidas([]);return;}
    setTransferenciasRecibidas((data||[]).filter(n=>String(n.contenido||"").toLowerCase().includes("recibió transferencia")));
  }
  async function fetchVentasPendientesNotas(){
    const{data,error}=await supabase.from("notas_cliente").select("*").eq("tipo","venta_pendiente").order("created_at",{ascending:false});
    if(error){setVentasPendientesNotas([]);return;}
    setVentasPendientesNotas(data||[]);
  }
  async function fetchCajaMovimientos(){
    const{data,error}=await supabase.from("notas_cliente").select("*").eq("tipo","caja").order("created_at",{ascending:false});
    if(error){setCajaMovimientos([]);return;}
    setCajaMovimientos(data||[]);
  }
  async function refetch(){await Promise.all([fetchClientes(),fetchIngresos(),fetchTransferenciasRecibidas(),fetchVentasPendientesNotas(),fetchCajaMovimientos()]);}
  useEffect(()=>{fetchClientes();fetchIngresos();fetchTransferenciasRecibidas();fetchVentasPendientesNotas();fetchCajaMovimientos();limpiarHistorial();},[]);

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
    const servicio=normalizeServicio(f.servicio);
    const dur=servicio==="clases"?0:Number(f.duracion_dias||svcDuration(servicio));
    const vendedor=f.vendedor||"";
    return{...f,servicio,nombre,email:emailVal,estado_manual:"activo",monto:Number(f.monto||0),duracion_dias:dur,deuda_restante:Number(f.deuda_restante||0),telefono:f.telefono||"",
      vendedor,transferido:!ventaPendienteTransferencia(vendedor),
      fecha_vencimiento:servicio==="clases"||dur<=0?null:toISODate(addDays(f.fecha_inicio,dur))};
  }
  function limpiarTextoRecepcion(txt){
    return String(txt||"")
      .replace(/pendiente_transferencia\s*:\s*true/gi,"Pendiente de recepción")
      .replace(/pendiente_transferencia\s*:\s*false/gi,"Cobrado")
      .replace(/recibe\s*:\s*/gi,"Cobró ")
      .replace(/recibio\s*:\s*/gi,"Cobró ")
      .replace(/recibió\s*:\s*/gi,"Cobró ")
      .replace(/_/g," ")
      .replace(/\s*·\s*/g," · ")
      .trim();
  }
  function notaConRecepcion(notas, recibe, pendiente){
    const base=limpiarTextoRecepcion(notas).trim();
    const r=String(recibe||"Cristian").trim()||"Cristian";
    const meta=pendiente?`Cobró ${r} · Pendiente de recepción`:`Cobró ${r} · Cobrado`;
    // La recepción propia de ESTE ingreso va primero.
    // Si el cliente tenía una nota vieja tipo "Cobró Luigi · Pendiente", no debe pisar
    // la caja de una renovación nueva cobrada por Cristian/Bahiano.
    return base ? `${meta} · ${base}` : meta;
  }
  function normalizarReceptorCaja(v){
    const r=String(v||"").trim();
    if(!r)return "";
    const low=r.toLowerCase();
    if(low==="cristian"||low==="christian")return "Cristian";
    if(low==="bahiano"||low==="baiano"||low==="bahiana"||low==="baiana")return "Bahiano";
    if(low==="luigi")return "Luigi";
    return r;
  }
  function recepcionActualDesdeIngreso(i){
    // IMPORTANTE: la Caja se decide por ESTE ingreso, nunca por el estado actual del cliente.
    // Un cliente puede tener una venta vieja pendiente con Luigi y renovaciones nuevas cobradas
    // por Cristian/Bahiano el mismo día. Cada ingreso debe leerse separado por su propio id/nota.
    const notas=limpiarTextoRecepcion(i?.notas||"");
    const directo=normalizarReceptorCaja(i?.recibe||i?.recibio_venta||i?.recibe_venta||i?.vendedor||i?.recibe_final||i?.recibio||"");
    if(directo){
      return {recibe:directo,pendiente:ventaPendienteTransferencia(directo)&&!/Transferencia recibida por/i.test(notas)};
    }

    const cobro=notas.match(/Cobró\s+(Cristian|Bahiano|Baiano|Luigi)\s*·\s*(Cobrado|Pendiente de recepción|Pendiente de transferencia)/i);
    if(cobro){
      const recibe=normalizarReceptorCaja(cobro[1]);
      const estado=String(cobro[2]||"").toLowerCase();
      const pendiente=estado.includes("pendiente")&&!/Transferencia recibida por/i.test(notas);
      return {recibe,pendiente};
    }

    const legacy=notas.match(/(?:recibe|recibió|recibio|quien recibio|quién recibió)\s*:?\s*(Cristian|Bahiano|Baiano|Luigi)/i);
    if(legacy){
      const recibe=normalizarReceptorCaja(legacy[1]);
      const pendiente=(/pendiente_transferencia\s*:?\s*true/i.test(notas)||/Pendiente de recepción|Pendiente de transferencia/i.test(notas))&&!/Transferencia recibida por/i.test(notas);
      return {recibe,pendiente};
    }

    return {recibe:"",pendiente:false};
  }
  function formatearNotasIngreso(notas){
    const txt=limpiarTextoRecepcion(notas);
    if(!txt)return "-";
    return txt;
  }
  function buildIng(cid,nombre,emailVal,servicio,monto,fecha,notas,recepcion={}){
    const notasFinal=recepcion&&recepcion.recibe
      ? notaConRecepcion(notas, recepcion.recibe, !!recepcion.pendiente)
      : limpiarTextoRecepcion(notas||"");
    return{cliente_id:cid,cliente_nombre:nombre,email:emailVal,servicio:normalizeServicio(servicio),monto:Number(monto||0),fecha_pago:fecha,notas:notasFinal};
  }
  const CAJA_AUTO_DESDE = "2026-07-11";
  const cajaFechaHabilitada = fecha => (dateOnly(fecha)||toISODate(getToday())) >= CAJA_AUTO_DESDE;
  const fechaIngresoDesdeFormulario = f => dateOnly(f?.fecha_inicio)||toISODate(getToday());
  const cajaRecibeDirecto = v => {
    const r=String(v||"").trim().toLowerCase();
    // Valor vacío = Cristian. También aceptamos variantes con h/acentos por si vienen de datos viejos.
    if(!r||r==="cristian"||r==="christian")return "Cristian";
    if(r==="bahiano"||r==="baiano"||r==="bahiana"||r==="baiana")return "Bahiano";
    // Luigi/otros no entran a Caja hasta que se marque recibido.
    return null;
  };
  const ventaPendienteTransferencia = v => {
    const r=String(v||"").trim();
    return !!r && !cajaRecibeDirecto(r);
  };
  const receptorExplicitoIngreso = i => recepcionActualDesdeIngreso(i).recibe;
  function parseFechaRecepcionTexto(txt){
    const t=String(txt||"");
    const m=t.match(/(?:Transferencia recibida por|recib[ií]o transferencia).*?(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if(!m)return null;
    return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  }
  function infoCajaDesdeIngreso(i, transferenciasPorIngreso=new Map()){
    const notas=String(i?.notas||"");
    const ingresoId=String(i?.id||"");
    const tr=ingresoId?transferenciasPorIngreso.get(ingresoId):null;
    if(tr){
      const recibe=cajaRecibeDirecto(tr.recibe);
      const fecha=dateOnly(tr.fecha)||dateOnly(i?.fecha_pago)||dateOnly(i?.created_at)||toISODate(getToday());
      if(recibe)return {recibe,fecha,origen:"transferencia recibida",nombre:tr.nombre||i?.cliente_nombre||""};
    }
    const mTransfer=notas.match(/Transferencia recibida por\s+(Cristian|Bahiano|Baiano)/i);
    if(mTransfer){
      const recibe=cajaRecibeDirecto(mTransfer[1]);
      const fecha=parseFechaRecepcionTexto(notas)||dateOnly(i?.fecha_pago)||dateOnly(i?.created_at)||toISODate(getToday());
      if(recibe)return {recibe,fecha,origen:"transferencia recibida",nombre:i?.cliente_nombre||""};
    }
    const recActual=recepcionActualDesdeIngreso(i);
    const recibe=cajaRecibeDirecto(recActual.recibe);
    if(recibe&&!recActual.pendiente){
      return {recibe,fecha:dateOnly(i?.fecha_pago)||dateOnly(i?.created_at)||toISODate(getToday()),origen:"ingreso automático",nombre:i?.cliente_nombre||""};
    }
    return null;
  }

  async function registrarCajaDesdeVenta({fecha,monto,recibe,nombre,clienteId,origen,ingresoId}){
    const montoNum=Number(monto||0);
    const f=dateOnly(fecha)||toISODate(getToday());
    if(!cajaFechaHabilitada(f))return null;
    const quien=cajaRecibeDirecto(recibe);
    if(!quien||montoNum<=0)return null;
    const yaExiste=ingresoId&&(cajaMovimientos||[]).some(m=>{
      const d=m?.detalle||{};
      if(m?.tipo!=="caja"||d?.concepto!=="movimiento")return false;
      return String(d.ingreso_id||"")===String(ingresoId);
    });
    if(yaExiste)return null;
    const eliminadosFecha=(cajaMovimientos||[]).filter(m=>
      m?.tipo==="caja"&&
      dateOnly(m?.detalle?.fecha)===f&&
      m?.detalle?.concepto==="dia_eliminado"
    );
    if(eliminadosFecha.length){
      const ids=eliminadosFecha.map(m=>m.id).filter(Boolean);
      const reales=ids.filter(id=>!String(id).startsWith("tmp-"));
      if(reales.length)await supabase.from("notas_cliente").delete().in("id",reales);
    }
    const payload={
      cliente_id:null,
      usuario_email:user?.email||"—",
      tipo:"caja",
      contenido:`Caja diaria: ${quien} recibió USD ${montoNum}${nombre?` · Venta: ${nombre}`:""}`,
      detalle:{concepto:"movimiento",origen:origen||"venta",fecha:f,recibe:quien,monto:montoNum,nombre:nombre||"",cliente_id:clienteId||null,ingreso_id:ingresoId||null}
    };
    const{data,error}=await supabase.from("notas_cliente").insert([payload]).select().single();
    if(error){toast.error("La venta se registró, pero no se pudo sumar a Caja");return null;}
    setCajaMovimientos(prev=>[data||{...payload,id:`tmp-caja-${Date.now()}`,created_at:new Date().toISOString()},...prev.filter(m=>!eliminadosFecha.some(x=>x.id===m.id))]);
    void logH(user?.email,"registró caja automática por venta","Caja diaria",data?.id||null,{nombre:"Caja diaria",fecha:f,recibe:quien,monto:montoNum,venta:nombre||"",origen:origen||"venta"});
    return data;
  }

  async function registrarVentaPendiente({clienteId,ingresoId,nombre,servicio,monto,fecha,vendedor,origen}){
    const vend=String(vendedor||"").trim();
    if(!ventaPendienteTransferencia(vend))return null;
    const payloadDetalle={concepto:"venta_pendiente",ingreso_id:ingresoId||null,cliente_id:clienteId||null,nombre:nombre||"",servicio:normalizeServicio(servicio),monto:safeNum(monto),fecha_pago:dateOnly(fecha)||toISODate(getToday()),vendedor:vend,origen:origen||"venta",pendiente_transferencia:true};
    const nota=await logNC(clienteId,user?.email,"venta_pendiente",`Venta pendiente de recepción. Servicio: ${svcLabel(servicio)} · Monto: USD ${safeNum(monto)} · Recibe: ${vend} · Pendiente de transferencia`,payloadDetalle);
    if(nota)setVentasPendientesNotas(prev=>[nota,...prev.filter(n=>String(n.id)!==String(nota.id))]);
    return nota;
  }

  async function guardarCliente(){
    const v=validateForm(form);if(!v)return;
    // Solo validar duplicado de email si hay email y no es clases
    if(form.servicio!=="clases"&&v.email){
      const dup=clientes.find(c=>c.email?.toLowerCase()===v.email);
      if(dup){toast.error(`Ya existe un cliente con el email ${v.email}`);return;}
    }
    setGuardando(true);
    try{
      const payload=buildPayload(form,v.nombre,v.email);
      const{data:ins,error}=await supabase.from("clientes").insert([payload]).select().single();
      if(error){toast.error("No se pudo guardar el cliente");return;}
      const fechaIngresoAlta=fechaIngresoDesdeFormulario(form);
      const recibeAlta=payload.vendedor||ins.vendedor||form.vendedor||"Cristian";
      const pendienteAlta=ventaPendienteTransferencia(recibeAlta);
      const{data:ingAlta,error:eIngAlta}=await supabase.from("ingresos").insert([buildIng(ins.id,ins.nombre,ins.email,ins.servicio,ins.monto,fechaIngresoAlta,ins.notas,{recibe:recibeAlta,pendiente:pendienteAlta})]).select().single();
      if(eIngAlta){toast.error("Cliente guardado, pero no se pudo registrar el ingreso");}

      // Actualización local inmediata: evita que Caja dependa de un refetch para saber quién recibió.
      setClientes(prev=>[{...ins,vendedor:payload.vendedor||"",transferido:!pendienteAlta},...prev.filter(c=>String(c.id)!==String(ins.id))]);
      if(ingAlta)setIngresos(prev=>[{...ingAlta,cliente_id:ins.id,cliente_nombre:ins.nombre,email:ins.email,servicio:ins.servicio,monto:ins.monto,fecha_pago:fechaIngresoAlta},...prev.filter(i=>String(i.id)!==String(ingAlta.id))]);

      // La Caja directa de Cristian/Bahiano se crea antes del cierre del formulario.
      // Luigi queda pendiente y entra recién cuando se marca recibido.
      if(!eIngAlta){
        try{
          await registrarCajaDesdeVenta({fecha:fechaIngresoAlta,monto:ins.monto,recibe:recibeAlta,nombre:ins.nombre,clienteId:ins.id,origen:"alta",ingresoId:ingAlta?.id});
        }catch(err){console.warn("Caja automática de alta falló",err);}
      }

      void (async()=>{
        try{
          await logH(user?.email,"guardó nuevo cliente","cliente",ins.id,{nombre:ins.nombre,email:ins.email,servicio:ins.servicio,monto:ins.monto,recibe:recibeAlta,pendiente_transferencia:pendienteAlta,ingreso_id:ingAlta?.id||null});
          await logNC(ins.id,user?.email,"alta",`Cliente dado de alta. Servicio: ${svcLabel(ins.servicio)} · Monto: USD ${ins.monto} · Recibe: ${recibeAlta}${pendienteAlta?" · Pendiente de transferencia a Cristian":""}`,{servicio:ins.servicio,monto:ins.monto,recibe:recibeAlta,pendiente_transferencia:pendienteAlta,ingreso_id:ingAlta?.id||null});
          if(pendienteAlta)await registrarVentaPendiente({clienteId:ins.id,ingresoId:ingAlta?.id,nombre:ins.nombre,servicio:ins.servicio,monto:ins.monto,fecha:fechaIngresoAlta,vendedor:recibeAlta,origen:"alta"});
          llamarDrive("compartir", ins.email);
          refetch();
        }catch(err){console.warn("Alta secundaria falló",err);refetch();}
      })();

      setShowForm(false);setForm(FORM_DEF);
      toast.success(`${v.nombre} agregado correctamente`);
      refetch();
    }catch(err){
      console.error(err);
      toast.error("No se pudo guardar el cliente");
    }finally{
      setGuardando(false);
    }
  }
  async function guardarRenovacion(){
    const v=validateForm(renovarForm);if(!v)return;
    setRenovando(true);
    try{
      const payload=buildPayload(renovarForm,v.nombre,v.email);
      const{error:eC}=await supabase.from("clientes").update(payload).eq("id",renovarForm.id);
      if(eC){toast.error("No se pudo renovar el cliente");return;}
      const fechaRenovacion=toISODate(getToday());
      const recibeRenovacion=payload.vendedor||renovarForm.vendedor||"Cristian";
      const pendienteRenovacion=ventaPendienteTransferencia(recibeRenovacion);
      const{data:ingRen,error:eIngRen}=await supabase.from("ingresos").insert([buildIng(renovarForm.id,v.nombre,v.email,renovarForm.servicio,renovarForm.monto,fechaRenovacion,renovarForm.notas,{recibe:recibeRenovacion,pendiente:pendienteRenovacion})]).select().single();
      if(eIngRen){toast.error("Renovación guardada, pero no se pudo registrar el ingreso");}

      setClientes(prev=>prev.map(c=>String(c.id)===String(renovarForm.id)?{...c,...payload,vendedor:payload.vendedor||"",transferido:!pendienteRenovacion}:c));
      if(ingRen)setIngresos(prev=>[{...ingRen,cliente_id:renovarForm.id,cliente_nombre:v.nombre,email:v.email,servicio:renovarForm.servicio,monto:renovarForm.monto,fecha_pago:fechaRenovacion},...prev.filter(i=>String(i.id)!==String(ingRen.id))]);

      if(!eIngRen){
        try{
          await registrarCajaDesdeVenta({fecha:fechaRenovacion,monto:renovarForm.monto,recibe:recibeRenovacion,nombre:v.nombre,clienteId:renovarForm.id,origen:"renovación",ingresoId:ingRen?.id});
        }catch(err){console.warn("Caja automática de renovación falló",err);}
      }

      void (async()=>{
        try{
          await logH(user?.email,"renovación de cliente","cliente",renovarForm.id,{nombre:v.nombre,servicio:renovarForm.servicio,monto:renovarForm.monto,recibe:recibeRenovacion,pendiente_transferencia:pendienteRenovacion,ingreso_id:ingRen?.id||null});
          await logNC(renovarForm.id,user?.email,"renovación",`Renovación de plan. Servicio: ${svcLabel(renovarForm.servicio)} · Monto: USD ${renovarForm.monto} · Recibe: ${recibeRenovacion}${pendienteRenovacion?" · Pendiente de transferencia a Cristian":""}`,{servicio:renovarForm.servicio,monto:renovarForm.monto,recibe:recibeRenovacion,pendiente_transferencia:pendienteRenovacion,ingreso_id:ingRen?.id||null});
          if(pendienteRenovacion)await registrarVentaPendiente({clienteId:renovarForm.id,ingresoId:ingRen?.id,nombre:v.nombre,servicio:renovarForm.servicio,monto:renovarForm.monto,fecha:fechaRenovacion,vendedor:recibeRenovacion,origen:"renovación"});
          llamarDrive("compartir", v.email);
          refetch();
        }catch(err){console.warn("Renovación secundaria falló",err);refetch();}
      })();

      setShowRenovar(false);
      toast.success(`${v.nombre} renovado correctamente`);
      refetch();
    }catch(err){
      console.error(err);
      toast.error("No se pudo renovar el cliente");
    }finally{
      setRenovando(false);
    }
  }
  async function renovarRapido(cliente, vendedor="", montoCustom){
    const today=getToday();
    const servicio=normalizeServicio(cliente.servicio);
    const dur=servicio==="clases"?0:svcDuration(servicio);
    const vencimientoActual=cliente.vencimiento||cliente.fecha_vencimiento||resolveDueDate(cliente)||null;
    // Regla correcta: renovar suma la duración completa al vencimiento previo.
    // Ejemplo: si estaba vencido hace 10 días y renueva 30, queda con 20 días.
    const baseDate=vencimientoActual||toISODate(today);
    const nv=servicio==="clases"||dur<=0?null:toISODate(addDays(baseDate,dur));
    const fb=toISODate(today);
    const transferido=!ventaPendienteTransferencia(vendedor);
    const monto=montoCustom&&Number(montoCustom)>0?Number(montoCustom):Number(cliente.monto||0);
    const email=(cliente.email||"").trim().toLowerCase();
    const payload={nombre:cliente.nombre||"",email,servicio,fecha_inicio:fb,monto,duracion_dias:dur,estado_manual:"activo",deuda_restante:Number(cliente.deuda_restante||0),notas:cliente.notas||"",telefono:cliente.telefono||"",fecha_vencimiento:nv,vendedor:vendedor||"",transferido};
    const{error:eC}=await supabase.from("clientes").update(payload).eq("id",cliente.id);
    if(eC){toast.error("No se pudo renovar el cliente");return;}
    setClientes(prev=>prev.map(c=>c.id===cliente.id?{...c,...payload,id:cliente.id}:c));
    const recibeRapida=vendedor||"Cristian";
    const pendienteRapida=ventaPendienteTransferencia(vendedor);
    const ingreso=buildIng(cliente.id,cliente.nombre||"",email,servicio,monto,toISODate(today),cliente.notas,{recibe:recibeRapida,pendiente:pendienteRapida});
    const{data:ingRapida,error:eI}=await supabase.from("ingresos").insert([ingreso]).select().single();
    if(eI){toast.error("Cliente renovado, pero no se pudo registrar el ingreso");refetch();return;}
    setIngresos(prev=>[{...(ingRapida||ingreso),id:ingRapida?.id||`tmp-${Date.now()}`},...prev]);
    await registrarCajaDesdeVenta({fecha:toISODate(today),monto,recibe:recibeRapida,nombre:cliente.nombre,clienteId:cliente.id,origen:"renovación rápida",ingresoId:ingRapida?.id});
    await logH(user?.email,"renovó rápido cliente","cliente",cliente.id,{nombre:cliente.nombre,servicio,monto,recibe:recibeRapida,pendiente_transferencia:pendienteRapida,ingreso_id:ingRapida?.id||null});
    await logNC(cliente.id,user?.email,"renovación",`Renovación rápida. Servicio: ${svcLabel(servicio)} · Monto: USD ${monto} · Recibe: ${recibeRapida}${pendienteRapida?" · Pendiente de transferencia a Cristian":""}`,{servicio,monto,recibe:recibeRapida,pendiente_transferencia:pendienteRapida,ingreso_id:ingRapida?.id||null});
    if(pendienteRapida)await registrarVentaPendiente({clienteId:cliente.id,ingresoId:ingRapida?.id,nombre:cliente.nombre,servicio,monto,fecha:toISODate(today),vendedor:recibeRapida,origen:"renovación rápida"});
    toast.success(servicio==="clases"?`✓ ${cliente.nombre} renovado — clases registradas`:`✓ ${cliente.nombre} renovado — vence ${formatDate(nv)}`);refetch();
    llamarDrive("compartir",email);
  }
  async function eliminarClienteConfirmado(cliente){
    // Baja operativa: elimina al cliente activo y revoca acceso, pero NO borra ingresos históricos.
    // Antes de borrar el cliente, se desvinculan sus ingresos para evitar cascadas por clave foránea.
    setClientes(prev=>prev.filter(c=>c.id!==cliente.id));
    setIngresos(prev=>prev.map(i=>i.cliente_id===cliente.id?{...i,cliente_id:null}:i));
    setClienteDetalle(null);
    await supabase.from("ingresos").update({cliente_id:null}).eq("cliente_id",cliente.id);
    const{error}=await supabase.from("clientes").delete().eq("id",cliente.id);
    if(error){toast.error("No se pudo eliminar");refetch();return;}
    await logH(user?.email,"eliminó cliente","cliente",cliente.id,{nombre:cliente.nombre,email:cliente.email,nota:"baja operativa sin borrar ingresos"});
    toast.success(`${cliente.nombre} eliminado. Los ingresos históricos se conservaron.`);
    llamarDrive("revocar",(cliente.email||"").trim().toLowerCase()); // en paralelo
  }
  async function eliminarIngreso(id){
    const ing=ingresos.find(i=>i.id===id);
    const movimientosCajaRelacionados=(cajaMovimientos||[]).filter(m=>{
      const d=m?.detalle||{};
      if(m?.tipo!=="caja"||d?.concepto!=="movimiento")return false;
      if(String(d.ingreso_id||"")===String(id))return true;
      // Respaldo para movimientos viejos de caja que no tenían ingreso_id guardado:
      // se remueve solo si parece caja automática de esa misma venta/renovación.
      const mismoCliente=ing?.cliente_id&&String(d.cliente_id||"")===String(ing.cliente_id);
      const mismoMonto=safeNum(d.monto)===safeNum(ing?.monto);
      const origen=String(d.origen||"").toLowerCase();
      const esAuto=origen.includes("alta")||origen.includes("renov")||origen.includes("recepción")||origen.includes("recepcion")||origen.includes("venta");
      const mismaFecha=dateOnly(d.fecha)===dateOnly(ing?.fecha_pago);
      const esRecepcionPosterior=origen.includes("recepción")||origen.includes("recepcion");
      return mismoCliente&&mismoMonto&&esAuto&&(mismaFecha||esRecepcionPosterior);
    });
    const idsCaja=movimientosCajaRelacionados.map(m=>m.id).filter(Boolean).filter(idCaja=>!String(idCaja).startsWith("tmp-"));

    const{error}=await supabase.from("ingresos").delete().eq("id",id);
    if(error){toast.error("No se pudo eliminar el ingreso");return;}
    if(idsCaja.length){
      const{error:eCaja}=await supabase.from("notas_cliente").delete().in("id",idsCaja);
      if(eCaja)toast.error("Ingreso eliminado, pero no se pudo quitar de Caja");
    }

    // Historial real de la persona: si se elimina un ingreso desde Dashboard
    // porque fue una prueba/error, también se eliminan las notas del cliente
    // que pertenecían a ese ingreso puntual. Esto evita que, por ejemplo,
    // una renovación de clases borrada siga apareciendo como movimiento real.
    let notasClienteEliminadas=0;
    if(ing?.cliente_id){
      try{
        const{data:notasDelCliente}=await supabase
          .from("notas_cliente")
          .select("id,detalle")
          .eq("cliente_id",ing.cliente_id);
        const idsNotasIngreso=(notasDelCliente||[])
          .filter(n=>String(n?.detalle?.ingreso_id||"")===String(id))
          .map(n=>n.id)
          .filter(Boolean);
        if(idsNotasIngreso.length){
          const{error:eNotas}=await supabase.from("notas_cliente").delete().in("id",idsNotasIngreso);
          if(!eNotas)notasClienteEliminadas=idsNotasIngreso.length;
        }
      }catch(err){console.warn("No se pudieron limpiar notas del ingreso eliminado",err);}
    }

    // Si el ingreso borrado correspondía al cliente que sigue activo en Base operativa,
    // se revierte también el efecto operativo de esa carga/renovación: días agregados
    // y pendiente de recepción. Esto NO aplica cuando el cliente ya fue dado de baja
    // operativamente, porque en ese caso sus ingresos históricos quedan desvinculados.
    let rollbackInfo=null;
    if(ing?.cliente_id){
      const clienteActivo=clientes.find(c=>c.id===ing.cliente_id);
      const servicio=normalizeServicio(ing.servicio||clienteActivo?.servicio);
      const dur=servicio==="clases"?0:svcDuration(servicio);
      if(clienteActivo&&dur>0){
        const vencActual=clienteActivo.fecha_vencimiento||clienteActivo.vencimiento||resolveDueDate(clienteActivo);
        const nuevoVenc=vencActual?toISODate(addDays(vencActual,-dur)):null;
        const payloadRollback={fecha_vencimiento:nuevoVenc,vencimiento:nuevoVenc,vendedor:"",transferido:true};
        await supabase.from("clientes").update({fecha_vencimiento:nuevoVenc,vendedor:"",transferido:true}).eq("id",clienteActivo.id);
        setClientes(prev=>prev.map(c=>c.id===clienteActivo.id?{...c,...payloadRollback}:c));
        rollbackInfo={cliente:clienteActivo.nombre,servicio,dias_revertidos:dur,vencimiento:nuevoVenc};
      }
    }

    // Actualizar estado local inmediatamente sin recargar
    setIngresos(prev=>prev.filter(i=>i.id!==id));
    if(movimientosCajaRelacionados.length){
      setCajaMovimientos(prev=>prev.filter(m=>!movimientosCajaRelacionados.some(x=>String(x.id)===String(m.id))));
    }
    await logH(user?.email,"eliminó ingreso","ingreso",id,{cliente:ing?.cliente_nombre,monto:ing?.monto,servicio:ing?.servicio,rollback:rollbackInfo,caja_eliminada:movimientosCajaRelacionados.length,notas_cliente_eliminadas:notasClienteEliminadas});
    if(movimientosCajaRelacionados.length){
      await logH(user?.email,"eliminó caja automática por ingreso eliminado","Caja diaria",null,{nombre:"Caja diaria",ingreso_id:id,cliente:ing?.cliente_nombre,monto:ing?.monto,cantidad:movimientosCajaRelacionados.length});
    }
    toast.success(rollbackInfo?"Ingreso eliminado, caja actualizada y renovación revertida":"Ingreso eliminado y caja actualizada");
  }
  async function editarMontoIngreso(id,nuevoMonto){
    const montoNuevo=safeNum(nuevoMonto);
    if(!montoNuevo||montoNuevo<=0){toast.error("Ingresá un monto válido");return;}
    const ing=ingresos.find(i=>i.id===id);
    if(!ing){toast.error("No se encontró el ingreso");return;}
    const montoAnterior=safeNum(ing.monto);
    if(montoAnterior===montoNuevo){setEditIngreso(null);return;}

    const{error}=await supabase.from("ingresos").update({monto:montoNuevo}).eq("id",id);
    if(error){toast.error("No se pudo editar el monto");return;}

    // Actualizar ingresos en pantalla: Dashboard, gráficos, ingresos del mes y total histórico
    setIngresos(prev=>prev.map(i=>i.id===id?{...i,monto:montoNuevo}:i));

    // Si este ingreso corresponde al último movimiento activo del cliente, actualizar también
    // el monto operativo para que pendientes de recepción y ficha del cliente reflejen el valor real.
    let actualizoCliente=false;
    if(ing?.cliente_id){
      const relacionados=ingresos
        .filter(i=>i.cliente_id===ing.cliente_id)
        .sort((a,b)=>{
          const fa=String(a.fecha_pago||"");
          const fb=String(b.fecha_pago||"");
          if(fa!==fb)return fb.localeCompare(fa);
          return String(b.id||"").localeCompare(String(a.id||""));
        });
      const ultimo=relacionados[0];
      if(ultimo?.id===id){
        const{error:eC}=await supabase.from("clientes").update({monto:montoNuevo}).eq("id",ing.cliente_id);
        if(!eC){
          actualizoCliente=true;
          setClientes(prev=>prev.map(c=>c.id===ing.cliente_id?{...c,monto:montoNuevo}:c));
        }
      }
    }

    await logH(user?.email,"editó monto de ingreso","ingreso",id,{
      cliente:ing?.cliente_nombre,
      email:ing?.email,
      servicio:ing?.servicio,
      monto_anterior:montoAnterior,
      monto_nuevo:montoNuevo,
      actualizo_cliente:actualizoCliente
    });
    if(ing?.cliente_id){
      await logNC(ing.cliente_id,user?.email,"pago",`Monto de pago editado. Antes: USD ${montoAnterior} · Ahora: USD ${montoNuevo}`,{
        ingreso_id:id,
        monto_anterior:montoAnterior,
        monto_nuevo:montoNuevo
      });
    }
    setEditIngreso(null);
    toast.success("Monto actualizado");
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
  async function finalizarClases(cliente){
    setClientes(prev=>prev.map(c=>c.id===cliente.id?{...c,estado_manual:"finalizado"}:c));
    const{error}=await supabase.from("clientes").update({estado_manual:"finalizado"}).eq("id",cliente.id);
    if(error){toast.error("No se pudo finalizar la clase");fetchClientes();return;}
    await logH(user?.email,"finalizó clases","cliente",cliente.id,{nombre:cliente.nombre,monto:cliente.monto});
    await logNC(cliente.id,user?.email,"estado",`Clases finalizadas. Quedan consolidadas en historial e ingresos.`,{estado:"finalizado"});
    toast.success(`Clases de ${cliente.nombre} finalizadas`);
  }
  async function actualizarEmail(id, nuevoEmail, emailAnteriorForzado="") {
    const clienteActual = clientes.find(c => c.id === id);
    const emailAnterior = (emailAnteriorForzado || clienteActual?.email || "").trim().toLowerCase();
    const emailNuevo = nuevoEmail.trim().toLowerCase();
    if (emailNuevo && !isValidEmail(emailNuevo)) { toast.error("El email no es válido"); fetchClientes(); return; }
    if (emailAnterior === emailNuevo) return; // no cambió nada
    const {error} = await supabase.from("clientes").update({email: emailNuevo}).eq("id", id);
    if (error) { toast.error("No se pudo actualizar el email"); fetchClientes(); return; }
    setClientes(prev=>prev.map(c=>c.id===id?{...c,email:emailNuevo}:c));
    setEmailSaved(id); setTimeout(() => setEmailSaved(null), 2000);
    // Revocar acceso al email anterior y dar acceso al nuevo.
    // Importante: el email anterior se captura al enfocar el campo, porque el input
    // actualiza el estado local mientras se escribe.
    if (emailAnterior && emailAnterior.includes("@")) llamarDrive("revocar", emailAnterior);
    if (emailNuevo && emailNuevo.includes("@")) llamarDrive("compartir", emailNuevo);
    toast.success("Email actualizado y acceso sincronizado");
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
  async function actualizarDeudaCliente(cliente,montoDeuda){
    const deudaNueva=Math.max(0,safeNum(montoDeuda));
    const deudaAnterior=safeNum(cliente?.deuda_restante);
    const notasLimpias=String(cliente?.notas||"")
      .replace(/\s*Debe\s+\d+(?:[.,]\d+)?\s*USD\s*-?\s*/ig," ")
      .replace(/\s+/g," ")
      .trim();
    const payload={deuda_restante:deudaNueva,notas:notasLimpias};
    setClientes(prev=>prev.map(c=>c.id===cliente.id?{...c,...payload}:c));
    setClienteDetalle(prev=>prev&&prev.id===cliente.id?{...prev,...payload}:prev);
    const{error}=await supabase.from("clientes").update(payload).eq("id",cliente.id);
    if(error){toast.error("No se pudo actualizar la deuda");fetchClientes();return;}
    await logH(user?.email,"editó deuda","cliente",cliente.id,{nombre:cliente.nombre,deuda_anterior:deudaAnterior,deuda_nueva:deudaNueva});
    await logNC(cliente.id,user?.email,"estado",deudaNueva>0?`Deuda actualizada. Ahora debe USD ${deudaNueva}`:`Deuda cancelada manualmente`,{deuda_anterior:deudaAnterior,deuda_nueva:deudaNueva});
    setDeudaCliente(null);
    toast.success(deudaNueva>0?`Deuda actualizada: USD ${deudaNueva}`:"Deuda cancelada");
    refetch();
  }

  async function registrarPagoParcial(cliente,monto,recibePago="Cristian"){
    if(!monto||monto<=0){toast.error("Ingresá un monto válido");return;}
    if(monto>safeNum(cliente.deuda_restante)){toast.error(`El monto supera la deuda actual (USD ${cliente.deuda_restante})`);return;}
    const recibe=String(recibePago||"Cristian").trim();
    if(!["Cristian","Bahiano","Luigi"].includes(recibe)){toast.error("Elegí quién recibió el pago");return;}
    const nuevaDeuda=Math.max(0,safeNum(cliente.deuda_restante)-monto);
    const fechaHoy=toISODate(getToday());
    const pendienteDeRecepcion=ventaPendienteTransferencia(recibe);

    // 1. Actualizar deuda en la tabla clientes. No toca vencimiento ni renovación.
    const{error:eD}=await supabase.from("clientes").update({deuda_restante:nuevaDeuda}).eq("id",cliente.id);
    if(eD){toast.error("No se pudo registrar el pago");return;}

    // 2. Registrar el pago de deuda como ingreso real, con receptor propio.
    const notasPago=`Pago de deuda. Deuda restante: USD ${nuevaDeuda}`;
    const ingresoPago=buildIng(cliente.id,cliente.nombre||"",cliente.email||"",cliente.servicio,monto,fechaHoy,notasPago,{recibe,pendiente:pendienteDeRecepcion});
    const{data:ingPago,error:eI}=await supabase.from("ingresos").insert([ingresoPago]).select().single();
    if(eI){toast.error("Deuda actualizada, pero no se pudo registrar el ingreso");refetch();return;}

    const ingresoLocal={...(ingPago||ingresoPago),id:ingPago?.id||`tmp-deuda-${Date.now()}`,cliente_id:cliente.id,cliente_nombre:cliente.nombre,email:cliente.email,servicio:cliente.servicio,monto:Number(monto),fecha_pago:fechaHoy};
    setIngresos(prev=>[ingresoLocal,...prev]);
    setClientes(prev=>prev.map(c=>String(c.id)===String(cliente.id)?{...c,deuda_restante:nuevaDeuda}:c));
    setClienteDetalle(prev=>prev&&String(prev.id)===String(cliente.id)?{...prev,deuda_restante:nuevaDeuda}:prev);

    // 3. Caja: Cristian/Bahiano entran directo. Luigi queda pendiente hasta marcar recibido.
    if(!pendienteDeRecepcion){
      await registrarCajaDesdeVenta({fecha:fechaHoy,monto,recibe,nombre:cliente.nombre,clienteId:cliente.id,origen:"pago de deuda",ingresoId:ingPago?.id});
    }else{
      await registrarVentaPendiente({clienteId:cliente.id,ingresoId:ingPago?.id,nombre:cliente.nombre,servicio:cliente.servicio,monto,fecha:fechaHoy,vendedor:recibe,origen:"pago de deuda"});
    }

    const estadoTexto=pendienteDeRecepcion?` · Cobró ${recibe} · Pendiente de recepción`:` · Cobró ${recibe}`;
    await logH(user?.email,"registró pago de deuda","cliente",cliente.id,{nombre:cliente.nombre,monto_abonado:monto,deuda_restante:nuevaDeuda,recibe,pendiente_de_recepcion:pendienteDeRecepcion,ingreso_id:ingPago?.id||null});
    await logNC(cliente.id,user?.email,"pago",`Pago de deuda registrado. Monto: USD ${monto} · Deuda restante: USD ${nuevaDeuda}${estadoTexto}`,{monto_abonado:monto,deuda_restante:nuevaDeuda,recibe,pendiente_transferencia:pendienteDeRecepcion,ingreso_id:ingPago?.id||null});
    setPagoCliente(null);
    toast.success(pendienteDeRecepcion?`Pago de deuda registrado. Queda pendiente de recepción por ${recibe}.`:`Pago de deuda registrado en Caja de ${recibe}.`);
    refetch();
  }
  function abrirRenovar(cliente){
    const servicio=normalizeServicio(cliente.servicio);
    const va=cliente.vencimiento||cliente.fecha_vencimiento||resolveDueDate(cliente)||null;
    const fb=va||toISODate(getToday());
    setRenovarForm({id:cliente.id,nombre:cliente.nombre||"",email:cliente.email||"",telefono:cliente.telefono||"",servicio,fecha_inicio:fb,monto:safeNum(cliente.monto),duracion_dias:servicio==="clases"?0:svcDuration(servicio),deuda_restante:safeNum(cliente.deuda_restante),notas:cliente.notas||"",vendedor:"",transferido:true});
    setShowRenovar(true);
  }
  function handleSetView(v){setActiveView(v);setShowForm(false);}

  // ── Datos derivados ───────────────────────────────────────────────────────
  const computed=useMemo(()=>clientes.map(computeClient),[clientes]);
  const filtered=useMemo(()=>computed.filter(c=>{
    if(normalizeServicio(c.servicio)==="clases"&&c.estado_manual==="finalizado")return false;
    const txt=`${c.nombre||""} ${c.email||""} ${c.telefono||""}`.toLowerCase();
    const okB=txt.includes(busqueda.toLowerCase());
    const okF=filtro==="todos"||c.servicio===filtro||c.estadoSistema===filtro;
    return okB&&okF;
  }),[computed,busqueda,filtro]);
  const deudores=useMemo(()=>computed.filter(c=>Number(c.deuda_restante||0)>0),[computed]);
  const clasesList=useMemo(()=>computed.filter(c=>normalizeServicio(c.servicio)==="clases"),[computed]);
  const vencimientos=useMemo(()=>computed.filter(c=>normalizeServicio(c.servicio)!=="clases").sort((a,b)=>(!a.vencimiento?1:!b.vencimiento?-1:a.vencimiento.localeCompare(b.vencimiento))),[computed]);
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
  const ingresosDesdeMarzo=useMemo(()=>ingresos.filter(esIngresoHistorico),[ingresos]);
  const ingresosTotalesHistoricos=useMemo(()=>totalIngresosHistoricosPorMes(ingresos),[ingresos]);

  const resumen=useMemo(()=>{
    const b={activos:0,gracia:0,sacar:0,deudores:0,clases:0,ingresos:0};
    computed.forEach(c=>{
      if(c.estadoSistema==="activo")b.activos++;
      if(c.estadoSistema==="gracia")b.gracia++;
      if(c.estadoSistema==="sacar"||c.estadoSistema==="vencido")b.sacar++;
      if(Number(c.deuda_restante||0)>0)b.deudores++;
      if(c.servicio==="clases")b.clases++;
    });
    // Ingresos totales = marzo + abril + mayo + todos los meses siguientes.
    // Se calcula agrupando primero por mes y luego sumando esos mensuales,
    // así cada venta/renovación que refresca el mensual también refresca el total histórico.
    b.ingresos=ingresosTotalesHistoricos;
    return b;
  },[computed,ingresosTotalesHistoricos]);
  const totalDeuda=useMemo(()=>deudores.reduce((a,c)=>a+safeNum(c.deuda_restante),0),[deudores]);

  // Ventas pendientes de recepción: se manejan por venta/ingreso, no por cliente.
  // Así una renovación nueva no pisa una venta anterior que Luigi todavía debe transferir.
  const pendientesTransferencia=useMemo(()=>{
    const recibidas=new Set((transferenciasRecibidas||[]).map(n=>String(n.detalle?.ingreso_id||"")).filter(Boolean));
    const recibidasPendiente=new Set((transferenciasRecibidas||[]).map(n=>String(n.detalle?.pendiente_id||"")).filter(Boolean));
    const ingresosPorId=new Map((ingresos||[]).map(i=>[String(i.id),i]));
    const clientesPorId=new Map((computed||[]).map(c=>[String(c.id),c]));
    const desdeNotas=(ventasPendientesNotas||[]).map(n=>{
      const d=n.detalle||{};
      const ingresoId=String(d.ingreso_id||"");
      if((ingresoId&&recibidas.has(ingresoId))||recibidasPendiente.has(String(n.id)))return null;
      const ing=ingresoId?ingresosPorId.get(ingresoId):null;
      if(ingresoId&&!ing)return null; // ingreso eliminado desde Dashboard: no debe seguir pendiente
      const cliente=clientesPorId.get(String(d.cliente_id||n.cliente_id||ing?.cliente_id||""))||{};
      return{
        id:String(d.cliente_id||n.cliente_id||ing?.cliente_id||n.id),
        cliente_id:d.cliente_id||n.cliente_id||ing?.cliente_id||null,
        pendiente_id:n.id,
        ingreso_id:ingresoId||null,
        nombre:d.nombre||ing?.cliente_nombre||cliente.nombre||"Sin nombre",
        email:ing?.email||cliente.email||"",
        servicio:normalizeServicio(d.servicio||ing?.servicio||cliente.servicio),
        monto:safeNum(d.monto||ing?.monto||cliente.monto),
        vendedor:d.vendedor||cliente.vendedor||"Luigi",
        fecha_inicio:d.fecha_pago||ing?.fecha_pago||cliente.fecha_inicio||n.created_at,
        created_at:n.created_at,
        fromPendingNote:true
      };
    }).filter(Boolean);
    const clavesNotas=new Set(desdeNotas.map(p=>String(p.ingreso_id||"")).filter(Boolean));
    const legacy=(computed||[]).filter(c=>ventaPendienteTransferencia(c.vendedor)&&c.transferido!==true&&String(c.transferido)!=="true").map(c=>({
      ...c,cliente_id:c.id,ingreso_id:null,pendiente_id:null,fromPendingNote:false
    })).filter(c=>{
      // Evita duplicar si ya hay una nota pendiente para el último ingreso del cliente.
      const ult=[...(ingresos||[])].filter(i=>String(i.cliente_id||"")===String(c.id)).sort((a,b)=>String(b.fecha_pago||"").localeCompare(String(a.fecha_pago||""))||String(b.created_at||"").localeCompare(String(a.created_at||"")))[0];
      return !(ult?.id&&clavesNotas.has(String(ult.id)));
    });
    return [...desdeNotas,...legacy].sort((a,b)=>String(b.fecha_inicio||b.created_at||"").localeCompare(String(a.fecha_inicio||a.created_at||"")));
  },[ventasPendientesNotas,transferenciasRecibidas,ingresos,computed]);

  async function marcarTransferido(id, cliente, recibeFinal=""){
    const recibeCaja=["Cristian","Bahiano"].includes(recibeFinal)?recibeFinal:"";
    if(!recibeCaja){toast.error("Elegí si recibió Cristian o Bahiano");return;}
    const vendedorOriginal=cliente?.vendedor||"Luigi";
    const ingresoRelacionado=cliente?.ingreso_id
      ? (ingresos||[]).find(i=>String(i.id)===String(cliente.ingreso_id))||null
      : ([...(ingresos||[])]
          .filter(i=>String(i.cliente_id||"")===String(id))
          .sort((a,b)=>String(b.fecha_pago||"").localeCompare(String(a.fecha_pago||""))||String(b.created_at||"").localeCompare(String(a.created_at||"")))[0]||null);
    const montoRecibido=safeNum(cliente?.monto)||safeNum(ingresoRelacionado?.monto);
    const fechaRecepcion=toISODate(getToday());
    if(!montoRecibido){toast.error("No se pudo detectar el monto recibido");return;}

    // Solo actualizamos el estado operativo del cliente si esa venta pendiente sigue siendo
    // el estado actual. Si el cliente renovó después por Cristian/Bahiano, NO tocamos
    // ese estado: solo saldamos la venta vieja de Luigi.
    const clienteActual=(clientes||[]).find(c=>String(c.id)===String(id));
    const debeActualizarCliente=clienteActual&&String(clienteActual.vendedor||"")===String(vendedorOriginal)&&clienteActual.transferido!==true&&String(clienteActual.transferido)!=="true";
    if(debeActualizarCliente){
      const{error}=await supabase.from("clientes").update({transferido:true,vendedor:recibeCaja}).eq("id",id);
      if(error){toast.error("No se pudo marcar como recibido");return;}
      supabase.from("clientes").update({recibe_final:recibeCaja,fecha_transferencia:fechaRecepcion}).eq("id",id).then(()=>{});
      setClientes(prev=>prev.map(c=>String(c.id)===String(id)?{...c,transferido:true,vendedor:recibeCaja,recibe_final:recibeCaja,fecha_transferencia:fechaRecepcion}:c));
    }

    // La plata de Luigi recién entra en Caja el día que se marca recibida.
    // Insertamos la caja directa con el ingreso exacto, no con el cliente actual.
    const cajaPayload={
      cliente_id:null,
      usuario_email:user?.email||"—",
      tipo:"caja",
      contenido:`Caja diaria: ${recibeCaja} recibió USD ${montoRecibido} · Transferencia de ${vendedorOriginal} · Venta: ${cliente?.nombre||ingresoRelacionado?.cliente_nombre||""}`,
      detalle:{concepto:"movimiento",origen:`recepción de ${vendedorOriginal}`,fecha:fechaRecepcion,recibe:recibeCaja,monto:montoRecibido,nombre:cliente?.nombre||ingresoRelacionado?.cliente_nombre||"",cliente_id:id||cliente?.cliente_id||null,ingreso_id:ingresoRelacionado?.id||cliente?.ingreso_id||null,vendedor_original:vendedorOriginal,pendiente_id:cliente?.pendiente_id||null}
    };
    const{data:cajaCreada,error:cajaError}=await supabase.from("notas_cliente").insert([cajaPayload]).select().single();
    if(cajaError){toast.error("Se marcó recibido, pero no se pudo sumar a Caja");}
    else{
      setCajaMovimientos(prev=>[cajaCreada||{...cajaPayload,id:`tmp-caja-recibida-${Date.now()}`,created_at:new Date().toISOString()},...prev]);
      await logH(user?.email,"registró caja por transferencia recibida","Caja diaria",cajaCreada?.id||null,{nombre:"Caja diaria",fecha:fechaRecepcion,recibe:recibeCaja,monto:montoRecibido,venta:cliente?.nombre||ingresoRelacionado?.cliente_nombre||"",vendedor:vendedorOriginal,ingreso_id:ingresoRelacionado?.id||cliente?.ingreso_id||null,pendiente_id:cliente?.pendiente_id||null});
    }

    // Dejar marcado el ingreso original como recibido, sin cambiar quién cobró originalmente.
    // Esto evita que renovaciones posteriores pisen pendientes anteriores y deja el detalle legible.
    if(ingresoRelacionado?.id){
      const notasBase=String(ingresoRelacionado.notas||"");
      const marca=`Transferencia recibida por ${recibeCaja} el ${formatDate(fechaRecepcion)}`;
      const notasActualizadas=notasBase.toLowerCase().includes("transferencia recibida por")
        ? limpiarTextoRecepcion(notasBase)
        : `${limpiarTextoRecepcion(notasBase)} · ${marca}`.trim();
      supabase.from("ingresos").update({notas:notasActualizadas}).eq("id",ingresoRelacionado.id).then(()=>{});
      setIngresos(prev=>prev.map(i=>String(i.id)===String(ingresoRelacionado.id)?{...i,notas:notasActualizadas}:i));
    }

    const reciboNota={
      id:`tmp-recibo-${Date.now()}`,
      cliente_id:id,
      created_at:new Date().toISOString(),
      tipo:"pago",
      contenido:`${recibeCaja} recibió transferencia de ${vendedorOriginal}. Venta: ${cliente?.nombre||ingresoRelacionado?.cliente_nombre||""} · Monto: USD ${montoRecibido}`,
      detalle:{vendedor:vendedorOriginal,recibe_final:recibeCaja,fecha_recepcion:fechaRecepcion,monto:montoRecibido,ingreso_id:ingresoRelacionado?.id||cliente?.ingreso_id||null,caja_id:cajaCreada?.id||null,pendiente_id:cliente?.pendiente_id||null}
    };
    await logH(user?.email,"recibió transferencia","cliente",id,{nombre:cliente?.nombre||ingresoRelacionado?.cliente_nombre||"",vendedor:vendedorOriginal,recibe_final:recibeCaja,fecha_recepcion:fechaRecepcion,monto:montoRecibido,ingreso_id:ingresoRelacionado?.id||cliente?.ingreso_id||null,caja_id:cajaCreada?.id||null,pendiente_id:cliente?.pendiente_id||null});
    const notaPago=await logNC(id,user?.email,"pago",reciboNota.contenido,reciboNota.detalle);
    setTransferenciasRecibidas(prev=>[notaPago||reciboNota,...prev]);
    if(cliente?.pendiente_id)setVentasPendientesNotas(prev=>prev.filter(n=>String(n.id)!==String(cliente.pendiente_id)));
    await refetch();
    toast.success(`✓ ${montoRecibido} USD recibidos por ${recibeCaja}`);
  }

  async function registrarMovimientoCaja(){
    const monto=Number(cajaForm.monto||0);
    const fecha=dateOnly(cajaForm.fecha)||toISODate(getToday());
    const recibe=cajaForm.recibe||"Cristian";
    if(monto<=0){toast.error("Ingresá un monto válido");return;}
    if(!["Cristian","Bahiano"].includes(recibe)){toast.error("Elegí quién recibió");return;}

    // Si esa fecha había sido quitada del calendario por error, al cargar un nuevo movimiento
    // se reactiva automáticamente. Así no queda bloqueada para siempre por el marcador
    // dia_eliminado y la tarjeta vuelve a aparecer en el calendario.
    const eliminadosFecha=(cajaMovimientos||[]).filter(m=>
      m?.tipo==="caja"&&
      (m?.detalle||{})?.concepto==="dia_eliminado"&&
      dateOnly((m?.detalle||{})?.fecha)===fecha
    );
    const eliminadosReales=eliminadosFecha.map(m=>m.id).filter(Boolean).filter(id=>!String(id).startsWith("tmp-"));
    if(eliminadosReales.length){
      const{error:restoreError}=await supabase.from("notas_cliente").delete().in("id",eliminadosReales);
      if(restoreError){toast.error("No se pudo reactivar esa fecha de caja");return;}
    }
    if(eliminadosFecha.length){
      setCajaMovimientos(prev=>prev.filter(m=>!eliminadosFecha.some(x=>x.id===m.id)));
      await logH(user?.email,"reactivó día de caja","Caja diaria",null,{nombre:"Caja diaria",fecha,motivo:"nuevo movimiento cargado"});
    }

    const payload={
      cliente_id:null,
      usuario_email:user?.email||"—",
      tipo:"caja",
      contenido:`Caja diaria: ${recibe} recibió USD ${monto}`,
      detalle:{concepto:"movimiento",fecha,recibe,monto}
    };
    const{data,error}=await supabase.from("notas_cliente").insert([payload]).select().single();
    if(error){toast.error("No se pudo registrar el movimiento de caja");return;}
    setCajaMovimientos(prev=>[data||{...payload,id:`tmp-caja-${Date.now()}`,created_at:new Date().toISOString()},...prev.filter(m=>!eliminadosFecha.some(x=>x.id===m.id))]);
    setCajaForm(prev=>({...prev,monto:""}));
    await logH(user?.email,"registró movimiento de caja","Caja diaria",data?.id||null,{nombre:"Caja diaria",fecha,recibe,monto});
    toast.success("Movimiento de caja registrado");
  }
  async function marcarCajaNeteada(fecha,saldo){
    const saldoReal=Number(saldo||0);
    const texto=saldoReal>0?`Cristian saldó USD ${Math.abs(saldoReal)} con Bahiano`:saldoReal<0?`Bahiano saldó USD ${Math.abs(saldoReal)} con Cristian`:"Caja neteada";
    const payload={
      cliente_id:null,
      usuario_email:user?.email||"—",
      tipo:"caja",
      contenido:`Caja diaria neteada: ${texto}`,
      detalle:{concepto:"neteada",fecha:dateOnly(fecha)||toISODate(getToday()),saldo_cancelado:saldoReal}
    };
    const{data,error}=await supabase.from("notas_cliente").insert([payload]).select().single();
    if(error){toast.error("No se pudo marcar la caja como neteada");return;}
    setCajaMovimientos(prev=>[data||{...payload,id:`tmp-caja-${Date.now()}`,created_at:new Date().toISOString()},...prev]);
    await logH(user?.email,"marcó caja neteada","Caja diaria",data?.id||null,{nombre:"Caja diaria",fecha:payload.detalle.fecha,saldo_cancelado:saldoReal});
    toast.success("Caja marcada como neteada");
  }
  async function eliminarMovimientoCaja(id){
    const mov=(cajaBaseMovs||cajaMovimientos||[]).find(m=>String(m.id)===String(id));
    if(!mov){toast.error("No se encontró el movimiento");return;}
    const d=mov.detalle||{};
    const esVirtual=!!mov.virtual||String(id).startsWith("auto-")||String(id).startsWith("tmp-");

    async function ocultarMovimiento(){
      const payload={
        cliente_id:null,
        usuario_email:user?.email||"—",
        tipo:"caja",
        contenido:`Movimiento de caja eliminado: ${d.recibe||mov.recibe||"—"} USD ${safeNum(d.monto||mov.monto)}`,
        detalle:{
          concepto:"movimiento_oculto",
          target_id:String(id),
          fecha:dateOnly(d.fecha||mov.fecha),
          recibe:d.recibe||mov.recibe||"",
          monto:safeNum(d.monto||mov.monto),
          nombre:d.nombre||"",
          cliente_id:d.cliente_id||mov.cliente_id||null,
          ingreso_id:d.ingreso_id||null,
          origen:d.origen||"eliminado_manual"
        }
      };
      const{data,error}=await supabase.from("notas_cliente").insert([payload]).select().single();
      if(error){toast.error("No se pudo eliminar el movimiento");return false;}
      setCajaMovimientos(prev=>[data||{...payload,id:`tmp-caja-oculto-${Date.now()}`,created_at:new Date().toISOString()},...prev.filter(m=>String(m.id)!==String(id))]);
      return true;
    }

    if(esVirtual){
      const ok=await ocultarMovimiento();
      if(!ok)return;
    }else{
      const{error}=await supabase.from("notas_cliente").delete().eq("id",id);
      if(error){
        const ok=await ocultarMovimiento();
        if(!ok)return;
      }else{
        setCajaMovimientos(prev=>prev.filter(m=>String(m.id)!==String(id)));
      }
    }

    await logH(user?.email,"eliminó movimiento de caja","Caja diaria",id,{nombre:"Caja diaria",fecha:d.fecha||mov.fecha,recibe:d.recibe||mov.recibe,monto:d.monto||mov.monto,concepto:d.concepto||mov.concepto||"movimiento"});
    toast.success("Movimiento eliminado");
  }

  async function eliminarDiaCaja(fecha){
    const f=dateOnly(fecha)||toISODate(getToday());
    const delDia=(cajaMovimientos||[]).filter(m=>dateOnly(m.detalle?.fecha)===f&&m.tipo==="caja"&&m.detalle?.concepto!=="dia_eliminado");
    const total=delDia.filter(m=>m.detalle?.concepto!=="neteada").reduce((a,m)=>a+safeNum(m.detalle?.monto),0);
    const payload={
      cliente_id:null,
      usuario_email:user?.email||"—",
      tipo:"caja",
      contenido:`Día de caja eliminado del calendario: ${formatDate(f)}`,
      detalle:{concepto:"dia_eliminado",fecha:f,total,cantidad:delDia.length}
    };
    const{data,error}=await supabase.from("notas_cliente").insert([payload]).select().single();
    if(error){toast.error("No se pudo quitar el día de caja");return;}
    setCajaMovimientos(prev=>[data||{...payload,id:`tmp-caja-${Date.now()}`,created_at:new Date().toISOString()},...prev]);
    await logH(user?.email,"eliminó día de caja del calendario","Caja diaria",data?.id||null,{nombre:"Caja diaria",fecha:f,cantidad:delDia.length,total});
    toast.success("Día eliminado del calendario de caja");
  }

  async function restaurarDiaCaja(fecha){
    const f=dateOnly(fecha)||toISODate(getToday());
    const ids=(cajaMovimientos||[]).filter(m=>dateOnly(m.detalle?.fecha)===f&&m.tipo==="caja"&&m.detalle?.concepto==="dia_eliminado").map(m=>m.id).filter(Boolean);
    const reales=ids.filter(id=>!String(id).startsWith("tmp-"));
    if(reales.length){
      const{error}=await supabase.from("notas_cliente").delete().in("id",reales);
      if(error){toast.error("No se pudo restaurar el día");return;}
    }
    setCajaMovimientos(prev=>prev.filter(m=>!ids.includes(m.id)));
    await logH(user?.email,"restauró día de caja","Caja diaria",null,{nombre:"Caja diaria",fecha:f});
    toast.success("Día restaurado en calendario de caja");
  }

  async function deshacerCajaNeteada(ids=[]){
    const reales=(ids||[]).filter(Boolean).filter(id=>!String(id).startsWith("tmp-"));
    if(reales.length){
      const{error}=await supabase.from("notas_cliente").delete().in("id",reales);
      if(error){toast.error("No se pudo deshacer el neteo");return;}
    }
    setCajaMovimientos(prev=>prev.filter(m=>!ids.includes(m.id)));
    await logH(user?.email,"deshizo caja neteada","Caja diaria",null,{nombre:"Caja diaria",cantidad:ids?.length||0});
    toast.success("Caja neteada deshecha");
  }

  async function actualizarVendedor(id,vendedor){
    const transferido=!ventaPendienteTransferencia(vendedor);
    const{error}=await supabase.from("clientes").update({vendedor,transferido}).eq("id",id);
    if(error){toast.error("No se pudo actualizar");return;}
    setClientes(prev=>prev.map(c=>c.id===id?{...c,vendedor,transferido}:c));
    const c=clientes.find(cl=>cl.id===id);
    const pendienteVenta=ventaPendienteTransferencia(vendedor);
    await logH(user?.email,"actualizó quién recibió la venta","cliente",id,{nombre:c?.nombre,recibe:vendedor||"Cristian",pendiente_transferencia:pendienteVenta});
    await logNC(id,user?.email,"pago",`Recibe la venta: ${vendedor||"Cristian"}${pendienteVenta?" · Pendiente de transferencia a Cristian":""}`,{recibe:vendedor||"Cristian",pendiente_transferencia:pendienteVenta});
  }
  const today=getToday();
  const curMK=monthKey(toISODate(today));
  const prevMD=new Date(today.getFullYear(),today.getMonth()-1,1);
  const curMI=useMemo(()=>ingresos.filter(i=>{const d=parseISODate(i.fecha_pago);return d&&d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth();}),[ingresos]);
  const prevMI=useMemo(()=>ingresos.filter(i=>{const d=parseISODate(i.fecha_pago);return d&&d.getFullYear()===prevMD.getFullYear()&&d.getMonth()===prevMD.getMonth();}),[ingresos]);
  const ingMes=curMI.reduce((a,i)=>a+safeNum(i.monto),0);
  const ingMesAnt=prevMI.reduce((a,i)=>a+safeNum(i.monto),0);
  const trendMes=ingMesAnt>0?Math.round(((ingMes-ingMesAnt)/ingMesAnt)*100):null;
  const dashStats=useMemo(()=>({
    ingMes,
    ventasMes:curMI.length,
    bkMes:buildBreakdown(curMI),
    // Total histórico calculado igual que el resumen mensual: marzo 2026 en adelante.
    bkTotal:buildBreakdown(ingresosDesdeMarzo)
  }),[ingresosDesdeMarzo,curMI,ingMes]);

  // Promedio de ventas nuevas por día del mes actual
  // = total nuevos clientes (planes) este mes / días transcurridos del mes
  const ventaPromedioDia=useMemo(()=>{
    const nuevosDelMes=curMI.filter(i=>{
      if(normalizeServicio(i.servicio)!=="mensual"&&normalizeServicio(i.servicio)!=="anual")return false;
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
    ingresosDesdeMarzo.forEach(i=>{
      if(!i.fecha_pago)return;
      const key=monthKey(i.fecha_pago);
      if(!map.has(key))map.set(key,{key,mensual:0,anual:0,clases:0,total:0,vM:0,vA:0,vC:0});
      const r=map.get(key);const m=Number(i.monto||0);
      const servicio=normalizeServicio(i.servicio);
      if(servicio==="mensual"){r.mensual+=m;r.vM++;}
      else if(servicio==="anual"){r.anual+=m;r.vA++;}
      else{r.clases+=m;r.vC++;}
      r.total+=m;
    });
    return Array.from(map.values()).sort((a,b)=>a.key.localeCompare(b.key));
  },[ingresosDesdeMarzo]);
  const resumenConTrend=useMemo(()=>resumenMensual.map((r,i)=>{
    const prev=resumenMensual[i-1];
    const trend=prev&&prev.total>0?Math.round(((r.total-prev.total)/prev.total)*100):null;
    return{...r,trend};
  }),[resumenMensual]);
  const maxTotal=resumenMensual.length?Math.max(...resumenMensual.map(r=>r.total)):1;
  const semanaActualKey=weekKeyFromDate(today);
  const distribucionSemanal=useMemo(()=>{
    const map=new Map();
    function ensure(key){
      if(!map.has(key))map.set(key,{key,total:0,ventas:0,dias:new Map()});
      return map.get(key);
    }
    const clientesPorId=new Map(computed.map(c=>[String(c.id),c]));
    const notasPorCliente=new Map();
    (transferenciasRecibidas||[]).forEach(n=>{
      const cid=String(n.cliente_id||"");
      if(!cid)return;
      if(!notasPorCliente.has(cid))notasPorCliente.set(cid,[]);
      notasPorCliente.get(cid).push(n);
    });
    notasPorCliente.forEach(arr=>arr.sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||""))));

    function infoRecepcion(i){
      const cliente=i.cliente_id?clientesPorId.get(String(i.cliente_id)):null;
      const vendedor=String(i.vendedor||i.recibe||i.recibio_venta||i.recibe_venta||cliente?.vendedor||"").trim();
      const esVendedor=VENDEDORES.includes(vendedor);
      if(!esVendedor)return{recibido:true,fecha:i.fecha_pago};

      // Si sigue en pendientes de recepción, todavía NO cuenta en ninguna semana.
      const clientePendiente=cliente&&cliente.vendedor===vendedor&&cliente.transferido!==true&&String(cliente.transferido)!=="true";
      if(clientePendiente)return{recibido:false,fecha:null};

      // Si ya se marcó recibido, cuenta en la semana en que Cristian recibió la transferencia.
      const notas=notasPorCliente.get(String(i.cliente_id||""))||[];
      const monto=safeNum(i.monto);
      const nota=notas.find(n=>{
        const d=n.detalle||{};
        const mismoVendedor=!d.vendedor||String(d.vendedor)===vendedor;
        const mismoMonto=!d.monto||safeNum(d.monto)===monto;
        return mismoVendedor&&mismoMonto;
      })||notas[0];
      return{recibido:true,fecha:nota?.created_at||i.fecha_pago};
    }

    ingresosDesdeMarzo.forEach(i=>{
      if(!i.fecha_pago)return;
      const rec=infoRecepcion(i);
      if(!rec.recibido||!rec.fecha)return;
      const d=parseISODate(rec.fecha);
      if(!d)return;
      const key=weekKeyFromDate(d);
      const r=ensure(key);
      const monto=safeNum(i.monto);
      r.total+=monto;
      r.ventas+=1;
      const dayKey=toISODate(d);
      r.dias.set(dayKey,(r.dias.get(dayKey)||0)+monto);
    });

    // Completar semanas sin ingresos para que funcione como calendario y siempre se vea la semana actual.
    const keys=Array.from(map.keys()).sort();
    let start=keys.length?parseISODate(keys[0]):startOfWeekMonday(today);
    let end=keys.length?parseISODate(keys[keys.length-1]):startOfWeekMonday(today);
    const current=startOfWeekMonday(today);
    if(start>current)start=current;
    if(end<current)end=current;
    const cursor=new Date(start);
    while(cursor<=end){ensure(toISODate(cursor));cursor.setDate(cursor.getDate()+7);}
    return Array.from(map.values()).sort((a,b)=>b.key.localeCompare(a.key)).map(r=>({
      ...r,
      dias:Array.from({length:7},(_,idx)=>{const d=parseISODate(r.key);d.setDate(d.getDate()+idx);const k=toISODate(d);return{key:k,label:weekDayLabel(k),total:r.dias.get(k)||0};})
    }));
  },[ingresosDesdeMarzo,computed,transferenciasRecibidas,today]);
  const semanaActual=useMemo(()=>distribucionSemanal.find(w=>w.key===semanaActualKey),[distribucionSemanal,semanaActualKey]);
  const maxSemanaTotal=distribucionSemanal.length?Math.max(...distribucionSemanal.map(w=>w.total),1):1;
  useEffect(()=>{
    if(activeView==="semanal")setTimeout(()=>semanaActualRef.current?.scrollIntoView({behavior:"smooth",block:"center"}),80);
  },[activeView,semanaActualKey]);
  const cajaBaseMovs=useMemo(()=>{
    const realesRaw=(cajaMovimientos||[]).map(m=>{
      const d=m.detalle||{};
      const concepto=d.concepto||"movimiento";
      const fecha=dateOnly(d.fecha)||dateOnly(m.created_at)||toISODate(getToday());
      const recibe=String(d.recibe||"");
      const monto=safeNum(d.monto);
      const saldoCancelado=safeNum(d.saldo_cancelado);
      return{...m,concepto,fecha,recibe,monto,saldoCancelado};
    }).filter(m=>m.fecha);

    const movimientosOcultos=realesRaw.filter(m=>m.concepto==="movimiento_oculto"||m.concepto==="movimiento_eliminado");
    const estaOculto=m=>movimientosOcultos.some(o=>{
      const d=o.detalle||{};
      // Regla estable: una eliminación de Caja solo puede ocultar el movimiento exacto
      // o el ingreso exacto. Nunca ocultamos por cliente+fecha+monto/nombre porque eso
      // rompe el caso real: mismo alumno, mismo día, mismo monto, varios ingresos distintos
      // (Luigi pendiente + renovación a Cristian/Bahiano).
      if(d.target_id&&String(d.target_id)===String(m.id))return true;
      const dIngreso=String(d.ingreso_id||"");
      const mIngreso=String(m.detalle?.ingreso_id||"");
      if(dIngreso&&mIngreso&&dIngreso===mIngreso)return true;
      return false;
    });

    const reales=realesRaw.filter(m=>m.concepto!=="movimiento_oculto"&&m.concepto!=="movimiento_eliminado"&&!estaOculto(m));

    // Respaldo fuerte: la Caja se arma por ingreso_id.
    // Cada venta/renovación es independiente, aunque sea la misma persona, mismo día y mismo monto.
    // Si el ingreso fue directo a Cristian/Bahiano, entra por fecha_pago.
    // Si fue de Luigi, entra recién cuando existe una transferencia recibida y con fecha de recepción.
    const movimientosReales=reales.filter(m=>m.concepto==="movimiento");
    // Deduplicación segura: solo por ingreso_id cuando existe.
    // No deduplicar por cliente+fecha+monto porque rompe renovaciones repetidas del mismo día
    // y el flujo Luigi pendiente + renovación directa.
    const realPorIngreso=new Set(movimientosReales.map(m=>String(m.detalle?.ingreso_id||"")).filter(Boolean));
    const realSinIngreso=new Set(movimientosReales
      .filter(m=>!String(m.detalle?.ingreso_id||""))
      .map(m=>`${dateOnly(m.fecha)}|${m.recibe}|${safeNum(m.monto)}|${String(m.detalle?.cliente_id||m.cliente_id||"")}|${normCajaText(m.detalle?.nombre||"")}`));

    const transferenciasPorIngreso=new Map();
    (transferenciasRecibidas||[]).forEach(n=>{
      const d=n.detalle||{};
      const ingresoId=String(d.ingreso_id||"");
      if(!ingresoId)return;
      const recibe=cajaRecibeDirecto(d.recibe_final);
      const fecha=dateOnly(d.fecha_recepcion)||dateOnly(n.created_at)||toISODate(getToday());
      if(!recibe)return;
      transferenciasPorIngreso.set(ingresoId,{recibe,fecha,nombre:(n.contenido||"").replace(/^.*Venta:\s*/i,"").split("·")[0]||"",nota:n});
    });

    const porCliente=Object.fromEntries((computed||[]).map(c=>[String(c.id),c]));
    const virtuales=(ingresos||[]).map(i=>{
      const c=porCliente[String(i.cliente_id)]||{};
      const info=infoCajaDesdeIngreso(i,transferenciasPorIngreso);
      if(!info)return null;
      const fecha=dateOnly(info.fecha)||dateOnly(i.fecha_pago)||dateOnly(i.created_at)||toISODate(getToday());
      if(!cajaFechaHabilitada(fecha))return null;
      const monto=safeNum(i.monto);
      if(monto<=0)return null;
      const nombre=i.cliente_nombre||c.nombre||info.nombre||"";
      const ingresoId=String(i.id||"");
      const keySinIngreso=`${fecha}|${info.recibe}|${monto}|${String(i.cliente_id||"")}|${normCajaText(nombre)}`;
      if(ingresoId&&realPorIngreso.has(ingresoId))return null;
      if(!ingresoId&&realSinIngreso.has(keySinIngreso))return null;
      return{
        id:`auto-ingreso-${ingresoId||fecha}-${fecha}-${info.recibe}-${String(i.cliente_id||"")}`,
        tipo:"caja",
        created_at:i.created_at||`${fecha}T12:00:00`,
        detalle:{concepto:"movimiento",origen:info.origen,fecha,recibe:info.recibe,monto,nombre,cliente_id:i.cliente_id||null,ingreso_id:i.id||null},
        concepto:"movimiento",fecha,recibe:info.recibe,monto,saldoCancelado:0,
        virtual:true
      };
    }).filter(Boolean).filter(m=>!estaOculto(m));

    const transferenciasVirtuales=(transferenciasRecibidas||[]).map(n=>{
      const d=n.detalle||{};
      const fecha=dateOnly(d.fecha_recepcion)||dateOnly(n.created_at)||toISODate(getToday());
      const quien=cajaRecibeDirecto(d.recibe_final);
      const monto=safeNum(d.monto);
      const ingresoId=String(d.ingreso_id||"");
      const clienteId=String(n.cliente_id||d.cliente_id||"");
      if(!cajaFechaHabilitada(fecha)||!quien||monto<=0)return null;
      // Si el ingreso existe, el respaldo por ingresos ya genera este movimiento.
      // Solo usamos este respaldo para transferencias viejas sin ingreso_id.
      if(ingresoId&&(ingresos||[]).some(i=>String(i.id)===ingresoId))return null;
      const keySinIngreso=`${fecha}|${quien}|${monto}|${clienteId}|${normCajaText((n.contenido||"").replace(/^.*Venta:\s*/i,"").split("·")[0]||"")}`;
      if(realSinIngreso.has(keySinIngreso))return null;
      return{
        id:`auto-transferencia-${n.id||fecha}-${clienteId}`,
        tipo:"caja",
        created_at:n.created_at||`${fecha}T12:00:00`,
        detalle:{concepto:"movimiento",origen:"transferencia recibida",fecha,recibe:quien,monto,nombre:(n.contenido||"").replace(/^.*Venta:\s*/i,"").split("·")[0]||"",cliente_id:clienteId||null,ingreso_id:ingresoId||null},
        concepto:"movimiento",fecha,recibe:quien,monto,saldoCancelado:0,
        virtual:true
      };
    }).filter(Boolean).filter(m=>!estaOculto(m));
    return [...reales,...virtuales,...transferenciasVirtuales];
  },[cajaMovimientos,ingresos,computed,transferenciasRecibidas]);
  const cajaDiasEliminados=useMemo(()=>{
    const byFecha={};
    cajaBaseMovs.forEach(m=>{
      const f=m.fecha;
      if(!f)return;
      const ts=new Date(m.created_at||0).getTime()||0;
      if(!byFecha[f])byFecha[f]={ultimoEliminado:0,ultimoMovimiento:0};
      if(m.concepto==="dia_eliminado")byFecha[f].ultimoEliminado=Math.max(byFecha[f].ultimoEliminado,ts);
      if(m.concepto!=="dia_eliminado")byFecha[f].ultimoMovimiento=Math.max(byFecha[f].ultimoMovimiento,ts);
    });
    return Object.entries(byFecha)
      .filter(([,v])=>v.ultimoEliminado>0&&v.ultimoEliminado>=v.ultimoMovimiento)
      .map(([f])=>f)
      .sort((a,b)=>b.localeCompare(a));
  },[cajaBaseMovs]);
  const cajaDiaria=useMemo(()=>{
    const eliminados=new Set(cajaDiasEliminados);
    const movs=cajaBaseMovs.filter(m=>m.concepto!=="dia_eliminado"&&!eliminados.has(m.fecha));
    const keys=new Set(movs.map(m=>m.fecha));
    if(!eliminados.has(toISODate(getToday())))keys.add(toISODate(getToday()));
    const sortedKeys=Array.from(keys).sort();
    let saldo=0;
    const rows=[];
    sortedKeys.forEach(key=>{
      const delDia=movs.filter(m=>m.fecha===key);
      const movimientos=delDia.filter(m=>m.concepto!=="neteada");
      const neteos=delDia.filter(m=>m.concepto==="neteada");
      const cristian=movimientos.filter(m=>m.recibe==="Cristian").reduce((a,m)=>a+safeNum(m.monto),0);
      const bahiano=movimientos.filter(m=>m.recibe==="Bahiano").reduce((a,m)=>a+safeNum(m.monto),0);
      const total=cristian+bahiano;
      const saldoInicial=saldo;
      const saldoDia=cristian-(total/2);
      const saldoAntesNeteo=saldoInicial+saldoDia;
      const saldoCancelado=neteos.reduce((a,m)=>a+safeNum(m.saldoCancelado),0);
      const saldoFinal=saldoAntesNeteo-saldoCancelado;
      const neteado=neteos.length>0&&Math.abs(saldoFinal)<0.01;
      rows.push({key,cristian,bahiano,total,saldoInicial,saldoDia,saldoAntesNeteo,saldoCancelado,saldoFinal,neteado,movimientos,neteos,registros:delDia});
      saldo=saldoFinal;
    });
    return rows.sort((a,b)=>b.key.localeCompare(a.key));
  },[cajaBaseMovs,cajaDiasEliminados]);
  const cajaHoy=useMemo(()=>cajaDiaria.find(r=>r.key===toISODate(getToday())),[cajaDiaria]);
  const cajaSaldoActual=cajaDiaria.length?cajaDiaria[0].saldoFinal:0;
  function cajaTextoSaldo(saldo){
    const v=Number(saldo||0);
    if(Math.abs(v)<0.01)return"Caja neteada";
    return v>0?`Cristian debe enviar USD ${Math.abs(v)} a Bahiano`:`Bahiano debe enviar USD ${Math.abs(v)} a Cristian`;
  }

  const tasaRenovacion=useMemo(()=>{
    // Usar cliente_id si existe, sino email como identificador
    const keyOf=i=>i.cliente_id?`id:${i.cliente_id}`:i.email?`email:${i.email.toLowerCase().trim()}`:null;
    const planes=["mensual","anual"];
    const pagaronMesAnt=new Set(
      prevMI.filter(i=>planes.includes(normalizeServicio(i.servicio))).map(keyOf).filter(Boolean)
    );
    if(pagaronMesAnt.size===0)return null;
    const pagaronEsteMes=new Set(
      curMI.filter(i=>planes.includes(normalizeServicio(i.servicio))).map(keyOf).filter(Boolean)
    );
    let renovaron=0;
    pagaronMesAnt.forEach(k=>{if(pagaronEsteMes.has(k))renovaron++;});
    return Math.round((renovaron/pagaronMesAnt.size)*100);
  },[prevMI,curMI]);
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
  const cajaPag=usePagination(cajaDiaria,PAGE.caja);
  const cHoyPag=usePagination(vencimientosCriticos.hoy,PAGE.crit);
  const cGrPag=usePagination(vencimientosCriticos.gracia,PAGE.crit);
  const cVePag=usePagination(vencimientosCriticos.vencidos,PAGE.crit);
  useEffect(()=>{basePag.setPage(1);},[busqueda,filtro]);

  // ── Métricas mensuales persistidas ───────────────────────────────────────
  const [metricasGuardadas,setMetricasGuardadas]=useState([]);

  useEffect(()=>{
    supabase.from("metricas_mensuales").select("*").order("mes",{ascending:true})
      .then(({data})=>{if(data)setMetricasGuardadas(data);});
  },[]);

  // Guardar métricas del mes anterior automáticamente si no están guardadas
  useEffect(()=>{
    if(!ingresos.length||!computed.length)return;
    const mesAnteriorKey=monthKey(toISODate(prevMD));
    const yaGuardado=metricasGuardadas.some(m=>m.mes===mesAnteriorKey);
    if(yaGuardado)return;

    // Calcular métricas del mes anterior
    const ingMesAnt=ingresos.filter(i=>i.fecha_pago&&monthKey(i.fecha_pago)===mesAnteriorKey);
    if(ingMesAnt.length===0)return; // sin datos, no guardar

    const totalIngMesAnt=ingMesAnt.reduce((a,i)=>a+safeNum(i.monto),0);
    const diasMesAnt=new Date(prevMD.getFullYear(),prevMD.getMonth()+1,0).getDate();

    // Nuevos clientes mes anterior
    const nuevosMesAnt=ingMesAnt.filter(i=>{
      if(normalizeServicio(i.servicio)!=="mensual"&&normalizeServicio(i.servicio)!=="anual")return false;
      const ant=ingresos.filter(j=>j.cliente_id===i.cliente_id&&j.fecha_pago<i.fecha_pago);
      return ant.length===0;
    });
    const vpdMesAnt=diasMesAnt>0?Math.round((nuevosMesAnt.length/diasMesAnt)*100)/100:0;

    // Tasa de renovación mes anterior
    const mesDosAtras=new Date(prevMD.getFullYear(),prevMD.getMonth()-1,1);
    const mesDosAtrasKey=monthKey(toISODate(mesDosAtras));
    const vcMesAnt=computed.filter(c=>c.vencimiento&&monthKey(c.vencimiento)===mesDosAtrasKey);
    let tasaMesAnt=null;
    if(vcMesAnt.length>0){
      const rnMesAnt=vcMesAnt.filter(c=>ingMesAnt.some(i=>i.cliente_id===c.id));
      tasaMesAnt=Math.round((rnMesAnt.length/vcMesAnt.length)*100);
    }

    const totalClientesMesAnt=computed.length;

    supabase.from("metricas_mensuales").upsert([{
      mes:mesAnteriorKey,
      tasa_renovacion:tasaMesAnt,
      nuevos_clientes:nuevosMesAnt.length,
      total_ingresos:totalIngMesAnt,
      total_clientes:totalClientesMesAnt,
      ventas_por_dia:vpdMesAnt,
    }],{onConflict:"mes"}).then(({error})=>{
      if(!error){
        setMetricasGuardadas(prev=>[...prev.filter(m=>m.mes!==mesAnteriorKey),{mes:mesAnteriorKey,tasa_renovacion:tasaMesAnt,nuevos_clientes:nuevosMesAnt.length,total_ingresos:totalIngMesAnt,total_clientes:totalClientesMesAnt,ventas_por_dia:vpdMesAnt}]);
      }
    });
  },[ingresos,computed,metricasGuardadas]);

  // ── Login ─────────────────────────────────────────────────────────────────
  if(!user){
    return(
      <>
        <ToastContainer toasts={toast.toasts} remove={toast.remove}/>
        <div style={{display:"flex",minHeight:"100vh",alignItems:"center",justifyContent:"center",background:"linear-gradient(180deg,#0b1220 0%,#070b13 100%)",padding:24}}>
          <div style={{width:390,background:"#111827",borderRadius:24,padding:38,border:"1px solid #263754",boxShadow:"0 24px 70px rgba(0,0,0,0.58)"}}>
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
    <div className={dark?"sc-app-shell sc-dark":"sc-app-shell"} style={{minHeight:"100vh",background:t.bg,color:t.text,fontFamily:"'Inter','Segoe UI',Arial,sans-serif",letterSpacing:"-0.005em"}}>
      <ToastContainer toasts={toast.toasts} remove={toast.remove}/>
      {confirm&&<ConfirmModal open={!!confirm} title={confirm.title} message={confirm.message} confirmLabel={confirm.label} danger={confirm.danger}
        onConfirm={()=>{
          const montoActual=confirm.montoRenovacion;
          const vendedorActual=vendedorRenovacion;
          if(confirm.showRecibeFinal){
            const recibeFinal=confirm.recibeFinal;
            if(!["Cristian","Bahiano"].includes(recibeFinal)){toast.error("Elegí quién recibió la plata");return;}
            confirm.onConfirmFn?confirm.onConfirmFn(recibeFinal):confirm.onConfirm?.();
          }else{
            confirm.onConfirmFn?confirm.onConfirmFn(vendedorActual,montoActual):confirm.onConfirm();
          }
          setConfirm(null);setVendedorRenovacion("");
        }}
        onCancel={()=>{setConfirm(null);setVendedorRenovacion("");}} t={t}>
        {confirm.showVendedor&&(
          <div style={{display:"grid",gap:12,marginBottom:4}}>
            <div>
              <label style={{display:"block",fontSize:11,color:t.textMuted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6}}>Monto recibido (USD)</label>
              <input type="number" value={confirm.montoRenovacion??confirm.montoDefault??""} 
                onChange={e=>setConfirm(prev=>({...prev,montoRenovacion:e.target.value}))}
                style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1px solid ${t.inputBorder}`,fontSize:14,outline:"none",background:t.inputBg,color:t.inputText}}
                placeholder={String(confirm.montoDefault||35)}/>
            </div>
            <div>
              <label style={{display:"block",fontSize:11,color:t.textMuted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6}}>¿Quién recibe la plata?</label>
              <select value={vendedorPermitido(vendedorRenovacion)} onChange={e=>setVendedorRenovacion(e.target.value)}
                style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1px solid ${t.inputBorder}`,fontSize:14,outline:"none",background:t.inputBg,color:t.inputText}}>
                <option value="">Cristian</option>
                <option value="Bahiano">Bahiano</option>
                <option value="Luigi">Luigi</option>
              </select>
            </div>
          </div>
        )}
        {confirm.showRecibeFinal&&(
          <div style={{display:"grid",gap:8,marginBottom:4}}>
            <label style={{display:"block",fontSize:11,color:t.textMuted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:2}}>¿Quién recibió la transferencia?</label>
            <select value={confirm.recibeFinal||""} onChange={e=>setConfirm(prev=>({...prev,recibeFinal:e.target.value}))}
              style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1px solid ${t.inputBorder}`,fontSize:14,outline:"none",background:t.inputBg,color:t.inputText}}>
              <option value="">Elegir...</option>
              <option value="Cristian">Cristian</option>
              <option value="Bahiano">Bahiano</option>
            </select>
          </div>
        )}
      </ConfirmModal>}
      {editIngreso&&<ConfirmModal open={!!editIngreso} title="Editar monto" message={`Actualizar monto de ${editIngreso.ingreso?.cliente_nombre||"este ingreso"}.`} confirmLabel="Guardar" onConfirm={()=>editarMontoIngreso(editIngreso.ingreso.id,editIngreso.monto)} onCancel={()=>setEditIngreso(null)} t={t}>
        <div style={{display:"grid",gap:8}}>
          <label style={{display:"block",fontSize:11,color:t.textMuted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:2}}>Monto real recibido (USD)</label>
          <input type="number" min="1" value={editIngreso.monto}
            onChange={e=>setEditIngreso(prev=>({...prev,monto:e.target.value}))}
            onKeyDown={e=>{if(e.key==="Enter")editarMontoIngreso(editIngreso.ingreso.id,editIngreso.monto);}}
            style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1px solid ${t.inputBorder}`,fontSize:14,outline:"none",background:t.inputBg,color:t.inputText}}
            autoFocus/>
          <div style={{fontSize:12,color:t.textMuted}}>Esto recalcula detalle, historial, ingresos del mes, totales, gráficos y pendientes si corresponde.</div>
        </div>
      </ConfirmModal>}
      {busquedaRapida&&<BusquedaRapida clientes={computed} onSelect={c=>setClienteDetalle(c)} onClose={()=>setBusquedaRapida(false)} t={t}/>}
      {clienteDetalle&&(
        <ClienteDetailModal cliente={clienteDetalle} ingresos={ingresos} allClientes={computed} userEmail={user?.email} onClose={()=>setClienteDetalle(null)}
          onAbrirRenovar={c=>{setClienteDetalle(null);abrirRenovar(c);}}
          onEliminar={c=>{setClienteDetalle(null);askConfirm("Eliminar cliente",`¿Confirmas que querés eliminar a ${c.nombre}? Esta acción no se puede deshacer.`,()=>eliminarClienteConfirmado(c),{danger:true,label:"Eliminar"});}}
          onNotaGuardada={()=>toast.success("Nota guardada")}
          onEditarDeuda={c=>setDeudaCliente(c)}
          t={t}/>
      )}
      {pagoCliente&&<PagoModal cliente={pagoCliente} onClose={()=>setPagoCliente(null)} onConfirm={registrarPagoParcial} t={t}/>}
      {deudaCliente&&<DeudaModal cliente={deudaCliente} onClose={()=>setDeudaCliente(null)} onConfirm={actualizarDeudaCliente} t={t}/>}
      {showRenovar&&<ClienteForm title="Renovar cliente" subtitle="Actualizar plan y registrar nuevo ingreso" form={renovarForm} setForm={setRenovarForm} onGuardar={guardarRenovacion} onCancelar={()=>setShowRenovar(false)} guardando={renovando} isModal t={t}/>}

      <div style={{maxWidth:1380,margin:"0 auto",padding:"28px 32px 44px"}} className="sc-pad">

        {/* ── Header ── */}
        <div className="sc-header sc-topbar" style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",marginBottom:32,flexWrap:"wrap",padding:"18px 20px",borderRadius:22}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <img src={LOGO_SRC} alt="Logo" style={{width:46,height:46,objectFit:"contain",filter:dark?"drop-shadow(0 8px 18px rgba(0,0,0,.30))":"drop-shadow(0 8px 16px rgba(178,124,24,.14))"}} onError={e=>{e.target.style.display="none";}}/>
            <div>
              <h1 style={{margin:0,fontSize:24,fontWeight:950,color:t.text,letterSpacing:"-0.045em",lineHeight:1}}>Seminario Cripto</h1>
              <div className="sc-hide-mobile" style={{color:t.textMuted,fontSize:13,marginTop:5}}>Panel de gestión comercial y operativa</div>
            </div>
          </div>
          <div className="sc-nav" style={{display:"flex",gap:9,flexWrap:"wrap",alignItems:"center"}}>
            <button onClick={()=>setBusquedaRapida(true)} style={navBtn(false)}>🔍 Buscar</button>
            <button style={navBtn(activeView==="operativa")} onClick={()=>handleSetView("operativa")}>
              Operativa
              {totalCriticos>0&&<span style={{marginLeft:5,background:"#ef4444",color:"#fff",borderRadius:999,fontSize:10,fontWeight:800,padding:"1px 5px",verticalAlign:"middle"}}>{totalCriticos}</span>}
            </button>
            <button style={navBtn(activeView==="dashboard")} onClick={()=>handleSetView("dashboard")}>Dashboard</button>
            <button style={navBtn(activeView==="semanal")} onClick={()=>handleSetView("semanal")}>Semanal</button>
            <button style={navBtn(activeView==="caja")} onClick={()=>handleSetView("caja")}>Caja</button>
            <button style={navBtn(activeView==="graficos")} onClick={()=>handleSetView("graficos")}>Gráficos</button>
            <button style={navBtn(activeView==="historial")} onClick={()=>handleSetView("historial")}>Historial</button>
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

        {/* ── SEMANAL ── */}
        {activeView==="semanal"&&(
          <div style={{display:"grid",gap:24}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14}}>
              <MetricCard title="Semana actual" value={semanaActual?money(semanaActual.total):"USD 0"} accent sub={weekLabelFromStart(semanaActualKey)} t={t}/>
              <MetricCard title="Ingresos recibidos" value={money(semanaActual?.total||0)} t={t}/>
              <MetricCard title="Pagos contabilizados" value={semanaActual?.ventas||0} t={t}/>
              <MetricCard title="Pendiente recepción" value={money(pendientesTransferencia.reduce((a,c)=>a+safeNum(c.monto),0))} t={t}/>
            </div>

            <div style={S.card}>
              <div className="sc-card-row" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:12}}>
                <div>
                  <h3 style={{margin:0,color:t.text,fontWeight:800,fontSize:18}}>Ingresos semanales</h3>
                  <div style={{fontSize:13,color:t.textMuted,marginTop:4}}>Total recibido por semana. Lo pendiente de recepción no cuenta hasta que marques recibido; ahí pasa a la semana de recepción.</div>
                </div>
              </div>

              {distribucionSemanal.length===0?(
                <div style={{padding:24,textAlign:"center",color:t.textMuted}}>Sin ingresos registrados.</div>
              ):(
                <div style={{display:"grid",gap:14}}>
                  {distribucionSemanal.map(w=>{
                    const actual=w.key===semanaActualKey;
                    const pct=Math.max(4,(w.total/maxSemanaTotal)*100);
                    return(
                      <div key={w.key} ref={actual?semanaActualRef:null} style={{padding:16,borderRadius:16,border:actual?`2px solid ${t.accent}`:`1px solid ${t.cardBorder}`,background:actual?(t.dark?"rgba(245,158,11,0.10)":"#fffbeb"):(t.dark?"#0d1526":"#fff"),boxShadow:actual?"0 10px 32px rgba(245,158,11,0.20)":"none"}}>
                        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>
                          <div>
                            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                              <strong style={{color:t.text,fontSize:15}}>{weekLabelFromStart(w.key)}</strong>
                              {actual&&<span style={{background:t.accent,color:"#fff",borderRadius:999,fontSize:11,fontWeight:800,padding:"3px 9px"}}>ACTUAL</span>}
                            </div>
                            <div style={{fontSize:12,color:t.textMuted,marginTop:4}}>{w.ventas} pago{w.ventas!==1?"s":""} recibido{w.ventas!==1?"s":""} · No incluye pendientes de recepción</div>
                          </div>
                          <div style={{fontSize:22,fontWeight:900,color:t.accent}}>USD {w.total}</div>
                        </div>
                        <div style={{height:8,background:t.barBg,borderRadius:999,overflow:"hidden",marginTop:12}}>
                          <div style={{width:`${pct}%`,height:"100%",background:t.accentGrad,borderRadius:999}}/>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(82px,1fr))",gap:6,marginTop:12,overflowX:"auto"}}>
                          {w.dias.map(d=>(
                            <div key={d.key} style={{minWidth:82,padding:"7px 8px",borderRadius:10,background:d.total>0?(t.dark?"#1a2540":"#eef7ff"):(t.dark?"#0b1220":"#f8f6f3"),border:`1px solid ${t.tdBorder}`}}>
                              <div style={{fontSize:10,color:t.textMuted,fontWeight:700}}>{d.label}</div>
                              <div style={{fontSize:12,fontWeight:900,color:d.total>0?t.text:t.textMuted}}>USD {d.total}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CAJA ── */}
        {activeView==="caja"&&(
          <div style={{display:"grid",gap:24}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14}}>
              <MetricCard title="Caja de hoy" value={money(cajaHoy?.total||0)} accent sub={formatDate(toISODate(getToday()))} t={t}/>
              <MetricCard title="Recibió Cristian" value={money(cajaHoy?.cristian||0)} t={t}/>
              <MetricCard title="Recibió Bahiano" value={money(cajaHoy?.bahiano||0)} t={t}/>
              <MetricCard title="Saldo actual" value={money(Math.abs(cajaSaldoActual))} sub={cajaTextoSaldo(cajaSaldoActual)} t={t}/>
            </div>

            <div style={S.card} ref={cajaRef}>
              <h3 style={{marginTop:0,color:t.text,fontWeight:800,fontSize:18,marginBottom:16}}>Calendario de caja</h3>
              {cajaDiaria.length===0?(
                <div style={{padding:24,textAlign:"center",color:t.textMuted}}>Todavía no hay movimientos de caja.</div>
              ):(
                <div style={{display:"grid",gap:12}}>
                  {cajaPag.rows.map(r=>{
                    const actual=r.key===toISODate(getToday());
                    const saldo=r.saldoFinal;
                    const tieneNeteo=r.neteos.length>0;
                    const necesitaNeteo=Math.abs(r.saldoFinal)>0.01;
                    return(
                      <div key={r.key} style={{padding:16,borderRadius:16,border:actual?`2px solid ${t.accent}`:`1px solid ${t.cardBorder}`,background:actual?(t.dark?"rgba(245,158,11,0.10)":"#fffbeb"):(t.dark?"#0d1526":"#fff")}}>
                        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>
                          <div>
                            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                              <strong style={{color:t.text,fontSize:15}}>{formatDate(r.key)}</strong>
                              {actual&&<span style={{background:t.accent,color:"#fff",borderRadius:999,fontSize:11,fontWeight:800,padding:"3px 9px"}}>HOY</span>}
                              {r.neteado&&<span style={{background:"#10b981",color:"#fff",borderRadius:999,fontSize:11,fontWeight:800,padding:"3px 9px"}}>NETEADA</span>}
                            </div>
                            <div style={{fontSize:12,color:t.textMuted,marginTop:4}}>{cajaTextoSaldo(saldo)}</div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",justifyContent:"flex-end"}}>
                            <div style={{fontSize:22,fontWeight:900,color:Math.abs(saldo)<0.01?"#10b981":t.accent}}>USD {Math.abs(saldo)}</div>
                            <button
                              title="Eliminar día del calendario"
                              onClick={()=>askConfirm("Eliminar día de caja",`¿Seguro que querés eliminar del calendario de caja el ${formatDate(r.key)}? No se borran los movimientos del historial, pero ese día deja de impactar en caja y arrastres.`,()=>eliminarDiaCaja(r.key),{danger:true,label:"Eliminar día"})}
                              style={{border:"none",borderRadius:10,padding:"7px 9px",cursor:"pointer",background:t.btnLtBg,color:"#b91c1c",fontWeight:800}}
                            >🗑</button>
                          </div>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginTop:12}}>
                          <div style={{padding:10,borderRadius:12,background:t.dark?"#111827":"#f8f6f3",border:`1px solid ${t.tdBorder}`}}><div style={{fontSize:10,color:t.textMuted,fontWeight:800,textTransform:"uppercase"}}>Total del día</div><div style={{fontWeight:900}}>USD {r.total}</div></div>
                          <div style={{padding:10,borderRadius:12,background:t.dark?"#111827":"#f8f6f3",border:`1px solid ${t.tdBorder}`}}><div style={{fontSize:10,color:t.textMuted,fontWeight:800,textTransform:"uppercase"}}>Cristian recibió</div><div style={{fontWeight:900}}>USD {r.cristian}</div></div>
                          <div style={{padding:10,borderRadius:12,background:t.dark?"#111827":"#f8f6f3",border:`1px solid ${t.tdBorder}`}}><div style={{fontSize:10,color:t.textMuted,fontWeight:800,textTransform:"uppercase"}}>Bahiano recibió</div><div style={{fontWeight:900}}>USD {r.bahiano}</div></div>
                          <div style={{padding:10,borderRadius:12,background:t.dark?"#111827":"#f8f6f3",border:`1px solid ${t.tdBorder}`}}><div style={{fontSize:10,color:t.textMuted,fontWeight:800,textTransform:"uppercase"}}>Arrastre previo</div><div style={{fontWeight:900}}>USD {Math.abs(r.saldoInicial)}</div></div>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginTop:12}}>
                          <div style={{fontSize:13,color:t.textMuted}}>{necesitaNeteo?cajaTextoSaldo(r.saldoFinal):r.neteado?"Este día quedó cerrado y no arrastra saldo.":tieneNeteo?"Hay un neteo cargado, pero el día volvió a quedar con saldo pendiente por movimientos posteriores.":"Este día no dejó saldo pendiente."}</div>
                          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                            {necesitaNeteo&&<button onClick={()=>marcarCajaNeteada(r.key,r.saldoFinal)} style={{...btn(false,true),padding:"8px 12px"}}>Marcar caja neteada</button>}
                            {tieneNeteo&&<button onClick={()=>askConfirm("Deshacer caja neteada","¿Deshacer el neteo de este día para que vuelva a calcular y arrastrar el saldo?",()=>deshacerCajaNeteada(r.neteos.map(n=>n.id)),{danger:false,label:"Deshacer"})} style={{...btn(false,false),padding:"8px 12px"}}>Deshacer neteo</button>}
                          </div>
                        </div>
                        {r.movimientos.length>0&&(
                          <div style={{marginTop:10,display:"grid",gap:6}}>
                            {r.movimientos.map(m=>(
                              <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,fontSize:12,color:t.textMuted,padding:"6px 8px",borderRadius:10,background:t.dark?"#0b1220":"#fafaf9"}}>
                                <span>{m.recibe} recibió USD {m.monto}</span>
                                <button onClick={()=>askConfirm("Eliminar movimiento",`¿Eliminar este movimiento de caja de USD ${m.monto}?`,()=>eliminarMovimientoCaja(m.id),{danger:true,label:"Eliminar"})} style={{border:"none",borderRadius:8,padding:"4px 7px",cursor:"pointer",background:t.btnLtBg,color:t.btnLtTx}}>🗑</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <Pagination page={cajaPag.page} totalPages={cajaPag.totalPages} setPage={cajaPag.setPage} sectionRef={cajaRef} t={t}/>
                </div>
              )}
            </div>
          </div>
        )}

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
                  (normalizeServicio(i.servicio)==="mensual"||normalizeServicio(i.servicio)==="anual")
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
                  <h3 style={{marginTop:0,color:t.text,fontWeight:700,fontSize:16,marginBottom:18}}>Ventas por día — histórico</h3>
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

            {/* Ventas por canal */}
            {(() => {
              const vendedorStats = VENDEDORES.reduce((acc,v)=>({...acc,[v]:{total:0,count:0,pendiente:0}}),...[{}]);
              computed.forEach(c=>{
                if(c.vendedor&&vendedorStats[c.vendedor]){
                  vendedorStats[c.vendedor].total+=safeNum(c.monto);
                  vendedorStats[c.vendedor].count+=1;
                  if(c.transferido!==true&&String(c.transferido)!=="true")vendedorStats[c.vendedor].pendiente+=safeNum(c.monto);
                }
              });
              const hasData=Object.values(vendedorStats).some(v=>v.count>0);
              if(!hasData)return null;
              return(
                <div style={S.card}>
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
                            <span>{st.count} cliente{st.count!==1?"s":""}</span>
                            {st.pendiente>0&&<span style={{color:"#f59e0b",fontWeight:700}}>{st.pendiente} USD pendiente</span>}
                            {st.pendiente===0&&<span style={{color:"#22c55e",fontWeight:700}}>✓ Todo transferido</span>}
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
                        <td style={S.td}>
                          <button
                            title="Editar monto"
                            onClick={()=>setEditIngreso({ingreso:i,monto:safeNum(i.monto)})}
                            style={{background:"transparent",border:"none",padding:0,margin:0,cursor:"pointer",color:t.accent,fontWeight:800,fontSize:13}}
                          >
                            {money(i.monto)}
                          </button>
                        </td>
                        <td style={S.td}>{formatearNotasIngreso(i.notas)}</td>
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
                  onRenovarRapido={c=>askConfirm("Renovar cliente",`¿Renovar a ${c.nombre} con el mismo plan?`,null,{label:"Renovar",showVendedor:true,montoDefault:c.monto,onConfirmFn:(v,m)=>renovarRapido(c,v,m)})}
                  onAbrirRenovar={abrirRenovar}
                  onEliminar={c=>askConfirm("Eliminar cliente",`¿Eliminar a ${c.nombre}? No se puede deshacer.`,()=>eliminarClienteConfirmado(c),{danger:true,label:"Eliminar"})}
                  onVerDetalle={setClienteDetalle} sectionRef={critRef} t={t}/>
                {/* En gracia: fondo siempre claro (amarillo) → nombre siempre oscuro fijo */}
                <CriticosPanel titulo="En gracia" badgeBg="#fef3c7" badgeColor="#92400e"
                  clientes={vencimientosCriticos.gracia} {...cGrPag}
                  accentBorder="#fde68a" accentBg="#fffbeb" accentText="#92400e"
                  nameColor="#1a0e00"
                  dateLabel="venció"
                  onRenovarRapido={c=>askConfirm("Renovar cliente",`¿Renovar a ${c.nombre} con el mismo plan?`,null,{label:"Renovar",showVendedor:true,montoDefault:c.monto,onConfirmFn:(v,m)=>renovarRapido(c,v,m)})}
                  onAbrirRenovar={abrirRenovar}
                  onEliminar={c=>askConfirm("Eliminar cliente",`¿Eliminar a ${c.nombre}? No se puede deshacer.`,()=>eliminarClienteConfirmado(c),{danger:true,label:"Eliminar"})}
                  onVerDetalle={setClienteDetalle} sectionRef={critRef} t={t}/>
                {/* Vencidos: fondo siempre claro (rosa) → nombre siempre oscuro fijo */}
                <CriticosPanel titulo="Vencidos" badgeBg="#fee2e2" badgeColor="#991b1b"
                  clientes={vencimientosCriticos.vencidos} {...cVePag}
                  accentBorder="#fca5a5" accentBg="#fef2f2" accentText="#991b1b"
                  nameColor="#1a0000"
                  dateLabel="venció"
                  onRenovarRapido={c=>askConfirm("Renovar cliente",`¿Renovar a ${c.nombre} con el mismo plan?`,null,{label:"Renovar",showVendedor:true,montoDefault:c.monto,onConfirmFn:(v,m)=>renovarRapido(c,v,m)})}
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
                            <input value={c.email||""} onFocus={e=>{e.currentTarget.dataset.emailAnterior=c.email||"";}} onChange={e=>setClientes(prev=>prev.map(cl=>cl.id===c.id?{...cl,email:e.target.value}:cl))} onBlur={e=>actualizarEmail(c.id,e.target.value,e.currentTarget.dataset.emailAnterior||"")}
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
                          <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                            {c.servicio==="clases"?(
                              <>
                                <button title="Renovación rápida" style={{...btn(true),padding:"7px 11px",fontSize:13}} onClick={()=>askConfirm("Renovar clases",`¿Registrar una nueva renovación de clases para ${c.nombre}?`,null,{label:"Renovar",showVendedor:true,montoDefault:c.monto,onConfirmFn:(v,m)=>renovarRapido(c,v,m)})}>✔</button>
                                <button title="Marcar clases como finalizadas" style={{...btn(false,true),padding:"7px 11px",fontSize:12}} onClick={()=>askConfirm("Finalizar clases",`¿Marcar las clases de ${c.nombre} como finalizadas? El ingreso y el historial se conservan.`,()=>finalizarClases(c),{label:"Finalizar"})}>Finalizar</button>
                              </>
                            ):(
                              <>
                                <button title="Renovación rápida" style={{...btn(true),padding:"7px 11px",fontSize:13}} onClick={()=>askConfirm("Renovar cliente",`¿Renovar a ${c.nombre} con el mismo plan?`,null,{label:"Renovar",showVendedor:true,montoDefault:c.monto,onConfirmFn:(v,m)=>renovarRapido(c,v,m)})}>✔</button>
                                <button title="Renovar con cambios" style={{...btn(false),padding:"7px 11px",fontSize:13}} onClick={()=>abrirRenovar(c)}>✏️</button>
                              </>
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
                  <thead><TableHeader cols={["Alumno","Inicio","Mes","Monto","Estado","Notas","Acción"]} t={t}/></thead>
                  <tbody>
                    {clasPag.rows.map(c=>(
                      <tr key={c.id}>
                        <td style={{...S.td,fontWeight:700,cursor:"pointer",color:t.accent}} onClick={()=>setClienteDetalle(c)}>{c.nombre}</td>
                        <td style={S.td}>{formatDate(c.fecha_inicio)}</td>
                        <td style={S.td}>{monthLabel(monthKey(c.fecha_inicio))}</td>
                        <td style={{...S.td,color:t.accent,fontWeight:700}}>USD {c.monto}</td>
                        <td style={S.td}><span style={badgeStyle(c.estadoSistema)}>{c.estadoSistema.toUpperCase()}</span></td>
                        <td style={S.td}>{c.notas||"-"}</td>
                        <td style={S.td}>
                          <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                            <button title="Renovación rápida" style={{...btn(true),padding:"6px 10px",fontSize:12}} onClick={()=>askConfirm("Renovar clases",`¿Registrar una nueva renovación de clases para ${c.nombre}?`,null,{label:"Renovar",showVendedor:true,montoDefault:c.monto,onConfirmFn:(v,m)=>renovarRapido(c,v,m)})}>✔</button>
                            {c.estado_manual==="finalizado"?(
                              <span style={{fontSize:12,color:t.textMuted,fontWeight:700}}>Consolidada</span>
                            ):(
                              <button title="Marcar clases como finalizadas" style={{...btn(false,true),padding:"6px 12px",fontSize:12}} onClick={()=>askConfirm("Finalizar clases",`¿Marcar las clases de ${c.nombre} como finalizadas? El ingreso y el historial se conservan.`,()=>finalizarClases(c),{label:"Finalizar"})}>Finalizar</button>
                            )}
                            <button title="Eliminar" style={{...btn(false),padding:"6px 10px",fontSize:12}} onClick={()=>askConfirm("Eliminar cliente",`¿Eliminar a ${c.nombre}? No se puede deshacer.`,()=>eliminarClienteConfirmado(c),{danger:true,label:"Eliminar"})}>🗑</button>
                          </div>
                        </td>
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
                  {pendientesTransferencia.map(c=>(
                    <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:10,background:dark?"#2a1800":"#fff",border:"1px solid #fde68a",gap:10,flexWrap:"wrap"}}>
                      <div>
                        <span style={{fontWeight:700,color:t.text,fontSize:14}}>{c.nombre}</span>
                        <span style={{color:t.textMuted,fontSize:12,marginLeft:10}}>{svcLabel(c.servicio)} · {c.monto} USD</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,fontWeight:700,color:"#92400e",padding:"3px 10px",borderRadius:999,background:"#fef3c7"}}>{c.vendedor}</span>
                        <span style={{fontSize:12,color:t.textMuted}}>{formatDate(c.fecha_inicio)}</span>
                        <button style={{...btn(false,true),padding:"6px 14px",fontSize:12}} onClick={()=>askConfirm("Marcar como recibido",`¿Confirmás que ${c.vendedor} ya transfirió ${c.monto} USD por ${c.nombre}?`,null,{label:"Recibido ✓",showRecibeFinal:true,onConfirmFn:(recibeFinal)=>marcarTransferido(c.id,c,recibeFinal)})}>
                          Marcar recibido
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
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
