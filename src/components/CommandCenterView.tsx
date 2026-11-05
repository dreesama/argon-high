import React from 'react';
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  FileVideo,
  Layers,
  Play,
  Plus,
  Radar,
  Scissors,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  ActivityEvent,
  Campaign,
  ClipCandidate,
  NavSection,
  Payout,
  PerformanceSnapshot,
  RenderJob,
  Workspace,
} from '../types/argon';
import { reconcileWorkspaceTelemetry } from '../data/mockArgonData';
import {
  ComplianceBadge,
  DemoTag,
  EligibilityBadge,
  OperationalStatusBadge,
  ReviewStatusBadge,
} from './ArgonBadges';
import { VibeAttentionBox, VibeBoardGroup, VibeButton, VibeCard } from '../vibe/VibeComponents';

interface CommandCenterProps {
  workspace: Workspace;
  campaigns: Campaign[];
  clips: ClipCandidate[];
  renderJobs: RenderJob[];
  payouts: Payout[];
  snapshots: PerformanceSnapshot[];
  activity: ActivityEvent[];
  onNavigate: (section: NavSection) => void;
  onOpenClipInStudio: (clipId: string) => void;
  onOpenCampaignInStudio: (campaignId: string) => void;
  onOpenCreateCampaignModal: () => void;
}

