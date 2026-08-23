-- FisioEnCasa App: roles y portal seguro para pacientes.
--
-- Ejecutar DESPUES de supabase/schema.sql en el SQL Editor de Supabase.
-- La cuenta Auth Jfchacaliazac@gmail.com debe existir antes de ejecutarlo.
-- Es idempotente: se puede volver a ejecutar para reparar funciones, permisos
-- y politicas sin duplicar registros.

begin;

-- ---------------------------------------------------------------------------
-- 1. Roles de aplicacion
-- ---------------------------------------------------------------------------
-- El rol vive en una tabla propia y no en user_metadata, porque el usuario
-- puede modificar sus metadatos. La API publica solo puede leer el perfil
-- propio; un cambio de rol requiere SQL confiable o una operacion server-side
-- con la service role de Supabase.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'patient'
    check (role in ('physio', 'patient')),
  display_name text
    check (display_name is null or char_length(btrim(display_name)) between 2 and 120),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function public.touch_profile_updated_at() from public;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute procedure public.touch_profile_updated_at();

-- Todo usuario nuevo nace como paciente. El cliente no puede elegir su rol y
-- los metadatos enviados durante el registro se ignoran para autorizacion.
create or replace function public.create_patient_profile_for_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, role)
  values (new.id, 'patient')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_patient_profile_for_new_auth_user() from public;

drop trigger if exists fisio_create_profile_after_signup on auth.users;
create trigger fisio_create_profile_after_signup
after insert on auth.users
for each row execute procedure public.create_patient_profile_for_new_auth_user();

-- Completa perfiles de cuentas existentes sin cambiar roles ya asignados.
insert into public.profiles (user_id, role)
select users.id, 'patient'
from auth.users as users
on conflict (user_id) do nothing;

-- Cuenta administradora/fisioterapeuta inicial. La comparacion normalizada
-- evita diferencias accidentales de mayusculas o espacios. No crea usuarios.
do $admin_check$
declare
  matching_admins integer;
begin
  select count(*)
  into matching_admins
  from auth.users as users
  where lower(btrim(users.email)) = lower('Jfchacaliazac@gmail.com');

  if matching_admins <> 1 then
    raise exception
      'Expected exactly one existing Auth user for the initial physiotherapist email; found %',
      matching_admins;
  end if;
end;
$admin_check$;

insert into public.profiles as current_profile (user_id, role, display_name)
select users.id, 'physio', 'Fisioterapeuta administrador'
from auth.users as users
where lower(btrim(users.email)) = lower('Jfchacaliazac@gmail.com')
on conflict (user_id) do update
set role = 'physio',
    display_name = coalesce(current_profile.display_name, excluded.display_name),
    updated_at = timezone('utc', now());

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

revoke all on table public.profiles from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.profiles to authenticated;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
on public.profiles for select to authenticated
using (user_id = (select auth.uid()));

-- No hay politicas INSERT/UPDATE/DELETE ni permisos de escritura para clientes.

-- Funciones pequenas de autorizacion. Sus consultas no dependen de las
-- politicas RLS de las tablas internas, pero siempre evalúan auth.uid().
create or replace function public.is_physio()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profiles
    where profiles.user_id = auth.uid()
      and profiles.role = 'physio'
  );
$$;

revoke all on function public.is_physio() from public;
grant execute on function public.is_physio() to authenticated;

