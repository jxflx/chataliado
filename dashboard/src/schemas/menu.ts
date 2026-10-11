import { z } from 'zod';

/**
 * Esquemas Zod para Menú y Catálogo Interactivo.
 * Compartidos entre Server Actions, validación en boundaries y componentes UI.
 */

export const uuidSchema = z.string().uuid('ID inválido: debe ser UUID');

/**
 * 1. Opción individual dentro de un grupo de modificadores (ej. "Grande", "Queso Extra")
 */
export const optionChoiceSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'El nombre de la opción es requerido')
    .max(100, 'El nombre de la opción no puede exceder 100 caracteres'),
  price_modifier: z
    .number()
    .min(0, 'El modificador de precio no puede ser negativo'),
});

/**
 * 2. Grupo de opciones / variantes (ej. "Tamaño de Pizza", "Ingredientes Extra")
 */
export const optionGroupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'El nombre del grupo es requerido')
      .max(100, 'El nombre del grupo no puede exceder 100 caracteres'),
    type: z.enum(['single_choice', 'multiple_choice']),
    required: z.boolean().default(false),
    min_selectable: z.number().int().min(0, 'El mínimo seleccionable no puede ser negativo').optional(),
    max_selectable: z.number().int().min(1, 'El máximo seleccionable debe ser al menos 1').optional(),
    choices: z
      .array(optionChoiceSchema)
      .min(1, 'El grupo debe contener al menos una opción'),
  })
  .superRefine((data, ctx) => {
    // 1. Validar opciones duplicadas dentro del grupo (case-insensitive)
    const seenChoices = new Set<string>();
    data.choices.forEach((choice, idx) => {
      const normLabel = choice.label.trim().toLowerCase();
      if (normLabel) {
        if (seenChoices.has(normLabel)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `La opción '${choice.label}' está duplicada en este grupo`,
            path: ['choices', idx, 'label'],
          });
        }
        seenChoices.add(normLabel);
      }
    });

    // 2. Validar coherencia entre min_selectable y max_selectable
    if (data.min_selectable !== undefined && data.max_selectable !== undefined) {
      if (data.min_selectable > data.max_selectable) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El mínimo seleccionable no puede ser mayor que el máximo seleccionable',
          path: ['min_selectable'],
        });
      }
    }

    // 3. Validar que max_selectable no exceda la cantidad de choices
    if (data.max_selectable !== undefined && data.choices.length > 0) {
      if (data.max_selectable > data.choices.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El máximo seleccionable no puede exceder el número de opciones disponibles',
          path: ['max_selectable'],
        });
      }
    }
  });

/**
 * 3. Esquema completo de opciones para un ítem de menú (Array de grupos)
 */
export const optionsSchema = z
  .array(optionGroupSchema)
  .superRefine((groups, ctx) => {
    const seenGroupNames = new Set<string>();
    groups.forEach((group, idx) => {
      const normName = group.name.trim().toLowerCase();
      if (normName) {
        if (seenGroupNames.has(normName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `El grupo '${group.name}' tiene un nombre duplicado`,
            path: [idx, 'name'],
          });
        }
        seenGroupNames.add(normName);
      }
    });
  });

/**
 * 4. Creación y actualización de categorías
 */
export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre de la categoría es requerido')
    .max(100, 'El nombre no puede exceder 100 caracteres'),
  sort_order: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
});

export const updateCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre no puede estar vacío')
    .max(100, 'El nombre no puede exceder 100 caracteres')
    .optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

/**
 * 5. Creación y actualización de platillos / ítems de menú
 */
export const createMenuItemSchema = z.object({
  category_id: uuidSchema.nullable().optional(),
  name: z
    .string()
    .trim()
    .min(1, 'El nombre del platillo es requerido')
    .max(200, 'El nombre no puede exceder 200 caracteres'),
  description: z
    .string()
    .max(1000, 'La descripción no puede exceder 1,000 caracteres')
    .optional()
    .default(''),
  price: z
    .number()
    .min(0, 'El precio no puede ser negativo'),
  options_schema: optionsSchema.optional().default([]),
  is_available: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).optional().default(0),
});

export const updateMenuItemSchema = z.object({
  category_id: uuidSchema.nullable().optional(),
  name: z
    .string()
    .trim()
    .min(1, 'El nombre del platillo no puede estar vacío')
    .max(200, 'El nombre no puede exceder 200 caracteres')
    .optional(),
  description: z
    .string()
    .max(1000, 'La descripción no puede exceder 1,000 caracteres')
    .optional(),
  price: z
    .number()
    .min(0, 'El precio no puede ser negativo')
    .optional(),
  options_schema: optionsSchema.optional(),
  is_available: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

/**
 * 6. Reordenamiento por lotes (Array de UUIDs ordenados)
 */
export const reorderSchema = z.array(uuidSchema);

/**
 * Tipos TypeScript inferidos
 */
export type OptionChoice = z.infer<typeof optionChoiceSchema>;
export type OptionGroup = z.infer<typeof optionGroupSchema>;
export type OptionsSchema = z.infer<typeof optionsSchema>;
export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
export type CreateMenuItemInput = z.input<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.input<typeof updateMenuItemSchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;

/**
 * 7. Funciones auxiliares de validación e integridad para el constructor de options_schema
 */

/**
 * Detecta nombres de grupos duplicados en un options_schema (case-insensitive).
 */
export function findDuplicateGroupNames(groups: OptionGroup[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const g of groups) {
    const norm = g.name.trim().toLowerCase();
    if (norm) {
      if (seen.has(norm)) {
        duplicates.add(g.name.trim());
      } else {
        seen.add(norm);
      }
    }
  }
  return Array.from(duplicates);
}

/**
 * Detecta labels de opciones duplicadas dentro de un grupo (case-insensitive).
 */
export function findDuplicateChoiceLabels(group: OptionGroup): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const c of group.choices) {
    const norm = c.label.trim().toLowerCase();
    if (norm) {
      if (seen.has(norm)) {
        duplicates.add(c.label.trim());
      } else {
        seen.add(norm);
      }
    }
  }
  return Array.from(duplicates);
}

/**
 * Validador exhaustivo de options_schema con retorno estructurado de errores amigables.
 */
export function validateOptionsSchema(schema: unknown): {
  success: boolean;
  data?: OptionGroup[];
  errors: string[];
} {
  const parseResult = optionsSchema.safeParse(schema);
  if (parseResult.success) {
    return { success: true, data: parseResult.data, errors: [] };
  }
  return {
    success: false,
    errors: parseResult.error.issues.map((issue) => issue.message),
  };
}

