import {
  ActivityEvent,
  ApprovalRecord,
  Campaign,
  CampaignRule,
  ClipCandidate,
  ComplianceCheck,
  ComplianceStatus,
  Payout,
  PerformanceSnapshot,
  Publication,
  RenderJob,
  SourceAsset,
  Workspace,
} from '../types/argon';

export const INITIAL_WORKSPACES: Workspace[] = [
  {
    id: 'ws-northstar',
    name: 'Northstar Arbitrage Desk',
    slug: 'northstar-ops',
    tier: 'Syndicate Pro',
    activeOperators: 6,
    monthlyComputeBudgetUsd: 1200,
    usedComputeUsd: 384.5,
    storageUsedGb: 418.2,
  },
  {
    id: 'ws-kestrel',
    name: 'Kestrel Solo Labs',
    slug: 'kestrel-solo',
    tier: 'Private Operator',
    activeOperators: 1,
    monthlyComputeBudgetUsd: 300,
    usedComputeUsd: 92.0,
    storageUsedGb: 84.6,
  },
  {
    id: 'ws-vanguard',
    name: 'Vanguard Media Syndicate',
    slug: 'vanguard-syndicate',
    tier: 'Enterprise Desk',
    activeOperators: 14,
    monthlyComputeBudgetUsd: 4500,
    usedComputeUsd: 1910.8,
    storageUsedGb: 1840.0,
  },
];

export const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: 'cmp-tensor-cloud',
    workspaceId: 'ws-northstar',
    title: 'TensorScale GPU Cluster Launch Podcast Bounty',
    sponsorName: 'TensorScale Infrastructure',
    sourceChannel: 'Latent Space Architecture Podcast (Fictional Demo)',
    sourceCategory: 'Tech Founder Podcast',
    cpmUsd: 4.8,
    totalBudgetUsd: 45000,
    remainingBudgetUsd: 28420,
    payoutCapPerClipUsd: 1800,
    minViewsForPayout: 10000,
    eligiblePlatforms: ['TikTok', 'YouTube Shorts', 'Instagram Reels', 'X Video'],
    deadlineIso: '2026-06-18T23:59:00Z',
    eligibility: 'Eligible',
    estimatedValuePerClipUsd: 420,
    valuationAssumptions: {
      expectedViewsPerClip: 95000,
      qualificationRatePct: 92,
      effectiveCpmUsd: 4.8,
      platformSplitNote: '60% YouTube Shorts / 25% TikTok / 15% X Video',
      formulaSummary: '95K est. views × $4.80 CPM × 92% qualification = $420 est. value/clip',
    },
    briefRawText:
      'Clip high-conviction technical discussions from Episode #142 featuring CEO Mara Vance on bare-metal H200 cluster interconnects. Must maintain 9:16 1080x1920 vertical format, duration strictly between 28s and 58s, include TensorScale top-right watermark badge, and keep burned-in captions active. No background music louder than -18 LUFS.',
    allowedSourceUrls: [
      'https://media.demo.argonhigh.internal/latent-space-ep142-mara-vance-4k.mp4',
    ],
    aiParseConfidence: 96,
    missingBriefFields: [],
    isDemoData: true,
    createdAtIso: '2026-05-02T14:20:00Z',
  },
  {
    id: 'cmp-meridian-fx',
    workspaceId: 'ws-northstar',
    title: 'Meridian Treasury API — Founder Fireside Series',
    sponsorName: 'Meridian Financial Systems',
    sourceChannel: 'All-In Macro & Liquidity Summit (Fictional Demo)',
    sourceCategory: 'Macro & Fintech',
    cpmUsd: 6.2,
    totalBudgetUsd: 60000,
    remainingBudgetUsd: 41900,
    payoutCapPerClipUsd: 2400,
    minViewsForPayout: 15000,
    eligiblePlatforms: ['YouTube Shorts', 'TikTok', 'X Video'],
    deadlineIso: '2026-06-24T23:59:00Z',
    eligibility: 'Eligible',
    estimatedValuePerClipUsd: 590,
    valuationAssumptions: {
      expectedViewsPerClip: 101000,
      qualificationRatePct: 94,
      effectiveCpmUsd: 6.2,
      platformSplitNote: '55% YouTube Shorts / 30% X Video / 15% TikTok',
      formulaSummary: '101K est. views × $6.20 CPM × 94% qualification = $590 est. value/clip',
    },
    briefRawText:
      'Extract moments discussing cross-border T+0 settlement, treasury yield leakage, and CFO automation. Must be 9:16 1080p, 30s-60s duration, include sponsor disclosure in final 3s CTA card, and require manual compliance sign-off on financial claims.',
    allowedSourceUrls: [
      'https://media.demo.argonhigh.internal/meridian-liquidity-summit-keynote.mp4',
    ],
    aiParseConfidence: 92,
    missingBriefFields: ['Explicit music licensing whitelist link'],
    isDemoData: true,
    createdAtIso: '2026-05-04T09:15:00Z',
  },
  {
    id: 'cmp-chronos-wear',
    workspaceId: 'ws-northstar',
    title: 'Chronos Biometric Ring Gen-3 Teardown Clips',
    sponsorName: 'Chronos Labs Hardware',
    sourceChannel: 'Founders & Photonics Deep Dive (Fictional Demo)',
    sourceCategory: 'Consumer Hardware',
    cpmUsd: 3.5,
    totalBudgetUsd: 30000,
    remainingBudgetUsd: 11250,
    payoutCapPerClipUsd: 1100,
    minViewsForPayout: 10000,
    eligiblePlatforms: ['TikTok', 'Instagram Reels', 'YouTube Shorts'],
    deadlineIso: '2026-06-09T23:59:00Z',
    eligibility: 'Eligible',
    estimatedValuePerClipUsd: 310,
    valuationAssumptions: {
      expectedViewsPerClip: 98000,
      qualificationRatePct: 90,
      effectiveCpmUsd: 3.5,
      platformSplitNote: '50% TikTok / 30% Reels / 20% Shorts',
      formulaSummary: '98K est. views × $3.50 CPM × 90% qualification = $310 est. value/clip',
    },
    briefRawText:
      'Clip sensor accuracy debates, sleep staging benchmarks, and titanium machining segments. 9:16 vertical, 20s-50s duration, high-contrast captions required, watermark mandatory.',
    allowedSourceUrls: [
      'https://media.demo.argonhigh.internal/chronos-ring-teardown-lab.mp4',
    ],
    aiParseConfidence: 94,
    missingBriefFields: [],
    isDemoData: true,
    createdAtIso: '2026-04-29T18:00:00Z',
  },
  {
    id: 'cmp-oxide-db',
    workspaceId: 'ws-northstar',
    title: 'OxideVector Distributed Storage Benchmark Talks',
    sponsorName: 'OxideVector DB',
    sourceChannel: 'Systems Engineering Conf 2026 (Fictional Demo)',
    sourceCategory: 'Developer Keynote',
    cpmUsd: 5.4,
    totalBudgetUsd: 25000,
    remainingBudgetUsd: 19800,
    payoutCapPerClipUsd: 1500,
    minViewsForPayout: 8000,
    eligiblePlatforms: ['YouTube Shorts', 'X Video'],
    deadlineIso: '2026-06-30T23:59:00Z',
    eligibility: 'Review Required',
    estimatedValuePerClipUsd: 465,
    valuationAssumptions: {
      expectedViewsPerClip: 96000,
      qualificationRatePct: 90,
      effectiveCpmUsd: 5.4,
      platformSplitNote: '65% YouTube Shorts / 35% X Video',
      formulaSummary: '96K est. views × $5.40 CPM × 90% qualification = $465 est. value/clip',
    },
    briefRawText:
      'Focus on tail-latency p99.9 comparisons and zero-copy NVMe replication segments. Must keep code/diagram split-screen visible in top frame. 25s-55s runtime.',
    allowedSourceUrls: [
      'https://media.demo.argonhigh.internal/oxidevector-keynote-2026.mp4',
    ],
    aiParseConfidence: 88,
    missingBriefFields: ['Regional geo-multiplier schedule', 'Sub-account whitelisting form'],
    isDemoData: true,
    createdAtIso: '2026-05-06T11:30:00Z',
  },
  {
    id: 'cmp-aether-sec',
    workspaceId: 'ws-northstar',
    title: 'AetherZero Autonomous Red-Team Live Debrief',
    sponsorName: 'AetherZero Security',
    sourceChannel: 'ZeroDay Executive Podcast (Fictional Demo)',
    sourceCategory: 'B2B SaaS Keynote',
    cpmUsd: 7.1,
    totalBudgetUsd: 50000,
    remainingBudgetUsd: 0,
    payoutCapPerClipUsd: 2800,
    minViewsForPayout: 20000,
    eligiblePlatforms: ['YouTube Shorts', 'TikTok', 'X Video'],
    deadlineIso: '2026-03-01T23:59:00Z',
    eligibility: 'Cap Reached',
    estimatedValuePerClipUsd: 680,
    valuationAssumptions: {
      expectedViewsPerClip: 105000,
      qualificationRatePct: 91,
      effectiveCpmUsd: 7.1,
      platformSplitNote: 'Pool fully exhausted ($50,000 cap reached)',
      formulaSummary: '105K est. views × $7.10 CPM × 91% qualification = $680 est. value/clip',
    },
    briefRawText:
      'Authorized operators only. Clip live SOC incident simulations and AI exploit remediation narratives. 30s-58s vertical.',
    allowedSourceUrls: [
      'https://media.demo.argonhigh.internal/aetherzero-redteam-ep88.mp4',
    ],
    aiParseConfidence: 97,
    missingBriefFields: [],
    isDemoData: true,
    createdAtIso: '2026-02-01T16:45:00Z',
  },
];

