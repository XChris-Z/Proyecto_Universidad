// src/pages/api/audit/exportar-excel.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { buildXlsxWorkbookBuffer, type XlsxCell } from '@lib/xlsx-builder';
import {
  cleanAuditActionTitle,
  formatBogotaTimestamp,
  normalizeAuditActor,
  sanitizeAuditDisplayIp,
} from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';

function resolveExportActorName(rawName?: string | null): string {
  const cleaned = normalizeAuditActor({ name: rawName }).name.trim();
  if (
    !cleaned ||
    /^(admin|admin general|administrador general|administrador del sistema|administrador documental|sistema sgd)$/i.test(
      cleaned
    )
  ) {
    return 'ING. Christian Lemus';
  }
  return cleaned;
}

export const GET: APIRoute = async ({ url, cookies }) => {
  try {
    const actor = await resolveSessionActor(cookies);
    const filterAction = (url.searchParams.get('action') || 'ALL').trim().toUpperCase();
    const filterSeverity = (url.searchParams.get('severity') || 'ALL').trim().toUpperCase();
    const filterQuery = (url.searchParams.get('q') || '').trim().toLowerCase();

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('raw_timestamp', { ascending: false })
      .limit(1000);

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const visibleRows = ((data as any[]) || []).filter(
      (d) => d && d.entity !== 'rbac_state_snapshot'
    );

    const mapped = visibleRows.map((d: any) => {
      const normalizedActor = normalizeAuditActor({
        id: d.actor_id || 'usr-root',
        name: d.actor_name,
        role: d.actor_role,
      });
      const displayActor = resolveExportActorName(normalizedActor.name);
      const actionTitle = cleanAuditActionTitle(d.action);
      const ipDisplay = sanitizeAuditDisplayIp(d.ip);
      const fechaBogota = formatBogotaTimestamp(d.raw_timestamp || d.timestamp);
      const moduleRef = [d.entity || 'Sistema SGD', d.entity_id || '']
        .filter(Boolean)
        .join(' • ');

      return {
        raw: d,
        fechaBogota,
        displayActor,
        roleLabel: normalizedActor.role,
        ipDisplay,
        actionTitle,
        actionType: String(d.action_type || 'CONSULTA').toUpperCase(),
        moduleRef,
        details: String(d.details || '').replace(/\[RESPUESTA_META\]:\s*\{[\s\S]*?\}/gi, '').trim(),
        severity: String(d.severity || 'INFO').toUpperCase(),
        hash: String(d.hash || 'SHA256-SIN-REGISTRO'),
      };
    });

    const filtered = mapped.filter((row) => {
      const matchAction = filterAction === 'ALL' || row.actionType === filterAction;
      const matchSeverity = filterSeverity === 'ALL' || row.severity === filterSeverity;
      const haystack = `${row.displayActor} ${row.roleLabel} ${row.actionTitle} ${row.moduleRef} ${row.details} ${row.ipDisplay} ${row.hash}`.toLowerCase();
      const matchQuery = !filterQuery || haystack.includes(filterQuery);
      return matchAction && matchSeverity && matchQuery;
    });

    const todayBogota = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const nowBogota = formatBogotaTimestamp(new Date());

    const totalFiltered = filtered.length;
    const totalCritical = filtered.filter((r) => r.severity === 'CRITICAL').length;
    const totalWarn = filtered.filter((r) => r.severity === 'WARN').length;
    const totalInfo = filtered.filter((r) => r.severity === 'INFO').length;

    const auditRows: XlsxCell[][] = [
      [
        {
          value: 'BITÁCORA OFICIAL DE AUDITORÍA Y TRAZABILIDAD — UNITRÓPICO',
          style: 1,
        },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
        { value: '', style: 1 },
      ],
      [
        {
          value: `Generado: ${nowBogota} (America/Bogota) | Exportado por: ${actor.name} (${actor.role}) | Registros: ${totalFiltered}`,
          style: 3,
        },
        { value: '', style: 3 },
        { value: '', style: 3 },
        { value: '', style: 3 },
        { value: '', style: 3 },
        { value: '', style: 3 },
        { value: '', style: 3 },
        { value: '', style: 3 },
      ],
      [
        { value: 'Fecha y Hora (Bogotá)', style: 2 },
        { value: 'Funcionario / Actor', style: 2 },
        { value: 'Rol Institucional', style: 2 },
        { value: 'IP Origen', style: 2 },
        { value: 'Acción Realizada', style: 2 },
        { value: 'Módulo / Radicado', style: 2 },
        { value: 'Detalle Forense', style: 2 },
        { value: 'Integridad SHA-256', style: 2 },
      ],
    ];

    if (filtered.length === 0) {
      auditRows.push([
        { value: 'Sin registros para los filtros aplicados', style: 5 },
        { value: '-', style: 5 },
        { value: '-', style: 5 },
        { value: '-', style: 5 },
        { value: '-', style: 5 },
        { value: '-', style: 5 },
        { value: '-', style: 5 },
        { value: '-', style: 5 },
      ]);
    } else {
      filtered.forEach((item, idx) => {
        const st = idx % 2 === 1 ? 4 : 5;
        auditRows.push([
          { value: item.fechaBogota, style: st },
          { value: item.displayActor, style: st },
          { value: item.roleLabel, style: st },
          { value: item.ipDisplay, style: st },
          { value: `[${item.severity}] ${item.actionTitle}`, style: st },
          { value: item.moduleRef, style: st },
          { value: item.details, style: st },
          { value: item.hash, style: st },
        ]);
      });
    }

    const summaryRows: XlsxCell[][] = [
      [
        { value: 'RESUMEN DE CONTROL E INTEGRIDAD — AUDITORÍA SGD', style: 1 },
        { value: '', style: 1 },
      ],
      [
        { value: 'Indicador', style: 2 },
        { value: 'Valor Certificado', style: 2 },
      ],
      [
        { value: 'Total Eventos Exportados', style: 5 },
        { value: totalFiltered, style: 6 },
      ],
      [
        { value: 'Eventos Informativos (INFO)', style: 4 },
        { value: totalInfo, style: 4 },
      ],
      [
        { value: 'Alertas y Advertencias (WARN)', style: 5 },
        { value: totalWarn, style: 5 },
      ],
      [
        { value: 'Eventos Críticos / Bajas (CRITICAL)', style: 4 },
        { value: totalCritical, style: 4 },
      ],
      [
        { value: 'Filtro Acción Aplicado', style: 5 },
        { value: filterAction, style: 5 },
      ],
      [
        { value: 'Filtro Criticidad Aplicado', style: 4 },
        { value: filterSeverity, style: 4 },
      ],
      [
        { value: 'Búsqueda Aplicada', style: 5 },
        { value: filterQuery || 'Ninguna', style: 5 },
      ],
      [
        { value: 'Funcionario que Exporta', style: 4 },
        { value: `${actor.name} (${actor.role})`, style: 6 },
      ],
      [
        { value: 'Fecha de Corte (America/Bogota)', style: 5 },
        { value: nowBogota, style: 5 },
      ],
    ];

    const buffer = buildXlsxWorkbookBuffer([
      {
        name: 'Bitacora Auditoria',
        colWidths: [24, 26, 22, 24, 34, 28, 52, 42],
        rows: auditRows,
      },
      {
        name: 'Resumen Integridad',
        colWidths: [36, 40],
        rows: summaryRows,
      },
    ]);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Auditoria_SGD_Unitropico_${todayBogota}.xlsx"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (err: any) {
    console.error('[ERROR /api/audit/exportar-excel]:', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Error exportando bitácora Excel' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

