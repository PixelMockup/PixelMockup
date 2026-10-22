import React, { useRef } from 'react';
import { useTourArrow } from '../hooks/useTourArrow';
import type { TourPlacement } from '../types/tour';

interface TourTooltipProps {
    targetId: string;
    content: string;
    placement?: TourPlacement;
    visible: boolean;
    onClose: () => void;
}

export const TourTooltip: React.FC<TourTooltipProps> = ({
    targetId,
    content,
    placement = 'bottom',
    visible,
    onClose,
}) => {
    const tooltipRef = useRef<HTMLDivElement>(null);
    const { arrowStyle } = useTourArrow({
        targetId,
        tooltipRef,
        placement,
    });

    if (!visible) return null;

    return (
        <div
            ref={tooltipRef}
            className="tour-tooltip"
            style={{
                position: 'absolute',
                background: '#3b82f6',
                color: 'white',
                padding: '12px 16px',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                zIndex: 1000,
                maxWidth: '300px',
            }}
        >
            {/* Arrow element */}
            {arrowStyle && (
                <div
                    className="tour-arrow"
                    style={arrowStyle}
                    aria-hidden="true"
                />
            )}

            {/* Content */}
            <div className="tour-content">
                {content}
            </div>

            <button
                onClick={onClose}
                className="tour-close"
                style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                }}
            >
                ×
            </button>
        </div>
    );
};