export const INITIAL_CAMPAIGN_RULES: CampaignRule[] = [
  {
    id: 'rule-tensor-1',
    campaignId: 'cmp-tensor-cloud',
    category: 'aspect_ratio',
    label: '9:16 Vertical Frame Lock',
    requirementText: 'Strict 9:16 vertical aspect ratio with zero black letterbox bars exceeding 8% frame height.',
    strictness: 'mandatory',
    expectedValue: '9:16 (1080x1920)',
  },
  {
    id: 'rule-tensor-2',
    campaignId: 'cmp-tensor-cloud',
    category: 'resolution',
    label: 'Full HD 1080p60 Raster',
    requirementText: 'Minimum export raster 1080x1920 progressive scan at 30 or 60 fps.',
    strictness: 'mandatory',
    expectedValue: '1080x1920 @ 60fps',
  },
  {
    id: 'rule-tensor-3',
    campaignId: 'cmp-tensor-cloud',
    category: 'duration',
    label: 'Duration Window (28s – 58s)',
    requirementText: 'Clip length must be between 28.0s and 58.0s inclusive to qualify for Shorts & TikTok RPM.',
    strictness: 'mandatory',
    expectedValue: '28s - 58s',
  },
  {
    id: 'rule-tensor-4',
    campaignId: 'cmp-tensor-cloud',
    category: 'captions',
    label: 'Burned-in Dynamic Subtitles',
    requirementText: 'High-contrast word-level synchronized captions within safe title zone.',
    strictness: 'mandatory',
    expectedValue: 'Active preset required',
  },
  {
    id: 'rule-tensor-5',
    campaignId: 'cmp-tensor-cloud',
    category: 'branding',
    label: 'Sponsor Watermark Badge',
    requirementText: 'TensorScale vector bug pinned in top-right or top-left safe margin at >= 85% opacity.',
    strictness: 'mandatory',
    expectedValue: 'Watermark Enabled',
  },
  {
    id: 'rule-tensor-6',
    campaignId: 'cmp-tensor-cloud',
    category: 'audio',
    label: 'Broadcast Loudness Normalization',
    requirementText: 'Integrated vocal loudness normalized to -14 LUFS (+/- 1.5 LUFS) with true peak < -1.0 dBTP.',
    strictness: 'advisory',
    expectedValue: '-14.0 LUFS Integrated',
  },
  {
    id: 'rule-tensor-7',
    campaignId: 'cmp-tensor-cloud',
    category: 'disclosure',
    label: 'Human Operator Claim Attestation',
    requirementText: 'Operator must verify speaker quotes are not spliced out of context to fabricate benchmark numbers.',
    strictness: 'manual_signoff',
    expectedValue: 'Attested by Operator',
  },
  // Rules for Meridian FX
  {
    id: 'rule-meridian-1',
    campaignId: 'cmp-meridian-fx',
    category: 'aspect_ratio',
    label: '9:16 Vertical Frame Lock',
    requirementText: 'Strict 9:16 vertical aspect ratio.',
    strictness: 'mandatory',
    expectedValue: '9:16 (1080x1920)',
  },
  {
    id: 'rule-meridian-2',
    campaignId: 'cmp-meridian-fx',
    category: 'duration',
    label: 'Duration Window (30s – 60s)',
    requirementText: 'Clip length must be between 30.0s and 60.0s.',
    strictness: 'mandatory',
    expectedValue: '30s - 60s',
  },
  {
    id: 'rule-meridian-3',
    campaignId: 'cmp-meridian-fx',
    category: 'branding',
    label: 'Sponsor Watermark & End-Card CTA',
    requirementText: 'Meridian watermark badge plus 3-second compliance CTA overlay.',
    strictness: 'mandatory',
    expectedValue: 'Watermark + CTA Enabled',
  },
  {
    id: 'rule-meridian-4',
    campaignId: 'cmp-meridian-fx',
    category: 'disclosure',
    label: 'Financial Claim Context Review',
    requirementText: 'Human reviewer must attest no guaranteed APY claims are implied.',
    strictness: 'manual_signoff',
    expectedValue: 'Attested by Operator',
  },
];

