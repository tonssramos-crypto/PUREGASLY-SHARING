import { useState } from 'react';
import api from '../../api/axios';
import TrustBadge from './TrustBadge';
import Spinner from '../Spinner';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { errMsg, formatDateTime } from '../../utils/format';

export default function NetworkOverview({ status, reload, goTo, canHandoffs, canInsights }) {
  const { user, refresh } = useAuth();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const isOwner = user.role === 'owner';
  const [area, setArea] = useState(status.area);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function saveArea(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.patch('/store/profile', { area: area.trim() });
      await refresh();
      await reload();
      toast('Area updated.');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function leave() {
    const ok = await confirmDialog('Your prices stop counting towards area averages and you will no longer see benchmarks, trends or handoffs. You can rejoin later.', {
      title: 'Leave the store network?',
      confirmLabel: 'Leave network',
    });
    if (!ok) return;
    try {
      await api.post('/network/leave');
      await refresh();
      await reload();
      toast('You left the network.');
    } catch (err) {
      toast(errMsg(err), { type: 'error' });
    }
  }

  const { counts } = status;
  return (
    <>
      <div className="kpi-grid">
        <div className="kpi"><span>Your area</span><strong className="kpi-text">{status.area || '—'}</strong></div>
        <div className="kpi"><span>Trust score</span><strong className="kpi-text"><TrustBadge trust={status.trust} /></strong></div>
        <div className={`kpi ${counts.incomingOffers ? 'warn' : ''}`}><span>Offers to answer</span><strong>{counts.incomingOffers}</strong></div>
        <div className="kpi"><span>Your open offers</span><strong>{counts.myActiveOffers}</strong></div>
      </div>

      {status.warnings > 0 && (
        <div className="message error">You have {status.warnings} warning{status.warnings === 1 ? '' : 's'} from the admin. {status.statusNote}</div>
      )}

      <div className="panel">
        <h3>How it works</h3>
        <ol className="steps-list">
          <li><strong>Can't fulfil an order?</strong> Open it on the Orders page and choose <em>Pass to another store</em>. Pick a nearby store that has the items.</li>
          <li><strong>They accept</strong> and hold the stock. <strong>The customer agrees</strong> — nothing moves without them.</li>
          <li><strong>The order moves</strong> to the other store. When it's delivered they pay you the referral fee you agreed.</li>
          <li><strong>Rate each other</strong> afterwards. Report anything that went wrong and the admin will step in.</li>
        </ol>
        <div className="inline-actions">
          {canHandoffs && <button className="btn-ghost" onClick={() => goTo('handoffs')}>Open handoffs →</button>}
          {canInsights && <button className="btn-ghost" onClick={() => goTo('prices')}>See area prices →</button>}
        </div>
      </div>

      {isOwner && (
        <form className="panel" onSubmit={saveArea}>
          <h3>Your area</h3>
          <p className="muted small">Used to compare you with nearby stores. Joined {status.joinedAt ? formatDateTime(status.joinedAt) : ''}.</p>
          {error && <div className="message error">{error}</div>}
          <div className="field">
            <label htmlFor="ov-area">City or town</label>
            <input id="ov-area" required maxLength={60} value={area} onChange={(e) => setArea(e.target.value)} />
          </div>
          <div className="inline-actions">
            <button className="btn-solid" disabled={saving || area.trim() === status.area}>{saving && <Spinner light />}Save area</button>
            <button type="button" className="btn-danger-outline" onClick={leave}>Leave network</button>
          </div>
        </form>
      )}
    </>
  );
}
