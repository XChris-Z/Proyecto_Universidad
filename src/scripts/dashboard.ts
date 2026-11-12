// src/scripts/dashboard.ts
// Lógica de cliente del Dashboard: Agenda agrupada 1 tarjeta Bento por expediente (sin duplicados)

import { getUnifiedCalendarEvents } from '@lib/calendar';
import type { CalendarioEvent } from '@lib/types';

interface GroupedAgendaCard {
  key: string;
  radicado: string | null;
  titulo: string;
  link: string;
  completada: boolean;
  limiteOficinas: { fecha: string; dias: number; urgencia: string } | null;
  cierreGeneral: { fecha: string; dias: number; urgencia: string } | null;
  urgenciaOrden: number;
  fallbackTipo?: string;
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanExpedienteTitle(rawTitle: string, radicado: string | null): string {
  let clean = String(rawTitle || '').trim();
  clean = clean
    .replace(/^(Completado|Vence Radicado|Límite Dependencias)\s+/i, '')
    .trim();
  if (radicado) {
    const escapedRad = radicado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(`^${escapedRad}\\s*:?\\s*`, 'i'), '').trim();
  }
  return clean || rawTitle;
}

function formatPillStyle(urgencia: string, dias: number): string {
  if (urgencia === 'completed') {
    return 'background: #F2F7F6; color: #00594E; border: 1px solid #B2CFCB;';
  }
  if (urgencia === 'danger' || dias < 0) {
    return 'background: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA;';
  }
  if (urgencia === 'warning' || dias <= 3) {
    return 'background: #F7F5EE; color: #786832; border: 1px solid #DBD2B0;';
  }
  return 'background: #F2F7F6; color: #00594E; border: 1px solid #B2CFCB;';
}

function formatDaysTag(dias: number): string {
  if (dias < 0) return `Vencido (${Math.abs(dias)}d)`;
  if (dias === 0) return 'Hoy';
  return `${dias}d`;
}