export const CommandCenterView: React.FC<CommandCenterProps> = ({
  workspace,
  campaigns,
  clips,
  renderJobs,
  payouts,
  snapshots,
  activity,
  onNavigate,
  onOpenClipInStudio,
  onOpenCampaignInStudio,
  onOpenCreateCampaignModal,
}) => {
  const reconciled = reconcileWorkspaceTelemetry(campaigns, snapshots, 'ALL');
  const clipsProcessedCount = clips.length;
  const pendingReviewsCount = clips.filter(
    (c) => c.reviewStatus === 'pending' || c.reviewStatus === 'changes-requested'
  ).length;

  const totalMinutesSaved = clips.reduce((acc, c) => acc + c.productionTimeSavedMin, 0);
  const hoursSaved = (totalMinutesSaved / 60).toFixed(1);
  const avgHookScore =
    clips.length > 0
      ? (clips.reduce((acc, c) => acc + c.hookScore, 0) / clips.length).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-6">
      {/* Top Operational Telemetry Header */}
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-vibe-border-ui bg-vibe-bg-surface p-5 vibe-shadow-sm lg:flex-row lg:items-center">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded bg-vibe-primary-selected px-2 py-0.5 font-sans text-xs font-bold tracking-wide text-vibe-primary uppercase">
              OPERATOR COMMAND CENTER
            </span>
            <DemoTag label="SAMPLE TELEMETRY · LOCAL DEMO STATE" />
            <span className="rounded border border-vibe-border-ui bg-vibe-bg-grey px-2 py-0.5 font-mono text-[11px] text-vibe-text-secondary">
              WORKSPACE: {workspace.slug.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-vibe-text-secondary">
            Evaluate paid clipping arbitrage, inspect long-form source transcripts, enforce campaign compliance, and audit verified CPM settlements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <VibeButton
            kind="secondary"
            size="md"
            onClick={onOpenCreateCampaignModal}
            leftIcon={<Plus className="h-4 w-4 text-vibe-primary" />}
          >
            Ingest Campaign Brief
          </VibeButton>
          <VibeButton
            kind="primary"
            size="md"
            onClick={() => onNavigate('clip-studio')}
            leftIcon={<Scissors className="h-4 w-4" />}
          >
            Launch Clip Studio
          </VibeButton>
        </div>
      </div>

      {/* 5 Overview KPI Cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
        {/* Active Campaigns */}
        <VibeCard
          onClick={() => onNavigate('campaign-radar')}
          topStripeColor="primary"
          className="group p-4"
        >
          <div className="flex items-center justify-between text-xs text-vibe-text-secondary">
            <span className="font-semibold">Active Campaigns</span>
            <Radar className="h-4 w-4 text-vibe-primary" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-vibe-text-primary tabular-nums">
              {reconciled.activeCampaignCount}
            </span>
            <span className="rounded bg-vibe-primary-surface px-1.5 py-0.5 font-mono text-[11px] font-semibold text-vibe-primary">
              ${reconciled.totalRemainingPoolUsd.toLocaleString()} pool left
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-vibe-border-layout pt-2 text-[11px] text-vibe-text-secondary">
            <span>
              Avg Yield: ${reconciled.averageActiveCpmUsd.toFixed(2)} CPM ({reconciled.expiredOrCappedCampaignCount} capped)
            </span>
            <span className="inline-flex items-center gap-0.5 font-semibold text-vibe-primary">
              Radar <ArrowUpRight className="h-3 w-3" />
            </span>
          </div>
        </VibeCard>

        {/* Clips Processed */}
        <VibeCard
          onClick={() => onNavigate('clip-studio')}
          topStripeColor="purple"
          className="group p-4"
        >
          <div className="flex items-center justify-between text-xs text-vibe-text-secondary">
            <span className="font-semibold">Clips Processed</span>
            <FileVideo className="h-4 w-4 text-vibe-purple" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-vibe-text-primary tabular-nums">
              {clipsProcessedCount}
            </span>
            <span className="rounded bg-vibe-positive-surface px-1.5 py-0.5 font-mono text-[11px] font-semibold text-vibe-positive-hover">
              {clips.filter((c) => c.renderStatus === 'rendered').length} spec ready
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-vibe-border-layout pt-2 text-[11px] text-vibe-text-secondary">
            <span>Avg Hook Score: {avgHookScore}</span>
            <span className="inline-flex items-center gap-0.5 font-semibold text-vibe-primary">
              Studio <ArrowUpRight className="h-3 w-3" />
            </span>
          </div>
        </VibeCard>

        {/* Pending Reviews */}
        <VibeCard
          onClick={() => onNavigate('review-queue')}
          topStripeColor="warning"
          className="group p-4"
        >
          <div className="flex items-center justify-between text-xs text-vibe-text-secondary">
            <span className="font-semibold">Pending Reviews</span>
            <ShieldCheck className="h-4 w-4 text-vibe-warning-hover" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-vibe-text-primary tabular-nums">
              {pendingReviewsCount}
            </span>
            <span className="rounded bg-vibe-warning-surface px-1.5 py-0.5 font-mono text-[11px] font-semibold text-vibe-warning-hover">
              {clips.filter((c) => c.complianceSummaryStatus !== 'passed').length} guard flags
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-vibe-border-layout pt-2 text-[11px] text-vibe-text-secondary">
            <span>{clips.filter((c) => c.reviewStatus === 'export-ready').length} Export-Ready</span>
            <span className="inline-flex items-center gap-0.5 font-semibold text-vibe-primary">
              Queue <ArrowUpRight className="h-3 w-3" />
            </span>
          </div>
        </VibeCard>

        {/* Verified Earnings */}
        <VibeCard
          onClick={() => onNavigate('performance-lab')}
          topStripeColor="positive"
          className="group p-4"
        >
          <div className="flex items-center justify-between text-xs text-vibe-text-secondary">
            <span className="font-semibold">Verified Earnings (Demo)</span>
            <DollarSign className="h-4 w-4 text-vibe-positive" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-vibe-positive-hover tabular-nums">
              ${reconciled.verifiedPaidUsd.toLocaleString()}
            </span>
            <span className="font-mono text-[11px] font-medium text-vibe-text-secondary">
              ${reconciled.settledEarningsUsd.toLocaleString()} settled
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-vibe-border-layout pt-2 text-[11px] text-vibe-text-secondary">
            <span>
              Accrued: ${reconciled.accruedEarningsUsd.toLocaleString()} · Est: ${reconciled.estimatedEarningsUsd.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-0.5 font-semibold text-vibe-primary">
              Ledger <ArrowUpRight className="h-3 w-3" />
            </span>
          </div>
        </VibeCard>

        {/* Production Time Saved */}
        <VibeCard
          onClick={() => onNavigate('clip-studio')}
          topStripeColor="primary"
          className="group p-4"
        >
          <div className="flex items-center justify-between text-xs text-vibe-text-secondary">
            <span className="font-semibold">Production Time Saved</span>
            <Clock className="h-4 w-4 text-vibe-primary" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-vibe-text-primary tabular-nums">
              {hoursSaved}h
            </span>
            <span className="rounded bg-vibe-positive-surface px-1.5 py-0.5 font-mono text-[11px] font-semibold text-vibe-positive-hover">
              {totalMinutesSaved}m vs manual NLE
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-vibe-border-layout pt-2 text-[11px] text-vibe-text-secondary">
            <span>~39m saved / vertical cut</span>
            <span className="inline-flex items-center gap-0.5 font-semibold text-vibe-primary">
              Metrics <ArrowUpRight className="h-3 w-3" />
            </span>
          </div>
        </VibeCard>
      </div>

      {/* End-to-End Pipeline Quick-Jump Strip */}
      <VibeAttentionBox
        type="primary"
        icon={<Zap className="h-4 w-4 text-vibe-primary" />}
        title="Interactive Operator Workflow Pipeline (Vibe Work OS)"
        action={
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <VibeButton kind="secondary" size="xs" onClick={onOpenCreateCampaignModal}>
              1. Create Campaign
            </VibeButton>
            <span className="text-vibe-text-secondary">→</span>
            <VibeButton kind="secondary" size="xs" onClick={() => onNavigate('clip-studio')}>
              2. Analyze & Trim (Studio)
            </VibeButton>
            <span className="text-vibe-text-secondary">→</span>
            <VibeButton kind="secondary" size="xs" onClick={() => onNavigate('argon-guard')}>
              3. Argon Guard Audit
            </VibeButton>
            <span className="text-vibe-text-secondary">→</span>
            <VibeButton kind="secondary" size="xs" onClick={() => onNavigate('review-queue')}>
              4. Approve & Export
            </VibeButton>
          </div>
        }
      >
        Test the full simulated arbitrage lifecycle from brief ingestion to export-ready compliance sign-off.
      </VibeAttentionBox>

      {/* Main Two-Column Grid: Active Campaign Arbitrage + Clip Candidates Ready for Action */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left 8 Columns: Campaign Arbitrage Performance & Top Clip Candidates */}
        <div className="space-y-6 xl:col-span-8">
          {/* Active Campaign Arbitrage Matrix */}
          <VibeBoardGroup
            accentColor="primary"
            title={
              <>
                <TrendingUp className="h-4 w-4" />
                <span>Active Campaign Arbitrage Desk</span>
              </>
            }
            subtitle="Fictional sample briefs organized as a Monday Work OS Campaign Board"
            actions={
              <VibeButton
                kind="tertiary"
                size="xs"
                onClick={() => onNavigate('campaign-radar')}
              >
                View Full Radar →
              </VibeButton>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-vibe-border-layout bg-vibe-bg-grey text-[11px] font-semibold text-vibe-text-secondary uppercase">
                    <th className="px-4 py-2.5">Campaign & Source</th>
                    <th className="px-3 py-2.5">CPM</th>
                    <th className="px-3 py-2.5">Pool Remaining</th>
                    <th className="px-3 py-2.5">Est. / Clip</th>
                    <th className="px-3 py-2.5">Eligibility</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vibe-border-layout">
                  {campaigns.slice(0, 4).map((cmp) => {
                    const pctLeft = Math.round((cmp.remainingBudgetUsd / cmp.totalBudgetUsd) * 100);
                    return (
                      <tr
                        key={cmp.id}
                        className="group transition hover:bg-vibe-bg-hover"
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-vibe-text-primary">{cmp.title}</div>
                          <div className="mt-0.5 text-[11px] text-vibe-text-secondary">
                            {cmp.sourceChannel}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono font-bold text-vibe-primary tabular-nums">
                          ${cmp.cpmUsd.toFixed(2)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-between font-mono text-[11px] font-medium text-vibe-text-primary tabular-nums">
                            <span>${cmp.remainingBudgetUsd.toLocaleString()}</span>
                            <span className="text-vibe-text-secondary">{pctLeft}%</span>
                          </div>
                          <div className="mt-1 h-2 w-28 overflow-hidden rounded-full bg-vibe-bg-grey">
                            <div
                              className="h-full rounded-full bg-vibe-primary"
                              style={{ width: `${pctLeft}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono font-semibold text-vibe-text-primary tabular-nums">
                          ${cmp.estimatedValuePerClipUsd}
                        </td>
                        <td className="px-3 py-3">
                          <EligibilityBadge status={cmp.eligibility} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <VibeButton
                            kind="secondary"
                            size="xs"
                            onClick={() => onOpenCampaignInStudio(cmp.id)}
                            leftIcon={<Play className="h-3 w-3 text-vibe-primary" />}
                          >
                            Clip Source
                          </VibeButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </VibeBoardGroup>

          {/* High-Conviction Clip Candidates Queue */}
          <VibeBoardGroup
            accentColor="purple"
            title={
              <>
                <Sparkles className="h-4 w-4" />
                <span>Ranked Clip Candidates & Compliance State</span>
              </>
            }
            actions={
              <VibeButton
                kind="tertiary"
                size="xs"
                onClick={() => onNavigate('review-queue')}
              >
                Open Review Queue →
              </VibeButton>
            }
          >
            <div className="divide-y divide-vibe-border-layout">
              {clips.map((clip) => {
                const campaign = campaigns.find((c) => c.id === clip.campaignId);
                const durationSec = Math.round(clip.endSec - clip.startSec);
                return (
                  <div
                    key={clip.id}
                    className="flex flex-col justify-between gap-3 p-4 transition hover:bg-vibe-bg-hover sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-vibe-primary-selected px-2 py-0.5 font-mono text-[11px] font-bold text-vibe-primary tabular-nums">
                          HOOK {clip.hookScore}
                        </span>
                        <span className="font-semibold text-vibe-text-primary">{clip.title}</span>
                        <span className="font-mono text-xs text-vibe-text-secondary tabular-nums">
                          ({durationSec}s)
                        </span>
                      </div>
                      <p className="line-clamp-1 text-xs text-vibe-text-secondary">
                        {campaign?.title} · {clip.transcriptExcerpt}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <ComplianceBadge status={clip.complianceSummaryStatus} />
                      <ReviewStatusBadge status={clip.reviewStatus} />
                      <VibeButton
                        kind="secondary"
                        size="xs"
                        onClick={() => onOpenClipInStudio(clip.id)}
                      >
                        Edit in Studio
                      </VibeButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </VibeBoardGroup>
        </div>

        {/* Right 4 Columns: Worker Pipeline Status & Recent Operational Activity */}
        <div className="space-y-6 xl:col-span-4">
          {/* Simulated Media & Compliance Adapter Telemetry */}
          <VibeBoardGroup
            accentColor="positive"
            title={
              <>
                <Cpu className="h-4 w-4" />
                <span>Job Queue & Adapter Status</span>
              </>
            }
            actions={
              <OperationalStatusBadge status="Simulated" />
            }
          >
            <div className="space-y-2.5 p-4">
              {renderJobs.slice(0, 4).map((job) => {
                const clip = clips.find((c) => c.id === job.clipCandidateId);
                return (
                  <div
                    key={job.id}
                    className="rounded-md border border-vibe-border-layout bg-vibe-bg-grey p-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-vibe-text-primary">
                        {job.id.toUpperCase()} · {job.outputResolution}
                      </span>
                      <OperationalStatusBadge
                        status={job.operationalStatus ?? 'Simulated'}
                      />
                    </div>
                    <div className="mt-1 truncate text-[11px] font-medium text-vibe-text-primary">
                      {clip?.title ?? 'Vertical Clip Export'}
                    </div>
                    <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-vibe-text-secondary">
                      <span>{job.codec}</span>
                      <span>Preview Spec Only — FFmpeg Worker Awaiting Integration</span>
                    </div>
                  </div>
                );
              })}

              <div className="rounded-md border border-vibe-border-ui bg-vibe-primary-surface p-3 text-[11px] text-vibe-text-secondary">
                <span className="font-semibold text-vibe-text-primary">Transparency Note:</span> No binary MP4 file is claimed to be rendered unless a playable/downloadable file exists. Export generates a real JSON Cut-List & Compliance Specification.
              </div>
            </div>
          </VibeBoardGroup>

          {/* Recent Activity Log */}
          <VibeBoardGroup
            accentColor="bright-blue"
            title={
              <>
                <Activity className="h-4 w-4" />
                <span>Operator Audit Stream</span>
              </>
            }
            actions={<Layers className="h-3.5 w-3.5 text-vibe-text-secondary" />}
          >
            <div className="space-y-3 p-4">
              {activity.slice(0, 6).map((evt) => (
                <div
                  key={evt.id}
                  className="border-l-2 border-vibe-primary/40 pl-3 transition hover:border-vibe-primary"
                >
                  <div className="flex items-center justify-between text-[11px] text-vibe-text-secondary">
                    <span className="font-semibold text-vibe-text-primary">{evt.actor}</span>
                    <span className="font-mono">{evt.timestampIso}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-vibe-text-secondary">{evt.summary}</p>
                  <div className="mt-0.5 font-mono text-[11px] font-semibold text-vibe-primary">
                    {evt.targetLabel}
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
