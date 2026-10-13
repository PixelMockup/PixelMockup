export interface Position {
    x: number;
    y: number;
}

export interface Dimensions {
    width: number;
    height: number;
}

export interface Rect extends Position, Dimensions { }

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'auto';

export interface ArrowConfig {
    size: number;
    color: string;
}

export interface ArrowPosition {
    position: 'absolute';
    top?: number;
    left?: number;
    right?: number;
    bottom?: number;
    transform?: string;
    borderWidth: number;
    borderStyle: 'solid';
    borderColor: string;
    borderBottomWidth?: number;
    borderTopWidth?: number;
    borderLeftWidth?: number;
    borderRightWidth?: number;
    width: 0;
    height: 0;
}