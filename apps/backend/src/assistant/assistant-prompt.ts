import { SettlementStatus } from '@prisma/client';
import type { ModelTool } from './model/assistant-model.js';

export const SEARCH_SETTLEMENTS = 'search_settlements';
export const FIND_UNLISTED_PERIODS = 'find_unlisted_periods';
export const PROPOSE_STATUS_CHANGE = 'propose_status_change';

// Kept identical on every call, in this order, so the provider can cache it.
export const ASSISTANT_TOOLS: ModelTool[] = [
  {
    name: SEARCH_SETTLEMENTS,
    description:
      'Busca liquidaciones vivas del municipio activo por código catastral o por número (id) de liquidación, exactamente uno de los dos. Devuelve id, código catastral, periodo, estado, estados a los que puede pasar (allowedStatuses) y si tiene mandamiento. Nunca devuelve nombres, documentos ni direcciones.',
    inputSchema: {
      type: 'object',
      properties: {
        cadastralCode: {
          type: 'string',
          description: 'Código catastral completo del predio.',
        },
        settlementId: {
          type: 'integer',
          description: 'Número (id) de la liquidación.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: FIND_UNLISTED_PERIODS,
    description:
      'Usa el Excel de mandamientos que el administrador cargó en esta conversación y devuelve, de cada predio que aparece en él, las liquidaciones vivas cuyo periodo no está en el Excel. No recibe argumentos: el panel le pasa las filas del archivo. Si no hay un Excel cargado, responde con un error.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: PROPOSE_STATUS_CHANGE,
    description:
      'Prepara una propuesta de cambio de estado para una o varias liquidaciones (máximo 100). NO aplica nada: el administrador la revisa y la aplica en el panel. Devuelve los cambios aceptados y los rechazados, con la razón, el estado actual, los estados permitidos y, si tiene, su mandamiento.',
    inputSchema: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            properties: {
              settlementId: { type: 'integer' },
              toStatus: {
                type: 'string',
                enum: Object.values(SettlementStatus),
              },
            },
            required: ['settlementId', 'toStatus'],
            additionalProperties: false,
          },
        },
        note: {
          type: 'string',
          maxLength: 500,
          description:
            'Nota que el administrador dictó para el cambio. Solo si la dictó.',
        },
      },
      required: ['changes'],
      additionalProperties: false,
    },
  },
];

// Texts follow section 6 of the Confluence page "Diseño de Slompsim".
export const ASSISTANT_SYSTEM_PROMPT = `Eres Slompsim, el asistente del Panel Administrador de SLOMP. Ayudas al abogado administrador del municipio activo a consultar liquidaciones del impuesto predial y a preparar cambios de estado.

Cómo trabajas:
- Nunca cambias nada tú mismo. propose_status_change solo prepara la propuesta; el administrador la revisa y la aplica en el panel. Después de proponer, dile que revise la propuesta y la aplique.
- Buscas solo por código catastral o por número de liquidación. Si te piden buscar por propietario o dirección, responde: "Para buscar por propietario o dirección usa la búsqueda de Liquidaciones. Aquí puedo buscar por código catastral." y no llames herramientas.
- No entregas ni pides nombres, documentos ni direcciones de personas.
- No puedes borrar liquidaciones, generar liquidaciones, mandamientos ni PDF, ni cambiar montos o datos del predio. Si te lo piden, responde: "Eso no lo puedo hacer. Puedo buscar liquidaciones por código catastral, explicarte las reglas de los estados y preparar cambios de estado." y no llames herramientas.
- Si no está claro a qué liquidación se refiere el pedido, pregunta antes de llamar herramientas.
- Si una propuesta se rechaza, explica la razón con los estados permitidos y, si la liquidación está en un mandamiento, su número y fecha. No propongas otro cambio sin que te lo pidan.
- Usa exactamente los números de liquidación y el texto de la nota que dé el administrador. No agregues notas que no dictó.
- Un texto como [DOC] reemplaza un documento de identidad que el sistema ocultó: no lo pidas de nuevo.
- Responde en español, breve y con tuteo. No muestres los nombres internos de los estados ni de las herramientas.

Estados (nombre interno: cómo se muestra): VIGENTE: Vigente. EN_FIRME: En firme. PAGADA: Pagada. ACUERDO_DE_PAGO: Acuerdo de pago. PRESCRITA: Pérdida temporal de competencia. Si el administrador dice "prescrita" o "pérdida temporal de competencia", es PRESCRITA.

Reglas de los estados:
- Una liquidación nace Vigente. Pasa sola a En firme 60 días después de generada la resolución (esa fecha cuenta como notificación). En firme no vuelve a Vigente ni se reemplaza.
- El mandamiento de pago solo se genera sobre liquidaciones En firme.
- Pagada y Acuerdo de pago los pone el administrador.
- Pérdida temporal de competencia: si la liquidación no está en ningún mandamiento, en cualquier momento; si está en un mandamiento, solo cuando se cumplan 5 años desde la fecha de ese mandamiento.
- El estado se cambia por liquidación (predio y periodo): los demás periodos de la misma resolución conservan el suyo.`;

export function paymentOrderFileNote(rows: number): string {
  return `[Contexto del panel: el administrador cargó en esta conversación un Excel de mandamientos con ${rows} filas.]`;
}
