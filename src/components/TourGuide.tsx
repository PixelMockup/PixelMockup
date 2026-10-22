import React, { useState } from 'react';
import { TourTooltip } from './TourTooltip';

interface TourStep {
    targetId: string;
    content: string;
    placement?: 'top' | 'bottom' | 'left' | 'right';
}

const tourSteps: TourStep[] = [
    { targetId: 'header-logo', content: 'This is our logo', placement: 'bottom' },
    { targetId: 'search-bar', content: 'Search here', placement: 'top' },
    { targetId: 'user-profile', content: 'Your profile settings', placement: 'left' },
];

export const TourGuide: React.FC = () => {
    const [currentStep, setCurrentStep] = useState(0);
    const [isActive, setIsActive] = useState(true);

    const handleNext = () => {
        if (currentStep < tourSteps.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            setIsActive(false);
        }
    };

    if (!isActive) return null;

    const step = tourSteps[currentStep];

    return (
        <>
            {/* Overlay */}
            <div
                className="tour-overlay"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    zIndex: 999,
                }}
                onClick={() => setIsActive(false)}
            />

            {/* Tooltip with arrow */}
            <TourTooltip
                targetId={step.targetId}
                content={step.content}
                placement={step.placement}
                visible={true}
                onClose={() => setIsActive(false)}
            />

            {/* Navigation controls */}
            <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1001 }}>
                <button onClick={handleNext}>
                    {currentStep === tourSteps.length - 1 ? 'Finish' : 'Next'}
                </button>
            </div>
        </>
    );
};