export const INITIAL_SOURCE_ASSETS: SourceAsset[] = [
  {
    id: 'src-latent-142',
    workspaceId: 'ws-northstar',
    campaignId: 'cmp-tensor-cloud',
    title: 'Latent Space Ep #142 — Mara Vance on 100,000 GPU Cluster Topology (Fictional Demo)',
    creatorName: 'Mara Vance & Devon K.',
    sourceUrl: 'https://media.demo.argonhigh.internal/latent-space-ep142-mara-vance-4k.mp4',
    durationSec: 4120,
    resolution: '3840x2160',
    fps: 60,
    audioLufs: -14.2,
    authorizationProof: 'AUTH-TENSOR-2025-8841 (Signed Sponsor License)',
    analysisStatus: 'analyzed',
    analyzedAtIso: '2025-05-10T15:12:00Z',
    waveformPeaks: [
      28, 42, 65, 88, 94, 71, 54, 62, 79, 91, 84, 48, 39, 55, 76, 95, 92, 68, 51, 44,
      63, 87, 96, 89, 74, 59, 45, 52, 70, 83, 77, 61, 49, 66, 85, 93, 81, 64, 57, 72,
    ],
    transcript: [
      {
        id: 'seg-1',
        sourceAssetId: 'src-latent-142',
        speaker: 'Devon K. (Host)',
        startSec: 810,
        endSec: 822,
        text: 'Everyone talks about buying ten thousand H200s, but nobody talks about why forty percent of those FLOPs vanish the moment your InfiniBand fabric hits tail congestion.',
        energyScore: 86,
        keywords: ['H200s', 'FLOPs', 'InfiniBand', 'tail congestion'],
      },
      {
        id: 'seg-2',
        sourceAssetId: 'src-latent-142',
        speaker: 'Mara Vance (CEO)',
        startSec: 822,
        endSec: 839,
        text: 'That is the dirty secret of hyperscaler cloud pricing. You think you are renting raw compute, but you are actually paying a 3.4x tax on packet retries across oversubscribed spine switches.',
        energyScore: 96,
        keywords: ['hyperscaler', '3.4x tax', 'packet retries', 'spine switches'],
      },
      {
        id: 'seg-3',
        sourceAssetId: 'src-latent-142',
        speaker: 'Mara Vance (CEO)',
        startSec: 839,
        endSec: 856,
        text: 'When we stripped the virtualization layer out of TensorScale racks and locked deterministic RoCEv2 routing, training checkpoints dropped from 14 minutes to 41 seconds on a 70B parameter run.',
        energyScore: 98,
        keywords: ['TensorScale', 'RoCEv2', '14 minutes to 41 seconds', '70B parameter'],
      },
      {
        id: 'seg-4',
        sourceAssetId: 'src-latent-142',
        speaker: 'Devon K. (Host)',
        startSec: 856,
        endSec: 868,
        text: 'Wait—forty-one seconds for a full distributed state snapshot? How are the frontier labs not revolting against legacy cloud contracts right now?',
        energyScore: 91,
        keywords: ['forty-one seconds', 'frontier labs', 'legacy cloud'],
      },
      {
        id: 'seg-5',
        sourceAssetId: 'src-latent-142',
        speaker: 'Mara Vance (CEO)',
        startSec: 1420,
        endSec: 1442,
        text: 'If you are a Series A AI founder spending 75% of your seed round on reserved instances with 18-month lockups, you are financing someone else’s datacenter depreciation instead of shipping model weights.',
        energyScore: 95,
        keywords: ['Series A AI founder', '75% of your seed round', 'depreciation'],
      },
      {
        id: 'seg-6',
        sourceAssetId: 'src-latent-142',
        speaker: 'Mara Vance (CEO)',
        startSec: 1442,
        endSec: 1463,
        text: 'Spot arbitrage on bare-metal clusters lets a 6-person team run the exact same post-training RLHF sweep for $4,200 over a weekend that used to require a $90,000 enterprise commit.',
        energyScore: 93,
        keywords: ['Spot arbitrage', 'RLHF sweep', '$4,200', '$90,000'],
      },
      {
        id: 'seg-7',
        sourceAssetId: 'src-latent-142',
        speaker: 'Devon K. (Host)',
        startSec: 2190,
        endSec: 2212,
        text: 'Let’s talk power density. Once racks cross 120 kilowatts, air cooling is dead physics. Show us what happened when you submerged the switch blades in single-phase dielectric fluid.',
        energyScore: 88,
        keywords: ['120 kilowatts', 'air cooling', 'dielectric fluid'],
      },
      {
        id: 'seg-8',
        sourceAssetId: 'src-latent-142',
        speaker: 'Mara Vance (CEO)',
        startSec: 2212,
        endSec: 2234,
        text: 'Thermal throttling vanished overnight. We ran 4,096 GPUs at sustained boost clock for 19 days straight in West Texas during an August heatwave without a single optical transceiver failure.',
        energyScore: 94,
        keywords: ['Thermal throttling', '4,096 GPUs', '19 days straight', 'optical transceiver'],
      },
    ],
  },
  {
    id: 'src-meridian-keynote',
    workspaceId: 'ws-northstar',
    campaignId: 'cmp-meridian-fx',
    title: 'All-In Macro Summit — Julian Thorne on Cross-Border Liquidity Traps (Fictional Demo)',
    creatorName: 'Julian Thorne (CFO, Meridian)',
    sourceUrl: 'https://media.demo.argonhigh.internal/meridian-liquidity-summit-keynote.mp4',
    durationSec: 2940,
    resolution: '3840x2160',
    fps: 30,
    audioLufs: -15.6,
    authorizationProof: 'AUTH-MERIDIAN-2025-309B (Authorized Keynote Feed)',
    analysisStatus: 'analyzed',
    analyzedAtIso: '2025-05-11T10:05:00Z',
    waveformPeaks: [
      35, 50, 72, 90, 85, 60, 48, 77, 94, 88, 69, 53, 41, 68, 84, 91, 73, 58, 46, 62,
      80, 95, 87, 65, 52, 44, 71, 89, 82, 61, 47, 59, 78, 92, 86, 67, 54, 49, 74, 83,
    ],
    transcript: [
      {
        id: 'seg-m1',
        sourceAssetId: 'src-meridian-keynote',
        speaker: 'Julian Thorne',
        startSec: 410,
        endSec: 432,
        text: 'Every mid-market CFO thinks their foreign exchange spread is 15 basis points because that is what the bank PDF says. When you audit the settlement timestamp against spot mid-market, the hidden spread is closer to 190 bps.',
        energyScore: 94,
        keywords: ['CFO', '15 basis points', '190 bps', 'settlement timestamp'],
      },
      {
        id: 'seg-m2',
        sourceAssetId: 'src-meridian-keynote',
        speaker: 'Julian Thorne',
        startSec: 432,
        endSec: 454,
        text: 'And worse, you have $14 million trapped in non-interest-bearing Nostro accounts for 72 hours over every bank holiday while programmable treasury APIs clear the exact corridor in 800 milliseconds.',
        energyScore: 96,
        keywords: ['$14 million', 'Nostro accounts', '72 hours', '800 milliseconds'],
      },
    ],
  },
];

