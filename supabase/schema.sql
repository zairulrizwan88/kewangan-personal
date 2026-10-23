-- Jalankan keseluruhan skrip ini dalam Supabase Dashboard > SQL Editor.
-- Semua rekod dimiliki pengguna yang log masuk. Jangan matikan RLS.
create extension if not exists pgcrypto;

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  category text not null default 'Lain-lain',
  amount numeric(12,2) not null check (amount >= 0),
  bill_month date not null,
  due_date date,
  is_paid boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.funds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  target_amount numeric(12,2) not null default 0 check (target_amount >= 0),
  target_date date,
  current_amount numeric(12,2) not null default 0 check (current_amount >= 0),
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.fund_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fund_id uuid not null references public.funds(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('deposit','withdrawal')),
  amount numeric(12,2) not null check (amount > 0),
  transaction_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  debt_type text not null check (debt_type in ('owe','owed')),
  person_name text not null check (length(trim(person_name)) > 0),
  description text,
  original_amount numeric(12,2) not null check (original_amount >= 0),
  settled_amount numeric(12,2) not null default 0 check (settled_amount >= 0 and settled_amount <= original_amount),
  due_date date,
  created_at timestamptz not null default now()
);
create table if not exists public.debt_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  transaction_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

-- Ensure transaction rows cannot point at another user's parent row.
create or replace function public.verify_fund_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.funds f where f.id = new.fund_id and f.user_id = (select auth.uid())) then
    raise exception 'Invalid fund owner';
  end if;
  new.user_id := (select auth.uid());
  return new;
end;
$$;
drop trigger if exists trg_verify_fund_owner on public.fund_transactions;
create trigger trg_verify_fund_owner before insert or update on public.fund_transactions
for each row execute function public.verify_fund_owner();

create or replace function public.verify_debt_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.debts d where d.id = new.debt_id and d.user_id = (select auth.uid())) then
    raise exception 'Invalid debt owner';
  end if;
  new.user_id := (select auth.uid());
  return new;
end;
$$;
drop trigger if exists trg_verify_debt_owner on public.debt_transactions;
create trigger trg_verify_debt_owner before insert or update on public.debt_transactions
for each row execute function public.verify_debt_owner();

alter table public.bills enable row level security;
alter table public.funds enable row level security;
alter table public.fund_transactions enable row level security;
alter table public.debts enable row level security;
alter table public.debt_transactions enable row level security;

drop policy if exists "Users manage own bills" on public.bills;
create policy "Users manage own bills" on public.bills for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Users manage own funds" on public.funds;
create policy "Users manage own funds" on public.funds for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Users manage own fund transactions" on public.fund_transactions;
create policy "Users manage own fund transactions" on public.fund_transactions for all to authenticated using (
  user_id = (select auth.uid()) and exists(select 1 from public.funds f where f.id=fund_id and f.user_id=(select auth.uid()))
) with check (
  user_id = (select auth.uid()) and exists(select 1 from public.funds f where f.id=fund_id and f.user_id=(select auth.uid()))
);
drop policy if exists "Users manage own debts" on public.debts;
create policy "Users manage own debts" on public.debts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Users manage own debt transactions" on public.debt_transactions;
create policy "Users manage own debt transactions" on public.debt_transactions for all to authenticated using (
  user_id = (select auth.uid()) and exists(select 1 from public.debts d where d.id=debt_id and d.user_id=(select auth.uid()))
) with check (
  user_id = (select auth.uid()) and exists(select 1 from public.debts d where d.id=debt_id and d.user_id=(select auth.uid()))
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.bills, public.funds, public.fund_transactions, public.debts, public.debt_transactions to authenticated;
