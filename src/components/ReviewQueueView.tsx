import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileVideo,
  History,
  LayoutGrid,
  List,
  MessageSquare,
  Play,
  Scissors,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  ApprovalRecord,
  Campaign,
  ClipCandidate,
  NavSection,
  ReviewDecision,
} from '../types/argon';
import {
  buildComplianceChecksForClip,
  evaluateExportEligibility,
  formatSecondsToMMSS,
  summarizeComplianceStatus,
} from '../data/mockArgonData';
import { downloadExportSpecJson } from '../services/argonAdapters';
import {
  ComplianceBadge,
  DemoTag,
  OperationalStatusBadge,
  ReviewStatusBadge,
} from './ArgonBadges';
import { VibeBoardGroup, VibeButton, VibeCard } from '../vibe/VibeComponents';

interface ReviewQueueProps {
  campaigns: Campaign[];
  clips: ClipCandidate[];
  approvals: ApprovalRecord[];
  selectedClipId: string;
  manualAttestations: Record<string, boolean>;
  onSelectClip: (clipId: string) => void;
  onSubmitReviewDecision: (
    clipId: string,
    decision: ReviewDecision,
    note: string
  ) => void;
  onOpenClipInStudio: (clipId: string) => void;
  onNavigate: (section: NavSection) => void;
}

