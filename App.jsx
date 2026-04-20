import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── Logo
// Colocá el archivo logo.png (tu 4.png renombrado) en /public y también
// en index.html agregá: <link rel="icon" type="image/png" href="/logo.png" />
const LOGO_SRC = "/logo.png";

// ─── Constantes ───────────────────────────────────────────────────────────────
function getToday() { return new Date(); }

const GRACE_DAYS = 3;
const PAGE_SIZES = { base: 10, vencimientos: 10, deudores: 3, clases: 3, ingresos: 10, criticos: 3 };

const FORM_DEFAULTS = {
  nombre: "", email: "", servicio: "mensual",
  fecha_inicio: toISODate(getToday()), monto: 30, duracion_dias: 30,
  estado_manual: "activo", deuda_restante: 0, acceso_drive: false, notas: "",
};

// ─── Utilidades de fecha ──────────────────────────────────────────────────────
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDays(dateString, days) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}
function parseISODate(dateString) {
  if (!dateString) return null;
  return new Date(`${dateString}T12:00:00`);
}
function formatDate(dateString) {
  if (!dateString) return "-";
  return new Intl.DateTimeFormat("es-AR").format(new Date(`${dateString}T12:00:00`));
}
function diffDays(fromDate, toDate) {
  const a = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const b = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}
