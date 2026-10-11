import { z } from 'zod';
import { optionGroupSchema } from '../../schemas/database';
import { type OptionGroup, type OptionChoice, type SelectedOption } from '../../types/database';
import { ValidationError } from '../../utils/errors';

export interface RawSelectedOption {
  group_name?: string;
  choice_label?: string;
  group?: string;
  label?: string;
  name?: string;
  choice?: string;
  value?: string;
  price_modifier?: number;
}

export interface ResolvedModifier {
  group_name: string;
  choice_label: string;
  price_modifier: number;
  group: string;
  label: string;
}

export interface ModifierValidationResult {
  resolvedModifiers: ResolvedModifier[];
  additionalCost: number;
  validatedOptions: SelectedOption[];
  totalOptionsModifier: number;
}

/**
 * Valida determinísticamente que las opciones/modificadores seleccionados correspondan fielmente
 * al options_schema oficial del producto en Supabase.
 *
 * Aplica:
 * - Detección de grupos existentes en el options_schema.
 * - Validación de opciones/choices permitidas dentro de cada grupo.
 * - Enforzamiento de grupos obligatorios (required: true).
 * - Enforzamiento de grupos de selección única (single_choice) vs múltiple (multiple_choice).
 * - Sobrescritura anti-tampering del modificador de precio con el valor oficial del catálogo.
 * - Rechazo con ValidationError y mensaje descriptivo en español ante cualquier discrepancia.
 */
export function validateAndResolveModifiers(
  optionsSchema: unknown,
  optionsSelected: unknown,
  productName: string = 'el producto'
): ModifierValidationResult {
  // 1. Parsear options_schema del producto
  const optionGroups = parseOptionGroups(optionsSchema);

  // 2. Normalizar opciones seleccionadas del llamador
  const normalizedSelections = normalizeSelectedOptions(optionsSelected);

  // Caso 1: El producto no tiene grupos de opciones configurados
  if (optionGroups.length === 0) {
    if (normalizedSelections.length > 0) {
      throw new ValidationError(
        `El producto '${productName}' no acepta opciones ni modificadores de personalización.`
      );
    }
    return {
      resolvedModifiers: [],
      additionalCost: 0,
      validatedOptions: [],
      totalOptionsModifier: 0,
    };
  }

  // Caso 2: El producto sí tiene grupos de opciones
  const groupSelections = new Map<string, ResolvedModifier[]>();
  const resolvedList: ResolvedModifier[] = [];
  let totalAdditionalCost = 0;

  for (const raw of normalizedSelections) {
    const rawGroupName =
      typeof raw.group_name === 'string' && raw.group_name.trim() !== ''
        ? raw.group_name.trim()
        : typeof raw.group === 'string' && raw.group.trim() !== ''
        ? raw.group.trim()
        : typeof raw.name === 'string' && raw.name.trim() !== ''
        ? raw.name.trim()
        : '';

    const rawChoiceLabel =
      typeof raw.choice_label === 'string' && raw.choice_label.trim() !== ''
        ? raw.choice_label.trim()
        : typeof raw.label === 'string' && raw.label.trim() !== ''
        ? raw.label.trim()
        : typeof raw.choice === 'string' && raw.choice.trim() !== ''
        ? raw.choice.trim()
        : typeof raw.value === 'string' && raw.value.trim() !== ''
        ? raw.value.trim()
        : '';

    if (!rawGroupName || !rawChoiceLabel) {
      throw new ValidationError(
        'Cada opción seleccionada debe especificar el nombre del grupo y la opción elegida.'
      );
    }

    // Validar existencia de grupo (case-insensitive)
    const normGroupName = rawGroupName.toLowerCase();
    const group = optionGroups.find(
      (g) => g.name.trim().toLowerCase() === normGroupName
    );

    if (!group) {
      const validGroupNames = optionGroups.map((g) => `'${g.name}'`).join(', ');
      throw new ValidationError(
        `El grupo de opciones '${rawGroupName}' no existe para '${productName}'. Grupos válidos: ${validGroupNames}.`
      );
    }

    // Validar existencia de opción dentro del grupo (case-insensitive)
    const normChoiceLabel = rawChoiceLabel.toLowerCase();
    const choice = group.choices.find(
      (c) => c.label.trim().toLowerCase() === normChoiceLabel
    );

    if (!choice) {
      const validChoices = group.choices
        .map((c) => `'${c.label}' (+$${Number(c.price_modifier || 0).toFixed(2)})`)
        .join(', ');
      throw new ValidationError(
        `La opción '${rawChoiceLabel}' no es válida para el grupo '${group.name}' en '${productName}'. Opciones válidas: ${validChoices}.`
      );
    }

    // Precio oficial autoritativo (anti-tampering: se ignora el precio provisto por el llamador)
    const officialPrice = Number(Number(choice.price_modifier || 0).toFixed(2));

    const resolved: ResolvedModifier = {
      group_name: group.name,
      choice_label: choice.label,
      price_modifier: officialPrice,
      group: group.name,
      label: choice.label,
    };

    resolvedList.push(resolved);
    totalAdditionalCost = Number((totalAdditionalCost + officialPrice).toFixed(2));

    const currentInGroup = groupSelections.get(group.name) || [];
    currentInGroup.push(resolved);
    groupSelections.set(group.name, currentInGroup);
  }

  // 3. Validar restricciones por grupo (required y single_choice)
  for (const group of optionGroups) {
    const selections = groupSelections.get(group.name) || [];

    if (group.required && selections.length === 0) {
      const validChoices = group.choices.map((c) => `'${c.label}'`).join(', ');
      throw new ValidationError(
        `El grupo de opciones '${group.name}' es obligatorio para '${productName}'. Opciones disponibles: ${validChoices}.`
      );
    }

    if (group.type === 'single_choice' && selections.length > 1) {
      throw new ValidationError(
        `El grupo '${group.name}' solo permite seleccionar una sola opción ('single_choice') y se recibieron ${selections.length}.`
      );
    }
  }

  const roundedAdditionalCost = Number(totalAdditionalCost.toFixed(2));
  const validatedOptions: SelectedOption[] = resolvedList.map((r) => ({
    group_name: r.group_name,
    choice_label: r.choice_label,
    price_modifier: r.price_modifier,
  }));

  return {
    resolvedModifiers: resolvedList,
    additionalCost: roundedAdditionalCost,
    validatedOptions,
    totalOptionsModifier: roundedAdditionalCost,
  };
}

