export type NavSection =
  | 'command-center'
  | 'campaign-radar'
  | 'clip-studio'
  | 'argon-guard'
  | 'review-queue'
  | 'performance-lab';

export type PlatformType = 'TikTok' | 'YouTube Shorts' | 'Instagram Reels' | 'X Video';

export type EligibilityStatus = 'Eligible' | 'Invite Only' | 'Cap Reached' | 'Review Required';

export type ComplianceStatus = 'passed' | 'failed' | 'warning' | 'pending' | 'human-review';

/**
 * Standardized V2.5 Operational Transparency Statuses
 */
export type OperationalStatus =
  | 'Simulated'
  | 'Awaiting integration'
  | 'Processing'
  | 'Ready for review'
  | 'Passed validation'
  | 'Failed validation'
  | 'Exported';

export type ReviewDecision = 'pending' | 'approved' | 'rejected' | 'changes-requested' | 'export-ready';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  tier: 'Private Operator' | 'Syndicate Pro' | 'Enterprise Desk';
  activeOperators: number;
  monthlyComputeBudgetUsd: number;
  usedComputeUsd: number;
  storageUsedGb: number;
}

export interface CampaignRule {
  id: string;
  campaignId: string;
  category: 'aspect_ratio' | 'resolution' | 'duration' | 'captions' | 'branding' | 'audio' | 'platform' | 'disclosure';
  label: string;
  requirementText: string;
  strictness: 'mandatory' | 'advisory' | 'manual_signoff';
  expectedValue: string;
}

export interface ValuationAssumptions {
  expectedViewsPerClip: number;
  qualificationRatePct: number;
  effectiveCpmUsd: number;
  platformSplitNote: string;
  formulaSummary: string;
}

export interface Campaign {
  id: string;
  workspaceId: string;
  title: string;
  sponsorName: string;
  sourceChannel: string;
  sourceCategory: 'Tech Founder Podcast' | 'Macro & Fintech' | 'B2B SaaS Keynote' | 'Consumer Hardware' | 'Developer Keynote';
  cpmUsd: number;
  totalBudgetUsd: number;
  remainingBudgetUsd: number;
  payoutCapPerClipUsd: number;
  minViewsForPayout: number;
  eligiblePlatforms: PlatformType[];
  deadlineIso: string;
  eligibility: EligibilityStatus;
  estimatedValuePerClipUsd: number;
  valuationAssumptions: ValuationAssumptions;
  briefRawText: string;
  allowedSourceUrls: string[];
  aiParseConfidence: number; // 0-100
  missingBriefFields: string[];
  isDemoData: boolean;
  createdAtIso: string;
}

export interface TranscriptWord {
  word: string;
  startSec: number;
  endSec: number;
}

export interface TranscriptSegment {
  id: string;
  sourceAssetId: string;
  speaker: string;
  startSec: number;
  endSec: number;
  text: string;
  energyScore: number; // 0-100
  keywords: string[];
}

export interface SourceAsset {
  id: string;
  workspaceId: string;
  campaignId: string;
  title: string;
  creatorName: string;
  sourceUrl: string;
  durationSec: number;
  resolution: '3840x2160' | '1920x1080';
  fps: 60 | 30 | 24;
  audioLufs: number;
  authorizationProof: string;
  analysisStatus: 'unprocessed' | 'analyzing' | 'analyzed' | 'error';
  analyzedAtIso?: string;
  waveformPeaks: number[];
  transcript: TranscriptSegment[];
}

export interface HookBreakdown {
  openingVelocity: number; // 0-100
  controversyOrInsightDelta: number; // 0-100
  retentionCadence: number; // 0-100
  sponsorAlignment: number; // 0-100
  explanation: string;
}

export type CaptionPresetId = 'kinetic-lime' | 'minimal-editorial' | 'founder-mono' | 'high-contrast-box';

export type CropMode = 'speaker-lock' | 'split-screen-podcast' | 'dynamic-pan' | 'center-fixed';

