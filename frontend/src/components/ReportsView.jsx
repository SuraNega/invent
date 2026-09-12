import { useState, useEffect } from 'react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { TrendingUp, BarChart3, LineChart, ShieldAlert, Award, Printer, RefreshCw } from 'lucide-react';
import { formatBirr } from '../utils/formatBirr';
import DailyStaffReport from './DailyStaffReport';
import DatePickerFields from './DatePickerFields';
import { INVENTORY_CHANGED_EVENT } from '../utils/inventoryEvents';

export default function ReportsView({ token }) {
  const [salesSummary, setSalesSummary] = useState(null);
  const [stockValuation, setStockValuation] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [returnsSummary, setReturnsSummary] = useState(null);
  const [salesTrend, setSalesTrend] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  // Time range presets: '3days', '14days', '30days', 'custom'
  const [preset, setPreset] = useState('30days');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29); // Default to last 30 days
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const fetchReports = async () => {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const query = new URLSearchParams();
      if (dateFrom) query.append('date_from', dateFrom + ' 00:00:00');
      if (dateTo) query.append('date_to', dateTo + ' 23:59:59');
      const queryString = query.toString();

      const [summaryRes, valuationRes, topProductsRes, returnsRes, trendRes, stockHistoryRes] = await Promise.all([
        fetch(`/api/reports/sales/summary?${queryString}`, { headers }),
        fetch('/api/reports/stock/valuation', { headers }),
        fetch(`/api/reports/sales/by-product?limit=8&${queryString}`, { headers }),
        fetch(`/api/reports/returns/summary?${queryString}`, { headers }),
        fetch(`/api/reports/sales/trend?${queryString}`, { headers }),
        fetch(`/api/reports/stock/history?${queryString}`, { headers }),
      ]);

      if (
        summaryRes.status === 401 ||
        valuationRes.status === 401 ||
        topProductsRes.status === 401 ||
        returnsRes.status === 401 ||
        trendRes.status === 401 ||
        stockHistoryRes.status === 401
      ) {
        window.dispatchEvent(new Event('unauthorized'));
        return;
      }

      const summaryData = await summaryRes.json();
      const valuationData = await valuationRes.json();
      const topProductsData = await topProductsRes.json();
      const returnsData = await returnsRes.json();
      const trendData = await trendRes.json();
      const stockHistoryData = await stockHistoryRes.json();

      if (summaryData.success) setSalesSummary(summaryData.data);
      if (valuationData.success) setStockValuation(valuationData.data);
      if (topProductsData.success) setTopProducts(topProductsData.data);
      if (returnsData.success) setReturnsSummary(returnsData.data);
      if (trendData.success) setSalesTrend(trendData.data);
      if (stockHistoryData.success) {
        setStockMovements(
          stockHistoryData.data.filter((m) => m.movement_type === 'adjustment' && m.notes)
        );
      }

    } catch (err) {
      console.error('[REPORTS FETCH ERR]', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [token, dateFrom, dateTo]);

  useEffect(() => {
    const handler = () => fetchReports();
    window.addEventListener(INVENTORY_CHANGED_EVENT, handler);
    return () => window.removeEventListener(INVENTORY_CHANGED_EVENT, handler);
  }, [token, dateFrom, dateTo]);

  const handlePresetChange = (selected) => {
    setPreset(selected);
    if (selected === 'custom') return;

    const end = new Date();
    const start = new Date();
    if (selected === '3days') {
      start.setDate(end.getDate() - 2);
    } else if (selected === '14days') {
      start.setDate(end.getDate() - 13);
    } else if (selected === '30days') {
      start.setDate(end.getDate() - 29);
    }
    
    setDateFrom(start.toISOString().split('T')[0]);
    setDateTo(end.toISOString().split('T')[0]);
  };

  const handleFromDateChange = (val) => {
    setDateFrom(val);
    setPreset('custom');
    if (val > dateTo) setDateTo(val);
  };

  const handleToDateChange = (val) => {
    setDateTo(val);
    setPreset('custom');
    if (val < dateFrom) setDateFrom(val);
  };

  const handlePrint = () => {
    window.print();
  };

  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#dc2626', '#8b5cf6', '#ec4899', '#3b82f6'];

  if (loading && !salesSummary) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-dim)' }}>
        Generating analytical reports & computing inventory valuation...
      </div>
    );
  }

  // Pre-process stock valuation charts
  const valuationChartData = stockValuation?.items?.slice(0, 8).map(item => ({
    name: item.name.length > 15 ? item.name.substring(0, 15) + '...' : item.name,
    costValue: parseFloat(item.stock_cost_value || 0),
    retailValue: parseFloat(item.stock_retail_value || 0)
  })) || [];

  // Pre-process returns breakdown chart
  const returnsChartData = returnsSummary?.by_reason?.map((item) => ({
    name: item.reason.replace('_', ' ').toUpperCase(),
    value: parseInt(item.count, 10)
  })) || [];

  return (
    <div className="animate-fade">
      {/* Print-only Header Banner */}
      <div className="print-header-banner" style={{ display: 'none' }}>
        <h1 style={{ fontSize: '24px', margin: '0 0 4px 0' }}>Momi's Kitchenware Inventory Management System</h1>
        <p style={{ fontSize: '12px', margin: 0, color: '#555' }}>
          <strong>Analytical Report Export</strong> | Date Range: {dateFrom} to {dateTo} | Generated: {new Date().toLocaleString()}
        </p>
      </div>

      <div className="page-header page-header-actions">
        <div className="page-title-section">
          <h2 className="page-title">Analytics & Valuation</h2>
          <p className="page-description">Real-time reports, financial asset valuations and customer behavior audits</p>
        </div>
        <div className="header-actions stack-on-mobile">
          <button 
            onClick={handlePrint} 
            className="btn-primary" 
            style={{ gap: '8px' }}
            title="Download report as vector PDF"
          >
            <Printer size={16} /> Export PDF Report
          </button>
          <button 
            onClick={fetchReports} 
            className="btn-secondary" 
            style={{ padding: '12px', borderRadius: '8px' }}
            title="Reload reports"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Date Filter & Control Panel */}
      <div className="inventory-filters-panel reports-filter-grid bg-glass no-print">
        <div className="reports-filter-field">
          <label className="form-label" style={{ margin: 0 }}>Select Range Preset</label>
          <select 
            value={preset} 
            onChange={(e) => handlePresetChange(e.target.value)}
            style={{ background: 'var(--surface-color)' }}
          >
            <option value="3days">Last 3 Days (Detail Audit)</option>
            <option value="14days">Last 2 Weeks (14 Days)</option>
            <option value="30days">Last Month (30 Days)</option>
            <option value="custom">Custom Range Calendar</option>
          </select>
        </div>

        <div className="reports-filter-field">
          <DatePickerFields
            label="Start Date"
            idPrefix="reports-from"
            value={dateFrom}
            onChange={handleFromDateChange}
          />
        </div>

        <div className="reports-filter-field">
          <DatePickerFields
            label="End Date"
            idPrefix="reports-to"
            value={dateTo}
            onChange={handleToDateChange}
          />
        </div>
      </div>

      {/* Sales Summary Widgets */}
      <div className="metrics-grid">
        <div className="metric-card bg-glass">
          <div className="metric-header">
            <span className="metric-title">Gross Revenue</span>
            <div className="metric-icon-wrapper" style={{ background: 'var(--primary-glow)', color: 'var(--primary-color)' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="metric-value text-gold">{formatBirr(salesSummary?.total_revenue || 0)}</div>
          <div className="metric-sub">Accumulated checkout sales value</div>
        </div>

        <div className="metric-card bg-glass">
          <div className="metric-header">
            <span className="metric-title">Sales Count</span>
            <div className="metric-icon-wrapper" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
              <BarChart3 size={18} />
            </div>
          </div>
          <div className="metric-value">{salesSummary?.total_sales || 0}</div>
          <div className="metric-sub">Total custom checkout transactions</div>
        </div>

        <div className="metric-card bg-glass">
          <div className="metric-header">
            <span className="metric-title">Valuation (Retail)</span>
            <div className="metric-icon-wrapper" style={{ background: 'var(--success-glow)', color: 'var(--success-color)' }}>
              <LineChart size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: 'var(--success-color)' }}>
            {formatBirr(stockValuation?.summary?.total_retail_value || 0)}
          </div>
          <div className="metric-sub">Total stock retail listing worth</div>
        </div>

        <div className="metric-card bg-glass">
          <div className="metric-header">
            <span className="metric-title">Valuation (Cost)</span>
            <div className="metric-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning-color)' }}>
              <Award size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ color: 'var(--warning-color)' }}>
            {formatBirr(stockValuation?.summary?.total_cost_value || 0)}
          </div>
          <div className="metric-sub">Capital asset value of {stockValuation?.summary?.total_units || 0} items</div>
        </div>
      </div>

      {/* Trend Area Chart (Green/Indigo theme matching Haze UI sample) */}
      <div className="bg-glass" style={{ borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', margin: 0 }}>Sales Revenue Trend ({preset === 'custom' ? 'Custom Range' : preset === '3days' ? 'Last 3 Days' : preset === '14days' ? 'Last 2 Weeks' : 'Last Month'})</h3>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Aggregated daily sales revenue performance</span>
        </div>
        <div style={{ height: '300px', width: '100%' }}>
          {salesTrend.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', paddingTop: '120px', fontSize: '13px' }}>
              No transactions recorded in this date range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="var(--text-dim)" fontSize={10} tickLine={false} />
                <YAxis stroke="var(--text-dim)" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ background: 'var(--surface-color)', border: '1px solid var(--surface-border)', borderRadius: '8px' }}
                  labelStyle={{ color: 'var(--text-main)', fontWeight: 'bold' }}
                  formatter={(value) => [formatBirr(value), 'Revenue']}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="revenue" name="Daily Revenue (Br)" stroke="#10b981" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts Layout */}
      <div className="charts-grid">
        {/* 1. Bar Chart: Stock Valuation */}
        <div className="chart-card bg-glass">
          <div className="chart-title-section">
            <h3 style={{ fontSize: '15px' }}>Stock Valuation (Cost vs Retail)</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Top 8 high value products</span>
          </div>
          <div className="chart-container-inner">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={valuationChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" stroke="var(--text-dim)" fontSize={10} tickLine={false} />
                <YAxis stroke="var(--text-dim)" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ background: 'var(--surface-color)', border: '1px solid var(--surface-border)', borderRadius: '8px' }}
                  labelStyle={{ color: 'var(--text-main)', fontWeight: 'bold' }}
                  formatter={(value) => formatBirr(value)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="costValue" name="Asset Cost Value (Br)" fill="var(--warning-color)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="retailValue" name="Asset Retail Worth (Br)" fill="var(--primary-color)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Area Chart: Top Performing Products by Name */}
        <div className="chart-card bg-glass">
          <div className="chart-title-section">
            <h3 style={{ fontSize: '15px' }}>Top Selling Clothing Items</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Units sold leaderboard</span>
          </div>
          <div className="chart-container-inner">
            {topProducts.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', paddingTop: '100px', fontSize: '13px' }}>
                No checkout sale logs logged yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={topProducts} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="name" 
                    stroke="var(--text-dim)" 
                    fontSize={9} 
                    tickLine={false}
                    tickFormatter={(val) => val.length > 12 ? val.substring(0, 12) + '..' : val}
                  />
                  <YAxis stroke="var(--text-dim)" fontSize={10} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ background: 'var(--surface-color)', border: '1px solid var(--surface-border)', borderRadius: '8px' }}
                    labelStyle={{ color: 'var(--text-main)', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="total_sold" name="Quantity Sold" stroke="var(--primary-color)" fill="url(#colorSales)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 3. Pie Chart: Returns reasons */}
        <div className="chart-card bg-glass" style={{ height: '360px' }}>
          <div className="chart-title-section">
            <h3 style={{ fontSize: '15px' }}>Product Return Reasons</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Total returns logged: {returnsSummary?.summary?.total_returns || 0}</span>
          </div>
          <div className="chart-container-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {returnsChartData.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
                No customer returns recorded.
              </div>
            ) : (
              <div className="pie-chart-layout">
                <div className="pie-chart-canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={returnsChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {returnsChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="pie-chart-legend">
                  {returnsChartData.map((entry, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: COLORS[index % COLORS.length] }} />
                      <span style={{ fontWeight: '500' }}>{entry.name}: {entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4. Mini list: Returns conditions breakdown */}
        <div className="chart-card bg-glass" style={{ height: '360px' }}>
          <div className="chart-title-section">
            <h3 style={{ fontSize: '15px' }}>Stock Return Quality Audit</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Returned kitchenware quality logs</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px', overflowY: 'auto' }}>
            {returnsSummary?.by_condition?.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', paddingTop: '60px', fontSize: '13px' }}>
                No return metrics yet.
              </div>
            ) : (
              returnsSummary?.by_condition?.map((item, idx) => {
                const isGood = item.condition === 'resellable';
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifySelf: 'stretch', justifyContent: 'space-between', padding: '14px', background: 'var(--surface-light)', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {isGood ? (
                        <div style={{ color: 'var(--success-color)', background: 'var(--success-glow)', padding: '6px', borderRadius: '50%' }}>
                          <Award size={16} />
                        </div>
                      ) : (
                        <div style={{ color: 'var(--danger-color)', background: 'var(--danger-glow)', padding: '6px', borderRadius: '50%' }}>
                          <ShieldAlert size={16} />
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', textTransform: 'capitalize' }}>
                          {item.condition.replace('_', ' ')}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                          {isGood ? 'Auto-restocked to shelf inventory' : 'Logged only, stock discarded'}
                        </div>
                      </div>
                    </div>
                    <span className="mono" style={{ fontWeight: '800', fontSize: '16px' }}>{item.count} items</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <DailyStaffReport token={token} />

      <div className="bg-glass stock-notes-report no-print" style={{ marginTop: '24px', padding: '20px', borderRadius: '14px' }}>
        <h3 style={{ fontSize: '15px', marginBottom: '6px' }}>Stock Adjustment Notes</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '16px' }}>
          Reasons recorded when staff reduced or adjusted inventory during the selected date range.
        </p>
        {stockMovements.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>No adjustment notes in this period.</p>
        ) : (
          <div className="stock-notes-list">
            {stockMovements.slice(0, 20).map((movement) => (
              <div key={movement.id} className="stock-notes-item">
                <div className="stock-notes-meta">
                  <strong>{movement.product_name}</strong>
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{movement.product_sku}</span>
                </div>
                <div className="stock-notes-detail">
                  <span style={{ color: movement.quantity_change < 0 ? 'var(--danger-color)' : 'var(--success-color)', fontWeight: 600 }}>
                    {movement.quantity_change > 0 ? '+' : ''}{movement.quantity_change} units
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{movement.notes}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                    {movement.performed_by_name || 'Staff'} · {new Date(movement.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
