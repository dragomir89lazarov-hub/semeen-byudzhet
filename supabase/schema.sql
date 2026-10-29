-- Семеен бюджет — Supabase database
-- Run once: Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
-- Money is integer cents. Dates are calendar dates in Europe/Sofia.
-- Every balance is computed from the transactions table; nothing is stored twice.

create extension if not exists btree_gist;

-- ─────────────────────────────────────────────────────────────
-- Household and members
-- ─────────────────────────────────────────────────────────────
create table public.households (
  id              uuid primary key default gen_random_uuid(),
  name            text not null default 'Семейство',
  currency        char(3) not null default 'EUR',
  timezone        text not null default 'Europe/Sofia',
  payday_rule     jsonb not null default '{"type":"monthly_day","day":25,"weekend":"previous_business_day"}',
  people          text[] not null default array['Аз','Партньор'],
  buffer_cents    bigint not null default 0 check (buffer_cents >= 0),
  default_fund_id uuid,
  invite_code     text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  version         int not null default 1
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index on public.household_members (user_id);

-- ─────────────────────────────────────────────────────────────
-- Pay cycles (the custom "month")
-- ─────────────────────────────────────────────────────────────
create table public.pay_cycles (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  start_date      date not null,
  end_date        date not null,                 -- inclusive
  carryover_cents bigint not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  version         int not null default 1,
  check (end_date >= start_date),
  exclude using gist (household_id with =, daterange(start_date, end_date, '[]') with &&)
);

-- ─────────────────────────────────────────────────────────────
-- Categories, budget lines, funds
-- ─────────────────────────────────────────────────────────────
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  color        int not null default 0,
  is_fixed     boolean not null default false,   -- fixed bills are held back from the daily allowance
  is_archived  boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      int not null default 1,
  unique (household_id, name)
);

create table public.cycle_budgets (
  household_id  uuid not null references public.households(id) on delete cascade,
  cycle_id      uuid not null references public.pay_cycles(id) on delete cascade,
  category_id   uuid not null references public.categories(id) on delete cascade,
  planned_cents bigint not null default 0 check (planned_cents >= 0),
  updated_at    timestamptz not null default now(),
  version       int not null default 1,
  primary key (cycle_id, category_id)
);

-- kind = 'pool': the salaries fund that everyday spending comes from (one per household)
-- kind = 'savings': Kids' Fund, Car Fund, General Savings, …
create table public.buckets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  kind         text not null default 'savings' check (kind in ('pool', 'savings')),
  color        int not null default 0,
  target_cents bigint check (target_cents is null or target_cents > 0),
  target_date  date,
  is_archived  boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      int not null default 1,
  unique (household_id, name)
);
create unique index one_pool_per_household on public.buckets (household_id) where kind = 'pool';

alter table public.households
  add constraint households_default_fund_fk foreign key (default_fund_id) references public.buckets(id) on delete set null;

-- ─────────────────────────────────────────────────────────────
-- The ledger
--   income              → salaries fund (pool)
--   expense, no bucket  → paid from the salaries fund
--   expense + bucket    → paid from that savings fund
--   bucket_deposit      → pool → savings fund
--   bucket_withdrawal   → savings fund → pool
-- ─────────────────────────────────────────────────────────────
create table public.transactions (
  id           uuid primary key,                  -- generated on the phone, so offline entries never duplicate
  household_id uuid not null references public.households(id) on delete cascade,
  kind         text not null check (kind in ('income', 'expense', 'bucket_deposit', 'bucket_withdrawal')),
  amount_cents bigint not null check (amount_cents > 0),
  occurred_on  date not null,
  category_id  uuid references public.categories(id),
  bucket_id    uuid references public.buckets(id),
  paid_by      text,
  note         text not null default '',
  logged_by    uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      int not null default 1,
  deleted_at   timestamptz,                       -- soft delete, so deletions sync like any other change
  check (kind <> 'expense' or category_id is not null),
  check (kind not in ('bucket_deposit', 'bucket_withdrawal') or bucket_id is not null),
  check (kind <> 'income' or bucket_id is null)
);
create index on public.transactions (household_id, occurred_on desc);
create index on public.transactions (household_id, updated_at);

-- ─────────────────────────────────────────────────────────────
-- Every update bumps version + updated_at (the app uses version to spot edit conflicts)
-- ─────────────────────────────────────────────────────────────
create or replace function public.touch_row() returns trigger language plpgsql as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['households','pay_cycles','categories','cycle_budgets','buckets','transactions'] loop
    execute format('create trigger %1$s_touch before update on public.%1$I for each row execute function public.touch_row()', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Row-level security: you see and edit only your own household
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members where household_id = h and user_id = auth.uid());
$$;

alter table public.households enable row level security;
create policy households_read on public.households for select using (public.is_member(id));
create policy households_write on public.households for update using (public.is_member(id)) with check (public.is_member(id));

alter table public.household_members enable row level security;
create policy members_read on public.household_members for select using (public.is_member(household_id));

do $$ declare t text; begin
  foreach t in array array['pay_cycles','categories','cycle_budgets','buckets','transactions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %1$s_all on public.%1$I for all using (public.is_member(household_id)) with check (public.is_member(household_id))', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Create a household (with default categories and funds) / join one with a code
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_household(p_people text[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid; pool uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into households (people) values (coalesce(p_people, array['Аз','Партньор'])) returning id into h;
  insert into household_members (household_id, user_id) values (h, auth.uid());
  insert into buckets (household_id, name, kind, color, sort_order) values (h, 'Заплати (общ бюджет)', 'pool', 0, -1) returning id into pool;
  insert into buckets (household_id, name, kind, color, sort_order) values
    (h, 'Детски фонд', 'savings', 4, 0),
    (h, 'Фонд за колата', 'savings', 6, 1),
    (h, 'Общи спестявания', 'savings', 5, 2);
  insert into categories (household_id, name, color, is_fixed, sort_order) values
    (h, 'Хранителни продукти', 0, false, 0),
    (h, 'Храна за вкъщи и ресторанти', 1, false, 1),
    (h, 'Дрехи', 2, false, 2),
    (h, 'Сметки и комунални услуги', 3, true, 3),
    (h, 'Детски нужди', 4, false, 4),
    (h, 'Развлечения', 5, false, 5);
  update households set default_fund_id = pool where id = h;
  return h;
end $$;

create or replace function public.join_household(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into h from households where invite_code = upper(trim(p_code));
  if h is null then raise exception 'invalid_code'; end if;
  insert into household_members (household_id, user_id) values (h, auth.uid()) on conflict do nothing;
  return h;
end $$;

revoke all on function public.create_household(text[]) from public, anon;
revoke all on function public.join_household(text) from public, anon;
grant execute on function public.create_household(text[]) to authenticated;
grant execute on function public.join_household(text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Realtime: changes reach the other phone within a second
-- ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table
  public.households, public.pay_cycles, public.categories, public.cycle_budgets, public.buckets, public.transactions;
