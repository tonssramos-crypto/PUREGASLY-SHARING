import { useState } from 'react';
import api from '../api/axios';
import Spinner from './Spinner';
import TrustBadge from './network/TrustBadge';
import { useToast } from '../context/ToastContext';
import { errMsg, formatPHP } from '../utils/format';
import { timeLeft } from '../utils/networkFormat';

// Customer side: the store can't fulfil the order, and another store offers to. Nothing moves until they say yes.
export default function CustomerHandoffNotice({ order, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const o = order.handoffOffer;
  const diff = o.total - o.originalTotal;

  async function answer(accept) {
    setBusy(accept ? 'accept' : 'decline');
    try {
      const res = await api.post(`/orders/${order.id}/handoff/${accept ? 'accept' : 'decline'}`);
      toast(accept ? `Done! Your order moved to ${o.toStore.name} (${res.data.newOrderNo}).` : 'Okay, we kept your order where it was.');
      onChanged();
    } catch (err) {
      toast(errMsg(err), { type: 'error' });
      onChanged();
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="handoff-offer">
      <div className="handoff-offer-head">
        <strong>🤝 {o.fromStoreName} can't fulfil this order</strong>
        <span className="muted small">{timeLeft(o.expiresAt)}</span>
      </div>
      <p className="small">
        <strong>{o.toStore.name}</strong> ({o.toStore.area}) <TrustBadge trust={o.toStore.trust} /> can deliver the same items instead.
        Nothing changes unless you agree.
      </p>
      <ul className="order-items">
        {o.items.map((it, i) => (
          <li key={i}><span>{it.qty} × {it.name}{it.sizeKg ? ` (${it.sizeKg} kg)` : ''}</span><span>{formatPHP(it.qty * it.unitPrice)}</span></li>
        ))}
        {o.deliveryFee > 0 && <li className="fee-line"><span>🚚 Delivery fee</span><span>{formatPHP(o.deliveryFee)}</span></li>}
        <li className="total-line"><span>New total (pay on delivery)</span><strong>{formatPHP(o.total)}</strong></li>
      </ul>
      <p className="small muted">
        Your current order is {formatPHP(o.originalTotal)} — {diff === 0 ? 'the same price' : diff > 0 ? `${formatPHP(diff)} more` : `${formatPHP(-diff)} less`} with {o.toStore.name}. Any coupon from {o.fromStoreName} won't apply. Your name, phone number and address are shared with {o.toStore.name} only if you agree.
      </p>
      <div className="order-actions">
        <button className="btn-solid" disabled={!!busy} onClick={() => answer(true)}>{busy === 'accept' && <Spinner light />}Yes, switch to {o.toStore.name}</button>
        <button className="btn-ghost" disabled={!!busy} onClick={() => answer(false)}>{busy === 'decline' && <Spinner />}No thanks</button>
      </div>
    </div>
  );
}
