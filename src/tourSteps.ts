export type TourStepId =
  | 'welcome'
  | 'devices'
  | 'layouts'
  | 'canvas_settings'
  | 'settings'
  | 'website'
  | 'arrange'
  | 'download';

export type Placement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export type TourStep = {
  id: TourStepId;
  title: string;
  body: string;
  /** CSS selector for the element to highlight. */
  target: string;
  /** Fallback selector if the primary target is not in the DOM. */
  fallback?: string;
  /** Tooltip position relative to the target. */
  placement: Placement;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Pixel Mockup',
    body: 'This is your canvas. You will arrange phone and laptop mockups here to create a beautiful screenshot.',
    target: '.ms-stage',
    placement: 'center',
  },
  {
    id: 'devices',
    title: 'Add a device',
    body: 'Tap the Devices button to open the library, then tap any phone or laptop to place it on your canvas.',
    target: '.ms-rail-devices',
    fallback: '.ms-mobile-dock__btn[aria-label="Devices"]',
    placement: 'bottom',
  },
  {
    id: 'layouts',
    title: 'Add a layouts',
    body: 'Tap the Devices button to open the library, then tap any phone or laptop to place it on your canvas.',
    target: '.ms-rail-layouts',
    fallback: '.ms-mobile-dock__btn[aria-label="Layouts"]',
    placement: 'bottom',
  },
  {
    id: 'canvas_settings',
    title: 'Canvas Settings',
    body: 'Tap the Devices button to open the library, then tap any phone or laptop to place it on your canvas.',
    target: '.ms-rail-canvas-settings',
    fallback: '.ms-mobile-dock__btn[aria-label="Canvas_Settings"]',
    placement: 'bottom',
  },
  {
    id: 'settings',
    title: 'Settings',
    body: 'Tap the Devices button to open the library, then tap any phone or laptop to place it on your canvas.',
    target: '.ms-rail-settings',
    fallback: '.ms-mobile-dock__btn[aria-label="Settings"]',
    placement: 'top',
  },
  {
    id: 'website',
    title: 'Show a website',
    body: 'Paste a web address like google.com and tap Apply. The website will appear on every device screen.',
    target: '.ms-sr-only',
    fallback: '.ms-mobile-dock__btn[aria-label="Website URL"]',
    placement: 'bottom',
  },
  {
    id: 'arrange',
    title: 'Arrange your scene',
    body: 'Drag a device to move it. Use the toolbar to line devices up, change their order, or resize the canvas.',
    target: '.ms-artboard',
    placement: 'center',
  },
  {
    id: 'download',
    title: 'Save your mockup',
    body: 'Happy with how it looks? Tap the Download button to save your scene as an image.',
    target: '.ms-btn--download',
    fallback: '.ms-mobile-dock__btn--accent',
    placement: 'bottom',
  },
];

export function findTarget(step: TourStep): HTMLElement | null {
  let el = document.querySelector(step.target) as HTMLElement | null;
  if (el && step.target === '.ms-sr-only') {
    const label = el as HTMLLabelElement;
    if (label.htmlFor) {
      el = document.getElementById(label.htmlFor) as HTMLElement | null;
    }
  }
  if (!el && step.fallback) {
    el = document.querySelector(step.fallback) as HTMLElement | null;
  }
  return el;
}
