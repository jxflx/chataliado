# Project: ChatAliado — Interactive Local Development Playground & Simulator

## Architecture
The ChatAliado Playground is a lightweight, zero-dependency, static Single Page Application (HTML5 + Tailwind CSS CDN + Modular Vanilla ES6 JS) designed strictly for local development, debugging, and engineering simulation (`DEV_ONLY`). It enables developers to simulate multiple simultaneous WhatsApp conversations against the local Cloudflare Worker backend (`http://localhost:8787/webhook/evolution`) and observe real-time kitchen orders, customer memory markdown (`notes_md`), and LLM tool execution traces stored in Supabase.

### System Diagram
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        ChatAliado Playground (Static SPA / Vanilla JS)                 │
│                                                                                        │
│  ┌───────────────────────┐  ┌────────────────────────┐  ┌───────────────────────────┐  │
│  │ Panel 1: WhatsApp     │  │ Panel 2: Kitchen       │  │ Panel 3: Debugger         │  │
│  │ Multi-Client Chat     │  │ & Orders Dashboard     │  │ Tools & Memory Inspector  │  │
│  │                       │  │                        │  │                           │  │
│  │ • Contact Switcher    │  │ • Draft / Confirmed    │  │ • Chronological Tools Log │  │
│  │ • Quick Add Phone     │  │ • Item Breakdown       │  │ • Live notes_md Viewer    │  │
│  │ • Conversation Feed   │  │ • Financial Summary    │  │ • AI vs HUMAN Mode Badge  │  │
│  │ • Webhook Trigger     │  │ • Delivery & Payment   │  │ • Raw JSON Inspection     │  │
│  └───────────┬───────────┘  └───────────▲────────────┘  └─────────────▲─────────────┘  │
│              │                          │                             │                │
│              │ POST /webhook/evolution  │ GET PostgREST               │ GET PostgREST  │
│              ▼                          │                             │                │
└──────────────┼──────────────────────────┴─────────────────────────────┴────────────────┘
               │                                                        ▲
               ▼                                                        │
┌──────────────────────────────┐              ┌─────────────────────────┴─────────────┐
│ Cloudflare Worker Backend    │              │ Supabase Cloud (PostgreSQL)           │
│ (http://localhost:8787)      │─────────────►│ • customers (notes_md)                │
│ • Evolution Webhook Parser   │  Async DB    │ • conversations (mode: ai|human)      │
│ • AgentOrchestrator + Tools  │  Persistence │ • messages (role, tool_calls, metadata)│
│ • Deterministic Math Engine  │              │ • orders & order_items                │
└──────────────────────────────┘              └───────────────────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Configuration & Isolation | `config.js` with local endpoints, keys, poll intervals, and strict `DEV_ONLY` headers/banners | M1 | ORIGINAL_REQUEST R4 |
| 2 | Reactive Store & State | `store.js` event-driven state manager for contacts, active contact, conversation, order, tool logs, notes | M1 | ORIGINAL_REQUEST Context |
| 3 | Core Layout & Tailwind UI | `index.html` 3-column responsive layout with header indicators and status badges | M1 | ORIGINAL_REQUEST R1-R4 |
| 4 | Evolution API Webhook Client | `api.js` `sendWhatsAppMessage` constructing valid Baileys `messages.upsert` with unique message IDs | M2 | ORIGINAL_REQUEST R1 |
| 5 | PostgREST Client & Polling | `api.js` methods to fetch customers, conversations, messages, and orders with nested `order_items` | M2 | ORIGINAL_REQUEST Context |
| 6 | Multi-Client WhatsApp Chat | `chat-ui.js` contact switcher, custom phone input, message bubbles (user/assistant/system), input send | M2 | ORIGINAL_REQUEST R1 |
| 7 | Kitchen Order State Card | `kitchen-ui.js` active order header showing `draft` vs `confirmed` vs `preparing` with status colors | M3 | ORIGINAL_REQUEST R2 |
| 8 | Order Items Breakdown | `kitchen-ui.js` table/list of products, quantities, options, unit prices, and line subtotals | M3 | ORIGINAL_REQUEST R2 |
| 9 | Financial & Delivery Summary | `kitchen-ui.js` subtotal, delivery fee, discount, total, address, and payment method | M3 | ORIGINAL_REQUEST R2 |
| 10 | LLM Tools Tracing Timeline | `debugger-ui.js` chronological badges for `get_menu`, `create_order`, `add_order_item`, etc. with I/O | M4 | ORIGINAL_REQUEST R3 |
| 11 | Live Customer Markdown Memory | `debugger-ui.js` rendered view of `customers.notes_md` ("Bloc de Notas del Mesero") | M4 | ORIGINAL_REQUEST R3 |
| 12 | Conversational Mode Badge | `debugger-ui.js` `AI` vs `HUMAN` indicator with handoff trigger explanation | M4 | ORIGINAL_REQUEST R3 |
| 13 | App Orchestrator & Poller | `app.js` bootstrapping, event listeners, burst polling on send, and periodic refresh | M5 | ORIGINAL_REQUEST R4 |
| 14 | Documentation & DEV_ONLY | `README.md` with explicit DEV_ONLY warning, setup instructions, and testing guide | M5 | ORIGINAL_REQUEST R4 |
| 15 | Automated Verification Suite | Unit & Integration tests for API payload builder, store state transitions, and parser logic | M5 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Scaffolding, Config & Reactive Store | `config.js`, `store.js`, `index.html` structure, Tailwind CDN | none | DONE |
| M2 | Webhook API Client & WhatsApp Chat UI | `api.js`, `chat-ui.js`, contact switching, message send/receive | M1 | DONE |
| M3 | Real-Time Kitchen & Orders Dashboard | `kitchen-ui.js`, order items display, totals, delivery metadata | M1, M2 | DONE |
| M4 | Tools Inspector, Live Memory & Mode | `debugger-ui.js`, tool badges & I/O, markdown memory, mode badge | M1, M2 | DONE |
| M5 | App Wiring, Tests, Polish & Multi-Agent Gate | `app.js`, `README.md`, automated tests, Reviewers, Challengers, Auditor | M1-M4 | DONE |

## Code Layout
```
playground/
├── index.html
├── config.js
├── README.md
├── css/
│   └── custom.css
├── js/
│   ├── store.js
│   ├── api.js
│   ├── chat-ui.js
│   ├── kitchen-ui.js
│   ├── debugger-ui.js
│   └── app.js
├── test-m1.js
├── test-m2.js
├── test-m3.js
├── test-m4.js
├── test-m5.js
├── test-stress.js
├── test-stress-challenger2.js
└── test-runner.js
```
