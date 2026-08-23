-- FisioEnCasa App: registro privado de pacientes.
-- Ejecutar una sola vez en el SQL Editor del proyecto Supabase vinculado.

create extension if not exists pgcrypto;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  birth_date date,
  therapy_type text not null check (therapy_type in ('Física / Deportiva', 'Neurológica')),
  diagnosis text check (diagnosis is null or char_length(diagnosis) <= 500),
  session_frequency text not null check (session_frequency in ('1/semana', '2/semana', '3/semana', 'Según evolución')),
  plan_sessions smallint not null default 12 check (plan_sessions between 1 and 100),
  sessions_done smallint not null default 0 check (sessions_done between 0 and plan_sessions),
  sessions_scheduled smallint not null default 0 check (sessions_scheduled between 0 and plan_sessions),
  progress smallint not null default 0 check (progress between 0 and 100),
  district text check (district is null or char_length(district) <= 100),
  address text check (address is null or char_length(address) <= 250),
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists patients_owner_active_created_idx
  on public.patients (owner_id, created_at desc)
  where archived_at is null;

create or replace function public.set_patients_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists patients_set_updated_at on public.patients;
create trigger patients_set_updated_at
before update on public.patients
for each row execute procedure public.set_patients_updated_at();

alter table public.patients enable row level security;
alter table public.patients force row level security;

revoke all on table public.patients from anon;
grant usage on schema public to authenticated;
grant select, insert, update on table public.patients to authenticated;

drop policy if exists "patients_select_own" on public.patients;
create policy "patients_select_own"
on public.patients for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "patients_insert_own" on public.patients;
create policy "patients_insert_own"
on public.patients for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "patients_update_own" on public.patients;
create policy "patients_update_own"
on public.patients for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

-- No DELETE policy: los registros se conservarán y, en una fase posterior,
-- se archivarán mediante archived_at en lugar de eliminarlos físicamente.

