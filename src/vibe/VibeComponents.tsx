import React from 'react';

export type VibeColor = 'primary' | 'positive' | 'negative' | 'warning' | 'purple' | 'bright-blue' | 'neutral';
export type VibeButtonKind = 'primary' | 'secondary' | 'tertiary';
export type VibeSize = 'xs' | 'sm' | 'md' | 'lg';

interface VibeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: VibeButtonKind;
  color?: VibeColor;
  size?: VibeSize;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  active?: boolean;
  fullWidth?: boolean;
}

export const VibeButton: React.FC<VibeButtonProps> = ({
  kind = 'primary',
  color = 'primary',
  size = 'sm',
  leftIcon,
  rightIcon,
  active = false,
  fullWidth = false,
  className = '',
  children,
  ...rest
}) => {
  const sizeClasses: Record<VibeSize, string> = {
    xs: 'px-2 py-1 text-xs gap-1 rounded',
    sm: 'px-3 py-1.5 text-xs gap-1.5 rounded',
    md: 'px-4 py-2 text-sm gap-2 rounded-md',
    lg: 'px-5 py-2.5 text-sm gap-2 rounded-md',
  };

  let visualClasses = '';

  if (kind === 'primary') {
    if (color === 'positive') {
      visualClasses = 'bg-vibe-positive text-white hover:bg-vibe-positive-hover font-medium shadow-xs';
    } else if (color === 'negative') {
      visualClasses = 'bg-vibe-negative text-white hover:bg-vibe-negative-hover font-medium shadow-xs';
    } else if (color === 'warning') {
      visualClasses = 'bg-vibe-warning text-white hover:bg-vibe-warning-hover font-medium shadow-xs';
    } else if (color === 'purple') {
      visualClasses = 'bg-vibe-purple text-white hover:opacity-95 font-medium shadow-xs';
    } else {
      visualClasses = 'bg-vibe-primary text-white hover:bg-vibe-primary-hover font-medium shadow-xs';
    }
  } else if (kind === 'secondary') {
    if (active) {
      visualClasses =
        'border border-vibe-primary bg-vibe-primary-selected text-vibe-primary font-semibold';
    } else if (color === 'positive') {
      visualClasses =
        'border border-vibe-positive bg-vibe-positive-surface text-vibe-positive-hover hover:bg-vibe-positive/15 font-medium';
    } else if (color === 'negative') {
      visualClasses =
        'border border-vibe-negative bg-vibe-negative-surface text-vibe-negative-hover hover:bg-vibe-negative/15 font-medium';
    } else if (color === 'warning') {
      visualClasses =
        'border border-vibe-warning bg-vibe-warning-surface text-vibe-text-primary hover:bg-vibe-warning/20 font-medium';
    } else {
      visualClasses =
        'border border-vibe-border-ui bg-vibe-bg-surface text-vibe-text-primary hover:bg-vibe-bg-grey font-medium';
    }
  } else {
    // tertiary
    visualClasses = active
      ? 'bg-vibe-primary-selected text-vibe-primary font-semibold'
      : 'bg-transparent text-vibe-text-secondary hover:bg-vibe-bg-grey hover:text-vibe-text-primary font-medium';
  }

  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sizeClasses[size]} ${visualClasses} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {leftIcon && <span className="shrink-0">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
};

/**
 * Monday.com Vibe Board Group Container — features the iconic colored left accent bar,
 * group header title in matching Vibe semantic color, and crisp white elevated rows.
 */
export const VibeBoardGroup: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  accentColor?: 'primary' | 'positive' | 'warning' | 'negative' | 'purple' | 'bright-blue';
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({
  title,
  subtitle,
  accentColor = 'primary',
  actions,
  children,
  className = '',
}) => {
  const borderAccentMap = {
    primary: 'border-l-vibe-primary',
    positive: 'border-l-vibe-positive',
    warning: 'border-l-vibe-warning',
    negative: 'border-l-vibe-negative',
    purple: 'border-l-vibe-purple',
    'bright-blue': 'border-l-vibe-bright-blue',
  };

  const titleColorMap = {
    primary: 'text-vibe-primary',
    positive: 'text-vibe-positive-hover',
    warning: 'text-vibe-warning-hover',
    negative: 'text-vibe-negative',
    purple: 'text-vibe-purple',
    'bright-blue': 'text-vibe-bright-blue',
  };

  return (
    <section
      className={`overflow-hidden rounded-lg border border-vibe-border-ui border-l-[6px] bg-vibe-bg-surface vibe-shadow-sm ${borderAccentMap[accentColor]} ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-vibe-border-layout bg-vibe-bg-surface px-4 py-3">
        <div>
          <div className={`flex items-center gap-2 text-sm font-bold tracking-tight ${titleColorMap[accentColor]}`}>
            {title}
          </div>
          {subtitle && (
            <div className="mt-0.5 text-xs text-vibe-text-secondary">{subtitle}</div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div>{children}</div>
    </section>
  );
};

/**
 * Monday.com Vibe AttentionBox — used for contextual banners, alerts, and operational notices.
 */
export const VibeAttentionBox: React.FC<{
  title?: React.ReactNode;
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'purple';
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, type = 'primary', icon, action, children, className = '' }) => {
  const styleMap = {
    primary: 'border-vibe-primary/30 bg-vibe-primary-surface text-vibe-text-primary',
    success: 'border-vibe-positive/40 bg-vibe-positive-surface text-vibe-text-primary',
    warning: 'border-vibe-warning/50 bg-vibe-warning-surface text-vibe-text-primary',
    danger: 'border-vibe-negative/40 bg-vibe-negative-surface text-vibe-text-primary',
    purple: 'border-vibe-purple/35 bg-vibe-purple-surface text-vibe-text-primary',
  };

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-2.5 text-xs ${styleMap[type]} ${className}`}
    >
      <div className="flex items-start gap-2.5">
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <div>
          {title && <div className="font-semibold text-vibe-text-primary">{title}</div>}
          <div className="text-vibe-text-secondary">{children}</div>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

/**
 * Monday.com Vibe Card — clean white surface with 1px `#d0d4e4` border and subtle Vibe elevation.
 */
export const VibeCard: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  topStripeColor?: 'primary' | 'positive' | 'warning' | 'negative' | 'purple';
  className?: string;
}> = ({ children, onClick, selected = false, topStripeColor, className = '' }) => {
  const topBorderMap = {
    primary: 'border-t-4 border-t-vibe-primary',
    positive: 'border-t-4 border-t-vibe-positive',
    warning: 'border-t-4 border-t-vibe-warning',
    negative: 'border-t-4 border-t-vibe-negative',
    purple: 'border-t-4 border-t-vibe-purple',
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border bg-vibe-bg-surface transition-all vibe-shadow-sm ${
        selected
          ? 'border-vibe-primary ring-2 ring-vibe-primary-selected'
          : 'border-vibe-border-ui hover:border-vibe-primary/50'
      } ${topStripeColor ? topBorderMap[topStripeColor] : ''} ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};
