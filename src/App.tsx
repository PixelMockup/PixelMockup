import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import MobileWarning from './MobileWarning';
import ProductTour from './ProductTour';
import ProgressLoader from './ProgressLoader';
import { useTourSeen } from './useTourSeen';
import { useDeviceLibrary } from './useDeviceLibrary';

const MockupStudio = lazy(() => import('./MockupStudio'));

export interface DeviceItem {
  path: string;
  src: string;
  name: string | undefined;
  category: string;
  /** Catalog file key, e.g. phones/Apple iPhone 11 Black.svg */
  catalogFile: string;
  modelKey: string;
  widthMm: number | undefined;
  heightMm: number | undefined;
  brand: string;
  productFamily: string;
}

function App() {
  const { seen, ready, markSeen, reset } = useTourSeen();
  const [tourOpen, setTourOpen] = useState(false);
  /** Keep shell visible from first React paint until priority assets finish. */
  const [bootShellVisible, setBootShellVisible] = useState(true);
  const priorityBootStarted = useRef(false);
  const {
    groupedLibrary,
    categories,
    loadedCategories,
    loadingDevicePaths,
    isLoading,
    progress,
    statusMessage,
    loadPriorityLibrary,
    loadCategory,
    loadDevice,
    loadCategoriesForPreset,
  } = useDeviceLibrary();

  const showBootOverlay = bootShellVisible || isLoading;

  useEffect(() => {
    if (ready && !seen) {
      setTourOpen(true);
    }
  }, [ready, seen]);

  useEffect(() => {
    if (priorityBootStarted.current) return;
    priorityBootStarted.current = true;
    void loadPriorityLibrary().finally(() => {
      setBootShellVisible(false);
    });
  }, [loadPriorityLibrary]);

  const closeTour = () => {
    setTourOpen(false);
    markSeen();
  };

  return (
    <>
      {showBootOverlay ? (
        <div className="ms-progress-loader-overlay">
          <ProgressLoader
            progress={progress}
            activeMessage={statusMessage ?? undefined}
            messages={[
              'Loading popular devices...',
              'Almost ready...',
            ]}
          />
        </div>
      ) : null}
      <Suspense fallback={null}>
        <MockupStudio
          groupedLibrary={groupedLibrary}
          categories={categories}
          loadedCategories={loadedCategories}
          loadingDevicePaths={loadingDevicePaths}
          libraryLoading={isLoading}
          libraryProgress={progress}
          libraryStatusMessage={statusMessage}
          onLoadCategory={loadCategory}
          onLoadDevice={loadDevice}
          onLoadCategoriesForPreset={loadCategoriesForPreset}
          onTakeTour={() => {
            reset();
            setTourOpen(true);
          }}
        />
      </Suspense>
      <MobileWarning />
      <ProductTour
        open={tourOpen}
        onClose={closeTour}
        onComplete={closeTour}
      />
    </>
  );
}

export default App;
