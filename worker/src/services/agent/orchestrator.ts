import { type SupabaseClient } from '@supabase/supabase-js';
import {
  type Database,
  type Restaurant,
  type Customer,
  type ConversationMode,
  type Message,
} from '../../types/database';
import { type Env } from '../../types/env';
import {
  type LLMProvider,
  type LLMMessage,
  type LLMToolCall,
} from '../../providers/llm/interface';
import { type WhatsAppProvider, type SendMessageResult } from '../../providers/whatsapp/interface';
import { type ChatwootProvider } from '../../providers/chatwoot/interface';
import { ChatwootHttpClient } from '../../providers/chatwoot/client';
import { ConversationRepository } from '../db/conversation-repository';
import { MessageRepository } from '../db/message-repository';
import { RestaurantRepository } from '../db/restaurant-repository';
import { CustomerRepository } from '../db/customer-repository';
import { OrderRepository } from '../db/order-repository';
import { ToolContext } from '../../tools/interface';
import { getLLMToolDefinitions, executeTool } from '../../tools/registry';
import { PromptBuilder } from './prompt-builder';

export interface AgentOrchestratorDeps {
  db: SupabaseClient<Database>;
  env: Env;
  llmProvider: LLMProvider;
  whatsAppProvider?: WhatsAppProvider;
  chatwootProvider?: ChatwootProvider;
  conversationRepo?: ConversationRepository;
  messageRepo?: MessageRepository;
  restaurantRepo?: RestaurantRepository;
  customerRepo?: CustomerRepository;
  orderRepo?: OrderRepository;
}

export interface ProcessMessageInput {
  restaurant: Restaurant;
  customer: Customer;
  messageText: string;
  providerMessageId?: string | null;
  conversationId?: string;
}

export type ProcessMessageResult =
  | { status: 'silenced_human_mode'; conversationId: string; messageId?: string }
  | { status: 'responded'; conversationId: string; replyText: string; toolCallsExecuted?: number; messageId?: string }
  | { status: 'max_iterations_reached'; conversationId: string; replyText: string; toolCallsExecuted?: number; messageId?: string }
  | { status: 'error'; conversationId: string; error: string; replyText?: string };

const MAX_TOOL_ITERATIONS = 5;

/**
 * Detecta heurísticamente la herramienta a partir de la estructura del payload.
 */
function detectToolFromPayload(payload: Record<string, unknown>): string | undefined {
  if ('categories' in payload && 'items' in payload) return 'get_menu';
  if ('product' in payload) return 'get_product';
  if ('current_cart' in payload) {
    if ('removed_item_id' in payload) return 'remove_order_item';
    if ('new_quantity' in payload) return 'update_order_item_quantity';
    return 'add_order_item';
  }
  if ('order' in payload) {
    const o = payload.order as Record<string, unknown> | undefined;
    return o && 'items' in o ? 'get_current_order' : 'create_order';
  }
  if ('notes_md' in payload || 'customer' in payload) {
    return 'message' in payload && 'customer_id' in payload ? 'update_customer_notes' : 'get_customer';
  }
  if ('mode' in payload && payload.mode === 'human') return 'handoff_to_human';
  if ('status' in payload && payload.status === 'confirmed') return 'confirm_order';
  return undefined;
}

/**
 * Compacta payloads históricos de respuestas de tools para optimizar el context window del LLM.
 * Preserva el estado esencial (éxito, IDs, contadores, errores) y elimina árboles redundantes.
 * En la ejecución en curso (turno activo), las respuestas permanecen sin podar.
 */
