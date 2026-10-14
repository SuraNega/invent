import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, RefreshCw, Printer, Bluetooth, AlertTriangle, X, ArrowRightLeft, Pencil, Trash2 } from 'lucide-react';
import { formatBirr } from '../utils/formatBirr';
import { notifyInventoryChanged } from '../utils/inventoryEvents';
import { printQrLabelViaBluetooth } from '../utils/bluetoothPrinter';

export default function ProductList({ token, userRole, addToCart }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: '' });
  const toastTimeoutRef = useRef(null);

  // Filters state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Active item for stock adjustment or QR view
  const [activeProduct, setActiveProduct] = useState(null);

  // Form states
  const [newProduct, setNewProduct] = useState({
    name: '',
    unit_price: '',
    cost_price: '',
    category_name: '',
    supplier_name: '', // free-text; matched to supplier_id on submit
    size: '',
    color: '',
    material: '',
    brand: '',
    unit_of_sale: 'piece',
    set_pieces: '',
    quantity: '',
    low_stock_threshold: '',
    description: '',
    sku: ''
  });

  const [adjustData, setAdjustData] = useState({
    quantity_change: '',
    notes: ''
  });

  const [generatedQr, setGeneratedQr] = useState(null);
  const [isBtPrinting, setIsBtPrinting] = useState(false);
  const [btError, setBtError] = useState('');

  const MATERIAL_HINTS = [
    'Stainless Steel', 'Cast Iron', 'Non-stick', 'Ceramic', 'Glass',
    'Wood', 'Silicone', 'Plastic', 'Aluminum'
  ];
  const CAPACITY_HINTS = [
    '20 cm', '24 cm', '28 cm', '1 L', '1.5 L', '3 L', '5 L',
    'Set of 3', 'Set of 5', 'Set of 12'
  ];
  const COLOR_HINTS = [
    'Black', 'Silver', 'White', 'Red', 'Blue', 'Copper', 'Gray', 'Beige', 'Multicolor'
  ];
  const UNIT_OPTIONS = ['piece', 'set', 'pack'];

  const getCategoryHistory = () => {
    try { return JSON.parse(localStorage.getItem('category_history') || '[]'); }
    catch { return []; }
  };

  const saveCategoryToHistory = (name) => {
    if (!name?.trim()) return;
    const hist = getCategoryHistory();
    const updated = [name.trim(), ...hist.filter((h) => h.toLowerCase() !== name.trim().toLowerCase())].slice(0, 20);
    localStorage.setItem('category_history', JSON.stringify(updated));
  };

  const getCategorySuggestions = () => {
    const names = new Set();
    categories.forEach((c) => names.add(c.name));
    getCategoryHistory().forEach((h) => names.add(h));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  };

  const resolveCategoryId = async (categoryName, headers) => {
    const trimmed = categoryName?.trim();
    if (!trimmed) return null;

    const existing = categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      saveCategoryToHistory(trimmed);
      return existing.id;
    }

    const res = await fetch('/api/categories', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: trimmed }),
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to create category');
    }

    saveCategoryToHistory(trimmed);
    setCategories((prev) => {
      if (prev.some((c) => c.id === data.data.id)) return prev;
      return [...prev, data.data];
    });
    return data.data.id;
  };

  const handleCategoryNameChange = (_formKey, value, setter) => {
    setter((prev) => ({
      ...prev,
      category_name: value,
    }));
  };

  // Supplier history backed by localStorage for autocomplete hints
  const getSupplierHistory = () => {
    try { return JSON.parse(localStorage.getItem('supplier_history') || '[]'); }
    catch { return []; }
  };
  const saveSupplierToHistory = (name) => {
    if (!name?.trim()) return;
    const hist = getSupplierHistory();
    const updated = [name.trim(), ...hist.filter(h => h !== name.trim())].slice(0, 10);
    localStorage.setItem('supplier_history', JSON.stringify(updated));
  };
  const getProductSupplierHint = (productId) => {
    try {
      const map = JSON.parse(localStorage.getItem('product_supplier_hints') || '{}');
      return map[productId] || '';
    } catch { return ''; }
  };
  const saveProductSupplierHint = (productId, name) => {
    if (!productId || !name?.trim()) return;
    try {
      const map = JSON.parse(localStorage.getItem('product_supplier_hints') || '{}');
      map[productId] = name.trim();
      localStorage.setItem('product_supplier_hints', JSON.stringify(map));
    } catch { /* ignore */ }
  };

  // Fetch all products, categories, suppliers
  const fetchData = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search) query.append('search', search);
      if (categoryFilter) query.append('category_id', categoryFilter);
      if (sizeFilter) query.append('size', sizeFilter);
      if (materialFilter) query.append('material', materialFilter);
      if (brandFilter) query.append('brand', brandFilter);

      const headers = { 'Authorization': `Bearer ${token}` };

      const [prodRes, catRes, supRes] = await Promise.all([
        fetch(`/api/products?${query.toString()}`, { headers }),
        fetch('/api/categories', { headers }),
        fetch('/api/suppliers', { headers })
      ]);

      if (prodRes.status === 401 || catRes.status === 401 || supRes.status === 401) {
        window.dispatchEvent(new Event('unauthorized'));
        return;
      }

      const prodData = await prodRes.json();
      const catData = await catRes.json();
      const supData = await supRes.json();

      if (prodData.success) setProducts(prodData.data);
      if (catData.success) setCategories(catData.data);
      if (supData.success) setSuppliers(supData.data);

    } catch (err) {
      console.error('[FETCH DATA ERR]', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [search, categoryFilter, sizeFilter, materialFilter, brandFilter, token]);

  const [addError, setAddError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [editError, setEditError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStrategy, setDeleteStrategy] = useState('write_off');
  const [replacementName, setReplacementName] = useState('');

  const showToast = (message) => {
    setToast({ show: true, message });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToast({ show: false, message: '' });
    }, 2500);
  };

  const handleAddToCart = (product) => {
    addToCart(product);
    showToast(`"${product.name}" added to checkout`);
  };

  const handleAddProduct = async () => {
    setAddError('');

    // Manual validation for required fields
    if (!newProduct.name.trim()) {
      setAddError('Product name is required');
      return;
    }
    if (!newProduct.unit_price || parseFloat(newProduct.unit_price) <= 0) {
      setAddError('Retail price must be greater than 0');
      return;
    }

    setIsAdding(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      // Build a clean body — only include fields with actual values
      const body = { name: newProduct.name.trim() };
      body.unit_price = parseFloat(newProduct.unit_price);
      if (newProduct.cost_price) body.cost_price = parseFloat(newProduct.cost_price);
      const categoryId = await resolveCategoryId(newProduct.category_name, headers);
      if (categoryId) body.category_id = categoryId;
      if (newProduct.supplier_name?.trim()) {
        const name = newProduct.supplier_name.trim();
        const matched = suppliers.find(s => s.name.toLowerCase() === name.toLowerCase());
        if (matched) body.supplier_id = matched.id;
        else body.supplier_name = name;
        saveSupplierToHistory(name);
      }
      if (newProduct.size) body.size = newProduct.size.trim();
      if (newProduct.color) body.color = newProduct.color.trim();
      if (newProduct.material) body.material = newProduct.material.trim();
      if (newProduct.brand) body.brand = newProduct.brand.trim();
      body.unit_of_sale = newProduct.unit_of_sale || 'piece';
      if (newProduct.unit_of_sale === 'set' && newProduct.set_pieces) {
        body.set_pieces = parseInt(newProduct.set_pieces, 10);
      }
      body.quantity = newProduct.quantity ? parseInt(newProduct.quantity, 10) : 0;
      body.low_stock_threshold = newProduct.low_stock_threshold ? parseInt(newProduct.low_stock_threshold, 10) : 5;
      if (newProduct.sku) body.sku = newProduct.sku.trim();
      if (newProduct.description) body.description = newProduct.description.trim();

      const res = await fetch('/api/products', {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!data.success) {
        // Handle express-validator array errors
        if (data.errors && Array.isArray(data.errors)) {
          throw new Error(data.errors.map(e => e.msg).join(', '));
        }
        throw new Error(data.message || 'Failed to create product');
      }

      if (newProduct.supplier_name?.trim() && data.data?.id) {
        saveProductSupplierHint(data.data.id, newProduct.supplier_name.trim());
      }

      setShowAddModal(false);
      setAddError('');
      setNewProduct({
        name: '', unit_price: '', cost_price: '', category_name: '',
        supplier_name: '', size: '', color: '', material: '', brand: '',
        unit_of_sale: 'piece', set_pieces: '', quantity: '',
        low_stock_threshold: '', description: '', sku: ''
      });
      fetchData();
      notifyInventoryChanged();
    } catch (err) {
      console.error('[ADD PRODUCT ERR]', err);
      setAddError(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      const res = await fetch(`/api/products/${activeProduct.id}/adjust-stock`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          quantity_change: parseInt(adjustData.quantity_change, 10),
          notes: adjustData.notes
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Adjustment failed');

      setShowAdjustModal(false);
      setAdjustData({ quantity_change: '', notes: '' });
      fetchData();
      notifyInventoryChanged();
    } catch (err) {
      alert(err.message);
    }
  };

  const openEditModal = (product) => {
    setEditProduct({
      id: product.id,
      name: product.name,
      unit_price: String(product.unit_price),
      cost_price: product.cost_price != null ? String(product.cost_price) : '',
      category_name: product.category_name || categories.find((c) => c.id === product.category_id)?.name || '',
      supplier_name: product.supplier_name
        || getProductSupplierHint(product.id)
        || (!product.supplier_id ? getSupplierHistory()[0] : '')
        || '',
      size: product.size || '',
      color: product.color || '',
      material: product.material || '',
      brand: product.brand || '',
      unit_of_sale: product.unit_of_sale || 'piece',
      set_pieces: product.set_pieces != null ? String(product.set_pieces) : '',
      low_stock_threshold: product.low_stock_threshold != null ? String(product.low_stock_threshold) : '5',
      description: product.description || '',
      sku: product.sku,
      quantity: product.quantity,
    });
    setEditError('');
    setShowEditModal(true);
  };

  const buildProductBody = (form, { includeQuantity = false, categoryId = null } = {}) => {
    const body = { name: form.name.trim() };
    body.unit_price = parseFloat(form.unit_price);
    if (form.cost_price) body.cost_price = parseFloat(form.cost_price);
    if (categoryId) body.category_id = categoryId;
    if (form.supplier_name?.trim()) {
      const name = form.supplier_name.trim();
      const matched = suppliers.find(s => s.name.toLowerCase() === name.toLowerCase());
      if (matched) body.supplier_id = matched.id;
      else body.supplier_name = name;
      saveSupplierToHistory(name);
    }
    if (form.size) body.size = form.size.trim();
    if (form.color) body.color = form.color.trim();
    if (form.material) body.material = form.material.trim();
    if (form.brand) body.brand = form.brand.trim();
    body.unit_of_sale = form.unit_of_sale || 'piece';
    body.set_pieces = form.unit_of_sale === 'set' && form.set_pieces ? parseInt(form.set_pieces, 10) : null;
    if (includeQuantity) {
      body.quantity = form.quantity ? parseInt(form.quantity, 10) : 0;
    }
    body.low_stock_threshold = form.low_stock_threshold ? parseInt(form.low_stock_threshold, 10) : 5;
    if (form.sku) body.sku = form.sku.trim();
    if (form.description) body.description = form.description.trim();
    return body;
  };

  const handleEditProduct = async () => {
    if (!editProduct) return;
    setEditError('');

    if (!editProduct.name.trim()) {
      setEditError('Product name is required');
      return;
    }
    if (!editProduct.unit_price || parseFloat(editProduct.unit_price) <= 0) {
      setEditError('Retail price must be greater than 0');
      return;
    }

    setIsEditing(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };
      const categoryId = await resolveCategoryId(editProduct.category_name, headers);
      const body = buildProductBody(editProduct, { categoryId });
      const res = await fetch(`/api/products/${editProduct.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        window.dispatchEvent(new Event('unauthorized'));
        return;
      }

      const data = await res.json();
      if (!data.success) {
        if (data.errors && Array.isArray(data.errors)) {
          throw new Error(data.errors.map(e => e.msg).join(', '));
        }
        throw new Error(data.message || 'Failed to update product');
      }

      if (editProduct.supplier_name?.trim()) {
        saveProductSupplierHint(editProduct.id, editProduct.supplier_name.trim());
      }

      setShowEditModal(false);
      setEditProduct(null);
      fetchData();
      notifyInventoryChanged();
      showToast(`"${data.data.name}" updated`);
    } catch (err) {
      console.error('[EDIT PRODUCT ERR]', err);
      setEditError(err.message);
    } finally {
      setIsEditing(false);
    }
  };

  const openDeleteModal = (product) => {
    setActiveProduct(product);
    setDeleteStrategy('write_off');
    setReplacementName('');
    setDeleteError('');
    setShowDeleteModal(true);
  };

  const handleDeleteProduct = async () => {
    if (!activeProduct) return;
    setDeleteError('');

    if (activeProduct.quantity > 0 && deleteStrategy === 'transfer' && !replacementName.trim()) {
      setDeleteError('Enter a name for the new product to receive the stock');
      return;
    }

    setIsDeleting(true);
    try {
      const body = activeProduct.quantity > 0
        ? {
            strategy: deleteStrategy,
            ...(deleteStrategy === 'transfer' ? { replacement_name: replacementName.trim() } : {}),
          }
        : undefined;

      const res = await fetch(`/api/products/${activeProduct.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.status === 401) {
        window.dispatchEvent(new Event('unauthorized'));
        return;
      }

      const data = await res.json();
      if (!data.success) {
        if (data.errors && Array.isArray(data.errors)) {
          throw new Error(data.errors.map(e => e.msg).join(', '));
        }
        throw new Error(data.message || 'Failed to remove product');
      }

      setShowDeleteModal(false);
      setActiveProduct(null);
      fetchData();
      notifyInventoryChanged();

      if (data.data.new_product) {
        showToast(`"${data.data.product.name}" removed — stock moved to "${data.data.new_product.name}"`);
      } else {
        showToast(data.data.message || `"${data.data.product.name}" removed from catalog`);
      }
    } catch (err) {
      console.error('[DELETE PRODUCT ERR]', err);
      setDeleteError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const triggerQrGenerate = async (product) => {
    try {
      setActiveProduct(product);
      const res = await fetch(`/api/qr/generate/${product.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ copies: 1, print_method: 'qr' })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to generate QR');

      setGeneratedQr(data.data.qr_image);
      setBtError('');
      setShowQrModal(true);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleBluetoothPrint = async () => {
    if (!activeProduct || !generatedQr) return;
    setIsBtPrinting(true);
    setBtError('');
    try {
      await printQrLabelViaBluetooth({
        sku: activeProduct.sku,
        name: activeProduct.name
      });
      setToast({ show: true, message: `QR label for ${activeProduct.sku} sent to printer!` });
      setTimeout(() => setToast({ show: false, message: '' }), 3500);
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        setBtError(err.message || 'Failed to print via Bluetooth.');
      }
    } finally {
      setIsBtPrinting(false);
    }
  };

  const handleSystemPrint = () => {
    if (!activeProduct || !generatedQr) return;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:58mm;height:70mm;border:0;';
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const doc = iframe.contentDocument || frameWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${activeProduct.sku} - Label</title>
  <style>
    @page {
      size: 58mm 70mm portrait;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 58mm;
      background: #fff;
      color: #000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    }
    .label-wrap {
      display: block;
      width: 58mm;
      text-align: center;
    }
    .qr-img {
      display: block;
      width: 30mm;
      height: 30mm;
      margin: 0 auto 1mm;
      image-rendering: pixelated;
    }
    .sku-code {
      display: block;
      width: 100%;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.5px;
      line-height: 1.2;
      word-break: break-all;
    }
    .prod-name {
      display: block;
      width: 50mm;
      margin: 2px auto 0;
      font-size: 11px;
      font-weight: 600;
      color: #222;
      line-height: 1.2;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="label-wrap">
    <img src="${generatedQr}" class="qr-img" alt="QR" />
    <div class="sku-code">${activeProduct.sku}</div>
    <div class="prod-name">${activeProduct.name}</div>
  </div>
</body>
</html>`);
    doc.close();

    const cleanup = () => {
      frameWindow.removeEventListener('afterprint', cleanup);
      iframe.remove();
    };

    const printFrame = () => {
      frameWindow.addEventListener('afterprint', cleanup);
      frameWindow.focus();
      frameWindow.print();
    };

    const image = doc.querySelector('img');
    if (image && !image.complete) {
      image.onload = printFrame;
      image.onerror = printFrame;
    } else {
      printFrame();
    }
  };

  const isRestricted = userRole === 'sales';
  const isOwner = userRole === 'owner';
  const brandFilterOptions = Array.from(new Set(products.map(p => p.brand).filter(Boolean))).sort();

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div className="page-title-section">
          <h2 className="page-title">Inventory Catalog</h2>
          <p className="page-description">Manage product details, SKU codes, manual adjustments and print labels</p>
        </div>
        {!isRestricted && (
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <Plus size={16} /> Add Product
          </button>
        )}
      </div>

      <div className="inventory-filters-panel responsive-filter-bar bg-glass">
        <div className="filter-input-wrap" style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-dim)' }} />
          <input
            type="text"
            placeholder="Search catalog by product name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>

        <div className="filter-dropdown-wrap">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="filter-dropdown-wrap filter-dropdown-size">
          <select value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value)}>
            <option value="">Capacity</option>
            {CAPACITY_HINTS.map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </div>

        <div className="filter-dropdown-wrap">
          <select value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)}>
            <option value="">Material</option>
            {MATERIAL_HINTS.map(material => <option key={material} value={material}>{material}</option>)}
          </select>
        </div>

        <div className="filter-dropdown-wrap">
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
            <option value="">Brand</option>
            {brandFilterOptions.map(brand => <option key={brand} value={brand}>{brand}</option>)}
          </select>
        </div>

        <button 
          onClick={fetchData} 
          className="btn-secondary" 
          style={{ padding: '12px', borderRadius: '8px' }}
          title="Refresh table data"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="premium-table-card inventory-table-desktop">
        <div className="premium-table-scroll">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Product Info</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Capacity / Material / Brand</th>
                <th>Price</th>
                {!isRestricted && <th>Cost Value</th>}
                <th>Current Stock</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isRestricted ? 7 : 8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                    Loading inventory catalog...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={isRestricted ? 7 : 8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                    No products matching your search criteria
                  </td>
                </tr>
              ) : (
                products.map(p => {
                  const isLow = p.quantity <= p.low_stock_threshold;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: '600' }}>{p.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{p.supplier_name || 'No vendor'}</div>
                      </td>
                      <td className="mono" style={{ fontSize: '12px', fontWeight: '500' }}>{p.sku}</td>
                      <td>
                        <span className="badge-ui gray">{p.category_name || 'General'}</span>
                      </td>
                      <td style={{ fontSize: '13px' }}>
                        <div>{p.size || '—'} / {p.material || '—'} / {p.brand || '—'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{p.color || 'No finish'} · {p.unit_of_sale || 'piece'}{p.set_pieces ? ` (${p.set_pieces} pcs)` : ''}</div>
                      </td>
                      <td className="mono" style={{ fontWeight: '700' }}>{formatBirr(p.unit_price)}</td>
                      {!isRestricted && <td className="mono" style={{ color: 'var(--text-muted)' }}>{p.cost_price ? formatBirr(p.cost_price) : '—'}</td>}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="mono" style={{ fontWeight: '700', fontSize: '15px' }}>{p.quantity}</span>
                          {isLow ? (
                            <span className="badge-ui red" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', fontSize: '10px' }} title="Low stock threshold alert">
                              <AlertTriangle size={10} /> Low
                            </span>
                          ) : (
                            <span className="badge-ui green" style={{ padding: '2px 6px', fontSize: '10px' }}>OK</span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleAddToCart(p)}
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--primary-glow)', color: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
                            disabled={p.quantity <= 0}
                          >
                            Add to Cart
                          </button>
                          
                          <button
                            onClick={() => triggerQrGenerate(p)}
                            className="btn-secondary"
                            style={{ padding: '6px' }}
                            title="Generate & View QR Label"
                          >
                            <Printer size={14} />
                          </button>

                          {!isRestricted && (
                            <button
                              onClick={() => {
                                setActiveProduct(p);
                                setShowAdjustModal(true);
                              }}
                              className="btn-secondary"
                              style={{ padding: '6px' }}
                              title="Manual Stock Adjustment"
                            >
                              <ArrowRightLeft size={14} />
                            </button>
                          )}

                          {isOwner && (
                            <>
                              <button
                                onClick={() => openEditModal(p)}
                                className="btn-secondary"
                                style={{ padding: '6px' }}
                                title="Edit Product"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => openDeleteModal(p)}
                                className="btn-secondary"
                                style={{ padding: '6px', color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}
                                title="Remove Product"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="inventory-card-list">
        {loading ? (
          <div className="inventory-card-empty">Loading inventory catalog...</div>
        ) : products.length === 0 ? (
          <div className="inventory-card-empty">No products matching your search criteria</div>
        ) : (
          products.map((p) => {
            const isLow = p.quantity <= p.low_stock_threshold;
            return (
              <div key={p.id} className="inventory-card bg-glass">
                <div className="inventory-card-header">
                  <div>
                    <div className="inventory-card-name">{p.name}</div>
                    <div className="inventory-card-sku mono">{p.sku}</div>
                  </div>
                  <span className="badge-ui gray">{p.category_name || 'General'}</span>
                </div>
                <div className="inventory-card-meta">
                  <span>{p.size || '—'} / {p.material || '—'} / {p.brand || '—'}</span>
                  <span className="mono" style={{ fontWeight: 700 }}>{formatBirr(p.unit_price)}</span>
                </div>
                <div className="inventory-card-stock">
                  <span className="mono" style={{ fontWeight: 700, fontSize: '15px' }}>{p.quantity} in stock</span>
                  {isLow ? (
                    <span className="badge-ui red"><AlertTriangle size={10} /> Low</span>
                  ) : (
                    <span className="badge-ui green">OK</span>
                  )}
                </div>
                <div className="inventory-card-actions">
                  <button
                    onClick={() => handleAddToCart(p)}
                    className="btn-secondary inventory-card-btn"
                    disabled={p.quantity <= 0}
                  >
                    Add to Cart
                  </button>
                  <button onClick={() => triggerQrGenerate(p)} className="btn-secondary inventory-card-icon-btn" title="Generate QR">
                    <Printer size={14} />
                  </button>
                  {!isRestricted && (
                    <button
                      onClick={() => { setActiveProduct(p); setShowAdjustModal(true); }}
                      className="btn-secondary inventory-card-icon-btn"
                      title="Adjust Stock"
                    >
                      <ArrowRightLeft size={14} />
                    </button>
                  )}
                  {isOwner && (
                    <>
                      <button onClick={() => openEditModal(p)} className="btn-secondary inventory-card-icon-btn" title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => openDeleteModal(p)} className="btn-secondary inventory-card-icon-btn inventory-card-btn-danger" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 1. Modal: Add Product */}
      {showAddModal && createPortal(
        <div className="modal-overlay">
          <div className="modal-content bg-glass">
            <div className="modal-header">
              <h3 style={{ fontSize: '18px' }}>Register New Product</h3>
              <button onClick={() => { setShowAddModal(false); setAddError(''); }} className="modal-close-btn"><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Product Name */}
              <div className="form-group">
                <label className="form-label">Product Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Stainless Steel Saucepan"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                />
              </div>

              {/* Retail + Cost Price */}
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Retail Price (Br) *</label>
                  <input type="number" step="0.01" placeholder="29.99"
                    value={newProduct.unit_price}
                    onChange={(e) => setNewProduct({ ...newProduct, unit_price: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cost Price (Br)</label>
                  <input type="number" step="0.01" placeholder="12.50"
                    value={newProduct.cost_price}
                    onChange={(e) => setNewProduct({ ...newProduct, cost_price: e.target.value })} />
                </div>
              </div>

              {/* Category — free-text with history hints */}
              <div className="form-group">
                <label className="form-label">Category</label>
                <input
                  type="text"
                  list="category-hints-list"
                  placeholder="Type category — previous entries appear as hints"
                  value={newProduct.category_name}
                  onChange={(e) => handleCategoryNameChange('add', e.target.value, setNewProduct)}
                  autoComplete="off"
                />
                <datalist id="category-hints-list">
                  {getCategorySuggestions().map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              {/* Supplier — optional free-text with history hints */}
              <div className="form-group">
                <label className="form-label">
                  Supplier{' '}
                  <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-dim)' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  list="supplier-hints-list"
                  placeholder="Type supplier name — previous entries appear as hints"
                  value={newProduct.supplier_name}
                  onChange={(e) => setNewProduct({ ...newProduct, supplier_name: e.target.value })}
                  autoComplete="off"
                />
                <datalist id="supplier-hints-list">
                  {suppliers.map(s => <option key={s.id} value={s.name} />)}
                  {getSupplierHistory()
                    .filter(h => !suppliers.some(s => s.name === h))
                    .map(h => <option key={h} value={h} />)}
                </datalist>
              </div>

              {/* Capacity + Material */}
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Size / Capacity</label>
                  <input
                    type="text"
                    list="capacity-hints-list"
                    placeholder="e.g. 28 cm, 3 L, Set of 5"
                    value={newProduct.size}
                    onChange={(e) => setNewProduct({ ...newProduct, size: e.target.value })}
                    autoComplete="off"
                  />
                  <datalist id="capacity-hints-list">
                    {CAPACITY_HINTS.map(size => <option key={size} value={size} />)}
                  </datalist>
                </div>

                <div className="form-group">
                  <label className="form-label">Material</label>
                  <input
                    type="text"
                    list="material-hints-list"
                    placeholder="e.g. Stainless Steel"
                    value={newProduct.material}
                    onChange={(e) => setNewProduct({ ...newProduct, material: e.target.value })}
                    autoComplete="off"
                  />
                  <datalist id="material-hints-list">
                    {MATERIAL_HINTS.map(material => <option key={material} value={material} />)}
                  </datalist>
                </div>
              </div>

              {/* Color + Brand */}
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Color / Finish</label>
                  <input
                    type="text"
                    list="color-hints-list"
                    placeholder="e.g. Silver"
                    value={newProduct.color}
                    onChange={(e) => setNewProduct({ ...newProduct, color: e.target.value })}
                    autoComplete="off"
                  />
                  <datalist id="color-hints-list">
                    {COLOR_HINTS.map(color => <option key={color} value={color} />)}
                  </datalist>
                </div>

                <div className="form-group">
                  <label className="form-label">Brand</label>
                  <input
                    type="text"
                    placeholder="e.g. Momi, Luminarc, Generic"
                    value={newProduct.brand}
                    onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })}
                  />
                </div>
              </div>

              {/* Unit + Pieces */}
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Unit of Sale</label>
                  <select
                    value={newProduct.unit_of_sale}
                    onChange={(e) => setNewProduct({ ...newProduct, unit_of_sale: e.target.value, set_pieces: e.target.value === 'set' ? newProduct.set_pieces : '' })}
                  >
                    {UNIT_OPTIONS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Pieces in Set</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 5"
                    disabled={newProduct.unit_of_sale !== 'set'}
                    value={newProduct.set_pieces}
                    onChange={(e) => setNewProduct({ ...newProduct, set_pieces: e.target.value })}
                    style={newProduct.unit_of_sale !== 'set' ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  />
                </div>
              </div>

              {/* Qty + Low Stock Threshold */}
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Initial Quantity</label>
                  <input type="number" placeholder="10"
                    value={newProduct.quantity}
                    onChange={(e) => setNewProduct({ ...newProduct, quantity: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Low Stock Warning Threshold</label>
                  <input type="number" placeholder="5"
                    value={newProduct.low_stock_threshold}
                    onChange={(e) => setNewProduct({ ...newProduct, low_stock_threshold: e.target.value })} />
                </div>
              </div>

              {/* SKU */}
              <div className="form-group">
                <label className="form-label">SKU (Leave blank to auto-generate)</label>
                <input type="text" placeholder="e.g. KIT-20250601-0001"
                  value={newProduct.sku}
                  onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">Description / Notes</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Non-stick coating, care instructions, warranty note..."
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  style={{ resize: 'vertical', minHeight: '72px' }}
                />
              </div>

              {addError && (
                <div style={{ background: 'var(--danger-glow)', color: 'var(--danger-color)', border: '1px solid var(--danger-color)', padding: '10px', borderRadius: '6px', fontSize: '12px', textAlign: 'center' }}>
                  {addError}
                </div>
              )}

              <button type="button" className="submit-btn" style={{ marginTop: '10px' }}
                disabled={isAdding} onClick={handleAddProduct}>
                {isAdding ? 'Registering...' : 'Register Product'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* 1b. Modal: Edit Product (owner only) */}
      {showEditModal && editProduct && createPortal(
        <div className="modal-overlay">
          <div className="modal-content bg-glass">
            <div className="modal-header">
              <h3 style={{ fontSize: '18px' }}>Edit Product</h3>
              <button onClick={() => { setShowEditModal(false); setEditProduct(null); setEditError(''); }} className="modal-close-btn"><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">SKU</label>
                  <input type="text" value={editProduct.sku} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Current Stock</label>
                  <input type="text" value={editProduct.quantity} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                    Use the stock adjust button to change quantity
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Product Name *</label>
                <input
                  type="text"
                  value={editProduct.name}
                  onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })}
                />
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Retail Price (Br) *</label>
                  <input type="number" step="0.01"
                    value={editProduct.unit_price}
                    onChange={(e) => setEditProduct({ ...editProduct, unit_price: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cost Price (Br)</label>
                  <input type="number" step="0.01"
                    value={editProduct.cost_price}
                    onChange={(e) => setEditProduct({ ...editProduct, cost_price: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <input
                  type="text"
                  list="category-hints-edit"
                  placeholder="Type category — previous entries appear as hints"
                  value={editProduct.category_name}
                  onChange={(e) => handleCategoryNameChange('edit', e.target.value, setEditProduct)}
                  autoComplete="off"
                />
                <datalist id="category-hints-edit">
                  {getCategorySuggestions().map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              <div className="form-group">
                <label className="form-label">Supplier <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-dim)' }}>(optional)</span></label>
                <input
                  type="text"
                  list="supplier-hints-edit"
                  value={editProduct.supplier_name}
                  onChange={(e) => setEditProduct({ ...editProduct, supplier_name: e.target.value })}
                  autoComplete="off"
                />
                <datalist id="supplier-hints-edit">
                  {suppliers.map(s => <option key={s.id} value={s.name} />)}
                </datalist>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Size / Capacity</label>
                  <input
                    type="text"
                    list="capacity-hints-edit"
                    value={editProduct.size}
                    onChange={(e) => setEditProduct({ ...editProduct, size: e.target.value })}
                    autoComplete="off"
                  />
                  <datalist id="capacity-hints-edit">
                    {CAPACITY_HINTS.map(size => <option key={size} value={size} />)}
                  </datalist>
                </div>
                <div className="form-group">
                  <label className="form-label">Material</label>
                  <input
                    type="text"
                    list="material-hints-edit"
                    value={editProduct.material}
                    onChange={(e) => setEditProduct({ ...editProduct, material: e.target.value })}
                    autoComplete="off"
                  />
                  <datalist id="material-hints-edit">
                    {MATERIAL_HINTS.map(material => <option key={material} value={material} />)}
                  </datalist>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Color / Finish</label>
                  <input
                    type="text"
                    list="color-hints-edit"
                    value={editProduct.color}
                    onChange={(e) => setEditProduct({ ...editProduct, color: e.target.value })}
                    autoComplete="off"
                  />
                  <datalist id="color-hints-edit">
                    {COLOR_HINTS.map(color => <option key={color} value={color} />)}
                  </datalist>
                </div>

                <div className="form-group">
                  <label className="form-label">Brand</label>
                  <input
                    type="text"
                    value={editProduct.brand}
                    onChange={(e) => setEditProduct({ ...editProduct, brand: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Unit of Sale</label>
                  <select
                    value={editProduct.unit_of_sale}
                    onChange={(e) => setEditProduct({ ...editProduct, unit_of_sale: e.target.value, set_pieces: e.target.value === 'set' ? editProduct.set_pieces : '' })}
                  >
                    {UNIT_OPTIONS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Pieces in Set</label>
                  <input
                    type="number"
                    min="1"
                    disabled={editProduct.unit_of_sale !== 'set'}
                    value={editProduct.set_pieces}
                    onChange={(e) => setEditProduct({ ...editProduct, set_pieces: e.target.value })}
                    style={editProduct.unit_of_sale !== 'set' ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description / Notes</label>
                <textarea
                  rows={3}
                  value={editProduct.description}
                  onChange={(e) => setEditProduct({ ...editProduct, description: e.target.value })}
                  style={{ resize: 'vertical', minHeight: '72px' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Low Stock Warning Threshold</label>
                <input type="number"
                  value={editProduct.low_stock_threshold}
                  onChange={(e) => setEditProduct({ ...editProduct, low_stock_threshold: e.target.value })} />
              </div>

              {editError && (
                <div style={{ background: 'var(--danger-glow)', color: 'var(--danger-color)', border: '1px solid var(--danger-color)', padding: '10px', borderRadius: '6px', fontSize: '12px', textAlign: 'center' }}>
                  {editError}
                </div>
              )}

              <button type="button" className="submit-btn" disabled={isEditing} onClick={handleEditProduct}>
                {isEditing ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* 1c. Modal: Delete Product (owner only) */}
      {showDeleteModal && activeProduct && createPortal(
        <div className="modal-overlay">
          <div className="modal-content bg-glass delete-product-modal">
            <div className="modal-header">
              <h3 style={{ fontSize: '18px' }}>Remove Product</h3>
              <button onClick={() => { setShowDeleteModal(false); setDeleteError(''); }} className="modal-close-btn"><X size={18} /></button>
            </div>

            {activeProduct.quantity === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Remove <strong>{activeProduct.name}</strong> ({activeProduct.sku}) from the catalog?
                  This product has no stock on hand.
                </p>
                {deleteError && (
                  <div style={{ background: 'var(--danger-glow)', color: 'var(--danger-color)', border: '1px solid var(--danger-color)', padding: '10px', borderRadius: '6px', fontSize: '12px', textAlign: 'center' }}>
                    {deleteError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowDeleteModal(false)}>
                    Cancel
                  </button>
                  <button type="button" className="submit-btn" style={{ flex: 1, background: 'var(--danger-color)' }} disabled={isDeleting} onClick={handleDeleteProduct}>
                    {isDeleting ? 'Removing...' : 'Remove from Catalog'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <strong>{activeProduct.name}</strong> has <strong>{activeProduct.quantity}</strong> units in stock.
                  Choose how to handle the remaining inventory before removing this listing.
                </p>

                <div className="delete-choice-cards">
                  <label className={`delete-choice-card ${deleteStrategy === 'write_off' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="deleteStrategy"
                      value="write_off"
                      checked={deleteStrategy === 'write_off'}
                      onChange={() => setDeleteStrategy('write_off')}
                    />
                    <div>
                      <div className="delete-choice-title">Write off as waste</div>
                      <div className="delete-choice-desc">
                        Remove all {activeProduct.quantity} units as a store loss. Inventory is reduced and the product is removed from the catalog.
                      </div>
                    </div>
                  </label>

                  <label className={`delete-choice-card ${deleteStrategy === 'transfer' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="deleteStrategy"
                      value="transfer"
                      checked={deleteStrategy === 'transfer'}
                      onChange={() => setDeleteStrategy('transfer')}
                    />
                    <div>
                      <div className="delete-choice-title">Transfer to new product</div>
                      <div className="delete-choice-desc">
                        Create a new product listing and move all stock there. The current listing is then removed.
                      </div>
                    </div>
                  </label>
                </div>

                {deleteStrategy === 'transfer' && (
                  <div className="form-group">
                    <label className="form-label">New product name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Stainless Steel Saucepan - Revised"
                      value={replacementName}
                      onChange={(e) => setReplacementName(e.target.value)}
                    />
                  </div>
                )}

                {deleteError && (
                  <div style={{ background: 'var(--danger-glow)', color: 'var(--danger-color)', border: '1px solid var(--danger-color)', padding: '10px', borderRadius: '6px', fontSize: '12px', textAlign: 'center' }}>
                    {deleteError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowDeleteModal(false)}>
                    Cancel
                  </button>
                  <button type="button" className="submit-btn" style={{ flex: 1, background: 'var(--danger-color)' }} disabled={isDeleting} onClick={handleDeleteProduct}>
                    {isDeleting ? 'Processing...' : 'Confirm Removal'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      , document.body)}

      {/* 2. Modal: Manual Stock Adjustment */}
      {showAdjustModal && activeProduct && createPortal(
        <div className="modal-overlay">
          <div className="modal-content bg-glass">
            <div className="modal-header">
              <h3 style={{ fontSize: '18px' }}>Adjust Stock levels</h3>
              <button onClick={() => setShowAdjustModal(false)} className="modal-close-btn"><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Modifying quantity of <strong>{activeProduct.name}</strong> (SKU: {activeProduct.sku})
            </p>
            <form onSubmit={handleAdjustStock} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Quantity Change (Use negative for subtraction) *</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 20 (or -5)"
                  value={adjustData.quantity_change}
                  onChange={(e) => setAdjustData({ ...adjustData, quantity_change: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Reason / Note
                  {parseInt(adjustData.quantity_change, 10) < 0 && (
                    <span style={{ color: 'var(--warning-color)', fontWeight: 600 }}> (recommended for reductions)</span>
                  )}
                </label>
                <textarea
                  rows={3}
                  placeholder={
                    parseInt(adjustData.quantity_change, 10) < 0
                      ? 'Reason for reduction - e.g. damaged, missing pieces, stolen, display sample'
                      : 'e.g. Replenishment shipment arrived from supplier'
                  }
                  value={adjustData.notes}
                  onChange={(e) => setAdjustData({ ...adjustData, notes: e.target.value })}
                  style={{ resize: 'vertical', minHeight: '72px' }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                  This note appears in stock movement reports for managers to review.
                </span>
              </div>

              <button type="submit" className="submit-btn">Apply Adjustment</button>
            </form>
          </div>
        </div>
      , document.body)}

      {/* 3. Modal: QR Preview */}
      {showQrModal && activeProduct && generatedQr && createPortal(
        <div className="modal-overlay">
          <div className="modal-content bg-glass" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '18px' }}>Product QR Label</h3>
              <button onClick={() => setShowQrModal(false)} className="modal-close-btn"><X size={18} /></button>
            </div>
            
            <div className="qr-preview-wrapper animate-fade">
              <div className="qr-image-frame">
                <img src={generatedQr} alt={`QR Code for ${activeProduct.sku}`} />
              </div>
              <div className="qr-print-tag-sku">{activeProduct.sku}</div>
              <div className="qr-print-tag-name">{activeProduct.name}</div>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '16px' }}>
              QR label generated from the unique SKU. This tag can be physically printed for shelf tags or item packaging.
            </p>

            {btError && (
              <div style={{ background: 'var(--danger-glow)', color: 'var(--danger-color)', border: '1px solid var(--danger-color)', padding: '8px 10px', borderRadius: '6px', fontSize: '11px', marginBottom: '14px', textAlign: 'center' }}>
                {btError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button 
                onClick={handleBluetoothPrint}
                disabled={isBtPrinting}
                className="btn-primary" 
                style={{ width: '100%', justifyContent: 'center', gap: '8px' }}
              >
                <Bluetooth size={16} />
                {isBtPrinting ? 'Connecting & Printing...' : 'Direct Print (Bluetooth)'}
              </button>

              <button 
                onClick={handleSystemPrint}
                className="btn-secondary" 
                style={{ width: '100%', justifyContent: 'center', gap: '8px' }}
              >
                <Printer size={16} />
                System Print (58mm Tag)
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {toast.show && (
        <div className="custom-toast bg-glass animate-fade">
          <span className="toast-icon">✓</span>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
