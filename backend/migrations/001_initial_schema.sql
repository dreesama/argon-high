-- Argon High — Production PostgreSQL Schema & Supabase Migrations
-- Migration: 001_initial_schema.sql
-- Multi-tenant workspace isolation with Row Level Security (RLS)

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CUSTOM TYPES & ENUMS
DO $$ BEGIN
    CREATE TYPE workspace_tier AS ENUM ('Private Operator', 'Syndicate Pro', 'Enterprise Desk');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE member_role AS ENUM ('owner', 'admin', 'operator', 'reviewer', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE platform_type AS ENUM ('TikTok', 'YouTube Shorts', 'Instagram Reels', 'X Video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE compliance_status AS ENUM ('passed', 'failed', 'warning', 'pending', 'human-review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE review_decision AS ENUM ('pending', 'approved', 'rejected', 'changes-requested', 'export-ready');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payout_state AS ENUM ('verified-paid', 'settled-escrow', 'accrued-unsettled', 'estimated-projected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. CORE TABLES

-- Workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    tier workspace_tier NOT NULL DEFAULT 'Private Operator',
    monthly_compute_budget_usd NUMERIC(10,2) NOT NULL DEFAULT 500.00,
    used_compute_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    storage_used_gb NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workspace Members
CREATE TABLE IF NOT EXISTS public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- references auth.users(id) in Supabase
    role member_role NOT NULL DEFAULT 'operator',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, user_id)
);

-- Campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    sponsor_name TEXT NOT NULL,
    source_channel TEXT NOT NULL,
    source_category TEXT NOT NULL,
    cpm_usd NUMERIC(8,2) NOT NULL DEFAULT 5.00,
    total_budget_usd NUMERIC(12,2) NOT NULL,
    remaining_budget_usd NUMERIC(12,2) NOT NULL,
    payout_cap_per_clip_usd NUMERIC(8,2) NOT NULL DEFAULT 1500.00,
    min_views_for_payout INTEGER NOT NULL DEFAULT 10000,
    eligible_platforms platform_type[] NOT NULL DEFAULT '{TikTok,"YouTube Shorts"}',
    deadline_at TIMESTAMPTZ NOT NULL,
    eligibility_status TEXT NOT NULL DEFAULT 'Eligible',
    estimated_value_per_clip_usd NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    brief_raw_text TEXT NOT NULL,
    allowed_source_urls TEXT[] NOT NULL DEFAULT '{}',
    ai_parse_confidence INTEGER NOT NULL DEFAULT 95,
    is_demo_data BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campaign Rules
CREATE TABLE IF NOT EXISTS public.campaign_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    label TEXT NOT NULL,
    requirement_text TEXT NOT NULL,
    strictness TEXT NOT NULL CHECK (strictness IN ('mandatory', 'advisory', 'manual_signoff')),
    expected_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Source Assets (Authorized Video Feeds)
CREATE TABLE IF NOT EXISTS public.source_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    creator_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    storage_path TEXT,
    duration_sec NUMERIC(8,2) NOT NULL,
    resolution TEXT NOT NULL DEFAULT '1920x1080',
    fps NUMERIC(5,2) NOT NULL DEFAULT 30.00,
    audio_lufs NUMERIC(5,2) NOT NULL DEFAULT -14.00,
    authorization_proof TEXT NOT NULL,
    analysis_status TEXT NOT NULL DEFAULT 'unprocessed' CHECK (analysis_status IN ('unprocessed', 'analyzing', 'analyzed', 'error')),
    analyzed_at TIMESTAMPTZ,
    transcript_json JSONB,
    waveform_peaks NUMERIC(4,2)[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clips (Candidate and Rendered Clips)
CREATE TABLE IF NOT EXISTS public.clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    source_asset_id UUID NOT NULL REFERENCES public.source_assets(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    rank INTEGER NOT NULL DEFAULT 1,
    start_sec NUMERIC(8,2) NOT NULL,
    end_sec NUMERIC(8,2) NOT NULL,
    hook_score INTEGER NOT NULL DEFAULT 85 CHECK (hook_score BETWEEN 0 AND 100),
    hook_breakdown JSONB NOT NULL DEFAULT '{}',
    caption_preset TEXT NOT NULL DEFAULT 'kinetic-lime',
    caption_font_size TEXT NOT NULL DEFAULT 'md',
    caption_position TEXT NOT NULL DEFAULT 'lower-third',
    crop_mode TEXT NOT NULL DEFAULT 'split-screen-podcast',
    face_track_offset_x INTEGER NOT NULL DEFAULT 0,
    include_watermark BOOLEAN NOT NULL DEFAULT TRUE,
    watermark_position TEXT NOT NULL DEFAULT 'top-right',
    normalize_audio_lufs BOOLEAN NOT NULL DEFAULT TRUE,
    target_platforms platform_type[] NOT NULL DEFAULT '{TikTok,"YouTube Shorts"}',
    transcript_excerpt TEXT,
    compliance_summary_status compliance_status NOT NULL DEFAULT 'pending',
    review_status review_decision NOT NULL DEFAULT 'pending',
    render_status TEXT NOT NULL DEFAULT 'draft' CHECK (render_status IN ('draft', 'queued', 'rendering', 'rendered', 'failed')),
    rendered_storage_path TEXT,
    estimated_payout_usd NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Processing Jobs (Async FFmpeg / Analysis Workers)
CREATE TABLE IF NOT EXISTS public.processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    clip_id UUID REFERENCES public.clips(id) ON DELETE SET NULL,
    source_asset_id UUID REFERENCES public.source_assets(id) ON DELETE SET NULL,
    job_type TEXT NOT NULL CHECK (job_type IN ('transcription', 'hook_ranking', 'render_9_16', 'ffprobe_inspect')),
    status job_status NOT NULL DEFAULT 'queued',
    progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
    codec TEXT NOT NULL DEFAULT 'H.264 High@L4.2',
    output_resolution TEXT NOT NULL DEFAULT '1080x1920',
    error_message TEXT,
    payload JSONB NOT NULL DEFAULT '{}',
    result_metadata JSONB NOT NULL DEFAULT '{}',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- QA Results (Compliance Audits per Rule)
CREATE TABLE IF NOT EXISTS public.qa_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES public.campaign_rules(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    status compliance_status NOT NULL,
    detected_value TEXT,
    failure_reason TEXT,
    remediation_step TEXT,
    attestation_by UUID, -- references auth.users(id)
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approvals (Sign-offs for Distribution)
CREATE TABLE IF NOT EXISTS public.approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    reviewer_user_id UUID NOT NULL, -- references auth.users(id)
    reviewer_name TEXT NOT NULL,
    reviewer_role TEXT NOT NULL,
    decision review_decision NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Publications (Syndicated Distribution Records)
CREATE TABLE IF NOT EXISTS public.publications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    platform platform_type NOT NULL,
    account_handle TEXT NOT NULL,
    external_post_id TEXT,
    verified_views INTEGER NOT NULL DEFAULT 0,
    estimated_views INTEGER NOT NULL DEFAULT 0,
    retention_3s_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    avg_watch_time_sec NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'pending-verification' CHECK (status IN ('live-tracked', 'pending-verification', 'disputed')),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payouts (Financial Settlement Ledger)
CREATE TABLE IF NOT EXISTS public.payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    clip_id UUID REFERENCES public.clips(id) ON DELETE SET NULL,
    amount_usd NUMERIC(10,2) NOT NULL,
    verification_state payout_state NOT NULL DEFAULT 'estimated-projected',
    verified_views_counted INTEGER NOT NULL DEFAULT 0,
    effective_cpm_usd NUMERIC(8,2) NOT NULL,
    reference_code TEXT NOT NULL UNIQUE,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. ROW LEVEL SECURITY (RLS) HELPER FUNCTIONS

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = p_workspace_id
          AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(p_workspace_id UUID, p_roles member_role[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = p_workspace_id
          AND user_id = auth.uid()
          AND role = ANY(p_roles)
    );
$$;

-- 5. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- 6. POLICIES

-- Workspaces: visible to members
CREATE POLICY workspaces_member_read ON public.workspaces
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_members.workspace_id = workspaces.id
              AND workspace_members.user_id = auth.uid()
        )
    );

-- Workspace Members: visible to workspace members
CREATE POLICY workspace_members_read ON public.workspace_members
    FOR SELECT USING (
        public.is_workspace_member(workspace_id)
    );

-- Campaigns: members can read, admins/owners can insert/update
CREATE POLICY campaigns_member_read ON public.campaigns
    FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY campaigns_admin_write ON public.campaigns
    FOR ALL USING (public.has_workspace_role(workspace_id, ARRAY['owner'::member_role, 'admin'::member_role]));

-- Campaign Rules
CREATE POLICY campaign_rules_member_read ON public.campaign_rules
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = campaign_rules.campaign_id
              AND public.is_workspace_member(campaigns.workspace_id)
        )
    );

-- Source Assets: workspace members read/write
CREATE POLICY source_assets_member_read ON public.source_assets
    FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY source_assets_member_write ON public.source_assets
    FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY source_assets_member_update ON public.source_assets
    FOR UPDATE USING (public.is_workspace_member(workspace_id));

-- Clips: workspace members read/write
CREATE POLICY clips_member_read ON public.clips
    FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY clips_member_write ON public.clips
    FOR ALL USING (public.is_workspace_member(workspace_id));

-- Processing Jobs
CREATE POLICY jobs_member_read ON public.processing_jobs
    FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY jobs_member_write ON public.processing_jobs
    FOR ALL USING (public.is_workspace_member(workspace_id));

-- Approvals
CREATE POLICY approvals_member_read ON public.approvals
    FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY approvals_reviewer_write ON public.approvals
    FOR INSERT WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner'::member_role, 'admin'::member_role, 'reviewer'::member_role])
    );

