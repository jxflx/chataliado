'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/(auth)/actions';
import { Store, LogOut, Wifi, UserCheck } from 'lucide-react';
import { useTenant } from './tenant-provider';

export function Header() {
  const pathname = usePathname();
  const { activeRestaurant, userRole, availableRestaurants, switchRestaurant } =
    useTenant();

  const getSectionMeta = () => {
    if (pathname.startsWith('/kds')) {
      return {
        title: 'KDS Cocina',
        badge: '8 en Cola',
        badgeClass: 'text-red-900 bg-red-100 border-red-300',
      };
    }
    if (pathname.startsWith('/chats')) {
      return {
        title: 'Monitor de Chats',
        badge: 'En Vivo',
        badgeClass: 'text-emerald-900 bg-emerald-100 border-emerald-300',
      };
    }
    if (pathname.startsWith('/customers')) {
      return {
        title: 'Clientes & Memoria',
        badge: 'CRM',
        badgeClass: 'text-blue-900 bg-blue-100 border-blue-300',
      };
    }
    if (pathname.startsWith('/menu')) {
      return {
        title: 'Menú & Catálogo',
        badge: 'Carta Activa',
        badgeClass: 'text-emerald-900 bg-emerald-100 border-emerald-300',
      };
    }
    if (pathname.startsWith('/billing')) {
      return {
        title: 'Facturación & Plan',
        badge: 'Suscripción',
        badgeClass: 'text-emerald-900 bg-emerald-100 border-emerald-300',
      };
    }
    if (pathname.startsWith('/settings')) {
      return {
        title: 'Configuración',
        badge: 'Sistema',
        badgeClass: 'text-slate-800 bg-slate-100 border-slate-300',
      };
    }
    return {
      title: 'ChatAliado',
      badge: 'Consola',
      badgeClass: 'text-slate-800 bg-slate-100 border-slate-300',
    };
  };

  const { title, badge, badgeClass } = getSectionMeta();

  return (
    <header className="h-16 px-5 liquid-header rounded-3xl flex items-center justify-between shrink-0 select-none border border-white/95 shadow-xs">
      {/* Titulo de Seccion & Pildora de Estado */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-extrabold text-ink-primary tracking-tight flex items-center gap-2.5">
          <span>{title}</span>
          <span
            className={`text-xs font-mono font-extrabold px-2.5 py-0.5 rounded-full border shadow-2xs ${badgeClass}`}
          >
            {badge}
          </span>
        </h1>
      </div>

      {/* Controles Operativos, Sucursal, Realtime y Usuario */}
      <div className="flex items-center gap-3">
        {/* Selector de Sucursal / Tenant */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/95 border border-slate-200/90 rounded-2xl text-xs text-ink-primary shadow-2xs font-extrabold">
          <Store className="w-3.5 h-3.5 text-jade shrink-0" strokeWidth={1.5} />
          {availableRestaurants.length > 1 ? (
            <select
              value={activeRestaurant?.id ?? ''}
              onChange={(e) => switchRestaurant(e.target.value)}
              className="bg-transparent text-xs text-ink-primary font-bold focus:outline-none cursor-pointer"
            >
              {availableRestaurants.map((r) => (
                <option
                  key={r.id}
                  value={r.id}
                  className="text-ink-primary bg-white"
                >
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-extrabold text-xs text-ink-primary">
              {activeRestaurant?.name ?? 'Restaurante'}
            </span>
          )}
        </div>

        {/* Realtime Status Indicator (Alto Contraste) */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/90 text-emerald-900 text-[11px] font-extrabold font-mono border border-emerald-300/80 shadow-2xs">
          <Wifi className="w-3 h-3 text-emerald-700 animate-pulse" strokeWidth={1.5} />
          <span>Realtime Conectado</span>
        </div>

        <div className="h-5 w-px bg-slate-200/90" />

        {/* Perfil de Operador / Rol */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-white/95 border border-slate-200/80 shadow-2xs flex items-center justify-center text-xs font-bold text-ink-primary">
            <UserCheck className="w-4 h-4 text-jade" strokeWidth={1.5} />
          </div>
          <div className="hidden lg:block text-left leading-none">
            <div className="text-xs font-extrabold text-ink-primary capitalize">
              {userRole ?? 'staff'}
            </div>
            <div className="text-[10px] text-ink-secondary font-bold mt-0.5">
              Sesión Activa
            </div>
          </div>
        </div>

        {/* Accion de Salir / Logout */}
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-ink-secondary hover:text-ink-primary bg-white/70 hover:bg-white border border-white/90 shadow-2xs transition pressable cursor-pointer"
            title="Cerrar Sesión"
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </form>
      </div>
    </header>
  );
}
