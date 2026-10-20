import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import Spinner from '../Spinner';
import TrustBadge from './TrustBadge';
import { useToast } from '../../context/ToastContext';
import { errMsg, formatPHP } from '../../utils/format';
import { REASON_LABEL } from '../../utils/networkFormat';

// Store side: "I can't fulfil this order - offer it to another store".
export default function HandoffModal({ order, onClose, onDone }) {
  const toast = useToast();
  const [scope, setScope] = useState('area');
  const [info, setInfo] = useState(null); // response of /candidates
  const [loadError, setLoadError] = useState(null); // { code, message }
  const [loading, setLoading] = useState(true);

  const [storeId, setStoreId] = useState('');
  const [fee, setFee] = useState('');
  const [reason, setReason] = useState('out_of_stock');
  const [note, setNote] = useState('');
  const [zeroStock, setZeroStock] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get('/network/handoffs/candidates', { params: { orderId: order.id, scope } })
      .then((res) => {
        if (cancelled) return;
        setInfo(res.data);
        setLoadError(null);
        setStoreId((cur) => (res.data.candidates?.some((c) => c.storeId === cur) ? cur : ''));
      })
      .catch((err) => !cancelled && setLoadError({ code: err.response?.data?.code, message: errMsg(err) }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [order.id, scope]);

  const chosen = info?.candidates?.find((c) => c.storeId === storeId);
  const maxFee = chosen ? Math.min(info.maxReferralFee, Math.floor(chosen.subtotal * info.maxReferralRate * 100) / 100) : 0;

  async function submit(e) {
    e.preventDefault();
    if (!chosen) return setError('Choose a store first.');
    setError('');
    setBusy(true);
    try {
      await api.post('/network/handoffs', { orderId: order.id, toStoreId: storeId, referralFee: fee, reason, note, zeroStock });
      toast(`Offer sent to ${chosen.name}. They have 2 hours to answer.`);
      onDone();
      onClose();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal wide handoff-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>🤝 Pass order {order.orderNo} to another store</h3>
        <p className="muted small">
          The other store keeps the sale; you can ask for a referral fee. <strong>The customer has to agree</strong> before anything moves, and they keep paying on delivery.
        </p>

        {loading && !info && !loadError ? (
          <p><Spinner /> Looking for stores with your items in stock…</p>
        ) : loadError ? (
          <div className="message error">
            {loadError.message}
            {['NOT_IN_NETWORK'].includes(loadError.code) && <div><Link to="/network" className="link-btn">Go to the Store Network →</Link></div>}
          </div>
        ) : !info.eligible ? (
          <div className="message error">{info.message}</div>
        ) : (
          <>
            <div className="handoff-scope">
              <span className="muted small">{scope === 'area' ? 'Showing stores in your area.' : 'Showing stores in all areas.'}</span>
              <button type="button" className="link-btn" onClick={() => setScope(scope === 'area' ? 'network' : 'area')}>
                {scope === 'area' ? 'Show other areas too' : 'Only my area'}
              </button>
            </div>

            {info.candidates.length === 0 ? (
              <div className="message info">
                No store {scope === 'area' ? 'in your area ' : ''}currently has all of these items in stock{scope === 'area' ? '.' : ' (or meets its minimum order).'}
                {scope === 'area' && ' Try “Show other areas too”.'}
              </div>
            ) : (
              <div className="candidate-list" role="radiogroup" aria-label="Stores that can take this order">
                {info.candidates.map((c) => (
                  <label key={c.storeId} className={`candidate ${storeId === c.storeId ? 'selected' : ''}`}>
                    <input type="radio" name="store" value={c.storeId} checked={storeId === c.storeId} onChange={() => setStoreId(c.storeId)} />
                    <div className="candidate-body">
                      <div className="candidate-top">
                        <strong>{c.name}</strong>
                        <TrustBadge trust={c.trust} />
                      </div>
                      <div className="muted small">{c.area}{!c.sameArea && ' · other area'}</div>
                      <div className="small">
                        Customer would pay <strong>{formatPHP(c.total)}</strong>
                        {c.deliveryFee > 0 && <span className="muted"> (incl. {formatPHP(c.deliveryFee)} delivery)</span>}
                        {' · '}
                        <span className={c.difference > 0 ? 'diff up' : c.difference < 0 ? 'diff down' : 'muted'}>
                          {c.difference === 0 ? 'same as now' : c.difference > 0 ? `${formatPHP(c.difference)} more` : `${formatPHP(-c.difference)} less`}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {info.candidates.length > 0 && (
              <>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="ho-reason">Why can't you fulfil it?</label>
                    <select id="ho-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                      {Object.entries(REASON_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="ho-fee">Referral fee you ask for (₱)</label>
                    <input id="ho-fee" type="number" inputMode="decimal" min="0" step="0.01" max={maxFee || undefined} placeholder="0 = none" value={fee} onChange={(e) => setFee(e.target.value)} />
                    <span className="hint">{chosen ? `Up to ${formatPHP(maxFee)} for this order. ` : ''}They pay it after the order is delivered.</span>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="ho-note">Note for the other store (optional)</label>
                  <textarea id="ho-note" rows={2} maxLength={200} placeholder="e.g. Customer prefers delivery before 5 PM." value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                {reason === 'out_of_stock' && (
                  <label className="consent">
                    <input type="checkbox" checked={zeroStock} onChange={(e) => setZeroStock(e.target.checked)} />
                    <span>Set these items to <strong>0 in stock</strong> in my inventory once the order moves, so I stop getting orders I can't fill.</span>
                  </label>
                )}
                <p className="muted small">The other store sees only the items and the rough delivery area (not the street, name or phone) until the customer agrees.</p>
              </>
            )}
          </>
        )}

        {error && <div className="message error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-solid" disabled={busy || !chosen}>{busy && <Spinner light />}{busy ? 'Sending…' : 'Send offer'}</button>
        </div>
      </form>
    </div>
  );
}
