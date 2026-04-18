import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  CalendarDays,
  Users,
  AlertTriangle,
  CreditCard,
  Plus,
  Search,
  Filter,
  BookOpen,
  Trash2,
  DollarSign,
} from "lucide-react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const TODAY = new Date();
const GRACE_DAYS = 3;

function addMonths(dateString, months) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatISO(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("es-AR").format(date);
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
  const from = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const to = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  const ms = 24 * 60 * 60 * 1000;
  return Math.floor((to - from) / ms);
}

function serviceLabel(servicio) {
  if (servicio === "mensual") return "Plan Inversor Mensual";
  if (servicio === "anual") return "Plan Inversor Anual";
  return "Clases";
}

function serviceAmount(servicio) {
  if (servicio === "mensual") return 30;
  if (servicio === "anual") return 250;
  return 250;
}

function computeClient(client) {
  const baseDate = client.inicio || formatISO(TODAY);

  let vencimiento = null;
  if (client.servicio === "mensual") vencimiento = addMonths(baseDate, 1);
  if (client.servicio === "anual") vencimiento = addMonths(baseDate, 12);

  const estadoManual = client.estadoManual || "activo";
  const deudaRestante = Number(client.deudaRestante || 0);
  const monto = Number(client.monto || 0);

  let daysToDue = null;
  let estadoSistema = "activo";

  if (vencimiento) {
    daysToDue = diffDays(TODAY, vencimiento);

    if (estadoManual === "sacar") {
      estadoSistema = "sacar";
    } else if (TODAY > vencimiento) {
      const overdue = diffDays(vencimiento, TODAY);
      estadoSistema = overdue <= GRACE_DAYS ? "gracia" : "vencido";
    } else {
      estadoSistema = "activo";
    }
  } else {
    estadoSistema = estadoManual === "sacar" ? "sacar" : "activo";
  }

  return {
    ...client,
    monto,
    deudaRestante,
    vencimiento,
    daysToDue,
    estadoSistema,
  };
}

