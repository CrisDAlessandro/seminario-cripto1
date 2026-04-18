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

function addMonths(dateString, months) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setMonth(d.getMonth() + months);
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

function computeClient(client) {
  let vencimiento = null;

  if (client.servicio === "mensual") {
    vencimiento = toISODate(addMonths(client.fecha_inicio, 1));
  } else if (client.servicio === "anual") {
    vencimiento = toISODate(addMonths(client.fecha_inicio, 12));
  }

  let estadoSistema = "activo";
  let dias = null;

  if (client.estado_manual === "sacar") {
    estadoSistema = "sacar";
  } else if (vencimiento) {
    const dueDate = new Date(`${vencimiento}T12:00:00`);
    dias = diffDays(TODAY, dueDate);

    if (TODAY > dueDate) {
      const overdue = diffDays(dueDate, TODAY);
      estadoSistema = overdue <= GRACE_DAYS ? "gracia" : "vencido";
    }
  }

  return {
    ...client,
    vencimiento,
    dias,
    estadoSistema,
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
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    servicio: "mensual",
    fecha_inicio: toISODate(TODAY),
    monto: 30,
    estado_manual: "activo",
    deuda_restante: 0,
    acceso_drive: false,
    notas: "",
  });

  async function fetchClientes() {
    setLoading(true);
    const { data, error } = await supabase.from("clientes").select("*").order("id", { ascending: false });

    if (error) {
      alert("No se pudieron cargar los clientes");
      setLoading(false);
      return;
    }

    setClientes(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchClientes();
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

    computed.forEach((c) => {
      const key = monthKey(c.fecha_inicio);
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
      const monto = Number(c.monto || 0);

      if (c.servicio === "mensual") {
        row.mensual += monto;
        row.ventasMensual += 1;
      } else if (c.servicio === "anual") {
        row.anual += monto;
        row.ventasAnual += 1;
      } else {
        row.clases += monto;
        row.ventasClases += 1;
      }

      row.total += monto;
    });

    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [computed]);

  const maxTotal = Math.max(...resumenMensual.map((r) => r.total), 1);

  async function guardarCliente() {
    if (!form.nombre.trim()) {
      alert("Falta el nombre");
      return;
    }

    setGuardando(true);

    const payload = {
      ...form,
      monto: Number(form.monto || 0),
      deuda_restante: Number(form.deuda_restante || 0),
      fecha_vencimiento:
        form.servicio === "mensual"
          ? toISODate(addMonths(form.fecha_inicio, 1))
          : form.servicio === "anual"
          ? toISODate(addMonths(form.fecha_inicio, 12))
          : null,
    };

    const { error } = await supabase.from("clientes").insert([payload]);

    setGuardando(false);

    if (error) {
      alert("No se pudo guardar el cliente");
      return;
    }

    setShowForm(false);
    setForm({
      nombre: "",
      email: "",
      servicio: "mensual",
      fecha_inicio: toISODate(TODAY),
      monto: 30,
      estado_manual: "activo",
      deuda_restante: 0,
      acceso_drive: false,
      notas: "",
    });

    fetchClientes();
  }

  async function eliminarCliente(id) {
    const ok = window.confirm("¿Eliminar este cliente?");
    if (!ok) return;

    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) {
      alert("No se pudo eliminar");
      return;
    }

    fetchClientes();
  }

  async function cambiarEstado(id, value) {
    const { error } = await supabase.from("clientes").update({ estado_manual: value }).eq("id", id);
    if (error) {
      alert("No se pudo actualizar");
      return;
    }

    fetchClientes();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ee", color: "#0f172a", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800 }}>Seminario Cripto</h1>
            <div style={{ color: "#64748b", marginTop: 6 }}>Panel de gestión comercial y operativa.</div>
          </div>

          <button style={buttonStyle(true)} onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cerrar" : "+ Nuevo cliente"}
          </button>
        </div>

        {showForm && (
          <div style={{ ...cardStyle(), marginBottom: 24 }}>
            <h3 style={{ marginTop: 0 }}>Alta de cliente</h3>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              <input style={inputStyle()} placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              <input style={inputStyle()} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

              <select
                style={inputStyle()}
                value={form.servicio}
                onChange={(e) =>
                  setForm({
                    ...form,
                    servicio: e.target.value,
                    monto: serviceDefaultAmount(e.target.value),
                  })
                }
              >
                <option value="mensual">Plan Inversor Mensual</option>
                <option value="anual">Plan Inversor Anual</option>
                <option value="clases">Clases</option>
              </select>

              <input
                style={inputStyle()}
                type="date"
                value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
              />

              <input
                style={inputStyle()}
                type="number"
                placeholder="Monto"
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
              />

              <select
                style={inputStyle()}
                value={form.estado_manual}
                onChange={(e) => setForm({ ...form, estado_manual: e.target.value })}
              >
                <option value="activo">Activo</option>
                <option value="sacar">Sacar</option>
              </select>

              <input
                style={inputStyle()}
                type="number"
                placeholder="Deuda restante"
                value={form.deuda_restante}
                onChange={(e) => setForm({ ...form, deuda_restante: e.target.value })}
              />

              <input
                style={{ ...inputStyle(), gridColumn: "1 / -1" }}
                placeholder="Notas"
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
            </div>

            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button style={buttonStyle(true)} onClick={guardarCliente}>
                {guardando ? "Guardando..." : "Guardar cliente"}
              </button>
            </div>
          </div>
        )}

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
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
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
                  {["Cliente", "Servicio", "Vencimiento", "Días", "Estado", "Estado manual", "Eliminar"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", fontWeight: 700 }}>{c.nombre}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{serviceLabel(c.servicio)}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{c.vencimiento ? formatDate(c.vencimiento) : "-"}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{c.vencimiento ? c.dias : "-"}</td>
                    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                      <span style={badgeStyle(c.estadoSistema)}>{c.estadoSistema.toUpperCase()}</span>
                    </td>
                    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                      <select style={inputStyle()} value={c.estado_manual} onChange={(e) => cambiarEstado(c.id, e.target.value)}>
                        <option value="activo">Activo</option>
                        <option value="sacar">Sacar</option>
                      </select>
                    </td>
                    <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
  <button
    style={{ ...buttonStyle(false), padding: "8px 12px" }}
    onClick={() => {
      if (confirm("¿Eliminar cliente?")) {
        eliminarCliente(c.id);
      }
    }}
  >
    🗑
  </button>
</td>>
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
                      <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
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
                      <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
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
                      <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clases.map((c) => (
                    <tr key={c.id}>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", fontWeight: 700 }}>{c.nombre}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{formatDate(c.fecha_inicio)}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", textTransform: "capitalize" }}>{monthLabel(monthKey(c.fecha_inicio))}</td>
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
                        <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resumenMensual.map((r) => (
                      <tr key={r.key}>
                        <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", fontWeight: 700, textTransform: "capitalize" }}>{monthLabel(r.key)}</td>
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
      </div>
    </div>
  );
}