/**
 * Parsea y normaliza el campo options_schema de Supabase o API externa.
 */
function parseOptionGroups(schema: unknown): OptionGroup[] {
  if (!schema) return [];

  let rawList: unknown = schema;
  if (typeof schema === 'string') {
    const trimmed = schema.trim();
    if (!trimmed || trimmed === '[]') return [];
    try {
      rawList = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(rawList) || rawList.length === 0) {
    return [];
  }

  // Intento de parseo formal con Zod
  const parsed = z.array(optionGroupSchema).safeParse(rawList);
  if (parsed.success) {
    return parsed.data.map((g) => ({
      name: g.name,
      type: g.type,
      required: Boolean(g.required),
      choices: g.choices.map((c) => ({
        label: c.label,
        price_modifier: typeof c.price_modifier === 'number' ? c.price_modifier : 0,
      })),
    }));
  }

  // Fallback defensivo para esquemas flexibles con campos omitidos
  const fallbackGroups: OptionGroup[] = [];
  for (const item of rawList) {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const name = typeof obj.name === 'string' ? obj.name.trim() : '';
      if (!name) continue;

      const type =
        obj.type === 'multiple_choice' ? 'multiple_choice' : 'single_choice';
      const required = Boolean(obj.required);
      const choicesRaw = Array.isArray(obj.choices) ? obj.choices : [];

      const choices: OptionGroup['choices'] = [];
      for (const c of choicesRaw) {
        if (c && typeof c === 'object') {
          const cObj = c as Record<string, unknown>;
          const label = typeof cObj.label === 'string' ? cObj.label.trim() : '';
          const priceModifier =
            typeof cObj.price_modifier === 'number'
              ? cObj.price_modifier
              : typeof cObj.price === 'number'
              ? cObj.price
              : 0;

          if (label) {
            choices.push({
              label,
              price_modifier: Math.max(0, Number(priceModifier.toFixed(2))),
            });
          }
        }
      }

      if (choices.length > 0) {
        fallbackGroups.push({
          name,
          type,
          required,
          choices,
        });
      }
    }
  }

  return fallbackGroups;
}

/**
 * Normaliza la entrada de opciones seleccionadas a un array de RawSelectedOption.
 */
function normalizeSelectedOptions(selected: unknown): RawSelectedOption[] {
  if (!selected) return [];

  let rawList: unknown = selected;
  if (typeof selected === 'string') {
    const trimmed = selected.trim();
    if (!trimmed || trimmed === '[]') return [];
    try {
      rawList = JSON.parse(trimmed);
    } catch {
      throw new ValidationError('El formato de opciones seleccionadas es inválido.');
    }
  }

  if (typeof rawList === 'object' && rawList !== null && !Array.isArray(rawList)) {
    rawList = [rawList];
  }

  if (!Array.isArray(rawList)) {
    return [];
  }

  return rawList as RawSelectedOption[];
}
