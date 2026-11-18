const PDFDocument = require('pdfkit');

function fecha(value) {
  return value
    ? new Date(value).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })
    : 'No disponible';
}

function crearActaPdf(escrutinio) {
  return new Promise((resolve, reject) => {
    const documento = new PDFDocument({ margin: 52, size: 'A4', info: {
      Title: `Acta oficial - ${escrutinio.titulo}`,
      Subject: 'Escrutinio de elección universitaria',
      Creator: 'UNIBE Elect',
    } });
    const chunks = [];
    documento.on('data', (chunk) => chunks.push(chunk));
    documento.on('error', reject);
    documento.on('end', () => resolve(Buffer.concat(chunks)));

    documento.font('Helvetica-Bold').fontSize(18).text('ACTA OFICIAL DE ESCRUTINIO', { align: 'center' });
    documento.moveDown(0.7);
    documento.fontSize(14).text(escrutinio.titulo, { align: 'center' });
    documento.moveDown();

    documento.font('Helvetica-Bold').fontSize(11).text('Datos de la elección');
    documento.font('Helvetica').fontSize(10);
    documento.text(`Tipo: ${escrutinio.tipoEleccion || 'CANDIDATURAS'}`);
    if (escrutinio.pregunta) documento.text(`Pregunta: ${escrutinio.pregunta}`);
    documento.text(`Generado: ${fecha(escrutinio.generadoEn)}`);
    documento.text(`Publicado: ${fecha(escrutinio.publicadoEn)}`);
    documento.text(`Generado por: ${escrutinio.generadoPor || 'No disponible'}`);
    documento.text(`Verificado: ${fecha(escrutinio.verificadoEn)}`);
    if (escrutinio.verificadoPor) documento.text(`Verificado por: ${escrutinio.verificadoPor}`);
    documento.moveDown();

    documento.font('Helvetica-Bold').fontSize(11).text('Resumen');
    documento.font('Helvetica').fontSize(10);
    documento.text(`Votos emitidos: ${escrutinio.totalVotos}`);
    documento.text(`Votos en blanco: ${escrutinio.votosEnBlanco}`);
    documento.text(`Personas habilitadas: ${escrutinio.totalHabilitados}`);
    documento.text(`Participación: ${escrutinio.participacion}%`);
    if (escrutinio.empate) {
      documento.text(escrutinio.empateResuelto
        ? `Empate resuelto: ${escrutinio.motivoDesempate || 'decisión registrada'}`
        : 'Resultado empatado; no se ha registrado un desempate.');
    }
    documento.moveDown();

    documento.font('Helvetica-Bold').fontSize(11).text('Votos por candidatura');
    documento.font('Helvetica').fontSize(10);
    for (const candidatura of escrutinio.candidaturas) {
      const estado = candidatura.ganadora ? ' · Ganadora' : '';
      documento.text(
        `${candidatura.nombre}: ${candidatura.votos} votos (${candidatura.porcentaje}%)${estado}`,
      );
    }
    documento.moveDown();

    documento.font('Helvetica-Bold').fontSize(11).text('Participación por grupo');
    documento.font('Helvetica').fontSize(9);
    if (!escrutinio.participacionPorGrupo.length) {
      documento.text('No hay grupos habilitados para mostrar.');
    } else {
      for (const grupo of escrutinio.participacionPorGrupo) {
        documento.text(
          `${grupo.facultad} / ${grupo.carrera}: ${grupo.votaron} de ${grupo.habilitados}`,
        );
      }
    }
    documento.moveDown();

    documento.font('Helvetica-Bold').fontSize(11).text('Integridad y verificación');
    documento.font('Helvetica').fontSize(9);
    documento.text(`SHA-256 canónico: ${escrutinio.hashCanonico || 'No disponible'}`, {
      lineBreak: true,
    });
    documento.text(`Verificación íntegra: ${escrutinio.verificado ? 'Sí' : 'No'}`);
    if (escrutinio.desempateEn) {
      documento.text(`Desempate registrado: ${fecha(escrutinio.desempateEn)}`);
      documento.text(`Candidatura seleccionada: ${escrutinio.candidaturaDesempateId}`);
      documento.text(`Responsable: ${escrutinio.desempatePor || 'No disponible'}`);
    }
    documento.moveDown(2);
    documento.font('Helvetica').fontSize(8).fillColor('#555555')
      .text('Este documento contiene resultados agregados. No identifica la selección individual de ningún votante.');
    documento.end();
  });
}

module.exports = { crearActaPdf };
