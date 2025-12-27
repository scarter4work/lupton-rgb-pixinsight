# LuptonRGB PixInsight Plugin

## Project Overview
PixInsight JavaScript (PJSR) plugin implementing the Lupton et al. (2004) RGB stretch algorithm for color-preserving stretched images from astronomical data.

## Git Workflow
- Push directly to main without asking - this is just a PixInsight plugin, not critical infrastructure.

## PJSR Notes
- Use `Control.repaint()` for immediate redraws, not `update()` which only schedules a repaint
- Preview controls need throttling on slider updates to stay responsive
