import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── Constantes ──────────────────────────────────────────────────────────────
const TODAY = new Date();
const GRACE_DAYS = 3;
const PAGE_SIZES = { base: 10, vencimientos: 10, deudores: 5, clases: 5, ingresos: 10, criticos: 3 };

const FORM_DEFAULTS = {
  nombre: "", email: "", servicio: "mensual",
  fecha_inicio: toISODate(TODAY), monto: 30, duracion_dias: 30,
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
    dias = diffDays(TODAY, dueDate);
    if (TODAY > dueDate) {
      const overdue = diffDays(dueDate, TODAY);
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

  // Si los items cambian y la página actual queda fuera de rango, la corregimos
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
  const end = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0);
  const rows = Array.from({ length: end.getDate() }, (_, i) => ({
    day: i + 1,
    label: String(i + 1).padStart(2, "0"),
    total: 0, mensual: 0, anual: 0, clases: 0, ventas: 0,
  }));

  clientes.forEach((c) => {
    if (!c.fecha_inicio) return;
    const d = parseISODate(c.fecha_inicio);
    if (!d || d.getFullYear() !== TODAY.getFullYear() || d.getMonth() !== TODAY.getMonth()) return;
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

// ─── Estilos ─────────────────────────────────────────────────────────────────
const S = {
  card: {
    background: "#ffffff", borderRadius: 18, padding: 20,
    boxShadow: "0 4px 16px rgba(15,23,42,0.06)", border: "1px solid #e5e7eb",
  },
  input: {
    width: "100%", padding: "12px 14px", borderRadius: 12,
    border: "1px solid #d1d5db", fontSize: 14, outline: "none",
    boxSizing: "border-box", background: "#fff",
  },
  label: { display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  td: { padding: 12, borderBottom: "1px solid #e5e7eb" },
  thRow: { background: "#f8fafc" },
};

function btn(dark = false) {
  return {
    padding: "12px 16px", borderRadius: 12, border: "none", cursor: "pointer",
    fontWeight: 700, fontSize: 14,
    background: dark ? "#0f172a" : "#e5e7eb",
    color: dark ? "#fff" : "#111827",
  };
}

function navBtn(active) {
  return {
    padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 14,
    border: active ? "1px solid #0f172a" : "1px solid #e5e7eb",
    background: active ? "#0f172a" : "#fff",
    color: active ? "#fff" : "#0f172a",
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
function MetricCard({ title, value, sub }) {
  return (
    <div style={S.card}>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>{sub}</div>}
    </div>
  );
}

function BarList({ items }) {
  // items: [{ label, value }]
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {items.map(({ label, value }) => {
        const pct = Math.max((value / max) * 100, value > 0 ? 6 : 0);
        return (
          <div key={label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
              <span>{label}</span>
              <strong>{money(value)}</strong>
            </div>
            <div style={{ height: 12, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "#0f172a" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SimpleBarChart({ title, data, valueKey, labelKey = "label", emptyText = "Sin datos." }) {
  const hasData = data.some((r) => safeNumber(r[valueKey]) > 0);
  return (
    <div style={S.card}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {!hasData
        ? <div style={{ color: "#64748b" }}>{emptyText}</div>
        : <BarList items={data.map((r) => ({ label: r[labelKey], value: safeNumber(r[valueKey]) }))} />
      }
    </div>
  );
}

function BreakdownCard({ title, breakdown }) {
  const items = [
    { key: "mensual", label: "Plan mensual" },
    { key: "anual", label: "Plan anual" },
    { key: "clases", label: "Clases" },
  ];
  return (
    <div style={S.card}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <BarList items={items.map(({ key, label }) => ({ label, value: safeNumber(breakdown[key]) }))} />
    </div>
  );
}

function Pagination({ page, totalPages, setPage }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
      <div style={{ color: "#64748b", fontSize: 14 }}>Página {page} de {totalPages}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btn(false)} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Anterior</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
          <button key={n} style={btn(n === page)} onClick={() => setPage(n)}>{n}</button>
        ))}
        <button style={btn(false)} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Siguiente</button>
      </div>
    </div>
  );
}

function TableHeader({ cols }) {
  return (
    <tr style={S.thRow}>
      {cols.map((h) => (
        <th key={h} style={{ textAlign: "left", ...S.td }}>{h}</th>
      ))}
    </tr>
  );
}

// Tarjeta de cliente crítico (Por vencer / En gracia / Vencido)
function ClienteCard({ cliente, accentBorder, accentBg, accentText, dateLabel, onRenovarRapido, onAbrirRenovar, onEliminar }) {
  return (
    <div style={{ border: `1px solid ${accentBorder}`, background: accentBg, borderRadius: 14, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <div>
        <div style={{ fontWeight: 800 }}>{cliente.nombre}</div>
        <div style={{ fontSize: 13, color: accentText, marginTop: 2 }}>
          {serviceLabel(cliente.servicio)} · {dateLabel} {formatDate(cliente.vencimiento)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={{ ...btn(true), padding: "8px 12px" }} title="Renovación rápida"
          onClick={() => confirm("¿Renovar cliente con el mismo plan?") && onRenovarRapido(cliente)}>✔</button>
        <button style={{ ...btn(false), padding: "8px 12px" }} title="Renovar con cambios"
          onClick={() => onAbrirRenovar(cliente)}>✏️</button>
        <button style={{ ...btn(false), padding: "8px 12px" }} title="Eliminar cliente"
          onClick={() => confirm("¿Eliminar cliente?") && onEliminar(cliente.id)}>🗑</button>
      </div>
    </div>
  );
}

// Panel de una categoría de críticos
function CriticosPanel({ titulo, badgeBg, badgeColor, clientes, rows, page, totalPages, setPage, accentBorder, accentBg, accentText, dateLabel, onRenovarRapido, onAbrirRenovar, onEliminar }) {
  return (
    <div style={{ ...S.card, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 260 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{titulo}</div>
        <div style={{ minWidth: 34, height: 34, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: badgeBg, color: badgeColor, fontWeight: 800 }}>
          {clientes.length}
        </div>
      </div>
      {clientes.length ? (
        <>
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((c) => (
              <ClienteCard key={c.id} cliente={c}
                accentBorder={accentBorder} accentBg={accentBg} accentText={accentText}
                dateLabel={dateLabel}
                onRenovarRapido={onRenovarRapido} onAbrirRenovar={onAbrirRenovar} onEliminar={onEliminar}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
        </>
      ) : (
        <div style={{ color: "#64748b", fontSize: 14 }}>Sin clientes en esta categoría.</div>
      )}
    </div>
  );
}

// Formulario de cliente (alta o renovación)
function ClienteForm({ title, subtitle, form, setForm, onGuardar, onCancelar, guardando, isModal = false }) {
  const isClases = form.servicio === "clases";

  const inner = (
    <div style={{ width: "100%", maxWidth: isModal ? 820 : undefined, background: "#fff", borderRadius: 18, padding: 24, boxShadow: isModal ? "0 20px 60px rgba(15,23,42,0.25)" : undefined, border: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {subtitle && <div style={{ color: "#64748b", fontSize: 14 }}>{subtitle}</div>}
        </div>
        {isModal && <button onClick={onCancelar} style={btn(false)}>Cerrar</button>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <Field label="Nombre">
          <input style={S.input} placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </Field>
        <Field label="Email">
          <input style={S.input} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Servicio">
          <select style={S.input} value={form.servicio} onChange={(e) => {
            const servicio = e.target.value;
            setForm({ ...form, servicio, monto: serviceDefaultAmount(servicio), duracion_dias: serviceDefaultDuration(servicio) });
          }}>
            <option value="mensual">Plan Inversor Mensual</option>
            <option value="anual">Plan Inversor Anual</option>
            <option value="clases">Clases</option>
          </select>
        </Field>
        <Field label={isModal ? "Fecha de renovación" : "Fecha de inicio"}>
          <input type="date" style={S.input} value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
        </Field>
        <Field label="Monto">
          <input type="number" style={S.input} placeholder="Monto" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
        </Field>
        {!isClases && (
          <Field label="Duración (días)">
            <input type="number" style={S.input} placeholder="Duración en días" value={form.duracion_dias} onChange={(e) => setForm({ ...form, duracion_dias: e.target.value })} />
          </Field>
        )}
        <Field label="Deuda restante">
          <input type="number" style={S.input} placeholder="Deuda restante" value={form.deuda_restante} onChange={(e) => setForm({ ...form, deuda_restante: e.target.value })} />
        </Field>
        <Field label="Notas" spanAll>
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

function Field({ label, children, spanAll = false }) {
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
  const baseRef = useRef(null);

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
    const email = f.email.trim().toLowerCase();
    if (!nombre) { alert("Falta el nombre"); return null; }
    if (!email) { alert("Falta el email"); return null; }
    if (!email.endsWith("@gmail.com")) { alert("El email debe ser una cuenta @gmail.com"); return null; }
    if (f.servicio !== "clases" && Number(f.duracion_dias || 0) <= 0) { alert("Falta la duración en días"); return null; }
    return { nombre, email };
  }

  function buildClientePayload(f, nombre, email) {
    const duracion = f.servicio === "clases" ? 0 : Number(f.duracion_dias || 0);
    return {
      ...f,
      nombre, email,
      estado_manual: "activo",
      monto: Number(f.monto || 0),
      duracion_dias: duracion,
      deuda_restante: Number(f.deuda_restante || 0),
      fecha_vencimiento: f.servicio === "clases" || duracion <= 0 ? null : toISODate(addDays(f.fecha_inicio, duracion)),
    };
  }

  async function guardarCliente() {
    const validated = validateClienteForm(form);
    if (!validated) return;
    setGuardando(true);

    const payload = buildClientePayload(form, validated.nombre, validated.email);
    const { data: inserted, error } = await supabase.from("clientes").insert([payload]).select().single();
    if (error) { setGuardando(false); alert("No se pudo guardar el cliente"); return; }

    const { error: errIngreso } = await supabase.from("ingresos").insert([{
      cliente_id: inserted.id, cliente_nombre: inserted.nombre, email: inserted.email,
      servicio: inserted.servicio, monto: inserted.monto, fecha_pago: inserted.fecha_inicio, notas: inserted.notas || "",
    }]);
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

    const { error: errIngreso } = await supabase.from("ingresos").insert([{
      cliente_id: renovarForm.id, cliente_nombre: validated.nombre, email: validated.email,
      servicio: renovarForm.servicio, monto: Number(renovarForm.monto || 0),
      fecha_pago: toISODate(TODAY), notas: renovarForm.notas || "",
    }]);
    if (errIngreso) alert("El cliente se renovó, pero no se pudo registrar el ingreso: " + errIngreso.message);

    setRenovando(false);
    setShowRenovar(false);
    refetch();
  }

  async function renovarRapido(cliente) {
    const duracion = cliente.servicio === "clases" ? 0 : Number(cliente.duracion_dias || serviceDefaultDuration(cliente.servicio));
    const vencimientoActual = cliente.vencimiento || cliente.fecha_vencimiento || null;
    let fechaBase = toISODate(TODAY);
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

    const { error: errIngreso } = await supabase.from("ingresos").insert([{
      cliente_id: cliente.id, cliente_nombre: cliente.nombre || "",
      email: (cliente.email || "").trim().toLowerCase(),
      servicio: cliente.servicio, monto: Number(cliente.monto || 0),
      fecha_pago: toISODate(TODAY), notas: cliente.notas || "",
    }]);
    if (errIngreso) alert("El cliente se renovó, pero no se pudo registrar el ingreso");

    refetch();
  }

  async function eliminarCliente(id) {
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) { alert("No se pudo eliminar"); return; }
    refetch();
  }

  async function eliminarIngreso(id) {
    if (!confirm("¿Eliminar este ingreso?")) return;
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
    let fechaBase = toISODate(TODAY);
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

  const currentMonthIngresos = useMemo(() => ingresos.filter((i) => {
    const d = parseISODate(i.fecha_pago);
    return d && d.getFullYear() === TODAY.getFullYear() && d.getMonth() === TODAY.getMonth();
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
  // Reset busqueda/filtro -> vuelve a pág 1
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
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#f5f3ee", padding: 24 }}>
        <div style={{ width: 360, ...S.card, padding: 28 }}>
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 34, fontWeight: 800, color: "#0f172a" }}>Seminario Cripto</h2>
          <div style={{ color: "#64748b", marginBottom: 18 }}>Ingreso al sistema interno</div>

          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ ...S.input, marginBottom: 10 }} />

          <div style={{ position: "relative", marginBottom: 14 }}>
            <input type={showPassword ? "text" : "password"} placeholder="Contraseña" value={password}
              onChange={(e) => setPassword(e.target.value)} style={S.input} />
            <span onClick={() => setShowPassword(!showPassword)}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", fontSize: 14, color: "#64748b", userSelect: "none" }}>
              {showPassword ? "Ocultar" : "👁"}
            </span>
          </div>

          <button onClick={login} style={{ ...btn(true), width: "100%" }}>Entrar</button>
        </div>
      </div>
    );
  }

  // ── App principal ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ee", color: "#0f172a", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: 28 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800 }}>Seminario Cripto</h1>
            <div style={{ color: "#64748b", marginTop: 6 }}>Panel de gestión comercial y operativa.</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={navBtn(activeView === "operativa")} onClick={() => setActiveView("operativa")}>Operativa</button>
            <button style={navBtn(activeView === "dashboard")} onClick={() => setActiveView("dashboard")}>Dashboard</button>
            <button style={btn(true)} onClick={() => setShowForm(!showForm)}>{showForm ? "Cerrar" : "+ Nuevo cliente"}</button>
            <button onClick={logout} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Salir</button>
          </div>
        </div>

        {/* Formulario alta */}
        {showForm && (
          <div style={{ marginBottom: 24 }}>
            <ClienteForm title="Alta de cliente" form={form} setForm={setForm}
              onGuardar={guardarCliente} onCancelar={() => setShowForm(false)} guardando={guardando} />
          </div>
        )}

        {/* Modal renovar */}
        {showRenovar && (
          <ClienteForm title="Renovar cliente" subtitle="Actualizar plan y registrar nuevo ingreso"
            form={renovarForm} setForm={setRenovarForm}
            onGuardar={guardarRenovacion} onCancelar={() => setShowRenovar(false)}
            guardando={renovando} isModal />
        )}

        {/* ── DASHBOARD ────────────────────────────────────────────────────── */}
        {activeView === "dashboard" && (
          <div style={{ display: "grid", gap: 24, marginBottom: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <MetricCard title="Ingresos del mes" value={money(dashboardStats.ingresosMes)} />
              <MetricCard title="Ventas del mes" value={dashboardStats.ventasMes} />
            </div>

            <SimpleBarChart title="Ventas por día (mes actual)" data={dashboardStats.dailySeries} valueKey="total" />
            <BreakdownCard title="Ingresos por tipo (mes)" breakdown={dashboardStats.breakdownMes} />
            <BreakdownCard title="Ingresos totales por tipo" breakdown={dashboardStats.breakdownTotal} />

            {/* Detalle de ingresos */}
            <div style={S.card}>
              <h3 style={{ marginTop: 0 }}>Detalle de ingresos</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Fecha", "Nombre", "Email", "Servicio", "Monto", "Notas", "Eliminar"]} /></thead>
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
                {!ingresos.length && <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>No hay ingresos cargados.</div>}
              </div>
              <Pagination page={ingresosPag.page} totalPages={ingresosPag.totalPages} setPage={ingresosPag.setPage} />
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
                  <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 30, fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Vencimientos críticos */}
            <div style={{ ...S.card, marginBottom: 24, padding: 24 }}>
              <div style={{ marginBottom: 18 }}>
                <h3 style={{ margin: 0, fontSize: 24 }}>Vencimientos críticos</h3>
                <div style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
                  Seguimiento rápido de clientes sensibles para accionar sin entrar a la base completa.
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                <CriticosPanel titulo="Por vencer" badgeBg="#e2e8f0" badgeColor="#0f172a"
                  clientes={vencimientosCriticos.hoy} {...criticosHoyPag}
                  accentBorder="#e5e7eb" accentBg="#fff" accentText="#64748b" dateLabel="vence"
                  onRenovarRapido={renovarRapido} onAbrirRenovar={abrirRenovar} onEliminar={eliminarCliente} />
                <CriticosPanel titulo="En gracia" badgeBg="#fef3c7" badgeColor="#92400e"
                  clientes={vencimientosCriticos.gracia} {...criticosGraciaPag}
                  accentBorder="#fde68a" accentBg="#fffbeb" accentText="#92400e" dateLabel="venció"
                  onRenovarRapido={renovarRapido} onAbrirRenovar={abrirRenovar} onEliminar={eliminarCliente} />
                <CriticosPanel titulo="Vencidos" badgeBg="#fee2e2" badgeColor="#b91c1c"
                  clientes={vencimientosCriticos.vencidos} {...criticosVencidosPag}
                  accentBorder="#fecaca" accentBg="#fef2f2" accentText="#b91c1c" dateLabel="venció"
                  onRenovarRapido={renovarRapido} onAbrirRenovar={abrirRenovar} onEliminar={eliminarCliente} />
              </div>
            </div>

            {/* Base operativa */}
            <div ref={baseRef} style={{ ...S.card, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0 }}>Base operativa</h3>
                  <div style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
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
                  <thead><TableHeader cols={["Cliente", "Email", "Servicio", "Vencimiento", "Días", "Estado", "Estado manual", "Acciones"]} /></thead>
                  <tbody>
                    {basePag.rows.map((c) => (
                      <tr key={c.id}>
                        <td style={{ ...S.td, fontWeight: 700 }}>{c.nombre}</td>
                        <td style={S.td}>
                          <input value={c.email || ""}
                            onChange={(e) => setClientes((prev) => prev.map((cli) => cli.id === c.id ? { ...cli, email: e.target.value } : cli))}
                            onBlur={(e) => actualizarEmail(c.id, e.target.value)}
                            style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, boxSizing: "border-box" }} />
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
                              onClick={() => confirm("¿Renovar cliente con el mismo plan?") && renovarRapido(c)}>✔</button>
                            <button title="Renovar con cambios" style={{ ...btn(false), padding: "8px 12px" }}
                              onClick={() => abrirRenovar(c)}>✏️</button>
                            <button title="Eliminar cliente" style={{ ...btn(false), padding: "8px 12px" }}
                              onClick={() => confirm("¿Eliminar cliente?") && eliminarCliente(c.id)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && !loading && <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>No hay resultados.</div>}
              </div>
              <Pagination page={basePag.page} totalPages={basePag.totalPages} setPage={basePag.setPage} />
            </div>

            {/* Vencimientos */}
            <div style={{ ...S.card, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0 }}>Vencimientos</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Cliente", "Servicio", "Vence", "Días", "Estado"]} /></thead>
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
              <Pagination page={vencimientosPag.page} totalPages={vencimientosPag.totalPages} setPage={vencimientosPag.setPage} />
            </div>

            {/* Deudores */}
            <div style={{ ...S.card, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0 }}>Deudores</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Cliente", "Servicio", "Pagado", "Resta", "Notas"]} /></thead>
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
              </div>
              <Pagination page={deudoresPag.page} totalPages={deudoresPag.totalPages} setPage={deudoresPag.setPage} />
            </div>

            {/* Clases */}
            <div style={{ ...S.card, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0 }}>Clases</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}>
                  <thead><TableHeader cols={["Alumno", "Inicio", "Mes", "Monto", "Notas"]} /></thead>
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
              </div>
              <Pagination page={clasesPag.page} totalPages={clasesPag.totalPages} setPage={clasesPag.setPage} />
            </div>

            {/* Resumen mensual */}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)", gap: 24 }}>
              <div style={S.card}>
                <h3 style={{ marginTop: 0 }}>Resumen mensual</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={S.table}>
                    <thead><TableHeader cols={["Mes", "Mensual", "Anual", "Clases", "Total"]} /></thead>
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
                <h3 style={{ marginTop: 0 }}>Vista rápida</h3>
                <div style={{ display: "grid", gap: 16 }}>
                  {resumenMensual.map((r) => {
                    const pct = Math.max((r.total / maxTotal) * 100, 6);
                    return (
                      <div key={r.key}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
                          <span style={{ textTransform: "capitalize" }}>{monthLabel(r.key)}</span>
                          <strong>USD {r.total}</strong>
                        </div>
                        <div style={{ height: 12, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: "#0f172a" }} />
                        </div>
                        <div style={{ marginTop: 6, color: "#64748b", fontSize: 12 }}>
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
