import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { TenantProvider } from '@/components/layout/tenant-provider';
import { type Restaurant, type UserRole } from '@/types/database';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Consultar membrecias de restaurantes del usuario
  const { data: rawMemberships, error } = await supabase
    .from('restaurant_users')
    .select(`
      role,
      restaurant_id,
      restaurants (*)
    `)
    .eq('user_id', user.id);

  type MembershipRow = {
    role: UserRole;
    restaurant_id: string;
    restaurants: Restaurant | null;
  };

  const rawList = rawMemberships as unknown as MembershipRow[] | null;
  const memberships = rawList
    ? rawList.map((m) => {
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

  if (error || !memberships || memberships.length === 0) {
    // Si no tiene restaurantes asociados, mostrar tarjeta Liquid Glass
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center text-ink-primary">
        <div className="liquid-card rounded-3xl p-8 max-w-md flex flex-col items-center shadow-glass-elevated border border-white/90">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-800 text-white font-extrabold text-base flex items-center justify-center mb-4 shadow-md border border-white/20">
            CA
          </div>
          <h1 className="text-lg font-extrabold text-ink-primary mb-2">
            No tienes un restaurante asociado
          </h1>
          <p className="text-ink-secondary text-xs max-w-sm mb-6 leading-relaxed">
            Tu cuenta de usuario no tiene acceso a ningun restaurante activo en ChatAliado.
            Contacta al administrador para recibir una invitacion.
          </p>
          <form action="/login">
            <button className="px-5 py-2.5 bg-white/90 hover:bg-white border border-white/90 rounded-2xl text-xs font-bold text-ink-primary pressable shadow-2xs">
              Regresar al Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  const cookieStore = await cookies();
  const activeTenantId = cookieStore.get('active_restaurant_id')?.value;

  const activeMembership =
    memberships.find((m) => m.restaurant_id === activeTenantId) ?? memberships[0];

  const activeRestaurant = (activeMembership?.restaurants as unknown as Restaurant) ?? null;
  const userRole = (activeMembership?.role as UserRole) ?? 'staff';

  const availableRestaurants = memberships
    .map((m) => m.restaurants as unknown as Restaurant)
    .filter(Boolean);

  return (
    <TenantProvider
      initialRestaurant={activeRestaurant}
      initialRole={userRole}
      availableRestaurants={availableRestaurants}
    >
      <div className="h-full flex p-3 gap-3 overflow-hidden selection:bg-jade-subtle selection:text-jade">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 gap-3 relative z-10 overflow-hidden">
          <Header />
          <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </TenantProvider>
  );
}
