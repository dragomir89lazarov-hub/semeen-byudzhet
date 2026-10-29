-- 29 Oct 2026: "Фиксирана сметка" and "Предпазен резерв" were removed from the app at the family's request.
-- Every category becomes an ordinary one (counts toward the daily limit) and the buffer goes back to 0.
-- Only these two settings change; no expenses or other records are touched.
update public.categories set is_fixed = false where is_fixed;
update public.households set buffer_cents = 0 where buffer_cents <> 0;