export const ReviewQueueView: React.FC<ReviewQueueProps> = ({
  campaigns,
  clips,
  approvals,
  selectedClipId,
  manualAttestations,
  onSelectClip,
  onSubmitReviewDecision,
  onOpenClipInStudio,
  onNavigate,
}) => {
  const [viewMode, setViewMode] = useState<'cards' | 'rows'>('cards');
  const [filterDecision, setFilterDecision] = useState<'ALL' | ReviewDecision>('ALL');
  const [reviewNote, setReviewNote] = useState('');
  const [exportModalClip, setExportModalClip] = useState<ClipCandidate | null>(null);

  const filteredClips = useMemo(() => {
    if (filterDecision === 'ALL') return clips;
    return clips.filter((c) => c.reviewStatus === filterDecision);
  }, [clips, filterDecision]);

  const activeClip =
    clips.find((c) => c.id === selectedClipId) ?? filteredClips[0] ?? clips[0];
  const activeCampaign = campaigns.find((c) => c.id === activeClip?.campaignId);

  const activeClipChecks = useMemo(() => {
    if (!activeClip) return [];
    return buildComplianceChecksForClip(activeClip, activeCampaign, manualAttestations);
  }, [activeClip, activeCampaign, manualAttestations]);

  const activeComplianceSummary = useMemo(
    () => summarizeComplianceStatus(activeClipChecks),
    [activeClipChecks]
  );

  const clipApprovals = useMemo(
    () => approvals.filter((a) => a.clipCandidateId === activeClip?.id),
    [approvals, activeClip]
  );

  const exportEligibility = useMemo(
    () =>
      activeClip
        ? evaluateExportEligibility(activeClip, activeClipChecks)
        : { eligible: false, blockers: [] },
    [activeClip, activeClipChecks]
  );

  const canMarkExported =
    exportEligibility.eligible &&
    (activeClip?.reviewStatus === 'approved' ||
      activeClip?.reviewStatus === 'export-ready');

  const handleDecision = (decision: ReviewDecision) => {
    if (!activeClip) return;
    if (decision === 'export-ready' && !exportEligibility.eligible) {
      return;
    }
    const defaultNotes: Record<ReviewDecision, string> = {
      approved: 'Approved for multi-platform campaign distribution.',
      'export-ready':
        'Passed all Argon Guard rules and editorial sign-off. Marked Export-Ready.',
      'changes-requested':
        'Changes requested: please verify duration window and sponsor watermark placement in Clip Studio.',
      rejected: 'Rejected: hook or topic does not align with sponsor brief.',
      pending: 'Returned to pending review queue.',
    };
    onSubmitReviewDecision(
      activeClip.id,
      decision,
      reviewNote.trim() || defaultNotes[decision]
    );
    setReviewNote('');
  };

  if (!activeClip) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-vibe-border-ui bg-vibe-bg-surface p-5 vibe-shadow-sm lg:flex-row lg:items-center">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <FileVideo className="h-4 w-4 text-vibe-purple" />
            <h1 className="text-sm font-bold tracking-wide text-vibe-text-primary uppercase">
              Review Queue & Export Sign-Off Desk
            </h1>
            <DemoTag label="QUALITY ASSURANCE & EXPORT PACKAGING" />
          </div>
          <p className="text-xs text-vibe-text-secondary">
            Inspect rendered vertical clips, review Argon Guard compliance status, record QA approval decisions, and package export-ready deliverables.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filter pills */}
          {(
            [
              { id: 'ALL', label: `All (${clips.length})` },
              {
                id: 'pending',
                label: `In Queue (${clips.filter((c) => c.reviewStatus === 'pending').length})`,
              },
              {
                id: 'changes-requested',
                label: `Changes Req (${clips.filter((c) => c.reviewStatus === 'changes-requested').length})`,
              },
              {
                id: 'approved',
                label: `Approved (${clips.filter((c) => c.reviewStatus === 'approved').length})`,
              },
              {
                id: 'export-ready',
                label: `Export-Ready (${clips.filter((c) => c.reviewStatus === 'export-ready').length})`,
              },
            ] as { id: 'ALL' | ReviewDecision; label: string }[]
          ).map((tab) => (
            <VibeButton
              key={tab.id}
              kind="secondary"
              size="xs"
              active={filterDecision === tab.id}
              onClick={() => setFilterDecision(tab.id)}
            >
              {tab.label}
            </VibeButton>
          ))}

          <div className="ml-2 flex rounded border border-vibe-border-ui bg-vibe-bg-grey p-0.5">
            <button
              onClick={() => setViewMode('cards')}
              title="Card View"
              className={`rounded p-1.5 ${
                viewMode === 'cards'
                  ? 'bg-vibe-bg-surface text-vibe-primary shadow-2xs'
                  : 'text-vibe-text-secondary'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('rows')}
              title="Dense Row View"
              className={`rounded p-1.5 ${
                viewMode === 'rows'
                  ? 'bg-vibe-bg-surface text-vibe-primary shadow-2xs'
                  : 'text-vibe-text-secondary'
              }`}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left 7 Columns: Clips Cards or Dense Rows */}
        <div className="space-y-3 xl:col-span-7">
          {viewMode === 'cards' ? (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {filteredClips.map((clip) => {
                const cmp = campaigns.find((c) => c.id === clip.campaignId);
                const checks = buildComplianceChecksForClip(clip, cmp, manualAttestations);
                const compStatus = summarizeComplianceStatus(checks);
                const dur = Math.round(clip.endSec - clip.startSec);
                const isSelected = clip.id === activeClip.id;

                return (
                  <VibeCard
                    key={clip.id}
                    onClick={() => onSelectClip(clip.id)}
                    selected={isSelected}
                    topStripeColor={
                      clip.reviewStatus === 'export-ready'
                        ? 'purple'
                        : clip.reviewStatus === 'approved'
                          ? 'positive'
                          : clip.reviewStatus === 'changes-requested'
                            ? 'warning'
                            : 'primary'
                    }
                    className="p-3.5"
                  >
                    <div className="flex gap-3">
                      {/* Larger 9:16 Vertical Preview Thumbnail */}
                      <div className="relative flex h-40 w-24 shrink-0 flex-col justify-between overflow-hidden rounded-lg border-2 border-vibe-primary/40 bg-gradient-to-b from-vibe-primary-surface to-vibe-bg-surface p-2 shadow-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[8px] font-bold text-vibe-primary">
                            9:16
                          </span>
                          {clip.includeWatermark ? (
                            <span
                              title="Watermark Active"
                              className="rounded bg-vibe-positive px-1 font-mono text-[7px] font-bold text-white"
                            >
                              WM
                            </span>
                          ) : (
                            <span
                              title="Watermark Missing"
                              className="rounded bg-vibe-negative px-1 font-mono text-[7px] font-bold text-white"
                            >
                              !WM
                            </span>
                          )}
                        </div>
                        <div className="my-auto text-center">
                          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-vibe-primary bg-vibe-bg-surface font-mono text-[10px] font-bold text-vibe-primary">
                            {dur}s
                          </div>
                        </div>
                        <div className="rounded bg-vibe-primary px-1 py-0.5 text-center font-mono text-[7px] font-bold text-white">
                          {clip.captionPreset.split('-')[0].toUpperCase()}
                        </div>
                      </div>

                      {/* Clip Card Metadata */}
                      <div className="flex flex-1 flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-1.5">
                            <h3 className="line-clamp-2 text-xs font-bold text-vibe-text-primary">
                              {clip.title}
                            </h3>
                            <span className="shrink-0 rounded bg-vibe-primary-selected px-1.5 py-0.5 font-mono text-[11px] font-bold text-vibe-primary tabular-nums">
                              {clip.hookScore}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-vibe-text-secondary">
                            {cmp?.title}
                          </div>

                          {/* Relevant Campaign Rules Alongside Candidate */}
                          <div className="mt-2 flex flex-wrap gap-1">
                            <span className="rounded border border-vibe-border-ui bg-vibe-bg-grey px-1.5 py-0.5 font-mono text-[9px] text-vibe-text-secondary">
                              Rule: {cmp?.id === 'cmp-meridian-fx' ? '30–60s' : '28–58s'}
                            </span>
                            <span className="rounded border border-vibe-border-ui bg-vibe-bg-grey px-1.5 py-0.5 font-mono text-[9px] text-vibe-text-secondary">
                              WM: {clip.includeWatermark ? 'ON' : 'MISSING'}
                            </span>
                            <span className="rounded border border-vibe-border-ui bg-vibe-bg-grey px-1.5 py-0.5 font-mono text-[9px] text-vibe-text-secondary">
                              {clip.normalizeAudioLufs ? '-14 LUFS' : 'Raw LUFS'}
                            </span>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <ComplianceBadge status={compStatus} />
                          <ReviewStatusBadge status={clip.reviewStatus} />
                        </div>
                      </div>
                    </div>

                    {/* Explicit Failure Reason on Card if Failing */}
                    {checks.some((c) => c.status === 'failed') && (
                      <div className="mt-2.5 rounded border border-vibe-negative/40 bg-vibe-negative-surface px-2.5 py-1.5 text-[11px] font-medium text-vibe-negative">
                        {checks.find((c) => c.status === 'failed')?.failureReason}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between border-t border-vibe-border-layout pt-2.5 font-mono text-[11px] text-vibe-text-secondary">
                      <span>
                        TC {formatSecondsToMMSS(clip.startSec)} →{' '}
                        {formatSecondsToMMSS(clip.endSec)}
                      </span>
                      <span className="font-bold text-vibe-positive-hover">
                        Est. ${clip.estimatedPayoutUsd}
                      </span>
                    </div>
                  </VibeCard>
                );
              })}
            </div>
          ) : (
            /* Dense Table Rows Mode */
            <VibeBoardGroup
              accentColor="purple"
              title="Generated Vertical Clips Review Board"
            >
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-vibe-border-layout bg-vibe-bg-grey text-[11px] font-semibold text-vibe-text-secondary uppercase">
                    <th className="px-3.5 py-2.5">Clip Title & Campaign</th>
                    <th className="px-3 py-2.5">Duration</th>
                    <th className="px-3 py-2.5">Hook</th>
                    <th className="px-3 py-2.5">Guard</th>
                    <th className="px-3 py-2.5">Review Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vibe-border-layout">
                  {filteredClips.map((clip) => {
                    const cmp = campaigns.find((c) => c.id === clip.campaignId);
                    const checks = buildComplianceChecksForClip(
                      clip,
                      cmp,
                      manualAttestations
                    );
                    const compStatus = summarizeComplianceStatus(checks);
                    const dur = Math.round(clip.endSec - clip.startSec);
                    return (
                      <tr
                        key={clip.id}
                        onClick={() => onSelectClip(clip.id)}
                        className={`cursor-pointer transition ${
                          clip.id === activeClip.id
                            ? 'bg-vibe-primary-selected/50'
                            : 'hover:bg-vibe-bg-hover'
                        }`}
                      >
                        <td className="px-3.5 py-3">
                          <div className="font-bold text-vibe-text-primary">{clip.title}</div>
                          <div className="text-[11px] text-vibe-text-secondary">{cmp?.title}</div>
                        </td>
                        <td className="px-3 py-3 font-mono tabular-nums">{dur}s</td>
                        <td className="px-3 py-3 font-mono font-bold text-vibe-primary tabular-nums">
                          {clip.hookScore}
                        </td>
                        <td className="px-3 py-3">
                          <ComplianceBadge status={compStatus} />
                        </td>
                        <td className="px-3 py-3">
                          <ReviewStatusBadge status={clip.reviewStatus} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </VibeBoardGroup>
          )}
        </div>

        {/* Right 5 Columns: Selected Clip Preview, Decision Controls & Approval History */}
        <div className="space-y-4 xl:col-span-5">
          <div className="rounded-lg border border-vibe-border-ui bg-vibe-bg-surface p-4 vibe-shadow-sm">
            <div className="flex items-start justify-between gap-2 border-b border-vibe-border-layout pb-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <ReviewStatusBadge status={activeClip.reviewStatus} />
                  <ComplianceBadge status={activeComplianceSummary} />
                  <OperationalStatusBadge
                    status={
                      activeClip.reviewStatus === 'export-ready'
                        ? 'Exported'
                        : exportEligibility.eligible
                          ? 'Passed validation'
                          : 'Failed validation'
                    }
                  />
                </div>
                <h2 className="mt-1.5 text-sm font-bold text-vibe-text-primary">
                  {activeClip.title}
                </h2>
                <p className="text-xs text-vibe-text-secondary">{activeCampaign?.title}</p>
              </div>

              <VibeButton
                kind="secondary"
                size="xs"
                onClick={() => onOpenClipInStudio(activeClip.id)}
                leftIcon={<Scissors className="h-3 w-3 text-vibe-primary" />}
              >
                Edit in Studio
              </VibeButton>
            </div>

            {/* Large 9:16 Inspector Preview + Associated Campaign Rules */}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-12">
              {/* 9:16 Stage Preview */}
              <div className="flex justify-center sm:col-span-5">
                <div className="relative flex aspect-[9/16] w-full max-w-[165px] flex-col justify-between overflow-hidden rounded-xl border-2 border-vibe-primary bg-gradient-to-b from-vibe-primary-surface to-vibe-bg-surface p-2.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-vibe-primary px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                      9:16 PREVIEW
                    </span>
                    {activeClip.includeWatermark ? (
                      <span className="rounded bg-vibe-positive px-1.5 py-0.5 font-mono text-[8px] font-bold text-white">
                        {activeCampaign?.sponsorName.split(' ')[0]}
                      </span>
                    ) : (
                      <span className="rounded bg-vibe-negative px-1.5 py-0.5 font-mono text-[8px] font-bold text-white">
                        NO WM
                      </span>
                    )}
                  </div>

                  <div className="my-auto text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-vibe-primary bg-vibe-bg-surface font-mono text-xs font-bold text-vibe-primary">
                      {Math.round(activeClip.endSec - activeClip.startSec)}s
                    </div>
                    <div className="mt-1 font-mono text-[9px] text-vibe-text-secondary">
                      {activeClip.cropMode}
                    </div>
                  </div>

                  <div className="rounded border border-vibe-primary bg-vibe-bg-surface p-1.5 text-center shadow-2xs">
                    <p className="line-clamp-2 text-[9px] font-bold text-vibe-text-primary uppercase">
                      {activeClip.transcriptExcerpt}
                    </p>
                  </div>
                </div>
              </div>

              {/* Campaign Rules & Compliance Breakdown for this Candidate */}
              <div className="flex flex-col justify-between rounded border border-vibe-border-ui bg-vibe-bg-grey p-3 text-xs sm:col-span-7">
                <div>
                  <div className="font-sans text-[11px] font-bold text-vibe-text-primary uppercase">
                    Campaign Rules & Validation State
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {activeClipChecks.slice(0, 6).map((chk) => (
                      <div
                        key={chk.id}
                        className="flex items-center justify-between gap-1 rounded bg-vibe-bg-surface px-2 py-1 text-[11px]"
                      >
                        <span className="truncate font-medium text-vibe-text-primary">
                          {chk.title}
                        </span>
                        <ComplianceBadge status={chk.status} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-2 border-t border-vibe-border-ui pt-2 font-mono text-[10px] text-vibe-text-secondary">
                  Note: Checks validate Studio metadata & human sign-off. Binary media file validation is labeled Awaiting integration.
                </div>
              </div>
            </div>

            {/* Explicit Blocker Alert when Export Eligibility is Not Met */}
            {!exportEligibility.eligible && (
              <div className="mt-3 rounded border border-vibe-negative bg-vibe-negative-surface p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-vibe-negative">
                    Export Eligibility Blocked ({exportEligibility.blockers.length} Unresolved Check{exportEligibility.blockers.length > 1 ? 's' : ''})
                  </span>
                  <VibeButton
                    kind="secondary"
                    size="xs"
                    onClick={() => onNavigate('argon-guard')}
                  >
                    Fix in Argon Guard →
                  </VibeButton>
                </div>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-vibe-text-primary">
                  {exportEligibility.blockers.map((b, idx) => (
                    <li key={idx}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reviewer Comment Input */}
            <div className="mt-3">
              <label className="flex items-center gap-1.5 font-sans text-[11px] font-bold text-vibe-text-primary uppercase">
                <MessageSquare className="h-3 w-3 text-vibe-primary" />
                Reviewer Audit Note
              </label>
              <textarea
                rows={2}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Add approval sign-off note or specify required trim/compliance adjustments..."
                className="mt-1.5 w-full rounded border border-vibe-border-ui bg-vibe-bg-surface p-2.5 text-xs text-vibe-text-primary placeholder-vibe-text-secondary focus:border-vibe-primary focus:outline-none"
              />
            </div>

            {/* Monday Vibe Decision Action Buttons */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <VibeButton
                kind="primary"
                color="positive"
                size="sm"
                onClick={() => handleDecision('approved')}
                leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
              >
                1. Approve
              </VibeButton>
              <VibeButton
                kind="primary"
                color="purple"
                size="sm"
                disabled={!exportEligibility.eligible}
                title={
                  !exportEligibility.eligible
                    ? 'Pass all Argon Guard checks and sign off human attestation first'
                    : 'Mark Export-Ready after compliance & human approval'
                }
                onClick={() => handleDecision('export-ready')}
                leftIcon={<Sparkles className="h-3.5 w-3.5" />}
              >
                2. Export-Ready
              </VibeButton>
              <VibeButton
                kind="primary"
                color="warning"
                size="sm"
                onClick={() => handleDecision('changes-requested')}
                leftIcon={<AlertTriangle className="h-3.5 w-3.5" />}
              >
                Req Changes
              </VibeButton>
              <VibeButton
                kind="primary"
                color="negative"
                size="sm"
                onClick={() => handleDecision('rejected')}
                leftIcon={<XCircle className="h-3.5 w-3.5" />}
              >
                Reject
              </VibeButton>
            </div>

            {/* Export Package Trigger when Eligible AND Approved/Export-Ready */}
            {canMarkExported && (
              <div className="mt-3 flex items-center justify-between rounded border border-vibe-positive bg-vibe-positive-surface p-3">
                <div>
                  <div className="text-xs font-bold text-vibe-positive-hover">
                    Cleared for Export Specification (Validation + Human Approval Passed)
                  </div>
                  <div className="text-[11px] text-vibe-text-primary">
                    Downloadable JSON Cut-List & Compliance Manifest (MP4 Render: Awaiting Integration)
                  </div>
                </div>
                <VibeButton
                  kind="primary"
                  color="positive"
                  size="xs"
                  onClick={() => setExportModalClip(activeClip)}
                  leftIcon={<Download className="h-3.5 w-3.5" />}
                >
                  Export Spec
                </VibeButton>
              </div>
            )}
          </div>

          {/* Approval History Timeline */}
          <VibeBoardGroup
            accentColor="primary"
            title={
              <>
                <History className="h-4 w-4" />
                <span>Approval & QA History ({clipApprovals.length})</span>
              </>
            }
            actions={
              <span className="font-mono text-[10px] font-semibold text-vibe-text-secondary">
                IMMUTABLE LOG
              </span>
            }
          >
            <div className="space-y-3 p-4">
              {clipApprovals.length === 0 ? (
                <div className="py-4 text-center text-xs text-vibe-text-secondary">
                  No review decisions recorded for this clip candidate yet.
                </div>
              ) : (
                clipApprovals.map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded border border-vibe-border-ui bg-vibe-bg-grey p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-vibe-text-primary">
                          {rec.reviewerName}
                        </span>{' '}
                        <span className="text-[11px] text-vibe-text-secondary">
                          ({rec.reviewerRole})
                        </span>
                      </div>
                      <ReviewStatusBadge status={rec.decision} />
                    </div>
                    <p className="mt-1.5 text-vibe-text-primary">{rec.note}</p>
                    <div className="mt-1.5 font-mono text-[10px] text-vibe-text-secondary">
                      {rec.timestampIso}
                    </div>
                  </div>
                ))
              )}
            </div>
          </VibeBoardGroup>
        </div>
      </div>

      {/* Export Package Manifest Modal */}
      {exportModalClip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-vibe-text-primary/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-lg border border-vibe-border-ui bg-vibe-bg-surface p-5 vibe-shadow-md">
            <div className="flex items-center justify-between border-b border-vibe-border-layout pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-vibe-purple" />
                <h3 className="text-sm font-bold text-vibe-text-primary">
                  Export Specification & Compliance Manifest
                </h3>
              </div>
              <OperationalStatusBadge status="Exported" />
            </div>

            <div className="mt-3 space-y-2.5 font-mono text-xs">
              <div className="rounded border border-vibe-border-ui bg-vibe-bg-grey p-3">
                <div className="text-vibe-text-secondary">CLIP IDENTIFIER</div>
                <div className="mt-0.5 font-bold text-vibe-text-primary">
                  {exportModalClip.id} — {exportModalClip.title}
                </div>
              </div>
              <div className="rounded border border-vibe-border-ui bg-vibe-bg-grey p-3">
                <div className="text-vibe-text-secondary">ARTIFACT STATUS & TRANSPARENCY</div>
                <ul className="mt-1.5 space-y-1.5 text-[11px]">
                  <li className="flex items-center justify-between">
                    <span className="font-semibold text-vibe-positive-hover">
                      • {exportModalClip.id}_export_spec_v2_5.json
                    </span>
                    <span className="rounded bg-vibe-positive px-1.5 py-0.2 text-[9px] font-bold text-white">
                      DOWNLOADABLE JSON
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-vibe-text-secondary">
                      • {exportModalClip.id}_1080x1920_60fps.mp4
                    </span>
                    <span className="rounded border border-vibe-border-ui bg-vibe-bg-surface px-1.5 py-0.2 text-[9px] text-vibe-text-secondary">
                      AWAITING FFMPEG WORKER
                    </span>
                  </li>
                </ul>
              </div>
              <p className="text-[11px] font-sans text-vibe-text-secondary">
                Argon High never claims an MP4 video file was encoded unless a playable file exists. You can download the real JSON Cut-List & Compliance Attestation specification below to feed your FFmpeg worker.
              </p>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <VibeButton
                kind="secondary"
                onClick={() => setExportModalClip(null)}
              >
                Close
              </VibeButton>
              <VibeButton
                kind="primary"
                leftIcon={<Download className="h-3.5 w-3.5" />}
                onClick={() => {
                  downloadExportSpecJson(
                    exportModalClip,
                    activeCampaign,
                    activeClipChecks
                  );
                }}
              >
                Download Export Spec (.JSON)
              </VibeButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