create or replace function public.owns_patient(requested_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_physio()
    and exists (
      select 1
      from public.patients as patients
      where patients.id = requested_patient_id
        and patients.owner_id = auth.uid()
    );
$$;

revoke all on function public.owns_patient(uuid) from public;
grant execute on function public.owns_patient(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Endurecer la ficha clinica completa
-- ---------------------------------------------------------------------------
-- Un usuario autenticado ya no obtiene acceso a public.patients solo por ser
-- propietario del UUID. Tambien debe tener rol physio.

create or replace function public.set_patients_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function public.set_patients_updated_at() from public;

alter table public.patients enable row level security;
alter table public.patients force row level security;

revoke all on table public.patients from public, anon, authenticated;
grant select, insert, update on table public.patients to authenticated;

-- Las politicas son permisivas por defecto (se combinan con OR). Por eso se
-- retira cualquier politica anterior antes de instalar este conjunto cerrado.
do $policy_cleanup$
declare
  existing_policy record;
begin
  for existing_policy in
    select policies.policyname
    from pg_catalog.pg_policies as policies
    where policies.schemaname = 'public'
      and policies.tablename = 'patients'
  loop
    execute format(
      'drop policy if exists %I on public.patients',
      existing_policy.policyname
    );
  end loop;
end;
$policy_cleanup$;

drop policy if exists "patients_select_own" on public.patients;
drop policy if exists "patients_insert_own" on public.patients;
drop policy if exists "patients_update_own" on public.patients;
drop policy if exists "patients_physio_select_own" on public.patients;
drop policy if exists "patients_physio_insert_own" on public.patients;
drop policy if exists "patients_physio_update_own" on public.patients;

create policy "patients_physio_select_own"
on public.patients for select to authenticated
using (
  public.is_physio()
  and owner_id = (select auth.uid())
);

create policy "patients_physio_insert_own"
on public.patients for insert to authenticated
with check (
  public.is_physio()
  and owner_id = (select auth.uid())
);

create policy "patients_physio_update_own"
on public.patients for update to authenticated
using (
  public.is_physio()
  and owner_id = (select auth.uid())
)
with check (
  public.is_physio()
  and owner_id = (select auth.uid())
);

-- Sigue sin existir una politica DELETE: las fichas se archivan.

-- ---------------------------------------------------------------------------
-- 3. Vinculo privado cuenta del paciente <-> ficha clinica
-- ---------------------------------------------------------------------------
-- Esta tabla NO se expone a clientes. Se administra exclusivamente desde una
-- ruta server-side autenticada que use SUPABASE_SERVICE_ROLE_KEY. Una cuenta
-- solo puede vincularse a una ficha y una ficha a una cuenta activa.

create table if not exists public.patient_portal_accounts (
  patient_id uuid primary key references public.patients(id) on delete cascade,
  portal_user_id uuid not null unique references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  linked_by uuid not null references auth.users(id) on delete restrict,
  linked_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.validate_patient_portal_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles as profiles
    where profiles.user_id = new.portal_user_id
      and profiles.role = 'patient'
  ) then
    raise exception 'portal_user_id must belong to a patient profile';
  end if;

  if not exists (
    select 1
    from public.patients as patients
    join public.profiles as profiles
      on profiles.user_id = patients.owner_id
     and profiles.role = 'physio'
    where patients.id = new.patient_id
      and patients.owner_id = new.linked_by
  ) then
    raise exception 'linked_by must be the physiotherapist who owns the patient record';
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function public.validate_patient_portal_account() from public;

drop trigger if exists patient_portal_accounts_validate on public.patient_portal_accounts;
create trigger patient_portal_accounts_validate
before insert or update on public.patient_portal_accounts
for each row execute procedure public.validate_patient_portal_account();

alter table public.patient_portal_accounts enable row level security;
alter table public.patient_portal_accounts force row level security;

revoke all on table public.patient_portal_accounts from public, anon, authenticated;
-- Sin grants ni politicas: solo SQL confiable/service role puede administrarla.

-- ---------------------------------------------------------------------------
-- 4. Resumen explicitamente publicable para el portal
-- ---------------------------------------------------------------------------
-- Esta tabla es una lista blanca independiente. No contiene diagnostico,
-- direccion, fecha de nacimiento, notas clinicas ni transcripciones.

create table if not exists public.patient_portal_summaries (
  patient_id uuid primary key references public.patients(id) on delete cascade,
  display_name text not null
    check (char_length(btrim(display_name)) between 2 and 120),
  therapy_type text not null
    check (therapy_type in ('Física / Deportiva', 'Neurológica')),
  next_session_at timestamptz,
  plan_sessions smallint
    check (plan_sessions is null or plan_sessions between 1 and 100),
  sessions_done smallint
    check (sessions_done is null or sessions_done between 0 and 100),
  sessions_scheduled smallint
    check (sessions_scheduled is null or sessions_scheduled between 0 and 100),
  progress_percent smallint
    check (progress_percent is null or progress_percent between 0 and 100),
  progress_disclaimer text not null default
    'Este porcentaje es un indicador de evolucion funcional y motivacional respecto de la meta acordada; no garantiza recuperacion.'
    check (
      progress_disclaimer =
        'Este porcentaje es un indicador de evolucion funcional y motivacional respecto de la meta acordada; no garantiza recuperacion.'
    ),
  home_program text
    check (home_program is null or char_length(home_program) <= 3000),
  therapist_message text
    check (therapist_message is null or char_length(therapist_message) <= 3000),
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    sessions_done is null
    or plan_sessions is null
    or sessions_done <= plan_sessions
  ),
  check (
    sessions_scheduled is null
    or plan_sessions is null
    or sessions_scheduled <= plan_sessions
  )
);

create or replace function public.prepare_patient_portal_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());

  if new.is_published is false then
    new.published_at := null;
  elsif tg_op = 'INSERT' then
    new.published_at := timezone('utc', now());
  elsif old.is_published is false then
    new.published_at := timezone('utc', now());
  else
    new.published_at := old.published_at;
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_patient_portal_summary() from public;

