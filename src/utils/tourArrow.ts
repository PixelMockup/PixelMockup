import type { Rect, TourPlacement, ArrowConfig, ArrowPosition } from '../types/tour';

export class TourArrowEngine {
    private config: ArrowConfig;

    constructor(config: ArrowConfig = { size: 8, color: '#ffffff' }) {
        this.config = config;
    }

    /**
     * Calculates CSS properties for the arrow based on tooltip placement
     */
    calculate(
        targetRect: Rect,
        tooltipRect: Rect,
        placement: TourPlacement
    ): ArrowPosition {
        const { size, color } = this.config;
        const base: ArrowPosition = {
            position: 'absolute',
            width: 0,
            height: 0,
            borderStyle: 'solid',
            borderWidth: size,
            borderColor: 'transparent',
        };

        switch (placement) {
            case 'top': // Tooltip above target, arrow points down
                return {
                    ...base,
                    bottom: -size,
                    left: (tooltipRect.width / 2) - size,
                    borderColor: color,
                    borderBottomWidth: 0,
                };

            case 'bottom': // Tooltip below target, arrow points up
                return {
                    ...base,
                    top: -size,
                    left: (tooltipRect.width / 2) - size,
                    borderColor: color,
                    borderTopWidth: 0,
                };

            case 'left': // Tooltip left of target, arrow points right
                return {
                    ...base,
                    right: -size,
                    top: (tooltipRect.height / 2) - size,
                    borderColor: color,
                    borderRightWidth: 0,
                };

            case 'right': // Tooltip right of target, arrow points left
                return {
                    ...base,
                    left: -size,
                    top: (tooltipRect.height / 2) - size,
                    borderColor: color,
                    borderLeftWidth: 0,
                };

            case 'auto':
            default:
                // Auto-detect based on viewport space
                return this.calculateAuto(targetRect, tooltipRect);
        }
    }

    private calculateAuto(target: Rect, tooltip: Rect): ArrowPosition {
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight,
        };

        // Calculate available space
        const spaces = {
            top: target.y,
            bottom: viewport.height - (target.y + target.height),
            left: target.x,
            right: viewport.width - (target.x + target.width),
        };

        // Find placement with most space
        const bestPlacement = (Object.entries(spaces) as [TourPlacement, number][])
            .sort(([, a], [, b]) => b - a)[0][0];

        return this.calculate(target, tooltip, bestPlacement);
    }

    /**
     * Alternative: CSS transform approach (better for animations)
     */
    calculateTransform(
        _targetRect: Rect,
        tooltipRect: Rect,
        placement: TourPlacement
    ): { transform: string; position: 'absolute' } {
        const { size } = this.config;

        // Base rotation for each placement (arrow points up by default)
        const rotations: Record<TourPlacement, number> = {
            top: 180,    // Point down
            bottom: 0,   // Point up
            left: 90,    // Point right
            right: -90,  // Point left
            auto: 0,
        };

        const positions: Record<TourPlacement, { x: number; y: number }> = {
            top: { x: tooltipRect.width / 2, y: 0 },
            bottom: { x: tooltipRect.width / 2, y: tooltipRect.height },
            left: { x: 0, y: tooltipRect.height / 2 },
            right: { x: tooltipRect.width, y: tooltipRect.height / 2 },
            auto: { x: tooltipRect.width / 2, y: 0 },
        };

        const pos = positions[placement];
        const rotation = rotations[placement];

        return {
            position: 'absolute',
            transform: `translate(${pos.x - size}px, ${pos.y - size}px) rotate(${rotation}deg)`,
        };
    }
}

// Singleton instance for app-wide use
export const tourArrow = new TourArrowEngine({ size: 8, color: '#3b82f6' });