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
 * Website on a device screen: Playwright screenshot or cloud provider capture.
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
            <span>
              {state.notice.kind === 'unreachable_server'
                ? 'Capture unavailable — upload a screenshot'
                : 'Couldn\'t load this site'}
            </span>
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