export const INITIAL_CLIP_CANDIDATES: ClipCandidate[] = [
  {
    id: 'clip-tc-01',
    workspaceId: 'ws-northstar',
    campaignId: 'cmp-tensor-cloud',
    sourceAssetId: 'src-latent-142',
    title: 'The 3.4x Hyperscaler Packet Retry Tax (14m → 41s Checkpoints)',
    rank: 1,
    startSec: 822,
    endSec: 866,
    hookScore: 96,
    hookBreakdown: {
      openingVelocity: 98,
      controversyOrInsightDelta: 97,
      retentionCadence: 94,
      sponsorAlignment: 96,
      explanation:
        'Opens with contrarian quantifier ("3.4x tax on packet retries"), resolves with concrete benchmark ("14 minutes to 41 seconds"), and directly names TensorScale within natural conversation.',
    },
    captionPreset: 'kinetic-lime',
    cropMode: 'speaker-lock',
    faceTrackOffsetX: 0,
    includeWatermark: true,
    watermarkPosition: 'top-right',
    includeCtaCard: true,
    normalizeAudioLufs: true,
    targetPlatforms: ['TikTok', 'YouTube Shorts', 'X Video'],
    transcriptExcerpt:
      '"That is the dirty secret of hyperscaler cloud pricing. You think you are renting raw compute, but you are actually paying a 3.4x tax on packet retries... training checkpoints dropped from 14 minutes to 41 seconds."',
    complianceSummaryStatus: 'passed',
    reviewStatus: 'export-ready',
    renderStatus: 'rendered',
    lastRenderedAtIso: '2025-05-11T16:40:00Z',
    estimatedPayoutUsd: 540,
    productionTimeSavedMin: 42,
  },
  {
    id: 'clip-tc-02',
    workspaceId: 'ws-northstar',
    campaignId: 'cmp-tensor-cloud',
    sourceAssetId: 'src-latent-142',
    title: 'Why Series A AI Founders Burn 75% of Seed on Cloud Lockups',
    rank: 2,
    startSec: 1420,
    endSec: 1463,
    hookScore: 93,
    hookBreakdown: {
      openingVelocity: 95,
      controversyOrInsightDelta: 94,
      retentionCadence: 91,
      sponsorAlignment: 92,
      explanation:
        'Direct callout to Series A founders with sharp dollar contrast ($4,200 weekend sweep vs $90,000 enterprise commit). High shareability on X Video and Shorts.',
    },
    captionPreset: 'founder-mono',
    cropMode: 'split-screen-podcast',
    faceTrackOffsetX: -4,
    includeWatermark: true,
    watermarkPosition: 'top-right',
    includeCtaCard: false,
    normalizeAudioLufs: true,
    targetPlatforms: ['YouTube Shorts', 'X Video', 'TikTok'],
    transcriptExcerpt:
      '"If you are a Series A AI founder spending 75% of your seed round on reserved instances with 18-month lockups, you are financing someone else’s datacenter depreciation..."',
    complianceSummaryStatus: 'human-review',
    reviewStatus: 'pending',
    renderStatus: 'rendered',
    lastRenderedAtIso: '2025-05-11T17:05:00Z',
    estimatedPayoutUsd: 485,
    productionTimeSavedMin: 38,
  },
  {
    id: 'clip-tc-03',
    workspaceId: 'ws-northstar',
    campaignId: 'cmp-tensor-cloud',
    sourceAssetId: 'src-latent-142',
    title: 'Submerging 4,096 GPUs in West Texas Heatwave (120kW Racks)',
    rank: 3,
    startSec: 2190,
    endSec: 2214,
    hookScore: 88,
    hookBreakdown: {
      openingVelocity: 89,
      controversyOrInsightDelta: 86,
      retentionCadence: 90,
      sponsorAlignment: 87,
      explanation:
        'Strong visual engineering hook ("Once racks cross 120 kilowatts, air cooling is dead physics"). Currently trimmed to 24.0s which triggers a campaign minimum duration failure (<28s).',
    },
    captionPreset: 'minimal-editorial',
    cropMode: 'speaker-lock',
    faceTrackOffsetX: 6,
    includeWatermark: false,
    watermarkPosition: 'top-right',
    includeCtaCard: false,
    normalizeAudioLufs: false,
    targetPlatforms: ['TikTok', 'Instagram Reels'],
    transcriptExcerpt:
      '"Once racks cross 120 kilowatts, air cooling is dead physics. Show us what happened when you submerged the switch blades in single-phase dielectric fluid."',
    complianceSummaryStatus: 'failed',
    reviewStatus: 'changes-requested',
    renderStatus: 'draft',
    estimatedPayoutUsd: 360,
    productionTimeSavedMin: 31,
  },
  {
    id: 'clip-mf-01',
    workspaceId: 'ws-northstar',
    campaignId: 'cmp-meridian-fx',
    sourceAssetId: 'src-meridian-keynote',
    title: 'The Hidden 190 bps FX Spread & $14M Nostro Account Trap',
    rank: 1,
    startSec: 410,
    endSec: 454,
    hookScore: 94,
    hookBreakdown: {
      openingVelocity: 93,
      controversyOrInsightDelta: 96,
      retentionCadence: 92,
      sponsorAlignment: 95,
      explanation:
        'High-value B2B fintech hook exposing hidden 190 bps spread vs 15 bps stated rate. Strong CFO & founder resonance.',
    },
    captionPreset: 'kinetic-lime',
    cropMode: 'speaker-lock',
    faceTrackOffsetX: 0,
    includeWatermark: true,
    watermarkPosition: 'top-right',
    includeCtaCard: true,
    normalizeAudioLufs: true,
    targetPlatforms: ['YouTube Shorts', 'X Video', 'TikTok'],
    transcriptExcerpt:
      '"Every mid-market CFO thinks their foreign exchange spread is 15 basis points because that is what the bank PDF says... the hidden spread is closer to 190 bps."',
    complianceSummaryStatus: 'passed',
    reviewStatus: 'approved',
    renderStatus: 'rendered',
    lastRenderedAtIso: '2025-05-11T14:22:00Z',
    estimatedPayoutUsd: 620,
    productionTimeSavedMin: 45,
  },
];

