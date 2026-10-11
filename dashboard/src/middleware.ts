import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/favicon.ico'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Refrescar sesión de Supabase Auth
  const { supabaseResponse, user, supabase } = await updateSession(request);

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  // 2. Redirección si usuario no autenticado intenta acceder a rutas privadas
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // 3. Redirección si usuario ya autenticado intenta ir a /login
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // 4. Guardia Multi-Tenant & Estado de Suscripción para usuarios autenticados
  if (user && supabase && !isPublicPath) {
    try {
      // 4.1 Resolver restaurantes a los que tiene acceso el usuario
      const { data, error } = await supabase
        .from('restaurant_users')
        .select(`
          role,
          restaurant_id,
          restaurants (*)
        `)
        .eq('user_id', user.id);

      type MembershipWithRestaurant = {
        role: string;
        restaurant_id: string;
        restaurants: {
          id: string;
          name: string;
          slug: string;
          is_active: boolean;
          subscription_status?: string;
          subscription_tier?: string;
        } | null;
      };

      const rawRestaurants = data as unknown as MembershipWithRestaurant[] | null;
      const userRestaurants = rawRestaurants
        ? rawRestaurants.map((m) => {
            if (!m.restaurants) return m;
            return {
              ...m,
              restaurants: {
                ...m.restaurants,
                subscription_status: m.restaurants.subscription_status ?? 'active',
                subscription_tier: m.restaurants.subscription_tier ?? 'starter',
              },
            };
          })
        : null;

      if (error || !userRestaurants || userRestaurants.length === 0) {
        // Usuario autenticado pero sin restaurante asignado
        // (puede ocurrir en nuevos registros pendientes de onboarding)
        return supabaseResponse;
      }

      // 4.2 Determinar restaurante activo (cookie o el primero disponible)
      const selectedTenantCookie = request.cookies.get('active_restaurant_id')?.value;
      const activeMembership =
        userRestaurants.find((m) => m.restaurant_id === selectedTenantCookie) ??
        userRestaurants[0];

      if (activeMembership && activeMembership.restaurants) {
        const restaurant = activeMembership.restaurants as unknown as {
          id: string;
          name: string;
          is_active: boolean;
          subscription_status: string;
        };

        // Inyectar headers con información del tenant para Server Components
        supabaseResponse.headers.set('x-restaurant-id', restaurant.id);
        supabaseResponse.headers.set('x-user-role', activeMembership.role);

        // Triple Gate — Barrera 1 (Middleware Guard):
        // Si el restaurante está suspendido y no está en /billing, redirigir
        if (
          restaurant.subscription_status === 'suspended' &&
          !pathname.startsWith('/billing')
        ) {
          const billingUrl = request.nextUrl.clone();
          billingUrl.pathname = '/billing';
          billingUrl.searchParams.set('suspended', 'true');
          return NextResponse.redirect(billingUrl);
        }
      }
    } catch (err) {
      console.error('[Middleware] Error resolving tenant access:', err);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files with extensions (.svg, .png, .jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