function monthKey(dateString) {
  const d = new Date(`${dateString}T12:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [year, month] = key.split("-");
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" })
    .format(new Date(Number(year), Number(month) - 1, 1));
}
function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// ─── Utilidades de negocio ────────────────────────────────────────────────────
function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function money(value) { return `USD ${safeNumber(value)}`; }
function serviceLabel(value) {
  if (value === "mensual") return "Plan Inversor Mensual";
  if (value === "anual") return "Plan Inversor Anual";
  return "Clases";
}
function serviceDefaultAmount(value) {
  if (value === "mensual") return 30;
  if (value === "anual") return 250;
  return 250;
}
function serviceDefaultDuration(value) {
  if (value === "mensual") return 30;
  if (value === "anual") return 365;
  return 0;
}
function classRangeLabel(fechaInicio) {
  if (!fechaInicio) return "-";
  const start = parseISODate(fechaInicio);
  const end = addDays(fechaInicio, 27);
  const fmt = (d) => new Intl.DateTimeFormat("es-AR", { month: "long" }).format(d);
  return isSameMonth(start, end) ? fmt(start) : `${fmt(start)} / ${fmt(end)}`;
}
function resolveDueDate(client) {
  if (client.fecha_vencimiento) return client.fecha_vencimiento;
  const duracion = Number(client.duracion_dias || 0);
  if (client.servicio === "clases" || !client.fecha_inicio || duracion <= 0) return null;
  return toISODate(addDays(client.fecha_inicio, duracion));
}
function computeClient(client) {
  const today = getToday();
  const isClases = client.servicio === "clases";
  const vencimiento = resolveDueDate(client);
  let estadoSistema = "activo";
  let dias = null;
  if (isClases) {
    estadoSistema = "clases";
  } else if (client.estado_manual === "sacar") {
    estadoSistema = "sacar";
  } else if (vencimiento) {
    const dueDate = parseISODate(vencimiento);
    dias = diffDays(today, dueDate);
    if (today > dueDate) {
      const overdue = diffDays(dueDate, today);
      estadoSistema = overdue <= GRACE_DAYS ? "gracia" : "vencido";
    }
  }
  return {
    ...client, isClases, vencimiento, dias,
    duracion_dias: safeNumber(client.duracion_dias),
    estadoSistema,
    class_range_label: isClases ? classRangeLabel(client.fecha_inicio) : null,
    class_end_date: isClases && client.fecha_inicio ? toISODate(addDays(client.fecha_inicio, 27)) : null,
  };
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Analytics helpers ────────────────────────────────────────────────────────
function buildDailySalesSeries(clientes) {
  const today = getToday();
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const rows = Array.from({ length: end.getDate() }, (_, i) => ({
    day: i + 1, label: String(i + 1).padStart(2, "0"),
    total: 0, mensual: 0, anual: 0, clases: 0, ventas: 0,
  }));
  clientes.forEach((c) => {
    if (!c.fecha_inicio) return;
    const d = parseISODate(c.fecha_inicio);
    if (!d || d.getFullYear() !== today.getFullYear() || d.getMonth() !== today.getMonth()) return;
    const row = rows[d.getDate() - 1];
    const monto = safeNumber(c.monto);
    row.total += monto; row.ventas += 1;
    if (row[c.servicio] !== undefined) row[c.servicio] += monto;
  });
  return rows;
}
function buildServiceBreakdown(clientes) {
  const base = { mensual: 0, anual: 0, clases: 0 };
  clientes.forEach((c) => {
    if (base[c.servicio] !== undefined) base[c.servicio] += safeNumber(c.monto);
  });
  return base;
}

// ─── Hook de paginación ───────────────────────────────────────────────────────
function usePagination(items, pageSize) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(1, Math.ceil(items.length / pageSize))));
  }, [items, pageSize]);
  const rows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);
  return { page, setPage, totalPages, rows };
}

// ─── Tema premium ─────────────────────────────────────────────────────────────
function getThemeStyles(dark) {
  return {
    bg:                dark ? "#080e1a" : "#f0ede8",
    cardBg:            dark ? "#111827" : "#ffffff",
    cardBorder:        dark ? "#1e2d45" : "#e2ddd7",
    cardShadow:        dark ? "0 2px 20px rgba(0,0,0,0.4)" : "0 2px 16px rgba(15,23,42,0.07)",
    text:              dark ? "#f0f4ff" : "#0f172a",
    textMuted:         dark ? "#8899bb" : "#64748b",
    accent:            "#c8972a",
    accentGrad:        "linear-gradient(135deg, #e8b84b 0%, #c8972a 60%, #a07020 100%)",
    inputBg:           dark ? "#0d1526" : "#fafaf9",
    inputBorder:       dark ? "#1e2d45" : "#d4cfc9",
    inputText:         dark ? "#f0f4ff" : "#0f172a",
    thBg:              dark ? "#0d1526" : "#f8f6f3",
    tdBorder:          dark ? "#1a2540" : "#ede9e4",
    btnDarkBg:         dark ? "#c8972a" : "#0f172a",
    btnDarkText:       dark ? "#0f172a" : "#ffffff",
    btnLightBg:        dark ? "#1a2540" : "#ede9e4",
    btnLightText:      dark ? "#c8d4f0" : "#374151",
    navActiveBg:       dark ? "#c8972a" : "#0f172a",
    navActiveText:     dark ? "#0f172a" : "#ffffff",
    navInactiveBg:     dark ? "#111827" : "#ffffff",
    navInactiveText:   dark ? "#c8d4f0" : "#374151",
    navInactiveBorder: dark ? "#1e2d45" : "#d4cfc9",
    barBg:             dark ? "#1a2540" : "#ede9e4",
  };
}

function makeS(t) {
  return {
    card: {
      background: t.cardBg, borderRadius: 16, padding: 24,
      boxShadow: t.cardShadow, border: `1px solid ${t.cardBorder}`,
    },
    input: {
      width: "100%", padding: "11px 14px", borderRadius: 10,
      border: `1px solid ${t.inputBorder}`, fontSize: 14, outline: "none",
      boxSizing: "border-box", background: t.inputBg, color: t.inputText,
    },
    label: { display: "block", fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
    td: { padding: "11px 14px", borderBottom: `1px solid ${t.tdBorder}`, color: t.text },
    thRow: { background: t.thBg },
  };
}
function makeBtn(t) {
  return function btn(dark = false, gold = false) {
    if (gold) return {
      padding: "11px 20px", borderRadius: 10, border: "none", cursor: "pointer",
      fontWeight: 800, fontSize: 14, background: t.accentGrad, color: "#0f172a",
    };
    return {
      padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer",
      fontWeight: 700, fontSize: 14,
      background: dark ? t.btnDarkBg : t.btnLightBg,
      color: dark ? t.btnDarkText : t.btnLightText,
    };
  };
}
function makeNavBtn(t) {
  return function navBtn(active) {
    return {
      padding: "10px 18px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14,
      border: active ? "none" : `1px solid ${t.navInactiveBorder}`,
      background: active ? t.navActiveBg : t.navInactiveBg,
      color: active ? t.navActiveText : t.navInactiveText,
    };
  };
}
function badgeStyle(status) {
  const base = { display: "inline-block", padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", border: "1px solid transparent" };
  if (status === "activo")  return { ...base, background: "#d1fae5", color: "#065f46",  borderColor: "#6ee7b7" };
  if (status === "gracia")  return { ...base, background: "#fef3c7", color: "#92400e",  borderColor: "#fde68a" };
  if (status === "vencido") return { ...base, background: "#fee2e2", color: "#991b1b",  borderColor: "#fca5a5" };
  if (status === "clases")  return { ...base, background: "#ede9fe", color: "#5b21b6",  borderColor: "#c4b5fd" };
  return { ...base, background: "#f1f5f9", color: "#334155", borderColor: "#cbd5e1" };
}

// ─── Pagination con scroll ────────────────────────────────────────────────────
function Pagination({ page, totalPages, setPage, sectionRef, t }) {
  const btn = makeBtn(t);
  if (totalPages <= 1) return null;
  function goTo(n) {
    setPage(n);
    setTimeout(() => sectionRef?.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  return (
    <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <div style={{ color: t.textMuted, fontSize: 13 }}>Página {page} de {totalPages}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button style={{ ...btn(false), padding: "7px 13px", fontSize: 13 }} onClick={() => goTo(Math.max(1, page - 1))} disabled={page === 1}>Anterior</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
          <button key={n} style={{ ...btn(n === page), padding: "7px 11px", fontSize: 13 }} onClick={() => goTo(n)}>{n}</button>
        ))}
        <button style={{ ...btn(false), padding: "7px 13px", fontSize: 13 }} onClick={() => goTo(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Siguiente</button>
      </div>
    </div>
  );
}

function TableHeader({ cols, t }) {
  const S = makeS(t);
  return (
    <tr style={S.thRow}>
      {cols.map((h) => (
        <th key={h} style={{ textAlign: "left", ...S.td, color: t.textMuted, fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</th>
      ))}
    </tr>
  );
}

function MetricCard({ title, value, accent, t }) {
  const S = makeS(t);
  return (
    <div style={{ ...S.card, borderTop: accent ? `3px solid ${t.accent}` : undefined }}>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ? t.accent : t.text, letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

function BarList({ items, t }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {items.map(({ label, value }) => {
        const pct = Math.max((value / max) * 100, value > 0 ? 4 : 0);
        return (
          <div key={label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14, color: t.text }}>
              <span>{label}</span>
              <strong style={{ color: t.accent }}>{money(value)}</strong>
            </div>
            <div style={{ height: 8, background: t.barBg, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: t.accentGrad, borderRadius: 999 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SimpleBarChart({ title, data, valueKey, labelKey = "label", emptyText = "Sin datos.", t }) {
  const S = makeS(t);
  const hasData = data.some((r) => safeNumber(r[valueKey]) > 0);
  return (
    <div style={S.card}>
      <h3 style={{ marginTop: 0, color: t.text, fontWeight: 700, fontSize: 16, marginBottom: 18 }}>{title}</h3>
      {!hasData ? <div style={{ color: t.textMuted }}>{emptyText}</div>
        : <BarList items={data.map((r) => ({ label: r[labelKey], value: safeNumber(r[valueKey]) }))} t={t} />}
    </div>
  );
}

function BreakdownCard({ title, breakdown, t }) {
  const S = makeS(t);
  const items = [
    { key: "mensual", label: "Plan mensual" },
    { key: "anual",   label: "Plan anual" },
    { key: "clases",  label: "Clases" },
  ];
  return (
    <div style={S.card}>
      <h3 style={{ marginTop: 0, color: t.text, fontWeight: 700, fontSize: 16, marginBottom: 18 }}>{title}</h3>
      <BarList items={items.map(({ key, label }) => ({ label, value: safeNumber(breakdown[key]) }))} t={t} />
    </div>
  );
}

// ─── Gráfico de línea SVG con tooltip ────────────────────────────────────────
function LineChart({ data, t }) {
  const [tooltip, setTooltip] = useState(null);
  const W = 760, H = 220, PL = 50, PR = 16, PT = 16, PB = 36;
  const cW = W - PL - PR, cH = H - PT - PB;
  const maxVal = Math.max(...data.map((d) => d.total), 1);
  const pts = data.map((d, i) => ({
    x: PL + (i / Math.max(data.length - 1, 1)) * cW,
    y: PT + cH - (d.total / maxVal) * cH,
    d,
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L ${pts[pts.length - 1].x.toFixed(1)} ${(PT + cH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(PT + cH).toFixed(1)} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ val: Math.round(maxVal * f), y: PT + cH - f * cH }));
  return (
    <div style={{ position: "relative", width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        <defs>
          <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.accent} stopOpacity="0.22" />
            <stop offset="100%" stopColor={t.accent} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {yTicks.map((tk) => (
          <g key={tk.val}>
            <line x1={PL} y1={tk.y} x2={W - PR} y2={tk.y} stroke={t.tdBorder} strokeWidth="1" />
            <text x={PL - 6} y={tk.y + 4} textAnchor="end" fontSize="11" fill={t.textMuted}>{tk.val}</text>
          </g>
        ))}
        {pts.filter((_, i) => i % 5 === 0 || i === pts.length - 1).map((p) => (
          <text key={p.d.day} x={p.x} y={H - 6} textAnchor="middle" fontSize="11" fill={t.textMuted}>{p.d.label}</text>
        ))}
        <path d={areaD} fill="url(#aGrad)" />
        <path d={pathD} fill="none" stroke={t.accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p) => (
          <rect key={p.d.day} x={p.x - cW / data.length / 2} y={PT} width={cW / data.length} height={cH}
            fill="transparent" onMouseEnter={() => setTooltip(p)} onMouseLeave={() => setTooltip(null)} />
        ))}
        {tooltip && <circle cx={tooltip.x} cy={tooltip.y} r="5" fill={t.accent} stroke={t.cardBg} strokeWidth="2" />}
      </svg>
      {tooltip && (
        <div style={{
          position: "absolute", top: Math.max(0, tooltip.y - 8),
          left: Math.min(tooltip.x + 10, W - 145),
          background: t.cardBg, border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, padding: "10px 14px", pointerEvents: "none",
          zIndex: 10, fontSize: 13, boxShadow: t.cardShadow, minWidth: 130,
        }}>
          <div style={{ fontWeight: 700, color: t.text, marginBottom: 4 }}>Día {tooltip.d.day}</div>
          <div style={{ color: t.accent, fontWeight: 800, fontSize: 15 }}>USD {tooltip.d.total}</div>
          <div style={{ color: t.textMuted, fontSize: 12, marginTop: 4 }}>{tooltip.d.ventas} venta{tooltip.d.ventas !== 1 ? "s" : ""}</div>
          {tooltip.d.mensual > 0 && <div style={{ color: t.textMuted, fontSize: 12 }}>Mensual: USD {tooltip.d.mensual}</div>}
          {tooltip.d.anual > 0   && <div style={{ color: t.textMuted, fontSize: 12 }}>Anual: USD {tooltip.d.anual}</div>}
          {tooltip.d.clases > 0  && <div style={{ color: t.textMuted, fontSize: 12 }}>Clases: USD {tooltip.d.clases}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Gráfico de torta SVG ─────────────────────────────────────────────────────
function PieChart({ breakdown, title, t }) {
  const S = makeS(t);
  const [hovered, setHovered] = useState(null);
  const slices = [
    { key: "mensual", label: "Plan mensual", color: t.accent },
    { key: "anual",   label: "Plan anual",   color: "#5b8dee" },
    { key: "clases",  label: "Clases",       color: "#34d399" },
  ];
  const total = slices.reduce((acc, s) => acc + safeNumber(breakdown[s.key]), 0);
  if (total === 0) {
    return (
      <div style={S.card}>
        <h3 style={{ marginTop: 0, color: t.text, fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{title}</h3>
        <div style={{ color: t.textMuted }}>Sin datos disponibles.</div>
      </div>
    );
  }
  const CX = 90, CY = 90, R = 72, RI = 40;
  let angle = -Math.PI / 2;
  const paths = slices.map((s) => {
    const val = safeNumber(breakdown[s.key]);
    const sweep = (val / total) * 2 * Math.PI;
    const x1 = CX + R * Math.cos(angle), y1 = CY + R * Math.sin(angle);
    const x2 = CX + R * Math.cos(angle + sweep), y2 = CY + R * Math.sin(angle + sweep);
    const xi1 = CX + RI * Math.cos(angle), yi1 = CY + RI * Math.sin(angle);
    const xi2 = CX + RI * Math.cos(angle + sweep), yi2 = CY + RI * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const d = `M ${xi1} ${yi1} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${RI} ${RI} 0 ${large} 0 ${xi1} ${yi1} Z`;
    angle += sweep;
    return { ...s, val, pct: Math.round((val / total) * 100), d };
  }).filter((s) => s.val > 0);
  return (
    <div style={S.card}>
      <h3 style={{ marginTop: 0, color: t.text, fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{title}</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <svg viewBox="0 0 180 180" style={{ width: 170, flexShrink: 0 }}>
          {paths.map((p) => (
            <path key={p.key} d={p.d} fill={p.color}
              opacity={hovered && hovered !== p.key ? 0.35 : 1}
              style={{ cursor: "pointer", transition: "opacity 0.15s" }}
              onMouseEnter={() => setHovered(p.key)} onMouseLeave={() => setHovered(null)} />
          ))}
          <text x={CX} y={CY - 7} textAnchor="middle" fontSize="12" fontWeight="700" fill={t.textMuted}>TOTAL</text>
          <text x={CX} y={CY + 10} textAnchor="middle" fontSize="14" fontWeight="800" fill={t.accent}>{total}</text>
        </svg>
        <div style={{ display: "grid", gap: 10 }}>
          {paths.map((p) => (
            <div key={p.key}
              style={{ display: "flex", alignItems: "center", gap: 10, opacity: hovered && hovered !== p.key ? 0.35 : 1, transition: "opacity 0.15s", cursor: "default" }}
              onMouseEnter={() => setHovered(p.key)} onMouseLeave={() => setHovered(null)}>
              <div style={{ width: 11, height: 11, borderRadius: 3, background: p.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{p.label}</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>USD {p.val} · {p.pct}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ClienteCard ──────────────────────────────────────────────────────────────
function ClienteCard({ cliente, accentBorder, accentBg, accentText, dateLabel, onRenovarRapido, onAbrirRenovar, onEliminar, t }) {
  const btn = makeBtn(t);
  return (
    <div style={{ border: `1px solid ${accentBorder}`, background: accentBg, borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <div>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{cliente.nombre}</div>
        <div style={{ fontSize: 12, color: accentText, marginTop: 2 }}>
          {serviceLabel(cliente.servicio)} · {dateLabel} {formatDate(cliente.vencimiento)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={{ ...btn(true), padding: "7px 11px", fontSize: 13 }} title="Renovación rápida"
          onClick={() => { if (window.confirm("¿Renovar cliente con el mismo plan?")) onRenovarRapido(cliente); }}>✔</button>
        <button style={{ ...btn(false), padding: "7px 11px", fontSize: 13 }} title="Renovar con cambios"
          onClick={() => onAbrirRenovar(cliente)}>✏️</button>
        <button style={{ ...btn(false), padding: "7px 11px", fontSize: 13 }} title="Eliminar"
          onClick={() => { if (window.confirm("¿Eliminar cliente?")) onEliminar(cliente.id); }}>🗑</button>
      </div>
    </div>
  );
}

// ─── CriticosPanel ────────────────────────────────────────────────────────────
function CriticosPanel({ titulo, badgeBg, badgeColor, clientes, rows, page, totalPages, setPage, accentBorder, accentBg, accentText, dateLabel, onRenovarRapido, onAbrirRenovar, onEliminar, sectionRef, t }) {
  const S = makeS(t);
  return (
    <div style={{ ...S.card, display: "flex", flexDirection: "column", minHeight: 280 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>{titulo}</div>
        <div style={{ minWidth: 30, height: 30, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: badgeBg, color: badgeColor, fontWeight: 800, fontSize: 13 }}>
          {clientes.length}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        {clientes.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((c) => (
              <ClienteCard key={c.id} cliente={c}
                accentBorder={accentBorder} accentBg={accentBg} accentText={accentText}
                dateLabel={dateLabel}
                onRenovarRapido={onRenovarRapido} onAbrirRenovar={onAbrirRenovar} onEliminar={onEliminar}
                t={t} />
            ))}
          </div>
        ) : (
          <div style={{ color: t.textMuted, fontSize: 13 }}>Sin clientes en esta categoría.</div>
        )}
      </div>
      <Pagination page={page} totalPages={totalPages} setPage={setPage} sectionRef={sectionRef} t={t} />
    </div>
  );
}

// ─── ClienteForm ─────────────────────────────────────────────────────────────
function ClienteForm({ title, subtitle, form, setForm, onGuardar, onCancelar, guardando, isModal = false, t }) {
  const S = makeS(t);
  const btn = makeBtn(t);
  const isClases = form.servicio === "clases";
  const inner = (
    <div style={{ width: "100%", maxWidth: isModal ? 820 : undefined, background: t.cardBg, borderRadius: 16, padding: 28, boxShadow: isModal ? "0 24px 64px rgba(0,0,0,0.4)" : undefined, border: `1px solid ${t.cardBorder}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
        <div>
          <h3 style={{ margin: 0, color: t.text, fontSize: 18, fontWeight: 800 }}>{title}</h3>
          {subtitle && <div style={{ color: t.textMuted, fontSize: 13, marginTop: 4 }}>{subtitle}</div>}
        </div>
        {isModal && <button onClick={onCancelar} style={btn(false)}>Cerrar</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <Field label="Nombre" t={t}><input style={S.input} placeholder="Nombre completo" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
        <Field label="Email" t={t}><input style={S.input} placeholder="correo@ejemplo.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Servicio" t={t}>
          <select style={S.input} value={form.servicio} onChange={(e) => {
            const servicio = e.target.value;
            setForm({ ...form, servicio, monto: serviceDefaultAmount(servicio), duracion_dias: serviceDefaultDuration(servicio) });
          }}>
            <option value="mensual">Plan Inversor Mensual</option>
            <option value="anual">Plan Inversor Anual</option>
            <option value="clases">Clases</option>
          </select>
        </Field>
        <Field label={isModal ? "Fecha de renovación" : "Fecha de inicio"} t={t}><input type="date" style={S.input} value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} /></Field>
        <Field label="Monto (USD)" t={t}><input type="number" style={S.input} placeholder="0" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} /></Field>
        {!isClases && <Field label="Duración (días)" t={t}><input type="number" style={S.input} placeholder="30" value={form.duracion_dias} onChange={(e) => setForm({ ...form, duracion_dias: e.target.value })} /></Field>}
        <Field label="Deuda restante (USD)" t={t}><input type="number" style={S.input} placeholder="0" value={form.deuda_restante} onChange={(e) => setForm({ ...form, deuda_restante: e.target.value })} /></Field>
        <Field label="Notas" spanAll t={t}><input style={S.input} placeholder="Observaciones opcionales" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        {isModal && <button onClick={onCancelar} style={btn(false)}>Cancelar</button>}
        <button style={btn(false, true)} onClick={onGuardar}>
          {guardando ? "Guardando..." : isModal ? "Confirmar renovación" : "Guardar cliente"}
        </button>
      </div>
    </div>
  );
  if (!isModal) return inner;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,14,26,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 1000 }}>
      {inner}
    </div>
  );
}

