import React, { useState } from 'react';

const LuptonRGBMockup = () => {
  const [stretch, setStretch] = useState(5.0);
  const [Q, setQ] = useState(8.0);
  const [blackPoint, setBlackPoint] = useState(0.0);
  const [saturationBoost, setSaturationBoost] = useState(1.0);
  const [linkedChannels, setLinkedChannels] = useState(true);
  const [preview, setPreview] = useState(true);
  const [selectedR, setSelectedR] = useState('');
  const [selectedG, setSelectedG] = useState('');
  const [selectedB, setSelectedB] = useState('');
  const [useActiveImage, setUseActiveImage] = useState(true);
  const [blackR, setBlackR] = useState(0.0);
  const [blackG, setBlackG] = useState(0.0);
  const [blackB, setBlackB] = useState(0.0);
  const [previewMode, setPreviewMode] = useState('split'); // 'split', 'after', 'before'
  const [zoomLevel, setZoomLevel] = useState(100);
  const [splitPosition, setSplitPosition] = useState(50);

  const mockImages = [
    'integration_R', 'integration_G', 'integration_B',
    'integration_Ha', 'integration_OIII', 'integration_SII', 'RGB_master'
  ];

  const SliderControl = ({ label, value, onChange, min, max, step, tooltip, compact = false }) => (
    <div className={`flex items-center gap-2 ${compact ? 'mb-2' : 'mb-3'}`}>
      <label className={`${compact ? 'w-24' : 'w-28'} text-right text-sm text-gray-300`} title={tooltip}>
        {label}:
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-16 px-1.5 py-0.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200 text-right"
      />
    </div>
  );

  const ImageSelector = ({ label, value, onChange }) => (
    <div className="flex items-center gap-2 mb-1.5">
      <label className="w-8 text-right text-xs text-gray-300">{label}:</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-1.5 py-0.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200"
        disabled={useActiveImage}
      >
        <option value="">Select...</option>
        {mockImages.map(img => (
          <option key={img} value={img}>{img}</option>
        ))}
      </select>
    </div>
  );

  const GroupBox = ({ title, children, compact = false }) => (
    <div className="border border-gray-600 rounded mb-3">
      <div className="bg-gray-700 px-2 py-1 border-b border-gray-600 rounded-t">
        <span className="text-xs font-medium text-gray-200">{title}</span>
      </div>
      <div className={compact ? 'p-2' : 'p-3'}>
        {children}
      </div>
    </div>
  );

  // Simulated nebula preview with stars
  const PreviewCanvas = () => (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Simulated deep sky image */}
      <svg viewBox="0 0 400 300" className="w-full h-full">
        <defs>
          {/* Nebula gradient for "before" (unstretched - dark) */}
          <radialGradient id="nebulaBefore" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#1a0a0a" />
            <stop offset="40%" stopColor="#0d0508" />
            <stop offset="100%" stopColor="#020102" />
          </radialGradient>
          
          {/* Nebula gradient for "after" (stretched - visible) */}
          <radialGradient id="nebulaAfter" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#ff6b6b" stopOpacity="0.8" />
            <stop offset="30%" stopColor="#c92a2a" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#862e9c" stopOpacity="0.4" />
            <stop offset="70%" stopColor="#364fc7" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0a0a12" />
          </radialGradient>

          {/* Star glow */}
          <radialGradient id="starGlow">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="30%" stopColor="#ffffcc" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ffff00" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="blueStarGlow">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="30%" stopColor="#99ccff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#3366ff" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="redStarGlow">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="30%" stopColor="#ffcccc" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ff6666" stopOpacity="0" />
          </radialGradient>

          {/* Clip path for split view */}
          <clipPath id="leftHalf">
            <rect x="0" y="0" width={splitPosition * 4} height="300" />
          </clipPath>
          <clipPath id="rightHalf">
            <rect x={splitPosition * 4} y="0" width={400 - splitPosition * 4} height="300" />
          </clipPath>
        </defs>

        {/* Background */}
        <rect width="400" height="300" fill="#030306" />

        {previewMode === 'split' ? (
          <>
            {/* Before side (left) */}
            <g clipPath="url(#leftHalf)">
              <ellipse cx="200" cy="150" rx="150" ry="100" fill="url(#nebulaBefore)" />
              {/* Dim stars on before side */}
              <circle cx="80" cy="60" r="1.5" fill="#333333" />
              <circle cx="320" cy="80" r="1" fill="#222222" />
              <circle cx="150" cy="220" r="1.2" fill="#2a2a2a" />
              <circle cx="280" cy="200" r="0.8" fill="#252525" />
              <circle cx="50" cy="180" r="1" fill="#282828" />
              <circle cx="350" cy="140" r="1.3" fill="#2c2c2c" />
            </g>

            {/* After side (right) */}
            <g clipPath="url(#rightHalf)">
              <ellipse cx="200" cy="150" rx="150" ry="100" fill="url(#nebulaAfter)" />
              {/* Bright colored stars on after side - NOT white thanks to Lupton */}
              <circle cx="80" cy="60" r="8" fill="url(#starGlow)" />
              <circle cx="80" cy="60" r="2" fill="#ffffff" />
              <circle cx="320" cy="80" r="6" fill="url(#blueStarGlow)" />
              <circle cx="320" cy="80" r="1.5" fill="#ffffff" />
              <circle cx="150" cy="220" r="7" fill="url(#redStarGlow)" />
              <circle cx="150" cy="220" r="1.8" fill="#ffffff" />
              <circle cx="280" cy="200" r="4" fill="url(#starGlow)" />
              <circle cx="280" cy="200" r="1" fill="#ffffff" />
              <circle cx="50" cy="180" r="5" fill="url(#blueStarGlow)" />
              <circle cx="50" cy="180" r="1.2" fill="#ffffff" />
              <circle cx="350" cy="140" r="6" fill="url(#redStarGlow)" />
              <circle cx="350" cy="140" r="1.5" fill="#ffffff" />
            </g>

            {/* Split line */}
            <line x1={splitPosition * 4} y1="0" x2={splitPosition * 4} y2="300" stroke="#ffffff" strokeWidth="2" strokeDasharray="4,4" opacity="0.7" />
            
            {/* Labels */}
            <text x="10" y="20" fill="#888888" fontSize="11" fontFamily="monospace">BEFORE</text>
            <text x={400 - 50} y="20" fill="#ffffff" fontSize="11" fontFamily="monospace">AFTER</text>
          </>
        ) : previewMode === 'before' ? (
          <>
            <ellipse cx="200" cy="150" rx="150" ry="100" fill="url(#nebulaBefore)" />
            <circle cx="80" cy="60" r="1.5" fill="#333333" />
            <circle cx="320" cy="80" r="1" fill="#222222" />
            <circle cx="150" cy="220" r="1.2" fill="#2a2a2a" />
            <text x="10" y="20" fill="#888888" fontSize="11" fontFamily="monospace">BEFORE (Linear)</text>
          </>
        ) : (
          <>
            <ellipse cx="200" cy="150" rx="150" ry="100" fill="url(#nebulaAfter)" />
            <circle cx="80" cy="60" r="8" fill="url(#starGlow)" />
            <circle cx="80" cy="60" r="2" fill="#ffffff" />
            <circle cx="320" cy="80" r="6" fill="url(#blueStarGlow)" />
            <circle cx="320" cy="80" r="1.5" fill="#ffffff" />
            <circle cx="150" cy="220" r="7" fill="url(#redStarGlow)" />
            <circle cx="150" cy="220" r="1.8" fill="#ffffff" />
            <circle cx="280" cy="200" r="4" fill="url(#starGlow)" />
            <circle cx="280" cy="200" r="1" fill="#ffffff" />
            <text x="10" y="20" fill="#ffffff" fontSize="11" fontFamily="monospace">AFTER (Lupton RGB)</text>
          </>
        )}
      </svg>

      {/* Crosshair */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
        <div className="w-8 h-px bg-green-400"></div>
        <div className="absolute w-px h-8 bg-green-400"></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 p-4 font-sans">
      {/* Main Dialog Window - Wider for preview */}
      <div className="max-w-4xl mx-auto bg-gray-800 rounded-lg shadow-2xl border border-gray-700">
        {/* Title Bar */}
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-4 py-2 rounded-t-lg border-b border-gray-600 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">L</span>
            </div>
            <span className="text-gray-200 font-medium">Lupton RGB Stretch</span>
          </div>
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-yellow-500 opacity-70 hover:opacity-100 cursor-pointer"></div>
            <div className="w-3 h-3 rounded-full bg-green-500 opacity-70 hover:opacity-100 cursor-pointer"></div>
            <div className="w-3 h-3 rounded-full bg-red-500 opacity-70 hover:opacity-100 cursor-pointer"></div>
          </div>
        </div>

        {/* Content - Two Column Layout */}
        <div className="flex">
          {/* Left Panel - Controls */}
          <div className="w-80 p-3 border-r border-gray-700 flex flex-col">
            {/* Input Images */}
            <GroupBox title="Input Images" compact>
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={useActiveImage}
                  onChange={(e) => setUseActiveImage(e.target.checked)}
                  className="w-3 h-3 rounded bg-gray-700 border-gray-600 text-blue-500"
                />
                Use active RGB image
              </label>
              <div className={useActiveImage ? 'opacity-50' : ''}>
                <ImageSelector label="R" value={selectedR} onChange={setSelectedR} />
                <ImageSelector label="G" value={selectedG} onChange={setSelectedG} />
                <ImageSelector label="B" value={selectedB} onChange={setSelectedB} />
              </div>
            </GroupBox>

            {/* Stretch Parameters */}
            <GroupBox title="Stretch Parameters" compact>
              <SliderControl
                label="Stretch (α)"
                value={stretch}
                onChange={setStretch}
                min={0.1}
                max={50}
                step={0.1}
                compact
              />
              <SliderControl
                label="Q (softening)"
                value={Q}
                onChange={setQ}
                min={0.1}
                max={30}
                step={0.1}
                compact
              />
              <p className="text-xs text-gray-500 ml-24 mt-1">Lower Q = earlier log transition</p>
            </GroupBox>

            {/* Black Point */}
            <GroupBox title="Black Point" compact>
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={linkedChannels}
                  onChange={(e) => setLinkedChannels(e.target.checked)}
                  className="w-3 h-3 rounded bg-gray-700 border-gray-600 text-blue-500"
                />
                Link RGB channels
              </label>
              
              {linkedChannels ? (
                <SliderControl
                  label="Black Point"
                  value={blackPoint}
                  onChange={setBlackPoint}
                  min={-0.1}
                  max={0.5}
                  step={0.001}
                  compact
                />
              ) : (
                <>
                  <SliderControl label="Black (R)" value={blackR} onChange={setBlackR} min={-0.1} max={0.5} step={0.001} compact />
                  <SliderControl label="Black (G)" value={blackG} onChange={setBlackG} min={-0.1} max={0.5} step={0.001} compact />
                  <SliderControl label="Black (B)" value={blackB} onChange={setBlackB} min={-0.1} max={0.5} step={0.001} compact />
                </>
              )}
              
              <div className="flex gap-1.5 mt-2 ml-24">
                <button className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600">
                  Auto
                </button>
                <button className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600">
                  Sample
                </button>
              </div>
            </GroupBox>

            {/* Color Options */}
            <GroupBox title="Color Options" compact>
              <SliderControl
                label="Saturation"
                value={saturationBoost}
                onChange={setSaturationBoost}
                min={0.5}
                max={2.0}
                step={0.05}
                compact
              />
              <div className="flex items-center gap-2 mt-1">
                <label className="w-24 text-right text-xs text-gray-300">Clipping:</label>
                <select className="flex-1 px-1.5 py-0.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200">
                  <option value="preserve">Preserve Color</option>
                  <option value="clip">Hard Clip</option>
                  <option value="rescale">Rescale</option>
                </select>
              </div>
            </GroupBox>

            {/* Spacer */}
            <div className="flex-1"></div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-700 mt-2">
              <div className="flex gap-1">
                <button className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600 text-xs" title="New Instance">➕</button>
                <button className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600 text-xs" title="Save">💾</button>
                <button className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600 text-xs" title="Load">📂</button>
              </div>
              
              <div className="flex gap-1.5">
                <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600 text-xs">
                  Reset
                </button>
                <button className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded border border-blue-500 text-xs font-medium">
                  Apply
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel - Preview */}
          <div className="flex-1 p-3 flex flex-col">
            {/* Preview Toolbar */}
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preview}
                    onChange={(e) => setPreview(e.target.checked)}
                    className="w-3 h-3 rounded bg-gray-700 border-gray-600 text-blue-500"
                  />
                  Real-Time Preview
                </label>
              </div>
              
              <div className="flex items-center gap-3">
                {/* View Mode Toggle */}
                <div className="flex bg-gray-700 rounded border border-gray-600">
                  <button 
                    onClick={() => setPreviewMode('before')}
                    className={`px-2 py-0.5 text-xs rounded-l ${previewMode === 'before' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}
                  >
                    Before
                  </button>
                  <button 
                    onClick={() => setPreviewMode('split')}
                    className={`px-2 py-0.5 text-xs border-l border-r border-gray-600 ${previewMode === 'split' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}
                  >
                    Split
                  </button>
                  <button 
                    onClick={() => setPreviewMode('after')}
                    className={`px-2 py-0.5 text-xs rounded-r ${previewMode === 'after' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}
                  >
                    After
                  </button>
                </div>

                {/* Zoom */}
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setZoomLevel(Math.max(25, zoomLevel - 25))}
                    className="w-5 h-5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600 text-xs"
                  >
                    −
                  </button>
                  <span className="text-xs text-gray-400 w-10 text-center">{zoomLevel}%</span>
                  <button 
                    onClick={() => setZoomLevel(Math.min(400, zoomLevel + 25))}
                    className="w-5 h-5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600 text-xs"
                  >
                    +
                  </button>
                  <button 
                    onClick={() => setZoomLevel(100)}
                    className="px-1.5 h-5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600 text-xs ml-1"
                  >
                    1:1
                  </button>
                  <button 
                    className="px-1.5 h-5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600 text-xs"
                    title="Fit to window"
                  >
                    Fit
                  </button>
                </div>
              </div>
            </div>

            {/* Preview Canvas */}
            <div className="flex-1 bg-black rounded border border-gray-700 overflow-hidden relative" style={{ minHeight: '320px' }}>
              <PreviewCanvas />
              
              {/* Preview disabled overlay */}
              {!preview && (
                <div className="absolute inset-0 bg-gray-900 bg-opacity-80 flex items-center justify-center">
                  <span className="text-gray-500 text-sm">Preview Disabled</span>
                </div>
              )}
            </div>

            {/* Split Position Slider (only in split mode) */}
            {previewMode === 'split' && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-400">Split:</span>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={splitPosition}
                  onChange={(e) => setSplitPosition(parseInt(e.target.value))}
                  className="flex-1 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            )}

            {/* Preview Info Bar */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700">
              <span className="text-xs text-gray-500">
                Cursor: (1247, 892) | Value: R=0.342 G=0.287 B=0.198
              </span>
              <span className="text-xs text-gray-500">
                512 × 384 px | 32-bit float
              </span>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="bg-gray-750 px-4 py-1.5 rounded-b-lg border-t border-gray-700 flex justify-between">
          <span className="text-xs text-gray-500">
            Lupton RGB v1.0 | Based on Lupton et al. (2004) PASP 116:133
          </span>
          <span className="text-xs text-gray-500">
            Processing time: 0.34s
          </span>
        </div>
      </div>

      {/* Algorithm Quick Reference - Collapsible */}
      <div className="max-w-4xl mx-auto mt-4 bg-gray-800 rounded-lg border border-gray-700">
        <details className="group">
          <summary className="px-4 py-2 cursor-pointer text-sm text-gray-300 hover:bg-gray-750 rounded-lg flex items-center gap-2">
            <span className="transform group-open:rotate-90 transition-transform">▶</span>
            Algorithm Reference
          </summary>
          <div className="px-4 pb-3">
            <div className="bg-gray-900 rounded p-3 font-mono text-xs text-gray-300">
              <div className="text-green-400 mb-2">// Lupton RGB Stretch - Color Preserving</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1"><span className="text-blue-400">I</span> = (R + G + B) / 3</div>
                  <div className="mb-1"><span className="text-blue-400">F(x)</span> = asinh(α × Q × (x - min)) / Q</div>
                  <div className="mb-1"><span className="text-blue-400">scale</span> = F(I) / I</div>
                </div>
                <div>
                  <div className="mb-1"><span className="text-purple-400">R'</span> = R × scale</div>
                  <div className="mb-1"><span className="text-green-400">G'</span> = G × scale</div>
                  <div className="mb-1"><span className="text-blue-400">B'</span> = B × scale</div>
                </div>
              </div>
              <div className="mt-2 text-yellow-400 text-xs">
                ★ If max(R',G',B') &gt; 1: scale all by 1/max → preserves hue during clipping
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
};

export default LuptonRGBMockup;
