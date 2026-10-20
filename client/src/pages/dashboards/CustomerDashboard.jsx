import { useEffect, useRef, useState } from 'react';
import useAutoRefresh from '../../utils/useAutoRefresh';
import StoreAvatar from '../../components/StoreAvatar';
import Avatar from '../../components/Avatar';
import PhotoGallery from '../../components/PhotoGallery';
import { mediaUrl } from '../../api/axios';
import { accentBackground } from '../../utils/storeTheme';
import { deliverySummary } from '../../utils/delivery';
import { useLocation } from 'react-router-dom';
import api from '../../api/axios';
import { useCart } from '../../context/CartContext';
import { CATEGORY_LABELS, errMsg, formatPHP } from '../../utils/format';
import RatingStars from '../../components/RatingStars';
import { SkeletonGrid } from '../../components/Skeleton';
import usePageTitle from '../../utils/usePageTitle';
import { useFavorites } from '../../context/FavoritesContext';

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ProductCard({ p, onOpenStore }) {
  const { addItem } = useCart();
  const favorites = useFavorites();
  const out = p.stock === 0;
  const faved = favorites?.isFavorite('product', p.id);

  return (
    <div className={`product-card ${out ? 'is-out' : ''}`}>
      {p.onPromo && <span className="ribbon">PROMO</span>}
      <button
        className={`fav-btn ${faved ? 'faved' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          favorites?.toggle('product', p.id);
        }}
        aria-label={faved ? 'Remove from favorites' : 'Add to favorites'}
      >
        {faved ? '❤️' : '🤍'}
      </button>
      <div className="product-top">
        <span className="cat-tag">{CATEGORY_LABELS[p.category] || 'LPG'}</span>
        <span className="muted small">{p.sold} sold</span>
      </div>
      <h3>{p.name}</h3>
      <p className="muted small">{[p.brand, p.sizeKg ? `${p.sizeKg} kg` : null].filter(Boolean).join(' · ') || '—'}</p>
      {onOpenStore && (
        <button className="link-btn" onClick={() => onOpenStore(p.storeId)}>
          🏪 {p.storeName}
        </button>
      )}
      <div className="price-row">
        <strong className="price">{formatPHP(p.effectivePrice)}</strong>
        {p.onPromo && <s className="muted small">{formatPHP(p.price)}</s>}
      </div>
      <div className="product-foot">
        <span className={`small ${out ? 'text-danger' : p.stock <= 5 ? 'text-warn' : 'muted'}`}>
          {out ? 'Out of stock' : `${p.stock} in stock`}
        </span>
        <button className="btn-solid small" disabled={out} onClick={() => addItem(p, 1)}>
          Add to cart
        </button>
      </div>
    </div>
  );
}

export function StoreCard({ s, onOpen }) {
  const favorites = useFavorites();
  const faved = favorites?.isFavorite('store', s.id);

  return (
    <div className="store-card">
      <button
        className={`fav-btn ${faved ? 'faved' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          favorites?.toggle('store', s.id);
        }}
        aria-label={faved ? 'Remove from favorites' : 'Add to favorites'}
      >
        {faved ? '❤️' : '🤍'}
      </button>
      <button className="store-card-inner" onClick={() => onOpen(s.id)}>
      <StoreAvatar name={s.name} logo={s.logo} accentColor={s.accentColor} />
      <div className="store-info">
        <h3>{s.name}</h3>
        <p className="muted small">{s.address || 'No address listed'}</p>
        <RatingStars value={s.avgRating} count={s.reviewCount} size="sm" />
        <div className="chip-row">
          <span className="chip">{s.productCount} products</span>
          {s.minPrice != null && <span className="chip">from {formatPHP(s.minPrice)}</span>}
          {s.promoCount > 0 && <span className="chip promo">🔥 {s.promoCount} promo</span>}
          <span className="chip">{s.totalSold} sold</span>
        </div>
        <div className="chip-row delivery-chips">
          {deliverySummary(s, formatPHP).map((c) => (
            <span key={c} className="chip delivery">🚚 {c}</span>
          ))}
        </div>
      </div>
      </button>
    </div>
  );
}

