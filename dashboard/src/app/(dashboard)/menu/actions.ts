'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { type Database, type MenuCategory, type MenuItem, type UserRole } from '@/types/database';

type MenuCategoryUpdate = Database['public']['Tables']['menu_categories']['Update'];
type MenuItemUpdate = Database['public']['Tables']['menu_items']['Update'];
import {
  uuidSchema,
  createCategorySchema,
  updateCategorySchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  reorderSchema,
  type CreateMenuItemInput,
  type UpdateMenuItemInput,
} from '@/schemas/menu';

export type ActionResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Valida la autenticación del usuario, pertenencia al restaurante (tenant isolation)
 * y comprueba que el rol del usuario esté dentro de los roles permitidos.
 */
async function verifyUserTenantAccess(
  restaurantId: string,
  allowedRoles: UserRole[] = ['owner', 'admin', 'staff']
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('UNAUTHORIZED: Sesión no válida o expirada');
  }

  const { data: rawMembership, error: membershipError } = await supabase
    .from('restaurant_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('restaurant_id', restaurantId)
    .single();

  const membership = rawMembership as unknown as { role: UserRole } | null;

  if (membershipError || !membership) {
    throw new Error('FORBIDDEN: No tienes permisos sobre este restaurante');
  }

  if (!allowedRoles.includes(membership.role)) {
    throw new Error('FORBIDDEN: Rol insuficiente para realizar esta acción');
  }

  return { supabase, user, role: membership.role };
}

// ============================================================================
// CATEGORÍAS
// ============================================================================

/**
 * Obtiene todas las categorías del menú de un restaurante, ordenadas por sort_order y created_at.
 * Rol mínimo: staff
 */
