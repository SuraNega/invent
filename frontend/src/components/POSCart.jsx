import { useState } from 'react';
import { ShoppingBag, Trash2, CheckCircle, RotateCcw, Pencil, Check, X } from 'lucide-react';
import { formatBirr } from '../utils/formatBirr';
import { notifyInventoryChanged } from '../utils/inventoryEvents';

export default function POSCart({ cart, updateQty, removeFromCart, overrideLineTotal, onCheckoutSuccess, token }) {
  const [activeTab, setActiveTab] = useState('sell');
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [priceDraft, setPriceDraft] = useState('');

  const getLineTotal = (item) => (
    item.custom_subtotal != null
      ? item.custom_subtotal
      : item.unit_price * item.quantity
  );

  const getCatalogLineTotal = (item) => (
    (item.original_unit_price ?? item.unit_price) * item.quantity
  );

  // Sell state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [completedSale, setCompletedSale] = useState(null);

  // Refund state
  const [refundForm, setRefundForm] = useState({
    reason: 'wrong_item',
    condition: 'resellable',
    refund_type: 'cash',
    refund_amount: '',
    notes: ''
  });
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundError, setRefundError] = useState('');
  const [completedRefund, setCompletedRefund] = useState(null);

  const total = cart.reduce((sum, item) => sum + getLineTotal(item), 0);

  const startPriceEdit = (item) => {
    setEditingPriceId(item.id);
    setPriceDraft(String(getLineTotal(item)));
  };

  const cancelPriceEdit = () => {
    setEditingPriceId(null);
    setPriceDraft('');
  };

  const savePriceEdit = (id) => {
    const parsed = parseFloat(priceDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    overrideLineTotal(id, parsed);
    cancelPriceEdit();
  };

  const isDiscounted = (item) => getLineTotal(item) < getCatalogLineTotal(item) - 0.005;

  const handleCheckout = async () => {
    if (!cart.length) return;
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          items: cart.map((item) => ({
            product_id: item.id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            ...(item.custom_subtotal != null ? { subtotal: item.custom_subtotal } : {}),
          })),
          payment_method: 'cash'
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Checkout failed');
      setCompletedSale(data.data);
      notifyInventoryChanged();
      onCheckoutSuccess();
    } catch (err) {
      setErrorMsg(err.message || 'Checkout failed. Check stock levels.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefund = async () => {
    if (!cart.length) return;
    setIsRefunding(true);
    setRefundError('');
    try {
      const results = [];
      for (const item of cart) {
        const res = await fetch('/api/returns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            product_id: item.id,
            quantity: item.quantity,
            reason: refundForm.reason,
            condition: refundForm.condition,
            refund_type: refundForm.refund_type,
            refund_amount: refundForm.refund_amount ? parseFloat(refundForm.refund_amount) : getLineTotal(item),
            notes: refundForm.notes || undefined
          })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || `Refund failed for ${item.name}`);
        results.push(data.data);
      }
      setCompletedRefund(results);
      notifyInventoryChanged();
      onCheckoutSuccess();
    } catch (err) {
      setRefundError(err.message);
    } finally {
      setIsRefunding(false);
    }
  };

  return (
    <>
      <div className="pos-cart-panel bg-glass animate-fade">

        <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-light)', borderRadius: '10px', padding: '4px', marginBottom: '16px' }}>
          {['sell', 'refund'].map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setErrorMsg(''); setRefundError(''); }}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '7px',
                fontSize: '13px',
                fontWeight: '600',
                background: activeTab === tab ? 'var(--surface-color)' : 'transparent',
                color: activeTab === tab ? (tab === 'refund' ? 'var(--danger-color)' : 'var(--primary-color)') : 'var(--text-muted)',
                boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'var(--transition-fast)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              {tab === 'sell' ? <ShoppingBag size={14} /> : <RotateCcw size={14} />}
              {tab === 'sell' ? 'Sell' : 'Refund'}
            </button>
          ))}
        </div>

        <div className="cart-header">
          <div className="cart-title">
            <ShoppingBag size={20} style={{ color: 'var(--primary-color)' }} />
            <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Scanned Items</h3>
          </div>
          <span className="cart-count-badge">{cart.reduce((s, i) => s + i.quantity, 0)} items</span>
        </div>

        <div className="cart-items-scroll">
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px 10px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
              <ShoppingBag size={32} style={{ opacity: 0.3 }} />
              <p style={{ fontSize: '13px' }}>No items scanned yet</p>
              <p style={{ fontSize: '11px' }}>Scan a QR code or enter SKU manually</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="cart-item-row">
                <div className="cart-item-meta">
                  <div className="cart-item-name">{item.name}</div>
                  <div className="cart-item-sku mono">{item.sku}</div>
                  {isDiscounted(item) && (
                    <span className="discount-sale-badge cart-discount-badge">↓ Below catalog price</span>
                  )}
                  {item.quantity > 1 && editingPriceId !== item.id && (
                    <span className="cart-line-unit-hint mono">
                      {formatBirr(item.unit_price)} each × {item.quantity}
                    </span>
                  )}
                </div>
                <div className="cart-item-controls">
                  <button onClick={() => updateQty(item.id, -1)} className="qty-btn">-</button>
                  <span style={{ fontSize: '13px', fontWeight: '600', minWidth: '16px', textAlign: 'center' }}>{item.quantity}</span>
                  <button onClick={() => updateQty(item.id, 1)} className="qty-btn">+</button>
                  <div className="cart-item-price-calc">
                    {editingPriceId === item.id ? (
                      <div className="cart-price-edit cart-price-edit--line">
                        <div className="cart-price-edit-label">
                          {item.quantity > 1 ? `Total for ${item.quantity} items` : 'Sale price'}
                        </div>
                        <div className="cart-price-edit-row">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={priceDraft}
                            onChange={(e) => setPriceDraft(e.target.value)}
                            className="cart-price-input cart-price-input--line"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') savePriceEdit(item.id);
                              if (e.key === 'Escape') cancelPriceEdit();
                            }}
                          />
                          <button type="button" className="cart-price-btn" onClick={() => savePriceEdit(item.id)} title="Save total">
                            <Check size={12} />
                          </button>
                          <button type="button" className="cart-price-btn" onClick={cancelPriceEdit} title="Cancel">
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="cart-price-display">
                        <div className="cart-item-price mono">{formatBirr(getLineTotal(item))}</div>
                        {activeTab === 'sell' && (
                          <button
                            type="button"
                            className="cart-price-edit-btn"
                            onClick={() => startPriceEdit(item)}
                            title={item.quantity > 1 ? 'Edit total price for all items' : 'Edit sale price'}
                          >
                            <Pencil size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={() => removeFromCart(item.id)} style={{ color: 'var(--text-dim)', padding: '4px' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="cart-summary-calculations">
          <div className="calc-row total">
            <span>Total</span>
            <span className="mono">{formatBirr(total)}</span>
          </div>
        </div>

        {activeTab === 'sell' && (
          <>
            {errorMsg && (
              <div style={{ background: 'var(--danger-glow)', color: 'var(--danger-color)', border: '1px solid var(--danger-color)', padding: '10px', borderRadius: '6px', fontSize: '12px', marginBottom: '12px', textAlign: 'center' }}>
                {errorMsg}
              </div>
            )}
            <button onClick={handleCheckout} disabled={cart.length === 0 || isSubmitting} className="checkout-btn">
              {isSubmitting ? 'Processing...' : `Confirm Sale — ${formatBirr(total)}`}
            </button>
          </>
        )}

        {activeTab === 'refund' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
              <div className="form-grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Reason</label>
                  <select value={refundForm.reason} onChange={e => setRefundForm({ ...refundForm, reason: e.target.value })}>
                    <option value="wrong_item">Wrong Item</option>
                    <option value="defective">Defective</option>
                    <option value="changed_mind">Changed Mind</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Condition</label>
                  <select value={refundForm.condition} onChange={e => setRefundForm({ ...refundForm, condition: e.target.value })}>
                    <option value="resellable">Resellable</option>
                    <option value="damaged">Damaged</option>
                    <option value="incomplete_set">Incomplete Set</option>
                  </select>
                </div>
              </div>
              {refundForm.reason === 'other' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Describe the reason</label>
                  <input
                    type="text"
                    placeholder="e.g. Customer complaint, packaging issue..."
                    value={refundForm.notes}
                    onChange={e => setRefundForm({ ...refundForm, notes: e.target.value })}
                  />
                </div>
              )}
              <div className="form-grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Refund Type</label>
                  <select value={refundForm.refund_type} onChange={e => setRefundForm({ ...refundForm, refund_type: e.target.value })}>
                    <option value="cash">Cash</option>
                    <option value="store_credit">Store Credit</option>
                    <option value="exchange">Exchange</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Amount (optional)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder={formatBirr(total)}
                    value={refundForm.refund_amount}
                    onChange={e => setRefundForm({ ...refundForm, refund_amount: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notes (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Customer receipt #1234"
                  value={refundForm.notes}
                  onChange={e => setRefundForm({ ...refundForm, notes: e.target.value })}
                />
              </div>
            </div>

            {refundError && (
              <div style={{ background: 'var(--danger-glow)', color: 'var(--danger-color)', border: '1px solid var(--danger-color)', padding: '10px', borderRadius: '6px', fontSize: '12px', marginBottom: '12px', textAlign: 'center' }}>
                {refundError}
              </div>
            )}

            <button
              onClick={handleRefund}
              disabled={cart.length === 0 || isRefunding}
              className="checkout-btn"
              style={{ background: 'var(--danger-color)', boxShadow: '0 4px 12px var(--danger-glow)' }}
            >
              {isRefunding ? 'Processing...' : `Process Refund — ${formatBirr(total)}`}
            </button>
          </>
        )}
      </div>

      {completedSale && (
        <div className="receipt-overlay">
          <div className="receipt-card animate-fade" style={{ maxWidth: '340px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--success-color)', marginBottom: '12px' }}>
              <CheckCircle size={40} />
            </div>
            <div className="receipt-title" style={{ marginBottom: '4px' }}>Sale Complete</div>
            <div style={{ fontSize: '12px', color: '#555', marginBottom: '16px' }}>
              {completedSale.sale_code} · {new Date(completedSale.created_at).toLocaleTimeString()}
            </div>
            <div className="receipt-items" style={{ textAlign: 'left', marginBottom: '12px' }}>
              {completedSale.items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                  <span>{item.product_name} ×{item.quantity}</span>
                  <span>{formatBirr(item.subtotal)}</span>
                </div>
              ))}
            </div>
            <div className="receipt-dashed-line" />
            <div className="receipt-totals" style={{ fontSize: '15px', marginTop: '8px' }}>
              <span>Total:</span>
              <span>{formatBirr(completedSale.total_amount)}</span>
            </div>
            <button onClick={() => setCompletedSale(null)} className="receipt-dismiss-btn" style={{ marginTop: '20px' }}>Done</button>
          </div>
        </div>
      )}

      {completedRefund && (
        <div className="receipt-overlay">
          <div className="receipt-card animate-fade" style={{ maxWidth: '340px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--danger-color)', marginBottom: '12px' }}>
              <RotateCcw size={40} />
            </div>
            <div className="receipt-title" style={{ marginBottom: '4px' }}>Refund Processed</div>
            <div style={{ fontSize: '12px', color: '#555', marginBottom: '16px' }}>{completedRefund.length} item(s) returned</div>
            <div className="receipt-items" style={{ textAlign: 'left', marginBottom: '12px' }}>
              {completedRefund.map((r, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                  <span>{r.product_name} ×{r.quantity}</span>
                  <span className="mono">{r.return_code}</span>
                </div>
              ))}
            </div>
            <div className="receipt-dashed-line" />
            <div className="receipt-totals" style={{ fontSize: '13px', marginTop: '8px' }}>
              <span>Type:</span>
              <span style={{ textTransform: 'capitalize' }}>{completedRefund[0]?.refund_type?.replace('_', ' ')}</span>
            </div>
            <button onClick={() => setCompletedRefund(null)} className="receipt-dismiss-btn" style={{ marginTop: '20px' }}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}