-- Publications
CREATE POLICY publications_member_read ON public.publications
    FOR SELECT USING (public.is_workspace_member(workspace_id));

-- Payouts
CREATE POLICY payouts_member_read ON public.payouts
    FOR SELECT USING (public.is_workspace_member(workspace_id));

-- 7. STORAGE BUCKET CONFIGURATION (Supabase Storage)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('raw-sources', 'raw-sources', false, 1073741824, ARRAY['video/mp4', 'video/quicktime', 'video/webm']),
    ('rendered-clips', 'rendered-clips', false, 524288000, ARRAY['video/mp4'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Strict workspace tenant isolation
-- Files must be stored with workspace path prefix: <bucket_id>/<workspace_id>/<file>
DROP POLICY IF EXISTS storage_raw_sources_access ON storage.objects;
CREATE POLICY storage_raw_sources_access ON storage.objects
    FOR ALL USING (
        bucket_id = 'raw-sources' 
        AND auth.role() = 'authenticated'
        AND (
            (storage.foldername(name))[1] IN (
                SELECT workspace_id::text FROM public.workspace_members WHERE user_id = auth.uid()::text
            )
            OR (storage.foldername(name))[1] IN (
                SELECT id::text FROM public.workspaces WHERE id IN (
                    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()::text
                )
            )
        )
    );

DROP POLICY IF EXISTS storage_rendered_clips_access ON storage.objects;
CREATE POLICY storage_rendered_clips_access ON storage.objects
    FOR ALL USING (
        bucket_id = 'rendered-clips' 
        AND auth.role() = 'authenticated'
        AND (
            (storage.foldername(name))[1] IN (
                SELECT workspace_id::text FROM public.workspace_members WHERE user_id = auth.uid()::text
            )
            OR (storage.foldername(name))[1] IN (
                SELECT id::text FROM public.workspaces WHERE id IN (
                    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()::text
                )
            )
        )
    );
