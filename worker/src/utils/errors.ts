/**
 * Error base del Worker de ChatAliado.
 */
export class WorkerError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'WorkerError';
    this.statusCode = statusCode;
  }
}

/**
 * Error de autenticación — petición sin token válido.
 */
export class AuthenticationError extends WorkerError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error de validación — payload malformado o incompleto.
 */
export class ValidationError extends WorkerError {
  constructor(message: string = 'Bad Request') {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

/**
 * Error del proveedor LLM — fallo en llamada HTTP o respuesta inválida del modelo.
 */
export class LLMProviderError extends WorkerError {
  constructor(message: string = 'Error al comunicarse con el proveedor LLM', statusCode: number = 502) {
    super(message, statusCode);
    this.name = 'LLMProviderError';
  }
}

/**
 * Error en la ejecución de una herramienta (Tool) del LLM.
 */
export class ToolExecutionError extends WorkerError {
  public readonly toolName: string;

  constructor(toolName: string, message: string, statusCode: number = 400) {
    super(`[${toolName}] ${message}`, statusCode);
    this.name = 'ToolExecutionError';
    this.toolName = toolName;
  }
}

