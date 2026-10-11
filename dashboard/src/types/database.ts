/**
 * Tipos de datos relacionales e interfaces para Supabase / PostgreSQL.
 * Todos los modelos incluyen aislamiento multi-tenant obligatorio (`restaurant_id`).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'owner' | 'admin' | 'staff';
export type ConversationStatus = 'open' | 'closed';
export type ConversationMode = 'ai' | 'human';
export type MessageRole = 'user' | 'assistant' | 'system' | 'human_agent' | 'tool';
export type OrderStatus = 'draft' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'pending';
export type SubscriptionStatus = 'trialing' | 'active' | 'in_grace_period' | 'past_due' | 'suspended' | 'manual_exempt';
export type SubscriptionTier = 'starter' | 'pro' | 'enterprise';

/** 1. Restaurante (Tenant) */
export type Restaurant = {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  timezone: string;
  is_active: boolean;
  subscription_status: SubscriptionStatus;
  subscription_tier: SubscriptionTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  grace_period_ends_at: string | null;
  max_orders_per_month: number;
  created_at: string;
  updated_at: string;
};

/** 2. Usuario de Restaurante (Dashboard / Auth) */
export type RestaurantUser = {
  id: string;
  user_id: string;
  restaurant_id: string;
  role: UserRole;
  created_at: string;
};

/** 3. Cliente con Memoria Markdown ("Bloc de Notas del Mesero") */
export type Customer = {
  id: string;
  restaurant_id: string;
  phone: string;
  name: string | null;
  address_default: string | null;
  notes_md: string;
  created_at: string;
  updated_at: string;
};

/** 4. Conversación */
export type Conversation = {
  id: string;
  restaurant_id: string;
  customer_id: string;
  status: ConversationStatus;
  mode: ConversationMode;
  created_at: string;
  updated_at: string;
};

/** 5. Mensaje */
export type Message = {
  id: string;
  restaurant_id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  provider_message_id: string | null;
  metadata: Json;
  created_at: string;
};

