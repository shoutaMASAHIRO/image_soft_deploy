document.addEventListener('DOMContentLoaded', () => {

    // ===== NEW: Weighing History Functions =====

    async function loadFormulaHistory() {
        try {
            const response = await fetch('/api/formulas');
            if (!response.ok) {
                throw new Error(`Failed to fetch history: ${response.statusText}`);
            }
            const data = await response.json();

            // Store for new search feature
            allProductFormulas = data.products || [];
            allReactantFormulas = data.reactants || [];

            const productDatalist = document.getElementById('product-formula-list');
            const reactantDatalist = document.getElementById('reactant-formula-list');

            if (productDatalist) {
                productDatalist.innerHTML = ''; // Clear existing options
                allProductFormulas.forEach(formula => {
                    const option = document.createElement('option');
                    option.value = formula;
                    productDatalist.appendChild(option);
                });
            }

            if (reactantDatalist) {
                reactantDatalist.innerHTML = ''; // Clear existing options
                allReactantFormulas.forEach(formula => {
                    const option = document.createElement('option');
                    option.value = formula;
                    reactantDatalist.appendChild(option);
                });
            }
        } catch (error) {
            console.error("Error loading formula history:", error);
        }
    }

    async function saveFormulaHistory(product, reactants) {
        // Filter out any empty/whitespace-only reactant strings
        const validReactants = reactants.map(r => r.trim()).filter(r => r);
        if (!product.trim() && validReactants.length === 0) {
            return; // Nothing to save
        }

        try {
            const response = await fetch('/api/formulas', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ product: product.trim(), reactants: validReactants }),
            });

            if (!response.ok) {
                throw new Error(`Failed to save history: ${response.statusText}`);
            }

            // Refresh the datalists with the newly added items
            await loadFormulaHistory();

        } catch (error) {
            console.error("Error saving formula history:", error);
        }
    }

    // ===== Generic Weighing Calculation =====

    const ATOMIC_WEIGHTS = {
        H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.180,
        Na: 22.990, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078,
        Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38,
        Ga: 69.723, Ge: 72.630, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798, Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224,
        Nb: 92.906, Mo: 95.96, Tc: 98, Ru: 101.07, Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41, In: 114.82, Sn: 118.71,
        Sb: 121.76, Te: 127.60, I: 126.90, Xe: 131.29, Cs: 132.91, Ba: 137.33, La: 138.91, Ce: 140.12, Pr: 140.91, Nd: 144.24,
        Pm: 145, Sm: 150.36, Eu: 151.96, Gd: 157.25, Tb: 158.93, Dy: 162.50, Ho: 164.93, Er: 167.26, Tm: 168.93, Yb: 173.05,
        Lu: 174.97, Hf: 178.49, Ta: 180.95, W: 183.84, Re: 186.21, Os: 190.23, Ir: 192.22, Pt: 195.08, Au: 196.97, Hg: 200.59,
        Tl: 204.38, Pb: 207.2, Bi: 208.98, Po: 209, At: 210, Rn: 222, Fr: 223, Ra: 226, Ac: 227, Th: 232.04, Pa: 231.04, U: 238.03
    };

    const weighingElements = {
        productFormula: document.getElementById('productFormula'),
        reactantInputs: document.querySelectorAll('[name="reactantFormula"]'),
        x_val: document.getElementById('smComposition'), // Re-using the ID, but it's just 'x' now
        amount: document.getElementById('productAmount'),
        amountLabel: document.getElementById('productAmountLabel'),
        modeMass: document.getElementById('modeMass'),
        modeMol: document.getElementById('modeMol'),
        calculateBtn: document.getElementById('calculateWeighingBtn'),
        
        // Result containers
        resProdFormula: document.getElementById('res-prod-formula'),
        resProdMolarMass: document.getElementById('res-prod-molar-mass'),
        resProdMoles: document.getElementById('res-prod-moles'),
        resProdMass: document.getElementById('res-prod-mass'),
        reactantResultsContainer: document.getElementById('reactant-results-container'),
    };

    // ===== NEW: Formula Search Functionality =====
    let allProductFormulas = [];
    let allReactantFormulas = [];
    let lastFocusedReactantInput = null;

    function renderSearchResults(searchTerm, formulaList, resultsContainer) {
        resultsContainer.innerHTML = '';
        if (!searchTerm) {
            resultsContainer.classList.remove('d-block');
            return;
        }

        const filtered = formulaList.filter(f => f.toLowerCase().includes(searchTerm.toLowerCase()));
        
        if (filtered.length === 0) {
            resultsContainer.classList.remove('d-block');
            return;
        }

        const list = document.createElement('div');
        list.className = 'list-group search-results-list';

        filtered.forEach(formula => {
            const item = document.createElement('a');
            item.href = '#';
            item.className = 'list-group-item list-group-item-action search-result-item';
            item.textContent = formula;
            item.addEventListener('click', (e) => {
                e.preventDefault();
                if (resultsContainer.id === 'productSearchResults') {
                    weighingElements.productFormula.value = formula;
                } else if (resultsContainer.id === 'reactantSearchResults') {
                    let targetInput = lastFocusedReactantInput;
                    
                    // If the last focused input is empty, use it.
                    // Otherwise, try to find the first empty reactant input.
                    if (!targetInput || targetInput.value.trim() !== '') {
                        const allReactantInputs = document.querySelectorAll('[name="reactantFormula"]');
                        for (const input of allReactantInputs) {
                            if (input.value.trim() === '') {
                                targetInput = input;
                                break;
                            }
                        }
                    }

                    // If still no empty input found, and lastFocusedReactantInput exists, use it as a fallback (will overwrite)
                    if (!targetInput && lastFocusedReactantInput) {
                        targetInput = lastFocusedReactantInput;
                    }
                    
                    if (targetInput) {
                        targetInput.value = formula;
                        // Optionally, move focus to the next empty input or a new one
                        const allReactantInputs = Array.from(document.querySelectorAll('[name="reactantFormula"]'));
                        const currentIndex = allReactantInputs.indexOf(targetInput);
                        const nextEmptyInput = allReactantInputs.find((input, index) => index > currentIndex && input.value.trim() === '');
                        if (nextEmptyInput) {
                            nextEmptyInput.focus();
                            lastFocusedReactantInput = nextEmptyInput; // Update last focused
                        } else if (currentIndex < allReactantInputs.length - 1) {
                             // If no more empty inputs, but not the last one, focus the next for potential overwrite
                             allReactantInputs[currentIndex + 1].focus();
                             lastFocusedReactantInput = allReactantInputs[currentIndex + 1];
                        }
                    }
                }
                // Clear search and hide
                resultsContainer.previousElementSibling.value = '';
                resultsContainer.innerHTML = '';
                resultsContainer.classList.remove('d-block');
            });
            list.appendChild(item);
        });

        resultsContainer.appendChild(list);
        resultsContainer.classList.add('d-block');
    }

    function setupFormulaSearch() {
        const productSearch = document.getElementById('productSearch');
        const productSearchResults = document.getElementById('productSearchResults');
        const reactantSearch = document.getElementById('reactantSearch');
        const reactantSearchResults = document.getElementById('reactantSearchResults');
        const reactantInputsContainer = document.getElementById('reactant-inputs');

        const handleKeyDown = (e, resultsContainer) => {
            const items = resultsContainer.querySelectorAll('.search-result-item');
            if (items.length === 0) return;

            let activeItem = resultsContainer.querySelector('.search-result-item.active');
            let activeIndex = Array.from(items).indexOf(activeItem);

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (activeItem) {
                    activeItem.classList.remove('active');
                    activeIndex = (activeIndex + 1) % items.length;
                } else {
                    activeIndex = 0;
                }
                items[activeIndex].classList.add('active');
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (activeItem) {
                    activeItem.classList.remove('active');
                    activeIndex = (activeIndex - 1 + items.length) % items.length;
                } else {
                    activeIndex = items.length - 1;
                }
                items[activeIndex].classList.add('active');
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeItem) {
                    activeItem.click();
                }
            } else if (e.key === 'Escape') {
                resultsContainer.innerHTML = '';
                resultsContainer.classList.remove('d-block');
            }
        };

        productSearch.addEventListener('input', () => {
            renderSearchResults(productSearch.value, allProductFormulas, productSearchResults);
        });
        productSearch.addEventListener('keydown', (e) => handleKeyDown(e, productSearchResults));


        reactantSearch.addEventListener('input', () => {
            renderSearchResults(reactantSearch.value, allReactantFormulas, reactantSearchResults);
        });
        reactantSearch.addEventListener('keydown', (e) => handleKeyDown(e, reactantSearchResults));


        reactantInputsContainer.addEventListener('focusin', (e) => {
            if (e.target && e.target.name === 'reactantFormula') {
                lastFocusedReactantInput = e.target;
            }
        });
        
        // Hide results if clicking outside
        document.addEventListener('click', (e) => {
            if (!productSearch.contains(e.target) && !productSearchResults.contains(e.target)) {
                 productSearchResults.classList.remove('d-block');
                 productSearchResults.innerHTML = '';
            }
            if (!reactantSearch.contains(e.target) && !reactantSearchResults.contains(e.target)) {
                 reactantSearchResults.classList.remove('d-block');
                 reactantSearchResults.innerHTML = '';
            }
        });
    }
    // ============================================

    function updateAmountLabel() {
        if (weighingElements.modeMass.checked) {
            weighingElements.amountLabel.textContent = '質量 (g)';
        } else {
            weighingElements.amountLabel.textContent = 'モル数 (mol)';
        }
    }

    function evaluateCoefficient(coeff, x) {
        if (!isNaN(coeff)) {
            return parseFloat(coeff);
        }
        try {
            // Using a Function constructor is safer than eval
            const func = new Function('x', `return ${coeff}`);
            const result = func(x);
            if (typeof result !== 'number' || isNaN(result)) {
                return 0;
            }
            return result;
        } catch (e) {
            console.error(`Could not evaluate coefficient: "${coeff}"`, e);
            return 0; // Return 0 or throw an error if evaluation fails
        }
    }

    function parseFormula(formula) {
        const elements = {};
        const regex = /([A-Z][a-z]*)(\([^)]+\)|\d*\.?\d*)?/g;
        
        const sanitizedFormula = formula.replace(/\s/g, '');
        if (!sanitizedFormula) return null;

        let match;
        while ((match = regex.exec(sanitizedFormula)) !== null) {
            const element = match[1];
            let count = match[2];

            if (count === undefined) {
                count = '1';
            }
            if (count.startsWith('(')) {
                count = count.substring(1, count.length - 1);
            }
            
            if (!ATOMIC_WEIGHTS[element]) {
                throw new Error(`認識できない元素記号です: ${element}`);
            }

            if (elements[element]) {
                throw new Error(`元素 ${element} が複数回出現します。このパーサーは(NH4)2SO4のような形式には未対応です。`);
            }
            elements[element] = count;
        }
        return elements;
    }

    function calculateMolarMass(parsedFormula, x_val) {
        let totalMass = 0;
        for (const element in parsedFormula) {
            const coeff = parsedFormula[element];
            const count = evaluateCoefficient(coeff, x_val);
            totalMass += ATOMIC_WEIGHTS[element] * count;
        }
        return totalMass;
    }

    function runGenericCalculation() {
        try {
            // 1. Get Inputs
            const productFormulaStr = weighingElements.productFormula.value;
            const reactantFormulaStrs = Array.from(weighingElements.reactantInputs)
                .map(input => input.value.trim())
                .filter(val => val !== '');
            const x_val = parseFloat(weighingElements.x_val.value);
            const amount = parseFloat(weighingElements.amount.value);
            const mode = weighingElements.modeMass.checked ? 'mass' : 'mol';

            // 2. Validation
            if (!productFormulaStr) { alert('生成物の化学式を入力してください。'); return; }
            if (reactantFormulaStrs.length === 0) { alert('少なくとも1つの原料を入力してください。'); return; }
            if (isNaN(x_val)) { alert('変数 x の値は数値を入力してください。'); return; }
            if (isNaN(amount) || amount <= 0) { alert('量には0より大きい数値を入力してください。'); return; }

            // 3. Parse Formulas
            const parsedProduct = parseFormula(productFormulaStr);
            const parsedReactants = reactantFormulaStrs.map(formula => ({
                formula,
                elements: parseFormula(formula)
            }));

            // 4. Calculate Molar Masses
            const productMolarMass = calculateMolarMass(parsedProduct, x_val);
            const reactantMolarMasses = parsedReactants.map(r => calculateMolarMass(r.elements, x_val));

            // 5. Determine Product Moles
            let n_prod, mass_prod;
            if (mode === 'mass') {
                mass_prod = amount;
                if (productMolarMass === 0) { alert('生成物のモル質量が0です。計算できません。'); return; }
                n_prod = mass_prod / productMolarMass;
            } else {
                n_prod = amount;
                mass_prod = n_prod * productMolarMass;
            }

            // 6. Determine Stoichiometry and Calculate Reactant Needs
            const reactantResults = [];
            const targetElements = Object.keys(parsedProduct);

            for (const el of targetElements) {
                // Find which reactant supplies this element
                const supplyingReactant = parsedReactants.find(r => r.elements[el]);
                if (!supplyingReactant) continue; // Element assumed to come from air, etc.

                const prodCoeff = evaluateCoefficient(parsedProduct[el], x_val);
                const reactantCoeff = evaluateCoefficient(supplyingReactant.elements[el], x_val);
                
                if (reactantCoeff === 0) throw new Error(`原料 ${supplyingReactant.formula} 中の元素 ${el} の量が0です。`);
                
                const molarRatio = prodCoeff / reactantCoeff;
                const n_reactant = n_prod * molarRatio;
                const m_reactant = n_reactant * calculateMolarMass(supplyingReactant.elements, x_val);

                // Avoid duplicating results if a reactant supplies multiple target elements
                if (!reactantResults.some(r => r.formula === supplyingReactant.formula)) {
                     reactantResults.push({
                        formula: supplyingReactant.formula,
                        moles: n_reactant,
                        mass: m_reactant
                    });
                }
            }
            
            // 7. Display Results
            weighingElements.resProdFormula.textContent = productFormulaStr;
            weighingElements.resProdMolarMass.textContent = productMolarMass.toFixed(4);
            weighingElements.resProdMoles.textContent = n_prod.toFixed(6);
            weighingElements.resProdMass.textContent = mass_prod.toFixed(4);

            const container = weighingElements.reactantResultsContainer;
            container.innerHTML = ''; // Clear previous results
            reactantResults.forEach(res => {
                const resultHtml = `
                    <p class="mb-1 mt-2"><strong>原料: ${res.formula}</strong></p>
                    <ul class="list-group list-group-flush mb-2">
                        <li class="list-group-item py-1">必要モル数: <span>${res.moles.toFixed(6)}</span> mol</li>
                        <li class="list-group-item py-1">必要質量: <span>${res.mass.toFixed(4)}</span> g</li>
                    </ul>
                `;
                container.insertAdjacentHTML('beforeend', resultHtml);
            });

            // ===== NEW: Save history on successful calculation =====
            saveFormulaHistory(productFormulaStr, reactantFormulaStrs);

        } catch (e) {
            alert(`エラー: ${e.message}`);
        }
    }

    // Event Listeners for Weighing Tab
    weighingElements.modeMass.addEventListener('change', updateAmountLabel);
    weighingElements.modeMol.addEventListener('change', updateAmountLabel);
    weighingElements.calculateBtn.addEventListener('click', runGenericCalculation);

    // --- NEW: Add event delegation for clear buttons ---
    const weighingTabContent = document.getElementById('weighing-calc-content');
    weighingTabContent.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('btn-clear-input')) {
            const inputToClear = e.target.previousElementSibling;
            if (inputToClear && inputToClear.tagName === 'INPUT') {
                inputToClear.value = '';
                inputToClear.focus(); // Optionally focus the input after clearing
            }
        }
    });

    // ===== NEW: Initial Load =====
    loadFormulaHistory();
    setupFormulaSearch(); // Activate search feature
    updateAmountLabel();
    runGenericCalculation();

    // ===== Tab Switching =====
    const sidebarTabs = document.getElementById('sidebar-tabs');
    const tabContents = document.querySelectorAll('[data-tab-content]');

    sidebarTabs.addEventListener('click', e => {
        e.preventDefault();
        const clickedTab = e.target;
        // Ensure we're clicking on a link within the tab container
        if (clickedTab.tagName !== 'A' || !clickedTab.dataset.tab) {
            return;
        }

        const targetContentId = clickedTab.dataset.tab;

        if (clickedTab.classList.contains('active')) {
            return; // Exit if already active
        }

        // Update navbar title
        const navbarTitle = document.getElementById('navbar-title');
        if (navbarTitle && clickedTab.textContent) {
            navbarTitle.textContent = clickedTab.textContent;
        }

        // Deactivate all tabs and hide all content
        sidebarTabs.querySelectorAll('.nav-link').forEach(tab => tab.classList.remove('active'));
        tabContents.forEach(content => {
            if (!content.classList.contains('d-none')) {
                content.classList.add('d-none');
            }
        });

        // Activate the clicked tab and show its content
        clickedTab.classList.add('active');
        const targetContent = document.getElementById(targetContentId);
        if (targetContent) {
            targetContent.classList.remove('d-none');
        }

        // --- 画像表示エリアの表示/非表示を制御 ---
        const imageDisplayArea = document.getElementById('image-display-area');
        if (imageDisplayArea) {
            if (targetContentId === 'weighing-calc-content') {
                imageDisplayArea.classList.add('d-none'); // 秤量計算タブの時は非表示
            } else {
                imageDisplayArea.classList.remove('d-none'); // それ以外のタブの時は表示
            }
        }
        // ------------------------------------------
    });

    const ASPECT_RATIO_THRESHOLD = 1.2; // Particles with aspect ratio between 1/1.2 (approx 0.83) and 1.2

    // ===== DOM Elements =====
    const imageLoader = document.getElementById('imageLoader');
    const contrastModeBtn = document.getElementById('contrastModeBtn');
    const sharpenModeBtn = document.getElementById('sharpenModeBtn');
    const measureModeBtn = document.getElementById('measureModeBtn');
    const particleSizeModeBtn = document.getElementById('particleSizeModeBtn');
    const roiSelectModeBtn = document.getElementById('roiSelectModeBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const resetBtn = document.getElementById('resetBtn');
    const revertImageBtn = document.getElementById('revertImageBtn'); // New Button

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
    let currentProcessedImageData = null; // New state variable

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
        if (!originalImage) return null; // Return null if no image

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
        // NOTE: applyThreshold is no longer called here directly for particle_size mode
        if (currentMode === 'particle_size') {
            // Apply threshold visually to ctxAfter
            let visualProcessedImageData = ctxBefore.getImageData(0, 0, originalImageWidth, originalImageHeight);
            visualProcessedImageData = applyThresholdContrast(visualProcessedImageData, contrastSlider.value);
            visualProcessedImageData = applySharpening(visualProcessedImageData, sharpenSlider.value);

            let visualThresholdedImageData = applyThreshold(visualProcessedImageData, parseInt(thresholdSlider.value));
            ctxAfter.putImageData(visualThresholdedImageData, 0, 0);

            // Draw particle outlines on top
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

        return processedImageData; // Return the processed image data
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
        
        // Hide revert button by default
        revertImageBtn.classList.add('d-none');

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
            const aspectRatio = Math.max(p.width, p.height) / Math.min(p.width, p.height);
            
            if (aspectRatio <= ASPECT_RATIO_THRESHOLD) {
                ctxAfter.strokeStyle = '#00FF00';
                ctxAfter.lineWidth = 1;
                ctxAfter.strokeRect(p.minX, p.minY, p.maxX - p.minX + 1, p.maxY - p.minY + 1);
            }
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
            revertImageBtn.classList.remove('d-none'); // --- NEW: Show the revert button
        };
        newImage.src = tempCropCanvas.toDataURL();
    }


    // ===== EVENT LISTENERS =====

    imageLoader.addEventListener('change', e => {
        if (!e.target.files[0]) return;
        const reader = new FileReader();
        reader.onload = async event => {
            const imageDataUrl = event.target.result;
            
            // --- NEW: Save image to DB ---
            try {
                const response = await fetch('/api/image/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image_data: imageDataUrl })
                });
                if (!response.ok) {
                    throw new Error('Failed to save image to database.');
                }
            } catch (error) {
                console.error('Error saving image:', error);
                alert('元の画像をデータベースに保存できませんでした。');
            }
            // --- END NEW ---

            originalImage = new Image();
            originalImage.onload = () => {
                originalImageWidth = originalImage.width;
                originalImageHeight = originalImage.height;

                canvasBefore.width = originalImageWidth;
                canvasBefore.height = originalImageHeight;
                ctxBefore.drawImage(originalImage, 0, 0);
                
                resetApp();
            };
            originalImage.src = imageDataUrl;
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

    // --- NEW: Revert Image Button Listener ---
    revertImageBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/image/load');
            if (!response.ok) {
                if (response.status === 404) {
                    alert('保存されている画像が見つかりません。');
                } else {
                    throw new Error('Failed to load image from database.');
                }
                return;
            }
            const data = await response.json();
            if (data.image_data) {
                const newImage = new Image();
                newImage.onload = () => {
                    originalImage = newImage; // Set the loaded image as the new original
                    originalImageWidth = originalImage.width;
                    originalImageHeight = originalImage.height;

                    canvasBefore.width = originalImageWidth;
                    canvasBefore.height = originalImageHeight;
                    ctxBefore.drawImage(originalImage, 0, 0);
                    
                    resetApp(); // Reset all states and redraw
                };
                newImage.src = data.image_data;
            }
        } catch (error) {
            console.error('Error loading original image:', error);
            alert('元の画像を読み込めませんでした。');
        }
    });

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
        currentProcessedImageData = redrawAfterCanvas();
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
                
                analyzeParticlesInRegion(p1, p2, currentProcessedImageData);
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

    function applyThreshold(imageData, threshold) {
        if (!imageData) return null;
        let processedImageData = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
        processedImageData = grayscale(processedImageData); // Operate on the copy

        const data = processedImageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const brightness = data[i];
            const value = brightness > threshold ? 255 : 0;
            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
        }
        return processedImageData; // Return the new ImageData
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

        // Ensure canvas is redrawn with processed image and get the ImageData for analysis
        const processedImageData = redrawAfterCanvas(); // Get processed ImageData
        if (!processedImageData) return;

        analyzeParticlesInRegion(p1, p2, processedImageData); // Pass processedImageData to analysis function

        // Redraw again to include particle outlines
        redrawAfterCanvas(); 
        drawParticlesOutlines(particles); 
    }
    
    function analyzeParticlesInRegion(p1, p2, processedImageData) { // Added processedImageData argument
        if (!originalImage || !processedImageData) { // Check processedImageData
            alert('画像を読み込んでください。');
            return;
        }

        const roiMinX = Math.min(p1.x, p2.x);
        const roiMaxX = Math.max(p1.x, p2.x);
        const roiMinY = Math.min(p1.y, p2.y);
        const roiMaxY = Math.max(p1.y, p2.y);

        // Apply threshold to the provided processedImageData
        let thresholdedImageData = applyThreshold(processedImageData, parseInt(thresholdSlider.value));
        const width = thresholdedImageData.width;
        const height = thresholdedImageData.height;
        const pixels = thresholdedImageData.data; // Use data from thresholdedImageData

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
            let perimeterCount = 0;

            const pixelsInBlob = [];

            while (queue.length > 0) {
                const { x, y } = queue.shift();
                const index = y * width + x;

                if (x < roiMinX || x > roiMaxX || y < roiMinY || y > roiMaxY ||
                    x < 0 || x >= width || y < 0 || y >= height || visited[index] || getPixel(x, y) === 0) {
                    continue;
                }

                visited[index] = 1;
                pixelCount++;
                pixelsInBlob.push({x, y});

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
                pixelsInBlob.forEach(({x, y}) => {
                    if (getPixel(x + 1, y) === 0) perimeterCount++;
                    if (getPixel(x - 1, y) === 0) perimeterCount++;
                    if (getPixel(x, y + 1) === 0) perimeterCount++;
                    if (getPixel(x, y - 1) === 0) perimeterCount++;
                });

                const particleWidth = maxX - minX + 1;
                const particleHeight = maxY - minY + 1;
                particles.push({
                    x: (minX + maxX) / 2,
                    y: (minY + maxY) / 2,
                    width: particleWidth,
                    height: particleHeight,
                    diameterPx: 0, // Will be calculated later
                    pixelCount: pixelCount,
                    perimeter: perimeterCount,
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
        let rawParticles = particles.filter(p => p.pixelCount >= minPixelCount);

        const circularityThreshold = 1.0;
        const goodParticles = [];
        const mergedBlobs = [];

        // First pass: Calculate properties and separate good circles from merged blobs
        rawParticles.forEach(p => {
            if (p.perimeter === 0) {
                p.circularity = 0;
            } else {
                p.circularity = (4 * Math.PI * p.pixelCount) / (p.perimeter * p.perimeter);
            }
            
            // New diameter calculation based on area (equivalent circular diameter)
            p.diameterPx = 2 * Math.sqrt(p.pixelCount / Math.PI);

            // 厳密に円に近いものだけをピックアップするため、アスペクト比の条件を削除し、円形度のみで判定
            if (p.circularity >= circularityThreshold) {
                goodParticles.push(p);
            } else {
                mergedBlobs.push(p);
            }
        });

        let finalParticles = [...goodParticles];

        if (goodParticles.length > 0) {
            let totalGoodArea = 0;
            goodParticles.forEach(p => { totalGoodArea += p.pixelCount; });
            const avgGoodParticleArea = totalGoodArea / goodParticles.length;

            mergedBlobs.forEach(blob => {
                const estimatedNumParticles = Math.round(blob.pixelCount / avgGoodParticleArea);
                
                if (estimatedNumParticles > 1) {
                    const estimatedSingleArea = blob.pixelCount / estimatedNumParticles;
                    const estimatedDiameter = 2 * Math.sqrt(estimatedSingleArea / Math.PI);
                    
                    for (let i = 0; i < estimatedNumParticles; i++) {
                        finalParticles.push({
                            ...blob,
                            diameterPx: estimatedDiameter,
                            pixelCount: estimatedSingleArea,
                            isVirtual: true
                        });
                    }
                } else {
                    finalParticles.push(blob);
                }
            });
        } else {
            finalParticles = [...rawParticles];
        }

        particles = finalParticles;

        // 外れ値の除去：平均から標準偏差の2倍以上離れているものを除外する
        if (particles.length > 5) {
            const diameters = particles.map(p => p.diameterPx);
            const sum = diameters.reduce((a, b) => a + b, 0);
            const mean = sum / diameters.length;
            const stdDev = Math.sqrt(diameters.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / diameters.length);

            const outlierFactor = 2;
            const lowerBound = mean - outlierFactor * stdDev;
            const upperBound = mean + outlierFactor * stdDev;

            particles = particles.filter(p => p.diameterPx >= lowerBound && p.diameterPx <= upperBound);
        }

        // アスペクト比によるフィルタリング
        particles = particles.filter(p => {
            const aspectRatio = Math.max(p.width, p.height) / Math.min(p.width, p.height);
            return aspectRatio <= ASPECT_RATIO_THRESHOLD;
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