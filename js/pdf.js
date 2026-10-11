/* Generador del PDF del reporte (jsPDF, A4 vertical). */
const PDF = (() => {
  const M = 10;                 // margen
  const W = 210 - M * 2;        // ancho útil
  const PAGE_H = 297;
  const BRAND = [11, 61, 110];
  const LIGHT = [232, 238, 245];
  const LINE = [170, 180, 192];

  const loadImg = (src) => new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });

  async function build(report, company) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    let y = M;

    const ensure = (h) => { if (y + h > PAGE_H - M - 8) { doc.addPage(); y = M; } };
    const setText = (size, bold, color = [30, 36, 48]) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    };
    const bar = (title) => {
      ensure(14);
      doc.setFillColor(...BRAND); doc.rect(M, y, W, 6.5, 'F');
      setText(10, true, [255, 255, 255]); doc.text(title, M + 2, y + 4.6);
      y += 6.5;
    };
    const paragraph = (text, minH = 12) => {
      const lines = doc.splitTextToSize(text || '', W - 4);
      const lh = 4.6;
      let i = 0;
      do {
        const room = Math.max(1, Math.floor((PAGE_H - M - 8 - y - 3) / lh));
        const chunk = lines.slice(i, i + room);
        const h = Math.max(minH, chunk.length * lh + 3);
        ensure(Math.min(h, 30));
        doc.setDrawColor(...LINE); doc.rect(M, y, W, h);
        setText(10, false); doc.text(chunk, M + 2, y + 5);
        y += h; i += room;
        if (i < lines.length) { doc.addPage(); y = M; }
      } while (i < lines.length);
    };
    // celda etiqueta: valor
    const field = (label, value, x, w, h = 8) => {
      doc.setDrawColor(...LINE); doc.rect(x, y, w, h);
      setText(6.5, true, [95, 108, 125]); doc.text(label.toUpperCase(), x + 1.5, y + 3);
      setText(9.5, false);
      const t = doc.splitTextToSize(String(value || ''), w - 3)[0] || '';
      doc.text(t, x + 1.5, y + 6.6);
    };
    const row = (cells, h = 8) => {
      ensure(h);
      let total = cells.reduce((a, c) => a + (c[2] || 1), 0), x = M;
      for (const [label, value, weight] of cells) {
        const w = W * ((weight || 1) / total);
        field(label, value, x, w, h); x += w;
      }
      y += h;
    };

    /* ---------- Encabezado ---------- */
    const logo = await loadImg('logo.png');
    doc.setDrawColor(...LINE); doc.rect(M, y, W, 28);
    if (logo) { const lh = 18, lw = lh * (logo.width / logo.height); doc.addImage(logo, 'PNG', M + 3, y + 3, lw, lh); }
    setText(11, true, BRAND); doc.text(company.name, M + 52, y + 7);
    setText(8.5, false);
    doc.text(`NIT: ${company.nit}`, M + 52, y + 12);
    doc.text(company.address, M + 52, y + 16);
    doc.text(`Tel. ${company.phone}`, M + 52, y + 20);
    doc.text(company.email, M + 52, y + 24.5);
    // caja derecha
    const bx = M + W - 66;
    doc.line(bx, y, bx, y + 28);
    setText(11, true, BRAND); doc.text('REPORTE DE MANTENIMIENTO', bx + 33, y + 6.5, { align: 'center' });
    setText(9, false);
    doc.text(`N° de reporte: ${report.number || '(borrador)'}`, bx + 3, y + 14);
    doc.text(`Fecha de emisión: ${report.issuedAt}`, bx + 3, y + 20);
    y += 28 + 3;

    /* ---------- Cliente ---------- */
    const c = report.client;
    row([['NIT / CC', c.nit, 1], ['Cliente', c.name, 2], ['Ciudad', c.city, 1]]);
    row([['Teléfono', c.phone, 1], ['Contacto', c.contact, 1.4], ['Correo', c.email, 1.6]]);
    row([['Dirección', c.address, 1]]);
    row([['Equipo / máquina', report.equipment.name, 1]]);
    y += 2;

    /* ---------- Tipo de intervención ---------- */
    bar('TIPO DE INTERVENCIÓN');
    ensure(16);
    doc.setDrawColor(...LINE); doc.rect(M, y, W, 14);
    INTERVENTION_TYPES.forEach((t, i) => {
      const cx = M + 4 + (i % 3) * (W / 3), cy = y + 4.5 + Math.floor(i / 3) * 6;
      doc.rect(cx, cy - 3, 3.6, 3.6);
      if (report.types.includes(t.id)) {
        setText(10, true, BRAND); doc.text('X', cx + 0.5, cy - 0.1);
      }
      setText(9, false); doc.text(t.label, cx + 6, cy);
    });
    y += 14;
    row([['Técnico responsable', report.technician.name, 2], ['Tel.', report.technician.phone, 1]]);
    y += 2;

    /* ---------- Datos del equipo ---------- */
    bar('DATOS GENERALES DEL EQUIPO');
    const e = report.equipment;
    row([['Tipo', e.type, 1], ['Marca', e.brand, 1]]);
    row([['Modelo', e.model, 1], ['Código', e.code, 1]]);
    row([['Serie', e.serial, 1], ['Ubicación', e.location, 1]]);
    y += 2;

    /* ---------- Diagnóstico ---------- */
    bar('DIAGNÓSTICO');
    paragraph(report.diagnosis, 20);
    y += 2;

    /* ---------- Trabajos ---------- */
    for (let j = 0; j < report.jobs.length; j++) {
      const job = report.jobs[j];
      if (!job.description && !job.before.length && !job.after.length) continue;
      ensure(40);
      bar(report.jobs.length > 1 ? `DESCRIPCIÓN DE LOS TRABAJOS EFECTUADOS (${j + 1})` : 'DESCRIPCIÓN DE LOS TRABAJOS EFECTUADOS');
      paragraph(job.description, 16);

      const n = Math.max(job.before.length, job.after.length);
      if (n) {
        // encabezado ANTES / DESPUÉS
        const half = W / 2;
        for (let i = 0; i < n; i++) {
          const [bi, ai] = await Promise.all([
            job.before[i] ? loadImg(job.before[i]) : null,
            job.after[i] ? loadImg(job.after[i]) : null,
          ]);
          const maxH = 62, boxW = half - 2;
          const dim = (img) => {
            if (!img) return [0, 0];
            const r = img.width / img.height;
            let w = boxW - 2, h = w / r;
            if (h > maxH) { h = maxH; w = h * r; }
            return [w, h];
          };
          const [bw, bh] = dim(bi), [aw, ah] = dim(ai);
          const rowH = Math.max(bh, ah, 20) + 4;
          ensure(rowH + 6);
          if (i === 0 || y === M) {
            doc.setFillColor(...LIGHT); doc.rect(M, y, W, 5, 'F');
            setText(8.5, true, BRAND);
            doc.text('ANTES', M + half / 2, y + 3.6, { align: 'center' });
            doc.text('DESPUÉS', M + half + half / 2, y + 3.6, { align: 'center' });
            y += 5;
          }
          doc.setDrawColor(...LINE); doc.rect(M, y, half, rowH); doc.rect(M + half, y, half, rowH);
          if (bi) doc.addImage(job.before[i], 'JPEG', M + 1 + (boxW - bw) / 2, y + 2, bw, bh);
          if (ai) doc.addImage(job.after[i], 'JPEG', M + half + 1 + (boxW - aw) / 2, y + 2, aw, ah);
          y += rowH;
        }
      }
      y += 3;
    }

    /* ---------- Observaciones ---------- */
    bar('OBSERVACIONES');
    paragraph(report.observations, 18);
    y += 4;

    /* ---------- Firmas ---------- */
    ensure(48);
    const half = W / 2;
    doc.setDrawColor(...LINE); doc.rect(M, y, half, 34); doc.rect(M + half, y, half, 34);
    const sig = async (data, x) => {
      if (!data) return;
      const im = await loadImg(data); if (!im) return;
      const r = im.width / im.height; let h = 22, w = h * r;
      if (w > half - 8) { w = half - 8; h = w / r; }
      doc.addImage(data, 'PNG', x + (half - w) / 2, y + 2 + (22 - h), w, h);
    };
    await sig(report.signatures.delivers, M);
    await sig(report.signatures.receives, M + half);
    setText(9, true); doc.text('QUIEN ENTREGA', M + half / 2, y + 28, { align: 'center' });
    doc.text('QUIEN RECIBE', M + half + half / 2, y + 28, { align: 'center' });
    y += 34;
    doc.rect(M, y, half, 12); doc.rect(M + half, y, half, 12);
    setText(9, false);
    doc.text(report.technician.name || '', M + half / 2, y + 5, { align: 'center' });
    doc.text('TÉCNICO', M + half / 2, y + 9.5, { align: 'center' });
    doc.text(report.receiver.name || '', M + half + half / 2, y + 5, { align: 'center' });
    doc.text(report.receiver.role || '', M + half + half / 2, y + 9.5, { align: 'center' });

    // pie con paginación
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p); setText(7.5, false, [120, 130, 145]);
      doc.text(`${report.number || 'Borrador'} · Página ${p} de ${pages}`, 105, PAGE_H - 6, { align: 'center' });
    }
    return doc;
  }

  return { build };
})();
