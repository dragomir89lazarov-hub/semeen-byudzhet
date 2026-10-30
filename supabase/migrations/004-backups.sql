-- 30 Oct 2026: backups of the whole household budget, kept in the database.
-- create_backup(kind) saves a snapshot; ensure_daily_backup() makes one automatic copy per day;
-- restore_backup(id) brings a snapshot back (saving the current state first).
-- reset_household() now saves a copy before wiping. Running this file changes no existing data.

create table if not exists public.backups (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  kind         text not null default 'manual' check (kind in ('manual', 'auto', 'before_reset', 'before_restore')),
  summary      jsonb not null default '{}',
  data         jsonb not null
);
create index if not exists backups_household_created on public.backups (household_id, created_at desc);
alter table public.backups enable row level security;
drop policy if exists backups_read on public.backups;
create policy backups_read on public.backups for select using (public.is_member(household_id));

create or replace function public.my_household() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from household_members where user_id = auth.uid() limit 1;
$$;

create or replace function public.create_backup(p_kind text default 'manual') returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid := my_household(); d jsonb; s jsonb; bid uuid;
begin
  if h is null then raise exception 'not a household member'; end if;
  d := jsonb_build_object(
    'format', 1,
    'household', (select to_jsonb(x) - 'invite_code' from households x where x.id = h),
    'buckets', coalesce((select jsonb_agg(to_jsonb(b)) from buckets b where b.household_id = h), '[]'),
    'categories', coalesce((select jsonb_agg(to_jsonb(c)) from categories c where c.household_id = h), '[]'),
    'pay_cycles', coalesce((select jsonb_agg(to_jsonb(p)) from pay_cycles p where p.household_id = h), '[]'),
    'cycle_budgets', coalesce((select jsonb_agg(to_jsonb(cb)) from cycle_budgets cb where cb.household_id = h), '[]'),
    'transactions', coalesce((select jsonb_agg(to_jsonb(t)) from transactions t where t.household_id = h), '[]'));
  s := jsonb_build_object(
    'transactions', (select count(*) from transactions where household_id = h and deleted_at is null),
    'categories', (select count(*) from categories where household_id = h and not is_archived),
    'buckets', (select count(*) from buckets where household_id = h and not is_archived),
    'cycles', (select count(*) from pay_cycles where household_id = h));
  insert into backups (household_id, kind, summary, data) values (h, coalesce(p_kind, 'manual'), s, d) returning id into bid;
  -- keep the newest 30 automatic and 50 other copies
  delete from backups where id in (
    select id from (select id, row_number() over (partition by (kind = 'auto') order by created_at desc) rn
                    from backups where household_id = h) q
    where rn > 50 or (rn > 30 and id in (select id from backups where household_id = h and kind = 'auto')));
  return bid;
end $$;

create or replace function public.ensure_daily_backup() returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid := my_household();
begin
  if h is null then return null; end if;
  if exists (select 1 from backups where household_id = h and kind = 'auto'
             and (created_at at time zone 'Europe/Sofia')::date = (now() at time zone 'Europe/Sofia')::date) then
    return null;
  end if;
  return create_backup('auto');
end $$;

create or replace function public.restore_backup(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h uuid := my_household(); d jsonb; hh households;
begin
  if h is null then raise exception 'not a household member'; end if;
  select data into d from backups where id = p_id and household_id = h;
  if d is null then raise exception 'backup not found'; end if;
  perform create_backup('before_restore');

  delete from transactions where household_id = h;
  delete from cycle_budgets where household_id = h;
  delete from pay_cycles where household_id = h;
  update households set default_fund_id = null where id = h;
  delete from categories where household_id = h;
  delete from buckets where household_id = h;

  insert into buckets select * from jsonb_populate_recordset(null::buckets, d->'buckets') where household_id = h;
  insert into categories select * from jsonb_populate_recordset(null::categories, d->'categories') where household_id = h;
  insert into pay_cycles select * from jsonb_populate_recordset(null::pay_cycles, d->'pay_cycles') where household_id = h;
  insert into cycle_budgets select * from jsonb_populate_recordset(null::cycle_budgets, d->'cycle_budgets') where household_id = h;
  insert into transactions (id, household_id, kind, amount_cents, occurred_on, category_id, bucket_id, paid_by, note,
                            logged_by, created_at, updated_at, version, deleted_at)
    select t.id, t.household_id, t.kind, t.amount_cents, t.occurred_on, t.category_id, t.bucket_id, t.paid_by, coalesce(t.note, ''),
           case when exists (select 1 from auth.users u where u.id = t.logged_by) then t.logged_by end,
           coalesce(t.created_at, now()), coalesce(t.updated_at, now()), coalesce(t.version, 1), t.deleted_at
    from jsonb_populate_recordset(null::transactions, d->'transactions') t where t.household_id = h;

  hh := jsonb_populate_record(null::households, d->'household');
  update households set people = coalesce(hh.people, people), payday_rule = coalesce(hh.payday_rule, payday_rule),
    buffer_cents = coalesce(hh.buffer_cents, 0), default_fund_id = hh.default_fund_id, reset_at = now()
  where id = h;
end $$;

-- "Изчисти всички данни" now saves a copy first
do $$ begin
  if exists (select 1 from pg_proc where proname = 'reset_household') then
    execute $f$
      create or replace function public.reset_household_with_backup() returns void
      language plpgsql security definer set search_path = public as $b$
      begin perform create_backup('before_reset'); perform reset_household(); end $b$;
    $f$;
  end if;
end $$;

revoke all on function public.create_backup(text), public.ensure_daily_backup(), public.restore_backup(uuid),
  public.reset_household_with_backup(), public.my_household() from public, anon;
grant execute on function public.create_backup(text), public.ensure_daily_backup(), public.restore_backup(uuid),
  public.reset_household_with_backup(), public.my_household() to authenticated;
