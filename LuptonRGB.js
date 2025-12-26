// ============================================================================
// LuptonRGB.js - Lupton RGB Stretch for PixInsight
// ============================================================================
//
// Implements the Lupton et al. (2004) RGB stretch algorithm for creating
// color-preserving stretched images from high dynamic range astronomical data.
//
// Reference: Lupton, R. et al. (2004) "Preparing Red-Green-Blue Images from
// CCD Data" PASP 116:133-137
// https://ui.adsabs.harvard.edu/abs/2004PASP..116..133L
//
// ============================================================================

#feature-id    Utilities > LuptonRGB
#feature-info  Lupton RGB Stretch - Color-preserving arcsinh stretch for \
               astronomical images. Based on Lupton et al. (2004) PASP 116:133. \
               Creates properly color-balanced RGB images from linear data \
               while preventing star color clipping.

#include <pjsr/Sizer.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/TextAlign.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/FontFamily.jsh>
#include <pjsr/Color.jsh>

#define VERSION "1.0.0"
#define TITLE   "Lupton RGB Stretch"

// ============================================================================
// Math.asinh polyfill for ECMA 262-5 compatibility
// ============================================================================
if (typeof Math.asinh === 'undefined') {
   Math.asinh = function(x) {
      return Math.log(x + Math.sqrt(x * x + 1));
   };
}

// ============================================================================
// Algorithm Engine
// ============================================================================

