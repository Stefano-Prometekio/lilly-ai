create extension if not exists pgcrypto;

create table if not exists public.campaigns (
  id text primary key,
  status text not null default 'draft',
  service_type text not null default 'catering',
  currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brief_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.campaigns(id) on delete cascade,
  version integer not null,
  status text not null check (status in ('draft', 'confirmed', 'superseded')),
  content jsonb not null,
  content_hash text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, version)
);

create table if not exists public.market_references (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.campaigns(id) on delete cascade,
  brief_version integer not null,
  low_total numeric not null,
  median_total numeric not null,
  high_total numeric not null,
  confidence numeric not null check (confidence between 0 and 1),
  sources jsonb not null default '[]'::jsonb,
  methodology text,
  researched_at timestamptz not null default now()
);

create table if not exists public.vendors (
  id text primary key,
  campaign_id text not null references public.campaigns(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  website text,
  source_records jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.call_sessions (
  id text primary key,
  campaign_id text references public.campaigns(id) on delete set null,
  vendor_id text references public.vendors(id) on delete set null,
  brief_version integer,
  mode text not null default 'INITIAL_QUOTE',
  status text not null default 'created',
  elevenlabs_conversation_id text unique,
  elevenlabs_agent_id text,
  elevenlabs_version_id text,
  transcript jsonb not null default '[]'::jsonb,
  analysis jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  summary text,
  has_audio boolean not null default false,
  audio_path text,
  failure_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transcript_turns (
  id uuid primary key default gen_random_uuid(),
  call_session_id text not null references public.call_sessions(id) on delete cascade,
  turn_index integer not null,
  role text not null,
  message text not null default '',
  time_in_call_secs numeric,
  tool_calls jsonb,
  tool_results jsonb,
  created_at timestamptz not null default now(),
  unique (call_session_id, turn_index)
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.campaigns(id) on delete cascade,
  vendor_id text not null references public.vendors(id) on delete cascade,
  call_session_id text references public.call_sessions(id) on delete set null,
  version integer not null default 1,
  phase text not null check (phase in ('initial', 'final')),
  headline_total numeric,
  normalized_total numeric,
  completeness numeric not null default 0,
  evidence_confidence numeric not null default 0,
  status text not null default 'draft',
  terms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (vendor_id, version)
);

create table if not exists public.quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  concept text not null,
  description text,
  amount numeric,
  currency text,
  inclusion_state text not null default 'unknown',
  confidence numeric not null default 0,
  evidence_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.campaigns(id) on delete cascade,
  call_session_id text references public.call_sessions(id) on delete cascade,
  transcript_turn_id uuid references public.transcript_turns(id) on delete set null,
  evidence_type text not null,
  fact_type text not null,
  fact_value jsonb not null,
  confidence numeric not null default 0,
  time_in_call_secs numeric,
  leverage_eligible boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.quote_line_items
  add constraint quote_line_items_evidence_id_fkey
  foreign key (evidence_id) references public.evidence_items(id) on delete set null;

create table if not exists public.negotiation_plans (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.campaigns(id) on delete cascade,
  vendor_id text not null references public.vendors(id) on delete cascade,
  frozen_quote_ids uuid[] not null default '{}',
  permitted_claims jsonb not null default '[]'::jsonb,
  prohibited_disclosures jsonb not null default '[]'::jsonb,
  target_requests jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('call-audio', 'call-audio', false)
on conflict (id) do nothing;

alter table public.campaigns enable row level security;
alter table public.brief_versions enable row level security;
alter table public.market_references enable row level security;
alter table public.vendors enable row level security;
alter table public.call_sessions enable row level security;
alter table public.transcript_turns enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_line_items enable row level security;
alter table public.evidence_items enable row level security;
alter table public.negotiation_plans enable row level security;

comment on table public.evidence_items is 'Commercial claims with transcript/document provenance. Only leverage_eligible evidence may be used in negotiation.';
comment on column public.call_sessions.brief_version is 'The immutable confirmed brief version used for the call.';
