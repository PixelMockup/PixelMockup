import { useState, useEffect, useCallback, type RefObject } from 'react';
import type { Rect, TourPlacement, ArrowPosition } from '../types/tour';
import { tourArrow } from '../utils/tourArrow';

interface UseTourArrowProps {
    targetId: string;
    tooltipRef: RefObject<HTMLElement | null>;
    placement: TourPlacement;
    offset?: number;
}

interface UseTourArrowReturn {
    arrowStyle: ArrowPosition | null;
    targetRect: Rect | null;
    updatePosition: () => void;
}

export const useTourArrow = ({
    targetId,
    tooltipRef,
    placement,
    offset = 16, // Distance between target and tooltip
}: UseTourArrowProps): UseTourArrowReturn => {
    const [arrowStyle, setArrowStyle] = useState<ArrowPosition | null>(null);
    const [targetRect, setTargetRect] = useState<Rect | null>(null);

    const updatePosition = useCallback(() => {
        const targetElement = document.getElementById(targetId);
        const tooltipElement = tooltipRef.current;

        if (!targetElement || !tooltipElement) return;

        // Get fresh measurements
        const target = targetElement.getBoundingClientRect();
        const tooltip = tooltipElement.getBoundingClientRect();

        const targetRect: Rect = {
            x: target.x + window.scrollX,
            y: target.y + window.scrollY,
            width: target.width,
            height: target.height,
        };

        const tooltipRect: Rect = {
            x: tooltip.x + window.scrollX,
            y: tooltip.y + window.scrollY,
            width: tooltip.width,
            height: tooltip.height,
        };

        setTargetRect(targetRect);

        // Calculate arrow position
        const arrow = tourArrow.calculate(targetRect, tooltipRect, placement);
        setArrowStyle(arrow);

        // Position tooltip near target (if not already done)
        positionTooltip(targetElement, tooltipElement, placement, offset);
    }, [targetId, placement, offset, tooltipRef]);

    const positionTooltip = (
        target: HTMLElement,
        tooltip: HTMLElement,
        placement: TourPlacement,
        offset: number
    ) => {
        const targetRect = target.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        let top = 0;
        let left = 0;

        switch (placement) {
            case 'top':
                top = targetRect.top - tooltipRect.height - offset;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'bottom':
                top = targetRect.bottom + offset;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'left':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.left - tooltipRect.width - offset;
                break;
            case 'right':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.right + offset;
                break;
        }

        tooltip.style.position = 'absolute';
        tooltip.style.top = `${top + window.scrollY}px`;
        tooltip.style.left = `${left + window.scrollX}px`;
    };

    useEffect(() => {
        updatePosition();

        // Recalculate on resize/scroll
        const handleUpdate = () => requestAnimationFrame(updatePosition);

        window.addEventListener('resize', handleUpdate);
        window.addEventListener('scroll', handleUpdate, true);

        return () => {
            window.removeEventListener('resize', handleUpdate);
            window.removeEventListener('scroll', handleUpdate, true);
        };
    }, [updatePosition]);

    return { arrowStyle, targetRect, updatePosition };
};