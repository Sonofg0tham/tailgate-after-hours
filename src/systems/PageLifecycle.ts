/**
 * Releases page-owned resources only when the document is genuinely leaving.
 * A persisted pagehide means the browser is storing the live page in its
 * back-forward cache, so disposing here would restore a broken game on return.
 */
export function disposeOnFinalPageHide(target: Window, dispose: () => void): void {
  let disposed = false;
  target.addEventListener('pagehide', (event: PageTransitionEvent) => {
    if (!event.persisted && !disposed) {
      disposed = true;
      dispose();
    }
  });
}
