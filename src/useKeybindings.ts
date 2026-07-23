import { useEffect, useRef } from 'react';
import {
  detectPlatform,
  findActionForEvent,
  isTypingTarget,
  type BindingMap,
  type KeyActionId,
  type PlatformId,
} from './keybindings';

export type KeyActionHandlers = Partial<Record<KeyActionId, () => void>>;

/**
 * Listen for keyboard shortcuts. Pass the current platform binding map
 * and handlers keyed by action id.
 */
export function useKeybindings(
  bindings: BindingMap,
  handlers: KeyActionHandlers,
  options: {
    platform?: PlatformId;
    enabled?: boolean;
  } = {},
): void {
  const platform = options.platform ?? detectPlatform();
  const enabled = options.enabled !== false;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.defaultPrevented) return;

      const action = findActionForEvent(e, bindings, platform);
      if (!action) return;
      const handler = handlersRef.current[action];
      if (!handler) return;

      e.preventDefault();
      handler();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bindings, platform, enabled]);
}
