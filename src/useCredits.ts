import { useCallback, useState } from 'react';

export interface CreditState {
  screenshotapi: number | null;
  microlink: number | null;
}

export function useCredits() {
  const [credits, setCredits] = useState<CreditState>({
    screenshotapi: null,
    microlink: null,
  });

  const updateCredits = useCallback(
    (provider: string, remaining: number | null) => {
      if (provider === 'screenshotapi') {
        setCredits((prev) => ({ ...prev, screenshotapi: remaining }));
      } else if (provider === 'microlink') {
        setCredits((prev) => ({ ...prev, microlink: remaining }));
      }
    },
    [],
  );

  return { credits, updateCredits };
}
