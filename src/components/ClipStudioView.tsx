import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns,
  Cpu,
  Download,
  Eye,
  FileVideo,
  Flame,
  Layers,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Scissors,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Subtitles,
  Type,
  Volume2,
  Wand2,
} from "lucide-react"
import {
  Campaign,
  CaptionAccentColor,
  CaptionFontSize,
  CaptionPresetId,
  CaptionVerticalPosition,
  ClipCandidate,
  CropMode,
  NavSection,
  SourceAsset,
} from "../types/argon"
import {
  buildComplianceChecksForClip,
  evaluateExportEligibility,
  formatSecondsToMMSS,
  summarizeComplianceStatus,
} from "../data/mockArgonData"
import { downloadExportSpecJson } from "../services/argonAdapters"
import {
  argonApiClient,
  BackendHealth,
  BackendRenderJobStatus,
  BackendTranscriptionResponse,
} from "../services/argonApiClient"
import {
  ComplianceBadge,
  DemoTag,
  OperationalStatusBadge,
  ReviewStatusBadge,
} from "./ArgonBadges"
import { VibeAttentionBox, VibeButton, VibeCard } from "../vibe/VibeComponents"

interface ClipStudioProps {
  campaigns: Campaign[]
  sourceAssets: SourceAsset[]
  clips: ClipCandidate[]
  selectedCampaignId: string
  selectedSourceId: string
  selectedClipId: string
  manualAttestations: Record<string, boolean>
  authError?: string | null
  onSelectCampaign: (campaignId: string) => void
  onSelectSource: (sourceId: string) => void
  onSelectClip: (clipId: string) => void
  onUpdateClip: (
    clipId: string,
    updater: (prev: ClipCandidate) => ClipCandidate,
  ) => void
  onApplyAnalysisResult?: (
    sourceId: string,
    result: BackendTranscriptionResponse,
  ) => void
  onTriggerSimulatedAnalysis: (sourceId: string) => void
  onTriggerSimulatedRender: (clipId: string) => void
  onAddSourceAsset: (payload: {
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
  }) => void
  onNavigate: (section: NavSection) => void
}

