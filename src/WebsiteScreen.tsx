import { useEffect, useRef, useState } from 'react';
import {
  captureOne,
  classifyCaptureError,
  isCaptureAbortError,
  type CaptureNotice,
} from './captureWebsite';
import type { WebsiteViewport } from './websiteUrl';

interface WebsiteScreenProps {
  url: string;
  viewport: WebsiteViewport;
  title: string;
  /** Called once per URL when capture fails (for a styled notice dialog). */
  onCaptureFailed?: (notice: CaptureNotice) => void;
  /** Opens the full guidance dialog from the inline hint. */
  onRequestDetails?: (notice: CaptureNotice) => void;
}

type ScreenState =
  | { status: 'loading' }
  | { status: 'ready'; src: string }
  | { status: 'error'; notice: CaptureNotice };

const DEBOUNCE_MS = 300;

/**
 * Server-rendered website screenshot, cover-fit into the clipped device
 * screen. Uses a static image (no iframe) so nothing on the canvas can trap
 * pointer input, and so every site renders (incl. sites that block framing).
 */
export default function WebsiteScreen({
  url,
  viewport,
  title,
  onCaptureFailed,
  onRequestDetails,
}: Readonly<WebsiteScreenProps>) {
  const [state, setState] = useState<ScreenState>({ status: 'loading' });
  const latestRef = useRef(0);
  const reportedUrlRef = useRef<string | null>(null);
  const onCaptureFailedRef = useRef(onCaptureFailed);
  onCaptureFailedRef.current = onCaptureFailed;

  useEffect(() => {
    const token = latestRef.current + 1;
    latestRef.current = token;
    setState({ status: 'loading' });
    reportedUrlRef.current = null;

    // #region agent log
    fetch('http://127.0.0.1:7612/ingest/24908c0c-1698-435b-8c6e-d81408b3f4b6', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '741bd0',
      },
      body: JSON.stringify({
        sessionId: '741bd0',
        location: 'WebsiteScreen.tsx:effect',
        message: 'effect start',
        data: {
          token,
          url,
          width: viewport.width,
          height: viewport.height,
          title,
        },
        timestamp: Date.now(),
        hypothesisId: 'H4',
      }),
    }).catch(() => {});
    // #endregion

    const timer = window.setTimeout(() => {
      captureOne(url, viewport.width, viewport.height)
        .then((src) => {
          if (latestRef.current !== token) {
            // #region agent log
            fetch(
              'http://127.0.0.1:7612/ingest/24908c0c-1698-435b-8c6e-d81408b3f4b6',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Debug-Session-Id': '741bd0',
                },
                body: JSON.stringify({
                  sessionId: '741bd0',
                  location: 'WebsiteScreen.tsx:stale',
                  message: 'stale discard',
                  data: {
                    token,
                    latest: latestRef.current,
                    url,
                    width: viewport.width,
                    height: viewport.height,
                    phase: 'resolve',
                  },
                  timestamp: Date.now(),
                  hypothesisId: 'H4',
                }),
              },
            ).catch(() => {});
            // #endregion
            return;
          }
          setState({ status: 'ready', src });
        })
        .catch((err) => {
          if (latestRef.current !== token) {
            // #region agent log
            fetch(
              'http://127.0.0.1:7612/ingest/24908c0c-1698-435b-8c6e-d81408b3f4b6',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Debug-Session-Id': '741bd0',
                },
                body: JSON.stringify({
                  sessionId: '741bd0',
                  location: 'WebsiteScreen.tsx:stale',
                  message: 'stale discard',
                  data: {
                    token,
                    latest: latestRef.current,
                    url,
                    width: viewport.width,
                    height: viewport.height,
                    phase: 'reject',
                  },
                  timestamp: Date.now(),
                  hypothesisId: 'H4',
                }),
              },
            ).catch(() => {});
            // #endregion
            return;
          }
          // Re-apply / cache clear aborts in-flight fetches — stay loading for
          // the new URL instead of showing a sticky timeout from the old one.
          if (isCaptureAbortError(err)) {
            // #region agent log
            fetch(
              'http://127.0.0.1:7612/ingest/24908c0c-1698-435b-8c6e-d81408b3f4b6',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Debug-Session-Id': '741bd0',
                },
                body: JSON.stringify({
                  sessionId: '741bd0',
                  location: 'WebsiteScreen.tsx:abort',
                  message: 'capture aborted; staying loading',
                  data: {
                    token,
                    url,
                    width: viewport.width,
                    height: viewport.height,
                  },
                  timestamp: Date.now(),
                  hypothesisId: 'H3',
                }),
              },
            ).catch(() => {});
            // #endregion
            return;
          }
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
  }, [url, viewport.width, viewport.height]);

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
            <span>Couldn’t load this site</span>
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
