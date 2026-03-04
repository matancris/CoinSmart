# CoinSmart - Kids Wallet App

Digital wallet app for kids, managed by parents. Multi-family, Hebrew RTL default, ILS currency.

## Stack

React + Vite + TypeScript, Firebase (Auth + Firestore), Zustand, react-i18next, SCSS Modules, Heebo font

## Architecture

### Data Flow - STRICT

```
Component → Zustand Store → Service → Firebase SDK
```

- **Components** interact with Zustand stores via hooks
- **Stores** handle state management and call services
- **Services** contain business logic and Firebase calls
- **ONLY service files** (`src/services/`) can import Firebase SDK methods
- **NEVER** make Firebase calls from components or stores

### Zustand Store Pattern

```typescript
// Use typed selectors (avoid re-renders on unrelated state changes)
const balance = useWalletStore(state => state.balance)
const { fetchWallet } = useWalletStore(state => state.actions)

// Store structure: state + actions object
interface ExampleState {
  data: string[]
  isLoading: boolean
  actions: {
    fetchData: () => Promise<void>
  }
}
```

### Component Rules

- **Named exports only** — no default exports anywhere
- No "God" components — single responsibility per component
- Use existing UI components from `src/components/ui/` (Button, Card, Input, Modal, Badge, Avatar, Spinner, EmptyState, Select, Toast)
- Explicit TypeScript interfaces for all props
- `useCallback` for handlers passed to children, `useMemo` for expensive computations

### Services

- One service file per feature, export functions not classes
- Export via barrel `src/services/index.ts`
- Handle Firestore timestamp conversion with `toDate()` from `src/utils/date.ts`

## Code Style

- Single quotes, no semicolons, 2-space indentation
- Destructuring for props and imports
- Optional chaining (`?.`) and nullish coalescing (`??`)
- Strict TypeScript — no `any`, use `unknown` + type guards
- Comments only explain "why", not "what"
- Types in `src/types/`, interfaces for objects, types for unions

## SCSS Rules - MANDATORY

### Every `.module.scss` file starts with:
```scss
@use '@/styles' as *;
```

### Units
- **ONLY rem and em** for all measurements
- **NO px** except: border-radius, border-width (1px), SVG/icon dimensions
- Use `space(4)` not raw `1rem`, `rem(14)` to convert from px

### RTL - Use Logical Properties
```scss
// CORRECT
padding-inline-start: space(4);
margin-inline-end: space(2);
border-inline-start: 3px solid $clr-primary;

// WRONG
padding-left: space(4);
margin-right: space(2);
border-left: 3px solid $clr-primary;
```

### Nesting
Always use fully nested SCSS. Never write flat selectors.

### Property Order
1. Layout (display, flex, grid)
2. Positioning (position, top, inset)
3. Box model (width, height, padding, margin)
4. Typography (font-size, font-weight, color)
5. Visual (background, border, border-radius, box-shadow)
6. Misc (transition, animation, cursor)

## Project Structure

```
src/
├── config/firebase.ts           # Firebase init (auth, db exports)
├── types/                       # TypeScript interfaces (Family, AppUser, Transaction, SavingsGoal)
├── stores/                      # Zustand stores (auth, family, wallet, ui)
├── services/                    # Firebase CRUD (auth, family, user, transaction, savings)
├── hooks/                       # Custom hooks
├── guards/                      # AuthGuard, RoleGuard
├── layouts/                     # KidLayout (bottom nav), ParentLayout (sidebar)
├── features/
│   ├── auth/                    # Login, Register, ChildLogin
│   ├── kid/                     # Dashboard, Transactions, Savings, Transfer
│   └── parent/                  # Dashboard, Children, ChildDetail
├── components/ui/               # Shared UI components
├── utils/                       # currency, date, validation, error
├── i18n/                        # he.json, en.json
└── styles/                      # Design system (_variables, _functions, _mixins, _animations, _index, global, rtl)
```

## Auth Flow

- **Parents**: email/password via Firebase Auth
- **Children**: family code (6-char) → select child → 4-digit PIN → Firebase Anonymous Auth
- Auth state managed in `useAuthStore`, includes `appUser`, `family`, `isInitialized`

## i18n

- Hebrew default (`he`), English available (`en`)
- All UI strings in `src/i18n/he.json` and `en.json`
- Flat keys namespaced by feature: `auth.login`, `kid.balance`, `parent.dashboard`
- Currency: `formatCurrency()` from `src/utils/currency.ts` uses `Intl.NumberFormat('he-IL', { currency: 'ILS' })`

## Error Handling

- `AppError` class in `src/utils/error.ts`
- `normalizeError()` converts any error to `AppError`
- `handleError()` logs + returns `AppError`
- `getFirebaseErrorMessage()` maps Firebase error codes to i18n keys
- Toast notifications via `toast()` from `src/components/ui/Toast`

## Commands

- `npm run dev` — start dev server
- `npx tsc --noEmit` — type check
- `npm run build` — production build (outputs to `dist/`)

## Environment

Requires `.env.local` with Firebase config:
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```
