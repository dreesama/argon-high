import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  Filter,
  Globe,
  Percent,
  Plus,
  RefreshCw,
  Scale,
  Share2,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import {
  Campaign,
  ClipCandidate,
  Payout,
  PerformanceSnapshot,
  Publication,
} from '../types/argon';
import { reconcileWorkspaceTelemetry } from '../data/mockArgonData';
import { DemoTag, OperationalStatusBadge } from './ArgonBadges';
import { VibeBoardGroup, VibeButton, VibeCard } from '../vibe/VibeComponents';
import { argonApiClient } from '../services/argonApiClient';

interface PerformanceLabProps {
  campaigns: Campaign[];
  clips: ClipCandidate[];
  snapshots: PerformanceSnapshot[];
  payouts: Payout[];
  publications: Publication[];
}

export const PerformanceLabView: React.FC<PerformanceLabProps> = ({
  campaigns,
  clips,
  snapshots,
  payouts,
  publications,
}) => {
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState<string>('ALL');
  const [dataModeHighlight, setDataModeHighlight] = useState<'both' | 'verified' | 'estimated'>('both');

  // Live SQLite Persisted Ledger State
  const [liveSummary, setLiveSummary] = useState<any | null>(null);
  const [livePublications, setLivePublications] = useState<any[]>([]);
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [showLiveRecorder, setShowLiveRecorder] = useState(false);
  const [pubClipId, setPubClipId] = useState<string>(clips[0]?.id || '');
  const [pubPlatform, setPubPlatform] = useState<string>('tiktok');
  const [pubUrl, setPubUrl] = useState<string>('');
  const [viewsCount, setViewsCount] = useState<number>(100000);
  const [verifiedViewsCount, setVerifiedViewsCount] = useState<number>(0);
  const [cpmUsd, setCpmUsd] = useState<number>(4.5);
  const [costUsd, setCostUsd] = useState<number>(25.0);
  const [platformFeesUsd, setPlatformFeesUsd] = useState<number>(10.0);
  const [prodHours, setProdHours] = useState<number>(1.5);
  const [reconciled, setReconciled] = useState<boolean>(false);
  const [submittingStatus, setSubmittingStatus] = useState<string | null>(null);

  const fetchLiveTelemetry = async () => {
    setIsLoadingLive(true);
    try {
      const [sum, pubs] = await Promise.all([
        argonApiClient.getPerformanceSummary(),
        argonApiClient.listWorkspacePublications(),
      ]);
      setLiveSummary(sum);
      setLivePublications(pubs || []);
    } catch (err) {
      console.warn('Backend performance ledger fetch:', err);
    } finally {
      setIsLoadingLive(false);
    }
  };

  useEffect(() => {
    fetchLiveTelemetry();
  }, []);

  const handleRecordLiveTelemetry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pubUrl) return;
    setSubmittingStatus('Recording publication & financial snapshot...');
    try {
      const selectedClip = clips.find((c) => c.id === pubClipId);
      const campaignId = selectedClip?.campaignId || campaigns[0]?.id || 'cmp-meridian-fx';

      const pubRes = await argonApiClient.recordPublicationUrl({
        clipId: pubClipId,
        campaignId,
        platform: pubPlatform,
        publicationUrl: pubUrl,
      });

      await argonApiClient.recordPerformanceSnapshot({
        publicationId: pubRes.id,
        clipId: pubClipId,
        campaignId,
        viewsCount,
        verifiedViewsCount,
        cpmUsd,
        productionHours: prodHours,
        platformFeesUsd,
        productionCostUsd: costUsd,
        reconciled,
        notes: `Recorded via Performance Lab live desk (${pubPlatform})`,
      });

      setSubmittingStatus('Successfully recorded to SQLite operations ledger.');
      setPubUrl('');
      await fetchLiveTelemetry();
      setTimeout(() => setSubmittingStatus(null), 3000);
    } catch (err: any) {
      setSubmittingStatus(`Failed: ${err.message || err}`);
    }
  };

  const filteredSnapshots = useMemo(() => {
    if (selectedCampaignFilter === 'ALL') return snapshots;
    return snapshots.filter((s) => s.campaignId === selectedCampaignFilter);
  }, [snapshots, selectedCampaignFilter]);

  const filteredPayouts = useMemo(() => {
    if (selectedCampaignFilter === 'ALL') return payouts;
    return payouts.filter((p) => p.campaignId === selectedCampaignFilter);
  }, [payouts, selectedCampaignFilter]);

  const totals = useMemo(
    () =>
      reconcileWorkspaceTelemetry(
        campaigns,
        snapshots,
        selectedCampaignFilter
      ),
    [campaigns, snapshots, selectedCampaignFilter]
  );

  const maxChartValue = useMemo(() => {
    return Math.max(
      1000,
      ...filteredSnapshots.map((s) => Math.max(s.estimatedEarningsUsd, s.verifiedPaidUsd))
    );
  }, [filteredSnapshots]);

  return (
    <div className="space-y-5">
      {/* Header & Explicit Data Provenance Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-vibe-border-ui bg-vibe-bg-surface p-5 vibe-shadow-sm lg:flex-row lg:items-center">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <BarChart3 className="h-4 w-4 text-vibe-primary" />
            <h1 className="text-sm font-bold tracking-wide text-vibe-text-primary uppercase">
              Performance Lab · Arbitrage Unit Economics & Ledger
            </h1>
            <OperationalStatusBadge status="Simulated" />
            <DemoTag label="RECONCILED WITH COMMAND CENTER" />
          </div>
          <p className="text-xs text-vibe-text-secondary">
            Reconciles 4 explicit financial states (Estimated, Accrued, Settled, and Verified Earnings) using centralized workspace telemetry.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-vibe-text-secondary" />
            <select
              value={selectedCampaignFilter}
              onChange={(e) => setSelectedCampaignFilter(e.target.value)}
              className="rounded border border-vibe-border-ui bg-vibe-bg-surface px-3 py-1.5 text-xs font-medium text-vibe-text-primary focus:border-vibe-primary focus:outline-none"
            >
              <option value="ALL">All Active Campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex rounded border border-vibe-border-ui bg-vibe-bg-grey p-0.5 text-xs">
            {(
              [
                { id: 'both', label: 'Verified + Est' },
                { id: 'verified', label: 'Verified Only' },
                { id: 'estimated', label: 'Estimated Only' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                onClick={() => setDataModeHighlight(mode.id)}
                className={`rounded px-2.5 py-1 transition ${
                  dataModeHighlight === mode.id
                    ? 'bg-vibe-bg-surface font-bold text-vibe-primary shadow-2xs'
                    : 'text-vibe-text-secondary hover:text-vibe-text-primary'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 6 Precision Financial & Operational KPI Cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <VibeCard topStripeColor="primary" className="p-3.5">
          <div className="flex items-center justify-between text-xs text-vibe-text-secondary">
            <span className="font-semibold">Verified Views</span>
            <Eye className="h-3.5 w-3.5 text-vibe-primary" />
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-vibe-text-primary tabular-nums">
            {(totals.verifiedViewsTotal / 1000).toFixed(1)}K
          </div>
          <div className="mt-1 font-mono text-[10px] font-bold text-vibe-positive-hover">
            VERIFIED LEDGER COUNT
          </div>
        </VibeCard>

        <VibeCard topStripeColor="positive" className="p-3.5">
          <div className="flex items-center justify-between text-xs text-vibe-text-secondary">
            <span className="font-semibold">1. Verified Earnings</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-vibe-positive" />
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-vibe-positive-hover tabular-nums">
            ${totals.verifiedPaidUsd.toLocaleString()}
          </div>
          <div className="mt-1 font-mono text-[10px] text-vibe-text-secondary">
            FINAL PAID & AUDITED
          </div>
        </VibeCard>

        <VibeCard topStripeColor="purple" className="p-3.5">
          <div className="flex items-center justify-between text-xs text-vibe-text-secondary">
            <span className="font-semibold">2. Settled Escrow</span>
            <Scale className="h-3.5 w-3.5 text-vibe-purple" />
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-vibe-purple tabular-nums">
            ${totals.settledEarningsUsd.toLocaleString()}
          </div>
          <div className="mt-1 font-mono text-[10px] text-vibe-text-secondary">
            CLEARED SPONSOR BATCH
          </div>
        </VibeCard>

        <VibeCard topStripeColor="warning" className="p-3.5">
          <div className="flex items-center justify-between text-xs text-vibe-text-secondary">
            <span className="font-semibold">3. Accrued / 4. Est</span>
            <DollarSign className="h-3.5 w-3.5 text-vibe-warning" />
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-vibe-warning-hover tabular-nums">
            ${totals.accruedEarningsUsd.toLocaleString()}
          </div>
          <div className="mt-1 font-mono text-[10px] text-vibe-text-secondary">
            EST PROJECTED: ${totals.estimatedEarningsUsd.toLocaleString()}
          </div>
        </VibeCard>

        <VibeCard topStripeColor="primary" className="p-3.5">
          <div className="flex items-center justify-between text-xs text-vibe-text-secondary">
            <span className="font-semibold">Verified Rev / Clip</span>
            <TrendingUp className="h-3.5 w-3.5 text-vibe-primary" />
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-vibe-text-primary tabular-nums">
            ${totals.verifiedRevPerClipUsd.toFixed(0)}
          </div>
          <div className="mt-1 font-mono text-[10px] text-vibe-text-secondary">
            {totals.clipsPublishedCount} CUTS · {totals.averageApprovalRatePct}% QA PASS
          </div>
        </VibeCard>

        <VibeCard topStripeColor="positive" className="p-3.5">
          <div className="flex items-center justify-between text-xs text-vibe-text-secondary">
            <span className="font-semibold">Net Margin & Time</span>
            <Clock className="h-3.5 w-3.5 text-vibe-positive" />
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-vibe-positive-hover tabular-nums">
            +${totals.netVerifiedProfitUsd.toLocaleString()}
          </div>
          <div className="mt-1 font-mono text-[10px] text-vibe-text-secondary">
            ${totals.computeAndOpsCostUsd} cost · {totals.operatorHoursSpent.toFixed(1)}h spent
          </div>
        </VibeCard>
      </div>

      {/* REAL OPERATOR OPERATIONS & SETTLEMENT DESK (SPRINT 4 BETA) */}
      <div className="rounded-lg border border-vibe-primary/40 bg-vibe-bg-surface p-4 vibe-shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <Scale className="h-4 w-4 text-vibe-primary" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-vibe-text-primary uppercase tracking-wide">
                  Live Relational Operations Ledger (SQLite Persisted)
                </span>
                <span className="rounded-sm bg-vibe-primary/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-vibe-primary">
                  {livePublications.length} LIVE PUBS
                </span>
                {liveSummary && (
                  <span className="rounded-sm bg-vibe-positive/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-vibe-positive-hover">
                    ${liveSummary.total_net_profit_usd.toFixed(2)} NET
                  </span>
                )}
              </div>
              <p className="text-[11px] text-vibe-text-secondary">
                Durable server-side accounting ledger tracking verified platform publications, CPM escrow caps, and net yield.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLiveTelemetry}
              disabled={isLoadingLive}
              className="flex items-center gap-1.5 rounded border border-vibe-border-ui bg-vibe-bg-surface px-2.5 py-1 text-xs text-vibe-text-secondary hover:text-vibe-text-primary disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isLoadingLive ? 'animate-spin' : ''}`} />
              <span>Refresh Ledger</span>
            </button>
            <VibeButton
              variant="primary"
              size="sm"
              onClick={() => setShowLiveRecorder((prev) => !prev)}
            >
              <Plus className="mr-1 h-3 w-3" />
              {showLiveRecorder ? 'Close Desk' : 'Record Publication & Payout'}
            </VibeButton>
          </div>
        </div>

        {/* Live Aggregated Statistics Summary from Backend */}
        {liveSummary && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-vibe-border-layout pt-3 sm:grid-cols-4 lg:grid-cols-7 font-mono text-xs">
            <div className="rounded border border-vibe-border-layout bg-vibe-bg-grey p-2">
              <span className="text-[10px] text-vibe-text-secondary block">Recorded Views</span>
              <span className="font-bold text-vibe-text-primary">{liveSummary.total_views.toLocaleString()}</span>
            </div>
            <div className="rounded border border-vibe-border-layout bg-vibe-bg-grey p-2">
              <span className="text-[10px] text-vibe-text-secondary block">Verified Views</span>
              <span className="font-bold text-vibe-positive-hover">{liveSummary.total_verified_views.toLocaleString()}</span>
            </div>
            <div className="rounded border border-vibe-border-layout bg-vibe-bg-grey p-2">
              <span className="text-[10px] text-vibe-text-secondary block">Est. Revenue</span>
              <span className="font-bold text-vibe-warning-hover">${liveSummary.total_estimated_revenue_usd.toFixed(2)}</span>
            </div>
            <div className="rounded border border-vibe-border-layout bg-vibe-bg-grey p-2">
              <span className="text-[10px] text-vibe-text-secondary block">Verified Payout</span>
              <span className="font-bold text-vibe-positive-hover">${liveSummary.total_verified_payout_usd.toFixed(2)}</span>
            </div>
            <div className="rounded border border-vibe-border-layout bg-vibe-bg-grey p-2">
              <span className="text-[10px] text-vibe-text-secondary block">Costs & Fees</span>
              <span className="font-bold text-vibe-negative">
                ${(liveSummary.total_platform_fees_usd + liveSummary.total_production_costs_usd).toFixed(2)}
              </span>
            </div>
            <div className="rounded border border-vibe-border-layout bg-vibe-bg-grey p-2">
              <span className="text-[10px] text-vibe-text-secondary block">Net Profit</span>
              <span className="font-bold text-vibe-positive-hover">${liveSummary.total_net_profit_usd.toFixed(2)}</span>
            </div>
            <div className="rounded border border-vibe-border-layout bg-vibe-bg-grey p-2">
              <span className="text-[10px] text-vibe-text-secondary block">Effective $/Hr</span>
              <span className="font-bold text-vibe-primary">${liveSummary.average_earnings_per_hour_usd.toFixed(2)}/h</span>
            </div>
          </div>
        )}

        {/* Live Publication & Performance Entry Drawer */}
        {showLiveRecorder && (
          <form
            onSubmit={handleRecordLiveTelemetry}
            className="mt-3 space-y-3 rounded border border-vibe-border-ui bg-vibe-bg-grey p-3 text-xs"
          >
            <div className="font-semibold text-vibe-text-primary">
              Log Real Platform Publication & Reconciliation Telemetry
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-vibe-text-secondary">Clip Candidate</label>
                <select
                  value={pubClipId}
                  onChange={(e) => setPubClipId(e.target.value)}
                  className="w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-2.5 py-1.5 text-xs text-vibe-text-primary"
                >
                  {clips.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-vibe-text-secondary">Platform</label>
                <select
                  value={pubPlatform}
                  onChange={(e) => setPubPlatform(e.target.value)}
                  className="w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-2.5 py-1.5 text-xs text-vibe-text-primary"
                >
                  <option value="tiktok">TikTok</option>
                  <option value="youtube_shorts">YouTube Shorts</option>
                  <option value="instagram_reels">Instagram Reels</option>
                  <option value="x_video">X (Twitter) Video</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-vibe-text-secondary">Public Video Post URL</label>
                <input
                  type="url"
                  placeholder="https://www.tiktok.com/@creator/video/123456"
                  value={pubUrl}
                  onChange={(e) => setPubUrl(e.target.value)}
                  required
                  className="w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-2.5 py-1.5 text-xs text-vibe-text-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 font-mono text-xs">
              <div>
                <label className="mb-1 block font-sans text-[10px] text-vibe-text-secondary">Total Views</label>
                <input
                  type="number"
                  min="0"
                  value={viewsCount}
                  onChange={(e) => setViewsCount(Number(e.target.value))}
                  className="w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-2 py-1 text-vibe-text-primary"
                />
              </div>

              <div>
                <label className="mb-1 block font-sans text-[10px] text-vibe-text-secondary">Verified Views</label>
                <input
                  type="number"
                  min="0"
                  value={verifiedViewsCount}
                  onChange={(e) => setVerifiedViewsCount(Number(e.target.value))}
                  className="w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-2 py-1 text-vibe-text-primary"
                />
              </div>

              <div>
                <label className="mb-1 block font-sans text-[10px] text-vibe-text-secondary">CPM ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cpmUsd}
                  onChange={(e) => setCpmUsd(Number(e.target.value))}
                  className="w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-2 py-1 text-vibe-text-primary"
                />
              </div>

              <div>
                <label className="mb-1 block font-sans text-[10px] text-vibe-text-secondary">Prod Hours</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={prodHours}
                  onChange={(e) => setProdHours(Number(e.target.value))}
                  className="w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-2 py-1 text-vibe-text-primary"
                />
              </div>

              <div>
                <label className="mb-1 block font-sans text-[10px] text-vibe-text-secondary">Prod Cost ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costUsd}
                  onChange={(e) => setCostUsd(Number(e.target.value))}
                  className="w-full rounded border border-vibe-border-ui bg-vibe-bg-surface px-2 py-1 text-vibe-text-primary"
                />
              </div>

              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-1.5 text-[11px] font-sans text-vibe-text-primary cursor-pointer pb-1">
                  <input
                    type="checkbox"
                    checked={reconciled}
                    onChange={(e) => setReconciled(e.target.checked)}
                    className="rounded border-vibe-border-ui text-vibe-positive"
                  />
                  <span>Reconciled</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {submittingStatus ? (
                <span className="font-mono text-[11px] text-vibe-positive-hover">{submittingStatus}</span>
              ) : (
                <span className="text-[11px] text-vibe-text-secondary">
                  Fixed precision math prevents fake revenue claims. Unreconciled views yield strictly $0.00 verified payout.
                </span>
              )}
              <VibeButton type="submit" variant="primary" size="sm">
                Commit to Ledger
              </VibeButton>
            </div>
          </form>
        )}
      </div>

      {/* Chart & Campaign Comparison Grid */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left 7 Cols: Crisp Dual-Bar Telemetry Chart (Verified Paid vs Estimated Accrued vs Cost) */}
        <div className="xl:col-span-7">
          <VibeBoardGroup
            accentColor="primary"
            title="Verified Settled vs. Estimated Accrued Revenue & Costs"
            subtitle="Explicitly distinguishes verified sponsor settlements from projected view-based accruals"
            actions={
              <div className="flex items-center gap-3 font-sans text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1.5 text-vibe-positive-hover">
                  <span className="h-2.5 w-2.5 rounded-xs bg-vibe-positive" />
                  Verified Paid
                </span>
                <span className="inline-flex items-center gap-1.5 text-vibe-warning-hover">
                  <span className="h-2.5 w-2.5 rounded-xs bg-vibe-warning" />
                  Estimated Accrued
                </span>
                <span className="inline-flex items-center gap-1.5 text-vibe-negative">
                  <span className="h-2.5 w-2.5 rounded-xs bg-vibe-negative" />
                  Compute/Ops Cost
                </span>
              </div>
            }
          >
            <div className="grid grid-cols-6 gap-3 p-4">
            {filteredSnapshots.map((snap) => {
              const estHeightPct = Math.round(
                (snap.estimatedEarningsUsd / maxChartValue) * 100
              );
              const verHeightPct = Math.round(
                (snap.verifiedPaidUsd / maxChartValue) * 100
              );
              const costHeightPct = Math.max(
                6,
                Math.round((snap.computeAndOperatorCostUsd / maxChartValue) * 100)
              );

              return (
                <div
                  key={snap.id}
                  className="flex flex-col items-center rounded border border-vibe-border-layout bg-vibe-bg-grey p-2.5"
                >
                  <div className="flex h-40 w-full items-end justify-center gap-1.5 border-b border-vibe-border-ui pb-1">
                    {/* Estimated Bar */}
                    {dataModeHighlight !== 'verified' && (
                      <div
                        title={`Estimated: $${snap.estimatedEarningsUsd}`}
                        style={{ height: `${Math.max(10, estHeightPct)}%` }}
                        className="w-3.5 rounded-t bg-vibe-warning transition-all"
                      />
                    )}
                    {/* Verified Paid Bar */}
                    {dataModeHighlight !== 'estimated' && (
                      <div
                        title={`Verified Paid: $${snap.verifiedPaidUsd}`}
                        style={{ height: `${Math.max(10, verHeightPct)}%` }}
                        className="w-3.5 rounded-t bg-vibe-positive transition-all"
                      />
                    )}
                    {/* Compute & Operator Cost Bar */}
                    <div
                      title={`Cost: $${snap.computeAndOperatorCostUsd}`}
                      style={{ height: `${costHeightPct}%` }}
                      className="w-2.5 rounded-t bg-vibe-negative transition-all"
                    />
                  </div>

                  <div className="mt-2 font-mono text-[11px] font-bold text-vibe-text-primary">
                    {snap.dateLabel}
                  </div>
                  <div className="font-mono text-[10px] font-bold text-vibe-positive-hover tabular-nums">
                    ${snap.verifiedPaidUsd} ver
                  </div>
                  <div className="font-mono text-[10px] text-vibe-text-secondary tabular-nums">
                    ${snap.estimatedEarningsUsd} est
                  </div>
                </div>
              );
            })}
            </div>
          </VibeBoardGroup>
        </div>

        {/* Right 5 Cols: Payout Ledger & Escrow Verification State */}
        <div className="xl:col-span-5">
          <VibeBoardGroup
            accentColor="positive"
            title={
              <>
                <Scale className="h-4 w-4" />
                <span>Payout Settlement Ledger (Demo)</span>
              </>
            }
            actions={
              <span className="font-mono text-[10px] font-semibold text-vibe-text-secondary">
                ESCROW RECONCILIATION
              </span>
            }
          >
            <div className="space-y-2.5 p-4">
            {filteredPayouts.map((pay) => {
              const cmp = campaigns.find((c) => c.id === pay.campaignId);
              const clip = clips.find((c) => c.id === pay.clipCandidateId);
              return (
                <div
                  key={pay.id}
                  className="rounded border border-vibe-border-ui bg-vibe-bg-grey p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-vibe-text-primary tabular-nums">
                      ${pay.amountUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    {pay.verificationState === 'verified-paid' ? (
                      <span className="rounded-sm bg-vibe-positive px-2 py-0.5 font-sans text-[10px] font-bold text-white">
                        VERIFIED PAID
                      </span>
                    ) : pay.verificationState === 'settled-escrow' ? (
                      <span className="rounded-sm bg-vibe-purple px-2 py-0.5 font-sans text-[10px] font-bold text-white">
                        SETTLED ESCROW
                      </span>
                    ) : (
                      <span className="rounded-sm bg-vibe-warning px-2 py-0.5 font-sans text-[10px] font-bold text-white">
                        ACCRUED UNSETTLED
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-semibold text-vibe-text-primary">
                    {clip?.title ?? cmp?.title}
                  </div>
                  <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-vibe-text-secondary">
                    <span>
                      {pay.verifiedViewsCounted.toLocaleString()} views @ ${pay.effectiveCpmUsd.toFixed(2)} CPM
                    </span>
                    <span>{pay.referenceCode}</span>
                  </div>
                </div>
              );
            })}
            </div>
          </VibeBoardGroup>
        </div>
      </div>

      {/* Campaign Profitability & Unit Economics Comparison Table */}
      <VibeBoardGroup
        accentColor="purple"
        title="Campaign Profitability, 4-Tier Reconciliation & Valuation Assumptions"
        actions={
          <span className="font-mono text-[11px] font-semibold text-vibe-text-secondary">
            ESTIMATED · ACCRUED · SETTLED · VERIFIED
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-vibe-border-layout bg-vibe-bg-grey text-[11px] font-semibold text-vibe-text-secondary uppercase">
                <th className="px-4 py-2.5">Campaign & Valuation Formula</th>
                <th className="px-3 py-2.5">Contract CPM</th>
                <th className="px-3 py-2.5">Verified Views</th>
                <th className="px-3 py-2.5">Estimated</th>
                <th className="px-3 py-2.5">Accrued</th>
                <th className="px-3 py-2.5">Settled</th>
                <th className="px-3 py-2.5">Verified</th>
                <th className="px-3 py-2.5">Compute & Ops Cost</th>
                <th className="px-4 py-2.5 text-right">Net Verified Yield</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vibe-border-layout">
              {campaigns.map((cmp) => {
                const cmpSnaps = snapshots.filter((s) => s.campaignId === cmp.id);
                const views = cmpSnaps.reduce((a, b) => a + b.verifiedViews, 0);
                const est = cmpSnaps.reduce((a, b) => a + b.estimatedEarningsUsd, 0);
                const accr = cmpSnaps.reduce((a, b) => a + b.accruedEarningsUsd, 0);
                const setl = cmpSnaps.reduce((a, b) => a + b.settledEarningsUsd, 0);
                const ver = cmpSnaps.reduce((a, b) => a + b.verifiedPaidUsd, 0);
                const cost = cmpSnaps.reduce((a, b) => a + b.computeAndOperatorCostUsd, 0);
                const net = ver - cost;

                return (
                  <tr key={cmp.id} className="hover:bg-vibe-bg-hover">
                    <td className="px-4 py-3">
                      <div className="font-bold text-vibe-text-primary">{cmp.title}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-vibe-text-secondary">
                        Assumption: {cmp.valuationAssumptions?.formulaSummary}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono font-bold text-vibe-primary tabular-nums">
                      ${cmp.cpmUsd.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 font-mono tabular-nums">
                      {views > 0 ? views.toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-3 font-mono text-vibe-text-secondary tabular-nums">
                      ${est.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 font-mono font-semibold text-vibe-warning-hover tabular-nums">
                      ${accr.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 font-mono font-semibold text-vibe-purple tabular-nums">
                      ${setl.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 font-mono font-bold text-vibe-positive-hover tabular-nums">
                      ${ver.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 font-mono font-semibold text-vibe-negative tabular-nums">
                      ${cost.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-vibe-positive-hover tabular-nums">
                      +${net.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </VibeBoardGroup>
    </div>
  );
};
