import { type ToolDefinition, type ToolContext } from './interface';
import { type LLMToolDefinition } from '../providers/llm/interface';
import { zodToJsonSchema } from './schema-converter';

import { getMenuTool } from './catalog/get-menu';
import { getProductTool } from './catalog/get-product';
import { createOrderTool } from './orders/create-order';
import { addOrderItemTool } from './orders/add-order-item';
import { removeOrderItemTool } from './orders/remove-order-item';
import { updateOrderItemQuantityTool } from './orders/update-order-item-quantity';
import { getCurrentOrderTool } from './orders/get-current-order';
import { confirmOrderTool } from './orders/confirm-order';
import { getCustomerTool } from './customers/get-customer';
import { updateCustomerNotesTool } from './customers/update-customer-notes';
import { handoffToHumanTool } from './escalation/handoff-to-human';

/**
 * Catálogo centralizado con las herramientas deterministas del Agente IA.
 */
export const ALL_TOOLS: readonly ToolDefinition<unknown, unknown>[] = [
  getMenuTool as ToolDefinition<unknown, unknown>,
  getProductTool as ToolDefinition<unknown, unknown>,
  createOrderTool as ToolDefinition<unknown, unknown>,
  addOrderItemTool as ToolDefinition<unknown, unknown>,
  removeOrderItemTool as ToolDefinition<unknown, unknown>,
  updateOrderItemQuantityTool as ToolDefinition<unknown, unknown>,
  getCurrentOrderTool as ToolDefinition<unknown, unknown>,
  confirmOrderTool as ToolDefinition<unknown, unknown>,
  getCustomerTool as ToolDefinition<unknown, unknown>,
  updateCustomerNotesTool as ToolDefinition<unknown, unknown>,
  handoffToHumanTool as ToolDefinition<unknown, unknown>,
] as const;

export const TOOLS_MAP = new Map<string, ToolDefinition<unknown, unknown>>(
  ALL_TOOLS.map((tool) => [tool.name, tool])
);

/**
 * Retorna la definición de una herramienta por su nombre, o `undefined` si no existe.
 */
export function getTool(name: string): ToolDefinition<unknown, unknown> | undefined {
  return TOOLS_MAP.get(name);
}

/**
 * Retorna la lista de todas las herramientas disponibles.
 */
export function getAllTools(): readonly ToolDefinition<unknown, unknown>[] {
  return ALL_TOOLS;
}

/**
 * Genera la lista de definiciones en formato OpenAI Function Calling (`LLMToolDefinition[]`).
 * Todas las propiedades y tipos se derivan matemáticamente de los esquemas Zod de cada tool.
 */
export function getLLMToolDefinitions(): LLMToolDefinition[] {
  return ALL_TOOLS.map((tool) => {
    const jsonSchema = zodToJsonSchema(tool.parameters);

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: jsonSchema,
      },
    };
  });
}

/**
 * Ejecutor seguro y centralizado de herramientas.
 *
 * Flujo:
 * 1. Verifica existencia de la tool.
 * 2. Parsea argumentos si vienen como string JSON.
 * 3. Valida argumentos contra el esquema Zod de la tool.
 * 4. Ejecuta `tool.execute(parsedArgs, context)`.
 * 5. Serializa el resultado o captura errores devolviendo `{ success: false, error: "..." }`.
 */
export async function executeTool(
  name: string,
  argsInput: string | Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const tool = TOOLS_MAP.get(name);
  if (!tool) {
    return JSON.stringify({
      success: false,
      error: `Herramienta '${name}' no encontrada en el catálogo disponible`,
    });
  }

  let rawArgs: unknown;
  if (typeof argsInput === 'string') {
    const trimmed = argsInput.trim();
    if (trimmed === '') {
      rawArgs = {};
    } else {
      try {
        rawArgs = JSON.parse(trimmed);
      } catch (err) {
        return JSON.stringify({
          success: false,
          error: `Argumentos JSON malformados para '${name}': ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    }
  } else {
    rawArgs = argsInput ?? {};
  }

  const validationResult = tool.parameters.safeParse(rawArgs);
  if (!validationResult.success) {
    const formattedErrors = validationResult.error.errors
      .map((e) => `${e.path.join('.') || 'root'}: ${e.message}`)
      .join(', ');

    return JSON.stringify({
      success: false,
      error: `Parámetros inválidos para '${name}': ${formattedErrors}`,
    });
  }

  try {
    const result = await tool.execute(validationResult.data, context);
    return JSON.stringify(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({
      success: false,
      error: message,
    });
  }
}
