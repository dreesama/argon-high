/**
 * Argon High API Client — Sprint 3 (Production Intelligence & Compliance)
 * Connects frontend Clip Studio, Campaign Radar, and Argon Guard directly to
 * FastAPI backend services, FFprobe inspection, faster-whisper STT,
 * brief parsing, pre-flight guard checks, and smart framing.
 */

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';

export interface BackendHealth {
  status: string;
  service: string;
  version: string;
  environment: string;
  binaries: {
    ffmpeg: string;
    ffprobe: string;
  };
}

export interface BackendMediaUploadResponse {
  source_asset_id: string;
  workspace_id: string;
  campaign_id: string;
  title: string;
  filename: string;
  file_size_bytes: number;
  duration_sec: number;
  resolution: string;
  fps: number;
  audio_lufs: number;
  inspection: {
    is_valid: boolean;
    duration_sec: number;
    video_stream?: {
      codec_name: string;
      width: number;
      height: number;
      aspect_ratio: string;
      fps: number;
    };
    audio_stream?: {
      codec_name: string;
      sample_rate: number;
      channels: number;
      lufs?: number;
    };
    warnings: string[];
  };
  authorization_proof: string;
}

export interface BackendTranscriptWord {
  word: string;
  start_sec: number;
  end_sec: number;
  probability: number;
}

export interface BackendTranscriptSegment {
  id: string;
  speaker: string;
  start_sec: number;
  end_sec: number;
  text: string;
  confidence_pct?: number;
  no_speech_prob?: number;
  energy_score: number;
  keywords: string[];
  words?: BackendTranscriptWord[];
}

export interface SevenFactorBreakdown {
  opening_hook_strength: number;
  standalone_context_clarity: number;
  emotional_curiosity_intensity: number;
  narrative_completeness: number;
  speech_pacing_wpm: number;
  campaign_relevance: number;
  duration_compliance: number;
  heuristic_explanation: string;
}

export interface BackendCandidateRange {
  candidate_id: string;
  rank: number;
  title: string;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  hook_score: number;
  hook_breakdown: {
    opening_velocity: number;
    controversy_or_insight_delta: number;
    retention_cadence: number;
    sponsor_alignment: number;
    explanation: string;
  };
  seven_factor_breakdown?: SevenFactorBreakdown;
  transcript_excerpt: string;
  primary_keywords: string[];
  suggested_crop_mode: string;
  suggested_caption_preset: string;
  snapped_to_sentence_boundary?: boolean;
}

export interface BackendTranscriptionResponse {
  source_asset_id: string;
  full_transcript: BackendTranscriptSegment[];
  total_segments: number;
  duration_sec: number;
  candidates: BackendCandidateRange[];
  detected_language: string;
  acoustic_energy_average: number;
  model_name?: string;
  is_real_ai_inference?: boolean;
  silence_ratio_pct?: number;
  diarization_status?: string;
}

export interface BackendRenderJobStatus {
  job_id: string;
  clip_id?: string;
  workspace_id?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress_pct: number;
  started_at_iso?: string;
  completed_at_iso?: string;
  duration_sec: number;
  output_filename?: string;
  output_inspection?: {
    is_valid_mp4: boolean;
    width: number;
    height: number;
    aspect_ratio: string;
    duration_sec: number;
    video_codec: string;
    audio_codec: string;
    file_size_bytes: number;
  };
  burned_captions_preset?: string;
  download_token?: string;
  error_message?: string;
  cancellation_reason?: string;
  download_url?: string;
  preview_url?: string;
}

export interface BackendExtractedRuleItem {
  rule_id: string;
  category: string;
  title: string;
  description: string;
  value: any;
  evidence_quote?: string;
  confidence: number;
  status: 'extracted' | 'human_verified' | 'human_modified' | 'unknown';
  is_mandatory: boolean;
  notes?: string;
}

export interface BackendCampaignRecord {
  campaign_id: string;
  workspace_id: string;
  title: string;
  sponsor_name: string;
  raw_brief_text: string;
  brief_version: number;
  extracted_rules: BackendExtractedRuleItem[];
  eligible_platforms: string[];
  min_duration_sec?: number;
  max_duration_sec?: number;
  required_hashtags: string[];
  required_mentions: string[];
  required_disclosures: string[];
  prohibited_words: string[];
  prohibited_topics: string[];
  payout_cap_usd?: number;
  cpm_usd?: number;
  deadline_iso?: string;
  licensing_terms?: string;
  unknown_fields: string[];
  created_at_iso: string;
  updated_at_iso: string;
}

