-- 29 Oct 2026: "Изчисти всички данни" (factory reset for testing) in Setup.
-- Adds households.reset_at (the other phone sees it change and reloads) and reset_household(),
-- which a household member can call to wipe that household's budget data and restore the defaults.
-- Running this file changes no existing data.

alter table public.households add column if not exists reset_at timestamptz;

create or replace function public.reset_household() returns void
language plpgsql security definer set search_path = public as $$
declare h uuid; pool uuid;
begin
  select household_id into h from household_members where user_id = auth.uid() limit 1;
  if h is null then raise exception 'not a household member'; end if;

  delete from transactions where household_id = h;
  delete from cycle_budgets where household_id = h;
  delete from pay_cycles where household_id = h;
  update households set default_fund_id = null where id = h;
  delete from categories where household_id = h;
  delete from buckets where household_id = h;

  insert into buckets (household_id, name, kind, color, sort_order) values (h, 'Заплати (общ бюджет)', 'pool', 0, -1) returning id into pool;
  insert into buckets (household_id, name, kind, color, sort_order) values
    (h, 'Детски фонд', 'savings', 4, 0),
    (h, 'Фонд за колата', 'savings', 6, 1),
    (h, 'Общи спестявания', 'savings', 5, 2);
  insert into categories (household_id, name, color, is_fixed, sort_order) values
    (h, 'Хранителни продукти', 0, false, 0),
    (h, 'Храна за вкъщи и ресторанти', 1, false, 1),
    (h, 'Дрехи', 2, false, 2),
    (h, 'Сметки и комунални услуги', 3, false, 3),
    (h, 'Детски нужди', 4, false, 4),
    (h, 'Развлечения', 5, false, 5);
  update households set default_fund_id = pool, buffer_cents = 0, reset_at = now() where id = h;
end $$;

revoke all on function public.reset_household() from public, anon;
grant execute on function public.reset_household() to authenticated;
