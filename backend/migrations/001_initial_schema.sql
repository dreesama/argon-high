-- Argon High — Production PostgreSQL Schema & Supabase Migrations
-- Migration: 001_initial_schema.sql
-- Foundational Tables: Multi-Tenant Workspaces, Users, Memberships, Campaigns, Rules, Assets, Clips, and Processing Jobs

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CORE FOUNDATIONAL TABLES

-- Workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    tier TEXT NOT NULL DEFAULT 'private_beta',
    compute_credits_balance INTEGER NOT NULL DEFAULT 50000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users (Auth Directory)
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    api_token TEXT UNIQUE NOT NULL,
    system_role TEXT NOT NULL DEFAULT 'operator',
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workspace Members (Strict workspace-level membership mapping)
CREATE TABLE IF NOT EXISTS public.workspace_members (
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

-- Campaigns (Structured Extraction)
CREATE TABLE IF NOT EXISTS public.campaigns (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    sponsor_name TEXT NOT NULL,
    raw_brief_text TEXT NOT NULL,
    brief_version INTEGER NOT NULL DEFAULT 1,
    eligible_platforms_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    min_duration_sec NUMERIC(8,2),
    max_duration_sec NUMERIC(8,2),
    required_hashtags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    required_mentions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    required_disclosures_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    prohibited_topics_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    payout_cap_usd NUMERIC(10,2),
    cpm_usd NUMERIC(8,2),
    licensing_terms TEXT,
    unknown_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campaign Rules
CREATE TABLE IF NOT EXISTS public.campaign_rules (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    evidence_quote TEXT,
    confidence NUMERIC(4,2) NOT NULL DEFAULT 0.90,
    status TEXT NOT NULL DEFAULT 'extracted',
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Source Assets
CREATE TABLE IF NOT EXISTS public.source_assets (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    campaign_id TEXT,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    duration_sec NUMERIC(8,2) NOT NULL,
    resolution TEXT NOT NULL,
    fps NUMERIC(5,2) NOT NULL,
    audio_lufs NUMERIC(5,2) NOT NULL,
    authorization_proof TEXT NOT NULL,
    inspection_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clips (Authoritative Short-Form Candidates)
CREATE TABLE IF NOT EXISTS public.clips (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    source_asset_id TEXT NOT NULL REFERENCES public.source_assets(id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    start_sec NUMERIC(8,2) NOT NULL,
    end_sec NUMERIC(8,2) NOT NULL,
    hook_score INTEGER NOT NULL DEFAULT 85,
    caption_preset TEXT NOT NULL DEFAULT 'kinetic-lime',
    crop_mode TEXT NOT NULL DEFAULT 'speaker-lock',
    review_status TEXT NOT NULL DEFAULT 'pending',
    render_status TEXT NOT NULL DEFAULT 'unrendered',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Processing Jobs (Durable background queue records)
CREATE TABLE IF NOT EXISTS public.processing_jobs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    clip_id TEXT REFERENCES public.clips(id) ON DELETE SET NULL,
    source_asset_id TEXT NOT NULL REFERENCES public.source_assets(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued',
    progress_pct INTEGER NOT NULL DEFAULT 0,
    duration_sec NUMERIC(8,2) NOT NULL,
    output_filename TEXT,
    output_inspection_json JSONB,
    burned_captions_preset TEXT,
    download_token TEXT,
    token_expires_at TIMESTAMPTZ,
    error_message TEXT,
    cancellation_reason TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SUPABASE STORAGE BUCKETS & TENANT ISOLATION
DO $$ BEGIN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES 
        ('raw-sources', 'raw-sources', false, 1073741824, ARRAY['video/mp4', 'video/quicktime', 'video/webm']),
        ('rendered-clips', 'rendered-clips', false, 524288000, ARRAY['video/mp4'])
    ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "storage_raw_sources_isolated_access" ON storage.objects;
    CREATE POLICY "storage_raw_sources_isolated_access" ON storage.objects
        FOR ALL USING (
            bucket_id = 'raw-sources' 
            AND auth.role() = 'authenticated'
            AND (storage.foldername(name))[1] IN (
                SELECT workspace_id::TEXT FROM public.workspace_members WHERE user_id = auth.uid()::TEXT
            )
        );

    DROP POLICY IF EXISTS "storage_rendered_clips_isolated_access" ON storage.objects;
    CREATE POLICY "storage_rendered_clips_isolated_access" ON storage.objects
        FOR ALL USING (
            bucket_id = 'rendered-clips' 
            AND auth.role() = 'authenticated'
            AND (storage.foldername(name))[1] IN (
                SELECT workspace_id::TEXT FROM public.workspace_members WHERE user_id = auth.uid()::TEXT
            )
        );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
