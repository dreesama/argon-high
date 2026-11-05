import uuid
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from ..core.logging import logger
from ..db.database import db_manager
from ..schemas.performance import (
    ApprovalCreateRequest,
    ApprovalRecordResponse,
    PublicationCreateRequest,
    PublicationRecordResponse,
    PerformanceSnapshotCreateRequest,
    PerformanceSnapshotResponse,
    PerformanceAggregatedSummary,
    PayoutCreateRequest,
    PayoutRecordResponse,
)

class PerformanceService:
    # --- Approvals ---
    def record_approval(self, req: ApprovalCreateRequest, user_id: str, user_name: str, workspace_id: str) -> ApprovalRecordResponse:
        app_id = f"app-{uuid.uuid4().hex[:10]}"
        now = datetime.now(timezone.utc).isoformat()

        conn = db_manager.get_connection()
        conn.execute("""
        INSERT INTO approvals (id, workspace_id, clip_id, decision, reviewer_id, reviewer_name, notes, created_at_iso)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, (app_id, workspace_id, req.clip_id, req.decision, user_id, user_name, req.notes, now))
        conn.commit()
        conn.close()

        logger.info(f"Recorded approval {app_id} on clip {req.clip_id}: decision='{req.decision}' by {user_name}")
        return ApprovalRecordResponse(
            id=app_id,
            workspace_id=workspace_id,
            clip_id=req.clip_id,
            decision=req.decision,
            reviewer_id=user_id,
            reviewer_name=user_name,
            notes=req.notes,
            created_at_iso=now,
        )

    def list_approvals_for_clip(self, clip_id: str, workspace_id: str) -> List[ApprovalRecordResponse]:
        conn = db_manager.get_connection()
        rows = conn.execute("""
        SELECT * FROM approvals WHERE clip_id = ? AND workspace_id = ? ORDER BY created_at_iso DESC;
        """, (clip_id, workspace_id)).fetchall()
        conn.close()
        return [ApprovalRecordResponse(**dict(r)) for r in rows]

    # --- Publications ---
    def record_publication(self, req: PublicationCreateRequest, workspace_id: str) -> PublicationRecordResponse:
        pub_id = f"pub-{uuid.uuid4().hex[:10]}"
        now = datetime.now(timezone.utc).isoformat()

        conn = db_manager.get_connection()
        conn.execute("""
        INSERT INTO publications (id, workspace_id, clip_id, campaign_id, platform, publication_url, status, platform_post_id, published_at_iso)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            pub_id,
            workspace_id,
            req.clip_id,
            req.campaign_id or "cmp-argon-flagship",
            req.platform,
            req.publication_url,
            "published",
            req.platform_post_id or f"post-{uuid.uuid4().hex[:8]}",
            now,
        ))
        conn.commit()
        conn.close()

        logger.info(f"Recorded publication {pub_id} on platform {req.platform}: URL={req.publication_url}")
        return PublicationRecordResponse(
            id=pub_id,
            workspace_id=workspace_id,
            clip_id=req.clip_id,
            campaign_id=req.campaign_id,
            platform=req.platform,
            publication_url=req.publication_url,
            status="published",
            platform_post_id=req.platform_post_id,
            published_at_iso=now,
        )

    def list_publications(self, workspace_id: str) -> List[PublicationRecordResponse]:
        conn = db_manager.get_connection()
        rows = conn.execute("""
        SELECT * FROM publications WHERE workspace_id = ? ORDER BY published_at_iso DESC;
        """, (workspace_id,)).fetchall()
        conn.close()
        return [PublicationRecordResponse(**dict(r)) for r in rows]

    # --- Financial Performance Snapshots (4-Tier Revenue States) ---
    def record_snapshot(self, req: PerformanceSnapshotCreateRequest, workspace_id: str) -> PerformanceSnapshotResponse:
        snap_id = f"snp-{uuid.uuid4().hex[:10]}"
        now = datetime.now(timezone.utc).isoformat()

        cpm = round(float(req.cpm_usd or 5.0), 2)
        cap = round(float(req.payout_cap_usd or 1500.0), 2)

        # 1. Tier 1: Estimated Revenue (Projected from all impressions)
        est_raw = (req.views_count / 1000.0) * cpm
        est_rev = round(min(cap, est_raw), 2)

        # 2. Tier 2: Operator-Reported Revenue (Dashboard claims before audit)
        rep_views = req.reported_views_count if req.reported_views_count is not None else req.views_count
        rep_rev = round(min(cap, (rep_views / 1000.0) * cpm), 2)

        # 3. Tier 3: Campaign-Confirmed Payable Revenue (Verified eligible views audited by sponsor)
        conf_views = req.confirmed_eligible_views_count if req.confirmed_eligible_views_count is not None else req.verified_views_count
        if req.reconciled or conf_views > 0:
            conf_raw = (conf_views / 1000.0) * cpm
            conf_payable = round(min(cap, conf_raw), 2)
        else:
            conf_payable = 0.0

        ver_payout = conf_payable

        # 4. Tier 4: Actually Received Payments (Settled in escrow/bank with voucher receipt)
        if req.actually_received_usd is not None:
            act_received = round(float(req.actually_received_usd), 2)
        elif req.reconciled:
            act_received = ver_payout
        else:
            act_received = 0.0

        # Fixed Precision Net Profit = Verified Payout - Fees - Production Cost
        fees = round(float(req.platform_fees_usd), 2)
        cost = round(float(req.production_cost_usd), 2)
        net_profit = round(ver_payout - fees - cost, 2)

        # Production Hours & Earnings Per Production Hour (Strict N/A when 0 or unavailable)
        if req.production_hours is not None and float(req.production_hours) > 0.0:
            hours = round(float(req.production_hours), 2)
            eph = round(net_profit / hours, 2)
            eph_display = f"${eph:.2f}/hr"
        else:
            hours = 0.0
            eph = None
            eph_display = "N/A"

        eph_db_val = eph if eph is not None else 0.0

        conn = db_manager.get_connection()

        # Ensure referenced publication exists to satisfy foreign key constraint
        if req.publication_id:
            pub_check = conn.execute("SELECT id FROM publications WHERE id = ?;", (req.publication_id,)).fetchone()
            if not pub_check:
                conn.execute("""
                INSERT OR IGNORE INTO publications (
                    id, workspace_id, clip_id, campaign_id, platform, publication_url, status, published_at_iso
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    req.publication_id, workspace_id, req.clip_id, req.campaign_id,
                    "external", f"https://syndicate.internal/pubs/{req.publication_id}", "tracked", now
                ))

        conn.execute("""
        INSERT INTO performance_snapshots (
            id, workspace_id, publication_id, clip_id, campaign_id,
            views_count, verified_views_count, cpm_usd, payout_cap_usd,
            estimated_revenue_usd, reported_revenue_usd, confirmed_payable_usd, actually_received_usd,
            verified_payout_usd, platform_fees_usd, production_cost_usd, net_profit_usd,
            production_hours, earnings_per_hour_usd, reconciled, snapshot_at_iso, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            snap_id, workspace_id, req.publication_id, req.clip_id, req.campaign_id,
            req.views_count, req.verified_views_count, cpm, cap,
            est_rev, rep_rev, conf_payable, act_received,
            ver_payout, fees, cost, net_profit,
            hours, eph_db_val, 1 if req.reconciled else 0, now, req.notes,
        ))
        conn.commit()
        conn.close()

        logger.info(f"Recorded performance snapshot {snap_id}: Views={req.views_count}, EstRev=${est_rev}, ConfPayable=${conf_payable}, Net=${net_profit}, EPH={eph_display}")
        return PerformanceSnapshotResponse(
            id=snap_id,
            workspace_id=workspace_id,
            publication_id=req.publication_id,
            clip_id=req.clip_id,
            campaign_id=req.campaign_id,
            views_count=req.views_count,
            reported_views_count=rep_views,
            verified_views_count=req.verified_views_count,
            confirmed_eligible_views_count=conf_views,
            cpm_usd=cpm,
            payout_cap_usd=cap,
            estimated_revenue_usd=est_rev,
            reported_revenue_usd=rep_rev,
            confirmed_payable_usd=conf_payable,
            actually_received_usd=act_received,
            verified_payout_usd=ver_payout,
            platform_fees_usd=fees,
            production_cost_usd=cost,
            net_profit_usd=net_profit,
            production_hours=hours,
            earnings_per_hour_usd=eph,
            earnings_per_hour_display=eph_display,
            reconciled=req.reconciled,
            snapshot_at_iso=now,
            notes=req.notes,
        )

    def list_snapshots(self, workspace_id: str) -> List[PerformanceSnapshotResponse]:
        conn = db_manager.get_connection()
        rows = conn.execute("""
        SELECT * FROM performance_snapshots WHERE workspace_id = ? ORDER BY snapshot_at_iso DESC;
        """, (workspace_id,)).fetchall()
        conn.close()
        results = []
        for r in rows:
            rd = dict(r)
            hours = rd.get("production_hours")
            eph = rd.get("earnings_per_hour_usd")
            eph_disp = f"${eph:.2f}/hr" if eph is not None and hours and hours > 0 else "N/A"
            results.append(
                PerformanceSnapshotResponse(
                    id=rd["id"],
                    workspace_id=rd["workspace_id"],
                    publication_id=rd["publication_id"],
                    clip_id=rd["clip_id"],
                    campaign_id=rd["campaign_id"],
                    views_count=rd["views_count"],
                    reported_views_count=rd.get("reported_revenue_usd", 0.0),
                    verified_views_count=rd["verified_views_count"],
                    confirmed_eligible_views_count=rd["verified_views_count"],
                    cpm_usd=rd["cpm_usd"],
                    payout_cap_usd=rd["payout_cap_usd"],
                    estimated_revenue_usd=rd["estimated_revenue_usd"],
                    reported_revenue_usd=rd.get("reported_revenue_usd", rd["estimated_revenue_usd"]),
                    confirmed_payable_usd=rd.get("confirmed_payable_usd", rd["verified_payout_usd"]),
                    actually_received_usd=rd.get("actually_received_usd", rd["verified_payout_usd"] if rd["reconciled"] else 0.0),
                    verified_payout_usd=rd["verified_payout_usd"],
                    platform_fees_usd=rd["platform_fees_usd"],
                    production_cost_usd=rd["production_cost_usd"],
                    net_profit_usd=rd["net_profit_usd"],
                    production_hours=hours,
                    earnings_per_hour_usd=eph,
                    earnings_per_hour_display=eph_disp,
                    reconciled=bool(rd["reconciled"]),
                    snapshot_at_iso=rd["snapshot_at_iso"],
                    notes=rd["notes"],
                )
            )
        return results

    def get_aggregated_summary(self, workspace_id: str) -> PerformanceAggregatedSummary:
        conn = db_manager.get_connection()
        cursor = conn.cursor()

        pub_count = cursor.execute("SELECT COUNT(*) FROM publications WHERE workspace_id = ?;", (workspace_id,)).fetchone()[0]

        row = cursor.execute("""
        SELECT 
            COUNT(*) as snapshot_count,
            COALESCE(SUM(views_count), 0) as total_views,
            COALESCE(SUM(verified_views_count), 0) as total_verified_views,
            COALESCE(SUM(estimated_revenue_usd), 0.0) as total_est_rev,
            COALESCE(SUM(reported_revenue_usd), 0.0) as total_rep_rev,
            COALESCE(SUM(confirmed_payable_usd), 0.0) as total_conf_rev,
            COALESCE(SUM(actually_received_usd), 0.0) as total_act_received,
            COALESCE(SUM(verified_payout_usd), 0.0) as total_ver_payout,
            COALESCE(SUM(platform_fees_usd), 0.0) as total_fees,
            COALESCE(SUM(production_cost_usd), 0.0) as total_costs,
            COALESCE(SUM(net_profit_usd), 0.0) as total_net_profit,
            COALESCE(AVG(cpm_usd), 0.0) as avg_cpm,
            COALESCE(SUM(production_hours), 0.0) as total_hours,
            COALESCE(SUM(reconciled), 0) as reconciled_count
        FROM performance_snapshots
        WHERE workspace_id = ?;
        """, (workspace_id,)).fetchone()
        conn.close()

        total_hours = round(float(row["total_hours"]), 2)
        total_net = round(float(row["total_net_profit"]), 2)
        if total_hours > 0.0:
            overall_eph = round(total_net / total_hours, 2)
            overall_eph_display = f"${overall_eph:.2f}/hr"
        else:
            overall_eph = None
            overall_eph_display = "N/A"

        snap_count = row["snapshot_count"]
        rec_count = row["reconciled_count"]
        if snap_count == 0:
            rec_status = "No performance data recorded yet"
        elif rec_count == snap_count:
            rec_status = "Fully reconciled with sponsor settlement ledgers"
        else:
            rec_status = f"{rec_count} of {snap_count} snapshots reconciled with verified escrow"

        return PerformanceAggregatedSummary(
            workspace_id=workspace_id,
            total_publications=pub_count,
            total_views=row["total_views"],
            total_reported_views=row["total_views"],
            total_verified_views=row["total_verified_views"],
            total_confirmed_eligible_views=row["total_verified_views"],
            total_estimated_revenue_usd=round(float(row["total_est_rev"]), 2),
            total_reported_revenue_usd=round(float(row["total_rep_rev"]), 2),
            total_confirmed_payable_usd=round(float(row["total_conf_rev"]), 2),
            total_actually_received_usd=round(float(row["total_act_received"]), 2),
            total_verified_payout_usd=round(float(row["total_ver_payout"]), 2),
            total_platform_fees_usd=round(float(row["total_fees"]), 2),
            total_production_cost_usd=round(float(row["total_costs"]), 2),
            total_net_profit_usd=total_net,
            average_cpm_usd=round(float(row["avg_cpm"]), 2),
            total_production_hours=total_hours,
            overall_earnings_per_hour_usd=overall_eph,
            overall_earnings_per_hour_display=overall_eph_display,
            reconciliation_status=rec_status,
        )

    # --- Payout Vouchers & Settlements ---
    def record_payout(self, req: PayoutCreateRequest, workspace_id: str) -> PayoutRecordResponse:
        pay_id = f"pay-{uuid.uuid4().hex[:10]}"
        result = db_manager.record_payout(
            payout_id=pay_id,
            workspace_id=workspace_id,
            campaign_id=req.campaign_id,
            amount_usd=req.amount_usd,
            effective_cpm_usd=req.effective_cpm_usd,
            verified_views_counted=req.verified_views_counted,
            reference_code=req.reference_code,
            verification_state=req.verification_state,
            clip_id=req.clip_id,
            publication_id=req.publication_id,
            payment_voucher=req.payment_voucher,
        )
        return PayoutRecordResponse(**result)

    def list_payouts(self, workspace_id: str) -> List[PayoutRecordResponse]:
        rows = db_manager.list_payouts_for_workspace(workspace_id)
        results = []
        for r in rows:
            voucher = json.loads(r["payment_voucher_json"]) if r.get("payment_voucher_json") else {}
            results.append(
                PayoutRecordResponse(
                    id=r["id"],
                    workspace_id=r["workspace_id"],
                    campaign_id=r["campaign_id"],
                    clip_id=r.get("clip_id"),
                    publication_id=r.get("publication_id"),
                    amount_usd=r["amount_usd"],
                    effective_cpm_usd=r["effective_cpm_usd"],
                    verified_views_counted=r["verified_views_counted"],
                    verification_state=r["verification_state"],
                    reference_code=r["reference_code"],
                    payment_voucher=voucher,
                    disbursed_at_iso=r.get("disbursed_at_iso", r["created_at_iso"]),
                    created_at_iso=r["created_at_iso"],
                )
            )
        return results

performance_service = PerformanceService()
