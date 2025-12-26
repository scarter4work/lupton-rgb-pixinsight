# Lupton RGB Stretch for PixInsight

A PixInsight script implementing the Lupton et al. (2004) RGB stretch algorithm for creating color-preserving stretched images from high dynamic range astronomical data.

## Features

- **Arcsinh stretch function** with configurable α (stretch) and Q (softening) parameters
- **Color-preserving clipping** - scales all channels proportionally when any clips, preventing star color blowout
- **Three clipping modes**: Preserve Color (Lupton), Hard Clip, Rescale to Max
- **Per-channel or linked black point** support with Auto calculation
- **Saturation boost** post-processing
- **Real-time preview** with Before/Split/After viewing modes
- **Split view** with draggable divider

## Installation

1. Download `LuptonRGB.js`
2. Copy to your PixInsight scripts folder:
   - Windows: `C:\Program Files\PixInsight\src\scripts\`
   - macOS: `/Applications/PixInsight/src/scripts/`
   - Linux: `/opt/PixInsight/src/scripts/`
3. Restart PixInsight or use **Script > Feature Scripts... > Add**

## Usage

1. Open an RGB image in PixInsight
2. Run the script: **Script > Utilities > LuptonRGB**
3. Adjust parameters using the sliders
4. Use the preview panel to see results in real-time
5. Click **Apply** to create a new stretched image

## Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| Stretch (α) | 0.1 - 50.0 | 5.0 | Linear amplification factor. Higher = brighter |
| Q (softening) | 0.1 - 30.0 | 8.0 | Controls linear-to-log transition. Lower Q = earlier log behavior |
| Black Point | -0.1 - 0.5 | 0.0 | Value subtracted before stretch |
| Saturation | 0.5 - 2.0 | 1.0 | Post-stretch saturation adjustment |

## Algorithm

The Lupton RGB stretch computes a combined intensity, applies an arcsinh stretch, then scales each channel proportionally:

```
I = (R + G + B) / 3
F(x) = asinh(α × Q × (x - min)) / Q
scale = F(I) / I
R' = R × scale
G' = G × scale
B' = B × scale
```

If any output channel exceeds 1.0, all channels are scaled down proportionally to preserve color ratios.

## Reference

Lupton, R. et al. (2004) "Preparing Red-Green-Blue Images from CCD Data" PASP 116:133-137
https://ui.adsabs.harvard.edu/abs/2004PASP..116..133L

## License

MIT License - See LICENSE file for details.
