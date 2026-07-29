import { useEffect, useState } from 'react';
import MockupStudio from './MockupStudio';
import MobileWarning from './MobileWarning';
import ProductTour from './ProductTour';
import ProgressLoader from './ProgressLoader';
import { useTourSeen } from './useTourSeen';
import { useDeviceLibrary } from './useDeviceLibrary';

const log = (
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown> = {},
  runId = 'initial',
) => {
  // #region agent log
  fetch('http://127.0.0.1:7612/ingest/24908c0c-1698-435b-8c6e-d81408b3f4b6', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '741bd0',
    },
    body: JSON.stringify({
      sessionId: '741bd0',
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
};

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
  const {
    groupedLibrary,
    categories,
    loadedCategories,
    isLoading,
    progress,
    loadLibrary,
    loadCategory,
    loadCategoriesForPreset,
  } = useDeviceLibrary();

  useEffect(() => {
    if (ready && !seen) {
      setTourOpen(true);
    }
  }, [ready, seen]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const closeTour = () => {
    setTourOpen(false);
    markSeen();
  };

  // #region agent log
  if (isLoading) {
    log('H5', 'App.tsx:55', 'App showing full-screen loader', {
      progress,
      loadedCategoriesCount: loadedCategories.size,
    });
  }
  // #endregion

  return (
    <>
      {isLoading ? (
        <div className="ms-progress-loader-overlay">
          <ProgressLoader
            progress={progress}
            messages={[
              'Loading device catalog...',
              'Preparing mock phones...',
              'Arranging workspace...',
              'Almost ready...',
            ]}
          />
        </div>
      ) : null}
      <MockupStudio
        groupedLibrary={groupedLibrary}
        categories={categories}
        loadedCategories={loadedCategories}
        libraryLoading={isLoading}
        libraryProgress={progress}
        onLoadLibrary={loadLibrary}
        onLoadCategory={loadCategory}
        onLoadCategoriesForPreset={loadCategoriesForPreset}
        onTakeTour={() => {
          reset();
          setTourOpen(true);
        }}
      />
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
