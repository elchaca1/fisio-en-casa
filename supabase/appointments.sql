-- FisioEnCasa App: agenda clínica persistente y segura.
-- Ejecutar después de schema.sql y patient-portal.sql.

begin;

create extension if not exists btree_gist;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes smallint not null check (duration_minutes between 30 and 240),
  session_number smallint not null check (session_number between 1 and 100),
  status text not null default 'Programada'
    check (status in ('Programada', 'Realizada', 'Cancelada', 'Reprogramar')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at > starts_at),
  unique (patient_id, session_number)
);

create index if not exists appointments_owner_starts_idx
  on public.appointments (owner_id, starts_at);
create index if not exists appointments_patient_starts_idx
  on public.appointments (patient_id, starts_at);

do $constraint$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'appointments_owner_no_overlap'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_owner_no_overlap
      exclude using gist (
        owner_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      ) where (status in ('Programada', 'Reprogramar'));
  end if;
end;
$constraint$;

create or replace function public.prepare_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.owner_id is distinct from old.owner_id
    or new.patient_id is distinct from old.patient_id
    or new.session_number is distinct from old.session_number
  ) then
    raise exception 'Appointment ownership, patient and session number are immutable';
  end if;

  if not exists (
    select 1
    from public.patients p
    join public.profiles profile on profile.user_id = p.owner_id
    where p.id = new.patient_id
      and p.owner_id = new.owner_id
      and profile.role = 'physio'
      and p.archived_at is null
  ) then
    raise exception 'The appointment must belong to an active patient owned by a physiotherapist';
  end if;

  if tg_op = 'INSERT' and new.session_number is null then
    select coalesce(max(a.session_number), 0) + 1
      into new.session_number
    from public.appointments a
    where a.patient_id = new.patient_id;
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function public.prepare_appointment() from public;

drop trigger if exists appointments_prepare on public.appointments;
create trigger appointments_prepare
before insert or update on public.appointments
for each row execute procedure public.prepare_appointment();

create or replace function public.sync_patient_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_patient_id uuid;
  scheduled_count integer;
  next_start timestamptz;
begin
  target_patient_id := coalesce(new.patient_id, old.patient_id);

  select count(*), min(a.starts_at) filter (
    where a.starts_at >= timezone('utc', now())
  )
  into scheduled_count, next_start
  from public.appointments a
  where a.patient_id = target_patient_id
    and a.status in ('Programada', 'Reprogramar');

  update public.patients
  set sessions_scheduled = least(scheduled_count, plan_sessions)
  where id = target_patient_id;

  update public.patient_portal_summaries
  set next_session_at = next_start,
      sessions_scheduled = least(scheduled_count, plan_sessions)
  where patient_id = target_patient_id;

  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_patient_schedule() from public;

drop trigger if exists appointments_sync_patient on public.appointments;
create trigger appointments_sync_patient
after insert or update on public.appointments
for each row execute procedure public.sync_patient_schedule();

alter table public.appointments enable row level security;
alter table public.appointments force row level security;

revoke all on table public.appointments from public, anon, authenticated;
grant select, insert, update on table public.appointments to authenticated;

drop policy if exists "appointments_physio_select_own" on public.appointments;
drop policy if exists "appointments_physio_insert_own" on public.appointments;
drop policy if exists "appointments_physio_update_own" on public.appointments;

create policy "appointments_physio_select_own"
on public.appointments for select to authenticated
using (public.is_physio() and owner_id = (select auth.uid()));

create policy "appointments_physio_insert_own"
on public.appointments for insert to authenticated
with check (public.is_physio() and owner_id = (select auth.uid()));

create policy "appointments_physio_update_own"
on public.appointments for update to authenticated
using (public.is_physio() and owner_id = (select auth.uid()))
with check (public.is_physio() and owner_id = (select auth.uid()));

comment on table public.appointments is
  'Citas clínicas privadas; los cruces de horario activos se impiden en la base de datos.';

commit;

