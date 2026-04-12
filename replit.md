# myBeez — Multi-Tenant Restaurant Management Platform

  ## Overview

  myBeez is a standalone multi-tenant SaaS platform for restaurant management. Each restaurant (tenant) gets a unique 8-digit client code assigned at account creation and its own dedicated URL via slug (e.g., mybeez.com/valentine).

  Stack: TypeScript, Express, React, PostgreSQL, Drizzle ORM, TailwindCSS, Shadcn/UI, TanStack Query.

  Repo: ulyssemdbh-commits/mybeez — Branch: copilot/copy-mybeez-app-files

  ## Architecture

  ```
  mybeez/
  ├── client/                      # React frontend (Vite)
  │   └── src/
  │       ├── App.tsx              # Dynamic routing: /:slug, /:slug/admin, etc.
  │       ├── pages/
  │       │   ├── TenantChecklist.tsx   # Main checklist page with PIN auth
  │       │   ├── TenantAdmin.tsx       # Admin dashboard (stub)
  │       │   ├── TenantHistory.tsx     # History view (stub)
  │       │   └── TenantManagement.tsx  # Management view (stub)
  │       ├── components/
  │       │   ├── alfred/AlfredChat.tsx # AI assistant floating widget
  │       │   ├── ui/                  # Shadcn components
  │       │   └── theme-provider.tsx
  │       ├── hooks/
  │       │   ├── use-auth.ts          # Session auth hook (PIN-based)
  │       │   └── useRealtimeSync.ts   # SSE realtime sync hook
  │       └── lib/
  │           ├── queryClient.ts       # TanStack Query config
  │           └── utils.ts
  ├── server/                      # Express backend
  │   ├── index.ts                 # Entry point — registers all routes, middleware
  │   ├── db.ts                    # Drizzle + PostgreSQL connection
  │   ├── tenantDb.ts              # Multi-tenant DB resolver
  │   ├── middleware/
  │   │   ├── auth.ts              # requireAuth, requireAdmin
  │   │   └── tenant.ts            # resolveTenant from :slug param
  │   ├── routes/
  │   │   ├── auth.ts              # POST /api/auth/pin-login, logout, me
  │   │   ├── tenants.ts           # CRUD /api/tenants (create, list, update)
  │   │   ├── checklist.ts         # /api/checklist/:slug/* (categories, toggle, reset, items, comments, history)
  │   │   └── alfred.ts            # POST /api/alfred/chat, analyze, clear
  │   └── services/
  │       ├── tenantService.ts     # Tenant CRUD, 8-digit code generation, PIN login
  │       ├── auth.ts              # Auth delegation to tenantService
  │       ├── alfred/alfredService.ts  # AI chat with OpenAI>Gemini>Grok fallback
  │       ├── core/openaiClient.ts     # Multi-provider AI client factory
  │       ├── realtimeSync.ts      # SSE broadcast per tenant
  │       ├── discordBotService.ts # Discord bot for shopping lists
  │       ├── googleCalendarService.ts # Calendar integration
  │       ├── translationService.ts    # FR/VI/TH AI translation
  │       └── emailActionService.ts    # Email notifications
  ├── shared/                      # Shared types and schemas
  │   ├── schema.ts                # Re-exports tenants + checklist schemas
  │   └── schema/
  │       ├── tenants.ts           # tenants table (id, clientCode, slug, name, pinCode, adminCode, features, theme)
  │       └── checklist.ts         # All business tables scoped by tenant_id
  ├── Dockerfile                   # Docker build for production
  ├── drizzle.config.ts
  ├── package.json
  ├── tailwind.config.ts
  ├── tsconfig.json
  └── vite.config.ts
  ```

  ## Multi-Tenant Model

  ### Tenant Table
  Every restaurant is a row in the `tenants` table:
  - `clientCode` — Unique 8-digit code, auto-generated at creation
  - `slug` — URL-friendly name (e.g., valentine, maillane)
  - `pinCode` / `adminCode` — Staff and admin PIN codes
  - `features` — JSON feature flags (checklist, zones, comments, translate, discord, calendar, alfred)
  - `theme` — JSON theming config

  ### Data Isolation
  All business tables (categories, items, checks, comments, suppliers, purchases, employees, etc.) have a tenant_id column. Every query filters by tenant_id to ensure strict data isolation between restaurants.

  ### URL Pattern
  ```
  mybeez.com/                     > Home (login by client code)
  mybeez.com/:slug                > Checklist page (PIN auth)
  mybeez.com/:slug/admin          > Admin dashboard
  mybeez.com/:slug/history        > Check history
  mybeez.com/:slug/management     > Restaurant management
  ```

  ## API Routes

  ### Auth
  ```
  POST /api/auth/pin-login    { pin, slug? }  > { success, clientCode, slug, role }
  POST /api/auth/logout
  GET  /api/auth/me           > { authenticated, tenantId, slug, clientCode, role }
  ```

  ### Tenants (Admin)
  ```
  POST  /api/tenants           { name, pinCode, adminCode, ... }  > { id, clientCode, slug }
  GET   /api/tenants           > [{ id, clientCode, slug, name, ... }]
  GET   /api/tenants/by-code/:code
  PATCH /api/tenants/:id       { partial update }
  ```

  ### Checklist (Tenant-scoped)
  ```
  GET   /api/checklist/:slug/categories   > categories with items and today's checks
  GET   /api/checklist/:slug/dashboard    > { total, checked, unchecked, date }
  POST  /api/checklist/:slug/toggle       { itemId, isChecked }
  POST  /api/checklist/:slug/reset        (admin only)
  POST  /api/checklist/:slug/items        { name, categoryId }
  PATCH /api/checklist/:slug/items/:id    { name?, categoryId? }
  DELETE /api/checklist/:slug/items/:id
  POST  /api/checklist/:slug/categories   { name, sheet? }
  GET   /api/checklist/:slug/comments
  POST  /api/checklist/:slug/comments     { author, message }
  GET   /api/checklist/:slug/history      ?month=YYYY-MM
  ```

  ### Alfred (AI Assistant)
  ```
  POST /api/alfred/chat       { message, tenantId }
  POST /api/alfred/analyze    { context }
  POST /api/alfred/clear      { tenantId }
  ```

  ### System
  ```
  GET  /api/health             > { status, version, uptime, sse, ai }
  GET  /api/sse/:slug          > SSE stream (realtime updates)
  ```

  ## Environment Variables

  ### Required
  ```
  DATABASE_URL          # PostgreSQL connection string
  SESSION_SECRET        # Session encryption key (required in production)
  ```

  ### AI Providers (at least one required for Alfred)
  ```
  OPENAI_API_KEY        # Primary AI provider
  GEMINI_API_KEY        # Fallback 1
  XAI_API_KEY           # Fallback 2 (Grok)
  ```

  ### Optional Integrations
  ```
  DISCORD_BOT_TOKEN     # Discord shopping list bot
  DISCORD_CHANNEL_ID    # Target Discord channel
  GOOGLE_CALENDAR_ID    # Google Calendar integration
  ```

  ## Development

  ### Run locally
  ```bash
  npm install
  npm run dev
  ```

  ### Database
  ```bash
  npm run db:push        # Sync schema to DB
  npm run db:push --force # Force sync (destructive)
  ```

  ### Docker (Production)
  ```bash
  docker build -t mybeez .
  docker run -p 3000:3000 -e DATABASE_URL=... -e SESSION_SECRET=... mybeez
  ```

  ## Key Design Decisions

  1. No hardcoded restaurants — Every restaurant is dynamic, created via API, with auto-generated 8-digit codes
  2. PIN-based auth — Simple, no email/password, each tenant has staff PIN + admin PIN
  3. Tenant middleware — resolveTenant middleware resolves slug to tenant on every /:slug route
  4. AI fallback chain — Alfred tries OpenAI first, then Gemini, then Grok
  5. SSE per tenant — Realtime sync scoped per restaurant, no cross-tenant leaks
  6. Feature flags — Each tenant can enable/disable features via JSON config

  ## Creating a New Tenant

  ```bash
  curl -X POST https://mybeez.com/api/tenants \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Chez Marie",
      "pinCode": "1234",
      "adminCode": "5678"
    }'
  # Response: { "id": 3, "clientCode": "47291836", "slug": "chez-marie", "url": "/chez-marie" }
  ```

  The tenant is now accessible at mybeez.com/chez-marie with PIN 1234 for staff and 5678 for admin.
  