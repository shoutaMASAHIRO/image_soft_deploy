document.addEventListener('DOMContentLoaded', () => {
    // ===== DOM Elements =====
    const imageLoader = document.getElementById('imageLoader');
    const contrastModeBtn = document.getElementById('contrastModeBtn');
    const sharpenModeBtn = document.getElementById('sharpenModeBtn');
    const measureModeBtn = document.getElementById('measureModeBtn');
    const particleSizeModeBtn = document.getElementById('particleSizeModeBtn'); // New
    const downloadBtn = document.getElementById('downloadBtn');
    const resetBtn = document.getElementById('resetBtn');

    // Canvas
    const canvasBefore = document.getElementById('canvas-before');
    const canvasAfter = document.getElementById('canvas-after');
    const ctxBefore = canvasBefore.getContext('2d', { willReadFrequently: true });
    const ctxAfter = canvasAfter.getContext('2d', { willReadFrequently: true });

    // Controls - Contrast
    const contrastControls = document.getElementById('contrast-controls');
    const contrastSlider = document.getElementById('contrastSlider');
    const contrastValue = document.getElementById('contrastValue');
    const resetContrastBtn = document.getElementById('resetContrastBtn');

    // Controls - Sharpen
    const sharpenControls = document.getElementById('sharpen-controls');
    const sharpenSlider = document.getElementById('sharpenSlider');
    const sharpenValue = document.getElementById('sharpenValue');
    const resetSharpenBtn = document.getElementById('resetSharpenBtn');
    
    // Controls - Measurement
    const measureControls = document.getElementById('measure-controls');
    const scaleActionButton = document.getElementById('scaleActionButton');
    const resetScaleContainer = document.getElementById('resetScaleContainer');
    const resetScaleButton = document.getElementById('resetScaleButton');
    const measureActionButton = document.getElementById('measureActionButton');
    const clearMeasurementBtn = document.getElementById('clearMeasurementBtn');

    // Controls - Particle Size (New)
    const particleSizeControls = document.getElementById('particle-size-controls');
    const thresholdSlider = document.getElementById('thresholdSlider');
    const thresholdValue = document.getElementById('thresholdValue');
    const analyzeParticlesBtn = document.getElementById('analyzeParticlesBtn');
    const particleCount = document.getElementById('particleCount');
    const averageDiameterPx = document.getElementById('averageDiameterPx');
    const averageDiameterReal = document.getElementById('averageDiameterReal');
    const averageDiameterUnit = document.getElementById('averageDiameterUnit');
    const clearParticlesBtn = document.getElementById('clearParticlesBtn');
    const remapParticlesBtn = document.getElementById('remapParticlesBtn'); // New
    const remapParticlesContainer = document.getElementById('remapParticlesContainer'); // New
    const roiRealLength = document.getElementById('roiRealLength'); // New
    const roiRealUnit = document.getElementById('roiRealUnit'); // New
    const analyzeMultipleParticlesBtn = document.getElementById('analyzeMultipleParticlesBtn'); // Added

    // Controls - Particle Size Scale (New)
    const particleScaleLengthInput = document.getElementById('particleScaleLengthInput');
    const particleScaleUnitInput = document.getElementById('particleScaleUnitInput');
    const particleScaleActionButton = document.getElementById('particleScaleActionButton');
    const particleResetScaleContainer = document.getElementById('particleResetScaleContainer');
    const particleResetScaleButton = document.getElementById('particleResetScaleButton');
    const particleScaleDisplay = document.getElementById('particleScaleDisplay');

    // Inputs & Displays
    const scaleLengthInput = document.getElementById('scaleLengthInput');
    const scaleUnitInput = document.getElementById('scaleUnitInput');
    const scaleDisplay = document.getElementById('scaleDisplay');
    const measureResult = document.getElementById('measureResult');

    // ===== State =====
    let originalImage = null;
    let currentMode = 'contrast'; // 'contrast', 'sharpen', 'measure', or 'particle_size'
    let measurementPoints = [];
    let scale = { pixels: null, realLength: null, unit: null };
    let particles = []; // Stores detected particles

    // New State Machines
    let calibrationState = 'idle'; // 'idle', 'in_progress', 'complete' for measurement mode
    let measurementState = 'idle'; // 'idle', 'in_progress' for measurement mode
    let particleCalibrationState = 'idle'; // 'idle', 'in_progress', 'complete' for particle size mode
    let particleMeasurementState = 'idle'; // 'idle', 'in_progress' for particle size measurement selection

    let particleScale = { pixels: null, realLength: null, unit: null }; // New: dedicated scale for particle measurement


    // ===== LOGIC & HELPER FUNCTIONS =====

    function applyThresholdContrast(imageData, value) {
        if (!imageData) return null;

        const data = new Uint8ClampedArray(imageData.data); // Work on a copy
        const strength = (value - 100) / 10;
        
        const lut = new Uint8ClampedArray(256);
        if (strength === 0) {
            return new ImageData(data, imageData.width, imageData.height); // Return original if no change
        } else {
            for (let i = 0; i < 256; i++) {
                const x = i / 255;
                const y = 1 / (1 + Math.exp(-strength * (x - 0.5)));
                lut[i] = y * 255;
            }
        }

        for (let i = 0; i < data.length; i += 4) {
            data[i] = lut[data[i]];
            data[i + 1] = lut[data[i + 1]];
            data[i + 2] = lut[data[i + 2]];
        }
        return new ImageData(data, imageData.width, imageData.height);
    }

    function applySharpening(imageData, amount) {
        if (!imageData) return null;

        const src = imageData.data;
        const width = imageData.width;
        const height = imageData.height;

        const factor = amount / 100.0;
        if (factor === 0) {
            return imageData; // Return original if no change
        }
        
        const outputData = new Uint8ClampedArray(src.length);
        const dst = outputData;
        // Copy source to destination, including borders which won't be processed
        dst.set(src);

        const kernel = [
            [-1, -1, -1],
            [-1, 9, -1],
            [-1, -1, -1]
        ];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                for (let c = 0; c < 3; c++) { // For each color channel (R, G, B)
                    const i = (y * width + x) * 4 + c;
                    let total = 0;
                    total += kernel[0][0] * src[((y - 1) * width + (x - 1)) * 4 + c];
                    total += kernel[0][1] * src[((y - 1) * width + x) * 4 + c];
                    total += kernel[0][2] * src[((y - 1) * width + (x + 1)) * 4 + c];
                    total += kernel[1][0] * src[(y * width + (x - 1)) * 4 + c];
                    total += kernel[1][1] * src[(y * width + x) * 4 + c];
                    total += kernel[1][2] * src[(y * width + (x + 1)) * 4 + c];
                    total += kernel[2][0] * src[((y + 1) * width + (x - 1)) * 4 + c];
                    total += kernel[2][1] * src[((y + 1) * width + x) * 4 + c];
                    total += kernel[2][2] * src[((y + 1) * width + (x + 1)) * 4 + c];

                    dst[i] = src[i] * (1 - factor) + total * factor;
                }
            }
        }

        return new ImageData(outputData, width, height);
    }
    
    function redrawAfterCanvas() {
        if (!originalImage) return;

        // 1. Get original image data
        let processedImageData = ctxBefore.getImageData(0, 0, canvasBefore.width, canvasBefore.height);

        // 2. Apply persistent effects (contrast and sharpen)
        processedImageData = applyThresholdContrast(processedImageData, contrastSlider.value);
        processedImageData = applySharpening(processedImageData, sharpenSlider.value);

        // 3. Draw the processed image to the 'After' canvas
        ctxAfter.putImageData(processedImageData, 0, 0);

        // 4. Handle mode-specific overlays or views
        if (currentMode === 'particle_size') {
            applyThreshold(parseInt(thresholdSlider.value)); // Binarize the already processed image
            drawParticlesOutlines(particles);
        }
        
        // Draw measurement overlays on top of the processed image
        if (currentMode === 'measure' || (currentMode === 'particle_size' && particleCalibrationState === 'in_progress')) {
            const markerColor = (calibrationState === 'in_progress' || particleCalibrationState === 'in_progress') ? '#dc3545' : '#ffc107';
            if (measurementPoints.length === 1) {
                drawMarker(measurementPoints[0].x, measurementPoints[0].y, markerColor);
            } else if (measurementPoints.length === 2) {
                drawMarker(measurementPoints[0].x, measurementPoints[0].y, markerColor);
                drawMarker(measurementPoints[1].x, measurementPoints[1].y, markerColor);
                drawLine(measurementPoints[0], measurementPoints[1], markerColor);
            }
        }
        
        // Draw particle ROI selection overlay
        if (currentMode === 'particle_size' && particleMeasurementState === 'in_progress' && measurementPoints.length > 0) {
            const markerColor = '#0000FF';
            drawMarker(measurementPoints[0].x, measurementPoints[0].y, markerColor);
            if (measurementPoints.length === 2) {
                drawMarker(measurementPoints[1].x, measurementPoints[1].y, markerColor);
                drawLine(measurementPoints[0], measurementPoints[1], markerColor);
            }
        }
    }

    function resetMeasurementState() {
        measurementPoints = [];
        scale = { pixels: null, realLength: null, unit: null };
        
        calibrationState = 'idle';
        measurementState = 'idle';
        
        // Reset UI
        scaleDisplay.textContent = '未設定';
        measureResult.textContent = '0 px';
        
        scaleActionButton.textContent = 'スケール設定開始';
        scaleActionButton.classList.remove('btn-danger', 'btn-secondary');
        scaleActionButton.classList.add('btn-info');
        scaleActionButton.disabled = false;

        resetScaleContainer.classList.add('d-none');
        
        measureActionButton.textContent = '測定を開始する';
        measureActionButton.disabled = true;
        
        redrawAfterCanvas(); // Redraw to clear any measurement lines/markers
    }

    function resetSharpeningState() {
        if (!originalImage) return;
        sharpenSlider.value = 0;
        sharpenValue.textContent = 0;
        redrawAfterCanvas();
    }

    function resetApp() {
        if (!originalImage) return;
        ctxAfter.clearRect(0, 0, canvasAfter.width, canvasAfter.height);
        ctxAfter.drawImage(originalImage, 0, 0);
        contrastSlider.value = 100;
        contrastValue.textContent = 100;
        resetSharpeningState();
        resetMeasurementState();
        resetParticleSizeState(); // New: Reset particle size state
        switchMode('contrast'); // Reset to contrast mode
    }
    
    function clearMeasurements() {
        if (!originalImage) return;
        measurementPoints = [];
        // Always reset the measurement result text when clear is called
        const resultUnit = scale.unit ? scale.unit : 'px';
        measureResult.textContent = `0 ${resultUnit}`;
        redrawAfterCanvas(); // Redraw to clear measurement marks but keep scale
    }

    function switchMode(mode) {
        currentMode = mode;
        // Hide all control groups
        contrastControls.classList.add('d-none');
        sharpenControls.classList.add('d-none');
        measureControls.classList.add('d-none');
        particleSizeControls.classList.add('d-none');

        // Reset all mode buttons to secondary
        contrastModeBtn.classList.replace('btn-primary', 'btn-secondary');
        sharpenModeBtn.classList.replace('btn-primary', 'btn-secondary');
        measureModeBtn.classList.replace('btn-primary', 'btn-secondary');
        particleSizeModeBtn.classList.replace('btn-primary', 'btn-secondary');

        if (mode === 'contrast') {
            contrastControls.classList.remove('d-none');
            contrastModeBtn.classList.replace('btn-secondary', 'btn-primary');
        } else if (mode === 'sharpen') {
            sharpenControls.classList.remove('d-none');
            sharpenModeBtn.classList.replace('btn-secondary', 'btn-primary');
        } else if (mode === 'measure') {
            measureControls.classList.remove('d-none');
            measureModeBtn.classList.replace('btn-secondary', 'btn-primary');
        } else if (mode === 'particle_size') {
            particleSizeControls.classList.remove('d-none');
            particleSizeModeBtn.classList.replace('btn-secondary', 'btn-primary');
        }
        
        // Redraw canvas based on the *new* currentMode's state
        if (originalImage) {
            redrawAfterCanvas();
        }
    }
    
    function drawMarker(x, y, color = '#ffc107') {
        ctxAfter.beginPath();
        ctxAfter.arc(x, y, 5, 0, 2 * Math.PI);
        ctxAfter.fillStyle = color;
        ctxAfter.fill();
    }
    
    function drawLine(p1, p2, color = '#ffc107') {
        ctxAfter.beginPath();
        ctxAfter.moveTo(p1.x, p1.y);
        ctxAfter.lineTo(p2.x, p2.y);
        ctxAfter.strokeStyle = color;
        ctxAfter.lineWidth = 2;
        ctxAfter.stroke();
    }

    function drawParticlesOutlines(particlesToDraw) {
        if (!originalImage || !particlesToDraw || particlesToDraw.length === 0) return;
        // This function assumes the canvas is already showing the thresholded image
        // We just draw the outlines on top
        particlesToDraw.forEach(p => {
            ctxAfter.strokeStyle = '#00FF00'; // Green
            ctxAfter.lineWidth = 1;
            // Draw a rectangle around the particle
            ctxAfter.strokeRect(p.minX, p.minY, p.maxX - p.minX + 1, p.maxY - p.minY + 1);
        });
    }

    function resetParticleSizeState() {
        particles = [];
        thresholdSlider.value = 128;
        thresholdValue.textContent = 128;
        particleCount.textContent = '0';
        averageDiameterPx.textContent = '0.00';
        averageDiameterReal.textContent = '未設定';
        averageDiameterUnit.textContent = '未設定';
        roiRealLength.textContent = '未設定'; // Clear ROI real length display
        roiRealUnit.textContent = '未設定'; // Clear ROI real unit display

        // Reset particle scale UI
        particleCalibrationState = 'idle';
        particleScale = { pixels: null, realLength: null, unit: null }; // Reset particle scale object
        particleScaleDisplay.textContent = '未設定';
        particleScaleActionButton.textContent = 'スケール設定開始';
        particleScaleActionButton.classList.remove('btn-danger', 'btn-secondary');
        particleScaleActionButton.classList.add('btn-info');
        particleScaleActionButton.disabled = false;
        particleResetScaleContainer.classList.add('d-none');

        // Reset particle measurement state and UI
        particleMeasurementState = 'idle';
        analyzeParticlesBtn.textContent = '粒径を測定する';
        analyzeParticlesBtn.disabled = true; // Disable until scale is set
        remapParticlesContainer.classList.add('d-none');

        // Redraw canvas to clear any particle markings
        redrawAfterCanvas(); 
    }

    // ===== EVENT LISTENERS =====

    imageLoader.addEventListener('change', e => {
        if (!e.target.files[0]) return;
        const reader = new FileReader();
        reader.onload = event => {
            originalImage = new Image();
            originalImage.onload = () => {
                canvasBefore.width = originalImage.width;
                canvasBefore.height = originalImage.height;
                canvasAfter.width = originalImage.width;
                canvasAfter.height = originalImage.height;
                ctxBefore.drawImage(originalImage, 0, 0);
                resetApp();
            };
            originalImage.src = event.target.result;
        };
        reader.readAsDataURL(e.target.files[0]);
    });

    contrastModeBtn.addEventListener('click', () => switchMode('contrast'));
    sharpenModeBtn.addEventListener('click', () => switchMode('sharpen'));
    measureModeBtn.addEventListener('click', () => switchMode('measure'));
    particleSizeModeBtn.addEventListener('click', () => switchMode('particle_size')); // New
    resetBtn.addEventListener('click', resetApp);
    clearMeasurementBtn.addEventListener('click', clearMeasurements);
    clearParticlesBtn.addEventListener('click', resetParticleSizeState); // New

    resetContrastBtn.addEventListener('click', () => {
        if (!originalImage) return;
        contrastSlider.value = 100;
        contrastValue.textContent = 100;
        redrawAfterCanvas();
    });

    resetSharpenBtn.addEventListener('click', () => {
        resetSharpeningState();
    });

    // --- Measurement Button Listeners ---

    scaleActionButton.addEventListener('click', () => {
        if (calibrationState === 'idle') {
            calibrationState = 'in_progress';
            measurementState = 'idle'; // Cannot measure while calibrating
            clearMeasurements();
            
            scaleActionButton.textContent = 'スケール測定中';
            scaleActionButton.classList.replace('btn-info', 'btn-danger');
            measureActionButton.disabled = true;
            measureActionButton.textContent = '測定を開始する';
        }
    });

    resetScaleButton.addEventListener('click', () => {
        resetMeasurementState();
    });

    measureActionButton.addEventListener('click', () => {
        if (calibrationState === 'complete' && measurementState === 'idle') {
            measurementState = 'in_progress';
            clearMeasurements();
            measureActionButton.textContent = '測定中';
        }
    });

    // --- Particle Size Button Listeners ---
    analyzeParticlesBtn.addEventListener('click', () => {
        console.log('analyzeParticlesBtn clicked. originalImage:', originalImage);
        if (!originalImage) {
            alert('画像を読み込んでください。');
            return;
        }
        if (currentMode !== 'particle_size') return;

        // Start two-point selection for particle analysis area
        particleMeasurementState = 'in_progress';
        measurementPoints = []; // Clear previous selection points
        analyzeParticlesBtn.textContent = '測定中';
        // Hide remap button until measurement is complete
        remapParticlesContainer.classList.add('d-none');
        redrawAfterCanvas(); // Clear any previous drawing
    });

    analyzeMultipleParticlesBtn.addEventListener('click', () => {
        analyzeAllParticles();
    });

    remapParticlesBtn.addEventListener('click', () => {
        if (currentMode !== 'particle_size') return;
        // Restart the two-point selection process
        particleMeasurementState = 'in_progress';
        measurementPoints = [];
        analyzeParticlesBtn.textContent = '測定中';
        remapParticlesContainer.classList.add('d-none');
        
        // Clear previous particle analysis results
        particles = [];
        particleCount.textContent = '0';
        averageDiameterPx.textContent = '0.00';
        averageDiameterReal.textContent = '未設定';
        averageDiameterUnit.textContent = '未設定';

        redrawAfterCanvas(); // Clear any previous drawing
    });

    thresholdSlider.addEventListener('input', (e) => {
        thresholdValue.textContent = e.target.value;
        if (currentMode === 'particle_size' && originalImage) {
            redrawAfterCanvas();
        }
    });

    // --- Particle Size Scale Button Listeners ---
    particleScaleActionButton.addEventListener('click', () => {
        if (particleCalibrationState === 'idle') {
            particleCalibrationState = 'in_progress';
            // Clear current measurement points for calibration
            measurementPoints = []; 
            // Reset the global scale to avoid confusion while calibrating
            particleScale = { pixels: null, realLength: null, unit: null }; 

            particleScaleActionButton.textContent = 'スケール測定中';
            particleScaleActionButton.classList.replace('btn-info', 'btn-danger');
            // Keep it enabled for second click (if the logic was here, but now it's in canvas click)
            // It will be disabled after two points are selected on canvas
            particleScaleActionButton.disabled = false;
        }
    });

    particleResetScaleButton.addEventListener('click', () => {
        // This button resets the particle scale
        particleScale = { pixels: null, realLength: null, unit: null };
        resetParticleSizeState(); // This will reset particle UI including scale part
        redrawAfterCanvas();
    });

    // --- Canvas Click Handler ---

    canvasAfter.addEventListener('click', e => {
        if (!originalImage) return;

        const rect = canvasAfter.getBoundingClientRect();
        const scaleX = canvasAfter.width / rect.width;
        const scaleY = canvasAfter.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        if (currentMode === 'measure') {
            // Do nothing if no action is in progress
            if (calibrationState !== 'in_progress' && measurementState !== 'in_progress') return;

            measurementPoints.push({ x, y });
            const markerColor = (calibrationState === 'in_progress') ? '#dc3545' : '#ffc107';
            drawMarker(x, y, markerColor);

            if (measurementPoints.length === 2) {
                const [p1, p2] = measurementPoints;
                const pixelDistance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

                if (calibrationState === 'in_progress') {
                    const realLength = parseFloat(scaleLengthInput.value);
                    if (!realLength || realLength <= 0) {
                        alert("基準長には0より大きい数値を入力してください。");
                        resetMeasurementState();
                        return;
                    }

                    scale = { pixels: pixelDistance, realLength: realLength, unit: scaleUnitInput.value };
                    scaleDisplay.textContent = `${scale.realLength.toFixed(2)} ${scale.unit} = ${scale.pixels.toFixed(2)} px`;
                    
                    // Finalize calibration state
                    calibrationState = 'complete';
                    scaleActionButton.textContent = '設定完了';
                    scaleActionButton.classList.replace('btn-danger', 'btn-secondary');
                    scaleActionButton.disabled = true;
                    resetScaleContainer.classList.remove('d-none');
                    measureActionButton.disabled = false; // Enable measurement
                    
                    drawLine(p1,p2,markerColor);
                    setTimeout(clearMeasurements, 500);

                } else if (measurementState === 'in_progress') {
                    if (scale.pixels) {
                        const realDistance = (pixelDistance / scale.pixels) * scale.realLength;
                        measureResult.textContent = `${realDistance.toFixed(2)} ${scale.unit}`;
                    } else { 
                        measureResult.textContent = `${pixelDistance.toFixed(2)} px`;
                    }
                    
                    // Reset for next measurement
                    measurementPoints = []; 
                    measureActionButton.textContent = '再測定する';
                    drawLine(p1,p2,markerColor);
                }
                        }
                    } else if (currentMode === 'particle_size' && particleCalibrationState === 'in_progress') {
                        measurementPoints.push({ x, y });
                        drawMarker(x, y, '#dc3545'); // Red marker for calibration
            
                        if (measurementPoints.length === 2) {
                            const [p1, p2] = measurementPoints;
                            const pixelDistance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
                            const realLength = parseFloat(particleScaleLengthInput.value);
            
                            if (!realLength || realLength <= 0) {
                                alert("基準長には0より大きい数値を入力してください。");
                                resetParticleSizeState();
                                return;
                            }
            
                            particleScale = { pixels: pixelDistance, realLength: realLength, unit: particleScaleUnitInput.value };
                            particleScaleDisplay.textContent = `${particleScale.realLength.toFixed(2)} ${particleScale.unit} = ${particleScale.pixels.toFixed(2)} px`;
                            
                            particleCalibrationState = 'complete';
                            particleScaleActionButton.textContent = '設定完了';
                            particleScaleActionButton.classList.replace('btn-danger', 'btn-secondary');
                                            particleScaleActionButton.disabled = true;
                                            particleResetScaleContainer.classList.remove('d-none');
                                            
                                            // Enable analyzeParticlesBtn after scale is set
                                            analyzeParticlesBtn.disabled = false;
                                            
                                            drawLine(p1,p2,'#dc3545');
                                            // Clear measurementPoints after successful calibration
                                            measurementPoints = []; 
                                        }                    } else if (currentMode === 'particle_size' && particleMeasurementState === 'in_progress') {
                        measurementPoints.push({ x, y });
                        drawMarker(x, y, '#0000FF'); // Blue marker for particle measurement selection
            
                                                                        if (measurementPoints.length === 2) {
            
                                                                            const [p1, p2] = measurementPoints;
            
                                                                            const pixelDistance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            
                                                            
            
                                                                            // Calculate and display real unit length of ROI
            
                                                                            if (particleScale.pixels && particleScale.pixels > 0) {
            
                                                                                const realLength = (pixelDistance / particleScale.pixels) * particleScale.realLength;
            
                                                                                roiRealLength.textContent = realLength.toFixed(2);
            
                                                                                roiRealUnit.textContent = particleScale.unit;
            
                                                                            } else {
            
                                                                                roiRealLength.textContent = '未設定';
            
                                                                                roiRealUnit.textContent = '未設定';
            
                                                                            }
            
                                                            
            
                                                                            particleMeasurementState = 'complete';
            
                                                                            analyzeParticlesBtn.textContent = '測定完了';
            
                                                                            remapParticlesContainer.classList.remove('d-none');
            
                                                                            
            
                                                                            // Now perform the actual particle analysis within the selected region
            
                                                                            analyzeParticlesInRegion(p1, p2); // Call a new function to analyze particles in the selected region
            
                                                                            drawLine(p1, p2, '#0000FF'); // Redraw the blue line after analysis
            
                                                                            drawMarker(p1.x, p1.y, '#0000FF');
            
                                                                            drawMarker(p2.x, p2.y, '#0000FF');
            
                                                                        }
            
                                                                    }
            
                                                                });    // --- Other Listeners ---

    contrastSlider.addEventListener('input', e => {
        if (!originalImage) return;
        contrastValue.textContent = e.target.value;
        redrawAfterCanvas();
    });

    sharpenSlider.addEventListener('input', e => {
        if (!originalImage) return;
        sharpenValue.textContent = e.target.value;
        redrawAfterCanvas();
    });

    downloadBtn.addEventListener('click', () => {
        if (!originalImage) return;
        const link = document.createElement('a');
        link.download = 'edited-image.png';
        link.href = canvasAfter.toDataURL('image/png');
        link.click();
    });

    // Initial setup
    switchMode('contrast');

    window.addEventListener('unload', () => {
        if (navigator.sendBeacon) {
            navigator.sendBeacon('/shutdown', new Blob(), {type : 'application/x-www-form-urlencoded'});
        }
    });

    // --- Particle Size Measurement Functions ---

    function grayscale(imageData) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = avg;     // red
            data[i + 1] = avg; // green
            data[i + 2] = avg; // blue
        }
        return imageData;
    }

    function applyThreshold(threshold) {
        if (!originalImage) return;
        // Get the current, processed image data from the 'After' canvas
        let imageData = ctxAfter.getImageData(0, 0, canvasAfter.width, canvasAfter.height);
        imageData = grayscale(imageData); // Convert to grayscale first

        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const brightness = data[i]; // Since it's grayscale, R, G, B are the same
            const value = brightness > threshold ? 255 : 0;
            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
        }
        ctxAfter.putImageData(imageData, 0, 0);
    }

    // New function to analyze all particles on the canvas
    function analyzeAllParticles() {
        if (!originalImage) {
            alert('画像を読み込んでください。');
            return;
        }
        if (currentMode !== 'particle_size') {
            // Silently switch to particle size mode if not already in it
            switchMode('particle_size');
        }

        // Define ROI as the entire canvas
        const p1 = { x: 0, y: 0 };
        const p2 = { x: canvasAfter.width, y: canvasAfter.height };

        // Analyze particles in the full region
        analyzeParticlesInRegion(p1, p2);

        // Redraw the canvas to show the outlines on the thresholded image
        redrawAfterCanvas(); 
        drawParticlesOutlines(particles); 
    }
    
    // New function to analyze particles within a specified region
    function analyzeParticlesInRegion(p1, p2) {
        if (!originalImage) {
            alert('画像を読み込んでください。');
            return;
        }

        // Determine the region of interest (ROI)
        const roiMinX = Math.min(p1.x, p2.x);
        const roiMaxX = Math.max(p1.x, p2.x);
        const roiMinY = Math.min(p1.y, p2.y);
        const roiMaxY = Math.max(p1.y, p2.y);

        // Ensure image is drawn and thresholded before analysis
        applyThreshold(parseInt(thresholdSlider.value));

        let imageData = ctxAfter.getImageData(0, 0, canvasAfter.width, canvasAfter.height);
        const width = imageData.width;
        const height = imageData.height;
        const pixels = imageData.data;

        const visited = new Uint8Array(width * height); // To keep track of visited pixels
        particles = [];

        // Helper to get pixel value (0 or 255) at (x, y)
        const getPixel = (x, y) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return 0; // Treat out-of-bounds as background
            return pixels[(y * width + x) * 4];
        };

        // Flood fill to find connected components (particles)
        const floodFill = (startX, startY) => {
            const queue = [{ x: startX, y: startY }];
            let minX = startX, maxX = startX, minY = startY, maxY = startY;
            let pixelCount = 0;

            while (queue.length > 0) {
                const { x, y } = queue.shift();
                const index = y * width + x;

                if (x < roiMinX || x > roiMaxX || y < roiMinY || y > roiMaxY || // Check if within ROI
                    x < 0 || x >= width || y < 0 || y >= height || visited[index] || getPixel(x, y) === 0) {
                    continue;
                }

                visited[index] = 1;
                pixelCount++;

                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);

                queue.push({ x: x + 1, y: y });
                queue.push({ x: x - 1, y: y });
                queue.push({ x: x, y: y + 1 });
                queue.push({ x: x, y: y - 1 });
            }
            if (pixelCount > 0) {
                const particleWidth = maxX - minX + 1;
                const particleHeight = maxY - minY + 1;
                // Approximate diameter as average of bounding box dimensions
                const diameterPx = (particleWidth + particleHeight) / 2; 
                particles.push({
                    x: (minX + maxX) / 2, // Center X
                    y: (minY + maxY) / 2, // Center Y
                    width: particleWidth,
                    height: particleHeight,
                    diameterPx: diameterPx,
                    pixelCount: pixelCount,
                    minX: minX, // Store for drawing outlines
                    minY: minY, // Store for drawing outlines
                    maxX: maxX, // Store for drawing outlines
                    maxY: maxY  // Store for drawing outlines
                });
            }
        };

        for (let y = Math.floor(roiMinY); y <= Math.ceil(roiMaxY); y++) { // Iterate only within ROI
            for (let x = Math.floor(roiMinX); x <= Math.ceil(roiMaxX); x++) { // Iterate only within ROI
                const index = y * width + x;
                if (!visited[index] && getPixel(x, y) === 255) { // If unvisited and foreground pixel
                    floodFill(x, y);
                }
            }
        }
        
        // Filter out very small particles (noise) and particles with skewed aspect ratio
        const minPixelCount = 5; // Adjust as needed
        const maxAspectRatio = 1.5; // Adjust as needed to exclude more/less elongated shapes
        particles = particles.filter(p => {
            if (p.pixelCount < minPixelCount) {
                return false;
            }
            if (p.width === 0 || p.height === 0) {
                return false; // Exclude lines or points
            }
            const aspectRatio = Math.max(p.width, p.height) / Math.min(p.width, p.height);
            return aspectRatio <= maxAspectRatio;
        });

        let totalDiameterPx = 0;
        particles.forEach(p => {
            totalDiameterPx += p.diameterPx;
            // The drawing is now handled by drawParticlesOutlines
        });

        const count = particles.length;
        const avgDiameterPx = count > 0 ? (totalDiameterPx / count) : 0;
        
        particleCount.textContent = count;
        averageDiameterPx.textContent = avgDiameterPx.toFixed(2);

        if (particleScale.pixels && count > 0) { // Use particleScale here
            console.log('particleScale is set:', particleScale);
            const avgDiameterReal = (avgDiameterPx / particleScale.pixels) * particleScale.realLength;
            averageDiameterReal.textContent = avgDiameterReal.toFixed(2);
            averageDiameterUnit.textContent = particleScale.unit;
        } else {
            console.log('particleScale not set or no particles detected. particleScale:', particleScale, 'count:', count);
            averageDiameterReal.textContent = '未設定';
            averageDiameterUnit.textContent = '未設定';
        }
    }
});

