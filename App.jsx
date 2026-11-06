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
  body{margin:0;background:#f6f8fb;color:#101828;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}\n  body:has(.sc-dark){background:#05070b!important;}
  button,input,select,textarea{font-family:inherit;-webkit-appearance:none;appearance:none;}
  button{transition:transform .16s ease, box-shadow .16s ease, background .16s ease, border-color .16s ease, opacity .16s ease, color .16s ease;}
  button:not(:disabled):hover{transform:translateY(-1px);}
  button:disabled{cursor:not-allowed;opacity:.55;}
  button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:none;}
  input::placeholder,textarea::placeholder{color:#98a2b3;opacity:1;}
  input,select,textarea{transition:border-color .16s ease, box-shadow .16s ease, background .16s ease;}
  input:focus,select:focus,textarea:focus{box-shadow:0 0 0 4px rgba(31,78,121,.10)!important;border-color:#1f4e79!important;}
  .sc-dark input:focus,.sc-dark select:focus,.sc-dark textarea:focus{box-shadow:0 0 0 4px rgba(212,162,58,.18)!important;border-color:#d4a23a!important;}
  .sc-dark select{
    color-scheme:dark!important;
    background-color:#050a12!important;
    color:#f8fafc!important;
    border-color:#334155!important;
    transition:border-color .12s ease, box-shadow .12s ease!important;
  }
  .sc-dark select:focus{
    background-color:#050a12!important;
    border-color:#d4a23a!important;
    box-shadow:0 0 0 4px rgba(212,162,58,.18)!important;
  }
  .sc-dark select option,
  .sc-dark select optgroup,
  .sc-dark option{
    background-color:#050a12!important;
    color:#f8fafc!important;
  }
  .sc-dark select option:checked,
  .sc-dark select option:hover,
  .sc-dark option:checked{
    background:#d4a23a!important;
    background-color:#d4a23a!important;
    color:#0b0f17!important;
  }
  table tbody tr{transition:background .14s ease, box-shadow .14s ease;}
  table tbody tr:hover{background:rgba(31,78,121,.045)!important;}
  ::selection{background:rgba(31,78,121,.18);}
  ::-webkit-scrollbar{width:10px;height:10px;}
  ::-webkit-scrollbar-track{background:transparent;}
  ::-webkit-scrollbar-thumb{background:rgba(100,116,139,.35);border-radius:999px;border:2px solid transparent;background-clip:content-box;}
  ::-webkit-scrollbar-thumb:hover{background:rgba(31,78,121,.52);border:2px solid transparent;background-clip:content-box;}

  .sc-app-shell{background:
    radial-gradient(circle at 14% 0%, rgba(31,78,121,.055), transparent 28%),
    radial-gradient(circle at 86% 8%, rgba(200,145,31,.055), transparent 24%),
    linear-gradient(180deg,#fbfcfe 0%,#f6f8fb 48%,#eef2f6 100%);}
  .sc-dark{background:linear-gradient(180deg,#05070b 0%,#090d14 50%,#05070b 100%);}

  .sc-topbar{position:relative;z-index:1;background:rgba(255,255,255,.98);border:1px solid rgba(226,232,240,.98);box-shadow:0 12px 34px rgba(16,24,40,.055);backdrop-filter:blur(10px);}
  .sc-dark .sc-topbar{background:rgba(13,18,27,.94);border-color:#273244;box-shadow:0 18px 46px rgba(0,0,0,.40);}

  .sc-card-premium{transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease;}
  .sc-card-premium:hover{box-shadow:0 16px 38px rgba(16,24,40,.085)!important;border-color:rgba(31,78,121,.22)!important;}
  .sc-dark .sc-card-premium:hover{box-shadow:0 18px 42px rgba(0,0,0,.34)!important;border-color:rgba(214,163,55,.34)!important;}
  .sc-soft-card{background:rgba(255,255,255,.96);border:1px solid rgba(224,229,236,.96);box-shadow:0 10px 30px rgba(16,24,40,.055);}
  .sc-dark .sc-soft-card{background:rgba(13,18,27,.94);border-color:#273244;box-shadow:0 18px 42px rgba(0,0,0,.34);}
  .sc-section-title{letter-spacing:-.035em;}
  .sc-action-icon{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;}

  .sc-header img{filter:drop-shadow(0 8px 16px rgba(178,124,24,.18));}
  .sc-nav button{min-height:42px;}
  .sc-table-wrap{border:1px solid rgba(226,232,240,.96);border-radius:18px;overflow:hidden!important;background:#fff;box-shadow:0 8px 24px rgba(16,24,40,.030);}
  .sc-dark .sc-table-wrap{background:#111827;border-color:#263754;}
  .sc-hist-table{border-collapse:separate!important;border-spacing:0!important;}
  .sc-hist-table th:first-child, .sc-hist-table td:first-child{padding-left:18px!important;}
  .sc-hist-table th:last-child, .sc-hist-table td:last-child{padding-right:18px!important;}
  .sc-tl-item{box-shadow:0 1px 0 rgba(16,24,40,.02);}