export function pruneToolResponse(rawContent: string, toolName?: string): string {
  if (!rawContent || typeof rawContent !== 'string') return rawContent;

  let parsed: Record<string, unknown>;
  try {
    const json = JSON.parse(rawContent);
    if (!json || typeof json !== 'object' || Array.isArray(json)) return rawContent;
    parsed = json as Record<string, unknown>;
  } catch {
    return rawContent;
  }

  // Errores se preservan íntegros para que el LLM conozca la causa del fallo
  if (parsed.success === false || parsed.error) {
    return JSON.stringify({
      success: false,
      error: typeof parsed.error === 'string' ? parsed.error : 'Error al ejecutar herramienta',
    });
  }

  const effectiveTool = toolName || detectToolFromPayload(parsed);

  switch (effectiveTool) {
    case 'get_menu': {
      const itemsCount = Array.isArray(parsed.items) ? parsed.items.length : 0;
      const categories = Array.isArray(parsed.categories)
        ? parsed.categories.map((c) =>
            typeof c === 'object' && c !== null && 'name' in c ? String((c as { name: unknown }).name) : String(c)
          )
        : [];
      return JSON.stringify({
        status: 'success',
        success: true,
        items_count: itemsCount,
        categories,
        note: '[Menu cached in system prompt]',
      });
    }

    case 'get_product': {
      const prod =
        typeof parsed.product === 'object' && parsed.product !== null
          ? (parsed.product as Record<string, unknown>)
          : parsed;
      return JSON.stringify({
        success: true,
        product_id: prod.id ?? prod.product_id ?? parsed.product_id,
        name: prod.name ?? parsed.name,
        price: prod.price ?? parsed.price,
        note: 'Detalles de producto consultados previamente.',
      });
    }

    case 'create_order': {
      const order =
        typeof parsed.order === 'object' && parsed.order !== null
          ? (parsed.order as Record<string, unknown>)
          : undefined;
      return JSON.stringify({
        success: true,
        order_id: order?.id ?? parsed.order_id,
        status: order?.status ?? parsed.status ?? 'draft',
        note: 'Pedido en borrador creado previamente. El estado actual del carrito está disponible en el System Prompt.',
      });
    }

    case 'add_order_item':
    case 'remove_order_item':
    case 'update_order_item_quantity':
    case 'get_current_order': {
      const order =
        typeof parsed.order === 'object' && parsed.order !== null
          ? (parsed.order as Record<string, unknown>)
          : undefined;
      const itemsCount =
        parsed.items_count ??
        parsed.remaining_items_count ??
        (Array.isArray(order?.items) ? order.items.length : undefined);

      return JSON.stringify({
        success: true,
        order_id: order?.id ?? parsed.order_id,
        item_id: parsed.item_id ?? parsed.removed_item_id,
        items_count: itemsCount,
        order_total: order?.total ?? parsed.order_total ?? parsed.new_total,
        note: 'El estado actual del carrito está disponible en el System Prompt.',
      });
    }

    case 'confirm_order': {
      return JSON.stringify({
        success: true,
        order_id: parsed.order_id,
        status: parsed.status ?? 'confirmed',
        total: parsed.total,
        note: 'Pedido confirmado previamente.',
      });
    }

    case 'get_customer':
    case 'update_customer_notes': {
      const customer =
        typeof parsed.customer === 'object' && parsed.customer !== null
          ? (parsed.customer as Record<string, unknown>)
          : undefined;
      return JSON.stringify({
        success: true,
        customer_id: customer?.id ?? parsed.customer_id,
        note: 'Memoria del cliente sincronizada en el System Prompt.',
      });
    }

    case 'handoff_to_human': {
      return JSON.stringify({
        success: true,
        mode: 'human',
        reason: parsed.reason,
        note: 'Transferido a atención humana.',
      });
    }

    default: {
      if (rawContent.length > 250) {
        return JSON.stringify({
          success: parsed.success ?? true,
          note: 'Respuesta de herramienta histórica compactada.',
        });
      }
      return rawContent;
    }
  }
}

