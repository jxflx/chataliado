'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChefHat,
  MessageSquare,
  Users,
  Utensils,
  SlidersHorizontal,
} from 'lucide-react';
import { useTenant } from './tenant-provider';

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  rolesAllowed?: string[];
  badge?: string;
  badgeBg?: string;
  title: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'nav-kds',
    label: 'KDS',
    href: '/kds',
    icon: ChefHat,
    badge: '8',
    badgeBg: 'bg-crimson',
    title: 'Comandas de Cocina (KDS)',
    rolesAllowed: ['owner', 'admin', 'staff'],
  },
  {
    id: 'nav-chats',
    label: 'Chats',
    href: '/chats',
    icon: MessageSquare,
    badge: '1',
    badgeBg: 'bg-ochre',
    title: 'Monitor de Chats de WhatsApp',
    rolesAllowed: ['owner', 'admin', 'staff'],
  },
  {
    id: 'nav-customers',
    label: 'Clientes',
    href: '/customers',
    icon: Users,
    title: 'Clientes & Memoria',
    rolesAllowed: ['owner', 'admin', 'staff'],
  },
  {
    id: 'nav-menu',
    label: 'Menú',
    href: '/menu',
    icon: Utensils,
    title: 'Menú & Catálogo',
    rolesAllowed: ['owner', 'admin'],
  },
  {
    id: 'nav-settings',
    label: 'Ajustes',
    href: '/settings',
    icon: SlidersHorizontal,
    title: 'Configuraciones',
    rolesAllowed: ['owner'],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { activeRestaurant, userRole } = useTenant();

  const operatorInitials = activeRestaurant?.name
    ? activeRestaurant.name
        .split(' ')
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'LG'
    : 'LG';

  return (
    <aside className="hidden md:flex w-[72px] liquid-dock rounded-3xl flex-col items-center justify-between py-4 shrink-0 select-none z-20">
      {/* Top Section: Monograma CA & Navegacion Vertical */}
      <div className="flex flex-col items-center gap-6">
        {/* Monograma Monocromatico CA */}
        <Link href="/kds" title="ChatAliado Liquid Glass" className="pressable">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-800 text-white flex items-center justify-center font-extrabold text-sm tracking-tighter shadow-md border border-white/20">
            CA
          </div>
        </Link>

        {/* Iconos de Navegacion Vertical */}
        <nav className="flex flex-col items-center gap-2">
          {NAV_ITEMS.map((item) => {
            if (
              item.rolesAllowed &&
              userRole &&
              !item.rolesAllowed.includes(userRole)
            ) {
              return null;
            }

            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                id={item.id}
                href={item.href}
                title={item.title}
                className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center gap-0.5 pressable relative transition-all ${
                  isActive
                    ? 'bg-periwinkle-tint text-periwinkle-ink shadow-2xs border border-white/90'
                    : 'text-ink-secondary hover:text-ink-primary hover:bg-white/80 border border-transparent hover:border-white/60'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" strokeWidth={1.5} />
                <span className="text-[9px] font-bold tracking-tight leading-none">
                  {item.label}
                </span>
                {item.badge && (
                  <span
                    className={`absolute -top-1 -right-1 font-mono text-[10px] font-bold w-4 h-4 rounded-full ${item.badgeBg ?? 'bg-crimson'} text-white flex items-center justify-center border-2 border-white shadow-2xs leading-none`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Base del Rail: Conexion WhatsApp & Avatar de Turno */}
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-3 h-3 rounded-full bg-jade ring-4 ring-emerald-200/60 animate-pulse"
          title="WhatsApp Conectado (Evolution API / Meta)"
        />
        <div
          className="w-10 h-10 rounded-2xl bg-white/80 border border-white flex items-center justify-center font-bold text-xs text-ink-primary shadow-2xs"
          title={`Turno Activo: ${activeRestaurant?.name ?? 'Cocina Principal'}`}
        >
          {operatorInitials}
        </div>
      </div>
    </aside>
  );
}
