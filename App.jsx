import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const TODAY = new Date();
const GRACE_DAYS = 3;

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

function formatDate(dateString) {
  if (!dateString) return "-";
  return new Intl.DateTimeFormat("es-AR").format(new Date(`${dateString}T12:00:00`));
}

function monthKey(dateString) {
  const d = new Date(`${dateString}T12:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(d);
}

function diffDays(fromDate, toDate) {
  const a = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const b = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
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
function parseISODate(dateString) {
  if (!dateString) return null;
  return new Date(`${dateString}T12:00:00`);
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function classRangeLabel(fechaInicio) {
  if (!fechaInicio) return "-";
  const start = parseISODate(fechaInicio);
  const end = addDays(fechaInicio, 27);

  const startMonth = new Intl.DateTimeFormat("es-AR", { month: "long" }).format(start);
  const endMonth = new Intl.DateTimeFormat("es-AR", { month: "long" }).format(end);

  if (isSameMonth(start, end)) return startMonth;
  return `${startMonth} / ${endMonth}`;
}

function navButtonStyle(active) {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: active ? "1px solid #0f172a" : "1px solid #e5e7eb",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    background: active ? "#0f172a" : "#fff",
    color: active ? "#fff" : "#0f172a",
  };
}

function money(value) {
  return `USD ${safeNumber(value)}`;
}

function endOfCurrentMonth() {
  return new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0);
}

function buildDailySalesSeries(clientes) {
  const end = endOfCurrentMonth();
  const totalDays = end.getDate();
  const rows = [];

  for (let day = 1; day <= totalDays; day += 1) {
    rows.push({
      day,
      label: String(day).padStart(2, "0"),
      total: 0,
      mensual: 0,
      anual: 0,
      clases: 0,
      ventas: 0,
    });
  }

  clientes.forEach((c) => {
    if (!c.fecha_inicio) return;
    const d = parseISODate(c.fecha_inicio);
    if (!d) return;
    if (d.getFullYear() !== TODAY.getFullYear() || d.getMonth() !== TODAY.getMonth()) return;

    const row = rows[d.getDate() - 1];
    const monto = safeNumber(c.monto);

    row.total += monto;
    row.ventas += 1;
    if (row[c.servicio] !== undefined) row[c.servicio] += monto;
  });

  return rows;
}

function buildServiceBreakdown(clientes, onlyCurrentMonth = false) {
  const base = { mensual: 0, anual: 0, clases: 0 };

  clientes.forEach((c) => {
    if (onlyCurrentMonth) {
      const d = parseISODate(c.fecha_inicio);
      if (!d) return;
      if (d.getFullYear() !== TODAY.getFullYear() || d.getMonth() !== TODAY.getMonth()) return;
    }

    if (base[c.servicio] !== undefined) {
      base[c.servicio] += safeNumber(c.monto);
    }
  });

  return base;
}

function MetricCard({ title, value, sub }) {
  return (
    <div style={cardStyle()}>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 800 }}>{value}</div>
      {sub ? <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>{sub}</div> : null}
    </div>
  );
}

function SimpleBarChart({ title, data, valueKey, labelKey = "label", emptyText = "Sin datos." }) {
  const maxValue = Math.max(...data.map((r) => safeNumber(r[valueKey])), 0);

  return (
    <div style={cardStyle()}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {!data.length || maxValue === 0 ? (
        <div style={{ color: "#64748b" }}>{emptyText}</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {data.map((row) => {
            const value = safeNumber(row[valueKey]);
            const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 6 : 0) : 0;

            return (
              <div key={`${title}-${row[labelKey]}`}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
                  <span>{row[labelKey]}</span>
                  <strong>{money(value)}</strong>
                </div>
                <div style={{ height: 12, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "#0f172a" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BreakdownCard({ title, breakdown }) {
  const items = [
    { key: "mensual", label: "Plan mensual" },
    { key: "anual", label: "Plan anual" },
    { key: "clases", label: "Clases" },
  ];

  const total = items.reduce((acc, item) => acc + safeNumber(breakdown[item.key]), 0);

  return (
    <div style={cardStyle()}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div style={{ display: "grid", gap: 12 }}>
        {items.map((item) => {
          const value = safeNumber(breakdown[item.key]);
          const pct = total > 0 ? Math.max((value / total) * 100, value > 0 ? 6 : 0) : 0;

          return (
            <div key={item.key}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
                <span>{item.label}</span>
                <strong>{money(value)}</strong>
              </div>
              <div style={{ height: 12, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "#0f172a" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function resolveDueDate(client) {
  if (client.fecha_vencimiento) return client.fecha_vencimiento;

  const duracion = Number(client.duracion_dias || 0);

  if (client.servicio === "clases") return null;
  if (!client.fecha_inicio || duracion <= 0) return null;

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

function badgeStyle(status) {
  const base = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid transparent",
  };

  if (status === "activo") {
    return { ...base, background: "#dcfce7", color: "#166534", borderColor: "#bbf7d0" };
  }
  if (status === "gracia") {
    return { ...base, background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" };
  }
  if (status === "vencido") {
    return { ...base, background: "#fee2e2", color: "#b91c1c", borderColor: "#fecaca" };
  }
  return { ...base, background: "#e2e8f0", color: "#0f172a", borderColor: "#cbd5e1" };
}

function cardStyle() {
  return {
    background: "#ffffff",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 4px 16px rgba(15,23,42,0.06)",
    border: "1px solid #e5e7eb",
  };
}

function inputStyle() {
  return {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
  };
}

function labelStyle() {
  return {
    display: "block",
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
    marginBottom: 6,
  };
}

function fieldWrapStyle(spanAll = false) {
  return {
    gridColumn: spanAll ? "1 / -1" : "auto",
  };
}

function buttonStyle(dark = false) {
  return {
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    background: dark ? "#0f172a" : "#e5e7eb",
    color: dark ? "#fff" : "#111827",
  };
}

function tableStyle() {
  return {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [guardando, setGuardando] = useState(false);
  const [view, setView] = useState("operativa");
  const [showRenovar, setShowRenovar] = useState(false);
  const [renovando, setRenovando] = useState(false);
  const [renovarForm, setRenovarForm] = useState({
    id: null,
    nombre: "",
    email: "",
    servicio: "mensual",
    fecha_inicio: toISODate(TODAY),
    monto: 30,
    duracion_dias: 30,
    deuda_restante: 0,
    notas: "",
  });
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    servicio: "mensual",
    fecha_inicio: toISODate(TODAY),
    monto: 30,
    duracion_dias: 30,
    estado_manual: "activo",
    deuda_restante: 0,
    acceso_drive: false,
    notas: "",
  });
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function login() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) alert(error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  async function fetchClientes() {
  setLoading(true);

  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    alert("No se pudieron cargar los clientes");
    setLoading(false);
    return;
  }

  setClientes(data || []);
  setLoading(false);
}

async function fetchIngresos() {
  const { data, error } = await supabase
    .from("ingresos")
    .select("*")
    .order("fecha_pago", { ascending: false });

  if (error) {
    alert("No se pudieron cargar los ingresos");
    return;
  }

  setIngresos(data || []);
}

useEffect(() => {
  fetchClientes();
  fetchIngresos();
}, []);

const computed = useMemo(() => clientes.map(computeClient), [clientes]);

  const filtered = useMemo(() => {
    return computed.filter((c) => {
      const text = `${c.nombre || ""} ${c.email || ""}`.toLowerCase();
      const okBusqueda = text.includes(busqueda.toLowerCase());
      const okFiltro =
        filtro === "todos" ||
        c.servicio === filtro ||
        c.estadoSistema === filtro;

      return okBusqueda && okFiltro;
    });
  }, [computed, busqueda, filtro]);

  const resumen = useMemo(() => {
    const base = {
      activos: 0,
      gracia: 0,
      sacar: 0,
      deudores: 0,
      clases: 0,
      ingresos: 0,
    };

    computed.forEach((c) => {
      if (c.estadoSistema === "activo") base.activos += 1;
      if (c.estadoSistema === "gracia") base.gracia += 1;
      if (c.estadoSistema === "sacar" || c.estadoSistema === "vencido") base.sacar += 1;
      if (Number(c.deuda_restante || 0) > 0) base.deudores += 1;
      if (c.servicio === "clases") base.clases += 1;
      base.ingresos += Number(c.monto || 0);
    });

    return base;
  }, [computed]);

  const deudores = useMemo(
    () => computed.filter((c) => Number(c.deuda_restante || 0) > 0),
    [computed]
  );

  const clases = useMemo(
    () => computed.filter((c) => c.servicio === "clases"),
    [computed]
  );

  const vencimientos = useMemo(() => {
    return computed
      .filter((c) => c.servicio !== "clases")
      .sort((a, b) => {
        if (!a.vencimiento) return 1;
        if (!b.vencimiento) return -1;
        return a.vencimiento.localeCompare(b.vencimiento);
      });
  }, [computed]);

  const resumenMensual = useMemo(() => {
  const map = new Map();

  ingresos.forEach((i) => {
    if (!i.fecha_pago) return;

    const key = monthKey(i.fecha_pago);

    if (!map.has(key)) {
      map.set(key, {
        key,
        mensual: 0,
        anual: 0,
        clases: 0,
        total: 0,
        ventasMensual: 0,
        ventasAnual: 0,
        ventasClases: 0,
      });
    }

    const row = map.get(key);
    const monto = Number(i.monto || 0);

    if (i.servicio === "mensual") {
      row.mensual += monto;
      row.ventasMensual += 1;
    } else if (i.servicio === "anual") {
      row.anual += monto;
      row.ventasAnual += 1;
    } else {
      row.clases += monto;
      row.ventasClases += 1;
    }

    row.total += monto;
  });

  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}, [ingresos]);
const currentMonthIngresos = useMemo(() => {
  return ingresos.filter((i) => {
    const d = parseISODate(i.fecha_pago);
    return d && d.getFullYear() === TODAY.getFullYear() && d.getMonth() === TODAY.getMonth();
  });
}, [ingresos]);

const dashboardStats = useMemo(() => {
  const ingresosMes = currentMonthIngresos.reduce((acc, i) => acc + safeNumber(i.monto), 0);
  const ventasMes = currentMonthIngresos.length;

  const ingresosMesNormalizados = currentMonthIngresos.map((i) => ({
    servicio: i.servicio,
    monto: i.monto,
    fecha_inicio: i.fecha_pago,
  }));

  const ingresosTotalesNormalizados = ingresos.map((i) => ({
    servicio: i.servicio,
    monto: i.monto,
    fecha_inicio: i.fecha_pago,
  }));

  const breakdownMes = buildServiceBreakdown(ingresosMesNormalizados, false);
  const breakdownTotal = buildServiceBreakdown(ingresosTotalesNormalizados, false);
  const dailySeries = buildDailySalesSeries(ingresosTotalesNormalizados);

  return {
    ingresosMes,
    ventasMes,
    breakdownMes,
    breakdownTotal,
    dailySeries,
  };
}, [ingresos, currentMonthIngresos]);
  
  const maxTotal = Math.max(...resumenMensual.map((r) => r.total), 1);

  async function guardarCliente() {
  const nombre = form.nombre.trim();
  const email = form.email.trim().toLowerCase();

  if (!nombre) {
    alert("Falta el nombre");
    return;
  }

  if (!email) {
    alert("Falta el email");
    return;
  }

  if (!email.endsWith("@gmail.com")) {
    alert("El email debe ser una cuenta @gmail.com");
    return;
  }

  if (form.servicio !== "clases" && Number(form.duracion_dias || 0) <= 0) {
    alert("Falta la duración en días");
    return;
  }

  setGuardando(true);

  const duracion = form.servicio === "clases" ? 0 : Number(form.duracion_dias || 0);

  const payload = {
    ...form,
    nombre,
    email,
    estado_manual: "activo",
    monto: Number(form.monto || 0),
    duracion_dias: duracion,
    deuda_restante: Number(form.deuda_restante || 0),
    fecha_vencimiento:
      form.servicio === "clases" || duracion <= 0
        ? null
        : toISODate(addDays(form.fecha_inicio, duracion)),
  };

  const { data: clienteInsertado, error } = await supabase
    .from("clientes")
    .insert([payload])
    .select()
    .single();

  if (error) {
    setGuardando(false);
    alert("No se pudo guardar el cliente");
    return;
  }

  const { error: errorIngreso } = await supabase.from("ingresos").insert([
    {
      cliente_id: clienteInsertado.id,
      cliente_nombre: clienteInsertado.nombre,
      email: clienteInsertado.email,
      servicio: clienteInsertado.servicio,
      monto: clienteInsertado.monto,
      fecha_pago: clienteInsertado.fecha_inicio,
      notas: clienteInsertado.notas || "",
    },
  ]);

  if (errorIngreso) {
    alert("Error ingreso: " + errorIngreso.message);
  }

  setGuardando(false);

  setShowForm(false);
  setForm({
    nombre: "",
    email: "",
    servicio: "mensual",
    fecha_inicio: toISODate(TODAY),
    monto: 30,
    duracion_dias: 30,
    estado_manual: "activo",
    deuda_restante: 0,
    acceso_drive: false,
    notas: "",
  });

  fetchClientes();
  fetchIngresos();
}
  async function eliminarCliente(id) {
  const { error } = await supabase.from("clientes").delete().eq("id", id);

  if (error) {
    alert("No se pudo eliminar");
    return;
  }

  fetchClientes();
  fetchIngresos();
}
async function eliminarIngreso(id) {
  const ok = window.confirm("¿Eliminar este ingreso?");
  if (!ok) return;

  const { error } = await supabase
    .from("ingresos")
    .delete()
    .eq("id", id);

  if (error) {
    alert("No se pudo eliminar el ingreso");
    return;
  }

  fetchIngresos();
}
  async function cambiarEstado(id, value) {
    const { error } = await supabase
      .from("clientes")
      .update({ estado_manual: value })
      .eq("id", id);

    if (error) {
      alert("No se pudo actualizar");
      return;
    }
    fetchClientes();
  }
async function actualizarEmail(id, nuevoEmail) {
  const { error } = await supabase
    .from("clientes")
    .update({ email: nuevoEmail })
    .eq("id", id);

  if (error) {
    alert("No se pudo actualizar el email");
    return;
  }

  fetchClientes();
}

function abrirRenovar(cliente) {
  setRenovarForm({
    id: cliente.id,
    nombre: cliente.nombre || "",
    email: cliente.email || "",
    servicio: cliente.servicio || "mensual",
    fecha_inicio: toISODate(TODAY),
    monto: safeNumber(cliente.monto),
    duracion_dias:
      cliente.servicio === "clases"
        ? 0
        : safeNumber(cliente.duracion_dias || serviceDefaultDuration(cliente.servicio)),
    deuda_restante: safeNumber(cliente.deuda_restante),
    notas: cliente.notas || "",
  });

  setShowRenovar(true);
}
 async function guardarRenovacion() {
  const nombre = renovarForm.nombre.trim();
  const email = renovarForm.email.trim().toLowerCase();

  if (!nombre) {
    alert("Falta el nombre");
    return;
  }

  if (!email) {
    alert("Falta el email");
    return;
  }

  if (!email.endsWith("@gmail.com")) {
    alert("El email debe ser una cuenta @gmail.com");
    return;
  }

  if (renovarForm.servicio !== "clases" && Number(renovarForm.duracion_dias || 0) <= 0) {
    alert("Falta la duración en días");
    return;
  }

  setRenovando(true);

  const duracion = renovarForm.servicio === "clases" ? 0 : Number(renovarForm.duracion_dias || 0);

  const payload = {
    nombre,
    email,
    servicio: renovarForm.servicio,
    fecha_inicio: renovarForm.fecha_inicio,
    monto: Number(renovarForm.monto || 0),
    duracion_dias: duracion,
    estado_manual: "activo",
    deuda_restante: Number(renovarForm.deuda_restante || 0),
    notas: renovarForm.notas || "",
    fecha_vencimiento:
      renovarForm.servicio === "clases" || duracion <= 0
        ? null
        : toISODate(addDays(renovarForm.fecha_inicio, duracion)),
  };

  const { error: errorCliente } = await supabase
    .from("clientes")
    .update(payload)
    .eq("id", renovarForm.id);

  if (errorCliente) {
    setRenovando(false);
    alert("No se pudo renovar el cliente");
    return;
  }

  const { error: errorIngreso } = await supabase.from("ingresos").insert([
    {
      cliente_id: renovarForm.id,
      cliente_nombre: nombre,
      email,
      servicio: renovarForm.servicio,
      monto: Number(renovarForm.monto || 0),
      fecha_pago: renovarForm.fecha_inicio,
      notas: renovarForm.notas || "",
    },
  ]);

  if (errorIngreso) {
    setRenovando(false);
    alert("El cliente se renovó, pero no se pudo registrar el ingreso");
    fetchClientes();
    fetchIngresos();
    setShowRenovar(false);
    return;
  }

  setRenovando(false);
  setShowRenovar(false);

  fetchClientes();
  fetchIngresos();
}
  async function renovarRapido(cliente) {
  const fechaRenovacion = toISODate(TODAY);
  const duracion =
    cliente.servicio === "clases"
      ? 0
      : Number(cliente.duracion_dias || serviceDefaultDuration(cliente.servicio));

  const payload = {
    nombre: cliente.nombre || "",
    email: (cliente.email || "").trim().toLowerCase(),
    servicio: cliente.servicio,
    fecha_inicio: fechaRenovacion,
    monto: Number(cliente.monto || 0),
    duracion_dias: duracion,
    estado_manual: "activo",
    deuda_restante: Number(cliente.deuda_restante || 0),
    notas: cliente.notas || "",
    fecha_vencimiento:
      cliente.servicio === "clases" || duracion <= 0
        ? null
        : toISODate(addDays(fechaRenovacion, duracion)),
  };

  const { error: errorCliente } = await supabase
    .from("clientes")
    .update(payload)
    .eq("id", cliente.id);

  if (errorCliente) {
    alert("No se pudo renovar el cliente");
    return;
  }

  const { error: errorIngreso } = await supabase.from("ingresos").insert([
    {
      cliente_id: cliente.id,
      cliente_nombre: cliente.nombre || "",
      email: (cliente.email || "").trim().toLowerCase(),
      servicio: cliente.servicio,
      monto: Number(cliente.monto || 0),
      fecha_pago: fechaRenovacion,
      notas: cliente.notas || "",
    },
  ]);

  if (errorIngreso) {
    alert("El cliente se renovó, pero no se pudo registrar el ingreso");
  }

  fetchClientes();
  fetchIngresos();
}
  if (!user) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f3ee",
          padding: 24,
        }}
      >
        <div
          style={{
            width: 360,
            background: "#ffffff",
            padding: 28,
            borderRadius: 18,
            boxShadow: "0 4px 16px rgba(15,23,42,0.06)",
            border: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 34, fontWeight: 800, color: "#0f172a" }}>
            Seminario Cripto
          </h2>
          <div style={{ color: "#64748b", marginBottom: 18 }}>Ingreso al sistema interno</div>

          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              marginBottom: 10,
              padding: 12,
              borderRadius: 12,
              border: "1px solid #d1d5db",
              boxSizing: "border-box",
            }}
          />

          <div style={{ position: "relative", marginBottom: 14 }}>
  <input
    type={showPassword ? "text" : "password"}
    placeholder="Contraseña"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    style={{
      width: "100%",
      padding: 12,
      borderRadius: 12,
      border: "1px solid #d1d5db",
      boxSizing: "border-box",
    }}
  />

  <span
    onClick={() => setShowPassword(!showPassword)}
    style={{
      position: "absolute",
      right: 12,
      top: "50%",
      transform: "translateY(-50%)",
      cursor: "pointer",
      fontSize: 14,
      color: "#64748b",
      userSelect: "none",
    }}
  >
    {showPassword ? "Ocultar" : "👁"}
  </span>
</div>

          <button
            onClick={login}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "none",
              background: "#0f172a",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Entrar
          </button>
        </div>
      </div>
    );
  }
  const isClasesForm = form.servicio === "clases";
  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ee", color: "#0f172a", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: 28 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 20,
            alignItems: "center",
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800 }}>Seminario Cripto</h1>
            <div style={{ color: "#64748b", marginTop: 6 }}>Panel de gestión comercial y operativa.</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
  <button style={navButtonStyle(view === "operativa")} onClick={() => setView("operativa")}>
    Operativa
  </button>

  <button style={navButtonStyle(view === "dashboard")} onClick={() => setView("dashboard")}>
    Dashboard
  </button>

  <button style={buttonStyle(true)} onClick={() => setShowForm(!showForm)}>
    {showForm ? "Cerrar" : "+ Nuevo cliente"}
  </button>

  <button
    onClick={logout}
    style={{
      padding: "10px 16px",
      borderRadius: 10,
      border: "1px solid #e5e7eb",
      background: "#fff",
      cursor: "pointer",
      fontWeight: 600,
    }}
  >
    Salir
  </button>
</div>
</div>

        {showForm && (
          <div style={{ ...cardStyle(), marginBottom: 24 }}>
            <h3 style={{ marginTop: 0 }}>Alta de cliente</h3>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              <div style={fieldWrapStyle()}>
                <label style={labelStyle()}>Nombre</label>
                <input
                  style={inputStyle()}
                  placeholder="Nombre"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                />
              </div>

              <div style={fieldWrapStyle()}>
                <label style={labelStyle()}>Email</label>
                <input
                  style={inputStyle()}
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div style={fieldWrapStyle()}>
                <label style={labelStyle()}>Servicio</label>
                <select
                  style={inputStyle()}
                  value={form.servicio}
                  onChange={(e) => {
                    const servicio = e.target.value;
                    setForm({
                      ...form,
                      servicio,
                      monto: serviceDefaultAmount(servicio),
                      duracion_dias: serviceDefaultDuration(servicio),
                    });
                  }}
                >
                  <option value="mensual">Plan Inversor Mensual</option>
                  <option value="anual">Plan Inversor Anual</option>
                  <option value="clases">Clases</option>
                </select>
              </div>

              <div style={fieldWrapStyle()}>
                <label style={labelStyle()}>Fecha de inicio</label>
                <input
                  style={inputStyle()}
                  type="date"
                  value={form.fecha_inicio}
                  onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                />
              </div>

              <div style={fieldWrapStyle()}>
                <label style={labelStyle()}>Monto</label>
                <input
                  style={inputStyle()}
                  type="number"
                  placeholder="Monto"
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })}
                />
              </div>

              {!isClasesForm && (
  <div style={fieldWrapStyle()}>
    <label style={labelStyle()}>Duración (días)</label>
    <input
      style={inputStyle()}
      type="number"
      placeholder="Duración en días"
      value={form.duracion_dias}
      onChange={(e) => setForm({ ...form, duracion_dias: e.target.value })}
    />
  </div>
)}
              <div style={fieldWrapStyle()}>
                <label style={labelStyle()}>Deuda restante</label>
                <input
                  style={inputStyle()}
                  type="number"
                  placeholder="Deuda restante"
                  value={form.deuda_restante}
                  onChange={(e) => setForm({ ...form, deuda_restante: e.target.value })}
                />
              </div>

              <div style={fieldWrapStyle(true)}>
                <label style={labelStyle()}>Notas</label>
                <input
                  style={inputStyle()}
                  placeholder="Notas"
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                />
              </div>
            </div>

            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button style={buttonStyle(true)} onClick={guardarCliente}>
                {guardando ? "Guardando..." : "Guardar cliente"}
              </button>
            </div>
          </div>
        )}
 {showRenovar && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15,23,42,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      zIndex: 1000,
    }}
  >
    <div
      style={{
        width: "100%",
        maxWidth: 820,
        background: "#fff",
        borderRadius: 18,
        padding: 24,
        boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
        border: "1px solid #e5e7eb",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h3 style={{ margin: 0 }}>Renovar cliente</h3>
          <div style={{ color: "#64748b", fontSize: 14 }}>
            Actualizar plan y registrar nuevo ingreso
          </div>
        </div>

        <button onClick={() => setShowRenovar(false)} style={buttonStyle(false)}>
          Cerrar
        </button>
      </div>

     <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
  <div style={fieldWrapStyle()}>
    <label style={labelStyle()}>Nombre</label>
    <input
      style={inputStyle()}
      value={renovarForm.nombre}
      onChange={(e) => setRenovarForm({ ...renovarForm, nombre: e.target.value })}
    />
  </div>

  <div style={fieldWrapStyle()}>
    <label style={labelStyle()}>Email</label>
    <input
      style={inputStyle()}
      value={renovarForm.email}
      onChange={(e) => setRenovarForm({ ...renovarForm, email: e.target.value })}
    />
  </div>

  <div style={fieldWrapStyle()}>
    <label style={labelStyle()}>Servicio</label>
    <select
      style={inputStyle()}
      value={renovarForm.servicio}
      onChange={(e) => {
        const servicio = e.target.value;
        setRenovarForm({
          ...renovarForm,
          servicio,
          monto: serviceDefaultAmount(servicio),
          duracion_dias: serviceDefaultDuration(servicio),
        });
      }}
    >
      <option value="mensual">Mensual</option>
      <option value="anual">Anual</option>
      <option value="clases">Clases</option>
    </select>
  </div>

  <div style={fieldWrapStyle()}>
    <label style={labelStyle()}>Fecha de renovación</label>
    <input
      type="date"
      style={inputStyle()}
      value={renovarForm.fecha_inicio}
      onChange={(e) => setRenovarForm({ ...renovarForm, fecha_inicio: e.target.value })}
    />
  </div>

  <div style={fieldWrapStyle()}>
    <label style={labelStyle()}>Monto</label>
    <input
      type="number"
      style={inputStyle()}
      value={renovarForm.monto}
      onChange={(e) => setRenovarForm({ ...renovarForm, monto: e.target.value })}
    />
  </div>

  {renovarForm.servicio !== "clases" && (
    <div style={fieldWrapStyle()}>
      <label style={labelStyle()}>Duración (días)</label>
      <input
        type="number"
        style={inputStyle()}
        value={renovarForm.duracion_dias}
        onChange={(e) => setRenovarForm({ ...renovarForm, duracion_dias: e.target.value })}
      />
    </div>
  )}

  <div style={fieldWrapStyle()}>
    <label style={labelStyle()}>Deuda restante</label>
    <input
      type="number"
      style={inputStyle()}
      value={renovarForm.deuda_restante}
      onChange={(e) => setRenovarForm({ ...renovarForm, deuda_restante: e.target.value })}
    />
  </div>

  <div style={fieldWrapStyle(true)}>
    <label style={labelStyle()}>Notas</label>
    <input
      style={inputStyle()}
      value={renovarForm.notas}
      onChange={(e) => setRenovarForm({ ...renovarForm, notas: e.target.value })}
    />
  </div>
</div>

          <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button
          onClick={() => setShowRenovar(false)}
          style={buttonStyle(false)}
        >
          Cancelar
        </button>

        <button
          style={buttonStyle(true)}
          onClick={guardarRenovacion}
        >
          {renovando ? "Guardando..." : "Confirmar renovación"}
        </button>
      </div>
    </div>
  </div>
)}       
{view === "dashboard" && (
  <div style={{ display: "grid", gap: 24, marginBottom: 24 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
      <MetricCard title="Ingresos del mes" value={money(dashboardStats.ingresosMes)} />
      <MetricCard title="Ventas del mes" value={dashboardStats.ventasMes} />
    </div>

    <SimpleBarChart
      title="Ventas por día (mes actual)"
      data={dashboardStats.dailySeries}
      valueKey="total"
    />

    <BreakdownCard
      title="Ingresos por tipo (mes)"
      breakdown={dashboardStats.breakdownMes}
    />

    <BreakdownCard
      title="Ingresos totales por tipo"
      breakdown={dashboardStats.breakdownTotal}
    />

    <div style={cardStyle()}>
      <h3 style={{ marginTop: 0 }}>Detalle de ingresos</h3>

      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle()}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Fecha", "Nombre", "Email", "Servicio", "Monto", "Notas", "Eliminar"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ingresos.map((i) => (
              <tr key={i.id}>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  {i.fecha_pago ? formatDate(i.fecha_pago) : "-"}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", fontWeight: 700 }}>
                  {i.cliente_nombre || "-"}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  {i.email || "-"}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  {serviceLabel(i.servicio)}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  {money(i.monto)}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  {i.notas || "-"}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  <button
                    style={{ ...buttonStyle(false), padding: "8px 12px" }}
                    onClick={() => eliminarIngreso(i.id)}
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!ingresos.length && (
          <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
            No hay ingresos cargados.
          </div>
        )}
      </div>
    </div>
  </div>
)}
       {view === "operativa" && (
  <>   
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16, marginBottom: 24 }}>
          {[
            ["Activos", resumen.activos],
            ["En gracia", resumen.gracia],
            ["Para sacar", resumen.sacar],
            ["Deudores", resumen.deudores],
            ["Clases", resumen.clases],
            ["Ingresos", `USD ${resumen.ingresos}`],
          ].map(([label, value]) => (
            <div key={label} style={cardStyle()}>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 30, fontWeight: 800 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ ...cardStyle(), marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Base operativa</h3>
              <div style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
                {loading ? "Cargando datos..." : "Gestión central de clientes, renovaciones y clases."}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <input
              style={{ ...inputStyle(), maxWidth: 340 }}
              placeholder="Buscar cliente o email"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />

            <select style={{ ...inputStyle(), maxWidth: 220 }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="mensual">Mensual</option>
              <option value="anual">Anual</option>
              <option value="clases">Clases</option>
              <option value="gracia">En gracia</option>
              <option value="sacar">Sacar</option>
            </select>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle()}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Cliente", "Email", "Servicio", "Vencimiento", "Días", "Estado", "Estado manual", "Acciones"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
  <tr key={c.id}>
    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", fontWeight: 700 }}>
      {c.nombre}
    </td>

    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
  <input
    value={c.email || ""}
    onChange={(e) => {
      const nuevo = e.target.value;

      setClientes((prev) =>
        prev.map((cli) =>
          cli.id === c.id ? { ...cli, email: nuevo } : cli
        )
      );
    }}
    onBlur={(e) => actualizarEmail(c.id, e.target.value)}
    style={{
      width: "100%",
      padding: "6px 8px",
      borderRadius: 8,
      border: "1px solid #d1d5db",
      fontSize: 13,
      boxSizing: "border-box",
    }}
  />
</td>

    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
      {serviceLabel(c.servicio)}
    </td>

    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
      {c.vencimiento ? formatDate(c.vencimiento) : "-"}
    </td>

    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
      {c.vencimiento ? c.dias : "-"}
    </td>

    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
      <span style={badgeStyle(c.estadoSistema)}>
        {c.estadoSistema.toUpperCase()}
      </span>
    </td>
                    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                      <select style={inputStyle()} value={c.estado_manual} onChange={(e) => cambiarEstado(c.id, e.target.value)}>
                        <option value="activo">Activo</option>
                        <option value="sacar">Sacar</option>
                      </select>
                    </td>
                    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
  <div style={{ display: "flex", gap: 8 }}>
    <button
      title="Renovación rápida"
      style={{ ...buttonStyle(true), padding: "8px 12px" }}
      onClick={() => {
        if (confirm("¿Renovar cliente con el mismo plan?")) {
          renovarRapido(c);
        }
      }}
    >
      ✔
    </button>

    <button
      title="Renovar con cambios"
      style={{ ...buttonStyle(false), padding: "8px 12px" }}
      onClick={() => abrirRenovar(c)}
    >
      ✏️
    </button>

    <button
      title="Eliminar cliente"
      style={{ ...buttonStyle(false), padding: "8px 12px" }}
      onClick={() => {
        if (confirm("¿Eliminar cliente?")) {
          eliminarCliente(c.id);
        }
      }}
    >
      🗑
    </button>
  </div>
</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filtered.length && !loading && (
              <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>No hay resultados.</div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24 }}>
          <div style={cardStyle()}>
            <h3 style={{ marginTop: 0 }}>Vencimientos</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle()}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Cliente", "Servicio", "Vence", "Días", "Estado"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vencimientos.map((c) => (
                    <tr key={c.id}>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", fontWeight: 700 }}>{c.nombre}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{serviceLabel(c.servicio)}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{c.vencimiento ? formatDate(c.vencimiento) : "-"}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{c.vencimiento ? c.dias : "-"}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                        <span style={badgeStyle(c.estadoSistema)}>{c.estadoSistema.toUpperCase()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={cardStyle()}>
            <h3 style={{ marginTop: 0 }}>Deudores</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle()}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Cliente", "Servicio", "Pagado", "Resta", "Notas"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deudores.map((c) => (
                    <tr key={c.id}>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", fontWeight: 700 }}>{c.nombre}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{serviceLabel(c.servicio)}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>USD {c.monto}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>USD {c.deuda_restante}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{c.notas || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={cardStyle()}>
            <h3 style={{ marginTop: 0 }}>Clases</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle()}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Alumno", "Inicio", "Mes", "Monto", "Notas"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clases.map((c) => (
                    <tr key={c.id}>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", fontWeight: 700 }}>{c.nombre}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{formatDate(c.fecha_inicio)}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", textTransform: "capitalize" }}>
                        {monthLabel(monthKey(c.fecha_inicio))}
                      </td>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>USD {c.monto}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{c.notas || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)", gap: 24 }}>
            <div style={cardStyle()}>
              <h3 style={{ marginTop: 0 }}>Resumen mensual</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle()}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Mes", "Mensual", "Anual", "Clases", "Total"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resumenMensual.map((r) => (
                      <tr key={r.key}>
                        <td
                          style={{
                            padding: 12,
                            borderBottom: "1px solid #e5e7eb",
                            fontWeight: 700,
                            textTransform: "capitalize",
                          }}
                        >
                          {monthLabel(r.key)}
                        </td>
                        <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>USD {r.mensual}</td>
                        <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>USD {r.anual}</td>
                        <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>USD {r.clases}</td>
                        <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", fontWeight: 800 }}>USD {r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={cardStyle()}>
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
        </div>
    </>
)}
      </div>
    </div>
  );
}