export interface BackendComplianceCheckItem {
  check_id: string;
  category: 'deterministic_file' | 'heuristic_visual' | 'editorial_attestation';
  title: string;
  description: string;
  status: 'PASS' | 'FAIL' | 'WARNING' | 'UNKNOWN' | 'HUMAN_REVIEW_REQUIRED';
  measured_value?: any;
  expected_value?: any;
  is_blocking: boolean;
  evidence?: string;
  reviewer_notes?: string;
  attested_by?: string;
  attested_at_iso?: string;
}

export interface BackendGuardValidationReport {
  report_id: string;
  job_id: string;
  clip_id?: string;
  campaign_id?: string;
  workspace_id: string;
  overall_status: 'PASS' | 'FAIL' | 'REQUIRES_REVIEW';
  is_export_ready: boolean;
  summary: string;
  checks: BackendComplianceCheckItem[];
  total_checks: number;
  passed_count: number;
  failed_count: number;
  warning_count: number;
  unknown_count: number;
  review_required_count: number;
  validated_at_iso: string;
  compliance_disclaimer: string;
}

export interface BackendFramingAnalysisResult {
  source_width: number;
  source_height: number;
  target_width: number;
  target_height: number;
  crop_x: number;
  crop_y: number;
  crop_width: number;
  crop_height: number;
  manual_offset_applied: number;
  tracking_mode: 'auto_face_tracked' | 'center_safe_area' | 'manual_calibrated';
  confidence: number;
  framing_stability_score: number;
  safe_zones: Array<{
    name: string;
    y_min_px: number;
    y_max_px: number;
    description: string;
  }>;
  explanation: string;
}

export interface BackendCreativeQAReport {
  clip_id: string;
  source_asset_id: string;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  awkward_start_detected: boolean;
  awkward_start_reason?: string;
  awkward_ending_detected: boolean;
  awkward_ending_reason?: string;
  excessive_silence_detected: boolean;
  silence_ratio_pct: number;
  subtitle_overflow_risk: boolean;
  max_words_per_second: number;
  framing_stability_score: number;
  suggested_adjustments?: {
    suggested_start_sec: number;
    suggested_end_sec: number;
    adjustment_reason: string;
    confidence: number;
  };
  editorial_warnings: string[];
  heuristic_model_disclaimer: string;
}

export class ArgonApiClient {
  private token: string = 'argon_dev_token_syndicate_2026';

