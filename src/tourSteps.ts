export type TourStepId =
  | 'welcome'
  | 'devices'
  | 'more_settings'
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
  target?: string;
  /** CSS selector for the element to highlight in mobile view. */
  targetMobile?: string;
  /** Fallback selector if the primary target is not in the DOM. */
  fallback?: string;
  /** Tooltip position relative to the target (Desktop). */
  placement?: Placement;
  /** Tooltip position relative to the target (Mobile)*/
  placementMobile?: Placement;
  /** Hide this step on mobile viewports */
  hideOnMobile?: boolean;
  /** Hide this step on desktop viewports */
  hideOnDesktop?: boolean;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Pixel Mockup',
    body: 'This is your canvas. You will arrange phone and laptop mockups here to create a beautiful screenshot.',
    target: '.ms-stage-start',
    targetMobile: '.ms-mobile-devices',
    placement: 'center',
    placementMobile: 'center',
  },
  {
    id: 'devices',
    title: 'Add a device',
    body: 'Tap the Devices button to open the library, then tap any phone or laptop to place it on your canvas.',
    target: '.ms-rail-devices',
    targetMobile: '.ms-mobile-devices',
    fallback: '.ms-mobile-dock__btn[aria-label="Devices"]',
    placement: 'right',
    placementMobile: 'top',
  },
  {
    id: 'more_settings',
    title: 'More',
    body: 'In here there are settings for the canvas, layout and export',
    targetMobile: '.ms-mobile-more',
    fallback: '.ms-mobile-dock__btn[aria-label="More"]',
    placementMobile: 'top',
    hideOnDesktop: true,
  },
  {
    id: 'layouts',
    title: 'Add a layouts',
    body: 'Tap the Devices button to open the library, then tap any phone or laptop to place it on your canvas.',
    target: '.ms-rail-layouts',
    fallback: '.ms-mobile-dock__btn[aria-label="Layouts"]',
    placement: 'right',
    hideOnMobile: true,
  },
  {
    id: 'canvas_settings',
    title: 'Canvas Settings',
    body: 'Tap the Devices button to open the library, then tap any phone or laptop to place it on your canvas.',
    target: '.ms-rail-canvas-settings',
    fallback: '.ms-mobile-dock__btn[aria-label="Canvas_Settings"]',
    placement: 'right',
    placementMobile: 'top',
    hideOnMobile: true,
  },
  {
    id: 'settings',
    title: 'Settings',
    body: 'Tap the Devices button to open the library, then tap any phone or laptop to place it on your canvas.',
    target: '.ms-rail-settings',
    targetMobile: '.ms-mobile-settings',
    fallback: '.ms-mobile-dock__btn[aria-label="Settings"]',
    placement: 'top',
    placementMobile: 'top',
  },
  {
    id: 'website',
    title: 'Show a website',
    body: 'Paste a web address like google.com and tap Apply. The website will appear on every device screen.',
    target: '.ms-sr-only',
    targetMobile: 'ms-mobile-devices',
    fallback: '.ms-mobile-dock__btn[aria-label="Website URL"]',
    placement: 'bottom',
    placementMobile: 'top',
  },
  {
    id: 'arrange',
    title: 'Arrange your scene',
    body: 'Drag a device to move it. Use the toolbar to line devices up, change their order, or resize the canvas.',
    target: '.ms-artboard',
    targetMobile: 'ms-mobile-devices',
    placement: 'center',
    placementMobile: 'center',
  },
  {
    id: 'download',
    title: 'Save your mockup',
    body: 'Happy with how it looks? Tap the Download button to save your scene as an image.',
    target: '.ms-btn--download',
    targetMobile: 'ms-mobile-devices',
    fallback: '.ms-mobile-dock__btn--accent',
    placement: 'bottom',
    placementMobile: 'bottom',
  },
];

export function findTarget(step: TourStep): HTMLElement | null {
  let el = step.target ? document.querySelector(step.target) as HTMLElement | null : null;

  // Check if the element is missing or hidden from view
  let isHidden = el && (el as HTMLElement).offsetParent === null;

  // If missing or hidden, use the mobile fallback
  if ((!el || isHidden) && step.fallback) {
    el = document.querySelector(step.fallback) as HTMLElement | null;
  }

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

export function getVisibleTourSteps(): readonly TourStep[] {
  if (typeof window === 'undefined') return TOUR_STEPS;
  const isMobile = window.innerWidth < 768;
  return TOUR_STEPS.filter((s) => {
    if (s.hideOnMobile && isMobile) return false;
    if (s.hideOnDesktop && !isMobile) return false;
    return true;
  });
}