export async function getCategories(
  restaurantId: string
): Promise<ActionResponse<MenuCategory[]>> {
  try {
    const tenantParse = uuidSchema.safeParse(restaurantId);
    if (!tenantParse.success) {
      return { success: false, error: tenantParse.error.issues[0]?.message || 'ID de restaurante inválido' };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId, ['owner', 'admin', 'staff']);

    const { data, error } = await supabase
      .from('menu_categories')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[getCategories] Error al consultar categorías en BD:', error);
      return { success: false, error: 'No se pudieron cargar las categorías del menú' };
    }

    return { success: true, data: (data as unknown as MenuCategory[]) || [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al obtener categorías';
    return { success: false, error: message };
  }
}

/**
 * Crea una nueva categoría en el menú.
 * Rol mínimo: admin u owner
 */
export async function createCategory(
  restaurantId: string,
  name: string,
  sortOrder?: number
): Promise<ActionResponse<MenuCategory>> {
  try {
    const tenantParse = uuidSchema.safeParse(restaurantId);
    if (!tenantParse.success) {
      return { success: false, error: tenantParse.error.issues[0]?.message || 'ID de restaurante inválido' };
    }

    const schemaParse = createCategorySchema.safeParse({ name, sort_order: sortOrder });
    if (!schemaParse.success) {
      return { success: false, error: schemaParse.error.issues[0]?.message || 'Datos de categoría inválidos' };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId, ['owner', 'admin']);

    const { data, error } = await supabase
      .from('menu_categories')
      .insert({
        restaurant_id: restaurantId,
        name: schemaParse.data.name,
        sort_order: schemaParse.data.sort_order ?? 0,
        is_active: schemaParse.data.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error('[createCategory] Error al insertar categoría en BD:', error);
      return { success: false, error: 'No se pudo crear la categoría' };
    }

    revalidatePath('/menu');
    return { success: true, data: data as unknown as MenuCategory };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al crear categoría';
    return { success: false, error: message };
  }
}

/**
 * Actualiza los datos de una categoría (nombre, sort_order, is_active).
 * Rol mínimo: admin u owner
 */
export async function updateCategory(
  restaurantId: string,
  categoryId: string,
  payload: { name?: string; sort_order?: number; is_active?: boolean }
): Promise<ActionResponse<MenuCategory>> {
  try {
    const tenantParse = uuidSchema.safeParse(restaurantId);
    if (!tenantParse.success) {
      return { success: false, error: tenantParse.error.issues[0]?.message || 'ID de restaurante inválido' };
    }

    const catParse = uuidSchema.safeParse(categoryId);
    if (!catParse.success) {
      return { success: false, error: catParse.error.issues[0]?.message || 'ID de categoría inválido' };
    }

    const schemaParse = updateCategorySchema.safeParse(payload);
    if (!schemaParse.success) {
      return { success: false, error: schemaParse.error.issues[0]?.message || 'Datos de actualización inválidos' };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId, ['owner', 'admin']);

    const updateFields: MenuCategoryUpdate = {};
    if (schemaParse.data.name !== undefined) updateFields.name = schemaParse.data.name;
    if (schemaParse.data.sort_order !== undefined) updateFields.sort_order = schemaParse.data.sort_order;
    if (schemaParse.data.is_active !== undefined) updateFields.is_active = schemaParse.data.is_active;

    if (Object.keys(updateFields).length === 0) {
      return { success: false, error: 'No se proporcionaron cambios para actualizar' };
    }

    const { data, error } = await supabase
      .from('menu_categories')
      .update(updateFields)
      .eq('id', categoryId)
      .eq('restaurant_id', restaurantId)
      .select()
      .single();

    if (error) {
      console.error('[updateCategory] Error al actualizar categoría en BD:', error);
      return { success: false, error: 'No se pudo actualizar la categoría' };
    }

    revalidatePath('/menu');
    return { success: true, data: data as unknown as MenuCategory };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al actualizar categoría';
    return { success: false, error: message };
  }
}

/**
 * Elimina una categoría si y sólo si no contiene platillos asociados.
 * Rol mínimo: admin u owner
 */
export async function deleteCategory(
  restaurantId: string,
  categoryId: string
): Promise<ActionResponse<{ id: string }>> {
  try {
    const tenantParse = uuidSchema.safeParse(restaurantId);
    if (!tenantParse.success) {
      return { success: false, error: tenantParse.error.issues[0]?.message || 'ID de restaurante inválido' };
    }

    const catParse = uuidSchema.safeParse(categoryId);
    if (!catParse.success) {
      return { success: false, error: catParse.error.issues[0]?.message || 'ID de categoría inválido' };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId, ['owner', 'admin']);

    // 1. Verificar si existen platillos que pertenezcan a esta categoría
    const { count, error: countError } = await supabase
      .from('menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('category_id', categoryId);

    if (countError) {
      console.error('[deleteCategory] Error al verificar platillos asociados:', countError);
      return { success: false, error: 'Error al verificar platillos en la categoría' };
    }

    if (count !== null && count > 0) {
      return {
        success: false,
        error: 'No se puede eliminar una categoría que contiene platillos. Muévelos o elimínalos primero.',
      };
    }

    // 2. Ejecutar eliminación física
    const { error: deleteError } = await supabase
      .from('menu_categories')
      .delete()
      .eq('id', categoryId)
      .eq('restaurant_id', restaurantId);

    if (deleteError) {
      console.error('[deleteCategory] Error eliminando categoría:', deleteError);
      return { success: false, error: 'No se pudo eliminar la categoría' };
    }

    revalidatePath('/menu');
    return { success: true, data: { id: categoryId } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al eliminar categoría';
    return { success: false, error: message };
  }
}

/**
 * Actualiza el orden (sort_order) de múltiples categorías en bloque.
 * Rol mínimo: admin u owner
 */
export async function reorderCategories(
  restaurantId: string,
  orderedCategoryIds: string[]
): Promise<ActionResponse<{ count: number }>> {
  try {
    const tenantParse = uuidSchema.safeParse(restaurantId);
    if (!tenantParse.success) {
      return { success: false, error: tenantParse.error.issues[0]?.message || 'ID de restaurante inválido' };
    }

    const reorderParse = reorderSchema.safeParse(orderedCategoryIds);
    if (!reorderParse.success) {
      return { success: false, error: reorderParse.error.issues[0]?.message || 'Lista de categorías inválida' };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId, ['owner', 'admin']);

    const updatePromises = reorderParse.data.map((id, index) =>
      supabase
        .from('menu_categories')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('restaurant_id', restaurantId)
    );

    const results = await Promise.all(updatePromises);
    const failure = results.find((res) => res.error);
    if (failure && failure.error) {
      console.error('[reorderCategories] Error reordenando categorías:', failure.error);
      return { success: false, error: 'Error al actualizar el orden de las categorías' };
    }

    revalidatePath('/menu');
    return { success: true, data: { count: orderedCategoryIds.length } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al reordenar categorías';
    return { success: false, error: message };
  }
}

// ============================================================================
// PLATILLOS / ÍTEMS DE MENÚ
// ============================================================================

/**
 * Obtiene los platillos del menú del restaurante, opcionalmente filtrados por categoría.
 * Ordenados por sort_order ASC, created_at ASC.
 * Rol mínimo: staff
 */
export async function getMenuItems(
  restaurantId: string,
  categoryId?: string
): Promise<ActionResponse<MenuItem[]>> {
  try {
    const tenantParse = uuidSchema.safeParse(restaurantId);
    if (!tenantParse.success) {
      return { success: false, error: tenantParse.error.issues[0]?.message || 'ID de restaurante inválido' };
    }

    if (categoryId) {
      const catParse = uuidSchema.safeParse(categoryId);
      if (!catParse.success) {
        return { success: false, error: catParse.error.issues[0]?.message || 'ID de categoría inválido' };
      }
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId, ['owner', 'admin', 'staff']);

    let query = supabase
      .from('menu_items')
      .select('*, menu_categories(name)')
      .eq('restaurant_id', restaurantId);

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[getMenuItems] Error al consultar platillos en BD:', error);
      return { success: false, error: 'No se pudieron cargar los platillos del menú' };
    }

    return { success: true, data: (data as unknown as MenuItem[]) || [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al obtener platillos';
    return { success: false, error: message };
  }
}

/**
 * Crea un nuevo platillo con sus opciones de personalización (options_schema).
 * Rol mínimo: admin u owner
 */
export async function createMenuItem(
  restaurantId: string,
  payload: CreateMenuItemInput
): Promise<ActionResponse<MenuItem>> {
  try {
    const tenantParse = uuidSchema.safeParse(restaurantId);
    if (!tenantParse.success) {
      return { success: false, error: tenantParse.error.issues[0]?.message || 'ID de restaurante inválido' };
    }

    const itemParse = createMenuItemSchema.safeParse(payload);
    if (!itemParse.success) {
      return { success: false, error: itemParse.error.issues[0]?.message || 'Datos del platillo inválidos' };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId, ['owner', 'admin']);

    const { data, error } = await supabase
      .from('menu_items')
      .insert({
        restaurant_id: restaurantId,
        category_id: itemParse.data.category_id ?? null,
        name: itemParse.data.name,
        description: itemParse.data.description ?? '',
        price: itemParse.data.price,
        options_schema: itemParse.data.options_schema ?? [],
        is_available: itemParse.data.is_available ?? true,
        sort_order: itemParse.data.sort_order ?? 0,
      })
      .select()
      .single();

    if (error) {
      console.error('[createMenuItem] Error al insertar platillo en BD:', error);
      return { success: false, error: 'No se pudo crear el platillo' };
    }

    revalidatePath('/menu');
    return { success: true, data: data as unknown as MenuItem };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al crear platillo';
    return { success: false, error: message };
  }
}

/**
 * Actualiza los datos de un platillo existente.
 * Rol mínimo: admin u owner
 */
export async function updateMenuItem(
  restaurantId: string,
  itemId: string,
  payload: UpdateMenuItemInput
): Promise<ActionResponse<MenuItem>> {
  try {
    const tenantParse = uuidSchema.safeParse(restaurantId);
    if (!tenantParse.success) {
      return { success: false, error: tenantParse.error.issues[0]?.message || 'ID de restaurante inválido' };
    }

    const itemParse = uuidSchema.safeParse(itemId);
    if (!itemParse.success) {
      return { success: false, error: itemParse.error.issues[0]?.message || 'ID de platillo inválido' };
    }

    const schemaParse = updateMenuItemSchema.safeParse(payload);
    if (!schemaParse.success) {
      return { success: false, error: schemaParse.error.issues[0]?.message || 'Datos de actualización inválidos' };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId, ['owner', 'admin']);

    const updateFields: MenuItemUpdate = {
      updated_at: new Date().toISOString(),
    };
    let hasUpdates = false;

    if (schemaParse.data.name !== undefined) {
      updateFields.name = schemaParse.data.name;
      hasUpdates = true;
    }
    if (schemaParse.data.description !== undefined) {
      updateFields.description = schemaParse.data.description;
      hasUpdates = true;
    }
    if (schemaParse.data.price !== undefined) {
      updateFields.price = schemaParse.data.price;
      hasUpdates = true;
    }
    if (schemaParse.data.category_id !== undefined) {
      updateFields.category_id = schemaParse.data.category_id;
      hasUpdates = true;
    }
    if (schemaParse.data.options_schema !== undefined) {
      updateFields.options_schema = schemaParse.data.options_schema as unknown as MenuItemUpdate['options_schema'];
      hasUpdates = true;
    }
    if (schemaParse.data.is_available !== undefined) {
      updateFields.is_available = schemaParse.data.is_available;
      hasUpdates = true;
    }
    if (schemaParse.data.sort_order !== undefined) {
      updateFields.sort_order = schemaParse.data.sort_order;
      hasUpdates = true;
    }

    if (!hasUpdates) {
      return { success: false, error: 'No se proporcionaron cambios para actualizar' };
    }

    const { data, error } = await supabase
      .from('menu_items')
      .update(updateFields)
      .eq('id', itemId)
      .eq('restaurant_id', restaurantId)
      .select()
      .single();

    if (error) {
      console.error('[updateMenuItem] Error al actualizar platillo en BD:', error);
      return { success: false, error: 'No se pudo actualizar el platillo' };
    }

    revalidatePath('/menu');
    return { success: true, data: data as unknown as MenuItem };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al actualizar platillo';
    return { success: false, error: message };
  }
}

/**
 * Elimina un platillo si no cuenta con historial en order_items.
 * Si cuenta con historial de pedidos, rechaza con mensaje amigable para proteger integridad relacional.
 * Rol mínimo: admin u owner
 */
export async function deleteMenuItem(
  restaurantId: string,
  itemId: string
): Promise<ActionResponse<{ id: string }>> {
  try {
    const tenantParse = uuidSchema.safeParse(restaurantId);
    if (!tenantParse.success) {
      return { success: false, error: tenantParse.error.issues[0]?.message || 'ID de restaurante inválido' };
    }

    const itemParse = uuidSchema.safeParse(itemId);
    if (!itemParse.success) {
      return { success: false, error: itemParse.error.issues[0]?.message || 'ID de platillo inválido' };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId, ['owner', 'admin']);

    // 1. Verificar si existen registros históricos en order_items
    const { count, error: orderItemsError } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', itemId);

    if (orderItemsError) {
      console.error('[deleteMenuItem] Error al consultar historial en order_items:', orderItemsError);
      return { success: false, error: 'Error al verificar historial de pedidos del platillo' };
    }

    if (count !== null && count > 0) {
      return {
        success: false,
        error: 'No se puede eliminar un platillo con historial de pedidos. Puedes desactivar su disponibilidad en su lugar.',
      };
    }

    // 2. Ejecutar eliminación física
    const { error: deleteError } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', itemId)
      .eq('restaurant_id', restaurantId);

    if (deleteError) {
      console.error('[deleteMenuItem] Error al eliminar platillo en BD:', deleteError);
      return { success: false, error: 'No se pudo eliminar el platillo' };
    }

    revalidatePath('/menu');
    return { success: true, data: { id: itemId } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al eliminar platillo';
    return { success: false, error: message };
  }
}

/**
 * Alterna rápidamente la disponibilidad de un platillo (toggle is_available).
 * Rol mínimo: admin u owner
 */
export async function toggleItemAvailability(
  restaurantId: string,
  itemId: string
): Promise<ActionResponse<MenuItem>> {
  try {
    const tenantParse = uuidSchema.safeParse(restaurantId);
    if (!tenantParse.success) {
      return { success: false, error: tenantParse.error.issues[0]?.message || 'ID de restaurante inválido' };
    }

    const itemParse = uuidSchema.safeParse(itemId);
    if (!itemParse.success) {
      return { success: false, error: itemParse.error.issues[0]?.message || 'ID de platillo inválido' };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId, ['owner', 'admin']);

    // Obtener estado actual
    const { data: item, error: fetchError } = await supabase
      .from('menu_items')
      .select('*')
      .eq('id', itemId)
      .eq('restaurant_id', restaurantId)
      .single();

    if (fetchError || !item) {
      return { success: false, error: 'Platillo no encontrado' };
    }

    const currentItem = item as unknown as MenuItem;
    const newAvailability = !currentItem.is_available;

    const { data: updated, error: updateError } = await supabase
      .from('menu_items')
      .update({
        is_available: newAvailability,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('restaurant_id', restaurantId)
      .select()
      .single();

    if (updateError) {
      console.error('[toggleItemAvailability] Error al actualizar disponibilidad:', updateError);
      return { success: false, error: 'No se pudo actualizar la disponibilidad' };
    }

    revalidatePath('/menu');
    return { success: true, data: updated as unknown as MenuItem };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al cambiar disponibilidad';
    return { success: false, error: message };
  }
}

/**
 * Actualiza el orden (sort_order) de los platillos dentro de una categoría en bloque.
 * Rol mínimo: admin u owner
 */
export async function reorderMenuItems(
  restaurantId: string,
  categoryId: string,
  orderedItemIds: string[]
): Promise<ActionResponse<{ count: number }>> {
  try {
    const tenantParse = uuidSchema.safeParse(restaurantId);
    if (!tenantParse.success) {
      return { success: false, error: tenantParse.error.issues[0]?.message || 'ID de restaurante inválido' };
    }

    const catParse = uuidSchema.safeParse(categoryId);
    if (!catParse.success) {
      return { success: false, error: catParse.error.issues[0]?.message || 'ID de categoría inválido' };
    }

    const reorderParse = reorderSchema.safeParse(orderedItemIds);
    if (!reorderParse.success) {
      return { success: false, error: reorderParse.error.issues[0]?.message || 'Lista de platillos inválida' };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId, ['owner', 'admin']);

    const updatePromises = reorderParse.data.map((id, index) =>
      supabase
        .from('menu_items')
        .update({
          sort_order: index,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('category_id', categoryId)
        .eq('restaurant_id', restaurantId)
    );

    const results = await Promise.all(updatePromises);
    const failure = results.find((res) => res.error);
    if (failure && failure.error) {
      console.error('[reorderMenuItems] Error al reordenar platillos:', failure.error);
      return { success: false, error: 'Error al actualizar el orden de los platillos' };
    }

    revalidatePath('/menu');
    return { success: true, data: { count: orderedItemIds.length } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al reordenar platillos';
    return { success: false, error: message };
  }
}
