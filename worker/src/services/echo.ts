import { type WhatsAppProvider } from '../providers/whatsapp/interface';
import { type ParsedMessage } from '../webhooks/schemas';

export interface EchoServiceOptions {
  provider: WhatsAppProvider;
  /** Prefijo del mensaje de eco (por defecto: "Eco: ") */
  prefix?: string;
}

/**
 * Servicio de Echo para pruebas E2E y verificación de canal (Smoke Test).
 *
 * Recibe un mensaje parseado y validado, y responde al usuario
 * reflejando el texto recibido con un prefijo configurable.
 */
export class EchoService {
  private readonly provider: WhatsAppProvider;
  private readonly prefix: string;

  constructor(options: EchoServiceOptions) {
    this.provider = options.provider;
    this.prefix = options.prefix ?? 'Eco: ';
  }

  /**
   * Procesa un mensaje entrante enviando la respuesta de eco.
   *
   * @param message Mensaje normalizado y validado del webhook
   */
  async processMessage(message: ParsedMessage): Promise<void> {
    // Sanitización básica: truncar a máximo 500 caracteres para evitar payloads abusivos
    const sanitizedText = message.messageText.slice(0, 500);
    const replyText = `${this.prefix}${sanitizedText}`;

    await this.provider.sendTextMessage(
      message.instanceId,
      message.senderPhone,
      replyText,
      {
        delay: 500, // Breve delay para simular procesamiento natural
      }
    );
  }
}
