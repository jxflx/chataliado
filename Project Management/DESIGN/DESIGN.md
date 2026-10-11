# Sistema de Diseño Oficial: ChatAliado — Liquid Glass Edition

> **Fuente Única de Verdad (Single Source of Truth) para Arquitectura de UI, Tokens Visuales, Ergonomía y Anti-Patrones.**  
> Gobernada por la filosofía funcional de **Dieter Rams ("Menos, pero mejor") + Apple Human Interface**: limpia, profesional, táctil, sin clichés de IA ni adornos innecesarios.

---

## 0. Prototipo Interactivo Oficial (Living Prototype)

Toda la interactividad, refracción vítrea, animaciones a 60fps, física de botones y tokens visuales se encuentran **implementados y validados** en el prototipo interactivo:

- **Archivo Espejo en el Repositorio de ChatAliado:**  
  👉 [`Project Management/DESIGN/kds-liquid-glass.html`](file:///c:/Users/jesus/prog/chataliado/Project%20Management/DESIGN/kds-liquid-glass.html)
- **Proyecto Vivo en Open Design (Desktop App):**  
  `C:\Users\jesus\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\chataliado-dashboard-f082\index.html`

> ⚠️ **REGLA OBLIGATORIA PARA CUALQUIER LLM O DESARROLLADOR:**  
> Antes de programar o maquetar cualquier pantalla, componente o modal en Next.js / Tailwind, **debes consultar este documento y el prototipo `kds-liquid-glass.html`**. Está estrictamente prohibido improvisar estilos oscuros genéricos, degradados espaciales morados o meter emojis.

---

## 1. Filosofía Visual & Atmósfera: Liquid Glass

ChatAliado no es una plantilla genérica ni un juguete de IA; es una **consola operativa de alta fidelidad** utilizada por dueños de restaurantes, cajeros y cocineros en turnos de alta presión.

* **Atmósfera General:** Superficies flotantes de vidrio líquido esmerilado (*Liquid Glass*) sobre un lienzo táctil de papel editorial cálido (`#FAF8F5`). El contenido refracta sutilmente los colores del fondo manteniendo un contraste tipográfico impecable.
* **Lienzo Base (Paper Base):**  
  `background: #FAF8F5;` (hueso/crema editorial, cálido y mate; cero blancos fríos clínicos `#FFFFFF` ni negros puros `#000000`).
* **Tokens de Cristal Líquido:**
  * **`liquid-dock`**: `background: rgba(255, 255, 255, 0.72); backdrop-filter: blur(24px) saturate(180%); border: 1px solid rgba(255, 255, 255, 0.9); box-shadow: 0 12px 32px -4px rgba(15, 23, 42, 0.06), inset 0 1px 1px rgba(255, 255, 255, 0.95);`
  * **`liquid-header`**: `background: rgba(255, 255, 255, 0.78); backdrop-filter: blur(20px) saturate(170%); border: 1px solid rgba(255, 255, 255, 0.92); box-shadow: 0 6px 24px -2px rgba(15, 23, 42, 0.03), inset 0 1px 1px rgba(255, 255, 255, 0.9);`
  * **`liquid-card`**: `background: rgba(255, 255, 255, 0.82); backdrop-filter: blur(20px) saturate(170%); border: 1px solid rgba(255, 255, 255, 0.92); box-shadow: 0 8px 24px -4px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.85);`
  * **`liquid-panel`**: `background: rgba(255, 255, 255, 0.55); backdrop-filter: blur(20px) saturate(160%); border: 1px solid rgba(255, 255, 255, 0.85);`

---

## 2. El Fondo Atmosférico: Pared de Color Continua & Grano Fílmico

A diferencia de interfaces con fondos planos o esferas circulares aisladas que dejan huecos blancos, ChatAliado utiliza un sistema de dos capas continuas que cubren el 100% del viewport:

### 2.1. Pared de Color Continua (Inspiración: *Monograph*)
Cada pantalla posee un fondo base de espectro continuo y **nubes cromáticas fluidas gigantescas (`88vw–95vw`)** que se multiplican entre sí (`mix-blend-mode: multiply`) con difuminado gaussiano ultra suave (`filter: blur(90px)`):
* **Física de Deriva:** Las nubes flotan lentamente con órbitas asíncronas de 19 a 26 segundos (`wall-drift-a`, `wall-drift-b`, `wall-drift-c`), dando una sensación viva y orgánica de profundidad.
* **Transición de Pestaña (Bloom & Sheen):** Al cambiar de pantalla se dispara una animación de florecimiento suave (`layerEntrance` en 1100ms) acompañada de un destello de luz sobre el cristal (`ambient-sheen` con `specularSweep`).

### 2.2. Textura de Grano Analógico (Inspiración: *Richard Sancho*)
Para erradicar la apariencia fría de gráficos generados por computadora, se superpone un velo táctil de **ruido estípula risograph / film grain**:
* **Implementación:** Capa `#grain-overlay` fija con `z-index: 35`, `pointer-events: none`, `mix-blend-mode: overlay` y opacidad calibrada al `0.36`.
* **Procedural y Zero-Latency:** Generado en 1.5ms mediante un canvas monocromático de 256x256px (`initFilmGrain`) exportado como PNG data URL y repetido en mosaico por GPU. Cero consumo de red, cero peticiones externas y 0.0% de uso de CPU durante scroll.

---

## 3. Catálogo Cromático Oficial Pantalla por Pantalla

Los colores han sido calibrados en opacidad y tono para ofrecer máxima calidez y legibilidad sin saturar la vista, especialmente en pantallas con pocos elementos centrales:

### 3.1. KDS Cocina Pro — Composición Richard Sancho (Tierra, Arcilla y Salvia)
*Diseñada para restaurantes y pizzerías con alta demanda. Evita amarillos chillones.*
- **Lienzo Base:** `linear-gradient(135deg, #FAF7F2 0%, #F6EFE8 30%, #EEF4F1 70%, #EBF2F7 100%)`
- **Nube Terracota Cálida (Masa / Corteza):** `rgba(224, 109, 83, 0.42)`
- **Nube Salvia Botánica (Jade Musgo):** `rgba(46, 148, 114, 0.38)`
- **Nube Glaciar Periwinkle (Hielo / Agua):** `rgba(74, 158, 220, 0.32)`
- **Nube Mostaza Oliva (Tierra / Miel):** `rgba(212, 163, 89, 0.28)`

### 3.2. Monitor de Chats — Cabina WhatsApp Esmeralda Profundo (*Benchmark Intacto*)
*Atmósfera de alta tecnología fresca para lectura rápida y atención en tiempo real.*
- **Lienzo Base:** `linear-gradient(135deg, #ECFDF5 0%, #E6FFFA 35%, #EEF2FF 70%, #F0FDF4 100%)`
- **Nube Jade WhatsApp (Esmeralda Principal):** `rgba(16, 185, 129, 0.75)`
- **Nube Iris Violeta (Índigo Eléctrico):** `rgba(99, 102, 241, 0.70)`
- **Nube Cian Eléctrico (Turquesa):** `rgba(6, 182, 212, 0.60)`
- **Nube Menta Primaveral:** `rgba(52, 211, 153, 0.50)`

### 3.3. Clientes & Memoria Conversacional — Composición Monograph Pastel
*Espectro horizontal continuo, suave y aireado para no abrumar las tarjetas centrales.*
- **Lienzo Base:** `linear-gradient(120deg, #FDF4F8 0%, #FAF6FE 40%, #F1F6FD 100%)`
- **Nube Berry Rose Suave (Costado Izquierdo):** `rgba(225, 29, 114, 0.34)`
- **Nube Zafiro Royal Azure Calma (Costado Derecho):** `rgba(37, 99, 235, 0.32)`
- **Nube Orquídea Lavanda / Lila (Puente Central):** `rgba(168, 85, 247, 0.28)`
- **Nube Rosa Fucsia Tenue:** `rgba(219, 39, 119, 0.22)`

### 3.4. Menú & Catálogo — Calidez Toscana Suave
*Tonos gastronómicos apetecibles y reconfortantes.*
- **Lienzo Base:** `linear-gradient(130deg, #FFFDF5 0%, #FEF9EC 35%, #F4FBF6 70%, #FFF5F6 100%)`
- **Nube Miel de Ámbar Toscano:** `rgba(245, 158, 11, 0.35)`
- **Nube Atardecer Mandarina Coral:** `rgba(249, 115, 22, 0.32)`
- **Nube Albahaca Menta Fresca:** `rgba(16, 185, 129, 0.28)`
- **Nube Frambuesa Carmesí Delicada:** `rgba(244, 63, 94, 0.22)`

### 3.5. Ajustes del Restaurante — Precisión Cyber Glaciar
*Limpio, sereno y técnico para concentración en configuraciones del sistema.*
- **Lienzo Base:** `linear-gradient(135deg, #F4F6FD 0%, #EDF1FD 35%, #F3FAF8 70%, #F8FAFC 100%)`
- **Nube Cyber Índigo Suave:** `rgba(79, 70, 229, 0.32)`
- **Nube Océano Glaciar Cian:** `rgba(2, 132, 199, 0.30)`
- **Nube Menta Neón Ligera:** `rgba(20, 184, 166, 0.25)`
- **Nube Pizarra Periwinkle Sutil:** `rgba(148, 163, 184, 0.20)`

---

## 4. Política Estricta de CERO EMOJIS (Zero-Emoji Mandate)

> 🚫 **PROHIBICIÓN ABSOLUTA:** Queda terminantemente prohibido el uso de emojis en cualquier elemento visual de la plataforma (títulos, botones, comandas, etiquetas de canal, estados o badges).  
> Los emojis transmiten informalidad y hacen que el software parezca un juguete o un prototipo descuidado.

* **Reemplazo Exclusivo:** Se utilizarán **únicamente iconos vectoriales de la librería [Lucide](https://lucide.dev/)** con grosor uniforme de `1.5px` a `2px`.
* **Criterio de Parsimonia:** Solo se incluye un icono cuando cumple una función semántica real (ej. `chef-hat` en el dock de cocina, `message-circle` en chats, `clock` junto al tiempo transcurrido). Si un texto es 100% comprensible por sí mismo (como los nombres de ingredientes o las píldoras de totales), **no debe llevar icono**.

---

## 5. Arquitectura Tipográfica

La jerarquía visual se resuelve mediante pesos, contraste de tinta y contención de escala, no con tamaños de letra desproporcionados:

* **Tipografía Primaria (Textos, Cabeceras e Inputs):**  
  **`Plus Jakarta Sans`** (Google Fonts / Interfaz Humana no-IA).  
  - Títulos principales: `font-extrabold` (800) o `font-bold` (700), espaciado cerrado (`tracking-tight`).
  - Etiquetas y metadatos: `font-bold` (700) o `font-semibold` (600) para máxima legibilidad sobre cristal.
* **Tipografía Monoespaciada (Datos Operativos y Financieros):**  
  **`JetBrains Mono`** (Google Fonts / monospace técnico).  
  - **Uso obligatorio en:** Números de comanda (`#11613`), cronómetros de cocina (`14:20 min`), precios (`$330 MXN`), multiplicadores de platillo (`2x`), teléfonos (`+52 55 ...`) y contadores de la barra All-Day.
* **Tinta Tipográfica de Alto Contraste (Ink Tokens):**
  - `ink-primary`: `#0F172A` (Slate 900 profundo, contraste 15:1 sin la dureza del negro puro).
  - `ink-secondary`: `#475569` (Slate 600, notas secundarias, modificadores).
  - `ink-tertiary`: `#94A3B8` (Slate 400, timestamps secundarios).
* **Regla de Prohibición:** Prohibido el uso de *Inter*, *Arial*, fuentes genéricas de sistema y cualquier fuente Serif.

---

## 6. Arquitectura de Pantallas y Componentes

### 6.1. Pantalla KDS Cocina (`/kds`) — Matriz Operativa Toast POS
Diseñada para tablets de cocina (10" a 12") y pantallas táctiles operadas con rapidez:
1. **Selector de Cuadrícula:** Botones en cabecera para alternar dinámicamente entre **`4 cols (2x4 = 8 comandas)`** y **`5 cols (2x5 = 10 comandas)`**.
2. **Filtro Rápido de Canales:** Píldoras para filtrar: `Todos`, `Domicilio`, `Para Llevar`, `Mesa`.
3. **Tarjeta de Comanda Liquid Glass:**
   - **Cabecera Semafórica:**
     - *Normal (< 8 min):* Blanco esmerilado con timer gris/azul.
     - *Advertencia (> 8 min):* Cabecera ámbar suave (`bg-amber-50/80`) con timer ámbar destacado.
     - *Retraso Crítico (> 15 min):* Cabecera roja (`bg-red-50/80`) con timer en carmesí parpadeante/animado.
     - *Preview Ticket (Cliente en WhatsApp armando pedido):* Borde punteado gris/ámbar con aviso de comanda preliminar.
   - **Lista de Platillos Interactiva:** Cada renglón se puede tocar para tacharlo (`item-done`), marcando en verde esmeralda los platillos listos mientras el resto sigue en preparación.
   - **Botón Despachar (Bump):** Píldora compacta en negro pizarra (`bg-slate-900`) con texto en blanco y check verde jade (`<i data-lucide="check" class="text-jade"></i>`). Al tocarlo, la orden realiza una salida física suave (`transform: scale(0.92) translateY(8px)`) y pasa a la pila de recuperación.
   - **Botón `[ Chat ]` en Comanda:** Acceso instantáneo en un clic a un modal flotante con los últimos mensajes de WhatsApp del cliente para aclarar dudas de cocina sin abandonar el KDS.
4. **Barra Fija Inferior: `TOTALES ALL DAY`:**
   - Contenedor flotante en la base de la pantalla que suma en tiempo real todos los platillos pendientes de todas las comandas activas (ej. `[ 1 Pizza Pepperoni ] [ 2 Cerveza Corona ]`).
   - Botón `[ Deshacer #ID (Recall) ]` para reincorporar al instante una orden despachada por error.

### 6.2. Monitor de Chats WhatsApp (`/chats`) — Doble Dock Flotante
Estructura aireada de dos docks independientes sobre el fondo living de jade:
1. **Dock Izquierdo (Bandeja de Conversaciones - 360px):**
   - Buscador superior con filtro instantáneo.
   - Pestañas de filtrado: `Todos (8)`, `Atención Requerida (1)` (resaltada en ámbar), `En Cocina (5)`.
   - Elementos de lista con indicador de estado (punto verde de IA o ámbar de asesor humano), snippet del último mensaje, total del pedido y timestamp.
2. **Dock Derecho (Cockpit Operativo):**
   - **Barra de Control:** Muestra iniciales del cliente, nombre, número de comanda, badge de pago (`PAGADO` / `COBRAR`) y el switch de intervención:  
     `[ 🟢 Modo IA (Activo) ]` ⇄ `[ 🟡 Control Humano (Tú) ]`.
   - **Timeline de Mensajes:** Burbujas diferenciadas:
     - Cliente (WhatsApp): Periwinkle suave a la izquierda.
     - Bot IA / Transcripción de audios: Fondo blanco con acento sutil a la derecha.
     - Operador humano: Fondo oscuro pizarra (`bg-slate-900`) a la derecha con etiqueta explícita de operador.
   - **Respuestas Rápidas (Chips):** Botones en un toque para insertar respuestas de alta frecuencia (*"Ya está en el horno"*, *"Repartidor en camino (12 min)"*, *"Lleva cambio de $170"*).
   - **Input y Despacho Humano:** Campo de texto directo que invoca `POST /api/messages/send` del Worker ($0.00 costo LLM).
   - **Cajón de Memoria (`notes_md`):** Drawer lateral deslizable con los datos consolidados del cliente (dirección habitual, alergias, preferencias).

---

## 7. Física de Presión y Micro-Interacciones (Motion)

* **Física Táctil de Botones:** En todo elemento interactivo se aplica la clase `.pressable`:
  ```css
  .pressable {
    transition: transform 80ms cubic-bezier(0.32, 0.72, 0, 1), background-color 150ms ease, box-shadow 150ms ease;
  }
  .pressable:active {
    transform: scale(0.98) translateY(1px);
  }
  ```
* **Transiciones entre Pantallas:**
  - La capa ambiental activa recibe la clase `.active.entering` reiniciando `@keyframes layerEntrance` (bloom de saturación y escala suave).
  - La capa `.ambient-sheen` ejecuta `@keyframes specularSweep` proyectando un haz de luz diagonal de 15° sobre el vidrio.

---

## 8. Lista Negra de Anti-Patrones (Reglas de Rechazo Inmediato)

Cualquier pantalla o componente que incluya alguno de los siguientes patrones **se considera inválido y debe ser rechazado**:

1. ❌ **Cero Emojis:** Prohibido meter emojis (`🛵`, `🍕`, `🤖`, `✨`, etc.) en cualquier lugar del código o interfaz.
2. ❌ **Cero Neón ni "AI Slop":** Prohibidos los degradados morados espaciales, bordes con resplandor neón (*glow*) o interfaces de ciencia ficción oscura.
3. ❌ **Cero Estrellitas Mágicas:** Prohibidos iconos de chispas mágicas tipo `✨ Ask AI`. La inteligencia artificial opera tras bambalinas de forma determinista y silenciosa.
4. ❌ **Cero Fuentes Genéricas:** Prohibido utilizar `Inter`, `Arial` o fuentes Serif.
5. ❌ **Cero Negro Puro (`#000000`):** Utilizar siempre Slate Ink (`#0F172A`) para textos principales.
6. ❌ **Cero Código Truncado:** Prohibido escribir componentes con comentarios del tipo `// TODO: resto del código`. Cada componente debe estar 100% implementado, tipado con TypeScript estricto y respaldado por este manual.
