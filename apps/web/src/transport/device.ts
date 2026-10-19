/**
 * The device events a socket can't see for itself. Back in view (a phone unlocked, a
 * laptop opened) a socket may look open but be dead; back online, a pending backoff is
 * just wasted time. Returns the unsubscribe. A no-op outside a browser.
 */
export function watchDevice(on: { visible: () => void; online: () => void }): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      on.visible();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', on.online);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', on.online);
  };
}
