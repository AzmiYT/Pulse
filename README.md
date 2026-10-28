# Pulse — community chat starter

A real starter project for a Discord-style community chat. It includes email/password accounts, profiles, communities, invite codes, a default `#general` channel, persisted messages, and realtime message delivery.

## Stack

- React + TypeScript + Vite
- Supabase Auth, Postgres, Row Level Security, and Realtime
- Tauri is the planned Windows desktop wrapper; Expo/React Native is the planned mobile client.

## 1. Install prerequisites

Install:
- Node.js LTS: https://nodejs.org/
- Git (optional): https://git-scm.com/
- VS Code: https://code.visualstudio.com/

Open a terminal in this folder. In VS Code, use **Terminal → New Terminal**.

```bash
npm install
```

## 2. Create the free backend

1. Create a project at https://supabase.com/ (the free tier is enough for development; limits can change).
2. Open **SQL Editor → New query**.
3. Open `supabase/schema.sql` from this project, copy all of it into the SQL editor, and run it.
4. In your Supabase project, open **Project Settings → API** (the exact menu labels may vary).
5. Copy the **Project URL** and the **publishable key** (or legacy `anon` key). Do **not** use the `service_role` / secret key in frontend code.

## 3. Add local environment variables

Copy `.env.example` to `.env.local` in the project root.

PowerShell:
```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Fill in your real values:
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

No quotes are needed. Never commit `.env.local` to Git.

## 4. Run it locally

```bash
npm run dev
```

Open the local URL Vite prints, usually http://localhost:5173.

Create an account, verify your email if Supabase asks you to, sign in, create a community, then copy its invite code and join it from another account/browser to test realtime chat.

To test with two users, use a normal browser window and an incognito/private window. Create a second account in the private window.

## 5. Common issues

- **“Invalid API key”**: ensure you used the publishable/anon key, not a secret key; check for spaces in `.env.local`.
- **Signup says check email**: verify the email, then sign in. For local testing, you can adjust email confirmation in Supabase Auth settings, but enable verification for a public launch.
- **No communities or channels**: confirm `supabase/schema.sql` ran successfully, then refresh.
- **Messages don't appear live**: check that `public.messages` is enabled in Database → Publications/Realtime. The SQL attempts to add it automatically.
- **App still shows setup screen**: make sure the file is named `.env.local` (not `.env.local.txt`), restart `npm run dev`, and reload.
- **Database permission error**: rerun the SQL in the SQL editor and inspect the error. Don't fix this by disabling RLS.

## Current MVP scope

Included:
- Sign up / sign in / sign out
- Profile creation from signup metadata
- Create community and `#general`
- Join community by invite code
- Read and send persisted messages
- Realtime incoming messages
- Row Level Security policies

Not included yet:
- Direct messages, voice/video, uploads, moderation dashboards, password reset UI, message editing UI, notifications, mobile UI, production deployment, rate limiting, and account deletion.

## Next milestones

1. Add password reset and email verification UX.
2. Add channel creation, role management, and community settings.
3. Add direct messages and friend requests.
4. Add image/file uploads with strict storage policies.
5. Package web client with Tauri after the web MVP is stable.
6. Build a dedicated mobile client with Expo/React Native.

## Security notes before public launch

This is a development starter, not a production-audited service. Review policies and abuse controls before inviting the public. Add rate limiting, reporting/blocking, invite rotation, file scanning/size limits, account deletion/export, monitoring, and backups. Supabase free-tier limits and policies may change.
