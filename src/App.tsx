import React, { useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  Bell,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Command,
  Cpu,
  LayoutDashboard,
  Plus,
  Radar,
  Scissors,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserCheck,
} from "lucide-react"
import {
  ActivityEvent,
  ApprovalRecord,
  Campaign,
  CaptionPresetId,
  ClipCandidate,
  CropMode,
  NavSection,
  Payout,
  PerformanceSnapshot,
  Publication,
  RenderJob,
  ReviewDecision,
  SourceAsset,
  TranscriptSegment,
} from "./types/argon"
import {
  buildComplianceChecksForClip,
  INITIAL_ACTIVITY,
  INITIAL_APPROVALS,
  INITIAL_CAMPAIGN_RULES,
  INITIAL_CAMPAIGNS,
  INITIAL_CLIP_CANDIDATES,
  INITIAL_PAYOUTS,
  INITIAL_PERFORMANCE_SNAPSHOTS,
  INITIAL_PUBLICATIONS,
  INITIAL_RENDER_JOBS,
  INITIAL_SOURCE_ASSETS,
  INITIAL_WORKSPACES,
  summarizeComplianceStatus,
} from "./data/mockArgonData"
import { CommandCenterView } from "./components/CommandCenterView"
import { CampaignRadarView } from "./components/CampaignRadarView"
import { ClipStudioView } from "./components/ClipStudioView"
import { ArgonGuardView } from "./components/ArgonGuardView"
import { ReviewQueueView } from "./components/ReviewQueueView"
import { PerformanceLabView } from "./components/PerformanceLabView"
import { GlobalSearchModal, SettingsModal } from "./components/SystemModals"
import { DemoTag } from "./components/ArgonBadges"
import { VibeButton } from "./vibe/VibeComponents"
import {
  argonApiClient,
  BackendTranscriptionResponse,
} from "./services/argonApiClient"

const STORAGE_KEY = "argon_high_ops_state_v2_5"

interface PersistedState {
  workspaceId: string
  campaigns: Campaign[]
  sourceAssets: SourceAsset[]
  clips: ClipCandidate[]
  renderJobs: RenderJob[]
  approvals: ApprovalRecord[]
  payouts: Payout[]
  snapshots: PerformanceSnapshot[]
  publications: Publication[]
  activity: ActivityEvent[]
  manualAttestations: Record<string, boolean>
}

