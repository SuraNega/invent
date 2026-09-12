import React, { useState, useEffect } from 'react';
import './App.css';
import QRScanner from './components/QRScanner';
import POSCart from './components/POSCart';
import ProductList from './components/ProductList';
import ReportsView from './components/ReportsView';
import AlertsManager from './components/AlertsManager';
import UsersManager from './components/UsersManager';
import Dashboard from './components/Dashboard';
import SalesMyReport from './components/SalesMyReport';
import TranslateToggle from './components/TranslateToggle';
import { INVENTORY_CHANGED_EVENT } from './utils/inventoryEvents';
import { isAmharicEnabled, reapplyAmharicTranslation } from './utils/googleTranslate';

// Lucide Icons
import { 
  LayoutDashboard, ShoppingCart, UtensilsCrossed, BarChart3, AlertCircle, LogOut, 
  User, AlertTriangle, Search, Users, Menu, X, TrendingUp
} from 'lucide-react';

const ROLE_LABELS = {
  owner: 'Owner',
  cashier: 'Cashier',
  sales: 'Sales',
  manager: 'Cashier', // legacy DB value — run npm run db:migrate-roles
};

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [activeTab, setActiveTab] = useState(() => {
    const savedUser = JSON.parse(localStorage.getItem('user'));
    return savedUser?.role === 'sales' ? 'pos' : 'dashboard';
  });
  const [refreshAlerts, setRefreshAlerts] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Cart POS state
  const [cart, setCart] = useState([]);
  const [skuSearchVal, setSkuSearchVal] = useState('');
  const [skuSearchError, setSkuSearchError] = useState('');
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);

  // Dashboard state variables
  const [dbSalesSummary, setDbSalesSummary] = useState(null);
  const [dbStockSummary, setDbStockSummary] = useState(null);
  const [dbLoading, setDbLoading] = useState(true);

  // Sign out cleanly (hoisted so we can call it anywhere)
  const handleLogout = React.useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setUsername('');
    setPassword('');
    setCart([]);
    setActiveTab('dashboard');
    setMobileMenuOpen(false);
  }, []);

  const handleNavClick = (tab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  // Fetch critical alerts count & summary dashboard statistics
  const fetchDashboardStats = async () => {
    if (!token) return;
    setDbLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [alertsRes, salesRes, stockRes] = await Promise.all([
        fetch('/api/alerts', { headers }),
        fetch('/api/reports/sales/summary', { headers }),
        fetch('/api/reports/stock/valuation', { headers })
      ]);

      if (alertsRes.status === 401 || salesRes.status === 401 || stockRes.status === 401) {
        handleLogout();
        return;
      }

      const alertsData = await alertsRes.json();
      const salesData = await salesRes.json();
      const stockData = await stockRes.json();

      if (alertsData.success) {
        setActiveAlertsCount(alertsData.data.length);
      }
      if (salesData.success) setDbSalesSummary(salesData.data);
      if (stockData.success) setDbStockSummary(stockData.data.summary);

    } catch (e) {
      console.error('Error fetching dashboard statistics:', e);
    } finally {
      setDbLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDashboardStats();
    }
  }, [token]);

  useEffect(() => {
    const handler = () => {
      fetchDashboardStats();
      setRefreshAlerts((prev) => prev + 1);
    };
    window.addEventListener(INVENTORY_CHANGED_EVENT, handler);
    return () => window.removeEventListener(INVENTORY_CHANGED_EVENT, handler);
  }, [token]);

  // Listen for global unauthorized events from components
  useEffect(() => {
    const handleUnauthorized = () => {
      handleLogout();
    };
    window.addEventListener('unauthorized', handleUnauthorized);
    return () => window.removeEventListener('unauthorized', handleUnauthorized);
  }, [handleLogout]);

  useEffect(() => {
    if (!isAmharicEnabled()) return;
    reapplyAmharicTranslation();
  }, [activeTab, token, refreshAlerts]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileMenuOpen]);

  // Authenticate user via JWT
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(
          text.includes('FUNCTION_INVOCATION_FAILED')
            ? 'API server error. Check Vercel backend logs and Postgres connection.'
            : (text.slice(0, 120) || `Login failed (${res.status})`)
        );
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Authentication failed');
      }

      const { token: jwtToken, user: userProfile } = data.data;
      localStorage.setItem('token', jwtToken);
      localStorage.setItem('user', JSON.stringify(userProfile));

      setToken(jwtToken);
      setUser(userProfile);
      setActiveTab(userProfile.role === 'sales' ? 'pos' : 'dashboard');
    } catch (err) {
      console.error('[LOGIN ERR]', err);
      setLoginError(err.message || 'Failed to login');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // POS Cart Management
  const addToCart = (product) => {
    setCart(prevCart => {
      const existing = prevCart.find(i => i.id === product.id);
      if (existing) {
        return prevCart.map(i => i.id === product.id
          ? { ...i, quantity: i.quantity + 1, custom_subtotal: undefined }
          : i);
      }
      return [...prevCart, {
        ...product,
        quantity: 1,
        original_unit_price: product.unit_price,
      }];
    });
  };

  const overrideLineTotal = (id, lineTotal) => {
    setCart((prevCart) => prevCart.map((item) => {
      if (item.id !== id) return item;
      const total = parseFloat(lineTotal);
      if (!Number.isFinite(total) || total <= 0) return item;
      const roundedTotal = parseFloat(total.toFixed(2));
      return {
        ...item,
        unit_price: parseFloat((roundedTotal / item.quantity).toFixed(2)),
        custom_subtotal: roundedTotal,
      };
    }));
  };

  const updateQty = (id, change) => {
    setCart(prevCart => {
      return prevCart.map(i => {
        if (i.id === id) {
          const newQty = i.quantity + change;
          return newQty > 0
            ? { ...i, quantity: newQty, custom_subtotal: undefined }
            : i;
        }
        return i;
      });
    });
  };

  const removeFromCart = (id) => {
    setCart(prevCart => prevCart.filter(i => i.id !== id));
  };

  // QR Scanning & SKU Lookups
  const handleBarcodeLookup = async (sku) => {
    if (!sku) return;
    setSkuSearchError('');
    try {
      const res = await fetch(`/api/products/sku/${sku}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message || 'Product SKU not found');
      }

      const product = data.data;
      if (product.quantity <= 0) {
        throw new Error(`Product "${product.name}" is out of stock!`);
      }

      addToCart(product);
      setSkuSearchVal('');
      
      // Trigger user friendly chime
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.connect(gain);
      gain.connect(context.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, context.currentTime);
      gain.gain.setValueAtTime(0.1, context.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.15);
      osc.stop(context.currentTime + 0.15);
      
    } catch (err) {
      console.error('[SKU LOOKUP ERR]', err);
      setSkuSearchError(err.message || 'Failed to lookup product SKU');
    }
  };

  // Render Login Card if not authenticated
  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-translate-bar">
          <TranslateToggle />
        </div>
        <div className="auth-card bg-glass animate-fade">
          <div className="auth-header">
            <div className="brand-logo">🍽️</div>
            <h2 className="auth-title">Momi's Kitchenware</h2>
            <p className="auth-subtitle">Sign in to inventory console & POS terminal</p>
          </div>

          {loginError && <div className="auth-error">{loginError}</div>}

          <form onSubmit={handleLogin} autoComplete="off">
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                required
                placeholder="Enter username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            
            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label">Password</label>
              <input
                type="password"
                required
                placeholder="Enter password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="auth-btn" disabled={isLoggingIn}>
              {isLoggingIn ? 'Signing in...' : 'Enter Console'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const role = user?.role || 'sales';
  const isSales = role === 'sales';
  const isOwner = role === 'owner';

  return (
    <div className="app-container">
      <header className="mobile-header">
        <div className="mobile-header-brand">
          <div className="brand-logo">🍽️</div>
          <span className="brand-name">Momi's Kitchenware</span>
        </div>
        <div className="mobile-header-actions">
          <TranslateToggle compact />
          <button
            type="button"
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — desktop always visible; mobile slide-in drawer */}
      <aside className={`sidebar${mobileMenuOpen ? ' sidebar--open' : ''}`}>
        <div className="brand-section">
          <div className="brand-logo">🍽️</div>
          <span className="brand-name">Momi's Kitchenware</span>
        </div>

        <TranslateToggle className="sidebar-translate-toggle" />

        <nav className="nav-links">
          {!isSales && (
            <button
              onClick={() => handleNavClick('dashboard')}
              className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            >
              <LayoutDashboard size={18} /> Dashboard
            </button>
          )}

          <button
            onClick={() => handleNavClick('pos')}
            className={`nav-item ${activeTab === 'pos' ? 'active' : ''}`}
          >
            <ShoppingCart size={18} /> POS Checkout
          </button>

          <button
            onClick={() => handleNavClick('inventory')}
            className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`}
          >
            <UtensilsCrossed size={18} /> Inventory Catalog
          </button>

          {isSales && (
            <button
              onClick={() => handleNavClick('my-report')}
              className={`nav-item ${activeTab === 'my-report' ? 'active' : ''}`}
            >
              <TrendingUp size={18} /> My Sales
            </button>
          )}

          {!isSales && (
            <button
              onClick={() => handleNavClick('reports')}
              className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`}
            >
              <BarChart3 size={18} /> Reports & Charts
            </button>
          )}

          {isOwner && (
            <button
              onClick={() => handleNavClick('users')}
              className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
            >
              <Users size={18} /> Staff Management
            </button>
          )}

          <button
            onClick={() => handleNavClick('alerts')}
            className={`nav-item ${activeTab === 'alerts' ? 'active' : ''}`}
            style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AlertCircle size={18} /> Low Stock Warnings
            </span>
            {activeAlertsCount > 0 && (
              <span style={{ background: 'var(--danger-color)', color: '#fff', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px' }}>
                {activeAlertsCount}
              </span>
            )}
          </button>
        </nav>

        <div className="user-profile-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <div style={{ background: 'var(--surface-light)', padding: '6px', borderRadius: '50%', color: 'var(--primary-color)' }}>
              <User size={16} />
            </div>
            <div className="user-info">
              <span className="user-name">{user?.full_name}</span>
              <span className="user-role">{ROLE_LABELS[user?.role] || user?.role}</span>
            </div>
          </div>
          <button onClick={handleLogout} className="logout-btn" title="Sign Out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* PRIMARY CONTENT AREA */}
      <main className="content-area">
        
        {/* Active Low Stock Alerts Warning Ticker Banner */}
        {activeAlertsCount > 0 && activeTab !== 'alerts' && (
          <div className="alerts-ticker">
            <div className="alerts-ticker-content">
              <AlertTriangle size={18} className="ticker-icon" />
              <span className="alerts-ticker-text">
                Attention! There are {activeAlertsCount} catalog items currently below warning stock thresholds!
              </span>
            </div>
            <span 
              onClick={() => handleNavClick('alerts')} 
              className="alerts-ticker-resolve-link"
            >
              Resolve Alerts →
            </span>
          </div>
        )}

        {/* Tab View 1: Dashboard overview */}
        {activeTab === 'dashboard' && !isSales && (
          <Dashboard
            user={user}
            dbSalesSummary={dbSalesSummary}
            dbStockSummary={dbStockSummary}
            dbLoading={dbLoading}
            activeAlertsCount={activeAlertsCount}
            isOwner={isOwner}
            onRefresh={fetchDashboardStats}
            onNavigate={setActiveTab}
          />
        )}

        {/* Tab View 2: POS Cashier checkout with QR scanner support */}
        {activeTab === 'pos' && (
          <div className="animate-fade">
            <div className="page-header">
              <div className="page-title-section">
                <h2 className="page-title">POS Checkout Terminal</h2>
                <p className="page-description">Scan tags using your camera or enter SKUs manually to checkout customers</p>
              </div>
            </div>

            <div className="pos-layout">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* 1. Real Camera QR Scanner Component */}
                <QRScanner 
                  onScanSuccess={handleBarcodeLookup}
                  onScanError={() => {}}
                />

                {/* 2. Manual Barcode/SKU Input Fallback */}
                <div className="bg-glass" style={{ padding: '24px', borderRadius: '14px' }}>
                  <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>Manual SKU/Barcode Input</h4>
                  <div className="scanner-manual-fallback">
                    <div style={{ position: 'relative', flexGrow: 1 }}>
                      <Search size={16} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-dim)' }} />
                      <input 
                        type="text" 
                        placeholder="e.g. KIT-20260601-1234"
                        value={skuSearchVal}
                        onChange={(e) => setSkuSearchVal(e.target.value)}
                        style={{ paddingLeft: '36px' }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleBarcodeLookup(skuSearchVal);
                        }}
                      />
                    </div>
                    <button 
                      onClick={() => handleBarcodeLookup(skuSearchVal)}
                      className="btn-primary"
                    >
                      Lookup SKU
                    </button>
                  </div>

                  {skuSearchError && (
                    <div style={{ color: 'var(--danger-color)', fontSize: '12px', background: 'var(--danger-glow)', padding: '10px 14px', borderRadius: '6px', marginTop: '12px' }}>
                      {skuSearchError}
                    </div>
                  )}


                </div>
              </div>

              {/* 3. POS Active Cart Checkout Sidebar panel */}
              <POSCart 
                cart={cart}
                updateQty={updateQty}
                removeFromCart={removeFromCart}
                overrideLineTotal={overrideLineTotal}
                token={token}
                onCheckoutSuccess={() => setCart([])}
              />
            </div>
          </div>
        )}

        {/* Tab View 3: Inventory catalog grid table */}
        {activeTab === 'inventory' && (
          <ProductList 
            token={token}
            userRole={role}
            addToCart={addToCart}
          />
        )}

        {/* Tab View 3b: Sales staff personal report */}
        {activeTab === 'my-report' && isSales && (
          <SalesMyReport token={token} user={user} />
        )}

        {/* Tab View 4: Reports charts and valuation dashboard */}
        {activeTab === 'reports' && !isSales && (
          <ReportsView 
            token={token}
            userRole={role}
          />
        )}

        {/* Tab View 5: Alerts details center warning logs */}
        {activeTab === 'alerts' && (
          <AlertsManager 
            token={token}
            userRole={role}
            refreshTrigger={refreshAlerts}
          />
        )}

        {/* Tab View 6: Owner staff management */}
        {activeTab === 'users' && isOwner && (
          <UsersManager token={token} currentUserId={user.id} />
        )}

      </main>
    </div>
  );
}
