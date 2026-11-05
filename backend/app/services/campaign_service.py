import json
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

from ..core.config import settings
from ..core.logging import logger
from ..db.database import db_manager
from ..schemas.campaign import (
    CampaignBriefIngestRequest,
    CampaignRecord,
    CampaignRuleUpdateRequest,
    ExtractedRuleItem,
)

class CampaignService:
    def __init__(self, persistence_file: Optional[Path] = None):
        self.persistence_file = persistence_file or (settings.STORAGE_DIR / "campaigns_db.json")
        self._lock = threading.Lock()
        self._campaigns: Dict[str, CampaignRecord] = {}
        self._load_from_disk()

    def _load_from_disk(self):
        with self._lock:
            if self.persistence_file.exists():
                try:
                    data = json.loads(self.persistence_file.read_text(encoding="utf-8"))
                    for cid, cdict in data.items():
                        self._campaigns[cid] = CampaignRecord(**cdict)
                    logger.info(f"Loaded {len(self._campaigns)} campaigns from {self.persistence_file.name}")
                except Exception as e:
                    logger.error(f"Failed to load campaigns from {self.persistence_file}: {e}")
                    self._campaigns = {}
            else:
                self._campaigns = {}

            # Sync seeded/stored campaigns from SQLite
            try:
                conn = db_manager.get_connection()
                rows = conn.execute("SELECT * FROM campaigns;").fetchall()
                for r in rows:
                    cid = r["id"]
                    if cid not in self._campaigns:
                        rule_rows = conn.execute("SELECT * FROM campaign_rules WHERE campaign_id = ?;", (cid,)).fetchall()
                        extracted_rules = [
                            ExtractedRuleItem(
                                rule_id=rr["id"],
                                category=rr["category"],
                                title=rr["title"],
                                description=rr["description"],
                                value=json.loads(rr["value_json"]),
                                evidence_quote=rr["evidence_quote"],
                                confidence=rr["confidence"],
                                status=rr["status"],
                                is_mandatory=bool(rr["is_mandatory"]),
                                notes=rr["notes"],
                            ) for rr in rule_rows
                        ]
                        self._campaigns[cid] = CampaignRecord(
                            campaign_id=cid,
                            workspace_id=r["workspace_id"],
                            title=r["title"],
                            sponsor_name=r["sponsor_name"],
                            raw_brief_text=r["raw_brief_text"],
                            brief_version=r["brief_version"],
                            extracted_rules=extracted_rules,
                            eligible_platforms=json.loads(r["eligible_platforms_json"]),
                            min_duration_sec=r["min_duration_sec"],
                            max_duration_sec=r["max_duration_sec"],
                            required_hashtags=json.loads(r["required_hashtags_json"]),
                            required_mentions=json.loads(r["required_mentions_json"]),
                            required_disclosures=json.loads(r["required_disclosures_json"]),
                            prohibited_topics=json.loads(r["prohibited_topics_json"]),
                            payout_cap_usd=r["payout_cap_usd"],
                            cpm_usd=r["cpm_usd"],
                            licensing_terms=r["licensing_terms"],
                            unknown_fields=json.loads(r["unknown_fields_json"]),
                            created_at_iso=r["created_at_iso"],
                            updated_at_iso=r["updated_at_iso"],
                        )
                conn.close()
            except Exception as err:
                logger.warning(f"Could not sync campaigns from SQLite: {err}")

    def _save_to_disk(self):
        try:
            self.persistence_file.parent.mkdir(parents=True, exist_ok=True)
            serializable = {cid: camp.model_dump() for cid, camp in self._campaigns.items()}
            self.persistence_file.write_text(json.dumps(serializable, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error(f"Failed to persist campaigns to {self.persistence_file}: {e}")

    def parse_brief_into_rules(self, brief_text: str, sponsor_name: str) -> Tuple[List[ExtractedRuleItem], Dict[str, Any], List[str]]:
        """
        Parses raw brief text with regex heuristics and pattern extraction.
        Returns (extracted_rules, extracted_fields, unknown_fields).
        Unknown conditions remain None / unknown without inventing defaults.
        """
        rules: List[ExtractedRuleItem] = []
        unknown_fields: List[str] = []
        fields: Dict[str, Any] = {}

        # 1. Eligible Platforms
        platform_patterns = {
            "tiktok": r"\b(tiktok)\b",
            "youtube_shorts": r"\b(youtube shorts|yt shorts|shorts)\b",
            "instagram_reels": r"\b(instagram reels|ig reels|reels)\b",
            "x_video": r"\b(x video|twitter|x\.com)\b",
        }
        detected_platforms = []
        platform_quotes = []
        for p_key, pattern in platform_patterns.items():
            match = re.search(pattern, brief_text, re.IGNORECASE)
            if match:
                detected_platforms.append(p_key)
                start = max(0, match.start() - 20)
                end = min(len(brief_text), match.end() + 30)
                platform_quotes.append(brief_text[start:end].strip())

        if detected_platforms:
            fields["eligible_platforms"] = detected_platforms
            rules.append(ExtractedRuleItem(
                rule_id=f"rule-plat-{uuid.uuid4().hex[:6]}",
                category="platforms",
                title="Eligible Syndication Platforms",
                description=f"Clips authorized for: {', '.join(detected_platforms)}",
                value=detected_platforms,
                evidence_quote="; ".join(platform_quotes) if platform_quotes else None,
                confidence=0.95,
                status="extracted",
                is_mandatory=True,
            ))
        else:
            fields["eligible_platforms"] = []
            unknown_fields.append("eligible_platforms")
            rules.append(ExtractedRuleItem(
                rule_id=f"rule-plat-{uuid.uuid4().hex[:6]}",
                category="platforms",
                title="Eligible Syndication Platforms",
                description="Platforms not explicitly specified in brief.",
                value=[],
                evidence_quote=None,
                confidence=0.2,
                status="unknown",
                is_mandatory=True,
            ))

        # 2. Min & Max Duration
        # e.g., "between 15 and 60 seconds", "15-60s", "min 20s, max 45s", "under 60 seconds"
        dur_range_match = re.search(r"(?:between|from)?\s*(\d+)\s*(?:-|to|and)\s*(\d+)\s*(?:seconds|secs|s)\b", brief_text, re.IGNORECASE)
        single_max_match = re.search(r"(?:under|max|maximum|up to)\s*(\d+)\s*(?:seconds|secs|s)\b", brief_text, re.IGNORECASE)
        single_min_match = re.search(r"(?:min|minimum|at least)\s*(\d+)\s*(?:seconds|secs|s)\b", brief_text, re.IGNORECASE)

        min_dur, max_dur, dur_quote = None, None, None
        if dur_range_match:
            min_dur = float(dur_range_match.group(1))
            max_dur = float(dur_range_match.group(2))
            dur_quote = dur_range_match.group(0)
        else:
            if single_min_match:
                min_dur = float(single_min_match.group(1))
                dur_quote = single_min_match.group(0)
            if single_max_match:
                max_dur = float(single_max_match.group(1))
                dur_quote = (dur_quote + " " if dur_quote else "") + single_max_match.group(0)

        fields["min_duration_sec"] = min_dur
        fields["max_duration_sec"] = max_dur

        if min_dur is not None or max_dur is not None:
            rules.append(ExtractedRuleItem(
                rule_id=f"rule-dur-{uuid.uuid4().hex[:6]}",
                category="duration",
                title="Clip Duration Bounds",
                description=f"Allowed length: {min_dur or 0}s to {max_dur or 'unlimited'}s",
                value={"min_sec": min_dur, "max_sec": max_dur},
                evidence_quote=dur_quote,
                confidence=0.92,
                status="extracted",
                is_mandatory=True,
            ))
        else:
            unknown_fields.append("min_duration_sec")
            unknown_fields.append("max_duration_sec")
            rules.append(ExtractedRuleItem(
                rule_id=f"rule-dur-{uuid.uuid4().hex[:6]}",
                category="duration",
                title="Clip Duration Bounds",
                description="Specific duration bounds not stated in brief.",
                value={"min_sec": None, "max_sec": None},
                evidence_quote=None,
                confidence=0.1,
                status="unknown",
                is_mandatory=False,
            ))

        # 3. Required Hashtags (#tag)
        found_hashtags = list(set(h.rstrip(".,;:!?)") for h in re.findall(r"#([A-Za-z0-9_]{2,30})", brief_text)))
        fields["required_hashtags"] = found_hashtags
        if found_hashtags:
            rules.append(ExtractedRuleItem(
                rule_id=f"rule-hash-{uuid.uuid4().hex[:6]}",
                category="hashtags",
                title="Mandatory Campaign Hashtags",
                description=f"Must include: {', '.join('#' + h for h in found_hashtags)}",
                value=found_hashtags,
                evidence_quote=" ".join('#' + h for h in found_hashtags),
                confidence=0.98,
                status="extracted",
                is_mandatory=True,
            ))
        else:
            unknown_fields.append("required_hashtags")

        # 4. Required Mentions (@handle)
        found_mentions = list(set(m.rstrip(".,;:!?)") for m in re.findall(r"@([A-Za-z0-9_]{2,30})", brief_text)))
        fields["required_mentions"] = found_mentions
        if found_mentions:
            rules.append(ExtractedRuleItem(
                rule_id=f"rule-men-{uuid.uuid4().hex[:6]}",
                category="mentions",
                title="Mandatory Sponsor Mentions",
                description=f"Must tag: {', '.join('@' + m for m in found_mentions)}",
                value=found_mentions,
                evidence_quote=" ".join('@' + m for m in found_mentions),
                confidence=0.98,
                status="extracted",
                is_mandatory=True,
            ))
        else:
            unknown_fields.append("required_mentions")

        # 5. Required Disclosures (#ad, sponsored, financial disclosure)
        disclosure_matches = []
        disc_patterns = [
            r"\b(#ad|#sponsored|sponsored by|paid partnership)\b",
            r"\b(not financial advice|nfa|do your own research|dyor|risk warning)\b",
        ]
        for dp in disc_patterns:
            m = re.findall(dp, brief_text, re.IGNORECASE)
            if m:
                disclosure_matches.extend(m)
        disclosure_matches = list(set(d.strip() for d in disclosure_matches))
        fields["required_disclosures"] = disclosure_matches
        if disclosure_matches:
            rules.append(ExtractedRuleItem(
                rule_id=f"rule-disc-{uuid.uuid4().hex[:6]}",
                category="disclosures",
                title="Mandatory Legal & Sponsor Disclosures",
                description=f"Required disclosure terms: {', '.join(disclosure_matches)}",
                value=disclosure_matches,
                evidence_quote=", ".join(disclosure_matches),
                confidence=0.94,
                status="extracted",
                is_mandatory=True,
            ))
        else:
            unknown_fields.append("required_disclosures")

        # 6. Prohibited Topics & Words
        prohibited_items = []
        proh_match = re.search(r"(?:do not|avoid|prohibited|no references to|forbidden|do not discuss)\s*[:\-]?\s*([^.\n]+)", brief_text, re.IGNORECASE)
        if proh_match:
            raw_proh = proh_match.group(1).strip()
            terms = [t.strip() for t in re.split(r",|;|and", raw_proh) if len(t.strip()) > 2]
            prohibited_items.extend(terms)
        fields["prohibited_topics"] = prohibited_items
        fields["prohibited_words"] = []
        if prohibited_items:
            rules.append(ExtractedRuleItem(
                rule_id=f"rule-proh-{uuid.uuid4().hex[:6]}",
                category="prohibited",
                title="Prohibited Content & Exclusions",
                description=f"Do not mention or portray: {', '.join(prohibited_items)}",
                value=prohibited_items,
                evidence_quote=proh_match.group(0) if proh_match else None,
                confidence=0.88,
                status="extracted",
                is_mandatory=True,
            ))
        else:
            unknown_fields.append("prohibited_topics")

        # 7. Financial Terms: CPM & Payout Cap
        cpm_match = re.search(r"\$(\d+(?:\.\d{2})?)\s*(?:cpm|per\s*thousand\s*views)", brief_text, re.IGNORECASE)
        cap_match = re.search(r"(?:cap|payout cap|maximum payout|budget of|total cap)\s*(?:of|is|:)?\s*\$?([\d,]+(?:\.\d{2})?)", brief_text, re.IGNORECASE)
        
        cpm_val = float(cpm_match.group(1)) if cpm_match else None
        cap_val = float(cap_match.group(1).replace(",", "")) if cap_match else None

        fields["cpm_usd"] = cpm_val
        fields["payout_cap_usd"] = cap_val

        if cpm_val is not None or cap_val is not None:
            rules.append(ExtractedRuleItem(
                rule_id=f"rule-pay-{uuid.uuid4().hex[:6]}",
                category="payout",
                title="Performance Economics & Escrow Bounds",
                description=f"CPM: ${cpm_val or 'Unspecified'} | Cap: ${cap_val or 'Unspecified'}",
                value={"cpm_usd": cpm_val, "cap_usd": cap_val},
                evidence_quote=(cpm_match.group(0) if cpm_match else "") + " " + (cap_match.group(0) if cap_match else ""),
                confidence=0.90,
                status="extracted",
                is_mandatory=False,
            ))
        else:
            unknown_fields.append("cpm_usd")
            unknown_fields.append("payout_cap_usd")

        # 8. Source Licensing & Content Permissions
        licensing_terms = None
        lic_match = re.search(r"(?:licensing|rights|source content|permission|release)\s*[:\-]?\s*([^.\n]+)", brief_text, re.IGNORECASE)
        if lic_match:
            licensing_terms = lic_match.group(1).strip()
            fields["licensing_terms"] = licensing_terms
            rules.append(ExtractedRuleItem(
                rule_id=f"rule-lic-{uuid.uuid4().hex[:6]}",
                category="permissions",
                title="Source Content Licensing & Authorization",
                description=f"Permissions term: {licensing_terms}",
                value=licensing_terms,
                evidence_quote=lic_match.group(0),
                confidence=0.86,
                status="extracted",
                is_mandatory=True,
            ))
        else:
            fields["licensing_terms"] = None
            unknown_fields.append("licensing_terms")

        return rules, fields, unknown_fields

    def ingest_brief(self, req: CampaignBriefIngestRequest) -> CampaignRecord:
        cid = req.campaign_id or f"cmp-{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()

        rules, fields, unknowns = self.parse_brief_into_rules(req.brief_text, req.sponsor_name)

        record = CampaignRecord(
            campaign_id=cid,
            workspace_id=req.workspace_id,
            title=req.title,
            sponsor_name=req.sponsor_name,
            raw_brief_text=req.brief_text,
            brief_version=1,
            extracted_rules=rules,
            eligible_platforms=fields.get("eligible_platforms", []),
            min_duration_sec=fields.get("min_duration_sec"),
            max_duration_sec=fields.get("max_duration_sec"),
            required_hashtags=fields.get("required_hashtags", []),
            required_mentions=fields.get("required_mentions", []),
            required_disclosures=fields.get("required_disclosures", []),
            prohibited_words=fields.get("prohibited_words", []),
            prohibited_topics=fields.get("prohibited_topics", []),
            payout_cap_usd=fields.get("payout_cap_usd"),
            cpm_usd=fields.get("cpm_usd"),
            deadline_iso=None,
            licensing_terms=fields.get("licensing_terms"),
            unknown_fields=unknowns,
            created_at_iso=now,
            updated_at_iso=now,
        )

        with self._lock:
            self._campaigns[cid] = record
            self._save_to_disk()

        # Sync to SQLite Relational DB
        try:
            conn = db_manager.get_connection()
            conn.execute("""
            INSERT OR REPLACE INTO campaigns (
                id, workspace_id, title, sponsor_name, raw_brief_text, brief_version,
                eligible_platforms_json, min_duration_sec, max_duration_sec,
                required_hashtags_json, required_mentions_json, required_disclosures_json,
                prohibited_topics_json, payout_cap_usd, cpm_usd, licensing_terms,
                unknown_fields_json, created_at_iso, updated_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                cid, req.workspace_id, req.title, req.sponsor_name, req.brief_text, 1,
                json.dumps(fields.get("eligible_platforms", [])),
                fields.get("min_duration_sec"), fields.get("max_duration_sec"),
                json.dumps(fields.get("required_hashtags", [])),
                json.dumps(fields.get("required_mentions", [])),
                json.dumps(fields.get("required_disclosures", [])),
                json.dumps(fields.get("prohibited_topics", [])),
                fields.get("payout_cap_usd"), fields.get("cpm_usd"), fields.get("licensing_terms"),
                json.dumps(unknowns), now, now,
            ))
            for r in rules:
                conn.execute("""
                INSERT OR REPLACE INTO campaign_rules (
                    id, campaign_id, category, title, description, value_json,
                    evidence_quote, confidence, status, is_mandatory, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    r.rule_id, cid, r.category, r.title, r.description, json.dumps(r.value),
                    r.evidence_quote, r.confidence, r.status, 1 if r.is_mandatory else 0, r.notes,
                ))
            conn.commit()
            conn.close()
        except Exception as db_err:
            logger.warning(f"Failed to sync campaign {cid} to SQLite: {db_err}")

        logger.info(f"Ingested campaign brief '{req.title}' ({cid}) with {len(rules)} extracted rules and {len(unknowns)} unknown fields.")
        return record

    def get_campaign(self, campaign_id: str) -> Optional[CampaignRecord]:
        with self._lock:
            if campaign_id not in self._campaigns:
                self._load_from_disk()
            return self._campaigns.get(campaign_id)

    def list_campaigns(self, workspace_id: Optional[str] = None) -> List[CampaignRecord]:
        with self._lock:
            if len(self._campaigns) < 5:
                self._load_from_disk()
            camps = list(self._campaigns.values())
            if workspace_id:
                return [c for c in camps if c.workspace_id == workspace_id]
            return camps

    def update_rule(self, campaign_id: str, rule_id: str, update: CampaignRuleUpdateRequest) -> Optional[CampaignRecord]:
        with self._lock:
            camp = self._campaigns.get(campaign_id)
            if not camp:
                return None
            for rule in camp.extracted_rules:
                if rule.rule_id == rule_id:
                    rule.value = update.value
                    rule.status = update.status
                    if update.notes:
                        rule.notes = update.notes
                    camp.updated_at_iso = datetime.now(timezone.utc).isoformat()
                    self._save_to_disk()
                    logger.info(f"Updated rule {rule_id} on campaign {campaign_id} (Status: {update.status})")
                    return camp
            return None

    def update_campaign(self, campaign: CampaignRecord) -> CampaignRecord:
        with self._lock:
            campaign.updated_at_iso = datetime.now(timezone.utc).isoformat()
            self._campaigns[campaign.campaign_id] = campaign
            self._save_to_disk()
            return campaign

campaign_service = CampaignService()
