document.addEventListener('DOMContentLoaded', () => {
    // ===== DOM Elements =====
    const imageLoader = document.getElementById('imageLoader');
    const contrastModeBtn = document.getElementById('contrastModeBtn');
    const sharpenModeBtn = document.getElementById('sharpenModeBtn');
    const measureModeBtn = document.getElementById('measureModeBtn');
    const particleSizeModeBtn = document.getElementById('particleSizeModeBtn');
    const roiSelectModeBtn = document.getElementById('roiSelectModeBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const resetBtn = document.getElementById('resetBtn');

    // Canvas
    const canvasBefore = document.getElementById('canvas-before');
    const canvasAfter = document.getElementById('canvas-after');
    const ctxBefore = canvasBefore.getContext('2d', { willReadFrequently: true });
    const ctxAfter = canvasAfter.getContext('2d', { willReadFrequently: true });
    
    // Off-screen canvas for pre-processing
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // Modal Elements
    const cropResultModalEl = document.getElementById('cropResultModal');
    const cropResultModal = new bootstrap.Modal(cropResultModalEl);
    const canvasCroppedModal = document.getElementById('canvas-cropped-modal');
    const ctxCroppedModal = canvasCroppedModal.getContext('2d');
    const setCroppedAsNewBtnModal = document.getElementById('setCroppedAsNewBtnModal');

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

    // Controls - Particle Size
    const particleSizeControls = document.getElementById('particle-size-controls');
    const thresholdSlider = document.getElementById('thresholdSlider');
    const thresholdValue = document.getElementById('thresholdValue');
    const resetThresholdBtn = document.getElementById('resetThresholdBtn'); // Add this line
    const analyzeParticlesBtn = document.getElementById('analyzeParticlesBtn');
    const particleCount = document.getElementById('particleCount');
    const averageDiameterPx = document.getElementById('averageDiameterPx');
    const averageDiameterReal = document.getElementById('averageDiameterReal');
    const averageDiameterUnit = document.getElementById('averageDiameterUnit');
    const clearParticlesBtn = document.getElementById('clearParticlesBtn');
    const remapParticlesBtn = document.getElementById('remapParticlesBtn');
    const remapParticlesContainer = document.getElementById('remapParticlesContainer');
    const roiRealLength = document.getElementById('roiRealLength');
    const roiRealUnit = document.getElementById('roiRealUnit');
    const analyzeMultipleParticlesBtn = document.getElementById('analyzeMultipleParticlesBtn');

    // Controls - Particle Size Scale
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
    let currentMode = 'contrast'; // 'contrast', 'sharpen', 'measure', 'particle_size', 'roi_select'
    let measurementPoints = [];
    let scale = { pixels: null, realLength: null, unit: null };
    let particles = [];

    let originalImageWidth = 0;
    let originalImageHeight = 0;

    let calibrationState = 'idle';
    let measurementState = 'idle';
    let particleCalibrationState = 'idle';
    let particleMeasurementState = 'idle';
    let particleScale = { pixels: null, realLength: null, unit: null };

    // New State for ROI Selection
    let isSelecting = false;
    let selectionRect = { startX: 0, startY: 0, endX: 0, endY: 0 };
    let croppedImageData = null;


    // ===== LOGIC & HELPER FUNCTIONS =====

    function applyThresholdContrast(imageData, value) {
        if (!imageData) return null;

        const data = new Uint8ClampedArray(imageData.data);
        const strength = (value - 100) / 10;
        
        const lut = new Uint8ClampedArray(256);
        if (strength === 0) {
            return new ImageData(data, imageData.width, imageData.height);
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
            return imageData;
        }
        
        const outputData = new Uint8ClampedArray(src.length);
        const dst = outputData;
        dst.set(src);

        const kernel = [
            [-1, -1, -1],
            [-1, 9, -1],
            [-1, -1, -1]
        ];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                for (let c = 0; c < 3; c++) {
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

        // 1. Prepare temp canvas with original image dimensions
        tempCanvas.width = originalImageWidth;
        tempCanvas.height = originalImageHeight;
        
        // 2. Get original image data from 'before' canvas
        let processedImageData = ctxBefore.getImageData(0, 0, originalImageWidth, originalImageHeight);

        // 3. Apply persistent effects (contrast and sharpen)
        processedImageData = applyThresholdContrast(processedImageData, contrastSlider.value);
        processedImageData = applySharpening(processedImageData, sharpenSlider.value);

        // 4. Put the processed data onto the temp canvas
        tempCtx.putImageData(processedImageData, 0, 0);

        // 5. For all other modes, ensure 'after' canvas has original dimensions
        canvasAfter.width = originalImageWidth;
        canvasAfter.height = originalImageHeight;
        // Draw the processed image from the temp canvas
        ctxAfter.drawImage(tempCanvas, 0, 0);


        // 6. Handle mode-specific overlays or further processing on 'after' canvas
        if (currentMode === 'particle_size') {
            applyThreshold(parseInt(thresholdSlider.value));
            drawParticlesOutlines(particles);
        }
        
        // Draw measurement overlays
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

        // Draw ROI selection rectangle
        if (isSelecting) {
            ctxAfter.strokeStyle = 'red';
            ctxAfter.lineWidth = 4;
            const { x, y, w, h } = getSelectionRect();
            ctxAfter.strokeRect(x, y, w, h);
        }
    }

    function resetMeasurementState() {
        measurementPoints = [];
        scale = { pixels: null, realLength: null, unit: null };
        calibrationState = 'idle';
        measurementState = 'idle';
        scaleDisplay.textContent = '未設定';
        measureResult.textContent = '0 px';
        scaleActionButton.textContent = 'スケール設定開始';
        scaleActionButton.classList.remove('btn-danger', 'btn-secondary');
        scaleActionButton.classList.add('btn-info');
        scaleActionButton.disabled = false;
        resetScaleContainer.classList.add('d-none');
        measureActionButton.textContent = '測定を開始する';
        measureActionButton.disabled = true;
        redrawAfterCanvas();
    }

    function resetSharpeningState() {
        if (!originalImage) return;
        sharpenSlider.value = 0;
        sharpenValue.textContent = 0;
        redrawAfterCanvas();
    }
    
    function resetApp() {
        if (!originalImage) return;
        
        // Reset image and canvas size
        canvasAfter.width = originalImageWidth;
        canvasAfter.height = originalImageHeight;
        ctxAfter.drawImage(originalImage, 0, 0);

        // Ensure canvas is responsive by default
        canvasAfter.classList.add('img-fluid');

        // Reset effect controls
        contrastSlider.value = 100;
        contrastValue.textContent = 100;
        
        // Reset individual mode states
        resetSharpeningState();
        resetMeasurementState();
        resetParticleSizeState();
        resetCroppedImageState();
        
        // Default to contrast mode and redraw
        switchMode('contrast');
    }
    
    function clearMeasurements() {
        if (!originalImage) return;
        measurementPoints = [];
        const resultUnit = scale.unit ? scale.unit : 'px';
        measureResult.textContent = `0 ${resultUnit}`;
        redrawAfterCanvas();
    }

    function switchMode(mode) {
        // Toggle behavior for roi_select
        if (currentMode === 'roi_select' && mode === 'roi_select') {
            switchMode('contrast'); // Default back to contrast mode
            return;
        }

        currentMode = mode;
        // Hide all control groups
        const allControls = document.querySelectorAll('.control-group');
        allControls.forEach(c => c.classList.add('d-none'));

        // Reset all mode buttons to secondary
        const allModeBtns = [contrastModeBtn, sharpenModeBtn, measureModeBtn, particleSizeModeBtn, roiSelectModeBtn];
        allModeBtns.forEach(btn => {
            btn.classList.replace('btn-primary', 'btn-secondary');
            if (btn.id === 'roiSelectModeBtn') btn.textContent = '範囲選択';
        });

        // Default to responsive canvas, remove for specific modes
        canvasAfter.classList.add('img-fluid');

        // Show the active control group and set button to primary
        let activeControls = null;
        let activeButton = null;
        let isRoiMode = false;

        if (mode === 'contrast') {
            activeControls = contrastControls;
            activeButton = contrastModeBtn;
        } else if (mode === 'sharpen') {
            activeControls = sharpenControls;
            activeButton = sharpenModeBtn;
        } else if (mode === 'measure') {
            activeControls = measureControls;
            activeButton = measureModeBtn;
        } else if (mode === 'particle_size') {
            activeControls = particleSizeControls;
            activeButton = particleSizeModeBtn;
        } else if (mode === 'roi_select') {
            activeButton = roiSelectModeBtn;
            activeButton.textContent = '選択中（ドラッグで選択）';
            isRoiMode = true;
        }
        
        if (activeControls) activeControls.classList.remove('d-none');
        if (activeButton) activeButton.classList.replace('btn-secondary', 'btn-primary');
        
        canvasAfter.style.cursor = isRoiMode ? 'crosshair' : 'default';

        // Redraw canvas to reflect the state of the new mode
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
        particlesToDraw.forEach(p => {
            ctxAfter.strokeStyle = '#00FF00';
            ctxAfter.lineWidth = 1;
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
        roiRealLength.textContent = '未設定';
        roiRealUnit.textContent = '未設定';

        particleCalibrationState = 'idle';
        particleScale = { pixels: null, realLength: null, unit: null };
        particleScaleDisplay.textContent = '未設定';
        particleScaleActionButton.textContent = 'スケール設定開始';
        particleScaleActionButton.classList.remove('btn-danger', 'btn-secondary');
        particleScaleActionButton.classList.add('btn-info');
        particleScaleActionButton.disabled = false;
        particleResetScaleContainer.classList.add('d-none');

        particleMeasurementState = 'idle';
        analyzeParticlesBtn.textContent = '粒径を測定する';
        analyzeParticlesBtn.disabled = true;
        remapParticlesContainer.classList.add('d-none');

        redrawAfterCanvas(); 
    }

    // ===== NEW ROI FUNCTIONS =====
    function getSelectionRect() {
        const x = Math.min(selectionRect.startX, selectionRect.endX);
        const y = Math.min(selectionRect.startY, selectionRect.endY);
        const w = Math.abs(selectionRect.startX - selectionRect.endX);
        const h = Math.abs(selectionRect.startY - selectionRect.endY);
        return { x, y, w, h };
    }

    function cropImageAndShowModal() {
        if (!originalImage) return;
        const rect = getSelectionRect();
        if (rect.w < 1 || rect.h < 1) {
            resetCroppedImageState();
            return;
        }

        // Crop from the original 'before' canvas
        croppedImageData = ctxBefore.getImageData(rect.x, rect.y, rect.w, rect.h);
        
        canvasCroppedModal.width = rect.w;
        canvasCroppedModal.height = rect.h;
        ctxCroppedModal.putImageData(croppedImageData, 0, 0);
        
        cropResultModal.show();
    }
    
    function resetCroppedImageState() {
        croppedImageData = null;
        ctxCroppedModal.clearRect(0, 0, canvasCroppedModal.width, canvasCroppedModal.height);
    }
    
    function setCroppedAsNew() {
        if (!croppedImageData) return;
        
        cropResultModal.hide(); // Hide the modal first

        const newImage = new Image();
        const tempCropCanvas = document.createElement('canvas');
        tempCropCanvas.width = croppedImageData.width;
        tempCropCanvas.height = croppedImageData.height;
        tempCropCanvas.getContext('2d').putImageData(croppedImageData, 0, 0);

        newImage.onload = () => {
            originalImage = newImage; // Set the cropped image as the new original
            originalImageWidth = originalImage.width;
            originalImageHeight = originalImage.height;

            canvasBefore.width = originalImageWidth;
            canvasBefore.height = originalImageHeight;
            ctxBefore.drawImage(originalImage, 0, 0);
            
            resetApp();
        };
        newImage.src = tempCropCanvas.toDataURL();
    }


    // ===== EVENT LISTENERS =====

    imageLoader.addEventListener('change', e => {
        if (!e.target.files[0]) return;
        const reader = new FileReader();
        reader.onload = event => {
            originalImage = new Image();
            originalImage.onload = () => {
                originalImageWidth = originalImage.width;
                originalImageHeight = originalImage.height;

                canvasBefore.width = originalImageWidth;
                canvasBefore.height = originalImageHeight;
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
    particleSizeModeBtn.addEventListener('click', () => switchMode('particle_size'));
    roiSelectModeBtn.addEventListener('click', () => switchMode('roi_select'));
    
    resetBtn.addEventListener('click', resetApp);
    clearMeasurementBtn.addEventListener('click', clearMeasurements);
    clearParticlesBtn.addEventListener('click', resetParticleSizeState);

    // New Listeners for Modal
    setCroppedAsNewBtnModal.addEventListener('click', setCroppedAsNew);
    cropResultModalEl.addEventListener('hidden.bs.modal', resetCroppedImageState);


    resetContrastBtn.addEventListener('click', () => {
        if (!originalImage) return;
        contrastSlider.value = 100;
        contrastValue.textContent = 100;
        redrawAfterCanvas();
    });

    resetSharpenBtn.addEventListener('click', resetSharpeningState);

    resetThresholdBtn.addEventListener('click', () => {
        if (!originalImage) return;
        thresholdSlider.value = 128;
        thresholdValue.textContent = 128;
        redrawAfterCanvas();
    });

    // --- Measurement Button Listeners ---

    scaleActionButton.addEventListener('click', () => {
        if (calibrationState === 'idle') {
            calibrationState = 'in_progress';
            measurementState = 'idle';
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
        if (!originalImage) {
            alert('画像を読み込んでください。');
            return;
        }
        if (currentMode !== 'particle_size') return;

        particleMeasurementState = 'in_progress';
        measurementPoints = [];
        analyzeParticlesBtn.textContent = '測定中';
        remapParticlesContainer.classList.add('d-none');
        redrawAfterCanvas();
    });

    analyzeMultipleParticlesBtn.addEventListener('click', () => {
        analyzeAllParticles();
    });

    remapParticlesBtn.addEventListener('click', () => {
        if (currentMode !== 'particle_size') return;
        particleMeasurementState = 'in_progress';
        measurementPoints = [];
        analyzeParticlesBtn.textContent = '測定中';
        remapParticlesContainer.classList.add('d-none');
        particles = [];
        particleCount.textContent = '0';
        averageDiameterPx.textContent = '0.00';
        averageDiameterReal.textContent = '未設定';
        averageDiameterUnit.textContent = '未設定';
        redrawAfterCanvas();
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
            measurementPoints = []; 
            particleScale = { pixels: null, realLength: null, unit: null }; 
            particleScaleActionButton.textContent = 'スケール測定中';
            particleScaleActionButton.classList.replace('btn-info', 'btn-danger');
            particleScaleActionButton.disabled = false;
        }
    });

    particleResetScaleButton.addEventListener('click', () => {
        particleScale = { pixels: null, realLength: null, unit: null };
        resetParticleSizeState();
        redrawAfterCanvas();
    });

    // --- Canvas Click & Drag Handler ---
    
    function getCanvasCoordinates(e) {
        const rect = canvasAfter.getBoundingClientRect();
        const scaleX = canvasAfter.width / rect.width;
        const scaleY = canvasAfter.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        return { x, y };
    }

    canvasAfter.addEventListener('mousedown', e => {
        if (currentMode === 'roi_select') {
            if (!originalImage) return;
            const { x, y } = getCanvasCoordinates(e);
            isSelecting = true;
            selectionRect.startX = x;
            selectionRect.startY = y;
            selectionRect.endX = x;
            selectionRect.endY = y;
        }
    });
    
    canvasAfter.addEventListener('mousemove', e => {
        if (currentMode === 'roi_select' && isSelecting) {
            const { x, y } = getCanvasCoordinates(e);
            selectionRect.endX = x;
            selectionRect.endY = y;
            redrawAfterCanvas();
        }
    });

    canvasAfter.addEventListener('mouseup', e => {
        if (currentMode === 'roi_select') {
            if (!originalImage || !isSelecting) return;
            isSelecting = false;
            cropImageAndShowModal();
            redrawAfterCanvas(); // Clear the selection rectangle
        }
    });


    canvasAfter.addEventListener('click', e => {
        if (!originalImage) return;
        if (isSelecting) return; // Prevent click from firing right after a drag

        const { x, y } = getCanvasCoordinates(e);

        if (currentMode === 'measure') {
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
                    
                    calibrationState = 'complete';
                    scaleActionButton.textContent = '設定完了';
                    scaleActionButton.classList.replace('btn-danger', 'btn-secondary');
                    scaleActionButton.disabled = true;
                    resetScaleContainer.classList.remove('d-none');
                    measureActionButton.disabled = false;
                    
                    drawLine(p1,p2,markerColor);
                    setTimeout(clearMeasurements, 500);

                } else if (measurementState === 'in_progress') {
                    if (scale.pixels) {
                        const realDistance = (pixelDistance / scale.pixels) * scale.realLength;
                        measureResult.textContent = `${realDistance.toFixed(2)} ${scale.unit}`;
                    } else { 
                        measureResult.textContent = `${pixelDistance.toFixed(2)} px`;
                    }
                    
                    measurementPoints = []; 
                    measureActionButton.textContent = '再測定する';
                    drawLine(p1,p2,markerColor);
                }
            }
        } else if (currentMode === 'particle_size' && particleCalibrationState === 'in_progress') {
            measurementPoints.push({ x, y });
            drawMarker(x, y, '#dc3545');
            
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
                analyzeParticlesBtn.disabled = false;
                
                drawLine(p1,p2,'#dc3545');
                measurementPoints = []; 
            }
        } else if (currentMode === 'particle_size' && particleMeasurementState === 'in_progress') {
            measurementPoints.push({ x, y });
            drawMarker(x, y, '#0000FF');
            
            if (measurementPoints.length === 2) {
                const [p1, p2] = measurementPoints;
                const pixelDistance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            
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
                
                analyzeParticlesInRegion(p1, p2);
                drawLine(p1, p2, '#0000FF');
                drawMarker(p1.x, p1.y, '#0000FF');
                drawMarker(p2.x, p2.y, '#0000FF');
            }
        }
    });

    // --- Other Listeners ---

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
            data[i] = avg;
            data[i + 1] = avg;
            data[i + 2] = avg;
        }
        return imageData;
    }

    function applyThreshold(threshold) {
        if (!originalImage) return;
        let imageData = ctxAfter.getImageData(0, 0, canvasAfter.width, canvasAfter.height);
        imageData = grayscale(imageData);

        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const brightness = data[i];
            const value = brightness > threshold ? 255 : 0;
            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
        }
        ctxAfter.putImageData(imageData, 0, 0);
    }

    function analyzeAllParticles() {
        if (!originalImage) {
            alert('画像を読み込んでください。');
            return;
        }
        if (currentMode !== 'particle_size') {
            switchMode('particle_size');
        }

        const p1 = { x: 0, y: 0 };
        const p2 = { x: canvasAfter.width, y: canvasAfter.height };

        analyzeParticlesInRegion(p1, p2);

        redrawAfterCanvas(); 
        drawParticlesOutlines(particles); 
    }
    
    function analyzeParticlesInRegion(p1, p2) {
        if (!originalImage) {
            alert('画像を読み込んでください。');
            return;
        }

        const roiMinX = Math.min(p1.x, p2.x);
        const roiMaxX = Math.max(p1.x, p2.x);
        const roiMinY = Math.min(p1.y, p2.y);
        const roiMaxY = Math.max(p1.y, p2.y);

        applyThreshold(parseInt(thresholdSlider.value));

        let imageData = ctxAfter.getImageData(0, 0, canvasAfter.width, canvasAfter.height);
        const width = imageData.width;
        const height = imageData.height;
        const pixels = imageData.data;

        const visited = new Uint8Array(width * height);
        particles = [];

        const getPixel = (x, y) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return 0;
            return pixels[(y * width + x) * 4];
        };

        const floodFill = (startX, startY) => {
            const queue = [{ x: startX, y: startY }];
            let minX = startX, maxX = startX, minY = startY, maxY = startY;
            let pixelCount = 0;

            while (queue.length > 0) {
                const { x, y } = queue.shift();
                const index = y * width + x;

                if (x < roiMinX || x > roiMaxX || y < roiMinY || y > roiMaxY ||
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
                const diameterPx = (particleWidth + particleHeight) / 2; 
                particles.push({
                    x: (minX + maxX) / 2,
                    y: (minY + maxY) / 2,
                    width: particleWidth,
                    height: particleHeight,
                    diameterPx: diameterPx,
                    pixelCount: pixelCount,
                    minX: minX,
                    minY: minY,
                    maxX: maxX,
                    maxY: maxY
                });
            }
        };

        for (let y = Math.floor(roiMinY); y <= Math.ceil(roiMaxY); y++) {
            for (let x = Math.floor(roiMinX); x <= Math.ceil(roiMaxX); x++) {
                const index = y * width + x;
                if (!visited[index] && getPixel(x, y) === 255) {
                    floodFill(x, y);
                }
            }
        }
        
        const minPixelCount = 5;
        const maxAspectRatio = 1.5;
        particles = particles.filter(p => {
            if (p.pixelCount < minPixelCount) return false;
            if (p.width === 0 || p.height === 0) return false;
            const aspectRatio = Math.max(p.width, p.height) / Math.min(p.width, p.height);
            return aspectRatio <= maxAspectRatio;
        });

        let totalDiameterPx = 0;
        particles.forEach(p => { totalDiameterPx += p.diameterPx; });

        const count = particles.length;
        const avgDiameterPx = count > 0 ? (totalDiameterPx / count) : 0;
        
        particleCount.textContent = count;
        averageDiameterPx.textContent = avgDiameterPx.toFixed(2);

        if (particleScale.pixels && count > 0) {
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