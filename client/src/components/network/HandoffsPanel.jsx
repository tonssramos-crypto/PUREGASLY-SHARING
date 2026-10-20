import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import { SkeletonRows } from '../Skeleton';
import ReasonModal from '../ReasonModal';
import RatingModal from './RatingModal';
import ReportModal from './ReportModal';
import TrustBadge from './TrustBadge';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { errMsg, formatDateTime, formatPHP } from '../../utils/format';
import { FEE_LABEL, HANDOFF_STATUS_LABEL, REASON_LABEL, handoffPillClass, timeLeft } from '../../utils/networkFormat';
import useAutoRefresh from '../../utils/useAutoRefresh';

const ACTIVE = ['proposed', 'awaiting_customer'];

export default function HandoffsPanel({ muted, onChanged }) {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [modal, setModal] = useState(null); // { kind: 'decline' | 'rate' | 'report', handoff }

  const load = useCallback(async (silent) => {
    try {
      const res = await api.get('/network/handoffs');
      setData(res.data);
      setError('');
    } catch (err) {
      if (silent !== true) setError(errMsg(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(() => load(true), 10000);

  async function call(h, path, okMsg, body) {
    setBusyId(h.id);
    try {
      await api.post(`/network/handoffs/${h.id}/${path}`, body);
      toast(okMsg);
      await load(true);
      onChanged?.();
    } catch (err) {
      toast(errMsg(err), { type: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function accept(h) {
    const units = h.items.reduce((s, i) => s + i.qty, 0);
    const ok = await confirmDialog(
      `We'll hold ${units} item${units === 1 ? '' : 's'} from your stock for up to 1 hour while the customer decides. If they agree, the order becomes yours: ${formatPHP(h.total)} paid by the customer on delivery${h.referralFee > 0 ? `, and you owe ${formatPHP(h.referralFee)} to ${h.other.name} once it's delivered` : ''}.`,
      { title: 'Take over this order?', confirmLabel: 'Accept and hold stock', danger: false }
    );
    if (ok) call(h, 'accept', 'Accepted. Waiting for the customer.');
  }

  async function cancel(h) {
    const ok = await confirmDialog(h.status === 'awaiting_customer' ? 'The other store has already accepted and is holding stock. The customer will be told the offer was withdrawn.' : 'The other store will be told you withdrew the offer.', {
      title: 'Withdraw this offer?',
      confirmLabel: 'Withdraw offer',
    });
    if (ok) call(h, 'cancel', 'Offer withdrawn.');
  }

  if (error) return <div className="message error">{error}</div>;
  if (!data) return <SkeletonRows count={3} />;

  const all = [...data.incoming, ...data.outgoing].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const needsAnswer = all.filter((h) => h.role === 'receiver' && h.status === 'proposed');
  const waiting = all.filter((h) => ACTIVE.includes(h.status) && !needsAnswer.includes(h));
  const history = all.filter((h) => !ACTIVE.includes(h.status));

  const card = (h) => (
    <HandoffCard
      key={h.id}
      h={h}
      muted={muted}
      busy={busyId === h.id}
      onAccept={() => accept(h)}
      onDecline={() => setModal({ kind: 'decline', handoff: h })}
      onCancel={() => cancel(h)}
      onFeeReceived={() => call(h, 'fee-received', 'Marked as received.')}
      onRate={() => setModal({ kind: 'rate', handoff: h })}
      onReport={() => setModal({ kind: 'report', handoff: h })}
    />
  );

  return (
    <>
      <div className="kpi-grid">
        <div className={`kpi ${data.fees.dueToMe > 0 ? 'warn' : ''}`}><span>Referral fees owed to you</span><strong>{formatPHP(data.fees.dueToMe)}</strong></div>
        <div className="kpi"><span>Received so far</span><strong>{formatPHP(data.fees.receivedByMe)}</strong></div>
        <div className={`kpi ${data.fees.iOwe > 0 ? 'warn' : ''}`}><span>Referral fees you owe</span><strong>{formatPHP(data.fees.iOwe)}</strong></div>
      </div>
      <p className="muted small fee-note">Referral fees are paid directly between stores — PureGasly doesn't handle that money. The paying store settles it after the order is delivered; the store that referred the order confirms it was received.</p>

      {all.length === 0 && (
        <div className="panel empty-state">
          <h3>No handoffs yet</h3>
          <p className="muted">When you can't fulfil an order, open it on the <strong>Orders</strong> page and choose <em>Pass to another store</em>. Offers other stores send you will show up here.</p>
        </div>
      )}

      {needsAnswer.length > 0 && (
        <section>
          <h3 className="section-title">Needs your answer <span className="count-badge">{needsAnswer.length}</span></h3>
          <div className="order-list">{needsAnswer.map(card)}</div>
        </section>
      )}
      {waiting.length > 0 && (
        <section>
          <h3 className="section-title">In progress</h3>
          <div className="order-list">{waiting.map(card)}</div>
        </section>
      )}
      {history.length > 0 && (
        <section>
          <h3 className="section-title">History</h3>
          <div className="order-list">{history.map(card)}</div>
        </section>
      )}

      {modal?.kind === 'decline' && (
        <ReasonModal
          title={modal.handoff.status === 'awaiting_customer' ? 'Withdraw your acceptance?' : 'Decline this offer?'}
          description={`${modal.handoff.other.name} will be told. Your held stock is released.`}
          confirmLabel={modal.handoff.status === 'awaiting_customer' ? 'Withdraw' : 'Decline'}
          danger
          onClose={() => setModal(null)}
          onSubmit={(reason) => call(modal.handoff, 'decline', 'Declined.', { reason })}
        />
      )}
      {modal?.kind === 'rate' && <RatingModal handoff={modal.handoff} onClose={() => setModal(null)} onDone={() => { toast('Thanks for rating.'); load(true); }} />}
      {modal?.kind === 'report' && <ReportModal handoff={modal.handoff} onClose={() => setModal(null)} onDone={() => { toast('Report sent to the admin.'); load(true); }} />}
    </>
  );
}

function HandoffCard({ h, muted, busy, onAccept, onDecline, onCancel, onFeeReceived, onRate, onReport }) {
  const sender = h.role === 'sender';
  const active = ACTIVE.includes(h.status);
  const diff = h.total - h.originalTotal;

  return (
    <div className="order-card handoff-card">
      <div className="order-head">
        <div>
          <strong>{sender ? `You offered an order to ${h.other.name}` : `${h.other.name} wants to hand you an order`}</strong>
          <div className="small">
            <TrustBadge trust={h.other.trust} /> <span className="muted">· {h.other.area}</span>
          </div>
          <div className="muted small">
            {formatDateTime(h.createdAt)} · {REASON_LABEL[h.reason]}
            {sender && h.orderNo ? ` · order ${h.orderNo}` : ''}
          </div>
        </div>
        <div className="right">
          <span className={`status-pill ${handoffPillClass(h.status)}`}>{HANDOFF_STATUS_LABEL[h.status]}</span>
          {active && <div className="muted small">{timeLeft(h.expiresAt)}</div>}
        </div>
      </div>

      {h.note && <blockquote className="handoff-note">“{h.note}”</blockquote>}
      {h.declineReason && <p className="small">Reason given: <em>{h.declineReason}</em></p>}

      <ul className="order-items">
        {h.items.map((it, i) => (
          <li key={i}>
            <span>{it.qty} × {it.name}{it.sizeKg ? ` (${it.sizeKg} kg)` : ''}</span>
            <span>{formatPHP(it.qty * it.unitPrice)}</span>
          </li>
        ))}
        {h.deliveryFee > 0 && <li className="fee-line"><span>🚚 Delivery fee</span><span>{formatPHP(h.deliveryFee)}</span></li>}
        <li className="total-line"><span>{sender ? `Customer would pay ${h.other.name}` : 'Customer pays you on delivery'}</span><strong>{formatPHP(h.total)}</strong></li>
      </ul>

      {sender && h.originalTotal > 0 && (
        <p className="small muted">Original order {formatPHP(h.originalTotal)} → {diff === 0 ? 'same price' : diff > 0 ? `${formatPHP(diff)} more for the customer` : `${formatPHP(-diff)} less for the customer`}. The customer must agree.</p>
      )}
      {!sender && h.deliveryArea && <p className="small">📍 Delivering to: {h.deliveryArea} <span className="muted">(full address once the customer agrees)</span></p>}

      <p className="small">
        💰 Referral fee: <strong>{h.referralFee > 0 ? formatPHP(h.referralFee) : 'none'}</strong>
        {h.referralFee > 0 && <span className="muted"> — {sender ? 'paid to you' : 'you pay'}{h.fee.status !== 'none' ? ` · ${FEE_LABEL[h.fee.status]}` : ' once the order is delivered'}</span>}
      </p>
      {h.newOrder && <p className="small">🧾 New order <strong>{h.newOrder.orderNo}</strong> · <span className={`status-pill ${h.newOrder.status}`}>{h.newOrder.status.replace(/_/g, ' ')}</span></p>}

      <div className="order-actions">
        {!sender && h.status === 'proposed' && (
          <>
            <button className="btn-solid" disabled={busy || muted} onClick={onAccept}>Accept and hold stock</button>
            <button className="btn-danger-outline" disabled={busy} onClick={onDecline}>Decline</button>
          </>
        )}
        {!sender && h.status === 'awaiting_customer' && <button className="btn-danger-outline small" disabled={busy} onClick={onDecline}>Withdraw</button>}
        {sender && active && <button className="btn-danger-outline" disabled={busy} onClick={onCancel}>Withdraw offer</button>}
        {sender && h.fee.status === 'due' && <button className="btn-solid small" disabled={busy} onClick={onFeeReceived}>I received the referral fee</button>}
        {h.canRate && <button className="btn-ghost small" onClick={onRate}>★ Rate {h.other.name}</button>}
        {h.rated && <span className="muted small">You rated this ✓</span>}
        {!h.reported ? (
          <button className="link-btn" onClick={onReport}>Report a problem</button>
        ) : (
          <span className="muted small">Report sent ✓</span>
        )}
      </div>
      {muted && !sender && h.status === 'proposed' && <p className="muted small">You're muted, so you can't accept new offers right now.</p>}
    </div>
  );
}