export const ClipStudioView: React.FC<ClipStudioProps> = ({
  campaigns,
  sourceAssets,
  clips,
  selectedCampaignId,
  selectedSourceId,
  selectedClipId,
  manualAttestations,
  authError,
  onSelectCampaign,
  onSelectSource,
  onSelectClip,
  onUpdateClip,
  onApplyAnalysisResult,
  onTriggerSimulatedAnalysis,
  onTriggerSimulatedRender,
  onAddSourceAsset,
  onNavigate,
}) => {
  const activeCampaign =
    campaigns.find((c) => c.id === selectedCampaignId) ?? campaigns[0]

  const campaignSources = useMemo(
    () => sourceAssets.filter((s) => s.campaignId === activeCampaign?.id),
    [sourceAssets, activeCampaign],
  )

  const activeSource =
    campaignSources.find((s) => s.id === selectedSourceId) ??
    campaignSources[0] ??
    sourceAssets[0]

  const sourceClips = useMemo(
    () =>
      clips
        .filter((c) => c.sourceAssetId === activeSource?.id)
        .sort((a, b) => a.rank - b.rank),
    [clips, activeSource],
  )

  const activeClip =
    sourceClips.find((c) => c.id === selectedClipId) ??
    sourceClips[0] ??
    clips[0]

  // Local studio UI states
  const [transcriptQuery, setTranscriptQuery] = useState("")
  const [isPlaying, setIsPlaying] = useState(false)
  const [playheadSec, setPlayheadSec] = useState<number>(
    activeClip?.startSec ?? 822,
  )
  const [showSafeZones, setShowSafeZones] = useState(true)
  const [rightTab, setRightTab] =
    useState<"candidates" | "controls" | "requirements">("candidates")
  const [showTranscriptPanel, setShowTranscriptPanel] = useState(true)
  const [showInspectorPanel, setShowInspectorPanel] = useState(true)
  const [expandedRightSections, setExpandedRightSections] = useState<{
    captions: boolean
    framing: boolean
    compliance: boolean
  }>({
    captions: true,
    framing: true,
    compliance: true,
  })
  const [isAnalyzingLocal, setIsAnalyzingLocal] = useState(false)
  const [analysisStepText, setAnalysisStepText] = useState("")
  const [isRenderingLocal, setIsRenderingLocal] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [savedBanner, setSavedBanner] = useState<string | null>(null)
  const [showAddSourceModal, setShowAddSourceModal] = useState(false)

  // Backend Integration State (Sprint 1 Real Engine)
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null)
  const [engineMode, setEngineMode] = useState<"live" | "demo">("live")
  const [isSessionVerified, setIsSessionVerified] = useState(false)
  const [readinessError, setReadinessError] = useState<string | null>(
    authError || null,
  )
  const [activeRenderJob, setActiveRenderJob] =
    useState<BackendRenderJobStatus | null>(null)
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null)
  const [previewStageMode, setPreviewStageMode] =
    useState<"rendered-video" | "canvas-overlay" | "source-video">(
      "canvas-overlay",
    )
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Probe backend and verify authenticated session on mount and workspace change
  const verifyOperationalStatus = useCallback(async () => {
    try {
      const res = await argonApiClient.checkOperationalReadiness()
      setBackendHealth(res.backendHealth)
      if (res.ready && res.session) {
        setIsSessionVerified(true)
        setReadinessError(null)
      } else {
        setIsSessionVerified(false)
        setReadinessError(
          res.errorMessage || "Backend or workspace session not ready",
        )
      }
    } catch (err: any) {
      setIsSessionVerified(false)
      setReadinessError(err.message || "Failed to reach backend")
    }
  }, [])

  useEffect(() => {
    if (authError) {
      setReadinessError(authError)
      setIsSessionVerified(false)
    }
  }, [authError])

  useEffect(() => {
    verifyOperationalStatus()
  }, [verifyOperationalStatus])

  // New source modal fields
  const [newSourceTitle, setNewSourceTitle] = useState("")
  const [newSourceCreator, setNewSourceCreator] = useState("")
  const [newSourceUrl, setNewSourceUrl] = useState("")
  const [newSourceAuth, setNewSourceAuth] = useState("")

  // Keep playhead synced and reset render stage when switching activeClip
  useEffect(() => {
    if (activeClip) {
      setPlayheadSec(activeClip.startSec)
      setIsPlaying(false)
      if (activeClip.renderStatus !== "rendered") {
        setRenderedVideoUrl(null)
        setActiveRenderJob(null)
        if (previewStageMode === "rendered-video") {
          setPreviewStageMode(
            activeSource?.sourceUrl ? "source-video" : "canvas-overlay",
          )
        }
      }
    }
  }, [activeClip?.id])

  // Set default preview mode to source stream when source is loaded or switched
  useEffect(() => {
    if (activeSource?.sourceUrl && !renderedVideoUrl) {
      setPreviewStageMode("source-video")
    }
  }, [activeSource?.id])

  // Simulated playback loop inside the trimmed clip window
  useEffect(() => {
    if (!isPlaying || !activeClip) return
    const interval = window.setInterval(() => {
      setPlayheadSec((prev) => {
        if (prev + 0.5 >= activeClip.endSec) {
          return activeClip.startSec
        }
        return Number((prev + 0.5).toFixed(1))
      })
    }, 500)
    return () => window.clearInterval(interval)
  }, [isPlaying, activeClip])

  const filteredTranscript = useMemo(() => {
    if (!activeSource) return []
    const q = transcriptQuery.trim().toLowerCase()
    if (!q) return activeSource.transcript
    return activeSource.transcript.filter(
      (seg) =>
        seg.text.toLowerCase().includes(q) ||
        seg.speaker.toLowerCase().includes(q) ||
        seg.keywords.some((k) => k.toLowerCase().includes(q)),
    )
  }, [activeSource, transcriptQuery])

  const currentTranscriptSegment = useMemo(() => {
    if (!activeSource) return null
    return (
      activeSource.transcript.find(
        (seg) => playheadSec >= seg.startSec && playheadSec <= seg.endSec,
      ) ??
      activeSource.transcript.find(
        (seg) =>
          activeClip &&
          seg.startSec >= activeClip.startSec - 15 &&
          seg.endSec <= activeClip.endSec + 15,
      ) ??
      activeSource.transcript[0]
    )
  }, [activeSource, playheadSec, activeClip])

  const liveComplianceChecks = useMemo(() => {
    if (!activeClip) return []
    return buildComplianceChecksForClip(
      activeClip,
      activeCampaign,
      manualAttestations,
    )
  }, [activeClip, activeCampaign, manualAttestations])

  const liveComplianceStatus = useMemo(
    () => summarizeComplianceStatus(liveComplianceChecks),
    [liveComplianceChecks],
  )

  const clipDuration = activeClip
    ? Math.max(1, Math.round(activeClip.endSec - activeClip.startSec))
    : 30

  const minDurationRule = activeCampaign?.id === "cmp-meridian-fx" ? 30 : 28
  const maxDurationRule = activeCampaign?.id === "cmp-meridian-fx" ? 60 : 58

  const handleRunAnalysis = async () => {
    if (!activeSource || isAnalyzingLocal) return
    setIsAnalyzingLocal(true)

    if (engineMode === "live") {
      if (backendHealth?.status !== "operational") {
        setSavedBanner(
          "Live Mode Error: Backend API service is not operational. Switch to Demo mode for simulated testing.",
        )
        setIsAnalyzingLocal(false)
        return
      }

      setAnalysisStepText(
        "Invoking FastAPI Speech Transcription & Acoustic Energy Engine...",
      )
      try {
        const intel = await argonApiClient.transcribeAndRank(
          activeSource.id,
          activeCampaign?.sponsorName,
        )
        if (!intel || !intel.candidates || intel.candidates.length === 0) {
          throw new Error(
            "No candidate clips or speech segments were detected in this media.",
          )
        }

        if (onApplyAnalysisResult) {
          onApplyAnalysisResult(activeSource.id, intel)
        } else {
          const topCandidate = intel.candidates[0]
          onUpdateClip(activeClip.id, (prev) => ({
            ...prev,
            title: topCandidate.title,
            startSec: topCandidate.start_sec,
            endSec: topCandidate.end_sec,
            hookScore: topCandidate.hook_score,
            hookBreakdown: topCandidate.hook_breakdown,
            transcriptExcerpt: topCandidate.transcript_excerpt,
          }))
        }

        setSavedBanner(
          `⚡ Real Speech AI Analysis Complete: ${intel.candidates.length} candidate timestamp ranges ranked. Selected #${intel.candidates[0].rank} (${intel.candidates[0].title}).`,
        )
      } catch (err: any) {
        setSavedBanner(
          `Live Analysis Error: ${err.message || "Speech analysis failed"}`,
        )
      } finally {
        setIsAnalyzingLocal(false)
        setAnalysisStepText("")
        setRightTab("candidates")
        window.setTimeout(() => setSavedBanner(null), 6000)
      }
      return
    }

    // Demo Mode Simulated Path
    setAnalysisStepText(
      "Indexing Diarized Transcript & Acoustic Energy Peaks (Demo)...",
    )
    window.setTimeout(() => {
      setAnalysisStepText(
        "Scoring Hook Velocity & Sponsor Keyword Alignment...",
      )
    }, 650)
    window.setTimeout(() => {
      onTriggerSimulatedAnalysis(activeSource.id)
      setIsAnalyzingLocal(false)
      setAnalysisStepText("")
      setRightTab("candidates")
      setSavedBanner(
        "Simulated AI Hook Analysis complete — Ranked candidates updated.",
      )
      window.setTimeout(() => setSavedBanner(null), 4000)
    }, 1400)
  }

  const handleRunRender = async () => {
    if (!activeClip || isRenderingLocal) return
    setIsRenderingLocal(true)
    setRenderProgress(10)

    if (engineMode === "live") {
      if (backendHealth?.status !== "operational") {
        setSavedBanner(
          "Live Mode Error: Backend rendering engine is not operational. Switch to Demo mode for simulated testing.",
        )
        setIsRenderingLocal(false)
        return
      }

      try {
        setSavedBanner(
          "Submitting 1080x1920 vertical FFmpeg render job to backend queue...",
        )
        const job = await argonApiClient.createRenderJob({
          sourceAssetId: activeSource.id,
          clipId: activeClip.id,
          campaignId: activeCampaign.id,
          startSec: activeClip.startSec,
          endSec: activeClip.endSec,
          targetWidth: 1080,
          targetHeight: 1920,
          cropMode: activeClip.cropMode,
          faceTrackOffsetX: activeClip.faceTrackOffsetX,
          captionPreset: activeClip.captionPreset,
          normalizeAudioLufs: activeClip.normalizeAudioLufs,
          watermarkText: activeCampaign.sponsorName
            ? `${activeCampaign.sponsorName.toUpperCase()} VERIFIED`
            : "ARGON HIGH VERIFIED",
        })

        setActiveRenderJob(job)
        setRenderProgress(job.progress_pct || 25)

        // Poll job status until completed
        const pollInterval = window.setInterval(async () => {
          try {
            const currentStatus = await argonApiClient.pollRenderJob(job.job_id)
            setActiveRenderJob(currentStatus)
            setRenderProgress(currentStatus.progress_pct)

            if (currentStatus.status === "completed") {
              window.clearInterval(pollInterval)
              setIsRenderingLocal(false)
              const previewUrl = argonApiClient.getPreviewUrl(currentStatus)
              setRenderedVideoUrl(previewUrl)
              setPreviewStageMode("rendered-video")
              onUpdateClip(activeClip.id, (prev) => ({
                ...prev,
                renderStatus: "rendered",
                lastRenderedAtIso: new Date().toISOString(),
              }))
              setSavedBanner(
                `⚡ FFmpeg 9:16 Render Verified! 1080x1920 MP4 (${
                  currentStatus.output_inspection?.file_size_bytes
                    ? Math.round(
                        currentStatus.output_inspection.file_size_bytes / 1024,
                      ) + " KB"
                    : "Encoded"
                }) ready for preview and download.`,
              )
              window.setTimeout(() => setSavedBanner(null), 6000)
            } else if (currentStatus.status === "failed") {
              window.clearInterval(pollInterval)
              setIsRenderingLocal(false)
              setSavedBanner(
                `Live Render Error: ${currentStatus.error_message || "FFmpeg failed"}`,
              )
              window.setTimeout(() => setSavedBanner(null), 6000)
            }
          } catch (pollErr: any) {
            window.clearInterval(pollInterval)
            setIsRenderingLocal(false)
            setSavedBanner(
              `Live Render Polling Error: ${pollErr.message || "Failed to poll job status"}`,
            )
            window.setTimeout(() => setSavedBanner(null), 6000)
          }
        }, 500)

        return
      } catch (err: any) {
        setIsRenderingLocal(false)
        setSavedBanner(`Live Render Error: ${err.message || "Render failed"}`)
        window.setTimeout(() => setSavedBanner(null), 6000)
        return
      }
    }

    // Demo Mode Simulated Progress
    window.setTimeout(() => setRenderProgress(54), 450)
    window.setTimeout(() => setRenderProgress(89), 900)
    window.setTimeout(() => {
      setRenderProgress(100)
      onTriggerSimulatedRender(activeClip.id)
      setIsRenderingLocal(false)
      setSavedBanner(
        "Simulated 9:16 preview specification updated (1080x1920 target profile). Actual binary MP4 encoding awaits FFmpeg worker integration.",
      )
      window.setTimeout(() => setSavedBanner(null), 4000)
    }, 1350)
  }

  const handleSaveCut = () => {
    if (!activeClip) return
    onUpdateClip(activeClip.id, (prev) => ({
      ...prev,
      complianceSummaryStatus: liveComplianceStatus,
    }))
    setSavedBanner(
      "Clip parameters, trim timestamps, and compliance state saved locally.",
    )
    window.setTimeout(() => setSavedBanner(null), 3500)
  }

  const handleAdjustTrim = (field: "startSec" | "endSec", delta: number) => {
    if (!activeClip) return
    onUpdateClip(activeClip.id, (prev) => {
      const nextStart =
        field === "startSec"
          ? Math.max(0, Math.min(prev.endSec - 5, prev.startSec + delta))
          : prev.startSec
      const nextEnd =
        field === "endSec"
          ? Math.max(prev.startSec + 5, prev.endSec + delta)
          : prev.endSec
      const updated = {
        ...prev,
        startSec: nextStart,
        endSec: nextEnd,
      }
      const checks = buildComplianceChecksForClip(
        updated,
        activeCampaign,
        manualAttestations,
      )
      updated.complianceSummaryStatus = summarizeComplianceStatus(checks)
      return updated
    })
  }

  const handleFixDurationToCompliantWindow = () => {
    if (!activeClip) return
    onUpdateClip(activeClip.id, (prev) => {
      const targetDuration = Math.max(minDurationRule + 4, 34)
      const updated: ClipCandidate = {
        ...prev,
        endSec: prev.startSec + targetDuration,
        includeWatermark: true,
        normalizeAudioLufs: true,
      }
      const checks = buildComplianceChecksForClip(
        updated,
        activeCampaign,
        manualAttestations,
      )
      updated.complianceSummaryStatus = summarizeComplianceStatus(checks)
      return updated
    })
    setSavedBanner(
      `Auto-trimmed clip to ${Math.max(minDurationRule + 4, 34)}s and enabled mandatory Sponsor Watermark.`,
    )
    window.setTimeout(() => setSavedBanner(null), 3500)
  }

  const handleCreateSourceSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeCampaign) return

    if (uploadFile) {
      setIsUploading(true)
      setUploadError(null)
      try {
        const uploadResp = await argonApiClient.uploadSourceVideo(
          uploadFile,
          activeCampaign.id,
          newSourceTitle.trim() || uploadFile.name,
          newSourceCreator.trim() || activeCampaign.sponsorName,
          newSourceAuth.trim() || "Sponsor Direct Upload Release Agreement",
        )

        onAddSourceAsset({
          campaignId: activeCampaign.id,
          title: uploadResp.title,
          creatorName: newSourceCreator.trim() || activeCampaign.sponsorName,
          sourceUrl: argonApiClient.getSourceStreamUrl(
            uploadResp.source_asset_id,
          ),
          authorizationProof: uploadResp.authorization_proof,
          sourceAssetId: uploadResp.source_asset_id,
          durationSec: uploadResp.duration_sec,
          resolution: uploadResp.resolution,
          fps: uploadResp.fps,
          audioLufs: uploadResp.audio_lufs,
        })

        setUploadFile(null)
        setNewSourceTitle("")
        setNewSourceCreator("")
        setNewSourceUrl("")
        setNewSourceAuth("")
        setShowAddSourceModal(false)
        setSavedBanner(
          `⚡ Real Video Uploaded & FFprobe Inspected: ${uploadResp.resolution}, ${Math.round(uploadResp.duration_sec)}s, ${uploadResp.fps} FPS.`,
        )
        window.setTimeout(() => setSavedBanner(null), 5000)
      } catch (err: any) {
        setUploadError(err.message || "Upload failed")
      } finally {
        setIsUploading(false)
      }
      return
    }

    if (!newSourceTitle.trim()) return
    onAddSourceAsset({
      campaignId: activeCampaign.id,
      title: `${newSourceTitle.trim()} (Fictional Demo)`,
      creatorName: newSourceCreator.trim() || activeCampaign.sponsorName,
      sourceUrl: newSourceUrl.trim(),
      authorizationProof:
        newSourceAuth.trim() || "AUTH-OPERATOR-ATTESTED-2025 (Demo License)",
    })
    setNewSourceTitle("")
    setNewSourceCreator("")
    setNewSourceUrl("")
    setNewSourceAuth("")
    setShowAddSourceModal(false)
    setSavedBanner(
      'Authorized long-form source added. Click "Start Analysis" to generate clip candidates.',
    )
    window.setTimeout(() => setSavedBanner(null), 4000)
  }

  if (!activeClip || !activeSource) {
    return (
      <VibeCard className="p-8 text-center">
        <FileVideo className="mx-auto h-8 w-8 text-vibe-primary" />
        <h3 className="mt-2 text-sm font-bold text-vibe-text-primary">
          No Source Asset or Clip Candidate Loaded
        </h3>
        <p className="mt-1 text-xs text-vibe-text-secondary">
          Attach an authorized long-form video source or select an active
          campaign to begin clipping.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <VibeButton
            kind="primary"
            onClick={() => setShowAddSourceModal(true)}
          >
            Add Authorized Source
          </VibeButton>
        </div>
      </VibeCard>
    )
  }

  const activeCaptionFontSize: CaptionFontSize =
    activeClip.captionFontSize ?? "md"
  const activeCaptionPosition: CaptionVerticalPosition =
    activeClip.captionPosition ?? "lower-third"
  const activeCaptionAccent: CaptionAccentColor =
    activeClip.captionAccentColor ?? "vibe-blue"

  const captionFontSizeClass =
    activeCaptionFontSize === "lg"
      ? "text-sm"
      : activeCaptionFontSize === "sm"
        ? "text-[10px]"
        : "text-xs"

  const captionPositionClass =
    activeCaptionPosition === "center-stage"
      ? "top-1/2 -translate-y-1/2"
      : activeCaptionPosition === "upper-safe"
        ? "top-12"
        : "bottom-14"

  const accentBadgeClass =
    activeCaptionAccent === "done-green"
      ? "bg-vibe-positive text-white"
      : activeCaptionAccent === "electric-lime"
        ? "bg-[#C6F36B] text-[#101419]"
        : activeCaptionAccent === "warning-amber"
          ? "bg-vibe-warning text-white"
          : "bg-vibe-primary text-white"

  const exportEligibility = evaluateExportEligibility(
    activeClip,
    liveComplianceChecks,
  )

  // Timeline window calculations (120-second zoom window around the clip)
  const timelineWindowStart = Math.max(0, activeClip.startSec - 20)
  const timelineWindowSpan = 100 // 100 seconds visible span
  const startPct = Math.min(
    90,
    Math.max(
      0,
      ((activeClip.startSec - timelineWindowStart) / timelineWindowSpan) * 100,
    ),
  )
  const endPct = Math.min(
    100,
    Math.max(
      startPct + 6,
      ((activeClip.endSec - timelineWindowStart) / timelineWindowSpan) * 100,
    ),
  )
  const playheadPct = Math.min(
    100,
    Math.max(
      0,
      ((playheadSec - timelineWindowStart) / timelineWindowSpan) * 100,
    ),
  )

  // Dynamic grid column allocation based on collapsible panels
  const centerColSpan =
    showTranscriptPanel && showInspectorPanel
      ? "lg:col-span-5"
      : showTranscriptPanel || showInspectorPanel
        ? "lg:col-span-8"
        : "lg:col-span-12"
  const sideColSpan =
    showTranscriptPanel && showInspectorPanel
      ? "lg:col-span-3"
      : "lg:col-span-4"

  return (
    <div className="flex flex-col gap-3">
      {/* Live Operational Warning Banner if session or workspace is not verified */}
      {engineMode === "live" && !isSessionVerified && readinessError && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <span className="font-bold">Live Operational Notice: </span>
              <span>{readinessError}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => verifyOperationalStatus()}
            className="rounded bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-200 transition hover:bg-amber-500/30"
          >
            Retry Authorization
          </button>
        </div>
      )}

      {/* Studio Top Command Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-vibe-border-ui bg-vibe-bg-surface px-4 py-3 vibe-shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-vibe-primary text-white">
              <Scissors className="h-3.5 w-3.5" />
            </span>
            <span className="font-sans text-xs font-bold tracking-wide text-vibe-text-primary uppercase">
              CLIP STUDIO
            </span>
            <OperationalStatusBadge
              status={
                isAnalyzingLocal || isRenderingLocal
                  ? "Processing"
                  : activeClip.reviewStatus === "export-ready"
                    ? "Exported"
                    : liveComplianceStatus === "failed"
                      ? "Failed validation"
                      : "Simulated"
              }
            />
          </div>

          <div className="h-4 w-px bg-vibe-border-ui" />

          {/* Campaign Selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-vibe-text-secondary">
              CAMPAIGN:
            </span>
            <select
              aria-label="Select Campaign"
              value={activeCampaign?.id ?? ""}
              onChange={(e) => onSelectCampaign(e.target.value)}
              className="rounded border border-vibe-border-ui bg-vibe-bg-surface px-2.5 py-1 text-xs font-semibold text-vibe-text-primary focus:border-vibe-primary focus:outline-none"
            >
              {campaigns.map((cmp) => (
                <option key={cmp.id} value={cmp.id}>
                  {cmp.title} (${cmp.cpmUsd.toFixed(2)} CPM)
                </option>
              ))}
            </select>
          </div>

          {/* Source Asset Selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-vibe-text-secondary">
              SOURCE:
            </span>
            <select
              aria-label="Select Source Asset"
              value={activeSource.id}
              onChange={(e) => onSelectSource(e.target.value)}
              className="max-w-[260px] truncate rounded border border-vibe-border-ui bg-vibe-bg-surface px-2.5 py-1 text-xs font-semibold text-vibe-text-primary focus:border-vibe-primary focus:outline-none"
            >
              {campaignSources.map((src) => (
                <option key={src.id} value={src.id}>
                  {src.title}
                </option>
              ))}
            </select>
            <VibeButton
              kind="secondary"
              size="xs"
              onClick={() => setShowAddSourceModal(true)}
              title="Add Authorized Source Video"
              leftIcon={<Plus className="h-3 w-3 text-vibe-primary" />}
            >
              Add Source
            </VibeButton>
          </div>
        </div>

        {/* Studio Primary Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Backend Engine Mode Switch Pill */}
          <div className="flex items-center rounded-md border border-vibe-border-ui bg-vibe-bg-grey p-0.5 text-xs">
            <button
              type="button"
              onClick={() => {
                setEngineMode("live")
                verifyOperationalStatus()
              }}
              className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold transition ${
                engineMode === "live"
                  ? isSessionVerified
                    ? "bg-vibe-primary text-white shadow-xs"
                    : "bg-amber-600 text-white shadow-xs"
                  : readinessError
                    ? "text-amber-400 hover:bg-amber-500/10"
                    : "text-vibe-text-secondary hover:text-vibe-text-primary"
              }`}
              title={
                isSessionVerified
                  ? "FastAPI, FFmpeg & authenticated session verified"
                  : readinessError || "Click to reconnect and verify session"
              }
            >
              {isSessionVerified
                ? "⚡ LIVE FFMPEG (VERIFIED)"
                : readinessError
                  ? readinessError.includes("403")
                    ? "⚠️ LIVE (403 FORBIDDEN)"
                    : readinessError.includes("401")
                      ? "⚠️ LIVE (401 UNAUTHORIZED)"
                      : "⚠️ LIVE (OFFLINE)"
                  : "⚡ LIVE FFMPEG"}
            </button>
            <button
              type="button"
              onClick={() => setEngineMode("demo")}
              className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold transition ${
                engineMode === "demo"
                  ? "bg-vibe-bg-surface text-vibe-text-primary shadow-xs"
                  : "text-vibe-text-secondary hover:text-vibe-text-primary"
              }`}
            >
              DEMO (SIM)
            </button>
          </div>

          {/* Collapsible Panel Toggles */}
          <div className="flex items-center rounded border border-vibe-border-ui bg-vibe-bg-grey p-0.5">
            <button
              type="button"
              onClick={() => setShowTranscriptPanel((p) => !p)}
              title="Toggle Left Transcript Panel"
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition ${
                showTranscriptPanel
                  ? "bg-vibe-bg-surface text-vibe-primary shadow-2xs"
                  : "text-vibe-text-secondary hover:text-vibe-text-primary"
              }`}
            >
              {showTranscriptPanel ? (
                <PanelLeftClose className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftOpen className="h-3.5 w-3.5" />
              )}
              <span className="hidden xl:inline">Transcript</span>
            </button>
            <button
              type="button"
              onClick={() => setShowInspectorPanel((p) => !p)}
              title="Toggle Right Creative & Rules Inspector"
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition ${
                showInspectorPanel
                  ? "bg-vibe-bg-surface text-vibe-primary shadow-2xs"
                  : "text-vibe-text-secondary hover:text-vibe-text-primary"
              }`}
            >
              {showInspectorPanel ? (
                <PanelRightClose className="h-3.5 w-3.5" />
              ) : (
                <PanelRightOpen className="h-3.5 w-3.5" />
              )}
              <span className="hidden xl:inline">Inspector</span>
            </button>
          </div>

          <VibeButton
            kind="secondary"
            size="sm"
            onClick={handleRunAnalysis}
            disabled={isAnalyzingLocal}
            leftIcon={
              <Wand2
                className={`h-3.5 w-3.5 text-vibe-purple ${
                  isAnalyzingLocal ? "animate-spin" : ""
                }`}
              />
            }
          >
            {isAnalyzingLocal
              ? "Analyzing Hooks..."
              : engineMode === "live"
                ? "⚡ AI Transcribe & Rank"
                : "Analyze Source (Sim)"}
          </VibeButton>

          <VibeButton
            kind="secondary"
            size="sm"
            onClick={handleSaveCut}
            leftIcon={<Save className="h-3.5 w-3.5 text-vibe-text-secondary" />}
          >
            Save Cut
          </VibeButton>

          <VibeButton
            kind="primary"
            color="primary"
            size="sm"
            onClick={handleRunRender}
            disabled={isRenderingLocal}
            leftIcon={
              <Cpu
                className={`h-3.5 w-3.5 ${
                  isRenderingLocal ? "animate-spin" : ""
                }`}
              />
            }
          >
            {isRenderingLocal
              ? `Rendering 1080x1920 (${renderProgress}%)`
              : engineMode === "live"
                ? activeClip.renderStatus === "rendered"
                  ? "⚡ Re-render 9:16 (FFmpeg)"
                  : "⚡ Render 9:16 (FFmpeg)"
                : activeClip.renderStatus === "rendered"
                  ? "Update Preview Spec (Sim)"
                  : "Run Simulated Preview"}
          </VibeButton>

          <VibeButton
            kind="secondary"
            size="sm"
            onClick={() => onNavigate("argon-guard")}
            leftIcon={
              <ShieldCheck className="h-3.5 w-3.5 text-vibe-positive" />
            }
          >
            Guard Audit
          </VibeButton>
        </div>
      </div>

      {/* Intuitive Candidate Selection Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-vibe-border-ui bg-vibe-bg-surface px-3.5 py-2 vibe-shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-sans text-[11px] font-bold text-vibe-text-secondary uppercase">
            Candidate Cuts ({sourceClips.length}):
          </span>
          {sourceClips.map((cand) => {
            const isCurrent = cand.id === activeClip.id
            const dur = Math.round(cand.endSec - cand.startSec)
            return (
              <button
                key={cand.id}
                type="button"
                onClick={() => onSelectClip(cand.id)}
                className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition ${
                  isCurrent
                    ? "border-vibe-primary bg-vibe-primary-selected font-bold text-vibe-primary shadow-2xs"
                    : "border-vibe-border-ui bg-vibe-bg-grey font-medium text-vibe-text-primary hover:bg-vibe-bg-surface"
                }`}
              >
                <span className="rounded bg-vibe-primary px-1.5 py-0.2 font-mono text-[10px] font-bold text-white">
                  #{cand.rank}
                </span>
                <span className="max-w-[180px] truncate">{cand.title}</span>
                <span className="font-mono text-[11px] text-vibe-text-secondary">
                  {dur}s
                </span>
                <span className="rounded bg-vibe-positive px-1.5 py-0.2 font-mono text-[10px] font-bold text-white">
                  {cand.hookScore ? cand.hookScore : "--"}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-[11px] text-vibe-text-secondary">
            Est. Value:{" "}
            <strong className="text-vibe-positive-hover">
              ${activeClip.estimatedPayoutUsd}
            </strong>
          </span>
          {exportEligibility.eligible && (
            <VibeButton
              kind="secondary"
              size="xs"
              onClick={() =>
                downloadExportSpecJson(
                  activeClip,
                  activeCampaign,
                  liveComplianceChecks,
                )
              }
              leftIcon={<Download className="h-3 w-3 text-vibe-primary" />}
            >
              Export Spec JSON
            </VibeButton>
          )}
        </div>
      </div>

      {/* Status / Analysis / Toast Feedback Banner */}
      {(isAnalyzingLocal || savedBanner) && (
        <VibeAttentionBox
          type="success"
          icon={<Sparkles className="h-4 w-4 text-vibe-positive" />}
          action={
            <OperationalStatusBadge
              status={isAnalyzingLocal ? "Processing" : "Simulated"}
            />
          }
        >
          <span className="font-medium text-vibe-text-primary">
            {isAnalyzingLocal ? analysisStepText : savedBanner}
          </span>
        </VibeAttentionBox>
      )}

      {/* Three-Panel Production Workspace */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* LEFT PANEL: Source Video Monitor & Searchable Timestamped Transcript (Collapsible) */}
        {showTranscriptPanel && (
          <div
            className={`flex flex-col rounded-lg border border-vibe-border-ui bg-vibe-bg-surface vibe-shadow-sm ${sideColSpan}`}
          >
            {/* Source Master Monitor Header */}
            <div className="flex items-center justify-between border-b border-vibe-border-layout px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <FileVideo className="h-4 w-4 text-vibe-primary" />
                <span className="text-xs font-bold text-vibe-text-primary">
                  Source Master & Transcript
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-vibe-bg-grey px-2 py-0.5 font-mono text-[10px] font-medium text-vibe-text-secondary">
                  {activeSource.resolution}
                </span>
                <button
                  type="button"
                  onClick={() => setShowTranscriptPanel(false)}
                  title="Collapse Transcript Panel"
                  className="rounded p-1 text-vibe-text-secondary hover:bg-vibe-bg-grey hover:text-vibe-text-primary"
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Widescreen 16:9 Source Feed Monitor */}
            <div className="border-b border-vibe-border-layout bg-vibe-bg-grey p-3">
              <div className="relative aspect-video w-full overflow-hidden rounded-md border border-vibe-border-ui bg-vibe-primary-surface">
                {/* Technical Grid & Framing Overlay */}
                <div
                  className="absolute inset-0 opacity-35"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, #d0d4e4 1px, transparent 1px), linear-gradient(to bottom, #d0d4e4 1px, transparent 1px)",
                    backgroundSize: "32px 32px",
                  }}
                />

                {/* Simulated 16:9 Dual-Speaker Studio Feed */}
                <div className="relative flex h-full w-full items-center justify-between px-6">
                  {/* Host camera box */}
                  <div className="flex h-24 w-36 flex-col justify-between rounded-md border border-vibe-border-ui bg-vibe-bg-surface p-2.5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold text-vibe-text-secondary">
                        CAM A · HOST
                      </span>
                      <span className="h-2 w-2 rounded-full bg-vibe-positive" />
                    </div>
                    <div className="text-xs font-bold text-vibe-text-primary">
                      Devon K.
                    </div>
                    <div className="font-mono text-[10px] text-vibe-text-secondary">
                      -15.2 LUFS
                    </div>
                  </div>

                  {/* Active 9:16 Target Crop Bounding Box Indicator on Source */}
                  <div
                    className="pointer-events-none absolute top-2 bottom-2 w-[32%] rounded border-2 border-dashed border-vibe-primary bg-vibe-primary/10 transition-all"
                    style={{
                      left: `${Math.min(64, Math.max(12, 52 + activeClip.faceTrackOffsetX * 0.4))}%`,
                    }}
                  >
                    <div className="bg-vibe-primary px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                      9:16 CROP LOCK
                    </div>
                  </div>

                  {/* Guest speaker box */}
                  <div className="flex h-28 w-44 flex-col justify-between rounded-md border-2 border-vibe-primary bg-vibe-bg-surface p-2.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold text-vibe-primary">
                        CAM B · ACTIVE SPEAKER
                      </span>
                      <span className="h-2 w-2 rounded-full bg-vibe-primary" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-vibe-text-primary">
                        {activeSource.creatorName}
                      </div>
                      <div className="text-[10px] text-vibe-text-secondary">
                        Face-Track Confidence: 99.1%
                      </div>
                    </div>
                    <div className="font-mono text-[10px] font-semibold text-vibe-positive-hover">
                      {activeSource.audioLufs} LUFS Master
                    </div>
                  </div>
                </div>

                {/* Bottom Source Timecode Overlay */}
                <div className="absolute right-2 bottom-2 left-2 flex items-center justify-between rounded border border-vibe-border-ui bg-vibe-bg-surface/95 px-2.5 py-1 font-mono text-[11px] shadow-xs">
                  <span className="font-bold text-vibe-primary">
                    TC {formatSecondsToMMSS(playheadSec)}:14 /{" "}
                    {formatSecondsToMMSS(activeSource.durationSec)}:00
                  </span>
                  <span className="truncate text-[10px] text-vibe-text-secondary">
                    {activeSource.authorizationProof}
                  </span>
                </div>
              </div>
            </div>

            {/* Searchable Transcript Input */}
            <div className="border-b border-vibe-border-layout p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-vibe-text-secondary" />
                <input
                  type="text"
                  value={transcriptQuery}
                  onChange={(e) => setTranscriptQuery(e.target.value)}
                  placeholder="Search transcript keywords, claims, speakers..."
                  className="w-full rounded border border-vibe-border-ui bg-vibe-bg-surface py-1.5 pr-3 pl-8 text-xs text-vibe-text-primary placeholder-vibe-text-secondary focus:border-vibe-primary focus:outline-none"
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-vibe-text-secondary">
                <span>Click segment to seek · Use [IN] / [OUT] to trim</span>
                {transcriptQuery && (
                  <button
                    type="button"
                    onClick={() => setTranscriptQuery("")}
                    className="font-semibold text-vibe-primary hover:underline"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            </div>

            {/* Timestamped Diarized Transcript List */}
            <div className="max-h-[430px] flex-1 space-y-2 overflow-y-auto p-3">
              {!activeSource.transcript || activeSource.transcript.length === 0 ? (
                <div className="py-8 text-center text-xs text-vibe-text-secondary">
                  <div className="font-semibold text-vibe-text-primary">
                    No Speech Transcript Available
                  </div>
                  <div className="mt-1">
                    Click "⚡ AI Transcribe & Rank" above to invoke faster-whisper and acoustic analysis on this source.
                  </div>
                </div>
              ) : filteredTranscript.length === 0 ? (
                <div className="py-8 text-center text-xs text-vibe-text-secondary">
                  <div>No transcript segments match "{transcriptQuery}".</div>
                  <button
                    type="button"
                    onClick={() => setTranscriptQuery("")}
                    className="mt-2 font-semibold text-vibe-primary hover:underline"
                  >
                    Reset transcript search
                  </button>
                </div>
              ) : (
                filteredTranscript.map((seg) => {
                  const inClipRange =
                    seg.startSec >= activeClip.startSec - 2 &&
                    seg.endSec <= activeClip.endSec + 2
                  const isCurrentPlayhead =
                    playheadSec >= seg.startSec && playheadSec <= seg.endSec

                  return (
                    <div
                      key={seg.id}
                      onClick={() => {
                        setPlayheadSec(seg.startSec)
                      }}
                      className={`cursor-pointer rounded-md border p-2.5 text-xs transition ${
                        isCurrentPlayhead
                          ? "border-vibe-primary bg-vibe-primary-selected/50 ring-1 ring-vibe-primary"
                          : inClipRange
                            ? "border-vibe-primary/40 bg-vibe-primary-surface"
                            : "border-vibe-border-layout bg-vibe-bg-surface hover:border-vibe-border-ui hover:bg-vibe-bg-grey"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] font-bold text-vibe-primary tabular-nums">
                            [{formatSecondsToMMSS(seg.startSec)} -{" "}
                            {formatSecondsToMMSS(seg.endSec)}]
                          </span>
                          <span className="font-semibold text-vibe-text-primary">
                            {seg.speaker}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-0.5 rounded bg-vibe-warning-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-vibe-warning-hover">
                            <Flame className="h-2.5 w-2.5" />
                            {seg.energyScore}
                          </span>
                          {inClipRange && (
                            <span className="rounded bg-vibe-positive px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                              IN CUT
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="mt-1.5 leading-relaxed text-vibe-text-primary">
                        {seg.text}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                        <div className="flex flex-wrap gap-1">
                          {seg.keywords.map((kw) => (
                            <span
                              key={kw}
                              className="rounded border border-vibe-border-ui bg-vibe-bg-grey px-1.5 py-0.5 font-mono text-[10px] text-vibe-text-secondary"
                            >
                              #{kw}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onUpdateClip(activeClip.id, (prev) => ({
                                ...prev,
                                startSec: seg.startSec,
                                endSec: Math.max(
                                  prev.endSec,
                                  seg.startSec + 28,
                                ),
                              }))
                              setPlayheadSec(seg.startSec)
                            }}
                            className="rounded border border-vibe-primary/40 bg-vibe-primary-surface px-1.5 py-0.5 font-mono text-[10px] font-bold text-vibe-primary hover:bg-vibe-primary-selected"
                          >
                            [Set IN]
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onUpdateClip(activeClip.id, (prev) => ({
                                ...prev,
                                startSec: Math.min(
                                  prev.startSec,
                                  seg.endSec - 10,
                                ),
                                endSec: seg.endSec,
                              }))
                              setPlayheadSec(seg.startSec)
                            }}
                            className="rounded border border-vibe-border-ui bg-vibe-bg-grey px-1.5 py-0.5 font-mono text-[10px] font-bold text-vibe-text-primary hover:bg-vibe-primary-selected"
                          >
                            [Set OUT]
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* CENTER PANEL (PRIMARY FOCUS): Enlarged Vertical 9:16 Video Preview & Playback/Crop Controls */}
        <div
          className={`flex flex-col justify-between rounded-lg border-2 border-vibe-primary/30 bg-vibe-bg-surface p-4 vibe-shadow-md ${centerColSpan}`}
        >
          {/* Preview Header */}
          <div className="flex items-center justify-between border-b border-vibe-border-layout pb-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded bg-vibe-primary px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                9:16
              </span>
              <span className="text-sm font-bold text-vibe-text-primary">
                Primary Vertical Output Stage
              </span>
              <span className="hidden rounded bg-vibe-bg-grey px-2 py-0.5 font-mono text-[10px] text-vibe-text-secondary sm:inline">
                1080×1920 Preview
              </span>
              {(renderedVideoUrl || activeSource?.sourceUrl) && (
                <div className="flex items-center rounded border border-vibe-border-ui bg-vibe-bg-grey p-0.5 text-[10px] font-bold">
                  {renderedVideoUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewStageMode("rendered-video")}
                      className={`rounded px-2 py-0.5 transition ${
                        previewStageMode === "rendered-video"
                          ? "bg-vibe-positive text-white shadow-2xs"
                          : "text-vibe-text-secondary hover:text-vibe-text-primary"
                      }`}
                    >
                      ⚡ Rendered MP4
                    </button>
                  )}
                  {activeSource?.sourceUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewStageMode("source-video")}
                      className={`rounded px-2 py-0.5 transition ${
                        previewStageMode === "source-video"
                          ? "bg-vibe-primary text-white shadow-2xs"
                          : "text-vibe-text-secondary hover:text-vibe-text-primary"
                      }`}
                    >
                      Source Media
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPreviewStageMode("canvas-overlay")}
                    className={`rounded px-2 py-0.5 transition ${
                      previewStageMode === "canvas-overlay"
                        ? "bg-vibe-primary text-white shadow-2xs"
                        : "text-vibe-text-secondary hover:text-vibe-text-primary"
                    }`}
                  >
                    Studio Canvas
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <VibeButton
                kind="secondary"
                size="xs"
                active={showSafeZones}
                onClick={() => setShowSafeZones((prev) => !prev)}
              >
                SAFE ZONES: {showSafeZones ? "ON" : "OFF"}
              </VibeButton>
              <VibeButton
                kind="secondary"
                size="xs"
                onClick={() => {
                  const bothOpen = showTranscriptPanel && showInspectorPanel
                  setShowTranscriptPanel(!bothOpen)
                  setShowInspectorPanel(!bothOpen)
                }}
                title="Toggle Theater Focus Mode"
                leftIcon={
                  showTranscriptPanel && showInspectorPanel ? (
                    <Maximize2 className="h-3 w-3 text-vibe-primary" />
                  ) : (
                    <Minimize2 className="h-3 w-3 text-vibe-primary" />
                  )
                }
              >
                {showTranscriptPanel && showInspectorPanel
                  ? "Expand Stage"
                  : "Restore Panels"}
              </VibeButton>
              <ComplianceBadge status={liveComplianceStatus} />
            </div>
          </div>

          {/* Significantly Enlarged 9:16 Vertical Stage Container */}
          <div className="my-3 flex items-center justify-center rounded-xl border border-vibe-border-layout bg-vibe-bg-grey py-4 px-4">
            <div
              className={`relative aspect-[9/16] w-full ${
                !showTranscriptPanel || !showInspectorPanel
                  ? "max-w-[400px]"
                  : "max-w-[345px]"
              } overflow-hidden rounded-2xl border-2 border-vibe-primary bg-vibe-bg-surface vibe-shadow-md transition-all`}
            >
              {/* Simulated Processing Overlay when Rendering or Analyzing */}
              {(isRenderingLocal || isAnalyzingLocal) && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-vibe-bg-surface/90 p-6 text-center backdrop-blur-xs">
                  <Cpu className="h-8 w-8 animate-spin text-vibe-primary" />
                  <div className="mt-3 text-xs font-bold text-vibe-text-primary">
                    {isRenderingLocal
                      ? `Updating 9:16 Preview Specification (${renderProgress}%)`
                      : "Analyzing Transcript & Hook Velocity..."}
                  </div>
                  <p className="mt-1 text-[11px] text-vibe-text-secondary">
                    Simulated local studio pass — binary FFmpeg encoding awaits
                    backend worker integration.
                  </p>
                </div>
              )}

              {/* Real HTML5 Rendered 9:16 Video Player */}
              {previewStageMode === "rendered-video" && renderedVideoUrl ? (
                <div className="relative h-full w-full bg-black">
                  <video
                    key={renderedVideoUrl}
                    src={renderedVideoUrl}
                    controls
                    autoPlay
                    loop
                    playsInline
                    className="h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute top-3 left-3 z-20 flex items-center gap-1 rounded bg-black/75 px-2 py-0.5 font-mono text-[9px] font-bold text-vibe-positive backdrop-blur-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-vibe-positive" />
                    1080x1920 MP4 VERIFIED (FFMPEG)
                  </div>
                </div>
              ) : previewStageMode === "source-video" &&
                activeSource?.sourceUrl ? (
                <div className="relative h-full w-full bg-black">
                  <video
                    key={activeSource.sourceUrl}
                    src={activeSource.sourceUrl}
                    controls
                    autoPlay
                    playsInline
                    className="h-full w-full object-contain"
                  />
                  <div className="pointer-events-none absolute top-3 left-3 z-20 flex items-center gap-1 rounded bg-black/75 px-2 py-0.5 font-mono text-[9px] font-bold text-vibe-primary backdrop-blur-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-vibe-primary" />
                    SOURCE VIDEO STREAM ({activeSource.resolution})
                  </div>
                </div>
              ) : (
                <>
                  {/* Safe Zone Guides (TikTok / Shorts UI Exclusion Zones) */}
                  {showSafeZones && (
                    <div className="pointer-events-none absolute inset-4 z-10 rounded border border-dashed border-vibe-primary/50">
                      <span className="absolute top-1 left-1.5 rounded bg-vibe-primary-surface px-1 font-mono text-[8px] font-bold text-vibe-primary">
                        TITLE SAFE MARGIN
                      </span>
                      {/* Right-side social action icons exclusion zone */}
                      <div className="absolute right-1 bottom-14 flex flex-col gap-1.5 opacity-50">
                        <div className="h-5 w-5 rounded-full border border-vibe-border-ui bg-vibe-bg-grey" />
                        <div className="h-5 w-5 rounded-full border border-vibe-border-ui bg-vibe-bg-grey" />
                        <div className="h-5 w-5 rounded-full border border-vibe-border-ui bg-vibe-bg-grey" />
                      </div>
                    </div>
                  )}

                  {/* Sponsor Watermark Overlay */}
                  {activeClip.includeWatermark ? (
                    <div
                      className={`absolute z-20 flex items-center gap-1 rounded bg-vibe-primary px-2 py-0.5 font-mono text-[9px] font-bold text-white shadow-xs ${
                        activeClip.watermarkPosition === "top-left"
                          ? "top-3 left-3"
                          : activeClip.watermarkPosition === "bottom-right"
                            ? "right-3 bottom-24"
                            : "top-3 right-3"
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-vibe-positive" />
                      {activeCampaign?.sponsorName.split(" ")[0].toUpperCase()}{" "}
                      VERIFIED
                    </div>
                  ) : (
                    <div className="absolute top-3 right-3 z-20 rounded bg-vibe-negative px-2 py-0.5 font-mono text-[9px] font-bold text-white">
                      NO WATERMARK (RULE VIOLATION)
                    </div>
                  )}

                  {/* Visual Framing Representation based on CropMode */}
                  {activeClip.cropMode === "split-screen-podcast" ? (
                    <div className="flex h-full flex-col">
                      {/* Top Frame: Active Speaker */}
                      <div className="relative flex flex-1 flex-col items-center justify-center border-b border-vibe-border-ui bg-vibe-primary-surface p-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-vibe-primary font-mono text-sm font-bold text-white shadow-xs">
                          MV
                        </div>
                        <div className="mt-2 text-xs font-bold text-vibe-text-primary">
                          {activeSource.creatorName}
                        </div>
                        <span className="font-mono text-[9px] text-vibe-text-secondary">
                          TOP FRAME · SPEAKER LOCK
                        </span>
                      </div>
                      {/* Bottom Frame: Reaction / B-Roll Telemetry Diagram */}
                      <div className="relative flex flex-1 flex-col items-center justify-center bg-vibe-bg-surface p-4">
                        <div className="w-full rounded border border-vibe-border-ui bg-vibe-bg-grey p-2 font-mono text-[9px] text-vibe-text-primary">
                          <div className="font-bold text-vibe-primary">
                            RoCEv2 BENCHMARK TELEMETRY
                          </div>
                          <div className="mt-1 flex justify-between">
                            <span>Legacy Cloud:</span>
                            <span className="font-bold text-vibe-negative">
                              14m 00s
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>TensorScale Bare-Metal:</span>
                            <span className="font-bold text-vibe-positive-hover">
                              00m 41s
                            </span>
                          </div>
                        </div>
                        <span className="mt-2 font-mono text-[9px] text-vibe-text-secondary">
                          BOTTOM FRAME · B-ROLL SPLIT
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Single-Speaker Active Face-Track Canvas */
                    <div
                      className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-vibe-primary-surface to-vibe-bg-surface px-5 transition-transform"
                      style={{
                        transform: `translateX(${activeClip.faceTrackOffsetX}px)`,
                      }}
                    >
                      {/* Face Tracking Reticle */}
                      <div className="relative flex h-28 w-28 items-center justify-center rounded-2xl border-2 border-vibe-primary bg-vibe-bg-surface shadow-sm">
                        <span className="absolute -top-2.5 left-2 rounded bg-vibe-primary px-1.5 py-0.5 font-mono text-[8px] font-bold text-white">
                          FACE LOCK {activeClip.cropMode.toUpperCase()}
                        </span>
                        <div className="text-center">
                          <div className="font-mono text-lg font-extrabold text-vibe-primary">
                            {activeSource.creatorName
                              .split(" ")
                              .slice(0, 2)
                              .map((n) => n[0])
                              .join("")}
                          </div>
                          <div className="mt-0.5 font-mono text-[9px] font-bold text-vibe-positive-hover">
                            {activeClip.normalizeAudioLufs
                              ? "-14.0 LUFS"
                              : "-18.4 LUFS"}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 text-center">
                        <div className="text-xs font-bold text-vibe-text-primary">
                          {currentTranscriptSegment?.speaker ??
                            activeSource.creatorName}
                        </div>
                        <div className="font-mono text-[10px] text-vibe-text-secondary">
                          X-Offset: {activeClip.faceTrackOffsetX}px · 1080x1920
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Burned-in Dynamic Caption Overlay */}
                  <div
                    className={`absolute right-3 left-3 z-20 text-center transition-all ${captionPositionClass}`}
                  >
                    {activeClip.captionPreset === "kinetic-lime" && (
                      <div className="rounded-md border-2 border-vibe-primary bg-vibe-bg-surface px-2.5 py-2 shadow-md">
                        <p
                          className={`${captionFontSizeClass} font-extrabold tracking-tight text-vibe-text-primary uppercase`}
                        >
                          {(
                            currentTranscriptSegment?.text ??
                            activeClip.transcriptExcerpt
                          ).slice(0, 92)}
                          <span
                            className={`ml-1 inline-block rounded px-1.5 ${accentBadgeClass}`}
                          >
                            3.4x TAX
                          </span>
                        </p>
                      </div>
                    )}
                    {activeClip.captionPreset === "founder-mono" && (
                      <div className="rounded border border-vibe-border-ui bg-vibe-bg-surface px-2.5 py-2 font-mono shadow-md">
                        <p
                          className={`${captionFontSizeClass} font-semibold leading-snug text-vibe-primary`}
                        >
                          {(
                            currentTranscriptSegment?.text ??
                            activeClip.transcriptExcerpt
                          ).slice(0, 95)}
                        </p>
                      </div>
                    )}
                    {activeClip.captionPreset === "minimal-editorial" && (
                      <div className="rounded border border-vibe-border-layout bg-vibe-bg-surface/95 px-2.5 py-1.5 shadow-sm">
                        <p
                          className={`${captionFontSizeClass} font-semibold italic text-vibe-text-primary`}
                        >
                          {(
                            currentTranscriptSegment?.text ??
                            activeClip.transcriptExcerpt
                          ).slice(0, 95)}
                        </p>
                      </div>
                    )}
                    {activeClip.captionPreset === "high-contrast-box" && (
                      <div
                        className={`rounded px-2.5 py-1.5 shadow-md ${accentBadgeClass}`}
                      >
                        <p
                          className={`${captionFontSizeClass} font-extrabold uppercase`}
                        >
                          {(
                            currentTranscriptSegment?.text ??
                            activeClip.transcriptExcerpt
                          ).slice(0, 88)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Bottom Native Platform Telemetry Bar */}
                  <div className="absolute right-0 bottom-0 left-0 flex items-center justify-between border-t border-vibe-border-ui bg-vibe-bg-surface px-3 py-1.5 font-mono text-[10px]">
                    <span className="font-bold text-vibe-primary">
                      {formatSecondsToMMSS(playheadSec)} / {clipDuration}s cut
                    </span>
                    <span className="font-medium text-vibe-text-secondary">
                      {activeClip.includeCtaCard
                        ? "+3s CTA END-CARD"
                        : "NO CTA CARD"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Real MP4 Render Output & Download Action Bar */}
          {renderedVideoUrl && (
            <div className="mb-2 flex items-center justify-between rounded-lg border border-vibe-positive/40 bg-vibe-positive-surface px-3.5 py-2 text-xs vibe-shadow-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-vibe-positive" />
                <span className="font-semibold text-vibe-text-primary">
                  1080×1920 Vertical MP4 Rendered & Verified (
                  {activeRenderJob?.output_inspection?.file_size_bytes
                    ? `${Math.round(activeRenderJob.output_inspection.file_size_bytes / 1024)} KB`
                    : "Verified"}
                  )
                </span>
              </div>
              <a
                href={
                  activeRenderJob
                    ? argonApiClient.getDownloadUrl(activeRenderJob)
                    : renderedVideoUrl || "#"
                }
                download={`argon_vertical_1080x1920_${activeClip.id}.mp4`}
                className="inline-flex items-center gap-1.5 rounded-md bg-vibe-positive px-3 py-1 font-mono text-[11px] font-bold text-white shadow-xs hover:bg-vibe-positive-hover"
              >
                <Download className="h-3.5 w-3.5" />
                Download 1080x1920 MP4
              </a>
            </div>
          )}

          {/* Transport & Crop Mode Quick Toolbar */}
          <div className="space-y-2.5 border-t border-vibe-border-layout pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <VibeButton
                  kind="primary"
                  size="sm"
                  onClick={() => setIsPlaying((p) => !p)}
                  leftIcon={
                    isPlaying ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )
                  }
                >
                  {isPlaying ? "PAUSE" : "PLAY CUT"}
                </VibeButton>
                <VibeButton
                  kind="secondary"
                  size="sm"
                  onClick={() => setPlayheadSec(activeClip.startSec)}
                  title="Reset Playhead to Clip Start"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </VibeButton>
              </div>

              <div className="font-mono text-xs text-vibe-text-primary tabular-nums">
                Cut Length:{" "}
                <span
                  className={
                    clipDuration < minDurationRule ||
                    clipDuration > maxDurationRule
                      ? "font-bold text-vibe-negative"
                      : "font-bold text-vibe-positive-hover"
                  }
                >
                  {clipDuration}.0s
                </span>{" "}
                <span className="text-[11px] text-vibe-text-secondary">
                  (Rule: {minDurationRule}s–{maxDurationRule}s)
                </span>
              </div>
            </div>

            {/* Crop Mode Switcher */}
            <div className="grid grid-cols-2 gap-1.5">
              {([
                { id: "speaker-lock", label: "Speaker Face-Lock" },
                {
                  id: "split-screen-podcast",
                  label: "Split-Screen + Telemetry",
                },
              ] as { id: CropMode; label: string }[]).map((mode) => (
                <VibeButton
                  key={mode.id}
                  kind="secondary"
                  size="xs"
                  active={activeClip.cropMode === mode.id}
                  onClick={() =>
                    onUpdateClip(activeClip.id, (prev) => ({
                      ...prev,
                      cropMode: mode.id,
                    }))
                  }
                >
                  {mode.label}
                </VibeButton>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL (4 cols): Ranked Candidates, Explainable Hook Score, Editing & Compliance Rules */}
        {showInspectorPanel && (
          <div
            className={`flex flex-col rounded-lg border border-vibe-border-ui bg-vibe-bg-surface vibe-shadow-sm ${sideColSpan}`}
          >
            {/* Right Panel Monday Vibe Tabs */}
            <div className="flex items-center justify-between border-b border-vibe-border-layout bg-vibe-bg-grey p-1 text-xs">
              <div className="grid flex-1 grid-cols-3 gap-1">
                <button
                  onClick={() => setRightTab("candidates")}
                  className={`rounded py-1.5 font-semibold transition ${
                    rightTab === "candidates"
                      ? "bg-vibe-bg-surface text-vibe-primary shadow-2xs"
                      : "text-vibe-text-secondary hover:text-vibe-text-primary"
                  }`}
                >
                  1. Candidates ({sourceClips.length})
                </button>
                <button
                  onClick={() => setRightTab("controls")}
                  className={`rounded py-1.5 font-semibold transition ${
                    rightTab === "controls"
                      ? "bg-vibe-bg-surface text-vibe-primary shadow-2xs"
                      : "text-vibe-text-secondary hover:text-vibe-text-primary"
                  }`}
                >
                  2. Captions & Crop
                </button>
                <button
                  onClick={() => setRightTab("requirements")}
                  className={`rounded py-1.5 font-semibold transition ${
                    rightTab === "requirements"
                      ? "bg-vibe-bg-surface text-vibe-primary shadow-2xs"
                      : "text-vibe-text-secondary hover:text-vibe-text-primary"
                  }`}
                >
                  3. Brief Rules
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowInspectorPanel(false)}
                title="Collapse Inspector Panel"
                className="ml-1 rounded p-1 text-vibe-text-secondary hover:bg-vibe-bg-surface hover:text-vibe-text-primary"
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* TAB 1: Ranked Clip Candidates & Explainable Hook Score */}
            {rightTab === "candidates" && (
              <div className="flex-1 space-y-3 overflow-y-auto p-3.5">
                <div className="space-y-2">
                  {sourceClips.map((candidate) => {
                    const isSelected = candidate.id === activeClip.id
                    const dur = Math.round(
                      candidate.endSec - candidate.startSec,
                    )
                    return (
                      <div
                        key={candidate.id}
                        onClick={() => onSelectClip(candidate.id)}
                        className={`cursor-pointer rounded-lg border p-3 transition ${
                          isSelected
                            ? "border-vibe-primary bg-vibe-primary-selected/40 ring-1 ring-vibe-primary"
                            : "border-vibe-border-ui bg-vibe-bg-surface hover:bg-vibe-bg-grey"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-vibe-primary px-1.5 py-0.5 font-mono text-[11px] font-bold text-white">
                              #{candidate.rank}
                            </span>
                            <span className="text-xs font-bold text-vibe-text-primary">
                              {candidate.title}
                            </span>
                          </div>
                          <span className="shrink-0 rounded bg-vibe-positive px-2 py-0.5 font-mono text-xs font-bold text-white tabular-nums">
                            {candidate.hookScore ? candidate.hookScore : "--"}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-vibe-text-secondary">
                          <span className="font-mono tabular-nums">
                            {formatSecondsToMMSS(candidate.startSec)} →{" "}
                            {formatSecondsToMMSS(candidate.endSec)} ({dur}s)
                          </span>
                          <div className="flex items-center gap-1.5">
                            <ComplianceBadge
                              status={candidate.complianceSummaryStatus}
                            />
                            <ReviewStatusBadge
                              status={candidate.reviewStatus}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Explainable Hook Telemetry Breakdown Card */}
                <div className="rounded-lg border border-vibe-border-ui bg-vibe-bg-grey p-3.5">
                  <div className="flex items-center justify-between border-b border-vibe-border-ui pb-2">
                    <span className="font-sans text-[11px] font-bold text-vibe-primary uppercase">
                      Explainable Hook Intelligence
                    </span>
                    <span className="font-mono text-xs font-bold text-vibe-text-primary tabular-nums">
                      Composite:{" "}
                      {activeClip.hookScore
                        ? `${activeClip.hookScore}/99`
                        : "Pending Analysis"}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2 text-xs">
                    {[
                      {
                        label: "Opening 3s Velocity",
                        val: activeClip.hookBreakdown.openingVelocity,
                      },
                      {
                        label: "Controversy / Quantifier Delta",
                        val: activeClip.hookBreakdown.controversyOrInsightDelta,
                      },
                      {
                        label: "Pacing & Retention Cadence",
                        val: activeClip.hookBreakdown.retentionCadence,
                      },
                      {
                        label: "Sponsor Brief Alignment",
                        val: activeClip.hookBreakdown.sponsorAlignment,
                      },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="flex justify-between text-[11px]">
                          <span className="font-medium text-vibe-text-secondary">
                            {item.label}
                          </span>
                          <span className="font-mono font-bold text-vibe-text-primary tabular-nums">
                            {item.val}%
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-vibe-border-ui">
                          <div
                            className="h-full rounded-full bg-vibe-primary"
                            style={{ width: `${item.val}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="mt-3 rounded border border-vibe-border-ui bg-vibe-bg-surface p-2.5 text-[11px] leading-relaxed text-vibe-text-secondary">
                    <span className="font-bold text-vibe-text-primary">
                      Why this ranks #{activeClip.rank}:{" "}
                    </span>
                    {activeClip.hookBreakdown.explanation}
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: Editing Controls, Caption Presets, Branding & Audio */}
            {rightTab === "controls" && (
              <div className="flex-1 space-y-4 overflow-y-auto p-3.5 text-xs">
                {/* Collapsible Section: Caption Styling & Live Preview Controls */}
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedRightSections((s) => ({
                        ...s,
                        captions: !s.captions,
                      }))
                    }
                    className="mb-2 flex w-full items-center justify-between font-sans text-[11px] font-bold text-vibe-text-primary uppercase"
                  >
                    <span className="flex items-center gap-1.5">
                      <Subtitles className="h-3.5 w-3.5 text-vibe-primary" />
                      Caption Styling (Live 9:16 Preview)
                    </span>
                    {expandedRightSections.captions ? (
                      <ChevronUp className="h-3.5 w-3.5 text-vibe-text-secondary" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-vibe-text-secondary" />
                    )}
                  </button>
                  {expandedRightSections.captions && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          {
                            id: "kinetic-lime",
                            name: "Kinetic Highlight",
                            desc: "Word-sync accent punch",
                          },
                          {
                            id: "founder-mono",
                            name: "Founder Mono",
                            desc: "JetBrains technical box",
                          },
                          {
                            id: "minimal-editorial",
                            name: "Minimal Serif",
                            desc: "Clean editorial lower-3rd",
                          },
                          {
                            id: "high-contrast-box",
                            name: "High-Contrast Block",
                            desc: "Full accent highlight bar",
                          },
                        ] as {
                          id: CaptionPresetId
                          name: string
                          desc: string
                        }[]).map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() =>
                              onUpdateClip(activeClip.id, (prev) => ({
                                ...prev,
                                captionPreset: preset.id,
                              }))
                            }
                            className={`rounded border p-2.5 text-left transition ${
                              activeClip.captionPreset === preset.id
                                ? "border-vibe-primary bg-vibe-primary-selected/50 font-semibold"
                                : "border-vibe-border-ui bg-vibe-bg-surface hover:bg-vibe-bg-grey"
                            }`}
                          >
                            <div className="font-bold text-vibe-text-primary">
                              {preset.name}
                            </div>
                            <div className="mt-0.5 text-[10px] text-vibe-text-secondary">
                              {preset.desc}
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* Font Size, Vertical Position & Highlight Color */}
                      <div className="grid grid-cols-2 gap-2 rounded border border-vibe-border-ui bg-vibe-bg-grey p-2.5">
                        <div>
                          <label className="block font-sans text-[10px] font-bold text-vibe-text-secondary uppercase">
                            Font Scale
                          </label>
                          <div className="mt-1 flex gap-1">
                            {(["sm", "md", "lg"] as CaptionFontSize[]).map(
                              (sz) => (
                                <button
                                  key={sz}
                                  type="button"
                                  onClick={() =>
                                    onUpdateClip(activeClip.id, (prev) => ({
                                      ...prev,
                                      captionFontSize: sz,
                                    }))
                                  }
                                  className={`flex-1 rounded border py-1 font-mono text-[10px] font-bold uppercase ${
                                    activeCaptionFontSize === sz
                                      ? "border-vibe-primary bg-vibe-primary text-white"
                                      : "border-vibe-border-ui bg-vibe-bg-surface text-vibe-text-primary"
                                  }`}
                                >
                                  {sz}
                                </button>
                              ),
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block font-sans text-[10px] font-bold text-vibe-text-secondary uppercase">
                            Vertical Zone
                          </label>
                          <select
                            value={activeCaptionPosition}
                            onChange={(e) =>
                              onUpdateClip(activeClip.id, (prev) => ({
                                ...prev,
                                captionPosition: e.target
                                  .value as CaptionVerticalPosition,
                              }))
                            }
                            className="mt-1 w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-2 py-1 text-[11px] font-semibold text-vibe-text-primary"
                          >
                            <option value="lower-third">Lower Third</option>
                            <option value="center-stage">Center Stage</option>
                            <option value="upper-safe">Upper Safe</option>
                          </select>
                        </div>
                      </div>

                      <div className="rounded border border-vibe-border-ui bg-vibe-bg-grey p-2.5">
                        <label className="block font-sans text-[10px] font-bold text-vibe-text-secondary uppercase">
                          Keyword Highlight Color
                        </label>
                        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                          {([
                            {
                              id: "vibe-blue",
                              label: "Vibe Blue",
                              swatch: "bg-vibe-primary",
                            },
                            {
                              id: "done-green",
                              label: "Done Green",
                              swatch: "bg-vibe-positive",
                            },
                            {
                              id: "electric-lime",
                              label: "Lime",
                              swatch: "bg-[#C6F36B]",
                            },
                            {
                              id: "warning-amber",
                              label: "Amber",
                              swatch: "bg-vibe-warning",
                            },
                          ] as {
                            id: CaptionAccentColor
                            label: string
                            swatch: string
                          }[]).map((col) => (
                            <button
                              key={col.id}
                              type="button"
                              onClick={() =>
                                onUpdateClip(activeClip.id, (prev) => ({
                                  ...prev,
                                  captionAccentColor: col.id,
                                }))
                              }
                              className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold ${
                                activeCaptionAccent === col.id
                                  ? "border-vibe-primary bg-vibe-primary-selected text-vibe-primary"
                                  : "border-vibe-border-ui bg-vibe-bg-surface text-vibe-text-primary"
                              }`}
                            >
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${col.swatch}`}
                              />
                              <span className="truncate">{col.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Face-Track Horizontal Framing Offset */}
                <div className="rounded border border-vibe-border-ui bg-vibe-bg-grey p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-[11px] font-bold text-vibe-text-primary uppercase">
                      Speaker Face-Track X-Offset
                    </span>
                    <span className="font-mono text-xs font-bold text-vibe-primary tabular-nums">
                      {activeClip.faceTrackOffsetX}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-30}
                    max={30}
                    value={activeClip.faceTrackOffsetX}
                    onChange={(e) =>
                      onUpdateClip(activeClip.id, (prev) => ({
                        ...prev,
                        faceTrackOffsetX: Number(e.target.value),
                      }))
                    }
                    className="mt-2 w-full accent-vibe-primary"
                  />
                </div>

                {/* Sponsor Branding & Audio Mastering Toggles */}
                <div className="space-y-2 rounded border border-vibe-border-ui bg-vibe-bg-grey p-3">
                  <div className="font-sans text-[11px] font-bold text-vibe-text-primary uppercase">
                    Compliance Overlays & Mastering
                  </div>

                  <label className="flex cursor-pointer items-center justify-between rounded border border-vibe-border-ui bg-vibe-bg-surface p-2.5">
                    <div>
                      <div className="font-semibold text-vibe-text-primary">
                        Sponsor Watermark Badge (
                        {activeCampaign?.sponsorName.split(" ")[0]})
                      </div>
                      <div className="text-[10px] text-vibe-text-secondary">
                        Mandatory for campaign payout qualification
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeClip.includeWatermark}
                      onChange={(e) =>
                        onUpdateClip(activeClip.id, (prev) => {
                          const next = {
                            ...prev,
                            includeWatermark: e.target.checked,
                          }
                          next.complianceSummaryStatus =
                            summarizeComplianceStatus(
                              buildComplianceChecksForClip(
                                next,
                                activeCampaign,
                                manualAttestations,
                              ),
                            )
                          return next
                        })
                      }
                      className="h-4 w-4 accent-vibe-primary"
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between rounded border border-vibe-border-ui bg-vibe-bg-surface p-2.5">
                    <div>
                      <div className="font-semibold text-vibe-text-primary">
                        3-Second Sponsor Disclosure End-Card
                      </div>
                      <div className="text-[10px] text-vibe-text-secondary">
                        Appends verified sponsor attribution overlay
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeClip.includeCtaCard}
                      onChange={(e) =>
                        onUpdateClip(activeClip.id, (prev) => ({
                          ...prev,
                          includeCtaCard: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-vibe-primary"
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between rounded border border-vibe-border-ui bg-vibe-bg-surface p-2.5">
                    <div>
                      <div className="font-semibold text-vibe-text-primary">
                        Broadcast Loudness Normalization (-14.0 LUFS)
                      </div>
                      <div className="text-[10px] text-vibe-text-secondary">
                        Prevents platform loudness penalty on Shorts/TikTok
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeClip.normalizeAudioLufs}
                      onChange={(e) =>
                        onUpdateClip(activeClip.id, (prev) => {
                          const next = {
                            ...prev,
                            normalizeAudioLufs: e.target.checked,
                          }
                          next.complianceSummaryStatus =
                            summarizeComplianceStatus(
                              buildComplianceChecksForClip(
                                next,
                                activeCampaign,
                                manualAttestations,
                              ),
                            )
                          return next
                        })
                      }
                      className="h-4 w-4 accent-vibe-primary"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* TAB 3: Live Campaign Requirements & Compliance Checklist */}
            {rightTab === "requirements" && (
              <div className="flex-1 space-y-3 overflow-y-auto p-3.5 text-xs">
                <div className="flex items-center justify-between rounded border border-vibe-border-ui bg-vibe-bg-grey p-2.5">
                  <div>
                    <div className="font-bold text-vibe-text-primary">
                      Live Argon Guard Pre-Check
                    </div>
                    <div className="text-[10px] text-vibe-text-secondary">
                      Evaluated against {activeCampaign?.title}
                    </div>
                  </div>
                  <ComplianceBadge status={liveComplianceStatus} />
                </div>

                {liveComplianceChecks.some((c) => c.status === "failed") && (
                  <div className="rounded border border-vibe-negative bg-vibe-negative-surface p-3">
                    <div className="font-bold text-vibe-negative">
                      Compliance Rule Violation Detected
                    </div>
                    <p className="mt-1 text-[11px] text-vibe-text-primary">
                      One or more mandatory campaign constraints are failing.
                      Fix manually or apply auto-remediation below:
                    </p>
                    <VibeButton
                      kind="primary"
                      color="primary"
                      size="xs"
                      onClick={handleFixDurationToCompliantWindow}
                      className="mt-2"
                      leftIcon={<Wand2 className="h-3 w-3" />}
                    >
                      Auto-Remediate Duration & Watermark
                    </VibeButton>
                  </div>
                )}

                <div className="space-y-2">
                  {liveComplianceChecks.map((chk) => (
                    <div
                      key={chk.id}
                      className="rounded border border-vibe-border-ui bg-vibe-bg-surface p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-vibe-text-primary">
                          {chk.title}
                        </span>
                        <ComplianceBadge status={chk.status} />
                      </div>
                      <div className="mt-1 font-mono text-[11px] font-semibold text-vibe-primary">
                        Detected: {chk.detectedValue}
                      </div>
                      <div className="mt-0.5 text-[11px] text-vibe-text-secondary">
                        {chk.notes}
                      </div>
                    </div>
                  ))}
                </div>

                <VibeButton
                  kind="secondary"
                  fullWidth
                  onClick={() => onNavigate("argon-guard")}
                >
                  Open Full Argon Guard Compliance Inspector →
                </VibeButton>
              </div>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM INTERACTIVE TIMELINE PANEL */}
      <div className="rounded-lg border border-vibe-border-ui bg-vibe-bg-surface p-3.5 vibe-shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-vibe-border-layout pb-2.5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5 font-sans text-xs font-bold text-vibe-text-primary">
              <Sliders className="h-3.5 w-3.5 text-vibe-primary" />
              <span>TIMELINE TRIM</span>
            </div>

            {/* Start Handle Precision Controls */}
            <div className="flex items-center gap-1 rounded border border-vibe-border-ui bg-vibe-bg-grey px-2 py-1 font-mono text-xs">
              <span className="text-vibe-text-secondary">IN:</span>
              <span className="font-bold text-vibe-text-primary tabular-nums">
                {formatSecondsToMMSS(activeClip.startSec)}.0
              </span>
              <button
                onClick={() => handleAdjustTrim("startSec", -1)}
                className="ml-1 rounded border border-vibe-border-ui bg-vibe-bg-surface px-1.5 text-[11px] font-semibold text-vibe-text-primary hover:bg-vibe-primary-selected"
              >
                -1s
              </button>
              <button
                onClick={() => handleAdjustTrim("startSec", 1)}
                className="rounded border border-vibe-border-ui bg-vibe-bg-surface px-1.5 text-[11px] font-semibold text-vibe-text-primary hover:bg-vibe-primary-selected"
              >
                +1s
              </button>
            </div>

            {/* End Handle Precision Controls */}
            <div className="flex items-center gap-1 rounded border border-vibe-border-ui bg-vibe-bg-grey px-2 py-1 font-mono text-xs">
              <span className="text-vibe-text-secondary">OUT:</span>
              <span className="font-bold text-vibe-text-primary tabular-nums">
                {formatSecondsToMMSS(activeClip.endSec)}.0
              </span>
              <button
                onClick={() => handleAdjustTrim("endSec", -1)}
                className="ml-1 rounded border border-vibe-border-ui bg-vibe-bg-surface px-1.5 text-[11px] font-semibold text-vibe-text-primary hover:bg-vibe-primary-selected"
              >
                -1s
              </button>
              <button
                onClick={() => handleAdjustTrim("endSec", 1)}
                className="rounded border border-vibe-border-ui bg-vibe-bg-surface px-1.5 text-[11px] font-semibold text-vibe-text-primary hover:bg-vibe-primary-selected"
              >
                +1s
              </button>
            </div>

            <div className="font-mono text-xs text-vibe-text-secondary tabular-nums">
              DURATION:{" "}
              <span className="font-bold text-vibe-primary">
                {clipDuration}.0s
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px]">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] text-vibe-text-secondary">
                <span className="h-2.5 w-2.5 rounded-xs bg-vibe-primary" />{" "}
                Selected Cut
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-vibe-text-secondary">
                <span className="h-2.5 w-2.5 rounded-xs bg-vibe-border-ui" />{" "}
                Unselected Source
              </span>
            </div>
            <button
              onClick={() => onNavigate("review-queue")}
              className="inline-flex items-center gap-1 font-sans font-semibold text-vibe-primary hover:underline"
            >
              Proceed to Review Queue <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Interactive Waveform & Trim Track */}
        <div className="relative mt-3 h-24 select-none overflow-hidden rounded border border-vibe-border-ui bg-vibe-bg-grey px-3 py-2">
          {/* Time Ruler Marks */}
          <div className="flex justify-between font-mono text-[10px] font-medium text-vibe-text-secondary tabular-nums">
            <span>{formatSecondsToMMSS(timelineWindowStart)}</span>
            <span>{formatSecondsToMMSS(timelineWindowStart + 25)}</span>
            <span>{formatSecondsToMMSS(timelineWindowStart + 50)}</span>
            <span>{formatSecondsToMMSS(timelineWindowStart + 75)}</span>
            <span>{formatSecondsToMMSS(timelineWindowStart + 100)}</span>
          </div>

          {/* Left Unselected Shade Overlay */}
          <div
            className="pointer-events-none absolute top-6 bottom-1.5 left-0 bg-vibe-text-secondary/15"
            style={{ width: `${startPct}%` }}
          />

          {/* Right Unselected Shade Overlay */}
          <div
            className="pointer-events-none absolute top-6 right-0 bottom-1.5 bg-vibe-text-secondary/15"
            style={{ width: `${Math.max(0, 100 - endPct)}%` }}
          />

          {/* Waveform Bars */}
          <div className="mt-3 flex h-11 items-center justify-between gap-1">
            {activeSource.waveformPeaks.map((peak, idx) => {
              const barPct = (idx / activeSource.waveformPeaks.length) * 100
              const isInsideCut = barPct >= startPct && barPct <= endPct
              return (
                <div
                  key={idx}
                  onClick={() => {
                    const clickedSec = Math.round(
                      timelineWindowStart + (barPct / 100) * timelineWindowSpan,
                    )
                    setPlayheadSec(clickedSec)
                  }}
                  style={{ height: `${Math.max(18, peak)}%` }}
                  className={`flex-1 cursor-pointer rounded-full transition ${
                    isInsideCut
                      ? "bg-vibe-primary"
                      : "bg-vibe-border-ui/70 opacity-50 hover:opacity-80"
                  }`}
                />
              )
            })}
          </div>

          {/* Active Trim Selection Window Box */}
          <div
            className="pointer-events-none absolute top-6 bottom-1.5 rounded border-2 border-vibe-primary bg-vibe-primary/15"
            style={{
              left: `${startPct}%`,
              width: `${Math.max(6, endPct - startPct)}%`,
            }}
          >
            <div className="absolute -top-4 left-0 rounded bg-vibe-primary px-1 font-mono text-[9px] font-bold text-white">
              IN {formatSecondsToMMSS(activeClip.startSec)}
            </div>
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded bg-vibe-positive px-1.5 font-mono text-[9px] font-bold text-white">
              SELECTED CUT ({clipDuration}s)
            </div>
            <div className="absolute -top-4 right-0 rounded bg-vibe-primary px-1 font-mono text-[9px] font-bold text-white">
              OUT {formatSecondsToMMSS(activeClip.endSec)}
            </div>
          </div>

          {/* Playhead Vertical Line */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-vibe-negative shadow"
            style={{ left: `${playheadPct}%` }}
          />
        </div>
      </div>

      {/* Add Authorized Source Asset Modal */}
      {showAddSourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-vibe-text-primary/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-lg border border-vibe-border-ui bg-vibe-bg-surface p-5 vibe-shadow-md">
            <div className="flex items-center justify-between border-b border-vibe-border-layout pb-3">
              <div>
                <h3 className="text-sm font-bold text-vibe-text-primary">
                  Add Authorized Long-Form Source Asset
                </h3>
                <p className="text-xs text-vibe-text-secondary">
                  Attach a licensed podcast or keynote feed to{" "}
                  {activeCampaign?.title}
                </p>
              </div>
              <DemoTag
                label={uploadFile ? "LIVE FFPROBE UPLOAD" : "SIMULATED INGEST"}
              />
            </div>

            <form
              onSubmit={handleCreateSourceSubmit}
              className="mt-4 space-y-3.5 text-xs"
            >
              {/* Real MP4 File Ingestion */}
              <div className="rounded-lg border-2 border-dashed border-vibe-primary/40 bg-vibe-primary-surface/40 p-3 text-center">
                <input
                  type="file"
                  id="source-file-upload-input"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setUploadFile(f)
                      if (!newSourceTitle) {
                        setNewSourceTitle(f.name.replace(/\.[^/.]+$/, ""))
                      }
                    }
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="source-file-upload-input"
                  className="cursor-pointer font-sans text-xs font-semibold text-vibe-primary hover:underline"
                >
                  {uploadFile
                    ? `📁 Selected: ${uploadFile.name} (${(uploadFile.size / (1024 * 1024)).toFixed(1)} MB)`
                    : "📁 Click to Choose Authorized MP4 Video to Upload & Inspect"}
                </label>
                <p className="mt-1 text-[11px] text-vibe-text-secondary">
                  Uploaded MP4s are binary-inspected in real-time with FFprobe
                  (resolution, streams, audio LUFS).
                </p>
                {uploadError && (
                  <p className="mt-1 text-xs font-semibold text-vibe-negative">
                    {uploadError}
                  </p>
                )}
              </div>

              <div>
                <label className="block font-sans text-[11px] font-semibold text-vibe-text-primary">
                  EPISODE / KEYNOTE TITLE *
                </label>
                <input
                  type="text"
                  required
                  value={newSourceTitle}
                  onChange={(e) => setNewSourceTitle(e.target.value)}
                  placeholder="e.g. Latent Space Ep #145 — NVLink Switch Deep Dive"
                  className="mt-1 w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-3 py-2 text-xs text-vibe-text-primary focus:border-vibe-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-sans text-[11px] font-semibold text-vibe-text-primary">
                    FEATURED SPEAKER / CREATOR
                  </label>
                  <input
                    type="text"
                    value={newSourceCreator}
                    onChange={(e) => setNewSourceCreator(e.target.value)}
                    placeholder="e.g. Dr. Aris Thorne"
                    className="mt-1 w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-3 py-2 text-xs text-vibe-text-primary focus:border-vibe-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-sans text-[11px] font-semibold text-vibe-text-primary">
                    SPONSOR AUTHORIZATION TOKEN
                  </label>
                  <input
                    type="text"
                    value={newSourceAuth}
                    onChange={(e) => setNewSourceAuth(e.target.value)}
                    placeholder="AUTH-2025-VERIFIED"
                    className="mt-1 w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-3 py-2 text-xs text-vibe-text-primary focus:border-vibe-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-sans text-[11px] font-semibold text-vibe-text-primary">
                  SOURCE MEDIA STREAM URL (IF NOT UPLOADING FILE)
                </label>
                <input
                  type="text"
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  placeholder="https://authorized-cdn.internal/source-master-4k.mp4"
                  className="mt-1 w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-3 py-2 font-mono text-xs text-vibe-text-primary focus:border-vibe-primary focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-vibe-border-layout pt-3">
                <VibeButton
                  type="button"
                  kind="secondary"
                  onClick={() => {
                    setShowAddSourceModal(false)
                    setUploadFile(null)
                    setUploadError(null)
                  }}
                >
                  Cancel
                </VibeButton>
                <VibeButton type="submit" kind="primary" disabled={isUploading}>
                  {isUploading
                    ? "Uploading & Inspecting via FFprobe..."
                    : uploadFile
                      ? "⚡ Upload & Inspect (FFprobe)"
                      : "Attach Source & Prepare Transcript"}
                </VibeButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