function loadInitialState(): PersistedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>
      if (parsed.campaigns && parsed.clips && parsed.sourceAssets) {
        return {
          workspaceId: parsed.workspaceId ?? INITIAL_WORKSPACES[0].id,
          campaigns: parsed.campaigns,
          sourceAssets: parsed.sourceAssets,
          clips: parsed.clips,
          renderJobs: parsed.renderJobs ?? INITIAL_RENDER_JOBS,
          approvals: parsed.approvals ?? INITIAL_APPROVALS,
          payouts: parsed.payouts ?? INITIAL_PAYOUTS,
          snapshots: parsed.snapshots ?? INITIAL_PERFORMANCE_SNAPSHOTS,
          publications: parsed.publications ?? INITIAL_PUBLICATIONS,
          activity: parsed.activity ?? INITIAL_ACTIVITY,
          manualAttestations: parsed.manualAttestations ?? {
            "clip-tc-01:disclosure": true,
            "clip-mf-01:disclosure": true,
          },
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return {
    workspaceId: INITIAL_WORKSPACES[0].id,
    campaigns: INITIAL_CAMPAIGNS,
    sourceAssets: INITIAL_SOURCE_ASSETS,
    clips: INITIAL_CLIP_CANDIDATES,
    renderJobs: INITIAL_RENDER_JOBS,
    approvals: INITIAL_APPROVALS,
    payouts: INITIAL_PAYOUTS,
    snapshots: INITIAL_PERFORMANCE_SNAPSHOTS,
    publications: INITIAL_PUBLICATIONS,
    activity: INITIAL_ACTIVITY,
    manualAttestations: {
      "clip-tc-01:disclosure": true,
      "clip-mf-01:disclosure": true,
    },
  }
}

export default function App() {
  const [state, setState] = useState<PersistedState>(loadInitialState)
  const [activeNav, setActiveNav] = useState<NavSection>("command-center")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Active selection pointers across Studio, Guard, and Queue
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(
    state.campaigns[0]?.id ?? "cmp-tensor-cloud",
  )
  const [selectedSourceId, setSelectedSourceId] = useState<string>(
    state.sourceAssets[0]?.id ?? "src-latent-142",
  )
  const [selectedClipId, setSelectedClipId] = useState<string>(
    state.clips[0]?.id ?? "clip-tc-01",
  )

  // Modals & Popovers
  const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [statusFeedbackBanner, setStatusFeedbackBanner] =
    useState<string | null>(null)

  // Persist state changes to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore quota errors
    }
  }, [state])

  // Synchronize active workspace context to API client
  useEffect(() => {
    argonApiClient.setWorkspaceId(state.workspaceId)
  }, [state.workspaceId])

  // Keyboard shortcut Cmd/Ctrl + K for global search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setIsSearchOpen((prev) => !prev)
      } else if (e.key === "Escape") {
        setIsSearchOpen(false)
        setShowNotifications(false)
        setShowProfileMenu(false)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const activeWorkspace = useMemo(
    () =>
      INITIAL_WORKSPACES.find((w) => w.id === state.workspaceId) ??
      INITIAL_WORKSPACES[0],
    [state.workspaceId],
  )

  const triggerFeedback = (msg: string) => {
    setStatusFeedbackBanner(msg)
    window.setTimeout(() => {
      setStatusFeedbackBanner((curr) => (curr === msg ? null : curr))
    }, 4000)
  }

  // Handlers for full interactive product loop
  const handleCreateCampaign = (
    newCampData: Omit<Campaign, "id" | "workspaceId" | "createdAtIso">,
  ) => {
    const newId = `cmp-${Date.now().toString().slice(-5)}`
    const newSourceId = `src-${Date.now().toString().slice(-5)}`
    const newClipId = `clip-${Date.now().toString().slice(-5)}`

    const createdCampaign: Campaign = {
      ...newCampData,
      id: newId,
      workspaceId: state.workspaceId,
      createdAtIso: new Date().toISOString(),
    }

    const createdSource: SourceAsset = {
      id: newSourceId,
      workspaceId: state.workspaceId,
      campaignId: newId,
      title: `${newCampData.sourceChannel}`,
      creatorName: newCampData.sponsorName,
      sourceUrl:
        newCampData.allowedSourceUrls[0] ??
        "https://media.demo.argonhigh.internal/custom-source.mp4",
      durationSec: 3420,
      resolution: "3840x2160",
      fps: 60,
      audioLufs: -14.1,
      authorizationProof: "AUTH-BRIEF-INGEST-2025 (Demo Verified)",
      analysisStatus: "analyzed",
      analyzedAtIso: new Date().toISOString(),
      waveformPeaks: [
        32, 48, 74, 92, 86, 63, 45, 78, 95, 89, 70, 52, 40, 65, 88, 94, 76, 58,
        49, 71, 85, 91, 79, 62, 47, 55, 73, 90, 84, 67,
      ],
      transcript: [
        {
          id: `seg-${newSourceId}-1`,
          sourceAssetId: newSourceId,
          speaker: "Keynote Speaker",
          startSec: 310,
          endSec: 332,
          text: `Why are engineering teams still tolerating 45-second cold starts when ${newCampData.sponsorName} provisions isolated compute nodes in 120 milliseconds with zero egress fees?`,
          energyScore: 95,
          keywords: [
            newCampData.sponsorName,
            "120 milliseconds",
            "zero egress",
          ],
        },
        {
          id: `seg-${newSourceId}-2`,
          sourceAssetId: newSourceId,
          speaker: "Host",
          startSec: 332,
          endSec: 352,
          text: "That benchmark alone changes the unit economics for every high-throughput API team running multi-region workloads.",
          energyScore: 91,
          keywords: ["unit economics", "multi-region"],
        },
      ],
    }

    const createdClip: ClipCandidate = {
      id: newClipId,
      workspaceId: state.workspaceId,
      campaignId: newId,
      sourceAssetId: newSourceId,
      title: `${newCampData.sponsorName}: 120ms Cold-Start vs Legacy Cloud Tax`,
      rank: 1,
      startSec: 310,
      endSec: 348,
      hookScore: 95,
      hookBreakdown: {
        openingVelocity: 96,
        controversyOrInsightDelta: 94,
        retentionCadence: 93,
        sponsorAlignment: 97,
        explanation:
          "Generated from ingested campaign brief. Strong technical contrast (45s vs 120ms) and direct sponsor mention.",
      },
      captionPreset: "kinetic-lime",
      cropMode: "speaker-lock",
      faceTrackOffsetX: 0,
      includeWatermark: true,
      watermarkPosition: "top-right",
      includeCtaCard: true,
      normalizeAudioLufs: true,
      targetPlatforms: newCampData.eligiblePlatforms,
      transcriptExcerpt: `"Why are engineering teams still tolerating 45-second cold starts when ${newCampData.sponsorName} provisions isolated compute nodes in 120 milliseconds..."`,
      complianceSummaryStatus: "human-review",
      reviewStatus: "pending",
      renderStatus: "draft",
      estimatedPayoutUsd: newCampData.estimatedValuePerClipUsd,
      productionTimeSavedMin: 40,
    }

    const newActivity: ActivityEvent = {
      id: `act-${Date.now()}`,
      workspaceId: state.workspaceId,
      timestampIso: "Just now",
      actor: "Soren Lindqvist",
      category: "campaign",
      summary: `Ingested campaign brief (${newCampData.aiParseConfidence}% parse confidence) & provisioned starter source`,
      targetLabel: createdCampaign.title,
      campaignId: newId,
      clipId: newClipId,
    }

    setState((prev) => ({
      ...prev,
      campaigns: [createdCampaign, ...prev.campaigns],
      sourceAssets: [createdSource, ...prev.sourceAssets],
      clips: [createdClip, ...prev.clips],
      activity: [newActivity, ...prev.activity],
    }))

    setSelectedCampaignId(newId)
    setSelectedSourceId(newSourceId)
    setSelectedClipId(newClipId)
    setActiveNav("clip-studio")
    triggerFeedback(
      `Created campaign "${createdCampaign.title}" and loaded its source feed in Clip Studio.`,
    )
  }

  const handleAddSourceAsset = (payload: {
    campaignId: string
    title: string
    creatorName: string
    sourceUrl: string
    authorizationProof: string
    sourceAssetId?: string
    durationSec?: number
    resolution?: string
    fps?: number
    audioLufs?: number
  }) => {
    const isLive = Boolean(payload.sourceAssetId)
    const newSourceId =
      payload.sourceAssetId || `src-${Date.now().toString().slice(-5)}`
    const newClipId = `clip-${Date.now().toString().slice(-5)}`
    const cmp = state.campaigns.find((c) => c.id === payload.campaignId)
    const duration = payload.durationSec ?? 2760

    const newSource: SourceAsset = {
      id: newSourceId,
      workspaceId: state.workspaceId,
      campaignId: payload.campaignId,
      title: payload.title,
      creatorName: payload.creatorName,
      sourceUrl: payload.sourceUrl,
      durationSec: duration,
      resolution: payload.resolution as any || "1920x1080",
      fps: payload.fps as any || 30,
      audioLufs: payload.audioLufs ?? -14.3,
      authorizationProof: payload.authorizationProof,
      analysisStatus: isLive ? "unprocessed" : "analyzed",
      analyzedAtIso: isLive ? undefined : new Date().toISOString(),
      waveformPeaks: isLive
        ? []
        : [
            40, 62, 85, 93, 77, 54, 49, 68, 90, 96, 81, 60, 44, 58, 79, 92, 87,
            65, 51, 69, 84, 91, 73, 56, 48, 64, 82, 89, 75, 59,
          ],
      transcript: isLive
        ? []
        : [
            {
              id: `seg-${newSourceId}-1`,
              sourceAssetId: newSourceId,
              speaker: payload.creatorName,
              startSec: 510,
              endSec: 534,
              text: "When you strip away legacy orchestration overhead and pin memory bandwidth directly to the inference kernel, throughput per dollar jumps 2.9x overnight.",
              energyScore: 95,
              keywords: ["orchestration", "inference kernel", "2.9x overnight"],
            },
            {
              id: `seg-${newSourceId}-2`,
              sourceAssetId: newSourceId,
              speaker: "Host",
              startSec: 534,
              endSec: 550,
              text: "Let’s put real numbers on that—what does a 2.9x throughput multiplier mean for a production cluster running twenty-four seven?",
              energyScore: 90,
              keywords: ["2.9x throughput", "production cluster"],
            },
          ],
    }

    const newClip: ClipCandidate = {
      id: newClipId,
      workspaceId: state.workspaceId,
      campaignId: payload.campaignId,
      sourceAssetId: newSourceId,
      title: isLive
        ? `${payload.title} (Draft Candidate)`
        : `${payload.creatorName}: 2.9x Inference Kernel Throughput Multiplier`,
      rank: 1,
      startSec: isLive ? 0 : 510,
      endSec: isLive ? Math.min(30, Math.max(1, Math.round(duration))) : 548,
      hookScore: isLive ? 0 : 94,
      hookBreakdown: isLive
        ? {
            openingVelocity: 0,
            controversyOrInsightDelta: 0,
            retentionCadence: 0,
            sponsorAlignment: 0,
            explanation:
              "Awaiting faster-whisper speech transcription and acoustic energy ranking.",
          }
        : {
            openingVelocity: 95,
            controversyOrInsightDelta: 93,
            retentionCadence: 92,
            sponsorAlignment: 95,
            explanation:
              'High-energy technical claim ("throughput per dollar jumps 2.9x overnight") with strong host follow-up.',
          },
      captionPreset: "kinetic-lime",
      cropMode: "speaker-lock",
      faceTrackOffsetX: 0,
      includeWatermark: true,
      watermarkPosition: "top-right",
      includeCtaCard: true,
      normalizeAudioLufs: true,
      targetPlatforms: cmp?.eligiblePlatforms ?? ["TikTok", "YouTube Shorts"],
      transcriptExcerpt: isLive
        ? "Awaiting AI transcription & acoustic velocity analysis..."
        : '"When you strip away legacy orchestration overhead and pin memory bandwidth directly to the inference kernel, throughput per dollar jumps 2.9x overnight."',
      complianceSummaryStatus: isLive ? "pending" : "human-review",
      reviewStatus: "pending",
      renderStatus: "draft",
      estimatedPayoutUsd: cmp?.estimatedValuePerClipUsd ?? 450,
      productionTimeSavedMin: isLive ? 0 : 39,
    }

    setState((prev) => ({
      ...prev,
      sourceAssets: [newSource, ...prev.sourceAssets],
      clips: [newClip, ...prev.clips],
      activity: [
        {
          id: `act-${Date.now()}`,
          workspaceId: prev.workspaceId,
          timestampIso: "Just now",
          actor: "Soren Lindqvist",
          category: "analysis",
          summary: isLive
            ? `Uploaded authoritative source video (${payload.resolution || "MP4"}, ${Math.round(duration)}s) & registered ID ${newSourceId}`
            : `Added authorized source asset & indexed initial clip candidate`,
          targetLabel: payload.title,
          campaignId: payload.campaignId,
          clipId: newClipId,
        },
        ...prev.activity,
      ],
    }))

    setSelectedSourceId(newSourceId)
    setSelectedClipId(newClipId)
  }

  const handleApplyAnalysisResult = (
    sourceId: string,
    result: BackendTranscriptionResponse,
  ) => {
    const source = state.sourceAssets.find((s) => s.id === sourceId)
    const cmp = source
      ? state.campaigns.find((c) => c.id === source.campaignId)
      : undefined
    const campaignId = source?.campaignId || state.selectedCampaignId

    const mappedTranscript: TranscriptSegment[] = (
      result.full_transcript || []
    ).map((seg, idx) => ({
      id: seg.id || `seg-${sourceId}-${idx + 1}`,
      sourceAssetId: sourceId,
      speaker: seg.speaker || source?.creatorName || "Speaker",
      startSec: seg.start_sec,
      endSec: seg.end_sec,
      text: seg.text,
      energyScore: Math.round(seg.energy_score || 0),
      keywords: seg.keywords || [],
    }))

    const newClips: ClipCandidate[] = (result.candidates || []).map(
      (cand, idx) => {
        const cropMode: CropMode =
          cand.suggested_crop_mode === "split-screen-podcast" ||
          cand.suggested_crop_mode === "dynamic-pan" ||
          cand.suggested_crop_mode === "center-fixed"
            ? cand.suggested_crop_mode as CropMode
            : "speaker-lock"

        const captionPreset: CaptionPresetId =
          cand.suggested_caption_preset === "founder-mono" ||
          cand.suggested_caption_preset === "minimal-editorial" ||
          cand.suggested_caption_preset === "high-contrast-box"
            ? cand.suggested_caption_preset as CaptionPresetId
            : "kinetic-lime"

        return {
          id: cand.candidate_id || `clip-${sourceId}-c${idx + 1}`,
          workspaceId: state.workspaceId,
          campaignId: campaignId,
          sourceAssetId: sourceId,
          title: cand.title,
          rank: cand.rank || idx + 1,
          startSec: cand.start_sec,
          endSec: cand.end_sec,
          hookScore: cand.hook_score,
          hookBreakdown: {
            openingVelocity: cand.hook_breakdown.opening_velocity,
            controversyOrInsightDelta:
              cand.hook_breakdown.controversy_or_insight_delta,
            retentionCadence: cand.hook_breakdown.retention_cadence,
            sponsorAlignment: cand.hook_breakdown.sponsor_alignment,
            explanation: cand.hook_breakdown.explanation,
          },
          captionPreset,
          cropMode,
          faceTrackOffsetX: 0,
          includeWatermark: true,
          watermarkPosition: "top-right",
          includeCtaCard: true,
          normalizeAudioLufs: true,
          targetPlatforms: cmp?.eligiblePlatforms ?? [
            "TikTok",
            "YouTube Shorts",
          ],
          transcriptExcerpt: cand.transcript_excerpt || "",
          complianceSummaryStatus: "pending",
          reviewStatus: "pending",
          renderStatus: "draft",
          estimatedPayoutUsd: cmp?.estimatedValuePerClipUsd ?? 450,
          productionTimeSavedMin: 35 + idx * 5,
        }
      },
    )

    setState((prev) => {
      const updatedSourceAssets = prev.sourceAssets.map((s) => {
        if (s.id !== sourceId) return s
        return {
          ...s,
          analysisStatus: "analyzed" as const,
          analyzedAtIso: new Date().toISOString(),
          durationSec:
            result.duration_sec > 0 ? result.duration_sec : s.durationSec,
          transcript: mappedTranscript,
        }
      })

      const otherClips = prev.clips.filter((c) => c.sourceAssetId !== sourceId)
      const updatedClips =
        newClips.length > 0 ? [...otherClips, ...newClips] : prev.clips

      return {
        ...prev,
        sourceAssets: updatedSourceAssets,
        clips: updatedClips,
        activity: [
          {
            id: `act-${Date.now()}`,
            workspaceId: prev.workspaceId,
            timestampIso: "Just now",
            actor: "faster-whisper AI Engine",
            category: "analysis",
            summary: `Generated ${newClips.length} ranked candidate cuts from spoken media`,
            targetLabel: source?.title || sourceId,
            campaignId: campaignId,
            clipId: newClips[0]?.id,
          },
          ...prev.activity,
        ],
      }
    })

    if (newClips.length > 0) {
      setSelectedClipId(newClips[0].id)
    }
  }

  const handleUpdateClip = (
    clipId: string,
    updater: (prev: ClipCandidate) => ClipCandidate,
  ) => {
    setState((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === clipId ? updater(c) : c)),
    }))
  }

  const handleTriggerSimulatedAnalysis = (sourceId: string) => {
    const source = state.sourceAssets.find((s) => s.id === sourceId)
    if (!source) return
    const cmp = state.campaigns.find((c) => c.id === source.campaignId)
    const existingForSource = state.clips.filter(
      (c) => c.sourceAssetId === sourceId,
    )
    const nextRank = existingForSource.length + 1
    const newClipId = `clip-sim-${Date.now().toString().slice(-4)}`

    const discoveredClip: ClipCandidate = {
      id: newClipId,
      workspaceId: state.workspaceId,
      campaignId: source.campaignId,
      sourceAssetId: sourceId,
      title: `Discovered Hook #${nextRank}: Zero-Copy Interconnects vs Tail Latency`,
      rank: nextRank,
      startSec: 810,
      endSec: 848,
      hookScore: 95,
      hookBreakdown: {
        openingVelocity: 97,
        controversyOrInsightDelta: 95,
        retentionCadence: 93,
        sponsorAlignment: 95,
        explanation:
          "Identified by simulated acoustic & semantic hook pass: high-contrast opening question on 40% FLOP loss during InfiniBand tail congestion.",
      },
      captionPreset: "kinetic-lime",
      cropMode: "speaker-lock",
      faceTrackOffsetX: 0,
      includeWatermark: true,
      watermarkPosition: "top-right",
      includeCtaCard: true,
      normalizeAudioLufs: true,
      targetPlatforms: cmp?.eligiblePlatforms ?? ["TikTok", "YouTube Shorts"],
      transcriptExcerpt:
        '"Everyone talks about buying ten thousand H200s, but nobody talks about why forty percent of those FLOPs vanish the moment your InfiniBand fabric hits tail congestion."',
      complianceSummaryStatus: "passed",
      reviewStatus: "pending",
      renderStatus: "rendered",
      lastRenderedAtIso: new Date().toISOString(),
      estimatedPayoutUsd: cmp?.estimatedValuePerClipUsd ?? 440,
      productionTimeSavedMin: 41,
    }

    setState((prev) => ({
      ...prev,
      clips: [...prev.clips, discoveredClip],
      activity: [
        {
          id: `act-${Date.now()}`,
          workspaceId: prev.workspaceId,
          timestampIso: "Just now",
          actor: "Argon Heuristic Engine (Sim)",
          category: "analysis",
          summary: `Extracted new high-conviction candidate (Hook Score 95) from ${source.title}`,
          targetLabel: discoveredClip.title,
          campaignId: source.campaignId,
          clipId: newClipId,
        },
        ...prev.activity,
      ],
    }))
    setSelectedClipId(newClipId)
  }

  const handleTriggerSimulatedRender = (clipId: string) => {
    const clip = state.clips.find((c) => c.id === clipId)
    if (!clip) return
    const cmp = state.campaigns.find((c) => c.id === clip.campaignId)
    const dur = Math.max(1, Math.round(clip.endSec - clip.startSec))

    const newJob: RenderJob = {
      id: `job-${Date.now().toString().slice(-4)}`,
      clipCandidateId: clip.id,
      campaignId: clip.campaignId,
      status: "completed",
      progressPct: 100,
      codec: "H.264 High@L4.2",
      outputResolution: "1080x1920",
      durationSec: dur,
      startedAtIso: new Date().toISOString(),
      completedAtIso: new Date().toISOString(),
      simulatedAdapterNote: "Simulated FFmpeg Worker Pipeline (Demo Adapter)",
    }

    setState((prev) => {
      const nextClips = prev.clips.map((c) => {
        if (c.id !== clipId) return c
        const updated: ClipCandidate = {
          ...c,
          renderStatus: "rendered",
          lastRenderedAtIso: new Date().toISOString(),
        }
        updated.complianceSummaryStatus = summarizeComplianceStatus(
          buildComplianceChecksForClip(updated, cmp, prev.manualAttestations),
        )
        return updated
      })

      return {
        ...prev,
        clips: nextClips,
        renderJobs: [newJob, ...prev.renderJobs],
        activity: [
          {
            id: `act-${Date.now()}`,
            workspaceId: prev.workspaceId,
            timestampIso: "Just now",
            actor: "Simulated Render Worker",
            category: "render",
            summary: `Completed 9:16 vertical export (${dur}s, 1080x1920 @ 60fps)`,
            targetLabel: clip.title,
            campaignId: clip.campaignId,
            clipId: clip.id,
          },
          ...prev.activity,
        ],
      }
    })
  }

  const handleToggleManualAttestation = (clipId: string, attested: boolean) => {
    setState((prev) => {
      const nextAttestations = {
        ...prev.manualAttestations,
        [`${clipId}:disclosure`]: attested,
      }
      const nextClips = prev.clips.map((c) => {
        if (c.id !== clipId) return c
        const cmp = prev.campaigns.find((cam) => cam.id === c.campaignId)
        const nextStatus = summarizeComplianceStatus(
          buildComplianceChecksForClip(c, cmp, nextAttestations),
        )
        return {
          ...c,
          complianceSummaryStatus: nextStatus,
        }
      })
      return {
        ...prev,
        manualAttestations: nextAttestations,
        clips: nextClips,
      }
    })
    triggerFeedback(
      attested
        ? "Human editorial & disclosure attestation signed off in Argon Guard."
        : "Human editorial attestation revoked.",
    )
  }

  const handleSubmitReviewDecision = (
    clipId: string,
    decision: ReviewDecision,
    note: string,
  ) => {
    const clip = state.clips.find((c) => c.id === clipId)
    if (!clip) return

    const newRecord: ApprovalRecord = {
      id: `apr-${Date.now().toString().slice(-4)}`,
      clipCandidateId: clipId,
      campaignId: clip.campaignId,
      reviewerName: "Soren Lindqvist",
      reviewerRole: "Lead Arbitrage Operator",
      decision,
      note,
      timestampIso:
        new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
    }

    setState((prev) => {
      const nextAttestations = {
        ...prev.manualAttestations,
        ...(decision === "export-ready" || decision === "approved"
          ? { [`${clipId}:disclosure`]: true }
          : {}),
      }

      const nextClips = prev.clips.map((c) => {
        if (c.id !== clipId) return c
        const cmp = prev.campaigns.find((cam) => cam.id === c.campaignId)
        const updated: ClipCandidate = {
          ...c,
          reviewStatus: decision,
          ...(decision === "export-ready" ? { renderStatus: "rendered" } : {}),
        }
        updated.complianceSummaryStatus = summarizeComplianceStatus(
          buildComplianceChecksForClip(updated, cmp, nextAttestations),
        )
        return updated
      })

      return {
        ...prev,
        manualAttestations: nextAttestations,
        clips: nextClips,
        approvals: [newRecord, ...prev.approvals],
        activity: [
          {
            id: `act-${Date.now()}`,
            workspaceId: prev.workspaceId,
            timestampIso: "Just now",
            actor: "Soren Lindqvist",
            category: "review",
            summary: `Updated review status to ${decision.toUpperCase()}`,
            targetLabel: clip.title,
            campaignId: clip.campaignId,
            clipId: clip.id,
          },
          ...prev.activity,
        ],
      }
    })

    triggerFeedback(`Clip "${clip.title}" marked as ${decision.toUpperCase()}.`)

    // Synchronize review sign-off to backend SQLite database
    argonApiClient
      .submitApprovalDecision({
        clip_id: clipId,
        decision,
        reviewer_name: "Soren Lindqvist",
        notes: note,
      })
      .then((res) => {
        console.info(
          "Synced review decision to persistence ledger:",
          res.approval_id,
        )
      })
      .catch((err) => {
        console.warn("Backend approval sync fallback:", err)
      })
  }

  const handleOpenClipInStudio = (clipId: string) => {
    const clip = state.clips.find((c) => c.id === clipId)
    if (clip) {
      setSelectedCampaignId(clip.campaignId)
      setSelectedSourceId(clip.sourceAssetId)
      setSelectedClipId(clip.id)
    }
    setActiveNav("clip-studio")
  }

  const handleOpenCampaignInStudio = (campaignId: string) => {
    setSelectedCampaignId(campaignId)
    const firstSource = state.sourceAssets.find(
      (s) => s.campaignId === campaignId,
    )
    if (firstSource) {
      setSelectedSourceId(firstSource.id)
      const firstClip = state.clips.find(
        (c) => c.sourceAssetId === firstSource.id,
      )
      if (firstClip) setSelectedClipId(firstClip.id)
    }
    setActiveNav("clip-studio")
  }

  const handleResetDemoData = () => {
    window.localStorage.removeItem(STORAGE_KEY)
    setState({
      workspaceId: INITIAL_WORKSPACES[0].id,
      campaigns: INITIAL_CAMPAIGNS,
      sourceAssets: INITIAL_SOURCE_ASSETS,
      clips: INITIAL_CLIP_CANDIDATES,
      renderJobs: INITIAL_RENDER_JOBS,
      approvals: INITIAL_APPROVALS,
      payouts: INITIAL_PAYOUTS,
      snapshots: INITIAL_PERFORMANCE_SNAPSHOTS,
      publications: INITIAL_PUBLICATIONS,
      activity: INITIAL_ACTIVITY,
      manualAttestations: {
        "clip-tc-01:disclosure": true,
        "clip-mf-01:disclosure": true,
      },
    })
    setSelectedCampaignId(INITIAL_CAMPAIGNS[0].id)
    setSelectedSourceId(INITIAL_SOURCE_ASSETS[0].id)
    setSelectedClipId(INITIAL_CLIP_CANDIDATES[0].id)
    triggerFeedback("Local demo state reset to factory defaults.")
  }

  const navItems: {
    id: NavSection
    label: string
    icon: React.FC<{ className?: string }>
    badge?: string | number
  }[] = [
    {
      id: "command-center",
      label: "Command Center",
      icon: LayoutDashboard,
    },
    {
      id: "campaign-radar",
      label: "Campaign Radar",
      icon: Radar,
      badge: state.campaigns.length,
    },
    {
      id: "clip-studio",
      label: "Clip Studio",
      icon: Scissors,
      badge: "9:16",
    },
    {
      id: "argon-guard",
      label: "Argon Guard",
      icon: ShieldCheck,
      badge:
        state.clips.filter((c) => c.complianceSummaryStatus === "failed")
          .length || undefined,
    },
    {
      id: "review-queue",
      label: "Review Queue",
      icon: CheckSquare,
      badge: state.clips.filter(
        (c) =>
          c.reviewStatus === "pending" ||
          c.reviewStatus === "changes-requested",
      ).length,
    },
    {
      id: "performance-lab",
      label: "Performance Lab",
      icon: BarChart3,
    },
  ]

  return (
    <div className="flex min-h-screen bg-vibe-bg-canvas text-vibe-text-primary">
      {/* PERSISTENT COLLAPSIBLE LEFT SIDEBAR */}
      <aside
        className={`sticky top-0 flex h-screen shrink-0 flex-col justify-between border-r border-vibe-border-ui bg-vibe-bg-sidebar transition-all duration-200 ${
          sidebarCollapsed ? "w-16" : "w-64"
        }`}
      >
        <div className="space-y-4 p-3">
          {/* Brand Identity Header */}
          <div className="flex items-center justify-between px-1 py-1">
            <div
              onClick={() => setActiveNav("command-center")}
              className="flex cursor-pointer items-center gap-2.5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-vibe-primary font-mono text-sm font-black tracking-tighter text-white shadow-xs">
                AH
              </div>
              {!sidebarCollapsed && (
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-sans text-sm font-extrabold tracking-tight text-vibe-text-primary">
                      ARGON HIGH
                    </span>
                    <span className="rounded bg-vibe-primary-selected px-1.5 py-0.5 font-mono text-[9px] font-bold text-vibe-primary">
                      v2.5
                    </span>
                  </div>
                  <div className="font-sans text-[10px] font-semibold text-vibe-text-secondary">
                    VIBE WORK OS · ARBITRAGE
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              className="rounded border border-vibe-border-ui bg-vibe-bg-surface p-1 text-vibe-text-secondary hover:border-vibe-primary hover:text-vibe-primary"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Workspace Switcher */}
          {!sidebarCollapsed && (
            <div className="rounded-md border border-vibe-border-ui bg-vibe-bg-surface p-2.5 shadow-2xs">
              <label className="block font-sans text-[9px] font-bold tracking-wider text-vibe-text-secondary uppercase">
                Operator Workspace
              </label>
              <div className="relative mt-1 flex items-center">
                <select
                  aria-label="Workspace Switcher"
                  value={state.workspaceId}
                  onChange={(e) => {
                    setState((prev) => ({
                      ...prev,
                      workspaceId: e.target.value,
                    }))
                    triggerFeedback(`Switched workspace context.`)
                  }}
                  className="w-full appearance-none bg-transparent pr-5 text-xs font-bold text-vibe-text-primary focus:outline-none"
                >
                  {INITIAL_WORKSPACES.map((ws) => (
                    <option
                      key={ws.id}
                      value={ws.id}
                      className="bg-vibe-bg-surface text-vibe-text-primary"
                    >
                      {ws.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-vibe-text-secondary" />
              </div>
              <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-vibe-text-secondary">
                <span>{activeWorkspace.tier}</span>
                <span className="font-bold text-vibe-primary">
                  {activeWorkspace.activeOperators} ops
                </span>
              </div>
            </div>
          )}

          {/* Primary Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeNav === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-xs transition ${
                    isActive
                      ? "bg-vibe-primary-selected font-bold text-vibe-primary shadow-2xs"
                      : "font-medium text-vibe-text-primary hover:bg-vibe-bg-surface"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive
                          ? "text-vibe-primary"
                          : "text-vibe-text-secondary"
                      }`}
                    />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </div>
                  {!sidebarCollapsed && item.badge !== undefined && (
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                        isActive
                          ? "bg-vibe-primary text-white"
                          : "bg-vibe-bg-surface text-vibe-text-secondary"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Bottom Sidebar Compute Meter & Settings Trigger */}
        <div className="space-y-3 border-t border-vibe-border-ui p-3">
          {!sidebarCollapsed && (
            <div className="rounded-md border border-vibe-border-ui bg-vibe-bg-surface p-2.5 text-xs shadow-2xs">
              <div className="flex items-center justify-between font-mono text-[10px] text-vibe-text-secondary">
                <span>WORKER PIPELINE</span>
                <span className="font-bold text-vibe-positive-hover">
                  LOCAL DEMO
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] font-semibold text-vibe-text-primary">
                <span>Compute Quota</span>
                <span>
                  ${activeWorkspace.usedComputeUsd} / $
                  {activeWorkspace.monthlyComputeBudgetUsd}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-vibe-bg-grey">
                <div
                  className="h-full rounded-full bg-vibe-primary"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (activeWorkspace.usedComputeUsd /
                          activeWorkspace.monthlyComputeBudgetUsd) *
                          100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-md border border-vibe-border-ui bg-vibe-bg-surface px-2.5 py-2 text-xs font-semibold text-vibe-text-primary transition hover:border-vibe-primary hover:text-vibe-primary"
          >
            <Settings className="h-4 w-4 shrink-0 text-vibe-primary" />
            {!sidebarCollapsed && <span>Settings & Adapters</span>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT SHELL */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* TOP UTILITY & TELEMETRY BAR */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-vibe-border-ui bg-vibe-bg-surface px-5 vibe-shadow-sm">
          {/* Left Breadcrumb & Active View Title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-sans text-xs text-vibe-text-secondary">
              <span>{activeWorkspace.slug}</span>
              <span>/</span>
              <span className="font-bold text-vibe-text-primary uppercase">
                {activeNav.replace("-", " ")}
              </span>
            </div>
            <div className="hidden sm:block">
              <DemoTag label="FICTIONAL SAMPLE DATA · PERSISTED LOCALLY" />
            </div>
          </div>

          {/* Right Search, Quick Action, Notifications, Profile */}
          <div className="flex items-center gap-2.5">
            {/* Command Search Trigger */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-3 rounded-md border border-vibe-border-ui bg-vibe-bg-grey px-3 py-1.5 text-xs text-vibe-text-secondary transition hover:border-vibe-primary hover:text-vibe-text-primary"
            >
              <Search className="h-3.5 w-3.5 text-vibe-primary" />
              <span className="hidden md:inline">
                Search briefs, clips, transcripts...
              </span>
              <kbd className="rounded border border-vibe-border-ui bg-vibe-bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-vibe-text-secondary">
                ⌘K
              </kbd>
            </button>

            {/* Quick Create Campaign CTA */}
            <VibeButton
              kind="primary"
              size="sm"
              onClick={() => {
                setActiveNav("campaign-radar")
                setIsCreateCampaignOpen(true)
              }}
              className="hidden sm:inline-flex"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
            >
              New Brief
            </VibeButton>

            {/* Notifications Bell */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifications((p) => !p)
                  setShowProfileMenu(false)
                }}
                aria-label="Notifications"
                className="relative rounded-md border border-vibe-border-ui bg-vibe-bg-surface p-1.5 text-vibe-text-secondary hover:border-vibe-primary hover:text-vibe-primary"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-vibe-negative font-mono text-[9px] font-bold text-white">
                  {Math.min(9, state.activity.length)}
                </span>
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 rounded-lg border border-vibe-border-ui bg-vibe-bg-surface p-3 vibe-shadow-md">
                  <div className="flex items-center justify-between border-b border-vibe-border-layout pb-2">
                    <span className="font-sans text-[11px] font-bold text-vibe-text-primary uppercase">
                      Operational Event Feed
                    </span>
                    <span className="font-mono text-[10px] font-bold text-vibe-primary">
                      LIVE LOG
                    </span>
                  </div>
                  <div className="mt-2 max-h-64 space-y-2 overflow-y-auto text-xs">
                    {state.activity.slice(0, 5).map((act) => (
                      <div
                        key={act.id}
                        className="rounded border border-vibe-border-layout bg-vibe-bg-grey p-2"
                      >
                        <div className="flex justify-between font-mono text-[10px] text-vibe-text-secondary">
                          <span className="font-bold text-vibe-primary">
                            {act.actor}
                          </span>
                          <span>{act.timestampIso}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-vibe-text-primary">
                          {act.summary}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Operator Profile Chip */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowProfileMenu((p) => !p)
                  setShowNotifications(false)
                }}
                className="flex items-center gap-2 rounded-md border border-vibe-border-ui bg-vibe-bg-surface px-2.5 py-1 text-xs hover:border-vibe-primary"
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-vibe-primary font-mono text-[10px] font-bold text-white">
                  SL
                </div>
                <span className="hidden font-semibold text-vibe-text-primary lg:inline">
                  Soren L.
                </span>
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-64 rounded-lg border border-vibe-border-ui bg-vibe-bg-surface p-3 text-xs vibe-shadow-md">
                  <div className="border-b border-vibe-border-layout pb-2">
                    <div className="font-bold text-vibe-text-primary">
                      Soren Lindqvist
                    </div>
                    <div className="font-mono text-[11px] font-semibold text-vibe-primary">
                      Lead Arbitrage Operator
                    </div>
                    <div className="mt-0.5 text-[11px] text-vibe-text-secondary">
                      soren@northstar-desk.internal
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    <button
                      onClick={() => {
                        setShowProfileMenu(false)
                        setIsSettingsOpen(true)
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-medium text-vibe-text-primary hover:bg-vibe-bg-grey"
                    >
                      <Settings className="h-3.5 w-3.5 text-vibe-primary" />
                      Adapter & Workspace Settings
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* GLOBAL STATUS FEEDBACK TOAST BAR */}
        {statusFeedbackBanner && (
          <div className="flex items-center justify-between border-b border-vibe-positive/40 bg-vibe-positive-surface px-5 py-2 text-xs text-vibe-text-primary">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-vibe-positive-hover" />
              <span className="font-medium">{statusFeedbackBanner}</span>
            </div>
            <button
              onClick={() => setStatusFeedbackBanner(null)}
              className="font-sans text-[11px] font-bold text-vibe-positive-hover hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ACTIVE MODULE VIEWPORT */}
        <main className="flex-1 p-5">
          {activeNav === "command-center" && (
            <CommandCenterView
              workspace={activeWorkspace}
              campaigns={state.campaigns}
              clips={state.clips}
              renderJobs={state.renderJobs}
              payouts={state.payouts}
              snapshots={state.snapshots}
              activity={state.activity}
              onNavigate={setActiveNav}
              onOpenClipInStudio={handleOpenClipInStudio}
              onOpenCampaignInStudio={handleOpenCampaignInStudio}
              onOpenCreateCampaignModal={() => {
                setActiveNav("campaign-radar")
                setIsCreateCampaignOpen(true)
              }}
            />
          )}

          {activeNav === "campaign-radar" && (
            <CampaignRadarView
              campaigns={state.campaigns}
              isCreateModalOpen={isCreateCampaignOpen}
              onOpenCreateModal={() => setIsCreateCampaignOpen(true)}
              onCloseCreateModal={() => setIsCreateCampaignOpen(false)}
              onCreateCampaign={handleCreateCampaign}
              onSelectCampaignForStudio={handleOpenCampaignInStudio}
            />
          )}

          {activeNav === "clip-studio" && (
            <ClipStudioView
              campaigns={state.campaigns}
              sourceAssets={state.sourceAssets}
              clips={state.clips}
              selectedCampaignId={selectedCampaignId}
              selectedSourceId={selectedSourceId}
              selectedClipId={selectedClipId}
              manualAttestations={state.manualAttestations}
              onSelectCampaign={(cId) => {
                setSelectedCampaignId(cId)
                const src = state.sourceAssets.find((s) => s.campaignId === cId)
                if (src) {
                  setSelectedSourceId(src.id)
                  const clp = state.clips.find(
                    (c) => c.sourceAssetId === src.id,
                  )
                  if (clp) setSelectedClipId(clp.id)
                }
              }}
              onSelectSource={(sId) => {
                setSelectedSourceId(sId)
                const clp = state.clips.find((c) => c.sourceAssetId === sId)
                if (clp) setSelectedClipId(clp.id)
              }}
              onSelectClip={setSelectedClipId}
              onUpdateClip={handleUpdateClip}
              onApplyAnalysisResult={handleApplyAnalysisResult}
              onTriggerSimulatedAnalysis={handleTriggerSimulatedAnalysis}
              onTriggerSimulatedRender={handleTriggerSimulatedRender}
              onAddSourceAsset={handleAddSourceAsset}
              onNavigate={setActiveNav}
            />
          )}

          {activeNav === "argon-guard" && (
            <ArgonGuardView
              campaigns={state.campaigns}
              campaignRules={INITIAL_CAMPAIGN_RULES}
              clips={state.clips}
              selectedClipId={selectedClipId}
              manualAttestations={state.manualAttestations}
              onSelectClip={setSelectedClipId}
              onToggleManualAttestation={handleToggleManualAttestation}
              onUpdateClip={handleUpdateClip}
              onTriggerSimulatedRender={handleTriggerSimulatedRender}
              onNavigate={setActiveNav}
            />
          )}

          {activeNav === "review-queue" && (
            <ReviewQueueView
              campaigns={state.campaigns}
              clips={state.clips}
              approvals={state.approvals}
              selectedClipId={selectedClipId}
              manualAttestations={state.manualAttestations}
              onSelectClip={setSelectedClipId}
              onSubmitReviewDecision={handleSubmitReviewDecision}
              onOpenClipInStudio={handleOpenClipInStudio}
              onNavigate={setActiveNav}
            />
          )}

          {activeNav === "performance-lab" && (
            <PerformanceLabView
              campaigns={state.campaigns}
              clips={state.clips}
              snapshots={state.snapshots}
              payouts={state.payouts}
              publications={state.publications}
            />
          )}
        </main>
      </div>

      {/* GLOBAL SEARCH COMMAND PALETTE */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        query={searchQuery}
        onChangeQuery={setSearchQuery}
        onClose={() => setIsSearchOpen(false)}
        campaigns={state.campaigns}
        clips={state.clips}
        onSelectCampaign={setSelectedCampaignId}
        onSelectClip={handleOpenClipInStudio}
        onNavigate={setActiveNav}
      />

      {/* WORKSPACE & ADAPTER BOUNDARY SETTINGS MODAL */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        workspace={activeWorkspace}
        onResetDemoData={handleResetDemoData}
      />
    </div>
  )
}
