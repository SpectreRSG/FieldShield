/** Service-worker registration: shows when the app is ready offline or an update is available. */
import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW();
  if (!offlineReady && !needRefresh) return null;
  return (
    <div className="sw-prompt">
      <div className="toast" role="status">
        {needRefresh ? 'A new version of FieldShield is available. Your data is safe.' : 'FieldShield is ready to work offline.'}
        <div className="row" style={{ marginTop: 8 }}>
          {needRefresh && (
            <button className="btn small" onClick={() => updateServiceWorker(true)}>
              Update now
            </button>
          )}
          <button
            className="btn small"
            onClick={() => {
              setOfflineReady(false);
              setNeedRefresh(false);
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
