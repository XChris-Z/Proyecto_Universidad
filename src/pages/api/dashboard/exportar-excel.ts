// src/pages/api/dashboard/exportar-excel.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { getDashboardSnapshotData, formatBogotaDateTime } from '@lib/dashboard-data';
import {
  buildXlsxWorkbookBuffer,
  type XlsxCell,
  type XlsxSheetSpec,
  type XlsxStyleId,
} from '@lib/xlsx-builder';

export const GET: APIRoute = async () => {
  try {
    const snap = await getDashboardSnapshotData();

    // Hoja 1: Resumen Ejecutivo
    const sheet1: XlsxSheetSpec = {
      name: 'Resumen Ejecutivo',
      colWidths: [38, 22, 48],
      rows: [
        [
          { value: 'INFORME EJECUTIVO DE TRAZABILIDAD DE PETICIONES Y EXPEDIENTES', style: 1 },
          { value: `Generado: ${snap.generatedAtBogota}`, style: 1 },
          { value: 'SGD Unitrópico · Secretaría General', style: 1 },
        ],
        [
          { value: 'Indicador Clave de Gestión', style: 2 },
          { value: 'Valor Actual', style: 2 },
          { value: 'Detalle Operativo / Referencia', style: 2 },
        ],
        [
          { value: 'Total Peticiones Radicadas', style: 4 },
          { value: snap.totalPeticiones, style: 6 },
          { value: `${snap.totalRespondidas} cerradas / ${snap.totalPendientes} pendientes`, style: 4 },
        ],
        [
          { value: 'Peticiones Pendientes', style: 5 },
          { value: snap.totalPendientes, style: 6 },
          { value: `Óptimo: ${snap.slaSafe} | Alerta: ${snap.slaWarn} | Crítico: ${snap.slaDanger}`, style: 5 },
        ],
        [
          { value: 'Eficiencia de Peticiones (%)', style: 4 },
          { value: `${snap.responseRate}%`, style: 6 },
          { value: 'Porcentaje de expedientes marcados como completos o respondidos', style: 4 },
        ],
        [
          { value: 'Oficios Emitidos a Dependencias', style: 5 },
          { value: snap.oficiosEmitidos, style: 6 },
          { value: `${snap.oficiosEntregados} entregados / ${snap.oficiosPendientes} pendientes`, style: 5 },
        ],
        [
          { value: 'Cuerpos Colegiados (Actos Vigentes)', style: 4 },
          { value: snap.totalNormas, style: 6 },
          {
            value: `Acuerdos: ${snap.acuerdosCount} | Resoluciones: ${snap.resolucionesCount} | Actas: ${snap.actasCount}`,
            style: 4,
          },
        ],
        [
          { value: 'Convenios y Cooperación', style: 5 },
          { value: snap.totalConvenios, style: 6 },
          { value: 'Relacionamiento institucional nacional e internacional', style: 5 },
        ],
        [
          { value: 'Asuntos Jurídicos', style: 4 },
          { value: snap.totalJuridicos, style: 6 },
          { value: 'Procesos y conceptos registrados en Oficina Jurídica', style: 4 },
        ],
        [
          { value: 'Juzgamiento Disciplinario', style: 5 },
          { value: snap.totalJuzgamiento, style: 6 },
          { value: 'Procesos disciplinarios bajo seguimiento institucional', style: 5 },
        ],
        [
          { value: 'Planeación y CSU', style: 4 },
          { value: snap.totalPlaneacion, style: 6 },
          { value: 'Informes de gestión y seguimiento del Consejo Superior Universitario', style: 4 },
        ],
        [
          { value: 'Programas Académicos', style: 5 },
          { value: snap.totalProgramas, style: 6 },
          { value: 'Registros calificados y acreditaciones activas', style: 5 },
        ],
      ],
    };

    // Hoja 2: Detalle Peticiones
    const todayYmd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const sheet2Rows: XlsxCell[][] = [
      [
        { value: 'TRAZABILIDAD DE PETICIONES Y CARPETAS DE EXPEDIENTES', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: `Corte: ${snap.generatedAtBogota}`, style: 1 },
      ],
      [
        { value: 'Radicado', style: 2 },
        { value: 'Asunto', style: 2 },
        { value: 'Solicitante', style: 2 },
        { value: 'Prioridad', style: 2 },
        { value: 'Estado', style: 2 },
        { value: '% Avance Aportes', style: 2 },
        { value: 'Fecha Radicación', style: 2 },
        { value: 'Plazo Oficinas Responsables', style: 2 },
        { value: 'Cierre General', style: 2 },
      ],
    ];

    snap.peticiones.forEach((p: any, idx: number) => {
      const st: XlsxStyleId = idx % 2 === 0 ? 4 : 5;
      const resps: any[] = Array.isArray(p.peticion_responsables) ? p.peticion_responsables : [];
      const totalDeps = resps.length;
      const deliveredDeps = resps.filter((r: any) => {
        const obs = String(r?.observaciones_entrega || '').toUpperCase();
        const isRej = obs.includes('[RECHAZADO]') || obs.includes('DEVUELTO');
        const isAppr = obs.includes('[APROBADO]') || obs.includes('ESTADO:APROBADO');
        const est = String(r?.estado_entrega || '').toLowerCase();
        return !isRej && (est === 'entregado' || est === 'aprobado' || isAppr);
      }).length;
      const avanceLabel = p.respondida
        ? '100%'
        : totalDeps > 0
          ? `${Math.round((deliveredDeps / totalDeps) * 100)}% (${deliveredDeps}/${totalDeps})`
          : 'Sin dependencias';

      let estadoLabel = 'En Trámite (Al Día)';
      if (p.respondida) {
        estadoLabel = 'Expediente Completo';
      } else if (p.fecha_limite_entrega) {
        const limitYmd = String(p.fecha_limite_entrega).slice(0, 10);
        const daysRem = Math.round((Date.parse(`${limitYmd}T00:00:00Z`) - Date.parse(`${todayYmd}T00:00:00Z`)) / 86_400_000);
        if (!Number.isNaN(daysRem)) {
          if (daysRem < 0) estadoLabel = 'Vencido';
          else if (daysRem <= 3) estadoLabel = 'Próximo a Vencer';
        }
      }

      sheet2Rows.push([
        { value: p.numero_radicado || String(p.id).slice(0, 8), style: st },
        { value: p.asunto || '', style: st },
        { value: p.solicitante_nombre || '', style: st },
        { value: p.prioridad || 'Media', style: st },
        { value: estadoLabel, style: p.respondida ? 6 : st },
        { value: avanceLabel, style: st },
        { value: String(p.fecha_radicacion || p.created_at || '').slice(0, 10) || '--', style: st },
        { value: String(p.fecha_limite_responsable || '--').slice(0, 10), style: st },
        { value: String(p.fecha_limite_entrega || '--').slice(0, 10), style: st },
      ]);
    });

    const sheet2: XlsxSheetSpec = {
      name: 'Detalle Peticiones',
      colWidths: [18, 42, 26, 12, 24, 20, 16, 26, 16],
      rows: sheet2Rows,
    };

    // Hoja 3: Rendimiento por Dependencias
    const sheet3Rows: XlsxCell[][] = [
      [
        { value: 'RENDIMIENTO Y CUMPLIMIENTO POR DEPENDENCIA', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
      ],
      [
        { value: 'Código', style: 2 },
        { value: 'Dependencia / Oficina', style: 2 },
        { value: 'Asignaciones', style: 2 },
        { value: 'Entregadas', style: 2 },
        { value: 'Pendientes', style: 2 },
        { value: 'Eficacia (%)', style: 2 },
      ],
    ];

    if (snap.rendimientoDependencias.length === 0) {
      sheet3Rows.push([
        { value: '--', style: 5 },
        { value: 'Sin asignaciones registradas a la fecha', style: 5 },
        { value: 0, style: 5 },
        { value: 0, style: 5 },
        { value: 0, style: 5 },
        { value: '0%', style: 5 },
      ]);
    } else {
      snap.rendimientoDependencias.forEach((d, idx) => {
        const st: XlsxStyleId = idx % 2 === 0 ? 4 : 5;
        sheet3Rows.push([
          { value: d.codigo, style: st },
          { value: d.nombre, style: st },
          { value: d.asignacionesTotales, style: st },
          { value: d.entregadas, style: st },
          { value: d.pendientes, style: st },
          { value: `${d.eficaciaPct}%`, style: 6 },
        ]);
      });
    }

    const sheet3: XlsxSheetSpec = {
      name: 'Rendimiento Dependencias',
      colWidths: [14, 42, 16, 16, 16, 16],
      rows: sheet3Rows,
    };

    // Hoja 4: Cuerpos Colegiados y Auditoría Reciente
    const sheet4Rows: any[][] = [
      [
        { value: 'CUERPOS COLEGIADOS Y AUDITORÍA RECIENTE', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
      ],
      [
        { value: 'Tipo / Acción', style: 2 },
        { value: 'Número / Referencia', style: 2 },
        { value: 'Órgano / Actor', style: 2 },
        { value: 'Fecha / Hora (Bogotá)', style: 2 },
        { value: 'Título / Detalle Institucional', style: 2 },
      ],
    ];

    snap.normas.slice(0, 40).forEach((n: any, idx: number) => {
      const st = idx % 2 === 0 ? 4 : 5;
      sheet4Rows.push([
        { value: n.tipo || 'Norma', style: st },
        { value: n.numero || '--', style: st },
        { value: n.organo || 'Cuerpo Colegiado', style: st },
        { value: String(n.fecha || '').slice(0, 10) || '--', style: st },
        { value: n.titulo || '', style: st },
      ]);
    });

    sheet4Rows.push([
      { value: 'BITÁCORA RECIENTE DE AUDITORÍA', style: 3 },
      { value: '', style: 3 },
      { value: '', style: 3 },
      { value: '', style: 3 },
      { value: '', style: 3 },
    ]);

    snap.auditLogsRecientes.slice(0, 40).forEach((log: any, idx: number) => {
      const st = idx % 2 === 0 ? 4 : 5;
      const rawName = String(log.actor_name || '').trim();
      const actorDisplay =
        !rawName ||
        /^(admin|admin general|administrador general|administrador del sistema|sistema sgd)$/i.test(rawName)
          ? 'ING. Christian Lemus'
          : rawName;
      sheet4Rows.push([
        { value: log.action_type || 'EVENTO', style: st },
        { value: log.entity_id || log.entity || '--', style: st },
        { value: actorDisplay, style: st },
        { value: formatBogotaDateTime(log.raw_timestamp || log.created_at), style: st },
        { value: log.details || log.action || '', style: st },
      ]);
    });

    const sheet4: XlsxSheetSpec = {
      name: 'Colegiados y Auditoria',
      colWidths: [20, 20, 26, 22, 50],
      rows: sheet4Rows,
    };

    const buffer = buildXlsxWorkbookBuffer([sheet1, sheet2, sheet3, sheet4]);
    const todayIso = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Informe_Ejecutivo_SGD_Unitropico_${todayIso}.xlsx"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (err: any) {
    console.error('Error generando Informe Ejecutivo Excel:', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Error interno exportando informe Excel.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

