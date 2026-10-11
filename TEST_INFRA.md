# E2E Test Infra: ChatAliado — Hito 3

## Test Philosophy
- Opaque-box, requirement-driven, offline ($0.00 cost) with Vitest (`@cloudflare/vitest-pool-workers`).
- Complete coverage of conversational lifecycle: greeting -> menu browsing -> product queries -> order draft creation -> item addition with variants -> item removal -> order summary -> markdown memory updates -> order confirmation -> handoff to human -> human mode silencing.

## Feature Inventory & Test Mapping
| # | Feature | Source (Requirement) | Tier 1 (Isolated) | Tier 2 (Boundary & Errors) | Tier 3 (Pairwise & State) | Tier 4 (Real-World E2E) |
|---|---------|---------------------|:-----------------:|:-------------------------:|:-------------------------:|:-----------------------:|
| 1 | Env & Types | ORIGINAL_REQUEST §R1 | ✓ | ✓ | ✓ | ✓ |
| 2 | Conversation Repo | ORIGINAL_REQUEST §R2 | ✓ | ✓ | ✓ | ✓ |
| 3 | Message Repo | ORIGINAL_REQUEST §R2 | ✓ | ✓ | ✓ | ✓ |
| 4 | Restaurant Repo | ORIGINAL_REQUEST §R2 | ✓ | ✓ | ✓ | ✓ |
| 5 | Order Repo Ext | ORIGINAL_REQUEST §R2 | ✓ | ✓ | ✓ | ✓ |
| 6 | LLM Provider | ORIGINAL_REQUEST §R3 | ✓ | ✓ | ✓ | ✓ |
| 7 | Catalog Tools | ORIGINAL_REQUEST §R4 | ✓ | ✓ | ✓ | ✓ |
| 8 | Order Tools | ORIGINAL_REQUEST §R4 | ✓ | ✓ | ✓ | ✓ |
| 9 | Memory Tools | ORIGINAL_REQUEST §R4 | ✓ | ✓ | ✓ | ✓ |
| 10 | Escalation Tool | ORIGINAL_REQUEST §R4 | ✓ | ✓ | ✓ | ✓ |
| 11 | Prompt Builder | ORIGINAL_REQUEST §R5 | ✓ | ✓ | ✓ | ✓ |
| 12 | Agent Orchestrator | ORIGINAL_REQUEST §R6 | ✓ | ✓ | ✓ | ✓ |
| 13 | Webhook Handler | ORIGINAL_REQUEST §R7 | ✓ | ✓ | ✓ | ✓ |

## Test Architecture
- Test Runner: `npm test` in `worker/` (Vitest with `@cloudflare/vitest-pool-workers`).
- Typecheck: `npm run typecheck` (`npx tsc --noEmit` in `worker/`).
- Mocks:
  - `fetchMock` / `vi.fn()` for LLM API completions and tool calls.
  - In-memory mock Supabase client for multi-tenant PostgREST operations.
  - In-memory mock Evolution API provider for WhatsApp message delivery.
- Test Files Layout:
  - `worker/test/database-schemas.test.ts`: Zod schema validation.
  - `worker/test/supabase-repositories.test.ts`: All 4 repositories + multi-tenant isolation.
  - `worker/test/llm-provider.test.ts`: OpenAI compatible provider fetch & error handling.
  - `worker/test/tools.test.ts`: All 10 tools unit tests + Zod validation + math accuracy.
  - `worker/test/prompt-builder.test.ts`: Mexico City timezone calculation + memory formatting.
  - `worker/test/orchestrator.test.ts`: Tool execution loop, max 5 iterations, mode silencing.
  - `worker/test/webhooks.test.ts`: Webhook token auth, deduplication, payload parsing.
  - `worker/test/agent-e2e.test.ts`: Full simulated multi-turn WhatsApp conversation flows.

## Coverage Goals
- 100% of Vitest tests passing offline in < 10 seconds.
- 100% TypeScript compilation in strict mode with 0 errors and zero `any`.
- Strict multi-tenant isolation (`restaurant_id`) verified on all database operations.
- Zero price calculations made by the LLM (all computed deterministically in TypeScript).
