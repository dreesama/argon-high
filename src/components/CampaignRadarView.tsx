import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  Calculator,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Filter,
  Play,
  Plus,
  Radar,
  Search,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { Campaign, PlatformType } from '../types/argon';
import { parseCampaignBriefLocally } from '../services/argonAdapters';
import { argonApiClient } from '../services/argonApiClient';
import { DemoTag, EligibilityBadge, OperationalStatusBadge } from './ArgonBadges';
import { VibeBoardGroup, VibeButton } from '../vibe/VibeComponents';

interface CampaignRadarProps {
  campaigns: Campaign[];
  isCreateModalOpen: boolean;
  onOpenCreateModal: () => void;
  onCloseCreateModal: () => void;
  onCreateCampaign: (newCampaign: Omit<Campaign, 'id' | 'workspaceId' | 'createdAtIso'>) => void;
  onSelectCampaignForStudio: (campaignId: string) => void;
}

type SortField = 'cpmUsd' | 'remainingBudgetUsd' | 'payoutCapPerClipUsd' | 'estimatedValuePerClipUsd' | 'deadlineIso';

const SAMPLE_BRIEF_PRESET = `Campaign Title: VeloxDB Serverless Postgres Launch Bounty
Sponsor: VeloxDB Cloud
Source Feed: Systems & Scale Podcast Ep #89 (Fictional Demo)
Payout Rate: $5.60 CPM per 1,000 verified views (Total Pool: $40,000, Cap: $1,600 / clip)
Eligible Platforms: YouTube Shorts, TikTok, X Video
Technical Rules:
- Must be 9:16 vertical 1080x1920 resolution
- Clip duration strictly between 28s and 56s
- Burned-in captions mandatory
- Include VeloxDB top-right watermark badge`;

