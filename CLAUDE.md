# LuptonRGB PixInsight Plugin

## Project Overview
PixInsight JavaScript (PJSR) plugin implementing the Lupton et al. (2004) RGB stretch algorithm for color-preserving stretched images from astronomical data.

## Git Workflow
- Push directly to main without asking - this is just a PixInsight plugin, not critical infrastructure.

## Release Process
When making changes, auto-increment the version:
1. Update `#define VERSION` in LuptonRGB.js
2. Create new zip: `repository/LuptonRGB_v{VERSION}.zip` containing LuptonRGB.js
3. Calculate SHA1 of the zip file
4. Update `repository/updates.xri` with new version, SHA1, and changelog
5. Commit and push

Python one-liner for zip + SHA1:
```python
python3 -c "
import zipfile, hashlib
with zipfile.ZipFile('repository/LuptonRGB_vX.X.X.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.write('LuptonRGB.js', 'LuptonRGB.js')
with open('repository/LuptonRGB_vX.X.X.zip', 'rb') as f:
    print(hashlib.sha1(f.read()).hexdigest())
"
```

## PJSR Notes
- Use `Control.repaint()` for immediate redraws, not `update()` which only schedules a repaint
- Preview controls need throttling on slider updates to stay responsive