function Field({ label, children, spanAll = false, t }) {
  const S = makeS(t);
  return (
    <div style={{ gridColumn: spanAll ? "1 / -1" : "auto" }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [emailLogin, setEmailLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState("operativa");
  const [showForm, setShowForm] = useState(false);
  const [showRenovar, setShowRenovar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [renovando, setRenovando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [form, setForm] = useState(FORM_DEFAULTS);
  const [renovarForm, setRenovarForm] = useState({ ...FORM_DEFAULTS, id: null });
  const [darkMode, setDarkMode] = useState(false);

  // Refs para scroll-to-section en cada paginación
  const baseRef = useRef(null);
  const vencimientosRef = useRef(null);
  const deudoresRef = useRef(null);
  const clasesRef = useRef(null);
  const ingresosRef = useRef(null);
  const criticosRef = useRef(null);

  const t = getThemeStyles(darkMode);
  const S = makeS(t);
  const btn = makeBtn(t);
  const navBtn = makeNavBtn(t);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user || null));
    return () => listener.subscription.unsubscribe();
  }, []);

  async function login() {
    const { error } = await supabase.auth.signInWithPassword({ email: emailLogin, password });
    if (error) alert(error.message);
  }
  async function logout() { await supabase.auth.signOut(); }

  // ── Data fetching ─────────────────────────────────────────────────────────
  async function fetchClientes() {
    setLoading(true);
    const { data, error } = await supabase.from("clientes").select("*").order("id", { ascending: false });
    if (error) { alert("No se pudieron cargar los clientes"); setLoading(false); return; }
    setClientes(data || []);
    setLoading(false);
  }
  async function fetchIngresos() {
    const { data, error } = await supabase.from("ingresos").select("*").order("fecha_pago", { ascending: false });
    if (error) { alert("No se pudieron cargar los ingresos"); return; }
    setIngresos(data || []);
  }
  async function refetch() { await Promise.all([fetchClientes(), fetchIngresos()]); }
  useEffect(() => { fetchClientes(); fetchIngresos(); }, []);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function validateClienteForm(f) {
    const nombre = f.nombre.trim();
    const emailVal = f.email.trim().toLowerCase();
    if (!nombre) { alert("Falta el nombre"); return null; }
    if (!emailVal) { alert("Falta el email"); return null; }
    if (!isValidEmail(emailVal)) { alert("El email no es válido"); return null; }
    if (f.servicio !== "clases" && Number(f.duracion_dias || 0) <= 0) { alert("Falta la duración en días"); return null; }
    return { nombre, email: emailVal };
  }
  function buildClientePayload(f, nombre, emailVal) {
    const duracion = f.servicio === "clases" ? 0 : Number(f.duracion_dias || 0);
    return {
      ...f, nombre, email: emailVal, estado_manual: "activo",
      monto: Number(f.monto || 0), duracion_dias: duracion,
      deuda_restante: Number(f.deuda_restante || 0),
      fecha_vencimiento: f.servicio === "clases" || duracion <= 0 ? null : toISODate(addDays(f.fecha_inicio, duracion)),
    };
  }
  function buildIngresoPayload(clienteId, nombre, emailVal, servicio, monto, fecha, notas) {
    return { cliente_id: clienteId, cliente_nombre: nombre, email: emailVal, servicio, monto: Number(monto || 0), fecha_pago: fecha, notas: notas || "" };
  }
  async function guardarCliente() {
    const validated = validateClienteForm(form);
    if (!validated) return;
    setGuardando(true);
    const payload = buildClientePayload(form, validated.nombre, validated.email);
    const { data: inserted, error } = await supabase.from("clientes").insert([payload]).select().single();
    if (error) { setGuardando(false); alert("No se pudo guardar el cliente"); return; }
    const { error: errIngreso } = await supabase.from("ingresos").insert([buildIngresoPayload(inserted.id, inserted.nombre, inserted.email, inserted.servicio, inserted.monto, inserted.fecha_inicio, inserted.notas)]);
    if (errIngreso) alert("Error registrando ingreso: " + errIngreso.message);
    setGuardando(false); setShowForm(false); setForm(FORM_DEFAULTS); refetch();
  }
  async function guardarRenovacion() {
    const validated = validateClienteForm(renovarForm);
    if (!validated) return;
    setRenovando(true);
    const payload = buildClientePayload(renovarForm, validated.nombre, validated.email);
    const { error: errCliente } = await supabase.from("clientes").update(payload).eq("id", renovarForm.id);
    if (errCliente) { setRenovando(false); alert("No se pudo renovar el cliente"); return; }
    const today = getToday();
    const { error: errIngreso } = await supabase.from("ingresos").insert([buildIngresoPayload(renovarForm.id, validated.nombre, validated.email, renovarForm.servicio, renovarForm.monto, toISODate(today), renovarForm.notas)]);
    if (errIngreso) alert("El cliente se renovó, pero no se pudo registrar el ingreso: " + errIngreso.message);
    setRenovando(false); setShowRenovar(false); refetch();
  }
  async function renovarRapido(cliente) {
    const today = getToday();
    const duracion = cliente.servicio === "clases" ? 0 : Number(cliente.duracion_dias || serviceDefaultDuration(cliente.servicio));
    const vencimientoActual = cliente.vencimiento || cliente.fecha_vencimiento || null;
    let fechaBase = toISODate(today);
    if (vencimientoActual && (cliente.estadoSistema === "activo" || cliente.estadoSistema === "gracia")) fechaBase = vencimientoActual;
    const nuevoVencimiento = cliente.servicio === "clases" || duracion <= 0 ? null : toISODate(addDays(fechaBase, duracion));
    const payload = {
      nombre: cliente.nombre || "", email: (cliente.email || "").trim().toLowerCase(),
      servicio: cliente.servicio, fecha_inicio: fechaBase, monto: Number(cliente.monto || 0),
      duracion_dias: duracion, estado_manual: "activo",
      deuda_restante: Number(cliente.deuda_restante || 0), notas: cliente.notas || "",
      fecha_vencimiento: nuevoVencimiento,
    };
    const { error: errCliente } = await supabase.from("clientes").update(payload).eq("id", cliente.id);
    if (errCliente) { alert("No se pudo renovar el cliente"); return; }
    const { error: errIngreso } = await supabase.from("ingresos").insert([buildIngresoPayload(cliente.id, cliente.nombre || "", (cliente.email || "").trim().toLowerCase(), cliente.servicio, cliente.monto, toISODate(today), cliente.notas)]);
    if (errIngreso) alert("El cliente se renovó, pero no se pudo registrar el ingreso");
    refetch();
  }
  async function eliminarCliente(id) {
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) { alert("No se pudo eliminar"); return; }
    refetch();
  }
  async function eliminarIngreso(id) {
    if (!window.confirm("¿Eliminar este ingreso?")) return;
    const { error } = await supabase.from("ingresos").delete().eq("id", id);
    if (error) { alert("No se pudo eliminar el ingreso"); return; }
    fetchIngresos();
  }
  async function cambiarEstado(id, value) {
    const { error } = await supabase.from("clientes").update({ estado_manual: value }).eq("id", id);
    if (error) { alert("No se pudo actualizar"); return; }
    fetchClientes();
  }
  async function actualizarEmail(id, nuevoEmail) {
    const { error } = await supabase.from("clientes").update({ email: nuevoEmail }).eq("id", id);
    if (error) { alert("No se pudo actualizar el email"); return; }
    fetchClientes();
  }
  function abrirRenovar(cliente) {
    const vencimientoActual = cliente.vencimiento || cliente.fecha_vencimiento || null;
    let fechaBase = toISODate(getToday());
    if (vencimientoActual && (cliente.estadoSistema === "activo" || cliente.estadoSistema === "gracia")) fechaBase = vencimientoActual;
    setRenovarForm({
      id: cliente.id, nombre: cliente.nombre || "", email: cliente.email || "",
      servicio: cliente.servicio || "mensual", fecha_inicio: fechaBase,
      monto: safeNumber(cliente.monto),
      duracion_dias: cliente.servicio === "clases" ? 0 : safeNumber(cliente.duracion_dias || serviceDefaultDuration(cliente.servicio)),
      deuda_restante: safeNumber(cliente.deuda_restante), notas: cliente.notas || "",
    });
    setShowRenovar(true);
  }
  function handleSetView(v) { setActiveView(v); setShowForm(false); }

  // ── Datos derivados ───────────────────────────────────────────────────────
  const computed = useMemo(() => clientes.map(computeClient), [clientes]);
  const filtered = useMemo(() => computed.filter((c) => {
    const text = `${c.nombre || ""} ${c.email || ""}`.toLowerCase();
    const okBusqueda = text.includes(busqueda.toLowerCase());
    const okFiltro = filtro === "todos" || c.servicio === filtro || c.estadoSistema === filtro;
    return okBusqueda && okFiltro;
  }), [computed, busqueda, filtro]);
  const deudores = useMemo(() => computed.filter((c) => Number(c.deuda_restante || 0) > 0), [computed]);
  const clasesList = useMemo(() => computed.filter((c) => c.servicio === "clases"), [computed]);
  const vencimientos = useMemo(() => computed
    .filter((c) => c.servicio !== "clases")
    .sort((a, b) => (!a.vencimiento ? 1 : !b.vencimiento ? -1 : a.vencimiento.localeCompare(b.vencimiento))),
    [computed]);
  const vencimientosCriticos = useMemo(() => {
    const hoy = [], gracia = [], vencidos = [];
    computed.forEach((c) => {
      if (!c.vencimiento) return;
      if (c.estadoSistema === "activo" && c.dias <= 0) hoy.push(c);
      else if (c.estadoSistema === "gracia") gracia.push(c);
      else if (c.estadoSistema === "vencido") vencidos.push(c);
    });
    return { hoy, gracia, vencidos };
  }, [computed]);
  const resumen = useMemo(() => {
    const base = { activos: 0, gracia: 0, sacar: 0, deudores: 0, clases: 0, ingresos: 0 };
    computed.forEach((c) => {
      if (c.estadoSistema === "activo") base.activos++;
      if (c.estadoSistema === "gracia") base.gracia++;
      if (c.estadoSistema === "sacar" || c.estadoSistema === "vencido") base.sacar++;
      if (Number(c.deuda_restante || 0) > 0) base.deudores++;
      if (c.servicio === "clases") base.clases++;
      base.ingresos += Number(c.monto || 0);
    });
    return base;
  }, [computed]);
  const today = getToday();
  const currentMonthIngresos = useMemo(() => ingresos.filter((i) => {
    const d = parseISODate(i.fecha_pago);
    return d && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  }), [ingresos]);
  const dashboardStats = useMemo(() => {
    const normalize = (arr) => arr.map((i) => ({ servicio: i.servicio, monto: i.monto, fecha_inicio: i.fecha_pago }));
    return {
      ingresosMes: currentMonthIngresos.reduce((acc, i) => acc + safeNumber(i.monto), 0),
      ventasMes: currentMonthIngresos.length,
      breakdownMes: buildServiceBreakdown(normalize(currentMonthIngresos)),
      breakdownTotal: buildServiceBreakdown(normalize(ingresos)),
      dailySeries: buildDailySalesSeries(normalize(ingresos)),
    };
  }, [ingresos, currentMonthIngresos]);
  const resumenMensual = useMemo(() => {
    const map = new Map();
    ingresos.forEach((i) => {
      if (!i.fecha_pago) return;
      const key = monthKey(i.fecha_pago);
      if (!map.has(key)) map.set(key, { key, mensual: 0, anual: 0, clases: 0, total: 0, ventasMensual: 0, ventasAnual: 0, ventasClases: 0 });
      const row = map.get(key);
      const monto = Number(i.monto || 0);
      if (i.servicio === "mensual") { row.mensual += monto; row.ventasMensual++; }
      else if (i.servicio === "anual") { row.anual += monto; row.ventasAnual++; }
      else { row.clases += monto; row.ventasClases++; }
      row.total += monto;
    });
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [ingresos]);
  const maxTotal = resumenMensual.length ? Math.max(...resumenMensual.map((r) => r.total)) : 1;

  // ── Paginaciones ──────────────────────────────────────────────────────────
  const basePag = usePagination(filtered, PAGE_SIZES.base);
  const vencimientosPag = usePagination(vencimientos, PAGE_SIZES.vencimientos);
  const deudoresPag = usePagination(deudores, PAGE_SIZES.deudores);
  const clasesPag = usePagination(clasesList, PAGE_SIZES.clases);
  const ingresosPag = usePagination(ingresos, PAGE_SIZES.ingresos);
  const criticosHoyPag = usePagination(vencimientosCriticos.hoy, PAGE_SIZES.criticos);
  const criticosGraciaPag = usePagination(vencimientosCriticos.gracia, PAGE_SIZES.criticos);
  const criticosVencidosPag = usePagination(vencimientosCriticos.vencidos, PAGE_SIZES.criticos);
  useEffect(() => { basePag.setPage(1); }, [busqueda, filtro]);

  // ── Login ─────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#080e1a", padding: 24 }}>
        <div style={{ width: 390, background: "#111827", borderRadius: 20, padding: 36, border: "1px solid #1e2d45", boxShadow: "0 8px 48px rgba(0,0,0,0.6)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
            <img src={LOGO_SRC} alt="Logo" style={{ width: 50, height: 50, objectFit: "contain" }} onError={(e) => { e.target.style.display = "none"; }} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#f0f4ff", letterSpacing: "-0.02em" }}>Seminario Cripto</div>
              <div style={{ fontSize: 13, color: "#8899bb", marginTop: 2 }}>Sistema de gestión interno</div>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#8899bb", marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>Email</label>
            <input placeholder="correo@ejemplo.com" value={emailLogin} onChange={(e) => setEmailLogin(e.target.value)}
              style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid #1e2d45", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#0d1526", color: "#f0f4ff" }} />
          </div>
          <div style={{ position: "relative", marginBottom: 22 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#8899bb", marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>Contraseña</label>
            <input type={showPassword ? "text" : "password"} placeholder="••••••••" value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", padding: "11px 44px 11px 14px", borderRadius: 10, border: "1px solid #1e2d45", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#0d1526", color: "#f0f4ff" }} />
            <span onClick={() => setShowPassword(!showPassword)}
              style={{ position: "absolute", right: 12, bottom: 11, cursor: "pointer", color: "#8899bb", display: "flex", alignItems: "center" }}>
              {showPassword ? (
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </span>
          </div>
          <button onClick={login}
            style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 15, background: "linear-gradient(135deg, #e8b84b 0%, #c8972a 60%, #a07020 100%)", color: "#0f172a" }}>
            Ingresar
          </button>
        </div>
      </div>
    );
  }

  // ── App principal ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "24px 28px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 28, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src={LOGO_SRC} alt="Logo" style={{ width: 44, height: 44, objectFit: "contain" }} onError={(e) => { e.target.style.display = "none"; }} />
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: t.text, letterSpacing: "-0.03em" }}>Seminario Cripto</h1>
              <div style={{ color: t.textMuted, fontSize: 13, marginTop: 2 }}>Panel de gestión comercial y operativa</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button style={navBtn(activeView === "operativa")} onClick={() => handleSetView("operativa")}>Operativa</button>
            <button style={navBtn(activeView === "dashboard")} onClick={() => handleSetView("dashboard")}>Dashboard</button>
            <button style={navBtn(activeView === "graficos")} onClick={() => handleSetView("graficos")}>Gráficos</button>
            <button style={{ ...btn(false, true), padding: "10px 18px" }} onClick={() => setShowForm(!showForm)}>{showForm ? "Cerrar" : "+ Nuevo cliente"}</button>
            <button onClick={() => setDarkMode(!darkMode)} title={darkMode ? "Modo claro" : "Modo oscuro"}
              style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${t.navInactiveBorder}`, background: t.navInactiveBg, cursor: "pointer", color: t.text, fontSize: 16 }}>
              {darkMode ? "☀" : "☾"}
            </button>
            <button onClick={logout} style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${t.navInactiveBorder}`, background: t.navInactiveBg, cursor: "pointer", fontWeight: 600, color: t.text, fontSize: 14 }}>Salir</button>
          </div>
        </div>

        {showForm && (
          <div style={{ marginBottom: 24 }}>
            <ClienteForm title="Alta de cliente" form={form} setForm={setForm}
              onGuardar={guardarCliente} onCancelar={() => setShowForm(false)} guardando={guardando} t={t} />
          </div>
        )}
        {showRenovar && (
          <ClienteForm title="Renovar cliente" subtitle="Actualizar plan y registrar nuevo ingreso"
            form={renovarForm} setForm={setRenovarForm}
            onGuardar={guardarRenovacion} onCancelar={() => setShowRenovar(false)}
            guardando={renovando} isModal t={t} />
        )}

        {/* ── GRÁFICOS ──────────────────────────────────────────────────── */}
        {activeView === "graficos" && (
          <div style={{ display: "grid", gap: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
              <MetricCard title="Ingresos del mes" value={money(dashboardStats.ingresosMes)} accent t={t} />
              <MetricCard title="Ventas del mes" value={dashboardStats.ventasMes} t={t} />
              <MetricCard title="Clientes activos" value={resumen.activos} t={t} />
              <MetricCard title="En gracia / Vencidos" value={`${resumen.gracia} / ${vencimientosCriticos.vencidos.length}`} t={t} />
            </div>
            {/* Gráfico de línea */}
            <div style={S.card}>
              <h3 style={{ marginTop: 0, color: t.text, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Fluctuación de ingresos — mes actual</h3>
              <div style={{ color: t.textMuted, fontSize: 13, marginBottom: 18 }}>Pasá el cursor por el gráfico para ver el detalle de cada día.</div>
              {dashboardStats.dailySeries.some((d) => d.total > 0)
                ? <LineChart data={dashboardStats.dailySeries} t={t} />
                : <div style={{ color: t.textMuted, padding: "24px 0" }}>Sin ingresos registrados este mes.</div>}
            </div>
            {/* Tortas */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
              <PieChart breakdown={dashboardStats.breakdownMes} title="Ingresos por tipo — mes actual" t={t} />
              <PieChart breakdown={dashboardStats.breakdownTotal} title="Ingresos totales por tipo" t={t} />
            </div>
            {/* Evolución mensual */}
            <div style={S.card}>
              <h3 style={{ marginTop: 0, color: t.text, fontWeight: 700, fontSize: 16, marginBottom: 18 }}>Evolución mensual de ingresos</h3>
              {resumenMensual.length === 0
                ? <div style={{ color: t.textMuted }}>Sin datos históricos.</div>
                : (
                  <div style={{ display: "grid", gap: 14 }}>
                    {resumenMensual.map((r) => {
                      const pct = Math.max((r.total / maxTotal) * 100, 4);
                      return (
                        <div key={r.key}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14, color: t.text }}>
                            <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{monthLabel(r.key)}</span>
                            <strong style={{ color: t.accent }}>USD {r.total}</strong>
                          </div>
                          <div style={{ height: 8, background: t.barBg, borderRadius: 999, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: t.accentGrad, borderRadius: 999 }} />
                          </div>
                          <div style={{ marginTop: 5, color: t.textMuted, fontSize: 12 }}>Mensuales: {r.ventasMensual} · Anuales: {r.ventasAnual} · Clases: {r.ventasClases}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          </div>
        )}

        {/* ── DASHBOARD ────────────────────────────────────────────────── */}
        {activeView === "dashboard" && (
          <div style={{ display: "grid", gap: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              <MetricCard title="Ingresos del mes" value={money(dashboardStats.ingresosMes)} accent t={t} />
              <MetricCard title="Ventas del mes" value={dashboardStats.ventasMes} t={t} />
            </div>
            <SimpleBarChart title="Ventas por día (mes actual)" data={dashboardStats.dailySeries} valueKey="total" t={t} />
            <BreakdownCard title="Ingresos por tipo (mes)" breakdown={dashboardStats.breakdownMes} t={t} />
            <BreakdownCard title="Ingresos totales por tipo" breakdown={dashboardStats.breakdownTotal} t={t} />
            <div ref={ingresosRef} style={S.card}>
              <h3 style={{ marginTop: 0, color: t.text, fontWeight: 700, fontSize: 16, marginBottom: 18 }}>Detalle de ingresos</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Fecha", "Nombre", "Email", "Servicio", "Monto", "Notas", "Eliminar"]} t={t} /></thead>
                  <tbody>
                    {ingresosPag.rows.map((i) => (
                      <tr key={i.id}>
                        <td style={S.td}>{i.fecha_pago ? formatDate(i.fecha_pago) : "-"}</td>
                        <td style={{ ...S.td, fontWeight: 700 }}>{i.cliente_nombre || "-"}</td>
                        <td style={S.td}>{i.email || "-"}</td>
                        <td style={S.td}>{serviceLabel(i.servicio)}</td>
                        <td style={{ ...S.td, color: t.accent, fontWeight: 700 }}>{money(i.monto)}</td>
                        <td style={S.td}>{i.notas || "-"}</td>
                        <td style={S.td}><button style={{ ...btn(false), padding: "6px 11px", fontSize: 13 }} onClick={() => eliminarIngreso(i.id)}>🗑</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!ingresos.length && <div style={{ padding: 24, textAlign: "center", color: t.textMuted }}>No hay ingresos cargados.</div>}
              </div>
              <Pagination page={ingresosPag.page} totalPages={ingresosPag.totalPages} setPage={ingresosPag.setPage} sectionRef={ingresosRef} t={t} />
            </div>
          </div>
        )}

        {/* ── OPERATIVA ────────────────────────────────────────────────── */}
        {activeView === "operativa" && (
          <>
            {/* Métricas */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 28 }}>
              {[
                ["Activos", resumen.activos, false],
                ["En gracia", resumen.gracia, false],
                ["Para sacar", resumen.sacar, false],
                ["Deudores", resumen.deudores, false],
                ["Clases", resumen.clases, false],
                ["Ingresos totales", `USD ${resumen.ingresos}`, true],
              ].map(([label, value, accent]) => (
                <div key={label} style={{ ...S.card, borderTop: accent ? `3px solid ${t.accent}` : undefined }}>
                  <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: accent ? t.accent : t.text, letterSpacing: "-0.02em" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Vencimientos críticos */}
            <div ref={criticosRef} style={{ ...S.card, marginBottom: 24, padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: t.text, letterSpacing: "-0.02em" }}>Vencimientos críticos</h3>
                <div style={{ color: t.textMuted, fontSize: 13, marginTop: 4 }}>Seguimiento rápido para accionar sin entrar a la base completa.</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, alignItems: "stretch" }}>
                <CriticosPanel titulo="Por vencer" badgeBg="#e2e8f0" badgeColor="#0f172a"
                  clientes={vencimientosCriticos.hoy} {...criticosHoyPag}
                  accentBorder={t.cardBorder} accentBg={t.cardBg} accentText={t.textMuted} dateLabel="vence"
                  onRenovarRapido={renovarRapido} onAbrirRenovar={abrirRenovar} onEliminar={eliminarCliente}
                  sectionRef={criticosRef} t={t} />
                <CriticosPanel titulo="En gracia" badgeBg="#fef3c7" badgeColor="#92400e"
                  clientes={vencimientosCriticos.gracia} {...criticosGraciaPag}
                  accentBorder="#fde68a" accentBg="#fffbeb" accentText="#92400e" dateLabel="venció"
                  onRenovarRapido={renovarRapido} onAbrirRenovar={abrirRenovar} onEliminar={eliminarCliente}
                  sectionRef={criticosRef} t={t} />
                <CriticosPanel titulo="Vencidos" badgeBg="#fee2e2" badgeColor="#991b1b"
                  clientes={vencimientosCriticos.vencidos} {...criticosVencidosPag}
                  accentBorder="#fca5a5" accentBg="#fef2f2" accentText="#991b1b" dateLabel="venció"
                  onRenovarRapido={renovarRapido} onAbrirRenovar={abrirRenovar} onEliminar={eliminarCliente}
                  sectionRef={criticosRef} t={t} />
              </div>
            </div>

            {/* Base operativa */}
            <div ref={baseRef} style={{ ...S.card, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
                <div>
                  <h3 style={{ margin: 0, color: t.text, fontWeight: 800, fontSize: 18 }}>Base operativa</h3>
                  <div style={{ color: t.textMuted, fontSize: 13, marginTop: 4 }}>{loading ? "Cargando datos..." : "Gestión central de clientes, renovaciones y clases."}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
                <input style={{ ...S.input, maxWidth: 340 }} placeholder="Buscar cliente o email" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                <select style={{ ...S.input, maxWidth: 220 }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                  <option value="todos">Todos</option>
                  <option value="mensual">Mensual</option>
                  <option value="anual">Anual</option>
                  <option value="clases">Clases</option>
                  <option value="gracia">En gracia</option>
                  <option value="sacar">Sacar</option>
                </select>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Cliente", "Email", "Servicio", "Vencimiento", "Días", "Estado", "Estado manual", "Acciones"]} t={t} /></thead>
                  <tbody>
                    {basePag.rows.map((c) => (
                      <tr key={c.id}>
                        <td style={{ ...S.td, fontWeight: 700 }}>{c.nombre}</td>
                        <td style={S.td}>
                          <input value={c.email || ""}
                            onChange={(e) => setClientes((prev) => prev.map((cli) => cli.id === c.id ? { ...cli, email: e.target.value } : cli))}
                            onBlur={(e) => actualizarEmail(c.id, e.target.value)}
                            style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.inputBg, color: t.inputText }} />
                        </td>
                        <td style={S.td}>{serviceLabel(c.servicio)}</td>
                        <td style={S.td}>{c.vencimiento ? formatDate(c.vencimiento) : "-"}</td>
                        <td style={S.td}>{c.vencimiento ? c.dias : "-"}</td>
                        <td style={S.td}><span style={badgeStyle(c.estadoSistema)}>{c.estadoSistema.toUpperCase()}</span></td>
                        <td style={S.td}>
                          <select style={{ ...S.input, padding: "8px 12px" }} value={c.estado_manual} onChange={(e) => cambiarEstado(c.id, e.target.value)}>
                            <option value="activo">Activo</option>
                            <option value="sacar">Sacar</option>
                          </select>
                        </td>
                        <td style={S.td}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button title="Renovación rápida" style={{ ...btn(true), padding: "7px 11px", fontSize: 13 }}
                              onClick={() => { if (window.confirm("¿Renovar con el mismo plan?")) renovarRapido(c); }}>✔</button>
                            <button title="Renovar con cambios" style={{ ...btn(false), padding: "7px 11px", fontSize: 13 }}
                              onClick={() => abrirRenovar(c)}>✏️</button>
                            <button title="Eliminar" style={{ ...btn(false), padding: "7px 11px", fontSize: 13 }}
                              onClick={() => { if (window.confirm("¿Eliminar cliente?")) eliminarCliente(c.id); }}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && !loading && <div style={{ padding: 24, textAlign: "center", color: t.textMuted }}>No hay resultados.</div>}
              </div>
              <Pagination page={basePag.page} totalPages={basePag.totalPages} setPage={basePag.setPage} sectionRef={baseRef} t={t} />
            </div>

            {/* Vencimientos */}
            <div ref={vencimientosRef} style={{ ...S.card, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0, color: t.text, fontWeight: 800, fontSize: 18, marginBottom: 16 }}>Vencimientos</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Cliente", "Servicio", "Vence", "Días", "Estado"]} t={t} /></thead>
                  <tbody>
                    {vencimientosPag.rows.map((c) => (
                      <tr key={c.id}>
                        <td style={{ ...S.td, fontWeight: 700 }}>{c.nombre}</td>
                        <td style={S.td}>{serviceLabel(c.servicio)}</td>
                        <td style={S.td}>{c.vencimiento ? formatDate(c.vencimiento) : "-"}</td>
                        <td style={S.td}>{c.vencimiento ? c.dias : "-"}</td>
                        <td style={S.td}><span style={badgeStyle(c.estadoSistema)}>{c.estadoSistema.toUpperCase()}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={vencimientosPag.page} totalPages={vencimientosPag.totalPages} setPage={vencimientosPag.setPage} sectionRef={vencimientosRef} t={t} />
            </div>

            {/* Deudores */}
            <div ref={deudoresRef} style={{ ...S.card, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0, color: t.text, fontWeight: 800, fontSize: 18, marginBottom: 16 }}>Deudores</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Cliente", "Servicio", "Pagado", "Resta", "Notas"]} t={t} /></thead>
                  <tbody>
                    {deudoresPag.rows.map((c) => (
                      <tr key={c.id}>
                        <td style={{ ...S.td, fontWeight: 700 }}>{c.nombre}</td>
                        <td style={S.td}>{serviceLabel(c.servicio)}</td>
                        <td style={S.td}>USD {c.monto}</td>
                        <td style={{ ...S.td, color: "#ef4444", fontWeight: 700 }}>USD {c.deuda_restante}</td>
                        <td style={S.td}>{c.notas || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!deudores.length && <div style={{ padding: 24, textAlign: "center", color: t.textMuted }}>Sin deudores registrados.</div>}
              </div>
              <Pagination page={deudoresPag.page} totalPages={deudoresPag.totalPages} setPage={deudoresPag.setPage} sectionRef={deudoresRef} t={t} />
            </div>

            {/* Clases */}
            <div ref={clasesRef} style={{ ...S.card, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0, color: t.text, fontWeight: 800, fontSize: 18, marginBottom: 16 }}>Clases</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Alumno", "Inicio", "Mes", "Monto", "Notas"]} t={t} /></thead>
                  <tbody>
                    {clasesPag.rows.map((c) => (
                      <tr key={c.id}>
                        <td style={{ ...S.td, fontWeight: 700 }}>{c.nombre}</td>
                        <td style={S.td}>{formatDate(c.fecha_inicio)}</td>
                        <td style={{ ...S.td, textTransform: "capitalize" }}>{monthLabel(monthKey(c.fecha_inicio))}</td>
                        <td style={{ ...S.td, color: t.accent, fontWeight: 700 }}>USD {c.monto}</td>
                        <td style={S.td}>{c.notas || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!clasesList.length && <div style={{ padding: 24, textAlign: "center", color: t.textMuted }}>Sin alumnos registrados.</div>}
              </div>
              <Pagination page={clasesPag.page} totalPages={clasesPag.totalPages} setPage={clasesPag.setPage} sectionRef={clasesRef} t={t} />
            </div>

            {/* Resumen mensual */}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)", gap: 24 }}>
              <div style={S.card}>
                <h3 style={{ marginTop: 0, color: t.text, fontWeight: 800, fontSize: 18, marginBottom: 16 }}>Resumen mensual</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={S.table}>
                    <thead><TableHeader cols={["Mes", "Mensual", "Anual", "Clases", "Total"]} t={t} /></thead>
                    <tbody>
                      {resumenMensual.map((r) => (
                        <tr key={r.key}>
                          <td style={{ ...S.td, fontWeight: 700, textTransform: "capitalize" }}>{monthLabel(r.key)}</td>
                          <td style={S.td}>USD {r.mensual}</td>
                          <td style={S.td}>USD {r.anual}</td>
                          <td style={S.td}>USD {r.clases}</td>
                          <td style={{ ...S.td, fontWeight: 800, color: t.accent }}>USD {r.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={S.card}>
                <h3 style={{ marginTop: 0, color: t.text, fontWeight: 800, fontSize: 18, marginBottom: 16 }}>Vista rápida</h3>
                <div style={{ display: "grid", gap: 16 }}>
                  {resumenMensual.map((r) => {
                    const pct = Math.max((r.total / maxTotal) * 100, 4);
                    return (
                      <div key={r.key}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14, color: t.text }}>
                          <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{monthLabel(r.key)}</span>
                          <strong style={{ color: t.accent }}>USD {r.total}</strong>
                        </div>
                        <div style={{ height: 8, background: t.barBg, borderRadius: 999, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: t.accentGrad, borderRadius: 999 }} />
                        </div>
                        <div style={{ marginTop: 5, color: t.textMuted, fontSize: 12 }}>Mensuales: {r.ventasMensual} · Anuales: {r.ventasAnual} · Clases: {r.ventasClases}</div>
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