export default function CustomerDashboard({ user }) {
  usePageTitle('Shop');
  const location = useLocation();
  const [tab, setTab] = useState('stores'); // stores | products
  const [openStoreId, setOpenStoreId] = useState(location.state?.openStoreId || null);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('');
  const [promoOnly, setPromoOnly] = useState(false);
  const [category, setCategory] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [storeDetail, setStoreDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const q = useDebounced(search);
  const minP = useDebounced(minPrice, 500);
  const maxP = useDebounced(maxPrice, 500);

  // Background refresh: bumps `tick`, which re-runs the loader below silently
  // (no spinner, no error banner) so new products, prices, stock and store
  // changes appear without reloading the page.
  const [tick, setTick] = useState(0);
  const silentRef = useRef(false);
  useAutoRefresh(() => {
    silentRef.current = true;
    setTick((t) => t + 1);
  }, 10000);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const silent = silentRef.current;
      silentRef.current = false;
      if (!silent) {
        setLoading(true);
        setError('');
      }
      try {
        if (openStoreId) {
          const res = await api.get(`/shop/stores/${openStoreId}`);
          if (!cancelled) setStoreDetail(res.data);
        } else if (tab === 'stores') {
          const res = await api.get('/shop/stores', {
            params: { search: q, sort: sort || 'name', promo: promoOnly ? 'true' : undefined },
          });
          if (!cancelled) setStores(res.data);
        } else {
          const res = await api.get('/shop/products', {
            params: {
              search: q,
              sort: sort || 'price_asc',
              promo: promoOnly ? 'true' : undefined,
              category: category || undefined,
              minPrice: minP || undefined,
              maxPrice: maxP || undefined,
            },
          });
          if (!cancelled) setProducts(res.data);
        }
      } catch (err) {
        if (!cancelled && !silent) setError(errMsg(err, 'Could not load the shop.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, openStoreId, q, sort, promoOnly, category, minP, maxP, tick]);

  function openStore(id) {
    setStoreDetail(null);
    setSearch('');
    setPromoOnly(false);
    setOpenStoreId(id);
  }

  function switchTab(t) {
    setOpenStoreId(null);
    setTab(t);
    setSort('');
  }

  // ---------- single store view ----------
  if (openStoreId) {
    const visible = (storeDetail?.products || []).filter(
      (p) =>
        (!q || `${p.name} ${p.brand}`.toLowerCase().includes(q.toLowerCase())) &&
        (!promoOnly || p.onPromo)
    );
    return (
      <>
        <button className="link-btn back" onClick={() => setOpenStoreId(null)}>
          ← Back to browsing
        </button>
        {error && <div className="message error">{error}</div>}
        {storeDetail && (
          <>
            <div className="panel store-hero">
              {(storeDetail.store.cover || storeDetail.store.accentColor) && (
                <div className="store-cover" style={storeDetail.store.cover ? undefined : accentBackground(storeDetail.store.accentColor)}>
                  {storeDetail.store.cover && <img src={mediaUrl(storeDetail.store.cover)} alt="" />}
                </div>
              )}
              <div className="store-header">
                <StoreAvatar name={storeDetail.store.name} logo={storeDetail.store.logo} accentColor={storeDetail.store.accentColor} big />
                <div>
                  <h1>{storeDetail.store.name}</h1>
                  <RatingStars value={storeDetail.store.avgRating} count={storeDetail.store.reviewCount} />
                  <p className="muted small">
                    {[storeDetail.store.address, storeDetail.store.phone].filter(Boolean).join(' · ') || 'No contact info yet'}
                  </p>
                  {storeDetail.store.openingHours && <p className="small">🕒 {storeDetail.store.openingHours}</p>}
                  <p className="small">
                    🚚 {Number(storeDetail.store.deliveryFee) > 0 ? `Delivery ${formatPHP(storeDetail.store.deliveryFee)}` : 'Free delivery'}
                    {Number(storeDetail.store.freeDeliveryOver) > 0 && Number(storeDetail.store.deliveryFee) > 0 && ` · free over ${formatPHP(storeDetail.store.freeDeliveryOver)}`}
                    {Number(storeDetail.store.minOrder) > 0 && ` · minimum order ${formatPHP(storeDetail.store.minOrder)}`}
                  </p>
                  {storeDetail.store.description && <p className="small">{storeDetail.store.description}</p>}
                </div>
              </div>
              <PhotoGallery photos={storeDetail.store.gallery} />
            </div>
            <div className="filter-bar">
              <input placeholder="Search this store..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <label className="toggle">
                <input type="checkbox" checked={promoOnly} onChange={(e) => setPromoOnly(e.target.checked)} /> Promos only
              </label>
            </div>
            {visible.length === 0 ? (
              <p className="empty">No products match.</p>
            ) : (
              <div className="product-grid">
                {visible.map((p) => (
                  <ProductCard key={p.id} p={p} />
                ))}
              </div>
            )}

            {storeDetail.reviews && storeDetail.reviews.length > 0 && (
              <div className="panel">
                <h3>Recent reviews</h3>
                <div className="review-list">
                  {storeDetail.reviews.map((r) => (
                    <div key={r.id} className="review-item">
                      <div className="review-head">
                        <span className="person-inline">
                          <Avatar name={r.customerName} src={r.customerAvatar} size={26} />
                          <strong>{r.customerName}</strong>
                        </span>
                        <RatingStars value={r.rating} size="sm" />
                      </div>
                      {r.comment && <p className="small">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {loading && !storeDetail && <SkeletonGrid count={6} />}
      </>
    );
  }

  // ---------- browse view ----------
  return (
    <>
      <div className="hero">
        <div>
          <h1>Hi {user.name.split(' ')[0]} 👋</h1>
          <p>Find LPG from stores near you and get it delivered.</p>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'stores' ? 'active' : ''} onClick={() => switchTab('stores')}>
          🏪 Browse Stores
        </button>
        <button className={tab === 'products' ? 'active' : ''} onClick={() => switchTab('products')}>
          🔥 LPG Products
        </button>
      </div>

      <div className="filter-bar">
        <input
          placeholder={tab === 'stores' ? 'Search stores...' : 'Search LPG, brand...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          {tab === 'stores' ? (
            <>
              <option value="">Sort: Name (A–Z)</option>
              <option value="price_asc">Lowest price first</option>
              <option value="price_desc">Highest price first</option>
              <option value="sales_desc">Highest sales</option>
              <option value="sales_asc">Lowest sales</option>
              <option value="rating_desc">Highest rated</option>
            </>
          ) : (
            <>
              <option value="">Sort: Lowest price</option>
              <option value="price_desc">Highest price first</option>
              <option value="sales_desc">Highest sales</option>
              <option value="sales_asc">Lowest sales</option>
              <option value="newest">Newest</option>
            </>
          )}
        </select>
        {tab === 'products' && (
          <>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All types</option>
              <option value="lpg">LPG Tank</option>
              <option value="refill">Refill</option>
              <option value="accessory">Accessory</option>
            </select>
            <input className="price-input" type="number" min="0" placeholder="Min ₱" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
            <input className="price-input" type="number" min="0" placeholder="Max ₱" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
          </>
        )}
        <label className="toggle">
          <input type="checkbox" checked={promoOnly} onChange={(e) => setPromoOnly(e.target.checked)} /> 🔥 Promos only
        </label>
      </div>

      {error && <div className="message error">{error}</div>}
      {loading ? (
        <SkeletonGrid count={tab === 'stores' ? 4 : 8} grid={tab === 'stores' ? 'store' : 'product'} />
      ) : tab === 'stores' ? (
        stores.length === 0 ? (
          <p className="empty">No stores found.</p>
        ) : (
          <div className="store-grid">
            {stores.map((s) => (
              <StoreCard key={s.id} s={s} onOpen={openStore} />
            ))}
          </div>
        )
      ) : products.length === 0 ? (
        <p className="empty">No products found.</p>
      ) : (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} p={p} onOpenStore={openStore} />
          ))}
        </div>
      )}
    </>
  );
}
