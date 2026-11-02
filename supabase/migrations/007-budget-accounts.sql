-- 2 Nov 2026: accounts can be part of the everyday budget (e.g. "Ваучери за храна").
-- Their money and spending count toward the remaining budget and the daily limit, together with
-- "Заплати (общ бюджет)". Income can now go straight into an account (vouchers from work).
alter table public.buckets add column if not exists in_budget boolean not null default false;

-- allow income with an account (was: income always into the salaries fund)
do $$ declare c text; begin
  for c in select conname from pg_constraint
           where conrelid = 'public.transactions'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%income%bucket_id IS NULL%' loop
    execute format('alter table public.transactions drop constraint %I', c);
  end loop;
end $$;

-- the family's food vouchers: part of the budget, and the 86,78 € recorded on 2 Nov as a transfer
-- from the salaries is really new money from work, so it becomes income into the vouchers account
update public.buckets set in_budget = true where name = 'Ваучери за храна' and kind = 'savings';
update public.transactions t set kind = 'income'
  from public.buckets b
  where t.bucket_id = b.id and b.name = 'Ваучери за храна' and t.kind = 'bucket_deposit'
    and t.occurred_on = '2026-11-02' and t.amount_cents = 8678 and t.deleted_at is null;