/** 6. Categoría del Menú */
export type MenuCategory = {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

/** Opciones y variantes de un ítem de menú (options_schema) */
export type OptionChoice = {
  label: string;
  price_modifier: number;
};

export type OptionGroup = {
  name: string;
  type: 'single_choice' | 'multiple_choice';
  required: boolean;
  choices: OptionChoice[];
};

/** 7. Ítem del Menú */
export type MenuItem = {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string;
  price: number;
  options_schema: Json;
  is_available: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** 8. Pedido */
export type Order = {
  id: string;
  restaurant_id: string;
  customer_id: string;
  conversation_id: string | null;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  total: number;
  delivery_address: string | null;
  payment_method: PaymentMethod | null;
  created_at: string;
  updated_at: string;
};

/** Opciones seleccionadas para un ítem del pedido */
export type SelectedOption = {
  group_name: string;
  choice_label: string;
  price_modifier: number;
};

/** 9. Ítem del Pedido */
export type OrderItem = {
  id: string;
  order_id: string;
  restaurant_id?: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  options_selected: Json;
  subtotal: number;
  created_at: string;
};

/** 10. Horario de Operación */
export type DaySchedule = {
  open: string;
  close: string;
};

export type WeeklySchedule = Record<string, DaySchedule>;

/** 10. Configuración del Agente de IA */
export type AgentConfig = {
  id: string;
  restaurant_id: string;
  system_prompt: string;
  business_rules: string;
  handoff_triggers: Json;
  operating_hours: Json;
  created_at: string;
  updated_at: string;
};

export type GenericRelationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

/**
 * Definición de tipos de Supabase Database para tipado estricto con @supabase/supabase-js.
 */
export type Database = {
  public: {
    Tables: {
      restaurants: {
        Row: Restaurant;
        Insert: {
          id?: string;
          name: string;
          slug: string;
          phone?: string | null;
          address?: string | null;
          timezone?: string;
          is_active?: boolean;
          subscription_status?: SubscriptionStatus;
          subscription_tier?: SubscriptionTier;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          trial_ends_at?: string | null;
          current_period_ends_at?: string | null;
          grace_period_ends_at?: string | null;
          max_orders_per_month?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          phone?: string | null;
          address?: string | null;
          timezone?: string;
          is_active?: boolean;
          subscription_status?: SubscriptionStatus;
          subscription_tier?: SubscriptionTier;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          trial_ends_at?: string | null;
          current_period_ends_at?: string | null;
          grace_period_ends_at?: string | null;
          max_orders_per_month?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: GenericRelationship[];
      };
      restaurant_users: {
        Row: RestaurantUser;
        Insert: {
          id?: string;
          user_id: string;
          restaurant_id: string;
          role: UserRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          restaurant_id?: string;
          role?: UserRole;
          created_at?: string;
        };
        Relationships: GenericRelationship[];
      };
      customers: {
        Row: Customer;
        Insert: {
          id?: string;
          restaurant_id: string;
          phone: string;
          name?: string | null;
          address_default?: string | null;
          notes_md?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          phone?: string;
          name?: string | null;
          address_default?: string | null;
          notes_md?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: GenericRelationship[];
      };
      conversations: {
        Row: Conversation;
        Insert: {
          id?: string;
          restaurant_id: string;
          customer_id: string;
          status?: ConversationStatus;
          mode?: ConversationMode;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          customer_id?: string;
          status?: ConversationStatus;
          mode?: ConversationMode;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: GenericRelationship[];
      };
      messages: {
        Row: Message;
        Insert: {
          id?: string;
          restaurant_id: string;
          conversation_id: string;
          role: MessageRole;
          content: string;
          provider_message_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          conversation_id?: string;
          role?: MessageRole;
          content?: string;
          provider_message_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: GenericRelationship[];
      };
      menu_categories: {
        Row: MenuCategory;
        Insert: {
          id?: string;
          restaurant_id: string;
          name: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          name?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: GenericRelationship[];
      };
      menu_items: {
        Row: MenuItem;
        Insert: {
          id?: string;
          restaurant_id: string;
          category_id?: string | null;
          name: string;
          description?: string;
          price: number;
          options_schema?: Json;
          is_available?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          category_id?: string | null;
          name?: string;
          description?: string;
          price?: number;
          options_schema?: Json;
          is_available?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: GenericRelationship[];
      };
      orders: {
        Row: Order;
        Insert: {
          id?: string;
          restaurant_id: string;
          customer_id: string;
          conversation_id?: string | null;
          status?: OrderStatus;
          subtotal?: number;
          delivery_fee?: number;
          discount?: number;
          total?: number;
          delivery_address?: string | null;
          payment_method?: PaymentMethod | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          customer_id?: string;
          conversation_id?: string | null;
          status?: OrderStatus;
          subtotal?: number;
          delivery_fee?: number;
          discount?: number;
          total?: number;
          delivery_address?: string | null;
          payment_method?: PaymentMethod | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: GenericRelationship[];
      };
      order_items: {
        Row: OrderItem;
        Insert: {
          id?: string;
          order_id: string;
          restaurant_id?: string | null;
          product_id: string;
          quantity: number;
          unit_price: number;
          options_selected?: Json;
          subtotal: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          restaurant_id?: string | null;
          product_id?: string;
          quantity?: number;
          unit_price?: number;
          options_selected?: Json;
          subtotal?: number;
          created_at?: string;
        };
        Relationships: GenericRelationship[];
      };
      processed_webhook_events: {
        Row: {
          provider_message_id: string;
          restaurant_id: string | null;
          instance_id: string | null;
          received_at: string;
        };
        Insert: {
          provider_message_id: string;
          restaurant_id?: string | null;
          instance_id?: string | null;
          received_at?: string;
        };
        Update: {
          provider_message_id?: string;
          restaurant_id?: string | null;
          instance_id?: string | null;
          received_at?: string;
        };
        Relationships: GenericRelationship[];
      };
      agent_configs: {
        Row: AgentConfig;
        Insert: {
          id?: string;
          restaurant_id: string;
          system_prompt?: string;
          business_rules?: string;
          handoff_triggers?: Json;
          operating_hours?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          system_prompt?: string;
          business_rules?: string;
          handoff_triggers?: Json;
          operating_hours?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: GenericRelationship[];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      rpc_add_order_item: {
        Args: {
          p_restaurant_id: string;
          p_order_id: string;
          p_product_id: string;
          p_quantity: number;
          p_options?: Json;
        };
        Returns: Json;
      };
      rpc_remove_order_item: {
        Args: {
          p_restaurant_id: string;
          p_order_id: string;
          p_item_id: string;
        };
        Returns: Json;
      };
      rpc_confirm_order: {
        Args: {
          p_restaurant_id: string;
          p_order_id: string;
          p_delivery_address?: string | null;
          p_payment_method?: string | null;
        };
        Returns: Json;
      };
      rpc_init_conversation_session: {
        Args: {
          p_restaurant_id: string;
          p_phone: string;
          p_name?: string | null;
        };
        Returns: Json;
      };
      rpc_advance_order_status: {
        Args: {
          p_restaurant_id: string;
          p_order_id: string;
          p_from_status: string;
          p_to_status: string;
        };
        Returns: Json;
      };
      rpc_recall_order_status: {
        Args: {
          p_restaurant_id: string;
          p_order_id: string;
          p_from_status: string;
          p_to_status: string;
        };
        Returns: Json;
      };
      get_auth_user_role: {
        Args: {
          p_restaurant_id: string;
        };
        Returns: string | null;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
