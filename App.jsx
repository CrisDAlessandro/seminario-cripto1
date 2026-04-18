import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { AlertTriangle, BookOpen, CalendarDays, CreditCard, Filter, Plus, Search, Users } from 'lucide-react'

const TODAY = new Date()
const GRACE_DAYS = 3
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

function addMonths(dateString, months) {
  const d = new Date(`${dateString}T12:00:00`)
  d.setMonth(d.getMonth() + months)
  return d
}

function formatISO(date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDate(date) {
  return new Intl.DateTimeFormat('es-AR').format(date)
}

function diffDays(from, to) {
  const ms = 24 * 60 * 60 * 1000
  return Math.floor((to - from) / ms)
}

function serviceLabel(servicio) {
  if (servicio === 'mensual') return 'Plan Inversor Mensual'
  if (servicio === 'anual') return 'Plan Inversor Anual'
  return 'Clases'
}

function calcVencimiento(servicio, inicio, notas) {
  if (!inicio) return null
  if (servicio === 'mensual') return addMonths(inicio, String(notas || '').toLowerCase().includes('60') ? 2 : 1)
  if (servicio === 'anual') return addMonths(inicio, 12)
  if (servicio === 'clases') return addMonths(inicio, 1)
  return null
}

function computeClient(c) {
  const vencimiento = calcVencimiento(c.servicio, c.inicio, c.notas)
  const daysToDue = vencimiento ? diffDays(TODAY, vencimiento) : null
  const shouldRemove = c.estadoManual === 'sacar'

  let estadoSistema = 'activo'
  if (shouldRemove) estadoSistema = 'sacar'
  else if (vencimiento && TODAY > vencimiento && diffDays(vencimiento, TODAY) <= GRACE_DAYS) estadoSistema = 'gracia'
  else if (vencimiento && diffDays(vencimiento, TODAY) > GRACE_DAYS) estadoSistema = 'vencido'

  const accionDrive = shouldRemove || estadoSistema === 'vencido'
    ? 'Quitar acceso'
    : c.servicio === 'clases'
      ? 'Sin automatizar'
      : c.accesoDrive
        ? 'Mantener acceso'
        : 'Dar acceso'

  return { ...c, vencimiento, daysToDue, estadoSistema, accionDrive }
}

function Badge({ value }) {
  const colors = {
    activo: '#dcfce7',
    gracia: '#fef3c7',
    vencido: '#fee2e2',
    sacar: '#fee2e2',
  }
  return <span style={{ background: colors[value] || '#e2e8f0', padding: '6px 10px', borderRadius: 999, fontWeight: 700, fontSize: 12 }}>{String(value).toUpperCase()}</span>
}

function Card({ children, style }) {
  return <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, boxShadow: '0 4px 18px rgba(15,23,42,.05)', ...style }}>{children}</div>
}

function StatCard({ title, value, icon }) {
  return (
    <Card style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 14 }}>{title}</div>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{value}</div>
        </div>
        <div style={{ color: '#94a3b8' }}>{icon}</div>
      </div>
    </Card>
  )
}

function Modal({ open, onClose, children }) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 1000 }}>
      <div style={{ width: '100%', maxWidth: 820, background: '#fff', borderRadius: 20, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ border: 0, background: 'transparent', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return <button onClick={onClick} style={{ border: '1px solid #cbd5e1', background: active ? '#0f172a' : '#fff', color: active ? '#fff' : '#0f172a', borderRadius: 12, padding: '10px 14px', cursor: 'pointer', fontWeight: 700 }}>{children}</button>
}

function Input({ style, ...props }) {
  return <input {...props} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 12, padding: '12px 14px', outline: 'none', ...style }} />
}

function Select({ style, children, ...props }) {
  return <select {...props} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 12, padding: '12px 14px', background: '#fff', ...style }}>{children}</select>
}

