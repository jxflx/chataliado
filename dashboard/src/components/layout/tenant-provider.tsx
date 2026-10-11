'use client';

import React, { createContext, useContext, useState } from 'react';
import { type Restaurant, type UserRole } from '@/types/database';

export interface TenantContextType {
  activeRestaurant: Restaurant | null;
  userRole: UserRole | null;
  availableRestaurants: Restaurant[];
  switchRestaurant: (restaurantId: string) => void;
}

const TenantContext = createContext<TenantContextType>({
  activeRestaurant: null,
  userRole: null,
  availableRestaurants: [],
  switchRestaurant: () => {},
});

export function TenantProvider({
  children,
  initialRestaurant,
  initialRole,
  availableRestaurants = [],
}: {
  children: React.ReactNode;
  initialRestaurant: Restaurant | null;
  initialRole: UserRole | null;
  availableRestaurants: Restaurant[];
}) {
  const [activeRestaurant, setActiveRestaurant] = useState<Restaurant | null>(initialRestaurant);
  const [userRole] = useState<UserRole | null>(initialRole);

  const switchRestaurant = (restaurantId: string) => {
    const selected = availableRestaurants.find((r) => r.id === restaurantId);
    if (selected) {
      setActiveRestaurant(selected);
      // Guardar cookie para que el Middleware y Server Components sincronicen el tenant
      document.cookie = `active_restaurant_id=${restaurantId}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      window.location.reload();
    }
  };

  return (
    <TenantContext.Provider
      value={{
        activeRestaurant,
        userRole,
        availableRestaurants,
        switchRestaurant,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant debe utilizarse dentro de un TenantProvider');
  }
  return context;
}
