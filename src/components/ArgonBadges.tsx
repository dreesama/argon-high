import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Eye,
  Link2Off,
  PackageCheck,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  ComplianceStatus,
  EligibilityStatus,
  OperationalStatus,
  ReviewDecision,
} from '../types/argon';

export const DemoTag: React.FC<{ label?: string }> = ({ label = 'DEMO SIMULATION' }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-vibe-primary/30 bg-vibe-primary-surface px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-vibe-primary uppercase">
    <span className="h-1.5 w-1.5 rounded-full bg-vibe-primary" />
    {label}
  </span>
);

/**
 * V2.5 Standardized Operational Transparency Badge
 * Explicitly distinguishes Simulated, Awaiting integration, Processing, Ready for review,
 * Passed validation, Failed validation, and Exported states.
 */
export const OperationalStatusBadge: React.FC<{ status: OperationalStatus }> = ({
  status,
}) => {
  switch (status) {
    case 'Passed validation':
      return (
        <span className="inline-flex items-center gap-1 rounded-sm bg-vibe-positive px-2 py-0.5 font-sans text-[11px] font-semibold text-white">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          Passed validation
        </span>
      );
    case 'Failed validation':
      return (
        <span className="inline-flex items-center gap-1 rounded-sm bg-vibe-negative px-2 py-0.5 font-sans text-[11px] font-semibold text-white">
          <XCircle className="h-3 w-3 shrink-0" />
          Failed validation
        </span>
      );
    case 'Exported':
      return (
        <span className="inline-flex items-center gap-1 rounded-sm bg-vibe-purple px-2 py-0.5 font-sans text-[11px] font-semibold text-white">
          <PackageCheck className="h-3 w-3 shrink-0" />
          Exported
        </span>
      );
    case 'Ready for review':
      return (
        <span className="inline-flex items-center gap-1 rounded-sm bg-vibe-bright-blue px-2 py-0.5 font-sans text-[11px] font-semibold text-white">
          <Eye className="h-3 w-3 shrink-0" />
          Ready for review
        </span>
      );
    case 'Processing':
      return (
        <span className="inline-flex items-center gap-1 rounded-sm bg-vibe-warning px-2 py-0.5 font-sans text-[11px] font-semibold text-white">
          <Cpu className="h-3 w-3 shrink-0 animate-spin" />
          Processing
        </span>
      );
    case 'Awaiting integration':
      return (
        <span className="inline-flex items-center gap-1 rounded-sm border border-vibe-border-ui bg-vibe-bg-grey px-2 py-0.5 font-sans text-[11px] font-semibold text-vibe-text-secondary">
          <Link2Off className="h-3 w-3 shrink-0" />
          Awaiting integration
        </span>
      );
    case 'Simulated':
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-sm border border-vibe-primary/35 bg-vibe-primary-surface px-2 py-0.5 font-sans text-[11px] font-semibold text-vibe-primary">
          <Sparkles className="h-3 w-3 shrink-0" />
          Simulated
        </span>
      );
  }
};

/**
 * Monday.com Vibe Status Pill — iconic vibrant solid status cell with crisp white label.
 */
export const ComplianceBadge: React.FC<{ status: ComplianceStatus; size?: 'sm' | 'md' }> = ({
  status,
  size = 'sm',
}) => {
  const sizeClasses =
    size === 'sm' ? 'px-2.5 py-0.5 text-[11px] gap-1' : 'px-3 py-1 text-xs gap-1.5';

  switch (status) {
    case 'passed':
      return (
        <span
          className={`inline-flex items-center justify-center rounded-sm bg-vibe-positive font-sans font-semibold text-white shadow-2xs ${sizeClasses}`}
        >
          <CheckCircle2 className="h-3 w-3 shrink-0 text-white" />
          PASSED
        </span>
      );
    case 'failed':
      return (
        <span
          className={`inline-flex items-center justify-center rounded-sm bg-vibe-negative font-sans font-semibold text-white shadow-2xs ${sizeClasses}`}
        >
          <XCircle className="h-3 w-3 shrink-0 text-white" />
          FAILED
        </span>
      );
    case 'warning':
      return (
        <span
          className={`inline-flex items-center justify-center rounded-sm bg-vibe-warning font-sans font-semibold text-white shadow-2xs ${sizeClasses}`}
        >
          <AlertTriangle className="h-3 w-3 shrink-0 text-white" />
          WARNING
        </span>
      );
    case 'human-review':
      return (
        <span
          className={`inline-flex items-center justify-center rounded-sm bg-vibe-bright-blue font-sans font-semibold text-white shadow-2xs ${sizeClasses}`}
        >
          <Eye className="h-3 w-3 shrink-0 text-white" />
          HUMAN REVIEW
        </span>
      );
    case 'pending':
    default:
      return (
        <span
          className={`inline-flex items-center justify-center rounded-sm border border-vibe-border-ui bg-vibe-bg-grey font-sans font-semibold text-vibe-text-secondary ${sizeClasses}`}
        >
          <Clock className="h-3 w-3 shrink-0 text-vibe-text-secondary" />
          PENDING
        </span>
      );
  }
};

export const ReviewStatusBadge: React.FC<{ status: ReviewDecision }> = ({ status }) => {
  switch (status) {
    case 'export-ready':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-sm bg-vibe-purple px-2.5 py-0.5 font-sans text-[11px] font-semibold text-white shadow-2xs">
          <Sparkles className="h-3 w-3" />
          EXPORT-READY
        </span>
      );
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-sm bg-vibe-positive px-2.5 py-0.5 font-sans text-[11px] font-semibold text-white shadow-2xs">
          <CheckCircle2 className="h-3 w-3" />
          APPROVED
        </span>
      );
    case 'changes-requested':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-sm bg-vibe-warning px-2.5 py-0.5 font-sans text-[11px] font-semibold text-white shadow-2xs">
          <AlertTriangle className="h-3 w-3" />
          CHANGES REQ
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-sm bg-vibe-negative px-2.5 py-0.5 font-sans text-[11px] font-semibold text-white shadow-2xs">
          <XCircle className="h-3 w-3" />
          REJECTED
        </span>
      );
    case 'pending':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-sm border border-vibe-border-ui bg-vibe-bg-grey px-2.5 py-0.5 font-sans text-[11px] font-semibold text-vibe-text-secondary">
          <Clock className="h-3 w-3 text-vibe-text-secondary" />
          IN QUEUE
        </span>
      );
  }
};

export const EligibilityBadge: React.FC<{ status: EligibilityStatus }> = ({ status }) => {
  switch (status) {
    case 'Eligible':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-sm bg-vibe-positive px-2.5 py-0.5 font-sans text-[11px] font-semibold text-white shadow-2xs">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          ELIGIBLE
        </span>
      );
    case 'Invite Only':
      return (
        <span className="inline-flex items-center gap-1 rounded-sm bg-vibe-purple px-2.5 py-0.5 font-sans text-[11px] font-semibold text-white shadow-2xs">
          INVITE ONLY
        </span>
      );
    case 'Review Required':
      return (
        <span className="inline-flex items-center gap-1 rounded-sm bg-vibe-warning px-2.5 py-0.5 font-sans text-[11px] font-semibold text-white shadow-2xs">
          <ShieldAlert className="h-3 w-3" />
          REVIEW REQ
        </span>
      );
    case 'Cap Reached':
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-sm border border-vibe-border-ui bg-vibe-bg-grey px-2.5 py-0.5 font-sans text-[11px] font-semibold text-vibe-text-secondary">
          CAP REACHED
        </span>
      );
  }
};