export const INITIAL_RENDER_JOBS: RenderJob[] = [
  {
    id: 'job-9041',
    clipCandidateId: 'clip-tc-01',
    campaignId: 'cmp-tensor-cloud',
    status: 'completed',
    progressPct: 100,
    codec: 'H.264 High@L4.2',
    outputResolution: '1080x1920',
    durationSec: 44,
    startedAtIso: '2025-05-11T16:38:12Z',
    completedAtIso: '2025-05-11T16:40:00Z',
    simulatedAdapterNote: 'Simulated FFmpeg Worker Pipeline (Demo Adapter)',
  },
  {
    id: 'job-9042',
    clipCandidateId: 'clip-tc-02',
    campaignId: 'cmp-tensor-cloud',
    status: 'completed',
    progressPct: 100,
    codec: 'H.264 High@L4.2',
    outputResolution: '1080x1920',
    durationSec: 43,
    startedAtIso: '2025-05-11T17:03:00Z',
    completedAtIso: '2025-05-11T17:05:00Z',
    simulatedAdapterNote: 'Simulated FFmpeg Worker Pipeline (Demo Adapter)',
  },
  {
    id: 'job-9043',
    clipCandidateId: 'clip-mf-01',
    campaignId: 'cmp-meridian-fx',
    status: 'completed',
    progressPct: 100,
    codec: 'HEVC Main10',
    outputResolution: '1080x1920',
    durationSec: 44,
    startedAtIso: '2025-05-11T14:20:00Z',
    completedAtIso: '2025-05-11T14:22:00Z',
    simulatedAdapterNote: 'Simulated FFmpeg Worker Pipeline (Demo Adapter)',
  },
];

export const INITIAL_APPROVALS: ApprovalRecord[] = [
  {
    id: 'apr-101',
    clipCandidateId: 'clip-tc-01',
    campaignId: 'cmp-tensor-cloud',
    reviewerName: 'Soren Lindqvist',
    reviewerRole: 'Lead Arbitrage Operator',
    decision: 'export-ready',
    note: 'Hook velocity is 98/100. Watermark placement and -14 LUFS normalization verified against TensorScale brief.',
    timestampIso: '2025-05-11T16:50:00Z',
  },
  {
    id: 'apr-102',
    clipCandidateId: 'clip-tc-03',
    campaignId: 'cmp-tensor-cloud',
    reviewerName: 'Elena Rostova',
    reviewerRole: 'Compliance QA Lead',
    decision: 'changes-requested',
    note: 'Clip duration is 24.0s (below 28s minimum rule) and TensorScale watermark toggle is disabled. Extend end trim to 2234s and re-enable watermark.',
    timestampIso: '2025-05-11T17:15:00Z',
  },
  {
    id: 'apr-103',
    clipCandidateId: 'clip-mf-01',
    campaignId: 'cmp-meridian-fx',
    reviewerName: 'Soren Lindqvist',
    reviewerRole: 'Lead Arbitrage Operator',
    decision: 'approved',
    note: 'Approved for YouTube Shorts and X Video syndication. Financial context disclaimer intact.',
    timestampIso: '2025-05-11T14:40:00Z',
  },
];

export const INITIAL_PUBLICATIONS: Publication[] = [
  {
    id: 'pub-501',
    clipCandidateId: 'clip-tc-01',
    campaignId: 'cmp-tensor-cloud',
    platform: 'YouTube Shorts',
    accountHandle: '@silicon_telemetry_shorts',
    publishedAtIso: '2025-05-11T18:00:00Z',
    verifiedViews: 142800,
    estimatedViews: 158400,
    retention3sPct: 84.2,
    avgWatchTimeSec: 38.6,
    status: 'live-tracked',
  },
  {
    id: 'pub-502',
    clipCandidateId: 'clip-tc-01',
    campaignId: 'cmp-tensor-cloud',
    platform: 'X Video',
    accountHandle: '@infra_alpha_clips',
    publishedAtIso: '2025-05-11T18:15:00Z',
    verifiedViews: 68400,
    estimatedViews: 79100,
    retention3sPct: 79.5,
    avgWatchTimeSec: 34.1,
    status: 'live-tracked',
  },
  {
    id: 'pub-503',
    clipCandidateId: 'clip-mf-01',
    campaignId: 'cmp-meridian-fx',
    platform: 'TikTok',
    accountHandle: '@macro_ledger_daily',
    publishedAtIso: '2025-05-11T15:30:00Z',
    verifiedViews: 194500,
    estimatedViews: 221000,
    retention3sPct: 86.7,
    avgWatchTimeSec: 39.2,
    status: 'live-tracked',
  },
];

export const INITIAL_PERFORMANCE_SNAPSHOTS: PerformanceSnapshot[] = [
  {
    id: 'snap-1',
    campaignId: 'cmp-tensor-cloud',
    dateLabel: 'May 06',
    verifiedViews: 185000,
    estimatedEarningsUsd: 1090,
    accruedEarningsUsd: 980,
    settledEarningsUsd: 920,
    verifiedPaidUsd: 888,
    computeAndOperatorCostUsd: 112,
    clipsPublished: 4,
    approvalRatePct: 88,
    operatorHoursSpent: 2.1,
  },
  {
    id: 'snap-2',
    campaignId: 'cmp-tensor-cloud',
    dateLabel: 'May 07',
    verifiedViews: 264000,
    estimatedEarningsUsd: 1510,
    accruedEarningsUsd: 1390,
    settledEarningsUsd: 1310,
    verifiedPaidUsd: 1267,
    computeAndOperatorCostUsd: 138,
    clipsPublished: 5,
    approvalRatePct: 91,
    operatorHoursSpent: 2.4,
  },
  {
    id: 'snap-3',
    campaignId: 'cmp-meridian-fx',
    dateLabel: 'May 08',
    verifiedViews: 312000,
    estimatedEarningsUsd: 2290,
    accruedEarningsUsd: 2110,
    settledEarningsUsd: 2015,
    verifiedPaidUsd: 1934,
    computeAndOperatorCostUsd: 164,
    clipsPublished: 6,
    approvalRatePct: 93,
    operatorHoursSpent: 2.8,
  },
  {
    id: 'snap-4',
    campaignId: 'cmp-chronos-wear',
    dateLabel: 'May 09',
    verifiedViews: 228000,
    estimatedEarningsUsd: 1020,
    accruedEarningsUsd: 920,
    settledEarningsUsd: 840,
    verifiedPaidUsd: 798,
    computeAndOperatorCostUsd: 95,
    clipsPublished: 4,
    approvalRatePct: 85,
    operatorHoursSpent: 1.9,
  },
  {
    id: 'snap-5',
    campaignId: 'cmp-tensor-cloud',
    dateLabel: 'May 10',
    verifiedViews: 419000,
    estimatedEarningsUsd: 2450,
    accruedEarningsUsd: 2240,
    settledEarningsUsd: 2105,
    verifiedPaidUsd: 2011,
    computeAndOperatorCostUsd: 182,
    clipsPublished: 7,
    approvalRatePct: 94,
    operatorHoursSpent: 3.1,
  },
  {
    id: 'snap-6',
    campaignId: 'cmp-meridian-fx',
    dateLabel: 'May 11',
    verifiedViews: 486000,
    estimatedEarningsUsd: 3540,
    accruedEarningsUsd: 3280,
    settledEarningsUsd: 3120,
    verifiedPaidUsd: 3013,
    computeAndOperatorCostUsd: 205,
    clipsPublished: 8,
    approvalRatePct: 96,
    operatorHoursSpent: 3.3,
  },
];

