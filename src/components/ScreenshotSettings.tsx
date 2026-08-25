import { useState, useEffect } from 'react';

interface ScreenshotSettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ScreenshotSettings({ isOpen, onClose }: ScreenshotSettingsProps) {
    const [provider, setProvider] = useState<string>('screenshotapi');
    const [apiKey, setApiKey] = useState<string>('');
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        // Load saved settings
        const savedProvider = localStorage.getItem('pixelMockup_screenshotProvider');
        const savedKey = localStorage.getItem('pixelMockup_screenshotApiKey');

        if (savedProvider) setProvider(savedProvider);
        if (savedKey) setApiKey(savedKey);
    }, [isOpen]);

    const handleSave = () => {
        if (apiKey) {
            localStorage.setItem('pixelMockup_screenshotProvider', provider);
            localStorage.setItem('pixelMockup_screenshotApiKey', apiKey);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
                <h2 className="text-xl font-bold mb-4">Screenshot API Settings</h2>

                <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">Provider</label>
                    <select
                        value={provider}
                        onChange={(e) => setProvider(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                    >
                        <option value="screenshotapi">ScreenshotAPI.net (5000 free/month)</option>
                        <option value="microlink">Microlink (100 free/day)</option>
                    </select>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">
                        API Key {provider === 'microlink' ? '(optional)' : ''}
                    </label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={provider === 'screenshotapi' ? 'Your ScreenshotAPI key' : 'Leave blank for free tier'}
                        className="w-full border rounded px-3 py-2"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        {provider === 'screenshotapi'
                            ? 'Get your key at screenshotapi.net'
                            : 'Free tier allows 100 requests/day without a key'}
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleSave}
                        className="flex-1 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                    >
                        {saved ? '✓ Saved!' : 'Save Settings'}
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
                    >
                        Close
                    </button>
                </div>

                <div className="mt-4 text-xs text-gray-500">
                    <p><strong>Priority:</strong></p>
                    <ol className="list-decimal list-inside ml-2">
                        <li>Your configured API key</li>
                        <li>Local Playwright (dev only)</li>
                        <li>App's default API key</li>
                        <li>Microlink free tier</li>
                    </ol>
                </div>
            </div>
        </div>
    );
}