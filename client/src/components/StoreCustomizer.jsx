import { useRef, useState } from 'react';
import api, { mediaUrl } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { errMsg } from '../utils/format';
import { uploadImage, IMAGE_ACCEPT } from '../utils/image';
import { ACCENT_COLORS, accentBackground } from '../utils/storeTheme';
import StoreAvatar from './StoreAvatar';
import Spinner from './Spinner';

const MAX_GALLERY = 6;

// Owner-only panel: logo, cover banner, photo gallery, accent color, opening hours.
export default function StoreCustomizer({ store }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const logoRef = useRef(null);
  const coverRef = useRef(null);
  const galleryRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [accent, setAccent] = useState(store.accentColor || '');
  const [hours, setHours] = useState(store.openingHours || '');

  const gallery = store.gallery || [];

  async function run(key, fn, okMsg) {
    setBusy(key);
    try {
      await fn();
      await refresh();
      if (okMsg) toast(okMsg);
    } catch (err) {
      toast(err.response ? errMsg(err) : err.message, { type: 'error' });
    } finally {
      setBusy('');
    }
  }

  const pick = (ref, key, path, opts, okMsg) => (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) run(key, () => uploadImage(path, file, opts), okMsg);
  };

  const saveLook = (e) => {
    e.preventDefault();
    run('look', () => api.patch('/store/profile', { accentColor: accent, openingHours: hours }), 'Store look saved.');
  };

  return (
    <div className="panel customizer">
      <h3>Customize your store</h3>
      <p className="muted small">Add your branding so customers recognize you. Changes show up on your store page right away.</p>

      {/* live preview */}
      <div className="store-preview">
        <div className="store-preview-cover" style={store.cover ? undefined : accentBackground(accent)}>
          {store.cover && <img src={mediaUrl(store.cover)} alt="" />}
        </div>
        <div className="store-preview-body">
          <StoreAvatar name={store.name} logo={store.logo} accentColor={accent} big />
          <div>
            <strong>{store.name}</strong>
            <div className="muted small">{hours ? `🕒 ${hours}` : 'Add your opening hours below'}</div>
          </div>
        </div>
      </div>

      <div className="customizer-row">
        <div>
          <strong className="small">Store logo</strong>
          <div className="muted small">Square works best. Shown on store cards.</div>
        </div>
        <div className="customizer-actions">
          <button className="btn-ghost small" disabled={!!busy} onClick={() => logoRef.current?.click()}>
            {busy === 'logo' && <Spinner />}{store.logo ? 'Change' : 'Upload'}
          </button>
          {store.logo && (
            <button className="link-btn" disabled={!!busy} onClick={() => run('logo', () => api.delete('/store/logo'), 'Logo removed.')}>Remove</button>
          )}
          <input ref={logoRef} type="file" accept={IMAGE_ACCEPT} hidden
            onChange={pick(logoRef, 'logo', '/store/logo', { square: true, maxWidth: 512, maxHeight: 512 }, 'Logo updated.')} />
        </div>
      </div>

      <div className="customizer-row">
        <div>
          <strong className="small">Cover photo</strong>
          <div className="muted small">Wide banner at the top of your store page.</div>
        </div>
        <div className="customizer-actions">
          <button className="btn-ghost small" disabled={!!busy} onClick={() => coverRef.current?.click()}>
            {busy === 'cover' && <Spinner />}{store.cover ? 'Change' : 'Upload'}
          </button>
          {store.cover && (
            <button className="link-btn" disabled={!!busy} onClick={() => run('cover', () => api.delete('/store/cover'), 'Cover removed.')}>Remove</button>
          )}
          <input ref={coverRef} type="file" accept={IMAGE_ACCEPT} hidden
            onChange={pick(coverRef, 'cover', '/store/cover', { maxWidth: 1600, maxHeight: 900 }, 'Cover updated.')} />
        </div>
      </div>

      <div className="customizer-block">
        <strong className="small">Store photos ({gallery.length}/{MAX_GALLERY})</strong>
        <div className="muted small">Show your shop, stock or delivery vehicles.</div>
        <div className="gallery-grid">
          {gallery.map((id) => (
            <div key={id} className="gallery-item">
              <img src={mediaUrl(id)} alt="" loading="lazy" />
              <button
                type="button"
                className="gallery-remove"
                aria-label="Remove photo"
                disabled={!!busy}
                onClick={() => run(`g${id}`, () => api.delete(`/store/gallery/${id}`), 'Photo removed.')}
              >✕</button>
            </div>
          ))}
          {gallery.length < MAX_GALLERY && (
            <button type="button" className="gallery-add" disabled={!!busy} onClick={() => galleryRef.current?.click()}>
              {busy === 'gallery' ? <Spinner /> : '＋'}<span>Add photo</span>
            </button>
          )}
          <input ref={galleryRef} type="file" accept={IMAGE_ACCEPT} hidden
            onChange={pick(galleryRef, 'gallery', '/store/gallery', { maxWidth: 1280, maxHeight: 1280 }, 'Photo added.')} />
        </div>
      </div>

      <form className="customizer-block" onSubmit={saveLook}>
        <strong className="small">Look &amp; hours</strong>
        <div className="swatch-row" role="radiogroup" aria-label="Accent color">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c || 'default'}
              type="button"
              role="radio"
              aria-checked={accent === c}
              aria-label={c || 'Default'}
              className={`swatch ${accent === c ? 'selected' : ''}`}
              style={accentBackground(c) || undefined}
              onClick={() => setAccent(c)}
            >
              {!c && <span className="swatch-default">Aa</span>}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="hours">Opening hours</label>
          <input id="hours" maxLength={120} placeholder="e.g. Mon–Sat 7:00 AM – 7:00 PM" value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
        <button className="btn-solid small" disabled={!!busy}>{busy === 'look' ? 'Saving...' : 'Save look & hours'}</button>
      </form>
    </div>
  );
}