function LuptonEngine()
{
   // Default parameters
   this.stretch = 5.0;        // Alpha: linear amplification factor (0.1 - 50.0)
   this.Q = 8.0;              // Q: softening parameter (0.1 - 30.0)
   this.blackPoint = 0.0;     // Linked black point (-0.1 - 0.5)
   this.blackR = 0.0;         // Per-channel black point R
   this.blackG = 0.0;         // Per-channel black point G
   this.blackB = 0.0;         // Per-channel black point B
   this.linkedChannels = true;
   this.saturation = 1.0;     // Saturation boost (0.5 - 2.0)
   this.clippingMode = 0;     // 0: Preserve Color, 1: Hard Clip, 2: Rescale

   // Image sources
   this.useActiveImage = true;
   this.imageR = null;
   this.imageG = null;
   this.imageB = null;

   // Arcsinh stretch function F(x)
   this.F = function(x, alpha, Q, minimum)
   {
      var val = x - minimum;
      if (val <= 0) return 0;
      return Math.asinh(alpha * Q * val) / Q;
   };

   // Process a single pixel (r, g, b values 0-1)
   this.processPixel = function(r, g, b)
   {
      var minR = this.linkedChannels ? this.blackPoint : this.blackR;
      var minG = this.linkedChannels ? this.blackPoint : this.blackG;
      var minB = this.linkedChannels ? this.blackPoint : this.blackB;

      // For the Lupton algorithm, we use a single "minimum" for intensity calculation
      // but can subtract per-channel minimums for the final scaling
      var minimum = (minR + minG + minB) / 3;

      // Step 1: Compute intensity
      var I = (r + g + b) / 3;

      // Step 2: Compute scale factor using arcsinh stretch
      var scale = 0;
      var epsilon = 1e-10;
      if (I > minimum + epsilon)
      {
         var FI = this.F(I, this.stretch, this.Q, minimum);
         scale = FI / (I - minimum);
      }

      // Step 3: Apply scale to each channel (with per-channel black point subtraction)
      var rOut = (r - minR) * scale;
      var gOut = (g - minG) * scale;
      var bOut = (b - minB) * scale;

      // Step 4: Apply saturation boost
      if (this.saturation != 1.0)
      {
         var lum = (rOut + gOut + bOut) / 3;
         rOut = lum + (rOut - lum) * this.saturation;
         gOut = lum + (gOut - lum) * this.saturation;
         bOut = lum + (bOut - lum) * this.saturation;
      }

      // Step 5: Handle clipping based on mode
      switch (this.clippingMode)
      {
         case 0: // Preserve Color (Lupton)
            var maxVal = Math.max(rOut, gOut, bOut);
            if (maxVal > 1.0)
            {
               rOut /= maxVal;
               gOut /= maxVal;
               bOut /= maxVal;
            }
            break;
         case 1: // Hard Clip
            rOut = Math.min(1.0, Math.max(0, rOut));
            gOut = Math.min(1.0, Math.max(0, gOut));
            bOut = Math.min(1.0, Math.max(0, bOut));
            break;
         case 2: // Rescale - handled at image level
            break;
      }

      // Clamp negative values
      rOut = Math.max(0, rOut);
      gOut = Math.max(0, gOut);
      bOut = Math.max(0, bOut);

      return [rOut, gOut, bOut];
   };

   // Calculate auto black point for an image/channel
   this.calculateAutoBlackPoint = function(view, channel)
   {
      var image = view.image;
      if (!image) return 0;

      // Use ImageStatistics for reliable calculations
      try
      {
         // Simple approach: sample some pixels and find low percentile
         var samples = [];
         var step = Math.max(1, Math.floor(Math.sqrt(image.width * image.height / 10000)));

         for (var y = 0; y < image.height; y += step)
         {
            for (var x = 0; x < image.width; x += step)
            {
               samples.push(image.sample(x, y, channel));
            }
         }

         // Guard against empty samples
         if (samples.length === 0) return 0;

         // Sort and find 1st percentile
         samples.sort(function(a, b) { return a - b; });
         var idx = Math.floor(samples.length * 0.01);
         var lowVal = samples[idx];

         // Find median of low values for more robust estimate
         var lowSamples = samples.slice(0, Math.max(10, Math.floor(samples.length * 0.05)));
         var medianIdx = Math.floor(lowSamples.length / 2);
         var median = lowSamples[medianIdx];

         // Return slightly above the noise floor
         return Math.max(0, median * 0.9);
      }
      catch(e)
      {
         Console.warningln("Auto black point calculation failed: " + e.message);
         return 0;
      }
   };

   // Process entire image (creates new window)
   this.execute = function(targetWindow)
   {
      var startTime = new Date().getTime();

      if (!targetWindow)
      {
         Console.criticalln("Error: No target window specified");
         return null;
      }

      var image = targetWindow.mainView.image;
      if (image.numberOfChannels < 3)
      {
         Console.criticalln("Error: Image must have at least 3 channels (RGB)");
         return null;
      }

      Console.writeln("<b>Lupton RGB Stretch</b>");
      Console.writeln("Processing: " + targetWindow.mainView.id);
      Console.writeln(format("Parameters: alpha=%.2f, Q=%.2f", this.stretch, this.Q));

      // Create output window
      var outputId = targetWindow.mainView.id + "_lupton";
      var outputWindow = null;

      try
      {
         outputWindow = new ImageWindow(
            image.width,
            image.height,
            3,
            32,  // 32-bit float
            true, // float
            true, // color
            outputId
         );

         // Get source image data
         var rect = new Rect(0, 0, image.width, image.height);
         var R = new Vector(image.width * image.height);
         var G = new Vector(image.width * image.height);
         var B = new Vector(image.width * image.height);

         image.getSamples(R, rect, 0);
         image.getSamples(G, rect, 1);
         image.getSamples(B, rect, 2);

         // Process pixels
         var globalMax = 0;
         var Rout = new Vector(R.length);
         var Gout = new Vector(G.length);
         var Bout = new Vector(B.length);

         for (var i = 0; i < R.length; i++)
         {
            var result = this.processPixel(R[i], G[i], B[i]);
            Rout[i] = result[0];
            Gout[i] = result[1];
            Bout[i] = result[2];

            if (this.clippingMode == 2) // Track max for rescale mode
            {
               globalMax = Math.max(globalMax, result[0], result[1], result[2]);
            }
         }

         // Apply rescale if needed
         if (this.clippingMode == 2 && globalMax > 1.0)
         {
            Console.writeln(format("Rescaling by factor: %.4f", 1.0/globalMax));
            for (var i = 0; i < Rout.length; i++)
            {
               Rout[i] = Rout[i] / globalMax;
               Gout[i] = Gout[i] / globalMax;
               Bout[i] = Bout[i] / globalMax;
            }
         }

         // Write to output image
         var outputImage = outputWindow.mainView.image;
         outputWindow.mainView.beginProcess(UndoFlag_NoSwapFile);
         outputImage.setSamples(Rout, rect, 0);
         outputImage.setSamples(Gout, rect, 1);
         outputImage.setSamples(Bout, rect, 2);
         outputWindow.mainView.endProcess();

         var elapsed = (new Date().getTime() - startTime) / 1000;
         Console.writeln(format("Processing completed in %.2f seconds", elapsed));

         outputWindow.show();
         return outputWindow;
      }
      catch (e)
      {
         Console.criticalln("Error during processing: " + e.message);
         if (outputWindow)
         {
            outputWindow.forceClose();
         }
         return null;
      }
   };

   // Generate preview bitmap
   this.generatePreview = function(sourceWindow, previewWidth, previewHeight, showBefore, splitPos)
   {
      if (!sourceWindow) return null;

      var image = sourceWindow.mainView.image;
      if (!image || image.numberOfChannels < 3) return null;

      // Calculate scale factor
      var scaleX = image.width / previewWidth;
      var scaleY = image.height / previewHeight;
      var scale = Math.max(scaleX, scaleY);

      var actualWidth = Math.round(image.width / scale);
      var actualHeight = Math.round(image.height / scale);

      // Create bitmap
      var bitmap = new Bitmap(actualWidth, actualHeight);

      // Sample step (process every nth pixel for speed)
      var step = Math.max(1, Math.floor(scale));

      for (var py = 0; py < actualHeight; py++)
      {
         var iy = Math.min(Math.floor(py * scale), image.height - 1);

         for (var px = 0; px < actualWidth; px++)
         {
            var ix = Math.min(Math.floor(px * scale), image.width - 1);

            // Get source pixel
            var r = image.sample(ix, iy, 0);
            var g = image.sample(ix, iy, 1);
            var b = image.sample(ix, iy, 2);

            var rOut, gOut, bOut;

            // Determine if this pixel is in "before" or "after" region
            var isBefore = false;
            if (showBefore == 1) // Before only
               isBefore = true;
            else if (showBefore == 2) // Split mode
               isBefore = (px < actualWidth * splitPos / 100);
            // else showBefore == 0 means After only

            if (isBefore)
            {
               // Show original (with basic STF-like stretch for visibility)
               // Apply a simple auto-stretch for "before" view
               var stretch = 10;
               rOut = Math.min(1, r * stretch);
               gOut = Math.min(1, g * stretch);
               bOut = Math.min(1, b * stretch);
            }
            else
            {
               // Apply Lupton stretch
               var result = this.processPixel(r, g, b);
               rOut = result[0];
               gOut = result[1];
               bOut = result[2];
            }

            // Convert to 8-bit
            var r8 = Math.round(Math.min(255, Math.max(0, rOut * 255)));
            var g8 = Math.round(Math.min(255, Math.max(0, gOut * 255)));
            var b8 = Math.round(Math.min(255, Math.max(0, bOut * 255)));

            // PJSR uses 0xAARRGGBB format for colors
            var color = 0xff000000 | (r8 << 16) | (g8 << 8) | b8;
            bitmap.setPixel(px, py, color);
         }
      }

      return bitmap;
   };

   // Reset to default values
   this.reset = function()
   {
      this.stretch = 5.0;
      this.Q = 8.0;
      this.blackPoint = 0.0;
      this.blackR = 0.0;
      this.blackG = 0.0;
      this.blackB = 0.0;
      this.linkedChannels = true;
      this.saturation = 1.0;
      this.clippingMode = 0;
   };
}

