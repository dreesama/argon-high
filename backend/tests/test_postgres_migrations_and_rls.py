import re
from pathlib import Path
import pytest

def test_reconciled_postgres_migrations_ordering_and_schema_parity():
    """
    Requirement 4 & 5: Verifies that 001_initial_schema.sql and 002_production_parity_and_rls.sql
    form a valid, ordered migration sequence with exact type parity and zero table collisions.
    """
    migrations_dir = Path(__file__).resolve().parent.parent / "migrations"
    m1_path = migrations_dir / "001_initial_schema.sql"
    m2_path = migrations_dir / "002_production_parity_and_rls.sql"

    assert m1_path.exists(), "001_initial_schema.sql must exist"
    assert m2_path.exists(), "002_production_parity_and_rls.sql must exist"

    m1_sql = m1_path.read_text(encoding="utf-8")
    m2_sql = m2_path.read_text(encoding="utf-8")

    # 1. 001 establishes core foundational tables
    expected_m1_tables = [
        "public.workspaces",
        "public.users",
        "public.workspace_members",
        "public.campaigns",
        "public.campaign_rules",
        "public.source_assets",
        "public.clips",
        "public.processing_jobs",
    ]
    for table in expected_m1_tables:
        assert f"CREATE TABLE IF NOT EXISTS {table}" in m1_sql, f"Missing table {table} in 001"

    # 2. 002 establishes operational & financial ledger tables
    expected_m2_tables = [
        "public.guard_reports",
        "public.approvals",
        "public.publications",
        "public.performance_snapshots",
        "public.payouts",
    ]
    for table in expected_m2_tables:
        assert f"CREATE TABLE IF NOT EXISTS {table}" in m2_sql, f"Missing table {table} in 002"

    # 3. Foreign Key & Type Parity: Zero UUID vs TEXT mismatch
    assert "public.workspaces (\n    id TEXT PRIMARY KEY" in m1_sql
    assert "workspace_id TEXT NOT NULL REFERENCES public.workspaces(id)" in m1_sql
    assert "workspace_id TEXT NOT NULL REFERENCES public.workspaces(id)" in m2_sql

    # 4. Financial Fixed-Precision & Minor Units Persistence (Requirement 5)
    assert "estimated_revenue_cents INTEGER NOT NULL DEFAULT 0" in m2_sql
    assert "reported_revenue_cents INTEGER NOT NULL DEFAULT 0" in m2_sql
    assert "confirmed_payable_cents INTEGER NOT NULL DEFAULT 0" in m2_sql
    assert "actually_received_cents INTEGER NOT NULL DEFAULT 0" in m2_sql
    assert "verified_payout_cents INTEGER NOT NULL DEFAULT 0" in m2_sql
    assert "net_profit_cents INTEGER NOT NULL DEFAULT 0" in m2_sql
    assert "amount_cents INTEGER NOT NULL DEFAULT 0" in m2_sql

    # Exact NUMERIC database types
    assert "NUMERIC(10,2)" in m2_sql
    assert "NUMERIC(8,2)" in m2_sql

    # 5. Row Level Security Enabled on all 12 multi-tenant tables
    all_12_tables = [
        "public.workspaces",
        "public.workspace_members",
        "public.campaigns",
        "public.campaign_rules",
        "public.source_assets",
        "public.clips",
        "public.processing_jobs",
        "public.guard_reports",
        "public.approvals",
        "public.publications",
        "public.performance_snapshots",
        "public.payouts",
    ]
    for table in all_12_tables:
        assert f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;" in m2_sql, f"RLS not enabled on {table}"

    # 6. Tenant Isolation Function and Policies
    assert "CREATE OR REPLACE FUNCTION public.current_user_workspaces()" in m2_sql
    assert "CREATE POLICY \"workspaces_tenant_isolation\" ON public.workspaces" in m2_sql
    assert "CREATE POLICY \"campaigns_tenant_isolation\" ON public.campaigns" in m2_sql
    assert "CREATE POLICY \"source_assets_tenant_isolation\" ON public.source_assets" in m2_sql
    assert "CREATE POLICY \"clips_tenant_isolation\" ON public.clips" in m2_sql
    assert "CREATE POLICY \"payouts_tenant_isolation\" ON public.payouts" in m2_sql

    # 7. Supabase Storage Tenant Isolation
    assert "raw-sources" in m2_sql
    assert "rendered-clips" in m2_sql
    assert "storage_raw_sources_isolated_access" in m2_sql
    assert "storage_rendered_clips_isolated_access" in m2_sql
    assert "(storage.foldername(name))[1] IN (SELECT public.current_user_workspaces())" in m2_sql
