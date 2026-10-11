import { describe, it, expect } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

// Esquemas y funciones del Dashboard
import {
  optionChoiceSchema,
  optionGroupSchema,
  optionsSchema,
  findDuplicateGroupNames,
  findDuplicateChoiceLabels,
  validateOptionsSchema,
  type OptionGroup,
  type OptionChoice,
} from '../src/schemas/menu';

// Componente visual del Dashboard
import {
  OptionsSchemaBuilder,
} from '../src/components/menu/options-schema-builder';

// Esquemas y lógica canónica del Worker Backend para verificar compatibilidad bidireccional
import { optionGroupSchema as workerOptionGroupSchema } from '../../worker/src/schemas/database';
import { validateAndResolveModifiers } from '../../worker/src/services/orders/modifier-validator';

describe('OptionsSchemaBuilder & Canonical Options Schema Suite', () => {
  // ==========================================================================
  // 1. Primitive & Core Group Validations
  // ==========================================================================
  describe('1. Primitive & Core Group Validations', () => {
    it('debe validar un esquema completamente vacío ([]) como válido', () => {
      // 1. Arrange
      const emptySchema: OptionGroup[] = [];

      // 2. Act
      const parseResult = optionsSchema.safeParse(emptySchema);
      const helperResult = validateOptionsSchema(emptySchema);

      // 3. Assert
      expect(parseResult.success).toBe(true);
      expect(helperResult.success).toBe(true);
      expect(helperResult.errors).toHaveLength(0);
      if (parseResult.success) {
        expect(parseResult.data).toEqual([]);
      }
    });

    it('debe validar un grupo single_choice con 1 sola opción', () => {
      // 1. Arrange
      const schema: OptionGroup[] = [
        {
          name: 'Término de la Carne',
          type: 'single_choice',
          required: true,
          choices: [{ label: 'Bien Cocido', price_modifier: 0 }],
        },
      ];

      // 2. Act
      const parseResult = optionsSchema.safeParse(schema);

      // 3. Assert
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data).toHaveLength(1);
        expect(parseResult.data[0]?.name).toBe('Término de la Carne');
        expect(parseResult.data[0]?.type).toBe('single_choice');
        expect(parseResult.data[0]?.required).toBe(true);
        expect(parseResult.data[0]?.choices).toHaveLength(1);
        expect(parseResult.data[0]?.choices[0]?.label).toBe('Bien Cocido');
        expect(parseResult.data[0]?.choices[0]?.price_modifier).toBe(0);
      }
    });

    it('debe rechazar con error Zod un grupo single_choice con 0 opciones (choices vacío)', () => {
      // 1. Arrange
      const invalidGroup = {
        name: 'Tamaño',
        type: 'single_choice',
        required: true,
        choices: [],
      };

      // 2. Act
      const resultGroup = optionGroupSchema.safeParse(invalidGroup);
      const resultSchema = optionsSchema.safeParse([invalidGroup]);

      // 3. Assert
      expect(resultGroup.success).toBe(false);
      expect(resultSchema.success).toBe(false);

      if (!resultGroup.success) {
        const errorMsg = resultGroup.error.issues[0]?.message;
        expect(errorMsg).toContain('al menos una opción');
      }
    });

    it('debe rechazar con error Zod cuando price_modifier es negativo', () => {
      // 1. Arrange
      const negativeChoice = {
        label: 'Descuento no permitido',
        price_modifier: -15.5,
      };

      // 2. Act
      const resultChoice = optionChoiceSchema.safeParse(negativeChoice);
      const resultGroup = optionGroupSchema.safeParse({
        name: 'Extras',
        type: 'multiple_choice',
        choices: [negativeChoice],
      });

      // 3. Assert
      expect(resultChoice.success).toBe(false);
      expect(resultGroup.success).toBe(false);

      if (!resultChoice.success) {
        const msg = resultChoice.error.issues[0]?.message;
        expect(msg).toContain('no puede ser negativo');
      }
    });

    it('debe validar un grupo multiple_choice con múltiples opciones y modificadores de precio válidos', () => {
      // 1. Arrange
      const schema: OptionGroup[] = [
        {
          name: 'Ingredientes Adicionales',
          type: 'multiple_choice',
          required: false,
          choices: [
            { label: 'Queso Extra Mozzarella', price_modifier: 25 },
            { label: 'Champiñones Frescos', price_modifier: 18.5 },
            { label: 'Cebolla Morada', price_modifier: 0 },
            { label: 'Prosciutto Di Parma', price_modifier: 45.75 },
          ],
        },
      ];

      // 2. Act
      const result = optionsSchema.safeParse(schema);

      // 3. Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0]?.choices).toHaveLength(4);
        expect(result.data[0]?.choices[1]?.price_modifier).toBe(18.5);
        expect(result.data[0]?.choices[3]?.price_modifier).toBe(45.75);
      }
    });
  });

  // ==========================================================================
  // 2. Duplicate Names & Labels Handling
  // ==========================================================================
  describe('2. Duplicate Names & Labels Handling', () => {
    it('debe rechazar grupos con nombres duplicados (mismo nombre exacto)', () => {
      // 1. Arrange
      const schemaWithDuplicates = [
        {
          name: 'Tamaño',
          type: 'single_choice' as const,
          choices: [{ label: 'Mediana', price_modifier: 0 }],
        },
        {
          name: 'Tamaño',
          type: 'single_choice' as const,
          choices: [{ label: 'Grande', price_modifier: 50 }],
        },
      ];

      // 2. Act
      const result = optionsSchema.safeParse(schemaWithDuplicates);
      const duplicateNames = findDuplicateGroupNames(schemaWithDuplicates as OptionGroup[]);

      // 3. Assert
      expect(result.success).toBe(false);
      expect(duplicateNames).toContain('Tamaño');

      if (!result.success) {
        const hasDuplicateIssue = result.error.issues.some(
          (issue) => issue.message.includes('duplicado') && issue.path.includes('name')
        );
        expect(hasDuplicateIssue).toBe(true);
      }
    });

    it('debe rechazar grupos con nombres duplicados insensibles a mayúsculas/minúsculas y espacios', () => {
      // 1. Arrange
      const schema = [
        {
          name: 'Salsas y Aderezos',
          type: 'multiple_choice' as const,
          choices: [{ label: 'Ranch', price_modifier: 10 }],
        },
        {
          name: '  salsas y aderezos  ',
          type: 'multiple_choice' as const,
          choices: [{ label: 'Chipotle', price_modifier: 10 }],
        },
      ];

      // 2. Act
      const result = optionsSchema.safeParse(schema);
      const duplicates = findDuplicateGroupNames(schema as OptionGroup[]);

      // 3. Assert
      expect(result.success).toBe(false);
      expect(duplicates.length).toBeGreaterThan(0);
    });

    it('debe rechazar opciones con labels duplicados dentro del mismo grupo', () => {
      // 1. Arrange
      const groupWithDuplicateChoices = {
        name: 'Extras de Pizza',
        type: 'multiple_choice' as const,
        choices: [
          { label: 'Queso Extra', price_modifier: 20 },
          { label: 'queso extra', price_modifier: 25 },
        ],
      };

      // 2. Act
      const resultGroup = optionGroupSchema.safeParse(groupWithDuplicateChoices);
      const resultSchema = optionsSchema.safeParse([groupWithDuplicateChoices]);
      const duplicateChoices = findDuplicateChoiceLabels(groupWithDuplicateChoices as OptionGroup);

      // 3. Assert
      expect(resultGroup.success).toBe(false);
      expect(resultSchema.success).toBe(false);
      expect(duplicateChoices.length).toBeGreaterThan(0);

      if (!resultGroup.success) {
        const hasChoiceDuplicate = resultGroup.error.issues.some((issue) =>
          issue.message.includes('duplicada')
        );
        expect(hasChoiceDuplicate).toBe(true);
      }
    });

    it('debe permitir opciones con el mismo nombre si pertenecen a GRUPOS DISTINTOS', () => {
      // 1. Arrange: "Regular" existe en Tamaño y en Nivel de Picante
      const schema: OptionGroup[] = [
        {
          name: 'Tamaño',
          type: 'single_choice',
          required: false,
          choices: [{ label: 'Regular', price_modifier: 0 }],
        },
        {
          name: 'Picante',
          type: 'single_choice',
          required: false,
          choices: [{ label: 'Regular', price_modifier: 0 }],
        },
      ];

      // 2. Act
      const result = optionsSchema.safeParse(schema);

      // 3. Assert
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // 3. Boundary Validations (min_selectable & max_selectable)
  // ==========================================================================
  describe('3. Boundary Validations (min_selectable & max_selectable)', () => {
    it('debe validar límites correctos cuando min_selectable <= max_selectable <= choices.length', () => {
      // 1. Arrange
      const group = {
        name: 'Combo de 2 Salsas',
        type: 'multiple_choice' as const,
        min_selectable: 1,
        max_selectable: 2,
        choices: [
          { label: 'BBQ', price_modifier: 0 },
          { label: 'Búfalo', price_modifier: 0 },
          { label: 'Mostaza Miel', price_modifier: 0 },
        ],
      };

      // 2. Act
      const result = optionGroupSchema.safeParse(group);

      // 3. Assert
      expect(result.success).toBe(true);
    });

    it('debe rechazar min_selectable negativo (< 0)', () => {
      // 1. Arrange
      const group = {
        name: 'Salsas',
        type: 'multiple_choice' as const,
        min_selectable: -1,
        choices: [{ label: 'BBQ', price_modifier: 0 }],
      };

      // 2. Act
      const result = optionGroupSchema.safeParse(group);

      // 3. Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('min_selectable'))).toBe(true);
      }
    });

    it('debe rechazar max_selectable menor a 1 (< 1)', () => {
      // 1. Arrange
      const group = {
        name: 'Salsas',
        type: 'multiple_choice' as const,
        max_selectable: 0,
        choices: [{ label: 'BBQ', price_modifier: 0 }],
      };

      // 2. Act
      const result = optionGroupSchema.safeParse(group);

      // 3. Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('max_selectable'))).toBe(true);
      }
    });

    it('debe rechazar cuando min_selectable es estrictamente mayor que max_selectable', () => {
      // 1. Arrange
      const group = {
        name: 'Salsas',
        type: 'multiple_choice' as const,
        min_selectable: 3,
        max_selectable: 2,
        choices: [
          { label: 'BBQ', price_modifier: 0 },
          { label: 'Búfalo', price_modifier: 0 },
          { label: 'Ranch', price_modifier: 0 },
        ],
      };

      // 2. Act
      const result = optionGroupSchema.safeParse(group);

      // 3. Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes('min_selectable'));
        expect(issue?.message).toContain('no puede ser mayor');
      }
    });

    it('debe rechazar cuando max_selectable excede el total de choices disponibles', () => {
      // 1. Arrange: pide 5 opciones pero solo hay 2
      const group = {
        name: 'Toppings',
        type: 'multiple_choice' as const,
        max_selectable: 5,
        choices: [
          { label: 'Albahaca', price_modifier: 0 },
          { label: 'Orégano', price_modifier: 0 },
        ],
      };

      // 2. Act
      const result = optionGroupSchema.safeParse(group);

      // 3. Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes('max_selectable'));
        expect(issue?.message).toContain('no puede exceder');
      }
    });

    it('debe rechazar valores flotantes no enteros para min_selectable o max_selectable', () => {
      // 1. Arrange
      const groupWithFloats = {
        name: 'Bebidas',
        type: 'multiple_choice' as const,
        min_selectable: 1.5,
        max_selectable: 2.7,
        choices: [
          { label: 'Agua', price_modifier: 0 },
          { label: 'Refresco', price_modifier: 0 },
          { label: 'Cerveza', price_modifier: 0 },
        ],
      };

      // 2. Act
      const result = optionGroupSchema.safeParse(groupWithFloats);

      // 3. Assert
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Invalid & Malformed Payloads Against optionsSchema
  // ==========================================================================
  describe('4. Invalid & Malformed Payloads Against optionsSchema', () => {
    it('debe rechazar grupo con nombre vacío o solo espacios', () => {
      const result = optionGroupSchema.safeParse({
        name: '   ',
        type: 'single_choice',
        choices: [{ label: 'Opción 1', price_modifier: 0 }],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('requerido');
      }
    });

    it('debe rechazar nombre de grupo que exceda 100 caracteres', () => {
      const longName = 'A'.repeat(101);
      const result = optionGroupSchema.safeParse({
        name: longName,
        type: 'single_choice',
        choices: [{ label: 'Opción 1', price_modifier: 0 }],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('100 caracteres');
      }
    });

    it('debe rechazar opción con label vacío o solo espacios', () => {
      const result = optionChoiceSchema.safeParse({
        label: '   ',
        price_modifier: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('requerido');
      }
    });

    it('debe rechazar label de opción que exceda 100 caracteres', () => {
      const longLabel = 'B'.repeat(101);
      const result = optionChoiceSchema.safeParse({
        label: longLabel,
        price_modifier: 0,
      });
      expect(result.success).toBe(false);
    });

    it('debe rechazar tipos de grupo inválidos (no enum)', () => {
      const result = optionGroupSchema.safeParse({
        name: 'Sabor',
        type: 'dropdown', // tipo inválido
        choices: [{ label: 'Vainilla', price_modifier: 0 }],
      });
      expect(result.success).toBe(false);
    });

    it('debe rechazar payloads no-array en optionsSchema (null, undefined, objeto, string, número)', () => {
      expect(optionsSchema.safeParse(null).success).toBe(false);
      expect(optionsSchema.safeParse(undefined).success).toBe(false);
      expect(optionsSchema.safeParse({ name: 'Solo un objeto' }).success).toBe(false);
      expect(optionsSchema.safeParse('string').success).toBe(false);
      expect(optionsSchema.safeParse(12345).success).toBe(false);
    });

    it('debe autocompletar required con false si se omite en el payload', () => {
      const result = optionGroupSchema.safeParse({
        name: 'Acompañamiento',
        type: 'single_choice',
        choices: [{ label: 'Papas Fritas', price_modifier: 0 }],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.required).toBe(false);
      }
    });
  });

  // ==========================================================================
  // 5. Worker Canonical Compatibility & End-to-End Roundtrip
  // ==========================================================================
  describe('5. Worker Canonical Compatibility & Roundtrip', () => {
    it('debe serializar en JSON y deserializar siendo 100% compatible con Worker optionGroupSchema', () => {
      // 1. Arrange: Esquema completo creado en el Dashboard
      const dashboardSchema: OptionGroup[] = [
        {
          name: 'Tamaño de Pizza',
          type: 'single_choice',
          required: true,
          choices: [
            { label: 'Individual 25cm', price_modifier: 0 },
            { label: 'Mediana 35cm', price_modifier: 50 },
            { label: 'Familiar 45cm', price_modifier: 95 },
          ],
        },
        {
          name: 'Tipo de Masa',
          type: 'single_choice',
          required: false,
          choices: [
            { label: 'Tradicional Napolitana', price_modifier: 0 },
            { label: 'Orilla Rellena de Queso', price_modifier: 35.5 },
          ],
        },
        {
          name: 'Ingredientes Extra',
          type: 'multiple_choice',
          required: false,
          min_selectable: 0,
          max_selectable: 3,
          choices: [
            { label: 'Queso Provolone', price_modifier: 25 },
            { label: 'Pepperoni Importado', price_modifier: 30 },
            { label: 'Aceitunas Negras', price_modifier: 15 },
          ],
        },
      ];

      // 2. Act: Serialización a JSON (como se guarda en Supabase DB)
      const serializedJson = JSON.stringify(dashboardSchema);
      const deserialized = JSON.parse(serializedJson);

      // 3. Assert: Validar contra el validador estricto del Worker
      const workerParseResult = workerOptionGroupSchema.safeParse(deserialized[0]);
      expect(workerParseResult.success).toBe(true);

      const allGroupsValidInWorker = deserialized.every(
        (group: unknown) => workerOptionGroupSchema.safeParse(group).success
      );
      expect(allGroupsValidInWorker).toBe(true);
    });

    it('debe ejecutar exitosamente validateAndResolveModifiers del Worker con esquema generado por Dashboard', () => {
      // 1. Arrange: Generar esquema completo en Dashboard
      const menuSchema: OptionGroup[] = [
        {
          name: 'Tamaño de Pizza',
          type: 'single_choice',
          required: true,
          choices: [
            { label: 'Mediana', price_modifier: 0 },
            { label: 'Familiar', price_modifier: 65 },
          ],
        },
        {
          name: 'Extras',
          type: 'multiple_choice',
          required: false,
          choices: [
            { label: 'Champiñones', price_modifier: 20 },
            { label: 'Tocino Crujiente', price_modifier: 30 },
          ],
        },
      ];

      // 2. Act: Simular selección válida del comensal en WhatsApp
      const selectedOptions = [
        { group_name: 'Tamaño de Pizza', choice_label: 'Familiar' },
        { group_name: 'Extras', choice_label: 'Tocino Crujiente' },
      ];

      const validation = validateAndResolveModifiers(
        menuSchema,
        selectedOptions,
        'Pizza Suprema'
      );

      // 3. Assert: Cálculo determinista y resolución matemática
      expect(validation.additionalCost).toBe(95); // 65 + 30
      expect(validation.resolvedModifiers).toHaveLength(2);
      expect(validation.resolvedModifiers[0]?.choice_label).toBe('Familiar');
      expect(validation.resolvedModifiers[0]?.price_modifier).toBe(65);
      expect(validation.resolvedModifiers[1]?.choice_label).toBe('Tocino Crujiente');
      expect(validation.resolvedModifiers[1]?.price_modifier).toBe(30);
    });

    it('debe ejecutar anti-tampering y sobreescribir precios alterados por el comensal', () => {
      // 1. Arrange
      const menuSchema: OptionGroup[] = [
        {
          name: 'Tamaño',
          type: 'single_choice',
          required: true,
          choices: [{ label: 'Familiar', price_modifier: 80 }],
        },
      ];

      // Comensal o atacante intenta enviar price_modifier: 0 para pagar menos
      const hackedSelection = [
        { group_name: 'Tamaño', choice_label: 'Familiar', price_modifier: 0 },
      ];

      // 2. Act
      const validation = validateAndResolveModifiers(menuSchema, hackedSelection, 'Pizza');

      // 3. Assert: Sobrescribe determinísticamente con el catálogo oficial
      expect(validation.additionalCost).toBe(80);
      expect(validation.resolvedModifiers[0]?.price_modifier).toBe(80);
    });

    it('debe rechazar si se violan restricciones del Worker (grupo obligatorio faltante o múltiples en single_choice)', () => {
      const menuSchema: OptionGroup[] = [
        {
          name: 'Tamaño',
          type: 'single_choice',
          required: true,
          choices: [
            { label: 'Chica', price_modifier: 0 },
            { label: 'Grande', price_modifier: 50 },
          ],
        },
      ];

      // Violación 1: Omite grupo obligatorio
      expect(() => {
        validateAndResolveModifiers(menuSchema, [], 'Pizza');
      }).toThrowError(/es obligatorio/);

      // Violación 2: Envía 2 opciones en single_choice
      expect(() => {
        validateAndResolveModifiers(
          menuSchema,
          [
            { group_name: 'Tamaño', choice_label: 'Chica' },
            { group_name: 'Tamaño', choice_label: 'Grande' },
          ],
          'Pizza'
        );
      }).toThrowError(/solo permite seleccionar una sola opción/);
    });
  });

  // ==========================================================================
  // 6. OptionsSchemaBuilder UI Component Rendering & Interaction Logic
  // ==========================================================================
  describe('6. OptionsSchemaBuilder UI Component Rendering & Interaction Logic', () => {
    it('debe renderizar estado vacío amigable cuando el esquema tiene 0 grupos', () => {
      // 1. Arrange & Act
      const html = ReactDOMServer.renderToString(
        React.createElement(OptionsSchemaBuilder, {
          value: [],
          onChange: () => {},
        })
      );

      // 2. Assert
      expect(html).toContain('Este platillo no tiene modificadores ni grupos de opciones');
      expect(html).toContain('Agregar Primer Grupo');
      expect(html).toContain('Modificadores &amp; Opciones (0)');
    });

    it('debe renderizar grupos con nombres, selector de tipo y modificadores formateados', () => {
      // 1. Arrange
      const groups: OptionGroup[] = [
        {
          name: 'Tamaño Gourmet',
          type: 'single_choice',
          required: true,
          choices: [
            { label: 'Individual 25cm', price_modifier: 0 },
            { label: 'Familiar 40cm', price_modifier: 75.5 },
          ],
        },
        {
          name: 'Salsas Artesanales',
          type: 'multiple_choice',
          required: false,
          choices: [
            { label: 'Chimichurri de la Casa', price_modifier: 15 },
          ],
        },
      ];

      // 2. Act
      const html = ReactDOMServer.renderToString(
        React.createElement(OptionsSchemaBuilder, {
          value: groups,
          onChange: () => {},
        })
      );

      // 3. Assert
      expect(html).toContain('Modificadores &amp; Opciones (2)');
      expect(html).toContain('Tamaño Gourmet');
      expect(html).toContain('Individual 25cm');
      expect(html).toContain('Familiar 40cm');
      expect(html).toContain('75.5');
      expect(html).toContain('Salsas Artesanales');
      expect(html).toContain('Chimichurri de la Casa');
      expect(html).toContain('Vista Previa para el Cliente');
      expect(html).toContain('Obligatorio');
      expect(html).toContain('Opcional');
    });

    it('debe reflejar visualmente grupos inválidos resaltándolos con error', () => {
      // 1. Arrange: Grupo con nombre vacío y sin opciones (inválido)
      const invalidGroups: OptionGroup[] = [
        {
          name: '',
          type: 'single_choice',
          required: false,
          choices: [] as unknown as [OptionChoice],
        },
      ];

      // 2. Act
      const html = ReactDOMServer.renderToString(
        React.createElement(OptionsSchemaBuilder, {
          value: invalidGroups,
          onChange: () => {},
        })
      );

      // 3. Assert: Debe contener clases de alerta visual
      expect(html).toContain('border-alert-crimson');
    });

    it('debe respetar el estado disabled bloqueando controles', () => {
      // 1. Arrange
      const groups: OptionGroup[] = [
        {
          name: 'Bebidas',
          type: 'single_choice',
          required: false,
          choices: [{ label: 'Refresco', price_modifier: 25 }],
        },
      ];

      // 2. Act
      const html = ReactDOMServer.renderToString(
        React.createElement(OptionsSchemaBuilder, {
          value: groups,
          onChange: () => {},
          disabled: true,
        })
      );

      // 3. Assert
      expect(html).toContain('disabled');
    });

    it('debe simular operaciones puras de mutación del estado del constructor (builder logic)', () => {
      // 1. Estado inicial vacío
      let currentSchema: OptionGroup[] = [];

      // 2. Agregar Grupo 1
      const newGroup: OptionGroup = {
        name: 'Masa',
        type: 'single_choice',
        required: true,
        choices: [{ label: 'Delgada', price_modifier: 0 }],
      };
      currentSchema = [...currentSchema, newGroup];
      expect(currentSchema).toHaveLength(1);
      expect(optionsSchema.safeParse(currentSchema).success).toBe(true);

      // 3. Agregar Choice al Grupo 1
      const group0 = currentSchema[0];
      expect(group0).toBeDefined();
      if (group0) {
        currentSchema = currentSchema.map((g, idx) =>
          idx === 0
            ? {
                ...g,
                choices: [...g.choices, { label: 'Gruesa', price_modifier: 15 }],
              }
            : g
        );
      }
      expect(currentSchema[0]?.choices).toHaveLength(2);
      expect(currentSchema[0]?.choices[1]?.price_modifier).toBe(15);

      // 4. Actualizar precio de una opción
      currentSchema = currentSchema.map((g, idx) =>
        idx === 0
          ? {
              ...g,
              choices: g.choices.map((c, cIdx) =>
                cIdx === 1 ? { ...c, price_modifier: 25 } : c
              ),
            }
          : g
      );
      expect(currentSchema[0]?.choices[1]?.price_modifier).toBe(25);

      // 5. Eliminar opción
      currentSchema = currentSchema.map((g, idx) =>
        idx === 0
          ? {
              ...g,
              choices: g.choices.filter((_, cIdx) => cIdx !== 0),
            }
          : g
      );
      expect(currentSchema[0]?.choices).toHaveLength(1);
      expect(currentSchema[0]?.choices[0]?.label).toBe('Gruesa');

      // 6. Eliminar grupo
      currentSchema = currentSchema.filter((_, idx) => idx !== 0);
      expect(currentSchema).toHaveLength(0);
      expect(optionsSchema.safeParse(currentSchema).success).toBe(true);
    });
  });
});
