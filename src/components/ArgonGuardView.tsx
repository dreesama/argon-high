import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck2,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Wand2,
  XCircle,
} from 'lucide-react';
import {
  Campaign,
  CampaignRule,
  ClipCandidate,
  ComplianceStatus,
  NavSection,
} from '../types/argon';
import {
  buildComplianceChecksForClip,
  evaluateExportEligibility,
  formatSecondsToMMSS,
  summarizeComplianceStatus,
} from '../data/mockArgonData';
import {
  ComplianceBadge,
  DemoTag,
  OperationalStatusBadge,
  ReviewStatusBadge,
} from './ArgonBadges';
import { VibeAttentionBox, VibeBoardGroup, VibeButton, VibeCard } from '../vibe/VibeComponents';
import { argonApiClient, BackendGuardValidationReport } from '../services/argonApiClient';

interface ArgonGuardProps {
  campaigns: Campaign[];
  campaignRules: CampaignRule[];
  clips: ClipCandidate[];
  selectedClipId: string;
  manualAttestations: Record<string, boolean>;
  onSelectClip: (clipId: string) => void;
  onToggleManualAttestation: (clipId: string, attested: boolean) => void;
  onUpdateClip: (clipId: string, updater: (prev: ClipCandidate) => ClipCandidate) => void;
  onTriggerSimulatedRender: (clipId: string) => void;
  onNavigate: (section: NavSection) => void;
}

