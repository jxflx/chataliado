/**
 * Interfaz y tipos agnósticos para proveedores de Modelos de Lenguaje (LLM).
 * Compatible con el estándar de Chat Completions y Function Calling de OpenAI / OpenRouter / Groq / Gemini.
 */

export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMFunctionCall {
  name: string;
  arguments: string; // Serialized JSON string
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: LLMFunctionCall;
}

export interface LLMSystemMessage {
  role: 'system';
  content: string;
  name?: string;
}

export interface LLMUserMessage {
  role: 'user';
  content: string;
  name?: string;
}

export interface LLMAssistantMessage {
  role: 'assistant';
  content: string | null;
  name?: string;
  tool_calls?: LLMToolCall[];
}

export interface LLMToolMessage {
  role: 'tool';
  tool_call_id: string;
  content: string; // Tool execution result as JSON string
  name?: string;
}

export type LLMMessage =
  | LLMSystemMessage
  | LLMUserMessage
  | LLMAssistantMessage
  | LLMToolMessage
  | {
      role: LLMRole;
      content: string | null;
      name?: string;
      tool_call_id?: string;
      tool_calls?: LLMToolCall[];
    };

export interface LLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface LLMResponse {
  content: string | null;
  tool_calls?: LLMToolCall[];
  usage?: LLMUsage;
  rawResponse?: unknown;
}

export interface LLMProviderOptions {
  /** URL base de la API compatible con OpenAI (ej: "https://api.openai.com/v1" o "https://openrouter.ai/api/v1") */
  baseUrl: string;
  /** API Key del proveedor */
  apiKey: string;
  /** Identificador del modelo (ej: "gpt-4o-mini", "llama-3.3-70b-versatile") */
  model: string;
  /** Tiempo límite de espera en ms (por defecto: 30000) */
  timeoutMs?: number;
  /** Temperatura de muestreo determinista (por defecto: 0.1) */
  temperature?: number;
  /** Límite de tokens de completitud */
  maxTokens?: number;
  /** Función fetch inyectable para testing y desacoplamiento */
  fetchFn?: typeof fetch;
}

export interface LLMProvider {
  chat(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse>;
}