function groupEventsByExpediente(events: CalendarioEvent[]): GroupedAgendaCard[] {
  const map = new Map<string, GroupedAgendaCard>();

  for (const ev of events) {
    const radMatch = `${ev.titulo || ''} ${ev.link || ''}`.match(/RAD-\d{4}-\d+/i);
    const radicado = radMatch ? radMatch[0].toUpperCase() : null;
    const basePetId = String(ev.id || '').startsWith('pet-dep-')
      ? String(ev.id).replace(/^pet-dep-/, 'pet-')
      : String(ev.id || '');
    const key = radicado || basePetId;

    const isDepEvent = String(ev.id || '').startsWith('pet-dep-') ||
      /límite dependencias/i.test(String(ev.titulo || ''));
    const isCompleted = Boolean(ev.completada || ev.urgencia === 'completed');

    let card = map.get(key);
    if (!card) {
      card = {
        key,
        radicado,
        titulo: cleanExpedienteTitle(ev.titulo, radicado),
        link: radicado ? `/archivos?radicado=${encodeURIComponent(radicado)}` : (ev.link || '/calendario'),
        completada: isCompleted,
        limiteOficinas: null,
        cierreGeneral: null,
        urgenciaOrden: isCompleted ? 9999 : ev.diasRestantes,
        fallbackTipo: radicado ? undefined : ev.tipo,
      };
      map.set(key, card);
    }

    if (isCompleted) {
      card.completada = true;
    }

    if (isDepEvent) {
      card.limiteOficinas = {
        fecha: ev.fecha,
        dias: ev.diasRestantes,
        urgencia: ev.urgencia,
      };
    } else {
      card.cierreGeneral = {
        fecha: ev.fecha,
        dias: ev.diasRestantes,
        urgencia: ev.urgencia,
      };
      // Preferir el título del evento principal cuando exista
      const cleaned = cleanExpedienteTitle(ev.titulo, radicado);
      if (cleaned) card.titulo = cleaned;
    }

    if (!isCompleted && ev.diasRestantes < card.urgenciaOrden) {
      card.urgenciaOrden = ev.diasRestantes;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.urgenciaOrden - b.urgenciaOrden);
}

export async function initDashboard() {
  const calRecentList = document.getElementById('dashboard-calendar-recent-list');
  if (!calRecentList) return;

  calRecentList.innerHTML = `
    <div style="text-align: center; padding: 20px; color: #64748B; font-size: 0.8rem;">
      <span class="spinner" style="display: inline-block; width: 14px; height: 14px; border: 2px solid #DCE4E3; border-top-color: #00594E; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 6px; vertical-align: middle;"></span>
      Sincronizando vencimientos de expedientes...
    </div>
  `;

  try {
    const today = new Date();
    const timeMin = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    const timeMax = new Date(today.getFullYear(), today.getMonth() + 3, 0).toISOString();

    const { events } = await getUnifiedCalendarEvents(timeMin, timeMax);
    const grouped = groupEventsByExpediente(events).slice(0, 6);

    calRecentList.innerHTML = '';

    if (grouped.length === 0) {
      calRecentList.innerHTML = `
        <div style="text-align: center; padding: 26px 16px; color: #64748B; font-size: 0.82rem;">
          <p style="margin: 0 0 6px 0; font-weight: 700; color: #111827;">Sin compromisos inmediatos</p>
          <span style="font-size: 0.78rem;">No hay vencimientos o eventos pendientes en la agenda próxima.</span>
        </div>
      `;
      return;
    }

    grouped.forEach((card) => {
      const item = document.createElement('div');
      item.className = 'dash-agenda-bento-card';

      const pillsHtml: string[] = [];
      if (card.completada) {
        const fechaDone = card.cierreGeneral?.fecha || card.limiteOficinas?.fecha || '';
        pillsHtml.push(`
          <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.73rem; font-weight: 750; padding: 4px 10px; border-radius: 999px; background: #F2F7F6; color: #00594E; border: 1px solid #B2CFCB;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #00594E;"></span>
            Expediente Completo${fechaDone ? ` · ${escapeHtml(fechaDone)}` : ''}
          </span>
        `);
      } else {
        if (card.limiteOficinas) {
          pillsHtml.push(`
            <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.72rem; font-weight: 750; padding: 4px 10px; border-radius: 999px; ${formatPillStyle(card.limiteOficinas.urgencia, card.limiteOficinas.dias)}">
              <span>Límite Oficinas: ${escapeHtml(card.limiteOficinas.fecha)} (${formatDaysTag(card.limiteOficinas.dias)})</span>
            </span>
          `);
        }
        if (card.cierreGeneral) {
          pillsHtml.push(`
            <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.72rem; font-weight: 750; padding: 4px 10px; border-radius: 999px; ${formatPillStyle(card.cierreGeneral.urgencia, card.cierreGeneral.dias)}">
              <span>Cierre General: ${escapeHtml(card.cierreGeneral.fecha)} (${formatDaysTag(card.cierreGeneral.dias)})</span>
            </span>
          `);
        }
      }

      const isExternal = card.link.startsWith('http');
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 240px;">
          <div style="width: 40px; height: 40px; border-radius: 10px; background: #F2F7F6; border: 1.5px solid #B2CFCB; color: #00594E; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            ${
              card.radicado
                ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
                : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
            }
          </div>
          <div style="min-width: 0; flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 3px;">
              ${
                card.radicado
                  ? `<span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.72rem; font-weight: 800; color: #00594E; background: #F2F7F6; border: 1px solid #B2CFCB; padding: 1px 8px; border-radius: 6px;">${escapeHtml(card.radicado)}</span>`
                  : `<span style="font-size: 0.70rem; font-weight: 800; color: #786832; background: #F7F5EE; border: 1px solid #DBD2B0; padding: 1px 8px; border-radius: 6px; text-transform: uppercase;">${escapeHtml(card.fallbackTipo || 'Agenda')}</span>`
              }
              <span style="font-weight: 800; font-size: 0.88rem; color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 460px;" title="${escapeHtml(card.titulo)}">
                ${escapeHtml(card.titulo)}
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px;">
              ${pillsHtml.join('')}
            </div>
          </div>
        </div>
        <a
          href="${escapeHtml(card.link)}"
          ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ''}
          style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 9px; background: #00594E; color: #FFFFFF; font-size: 0.77rem; font-weight: 750; text-decoration: none; white-space: nowrap; flex-shrink: 0; transition: background 0.16s ease;"
        >
          <span>Abrir</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
      `;
      calRecentList.appendChild(item);
    });
  } catch (err) {
    console.warn('Error cargando agenda en dashboard:', err);
    calRecentList.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #64748B; font-size: 0.8rem;">
        No se pudo sincronizar la agenda institucional.
      </div>
    `;
  }
}