/** Construye la lista de mensajes en formato LLMMessage a partir de la persistencia */
export function buildConversationHistory(
  systemPrompt: string,
  recentMessages: Message[],
  savedUserMsgId: string,
  messageText: string
): LLMMessage[] {
  const history: LLMMessage[] = [{ role: 'system', content: systemPrompt }];
  const hasUserMsg = recentMessages.some((m) => m.id === savedUserMsgId);

  for (const msg of recentMessages) {
    if (msg.role === 'user') {
      history.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      const meta = msg.metadata as { tool_calls?: LLMToolCall[] } | null | undefined;
      if (meta?.tool_calls && meta.tool_calls.length > 0) {
        const isSynthetic = msg.content.startsWith('[Invocando herramientas:');
        history.push({
          role: 'assistant',
          content: isSynthetic ? null : msg.content,
          tool_calls: meta.tool_calls,
        });
      } else {
        history.push({ role: 'assistant', content: msg.content });
      }
    } else if (msg.role === 'tool') {
      const meta = msg.metadata as { tool_call_id?: string; tool_name?: string } | null | undefined;
      const prunedContent = pruneToolResponse(msg.content, meta?.tool_name);
      history.push({
        role: 'tool',
        tool_call_id: meta?.tool_call_id ?? '',
        content: prunedContent,
      });
    } else if (msg.role === 'system') {
      history.push({ role: 'system', content: msg.content });
    } else if (msg.role === 'human_agent') {
      history.push({ role: 'user', content: `[Agente Humano]: ${msg.content}` });
    }
  }

  if (!hasUserMsg && (!recentMessages.length || recentMessages[recentMessages.length - 1]?.content !== messageText)) {
    history.push({ role: 'user', content: messageText });
  }

  return history;
}

/**
 * Orquestador principal del Agente de Inteligencia Artificial para ChatAliado.
 * Gestiona el ciclo de vida conversacional, persistencia multi-tenant,
 * ensamblado dinámico del prompt y el bucle acotado de Tool Calling (máx 5 iteraciones).
 */
export class AgentOrchestrator {
  private readonly db: SupabaseClient<Database>;
  private readonly env: Env;
  private readonly llmProvider: LLMProvider;
  private readonly whatsAppProvider?: WhatsAppProvider;
  private readonly chatwootProvider?: ChatwootProvider;
  private readonly conversationRepo: ConversationRepository;
  private readonly messageRepo: MessageRepository;
  private readonly restaurantRepo: RestaurantRepository;
  private readonly customerRepo: CustomerRepository;
  private readonly orderRepo: OrderRepository;

  constructor(deps: AgentOrchestratorDeps) {
    this.db = deps.db;
    this.env = deps.env;
    this.llmProvider = deps.llmProvider;
    this.whatsAppProvider = deps.whatsAppProvider;
    this.chatwootProvider = deps.chatwootProvider;
    this.conversationRepo = deps.conversationRepo ?? new ConversationRepository(this.db);
    this.messageRepo = deps.messageRepo ?? new MessageRepository(this.db);
    this.restaurantRepo = deps.restaurantRepo ?? new RestaurantRepository(this.db);
    this.customerRepo = deps.customerRepo ?? new CustomerRepository(this.db);
    this.orderRepo = deps.orderRepo ?? new OrderRepository(this.db);
  }

  private async sendWhatsApp(
    restaurantId: string,
    messageId?: string,
    slug?: string | null,
    phone?: string | null,
    text?: string
  ): Promise<SendMessageResult | null> {
    if (this.whatsAppProvider && slug && phone && text) {
      try {
        const result = await this.whatsAppProvider.sendTextMessage(slug, phone, text);
        if (messageId && this.messageRepo && typeof this.messageRepo.updateDeliveryStatus === 'function') {
          try {
            if (result.success) {
              await this.messageRepo.updateDeliveryStatus(restaurantId, {
                messageId,
                status: 'sent',
                providerMessageId: result.messageId,
                rawResponse: result.rawResponse,
              });
            } else {
              await this.messageRepo.updateDeliveryStatus(restaurantId, {
                messageId,
                status: 'failed',
                error: 'WhatsApp delivery rejected by provider',
                rawResponse: result.rawResponse,
              });
            }
          } catch (updateErr) {
            console.error('[AgentOrchestrator] Error actualizando delivery_status exitoso/fallido:', updateErr);
          }
        }
        return result;
      } catch (waErr) {
        console.error('[AgentOrchestrator] Error enviando WhatsApp reply:', waErr);
        if (messageId && this.messageRepo && typeof this.messageRepo.updateDeliveryStatus === 'function') {
          try {
            await this.messageRepo.updateDeliveryStatus(restaurantId, {
              messageId,
              status: 'failed',
              error: waErr instanceof Error ? waErr.message : String(waErr),
            });
          } catch (updateErr) {
            console.error('[AgentOrchestrator] Error actualizando delivery_status en excepción:', updateErr);
          }
        }
      }
    }
    return null;
  }