export type CaptionFontSize = 'sm' | 'md' | 'lg';
export type CaptionVerticalPosition = 'lower-third' | 'center-stage' | 'upper-safe';
export type CaptionAccentColor = 'vibe-blue' | 'done-green' | 'electric-lime' | 'warning-amber';

export interface ClipCandidate {
  id: string;
  workspaceId: string;
  campaignId: string;
  sourceAssetId: string;
  title: string;
  rank: number;
  startSec: number;
  endSec: number;
  hookScore: number; // 0-99
  hookBreakdown: HookBreakdown;
  captionPreset: CaptionPresetId;
  captionFontSize?: CaptionFontSize;
  captionPosition?: CaptionVerticalPosition;
  captionAccentColor?: CaptionAccentColor;
  cropMode: CropMode;
  faceTrackOffsetX: number; // -50 to +50
  includeWatermark: boolean;
  watermarkPosition: 'top-right' | 'top-left' | 'bottom-right';
  includeCtaCard: boolean;
  normalizeAudioLufs: boolean;
  targetPlatforms: PlatformType[];
  transcriptExcerpt: string;
  complianceSummaryStatus: ComplianceStatus;
  reviewStatus: ReviewDecision;
  operationalStatus?: OperationalStatus;
  renderStatus: 'draft' | 'queued' | 'rendering' | 'rendered' | 'failed';
  lastRenderedAtIso?: string;
  estimatedPayoutUsd: number;
  productionTimeSavedMin: number;
}

export interface RenderJob {
  id: string;
  clipCandidateId: string;
  campaignId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  operationalStatus?: OperationalStatus;
  progressPct: number;
  codec: 'H.264 High@L4.2' | 'HEVC Main10';
  outputResolution: '1080x1920';
  durationSec: number;
  startedAtIso: string;
  completedAtIso?: string;
  simulatedAdapterNote: string;
}

export interface ComplianceCheck {
  id: string;
  clipCandidateId: string;
  campaignId: string;
  ruleId: string;
  category: CampaignRule['category'];
  title: string;
  requirement: string;
  detectedValue: string;
  status: ComplianceStatus;
  operationalStatus: OperationalStatus;
  verificationMode: 'simulated-heuristic' | 'metadata-rule' | 'operator-attestation' | 'binary-media-awaiting';
  failureReason?: string;
  remediationStep?: string;
  notes: string;
  updatedAtIso: string;
}

export interface ApprovalRecord {
  id: string;
  clipCandidateId: string;
  campaignId: string;
  reviewerName: string;
  reviewerRole: string;
  decision: ReviewDecision;
  note: string;
  timestampIso: string;
}

export interface Publication {
  id: string;
  clipCandidateId: string;
  campaignId: string;
  platform: PlatformType;
  accountHandle: string;
  publishedAtIso: string;
  verifiedViews: number;
  estimatedViews: number;
  retention3sPct: number;
  avgWatchTimeSec: number;
  status: 'live-tracked' | 'pending-verification' | 'disputed';
}

export interface PerformanceSnapshot {
  id: string;
  campaignId: string;
  dateLabel: string;
  verifiedViews: number;
  estimatedEarningsUsd: number;
  accruedEarningsUsd: number;
  settledEarningsUsd: number;
  verifiedPaidUsd: number;
  computeAndOperatorCostUsd: number;
  clipsPublished: number;
  approvalRatePct: number;
  operatorHoursSpent: number;
}

export interface Payout {
  id: string;
  campaignId: string;
  clipCandidateId: string;
  amountUsd: number;
  verificationState: 'verified-paid' | 'settled-escrow' | 'accrued-unsettled' | 'estimated-projected';
  verifiedViewsCounted: number;
  effectiveCpmUsd: number;
  settledAtIso?: string;
  referenceCode: string;
}

export interface ActivityEvent {
  id: string;
  workspaceId: string;
  timestampIso: string;
  actor: string;
  category: 'campaign' | 'analysis' | 'render' | 'compliance' | 'review' | 'payout';
  summary: string;
  targetLabel: string;
  campaignId?: string;
  clipId?: string;
}
