'use client';

import React, { useState, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTenant } from '@/components/layout/tenant-provider';
import { useLiveChat } from '@/hooks/use-live-chat';
import { type ConversationMode, type ConversationStatus } from '@/types/database';

import { ChatList } from '@/components/chats/chat-list';
import { ChatDetailHeader } from '@/components/chats/chat-detail-header';
import { MessageList } from '@/components/chats/message-list';
import { MessageInput } from '@/components/chats/message-input';
import { CustomerSidebar } from '@/components/chats/customer-sidebar';
import { EmptyChatDetailState } from '@/components/chats/chat-skeletons';

export type MobileView = 'list' | 'chat' | 'customer';

/**
 * Orquestador principal del Monitor de Live Chat de WhatsApp (Hito 6 - Bloque 3).
 *
 * Arquitectura Trek de 3 columnas en escritorio (>=768px / md:) y
 * máquina de estados de navegación por niveles en móvil (<768px).
 *
 * Reglas de diseño Liquid Glass & Dieter Rams:
 * - CERO EMOJIS en toda la interfaz (iconografía exclusiva Lucide React con trazo de 1.5px).
 * - Cero clichés de IA (sin degradados púrpuras, sin estrellitas mágicas, sin negro puro).
 * - Tinta Charcoal Slate (#1E293B / var(--color-ink-primary)).
 * - Tipografía Geist y Geist Mono para datos operativos y timestamps.
 */