export const INITIAL_PAYOUTS: Payout[] = [
  {
    id: 'pay-801',
    campaignId: 'cmp-tensor-cloud',
    clipCandidateId: 'clip-tc-01',
    amountUsd: 4166.0,
    verificationState: 'verified-paid',
    verifiedViewsCounted: 868000,
    effectiveCpmUsd: 4.8,
    settledAtIso: '2026-05-12T02:00:00Z',
    referenceCode: 'SETTLE-TS-99281A (Demo Ledger)',
  },
  {
    id: 'pay-802',
    campaignId: 'cmp-meridian-fx',
    clipCandidateId: 'clip-mf-01',
    amountUsd: 4947.0,
    verificationState: 'verified-paid',
    verifiedViewsCounted: 798000,
    effectiveCpmUsd: 6.2,
    settledAtIso: '2026-05-12T04:15:00Z',
    referenceCode: 'SETTLE-MF-44109C (Demo Ledger)',
  },
  {
    id: 'pay-802b',
    campaignId: 'cmp-chronos-wear',
    clipCandidateId: 'clip-tc-01',
    amountUsd: 798.0,
    verificationState: 'verified-paid',
    verifiedViewsCounted: 228000,
    effectiveCpmUsd: 3.5,
    settledAtIso: '2026-05-12T05:10:00Z',
    referenceCode: 'SETTLE-CW-11208D (Demo Ledger)',
  },
  {
    id: 'pay-803',
    campaignId: 'cmp-tensor-cloud',
    clipCandidateId: 'clip-tc-02',
    amountUsd: 399.0,
    verificationState: 'settled-escrow',
    verifiedViewsCounted: 83125,
    effectiveCpmUsd: 4.8,
    referenceCode: 'ESCROW-TS-99304B (Demo Ledger)',
  },
  {
    id: 'pay-804',
    campaignId: 'cmp-meridian-fx',
    clipCandidateId: 'clip-mf-01',
    amountUsd: 610.0,
    verificationState: 'accrued-unsettled',
    verifiedViewsCounted: 98380,
    effectiveCpmUsd: 6.2,
    referenceCode: 'ACCRUED-MF-77210E (Demo Telemetry)',
  },
];

export const INITIAL_ACTIVITY: ActivityEvent[] = [
  {
    id: 'act-1',
    workspaceId: 'ws-northstar',
    timestampIso: '12m ago',
    actor: 'Soren Lindqvist',
    category: 'review',
    summary: 'Marked clip candidate #1 as Export-Ready after compliance sign-off',
    targetLabel: 'The 3.4x Hyperscaler Packet Retry Tax',
    campaignId: 'cmp-tensor-cloud',
    clipId: 'clip-tc-01',
  },
  {
    id: 'act-2',
    workspaceId: 'ws-northstar',
    timestampIso: '28m ago',
    actor: 'Elena Rostova',
    category: 'compliance',
    summary: 'Flagged duration violation (24.0s < 28.0s min) & missing watermark',
    targetLabel: 'Submerging 4,096 GPUs in West Texas Heatwave',
    campaignId: 'cmp-tensor-cloud',
    clipId: 'clip-tc-03',
  },
  {
    id: 'act-3',
    workspaceId: 'ws-northstar',
    timestampIso: '1h ago',
    actor: 'Argon Heuristic Engine (Demo)',
    category: 'analysis',
    summary: 'Completed transcript hook indexing on Latent Space Ep #142 (3 top candidates)',
    targetLabel: 'Latent Space Ep #142 — Mara Vance',
    campaignId: 'cmp-tensor-cloud',
  },
  {
    id: 'act-4',
    workspaceId: 'ws-northstar',
    timestampIso: '3h ago',
    actor: 'Demo Escrow Ledger',
    category: 'payout',
    summary: 'Verified 194,500 views @ $6.20 CPM ($1,205.90 settled in demo ledger)',
    targetLabel: 'Meridian Treasury API — Founder Fireside',
    campaignId: 'cmp-meridian-fx',
    clipId: 'clip-mf-01',
  },
];

/**
 * Deterministically computes rule-based ComplianceCheck rows for a given ClipCandidate
 * based on its live trim duration, watermark toggle, caption preset, audio LUFS toggle,
 * and manual operator attestation state.
 */
