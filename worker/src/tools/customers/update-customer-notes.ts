import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from '../interface';
import { CustomerRepository } from '../../services/db/customer-repository';
import { notesMdSchema } from '../../schemas/database';

export const updateCustomerNotesToolSchema = z.object({
  notes_md: notesMdSchema.describe(
    'Contenido completo en Markdown con las notas y preferencias del cliente (máx 5,000 caracteres)'
  ),
});

export type UpdateCustomerNotesToolInput = z.infer<typeof updateCustomerNotesToolSchema>;

export interface UpdateCustomerNotesToolOutput {
  success: boolean;
  customer_id: string;
  notes_md: string;
  message: string;
}

export const updateCustomerNotesTool: ToolDefinition<
  UpdateCustomerNotesToolInput,
  UpdateCustomerNotesToolOutput
> = {
  name: 'update_customer_notes',
  description:
    'Actualiza el bloc de notas Markdown del cliente ("Bloc de Notas del Mesero") guardando preferencias y detalles permanentes.',
  parameters: updateCustomerNotesToolSchema,

  async execute(
    input: UpdateCustomerNotesToolInput,
    context: ToolContext
  ): Promise<UpdateCustomerNotesToolOutput> {
    const customerRepo = new CustomerRepository(context.db);
    const updated = await customerRepo.updateNotesMd(
      context.restaurantId,
      context.customerId,
      input.notes_md
    );

    return {
      success: true,
      customer_id: updated.id,
      notes_md: updated.notes_md,
      message: 'Bloc de notas del cliente actualizado exitosamente.',
    };
  },
};