drop trigger if exists patient_portal_summaries_prepare on public.patient_portal_summaries;
create trigger patient_portal_summaries_prepare
before insert or update on public.patient_portal_summaries
for each row execute procedure public.prepare_patient_portal_summary();

create or replace function public.can_view_patient_portal_summary(requested_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_portal_accounts as accounts
    join public.profiles as profiles
      on profiles.user_id = accounts.portal_user_id
     and profiles.role = 'patient'
    where accounts.patient_id = requested_patient_id
      and accounts.portal_user_id = auth.uid()
      and accounts.enabled
  );
$$;

revoke all on function public.can_view_patient_portal_summary(uuid) from public;
grant execute on function public.can_view_patient_portal_summary(uuid) to authenticated;

alter table public.patient_portal_summaries enable row level security;
alter table public.patient_portal_summaries force row level security;

revoke all on table public.patient_portal_summaries from public, anon, authenticated;
grant select, insert, update on table public.patient_portal_summaries to authenticated;

drop policy if exists "portal_summaries_select" on public.patient_portal_summaries;
drop policy if exists "portal_summaries_physio_insert" on public.patient_portal_summaries;
drop policy if exists "portal_summaries_physio_update" on public.patient_portal_summaries;

create policy "portal_summaries_select"
on public.patient_portal_summaries for select to authenticated
using (
  public.owns_patient(patient_id)
  or (
    is_published
    and public.can_view_patient_portal_summary(patient_id)
  )
);

create policy "portal_summaries_physio_insert"
on public.patient_portal_summaries for insert to authenticated
with check (public.owns_patient(patient_id));

create policy "portal_summaries_physio_update"
on public.patient_portal_summaries for update to authenticated
using (public.owns_patient(patient_id))
with check (public.owns_patient(patient_id));

-- No DELETE policy and no grant DELETE. Para retirar informacion del portal,
-- el fisioterapeuta establece is_published = false o deshabilita el vinculo.

comment on table public.profiles is
  'Roles de autorizacion controlados por SQL confiable/service role; nunca por user_metadata.';
comment on table public.patient_portal_accounts is
  'Vinculo privado entre cuenta Auth y ficha; no se expone a clientes.';
comment on table public.patient_portal_summaries is
  'Lista blanca de datos que el fisioterapeuta puede publicar expresamente al paciente.';

commit;

