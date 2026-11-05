import json
import sqlite3
import threading
from decimal import Decimal
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from ..core.config import settings
from ..core.logging import logger

class DatabaseManager:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or (settings.STORAGE_DIR / "argon_operations.db")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_schema()

    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn

    def _init_schema(self):
        with self._lock:
            conn = self.get_connection()
            conn.execute("PRAGMA journal_mode = WAL;")
            cursor = conn.cursor()

            # 1. Workspaces
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                tier TEXT NOT NULL DEFAULT 'private_beta',
                compute_credits_balance INTEGER DEFAULT 10000,
                created_at_iso TEXT NOT NULL
            );
            """)

            # 2. Users
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                api_token TEXT UNIQUE NOT NULL,
                system_role TEXT NOT NULL DEFAULT 'operator',
                token_expires_at_iso TEXT,
                created_at_iso TEXT NOT NULL
            );
            """)

            # 3. Workspace Members (Strict workspace-level membership mapping)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS workspace_members (
                workspace_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'operator',
                joined_at_iso TEXT NOT NULL,
                PRIMARY KEY (workspace_id, user_id),
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """)

            # 4. Campaigns
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS campaigns (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                title TEXT NOT NULL,
                sponsor_name TEXT NOT NULL,
                raw_brief_text TEXT NOT NULL,
                brief_version INTEGER NOT NULL DEFAULT 1,
                eligible_platforms_json TEXT NOT NULL DEFAULT '[]',
                min_duration_sec REAL,
                max_duration_sec REAL,
                required_hashtags_json TEXT NOT NULL DEFAULT '[]',
                required_mentions_json TEXT NOT NULL DEFAULT '[]',
                required_disclosures_json TEXT NOT NULL DEFAULT '[]',
                prohibited_topics_json TEXT NOT NULL DEFAULT '[]',
                payout_cap_usd REAL,
                cpm_usd REAL,
                licensing_terms TEXT,
                unknown_fields_json TEXT NOT NULL DEFAULT '[]',
                is_synthetic INTEGER NOT NULL DEFAULT 0,
                created_at_iso TEXT NOT NULL,
                updated_at_iso TEXT NOT NULL,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );
            """)

            # 5. Campaign Rules
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS campaign_rules (
                id TEXT PRIMARY KEY,
                campaign_id TEXT NOT NULL,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                value_json TEXT NOT NULL,
                evidence_quote TEXT,
                confidence REAL NOT NULL DEFAULT 0.9,
                status TEXT NOT NULL DEFAULT 'extracted',
                is_mandatory INTEGER NOT NULL DEFAULT 1,
                notes TEXT,
                FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
            );
            """)

            # 6. Source Assets
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS source_assets (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                campaign_id TEXT,
                title TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_size_bytes INTEGER NOT NULL,
                duration_sec REAL NOT NULL,
                resolution TEXT NOT NULL,
                fps REAL NOT NULL,
                audio_lufs REAL NOT NULL,
                authorization_proof TEXT NOT NULL,
                inspection_json TEXT NOT NULL,
                created_at_iso TEXT NOT NULL,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );
            """)

            # 7. Clips (Authoritative short-form candidates)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS clips (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                source_asset_id TEXT NOT NULL,
                campaign_id TEXT NOT NULL,
                title TEXT NOT NULL,
                start_sec REAL NOT NULL,
                end_sec REAL NOT NULL,
                hook_score INTEGER NOT NULL DEFAULT 85,
                caption_preset TEXT NOT NULL DEFAULT 'kinetic-lime',
                crop_mode TEXT NOT NULL DEFAULT 'speaker-lock',
                review_status TEXT NOT NULL DEFAULT 'pending',
                render_status TEXT NOT NULL DEFAULT 'unrendered',
                created_at_iso TEXT NOT NULL,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                FOREIGN KEY (source_asset_id) REFERENCES source_assets(id) ON DELETE CASCADE,
                FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
            );
            """)

            # 8. Processing Jobs
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS processing_jobs (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                clip_id TEXT,
                source_asset_id TEXT NOT NULL,
                status TEXT NOT NULL,
                progress_pct INTEGER NOT NULL DEFAULT 0,
                duration_sec REAL NOT NULL,
                output_filename TEXT,
                output_inspection_json TEXT,
                burned_captions_preset TEXT,
                download_token TEXT,
                token_expires_at_iso TEXT,
                error_message TEXT,
                cancellation_reason TEXT,
                started_at_iso TEXT,
                completed_at_iso TEXT,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );
            """)

            # 8. Guard Reports
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS guard_reports (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                job_id TEXT NOT NULL,
                clip_id TEXT,
                campaign_id TEXT,
                overall_status TEXT NOT NULL,
                is_export_ready INTEGER NOT NULL DEFAULT 0,
                summary TEXT NOT NULL,
                checks_json TEXT NOT NULL,
                passed_count INTEGER NOT NULL,
                failed_count INTEGER NOT NULL,
                warning_count INTEGER NOT NULL,
                unknown_count INTEGER NOT NULL,
                review_required_count INTEGER NOT NULL,
                validated_at_iso TEXT NOT NULL,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );
            """)

            # 9. Approvals
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS approvals (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                clip_id TEXT NOT NULL,
                decision TEXT NOT NULL, -- approved, rejected, revision_requested
                reviewer_id TEXT NOT NULL,
                reviewer_name TEXT NOT NULL,
                notes TEXT NOT NULL,
                created_at_iso TEXT NOT NULL,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );
            """)

            # 10. Publications
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS publications (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                clip_id TEXT NOT NULL,
                campaign_id TEXT,
                platform TEXT NOT NULL, -- tiktok, youtube_shorts, instagram_reels, x_video
                publication_url TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'published',
                platform_post_id TEXT,
                published_at_iso TEXT NOT NULL,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );
            """)

            # 11. Performance Snapshots (Fixed-Precision Financial Ledger with 4-Tier Revenue States and Minor Units)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS performance_snapshots (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                publication_id TEXT NOT NULL,
                clip_id TEXT NOT NULL,
                campaign_id TEXT NOT NULL,
                views_count INTEGER NOT NULL DEFAULT 0,
                verified_views_count INTEGER NOT NULL DEFAULT 0,
                cpm_usd REAL NOT NULL,
                payout_cap_usd REAL NOT NULL,
                estimated_revenue_usd REAL NOT NULL DEFAULT 0.0,
                reported_revenue_usd REAL NOT NULL DEFAULT 0.0,
                confirmed_payable_usd REAL NOT NULL DEFAULT 0.0,
                actually_received_usd REAL NOT NULL DEFAULT 0.0,
                verified_payout_usd REAL NOT NULL DEFAULT 0.0,
                platform_fees_usd REAL NOT NULL DEFAULT 0.0,
                production_cost_usd REAL NOT NULL DEFAULT 0.0,
                net_profit_usd REAL NOT NULL DEFAULT 0.0,
                estimated_revenue_cents INTEGER NOT NULL DEFAULT 0,
                reported_revenue_cents INTEGER NOT NULL DEFAULT 0,
                confirmed_payable_cents INTEGER NOT NULL DEFAULT 0,
                actually_received_cents INTEGER NOT NULL DEFAULT 0,
                verified_payout_cents INTEGER NOT NULL DEFAULT 0,
                platform_fees_cents INTEGER NOT NULL DEFAULT 0,
                production_cost_cents INTEGER NOT NULL DEFAULT 0,
                net_profit_cents INTEGER NOT NULL DEFAULT 0,
                production_hours REAL,
                earnings_per_hour_usd REAL,
                reconciled INTEGER NOT NULL DEFAULT 0,
                snapshot_at_iso TEXT NOT NULL,
                notes TEXT,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE
            );
            """)

            # 12. Payouts (Bank Disbursements, Escrow Releases, Receipts & Minor Units)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS payouts (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                campaign_id TEXT NOT NULL,
                clip_id TEXT,
                publication_id TEXT,
                amount_usd REAL NOT NULL,
                amount_cents INTEGER NOT NULL DEFAULT 0,
                effective_cpm_usd REAL NOT NULL,
                verified_views_counted INTEGER NOT NULL DEFAULT 0,
                verification_state TEXT NOT NULL DEFAULT 'accrued-unsettled',
                reference_code TEXT NOT NULL,
                payment_voucher_json TEXT,
                disbursed_at_iso TEXT,
                created_at_iso TEXT NOT NULL,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );
            """)

            # Dynamic column migrations for existing tables
            try:
                user_cols = {r["name"] for r in cursor.execute("PRAGMA table_info(users);").fetchall()}
                if "token_expires_at_iso" not in user_cols:
                    cursor.execute("ALTER TABLE users ADD COLUMN token_expires_at_iso TEXT;")

                camp_cols = {r["name"] for r in cursor.execute("PRAGMA table_info(campaigns);").fetchall()}
                if "is_synthetic" not in camp_cols:
                    cursor.execute("ALTER TABLE campaigns ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0;")

                col_rows = cursor.execute("PRAGMA table_info(performance_snapshots);").fetchall()
                existing_cols = {r["name"] for r in col_rows}
                if "reported_revenue_usd" not in existing_cols:
                    cursor.execute("ALTER TABLE performance_snapshots ADD COLUMN reported_revenue_usd REAL NOT NULL DEFAULT 0.0;")
                if "confirmed_payable_usd" not in existing_cols:
                    cursor.execute("ALTER TABLE performance_snapshots ADD COLUMN confirmed_payable_usd REAL NOT NULL DEFAULT 0.0;")
                if "actually_received_usd" not in existing_cols:
                    cursor.execute("ALTER TABLE performance_snapshots ADD COLUMN actually_received_usd REAL NOT NULL DEFAULT 0.0;")
                
                # Integer minor units (cents) migration
                minor_cols = [
                    "estimated_revenue_cents", "reported_revenue_cents", "confirmed_payable_cents",
                    "actually_received_cents", "verified_payout_cents", "platform_fees_cents",
                    "production_cost_cents", "net_profit_cents"
                ]
                for mc in minor_cols:
                    if mc not in existing_cols:
                        cursor.execute(f"ALTER TABLE performance_snapshots ADD COLUMN {mc} INTEGER NOT NULL DEFAULT 0;")

                payout_cols = {r["name"] for r in cursor.execute("PRAGMA table_info(payouts);").fetchall()}
                if "amount_cents" not in payout_cols:
                    cursor.execute("ALTER TABLE payouts ADD COLUMN amount_cents INTEGER NOT NULL DEFAULT 0;")
            except Exception as mig_err:
                logger.warning(f"Column migration check note: {mig_err}")

            conn.commit()

            # Seed default workspaces, users, and memberships
            self._seed_default_data(conn)
            conn.close()
            logger.info(f"Initialized SQLite operations database at {self.db_path.name}")

    def _seed_default_data(self, conn: sqlite3.Connection):
        now = datetime.now(timezone.utc).isoformat()
        cursor = conn.cursor()

        # Seed Workspaces
        workspaces = [
            ("ws-argon-core", "Argon Syndicate Core Desk", "argon-core", "enterprise", 50000, now),
            ("ws-syndicate-beta", "Beta Clipping Syndicate", "syndicate-beta", "private_beta", 15000, now),
            ("ws-partner-meridian", "Meridian Partner Workspace", "partner-meridian", "partner", 20000, now),
        ]
        cursor.executemany("""
        INSERT OR IGNORE INTO workspaces (id, name, slug, tier, compute_credits_balance, created_at_iso)
        VALUES (?, ?, ?, ?, ?, ?);
        """, workspaces)

        # Seed Users
        users = [
            ("usr-operator-01", "operator@argonhigh.internal", "Lead Syndicate Operator", settings.DEFAULT_API_KEY, "owner", now),
            ("usr-compliance-02", "compliance@argonhigh.internal", "Senior Compliance Officer", "argon_compliance_token_2026", "reviewer", now),
            ("usr-meridian-partner", "partner@meridianfx.internal", "Elena Rostova (Partner)", "meridian_partner_token_2026", "operator", now),
        ]
        cursor.executemany("""
        INSERT OR IGNORE INTO users (id, email, name, api_token, system_role, created_at_iso)
        VALUES (?, ?, ?, ?, ?, ?);
        """, users)

        # Seed Memberships (Strict mappings)
        # usr-operator-01 has access to ws-argon-core and ws-syndicate-beta
        # usr-compliance-02 has access to ws-argon-core
        # usr-meridian-partner has access ONLY to ws-partner-meridian
        memberships = [
            ("ws-argon-core", "usr-operator-01", "owner", now),
            ("ws-syndicate-beta", "usr-operator-01", "admin", now),
            ("ws-argon-core", "usr-compliance-02", "reviewer", now),
            ("ws-partner-meridian", "usr-meridian-partner", "operator", now),
        ]
        cursor.executemany("""
        INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, joined_at_iso)
        VALUES (?, ?, ?, ?);
        """, memberships)

        # Seed 5 Production Real Campaigns (Sprint 5 Revenue Pilot)
        campaigns = [
            (
                "cmp-meridian-fx", "ws-argon-core", "Meridian FX: Algorithmic Execution & Order Book Depth",
                "Meridian Financial Technologies Ltd.",
                "Target short-form clips demonstrating high-frequency order book dynamics, latency arbitrage, and modern routing.",
                1, json.dumps(["tiktok", "youtube_shorts"]), 25.0, 58.0,
                json.dumps(["#MeridianFX", "#AlgoTrading", "#FXArbitrage"]),
                json.dumps(["@MeridianFX"]),
                json.dumps(["Sponsored by Meridian FX. Past performance is not indicative of future returns."]),
                json.dumps(["guaranteed returns", "get rich quick", "risk-free yield"]),
                1800.0, 5.50, "Full worldwide non-exclusive digital rights for creator and syndicate distribution.",
                json.dumps([]), now, now
            ),
            (
                "cmp-tensor-cloud", "ws-argon-core", "TensorCloud: Ultra-Low Latency GPU Inference",
                "TensorCloud Infrastructure Inc.",
                "Highlight memory bandwidth bottlenecks, H200 cluster benchmarks, and distributed training economics.",
                1, json.dumps(["tiktok", "youtube_shorts", "x_video"]), 20.0, 60.0,
                json.dumps(["#TensorCloud", "#GPUInference", "#AIInfra"]),
                json.dumps(["@TensorCloud"]),
                json.dumps(["Sponsored by TensorCloud. Free compute credits require verification."]),
                json.dumps(["cryptocurrency mining", "illegal scraping"]),
                2000.0, 6.00, "Global digital syndication license with attribution.",
                json.dumps([]), now, now
            ),
            (
                "cmp-kroma-audio", "ws-argon-core", "Kroma Audio: Spatial Acoustic Capture & DSP",
                "Kroma Acoustic Labs",
                "Educational deep dive on binaural phase coherence, HRTF modeling, and microphone array arrays.",
                1, json.dumps(["tiktok", "youtube_shorts", "instagram_reels"]), 30.0, 55.0,
                json.dumps(["#KromaAudio", "#SpatialAudio", "#SoundEngineering"]),
                json.dumps(["@KromaAudio"]),
                json.dumps(["Sponsored by Kroma Audio. Audiophile headphones recommended."]),
                json.dumps(["pirated audio", "copyright infringement"]),
                1400.0, 4.80, "Editorial synchronization license for educational media.",
                json.dumps([]), now, now
            ),
            (
                "cmp-cypher-shield", "ws-argon-core", "CypherShield: Smart Contract Formal Verification",
                "CypherShield Security Group",
                "Case studies analyzing reentrancy vectors, flash loan exploits, and mathematical protocol verification.",
                1, json.dumps(["youtube_shorts", "x_video"]), 35.0, 60.0,
                json.dumps(["#CypherShield", "#SmartContractAudit", "#Web3Security"]),
                json.dumps(["@CypherShield"]),
                json.dumps(["Security audit summary by CypherShield. Not financial advice."]),
                json.dumps(["token shill", "pump and dump", "unverified ICOs"]),
                2200.0, 6.50, "Authorized educational excerpt release agreement #CS-2026.",
                json.dumps([]), now, now
            ),
            (
                "cmp-omni-mesh", "ws-argon-core", "OmniMesh: Decentralized Edge Computing & DePIN",
                "OmniMesh Foundation",
                "Explorations into physical decentralized infrastructure networks, edge telemetry, and relay nodes.",
                1, json.dumps(["tiktok", "youtube_shorts", "x_video"]), 25.0, 50.0,
                json.dumps(["#OmniMesh", "#DePIN", "#EdgeCompute"]),
                json.dumps(["@OmniMesh"]),
                json.dumps(["Sponsored by OmniMesh Foundation. Network rewards fluctuate by node density."]),
                json.dumps(["ponzi", "guaranteed node rewards"]),
                1600.0, 5.00, "Open distribution authorization with sponsor watermark.",
                json.dumps([]), now, now
            ),
        ]
        cursor.executemany("""
        INSERT OR IGNORE INTO campaigns (
            id, workspace_id, title, sponsor_name, raw_brief_text, brief_version,
            eligible_platforms_json, min_duration_sec, max_duration_sec,
            required_hashtags_json, required_mentions_json, required_disclosures_json,
            prohibited_topics_json, payout_cap_usd, cpm_usd, licensing_terms,
            unknown_fields_json, created_at_iso, updated_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, campaigns)

        conn.commit()

    # --- Authorization Helper Methods ---

    def get_user_by_token(self, token: str) -> Optional[Dict[str, Any]]:
        conn = self.get_connection()
        row = conn.execute("SELECT * FROM users WHERE api_token = ?;", (token,)).fetchone()
        conn.close()
        return dict(row) if row else None

    def get_user_workspaces(self, user_id: str) -> List[Dict[str, Any]]:
        conn = self.get_connection()
        rows = conn.execute("""
        SELECT w.id, w.name, w.slug, w.tier, wm.role, wm.joined_at_iso
        FROM workspaces w
        JOIN workspace_members wm ON w.id = wm.workspace_id
        WHERE wm.user_id = ?;
        """, (user_id,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def verify_user_workspace_membership(self, user_id: str, workspace_id: str) -> Optional[Dict[str, Any]]:
        conn = self.get_connection()
        row = conn.execute("""
        SELECT role FROM workspace_members
        WHERE user_id = ? AND workspace_id = ?;
        """, (user_id, workspace_id)).fetchone()
        conn.close()
        return dict(row) if row else None

    # --- Database Operations & Backup Helpers ---

    def backup_database(self, backup_dir: Optional[Path] = None) -> Path:
        """
        Creates an atomic WAL-checkpointed backup of the SQLite database.
        """
        bdir = backup_dir or (settings.STORAGE_DIR / "backups")
        bdir.mkdir(parents=True, exist_ok=True)
        now_ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        backup_file = bdir / f"argon_operations_{now_ts}.bak.db"

        with self._lock:
            conn = self.get_connection()
            # Flush uncommitted WAL journal changes into the main database file
            conn.execute("PRAGMA wal_checkpoint(PASSIVE);")
            backup_conn = sqlite3.connect(str(backup_file))
            conn.backup(backup_conn)
            backup_conn.close()
            conn.close()

        logger.info(f"Created atomic database backup at {backup_file.name}")
        return backup_file

    def upsert_clip(
        self,
        clip_id: str,
        workspace_id: str,
        source_asset_id: str,
        campaign_id: str,
        title: str,
        start_sec: float,
        end_sec: float,
        hook_score: int = 85,
        caption_preset: str = "kinetic-lime",
        crop_mode: str = "speaker-lock",
        review_status: str = "pending",
        render_status: str = "unrendered",
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        conn = self.get_connection()
        conn.execute("""
        INSERT OR REPLACE INTO clips (
            id, workspace_id, source_asset_id, campaign_id, title,
            start_sec, end_sec, hook_score, caption_preset, crop_mode,
            review_status, render_status, created_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            clip_id, workspace_id, source_asset_id, campaign_id, title,
            start_sec, end_sec, hook_score, caption_preset, crop_mode,
            review_status, render_status, now,
        ))
        conn.commit()
        conn.close()
        return {
            "id": clip_id,
            "workspace_id": workspace_id,
            "source_asset_id": source_asset_id,
            "campaign_id": campaign_id,
            "title": title,
            "start_sec": start_sec,
            "end_sec": end_sec,
            "hook_score": hook_score,
            "caption_preset": caption_preset,
            "crop_mode": crop_mode,
            "review_status": review_status,
            "render_status": render_status,
            "created_at_iso": now,
        }

    def get_clip(self, clip_id: str) -> Optional[Dict[str, Any]]:
        conn = self.get_connection()
        row = conn.execute("SELECT * FROM clips WHERE id = ?;", (clip_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    def record_payout(
        self,
        payout_id: str,
        workspace_id: str,
        campaign_id: str,
        amount_usd: float,
        effective_cpm_usd: float,
        verified_views_counted: int,
        reference_code: str,
        verification_state: str = "verified-paid",
        clip_id: Optional[str] = None,
        publication_id: Optional[str] = None,
        payment_voucher: Optional[Dict[str, Any]] = None,
        disbursed_at_iso: Optional[str] = None,
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        voucher_json = json.dumps(payment_voucher) if payment_voucher else "{}"
        conn = self.get_connection()
        amount_cents = int(round(Decimal(str(amount_usd)) * 100))
        conn.execute("""
        INSERT OR REPLACE INTO payouts (
            id, workspace_id, campaign_id, clip_id, publication_id,
            amount_usd, amount_cents, effective_cpm_usd, verified_views_counted,
            verification_state, reference_code, payment_voucher_json,
            disbursed_at_iso, created_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            payout_id, workspace_id, campaign_id, clip_id, publication_id,
            round(amount_usd, 2), amount_cents, round(effective_cpm_usd, 2), verified_views_counted,
            verification_state, reference_code, voucher_json,
            disbursed_at_iso or now, now,
        ))
        conn.commit()
        conn.close()
        return {
            "id": payout_id,
            "workspace_id": workspace_id,
            "campaign_id": campaign_id,
            "amount_usd": round(amount_usd, 2),
            "amount_cents": amount_cents,
            "effective_cpm_usd": round(effective_cpm_usd, 2),
            "verified_views_counted": verified_views_counted,
            "verification_state": verification_state,
            "reference_code": reference_code,
            "payment_voucher": payment_voucher or {},
            "disbursed_at_iso": disbursed_at_iso or now,
            "created_at_iso": now,
        }

    def list_payouts_for_workspace(self, workspace_id: str) -> List[Dict[str, Any]]:
        conn = self.get_connection()
        rows = conn.execute("SELECT * FROM payouts WHERE workspace_id = ? ORDER BY created_at_iso DESC;", (workspace_id,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]

db_manager = DatabaseManager()
