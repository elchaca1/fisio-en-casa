-- Evaluaciones iniciales manuales y privadas de FisioEnCasa.

create table if not exists public.initial_evaluations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  therapy_type text not null check (therapy_type in ('Física / Deportiva', 'Neurológica')),
  responses jsonb not null default '[]'::jsonb,
  questionnaire_version smallint not null default 1,
  status text not null default 'Borrador' check (status in ('Borrador', 'Validada')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (patient_id),
  check (jsonb_typeof(responses) = 'array' and jsonb_array_length(responses) = 11)
);

create index if not exists initial_evaluations_owner_updated_idx
  on public.initial_evaluations (owner_id, updated_at desc);

create or replace function public.prepare_initial_evaluation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.patients p
    where p.id = new.patient_id
      and p.owner_id = new.owner_id
      and p.archived_at is null
  ) then
    raise exception 'patient does not belong to clinician';
  end if;

  if tg_op = 'UPDATE' then
    new.owner_id := old.owner_id;
    new.patient_id := old.patient_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists initial_evaluations_prepare on public.initial_evaluations;
create trigger initial_evaluations_prepare
before insert or update on public.initial_evaluations
for each row execute procedure public.prepare_initial_evaluation();

alter table public.initial_evaluations enable row level security;
alter table public.initial_evaluations force row level security;

revoke all on table public.initial_evaluations from anon;
grant select, insert, update on table public.initial_evaluations to authenticated;

drop policy if exists "initial_evaluations_select_own" on public.initial_evaluations;
create policy "initial_evaluations_select_own"
on public.initial_evaluations for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "initial_evaluations_insert_own" on public.initial_evaluations;
create policy "initial_evaluations_insert_own"
on public.initial_evaluations for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "initial_evaluations_update_own" on public.initial_evaluations;
create policy "initial_evaluations_update_own"
on public.initial_evaluations for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

