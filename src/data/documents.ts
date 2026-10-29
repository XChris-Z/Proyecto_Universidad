// src/data/documents.ts
import type { Document, ResponseTemplate } from '@lib/types';

export const DEFAULT_RESPONSE_TEMPLATES: ResponseTemplate[] = [
  {
    id: 'tpl-formal',
    title: 'Respuesta Formal Institucional',
    category: 'Gestión Documental',
    decision: 'Favorable',
    subject: 'RE: [NUMERO_RADICADO] — [TITULO_DOCUMENTO]',
    content: `En atención a su comunicación radicada, me permito informarle que una vez analizado el expediente, esta administración resuelve de manera favorable su solicitud, en el marco de las disposiciones legales vigentes y el reglamento institucional de la Universidad Internacional del Trópico Americano — Unitrópico.`,
  },
  {
    id: 'tpl-peticion',
    title: 'Respuesta Derecho de Petición',
    category: 'Derechos de Petición',
    decision: 'En estudio',
    subject: 'Respuesta a Derecho de Petición — Radicado [NUMERO_RADICADO]',
    content: `En cumplimiento de los términos establecidos en la Ley 1755 de 2015 y demás normas concordantes, procedemos a dar respuesta a la petición presentada bajo el radicado [NUMERO_RADICADO], referente a: [TITULO_DOCUMENTO]. Esta institución se compromete a resolver de fondo dentro de los términos de ley.`,
  },
  {
    id: 'tpl-academica',
    title: 'Concepto Académico Institucional',
    category: 'Asuntos Académicos',
    decision: 'Favorable',
    subject: 'Concepto Académico — Radicado [NUMERO_RADICADO]',
    content: `La Vicerrectoría Académica de Unitrópico, previo estudio del expediente [NUMERO_RADICADO], emite el presente concepto académico, el cual es FAVORABLE, sustentado en el cumplimiento de los requisitos curriculares, la normativa académica interna vigente y las directrices del Ministerio de Educación Nacional.`,
  },
  {
    id: 'tpl-financiera',
    title: 'Respuesta Financiera y Presupuestal',
    category: 'Asuntos Financieros',
    decision: 'En revisión',
    subject: 'Respuesta Asunto Financiero — Radicado [NUMERO_RADICADO]',
    content: `La Dirección Financiera y Presupuestal de Unitrópico, en atención al requerimiento radicado bajo el número [NUMERO_RADICADO], informa que el asunto se encuentra actualmente en proceso de revisión presupuestal ante la instancia competente. Se comunicará el resultado del análisis financiero en los próximos días hábiles.`,
  },
  {
    id: 'tpl-requerimiento',
    title: 'Respuesta a Requerimiento Externo',
    category: 'Requerimientos Externos',
    decision: 'Recibido',
    subject: 'Acuse de Recibo — Requerimiento Externo [NUMERO_RADICADO]',
    content: `La Universidad Internacional del Trópico Americano — Unitrópico acusa recibo del requerimiento identificado con radicado [NUMERO_RADICADO]. El ente institucional competente procederá a analizar el documento y dará respuesta de fondo en los plazos legales y reglamentarios aplicables.`,
  },
];

// Base vacía para datos 100% reales de Supabase
export const documents: Document[] = [];
