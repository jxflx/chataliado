'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function AmbientCanvas() {
  const pathname = usePathname();
  const [activeLayer, setActiveLayer] = useState<'kds' | 'chats' | 'customers' | 'menu' | 'settings'>('kds');

  // Inicializar textura de grano analógico en cliente post-hidratación (Zero hydration mismatch)
  useEffect(() => {
    try {
      const s = 256;
      const c = document.createElement('canvas');
      c.width = s;
      c.height = s;
      const x = c.getContext('2d');
      if (!x) return;
      const d = x.createImageData(s, s);
      const b = new Uint32Array(d.data.buffer);
      for (let i = 0; i < b.length; i++) {
        const n = (Math.random() * 255) | 0;
        const a = ((Math.random() * 55) + 20) | 0;
        b[i] = (a << 24) | (n << 16) | (n << 8) | n;
      }
      x.putImageData(d, 0, 0);
      const u = c.toDataURL('image/png');
      const o = document.getElementById('grain-overlay');
      if (o) {
        o.style.backgroundImage = `url(${u})`;
        o.style.backgroundRepeat = 'repeat';
      }
    } catch {
      // Fallback silencioso si canvas no está disponible
    }
  }, []);

  // Alternar capa cromática dinámica según la sección activa
  useEffect(() => {
    if (pathname.startsWith('/chats')) {
      setActiveLayer('chats');
    } else if (pathname.startsWith('/customers')) {
      setActiveLayer('customers');
    } else if (pathname.startsWith('/menu')) {
      setActiveLayer('menu');
    } else if (pathname.startsWith('/settings') || pathname.startsWith('/billing')) {
      setActiveLayer('settings');
    } else {
      setActiveLayer('kds');
    }
  }, [pathname]);

  return (
    <>
      {/* RUIDO / TEXTURA EDITORIAL TÁCTIL (Analog Stipple Film Grain) */}
      <div
        id="grain-overlay"
        className="grain-overlay"
        aria-hidden="true"
      />

      {/* PARED DE COLOR CONTINUA Y AMBIENTAL (Chromatic Canvas) */}
      <div
        id="ambient-mesh-canvas"
        className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none"
        aria-hidden="true"
      >
        <div id="ambient-sheen" className="ambient-sheen" />

        {/* 1. Layer KDS (Composición Oficial Richard Sancho: Terracota + Salvia + Periwinkle + Mostaza) */}
        <div
          id="ambient-layer-kds"
          className={`ambient-layer ${activeLayer === 'kds' ? 'active entering' : ''}`}
          style={{
            background:
              'linear-gradient(135deg, #FAF7F2 0%, #F6EFE8 30%, #EEF4F1 70%, #EBF2F7 100%)',
          }}
        >
          {/* Nube Terracota Suave */}
          <div
            className="wall-cloud wall-drift-a -top-[25vw] -left-[20vw] w-[88vw] h-[88vw]"
            style={{
              background:
                'radial-gradient(circle, rgba(224, 109, 83, 0.42) 0%, rgba(235, 135, 105, 0.26) 35%, rgba(245, 165, 135, 0.12) 60%, transparent 78%)',
            }}
          />
          {/* Nube Salvia Botánica */}
          <div
            className="wall-cloud wall-drift-b -bottom-[25vw] -right-[20vw] w-[92vw] h-[92vw]"
            style={{
              background:
                'radial-gradient(circle, rgba(46, 148, 114, 0.38) 0%, rgba(65, 175, 138, 0.24) 38%, rgba(95, 195, 160, 0.10) 62%, transparent 80%)',
            }}
          />
          {/* Nube Glaciar Periwinkle */}
          <div
            className="wall-cloud wall-drift-c -top-[15vw] right-[5vw] w-[75vw] h-[75vw]"
            style={{
              background:
                'radial-gradient(circle, rgba(74, 158, 220, 0.32) 0%, rgba(100, 180, 238, 0.20) 40%, rgba(140, 205, 245, 0.08) 60%, transparent 75%)',
            }}
          />
          {/* Nube Mostaza Oliva */}
          <div
            className="wall-cloud wall-drift-a bottom-[5vw] left-[15vw] w-[72vw] h-[72vw]"
            style={{
              background:
                'radial-gradient(circle, rgba(212, 163, 89, 0.28) 0%, rgba(230, 185, 115, 0.16) 42%, transparent 75%)',
            }}
          />
        </div>

        {/* 2. Layer CHATS (WhatsApp Cockpit: Jade Esmeralda + Iris Violeta + Turquesa) */}
        <div
          id="ambient-layer-chats"
          className={`ambient-layer ${activeLayer === 'chats' ? 'active entering' : ''}`}
          style={{
            background:
              'linear-gradient(135deg, #ECFDF5 0%, #E6FFFA 35%, #EEF2FF 70%, #F0FDF4 100%)',
          }}
        >
          {/* Nube Jade WhatsApp */}
          <div
            className="wall-cloud wall-drift-b -top-[20vw] -right-[15vw] w-[88vw] h-[88vw]"
            style={{
              background:
                'radial-gradient(circle, rgba(16, 185, 129, 0.75) 0%, rgba(5, 150, 105, 0.50) 38%, rgba(52, 211, 153, 0.22) 62%, transparent 78%)',
            }}
          />
          {/* Nube Iris Violeta */}
          <div
            className="wall-cloud wall-drift-a -bottom-[25vw] -left-[20vw] w-[92vw] h-[92vw]"
            style={{
              background:
                'radial-gradient(circle, rgba(99, 102, 241, 0.70) 0%, rgba(129, 140, 248, 0.45) 40%, rgba(165, 180, 252, 0.20) 65%, transparent 80%)',
            }}
          />
          {/* Nube Cian Eléctrico */}
          <div
            className="wall-cloud wall-drift-c top-[10vw] left-[20vw] w-[75vw] h-[75vw]"
            style={{
              background:
                'radial-gradient(circle, rgba(6, 182, 212, 0.60) 0%, rgba(45, 212, 191, 0.35) 45%, transparent 75%)',
            }}
          />
          {/* Nube Menta Primaveral */}
          <div
            className="wall-cloud wall-drift-b bottom-[10vw] right-[25vw] w-[70vw] h-[70vw]"
            style={{
              background:
                'radial-gradient(circle, rgba(52, 211, 153, 0.50) 0%, rgba(110, 231, 183, 0.25) 45%, transparent 75%)',
            }}
          />
        </div>

        {/* 3. Layer CLIENTES (Monograph Pastel) */}
        <div
          id="ambient-layer-customers"
          className={`ambient-layer ${activeLayer === 'customers' ? 'active entering' : ''}`}
          style={{
            background:
              'linear-gradient(120deg, #FDF4F8 0%, #FAF6FE 40%, #F1F6FD 100%)',
          }}
        >
          <div
            className="wall-cloud wall-drift-a -top-[20vw] -left-[25vw] w-[95vw] h-[95vw]"
            style={{
              background:
                'radial-gradient(circle, rgba(225, 29, 114, 0.34) 0%, rgba(244, 63, 94, 0.22) 36%, rgba(251, 113, 133, 0.10) 62%, transparent 80%)',
            }}
          />
          <div
            className="wall-cloud wall-drift-b -bottom-[20vw] -right-[20vw] w-[95vw] h-[95vw]"
            style={{
              background:
                'radial-gradient(circle, rgba(37, 99, 235, 0.32) 0%, rgba(59, 130, 246, 0.20) 38%, rgba(96, 165, 250, 0.08) 65%, transparent 80%)',
            }}
          />
        </div>

        {/* 4. Layer MENÚ & CATÁLOGO (Calidez Toscana Suave: Ámbar toscano + Mandarina coral + Albahaca menta + Frambuesa carmesí) */}
        <div
          id="ambient-layer-menu"
          className={`ambient-layer ${activeLayer === 'menu' ? 'active entering' : ''}`}
          style={{
            background:
              'linear-gradient(130deg, #FFFDF5 0%, #FEF9EC 35%, #F4FBF6 70%, #FFF5F6 100%)',
          }}
        >
          {/* Nube Miel de Ámbar Toscano */}
          <div
            className="wall-cloud wall-drift-a -top-[20vw] -left-[15vw] w-[90vw] h-[90vw]"
            style={{
              background:
                'radial-gradient(circle, rgba(245, 158, 11, 0.35) 0%, rgba(245, 158, 11, 0.22) 40%, transparent 75%)',
            }}
          />
          {/* Nube Atardecer Mandarina Coral */}
          <div
            className="wall-cloud wall-drift-b -bottom-[25vw] -right-[15vw] w-[92vw] h-[92vw]"
            style={{
              background:
                'radial-gradient(circle, rgba(249, 115, 22, 0.32) 0%, rgba(249, 115, 22, 0.18) 42%, transparent 78%)',
            }}
          />
          {/* Nube Albahaca Menta Fresca */}
          <div
            className="wall-cloud wall-drift-c top-[15vw] right-[10vw] w-[75vw] h-[75vw]"
            style={{
              background:
                'radial-gradient(circle, rgba(16, 185, 129, 0.28) 0%, rgba(16, 185, 129, 0.14) 45%, transparent 75%)',
            }}
          />
          {/* Nube Frambuesa Carmesí Delicada */}
          <div
            className="wall-cloud wall-drift-a bottom-[10vw] left-[20vw] w-[72vw] h-[72vw]"
            style={{
              background:
                'radial-gradient(circle, rgba(244, 63, 94, 0.22) 0%, rgba(244, 63, 94, 0.10) 45%, transparent 75%)',
            }}
          />
        </div>
      </div>
    </>
  );
}