// ============================================================================
// Preview Control - Custom rendering canvas
// ============================================================================

function PreviewControl(parent, engine)
{
   this.__base__ = Control;
   this.__base__(parent);

   this.engine = engine;
   this.bitmap = null;
   this.sourceWindow = null;
   this.previewMode = 0;  // 0: After, 1: Before, 2: Split
   this.splitPosition = 50;
   this.cursorX = 0;
   this.cursorY = 0;
   this.showCrosshair = true;

   this.setMinSize(320, 240);

   // Update the preview
   this.updatePreview = function()
   {
      // Clean up old bitmap to prevent memory leaks
      if (this.bitmap)
      {
         this.bitmap = null;
      }

      if (!this.sourceWindow)
      {
         this.repaint();
         return;
      }

      var showBefore = this.previewMode; // 0: After, 1: Before, 2: Split
      this.bitmap = this.engine.generatePreview(
         this.sourceWindow,
         this.width,
         this.height,
         showBefore,
         this.splitPosition
      );

      this.repaint();
   };

   // Paint event handler
   this.onPaint = function(x0, y0, x1, y1)
   {
      var g = new Graphics(this);

      // Fill with black background
      g.brush = new Brush(0xff000000);
      g.fillRect(0, 0, this.width, this.height);

      if (this.bitmap)
      {
         // Center the bitmap
         var bx = Math.round((this.width - this.bitmap.width) / 2);
         var by = Math.round((this.height - this.bitmap.height) / 2);

         g.drawBitmap(bx, by, this.bitmap);

         // Draw split line if in split mode
         if (this.previewMode == 2)
         {
            var splitX = bx + Math.round(this.bitmap.width * this.splitPosition / 100);
            g.pen = new Pen(0xaaffffff, 2);
            g.drawLine(splitX, by, splitX, by + this.bitmap.height);

            // Draw labels
            g.pen = new Pen(0xffffffff);
            g.font = new Font(FontFamily_SansSerif, 9);
            g.drawText(bx + 5, by + 15, "BEFORE");
            g.drawText(bx + this.bitmap.width - 45, by + 15, "AFTER");
         }
         else if (this.previewMode == 1)
         {
            g.pen = new Pen(0xffffffff);
            g.font = new Font(FontFamily_SansSerif, 9);
            g.drawText(5, 15, "BEFORE (Linear)");
         }
         else
         {
            g.pen = new Pen(0xffffffff);
            g.font = new Font(FontFamily_SansSerif, 9);
            g.drawText(5, 15, "AFTER (Lupton RGB)");
         }

         // Draw crosshair
         if (this.showCrosshair)
         {
            var cx = this.width / 2;
            var cy = this.height / 2;
            g.pen = new Pen(0x8000ff00, 1);
            g.drawLine(cx - 15, cy, cx + 15, cy);
            g.drawLine(cx, cy - 15, cx, cy + 15);
         }
      }
      else
      {
         // No image loaded message
         g.pen = new Pen(0xff888888);
         g.font = new Font(FontFamily_SansSerif, 11);
         g.drawText(this.width/2 - 50, this.height/2, "No image loaded");
      }

      g.end();
   };

   // Mouse tracking for cursor position
   this.onMouseMove = function(x, y, modifiers)
   {
      this.cursorX = x;
      this.cursorY = y;
      // The dialog will handle updating cursor info
   };
}

PreviewControl.prototype = new Control;

// ============================================================================
// Main Dialog
// ============================================================================

