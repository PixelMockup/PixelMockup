import { useEffect, useRef, useState } from 'react';
import { captureOne, describeCaptureError } from './captureWebsite';
import type { WebsiteViewport } from './websiteUrl';

interface WebsiteScreenProps {
  url: string;
  viewport: WebsiteViewport;
  title: string;
}

type ScreenState =
  | { status: 'loading' }
  | { status: 'ready'; src: string }
  | { status: 'error'; message: string };

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
}: WebsiteScreenProps) {
  const [state, setState] = useState<ScreenState>({ status: 'loading' });

  const latestRef = useRef(0);

  useEffect(() => {
    const token = latestRef.current + 1;
    latestRef.current = token;
    setState({ status: 'loading' });

    const timer = window.setTimeout(() => {
      captureOne(url, viewport.width, viewport.height)
        .then((src) => {
          if (latestRef.current === token) setState({ status: 'ready', src });
        })
        .catch((err) => {
          if (latestRef.current === token) {
            setState({ status: 'error', message: describeCaptureError(err) });
          }
        });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [url, viewport.width, viewport.height]);

  return (
    <div className="ms-canvas-item__website">
      {state.status === 'ready' ? (
        <img
          src={state.src}
          alt={title}
          draggable={false}
          className="ms-canvas-item__website-img"
        />
      ) : state.status === 'loading' ? (
        <div className="ms-canvas-item__website-hint" role="status">
          Loading site…
        </div>
      ) : (
        <div className="ms-canvas-item__website-hint" role="status">
          {state.message}
        </div>
      )}
    </div>
  );
}
