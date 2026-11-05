-- Argon High — Production PostgreSQL Schema & Supabase Migrations
-- Migration: 002_production_parity_and_rls.sql
-- Complete Operational Parity with SQLite Schema and Verified Row Level Security (RLS)

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.current_user_workspaces()
RETURNS SETOF TEXT AS $$
    SELECT workspace_id::TEXT
    FROM public.workspace_members
    WHERE user_id = auth.uid()::TEXT;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. CORE TABLES

-- Workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    tier TEXT NOT NULL DEFAULT 'private_beta',
    compute_credits_balance INTEGER NOT NULL DEFAULT 50000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workspace Members
CREATE TABLE IF NOT EXISTS public.workspace_members (
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

-- Campaigns
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

-- Processing Jobs
CREATE TABLE IF NOT EXISTS public.processing_jobs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    clip_id TEXT,
    source_asset_id TEXT NOT NULL,
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
    completed_at TIMESTAMPTZ
);

-- Guard Reports (Argon Guard V2 Pre-flight Validation)
CREATE TABLE IF NOT EXISTS public.guard_reports (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    job_id TEXT NOT NULL,
    clip_id TEXT,
    campaign_id TEXT,
    overall_status TEXT NOT NULL,
    is_export_ready BOOLEAN NOT NULL DEFAULT FALSE,
    summary TEXT NOT NULL,
    checks_json JSONB NOT NULL,
    passed_count INTEGER NOT NULL,
    failed_count INTEGER NOT NULL,
    warning_count INTEGER NOT NULL,
    unknown_count INTEGER NOT NULL,
    review_required_count INTEGER NOT NULL,
    validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approvals
CREATE TABLE IF NOT EXISTS public.approvals (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    clip_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    reviewer_id TEXT NOT NULL,
    reviewer_name TEXT NOT NULL,
    notes TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Publications
CREATE TABLE IF NOT EXISTS public.publications (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    clip_id TEXT NOT NULL,
    campaign_id TEXT,
    platform TEXT NOT NULL,
    publication_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published',
    platform_post_id TEXT,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Snapshots (4-Tier Revenue Ledger)
CREATE TABLE IF NOT EXISTS public.performance_snapshots (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    publication_id TEXT NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
    clip_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    views_count INTEGER NOT NULL DEFAULT 0,
    verified_views_count INTEGER NOT NULL DEFAULT 0,
    cpm_usd NUMERIC(8,2) NOT NULL,
    payout_cap_usd NUMERIC(10,2) NOT NULL,
    estimated_revenue_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    reported_revenue_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    confirmed_payable_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    actually_received_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    verified_payout_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    platform_fees_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    production_cost_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    net_profit_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    production_hours NUMERIC(6,2),
    earnings_per_hour_usd NUMERIC(8,2),
    reconciled BOOLEAN NOT NULL DEFAULT FALSE,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

-- Payouts (Bank Disbursements & Payment Receipts)
CREATE TABLE IF NOT EXISTS public.payouts (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL,
    clip_id TEXT,
    publication_id TEXT,
    amount_usd NUMERIC(10,2) NOT NULL,
    effective_cpm_usd NUMERIC(8,2) NOT NULL,
    verified_views_counted INTEGER NOT NULL DEFAULT 0,
    verification_state TEXT NOT NULL DEFAULT 'accrued-unsettled',
    reference_code TEXT NOT NULL,
    payment_voucher_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    disbursed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS on every tenant table
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies with Tenant Isolation

-- Workspaces Policy
DROP POLICY IF EXISTS "workspaces_member_access" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_tenant_isolation" ON public.workspaces;
CREATE POLICY "workspaces_tenant_isolation" ON public.workspaces
    FOR ALL USING (id IN (SELECT public.current_user_workspaces()));

-- Workspace Members Policy
DROP POLICY IF EXISTS "workspace_members_access" ON public.workspace_members;
CREATE POLICY "workspace_members_access" ON public.workspace_members
    FOR ALL USING (workspace_id IN (SELECT public.current_user_workspaces()));

-- Campaigns Policy
DROP POLICY IF EXISTS "campaigns_tenant_isolation" ON public.campaigns;
CREATE POLICY "campaigns_tenant_isolation" ON public.campaigns
    FOR ALL USING (workspace_id IN (SELECT public.current_user_workspaces()));

-- Campaign Rules Policy
DROP POLICY IF EXISTS "campaign_rules_tenant_isolation" ON public.campaign_rules;
CREATE POLICY "campaign_rules_tenant_isolation" ON public.campaign_rules
    FOR ALL USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE workspace_id IN (SELECT public.current_user_workspaces())
        )
    );

-- Source Assets Policy
DROP POLICY IF EXISTS "source_assets_tenant_isolation" ON public.source_assets;
CREATE POLICY "source_assets_tenant_isolation" ON public.source_assets
    FOR ALL USING (workspace_id IN (SELECT public.current_user_workspaces()));

-- Clips Policy
DROP POLICY IF EXISTS "clips_tenant_isolation" ON public.clips;
CREATE POLICY "clips_tenant_isolation" ON public.clips
    FOR ALL USING (workspace_id IN (SELECT public.current_user_workspaces()));

-- Processing Jobs Policy
DROP POLICY IF EXISTS "processing_jobs_tenant_isolation" ON public.processing_jobs;
CREATE POLICY "processing_jobs_tenant_isolation" ON public.processing_jobs
    FOR ALL USING (workspace_id IN (SELECT public.current_user_workspaces()));

-- Guard Reports Policy
DROP POLICY IF EXISTS "guard_reports_tenant_isolation" ON public.guard_reports;
CREATE POLICY "guard_reports_tenant_isolation" ON public.guard_reports
    FOR ALL USING (workspace_id IN (SELECT public.current_user_workspaces()));

-- Approvals Policy
DROP POLICY IF EXISTS "approvals_tenant_isolation" ON public.approvals;
CREATE POLICY "approvals_tenant_isolation" ON public.approvals
    FOR ALL USING (workspace_id IN (SELECT public.current_user_workspaces()));

-- Publications Policy
DROP POLICY IF EXISTS "publications_tenant_isolation" ON public.publications;
CREATE POLICY "publications_tenant_isolation" ON public.publications
    FOR ALL USING (workspace_id IN (SELECT public.current_user_workspaces()));

-- Performance Snapshots Policy
DROP POLICY IF EXISTS "performance_snapshots_tenant_isolation" ON public.performance_snapshots;
CREATE POLICY "performance_snapshots_tenant_isolation" ON public.performance_snapshots
    FOR ALL USING (workspace_id IN (SELECT public.current_user_workspaces()));

-- Payouts Policy
DROP POLICY IF EXISTS "payouts_tenant_isolation" ON public.payouts;
CREATE POLICY "payouts_tenant_isolation" ON public.payouts
    FOR ALL USING (workspace_id IN (SELECT public.current_user_workspaces()));

-- 5. SUPABASE STORAGE TENANT ISOLATION
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('raw-sources', 'raw-sources', false, 1073741824, ARRAY['video/mp4', 'video/quicktime', 'video/webm']),
    ('rendered-clips', 'rendered-clips', false, 524288000, ARRAY['video/mp4'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "storage_raw_sources_isolated_access" ON storage.objects;
CREATE POLICY "storage_raw_sources_isolated_access" ON storage.objects
    FOR ALL USING (
        bucket_id = 'raw-sources' 
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] IN (SELECT public.current_user_workspaces())
    );

DROP POLICY IF EXISTS "storage_rendered_clips_isolated_access" ON storage.objects;
CREATE POLICY "storage_rendered_clips_isolated_access" ON storage.objects
    FOR ALL USING (
        bucket_id = 'rendered-clips' 
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] IN (SELECT public.current_user_workspaces())
    );
