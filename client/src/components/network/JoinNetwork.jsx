import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Spinner from '../Spinner';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { errMsg } from '../../utils/format';

// Shown to a store that hasn't joined the network yet.
export default function JoinNetwork({ status, onJoined }) {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const isOwner = user.role === 'owner';
  const [area, setArea] = useState(status.area || '');
  const [agree, setAgree] = useState(false);
  const [areas, setAreas] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/network/areas').then((r) => setAreas(r.data)).catch(() => {});
  }, []);

  async function join(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/network/join', { agree: true, area: area.trim() });
      await refresh();
      await onJoined();
      toast('Welcome to the store network!');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel join-network" onSubmit={join}>
      <h2>🤝 Join the PureGasly store network</h2>
      <p className="muted">
        Work with the other stores near you instead of losing customers when you run out of stock, and price with confidence.
      </p>

      <ul className="benefit-list">
        <li><strong>Order handoffs.</strong> Can't fulfil an order? Pass it to a nearby store with stock — with the customer's OK — and earn a referral fee.</li>
        <li><strong>Area price benchmark.</strong> See where your prices sit against the average in your area, and how prices have moved over time.</li>
        <li><strong>Demand insights.</strong> Find out which days, hours and sizes are busiest so you can stock up in time.</li>
        <li><strong>Trust scores.</strong> Stores rate each other after a handoff, so reliable stores stand out.</li>
      </ul>

      <div className="message info">
        <strong>What is shared:</strong> your tank and refill prices are counted in <em>anonymous</em> area averages — other stores never see which price is yours.
        When you hand over an order, the other store sees only the items and the rough delivery area until the customer agrees.
        Customer details are never shared before that.
      </div>

      {!isOwner ? (
        <p className="muted">Only the store owner can join the network. Ask your owner to join from their account.</p>
      ) : (
        <>
          {error && <div className="message error">{error}</div>}
          <div className="field">
            <label htmlFor="net-area">Your city or town</label>
            <input
              id="net-area"
              required
              list="net-areas"
              maxLength={60}
              placeholder="e.g. Urdaneta City"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
            <datalist id="net-areas">
              {areas.map((a) => <option key={a.name} value={a.name} />)}
            </datalist>
            <span className="hint">Stores in the same area are compared with each other. Pick the existing spelling if you see it.</span>
          </div>

          <label className="consent">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              I agree to share anonymous price and order patterns, to treat other stores respectfully, and <strong>not to use the network to agree on prices</strong> with other stores. Referral fees are settled directly between stores.
            </span>
          </label>

          <button className="btn-solid" disabled={busy || !agree || !area.trim()}>
            {busy && <Spinner light />}{busy ? 'Joining...' : 'Join the network'}
          </button>
        </>
      )}
    </form>
  );
}
