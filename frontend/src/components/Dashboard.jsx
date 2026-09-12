import {
  TrendingUp, UtensilsCrossed, Award, AlertCircle, RefreshCw,
  ShoppingCart, Users, ArrowRight, AlertTriangle
} from 'lucide-react';
import { formatBirr } from '../utils/formatBirr';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard({
  user,
  dbSalesSummary,
  dbStockSummary,
  dbLoading,
  activeAlertsCount,
  isOwner,
  onRefresh,
  onNavigate,
}) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const metrics = [
    {
      title: 'Gross Revenue',
      value: formatBirr(dbSalesSummary?.total_revenue || 0),
      sub: `Across ${dbSalesSummary?.total_sales || 0} POS checkout tickets`,
      icon: TrendingUp,
      accent: 'metric-accent-indigo',
      iconClass: 'metric-icon-indigo',
      valueClass: 'text-gold',
    },
    {
      title: 'Catalog Inventory Size',
      value: `${dbStockSummary?.total_units || 0} units`,
      sub: 'Currently registered stock shelf assets',
      icon: UtensilsCrossed,
      accent: 'metric-accent-blue',
      iconClass: 'metric-icon-blue',
    },
    {
      title: 'Warehouse Worth (Retail)',
      value: formatBirr(dbStockSummary?.total_retail_value || 0),
      sub: 'Expected sales asset cash conversion',
      icon: Award,
      accent: 'metric-accent-green',
      iconClass: 'metric-icon-green',
      valueClass: 'text-success',
    },
    {
      title: 'Active Alert Warnings',
      value: `${activeAlertsCount} Warning${activeAlertsCount !== 1 ? 's' : ''}`,
      sub: activeAlertsCount > 0
        ? 'Urgent catalog replenishment required'
        : 'Product shelf counts healthy',
      icon: AlertCircle,
      accent: activeAlertsCount > 0 ? 'metric-accent-red' : 'metric-accent-green',
      iconClass: activeAlertsCount > 0 ? 'metric-icon-red' : 'metric-icon-green',
      valueClass: activeAlertsCount > 0 ? 'text-danger' : 'text-success',
    },
  ];

  return (
    <div className="animate-fade dashboard-page">
      <div className="dashboard-welcome bg-glass">
        <div className="dashboard-welcome-text">
          <h2 className="dashboard-greeting">
            {getGreeting()}, {user?.full_name?.split(' ')[0] || 'Admin'}
          </h2>
          <p className="dashboard-date">{today}</p>
          <p className="dashboard-subtitle">Quick statistics and operational overview</p>
        </div>
        <button
          onClick={onRefresh}
          className="btn-secondary dashboard-refresh-btn"
          title="Refresh dashboard stats"
          disabled={dbLoading}
        >
          <RefreshCw size={14} className={dbLoading ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="metrics-grid">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.title} className={`metric-card bg-glass metric-card-enhanced ${m.accent}`}>
              <div className="metric-header">
                <span className="metric-title">{m.title}</span>
                <div className={`metric-icon-wrapper metric-icon-square ${m.iconClass}`}>
                  <Icon size={18} />
                </div>
              </div>
              <div className={`metric-value ${m.valueClass || ''}`}>{m.value}</div>
              <div className="metric-sub">{m.sub}</div>
            </div>
          );
        })}
      </div>

      {activeAlertsCount > 0 && (
        <div className="dashboard-alert-strip" onClick={() => onNavigate('alerts')}>
          <AlertTriangle size={18} />
          <span>
            <strong>{activeAlertsCount} low-stock warning{activeAlertsCount !== 1 ? 's' : ''}</strong>
            {' '}— tap to review and resolve
          </span>
          <ArrowRight size={16} className="dashboard-alert-arrow" />
        </div>
      )}

      <div className="dashboard-actions-grid">
        <div className="dashboard-action-card bg-glass">
          <div className="dashboard-action-icon metric-icon-indigo">
            <ShoppingCart size={20} />
          </div>
          <h3 className="dashboard-action-title">Quick POS Checkout</h3>
          <p className="dashboard-action-desc">
            Process a quick checkout or scan tags using the POS terminal optimized for phone cameras.
          </p>
          <button onClick={() => onNavigate('pos')} className="btn-primary dashboard-action-btn">
            Open POS terminal <ArrowRight size={14} />
          </button>
        </div>

        <div className="dashboard-action-card bg-glass">
          <div className="dashboard-action-icon metric-icon-blue">
            <Users size={20} />
          </div>
          <h3 className="dashboard-action-title">Staff Accounts</h3>
          <p className="dashboard-action-desc">
            Create Cashier, Sales, or Owner accounts. Each role gets access to the appropriate parts of the system.
          </p>
          <p className="dashboard-action-hint">
            Initial owner login: <code>admin</code> / <code>admin123</code>
          </p>
          {isOwner && (
            <button onClick={() => onNavigate('users')} className="btn-primary dashboard-action-btn">
              Manage Staff <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
