import { useEffect, useRef, useState } from 'react';
import {
  captureOne,
  classifyCaptureError,
  isCaptureAbortError,
  type CaptureNotice,
} from './captureWebsite';
import type { WebsitePreviewMode } from './useWebsitePreviewMode';
import {
  probeProxyAvailable,
  buildProxyUrl,
} from './websiteProxy';
import type { WebsiteViewport } from './websiteUrl';

interface WebsiteScreenProps {
  url: string;
  viewport: WebsiteViewport;
  title: string;
  /** screenshot = Playwright capture; iframe = live embed (static hosts). */
  previewMode?: WebsitePreviewMode;
  /** Called once per URL when capture fails (for a styled notice dialog). */
  onCaptureFailed?: (notice: CaptureNotice) => void;
  /** Opens the full guidance dialog from the inline hint. */
  onRequestDetails?: (notice: CaptureNotice) => void;
  /** Switch settings to live iframe preview (e.g. when capture server is missing). */
  onSwitchToIframe?: () => void;
}

type ScreenState =
  | { status: 'loading' }
  | { status: 'ready'; src: string }
  | { status: 'error'; notice: CaptureNotice }
  | { status: 'iframe' };

const DEBOUNCE_MS = 300;
const SLOW_LOAD_MS = 12_000;

/**
 * Website on a device screen: Playwright screenshot (default) or live iframe.
 * Iframes use pointer-events: none so canvas drag is not trapped.
 */
export default function WebsiteScreen({
  url,
  viewport,
  title,
  previewMode = 'screenshot',
  onCaptureFailed,
  onRequestDetails,
  onSwitchToIframe,
}: Readonly<WebsiteScreenProps>) {
  const [state, setState] = useState<ScreenState>(
    previewMode === 'iframe' ? { status: 'iframe' } : { status: 'loading' },
  );
  const [proxyAvailable, setProxyAvailable] = useState<boolean | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  /** Auto-hide the loading bar after the slow-load timeout so heavy sites
   *  show their progressive rendering instead of a full-screen bar. */
  const [barHidden, setBarHidden] = useState(false);
  /** Load progress reported by the proxied page itself (postMessage). */
  const [siteProgress, setSiteProgress] = useState<{
    pct: number;
    phase: string;
  } | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const latestRef = useRef(0);
  const reportedUrlRef = useRef<string | null>(null);
  const onCaptureFailedRef = useRef(onCaptureFailed);
  onCaptureFailedRef.current = onCaptureFailed;

  useEffect(() => {
    if (previewMode === 'iframe') {
      setState({ status: 'iframe' });
      return;
    }

    const token = latestRef.current + 1;
    latestRef.current = token;
    setState({ status: 'loading' });
    reportedUrlRef.current = null;

    const timer = window.setTimeout(() => {
      captureOne(url, viewport.width, viewport.height)
        .then((src) => {
          if (latestRef.current !== token) return;
          setState({ status: 'ready', src });
        })
        .catch((err) => {
          if (latestRef.current !== token) return;
          if (isCaptureAbortError(err)) return;
          const notice = classifyCaptureError(err);
          setState({ status: 'error', notice });
          if (reportedUrlRef.current !== url) {
            reportedUrlRef.current = url;
            onCaptureFailedRef.current?.(notice);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [url, viewport.width, viewport.height, previewMode]);

  useEffect(() => {
    if (previewMode !== 'iframe') {
      setProxyAvailable(null);
      return;
    }
    let cancelled = false;
    void probeProxyAvailable().then((ok) => {
      if (!cancelled) setProxyAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [previewMode]);

  // Per-device loading bar: reset on URL / src changes, auto-hide after a
  // while so blocked or slow sites don't spin behind a full-screen bar.
  useEffect(() => {
    setIframeLoaded(false);
    setBarHidden(false);
    setSiteProgress(null);
    if (previewMode !== 'iframe') return;
    const timer = window.setTimeout(() => setBarHidden(true), SLOW_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [url, previewMode, proxyAvailable]);

  // The proxied page reports its own load progress via postMessage; only
  // accept messages that come from this device's frame.
  useEffect(() => {
    if (previewMode !== 'iframe') return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as
        | { marker?: unknown; pct?: unknown; phase?: unknown }
        | null;
      if (!data || data.marker !== '__msSiteProgress') return;
      if (typeof data.pct !== 'number' || !Number.isFinite(data.pct)) return;
      setSiteProgress({
        pct: Math.max(0, Math.min(100, Math.round(data.pct))),
        phase: typeof data.phase === 'string' ? data.phase : 'parsing',
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [previewMode]);

  if (state.status === 'iframe') {
    // Optimistic: assume the proxy exists and start the proxied load right
    // away; fall back to the raw URL only if the probe says otherwise.
    const proxied = proxyAvailable !== false;
    return (
      <div className="ms-canvas-item__website ms-canvas-item__website--iframe">
        <iframe
          ref={frameRef}
          className="ms-canvas-item__website-frame"
          src={proxied ? buildProxyUrl(url) : url}
          title={title}
          sandbox="allow-scripts allow-forms allow-popups"
          referrerPolicy="no-referrer-when-downgrade"
          loading="lazy"
          onLoad={() => setIframeLoaded(true)}
        />
        {!iframeLoaded && !barHidden && (siteProgress?.pct ?? 0) < 100 ? (
          <div
            className="ms-canvas-item__website-loading"
            role="status"
            aria-live="polite"
          >
            <div
              className="ms-canvas-item__website-loading-track"
              aria-hidden="true"
            >
              <div
                className={
                  siteProgress
                    ? 'ms-canvas-item__website-loading-bar ms-canvas-item__website-loading-bar--determinate'
                    : 'ms-canvas-item__website-loading-bar'
                }
                style={
                  siteProgress ? { width: `${siteProgress.pct}%` } : undefined
                }
              />
              <span className="ms-canvas-item__website-loading-label">
                {siteProgress
                  ? `Loading site… ${siteProgress.pct}%`
                  : 'Loading site…'}
              </span>
            </div>
          </div>
        ) : null}
        <div className="ms-canvas-item__website-iframe-hint" aria-hidden="true">
          {proxied
            ? 'Live preview — some sites still break'
            : 'Live preview — some sites block embedding'}
        </div>
      </div>
    );
  }

  if (state.status === 'ready') {
    return (
      <div className="ms-canvas-item__website">
        <img
          src={state.src}
          alt={title}
          draggable={false}
          className="ms-canvas-item__website-img"
        />
      </div>
    );
  }

  return (
    <div className="ms-canvas-item__website">
      <div className="ms-canvas-item__website-hint">
        {state.status === 'loading' ? (
          <span>Loading site…</span>
        ) : (
          <>
            <span>
              {state.notice.kind === 'unreachable_server'
                ? 'Capture unavailable — upload a screenshot'
                : 'Couldn’t load this site'}
            </span>
            {state.notice.kind === 'unreachable_server' && onSwitchToIframe ? (
              <button
                type="button"
                className="ms-canvas-item__website-details"
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSwitchToIframe();
                }}
              >
                Use live iframe
              </button>
            ) : null}
            {onRequestDetails ? (
              <button
                type="button"
                className="ms-canvas-item__website-details"
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDetails(state.notice);
                }}
              >
                Details
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
