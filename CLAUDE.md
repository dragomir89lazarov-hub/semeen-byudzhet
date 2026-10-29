# Notes for future changes

- Users: a married couple in Bulgaria, both on Android. All UI text is Bulgarian; money is EUR as integer cents; dates are `YYYY-MM-DD` in Europe/Sofia.
- Daily limit (confirmed by the user, 29 Oct 2026): at midnight (phone clock) limit = remaining ÷ days left; during the day "За днес" = limit − spent today and may go negative; next midnight recompute from what's left. NO day-to-day carry-over of overspending. "На ден" = remaining ÷ days left. No fixed bills and no buffer in the UI (migration 001).
- Category groups (migration 003, `categories.group_name`): display only. `statItems/spentByStat` in derive.ts; the "Подробно | Групи" toggle (`nav.grouped`, saved per phone) applies to "Къде отидоха парите" and History.
- All money math lives in `src/engine/budgetEngine.ts`. Add or change logic there, add a test in `budgetEngine.test.ts` (`npm test`), and keep the screens thin.
- Data flow: `src/data/store.tsx` holds Supabase rows. Writes are applied locally first, queued in an outbox (AsyncStorage), and upserted. Realtime merges the partner's changes. `derive.ts` maps rows to screen shapes.
- Funds: one `buckets` row with `kind='pool'` (salaries; income and everyday spending). The others are `kind='savings'`. `households.default_fund_id` picks the fund the Today tab shows.
- Schema changes: never drop or rewrite user data. Add new SQL as a separate migration file `supabase/migrations/NNN-name.sql` (`alter table ... add column ... default ...`), test it on a local Postgres, then run it with workflow "4 · База данни" (`gh workflow run "4 · База данни" -f script=supabase/migrations/NNN-name.sql`) BEFORE pushing app code that needs it. The user doesn't touch Supabase.
- ⚠ The household has been live with real data since 29 Oct 2026. NEVER run `supabase/repair-first-install.sql` or `supabase/schema.sql` again: they drop or recreate tables and would erase everything.
- Checking a run: `gh run list`/`gh run watch` work; full logs are blocked, so workflows report problems as `::error`/`::notice` annotations (read via `gh api .../check-runs/<job>/annotations`).
- Delivery: a push to `main` runs workflow 3 (type-check, tests, Android bundle, then an EAS over-the-air update to channel `production`). Only JS/asset changes go over the air. New native libraries or permissions need a `version` bump in `app.json` and a new APK (workflow 2).
