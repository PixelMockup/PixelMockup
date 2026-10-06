import React, { useEffect, useRef } from 'react';
import LeaderLine from 'leader-line-new';

/* Registry so drag/pan handlers can trigger all lines at once */
const activeLines = new Set<LeaderLine>();

export function updateMockupConnectors() {
  activeLines.forEach((line) => line.position());
}

export interface MockupConnectorProps {
  startId: string;
  endId: string;
}

export const MockupConnector: React.FC<MockupConnectorProps> = ({
  startId,
  endId,
}) => {
  const lineRef = useRef<LeaderLine | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const startElem = document.getElementById(startId);
    const endElem = document.getElementById(endId);
    if (!startElem || !endElem) return;

    lineRef.current = new LeaderLine(startElem, endElem, {
      color: '#6366f1',
      size: 3,
      path: 'fluid',
      startPlug: 'disc',
      endPlug: 'arrow3',
      endPlugSize: 1.5,
      dash: { animation: true },
    });
    activeLines.add(lineRef.current);

    const handleResize = () => {
      lineRef.current?.position();
    };
    const handleScroll = () => {
      lineRef.current?.position();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
      if (lineRef.current) {
        activeLines.delete(lineRef.current);
        lineRef.current.remove();
        lineRef.current = null;
      }
    };
  }, [startId, endId]);

  return null;
};