  /** Procesa un mensaje entrante de un comensal. */
  async processIncomingMessage(input: ProcessMessageInput): Promise<ProcessMessageResult> {
    const { restaurant, customer, messageText, providerMessageId } = input;
    let conversationId = input.conversationId;

    try {
      // 1. Obtener o crear conversación activa
      let conversation = conversationId
        ? await this.conversationRepo.getById(restaurant.id, conversationId)
        : null;

      if (!conversation) {
        conversation = await this.conversationRepo.getOrCreateActiveConversation(
          restaurant.id,
          customer.id
        );
      }
      conversationId = conversation.id;

      // 2. Silenciamiento en Modo Humano (R6)
      if (conversation.mode === 'human') {
        const savedUserMsg = await this.messageRepo.saveMessage(restaurant.id, {
          conversationId: conversation.id,
          role: 'user',
          content: messageText,
          providerMessageId,
        });

        // Reenviar a Chatwoot si el proveedor o credenciales están disponibles
        const chatwoot =
          this.chatwootProvider ??
          (this.env.CHATWOOT_BASE_URL && this.env.CHATWOOT_API_TOKEN
            ? new ChatwootHttpClient({
                baseUrl: this.env.CHATWOOT_BASE_URL,
                apiToken: this.env.CHATWOOT_API_TOKEN,
                accountId: this.env.CHATWOOT_ACCOUNT_ID || '1',
                inboxId: this.env.CHATWOOT_INBOX_ID || '1',
              })
            : null);

        if (chatwoot) {
          try {
            const contact = await chatwoot.findOrCreateContact({
              phone: customer.phone,
              name: customer.name,
              restaurantId: restaurant.id,
              restaurantSlug: restaurant.slug,
              identifier: customer.id,
            });

            const chatwootConvo = await chatwoot.findOrCreateConversation({
              contactId: contact.id,
              restaurantId: restaurant.id,
              restaurantSlug: restaurant.slug,
              conversationId: conversation.id,
              customerPhone: customer.phone,
            });

            await chatwoot.forwardIncomingMessage({
              conversationId: chatwootConvo.id,
              messageText,
            });
          } catch (cwErr) {
            console.warn('[AgentOrchestrator] Error al reenviar mensaje a Chatwoot:', cwErr);
          }
        }

        return {
          status: 'silenced_human_mode',
          conversationId: conversation.id,
          messageId: savedUserMsg.id,
        };
      }

      // 3. Persistir mensaje entrante del comensal
      const savedUserMsg = await this.messageRepo.saveMessage(restaurant.id, {
        conversationId: conversation.id,
        role: 'user',
        content: messageText,
        providerMessageId,
      });

      // 4. Cargar contexto de persistencia en paralelo
      const [agentConfig, lastOrder, activeOrder, recentMessages, freshCustomer] = await Promise.all([
        this.restaurantRepo.getAgentConfig(restaurant.id),
        this.restaurantRepo.getLastCompletedOrder(restaurant.id, customer.id),
        this.orderRepo.getActiveDraftOrder(restaurant.id, customer.id),
        this.messageRepo.getRecentMessages(restaurant.id, conversation.id, 15),
        this.customerRepo.getByPhone(restaurant.id, customer.phone).catch(() => null),
      ]);

      const effectiveCustomer = freshCustomer || customer;

      // 5. Ensamblar System Prompt con memoria, horarios y reglas (R5)
      const systemPrompt = PromptBuilder.buildSystemPrompt({
        restaurant,
        agentConfig,
        customer: effectiveCustomer,
        lastOrder,
        activeOrder,
      });

      // 6. Construir historial de mensajes para el LLM
      const conversationHistory = buildConversationHistory(
        systemPrompt,
        recentMessages,
        savedUserMsg.id,
        messageText
      );

      // 7. Preparar contexto de ejecución seguro de herramientas
      const toolContext: ToolContext = {
        restaurantId: restaurant.id,
        customerId: customer.id,
        conversationId: conversation.id,
        db: this.db,
        env: this.env,
      };
      const toolDefinitions = getLLMToolDefinitions();

      // 8. Bucle acotado de Tool Calling (máx 5 iteraciones) (R6)
      let iteration = 0;
      let totalToolsExecuted = 0;
      let currentMode: ConversationMode = conversation.mode;

      while (iteration < MAX_TOOL_ITERATIONS) {
        iteration++;
        const response = await this.llmProvider.chat(conversationHistory, toolDefinitions);

        // Caso A: El LLM solicita invocar herramientas
        if (response.tool_calls && response.tool_calls.length > 0) {
          const toolNames = response.tool_calls.map((t) => t.function.name).join(', ');
          const assistantTurnContent =
            response.content?.trim() || `[Invocando herramientas: ${toolNames}]`;

          const assistantTurnMsg = await this.messageRepo.saveMessage(restaurant.id, {
            conversationId: conversation.id,
            role: 'assistant',
            content: assistantTurnContent,
            metadata: { tool_calls: response.tool_calls, usage: response.usage, delivery_status: 'pending' },
          });

          conversationHistory.push({
            role: 'assistant',
            content: response.content,
            tool_calls: response.tool_calls,
          });

          for (const toolCall of response.tool_calls) {
            totalToolsExecuted++;
            const toolName = toolCall.function.name;
            const toolArgs = toolCall.function.arguments;
            const toolResultStr = await executeTool(toolName, toolArgs, toolContext);

            await this.messageRepo.saveMessage(restaurant.id, {
              conversationId: conversation.id,
              role: 'tool',
              content: toolResultStr,
              metadata: { tool_call_id: toolCall.id, tool_name: toolName },
            });

            conversationHistory.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: toolResultStr,
            });

            if (toolName === 'handoff_to_human') {
              currentMode = 'human';
            }
          }

          if (currentMode === 'human') {
            const handoffReply =
              response.content?.trim() ||
              'Te he transferido con un asesor humano de nuestro equipo. En breve te atenderán.';

            await this.sendWhatsApp(
              restaurant.id,
              assistantTurnMsg.id,
              restaurant.slug,
              customer.phone,
              handoffReply
            );

            return {
              status: 'responded',
              conversationId: conversation.id,
              replyText: handoffReply,
              toolCallsExecuted: totalToolsExecuted,
              messageId: assistantTurnMsg.id,
            };
          }

          continue;
        }

        // Caso B: El LLM generó una respuesta de texto final
        const replyText = response.content ?? '';

        const assistantMsg = await this.messageRepo.saveMessage(restaurant.id, {
          conversationId: conversation.id,
          role: 'assistant',
          content: replyText,
          metadata: { usage: response.usage, delivery_status: 'pending' },
        });

        await this.sendWhatsApp(
          restaurant.id,
          assistantMsg.id,
          restaurant.slug,
          customer.phone,
          replyText
        );

        return {
          status: 'responded',
          conversationId: conversation.id,
          replyText,
          toolCallsExecuted: totalToolsExecuted,
          messageId: assistantMsg.id,
        };
      }

      // Caso C: Límite de 5 iteraciones alcanzado
      const fallbackReply =
        'Disculpa la demora, estoy procesando tu solicitud con nuestro equipo. Un momento por favor.';

      const fallbackMsg = await this.messageRepo.saveMessage(restaurant.id, {
        conversationId: conversation.id,
        role: 'assistant',
        content: fallbackReply,
        metadata: {
          fallback_reason: 'max_iterations_reached',
          iterations: MAX_TOOL_ITERATIONS,
          delivery_status: 'pending',
        },
      });

      await this.sendWhatsApp(
        restaurant.id,
        fallbackMsg.id,
        restaurant.slug,
        customer.phone,
        fallbackReply
      );

      return {
        status: 'max_iterations_reached',
        conversationId: conversation.id,
        replyText: fallbackReply,
        toolCallsExecuted: totalToolsExecuted,
        messageId: fallbackMsg.id,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[AgentOrchestrator.processIncomingMessage]', err);

      return {
        status: 'error',
        conversationId: conversationId || '',
        error: errorMessage,
        replyText: 'Tuvimos un inconveniente al procesar tu mensaje. En un momento te atenderemos.',
      };
    }
  }
}