function LuptonDialog(engine)
{
   this.__base__ = Dialog;
   this.__base__();

   this.engine = engine;
   this.targetWindow = null;

   this.windowTitle = TITLE + " v" + VERSION;
   this.minWidth = 850;
   this.minHeight = 550;

   // -------------------------------------------------------------------------
   // Left Panel - Controls
   // -------------------------------------------------------------------------

   // --- Input Images Group ---
   this.useActiveCheckbox = new CheckBox(this);
   this.useActiveCheckbox.text = "Use active RGB image";
   this.useActiveCheckbox.checked = this.engine.useActiveImage;
   this.useActiveCheckbox.toolTip = "Use the currently active RGB image as input";
   this.useActiveCheckbox.onCheck = function(checked)
   {
      this.dialog.engine.useActiveImage = checked;
      this.dialog.imageRCombo.enabled = !checked;
      this.dialog.imageGCombo.enabled = !checked;
      this.dialog.imageBCombo.enabled = !checked;
      this.dialog.updateTargetWindow();
   };

   // Image combo boxes
   this.imageRLabel = new Label(this);
   this.imageRLabel.text = "R:";
   this.imageRLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.imageRLabel.setFixedWidth(20);

   this.imageRCombo = new ComboBox(this);
   this.imageRCombo.enabled = !this.engine.useActiveImage;
   this.imageRCombo.toolTip = "Select image for red channel";

   this.imageGLabel = new Label(this);
   this.imageGLabel.text = "G:";
   this.imageGLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.imageGLabel.setFixedWidth(20);

   this.imageGCombo = new ComboBox(this);
   this.imageGCombo.enabled = !this.engine.useActiveImage;
   this.imageGCombo.toolTip = "Select image for green channel";

   this.imageBLabel = new Label(this);
   this.imageBLabel.text = "B:";
   this.imageBLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.imageBLabel.setFixedWidth(20);

   this.imageBCombo = new ComboBox(this);
   this.imageBCombo.enabled = !this.engine.useActiveImage;
   this.imageBCombo.toolTip = "Select image for blue channel";

   // Populate image lists
   this.populateImageLists = function()
   {
      var windows = ImageWindow.windows;
      this.imageRCombo.clear();
      this.imageGCombo.clear();
      this.imageBCombo.clear();

      this.imageRCombo.addItem("<select>");
      this.imageGCombo.addItem("<select>");
      this.imageBCombo.addItem("<select>");

      for (var i = 0; i < windows.length; i++)
      {
         var id = windows[i].mainView.id;
         this.imageRCombo.addItem(id);
         this.imageGCombo.addItem(id);
         this.imageBCombo.addItem(id);
      }
   };

   var rSizer = new HorizontalSizer;
   rSizer.spacing = 4;
   rSizer.add(this.imageRLabel);
   rSizer.add(this.imageRCombo, 100);

   var gSizer = new HorizontalSizer;
   gSizer.spacing = 4;
   gSizer.add(this.imageGLabel);
   gSizer.add(this.imageGCombo, 100);

   var bSizer = new HorizontalSizer;
   bSizer.spacing = 4;
   bSizer.add(this.imageBLabel);
   bSizer.add(this.imageBCombo, 100);

   this.inputGroup = new GroupBox(this);
   this.inputGroup.title = "Input Images";
   this.inputGroup.sizer = new VerticalSizer;
   this.inputGroup.sizer.margin = 6;
   this.inputGroup.sizer.spacing = 4;
   this.inputGroup.sizer.add(this.useActiveCheckbox);
   this.inputGroup.sizer.add(rSizer);
   this.inputGroup.sizer.add(gSizer);
   this.inputGroup.sizer.add(bSizer);

   // --- Stretch Parameters Group ---
   this.stretchControl = new NumericControl(this);
   this.stretchControl.label.text = "Stretch (\u03B1):";
   this.stretchControl.label.setFixedWidth(80);
   this.stretchControl.setRange(0.1, 50.0);
   this.stretchControl.slider.setRange(0, 500);
   this.stretchControl.slider.minWidth = 150;
   this.stretchControl.setPrecision(2);
   this.stretchControl.setValue(this.engine.stretch);
   this.stretchControl.toolTip = "Linear amplification factor. Higher = brighter image";
   this.stretchControl.onValueUpdated = function(value)
   {
      this.dialog.engine.stretch = value;
      this.dialog.schedulePreviewUpdate();
   };

   this.qControl = new NumericControl(this);
   this.qControl.label.text = "Q (softening):";
   this.qControl.label.setFixedWidth(80);
   this.qControl.setRange(0.1, 30.0);
   this.qControl.slider.setRange(0, 300);
   this.qControl.slider.minWidth = 150;
   this.qControl.setPrecision(2);
   this.qControl.setValue(this.engine.Q);
   this.qControl.toolTip = "Controls linear-to-logarithmic transition. Lower Q = earlier log behavior";
   this.qControl.onValueUpdated = function(value)
   {
      this.dialog.engine.Q = value;
      this.dialog.schedulePreviewUpdate();
   };

   this.qHelpLabel = new Label(this);
   this.qHelpLabel.text = "Lower Q = earlier log transition";
   this.qHelpLabel.textAlignment = TextAlign_Left;

   this.stretchGroup = new GroupBox(this);
   this.stretchGroup.title = "Stretch Parameters";
   this.stretchGroup.sizer = new VerticalSizer;
   this.stretchGroup.sizer.margin = 6;
   this.stretchGroup.sizer.spacing = 4;
   this.stretchGroup.sizer.add(this.stretchControl);
   this.stretchGroup.sizer.add(this.qControl);
   this.stretchGroup.sizer.add(this.qHelpLabel);

   // --- Black Point Group ---
   this.linkedCheckbox = new CheckBox(this);
   this.linkedCheckbox.text = "Link RGB channels";
   this.linkedCheckbox.checked = this.engine.linkedChannels;
   this.linkedCheckbox.toolTip = "Use the same black point for all channels";
   this.linkedCheckbox.onCheck = function(checked)
   {
      this.dialog.engine.linkedChannels = checked;
      this.dialog.blackPointControl.visible = checked;
      this.dialog.blackRControl.visible = !checked;
      this.dialog.blackGControl.visible = !checked;
      this.dialog.blackBControl.visible = !checked;
      this.dialog.adjustToContents();
      this.dialog.schedulePreviewUpdate();
   };

   this.blackPointControl = new NumericControl(this);
   this.blackPointControl.label.text = "Black Point:";
   this.blackPointControl.label.setFixedWidth(80);
   this.blackPointControl.setRange(-0.1, 0.5);
   this.blackPointControl.slider.setRange(0, 600);
   this.blackPointControl.slider.minWidth = 150;
   this.blackPointControl.setPrecision(4);
   this.blackPointControl.setValue(this.engine.blackPoint);
   this.blackPointControl.toolTip = "Value subtracted before stretch";
   this.blackPointControl.onValueUpdated = function(value)
   {
      this.dialog.engine.blackPoint = value;
      this.dialog.schedulePreviewUpdate();
   };

   this.blackRControl = new NumericControl(this);
   this.blackRControl.label.text = "Black (R):";
   this.blackRControl.label.setFixedWidth(80);
   this.blackRControl.setRange(-0.1, 0.5);
   this.blackRControl.slider.setRange(0, 600);
   this.blackRControl.slider.minWidth = 150;
   this.blackRControl.setPrecision(4);
   this.blackRControl.setValue(this.engine.blackR);
   this.blackRControl.visible = false;
   this.blackRControl.onValueUpdated = function(value)
   {
      this.dialog.engine.blackR = value;
      this.dialog.schedulePreviewUpdate();
   };

   this.blackGControl = new NumericControl(this);
   this.blackGControl.label.text = "Black (G):";
   this.blackGControl.label.setFixedWidth(80);
   this.blackGControl.setRange(-0.1, 0.5);
   this.blackGControl.slider.setRange(0, 600);
   this.blackGControl.slider.minWidth = 150;
   this.blackGControl.setPrecision(4);
   this.blackGControl.setValue(this.engine.blackG);
   this.blackGControl.visible = false;
   this.blackGControl.onValueUpdated = function(value)
   {
      this.dialog.engine.blackG = value;
      this.dialog.schedulePreviewUpdate();
   };

   this.blackBControl = new NumericControl(this);
   this.blackBControl.label.text = "Black (B):";
   this.blackBControl.label.setFixedWidth(80);
   this.blackBControl.setRange(-0.1, 0.5);
   this.blackBControl.slider.setRange(0, 600);
   this.blackBControl.slider.minWidth = 150;
   this.blackBControl.setPrecision(4);
   this.blackBControl.setValue(this.engine.blackB);
   this.blackBControl.visible = false;
   this.blackBControl.onValueUpdated = function(value)
   {
      this.dialog.engine.blackB = value;
      this.dialog.schedulePreviewUpdate();
   };

   this.autoBlackButton = new PushButton(this);
   this.autoBlackButton.text = "Auto";
   this.autoBlackButton.setFixedWidth(50);
   this.autoBlackButton.toolTip = "Calculate black point from image statistics";
   this.autoBlackButton.onClick = function()
   {
      this.dialog.calculateAutoBlackPoint();
   };

   this.sampleBlackButton = new PushButton(this);
   this.sampleBlackButton.text = "Sample";
   this.sampleBlackButton.setFixedWidth(50);
   this.sampleBlackButton.toolTip = "Sample background from preview (click on dark area)";
   this.sampleBlackButton.onClick = function()
   {
      Console.writeln("Click on a dark background area in the preview to sample black point.");
   };

   var blackButtonsSizer = new HorizontalSizer;
   blackButtonsSizer.spacing = 4;
   blackButtonsSizer.addSpacing(85);
   blackButtonsSizer.add(this.autoBlackButton);
   blackButtonsSizer.add(this.sampleBlackButton);
   blackButtonsSizer.addStretch();

   this.blackPointGroup = new GroupBox(this);
   this.blackPointGroup.title = "Black Point";
   this.blackPointGroup.sizer = new VerticalSizer;
   this.blackPointGroup.sizer.margin = 6;
   this.blackPointGroup.sizer.spacing = 4;
   this.blackPointGroup.sizer.add(this.linkedCheckbox);
   this.blackPointGroup.sizer.add(this.blackPointControl);
   this.blackPointGroup.sizer.add(this.blackRControl);
   this.blackPointGroup.sizer.add(this.blackGControl);
   this.blackPointGroup.sizer.add(this.blackBControl);
   this.blackPointGroup.sizer.add(blackButtonsSizer);

   // --- Color Options Group ---
   this.saturationControl = new NumericControl(this);
   this.saturationControl.label.text = "Saturation:";
   this.saturationControl.label.setFixedWidth(80);
   this.saturationControl.setRange(0.5, 2.0);
   this.saturationControl.slider.setRange(0, 150);
   this.saturationControl.slider.minWidth = 150;
   this.saturationControl.setPrecision(2);
   this.saturationControl.setValue(this.engine.saturation);
   this.saturationControl.toolTip = "Post-stretch saturation adjustment";
   this.saturationControl.onValueUpdated = function(value)
   {
      this.dialog.engine.saturation = value;
      this.dialog.schedulePreviewUpdate();
   };

   this.clippingLabel = new Label(this);
   this.clippingLabel.text = "Clipping:";
   this.clippingLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.clippingLabel.setFixedWidth(80);

   this.clippingCombo = new ComboBox(this);
   this.clippingCombo.addItem("Preserve Color (Lupton)");
   this.clippingCombo.addItem("Hard Clip");
   this.clippingCombo.addItem("Rescale to Max");
   this.clippingCombo.currentItem = this.engine.clippingMode;
   this.clippingCombo.toolTip = "How to handle values exceeding 1.0";
   this.clippingCombo.onItemSelected = function(index)
   {
      this.dialog.engine.clippingMode = index;
      this.dialog.schedulePreviewUpdate();
   };

   var clippingSizer = new HorizontalSizer;
   clippingSizer.spacing = 4;
   clippingSizer.add(this.clippingLabel);
   clippingSizer.add(this.clippingCombo, 100);

   this.colorGroup = new GroupBox(this);
   this.colorGroup.title = "Color Options";
   this.colorGroup.sizer = new VerticalSizer;
   this.colorGroup.sizer.margin = 6;
   this.colorGroup.sizer.spacing = 4;
   this.colorGroup.sizer.add(this.saturationControl);
   this.colorGroup.sizer.add(clippingSizer);

   // --- Action Buttons ---

   this.resetButton = new PushButton(this);
   this.resetButton.text = "Reset";
   this.resetButton.toolTip = "Reset all parameters to default values";
   this.resetButton.onClick = function()
   {
      this.dialog.engine.reset();
      this.dialog.updateControlsFromEngine();
      this.dialog.schedulePreviewUpdate();
   };

   this.applyButton = new PushButton(this);
   this.applyButton.text = "Apply";
   this.applyButton.toolTip = "Apply Lupton RGB stretch to create new image";
   this.applyButton.onClick = function()
   {
      this.dialog.apply();
   };

   var actionSizer = new HorizontalSizer;
   actionSizer.spacing = 6;
   actionSizer.addStretch();
   actionSizer.add(this.resetButton);
   actionSizer.add(this.applyButton);

   // --- Left Panel Assembly ---
   this.leftPanel = new Control(this);
   this.leftPanel.setFixedWidth(310);
   this.leftPanel.sizer = new VerticalSizer;
   this.leftPanel.sizer.margin = 6;
   this.leftPanel.sizer.spacing = 8;
   this.leftPanel.sizer.add(this.inputGroup);
   this.leftPanel.sizer.add(this.stretchGroup);
   this.leftPanel.sizer.add(this.blackPointGroup);
   this.leftPanel.sizer.add(this.colorGroup);
   this.leftPanel.sizer.addStretch();
   this.leftPanel.sizer.add(actionSizer);

   // -------------------------------------------------------------------------
   // Right Panel - Preview
   // -------------------------------------------------------------------------

   // Preview toolbar
   this.realtimeCheckbox = new CheckBox(this);
   this.realtimeCheckbox.text = "Real-Time Preview";
   this.realtimeCheckbox.checked = true;
   this.realtimeCheckbox.toolTip = "Update preview automatically when parameters change";
   this.realtimeCheckbox.onCheck = function(checked)
   {
      if (checked)
         this.dialog.schedulePreviewUpdate();
   };

   this.beforeButton = new PushButton(this);
   this.beforeButton.text = "Before";
   this.beforeButton.setFixedWidth(50);
   this.beforeButton.toolTip = "Show original image";
   this.beforeButton.onClick = function()
   {
      this.dialog.previewControl.previewMode = 1;
      this.dialog.updatePreviewModeButtons();
      this.dialog.schedulePreviewUpdate();
   };

   this.splitButton = new PushButton(this);
   this.splitButton.text = "Split";
   this.splitButton.setFixedWidth(50);
   this.splitButton.toolTip = "Show split before/after view";
   this.splitButton.onClick = function()
   {
      this.dialog.previewControl.previewMode = 2;
      this.dialog.updatePreviewModeButtons();
      this.dialog.schedulePreviewUpdate();
   };

   this.afterButton = new PushButton(this);
   this.afterButton.text = "After";
   this.afterButton.setFixedWidth(50);
   this.afterButton.toolTip = "Show processed image";
   this.afterButton.onClick = function()
   {
      this.dialog.previewControl.previewMode = 0;
      this.dialog.updatePreviewModeButtons();
      this.dialog.schedulePreviewUpdate();
   };

   this.zoomOutButton = new ToolButton(this);
   this.zoomOutButton.text = "-";
   this.zoomOutButton.setFixedWidth(24);
   this.zoomOutButton.toolTip = "Zoom out";

   this.zoomLabel = new Label(this);
   this.zoomLabel.text = "Fit";
   this.zoomLabel.textAlignment = TextAlign_Center;
   this.zoomLabel.setFixedWidth(40);

   this.zoomInButton = new ToolButton(this);
   this.zoomInButton.text = "+";
   this.zoomInButton.setFixedWidth(24);
   this.zoomInButton.toolTip = "Zoom in";

   this.fitButton = new PushButton(this);
   this.fitButton.text = "Fit";
   this.fitButton.setFixedWidth(30);
   this.fitButton.toolTip = "Fit image to preview window";

   var previewToolbar = new HorizontalSizer;
   previewToolbar.spacing = 6;
   previewToolbar.add(this.realtimeCheckbox);
   previewToolbar.addStretch();
   previewToolbar.add(this.beforeButton);
   previewToolbar.add(this.splitButton);
   previewToolbar.add(this.afterButton);
   previewToolbar.addSpacing(10);
   previewToolbar.add(this.zoomOutButton);
   previewToolbar.add(this.zoomLabel);
   previewToolbar.add(this.zoomInButton);
   previewToolbar.add(this.fitButton);

   // Preview canvas
   this.previewControl = new PreviewControl(this, this.engine);
   this.previewControl.setMinSize(400, 300);

   // Split position slider
   this.splitLabel = new Label(this);
   this.splitLabel.text = "Split:";
   this.splitLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.splitLabel.setFixedWidth(35);

   this.splitSlider = new HorizontalSlider(this);
   this.splitSlider.setRange(10, 90);
   this.splitSlider.value = 50;
   this.splitSlider.toolTip = "Adjust split position";
   this.splitSlider.onValueUpdated = function(value)
   {
      this.dialog.previewControl.splitPosition = value;
      this.dialog.schedulePreviewUpdate();
   };

   this.splitControl = new Control(this);
   this.splitControl.sizer = new HorizontalSizer;
   this.splitControl.sizer.spacing = 4;
   this.splitControl.sizer.add(this.splitLabel);
   this.splitControl.sizer.add(this.splitSlider, 100);

   // Cursor info bar
   this.cursorInfoLabel = new Label(this);
   this.cursorInfoLabel.text = "Cursor: (---, ---) | R=-.--- G=-.--- B=-.---";
   this.cursorInfoLabel.textAlignment = TextAlign_Left;

   this.imageSizeLabel = new Label(this);
   this.imageSizeLabel.text = "--- x --- px | 32-bit";
   this.imageSizeLabel.textAlignment = TextAlign_Right;

   var infoSizer = new HorizontalSizer;
   infoSizer.add(this.cursorInfoLabel);
   infoSizer.addStretch();
   infoSizer.add(this.imageSizeLabel);

   // Right panel assembly
   this.rightPanel = new Control(this);
   this.rightPanel.sizer = new VerticalSizer;
   this.rightPanel.sizer.margin = 6;
   this.rightPanel.sizer.spacing = 6;
   this.rightPanel.sizer.add(previewToolbar);
   this.rightPanel.sizer.add(this.previewControl, 100);
   this.rightPanel.sizer.add(this.splitControl);
   this.rightPanel.sizer.add(infoSizer);

   // -------------------------------------------------------------------------
   // Main Layout
   // -------------------------------------------------------------------------

   var mainSizer = new HorizontalSizer;
   mainSizer.add(this.leftPanel);
   mainSizer.add(this.rightPanel, 100);

   // Status bar
   this.statusLabel = new Label(this);
   this.statusLabel.text = "Lupton RGB v" + VERSION + " | Based on Lupton et al. (2004) PASP 116:133";
   this.statusLabel.textAlignment = TextAlign_Left;

   this.timeLabel = new Label(this);
   this.timeLabel.text = "";
   this.timeLabel.textAlignment = TextAlign_Right;

   var statusSizer = new HorizontalSizer;
   statusSizer.margin = 4;
   statusSizer.add(this.statusLabel);
   statusSizer.addStretch();
   statusSizer.add(this.timeLabel);

   this.sizer = new VerticalSizer;
   this.sizer.add(mainSizer, 100);
   this.sizer.add(statusSizer);

   // -------------------------------------------------------------------------
   // Helper Methods
   // -------------------------------------------------------------------------

   this.updatePreviewModeButtons = function()
   {
      var mode = this.previewControl.previewMode;
      // Update button text to show which is active
      this.beforeButton.text = (mode == 1) ? "[Before]" : "Before";
      this.splitButton.text = (mode == 2) ? "[Split]" : "Split";
      this.afterButton.text = (mode == 0) ? "[After]" : "After";
      this.splitControl.visible = (mode == 2);
   };

   this.updateTargetWindow = function()
   {
      if (this.engine.useActiveImage)
      {
         this.targetWindow = ImageWindow.activeWindow;
      }
      else
      {
         // For now, use active window (separate channel handling would need more work)
         this.targetWindow = ImageWindow.activeWindow;
      }

      this.previewControl.sourceWindow = this.targetWindow;

      if (this.targetWindow && this.targetWindow.mainView && this.targetWindow.mainView.image)
      {
         var img = this.targetWindow.mainView.image;
         this.imageSizeLabel.text = format("%d x %d px | 32-bit", img.width, img.height);
      }
      else
      {
         this.imageSizeLabel.text = "No image";
      }

      this.schedulePreviewUpdate();
   };

   this.schedulePreviewUpdate = function()
   {
      if (!this.realtimeCheckbox.checked)
         return;

      // Direct preview update (PJSR doesn't have setTimeout)
      var start = new Date().getTime();
      this.previewControl.updatePreview();
      var elapsed = (new Date().getTime() - start) / 1000;
      this.timeLabel.text = format("Preview: %.2fs", elapsed);
   };

   this.calculateAutoBlackPoint = function()
   {
      if (!this.targetWindow)
      {
         Console.warningln("No image selected for auto black point calculation");
         return;
      }

      var view = this.targetWindow.mainView;

      if (this.engine.linkedChannels)
      {
         // Calculate average black point across channels
         var bp0 = this.engine.calculateAutoBlackPoint(view, 0);
         var bp1 = this.engine.calculateAutoBlackPoint(view, 1);
         var bp2 = this.engine.calculateAutoBlackPoint(view, 2);
         var avgBp = (bp0 + bp1 + bp2) / 3;

         this.engine.blackPoint = avgBp;
         this.blackPointControl.setValue(avgBp);
         Console.writeln(format("Auto black point (linked): %.6f", avgBp));
      }
      else
      {
         var bpR = this.engine.calculateAutoBlackPoint(view, 0);
         var bpG = this.engine.calculateAutoBlackPoint(view, 1);
         var bpB = this.engine.calculateAutoBlackPoint(view, 2);

         this.engine.blackR = bpR;
         this.engine.blackG = bpG;
         this.engine.blackB = bpB;

         this.blackRControl.setValue(bpR);
         this.blackGControl.setValue(bpG);
         this.blackBControl.setValue(bpB);

         Console.writeln(format("Auto black point R: %.6f, G: %.6f, B: %.6f", bpR, bpG, bpB));
      }

      this.schedulePreviewUpdate();
   };

   this.updateControlsFromEngine = function()
   {
      this.stretchControl.setValue(this.engine.stretch);
      this.qControl.setValue(this.engine.Q);
      this.blackPointControl.setValue(this.engine.blackPoint);
      this.blackRControl.setValue(this.engine.blackR);
      this.blackGControl.setValue(this.engine.blackG);
      this.blackBControl.setValue(this.engine.blackB);
      this.linkedCheckbox.checked = this.engine.linkedChannels;
      this.saturationControl.setValue(this.engine.saturation);
      this.clippingCombo.currentItem = this.engine.clippingMode;
      this.useActiveCheckbox.checked = this.engine.useActiveImage;
   };

   this.exportParameters = function()
   {
      Parameters.set("stretch", this.engine.stretch);
      Parameters.set("Q", this.engine.Q);
      Parameters.set("blackPoint", this.engine.blackPoint);
      Parameters.set("blackR", this.engine.blackR);
      Parameters.set("blackG", this.engine.blackG);
      Parameters.set("blackB", this.engine.blackB);
      Parameters.set("linkedChannels", this.engine.linkedChannels);
      Parameters.set("saturation", this.engine.saturation);
      Parameters.set("clippingMode", this.engine.clippingMode);
   };

   this.importParameters = function()
   {
      if (Parameters.has("stretch"))
         this.engine.stretch = Parameters.getReal("stretch");
      if (Parameters.has("Q"))
         this.engine.Q = Parameters.getReal("Q");
      if (Parameters.has("blackPoint"))
         this.engine.blackPoint = Parameters.getReal("blackPoint");
      if (Parameters.has("blackR"))
         this.engine.blackR = Parameters.getReal("blackR");
      if (Parameters.has("blackG"))
         this.engine.blackG = Parameters.getReal("blackG");
      if (Parameters.has("blackB"))
         this.engine.blackB = Parameters.getReal("blackB");
      if (Parameters.has("linkedChannels"))
         this.engine.linkedChannels = Parameters.getBoolean("linkedChannels");
      if (Parameters.has("saturation"))
         this.engine.saturation = Parameters.getReal("saturation");
      if (Parameters.has("clippingMode"))
         this.engine.clippingMode = Parameters.getInteger("clippingMode");

      this.updateControlsFromEngine();
   };

   this.apply = function()
   {
      if (!this.targetWindow)
      {
         (new MessageBox("No target image selected.", TITLE, StdIcon_Error, StdButton_Ok)).execute();
         return;
      }

      Console.show();
      var result = this.engine.execute(this.targetWindow);
      if (result)
      {
         this.timeLabel.text = "Applied successfully";
      }
   };

   // Initialize
   this.populateImageLists();
   this.updateTargetWindow();
   this.updatePreviewModeButtons();

   // Import parameters if running from process icon
   if (Parameters.isViewTarget || Parameters.isGlobalTarget)
   {
      this.importParameters();
   }
}

LuptonDialog.prototype = new Dialog;

// ============================================================================
// Main Entry Point
// ============================================================================

function main()
{
   Console.hide();

   // Check for an active image
   if (ImageWindow.activeWindow.isNull)
   {
      (new MessageBox(
         "Please open an RGB image before running this script.",
         TITLE,
         StdIcon_Error,
         StdButton_Ok
      )).execute();
      return;
   }

   var engine = new LuptonEngine();
   var dialog = new LuptonDialog(engine);

   dialog.execute();
}

main();
