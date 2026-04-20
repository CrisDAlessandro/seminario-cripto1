import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── Constantes ──────────────────────────────────────────────────────────────
// FIX: TODAY era constante global; ahora es función para evitar que quede
// desactualizada si la pestaña queda abierta de un día para el otro.
function getToday() { return new Date(); }

const GRACE_DAYS = 3;
const PAGE_SIZES = { base: 10, vencimientos: 10, deudores: 5, clases: 5, ingresos: 10, criticos: 3 };

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

function money(value) {
  return `USD ${safeNumber(value)}`;
}

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
  const today = getToday(); // FIX: usar getToday() en vez de constante global
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
    ...client,
    isClases,
    vencimiento,
    dias,
    duracion_dias: safeNumber(client.duracion_dias),
    estadoSistema,
    class_range_label: isClases ? classRangeLabel(client.fecha_inicio) : null,
    class_end_date: isClases && client.fecha_inicio ? toISODate(addDays(client.fecha_inicio, 27)) : null,
  };
}

// ─── Paginación: hook reutilizable ────────────────────────────────────────────
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

// ─── Analytics helpers ────────────────────────────────────────────────────────
function buildDailySalesSeries(clientes) {
  const today = getToday();
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const rows = Array.from({ length: end.getDate() }, (_, i) => ({
    day: i + 1,
    label: String(i + 1).padStart(2, "0"),
    total: 0, mensual: 0, anual: 0, clases: 0, ventas: 0,
  }));

  clientes.forEach((c) => {
    if (!c.fecha_inicio) return;
    const d = parseISODate(c.fecha_inicio);
    if (!d || d.getFullYear() !== today.getFullYear() || d.getMonth() !== today.getMonth()) return;
    const row = rows[d.getDate() - 1];
    const monto = safeNumber(c.monto);
    row.total += monto;
    row.ventas += 1;
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

// FIX: Validación de email generalizada (no sólo @gmail.com)
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Tema: modo oscuro/claro ──────────────────────────────────────────────────
function getThemeStyles(dark) {
  return {
    bg: dark ? "#0f172a" : "#f5f3ee",
    cardBg: dark ? "#1e293b" : "#ffffff",
    cardBorder: dark ? "#334155" : "#e5e7eb",
    text: dark ? "#f1f5f9" : "#0f172a",
    textMuted: dark ? "#94a3b8" : "#64748b",
    inputBg: dark ? "#1e293b" : "#fff",
    inputBorder: dark ? "#334155" : "#d1d5db",
    inputText: dark ? "#f1f5f9" : "#0f172a",
    thBg: dark ? "#0f172a" : "#f8fafc",
    tdBorder: dark ? "#334155" : "#e5e7eb",
    btnDarkBg: dark ? "#e2e8f0" : "#0f172a",
    btnDarkText: dark ? "#0f172a" : "#fff",
    btnLightBg: dark ? "#334155" : "#e5e7eb",
    btnLightText: dark ? "#f1f5f9" : "#111827",
    navActiveBg: dark ? "#e2e8f0" : "#0f172a",
    navActiveText: dark ? "#0f172a" : "#fff",
    navInactiveBg: dark ? "#1e293b" : "#fff",
    navInactiveText: dark ? "#f1f5f9" : "#0f172a",
    navInactiveBorder: dark ? "#334155" : "#e5e7eb",
    barBg: dark ? "#334155" : "#e5e7eb",
    barFill: dark ? "#e2e8f0" : "#0f172a",
  };
}

// ─── Estilos dinámicos ────────────────────────────────────────────────────────
function makeS(t) {
  return {
    card: {
      background: t.cardBg, borderRadius: 18, padding: 20,
      boxShadow: "0 4px 16px rgba(15,23,42,0.06)", border: `1px solid ${t.cardBorder}`,
    },
    input: {
      width: "100%", padding: "12px 14px", borderRadius: 12,
      border: `1px solid ${t.inputBorder}`, fontSize: 14, outline: "none",
      boxSizing: "border-box", background: t.inputBg, color: t.inputText,
    },
    label: { display: "block", fontSize: 13, fontWeight: 700, color: t.textMuted, marginBottom: 6 },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
    td: { padding: 12, borderBottom: `1px solid ${t.tdBorder}`, color: t.text },
    thRow: { background: t.thBg },
  };
}

function makeBtn(t) {
  return function btn(dark = false) {
    return {
      padding: "12px 16px", borderRadius: 12, border: "none", cursor: "pointer",
      fontWeight: 700, fontSize: 14,
      background: dark ? t.btnDarkBg : t.btnLightBg,
      color: dark ? t.btnDarkText : t.btnLightText,
    };
  };
}

function makeNavBtn(t) {
  return function navBtn(active) {
    return {
      padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 14,
      border: active ? `1px solid ${t.navActiveBg}` : `1px solid ${t.navInactiveBorder}`,
      background: active ? t.navActiveBg : t.navInactiveBg,
      color: active ? t.navActiveText : t.navInactiveText,
    };
  };
}

function badgeStyle(status) {
  const base = { display: "inline-block", padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: "1px solid transparent" };
  if (status === "activo") return { ...base, background: "#dcfce7", color: "#166534", borderColor: "#bbf7d0" };
  if (status === "gracia") return { ...base, background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" };
  if (status === "vencido") return { ...base, background: "#fee2e2", color: "#b91c1c", borderColor: "#fecaca" };
  return { ...base, background: "#e2e8f0", color: "#0f172a", borderColor: "#cbd5e1" };
}

// ─── Componentes reutilizables ────────────────────────────────────────────────
function MetricCard({ title, value, sub, t }) {
  const S = makeS(t);
  return (
    <div style={S.card}>
      <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: t.text }}>{value}</div>
      {sub && <div style={{ marginTop: 8, fontSize: 12, color: t.textMuted }}>{sub}</div>}
    </div>
  );
}

function BarList({ items, t }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {items.map(({ label, value }) => {
        const pct = Math.max((value / max) * 100, value > 0 ? 6 : 0);
        return (
          <div key={label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14, color: t.text }}>
              <span>{label}</span>
              <strong>{money(value)}</strong>
            </div>
            <div style={{ height: 12, background: t.barBg, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: t.barFill }} />
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
      <h3 style={{ marginTop: 0, color: t.text }}>{title}</h3>
      {!hasData
        ? <div style={{ color: t.textMuted }}>{emptyText}</div>
        : <BarList items={data.map((r) => ({ label: r[labelKey], value: safeNumber(r[valueKey]) }))} t={t} />
      }
    </div>
  );
}

function BreakdownCard({ title, breakdown, t }) {
  const S = makeS(t);
  const items = [
    { key: "mensual", label: "Plan mensual" },
    { key: "anual", label: "Plan anual" },
    { key: "clases", label: "Clases" },
  ];
  return (
    <div style={S.card}>
      <h3 style={{ marginTop: 0, color: t.text }}>{title}</h3>
      <BarList items={items.map(({ key, label }) => ({ label, value: safeNumber(breakdown[key]) }))} t={t} />
    </div>
  );
}

// Paginación con "Página X de Y" a la izquierda y botones a la derecha
function Pagination({ page, totalPages, setPage, t }) {
  const btn = makeBtn(t);
  if (totalPages <= 1) return null;
  return (
    <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
      <div style={{ color: t.textMuted, fontSize: 14, whiteSpace: "nowrap" }}>Página {page} de {totalPages}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={{ ...btn(false), padding: "8px 14px", fontSize: 13 }} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Anterior</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
          <button key={n} style={{ ...btn(n === page), padding: "8px 12px", fontSize: 13 }} onClick={() => setPage(n)}>{n}</button>
        ))}
        <button style={{ ...btn(false), padding: "8px 14px", fontSize: 13 }} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Siguiente</button>
      </div>
    </div>
  );
}

function TableHeader({ cols, t }) {
  const S = makeS(t);
  return (
    <tr style={S.thRow}>
      {cols.map((h) => (
        <th key={h} style={{ textAlign: "left", ...S.td, color: t.textMuted, fontWeight: 700 }}>{h}</th>
      ))}
    </tr>
  );
}

// Tarjeta de cliente crítico
function ClienteCard({ cliente, accentBorder, accentBg, accentText, dateLabel, onRenovarRapido, onAbrirRenovar, onEliminar, t }) {
  const btn = makeBtn(t);
  return (
    <div style={{ border: `1px solid ${accentBorder}`, background: accentBg, borderRadius: 14, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <div>
        <div style={{ fontWeight: 800, color: t.text }}>{cliente.nombre}</div>
        <div style={{ fontSize: 13, color: accentText, marginTop: 2 }}>
          {serviceLabel(cliente.servicio)} · {dateLabel} {formatDate(cliente.vencimiento)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={{ ...btn(true), padding: "8px 12px" }} title="Renovación rápida"
          onClick={() => { if (window.confirm("¿Renovar cliente con el mismo plan?")) onRenovarRapido(cliente); }}>✔</button>
        <button style={{ ...btn(false), padding: "8px 12px" }} title="Renovar con cambios"
          onClick={() => onAbrirRenovar(cliente)}>✏️</button>
        <button style={{ ...btn(false), padding: "8px 12px" }} title="Eliminar cliente"
          onClick={() => { if (window.confirm("¿Eliminar cliente?")) onEliminar(cliente.id); }}>🗑</button>
      </div>
    </div>
  );
}

// Panel críticos: paginación siempre al fondo, altura mínima fija para alineación
function CriticosPanel({ titulo, badgeBg, badgeColor, clientes, rows, page, totalPages, setPage, accentBorder, accentBg, accentText, dateLabel, onRenovarRapido, onAbrirRenovar, onEliminar, t }) {
  const S = makeS(t);
  return (
    <div style={{ ...S.card, display: "flex", flexDirection: "column", minHeight: 280 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: t.text }}>{titulo}</div>
        <div style={{ minWidth: 34, height: 34, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: badgeBg, color: badgeColor, fontWeight: 800 }}>
          {clientes.length}
        </div>
      </div>
      {/* Contenido flexible que empuja la paginación al fondo */}
      <div style={{ flex: 1 }}>
        {clientes.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((c) => (
              <ClienteCard key={c.id} cliente={c}
                accentBorder={accentBorder} accentBg={accentBg} accentText={accentText}
                dateLabel={dateLabel}
                onRenovarRapido={onRenovarRapido} onAbrirRenovar={onAbrirRenovar} onEliminar={onEliminar}
                t={t}
              />
            ))}
          </div>
        ) : (
          <div style={{ color: t.textMuted, fontSize: 14 }}>Sin clientes en esta categoría.</div>
        )}
      </div>
      {/* Paginación siempre al fondo */}
      <Pagination page={page} totalPages={totalPages} setPage={setPage} t={t} />
    </div>
  );
}

// Formulario de cliente (alta o renovación)
function ClienteForm({ title, subtitle, form, setForm, onGuardar, onCancelar, guardando, isModal = false, t }) {
  const S = makeS(t);
  const btn = makeBtn(t);
  const isClases = form.servicio === "clases";

  const inner = (
    <div style={{ width: "100%", maxWidth: isModal ? 820 : undefined, background: t.cardBg, borderRadius: 18, padding: 24, boxShadow: isModal ? "0 20px 60px rgba(15,23,42,0.25)" : undefined, border: `1px solid ${t.cardBorder}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h3 style={{ margin: 0, color: t.text }}>{title}</h3>
          {subtitle && <div style={{ color: t.textMuted, fontSize: 14 }}>{subtitle}</div>}
        </div>
        {isModal && <button onClick={onCancelar} style={btn(false)}>Cerrar</button>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <Field label="Nombre" t={t}>
          <input style={S.input} placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </Field>
        <Field label="Email" t={t}>
          <input style={S.input} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
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
        <Field label={isModal ? "Fecha de renovación" : "Fecha de inicio"} t={t}>
          <input type="date" style={S.input} value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
        </Field>
        <Field label="Monto" t={t}>
          <input type="number" style={S.input} placeholder="Monto" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
        </Field>
        {!isClases && (
          <Field label="Duración (días)" t={t}>
            <input type="number" style={S.input} placeholder="Duración en días" value={form.duracion_dias} onChange={(e) => setForm({ ...form, duracion_dias: e.target.value })} />
          </Field>
        )}
        <Field label="Deuda restante" t={t}>
          <input type="number" style={S.input} placeholder="Deuda restante" value={form.deuda_restante} onChange={(e) => setForm({ ...form, deuda_restante: e.target.value })} />
        </Field>
        <Field label="Notas" spanAll t={t}>
          <input style={S.input} placeholder="Notas" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </Field>
      </div>

      <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        {isModal && <button onClick={onCancelar} style={btn(false)}>Cancelar</button>}
        <button style={btn(true)} onClick={onGuardar}>
          {guardando ? "Guardando..." : isModal ? "Confirmar renovación" : "Guardar cliente"}
        </button>
      </div>
    </div>
  );

  if (!isModal) return inner;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 1000 }}>
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
  const [email, setEmail] = useState("");
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
  const baseRef = useRef(null);

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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
  }

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

  async function refetch() {
    await Promise.all([fetchClientes(), fetchIngresos()]);
  }

  useEffect(() => { fetchClientes(); fetchIngresos(); }, []);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function validateClienteForm(f) {
    const nombre = f.nombre.trim();
    const emailVal = f.email.trim().toLowerCase();
    if (!nombre) { alert("Falta el nombre"); return null; }
    if (!emailVal) { alert("Falta el email"); return null; }
    // FIX: validación de email genérica en vez de solo @gmail.com
    if (!isValidEmail(emailVal)) { alert("El email no es válido"); return null; }
    if (f.servicio !== "clases" && Number(f.duracion_dias || 0) <= 0) { alert("Falta la duración en días"); return null; }
    return { nombre, email: emailVal };
  }

  function buildClientePayload(f, nombre, emailVal) {
    const duracion = f.servicio === "clases" ? 0 : Number(f.duracion_dias || 0);
    return {
      ...f,
      nombre, email: emailVal,
      estado_manual: "activo",
      monto: Number(f.monto || 0),
      duracion_dias: duracion,
      deuda_restante: Number(f.deuda_restante || 0),
      fecha_vencimiento: f.servicio === "clases" || duracion <= 0 ? null : toISODate(addDays(f.fecha_inicio, duracion)),
    };
  }

  function buildIngresoPayload(clienteId, nombre, emailVal, servicio, monto, fecha, notas) {
    return {
      cliente_id: clienteId,
      cliente_nombre: nombre,
      email: emailVal,
      servicio,
      monto: Number(monto || 0),
      fecha_pago: fecha,
      notas: notas || "",
    };
  }

  async function guardarCliente() {
    const validated = validateClienteForm(form);
    if (!validated) return;
    setGuardando(true);

    const payload = buildClientePayload(form, validated.nombre, validated.email);
    const { data: inserted, error } = await supabase.from("clientes").insert([payload]).select().single();
    if (error) { setGuardando(false); alert("No se pudo guardar el cliente"); return; }

    const { error: errIngreso } = await supabase.from("ingresos").insert([
      buildIngresoPayload(inserted.id, inserted.nombre, inserted.email, inserted.servicio, inserted.monto, inserted.fecha_inicio, inserted.notas)
    ]);
    if (errIngreso) alert("Error registrando ingreso: " + errIngreso.message);

    setGuardando(false);
    setShowForm(false);
    setForm(FORM_DEFAULTS);
    refetch();
  }

  async function guardarRenovacion() {
    const validated = validateClienteForm(renovarForm);
    if (!validated) return;
    setRenovando(true);

    const payload = buildClientePayload(renovarForm, validated.nombre, validated.email);
    const { error: errCliente } = await supabase.from("clientes").update(payload).eq("id", renovarForm.id);
    if (errCliente) { setRenovando(false); alert("No se pudo renovar el cliente"); return; }

    const today = getToday();
    const { error: errIngreso } = await supabase.from("ingresos").insert([
      buildIngresoPayload(renovarForm.id, validated.nombre, validated.email, renovarForm.servicio, renovarForm.monto, toISODate(today), renovarForm.notas)
    ]);
    if (errIngreso) alert("El cliente se renovó, pero no se pudo registrar el ingreso: " + errIngreso.message);

    setRenovando(false);
    setShowRenovar(false);
    refetch();
  }

  async function renovarRapido(cliente) {
    const today = getToday();
    const duracion = cliente.servicio === "clases" ? 0 : Number(cliente.duracion_dias || serviceDefaultDuration(cliente.servicio));
    const vencimientoActual = cliente.vencimiento || cliente.fecha_vencimiento || null;
    let fechaBase = toISODate(today);
    if (vencimientoActual && (cliente.estadoSistema === "activo" || cliente.estadoSistema === "gracia")) {
      fechaBase = vencimientoActual;
    }
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

    const { error: errIngreso } = await supabase.from("ingresos").insert([
      buildIngresoPayload(cliente.id, cliente.nombre || "", (cliente.email || "").trim().toLowerCase(), cliente.servicio, cliente.monto, toISODate(today), cliente.notas)
    ]);
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
    if (vencimientoActual && (cliente.estadoSistema === "activo" || cliente.estadoSistema === "gracia")) {
      fechaBase = vencimientoActual;
    }
    setRenovarForm({
      id: cliente.id, nombre: cliente.nombre || "", email: cliente.email || "",
      servicio: cliente.servicio || "mensual", fecha_inicio: fechaBase,
      monto: safeNumber(cliente.monto),
      duracion_dias: cliente.servicio === "clases" ? 0 : safeNumber(cliente.duracion_dias || serviceDefaultDuration(cliente.servicio)),
      deuda_restante: safeNumber(cliente.deuda_restante),
      notas: cliente.notas || "",
    });
    setShowRenovar(true);
  }

  // FIX: resetear showForm al cambiar de vista
  function handleSetView(v) {
    setActiveView(v);
    setShowForm(false);
  }

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

  // Reset base page cuando cambia búsqueda/filtro
  useEffect(() => { basePag.setPage(1); }, [busqueda, filtro]);

  // Scroll al cambiar página de base operativa
  useEffect(() => { baseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [basePag.page]);

  // ── Login ─────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: t.bg, padding: 24 }}>
        <div style={{ width: 360, ...S.card, padding: 28 }}>
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 34, fontWeight: 800, color: t.text }}>Seminario Cripto</h2>
          <div style={{ color: t.textMuted, marginBottom: 18 }}>Ingreso al sistema interno</div>

          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ ...S.input, marginBottom: 10 }} />

          <div style={{ position: "relative", marginBottom: 14 }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={S.input}
            />
            {/* FIX: ícono de ojo SVG profesional (ojo abierto / ojo con línea) */}
            <span
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: t.textMuted, display: "flex", alignItems: "center", userSelect: "none" }}
            >
              {showPassword ? (
                // Ojo con línea encima (ocultar)
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                // Ojo abierto (mostrar)
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </span>
          </div>

          <button onClick={login} style={{ ...btn(true), width: "100%" }}>Entrar</button>

          {/* Botón modo oscuro también en login */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            style={{ ...btn(false), width: "100%", marginTop: 10, fontSize: 13 }}
          >
            {darkMode ? "☀ Modo claro" : "☾ Modo oscuro"}
          </button>
        </div>
      </div>
    );
  }

  // ── App principal ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: 28 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, color: t.text }}>Seminario Cripto</h1>
            <div style={{ color: t.textMuted, marginTop: 6 }}>Panel de gestión comercial y operativa.</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button style={navBtn(activeView === "operativa")} onClick={() => handleSetView("operativa")}>Operativa</button>
            <button style={navBtn(activeView === "dashboard")} onClick={() => handleSetView("dashboard")}>Dashboard</button>
            <button style={btn(true)} onClick={() => setShowForm(!showForm)}>{showForm ? "Cerrar" : "+ Nuevo cliente"}</button>
            {/* Botón modo oscuro/claro */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              style={{ padding: "10px 14px", borderRadius: 12, border: `1px solid ${t.navInactiveBorder}`, background: t.navInactiveBg, cursor: "pointer", fontWeight: 600, color: t.text, fontSize: 16 }}
            >
              {darkMode ? "☀" : "☾"}
            </button>
            <button onClick={logout} style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${t.navInactiveBorder}`, background: t.navInactiveBg, cursor: "pointer", fontWeight: 600, color: t.text }}>Salir</button>
          </div>
        </div>

        {/* Formulario alta */}
        {showForm && (
          <div style={{ marginBottom: 24 }}>
            <ClienteForm title="Alta de cliente" form={form} setForm={setForm}
              onGuardar={guardarCliente} onCancelar={() => setShowForm(false)} guardando={guardando} t={t} />
          </div>
        )}

        {/* Modal renovar */}
        {showRenovar && (
          <ClienteForm title="Renovar cliente" subtitle="Actualizar plan y registrar nuevo ingreso"
            form={renovarForm} setForm={setRenovarForm}
            onGuardar={guardarRenovacion} onCancelar={() => setShowRenovar(false)}
            guardando={renovando} isModal t={t} />
        )}

        {/* ── DASHBOARD ────────────────────────────────────────────────────── */}
        {activeView === "dashboard" && (
          <div style={{ display: "grid", gap: 24, marginBottom: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <MetricCard title="Ingresos del mes" value={money(dashboardStats.ingresosMes)} t={t} />
              <MetricCard title="Ventas del mes" value={dashboardStats.ventasMes} t={t} />
            </div>

            <SimpleBarChart title="Ventas por día (mes actual)" data={dashboardStats.dailySeries} valueKey="total" t={t} />
            <BreakdownCard title="Ingresos por tipo (mes)" breakdown={dashboardStats.breakdownMes} t={t} />
            <BreakdownCard title="Ingresos totales por tipo" breakdown={dashboardStats.breakdownTotal} t={t} />

            {/* Detalle de ingresos */}
            <div style={S.card}>
              <h3 style={{ marginTop: 0, color: t.text }}>Detalle de ingresos</h3>
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
                        <td style={S.td}>{money(i.monto)}</td>
                        <td style={S.td}>{i.notas || "-"}</td>
                        <td style={S.td}>
                          <button style={{ ...btn(false), padding: "8px 12px" }} onClick={() => eliminarIngreso(i.id)}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!ingresos.length && <div style={{ padding: 24, textAlign: "center", color: t.textMuted }}>No hay ingresos cargados.</div>}
              </div>
              <Pagination page={ingresosPag.page} totalPages={ingresosPag.totalPages} setPage={ingresosPag.setPage} t={t} />
            </div>
          </div>
        )}

        {/* ── OPERATIVA ────────────────────────────────────────────────────── */}
        {activeView === "operativa" && (
          <>
            {/* Métricas */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16, marginBottom: 24 }}>
              {[["Activos", resumen.activos], ["En gracia", resumen.gracia], ["Para sacar", resumen.sacar],
                ["Deudores", resumen.deudores], ["Clases", resumen.clases], ["Ingresos", `USD ${resumen.ingresos}`]].map(([label, value]) => (
                <div key={label} style={S.card}>
                  <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 30, fontWeight: 800, color: t.text }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Vencimientos críticos — los tres paneles en la misma fila, sincronizados */}
            <div style={{ ...S.card, marginBottom: 24, padding: 24 }}>
              <div style={{ marginBottom: 18 }}>
                <h3 style={{ margin: 0, fontSize: 24, color: t.text }}>Vencimientos críticos</h3>
                <div style={{ color: t.textMuted, fontSize: 14, marginTop: 4 }}>
                  Seguimiento rápido de clientes sensibles para accionar sin entrar a la base completa.
                </div>
              </div>
              {/* grid con align-items: stretch para que los tres paneles tengan la misma altura */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, alignItems: "stretch" }}>
                <CriticosPanel titulo="Por vencer" badgeBg="#e2e8f0" badgeColor="#0f172a"
                  clientes={vencimientosCriticos.hoy} {...criticosHoyPag}
                  accentBorder="#e5e7eb" accentBg={darkMode ? "#1e293b" : "#fff"} accentText={t.textMuted} dateLabel="vence"
                  onRenovarRapido={renovarRapido} onAbrirRenovar={abrirRenovar} onEliminar={eliminarCliente} t={t} />
                <CriticosPanel titulo="En gracia" badgeBg="#fef3c7" badgeColor="#92400e"
                  clientes={vencimientosCriticos.gracia} {...criticosGraciaPag}
                  accentBorder="#fde68a" accentBg="#fffbeb" accentText="#92400e" dateLabel="venció"
                  onRenovarRapido={renovarRapido} onAbrirRenovar={abrirRenovar} onEliminar={eliminarCliente} t={t} />
                <CriticosPanel titulo="Vencidos" badgeBg="#fee2e2" badgeColor="#b91c1c"
                  clientes={vencimientosCriticos.vencidos} {...criticosVencidosPag}
                  accentBorder="#fecaca" accentBg="#fef2f2" accentText="#b91c1c" dateLabel="venció"
                  onRenovarRapido={renovarRapido} onAbrirRenovar={abrirRenovar} onEliminar={eliminarCliente} t={t} />
              </div>
            </div>

            {/* Base operativa */}
            <div ref={baseRef} style={{ ...S.card, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, color: t.text }}>Base operativa</h3>
                  <div style={{ color: t.textMuted, fontSize: 14, marginTop: 4 }}>
                    {loading ? "Cargando datos..." : "Gestión central de clientes, renovaciones y clases."}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                <input style={{ ...S.input, maxWidth: 340 }} placeholder="Buscar cliente o email"
                  value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
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
                            style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.inputBg, color: t.inputText }} />
                        </td>
                        <td style={S.td}>{serviceLabel(c.servicio)}</td>
                        <td style={S.td}>{c.vencimiento ? formatDate(c.vencimiento) : "-"}</td>
                        <td style={S.td}>{c.vencimiento ? c.dias : "-"}</td>
                        <td style={S.td}><span style={badgeStyle(c.estadoSistema)}>{c.estadoSistema.toUpperCase()}</span></td>
                        <td style={S.td}>
                          <select style={S.input} value={c.estado_manual} onChange={(e) => cambiarEstado(c.id, e.target.value)}>
                            <option value="activo">Activo</option>
                            <option value="sacar">Sacar</option>
                          </select>
                        </td>
                        <td style={S.td}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button title="Renovación rápida" style={{ ...btn(true), padding: "8px 12px" }}
                              onClick={() => { if (window.confirm("¿Renovar cliente con el mismo plan?")) renovarRapido(c); }}>✔</button>
                            <button title="Renovar con cambios" style={{ ...btn(false), padding: "8px 12px" }}
                              onClick={() => abrirRenovar(c)}>✏️</button>
                            <button title="Eliminar cliente" style={{ ...btn(false), padding: "8px 12px" }}
                              onClick={() => { if (window.confirm("¿Eliminar cliente?")) eliminarCliente(c.id); }}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && !loading && <div style={{ padding: 24, textAlign: "center", color: t.textMuted }}>No hay resultados.</div>}
              </div>
              <Pagination page={basePag.page} totalPages={basePag.totalPages} setPage={basePag.setPage} t={t} />
            </div>

            {/* Vencimientos */}
            <div style={{ ...S.card, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0, color: t.text }}>Vencimientos</h3>
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
              <Pagination page={vencimientosPag.page} totalPages={vencimientosPag.totalPages} setPage={vencimientosPag.setPage} t={t} />
            </div>

            {/* Deudores */}
            <div style={{ ...S.card, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0, color: t.text }}>Deudores</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Cliente", "Servicio", "Pagado", "Resta", "Notas"]} t={t} /></thead>
                  <tbody>
                    {deudoresPag.rows.map((c) => (
                      <tr key={c.id}>
                        <td style={{ ...S.td, fontWeight: 700 }}>{c.nombre}</td>
                        <td style={S.td}>{serviceLabel(c.servicio)}</td>
                        <td style={S.td}>USD {c.monto}</td>
                        <td style={S.td}>USD {c.deuda_restante}</td>
                        <td style={S.td}>{c.notas || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!deudores.length && <div style={{ padding: 24, textAlign: "center", color: t.textMuted }}>Sin deudores registrados.</div>}
              </div>
              <Pagination page={deudoresPag.page} totalPages={deudoresPag.totalPages} setPage={deudoresPag.setPage} t={t} />
            </div>

            {/* Clases */}
            <div style={{ ...S.card, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0, color: t.text }}>Clases</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Alumno", "Inicio", "Mes", "Monto", "Notas"]} t={t} /></thead>
                  <tbody>
                    {clasesPag.rows.map((c) => (
                      <tr key={c.id}>
                        <td style={{ ...S.td, fontWeight: 700 }}>{c.nombre}</td>
                        <td style={S.td}>{formatDate(c.fecha_inicio)}</td>
                        <td style={{ ...S.td, textTransform: "capitalize" }}>{monthLabel(monthKey(c.fecha_inicio))}</td>
                        <td style={S.td}>USD {c.monto}</td>
                        <td style={S.td}>{c.notas || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!clasesList.length && <div style={{ padding: 24, textAlign: "center", color: t.textMuted }}>Sin alumnos de clases registrados.</div>}
              </div>
              <Pagination page={clasesPag.page} totalPages={clasesPag.totalPages} setPage={clasesPag.setPage} t={t} />
            </div>

            {/* Resumen mensual */}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)", gap: 24 }}>
              <div style={S.card}>
                <h3 style={{ marginTop: 0, color: t.text }}>Resumen mensual</h3>
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
                          <td style={{ ...S.td, fontWeight: 800 }}>USD {r.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={S.card}>
                <h3 style={{ marginTop: 0, color: t.text }}>Vista rápida</h3>
                <div style={{ display: "grid", gap: 16 }}>
                  {resumenMensual.map((r) => {
                    const pct = Math.max((r.total / maxTotal) * 100, 6);
                    return (
                      <div key={r.key}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14, color: t.text }}>
                          <span style={{ textTransform: "capitalize" }}>{monthLabel(r.key)}</span>
                          <strong>USD {r.total}</strong>
                        </div>
                        <div style={{ height: 12, background: t.barBg, borderRadius: 999, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: t.barFill }} />
                        </div>
                        <div style={{ marginTop: 6, color: t.textMuted, fontSize: 12 }}>
                          Mensuales: {r.ventasMensual} · Anuales: {r.ventasAnual} · Clases: {r.ventasClases}
                        </div>
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