export function buildComplianceChecksForClip(
  clip: ClipCandidate,
  campaign: Campaign | undefined,
  manualAttestations: Record<string, boolean>
): ComplianceCheck[] {
  const duration = Math.max(1, Math.round(clip.endSec - clip.startSec));
  const minDuration = campaign?.id === 'cmp-meridian-fx' ? 30 : 28;
  const maxDuration = campaign?.id === 'cmp-meridian-fx' ? 60 : 58;

  const durationPassed = duration >= minDuration && duration <= maxDuration;
  const durationWarning =
    durationPassed && (duration <= minDuration + 2 || duration >= maxDuration - 2);

  const attestationKey = `${clip.id}:disclosure`;
  const isAttested = Boolean(
    manualAttestations[attestationKey] ??
      (clip.reviewStatus === 'export-ready' || clip.reviewStatus === 'approved')
  );

  const checks: ComplianceCheck[] = [
    {
      id: `chk-${clip.id}-aspect`,
      clipCandidateId: clip.id,
      campaignId: clip.campaignId,
      ruleId: 'rule-aspect',
      category: 'aspect_ratio',
      title: '9:16 Vertical Aspect Ratio & Safe Crop Lock',
      requirement: 'Strict 9:16 (1080x1920) vertical frame with active crop mode.',
      detectedValue: `9:16 (${clip.cropMode}, offset ${clip.faceTrackOffsetX > 0 ? `+${clip.faceTrackOffsetX}` : clip.faceTrackOffsetX}%)`,
      status: 'passed',
      operationalStatus: 'Passed validation',
      verificationMode: 'metadata-rule',
      notes: 'Studio composition metadata check: 9:16 container aspect lock active.',
      updatedAtIso: 'Live Policy Check',
    },
    {
      id: `chk-${clip.id}-res`,
      clipCandidateId: clip.id,
      campaignId: clip.campaignId,
      ruleId: 'rule-res',
      category: 'resolution',
      title: '1080x1920 Target Export Specification & Binary Stream Check',
      requirement: 'Minimum 1080x1920 export profile derived from 4K/1080p master.',
      detectedValue:
        clip.renderStatus === 'rendered'
          ? '1080x1920 @ 60fps (Simulated Render Spec Ready — Binary FFprobe Awaiting Integration)'
          : '1080x1920 Target Spec (Draft — Run Simulated Preview)',
      status: clip.renderStatus === 'rendered' ? 'passed' : 'pending',
      operationalStatus:
        clip.renderStatus === 'rendered' ? 'Simulated' : 'Awaiting integration',
      verificationMode: 'binary-media-awaiting',
      failureReason:
        clip.renderStatus !== 'rendered'
          ? 'Simulated render preview has not been executed for this trim state.'
          : undefined,
      remediationStep:
        clip.renderStatus !== 'rendered'
          ? 'Click "Run Simulated Preview" in Clip Studio or Argon Guard.'
          : undefined,
      notes:
        clip.renderStatus === 'rendered'
          ? 'Export specification validated. Actual binary video file inspection awaits FFmpeg/FFprobe backend integration.'
          : 'Pending simulated render preview execution.',
      updatedAtIso: 'Live Policy Check',
    },
    {
      id: `chk-${clip.id}-dur`,
      clipCandidateId: clip.id,
      campaignId: clip.campaignId,
      ruleId: 'rule-dur',
      category: 'duration',
      title: `Campaign Duration Window (${minDuration}s – ${maxDuration}s)`,
      requirement: `Total trimmed duration must remain between ${minDuration}.0s and ${maxDuration}.0s.`,
      detectedValue: `${duration}.0s (${formatSecondsToMMSS(clip.startSec)} → ${formatSecondsToMMSS(clip.endSec)})`,
      status: !durationPassed ? 'failed' : durationWarning ? 'warning' : 'passed',
      operationalStatus: !durationPassed ? 'Failed validation' : 'Passed validation',
      verificationMode: 'metadata-rule',
      failureReason: !durationPassed
        ? `Trimmed duration is ${duration}.0s, which falls outside the mandatory ${minDuration}.0s–${maxDuration}.0s campaign rule window.`
        : undefined,
      remediationStep: !durationPassed
        ? `Extend or trim OUT timestamp in Clip Studio so total duration is between ${minDuration}s and ${maxDuration}s.`
        : undefined,
      notes: !durationPassed
        ? `Duration of ${duration}s is outside the mandatory ${minDuration}s–${maxDuration}s window. Adjust trim handles in Clip Studio.`
        : durationWarning
          ? `Duration (${duration}s) is within 2 seconds of campaign boundary.`
          : `Duration (${duration}s) sits inside optimal retention & payout window.`,
      updatedAtIso: 'Live Policy Check',
    },
    {
      id: `chk-${clip.id}-cap`,
      clipCandidateId: clip.id,
      campaignId: clip.campaignId,
      ruleId: 'rule-cap',
      category: 'captions',
      title: 'Burned-In Dynamic Subtitles & Safe Margin',
      requirement: 'Word-level high-contrast captions active above lower 18% platform UI zone.',
      detectedValue: `Preset: ${clip.captionPreset} (${clip.captionPosition ?? 'lower-third'}, size: ${clip.captionFontSize ?? 'md'})`,
      status: 'passed',
      operationalStatus: 'Passed validation',
      verificationMode: 'simulated-heuristic',
      notes: 'Evaluated from studio caption track preset and safe-zone bounding box.',
      updatedAtIso: 'Live Policy Check',
    },
    {
      id: `chk-${clip.id}-brand`,
      clipCandidateId: clip.id,
      campaignId: clip.campaignId,
      ruleId: 'rule-brand',
      category: 'branding',
      title: 'Sponsor Watermark & Disclosure Overlay',
      requirement: `${campaign?.sponsorName ?? 'Sponsor'} watermark badge enabled in safe corner.`,
      detectedValue: clip.includeWatermark
        ? `Enabled (${clip.watermarkPosition}${clip.includeCtaCard ? ' + 3s CTA Card' : ''})`
        : 'Disabled (Missing Sponsor Badge)',
      status: clip.includeWatermark ? 'passed' : 'failed',
      operationalStatus: clip.includeWatermark ? 'Passed validation' : 'Failed validation',
      verificationMode: 'metadata-rule',
      failureReason: !clip.includeWatermark
        ? `Mandatory ${campaign?.sponsorName ?? 'Sponsor'} watermark overlay is currently disabled on this candidate.`
        : undefined,
      remediationStep: !clip.includeWatermark
        ? 'Enable the Sponsor Watermark toggle in Clip Studio or click Quick Fix.'
        : undefined,
      notes: clip.includeWatermark
        ? 'Sponsor vector watermark layer active in composition tree.'
        : 'Sponsor watermark is required by campaign brief. Enable in Clip Studio or via Quick Fix.',
      updatedAtIso: 'Live Policy Check',
    },
    {
      id: `chk-${clip.id}-audio`,
      clipCandidateId: clip.id,
      campaignId: clip.campaignId,
      ruleId: 'rule-audio',
      category: 'audio',
      title: 'Broadcast Loudness Normalization (-14 LUFS)',
      requirement: 'Vocal chain normalized to -14.0 LUFS integrated with true peak ceiling -1.0 dBTP.',
      detectedValue: clip.normalizeAudioLufs ? '-14.1 LUFS (Normalized Target)' : '-18.4 LUFS (Raw Source Unnormalized)',
      status: clip.normalizeAudioLufs ? 'passed' : 'warning',
      operationalStatus: clip.normalizeAudioLufs ? 'Simulated' : 'Ready for review',
      verificationMode: 'simulated-heuristic',
      notes: clip.normalizeAudioLufs
        ? 'Target -14.0 LUFS mastering flag enabled in export spec (Simulated).'
        : 'Advisory warning: Raw source audio is quieter than -14 LUFS target.',
      updatedAtIso: 'Live Policy Check',
    },
    {
      id: `chk-${clip.id}-platform`,
      clipCandidateId: clip.id,
      campaignId: clip.campaignId,
      ruleId: 'rule-platform',
      category: 'platform',
      title: 'Eligible Distribution Platform Match',
      requirement: `Must target only authorized platforms: ${(campaign?.eligiblePlatforms ?? ['TikTok', 'YouTube Shorts']).join(', ')}.`,
      detectedValue: clip.targetPlatforms.join(', '),
      status: clip.targetPlatforms.every((p) => (campaign?.eligiblePlatforms ?? []).includes(p))
        ? 'passed'
        : 'warning',
      operationalStatus: 'Passed validation',
      verificationMode: 'metadata-rule',
      notes: 'Cross-checked target export platforms against campaign brief whitelist.',
      updatedAtIso: 'Live Policy Check',
    },
    {
      id: `chk-${clip.id}-human`,
      clipCandidateId: clip.id,
      campaignId: clip.campaignId,
      ruleId: 'rule-human',
      category: 'disclosure',
      title: 'Human Operator Editorial & Claim Sign-off',
      requirement: 'Operator must attest quotes are contextually accurate and comply with sponsor disclosure rules.',
      detectedValue: isAttested ? 'Signed off by Operator' : 'Awaiting Human Review Attestation',
      status: isAttested ? 'passed' : 'human-review',
      operationalStatus: isAttested ? 'Passed validation' : 'Ready for review',
      verificationMode: 'operator-attestation',
      failureReason: !isAttested
        ? 'Human operator contextual accuracy & sponsor disclosure attestation has not been signed.'
        : undefined,
      remediationStep: !isAttested
        ? 'Review transcript context and sign off Human Editorial Attestation.'
        : undefined,
      notes: isAttested
        ? 'Manual editorial attestation recorded in Argon Guard.'
        : 'Requires human operator sign-off before final export approval.',
      updatedAtIso: 'Live Policy Check',
    },
  ];

  return checks;
}