  private getHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      'X-Workspace-Id': 'ws-argon-core',
    };
  }

  async checkHealth(): Promise<BackendHealth | null> {
    try {
      const resp = await fetch(`${API_BASE}/health`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }

  async uploadSourceVideo(
    file: File,
    campaignId: string,
    title?: string,
    creatorName?: string,
    authorizationProof?: string
  ): Promise<BackendMediaUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('campaign_id', campaignId);
    if (title) formData.append('title', title);
    if (creatorName) formData.append('creator_name', creatorName);
    if (authorizationProof) formData.append('authorization_proof', authorizationProof);

    const resp = await fetch(`${API_BASE}/media/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'X-Workspace-Id': 'ws-argon-core',
      },
      body: formData,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Upload failed');
    }

    return await resp.json();
  }

  async transcribeAndRank(
    sourceAssetId: string,
    sponsorName?: string
  ): Promise<BackendTranscriptionResponse> {
    const resp = await fetch(`${API_BASE}/intelligence/transcribe-and-rank`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_asset_id: sourceAssetId,
        sponsor_name: sponsorName || 'Argon High Syndicate',
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Transcription failed');
    }

    return await resp.json();
  }

  async evaluateCreativeQA(
    sourceAssetId: string,
    clipId: string,
    startSec: number,
    endSec: number
  ): Promise<BackendCreativeQAReport> {
    const resp = await fetch(`${API_BASE}/intelligence/evaluate-creative-qa`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_asset_id: sourceAssetId,
        clip_id: clipId,
        start_sec: startSec,
        end_sec: endSec,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Creative QA evaluation failed');
    }

    return await resp.json();
  }

  async createRenderJob(params: {
    sourceAssetId: string;
    clipId?: string;
    campaignId?: string;
    startSec: number;
    endSec: number;
    targetWidth?: number;
    targetHeight?: number;
    cropMode?: string;
    faceTrackOffsetX?: number;
    captionPreset?: string;
    burnCaptions?: boolean;
    normalizeAudioLufs?: boolean;
    fadeAudio?: boolean;
    watermarkText?: string;
  }): Promise<BackendRenderJobStatus> {
    const resp = await fetch(`${API_BASE}/render/jobs`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_asset_id: params.sourceAssetId,
        clip_id: params.clipId,
        campaign_id: params.campaignId,
        start_sec: params.startSec,
        end_sec: params.endSec,
        target_width: params.targetWidth ?? 1080,
        target_height: params.targetHeight ?? 1920,
        crop_mode: params.cropMode ?? 'split-screen-podcast',
        face_track_offset_x: params.faceTrackOffsetX ?? 0,
        burn_captions: params.burnCaptions ?? true,
        caption_preset: params.captionPreset ?? 'kinetic-lime',
        normalize_audio_lufs: params.normalizeAudioLufs ?? true,
        fade_audio: params.fadeAudio ?? true,
        watermark_text: params.watermarkText ?? 'ARGON HIGH VERIFIED',
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Render job creation failed');
    }

    return await resp.json();
  }

  async pollRenderJob(jobId: string): Promise<BackendRenderJobStatus> {
    const resp = await fetch(`${API_BASE}/render/jobs/${jobId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Failed to poll job status');
    }

    return await resp.json();
  }

  async cancelRenderJob(jobId: string): Promise<BackendRenderJobStatus> {
    const resp = await fetch(`${API_BASE}/render/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Failed to cancel render job');
    }

    return await resp.json();
  }

  async calculateSmartFraming(params: {
    sourceAssetId: string;
    manualOffsetX?: number;
    cropMode?: string;
  }): Promise<BackendFramingAnalysisResult> {
    const resp = await fetch(`${API_BASE}/render/framing/calculate`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_asset_id: params.sourceAssetId,
        manual_offset_x: params.manualOffsetX ?? 0,
        crop_mode: params.cropMode ?? 'split-screen-podcast',
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Framing calculation failed');
    }

    return await resp.json();
  }

  // --- Campaign Intelligence ---

  async ingestCampaignBrief(
    title: string,
    sponsorName: string,
    briefText: string,
    campaignId?: string
  ): Promise<BackendCampaignRecord> {
    const resp = await fetch(`${API_BASE}/campaigns/ingest-brief`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        campaign_id: campaignId,
        title,
        sponsor_name: sponsorName,
        brief_text: briefText,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Brief ingestion failed');
    }

    return await resp.json();
  }

  async getCampaigns(): Promise<BackendCampaignRecord[]> {
    const resp = await fetch(`${API_BASE}/campaigns`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!resp.ok) return [];
    return await resp.json();
  }

  async getCampaign(campaignId: string): Promise<BackendCampaignRecord | null> {
    const resp = await fetch(`${API_BASE}/campaigns/${campaignId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!resp.ok) return null;
    return await resp.json();
  }

  async updateCampaignRule(
    campaignId: string,
    ruleId: string,
    value: any,
    status: 'human_verified' | 'human_modified',
    notes?: string
  ): Promise<BackendCampaignRecord> {
    const resp = await fetch(`${API_BASE}/campaigns/${campaignId}/rules/${ruleId}`, {
      method: 'PUT',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value, status, notes }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Failed to update campaign rule');
    }

    return await resp.json();
  }

  // --- Argon Guard V2 Pre-Flight Validation ---

  async validateClipCompliance(
    jobId: string,
    campaignId?: string,
    clipId?: string
  ): Promise<BackendGuardValidationReport> {
    const resp = await fetch(`${API_BASE}/guard/validate-clip`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job_id: jobId,
        campaign_id: campaignId,
        clip_id: clipId,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Guard validation failed');
    }

    return await resp.json();
  }

  async getGuardReportForJob(jobId: string): Promise<BackendGuardValidationReport | null> {
    const resp = await fetch(`${API_BASE}/guard/jobs/${jobId}/report`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!resp.ok) return null;
    return await resp.json();
  }

  async attestGuardRule(
    reportId: string,
    checkId: string,
    attestationStatus: 'PASS' | 'FAIL',
    reviewerNotes: string,
    attestedBy?: string
  ): Promise<BackendGuardValidationReport> {
    const resp = await fetch(`${API_BASE}/guard/reports/${reportId}/attest`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        check_id: checkId,
        attestation_status: attestationStatus,
        reviewer_notes: reviewerNotes,
        attested_by: attestedBy || 'Lead Syndicate Operator',
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Attestation submission failed');
    }

    return await resp.json();
  }

  // --- Review Queue Approvals ---

  async submitApprovalDecision(
    clipId: string,
    decision: 'approved' | 'rejected' | 'revision_requested',
    notes: string,
    workspaceId?: string
  ): Promise<any> {
    const resp = await fetch(`${API_BASE}/performance/approvals`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clip_id: clipId,
        decision,
        notes,
        workspace_id: workspaceId,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Failed to submit approval decision');
    }

    return await resp.json();
  }

  async getClipApprovals(clipId: string): Promise<any[]> {
    const resp = await fetch(`${API_BASE}/performance/approvals/clip/${clipId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!resp.ok) return [];
    return await resp.json();
  }

  // --- Platform Publications ---

  async recordPublicationUrl(
    clipId: string,
    platform: 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'x_video',
    publicationUrl: string,
    campaignId?: string,
    platformPostId?: string
  ): Promise<any> {
    const resp = await fetch(`${API_BASE}/performance/publications`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clip_id: clipId,
        platform,
        publication_url: publicationUrl,
        campaign_id: campaignId,
        platform_post_id: platformPostId,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Failed to record publication');
    }

    return await resp.json();
  }

  async listWorkspacePublications(): Promise<any[]> {
    const resp = await fetch(`${API_BASE}/performance/publications`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!resp.ok) return [];
    return await resp.json();
  }

  // --- Performance Lab V2 Snapshots & Financial Ledger ---

  async recordPerformanceSnapshot(params: {
    publicationId: string;
    clipId: string;
    campaignId: string;
    viewsCount: number;
    verifiedViewsCount?: number;
    cpmUsd?: number;
    payoutCapUsd?: number;
    productionHours?: number;
    platformFeesUsd?: number;
    productionCostUsd?: number;
    reconciled?: boolean;
    notes?: string;
  }): Promise<any> {
    const resp = await fetch(`${API_BASE}/performance/snapshots`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publication_id: params.publicationId,
        clip_id: params.clipId,
        campaign_id: params.campaignId,
        views_count: params.viewsCount,
        verified_views_count: params.verifiedViewsCount ?? 0,
        cpm_usd: params.cpmUsd ?? 5.0,
        payout_cap_usd: params.payoutCapUsd ?? 1500.0,
        production_hours: params.productionHours ?? 1.0,
        platform_fees_usd: params.platformFeesUsd ?? 0.0,
        production_cost_usd: params.productionCostUsd ?? 0.0,
        reconciled: params.reconciled ?? false,
        notes: params.notes,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Failed to record performance snapshot');
    }

    return await resp.json();
  }

  async listPerformanceSnapshots(): Promise<any[]> {
    const resp = await fetch(`${API_BASE}/performance/snapshots`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!resp.ok) return [];
    return await resp.json();
  }

  async getPerformanceSummary(): Promise<any | null> {
    const resp = await fetch(`${API_BASE}/performance/summary`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!resp.ok) return null;
    return await resp.json();
  }

  getPreviewUrl(job: BackendRenderJobStatus | string): string {
    if (typeof job === 'string') {
      return `${API_BASE}/render/output/${job}/preview?token=${this.token}`;
    }
    if (job.preview_url) {
      return `${API_BASE.replace('/api/v1', '')}${job.preview_url}`;
    }
    return `${API_BASE}/render/output/${job.job_id}/preview?token=${job.download_token || this.token}`;
  }

  getDownloadUrl(job: BackendRenderJobStatus | string): string {
    if (typeof job === 'string') {
      return `${API_BASE}/render/output/${job}/download?token=${this.token}`;
    }
    if (job.download_url) {
      return `${API_BASE.replace('/api/v1', '')}${job.download_url}`;
    }
    return `${API_BASE}/render/output/${job.job_id}/download?token=${job.download_token || this.token}`;
  }

  getSourceStreamUrl(sourceAssetId: string): string {
    return `${API_BASE}/media/${sourceAssetId}/stream`;
  }
}

export const argonApiClient = new ArgonApiClient();