export const ArgonGuardView: React.FC<ArgonGuardProps> = ({
  campaigns,
  campaignRules,
  clips,
  selectedClipId,
  manualAttestations,
  onSelectClip,
  onToggleManualAttestation,
  onUpdateClip,
  onTriggerSimulatedRender,
  onNavigate,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | ComplianceStatus>('ALL');
  const [auditToast, setAuditToast] = useState<string | null>(null);
  const [liveReport, setLiveReport] = useState<BackendGuardValidationReport | null>(null);
  const [isCheckingLive, setIsCheckingLive] = useState(false);

  const handleRunLiveGuardCheck = async () => {
    if (!activeClip) return;
    setIsCheckingLive(true);
    try {
      const jobId = (activeClip as any).renderJobId || `job-clip-${activeClip.id}`;
      const report = await argonApiClient.validateClipCompliance(jobId, activeCampaign?.id, activeClip.id);
      setLiveReport(report);
      setAuditToast(`⚡ Argon Guard V2 Certified! ${report.passed_count}/${report.total_checks} checks passed. Status: ${report.overall_status}.`);
    } catch (e: any) {
      setAuditToast(`Guard V2 Note: ${e.message || 'Render vertical clip in Studio first to inspect output.'}`);
    } finally {
      setIsCheckingLive(false);
      window.setTimeout(() => setAuditToast(null), 6000);
    }
  };

  const activeClip = clips.find((c) => c.id === selectedClipId) ?? clips[0];
  const activeCampaign = campaigns.find((c) => c.id === activeClip?.campaignId);

  const allChecks = useMemo(() => {
    if (!activeClip) return [];
    return buildComplianceChecksForClip(activeClip, activeCampaign, manualAttestations);
  }, [activeClip, activeCampaign, manualAttestations]);

  const filteredChecks = useMemo(() => {
    if (statusFilter === 'ALL') return allChecks;
    return allChecks.filter((c) => c.status === statusFilter);
  }, [allChecks, statusFilter]);

  const summaryStatus = useMemo(
    () => summarizeComplianceStatus(allChecks),
    [allChecks]
  );

  const counts = useMemo(() => {
    return {
      passed: allChecks.filter((c) => c.status === 'passed').length,
      failed: allChecks.filter((c) => c.status === 'failed').length,
      warning: allChecks.filter((c) => c.status === 'warning').length,
      pending: allChecks.filter((c) => c.status === 'pending').length,
      humanReview: allChecks.filter((c) => c.status === 'human-review').length,
    };
  }, [allChecks]);

  const handleAutoFixClip = () => {
    if (!activeClip) return;
    const minDur = activeCampaign?.id === 'cmp-meridian-fx' ? 30 : 28;
    onUpdateClip(activeClip.id, (prev) => {
      const curDur = Math.round(prev.endSec - prev.startSec);
      const nextEnd =
        curDur < minDur || curDur > 58 ? prev.startSec + minDur + 6 : prev.endSec;
      const updated: ClipCandidate = {
        ...prev,
        endSec: nextEnd,
        includeWatermark: true,
        normalizeAudioLufs: true,
        renderStatus: 'rendered',
      };
      updated.complianceSummaryStatus = summarizeComplianceStatus(
        buildComplianceChecksForClip(updated, activeCampaign, manualAttestations)
      );
      return updated;
    });
    onTriggerSimulatedRender(activeClip.id);
    setAuditToast(
      'Applied automated rule remediation (Duration window, Sponsor Watermark, -14 LUFS target, and 1080x1920 render profile).'
    );
    window.setTimeout(() => setAuditToast(null), 4000);
  };

  if (!activeClip) return null;

  const attestationKey = `${activeClip.id}:disclosure`;
  const isAttested = Boolean(
    manualAttestations[attestationKey] ??
      (activeClip.reviewStatus === 'export-ready' || activeClip.reviewStatus === 'approved')
  );
  const exportEligibility = evaluateExportEligibility(activeClip, allChecks);

  return (
    <div className="space-y-5">
      {/* Header & Transparency Notice */}
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-vibe-border-ui bg-vibe-bg-surface p-5 vibe-shadow-sm lg:flex-row lg:items-center">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-vibe-positive" />
            <h1 className="text-sm font-bold tracking-wide text-vibe-text-primary uppercase">
              Argon Guard · Pre-Flight Campaign Compliance Engine
            </h1>
            <DemoTag label="RULE-BASED METADATA & HEURISTIC VALIDATION" />
          </div>
          <p className="text-xs text-vibe-text-secondary">
            Validates clip metadata, trim duration, caption overlays, sponsor watermarks, and human editorial attestations.{' '}
            <span className="font-semibold text-vibe-text-primary">
              Note: Checks evaluate studio composition parameters and operator attestations — not binary FFprobe stream inspection.
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <VibeButton
            kind="secondary"
            size="md"
            onClick={handleRunLiveGuardCheck}
            disabled={isCheckingLive}
            leftIcon={<RefreshCw className={`h-4 w-4 text-vibe-primary ${isCheckingLive ? 'animate-spin' : ''}`} />}
          >
            {isCheckingLive ? 'Inspecting Media...' : 'Run Live FFprobe Guard V2'}
          </VibeButton>
          <VibeButton
            kind="primary"
            color="positive"
            size="md"
            onClick={handleAutoFixClip}
            leftIcon={<Wand2 className="h-4 w-4" />}
          >
            Remediate Failing Rules
          </VibeButton>
          <VibeButton
            kind="secondary"
            size="md"
            onClick={() => onNavigate('review-queue')}
            leftIcon={<FileCheck2 className="h-4 w-4 text-vibe-primary" />}
          >
            Send to Review Queue →
          </VibeButton>
        </div>
      </div>

      {auditToast && (
        <VibeAttentionBox
          type="success"
          title="Guard Remediation Applied"
          action={
            <span className="font-mono text-[10px] font-bold text-vibe-positive-hover">
              GUARD REMEDIATION
            </span>
          }
        >
          {auditToast}
        </VibeAttentionBox>
      )}

      {liveReport && (
        <VibeAttentionBox
          type={liveReport.overall_status === 'PASS' ? 'success' : liveReport.overall_status === 'FAIL' ? 'critical' : 'warning'}
          title={`⚡ Argon Guard V2 Certified Report — ${liveReport.overall_status}`}
          action={
            <span className="font-mono text-[10px] font-bold text-vibe-primary">
              {liveReport.is_export_ready ? 'EXPORT READY' : 'HUMAN REVIEW REQUIRED'}
            </span>
          }
        >
          <div className="space-y-1 text-xs">
            <div>{liveReport.summary}</div>
            <div className="font-mono text-[11px] text-vibe-text-secondary">
              Passed: {liveReport.passed_count} | Failed: {liveReport.failed_count} | Warnings: {liveReport.warning_count} | Review Required: {liveReport.review_required_count}
            </div>
            <div className="text-[10px] text-vibe-text-muted italic">{liveReport.compliance_disclaimer}</div>
          </div>
        </VibeAttentionBox>
      )}

      {/* Status Summary Breakdown Pills */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <VibeCard
          onClick={() => setStatusFilter(statusFilter === 'passed' ? 'ALL' : 'passed')}
          selected={statusFilter === 'passed'}
          topStripeColor="positive"
          className="flex items-center justify-between p-3.5"
        >
          <div>
            <div className="font-sans text-[11px] font-bold text-vibe-positive-hover uppercase">
              Passed
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-vibe-text-primary tabular-nums">
              {counts.passed}
            </div>
          </div>
          <CheckCircle2 className="h-6 w-6 text-vibe-positive" />
        </VibeCard>

        <VibeCard
          onClick={() => setStatusFilter(statusFilter === 'failed' ? 'ALL' : 'failed')}
          selected={statusFilter === 'failed'}
          topStripeColor="negative"
          className="flex items-center justify-between p-3.5"
        >
          <div>
            <div className="font-sans text-[11px] font-bold text-vibe-negative uppercase">
              Failed
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-vibe-text-primary tabular-nums">
              {counts.failed}
            </div>
          </div>
          <XCircle className="h-6 w-6 text-vibe-negative" />
        </VibeCard>

        <VibeCard
          onClick={() => setStatusFilter(statusFilter === 'warning' ? 'ALL' : 'warning')}
          selected={statusFilter === 'warning'}
          topStripeColor="warning"
          className="flex items-center justify-between p-3.5"
        >
          <div>
            <div className="font-sans text-[11px] font-bold text-vibe-warning-hover uppercase">
              Warning
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-vibe-text-primary tabular-nums">
              {counts.warning}
            </div>
          </div>
          <AlertTriangle className="h-6 w-6 text-vibe-warning" />
        </VibeCard>

        <VibeCard
          onClick={() => setStatusFilter(statusFilter === 'pending' ? 'ALL' : 'pending')}
          selected={statusFilter === 'pending'}
          topStripeColor="purple"
          className="flex items-center justify-between p-3.5"
        >
          <div>
            <div className="font-sans text-[11px] font-bold text-vibe-text-secondary uppercase">
              Pending
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-vibe-text-primary tabular-nums">
              {counts.pending}
            </div>
          </div>
          <Clock className="h-6 w-6 text-vibe-text-secondary" />
        </VibeCard>

        <VibeCard
          onClick={() =>
            setStatusFilter(statusFilter === 'human-review' ? 'ALL' : 'human-review')
          }
          selected={statusFilter === 'human-review'}
          topStripeColor="primary"
          className="flex items-center justify-between p-3.5"
        >
          <div>
            <div className="font-sans text-[11px] font-bold text-vibe-primary uppercase">
              Human Review
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-vibe-text-primary tabular-nums">
              {counts.humanReview}
            </div>
          </div>
          <Eye className="h-6 w-6 text-vibe-bright-blue" />
        </VibeCard>
      </div>

      {/* Main Two-Column Inspector */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left 4 Columns: Clip Candidate Selector & Active Campaign Policy Rules */}
        <div className="space-y-4 lg:col-span-4">
          <VibeBoardGroup
            accentColor="primary"
            title="Select Clip Candidate to Audit"
          >
            <div className="space-y-2 p-3.5">
              {clips.map((clip) => {
                const cmp = campaigns.find((c) => c.id === clip.campaignId);
                const checks = buildComplianceChecksForClip(clip, cmp, manualAttestations);
                const status = summarizeComplianceStatus(checks);
                const isSelected = clip.id === activeClip.id;
                const dur = Math.round(clip.endSec - clip.startSec);

                return (
                  <div
                    key={clip.id}
                    onClick={() => onSelectClip(clip.id)}
                    className={`cursor-pointer rounded-lg border p-3 transition ${
                      isSelected
                        ? 'border-vibe-primary bg-vibe-primary-selected/45 ring-1 ring-vibe-primary'
                        : 'border-vibe-border-ui bg-vibe-bg-surface hover:bg-vibe-bg-grey'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-vibe-text-primary">
                        {clip.title}
                      </span>
                      <ComplianceBadge status={status} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-vibe-text-secondary">
                      <span>
                        {formatSecondsToMMSS(clip.startSec)} →{' '}
                        {formatSecondsToMMSS(clip.endSec)} ({dur}s)
                      </span>
                      <span className="font-bold text-vibe-primary">Hook {clip.hookScore}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </VibeBoardGroup>

          {/* Manual Human-in-the-Loop Editorial Sign-off Card */}
          <VibeBoardGroup
            accentColor="bright-blue"
            title="Human Editorial Attestation"
            actions={<Eye className="h-4 w-4 text-vibe-bright-blue" />}
          >
            <div className="p-4">
              <p className="text-xs leading-relaxed text-vibe-text-secondary">
                Automated heuristics cannot verify whether a speaker quote was spliced out of context. An operator must manually sign off on contextual accuracy.
              </p>
              <label className="mt-3 flex cursor-pointer items-center justify-between rounded border border-vibe-border-ui bg-vibe-bg-grey p-3 text-xs">
                <span className="font-semibold text-vibe-text-primary">
                  I attest quotes & sponsor disclosures are accurate
                </span>
                <input
                  type="checkbox"
                  checked={isAttested}
                  onChange={(e) => onToggleManualAttestation(activeClip.id, e.target.checked)}
                  className="h-4 w-4 accent-vibe-primary"
                />
              </label>
            </div>
          </VibeBoardGroup>

          {/* Export Eligibility Gate Summary */}
          <VibeBoardGroup
            accentColor={exportEligibility.eligible ? 'positive' : 'negative'}
            title="Export Eligibility Gate"
            actions={
              <OperationalStatusBadge
                status={
                  exportEligibility.eligible ? 'Passed validation' : 'Failed validation'
                }
              />
            }
          >
            <div className="space-y-2 p-4 text-xs">
              {exportEligibility.eligible ? (
                <div className="rounded border border-vibe-positive bg-vibe-positive-surface p-2.5 text-vibe-text-primary">
                  All mandatory metadata checks and human editorial attestations have passed. Ready for final Reviewer Approval & Export Spec generation.
                </div>
              ) : (
                <div className="space-y-1.5 rounded border border-vibe-negative bg-vibe-negative-surface p-2.5">
                  <div className="font-bold text-vibe-negative">
                    Export Blocked ({exportEligibility.blockers.length} issue{exportEligibility.blockers.length > 1 ? 's' : ''}):
                  </div>
                  <ul className="list-disc space-y-1 pl-4 text-[11px] text-vibe-text-primary">
                    {exportEligibility.blockers.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </VibeBoardGroup>
        </div>

        {/* Right 8 Columns: Detailed Rule-by-Rule Evaluation Matrix */}
        <div className="lg:col-span-8">
          <VibeBoardGroup
            accentColor="positive"
            title={
              <div className="flex items-center gap-2">
                <span>{activeClip.title}</span>
                <ComplianceBadge status={summaryStatus} size="md" />
              </div>
            }
            subtitle={`Campaign Policy: ${activeCampaign?.title ?? ''}`}
            actions={
              statusFilter !== 'ALL' ? (
                <VibeButton
                  kind="tertiary"
                  size="xs"
                onClick={() => setStatusFilter('ALL')}
              >
                Clear Status Filter ({statusFilter})
                </VibeButton>
              ) : undefined
            }
          >
            <div className="divide-y divide-vibe-border-layout">
            {filteredChecks.map((chk) => (
              <div key={chk.id} className="p-4 transition hover:bg-vibe-bg-hover">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2.5">
                    <ComplianceBadge status={chk.status} />
                    <span className="text-xs font-bold text-vibe-text-primary">
                      {chk.title}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <OperationalStatusBadge status={chk.operationalStatus} />
                    <span className="rounded border border-vibe-border-ui bg-vibe-bg-grey px-2 py-0.5 font-mono text-[10px] font-semibold text-vibe-text-secondary uppercase">
                      {chk.verificationMode === 'binary-media-awaiting'
                        ? 'BINARY FILE: AWAITING INTEGRATION'
                        : `MODE: ${chk.verificationMode}`}
                    </span>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-1 gap-2 rounded border border-vibe-border-layout bg-vibe-bg-grey p-3 text-xs sm:grid-cols-2">
                  <div>
                    <span className="font-sans text-[10px] font-bold text-vibe-text-secondary uppercase">
                      Campaign Rule Requirement
                    </span>
                    <div className="mt-0.5 text-vibe-text-primary">{chk.requirement}</div>
                  </div>
                  <div>
                    <span className="font-sans text-[10px] font-bold text-vibe-text-secondary uppercase">
                      Detected Clip Parameter
                    </span>
                    <div className="mt-0.5 font-mono font-bold text-vibe-primary">
                      {chk.detectedValue}
                    </div>
                  </div>
                </div>

                {/* Explicit Failure Reason & Actionable Remediation Step */}
                {chk.failureReason && (
                  <div className="mt-2 rounded border border-vibe-negative/50 bg-vibe-negative-surface px-3 py-2 text-xs">
                    <div className="font-bold text-vibe-negative">
                      Failure Reason: {chk.failureReason}
                    </div>
                    {chk.remediationStep && (
                      <div className="mt-0.5 text-[11px] text-vibe-text-primary">
                        <strong>Required Action:</strong> {chk.remediationStep}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-vibe-text-secondary">
                  <span>{chk.notes}</span>

                  {/* Contextual Quick Fix buttons for failing or warning rules */}
                  {chk.category === 'duration' && chk.status !== 'passed' && (
                    <VibeButton
                      kind="secondary"
                      size="xs"
                      onClick={() =>
                        onUpdateClip(activeClip.id, (prev) => ({
                          ...prev,
                          endSec: prev.startSec + 36,
                        }))
                      }
                    >
                      Quick Fix: Set Duration to 36.0s
                    </VibeButton>
                  )}

                  {chk.category === 'branding' && chk.status !== 'passed' && (
                    <VibeButton
                      kind="secondary"
                      size="xs"
                      onClick={() =>
                        onUpdateClip(activeClip.id, (prev) => ({
                          ...prev,
                          includeWatermark: true,
                        }))
                      }
                    >
                      Quick Fix: Enable Sponsor Watermark
                    </VibeButton>
                  )}

                  {chk.category === 'audio' && chk.status !== 'passed' && (
                    <VibeButton
                      kind="secondary"
                      size="xs"
                      onClick={() =>
                        onUpdateClip(activeClip.id, (prev) => ({
                          ...prev,
                          normalizeAudioLufs: true,
                        }))
                      }
                    >
                      Quick Fix: Enable -14 LUFS Normalization
                    </VibeButton>
                  )}

                  {chk.category === 'resolution' && chk.status === 'pending' && (
                    <VibeButton
                      kind="secondary"
                      size="xs"
                      onClick={() => onTriggerSimulatedRender(activeClip.id)}
                    >
                      Run Simulated 1080x1920 Render
                    </VibeButton>
                  )}

                  {chk.category === 'disclosure' && chk.status === 'human-review' && (
                    <VibeButton
                      kind="primary"
                      size="xs"
                      onClick={() => onToggleManualAttestation(activeClip.id, true)}
                    >
                      Sign Off Human Attestation
                    </VibeButton>
                  )}
                </div>
              </div>
            ))}
            </div>
          </VibeBoardGroup>
        </div>
      </div>
    </div>
  );
};
