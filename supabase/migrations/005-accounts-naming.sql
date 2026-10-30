-- 30 Oct 2026: "Фондове" are called "Сметки" in the app now. Renames the two default accounts
-- (only where they still have their original names) and updates the defaults for new or reset households.
update public.buckets b set name = 'Детска сметка'
  where name = 'Детски фонд' and not exists (select 1 from public.buckets x where x.household_id = b.household_id and x.name = 'Детска сметка');
update public.buckets b set name = 'Сметка за колата'
  where name = 'Фонд за колата' and not exists (select 1 from public.buckets x where x.household_id = b.household_id and x.name = 'Сметка за колата');

create or replace function public.create_household(p_people text[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid; pool uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into households (people) values (coalesce(p_people, array['Аз','Партньор'])) returning id into h;
  insert into household_members (household_id, user_id) values (h, auth.uid());
  insert into buckets (household_id, name, kind, color, sort_order) values (h, 'Заплати (общ бюджет)', 'pool', 0, -1) returning id into pool;
  insert into buckets (household_id, name, kind, color, sort_order) values
    (h, 'Детска сметка', 'savings', 4, 0),
    (h, 'Сметка за колата', 'savings', 6, 1),
    (h, 'Общи спестявания', 'savings', 5, 2);
  insert into categories (household_id, name, color, is_fixed, sort_order) values
    (h, 'Хранителни продукти', 0, false, 0),
    (h, 'Храна за вкъщи и ресторанти', 1, false, 1),
    (h, 'Дрехи', 2, false, 2),
    (h, 'Сметки и комунални услуги', 3, false, 3),
    (h, 'Детски нужди', 4, false, 4),
    (h, 'Развлечения', 5, false, 5);
  update households set default_fund_id = pool where id = h;
  return h;
end $$;


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
    (h, 'Детска сметка', 'savings', 4, 0),
    (h, 'Сметка за колата', 'savings', 6, 1),
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

