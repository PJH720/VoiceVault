# Phase B: Architecture Improvements — Plan

## Overview
Structural improvements for scalability and security. 5 issues, ~5 days.

## Execution Order
```
B2 (#178) Service registry (depends on A4 #175)
B1 (#177) Vector search perf (independent)
B3 (#179) Client-side routing (independent)
B4 (#180) FTS5 sanitization (independent)
B5 (#181) CSP headers (independent)
```

## Issue #177: VectorService Full Table Scan
**Branch:** `fix/177-vector-search-perf`

### Strategy
1. **Short-term (this PR):** Add early-exit for small collections (<1000), add LIMIT to SQL
2. **Medium-term:** Implement simple IVF (inverted file) index:
   - Cluster embeddings into K centroids on insert
   - At query time, find nearest centroids, search only those partitions
   - Store centroid assignments in `vector_documents.cluster_id` column
3. **Long-term consideration:** sqlite-vss extension (C-level ANN) — document as future option
4. Add benchmark test: generate 10k random embeddings, assert search <500ms

### MCP/Tools
- **context7** MCP: Research sqlite-vss API and electron compatibility

### Key Files
- `src/main/services/VectorService.ts`
- `src/main/migrations/` (new migration for cluster_id if IVF)
- `tests/unit/VectorService.test.ts`

---

## Issue #178: Singleton Service Registry
**Branch:** `refactor/178-service-registry`

### Strategy
1. Create `src/main/services/ServiceRegistry.ts`:
   ```typescript
   class ServiceRegistry {
     private services = new Map<string, Destroyable>()
     register(name, service) / get(name) / destroyAll()
   }
   ```
2. Register all services in `index.ts` after creation
3. `TranslationService` gets `LLMService` from registry instead of creating its own
4. `before-quit` calls `registry.destroyAll()` (replaces A4's manual shutdown)
5. Add model mutex: only one GGUF model loaded at a time across LLM + Embedding

### Key Files
- `src/main/services/ServiceRegistry.ts` (new)
- `src/main/index.ts`
- `src/main/services/TranslationService.ts`
- `src/main/ipc/translation.ts`

---

## Issue #179: Client-Side Routing
**Branch:** `feat/179-client-routing`

### Strategy
1. Install `react-router-dom` (standard for Electron React apps)
2. Use `HashRouter` (works with `file://` protocol in production)
3. Routes: `/library`, `/record`, `/search`, `/settings`
4. Sidebar navigation → `<NavLink>` components
5. Wrap pages in `<Outlet>` — no more conditional rendering
6. Use `<Route>` `element` prop — pages stay mounted via router cache or move to `keepAlive` pattern

### MCP/Tools
- **context7** MCP: react-router-dom v7 API reference

### Key Files
- `src/renderer/src/App.tsx` (major rewrite)
- `src/renderer/src/main.tsx` (wrap in HashRouter)
- `package.json` (add react-router-dom)

---

## Issue #180: FTS5 Query Sanitization
**Branch:** `fix/180-fts5-sanitize`

### Strategy
1. Create helper function `sanitizeFTS5Query(input: string): string`
   - Escape double quotes by doubling them
   - Wrap entire query in double quotes for literal match
   - Strip NULL bytes
2. Apply in `DatabaseService.listRecordings()` for the MATCH param
3. Add test cases: `*`, `"`, `AND`, `OR NOT`, `NEAR()`, parentheses, emoji, CJK

### Key Files
- `src/main/services/DatabaseService.ts`
- `tests/unit/DatabaseService.test.ts`

---

## Issue #181: Content Security Policy
**Branch:** `security/181-csp`

### Strategy
1. Add CSP via `session.webRequest.onHeadersReceived` in main process:
   ```
   default-src 'self';
   script-src 'self';
   style-src 'self' 'unsafe-inline';  // needed for Tailwind
   img-src 'self' data:;
   connect-src 'self' https://api.anthropic.com;
   ```
2. Remove any `eval()` usage (check Tailwind/i18next compatibility)
3. Test: app loads, styles work, cloud LLM calls work

### Key Files
- `src/main/index.ts`
- `src/renderer/index.html`
