import { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import type { DeviceItem } from './App'; // Import the type from App.tsx

// Define what props this component expects to receive
interface MockupStudioProps {
    groupedLibrary: Record<string, DeviceItem[]>;
}

export default function MockupStudio({ groupedLibrary }: MockupStudioProps) {
    const [canvasItems, setCanvasItems] = useState<any[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [dragInfo, setDragInfo] = useState({ id: null as string | null, offsetX: 0, offsetY: 0 });

    const canvasRef = useRef<HTMLDivElement>(null);

    // --- 1. ADDING TO CANVAS ---
    const handleAddToCanvas = (item: DeviceItem) => {
        const newItem = {
            ...item,
            instanceId: crypto.randomUUID(),
            x: 50,
            y: 50,
            zIndex: canvasItems.length + 1
        };
        setCanvasItems([...canvasItems, newItem]);
        setSelectedId(newItem.instanceId);
    };

    // --- 2. DRAGGING MECHANICS ---
    const handlePointerDown = (e: React.PointerEvent, item: any) => {
        e.preventDefault();
        setDragInfo({
            id: item.instanceId,
            offsetX: e.clientX - item.x,
            offsetY: e.clientY - item.y
        });
        setSelectedId(item.instanceId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragInfo.id) return;
        setCanvasItems((prev) => prev.map((item) =>
            item.instanceId === dragInfo.id
                ? { ...item, x: e.clientX - dragInfo.offsetX, y: e.clientY - dragInfo.offsetY }
                : item
        ));
    };

    const handlePointerUp = () => {
        setDragInfo({ id: null, offsetX: 0, offsetY: 0 });
    };

    // --- 3. Z-INDEX CONTROLS ---
    const bringForward = () => {
        if (!selectedId) return;
        setCanvasItems((prev) => prev.map((item) =>
            item.instanceId === selectedId ? { ...item, zIndex: item.zIndex + 1 } : item
        ));
    };

    const pushBackward = () => {
        if (!selectedId) return;
        setCanvasItems((prev) => prev.map((item) =>
            item.instanceId === selectedId ? { ...item, zIndex: Math.max(0, item.zIndex - 1) } : item
        ));
    };

    // --- 4. DOWNLOAD CANVAS ---
    const downloadCanvas = async () => {
        if (!canvasRef.current) return;

        const currentSelection = selectedId;
        setSelectedId(null);

        setTimeout(async () => {
            // Add standard typing checks for html2canvas
            if (canvasRef.current) {
                const canvas = await html2canvas(canvasRef.current, { backgroundColor: null });
                const imageURL = canvas.toDataURL('image/png');

                const link = document.createElement('a');
                link.href = imageURL;
                link.download = 'my-mockup.png';
                link.click();
            }
            setSelectedId(currentSelection);
        }, 50);
    };

    return (
        <div
            style={{ display: 'flex', height: '100vh', width: '100vw', fontFamily: 'sans-serif' }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >

            {/* LEFT PANEL: Library */}
            <div style={{ width: '320px', borderRight: '1px solid #ccc', overflowY: 'auto', backgroundColor: '#f8f9fa' }}>
                <h2 style={{ padding: '0 20px' }}>Device Library</h2>

                {/* Render the groupedLibrary passed from App.tsx */}
                {Object.entries(groupedLibrary).map(([category, items]) => (
                    <div key={category} style={{ marginBottom: '20px' }}>
                        <h3 style={{ backgroundColor: '#e9ecef', padding: '10px 20px', margin: '0', textTransform: 'capitalize' }}>
                            {category}
                        </h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', padding: '15px' }}>
                            {items.map((item) => (
                                <div
                                    key={item.path}
                                    onClick={() => handleAddToCanvas(item)}
                                    style={{ cursor: 'pointer', textAlign: 'center' }}
                                >
                                    <img
                                        src={item.src}
                                        alt={item.name}
                                        style={{ width: '80px', height: '80px', objectFit: 'contain' }}
                                    />
                                    <p style={{ fontSize: '12px', margin: '5px 0', maxWidth: '80px', wordWrap: 'break-word' }}>
                                        {item.name}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* RIGHT PANEL: Canvas & Controls */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#e0e0e0' }}>

                <div style={{ height: '60px', backgroundColor: '#fff', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '15px' }}>
                    <button onClick={bringForward} disabled={!selectedId}>Bring Forward</button>
                    <button onClick={pushBackward} disabled={!selectedId}>Push Backward</button>
                    <div style={{ flex: 1 }}></div>
                    <button onClick={downloadCanvas} style={{ backgroundColor: '#007bff', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        Download Mockup
                    </button>
                </div>

                <div
                    ref={canvasRef}
                    style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: 'transparent' }}
                    onClick={(e) => {
                        if (e.target === canvasRef.current) setSelectedId(null);
                    }}
                >
                    {canvasItems.map((item) => (
                        <img
                            key={item.instanceId}
                            src={item.src}
                            alt={item.name}
                            onPointerDown={(e) => handlePointerDown(e, item)}
                            style={{
                                position: 'absolute',
                                left: `${item.x}px`,
                                top: `${item.y}px`,
                                width: '150px',
                                objectFit: 'contain',
                                zIndex: item.zIndex,
                                cursor: dragInfo.id === item.instanceId ? 'grabbing' : 'grab',
                                outline: selectedId === item.instanceId ? '2px solid #007bff' : 'none',
                            }}
                        />
                    ))}
                </div>
            </div>

        </div>
    );
}
