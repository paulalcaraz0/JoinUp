# JoinUp

JoinUp is a mobile-first community events app built with Expo Router, React Native, Supabase, and TypeScript. It helps people discover nearby activities, create hosted events, chat with participants, and manage their profile from one place.

## What Makes It Useful

- Discover activities near you with search, category filters, and a Philippines place dropdown.
- Create events with multi-image support and rich event details.
- Join approved and pending activities with clear chat access rules.
- Chat in real time, including local persistence for mock chat threads during development.
- Manage hosted events, approvals, deletes, and profile history from the app.
- Upload a profile photo and keep account details in sync.

## Tech Stack

- Expo + React Native + Expo Router
- TypeScript
- Supabase Auth, Database, Storage, and Realtime
- Zustand for app state
- AsyncStorage for local persistence
- NativeWind-inspired styling with custom theme tokens

## Key Screens

- Home: featured and nearby activities
- Explore: nearby activities with place filtering and search
- Create: event creation with media and event details
- Chat: activity group chat and host controls
- Profile: joined, hosted, and past activity history
- Activity Detail: event overview, participants, and join/chat actions
- Manage Activity: host tools for approved participants and event media

## Features In Depth

### Nearby discovery

Explore lets users browse events by category and choose a Philippine location from a dropdown. The selected place filters the activity feed immediately.

### Event creation

Hosts can create activities with a title, description, category, location, schedule, approval rules, and multiple images.

### Chat and persistence

Chats support live Supabase-backed conversations for real events and locally persisted mock messages during development so reloads keep your test messages visible.

### Profile history

The profile screen separates joined, hosted, and past activity history so users can quickly return to the right event.

### Media support

Events can include cover images or galleries, and users can upload a profile photo from the profile screen.

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI support through `npx expo`
- A Supabase project with the expected schema and storage bucket configuration

### Install

```bash
npm install
```

### Configure environment

Create a `.env` file in the project root and set the Supabase values used by the app:

```bash
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_KEY=your_supabase_anon_key
```

### Run locally

```bash
npm start
```

Or run a platform directly:

```bash
npm run android
npm run ios
npm run web
```

### Expo Go

When starting with a tunnel, scan the QR code from the Expo terminal or open the generated `exp://` link in Expo Go.

### Google OAuth setup (Supabase)

If Google sign-in redirects to `localhost:3000`, Supabase is falling back to its default site URL because the app callback URL is not allow-listed.

In Supabase Dashboard, configure these values:

1. Authentication > URL Configuration > Site URL

- For Expo Go / mobile QA: `joinup://auth/callback`
- For local web QA only: `http://localhost:8081` (use this only when primarily testing web OAuth)

1. Authentication > URL Configuration > Redirect URLs

- `joinup://auth/callback`
- `exp://*/--/auth/callback`
- `http://localhost:8081`

Notes:

- `joinup://auth/callback` is used by development builds and production app installs.
- `exp://*/--/auth/callback` is used by Expo Go.
- If you use `expo start --tunnel`, keep the wildcard `exp://*/--/auth/callback` so callback hosts can change between sessions.
- If a redirect URL does not match exactly, Supabase falls back to Site URL. Setting Site URL to localhost will fail on a physical phone.

## Development Notes

- Activities are backed by Supabase and merged with seeded mock activities for development.
- Mock chat threads are useful for local QA and now persist between reloads on the same device/browser.
- Hosted event deletion updates chat, profile history, and activity state together.
- The app is tuned for mobile first, but the web build is also used heavily for QA.

## Project Structure

```text
app/
  (auth)/          Auth screens
  (tabs)/          Main app tabs
  activity/        Activity detail and management
  chat/            Dedicated chat screen
components/
  layout/          Shared layout components
  ui/              Reusable UI primitives
hooks/             Data and auth hooks
lib/               Supabase client and mock data
store/             Zustand stores
supabase/          Database migrations and tooling
types/             Shared TypeScript types
```

## Validation

The project is regularly checked with:

- TypeScript compilation via `npx tsc --noEmit`
- Live browser QA in Expo web / Expo Go flows

## Notes

This repository is actively evolving, so a few screens intentionally use seeded mock data alongside the live Supabase data while features are being hardened.
