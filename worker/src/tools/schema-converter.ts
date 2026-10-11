import { z } from 'zod';

/**
 * Conversor determinista y recursivo de esquemas Zod a esquemas JSON estándar (OpenAI Function Calling).
 * Compatible con Cloudflare Workers runtime sin dependencias pesadas externas.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (!schema || !(schema instanceof z.ZodType)) {
    return { type: 'object', properties: {} };
  }

  const def = schema._def as Record<string, unknown>;
  const typeName = (def.typeName as string) || schema.constructor.name;
  const description = schema.description;

  const base: Record<string, unknown> = {};
  if (description) {
    base.description = description;
  }

  switch (typeName) {
    case 'ZodString': {
      return { ...base, type: 'string' };
    }

    case 'ZodNumber': {
      const isInt = Array.isArray((schema as z.ZodNumber)._def.checks) &&
        (schema as z.ZodNumber)._def.checks.some((c: Record<string, unknown>) => c.kind === 'int');
      return { ...base, type: isInt ? 'integer' : 'number' };
    }

    case 'ZodBoolean': {
      return { ...base, type: 'boolean' };
    }

    case 'ZodEnum': {
      const values = (schema as z.ZodEnum<[string, ...string[]]>)._def.values;
      return { ...base, type: 'string', enum: values };
    }

    case 'ZodNativeEnum': {
      const enumObj = (schema as unknown as { _def: { values: Record<string, string | number> } })._def.values;
      const values = Object.values(enumObj).filter((v) => typeof v === 'string' || typeof v === 'number');
      return { ...base, enum: values };
    }

    case 'ZodArray': {
      const inner = (schema as z.ZodArray<z.ZodTypeAny>)._def.type;
      return {
        ...base,
        type: 'array',
        items: zodToJsonSchema(inner),
      };
    }

    case 'ZodObject': {
      const shapeObj = typeof (schema as z.ZodObject<z.ZodRawShape>)._def.shape === 'function'
        ? (schema as z.ZodObject<z.ZodRawShape>)._def.shape()
        : (schema as z.ZodObject<z.ZodRawShape>)._def.shape;

      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, propSchema] of Object.entries(shapeObj)) {
        properties[key] = zodToJsonSchema(propSchema as z.ZodTypeAny);

        if (!isOptionalSchema(propSchema as z.ZodTypeAny)) {
          required.push(key);
        }
      }

      const result: Record<string, unknown> = {
        ...base,
        type: 'object',
        properties,
      };

      if (required.length > 0) {
        result.required = required;
      }
      result.additionalProperties = false;

      return result;
    }

    case 'ZodOptional': {
      const inner = (schema as z.ZodOptional<z.ZodTypeAny>)._def.innerType;
      const innerSchema = zodToJsonSchema(inner);
      if (description && !innerSchema.description) {
        innerSchema.description = description;
      }
      return innerSchema;
    }

    case 'ZodDefault': {
      const inner = (schema as z.ZodDefault<z.ZodTypeAny>)._def.innerType;
      const innerSchema = zodToJsonSchema(inner);
      try {
        const defaultVal = (schema as z.ZodDefault<z.ZodTypeAny>)._def.defaultValue();
        innerSchema.default = defaultVal;
      } catch {
        // omit default value if evaluation fails
      }
      if (description && !innerSchema.description) {
        innerSchema.description = description;
      }
      return innerSchema;
    }

    case 'ZodNullable': {
      const inner = (schema as z.ZodNullable<z.ZodTypeAny>)._def.innerType;
      const innerSchema = zodToJsonSchema(inner);
      innerSchema.nullable = true;
      if (description && !innerSchema.description) {
        innerSchema.description = description;
      }
      return innerSchema;
    }

    case 'ZodEffects': {
      const inner = (schema as z.ZodEffects<z.ZodTypeAny>)._def.schema;
      const innerSchema = zodToJsonSchema(inner);
      if (description && !innerSchema.description) {
        innerSchema.description = description;
      }
      return innerSchema;
    }

    case 'ZodPipeline': {
      const inner = (schema as unknown as { _def: { in: z.ZodTypeAny } })._def.in;
      return zodToJsonSchema(inner);
    }

    case 'ZodRecord': {
      const valueType = (schema as z.ZodRecord)._def.valueType;
      return {
        ...base,
        type: 'object',
        additionalProperties: zodToJsonSchema(valueType),
      };
    }

    case 'ZodUnion': {
      const options = (schema as z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]>)._def.options;
      return {
        ...base,
        anyOf: options.map((opt) => zodToJsonSchema(opt)),
      };
    }

    default: {
      return { ...base, type: 'object' };
    }
  }
}

/**
 * Determina si un campo de Zod es opcional o tiene valor por defecto (por lo tanto no requerido).
 */
function isOptionalSchema(schema: z.ZodTypeAny): boolean {
  const typeName = (schema._def as Record<string, unknown>).typeName as string;
  if (typeName === 'ZodOptional' || typeName === 'ZodDefault') {
    return true;
  }
  if (typeName === 'ZodEffects') {
    return isOptionalSchema((schema as z.ZodEffects<z.ZodTypeAny>)._def.schema);
  }
  return false;
}
