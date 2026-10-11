/**
 * Opciones para el envío de mensajes de texto.
 */
export interface SendTextOptions {
  /** Retraso simulado de escritura en ms (útil para que parezca humano) */
  delay?: number;
  /** Si debe generar vista previa de enlaces */
  linkPreview?: boolean;
}

/**
 * Opciones para el envío de archivos multimedia.
 */
export interface SendMediaOptions {
  /** Pie de foto o texto que acompaña al archivo */
  caption?: string;
  /** Tipo de medio: image, video, document, audio */
  mediaType?: 'image' | 'video' | 'document' | 'audio';
  /** Tipo MIME (ej: image/png, application/pdf) */
  mimetype?: string;
  /** Nombre del archivo mostrado al usuario */
  fileName?: string;
}

/**
 * Resultado estructurado del envío de un mensaje.
 */
export interface SendMessageResult {
  /** Si el envío fue aceptado por el proveedor */
  success: boolean;
  /** Identificador único del mensaje generado por WhatsApp/Proveedor */
  messageId?: string;
  /** Respuesta cruda del proveedor para depuración */
  rawResponse?: unknown;
}

/**
 * Interfaz agnóstica para proveedores de WhatsApp.
 *
 * Permite que el núcleo del negocio (Cloudflare Worker / AI Agent)
 * no dependa directamente de una API específica (Evolution API, Meta Cloud API, Z-API, etc.).
 */
export interface WhatsAppProvider {
  /**
   * Envía un mensaje de texto plano a un número de WhatsApp.
   *
   * @param instance Identificador o nombre de la instancia conectada
   * @param to Número de teléfono del destinatario (con código de país, ej: "5215512345678")
   * @param text Contenido del mensaje
   * @param options Opciones adicionales (delay, preview)
   */
  sendTextMessage(
    instance: string,
    to: string,
    text: string,
    options?: SendTextOptions
  ): Promise<SendMessageResult>;

  /**
   * Envía un archivo multimedia (imagen, video, audio o documento) vía URL.
   *
   * @param instance Identificador o nombre de la instancia conectada
   * @param to Número de teléfono del destinatario
   * @param mediaUrl URL pública o accesible del archivo
   * @param options Opciones adicionales (caption, mediaType, mimetype, fileName)
   */
  sendMediaMessage(
    instance: string,
    to: string,
    mediaUrl: string,
    options?: SendMediaOptions
  ): Promise<SendMessageResult>;

  /**
   * Marca un mensaje específico como leído.
   *
   * @param instance Identificador o nombre de la instancia conectada
   * @param remoteJid JID completo del remitente (ej: "5215512345678@s.whatsapp.net")
   * @param messageId ID del mensaje que se desea marcar como leído
   */
  markAsRead(
    instance: string,
    remoteJid: string,
    messageId: string
  ): Promise<boolean>;
}