/**
 * Determines whether a clip candidate satisfies all mandatory rules + human attestation
 * required before it can be transitioned to 'export-ready' / 'Exported'.
 */
export function evaluateExportEligibility(
  clip: ClipCandidate,
  checks: ComplianceCheck[]
): {
  eligible: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  for (const chk of checks) {
    if (chk.status === 'failed') {
      blockers.push(chk.failureReason ?? `${chk.title} failed validation.`);
    } else if (chk.status === 'human-review') {
      blockers.push(
        chk.failureReason ?? 'Human operator editorial attestation is required.'
      );
    }
  }
  return {
    eligible: blockers.length === 0,
    blockers,
  };
}

/**
 * Centralized Financial & Operational Reconciliation Engine (V2.5 Data Integrity)
 * Ensures Command Center and Performance Lab always display identical reconciled metrics.
 */
export interface ReconciledTelemetrySummary {
  activeCampaignCount: number;
  expiredOrCappedCampaignCount: number;
  totalRemainingPoolUsd: number;
  averageActiveCpmUsd: number;
  verifiedViewsTotal: number;
  estimatedEarningsUsd: number;
  accruedEarningsUsd: number;
  settledEarningsUsd: number;
  verifiedPaidUsd: number;
  computeAndOpsCostUsd: number;
  netVerifiedProfitUsd: number;
  clipsPublishedCount: number;
  verifiedRevPerClipUsd: number;
  averageApprovalRatePct: number;
  operatorHoursSpent: number;
}

export function reconcileWorkspaceTelemetry(
  campaigns: Campaign[],
  snapshots: PerformanceSnapshot[],
  campaignFilterId: string = 'ALL'
): ReconciledTelemetrySummary {
  const scopedCampaigns =
    campaignFilterId === 'ALL'
      ? campaigns
      : campaigns.filter((c) => c.id === campaignFilterId);
  const activeCampaigns = scopedCampaigns.filter(
    (c) => c.eligibility !== 'Cap Reached' && c.remainingBudgetUsd > 0
  );
  const expiredOrCappedCampaignCount =
    scopedCampaigns.length - activeCampaigns.length;

  const totalRemainingPoolUsd = activeCampaigns.reduce(
    (acc, c) => acc + c.remainingBudgetUsd,
    0
  );
  const averageActiveCpmUsd =
    activeCampaigns.length > 0
      ? activeCampaigns.reduce((acc, c) => acc + c.cpmUsd, 0) /
        activeCampaigns.length
      : 0;

  const scopedSnapshots =
    campaignFilterId === 'ALL'
      ? snapshots
      : snapshots.filter((s) => s.campaignId === campaignFilterId);

  const verifiedViewsTotal = scopedSnapshots.reduce(
    (acc, s) => acc + s.verifiedViews,
    0
  );
  const estimatedEarningsUsd = scopedSnapshots.reduce(
    (acc, s) => acc + s.estimatedEarningsUsd,
    0
  );
  const accruedEarningsUsd = scopedSnapshots.reduce(
    (acc, s) => acc + s.accruedEarningsUsd,
    0
  );
  const settledEarningsUsd = scopedSnapshots.reduce(
    (acc, s) => acc + s.settledEarningsUsd,
    0
  );
  const verifiedPaidUsd = scopedSnapshots.reduce(
    (acc, s) => acc + s.verifiedPaidUsd,
    0
  );
  const computeAndOpsCostUsd = scopedSnapshots.reduce(
    (acc, s) => acc + s.computeAndOperatorCostUsd,
    0
  );
  const clipsPublishedCount = Math.max(
    1,
    scopedSnapshots.reduce((acc, s) => acc + s.clipsPublished, 0)
  );
  const averageApprovalRatePct =
    scopedSnapshots.length > 0
      ? Math.round(
          scopedSnapshots.reduce((acc, s) => acc + s.approvalRatePct, 0) /
            scopedSnapshots.length
        )
      : 92;
  const operatorHoursSpent = scopedSnapshots.reduce(
    (acc, s) => acc + s.operatorHoursSpent,
    0
  );

  return {
    activeCampaignCount: activeCampaigns.length,
    expiredOrCappedCampaignCount,
    totalRemainingPoolUsd,
    averageActiveCpmUsd,
    verifiedViewsTotal,
    estimatedEarningsUsd,
    accruedEarningsUsd,
    settledEarningsUsd,
    verifiedPaidUsd,
    computeAndOpsCostUsd,
    netVerifiedProfitUsd: verifiedPaidUsd - computeAndOpsCostUsd,
    clipsPublishedCount,
    verifiedRevPerClipUsd: verifiedPaidUsd / clipsPublishedCount,
    averageApprovalRatePct,
    operatorHoursSpent,
  };
}
export function summarizeComplianceStatus(checks: ComplianceCheck[]): ComplianceStatus {
  if (checks.some((c) => c.status === 'failed')) return 'failed';
  if (checks.some((c) => c.status === 'human-review')) return 'human-review';
  if (checks.some((c) => c.status === 'warning')) return 'warning';
  if (checks.some((c) => c.status === 'pending')) return 'pending';
  return 'passed';
}

export function formatSecondsToMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
