import { useState } from 'react';
import { mediaUrl } from '../api/axios';
import { accentBackground } from '../utils/storeTheme';

// Store logo, or the store's first letter on its accent color.
export default function StoreAvatar({ name = '', logo, accentColor, big = false }) {
  const [failed, setFailed] = useState(false);
  const showImg = logo && !failed;
  return (
    <div className={`store-avatar ${big ? 'big' : ''}`} style={showImg ? undefined : accentBackground(accentColor)}>
      {showImg ? (
        <img src={mediaUrl(logo)} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        String(name).charAt(0).toUpperCase()
      )}
    </div>
  );
}