function StatusBadge({ value }) {
  const classes = {
    activo: "bg-emerald-100 text-emerald-700 border-emerald-200",
    gracia: "bg-amber-100 text-amber-700 border-amber-200",
    vencido: "bg-rose-100 text-rose-700 border-rose-200",
    sacar: "bg-slate-200 text-slate-800 border-slate-300",
  };

  return (
    <Badge className={`border ${classes[value] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
      {value.toUpperCase()}
    </Badge>
  );
}

export default function App() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    servicio: "mensual",
    inicio: formatISO(TODAY),
    monto: 30,
    estadoManual: "activo",
    notas: "",
    deudaRestante: 0,
  });

  const loadClients = async () => {
    setLoading(true);

    const { data, error } = await supabase.from("clientes").select("*").order("id", { ascending: false });

    if (error) {
      setLoading(false);
      alert("No se pudieron cargar los clientes");
      return;
    }

    const mapped = (data || []).map((row) => ({
      id: row.id,
      nombre: row.nombre || "",
      email: row.email || "",
      servicio: row.servicio || "mensual",
      inicio: row.fecha_inicio || formatISO(TODAY),
      monto: Number(row.monto || 0),
      estadoManual: row.estado_manual || "activo",
      notas: row.notas || "",
      deudaRestante: Number(row.deuda_restante || 0),
      accesoDrive: !!row.acceso_drive,
    }));

    setClients(mapped);
    setLoading(false);
  };

  useEffect(() => {
    loadClients();
  }, []);

  const computed = useMemo(() => clients.map(computeClient), [clients]);

  const filtered = useMemo(() => {
    return computed.filter((c) => {
      const matchesSearch =
        c.nombre.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase());

      const matchesFilter =
        filter === "todos" ||
        c.servicio === filter ||
        c.estadoSistema === filter;

      return matchesSearch && matchesFilter;
    });
  }, [computed, search, filter]);

  const dashboard = useMemo(
    () => ({
      activos: computed.filter((c) => c.estadoSistema === "activo").length,
      gracia: computed.filter((c) => c.estadoSistema === "gracia").length,
      sacar: computed.filter((c) => c.estadoSistema === "sacar" || c.estadoSistema === "vencido").length,
      deudores: computed.filter((c) => Number(c.deudaRestante || 0) > 0).length,
      clases: computed.filter((c) => c.servicio === "clases").length,
      ingresos: computed.reduce((acc, c) => acc + Number(c.monto || 0), 0),
    }),
    [computed]
  );

  const vencimientos = useMemo(() => {
    return computed
      .filter((c) => c.servicio !== "clases")
      .sort((a, b) => {
        const aTime = a.vencimiento ? a.vencimiento.getTime() : 0;
        const bTime = b.vencimiento ? b.vencimiento.getTime() : 0;
        return aTime - bTime;
      });
  }, [computed]);

  const deudores = useMemo(
    () => computed.filter((c) => Number(c.deudaRestante || 0) > 0),
    [computed]
  );

  const clases = useMemo(
    () => computed.filter((c) => c.servicio === "clases"),
    [computed]
  );

  const resumenMensual = useMemo(() => {
    const map = new Map();

    computed.forEach((c) => {
      const key = monthKey(c.inicio);
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

      const item = map.get(key);
      const monto = Number(c.monto || 0);

      if (c.servicio === "mensual") {
        item.mensual += monto;
        item.ventasMensual += 1;
      } else if (c.servicio === "anual") {
        item.anual += monto;
        item.ventasAnual += 1;
      } else {
        item.clases += monto;
        item.ventasClases += 1;
      }

      item.total += monto;
    });

    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [computed]);

  const addClient = async () => {
    if (!form.nombre.trim()) {
      alert("Poné el nombre");
      return;
    }

    setSaving(true);

    const payload = {
      nombre: form.nombre.trim(),
      email: form.email.trim(),
      servicio: form.servicio,
      fecha_inicio: form.inicio,
      fecha_vencimiento:
        form.servicio === "mensual"
          ? formatISO(addMonths(form.inicio, 1))
          : form.servicio === "anual"
          ? formatISO(addMonths(form.inicio, 12))
          : null,
      monto: Number(form.monto || 0),
      estado_manual: form.estadoManual,
      notas: form.notas,
      deuda_restante: Number(form.deudaRestante || 0),
      acceso_drive: false,
    };

    const { error } = await supabase.from("clientes").insert(payload);

    setSaving(false);

    if (error) {
      alert("No se pudo guardar el cliente");
      return;
    }

    setForm({
      nombre: "",
      email: "",
      servicio: "mensual",
      inicio: formatISO(TODAY),
      monto: 30,
      estadoManual: "activo",
      notas: "",
      deudaRestante: 0,
    });

    setOpen(false);
    await loadClients();
  };

  const updateEstadoManual = async (id, value) => {
    const { error } = await supabase
      .from("clientes")
      .update({ estado_manual: value })
      .eq("id", id);

    if (error) {
      alert("No se pudo actualizar el estado");
      return;
    }

    await loadClients();
  };

  const deleteClient = async (id) => {
    const ok = window.confirm("¿Eliminar este cliente? Esta acción no se puede deshacer.");
    if (!ok) return;

    const { error } = await supabase.from("clientes").delete().eq("id", id);

    if (error) {
      alert("No se pudo eliminar el cliente");
      return;
    }

    await loadClients();
  };

  const monthlyChartMax = Math.max(...resumenMensual.map((r) => r.total), 1);

  return (
    <div className="min-h-screen bg-[#f5f3ee] text-slate-900">
      <div className="mx-auto max-w-7xl p-6 md:p-8 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Seminario Cripto</h1>
            <p className="mt-1 text-sm text-slate-500">Panel de gestión comercial y operativa.</p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800">
                <Plus className="h-4 w-4" />
                Nuevo cliente
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Alta de cliente</DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>

                <div className="space-y-2">
                  <Label>Servicio</Label>
                  <Select
                    value={form.servicio}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        servicio: value,
                        monto: serviceAmount(value),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mensual">Plan Inversor Mensual</SelectItem>
                      <SelectItem value="anual">Plan Inversor Anual</SelectItem>
                      <SelectItem value="clases">Clases</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Fecha de inicio</Label>
                  <Input
                    type="date"
                    value={form.inicio}
                    onChange={(e) => setForm({ ...form, inicio: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Monto USD</Label>
                  <Input
                    type="number"
                    value={form.monto}
                    onChange={(e) => setForm({ ...form, monto: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Estado manual</Label>
                  <Select
                    value={form.estadoManual}
                    onValueChange={(value) => setForm({ ...form, estadoManual: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="sacar">Sacar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Deuda restante</Label>
                  <Input
                    type="number"
                    value={form.deudaRestante}
                    onChange={(e) => setForm({ ...form, deudaRestante: e.target.value })}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Notas</Label>
                  <Input
                    value={form.notas}
                    onChange={(e) => setForm({ ...form, notas: e.target.value })}
                    placeholder="Observaciones"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={addClient}
                  disabled={saving}
                  className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                >
                  {saving ? "Guardando..." : "Guardar cliente"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Card className="rounded-2xl border-0 bg-white shadow-sm">
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-slate-500">Activos</p>
                <p className="text-3xl font-semibold">{dashboard.activos}</p>
              </div>
              <Users className="h-8 w-8 text-slate-400" />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 bg-white shadow-sm">
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-slate-500">En gracia</p>
                <p className="text-3xl font-semibold">{dashboard.gracia}</p>
              </div>
              <CalendarDays className="h-8 w-8 text-slate-400" />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 bg-white shadow-sm">
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-slate-500">Para sacar</p>
                <p className="text-3xl font-semibold">{dashboard.sacar}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-slate-400" />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 bg-white shadow-sm">
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-slate-500">Deudores</p>
                <p className="text-3xl font-semibold">{dashboard.deudores}</p>
              </div>
              <CreditCard className="h-8 w-8 text-slate-400" />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 bg-white shadow-sm">
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-slate-500">Clases</p>
                <p className="text-3xl font-semibold">{dashboard.clases}</p>
              </div>
              <BookOpen className="h-8 w-8 text-slate-400" />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 bg-white shadow-sm">
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-slate-500">Ingresos cargados</p>
                <p className="text-3xl font-semibold">USD {dashboard.ingresos}</p>
              </div>
              <DollarSign className="h-8 w-8 text-slate-400" />
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border-0 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Base operativa</CardTitle>
            <CardDescription>{loading ? "Cargando datos..." : "Gestión central de clientes, renovaciones y clases."}</CardDescription>
          </CardHeader>

          <CardContent>
            <div className="mb-4 flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Buscar cliente o email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="w-full md:w-64">
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger>
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="mensual">Mensual</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                    <SelectItem value="clases">Clases</SelectItem>
                    <SelectItem value="gracia">En gracia</SelectItem>
                    <SelectItem value="sacar">Sacar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead>Días</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Estado manual</TableHead>
                    <TableHead className="text-right">Eliminar</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell>{serviceLabel(c.servicio)}</TableCell>
                      <TableCell>{c.vencimiento ? formatDate(c.vencimiento) : "-"}</TableCell>
                      <TableCell>{c.vencimiento ? c.daysToDue : "-"}</TableCell>
                      <TableCell>
                        <StatusBadge value={c.estadoSistema} />
                      </TableCell>
                      <TableCell>
                        <Select value={c.estadoManual} onValueChange={(value) => updateEstadoManual(c.id, value)}>
                          <SelectTrigger className="w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="activo">Activo</SelectItem>
                            <SelectItem value="sacar">Sacar</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => deleteClient(c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {!filtered.length && !loading && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                        No hay resultados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="vencimientos" className="space-y-4">
          <TabsList>
            <TabsTrigger value="vencimientos">Vencimientos</TabsTrigger>
            <TabsTrigger value="deudores">Deudores</TabsTrigger>
            <TabsTrigger value="clases">Clases</TabsTrigger>
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
          </TabsList>

          <TabsContent value="vencimientos">
            <Card className="rounded-2xl border-0 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Vencimientos</CardTitle>
                <CardDescription>Seguimiento automático de renovaciones y estados.</CardDescription>
              </CardHeader>

              <CardContent>
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Servicio</TableHead>
                        <TableHead>Vence</TableHead>
                        <TableHead>Días</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vencimientos.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.nombre}</TableCell>
                          <TableCell>{serviceLabel(c.servicio)}</TableCell>
                          <TableCell>{c.vencimiento ? formatDate(c.vencimiento) : "-"}</TableCell>
                          <TableCell>{c.vencimiento ? c.daysToDue : "-"}</TableCell>
                          <TableCell>
                            <StatusBadge value={c.estadoSistema} />
                          </TableCell>
                        </TableRow>
                      ))}

                      {!vencimientos.length && !loading && (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">
                            No hay vencimientos para mostrar.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deudores">
            <Card className="rounded-2xl border-0 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Deudores</CardTitle>
                <CardDescription>Control de saldos pendientes.</CardDescription>
              </CardHeader>

              <CardContent>
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Servicio</TableHead>
                        <TableHead>Pagado</TableHead>
                        <TableHead>Resta</TableHead>
                        <TableHead>Notas</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {deudores.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.nombre}</TableCell>
                          <TableCell>{serviceLabel(c.servicio)}</TableCell>
                          <TableCell>USD {c.monto}</TableCell>
                          <TableCell>USD {c.deudaRestante}</TableCell>
                          <TableCell>{c.notas || "-"}</TableCell>
                        </TableRow>
                      ))}

                      {!deudores.length && !loading && (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">
                            No hay deudores cargados.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="clases">
            <Card className="rounded-2xl border-0 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Clases</CardTitle>
                <CardDescription>Vista simple de alumnos y ciclos de clases.</CardDescription>
              </CardHeader>

              <CardContent>
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Alumno</TableHead>
                        <TableHead>Inicio</TableHead>
                        <TableHead>Mes</TableHead>
                        <TableHead>Monto</TableHead>
                        <TableHead>Notas</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {clases.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.nombre}</TableCell>
                          <TableCell>{formatDate(new Date(`${c.inicio}T12:00:00`))}</TableCell>
                          <TableCell className="capitalize">{monthLabel(monthKey(c.inicio))}</TableCell>
                          <TableCell>USD {c.monto}</TableCell>
                          <TableCell>{c.notas || "-"}</TableCell>
                        </TableRow>
                      ))}

                      {!clases.length && !loading && (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">
                            No hay clases cargadas.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="resumen">
            <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <Card className="rounded-2xl border-0 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Resumen mensual</CardTitle>
                  <CardDescription>Ingresos y ventas por mes, separados por tipo.</CardDescription>
                </CardHeader>

                <CardContent>
                  <div className="overflow-hidden rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mes</TableHead>
                          <TableHead>Mensual</TableHead>
                          <TableHead>Anual</TableHead>
                          <TableHead>Clases</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {resumenMensual.map((r) => (
                          <TableRow key={r.key}>
                            <TableCell className="font-medium capitalize">{monthLabel(r.key)}</TableCell>
                            <TableCell>USD {r.mensual}</TableCell>
                            <TableCell>USD {r.anual}</TableCell>
                            <TableCell>USD {r.clases}</TableCell>
                            <TableCell className="font-semibold">USD {r.total}</TableCell>
                          </TableRow>
                        ))}

                        {!resumenMensual.length && !loading && (
                          <TableRow>
                            <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">
                              Todavía no hay datos para resumir.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-0 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Vista rápida</CardTitle>
                  <CardDescription>Evolución visual de ingresos por mes.</CardDescription>
                </CardHeader>

                <CardContent className="space-y-5">
                  {resumenMensual.map((r) => {
                    const pct = Math.max((r.total / monthlyChartMax) * 100, 6);

                    return (
                      <div key={r.key} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="capitalize text-slate-700">{monthLabel(r.key)}</span>
                          <span className="font-medium text-slate-900">USD {r.total}</span>
                        </div>

                        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-slate-900" style={{ width: `${pct}%` }} />
                        </div>

                        <div className="text-xs text-slate-500">
                          Mensuales: {r.ventasMensual} · Anuales: {r.ventasAnual} · Clases: {r.ventasClases}
                        </div>
                      </div>
                    );
                  })}

                  {!resumenMensual.length && !loading && (
                    <div className="flex h-52 items-center justify-center rounded-xl border border-dashed text-sm text-slate-500">
                      Todavía no hay datos cargados para mostrar evolución.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
