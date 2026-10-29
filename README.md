# Семеен бюджет

A shared family budget app for Android: custom pay cycles, a live daily allowance, savings funds, and history. Two phones stay in sync through Supabase. The interface is in Bulgarian and amounts are in euro.

## One-time setup

1. **Database (Supabase).** In your Supabase project, open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and press **Run**. Under **Authentication → Sign In / Providers → Email**, turn off **Confirm email**.
2. **App keys.** In `src/config.ts`, set `SUPABASE_URL` and `SUPABASE_KEY` (the publishable/anon key, from **Project Settings → API**).
3. **Expo token.** In this repository, go to **Settings → Secrets and variables → Actions** and add the secret `EXPO_TOKEN` (from expo.dev → Account settings → Access tokens).
4. **Install libraries and link Expo.** Go to **Actions → "1 · Първоначална настройка" → Run workflow**. This installs the libraries that match the current Expo release, checks the code, links the project to your Expo account, and saves the result.
5. **Build the Android app.** Go to **Actions → "2 · Създай APK за Android" → Run workflow**. It takes about 15–20 minutes. When it finishes, open the run's summary on your phone, tap the download link, and install the app. Android will ask you to allow installs from your browser.
6. **First use.** One of you creates a profile and taps **Създай бюджет**. The other creates a profile, taps **Присъединяване с код**, and enters the code shown under **Настройки → Покана за партньора**.

## How updates reach the phones

Every push to `main` runs **"3 · Проверка и обновяване"**. It type-checks the code, runs the budget tests, bundles the app, and then publishes an over-the-air update. Both phones download it the next time the app opens (or right away via **Настройки → Провери за обновления**). Your data lives in Supabase, so updates never touch it.

Changes that add new native permissions or libraries need a new APK: raise `version` in `app.json`, then run workflow 2 again and install the new APK over the old one. Your data is kept.

## Project layout

| Path | What it is |
| --- | --- |
| `src/engine/budgetEngine.ts` | Pay cycles, daily allowance, burn forecast, fund math. It has no dependencies, and its tests are in `budgetEngine.test.ts`. |
| `src/data/store.tsx` | Loading, phone cache, offline write queue, realtime sync, and all write actions. |
| `src/data/derive.ts` | Helpers that turn data into what the screens show. |
| `src/screens/*` | Today, Funds, History, Setup, the + sheet, login, and household setup. |
| `supabase/schema.sql` | Tables, access rules, household create/join functions, and realtime. |
