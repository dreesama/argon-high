import React from 'react';
import {
  Bell,
  CheckCircle2,
  Cpu,
  Database,
  FileVideo,
  Radar,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import {
  ActivityEvent,
  Campaign,
  ClipCandidate,
  NavSection,
  Workspace,
} from '../types/argon';
import { ARGON_SERVICE_ADAPTERS } from '../services/argonAdapters';
import { DemoTag, OperationalStatusBadge } from './ArgonBadges';
import { VibeButton } from '../vibe/VibeComponents';

interface GlobalSearchModalProps {
  isOpen: boolean;
  query: string;
  onChangeQuery: (q: string) => void;
  onClose: () => void;
  campaigns: Campaign[];
  clips: ClipCandidate[];
  onSelectCampaign: (campaignId: string) => void;
  onSelectClip: (clipId: string) => void;
  onNavigate: (section: NavSection) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  query,
  onChangeQuery,
  onClose,
  campaigns,
  clips,
  onSelectCampaign,
  onSelectClip,
  onNavigate,
}) => {
  if (!isOpen) return null;

  const q = query.trim().toLowerCase();
  const matchedCampaigns = campaigns.filter(
    (c) =>
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.sponsorName.toLowerCase().includes(q) ||
      c.sourceChannel.toLowerCase().includes(q)
  );
  const matchedClips = clips.filter(
    (c) =>
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.transcriptExcerpt.toLowerCase().includes(q)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-vibe-text-primary/40 pt-20 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-vibe-border-ui bg-vibe-bg-surface vibe-shadow-md">
        <div className="flex items-center border-b border-vibe-border-layout px-4 py-3">
          <Search className="h-4 w-4 text-vibe-primary" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
            placeholder="Jump to campaign brief, clip candidate, transcript quote, or module..."
            className="ml-3 flex-1 bg-transparent text-xs text-vibe-text-primary placeholder-vibe-text-secondary focus:outline-none"
          />
          <VibeButton
            kind="secondary"
            size="xs"
            onClick={onClose}
          >
            ESC
          </VibeButton>
        </div>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-4 text-xs">
          {/* Campaigns */}
          <div>
            <div className="mb-2 font-sans text-[11px] font-bold text-vibe-text-secondary uppercase">
              Campaign Briefs ({matchedCampaigns.length})
            </div>
            <div className="space-y-1.5">
              {matchedCampaigns.slice(0, 4).map((cmp) => (
                <button
                  key={cmp.id}
                  onClick={() => {
                    onSelectCampaign(cmp.id);
                    onNavigate('campaign-radar');
                    onClose();
                  }}
                  className="flex w-full items-center justify-between rounded border border-vibe-border-ui bg-vibe-bg-surface px-3 py-2 text-left transition hover:border-vibe-primary hover:bg-vibe-bg-hover"
                >
                  <div className="flex items-center gap-2">
                    <Radar className="h-3.5 w-3.5 text-vibe-primary" />
                    <div>
                      <div className="font-bold text-vibe-text-primary">{cmp.title}</div>
                      <div className="text-[11px] text-vibe-text-secondary">{cmp.sourceChannel}</div>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-vibe-primary">
                    ${cmp.cpmUsd.toFixed(2)} CPM
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Clips */}
          <div>
            <div className="mb-2 font-sans text-[11px] font-bold text-vibe-text-secondary uppercase">
              Clip Candidates ({matchedClips.length})
            </div>
            <div className="space-y-1.5">
              {matchedClips.map((clip) => (
                <button
                  key={clip.id}
                  onClick={() => {
                    onSelectClip(clip.id);
                    onNavigate('clip-studio');
                    onClose();
                  }}
                  className="flex w-full items-center justify-between rounded border border-vibe-border-ui bg-vibe-bg-surface px-3 py-2 text-left transition hover:border-vibe-primary hover:bg-vibe-bg-hover"
                >
                  <div className="flex items-center gap-2">
                    <FileVideo className="h-3.5 w-3.5 text-vibe-purple" />
                    <div>
                      <div className="font-bold text-vibe-text-primary">{clip.title}</div>
                      <div className="line-clamp-1 text-[11px] text-vibe-text-secondary">
                        {clip.transcriptExcerpt}
                      </div>
                    </div>
                  </div>
                  <span className="rounded bg-vibe-positive px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                    Hook {clip.hookScore}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: Workspace;
  onResetDemoData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  workspace,
  onResetDemoData,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-vibe-text-primary/40 p-4 backdrop-blur-xs">
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-vibe-border-ui bg-vibe-bg-surface p-5 vibe-shadow-md">
        <div className="flex items-center justify-between border-b border-vibe-border-layout pb-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-vibe-primary" />
            <h2 className="text-sm font-bold text-vibe-text-primary">
              Workspace Settings & Adapter Boundaries
            </h2>
            <DemoTag label="ARCHITECTURE & STATE" />
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-vibe-text-secondary hover:bg-vibe-bg-grey hover:text-vibe-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs">
          {/* Workspace Info */}
          <div className="rounded border border-vibe-border-ui bg-vibe-bg-grey p-3.5">
            <div className="font-sans text-[11px] font-bold text-vibe-primary uppercase">
              Active Multi-Tenant Workspace Context
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-[11px] text-vibe-text-secondary">Workspace Name</div>
                <div className="font-bold text-vibe-text-primary">{workspace.name}</div>
              </div>
              <div>
                <div className="text-[11px] text-vibe-text-secondary">Tier</div>
                <div className="font-mono font-bold text-vibe-purple">{workspace.tier}</div>
              </div>
              <div>
                <div className="text-[11px] text-vibe-text-secondary">Compute Used</div>
                <div className="font-mono font-semibold text-vibe-text-primary">
                  ${workspace.usedComputeUsd} / ${workspace.monthlyComputeBudgetUsd}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-vibe-text-secondary">Asset Storage</div>
                <div className="font-mono font-semibold text-vibe-text-primary">{workspace.storageUsedGb} GB</div>
              </div>
            </div>
          </div>

          {/* Service Adapter Boundaries Table */}
          <div className="rounded border border-vibe-border-ui bg-vibe-bg-grey p-3.5">
            <div className="flex items-center justify-between">
              <span className="font-sans text-[11px] font-bold text-vibe-text-primary uppercase">
                6 Service Adapter Boundaries & Integration Contracts (v2.5)
              </span>
              <span className="rounded bg-vibe-positive px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                API-READY FRONTEND CONTRACT
              </span>
            </div>
            <p className="mt-1 text-[11px] text-vibe-text-secondary">
              Argon High maintains clean service adapter boundaries across all six operational domains without inventing fake live integrations:
            </p>

            <div className="mt-3 space-y-2.5">
              {ARGON_SERVICE_ADAPTERS.map((adapter) => (
                <div
                  key={adapter.id}
                  className="rounded border border-vibe-border-ui bg-vibe-bg-surface p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-vibe-text-primary">{adapter.name}</div>
                      <div className="font-mono text-[10px] text-vibe-primary">
                        {adapter.productionInterfaceContract}
                      </div>
                    </div>
                    <OperationalStatusBadge status={adapter.operationalStatus} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-vibe-text-secondary">
                    {adapter.honestCapabilityNote}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Local Storage Persistence & Reset */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-vibe-border-ui bg-vibe-bg-grey p-3.5">
            <div>
              <div className="font-bold text-vibe-text-primary">
                Reset Local Demo State
              </div>
              <div className="text-[11px] text-vibe-text-secondary">
                Clears locally persisted campaigns, trim edits, and review decisions back to factory defaults.
              </div>
            </div>
            <VibeButton
              kind="primary"
              color="negative"
              onClick={() => {
                onResetDemoData();
                onClose();
              }}
              leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
            >
              Reset Demo Data
            </VibeButton>
          </div>
        </div>
      </div>
    </div>
  );
};
