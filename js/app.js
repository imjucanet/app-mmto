/* Lógica de la interfaz. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let report;
  let company = { ...DEFAULT_COMPANY };
  let prefs = { techName: '', techPhone: '', counter: 0 };
  let clientsCache = [], equipCache = [];
  let currentBlobUrl = null, currentPdf = null, currentFilename = '';

  /* ---------- utilidades ---------- */
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function compressImage(file, max = 1280, q = 0.72) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = rej;
      img.src = url;
    });
  }

  /* ---------- persistencia ---------- */
  const persist = debounce(async () => {
    report.updatedAt = new Date().toISOString();
    await Repo.reports.put(report);
    await Repo.settings.set('currentId', report.id);
    refreshHistoryCount();
  }, 500);

  async function loadCatalogs() {
    clientsCache = await Repo.clients.all();
    equipCache = await Repo.equipment.all();
    $('#dlNit').innerHTML = clientsCache.map((c) => `<option value="${esc(c.nit)}">${esc(c.name)}</option>`).join('');
    $('#dlClient').innerHTML = clientsCache.map((c) => `<option value="${esc(c.name)}">`).join('');
    $('#dlEquip').innerHTML = equipCache.map((e) => `<option value="${esc(e.name)}">${esc([e.code, e.serial].filter(Boolean).join(' · '))}</option>`).join('');
  }

  async function upsertCatalogs() {
    const c = report.client;
    if (c.nit || c.name) await Repo.clients.put({ ...c, nit: c.nit || c.name });
    const e = report.equipment;
    const key = (e.serial || e.code || e.name || '').trim();
    if (key) await Repo.equipment.put({ ...e, key: `${c.nit || c.name}|${key}`, clientNit: c.nit || c.name });
    await loadCatalogs();
  }

  /* ---------- formulario ---------- */
  function renderTypes() {
    $('#typeChips').innerHTML = INTERVENTION_TYPES.map((t) =>
      `<button type="button" class="chip ${report.types.includes(t.id) ? 'on' : ''}" data-type="${t.id}">${esc(t.label)}</button>`).join('');
  }

  function renderJobs() {
    $('#jobs').innerHTML = report.jobs.map((j, i) => `
      <div class="job" data-job="${j.id}">
        <div class="job-head"><span>Trabajo ${i + 1}</span>
          ${report.jobs.length > 1 ? '<button class="link" data-del-job>Eliminar</button>' : ''}</div>
        <textarea rows="5" data-job-desc placeholder="Describa los trabajos efectuados…">${esc(j.description)}</textarea>
        ${['before', 'after'].map((side) => `
          <div class="photos-label">${side === 'before' ? 'Fotos ANTES' : 'Fotos DESPUÉS'}</div>
          <div class="photos">
            ${j[side].map((src, k) => `<div class="ph"><img src="${src}" alt=""><button data-del-photo="${side}:${k}" aria-label="Quitar">✕</button></div>`).join('')}
            <label class="add-ph">+<input type="file" accept="image/*" capture="environment" multiple hidden data-add-photo="${side}"></label>
          </div>`).join('')}
      </div>`).join('');
  }

  function fillForm() {
    $$('[data-bind]').forEach((el) => { el.value = getPath(report, el.dataset.bind) ?? ''; });
    renderTypes(); renderJobs();
    $('#numLabel').textContent = report.number || 'Nuevo reporte';
    $('#sigDeliversName').textContent = report.technician.name || '';
    pads.delivers.set(report.signatures.delivers);
    pads.receives.set(report.signatures.receives);
  }

  function bindEvents() {
    document.addEventListener('input', (e) => {
      const b = e.target.dataset?.bind;
      if (b) {
        setPath(report, b, e.target.value);
        if (b === 'client.nit' || b === 'client.name') autofillClient(b, e.target.value);
        if (b === 'equipment.name') autofillEquipment(e.target.value);
        if (b === 'technician.name') $('#sigDeliversName').textContent = e.target.value;
        persist();
      } else if (e.target.matches('[data-job-desc]')) {
        jobOf(e.target).description = e.target.value; persist();
      }
    });

    document.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.dataset.type) {
        const i = report.types.indexOf(t.dataset.type);
        i >= 0 ? report.types.splice(i, 1) : report.types.push(t.dataset.type);
        renderTypes(); persist();
      }
      if (t.dataset.delJob !== undefined) {
        const j = jobOf(t);
        if (confirm('¿Eliminar este trabajo y sus fotos?')) { report.jobs = report.jobs.filter((x) => x !== j); renderJobs(); persist(); }
      }
      if (t.dataset.delPhoto) {
        const [side, k] = t.dataset.delPhoto.split(':');
        jobOf(t)[side].splice(+k, 1); renderJobs(); persist();
      }
      if (t.dataset.clear) { pads[t.dataset.clear].clear(); }
      if (t.hasAttribute('data-close')) t.closest('.modal').hidden = true;
    });

    document.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.dataset.addPhoto) {
        const job = jobOf(t);
        toast('Procesando fotos…');
        for (const f of t.files) job[t.dataset.addPhoto].push(await compressImage(f));
        renderJobs(); persist();
      }
    });

    $('#btnAddJob').onclick = () => { report.jobs.push(newJob()); renderJobs(); persist(); };
    $('#btnNew').onclick = async () => {
      if (!confirm('¿Iniciar un nuevo reporte? El actual queda guardado en el historial.')) return;
      await startNew();
    };
    $('#btnPreview').onclick = onPreview;

    $$('.tab').forEach((b) => (b.onclick = () => showView(b.dataset.view)));
    $('#btnSettings').onclick = openSettings;
    $('#btnSaveSettings').onclick = saveSettings;
    $('#histSearch').oninput = renderHistory;
    $('#btnExport').onclick = exportBackup;
    $('#fileImport').onchange = importBackup;
    $('#pvDownload').onclick = download;
    $('#pvShare').onclick = share;
    $('#pvOpen').onclick = () => currentBlobUrl && window.open(currentBlobUrl, '_blank');
  }

  const jobOf = (el) => report.jobs.find((j) => j.id === el.closest('[data-job]').dataset.job);

  function autofillClient(field, value) {
    const c = clientsCache.find((x) => (field === 'client.nit' ? x.nit : x.name) === value);
    if (!c) return;
    Object.assign(report.client, c);
    $$('[data-bind^="client."]').forEach((el) => { el.value = getPath(report, el.dataset.bind) ?? ''; });
  }
  function autofillEquipment(name) {
    const clientKey = report.client.nit || report.client.name;
    const e = equipCache.find((x) => x.name === name && (!clientKey || x.clientNit === clientKey)) || equipCache.find((x) => x.name === name);
    if (!e) return;
    const { key, clientNit, ...rest } = e;
    Object.assign(report.equipment, rest);
    $$('[data-bind^="equipment."]').forEach((el) => { el.value = getPath(report, el.dataset.bind) ?? ''; });
  }

  /* ---------- firmas ---------- */
  const pads = {};
  function SignaturePad(canvas, onChange) {
    const ctx = canvas.getContext('2d');
    let drawing = false, last = null, dirty = false;
    function size() {
      const r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      const snap = dirty ? canvas.toDataURL() : null;
      canvas.width = r.width * d; canvas.height = r.height * d;
      ctx.scale(d, d); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#0b1f3a';
      if (snap) draw(snap);
    }
    function draw(src) {
      if (!src) return;
      const im = new Image();
      im.onload = () => { const r = canvas.getBoundingClientRect(); ctx.drawImage(im, 0, 0, r.width, r.height); };
      im.src = src;
    }
    const pt = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointerdown', (e) => { drawing = true; last = pt(e); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pt(e); ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); last = p; dirty = true;
    });
    const end = () => { if (drawing) { drawing = false; onChange(dirty ? canvas.toDataURL('image/png') : ''); } };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    return {
      size,
      clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; onChange(''); },
      set(src) {
        ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = !!src; draw(src);
      },
    };
  }

  /* ---------- vistas ---------- */
  function showView(v) {
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    $$('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + v));
    if (v === 'history') renderHistory();
    if (v === 'form') { pads.delivers.size(); pads.receives.size(); pads.delivers.set(report.signatures.delivers); pads.receives.set(report.signatures.receives); }
  }

  async function refreshHistoryCount() { $('#histCount').textContent = (await Repo.reports.all()).length; }

  async function renderHistory() {
    const q = $('#histSearch').value.trim().toLowerCase();
    let list = (await Repo.reports.all()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    if (q) list = list.filter((r) => [r.number, r.client.name, r.equipment.name, r.equipment.code].join(' ').toLowerCase().includes(q));
    $('#histEmpty').hidden = list.length > 0;
    $('#histList').innerHTML = list.map((r) => `
      <div class="hist-item" data-id="${r.id}">
        <div class="hist-top"><span class="hist-num">${esc(r.number || 'Borrador')}</span>
          <span class="status ${r.status}">${r.status === 'final' ? 'Finalizado' : 'Borrador'}</span></div>
        <div>${esc(r.client.name || 'Sin cliente')}</div>
        <div class="hist-meta">${esc(r.issuedAt)} · ${esc(r.equipment.name || 'Sin equipo')}</div>
        <div class="row">
          <button class="btn secondary small" data-h="open">Editar</button>
          <button class="btn secondary small" data-h="pdf">PDF</button>
          <button class="btn secondary small danger" data-h="del">Eliminar</button>
        </div>
      </div>`).join('');
  }

  $('#histList').addEventListener('click', async (e) => {
    const act = e.target.dataset.h; if (!act) return;
    const id = e.target.closest('.hist-item').dataset.id;
    const r = await Repo.reports.get(id);
    if (act === 'open') { report = r; fillForm(); await Repo.settings.set('currentId', id); showView('form'); }
    if (act === 'pdf') await makePreview(r);
    if (act === 'del' && confirm('¿Eliminar este reporte definitivamente?')) {
      await Repo.reports.delete(id);
      if (report.id === id) await startNew(); else renderHistory();
      refreshHistoryCount();
    }
  });

  /* ---------- vista previa / PDF ---------- */
  function validate() {
    const miss = [];
    if (!report.client.name.trim()) miss.push('Cliente');
    if (!report.types.length) miss.push('Tipo de intervención');
    if (!report.technician.name.trim()) miss.push('Técnico responsable');
    if (!report.jobs.some((j) => j.description.trim())) miss.push('Descripción de trabajos');
    return miss;
  }

  async function onPreview() {
    const miss = validate();
    if (miss.length && !confirm('Faltan datos: ' + miss.join(', ') + '.\n¿Generar el PDF de todas formas?')) return;
    // asigna consecutivo al finalizar la primera vez
    if (!report.number) {
      prefs.counter += 1;
      report.number = company.prefix + String(prefs.counter).padStart(4, '0');
      await Repo.settings.set('counter', prefs.counter);
    }
    report.status = 'final';
    $('#numLabel').textContent = report.number;
    await upsertCatalogs();
    report.updatedAt = new Date().toISOString();
    await Repo.reports.put(report);
    refreshHistoryCount();
    await makePreview(report);
  }

  async function makePreview(r) {
    toast('Generando PDF…');
    try {
      currentPdf = await PDF.build(r, company);
    } catch (err) { console.error(err); toast('Error al generar el PDF'); return; }
    currentFilename = `${(r.number || 'borrador')}_${(r.client.name || 'cliente').replace(/[^\w]+/g, '_')}.pdf`;
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = URL.createObjectURL(currentPdf.output('blob'));
    $('#pvTitle').textContent = r.number || 'Vista previa';
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    $('#pvBody').innerHTML = mobile
      ? `<dl class="pv-summary">
           <dt>Reporte</dt><dd>${esc(r.number)}</dd>
           <dt>Cliente</dt><dd>${esc(r.client.name)}</dd>
           <dt>Equipo</dt><dd>${esc(r.equipment.name)}</dd>
           <dt>Archivo</dt><dd>${esc(currentFilename)} · ${currentPdf.getNumberOfPages()} pág.</dd>
         </dl><p class="muted">Pulsa <b>Abrir</b> para ver el documento completo o <b>Compartir</b> para enviarlo por WhatsApp o correo.</p>`
      : `<iframe src="${currentBlobUrl}" title="PDF"></iframe>`;
    $('#modalPreview').hidden = false;
  }

  function download() {
    const a = document.createElement('a'); a.href = currentBlobUrl; a.download = currentFilename;
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function share() {
    const file = new File([currentPdf.output('blob')], currentFilename, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: currentFilename }); } catch (_) { /* cancelado */ }
    } else { download(); toast('Compartir no disponible: se descargó el PDF'); }
  }

  /* ---------- nuevo / ajustes / respaldo ---------- */
  async function startNew() {
    report = newReport(prefs);
    await Repo.reports.put(report);
    await Repo.settings.set('currentId', report.id);
    fillForm(); window.scrollTo(0, 0); refreshHistoryCount();
  }

  function openSettings() {
    $('#setTechName').value = prefs.techName; $('#setTechPhone').value = prefs.techPhone;
    $('#setCoName').value = company.name; $('#setCoNit').value = company.nit; $('#setCoPhone').value = company.phone;
    $('#setCoAddr').value = company.address; $('#setCoMail').value = company.email;
    $('#setPrefix').value = company.prefix; $('#setCounter').value = prefs.counter;
    $('#modalSettings').hidden = false;
  }
  async function saveSettings() {
    prefs.techName = $('#setTechName').value.trim(); prefs.techPhone = $('#setTechPhone').value.trim();
    prefs.counter = Math.max(0, parseInt($('#setCounter').value, 10) || 0);
    company = { name: $('#setCoName').value, nit: $('#setCoNit').value, phone: $('#setCoPhone').value,
      address: $('#setCoAddr').value, email: $('#setCoMail').value, prefix: $('#setPrefix').value };
    await Repo.settings.set('company', company);
    await Repo.settings.set('prefs', prefs);
    if (!report.technician.name) { report.technician.name = prefs.techName; report.technician.phone = prefs.techPhone; fillForm(); }
    $('#modalSettings').hidden = true; toast('Ajustes guardados');
  }

  async function exportBackup() {
    const blob = new Blob([JSON.stringify(await Repo.exportAll())], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `respaldo-mtto-${todayISO()}.json`; a.click();
  }
  async function importBackup(e) {
    const f = e.target.files[0]; if (!f) return;
    try { await Repo.importAll(JSON.parse(await f.text())); toast('Respaldo importado'); await loadCatalogs(); refreshHistoryCount(); }
    catch { toast('Archivo no válido'); }
  }

  /* ---------- arranque ---------- */
  async function init() {
    company = { ...DEFAULT_COMPANY, ...(await Repo.settings.get('company', {})) };
    prefs = { techName: 'Brian Perez Tapiero', techPhone: '3232844356', counter: 0, ...(await Repo.settings.get('prefs', {})) };
    prefs.counter = Math.max(prefs.counter, await Repo.settings.get('counter', 0));

    pads.delivers = SignaturePad($('#sigDelivers'), (d) => { report.signatures.delivers = d; persist(); });
    pads.receives = SignaturePad($('#sigReceives'), (d) => { report.signatures.receives = d; persist(); });

    const curId = await Repo.settings.get('currentId', null);
    report = (curId && (await Repo.reports.get(curId))) || newReport(prefs);
    bindEvents();
    await loadCatalogs();
    fillForm();
    pads.delivers.size(); pads.receives.size();
    pads.delivers.set(report.signatures.delivers); pads.receives.set(report.signatures.receives);
    window.addEventListener('resize', debounce(() => { if ($('#view-form').classList.contains('active')) { pads.delivers.size(); pads.receives.size(); pads.delivers.set(report.signatures.delivers); pads.receives.set(report.signatures.receives); } }, 200));
    refreshHistoryCount();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  init();
})();
