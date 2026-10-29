# Notes for future changes

- Users: a married couple in Bulgaria, both on Android. All UI text is Bulgarian; money is EUR as integer cents; dates are `YYYY-MM-DD` in Europe/Sofia.
- All money math lives in `src/engine/budgetEngine.ts`. Add or change logic there, add a test in `budgetEngine.test.ts` (`npm test`), and keep the screens thin.
- Data flow: `src/data/store.tsx` holds Supabase rows. Writes are applied locally first, queued in an outbox (AsyncStorage), and upserted. Realtime merges the partner's changes. `derive.ts` maps rows to screen shapes.
- Funds: one `buckets` row with `kind='pool'` (salaries; income and everyday spending). The others are `kind='savings'`. `households.default_fund_id` picks the fund the Today tab shows.
- Schema changes: never drop or rewrite user data. Add new SQL as a separate migration file in `supabase/` with `alter table ... add column ... default ...`, and tell the user to run it in the SQL Editor before the app update ships.
- Delivery: a push to `main` runs workflow 3 (type-check, tests, Android bundle, then an EAS over-the-air update to channel `production`). Only JS/asset changes go over the air. New native libraries or permissions need a `version` bump in `app.json` and a new APK (workflow 2).
