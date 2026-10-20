import { useEffect, useState } from 'react';
import useAutoRefresh from '../utils/useAutoRefresh';
import Avatar from '../components/Avatar';
import TempPasswordNotice from '../components/TempPasswordNotice';
import api from '../api/axios';
import AppShell from '../components/AppShell';
import { errMsg } from '../utils/format';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import Spinner from '../components/Spinner';
import { SkeletonRows } from '../components/Skeleton';
import usePageTitle from '../utils/usePageTitle';

export default function ManageRiders() {
  usePageTitle('Riders');
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // The temporary password is shown once, right after the account is created.
  const [created, setCreated] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load(silent) {
    if (silent !== true) setLoading(true);
    try {
      const res = await api.get('/riders');
      setRiders(res.data);
      setError('');
    } catch (err) {
      if (silent !== true) setError(errMsg(err, 'Could not load riders.'));
    } finally {
      setLoading(false);
    }
  }

  useAutoRefresh(() => load(true), 10000);

  async function handleAdd(e) {
    e.preventDefault();
    setFormError('');
    setCreated(null);
    setSubmitting(true);
    try {
      const res = await api.post('/riders', { name, email });
      setCreated({
        name: res.data.name,
        email: res.data.email,
        tempPassword: res.data.tempPassword,
      });
      setName('');
      setEmail('');
      toast('Rider added.');
      load();
    } catch (err) {
      setFormError(errMsg(err, 'Could not add rider.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id) {
    const ok = await confirmDialog('Any deliveries currently assigned to them will be unassigned.', {
      title: 'Remove this rider?',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      await api.delete(`/riders/${id}`);
      toast('Rider removed.');
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not remove rider.'), { type: 'error' });
    }
  }

  return (
    <AppShell>
      <h1 className="page-title">Riders</h1>
      <p className="muted small" style={{ marginBottom: 20 }}>
        Add riders so you can hand off deliveries. Once assigned, a rider marks their own delivery Out for Delivery
        and Delivered — you don't have to.
      </p>

      {error && <div className="message error">{error}</div>}

      <form onSubmit={handleAdd} className="panel">
        <h3>Add a rider</h3>
        {formError && <div className="message error">{formError}</div>}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="riderName">Full name</label>
            <input
              id="riderName"
              required
              minLength={4}
              maxLength={80}
              placeholder="e.g. Juan Dela Cruz"
              title="First and last name, letters only"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="riderEmail">Email</label>
            <input id="riderEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <p className="muted small" style={{ marginBottom: 16 }}>
          A temporary password is made for the rider after you add them. They must set their own password the
          first time they log in.
        </p>
        <button type="submit" className="btn-solid" disabled={submitting}>
          {submitting && <Spinner light />}{submitting ? 'Adding...' : 'Add Rider'}
        </button>
      </form>

      <TempPasswordNotice created={created} onDone={() => setCreated(null)} />

      <div className="panel flush">
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonRows count={3} /></div>
        ) : riders.length === 0 ? (
          <p className="empty">No riders yet. Add your first one above.</p>
        ) : (
          <div className="row-list" style={{ padding: 16 }}>
            {riders.map((r) => (
              <div key={r.id} className={`row-item ${r.banned ? 'banned' : ''}`}>
                <div className="person">
                  <Avatar name={r.name} src={r.avatar} size={40} />
                  <div>
                    <strong>{r.name}</strong>
                    {r.banned && <span className="status-pill cancelled">banned by admin</span>}
                    <div className="muted small">{r.email}</div>
                    {r.mustChangePassword && (
                      <div className="muted small">Has not set their own password yet</div>
                    )}
                    {r.banned && r.banReason && <div className="small text-danger">Reason: {r.banReason}</div>}
                  </div>
                </div>
                <button className="btn-danger-outline small" onClick={() => handleRemove(r.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
