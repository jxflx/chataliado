import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database, type Customer } from '../../types/database';
import { OrderRepository } from '../db/order-repository';
import { CustomerRepository } from '../db/customer-repository';
import { uuidSchema } from '../../schemas/database';

export interface ConsolidateMemoryInput {
  restaurantId: string;
  customerId: string;
  orderId: string;
  deliveryAddress: string;
  conversationId?: string;
  conversationMessages?: Array<{ role: string; content: string }>;
}

export interface ConsolidateMemoryResult {
  success: boolean;
  notes_md: string;
  customer_id: string;
  address_default?: string | null;
}

/**
 * Extrae notas de alergias o preferencias explícitas mencionadas por el usuario en la conversación.
 */
function extractConversationNotes(messages?: Array<{ role: string; content: string }>): {
  allergies: string[];
  preferences: string[];
} {
  const allergies: string[] = [];
  const preferences: string[] = [];

  if (!messages || messages.length === 0) return { allergies, preferences };

  const userTexts = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content.toLowerCase());

  for (const text of userTexts) {
    if (text.includes('sin queso')) {
      allergies.push('Sin queso');
    }
    if (text.includes('sin cebolla')) {
      allergies.push('Sin cebolla');
    }
    if (text.includes('sin champiñ') || text.includes('sin hongo')) {
      allergies.push('Sin champiñones');
    }
    if (text.includes('celíac') || text.includes('celiac') || text.includes('sin gluten')) {
      allergies.push('Celíaco / Sin gluten');
    }
    if (text.includes('alérgic') || text.includes('alergic')) {
      allergies.push('Alérgico');
    }
    if (text.includes('salsa aparte')) {
      preferences.push('Salsa aparte');
    }
    if (text.includes('masa delgada')) {
      preferences.push('Masa delgada');
    }
    if (text.includes('bien cocida') || text.includes('doradita') || text.includes('crujiente')) {
      preferences.push('Bien cocida');
    }
  }

  return {
    allergies: Array.from(new Set(allergies)),
    preferences: Array.from(new Set(preferences)),
  };
}

/**
 * Consolida la memoria del cliente en un formato estructurado Markdown de 4 bloques (máximo 150 palabras)
 * tras la confirmación exitosa de un pedido.
 */
export async function consolidateCustomerMemory(
  db: SupabaseClient<Database>,
  input: ConsolidateMemoryInput
): Promise<ConsolidateMemoryResult> {
  const restaurantId = uuidSchema.parse(input.restaurantId);
  const customerId = uuidSchema.parse(input.customerId);
  const orderId = uuidSchema.parse(input.orderId);

  const orderRepo = new OrderRepository(db);
  const customerRepo = new CustomerRepository(db);

  // 1. Obtener cliente, resumen del pedido y mensajes del usuario
  const messagesPromise = input.conversationMessages
    ? Promise.resolve(input.conversationMessages)
    : input.conversationId
    ? db
        .from('messages')
        .select('role, content')
        .eq('conversation_id', input.conversationId)
        .eq('restaurant_id', restaurantId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data }) => (data as Array<{ role: string; content: string }>) || [])
    : Promise.resolve([]);

  const [customer, summary, loadedMessages] = await Promise.all([
    db.from('customers').select('*').eq('id', customerId).eq('restaurant_id', restaurantId).maybeSingle(),
    orderRepo.getOrderSummary(restaurantId, orderId),
    messagesPromise,
  ]);

  const currentCustomer = (customer?.data as Customer) || null;
  const existingNotes = currentCustomer?.notes_md || '';

  // 2. Extraer ítems confirmados
  let orderSummaryText = 'Sin ítems detallados';
  if (summary && summary.items && summary.items.length > 0) {
    const productIds = summary.items.map((i) => i.product_id);
    const { data: products } = await db
      .from('menu_items')
      .select('id, name')
      .in('id', productIds)
      .eq('restaurant_id', restaurantId);

    const productNames = new Map<string, string>();
    if (products) {
      for (const p of products) productNames.set(p.id, p.name);
    }

    orderSummaryText = summary.items
      .map((it) => {
        const pName = productNames.get(it.product_id) || 'Producto';
        let optStr = '';
        if (it.options_selected && Array.isArray(it.options_selected) && it.options_selected.length > 0) {
          optStr = ` (${(it.options_selected as Array<{ choice_label?: string }>).map((o) => o.choice_label).filter(Boolean).join(', ')})`;
        }
        return `${it.quantity}x ${pName}${optStr}`;
      })
      .join(', ');
  }

  // 3. Extraer detalles de la conversación
  const msgsToAnalyze = input.conversationMessages || (await messagesPromise);
  const { allergies: detectedAllergies, preferences: detectedPrefs } = extractConversationNotes(
    msgsToAnalyze
  );

  // 4. Preservar y fusionar secciones existentes
  let deliverySection = input.deliveryAddress;
  let allergiesSection = detectedAllergies.length > 0 ? detectedAllergies.join('; ') : 'Ninguna registrada';
  let prefsSection = detectedPrefs.length > 0 ? detectedPrefs.join('; ') : 'Estándar';

  if (existingNotes.includes('📍 **Entrega:**') || existingNotes.includes('⚠️ **Restricciones/Alergias:**')) {
    // Si ya existían notas estructuradas, fusionar respetando las anteriores
    if (existingNotes.includes('⚠️ **Restricciones/Alergias:**') && detectedAllergies.length === 0) {
      const match = existingNotes.match(/⚠️ \*\*Restricciones\/Alergias:\*\* ([^\n]+)/);
      if (match && match[1] && match[1].trim() !== 'Ninguna registrada') {
        allergiesSection = match[1].trim();
      }
    }
    if (existingNotes.includes('🍕 **Preferencias Habituales:**') && detectedPrefs.length === 0) {
      const match = existingNotes.match(/🍕 \*\*Preferencias Habituales:\*\* ([^\n]+)/);
      if (match && match[1] && match[1].trim() !== 'Estándar') {
        prefsSection = match[1].trim();
      }
    }
  } else if (existingNotes.trim() !== '') {
    // Si habían notas antiguas no estructuradas, conservarlas como preferencia
    prefsSection = `${existingNotes.trim()} ${prefsSection !== 'Estándar' ? `(${prefsSection})` : ''}`.trim();
  }

  // 5. Construir plantilla Markdown consolidada
  const consolidatedMarkdown = [
    `- 📍 **Entrega:** ${deliverySection}`,
    `- ⚠️ **Restricciones/Alergias:** ${allergiesSection}`,
    `- 🍕 **Preferencias Habituales:** ${prefsSection}`,
    `- 📦 **Último Pedido Confirmado:** ${orderSummaryText}`,
  ].join('\n');

  // 6. Actualizar notas en BD
  await customerRepo.updateNotesMd(restaurantId, customerId, consolidatedMarkdown);

  // 7. Actualizar dirección predeterminada si es entrega a domicilio
  let newDefaultAddress = currentCustomer?.address_default;
  if (
    input.deliveryAddress &&
    !input.deliveryAddress.toLowerCase().includes('sucursal') &&
    !input.deliveryAddress.toLowerCase().includes('recoger')
  ) {
    newDefaultAddress = input.deliveryAddress;
    await db
      .from('customers')
      .update({ address_default: newDefaultAddress })
      .eq('id', customerId)
      .eq('restaurant_id', restaurantId);
  }

  return {
    success: true,
    notes_md: consolidatedMarkdown,
    customer_id: customerId,
    address_default: newDefaultAddress,
  };
}
