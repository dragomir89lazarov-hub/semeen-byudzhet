-- Read-only overview of accounts and how money moved in/out of them (used to check calculations).
select 'ACCOUNT' as t, b.name, b.kind, b.is_archived::text as archived,
  coalesce(sum(case when x.kind='bucket_deposit' then x.amount_cents when x.kind in ('bucket_withdrawal','expense') then -x.amount_cents end) filter (where x.deleted_at is null), 0)::text as balance_cents,
  count(x.*) filter (where x.deleted_at is null)::text as moves,
  string_agg(distinct x.kind, ',') filter (where x.deleted_at is null) as kinds
from buckets b left join transactions x on x.bucket_id = b.id group by b.id, b.name, b.kind, b.is_archived
union all
select 'TX', x.kind, coalesce(b.name, '(общ бюджет)'), x.occurred_on::text, x.amount_cents::text, coalesce(c.name, ''), left(coalesce(x.note,''), 40)
from transactions x left join buckets b on b.id = x.bucket_id left join categories c on c.id = x.category_id
where x.deleted_at is null
union all
select 'CYCLE', start_date::text, end_date::text, carryover_cents::text, '', '', '' from pay_cycles
union all
select 'HOUSEHOLD', coalesce((select name from buckets where id = h.default_fund_id), '-'), array_to_string(people, '/'), '', '', '', '' from households h
order by 1, 2;
