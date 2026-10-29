-- 29 Oct 2026: categories can be grouped (e.g. "Хранителни продукти" + "Храна за вкъщи и ресторанти" → "Храна").
-- The group is only a display setting; expenses keep their own category. Running this changes no existing data.
alter table public.categories add column if not exists group_name text;
