# UIGen

An AI-powered React component generator with live preview. Users describe UI components in a chat interface; the app streams JSX/TSX code from Claude and renders it instantly in a sandboxed iframe — no files are written to disk.

## Tech Stack

- **Framework:** Next.js 15 (App Router, Turbopack)
- **Language:** TypeScript 5, React 19
- **AI:** Anthropic Claude (`claude-haiku-4-5`) via Vercel AI SDK (`@ai-sdk/anthropic`)
- **Styling:** Tailwind CSS v4, shadcn/ui (style: "new-york"), Radix UI
- **Editor:** Monaco Editor (`@monaco-editor/react`)
- **JSX Preview:** Babel standalone (in-browser transform), browser import maps, `esm.sh` CDN
- **Database:** SQLite via Prisma 6 (client generated to `src/generated/prisma/`)
- **Auth:** JWT sessions (`jose`), bcrypt passwords, HTTP-only cookies
- **Testing:** Vitest 3, jsdom, `@testing-library/react`

## Commands

```bash
# First-time setup
npm run setup          # install deps + prisma generate + prisma migrate dev

# Development
npm run dev            # start dev server on localhost:3000 (Turbopack)
npm run stop           # kill the dev server (Windows)

# Production
npm run build
npm run start

# Database
npx prisma generate    # regenerate client after schema changes
npx prisma migrate dev # apply new migrations
npm run db:reset       # wipe DB and re-run all migrations (destructive)

# Quality
npm run lint
npm run test
```

> All Next.js commands require `NODE_OPTIONS="--require ./node-compat.cjs"` (handled by scripts via `cross-env`) to patch Node 25+ Web Storage SSR incompatibilities.

## Environment Variables

```dotenv
# .env
ANTHROPIC_API_KEY=""   # optional — falls back to MockLanguageModel if absent
JWT_SECRET=""          # REQUIRED in production; defaults to insecure dev value
```

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home — redirects auth'd users to latest project
│   ├── main-content.tsx        # Main split-pane UI (chat | preview/code)
│   ├── globals.css             # Tailwind v4 entry + CSS design tokens
│   └── [projectId]/page.tsx   # Dynamic project route (auth-gated)
│   └── api/chat/route.ts       # POST /api/chat — streams AI, saves project on finish
├── actions/                    # Next.js Server Actions (auth, project CRUD)
├── components/
│   ├── ui/                     # shadcn/ui primitives
│   ├── auth/                   # AuthDialog, SignIn/SignUpForm
│   ├── chat/                   # ChatInterface, MessageList, MessageInput
│   ├── editor/                 # FileTree, CodeEditor (Monaco)
│   └── preview/                # PreviewFrame (sandboxed iframe)
├── hooks/
│   └── use-auth.ts             # signIn/signUp + anonymous work migration
├── lib/
│   ├── file-system.ts          # VirtualFileSystem (in-memory, no disk writes)
│   ├── contexts/               # FileSystemContext, ChatContext
│   ├── prompts/generation.tsx  # AI system prompt
│   ├── tools/                  # AI tools: str_replace_editor, file_manager
│   ├── transform/              # jsx-transformer.ts — Babel + importmap + iframe HTML
│   ├── provider.ts             # getLanguageModel() — real Anthropic or MockLanguageModel
│   ├── auth.ts                 # JWT session management (server-only)
│   ├── prisma.ts               # Prisma singleton
│   └── utils.ts                # cn() helper (clsx + tailwind-merge)
└── generated/prisma/           # Generated Prisma client (do not edit)
```

## Key Architecture Patterns

**Virtual File System** — `VirtualFileSystem` is a pure in-memory `Map<string, FileNode>`. The AI never touches the real filesystem. The VFS serializes to JSON for DB persistence (`Project.data`) and API transmission.

**AI Tool Calling** — The AI has two tools:
- `str_replace_editor`: view / create / str_replace / insert on the VFS (modeled after Anthropic's text editor tool)
- `file_manager`: rename / delete

Tool calls are handled client-side via `onToolCall` in Vercel AI SDK's `useChat`, dispatching to `FileSystemContext` for immediate UI updates.

**System Prompt Rules** — Every generated project must:
- Have a `/App.jsx` root entry point
- Use `@/` aliases for local imports
- Use Tailwind CSS for all styling (no HTML files)

**Dual-mode Provider** — `getLanguageModel()` returns real Claude if `ANTHROPIC_API_KEY` is set, otherwise a `MockLanguageModel` that streams pre-written static code. The app runs fully without an API key.

**Anonymous Work Migration** — Anonymous sessions persist chat + VFS in `sessionStorage` via `anon-work-tracker.ts`. On sign-in, `useAuth` migrates this work into a new saved project.

**Context Layering** — `FileSystemProvider` wraps `ChatProvider` wraps the UI. `ChatProvider` reads from `useFileSystem()` to pass VFS state to the API and handle incoming tool calls.

**In-Browser Preview Pipeline** — `jsx-transformer.ts`:
1. Compiles all VFS files with Babel standalone
2. Stores each result as a Blob URL
3. Builds a browser `<script type="importmap">`
4. Injects into a sandboxed `<iframe>` via `srcdoc`
5. React 19 + third-party packages resolve from `esm.sh`; Tailwind loads from CDN

**Server Actions** — All DB mutations and session reads use `"use server"` actions in `src/actions/`. Only `/api/chat` is a traditional API route.

## Path Alias

`@/*` → `src/*` (tsconfig + `vite-tsconfig-paths` for tests)

## Testing

Tests live in `__tests__/` subdirectories alongside the code they test. Run with `npm run test`.
