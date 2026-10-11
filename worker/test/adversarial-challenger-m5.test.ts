import { describe, it, expect, vi } from 'vitest';
import {
  pruneToolResponse,
  buildConversationHistory,
} from '../src/services/agent/orchestrator';
import { validateAndResolveModifiers } from '../src/services/orders/modifier-validator';
import { ValidationError } from '../src/utils/errors';
import { type Message } from '../src/types/database';

describe('EMPIRICAL ADVERSARIAL CHALLENGER — Milestone 5 (Hito 5)', () => {
  /* ========================================================================== */
  /* CHALLENGE SECTION 1: Context Pruning (R2)                                 */
  /* ========================================================================== */
  describe('Adversarial Tests: Context Pruning (orchestrator.ts)', () => {
    describe('1.1 Malformed JSON, non-JSON and Edge Case Tool Outputs', () => {
      it('debe devolver el texto original intacto ante JSON truncado o sintaxis inválida', () => {
        const truncatedJson = '{"success": true, "items": [{"id": "1", "name": "Pizza"';
        const result = pruneToolResponse(truncatedJson, 'get_menu');
        expect(result).toBe(truncatedJson);
      });

      it('debe devolver el texto original intacto ante páginas HTML de error de servidores upstream (ej. 502/504)', () => {
        const htmlError = '<html><body><h1>502 Bad Gateway</h1><p>Cloudflare</p></body></html>';
        const result = pruneToolResponse(htmlError, 'get_menu');
        expect(result).toBe(htmlError);
      });

      it('debe manejar cadenas vacías, espacios en blanco, null y undefined sin arrojar excepciones', () => {
        expect(pruneToolResponse('')).toBe('');
        expect(pruneToolResponse('   ')).toBe('   ');
        expect(pruneToolResponse(null as unknown as string)).toBeNull();
        expect(pruneToolResponse(undefined as unknown as string)).toBeUndefined();
      });

      it('debe devolver valores JSON primitivos o arrays en la raíz sin romper el parser', () => {
        expect(pruneToolResponse('12345')).toBe('12345');
        expect(pruneToolResponse('"solo una cadena"')).toBe('"solo una cadena"');
        expect(pruneToolResponse('[{"id": 1}, {"id": 2}]')).toBe('[{"id": 1}, {"id": 2}]');
        expect(pruneToolResponse('true')).toBe('true');
      });
    });

    describe('1.2 Tool Outputs without tool_name (Heuristic Detection & Fallbacks)', () => {
      it('debe inferir y podar get_menu sin tool_name', () => {
        const payload = JSON.stringify({
          categories: [{ name: 'Pizzas' }, { name: 'Bebidas' }],
          items: [{ id: '1', name: 'Pizza Pepperoni', price: 150 }],
        });
        const pruned = pruneToolResponse(payload);
        const parsed = JSON.parse(pruned);
        expect(parsed.success).toBe(true);
        expect(parsed.items_count).toBe(1);
        expect(parsed.categories).toEqual(['Pizzas', 'Bebidas']);
      });

      it('debe inferir y podar get_product sin tool_name', () => {
        const payload = JSON.stringify({
          product: { id: 'p-1', name: 'Calzone', price: 120.0 },
        });
        const pruned = pruneToolResponse(payload);
        const parsed = JSON.parse(pruned);
        expect(parsed.success).toBe(true);
        expect(parsed.name).toBe('Calzone');
        expect(parsed.price).toBe(120.0);
      });

      it('debe inferir y podar remove_order_item vs add_order_item sin tool_name', () => {
        const removePayload = JSON.stringify({
          current_cart: [],
          removed_item_id: 'item-removed-99',
          order_id: 'ord-1',
          remaining_items_count: 0,
        });
        const prunedRemove = pruneToolResponse(removePayload);
        const parsedRemove = JSON.parse(prunedRemove);
        expect(parsedRemove.success).toBe(true);
        expect(parsedRemove.item_id).toBe('item-removed-99');

        const addPayload = JSON.stringify({
          current_cart: [{ id: 'i-1' }],
          item_id: 'i-1',
          order_id: 'ord-1',
          items_count: 1,
        });
        const prunedAdd = pruneToolResponse(addPayload);
        const parsedAdd = JSON.parse(prunedAdd);
        expect(parsedAdd.success).toBe(true);
        expect(parsedAdd.item_id).toBe('i-1');
      });

      it('debe inferir handoff_to_human y confirm_order sin tool_name', () => {
        const handoffPayload = JSON.stringify({
          mode: 'human',
          reason: 'Atención personalizada requerida',
        });
        const parsedHandoff = JSON.parse(pruneToolResponse(handoffPayload));
        expect(parsedHandoff.mode).toBe('human');
        expect(parsedHandoff.reason).toBe('Atención personalizada requerida');

        const confirmPayload = JSON.stringify({
          status: 'confirmed',
          order_id: 'ord-confirmed-123',
          total: 450,
        });
        const parsedConfirm = JSON.parse(pruneToolResponse(confirmPayload));
        expect(parsedConfirm.status).toBe('confirmed');
        expect(parsedConfirm.order_id).toBe('ord-confirmed-123');
      });

      it('debe compactar payloads desconocidos > 250 caracteres de manera segura', () => {
        const customToolPayload = JSON.stringify({
          custom_data: 'A'.repeat(500),
          success: true,
        });
        const pruned = pruneToolResponse(customToolPayload);
        const parsed = JSON.parse(pruned);
        expect(parsed.success).toBe(true);
        expect(parsed.note).toBe('Respuesta de herramienta histórica compactada.');
        expect(pruned.length).toBeLessThan(100);
      });

      it('debe dejar intactos payloads desconocidos <= 250 caracteres', () => {
        const shortPayload = JSON.stringify({ custom_field: 'ok', value: 42 });
        const pruned = pruneToolResponse(shortPayload);
        expect(pruned).toBe(shortPayload);
      });
    });

    describe('1.3 Extremely Large Menu Payloads (Stress & Token Reduction)', () => {
      it('debe podar un menú masivo de 500 productos y 50 categorías con >90% de reducción de caracteres y JSON válido', () => {
        const categories = Array.from({ length: 50 }, (_, i) => ({
          id: `cat-${i}`,
          name: `Categoría Gourmet ${i}`,
          sort_order: i,
        }));

        const items = Array.from({ length: 500 }, (_, i) => ({
          id: `prod-uuid-${i}`,
          category_id: `cat-${i % 50}`,
          name: `Platillo Especial Extraordinario Artesanal con Nombre Largo ${i}`,
          description: `Una descripción sumamente detallada con múltiples ingredientes frescos importados de Italia para el platillo número ${i}. Incluye hierbas finas y aceite de oliva virgen extra.`,
          price: 150.0 + (i % 200),
          is_available: true,
          options_schema: [
            {
              name: 'Tamaño',
              type: 'single_choice',
              required: true,
              choices: [
                { label: 'Chico (20cm)', price_modifier: 0 },
                { label: 'Mediano (30cm)', price_modifier: 40 },
                { label: 'Grande (40cm)', price_modifier: 80 },
                { label: 'Familiar (50cm)', price_modifier: 120 },
              ],
            },
            {
              name: 'Complementos y Extras',
              type: 'multiple_choice',
              required: false,
              choices: [
                { label: 'Queso Extra', price_modifier: 30 },
                { label: 'Salsa Especial', price_modifier: 15 },
                { label: 'Ajo Confitado', price_modifier: 20 },
              ],
            },
          ],
        }));

        const massiveMenu = JSON.stringify({
          success: true,
          categories,
          items,
        });

        const initialLength = massiveMenu.length;
        expect(initialLength).toBeGreaterThan(250000); // > 250 KB

        const pruned = pruneToolResponse(massiveMenu, 'get_menu');

        // 1. Debe ser JSON sintácticamente válido
        let parsedPruned: Record<string, unknown>;
        expect(() => {
          parsedPruned = JSON.parse(pruned);
        }).not.toThrow();

        // 2. Verificación de contenido esencial
        expect(parsedPruned!.success).toBe(true);
        expect(parsedPruned!.status).toBe('success');
        expect(parsedPruned!.items_count).toBe(500);
        expect((parsedPruned!.categories as string[]).length).toBe(50);
        expect(parsedPruned!.note).toBe('[Menu cached in system prompt]');

        // 3. Verificación empírica de reducción de caracteres (>95%)
        const reductionPercent = ((initialLength - pruned.length) / initialLength) * 100;
        expect(reductionPercent).toBeGreaterThan(95);
      });
    });

    describe('1.4 Tool Errors Preservation (Never Truncated or Lost)', () => {
      it('debe preservar íntegramente los mensajes de error en español', () => {
        const errorText = 'El producto "Pizza Hawaiana Suprema" no cuenta con stock disponible en la sucursal Centro.';
        const errorPayload = JSON.stringify({
          success: false,
          error: errorText,
        });

        const pruned = pruneToolResponse(errorPayload, 'add_order_item');
        const parsed = JSON.parse(pruned);

        expect(parsed.success).toBe(false);
        expect(parsed.error).toBe(errorText);
      });

      it('debe preservar errores cuando success es omitido pero existe la propiedad error', () => {
        const errorPayload = JSON.stringify({
          error: 'DATABASE_LOCKED: No se pudo obtener el bloqueo de la orden en PostgreSQL',
        });

        const pruned = pruneToolResponse(errorPayload);
        const parsed = JSON.parse(pruned);

        expect(parsed.success).toBe(false);
        expect(parsed.error).toBe('DATABASE_LOCKED: No se pudo obtener el bloqueo de la orden en PostgreSQL');
      });

      it('debe manejar errores no-string sin romper el formato', () => {
        const errorPayload = JSON.stringify({
          success: false,
          error: { code: 500, detail: 'Internal error' },
        });

        const pruned = pruneToolResponse(errorPayload);
        const parsed = JSON.parse(pruned);

        expect(parsed.success).toBe(false);
        expect(parsed.error).toBe('Error al ejecutar herramienta');
      });
    });

    describe('1.5 OpenAI tool_call_id & Message History Invariants (buildConversationHistory)', () => {
      it('debe preservar exactamente el tool_call_id de OpenAI en mensajes de herramienta podados', () => {
        const systemPrompt = 'System Prompt de Prueba';
        const recentMessages: Message[] = [
          {
            id: 'msg-1',
            restaurant_id: 'rest-1',
            conversation_id: 'conv-1',
            provider_message_id: null,
            role: 'assistant',
            content: '[Invocando herramientas: get_product, add_order_item]',
            metadata: {
              tool_calls: [
                { id: 'call_openai_prod_abc123', type: 'function', function: { name: 'get_product', arguments: '{"product_id":"p1"}' } },
                { id: 'call_openai_add_xyz789', type: 'function', function: { name: 'add_order_item', arguments: '{"order_id":"o1"}' } },
              ],
            },
            created_at: '2026-08-26T12:00:00Z',
          },
          {
            id: 'msg-2',
            restaurant_id: 'rest-1',
            conversation_id: 'conv-1',
            provider_message_id: null,
            role: 'tool',
            content: JSON.stringify({
              product: { id: 'p1', name: 'Pizza Margarita', price: 160.0, description: 'Muy larga'.repeat(20) },
            }),
            metadata: {
              tool_call_id: 'call_openai_prod_abc123',
              tool_name: 'get_product',
            },
            created_at: '2026-08-26T12:00:01Z',
          },
          {
            id: 'msg-3',
            restaurant_id: 'rest-1',
            conversation_id: 'conv-1',
            provider_message_id: null,
            role: 'tool',
            content: JSON.stringify({
              success: true,
              order_id: 'o1',
              item_id: 'i1',
              current_cart: [{ id: 'i1', name: 'Pizza Margarita', quantity: 1, unit_price: 160 }],
              items_count: 1,
            }),
            metadata: {
              tool_call_id: 'call_openai_add_xyz789',
              tool_name: 'add_order_item',
            },
            created_at: '2026-08-26T12:00:02Z',
          },
        ];

        const history = buildConversationHistory(systemPrompt, recentMessages, 'msg-user-99', 'Confirmar mi orden');

        expect(history[0]).toEqual({ role: 'system', content: systemPrompt });

        // Assistant sintético debe tener content: null y tool_calls intactos
        const asstMsg = history[1];
        expect(asstMsg?.role).toBe('assistant');
        expect(asstMsg?.content).toBeNull();
        if (asstMsg && asstMsg.role === 'assistant') {
          expect(asstMsg.tool_calls?.[0]?.id).toBe('call_openai_prod_abc123');
          expect(asstMsg.tool_calls?.[1]?.id).toBe('call_openai_add_xyz789');
        }

        // Tool 1 podado con tool_call_id exacto
        const tool1 = history[2];
        expect(tool1?.role).toBe('tool');
        if (tool1 && tool1.role === 'tool') {
          expect(tool1.tool_call_id).toBe('call_openai_prod_abc123');
          expect(tool1.content).not.toBeNull();
          const parsed1 = JSON.parse(tool1.content ?? '{}');
          expect(parsed1.name).toBe('Pizza Margarita');
          expect(parsed1.price).toBe(160.0);
        }

        // Tool 2 podado con tool_call_id exacto
        const tool2 = history[3];
        expect(tool2?.role).toBe('tool');
        if (tool2 && tool2.role === 'tool') {
          expect(tool2.tool_call_id).toBe('call_openai_add_xyz789');
          expect(tool2.content).not.toBeNull();
          const parsed2 = JSON.parse(tool2.content ?? '{}');
          expect(parsed2.order_id).toBe('o1');
          expect(parsed2).not.toHaveProperty('current_cart');
        }

        // Mensaje final del usuario
        const lastMsg = history[4];
        expect(lastMsg).toEqual({ role: 'user', content: 'Confirmar mi orden' });
      });

      it('debe manejar metadata vacía o nula en mensajes sin lanzar errores de runtime', () => {
        const recentMessages: Message[] = [
          {
            id: 'msg-raw-tool',
            restaurant_id: 'rest-1',
            conversation_id: 'conv-1',
            provider_message_id: null,
            role: 'tool',
            content: '{"success": true}',
            metadata: null,
            created_at: '2026-08-26T12:00:00Z',
          },
        ];

        const history = buildConversationHistory('Prompt', recentMessages, 'msg-new', 'Hola');
        expect(history.length).toBe(3);
        const toolMsg = history[1];
        expect(toolMsg?.role).toBe('tool');
        if (toolMsg && toolMsg.role === 'tool') {
          expect(toolMsg.tool_call_id).toBe('');
        }
      });
    });
  });

  /* ========================================================================== */
  /* CHALLENGE SECTION 2: Strict Options Schema Validation (R3)                */
  /* ========================================================================== */
  describe('Adversarial Tests: Strict Options Schema Validation (modifier-validator.ts)', () => {
    const complexOptionsSchema = [
      {
        name: 'Tamaño de Pizza',
        type: 'single_choice' as const,
        required: true,
        choices: [
          { label: 'Personal (20cm)', price_modifier: 0.0 },
          { label: 'Mediana (30cm)', price_modifier: 45.0 },
          { label: 'Grande (35cm)', price_modifier: 85.0 },
          { label: 'Familiar (40cm)', price_modifier: 130.0 },
        ],
      },
      {
        name: 'Tipo de Masa',
        type: 'single_choice' as const,
        required: false,
        choices: [
          { label: 'Masa Tradicional', price_modifier: 0.0 },
          { label: 'Masa Delgada Crujiente', price_modifier: 0.0 },
          { label: 'Orilla Rellena de Queso Mozzarella', price_modifier: 49.99 },
          { label: 'Orilla de Queso Crema con Ajo', price_modifier: 55.5 },
        ],
      },
      {
        name: 'Ingredientes Adicionales',
        type: 'multiple_choice' as const,
        required: false,
        choices: [
          { label: 'Doble Pepperoni', price_modifier: 35.0 },
          { label: 'Tocino Ahumado', price_modifier: 30.0 },
          { label: 'Champiñones Frescos', price_modifier: 25.0 },
          { label: 'Pimientos Asados', price_modifier: 20.0 },
          { label: 'Jalapeños en Rodajas', price_modifier: 15.0 },
        ],
      },
    ];

    describe('2.1 Negative & Altered price_modifier Injection Attacks (Anti-Tampering)', () => {
      it('debe BLOQUEAR inyecciones de precios negativos (-$999.00) y usar el precio oficial', () => {
        const tamperedSelected = [
          { group_name: 'Tamaño de Pizza', choice_label: 'Familiar (40cm)', price_modifier: -999.0 },
          { group_name: 'Tipo de Masa', choice_label: 'Orilla Rellena de Queso Mozzarella', price_modifier: -50.0 },
        ];

        const result = validateAndResolveModifiers(complexOptionsSchema, tamperedSelected, 'Pizza Suprema');

        // Precios oficiales: 130.0 + 49.99 = 179.99
        expect(result.additionalCost).toBe(179.99);
        expect(result.totalOptionsModifier).toBe(179.99);
        expect(result.resolvedModifiers[0]!.price_modifier).toBe(130.0);
        expect(result.resolvedModifiers[1]!.price_modifier).toBe(49.99);
      });

      it('debe BLOQUEAR intentos de poner precio $0.00 en opciones con costo adicional', () => {
        const tamperedSelected = [
          { group_name: 'Tamaño de Pizza', choice_label: 'Grande (35cm)', price_modifier: 0.0 }, // Oficial 85.0
          { group_name: 'Ingredientes Adicionales', choice_label: 'Doble Pepperoni', price_modifier: 0.0 }, // Oficial 35.0
        ];

        const result = validateAndResolveModifiers(complexOptionsSchema, tamperedSelected, 'Pizza Suprema');

        expect(result.additionalCost).toBe(120.0); // 85.0 + 35.0
        expect(result.resolvedModifiers[0]!.price_modifier).toBe(85.0);
        expect(result.resolvedModifiers[1]!.price_modifier).toBe(35.0);
      });

      it('debe redondear y preservar la precisión de 2 decimales sin errores de punto flotante', () => {
        const selected = [
          { group_name: 'Tamaño de Pizza', choice_label: 'Personal (20cm)' },
          { group_name: 'Tipo de Masa', choice_label: 'Orilla Rellena de Queso Mozzarella' }, // 49.99
          { group_name: 'Tipo de Masa', choice_label: 'Orilla de Queso Crema con Ajo' }, // 55.5
        ];

        // Orilla es single_choice -> debe fallar si se envían ambas
        expect(() =>
          validateAndResolveModifiers(complexOptionsSchema, selected, 'Pizza Suprema')
        ).toThrow(ValidationError);
      });
    });

    describe('2.2 Non-Existent Groups and Choices', () => {
      it('debe rechazar con ValidationError si el grupo no existe en el options_schema', () => {
        const selected = [
          { group_name: 'Tamaño de Pizza', choice_label: 'Personal (20cm)' },
          { group_name: 'Grupo Ficticio Inexistente', choice_label: 'Opción 1' },
        ];

        expect(() =>
          validateAndResolveModifiers(complexOptionsSchema, selected, 'Pizza Suprema')
        ).toThrowError(/El grupo de opciones 'Grupo Ficticio Inexistente' no existe para 'Pizza Suprema'/);
      });

      it('debe rechazar con ValidationError si la opción no existe dentro de un grupo existente', () => {
        const selected = [
          { group_name: 'Tamaño de Pizza', choice_label: 'Tamaño Colosal 80cm' },
        ];

        expect(() =>
          validateAndResolveModifiers(complexOptionsSchema, selected, 'Pizza Suprema')
        ).toThrowError(/La opción 'Tamaño Colosal 80cm' no es válida para el grupo 'Tamaño de Pizza' en 'Pizza Suprema'/);
      });
    });

    describe('2.3 Single Choice vs Multiple Choice Constraints', () => {
      it('debe rechazar múltiples selecciones en un grupo single_choice', () => {
        const selected = [
          { group_name: 'Tamaño de Pizza', choice_label: 'Mediana (30cm)' },
          { group_name: 'Tamaño de Pizza', choice_label: 'Grande (35cm)' },
        ];

        expect(() =>
          validateAndResolveModifiers(complexOptionsSchema, selected, 'Pizza Suprema')
        ).toThrowError(/El grupo 'Tamaño de Pizza' solo permite seleccionar una sola opción \('single_choice'\) y se recibieron 2/);
      });

      it('debe permitir múltiples selecciones en un grupo multiple_choice acumulando sus precios correctamente', () => {
        const selected = [
          { group_name: 'Tamaño de Pizza', choice_label: 'Personal (20cm)' }, // 0
          { group_name: 'Ingredientes Adicionales', choice_label: 'Doble Pepperoni' }, // 35
          { group_name: 'Ingredientes Adicionales', choice_label: 'Tocino Ahumado' }, // 30
          { group_name: 'Ingredientes Adicionales', choice_label: 'Champiñones Frescos' }, // 25
          { group_name: 'Ingredientes Adicionales', choice_label: 'Jalapeños en Rodajas' }, // 15
        ];

        const result = validateAndResolveModifiers(complexOptionsSchema, selected, 'Pizza Suprema');

        // Total: 0 + 35 + 30 + 25 + 15 = 105.0
        expect(result.additionalCost).toBe(105.0);
        expect(result.resolvedModifiers).toHaveLength(5);
      });
    });

    describe('2.4 Required Groups Enforcement', () => {
      it('debe rechazar si se omite un grupo marcado con required: true', () => {
        const selectedWithoutRequired = [
          { group_name: 'Tipo de Masa', choice_label: 'Masa Tradicional' },
          { group_name: 'Ingredientes Adicionales', choice_label: 'Doble Pepperoni' },
        ];

        expect(() =>
          validateAndResolveModifiers(complexOptionsSchema, selectedWithoutRequired, 'Pizza Suprema')
        ).toThrowError(/El grupo de opciones 'Tamaño de Pizza' es obligatorio para 'Pizza Suprema'/);
      });

      it('debe permitir omitir grupos no obligatorios (required: false o undefined)', () => {
        const selectedOnlyRequired = [
          { group_name: 'Tamaño de Pizza', choice_label: 'Mediana (30cm)' },
        ];

        const result = validateAndResolveModifiers(complexOptionsSchema, selectedOnlyRequired, 'Pizza Suprema');

        expect(result.additionalCost).toBe(45.0);
        expect(result.resolvedModifiers).toHaveLength(1);
      });
    });

    describe('2.5 Empty, Null and Corrupted options_schema Handling', () => {
      it('debe permitir producto con options_schema null si no se seleccionan opciones', () => {
        const result = validateAndResolveModifiers(null, [], 'Coca-Cola 600ml');
        expect(result.additionalCost).toBe(0);
        expect(result.resolvedModifiers).toEqual([]);
        expect(result.validatedOptions).toEqual([]);
      });

      it('debe permitir producto con options_schema vacío si no se seleccionan opciones', () => {
        const result = validateAndResolveModifiers([], undefined, 'Agua Embotellada');
        expect(result.additionalCost).toBe(0);
        expect(result.resolvedModifiers).toEqual([]);
      });

      it('debe RECHAZAR opciones seleccionadas si el producto tiene options_schema null', () => {
        const selected = [{ group_name: 'Tamaño', choice_label: 'Grande' }];
        expect(() =>
          validateAndResolveModifiers(null, selected, 'Agua Embotellada')
        ).toThrowError(/El producto 'Agua Embotellada' no acepta opciones ni modificadores de personalización/);
      });

      it('debe RECHAZAR opciones seleccionadas si el producto tiene options_schema vacío []', () => {
        const selected = [{ group_name: 'Extra', choice_label: 'Hielo' }];
        expect(() =>
          validateAndResolveModifiers([], selected, 'Papas Fritas')
        ).toThrowError(/El producto 'Papas Fritas' no acepta opciones ni modificadores de personalización/);
      });

      it('debe recuperarse ante un options_schema con string JSON malformado tratándolo como sin opciones', () => {
        const corruptedSchema = '{ esto no es un json válido [';
        const result = validateAndResolveModifiers(corruptedSchema, [], 'Postre');
        expect(result.additionalCost).toBe(0);
      });
    });

    describe('2.6 Format Normalization & Casing Tolerance', () => {
      it('debe tolerar mayúsculas, minúsculas y espacios en blanco en nombres de grupos y opciones', () => {
        const selected = [
          { group_name: '  TAMAÑO DE PIZZA  ', choice_label: '  grande (35CM)  ' },
          { group_name: 'tipo de masa', choice_label: 'orilla rellena de queso mozzarella' },
        ];

        const result = validateAndResolveModifiers(complexOptionsSchema, selected, 'Pizza Suprema');

        expect(result.additionalCost).toBe(134.99); // 85.0 + 49.99
        expect(result.resolvedModifiers[0]!.group_name).toBe('Tamaño de Pizza');
        expect(result.resolvedModifiers[0]!.choice_label).toBe('Grande (35cm)');
      });

      it('debe tolerar diferentes aliases de claves (group/label/name/choice/value)', () => {
        const selectedWithAliases = [
          { group: 'Tamaño de Pizza', label: 'Mediana (30cm)' },
          { name: 'Tipo de Masa', choice: 'Masa Tradicional' },
        ];

        const result = validateAndResolveModifiers(complexOptionsSchema, selectedWithAliases, 'Pizza');

        expect(result.additionalCost).toBe(45.0);
        expect(result.resolvedModifiers).toHaveLength(2);
      });

      it('debe soportar options_selected serializado como string JSON', () => {
        const jsonSelected = JSON.stringify([
          { group_name: 'Tamaño de Pizza', choice_label: 'Familiar (40cm)' },
        ]);

        const result = validateAndResolveModifiers(complexOptionsSchema, jsonSelected, 'Pizza');

        expect(result.additionalCost).toBe(130.0);
        expect(result.resolvedModifiers).toHaveLength(1);
      });

      it('debe lanzar ValidationError si options_selected es un string con JSON inválido', () => {
        const invalidJson = '{ esto no es json';
        expect(() =>
          validateAndResolveModifiers(complexOptionsSchema, invalidJson, 'Pizza')
        ).toThrowError(/El formato de opciones seleccionadas es inválido/);
      });
    });

    describe('2.7 Hostile Cross-Group Mismatches & Empty Labels', () => {
      it('debe rechazar cuando se solicita una opción válida pero bajo el grupo incorrecto (Cross-group mismatch)', () => {
        // 'Orilla Rellena de Queso Mozzarella' es una opción válida de 'Tipo de Masa', pero aquí se solicita en 'Tamaño de Pizza'
        const crossGroupSelected = [
          { group_name: 'Tamaño de Pizza', choice_label: 'Orilla Rellena de Queso Mozzarella' },
        ];

        expect(() =>
          validateAndResolveModifiers(complexOptionsSchema, crossGroupSelected, 'Pizza Suprema')
        ).toThrowError(/La opción 'Orilla Rellena de Queso Mozzarella' no es válida para el grupo 'Tamaño de Pizza'/);
      });

      it('debe rechazar opciones con etiquetas vacías o sólo espacios en blanco', () => {
        const blankChoice = [
          { group_name: 'Tamaño de Pizza', choice_label: '   ' },
        ];

        expect(() =>
          validateAndResolveModifiers(complexOptionsSchema, blankChoice, 'Pizza Suprema')
        ).toThrowError(/Cada opción seleccionada debe especificar el nombre del grupo y la opción elegida/);
      });

      it('debe rechazar opciones con nombre de grupo vacío', () => {
        const blankGroup = [
          { group_name: '', choice_label: 'Personal (20cm)' },
        ];

        expect(() =>
          validateAndResolveModifiers(complexOptionsSchema, blankGroup, 'Pizza Suprema')
        ).toThrowError(/Cada opción seleccionada debe especificar el nombre del grupo y la opción elegida/);
      });

      it('debe resistir payloads con propiedades no estándar sin colapsar', () => {
        const pollutedSelected = [
          {
            group_name: 'Tamaño de Pizza',
            choice_label: 'Personal (20cm)',
            __proto__: { admin: true },
            extra_malicious_field: 'drop table orders;',
          },
        ];

        const result = validateAndResolveModifiers(complexOptionsSchema, pollutedSelected, 'Pizza Suprema');
        expect(result.additionalCost).toBe(0);
        expect(result.resolvedModifiers[0]!.choice_label).toBe('Personal (20cm)');
        expect(result.validatedOptions[0]).toEqual({
          group_name: 'Tamaño de Pizza',
          choice_label: 'Personal (20cm)',
          price_modifier: 0,
        });
      });
    });
  });
});

