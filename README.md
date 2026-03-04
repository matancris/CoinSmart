# CoinSmart - ארנק דיגיטלי לילדים

A smart digital wallet app for kids, managed by parents. Built to teach children financial literacy through hands-on experience with earning, saving, and spending — all under parental supervision.

## Features

### For Kids
- **Dashboard** — View current balance and recent transactions at a glance
- **Transactions** — Full history of deposits, withdrawals, and purchases
- **Savings Goals** — Create savings goals with optional target amounts; supports flexible and locked savings plans (2-month, 6-month) with interest accrual
- **Transfers** — Move money between wallet balance and savings goals

### For Parents
- **Family Dashboard** — Overview of all children's balances and activity
- **Child Management** — Add children, manage their accounts, and view detailed activity
- **Transaction Control** — Deposit, withdraw, and edit transactions for any child
- **Family Code** — Unique 6-character code for easy child onboarding

### General
- **PWA** — Installable on mobile devices with offline support
- **RTL-first** — Hebrew default UI with English language support
- **ILS Currency** — Formatted with `Intl.NumberFormat` for Israeli Shekel

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite 7 |
| Auth | Firebase Authentication (email/password + anonymous) |
| Database | Cloud Firestore |
| State | Zustand |
| Routing | React Router v7 |
| Styling | SCSS Modules + logical properties for RTL |
| i18n | react-i18next (Hebrew, English) |
| PWA | vite-plugin-pwa + Workbox |
| Font | Heebo (Google Fonts) |
| Hosting | Firebase Hosting |

## Architecture

```
Component → Zustand Store → Service → Firebase SDK
```

- **Components** render UI and interact with Zustand stores via hooks
- **Stores** manage state and delegate business logic to services
- **Services** (`src/services/`) are the only layer that imports Firebase SDK

### Project Structure

```
src/
├── config/firebase.ts        # Firebase initialization
├── types/                    # TypeScript interfaces
│   ├── user.ts               #   AppUser, UserRole
│   ├── family.ts             #   Family
│   ├── transaction.ts        #   Transaction, TransactionType
│   └── savings.ts            #   SavingsGoal, SavingsType, SavingsStatus
├── stores/                   # Zustand state management
│   ├── auth.store.ts         #   Auth state, login/logout
│   ├── family.store.ts       #   Family data, children list
│   ├── wallet.store.ts       #   Balance, transactions
│   └── ui.store.ts           #   Language, theme, modals
├── services/                 # Firebase CRUD operations
│   ├── auth.service.ts       #   Auth flows (parent + child)
│   ├── family.service.ts     #   Family CRUD
│   ├── user.service.ts       #   User CRUD
│   ├── transaction.service.ts#   Transaction CRUD
│   └── savings.service.ts    #   Savings goals CRUD
├── features/
│   ├── auth/                 # Login, Register, ChildLogin pages
│   ├── kid/                  # Kid dashboard, transactions, savings, transfer
│   └── parent/               # Parent dashboard, children list, child detail
├── components/ui/            # Reusable UI components
│   ├── Button, Card, Input, Modal, Select
│   ├── Badge, Avatar, Spinner, EmptyState
│   └── Toast (notification system)
├── guards/                   # AuthGuard, RoleGuard (route protection)
├── layouts/                  # KidLayout (bottom nav), ParentLayout (sidebar)
├── hooks/                    # Custom React hooks
├── utils/                    # currency, date, validation, error handling
├── i18n/                     # he.json, en.json translations
└── styles/                   # Design system
    ├── _variables.scss       #   Colors, spacing, typography tokens
    ├── _functions.scss       #   rem(), space() helpers
    ├── _mixins.scss          #   Responsive, flexbox, grid mixins
    ├── _animations.scss      #   Keyframe animations
    └── global.scss           #   Base styles, resets
```

## Auth Flow

| Role | Method |
|------|--------|
| **Parent** | Email + password via Firebase Auth |
| **Child** | Family code (6-char) → select child → 4-digit PIN → Firebase Anonymous Auth |

Children authenticate without needing an email account. The anonymous auth session is linked to the child's user document via `lastAuthUid`.

## Getting Started

### Prerequisites

- Node.js 18+
- A Firebase project with Firestore and Authentication enabled

### Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/matancris/CoinSmart.git
   cd CoinSmart
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**

   Copy the example env file and fill in your Firebase config:
   ```bash
   cp .env.example .env.local
   ```

   ```env
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   ```

4. **Deploy Firestore rules** (if you own the Firebase project)
   ```bash
   firebase deploy --only firestore:rules
   ```

5. **Start the dev server**
   ```bash
   npm run dev
   ```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npx tsc --noEmit` | Type-check without emitting |

## Deployment

The app is configured for Firebase Hosting. The `firebase.json` routes all paths to `index.html` for SPA support.

```bash
npm run build
firebase deploy --only hosting
```

## Data Model

```
families/{familyId}
  ├── name, code, currency, savingsInterestRate
  └── createdBy (parent uid)

users/{userId}
  ├── familyId, role, displayName, avatarEmoji
  ├── balance, totalSavings, pin (children)
  ├── transactions/{txId}
  │     └── type, amount, balanceAfter, description, createdAt
  └── savings/{savingsId}
        └── name, targetAmount, currentAmount, interestRate, savingsType, status
```

## License

This project is private and not licensed for public use.