function Table({ columns, rows, renderRow }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
        <thead>
          <tr>
            {columns.map((c) => <th key={c} style={{ textAlign: 'left', padding: 14, fontSize: 13, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  )
}

export default function App() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('vencimientos')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    servicio: 'mensual',
    inicio: formatISO(TODAY),
    monto: 30,
    estadoManual: 'activo',
    notas: '',
    deudaRestante: 0,
    accesoDrive: false,
  })

  const loadClients = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('clientes').select('*').order('id', { ascending: false })
    if (!error && data) {
      setClients(data.map((row) => ({
        id: row.id,
        nombre: row.nombre || '',
        email: row.email || '',
        servicio: row.servicio || 'mensual',
        inicio: row.fecha_inicio || formatISO(TODAY),
        monto: Number(row.monto || 0),
        estadoManual: row.estado_manual || 'activo',
        notas: row.notas || '',
        deudaRestante: Number(row.deuda_restante || 0),
        accesoDrive: !!row.acceso_drive,
      })))
    }
    setLoading(false)
  }

  useEffect(() => { loadClients() }, [])

  const computed = useMemo(() => clients.map(computeClient), [clients])

  const filtered = useMemo(() => computed.filter((c) => {
    const text = `${c.nombre} ${c.email}`.toLowerCase()
    const okSearch = text.includes(search.toLowerCase())
    const okFilter = filter === 'todos' ? true : c.servicio === filter || c.estadoSistema === filter
    return okSearch && okFilter
  }), [computed, search, filter])

  const dashboard = useMemo(() => ({
    activos: computed.filter((c) => c.estadoSistema === 'activo').length,
    gracia: computed.filter((c) => c.estadoSistema === 'gracia').length,
    sacar: computed.filter((c) => c.estadoSistema === 'sacar' || c.estadoSistema === 'vencido').length,
    deudores: computed.filter((c) => (c.deudaRestante || 0) > 0).length,
    clases: computed.filter((c) => c.servicio === 'clases').length,
  }), [computed])

  const vencimientos = useMemo(() => computed.filter((c) => c.servicio !== 'clases').sort((a, b) => (a.vencimiento?.getTime() || 0) - (b.vencimiento?.getTime() || 0)), [computed])
  const deudores = useMemo(() => computed.filter((c) => (c.deudaRestante || 0) > 0), [computed])
  const clases = useMemo(() => computed.filter((c) => c.servicio === 'clases'), [computed])

  const addClient = async () => {
    if (!form.nombre.trim()) return
    const vencimiento = calcVencimiento(form.servicio, form.inicio, form.notas)
    const { error } = await supabase.from('clientes').insert({
      nombre: form.nombre,
      email: form.email,
      servicio: form.servicio,
      fecha_inicio: form.inicio,
      fecha_vencimiento: vencimiento ? formatISO(vencimiento) : null,
      monto: Number(form.monto),
      estado_manual: form.estadoManual,
      notas: form.notas,
      deuda_restante: Number(form.deudaRestante || 0),
      acceso_drive: !!form.accesoDrive,
    })
    if (error) {
      alert('No se pudo guardar el cliente')
      return
    }
    setModalOpen(false)
    setForm({ nombre: '', email: '', servicio: 'mensual', inicio: formatISO(TODAY), monto: 30, estadoManual: 'activo', notas: '', deudaRestante: 0, accesoDrive: false })
    loadClients()
  }

  const updateEstadoManual = async (id, value) => {
    const { error } = await supabase.from('clientes').update({ estado_manual: value }).eq('id', id)
    if (!error) loadClients()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 36 }}>Seminario Cripto · Sistema interno</h1>
            <p style={{ margin: '8px 0 0', color: '#64748b' }}>{loading ? 'Cargando base real...' : 'Conectado a Supabase. Baiano carga una vez y el sistema calcula lo demás.'}</p>
          </div>
          <button onClick={() => setModalOpen(true)} style={{ border: 0, borderRadius: 14, background: '#0f172a', color: '#fff', padding: '14px 18px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}><Plus size={18} /> Nuevo cliente</button>
        </div>

        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <StatCard title="Clientes activos" value={dashboard.activos} icon={<Users size={34} />} />
          <StatCard title="En gracia" value={dashboard.gracia} icon={<CalendarDays size={34} />} />
          <StatCard title="Para sacar acceso" value={dashboard.sacar} icon={<AlertTriangle size={34} />} />
          <StatCard title="Deudores" value={dashboard.deudores} icon={<CreditCard size={34} />} />
          <StatCard title="Clases" value={dashboard.clases} icon={<BookOpen size={34} />} />
        </div>

        <Card style={{ padding: 22 }}>
          <h2 style={{ marginTop: 0 }}>Base operativa</h2>
          <p style={{ color: '#64748b' }}>Si marcás <strong>Sacar</strong>, queda listo para quitar acceso. Gracia: 3 días. Mensual: 30 USD. Anual: 250 USD. Clases: 250 USD.</p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '16px 0 18px' }}>
            <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 14, top: 14, color: '#94a3b8' }} />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente o email" style={{ paddingLeft: 40 }} />
            </div>
            <div style={{ minWidth: 220, position: 'relative' }}>
              <Filter size={16} style={{ position: 'absolute', left: 14, top: 14, color: '#94a3b8', zIndex: 1 }} />
              <Select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ paddingLeft: 40 }}>
                <option value="todos">Todos</option>
                <option value="mensual">Mensual</option>
                <option value="anual">Anual</option>
                <option value="clases">Clases</option>
                <option value="gracia">En gracia</option>
                <option value="sacar">Sacar</option>
              </Select>
            </div>
          </div>

          <Table
            columns={[ 'Cliente', 'Servicio', 'Vencimiento', 'Días', 'Estado', 'Acción Drive', 'Estado manual' ]}
            rows={filtered}
            renderRow={(c) => (
              <tr key={c.id}>
                <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>{c.nombre}</td>
                <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>{serviceLabel(c.servicio)}</td>
                <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>{c.vencimiento ? formatDate(c.vencimiento) : '-'}</td>
                <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>{c.vencimiento ? c.daysToDue : '-'}</td>
                <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}><Badge value={c.estadoSistema} /></td>
                <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>{c.accionDrive}</td>
                <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>
                  <Select value={c.estadoManual} onChange={(e) => updateEstadoManual(c.id, e.target.value)}>
                    <option value="activo">Activo</option>
                    <option value="sacar">Sacar</option>
                  </Select>
                </td>
              </tr>
            )}
          />
        </Card>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <TabButton active={tab === 'vencimientos'} onClick={() => setTab('vencimientos')}>Vencimientos</TabButton>
          <TabButton active={tab === 'deudores'} onClick={() => setTab('deudores')}>Deudores</TabButton>
          <TabButton active={tab === 'clases'} onClick={() => setTab('clases')}>Clases</TabButton>
          <TabButton active={tab === 'reglas'} onClick={() => setTab('reglas')}>Reglas</TabButton>
        </div>

        {tab === 'vencimientos' && (
          <Card style={{ padding: 22 }}>
            <h2 style={{ marginTop: 0 }}>Vencimientos automáticos</h2>
            <Table
              columns={[ 'Cliente', 'Servicio', 'Vence', 'Días', 'Estado', 'Acción' ]}
              rows={vencimientos}
              renderRow={(c) => (
                <tr key={c.id}>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>{c.nombre}</td>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>{serviceLabel(c.servicio)}</td>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>{c.vencimiento ? formatDate(c.vencimiento) : '-'}</td>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>{c.vencimiento ? c.daysToDue : '-'}</td>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}><Badge value={c.estadoSistema} /></td>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>{c.accionDrive}</td>
                </tr>
              )}
            />
          </Card>
        )}

        {tab === 'deudores' && (
          <Card style={{ padding: 22 }}>
            <h2 style={{ marginTop: 0 }}>Deudores</h2>
            <Table
              columns={[ 'Cliente', 'Servicio', 'Pagado', 'Resta', 'Notas' ]}
              rows={deudores}
              renderRow={(c) => (
                <tr key={c.id}>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>{c.nombre}</td>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>{serviceLabel(c.servicio)}</td>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>USD {c.monto}</td>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>USD {c.deudaRestante}</td>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>{c.notas}</td>
                </tr>
              )}
            />
          </Card>
        )}

        {tab === 'clases' && (
          <Card style={{ padding: 22 }}>
            <h2 style={{ marginTop: 0 }}>Clases</h2>
            <Table
              columns={[ 'Alumno', 'Inicio', 'Mes operativo', 'Monto', 'Notas' ]}
              rows={clases}
              renderRow={(c) => (
                <tr key={c.id}>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>{c.nombre}</td>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>{formatDate(new Date(`${c.inicio}T12:00:00`))}</td>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>{new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(`${c.inicio}T12:00:00`))}</td>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>USD {c.monto}</td>
                  <td style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>{c.notas}</td>
                </tr>
              )}
            />
          </Card>
        )}

        {tab === 'reglas' && (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <Card style={{ padding: 22 }}>
              <h2 style={{ marginTop: 0 }}>Cómo trabaja Baiano</h2>
              <p>1. Carga nombre, mail, servicio, fecha y monto.</p>
              <p>2. Si alguien no pagó y hay que cortarlo, cambia el estado manual a <strong>Sacar</strong>.</p>
              <p>3. Si pagó dos meses, lo aclara en notas con “60 días”.</p>
              <p>4. El resto sale del sistema: vencimiento, gracia y acción sobre acceso.</p>
            </Card>
            <Card style={{ padding: 22 }}>
              <h2 style={{ marginTop: 0 }}>Qué se automatiza después</h2>
              <p>1. Dar acceso a Drive cuando entra un cliente activo.</p>
              <p>2. Quitar acceso al día 4 o cuando se marque <strong>Sacar</strong>.</p>
              <p>3. Mantener historial de pagos y renovaciones.</p>
              <p>4. Separar permisos: vos admin, Baiano operador.</p>
            </Card>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <h2 style={{ marginTop: 0 }}>Alta de cliente</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <div><div style={{ marginBottom: 6, fontWeight: 700 }}>Nombre</div><Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
          <div><div style={{ marginBottom: 6, fontWeight: 700 }}>Email</div><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 700 }}>Servicio</div>
            <Select value={form.servicio} onChange={(e) => setForm({ ...form, servicio: e.target.value, monto: e.target.value === 'mensual' ? 30 : 250 })}>
              <option value="mensual">Plan Inversor Mensual</option>
              <option value="anual">Plan Inversor Anual</option>
              <option value="clases">Clases</option>
            </Select>
          </div>
          <div><div style={{ marginBottom: 6, fontWeight: 700 }}>Fecha inicio</div><Input type="date" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} /></div>
          <div><div style={{ marginBottom: 6, fontWeight: 700 }}>Monto USD</div><Input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} /></div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 700 }}>Estado manual</div>
            <Select value={form.estadoManual} onChange={(e) => setForm({ ...form, estadoManual: e.target.value })}>
              <option value="activo">Activo</option>
              <option value="sacar">Sacar</option>
            </Select>
          </div>
          <div><div style={{ marginBottom: 6, fontWeight: 700 }}>Deuda restante</div><Input type="number" value={form.deudaRestante} onChange={(e) => setForm({ ...form, deudaRestante: e.target.value })} /></div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 700 }}>Acceso Drive</div>
            <Select value={String(form.accesoDrive)} onChange={(e) => setForm({ ...form, accesoDrive: e.target.value === 'true' })}>
              <option value="false">No</option>
              <option value="true">Sí</option>
            </Select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}><div style={{ marginBottom: 6, fontWeight: 700 }}>Notas</div><Input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Ej: 60 días / anual parcial / control interno clases" /></div>
        </div>
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={addClient} style={{ border: 0, borderRadius: 14, background: '#0f172a', color: '#fff', padding: '14px 18px', fontWeight: 800, cursor: 'pointer' }}>Guardar cliente</button>
        </div>
      </Modal>
    </div>
  )
}