export const CampaignRadarView: React.FC<CampaignRadarProps> = ({
  campaigns,
  isCreateModalOpen,
  onOpenCreateModal,
  onCloseCreateModal,
  onCreateCampaign,
  onSelectCampaignForStudio,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [eligibilityFilter, setEligibilityFilter] = useState<string>('ALL');
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('cpmUsd');
  const [sortDesc, setSortDesc] = useState(true);
  const [selectedDetailCampaign, setSelectedDetailCampaign] = useState<Campaign | null>(null);

  // Create Campaign Dialog state
  const [briefText, setBriefText] = useState(SAMPLE_BRIEF_PRESET);
  const [sourceLinksText, setSourceLinksText] = useState('');
  const [customTitle, setCustomTitle] = useState('VeloxDB Serverless Postgres Launch Bounty');
  const [customSponsor, setCustomSponsor] = useState('VeloxDB Cloud');
  const [customSourceChannel, setCustomSourceChannel] = useState(
    'Systems & Scale Podcast Ep #89 (Fictional Demo)'
  );
  const [parsedCpm, setParsedCpm] = useState(5.6);
  const [parsedBudget, setParsedBudget] = useState(40000);
  const [parsedCap, setParsedCap] = useState(1600);
  const [parsedPlatforms, setParsedPlatforms] = useState<PlatformType[]>([
    'YouTube Shorts',
    'TikTok',
    'X Video',
  ]);
  const [parseConfidence, setParseConfidence] = useState(94);
  const [missingFields, setMissingFields] = useState<string[]>([
    'Audio LUFS ceiling not explicitly stated (defaults to -14.0 LUFS)',
  ]);
  const [hasParsedBrief, setHasParsedBrief] = useState(true);

  const [isParsingBackend, setIsParsingBackend] = useState(false);

  const handleRunBriefParser = async () => {
    const text = briefText.trim();
    if (!text) return;
    setIsParsingBackend(true);
    try {
      const realRecord = await argonApiClient.ingestCampaignBrief(
        customTitle || 'Campaign Brief',
        customSponsor || 'Sponsor',
        text
      );
      if (realRecord) {
        if (realRecord.cpm_usd) setParsedCpm(realRecord.cpm_usd);
        if (realRecord.payout_cap_usd) setParsedCap(realRecord.payout_cap_usd);
        if (realRecord.eligible_platforms && realRecord.eligible_platforms.length > 0) {
          const mappedPlats = realRecord.eligible_platforms.map((p) => {
            if (p === 'tiktok') return 'TikTok';
            if (p === 'youtube_shorts') return 'YouTube Shorts';
            if (p === 'instagram_reels') return 'Instagram Reels';
            return 'X Video';
          }) as PlatformType[];
          setParsedPlatforms(mappedPlats);
        }
        if (realRecord.unknown_fields) {
          setMissingFields(realRecord.unknown_fields.map((u) => `Unknown field in brief: ${u.replace(/_/g, ' ')}`));
        }
        const total = realRecord.extracted_rules.length + realRecord.unknown_fields.length;
        setParseConfidence(total > 0 ? Math.round((realRecord.extracted_rules.length / total) * 100) : 90);
        setHasParsedBrief(true);
        setIsParsingBackend(false);
        return;
      }
    } catch {
      // Fallback to local regex heuristic parser
    }
    const parsed = parseCampaignBriefLocally(text);
    setParsedCpm(parsed.cpmUsd);
    setParsedBudget(parsed.totalBudgetUsd);
    setParsedCap(parsed.payoutCapPerClipUsd);
    setParsedPlatforms(parsed.eligiblePlatforms);
    setMissingFields(parsed.missingFields);
    setParseConfidence(parsed.confidence);
    setHasParsedBrief(true);
    setIsParsingBackend(false);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const urls = sourceLinksText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const cpmVal = Number(parsedCpm) || 5.0;
    const estVal = Math.min(Number(parsedCap) || 1500, Math.round(85 * cpmVal * 0.92));

    onCreateCampaign({
      title: customTitle.trim() || 'Untitled Operator Campaign Brief',
      sponsorName: customSponsor.trim() || 'Private Sponsor',
      sourceChannel: customSourceChannel.trim() || 'Authorized Operator Source (Fictional Demo)',
      sourceCategory: 'Developer Keynote',
      cpmUsd: cpmVal,
      totalBudgetUsd: Number(parsedBudget) || 30000,
      remainingBudgetUsd: Number(parsedBudget) || 30000,
      payoutCapPerClipUsd: Number(parsedCap) || 1500,
      minViewsForPayout: 10000,
      eligiblePlatforms: parsedPlatforms,
      deadlineIso: '2026-07-15T23:59:00Z',
      eligibility: 'Eligible',
      estimatedValuePerClipUsd: estVal,
      valuationAssumptions: {
        expectedViewsPerClip: 85000,
        qualificationRatePct: 92,
        effectiveCpmUsd: cpmVal,
        platformSplitNote: parsedPlatforms.join(' / '),
        formulaSummary: `85K est. views × $${cpmVal.toFixed(2)} CPM × 92% qualification = $${estVal} est. value/clip`,
      },
      briefRawText: briefText,
      allowedSourceUrls: urls,
      aiParseConfidence: parseConfidence,
      missingBriefFields: missingFields,
      isDemoData: true,
    });
    onCloseCreateModal();
  };

  const filteredCampaigns = useMemo(() => {
    return campaigns
      .filter((c) => {
        const q = searchQuery.trim().toLowerCase();
        const matchesSearch =
          !q ||
          c.title.toLowerCase().includes(q) ||
          c.sponsorName.toLowerCase().includes(q) ||
          c.sourceChannel.toLowerCase().includes(q);
        const matchesEligibility =
          eligibilityFilter === 'ALL' || c.eligibility === eligibilityFilter;
        const matchesPlatform =
          platformFilter === 'ALL' ||
          c.eligiblePlatforms.includes(platformFilter as PlatformType);
        return matchesSearch && matchesEligibility && matchesPlatform;
      })
      .sort((a, b) => {
        const dir = sortDesc ? -1 : 1;
        if (sortField === 'deadlineIso') {
          return a.deadlineIso.localeCompare(b.deadlineIso) * dir;
        }
        return ((a[sortField] as number) - (b[sortField] as number)) * dir;
      });
  }, [campaigns, searchQuery, eligibilityFilter, platformFilter, sortField, sortDesc]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDesc((p) => !p);
    } else {
      setSortField(field);
      setSortDesc(true);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-vibe-border-ui bg-vibe-bg-surface p-5 vibe-shadow-sm lg:flex-row lg:items-center">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <Radar className="h-4 w-4 text-vibe-primary" />
            <h1 className="text-sm font-bold tracking-wide text-vibe-text-primary uppercase">
              Campaign Radar · Paid Clipping Arbitrage Index
            </h1>
            <DemoTag label="LOCAL CURATED DEMO BRIEFS — NO EXTERNAL SCRAPING" />
          </div>
          <p className="text-xs text-vibe-text-secondary">
            Compare effective CPM rates, remaining escrow pools, per-clip payout caps, and compliance rules across operator-ingested briefs.
          </p>
        </div>

        <VibeButton
          kind="primary"
          size="md"
          onClick={onOpenCreateModal}
          leftIcon={<Plus className="h-4 w-4" />}
        >
          Create Campaign from Brief
        </VibeButton>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-vibe-border-ui bg-vibe-bg-surface p-3 vibe-shadow-sm">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-3.5 w-3.5 text-vibe-text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by campaign title, sponsor, podcast, or category..."
            className="w-full rounded border border-vibe-border-ui bg-vibe-bg-surface py-1.5 pr-3 pl-8 text-xs text-vibe-text-primary placeholder-vibe-text-secondary focus:border-vibe-primary focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-vibe-text-secondary" />
            <span className="font-semibold text-vibe-text-secondary">ELIGIBILITY:</span>
            <select
              value={eligibilityFilter}
              onChange={(e) => setEligibilityFilter(e.target.value)}
              className="rounded border border-vibe-border-ui bg-vibe-bg-surface px-2.5 py-1.5 text-xs font-medium text-vibe-text-primary focus:border-vibe-primary focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="Eligible">Eligible</option>
              <option value="Review Required">Review Required</option>
              <option value="Invite Only">Invite Only</option>
              <option value="Cap Reached">Cap Reached / Expired</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-vibe-text-secondary">PLATFORM:</span>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="rounded border border-vibe-border-ui bg-vibe-bg-surface px-2.5 py-1.5 text-xs font-medium text-vibe-text-primary focus:border-vibe-primary focus:outline-none"
            >
              <option value="ALL">All Platforms</option>
              <option value="TikTok">TikTok</option>
              <option value="YouTube Shorts">YouTube Shorts</option>
              <option value="Instagram Reels">Instagram Reels</option>
              <option value="X Video">X Video</option>
            </select>
          </div>
        </div>
      </div>

      {/* Monday Vibe Board Group Campaign Table */}
      <VibeBoardGroup
        accentColor="primary"
        title="Active Arbitrage Campaigns Board"
        subtitle={`${filteredCampaigns.length} operator-curated briefs matching active filters`}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-vibe-border-layout bg-vibe-bg-grey text-[11px] font-semibold text-vibe-text-secondary uppercase">
                <th className="px-4 py-3">Campaign & Authorized Source</th>
                <th className="px-3 py-3">
                  <button
                    onClick={() => toggleSort('cpmUsd')}
                    className="inline-flex items-center gap-1 hover:text-vibe-text-primary"
                  >
                    CPM <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3">
                  <button
                    onClick={() => toggleSort('remainingBudgetUsd')}
                    className="inline-flex items-center gap-1 hover:text-vibe-text-primary"
                  >
                    Remaining Pool <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3">
                  <button
                    onClick={() => toggleSort('payoutCapPerClipUsd')}
                    className="inline-flex items-center gap-1 hover:text-vibe-text-primary"
                  >
                    Payout Cap <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3">Eligible Platforms</th>
                <th className="px-3 py-3">
                  <button
                    onClick={() => toggleSort('deadlineIso')}
                    className="inline-flex items-center gap-1 hover:text-vibe-text-primary"
                  >
                    Deadline <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3">Eligibility</th>
                <th className="px-3 py-3">
                  <button
                    onClick={() => toggleSort('estimatedValuePerClipUsd')}
                    className="inline-flex items-center gap-1 hover:text-vibe-text-primary"
                  >
                    Est. Value <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vibe-border-layout">
              {filteredCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-vibe-text-secondary">
                    No campaigns match the active filter criteria.
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map((cmp) => {
                  const pctLeft = Math.round(
                    (cmp.remainingBudgetUsd / Math.max(1, cmp.totalBudgetUsd)) * 100
                  );
                  const deadlineFormatted = cmp.deadlineIso.slice(0, 10);
                  const isCappedOrExpired =
                    cmp.eligibility === 'Cap Reached' || cmp.remainingBudgetUsd <= 0;
                  return (
                    <tr
                      key={cmp.id}
                      className={`transition hover:bg-vibe-bg-hover ${
                        isCappedOrExpired ? 'opacity-75' : ''
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-vibe-text-primary">{cmp.title}</span>
                          <span className="rounded border border-vibe-border-ui bg-vibe-bg-grey px-1.5 py-0.5 font-mono text-[10px] font-semibold text-vibe-text-secondary">
                            DEMO
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-vibe-text-secondary">
                          {cmp.sourceChannel} · <span className="font-medium text-vibe-text-primary">{cmp.sponsorName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 font-mono text-sm font-bold text-vibe-primary tabular-nums">
                        ${cmp.cpmUsd.toFixed(2)}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="font-mono text-xs font-semibold text-vibe-text-primary tabular-nums">
                          ${cmp.remainingBudgetUsd.toLocaleString()}{' '}
                          <span className="text-[11px] font-normal text-vibe-text-secondary">
                            / ${cmp.totalBudgetUsd.toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-32 overflow-hidden rounded-full bg-vibe-bg-grey">
                          <div
                            className={`h-full rounded-full ${
                              isCappedOrExpired ? 'bg-vibe-text-secondary' : 'bg-vibe-primary'
                            }`}
                            style={{ width: `${pctLeft}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3.5 font-mono text-xs font-semibold text-vibe-text-primary tabular-nums">
                        ${cmp.payoutCapPerClipUsd.toLocaleString()}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {cmp.eligiblePlatforms.map((plat) => (
                            <span
                              key={plat}
                              className="rounded border border-vibe-border-ui bg-vibe-bg-grey px-1.5 py-0.5 font-sans text-[10px] font-medium text-vibe-text-primary"
                            >
                              {plat}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 font-mono text-xs text-vibe-text-secondary tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-vibe-text-secondary" />
                          {deadlineFormatted}
                        </span>
                        {isCappedOrExpired && (
                          <div className="font-sans text-[10px] font-semibold text-vibe-negative">
                            Closed / Cap Reached
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <EligibilityBadge status={cmp.eligibility} />
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="font-mono text-xs font-bold text-vibe-positive-hover tabular-nums">
                          ~${cmp.estimatedValuePerClipUsd} / clip
                        </div>
                        <div
                          title={cmp.valuationAssumptions?.formulaSummary}
                          className="mt-0.5 font-mono text-[10px] text-vibe-text-secondary"
                        >
                          {(cmp.valuationAssumptions?.expectedViewsPerClip ?? 95000) / 1000}K est × {cmp.valuationAssumptions?.qualificationRatePct ?? 92}% qual
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <VibeButton
                            kind="secondary"
                            size="xs"
                            onClick={() => setSelectedDetailCampaign(cmp)}
                          >
                            Brief
                          </VibeButton>
                          <VibeButton
                            kind="primary"
                            size="xs"
                            onClick={() => onSelectCampaignForStudio(cmp.id)}
                            leftIcon={<Play className="h-3 w-3" />}
                          >
                            Studio
                          </VibeButton>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </VibeBoardGroup>

      {/* Campaign Brief Inspection Drawer / Card */}
      {selectedDetailCampaign && (
        <div className="rounded-lg border-2 border-vibe-primary bg-vibe-bg-surface p-4 vibe-shadow-md">
          <div className="flex items-start justify-between gap-4 border-b border-vibe-border-layout pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-sans text-xs font-bold text-vibe-primary uppercase">
                  PARSED CAMPAIGN BRIEF INSPECTOR
                </span>
                <span className="rounded bg-vibe-positive px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                  PARSE CONFIDENCE: {selectedDetailCampaign.aiParseConfidence}%
                </span>
                <OperationalStatusBadge status="Simulated" />
              </div>
              <h3 className="mt-1 text-base font-bold text-vibe-text-primary">
                {selectedDetailCampaign.title}
              </h3>
            </div>
            <button
              onClick={() => setSelectedDetailCampaign(null)}
              className="rounded p-1 text-vibe-text-secondary hover:bg-vibe-bg-grey hover:text-vibe-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="font-sans text-[11px] font-bold text-vibe-text-secondary uppercase">
                Raw Operator Brief Text
              </div>
              <p className="mt-1 rounded border border-vibe-border-ui bg-vibe-bg-grey p-3 text-xs leading-relaxed text-vibe-text-primary">
                {selectedDetailCampaign.briefRawText}
              </p>

              {/* Explicit Expected Value Calculation Assumptions Box */}
              <div className="mt-3 rounded border border-vibe-primary/30 bg-vibe-primary-surface p-3 text-xs">
                <div className="flex items-center gap-1.5 font-sans text-[11px] font-bold text-vibe-primary uppercase">
                  <Calculator className="h-3.5 w-3.5" />
                  Expected Value / Clip Assumptions
                </div>
                <div className="mt-1 font-mono text-xs font-bold text-vibe-text-primary">
                  {selectedDetailCampaign.valuationAssumptions?.formulaSummary}
                </div>
                <div className="mt-1 text-[11px] text-vibe-text-secondary">
                  Platform Distribution Assumption: {selectedDetailCampaign.valuationAssumptions?.platformSplitNote} · Min Views for Payout: {selectedDetailCampaign.minViewsForPayout.toLocaleString()}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-vibe-text-secondary">
                <span>Authorized Feeds:</span>
                {selectedDetailCampaign.allowedSourceUrls.map((u) => (
                  <span
                    key={u}
                    className="inline-flex items-center gap-1 rounded border border-vibe-border-ui bg-vibe-primary-surface px-2 py-0.5 font-semibold text-vibe-primary"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {u}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded border border-vibe-border-ui bg-vibe-bg-grey p-3 text-xs">
              <div className="font-sans text-[11px] font-bold text-vibe-text-primary uppercase">
                Missing / Ambiguous Brief Fields
              </div>
              {selectedDetailCampaign.missingBriefFields.length === 0 ? (
                <div className="flex items-center gap-1.5 font-medium text-vibe-positive-hover">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>All required compliance parameters explicitly defined.</span>
                </div>
              ) : (
                <ul className="space-y-1.5 font-medium text-vibe-warning-hover">
                  {selectedDetailCampaign.missingBriefFields.map((m) => (
                    <li key={m} className="flex items-start gap-1.5">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE CAMPAIGN & BRIEF PARSER DIALOG */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-vibe-text-primary/40 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-vibe-border-ui bg-vibe-bg-surface p-5 vibe-shadow-md">
            <div className="flex items-center justify-between border-b border-vibe-border-layout pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-vibe-primary" />
                  <h2 className="text-sm font-bold text-vibe-text-primary">
                    Ingest Campaign Brief & Parse Compliance Rules
                  </h2>
                  <DemoTag label="LOCAL BRIEF PARSER" />
                </div>
                <p className="mt-0.5 text-xs text-vibe-text-secondary">
                  Paste a sponsor brief and authorized source URLs. Argon High extracts payout parameters, flags missing rules, and initializes Argon Guard checks.
                </p>
              </div>
              <button
                onClick={onCloseCreateModal}
                className="rounded p-1 text-vibe-text-secondary hover:bg-vibe-bg-grey hover:text-vibe-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Left 7 Cols: Raw Brief & Source Links */}
                <div className="space-y-3 lg:col-span-7">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="font-sans text-[11px] font-bold text-vibe-text-primary uppercase">
                        1. Paste Sponsor Campaign Brief *
                      </label>
                      <VibeButton
                        type="button"
                        kind="secondary"
                        size="xs"
                        onClick={handleRunBriefParser}
                        leftIcon={<Wand2 className="h-3 w-3 text-vibe-primary" />}
                      >
                        Re-Parse Brief Rules
                      </VibeButton>
                    </div>
                    <textarea
                      rows={6}
                      value={briefText}
                      onChange={(e) => setBriefText(e.target.value)}
                      className="mt-1.5 w-full rounded border border-vibe-border-ui bg-vibe-bg-surface p-2.5 font-mono text-xs leading-relaxed text-vibe-text-primary focus:border-vibe-primary focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div>
                      <label className="font-sans text-[11px] font-semibold text-vibe-text-primary">
                        CAMPAIGN TITLE *
                      </label>
                      <input
                        type="text"
                        required
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        className="mt-1 w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-2.5 py-1.5 text-xs text-vibe-text-primary focus:border-vibe-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="font-sans text-[11px] font-semibold text-vibe-text-primary">
                        SPONSOR ENTITY
                      </label>
                      <input
                        type="text"
                        value={customSponsor}
                        onChange={(e) => setCustomSponsor(e.target.value)}
                        className="mt-1 w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-2.5 py-1.5 text-xs text-vibe-text-primary focus:border-vibe-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-sans text-[11px] font-semibold text-vibe-text-primary">
                      AUTHORIZED LONG-FORM SOURCE LINKS (ONE PER LINE)
                    </label>
                    <textarea
                      rows={2}
                      value={sourceLinksText}
                      onChange={(e) => setSourceLinksText(e.target.value)}
                      className="mt-1 w-full rounded border border-vibe-border-ui bg-vibe-bg-surface p-2 font-mono text-xs text-vibe-primary focus:border-vibe-primary focus:outline-none"
                    />
                  </div>
                </div>

                {/* Right 5 Cols: AI-Parsed Requirements, Confidence & Missing Info */}
                <div className="flex flex-col justify-between rounded-lg border border-vibe-border-ui bg-vibe-bg-grey p-3.5 lg:col-span-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-vibe-border-ui pb-2">
                      <span className="font-sans text-[11px] font-bold text-vibe-text-primary uppercase">
                        2. Parsed Terms & Confidence
                      </span>
                      <span className="rounded bg-vibe-positive px-2 py-0.5 font-mono text-xs font-bold text-white tabular-nums">
                        {parseConfidence}% CONFIDENCE
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded border border-vibe-border-ui bg-vibe-bg-surface p-2">
                        <div className="font-mono text-[10px] text-vibe-text-secondary">CPM RATE ($)</div>
                        <input
                          type="number"
                          step="0.1"
                          value={parsedCpm}
                          onChange={(e) => setParsedCpm(Number(e.target.value))}
                          className="mt-1 w-full bg-transparent font-mono text-sm font-bold text-vibe-primary focus:outline-none"
                        />
                      </div>
                      <div className="rounded border border-vibe-border-ui bg-vibe-bg-surface p-2">
                        <div className="font-mono text-[10px] text-vibe-text-secondary">POOL ($)</div>
                        <input
                          type="number"
                          step="1000"
                          value={parsedBudget}
                          onChange={(e) => setParsedBudget(Number(e.target.value))}
                          className="mt-1 w-full bg-transparent font-mono text-sm font-bold text-vibe-text-primary focus:outline-none"
                        />
                      </div>
                      <div className="rounded border border-vibe-border-ui bg-vibe-bg-surface p-2">
                        <div className="font-mono text-[10px] text-vibe-text-secondary">CLIP CAP ($)</div>
                        <input
                          type="number"
                          step="100"
                          value={parsedCap}
                          onChange={(e) => setParsedCap(Number(e.target.value))}
                          className="mt-1 w-full bg-transparent font-mono text-sm font-bold text-vibe-text-primary focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="font-sans text-[10px] font-bold text-vibe-text-secondary uppercase">
                        Extracted Platform Whitelist
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {parsedPlatforms.map((p) => (
                          <span
                            key={p}
                            className="rounded border border-vibe-primary/30 bg-vibe-primary-selected px-2 py-0.5 font-sans text-[10px] font-semibold text-vibe-primary"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Missing Information / Ambiguity Report */}
                    <div className="rounded border border-vibe-warning bg-vibe-warning-surface p-2.5">
                      <div className="flex items-center gap-1.5 font-sans text-[11px] font-bold text-vibe-text-primary">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Missing / Unspecified Brief Clauses ({missingFields.length})
                      </div>
                      {missingFields.length === 0 ? (
                        <p className="mt-1 text-[11px] font-medium text-vibe-positive-hover">
                          All mandatory compliance dimensions found in brief text.
                        </p>
                      ) : (
                        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-vibe-text-primary">
                          {missingFields.map((field) => (
                            <li key={field}>{field}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 rounded border border-vibe-border-ui bg-vibe-bg-surface p-2 text-[10px] text-vibe-text-secondary">
                    {hasParsedBrief
                      ? 'Rule extraction verified locally. Creating this campaign also provisions a starter authorized source feed for Clip Studio.'
                      : 'Click Re-Parse Brief Rules to update confidence score.'}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-vibe-border-layout pt-3">
                <VibeButton
                  type="button"
                  kind="secondary"
                  onClick={onCloseCreateModal}
                >
                  Cancel
                </VibeButton>
                <VibeButton
                  type="submit"
                  kind="primary"
                  leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                >
                  Create Campaign & Open in Studio
                </VibeButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