export default function ChatsPage() {
  const { activeRestaurant } = useTenant();
  const chat = useLiveChat({ restaurantId: activeRestaurant?.id });

  // Control de visibilidad de la ficha lateral de cliente en escritorio (default abierto cuando hay chat activo)
  const [isCustomerSidebarOpen, setIsCustomerSidebarOpen] = useState<boolean>(true);

  // Máquina de estados para navegación fluida en dispositivos móviles (<768px)
  const [mobileView, setMobileView] = useState<MobileView>('list');

  // Selección de conversación
  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      chat.selectConversation(conversationId);
      setMobileView('chat');
      setIsCustomerSidebarOpen(true);
    },
    [chat]
  );

  // Cambio de modo (IA <-> Humano)
  const handleToggleMode = useCallback(
    async (nextMode: ConversationMode) => {
      if (!chat.activeConversation) return;
      await chat.setMode(nextMode);
    },
    [chat]
  );

  // Cierre o reapertura de conversación
  const handleToggleStatus = useCallback(
    async (nextStatus: ConversationStatus) => {
      if (!chat.activeConversation) return;
      await chat.setStatus(nextStatus);
    },
    [chat]
  );

  // Envío manual de mensajes
  const handleSendMessage = useCallback(
    async (content: string) => {
      return await chat.sendMessage(content);
    },
    [chat]
  );

  // Actualización de la Libreta del Mesero ("notes_md")
  const handleUpdateNotes = useCallback(
    async (notesMd: string) => {
      return await chat.updateNotes(notesMd);
    },
    [chat]
  );

  // Alternar ficha de cliente desde el encabezado
  const handleToggleCustomerSidebar = useCallback(() => {
    setIsCustomerSidebarOpen((prev) => !prev);
    setMobileView((current) => (current === 'customer' ? 'chat' : 'customer'));
  }, []);

  // Retorno a la lista en móvil
  const handleBackToList = useCallback(() => {
    setMobileView('list');
  }, []);

  // Cierre de la ficha lateral
  const handleCloseCustomerSidebar = useCallback(() => {
    setIsCustomerSidebarOpen(false);
    setMobileView('chat');
  }, []);

  return (
    <div
      className="w-full flex flex-col md:flex-row bg-surface-subtle border border-border-whisper border-white/90 rounded-3xl shadow-glass-subtle overflow-hidden overflow-x-hidden relative min-h-[100dvh] md:min-h-0 md:h-[calc(100dvh-7rem)]"
      data-testid="chats-trek-container"
    >
      {/* ------------------------------------------------------------- */}
      {/* Columna Izquierda: Bandeja de Conversaciones (360px)          */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`${
          mobileView === 'list' ? 'flex' : 'hidden'
        } md:flex flex-col w-full md:w-[360px] flex-shrink-0 h-full overflow-hidden`}
        data-testid="chat-list-column"
      >
        <ChatList
          conversations={chat.filteredConversations}
          allConversations={chat.conversations}
          activeConversationId={chat.activeConversationId}
          searchQuery={chat.searchQuery}
          statusFilter={chat.statusFilter}
          modeFilter={chat.modeFilter}
          soundEnabled={chat.soundEnabled}
          loading={chat.loading}
          onSelectConversation={handleSelectConversation}
          onSearchChange={chat.setSearchQuery}
          onStatusFilterChange={chat.setStatusFilter}
          onModeFilterChange={chat.setModeFilter}
          onToggleSound={chat.toggleSound}
          className="w-full h-full border-r border-border-whisper"
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Columna Central: Ventana de Conversación Activa               */}
      {/* ------------------------------------------------------------- */}
      <section
        className={`${
          mobileView === 'chat' ? 'flex' : 'hidden'
        } md:flex flex-1 flex-col min-w-0 h-full bg-canvas-bg border-r border-border-whisper overflow-hidden relative`}
        aria-label="Ventana de conversación activa"
        data-testid="chat-detail-column"
      >
        {chat.activeConversation ? (
          <>
            {/* Cabecera del chat activo */}
            <ChatDetailHeader
              conversation={chat.activeConversation}
              isSidebarOpen={isCustomerSidebarOpen}
              onToggleMode={handleToggleMode}
              onToggleStatus={handleToggleStatus}
              onToggleCustomerSidebar={handleToggleCustomerSidebar}
              onBackToList={handleBackToList}
            />

            {/* Listado de mensajes en tiempo real */}
            <MessageList
              messages={chat.messages}
              loadingMessages={chat.loadingMessages}
              customerName={chat.activeConversation.customer?.name}
              className="flex-1 min-h-0"
            />

            {/* Entrada de mensajes con respuestas rápidas y banner preventivo en Modo IA */}
            <MessageInput
              mode={chat.activeConversation.mode}
              status={chat.activeConversation.status}
              onSendMessage={handleSendMessage}
              onTakeControl={() => handleToggleMode('human')}
              onReopenChat={() => handleToggleStatus('open')}
            />
          </>
        ) : (
          /* Estado vacío cuando no hay conversación seleccionada */
          <EmptyChatDetailState />
        )}
      </section>

      {/* ------------------------------------------------------------- */}
      {/* Columna Derecha: Drawer Flotante / Ficha Lateral del Cliente   */}
      {/* ------------------------------------------------------------- */}
      {chat.activeConversation && (
        <div
          className={`${
            mobileView === 'customer' ? 'flex' : 'hidden'
          } ${
            isCustomerSidebarOpen ? 'md:flex translate-x-0' : 'md:hidden translate-x-full'
          } flex-col w-full md:w-80 flex-shrink-0 h-full overflow-hidden transition-transform duration-300 ease-out z-30`}
          data-testid="customer-sidebar-column"
        >
          {/* Barra de navegación de retorno exclusiva para vista móvil */}
          <div className="md:hidden flex items-center gap-2 p-3 bg-surface-elevated border-b border-border-whisper">
            <button
              type="button"
              onClick={handleCloseCustomerSidebar}
              className="pressable p-1.5 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-slate-100 transition-colors"
              aria-label="Volver a la conversación"
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
            </button>
            <span className="text-xs font-semibold text-ink-primary">
              Volver a la conversación
            </span>
          </div>

          <CustomerSidebar
            customer={chat.activeConversation.customer}
            isOpen={true}
            onClose={handleCloseCustomerSidebar}
            onUpdateNotes={handleUpdateNotes}
            loading={chat.loadingMessages}
            className="w-full flex-1 border-l-0 md:border-l border-border-whisper"
          />
        </div>
      )}
    </div>
  );
}
