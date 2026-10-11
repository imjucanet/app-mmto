/* Modelo de datos del reporte. Es el contrato que luego consumirá el GMAO
 * (órdenes de trabajo ↔ reportes, activos ↔ equipo, terceros ↔ cliente).
 */
const INTERVENTION_TYPES = [
  { id: 'proyecto', label: 'Proyecto' },
  { id: 'preventivo', label: 'Mantenimiento preventivo' },
  { id: 'diagnostico', label: 'Diagnóstico' },
  { id: 'instalacion', label: 'Instalación' },
  { id: 'correctivo', label: 'Mantenimiento correctivo' },
  { id: 'garantia', label: 'Garantía' },
];

const DEFAULT_COMPANY = {
  name: 'PROYECTRONICA SERVICES SAS',
  nit: '902074588-8',
  address: 'CL 22a sur # 32-56',
  phone: '323 284 4356',
  email: 'proyectronica.st@gmail.com',
  prefix: 'MTTO-',
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2));
const todayISO = () => new Date().toISOString().slice(0, 10);

function newJob() {
  return { id: uid(), description: '', before: [], after: [] };
}

function newReport(settings = {}) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    schemaVersion: 1,
    number: '',
    status: 'draft',            // draft | final
    issuedAt: todayISO(),
    client: { nit: '', name: '', city: '', phone: '', contact: '', email: '', address: '' },
    types: [],
    technician: { name: settings.techName || '', phone: settings.techPhone || '' },
    equipment: { name: '', type: '', brand: '', model: '', code: '', serial: '', location: '' },
    diagnosis: '',
    jobs: [newJob()],
    observations: '',
    receiver: { name: '', role: '' },
    signatures: { delivers: '', receives: '' },   // dataURL PNG
    // metadatos de sincronización (para el GMAO)
    createdAt: now, updatedAt: now, syncedAt: null,
  };
}

function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, path, v) {
  const ks = path.split('.'); const last = ks.pop();
  ks.reduce((a, k) => a[k], o)[last] = v;
}
