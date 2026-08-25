-- Allo Psycho — baseline privacy-first / anonymous-first.
-- Exécuter dans SQL Editor après sauvegarde. Ce script est idempotent au mieux mais doit être revu avant production.
-- Activer Anonymous Sign-Ins dans Supabase Auth.

create table if not exists public.patient_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  birth_year text,
  response_style text not null default 'doux',
  primary_goal text not null default 'apaisement',
  routine_preference text not null default 'souple',
  health_consent boolean not null default false,
  ai_consent boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Compatibilité avec les projets où patient_profiles existait déjà.
alter table public.patient_profiles add column if not exists primary_goal text not null default 'apaisement';
alter table public.patient_profiles add column if not exists routine_preference text not null default 'souple';
alter table public.patient_profiles add column if not exists consented_at timestamptz;
alter table public.patient_profiles add column if not exists health_consent boolean not null default false;
alter table public.patient_profiles add column if not exists ai_consent boolean not null default false;
alter table public.patient_profiles add column if not exists response_style text not null default 'doux';
alter table public.patient_profiles add column if not exists display_name text;
alter table public.patient_profiles add column if not exists birth_year text;

create table if not exists public.patient_journal (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.patient_moods (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mood text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.patient_tcc (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  negative_thought text,
  real_facts text,
  alternative_thought text,
  created_at timestamptz not null default now()
);
create table if not exists public.patient_chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.audio_library (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  category text not null default 'Autre',
  tags jsonb not null default '[]'::jsonb,
  storage_path text not null,
  published boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Droits API nécessaires pour les utilisateurs anonymes/authentifiés.
grant select, insert, update, delete on table public.patient_profiles to authenticated;

alter table public.patient_profiles enable row level security;
drop policy if exists "profile owner select" on public.patient_profiles;
create policy "profile owner select" on public.patient_profiles for select to authenticated using (id=auth.uid());
drop policy if exists "profile owner insert" on public.patient_profiles;
create policy "profile owner insert" on public.patient_profiles for insert to authenticated with check (id=auth.uid());
drop policy if exists "profile owner update" on public.patient_profiles;
create policy "profile owner update" on public.patient_profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
drop policy if exists "profile owner delete" on public.patient_profiles;
create policy "profile owner delete" on public.patient_profiles for delete to authenticated using (id=auth.uid());

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['patient_journal','patient_moods','patient_tcc','patient_chat_messages'] LOOP
    EXECUTE format('alter table public.%I enable row level security',t);
    EXECUTE format('drop policy if exists "owner select" on public.%I',t);
    EXECUTE format('create policy "owner select" on public.%I for select to authenticated using (user_id=auth.uid())',t);
    EXECUTE format('drop policy if exists "owner insert" on public.%I',t);
    EXECUTE format('create policy "owner insert" on public.%I for insert to authenticated with check (user_id=auth.uid())',t);
    EXECUTE format('drop policy if exists "owner update" on public.%I',t);
    EXECUTE format('create policy "owner update" on public.%I for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid())',t);
    EXECUTE format('drop policy if exists "owner delete" on public.%I',t);
    EXECUTE format('create policy "owner delete" on public.%I for delete to authenticated using (user_id=auth.uid())',t);
  END LOOP;
END $$;

alter table public.admin_users enable row level security;
drop policy if exists "admins can read own admin row" on public.admin_users;
create policy "admins can read own admin row" on public.admin_users for select to authenticated using (user_id=auth.uid());

alter table public.audio_library enable row level security;
drop policy if exists "published audio read" on public.audio_library;
create policy "published audio read" on public.audio_library for select to authenticated using (published=true or created_by=auth.uid());
drop policy if exists "admin audio insert" on public.audio_library;
create policy "admin audio insert" on public.audio_library for insert to authenticated with check (exists(select 1 from public.admin_users a where a.user_id=auth.uid()) and created_by=auth.uid());
drop policy if exists "admin audio update" on public.audio_library;
create policy "admin audio update" on public.audio_library for update to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid())) with check (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
drop policy if exists "admin audio delete" on public.audio_library;
create policy "admin audio delete" on public.audio_library for delete to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

-- Audios partagés : public. MP3 personnels : bucket séparé privé.
insert into storage.buckets(id,name,public) values('audios','audios',true) on conflict(id) do update set public=true;
insert into storage.buckets(id,name,public) values('user-audios','user-audios',false) on conflict(id) do update set public=false;

drop policy if exists "admin shared audio insert" on storage.objects;
create policy "admin shared audio insert" on storage.objects for insert to authenticated with check (bucket_id='audios' and exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
drop policy if exists "admin shared audio update" on storage.objects;
create policy "admin shared audio update" on storage.objects for update to authenticated using (bucket_id='audios' and exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
drop policy if exists "admin shared audio delete" on storage.objects;
create policy "admin shared audio delete" on storage.objects for delete to authenticated using (bucket_id='audios' and exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

drop policy if exists "private own audio read" on storage.objects;
create policy "private own audio read" on storage.objects for select to authenticated using (bucket_id='user-audios' and name like auth.uid()::text || '/%');
drop policy if exists "private own audio insert" on storage.objects;
create policy "private own audio insert" on storage.objects for insert to authenticated with check (bucket_id='user-audios' and name like auth.uid()::text || '/%');
drop policy if exists "private own audio delete" on storage.objects;
create policy "private own audio delete" on storage.objects for delete to authenticated using (bucket_id='user-audios' and name like auth.uid()::text || '/%');

create or replace function public.delete_my_account_data() returns void language plpgsql security invoker as $$
begin
  delete from public.patient_chat_messages where user_id=auth.uid();
  delete from public.patient_moods where user_id=auth.uid();
  delete from public.patient_journal where user_id=auth.uid();
  delete from public.patient_tcc where user_id=auth.uid();
  delete from public.patient_profiles where id=auth.uid();
end; $$;
revoke all on function public.delete_my_account_data() from public;
grant execute on function public.delete_my_account_data() to authenticated;

create table if not exists public.security_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  created_at timestamptz not null default now()
);
alter table public.security_audit_log enable row level security;
drop policy if exists "audit admin read" on public.security_audit_log;
create policy "audit admin read" on public.security_audit_log for select to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

create or replace function public.audit_audio_library_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.security_audit_log(actor_user_id,action,resource_type,resource_id)
  values(auth.uid(),TG_OP,'audio_library',coalesce((case when TG_OP='DELETE' then OLD.id else NEW.id end)::text,''));
  return case when TG_OP='DELETE' then OLD else NEW end;
end; $$;
drop trigger if exists trg_audit_audio_library on public.audio_library;
create trigger trg_audit_audio_library after insert or update or delete on public.audio_library for each row execute function public.audit_audio_library_change();
