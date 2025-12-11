document.addEventListener('DOMContentLoaded', () => {

    // ===== NEW: Weighing History Functions =====

    async function loadFormulaHistory() {
        try {
            // 履歴取得APIにGETでアクセス
            const response = await fetch('/api/formulas');
            if (!response.ok) {
                throw new Error(`Failed to fetch history: ${response.statusText}`);
            }
            // 返ってきたJSONをオブジェクト化
            const data = await response.json();

            // 検索用に生成物・原料の履歴配列を保持
            allProductFormulas = data.products || [];
            allReactantFormulas = data.reactants || [];

            // datalist要素を取得（入力補完に使う）
            const productDatalist = document.getElementById('product-formula-list');
            const reactantDatalist = document.getElementById('reactant-formula-list');

            if (productDatalist) {
                // 一度中身をすべてクリア
                productDatalist.innerHTML = '';
                // 生成物履歴を<option>としてdatalistに追加
                allProductFormulas.forEach(formula => {
                    const option = document.createElement('option');
                    option.value = formula;
                    productDatalist.appendChild(option);
                });
            }

            if (reactantDatalist) {
                reactantDatalist.innerHTML = '';
                // 原料履歴を<option>としてdatalistに追加
                allReactantFormulas.forEach(formula => {
                    const option = document.createElement('option');
                    option.value = formula;
                    reactantDatalist.appendChild(option);
                });
            }
        } catch (error) {
            // 通信エラーなどはコンソールに出しておく
            console.error("Error loading formula history:", error);
        }
    }

    async function saveFormulaHistory(product, reactants) {
        // 原料の配列から「空欄 or 空白だけ」のものを削除
        const validReactants = reactants.map(r => r.trim()).filter(r => r);
        // 生成物も空、原料も空なら保存する意味がないので何もしない
        if (!product.trim() && validReactants.length === 0) {
            return;
        }

        try {
            // 履歴保存APIへPOST（JSONボディにproduct/reactantsを入れる）
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

            // 保存成功後に再読込してdatalist・配列を最新化
            await loadFormulaHistory();

        } catch (error) {
            console.error("Error saving formula history:", error);
        }
    }

    // ===== Generic Weighing Calculation =====

    // 元素記号→標準原子量の対応表（モル質量計算に使う）
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

    // 秤量タブ関係のDOM要素をひとまとめにしたオブジェクト
    const weighingElements = {
        productFormula: document.getElementById('productFormula'),
        reactantInputs: document.querySelectorAll('[name="reactantFormula"]'),
        x_val: document.getElementById('smComposition'), // xの入力欄として再利用
        amount: document.getElementById('productAmount'),
        amountLabel: document.getElementById('productAmountLabel'),
        modeMass: document.getElementById('modeMass'),
        modeMol: document.getElementById('modeMol'),
        calculateBtn: document.getElementById('calculateWeighingBtn'),
        
        // 結果表示用エリア
        resProdFormula: document.getElementById('res-prod-formula'),
        resProdMolarMass: document.getElementById('res-prod-molar-mass'),
        resProdMoles: document.getElementById('res-prod-moles'),
        resProdMass: document.getElementById('res-prod-mass'),
        reactantResultsContainer: document.getElementById('reactant-results-container'),
    };

    // ===== NEW: Formula Search Functionality =====
    let allProductFormulas = [];
    let allReactantFormulas = [];
    let lastFocusedReactantInput = null; // 最後にフォーカスしていた原料入力欄

    function renderSearchResults(searchTerm, formulaList, resultsContainer) {
        // 毎回中身をクリアしてから描画
        resultsContainer.innerHTML = '';
        // 入力が空なら結果を閉じる
        if (!searchTerm) {
            resultsContainer.classList.remove('d-block');
            return;
        }

        // 履歴配列から部分一致（大文字小文字は無視）でフィルタ
        const filtered = formulaList.filter(f => f.toLowerCase().includes(searchTerm.toLowerCase()));
        
        // 該当なしなら閉じる
        if (filtered.length === 0) {
            resultsContainer.classList.remove('d-block');
            return;
        }

        // Bootstrapのlist-groupで候補リストを作成
        const list = document.createElement('div');
        list.className = 'list-group search-results-list';

        filtered.forEach(formula => {
            const item = document.createElement('a');
            item.href = '#';
            item.className = 'list-group-item list-group-item-action search-result-item';
            item.textContent = formula;

            // 候補クリック時の挙動
            item.addEventListener('click', (e) => {
                e.preventDefault();

                // 生成物側の検索結果なら productFormula に代入
                if (resultsContainer.id === 'productSearchResults') {
                    weighingElements.productFormula.value = formula;

                // 原料側の検索結果なら、どの原料欄に入れるかを判断
                } else if (resultsContainer.id === 'reactantSearchResults') {
                    let targetInput = lastFocusedReactantInput;
                    
                    // 最後フォーカス欄が埋まっていたら「最初の空欄」を探す
                    if (!targetInput || targetInput.value.trim() !== '') {
                        const allReactantInputs = document.querySelectorAll('[name="reactantFormula"]');
                        for (const input of allReactantInputs) {
                            if (input.value.trim() === '') {
                                targetInput = input;
                                break;
                            }
                        }
                    }

                    // それでも見つからなければ lastFocusedReactantInput を上書き用に使う
                    if (!targetInput && lastFocusedReactantInput) {
                        targetInput = lastFocusedReactantInput;
                    }
                    
                    if (targetInput) {
                        targetInput.value = formula;

                        // 次の空欄に自動でフォーカスを移す（なければ次の欄）
                        const allReactantInputs = Array.from(document.querySelectorAll('[name="reactantFormula"]'));
                        const currentIndex = allReactantInputs.indexOf(targetInput);
                        const nextEmptyInput = allReactantInputs.find((input, index) => index > currentIndex && input.value.trim() === '');

                        if (nextEmptyInput) {
                            nextEmptyInput.focus();
                            lastFocusedReactantInput = nextEmptyInput;
                        } else if (currentIndex < allReactantInputs.length - 1) {
                            allReactantInputs[currentIndex + 1].focus();
                            lastFocusedReactantInput = allReactantInputs[currentIndex + 1];
                        }
                    }
                }

                // 検索欄を空にして結果リストを閉じる
                resultsContainer.previousElementSibling.value = '';
                resultsContainer.innerHTML = '';
                resultsContainer.classList.remove('d-block');
            });

            list.appendChild(item);
        });

        // コンテナにリストを追加して表示
        resultsContainer.appendChild(list);
        resultsContainer.classList.add('d-block');
    }

    function setupFormulaSearch() {
        const productSearch = document.getElementById('productSearch');
        const productSearchResults = document.getElementById('productSearchResults');
        const reactantSearch = document.getElementById('reactantSearch');
        const reactantSearchResults = document.getElementById('reactantSearchResults');
        const reactantInputsContainer = document.getElementById('reactant-inputs');

        // 検索結果のリストに対するキーボード操作（↑↓Enter/Esc）の実装
        const handleKeyDown = (e, resultsContainer) => {
            const items = resultsContainer.querySelectorAll('.search-result-item');
            if (items.length === 0) return;

            let activeItem = resultsContainer.querySelector('.search-result-item.active');
            let activeIndex = Array.from(items).indexOf(activeItem);

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                // ↓キーで次の候補へ
                if (activeItem) {
                    activeItem.classList.remove('active');
                    activeIndex = (activeIndex + 1) % items.length;
                } else {
                    activeIndex = 0;
                }
                items[activeIndex].classList.add('active');

            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                // ↑キーで前の候補へ
                if (activeItem) {
                    activeItem.classList.remove('active');
                    activeIndex = (activeIndex - 1 + items.length) % items.length;
                } else {
                    activeIndex = items.length - 1;
                }
                items[activeIndex].classList.add('active');

            } else if (e.key === 'Enter') {
                e.preventDefault();
                // Enterで現在アクティブな候補を選択（clickと同じ処理へ）
                if (activeItem) {
                    activeItem.click();
                }

            } else if (e.key === 'Escape') {
                // Escで結果リストを閉じる
                resultsContainer.innerHTML = '';
                resultsContainer.classList.remove('d-block');
            }
        };

        // 入力のたびに検索結果を更新（生成物側）
        productSearch.addEventListener('input', () => {
            renderSearchResults(productSearch.value, allProductFormulas, productSearchResults);
        });
        productSearch.addEventListener('keydown', (e) => handleKeyDown(e, productSearchResults));

        // 入力のたびに検索結果を更新（原料側）
        reactantSearch.addEventListener('input', () => {
            renderSearchResults(reactantSearch.value, allReactantFormulas, reactantSearchResults);
        });
        reactantSearch.addEventListener('keydown', (e) => handleKeyDown(e, reactantSearchResults));

        // 原料のどの入力欄にフォーカスしているかを記録
        reactantInputsContainer.addEventListener('focusin', (e) => {
            if (e.target && e.target.name === 'reactantFormula') {
                lastFocusedReactantInput = e.target;
            }
        });
        
        // 検索欄・結果以外をクリックしたら候補を閉じる
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

    // 入力単位ラベル（g / mol）の切り替え
    function updateAmountLabel() {
        if (weighingElements.modeMass.checked) {
            weighingElements.amountLabel.textContent = '質量 (g)';
        } else {
            weighingElements.amountLabel.textContent = 'モル数 (mol)';
        }
    }

    // "(1-x)" などの係数文字列を、xを代入して数値に変換する
    function evaluateCoefficient(coeff, x) {
        // 純粋な数値文字列ならそのまま数値化
        if (!isNaN(coeff)) {
            return parseFloat(coeff);
        }
        try {
            // "1-x" のような式を new Function で評価（xを引数に取る関数を作る）
            const func = new Function('x', `return ${coeff}`);
            const result = func(x);
            // 評価結果が数値でない場合は0扱い
            if (typeof result !== 'number' || isNaN(result)) {
                return 0;
            }
            return result;
        } catch (e) {
            console.error(`Could not evaluate coefficient: "${coeff}"`, e);
            return 0;
        }
    }

    // "Ca2Sm(1-x)MnO4" → { Ca: "2", Sm: "1-x", Mn: "1", O: "4" } のように分解する関数
    function parseFormula(formula) {
        const elements = {};
        // [元素記号][係数 or (1-x)など] のパターンで繰り返しマッチ
        const regex = /([A-Z][a-z]*)(\([^)]+\)|\d*\.?\d*)?/g;
        
        // 空白削除
        const sanitizedFormula = formula.replace(/\s/g, '');
        if (!sanitizedFormula) return null;

        let match;
        while ((match = regex.exec(sanitizedFormula)) !== null) {
            const element = match[1];   // 元素記号
            let count = match[2];       // 係数 or (1-x) 部分

            // 係数省略 → 1
            if (count === undefined) {
                count = '1';
            }
            // "(1-x)" → "1-x" のように括弧を外す
            if (count.startsWith('(')) {
                count = count.substring(1, count.length - 1);
            }
            
            // 辞書にない元素記号はエラー扱い
            if (!ATOMIC_WEIGHTS[element]) {
                throw new Error(`認識できない元素記号です: ${element}`);
            }

            // 同じ元素が2回出てきた場合も未対応としてエラー
            if (elements[element]) {
                throw new Error(`元素 ${element} が複数回出現します。このパーサーは(NH4)2SO4のような形式には未対応です。`);
            }
            // elements に "元素: 係数文字列" として登録
            elements[element] = count;
        }
        return elements;
    }

    // parseFormula の結果から、xを代入してモル質量を計算する
    function calculateMolarMass(parsedFormula, x_val) {
        let totalMass = 0;
        // 各元素について 原子量 × 係数 を足し合わせる
        for (const element in parsedFormula) {
            const coeff = parsedFormula[element];             // "2" や "1-x" などの文字列
            const count = evaluateCoefficient(coeff, x_val);  // 数値に変換
            totalMass += ATOMIC_WEIGHTS[element] * count;     // 原子量 × 個数
        }
        return totalMass;
    }

    function runGenericCalculation() {
        try {
            // --- 1. 入力値の取得 ---
            const productFormulaStr = weighingElements.productFormula.value;

            // 原料入力欄から文字列を集めて、空欄は除外
            const reactantFormulaStrs = Array.from(weighingElements.reactantInputs)
                .map(input => input.value.trim())
                .filter(val => val !== '');

            const x_val = parseFloat(weighingElements.x_val.value);
            const amount = parseFloat(weighingElements.amount.value);
            // モード判定（質量指定かモル指定か）
            const mode = weighingElements.modeMass.checked ? 'mass' : 'mol';

            // --- 2. 基本的なバリデーション ---
            if (!productFormulaStr) {
                alert('生成物の化学式を入力してください。');
                return;
            }
            if (reactantFormulaStrs.length === 0) {
                alert('少なくとも1つの原料を入力してください。');
                return;
            }
            if (isNaN(x_val)) {
                alert('変数 x の値は数値を入力してください。');
                return;
            }
            if (isNaN(amount) || amount <= 0) {
                alert('量には0より大きい数値を入力してください。');
                return;
            }

            // --- 3. 化学式文字列をパースして元素ごとの係数に分解 ---
            const parsedProduct = parseFormula(productFormulaStr);
            // 原料は配列なので、それぞれ parseFormula したオブジェクトを持たせる
            const parsedReactants = reactantFormulaStrs.map(formula => ({
                formula,
                elements: parseFormula(formula)
            }));

            // --- 4. モル質量の計算 ---
            const productMolarMass = calculateMolarMass(parsedProduct, x_val);
            const reactantMolarMasses = parsedReactants.map(r => calculateMolarMass(r.elements, x_val));

            // --- 5. 生成物モル数・質量の決定 ---
            let n_prod, mass_prod;
            if (mode === 'mass') {
                // 生成物質量(g) → モル数
                mass_prod = amount;
                if (productMolarMass === 0) {
                    alert('生成物のモル質量が0です。計算できません。');
                    return;
                }
                n_prod = mass_prod / productMolarMass;
            } else {
                // 生成物モル数(mol) → 質量
                n_prod = amount;
                mass_prod = n_prod * productMolarMass;
            }

            // --- 6. 化学量論比から各原料の必要量を計算 ---
            const reactantResults = [];
            const targetElements = Object.keys(parsedProduct); // 生成物中の元素リスト

            for (const el of targetElements) {
                // この元素 el を供給している原料を1つ探す（最初に見つかったもの）
                const supplyingReactant = parsedReactants.find(r => r.elements[el]);
                // 見つからなければ空気などから供給されるとみなしてスキップ
                if (!supplyingReactant) continue;

                // 生成物側の係数 a, 原料側の係数 b を数値にする
                const prodCoeff = evaluateCoefficient(parsedProduct[el], x_val);
                const reactantCoeff = evaluateCoefficient(supplyingReactant.elements[el], x_val);
                
                if (reactantCoeff === 0) {
                    throw new Error(`原料 ${supplyingReactant.formula} 中の元素 ${el} の量が0です。`);
                }
                
                // モル比 a:b = prodCoeff:reactantCoeff
                const molarRatio = prodCoeff / reactantCoeff;
                // 生成物モル数から必要原料モル数を求める
                const n_reactant = n_prod * molarRatio;
                // 原料のモル質量 × モル数 で必要質量を計算
                const m_reactant = n_reactant * calculateMolarMass(supplyingReactant.elements, x_val);

                // 同じ原料が複数元素を供給していても、1回だけ結果に載せる
                if (!reactantResults.some(r => r.formula === supplyingReactant.formula)) {
                     reactantResults.push({
                        formula: supplyingReactant.formula,
                        moles: n_reactant,
                        mass: m_reactant
                    });
                }
            }
            
            // --- 7. 結果の画面表示 ---

            // 生成物側の情報
            weighingElements.resProdFormula.textContent = productFormulaStr;
            weighingElements.resProdMolarMass.textContent = productMolarMass.toFixed(4);
            weighingElements.resProdMoles.textContent = n_prod.toFixed(6);
            weighingElements.resProdMass.textContent = mass_prod.toFixed(4);

            // 原料側の情報（リスト形式で表示）
            const container = weighingElements.reactantResultsContainer;
            container.innerHTML = '';
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

            // 計算に成功したら、この組み合わせを履歴として保存
            saveFormulaHistory(productFormulaStr, reactantFormulaStrs);

        } catch (e) {
            alert(`エラー: ${e.message}`);
        }
    }

    // 秤量タブのイベント登録
    weighingElements.modeMass.addEventListener('change', updateAmountLabel);
    weighingElements.modeMol.addEventListener('change', updateAmountLabel);
    weighingElements.calculateBtn.addEventListener('click', runGenericCalculation);

    // 「×」ボタンで直前の入力欄をクリアするためのイベント委譲
    const weighingTabContent = document.getElementById('weighing-calc-content');
    weighingTabContent.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('btn-clear-input')) {
            const inputToClear = e.target.previousElementSibling;
            if (inputToClear && inputToClear.tagName === 'INPUT') {
                inputToClear.value = '';
                inputToClear.focus();
            }
        }
    });

    // ===== NEW: Initial Load =====
    loadFormulaHistory();    // 初回表示時に履歴読み込み
    setupFormulaSearch();    // 検索機能の有効化
    updateAmountLabel();     // g/molラベル初期化
    runGenericCalculation(); // 初回のデモ用計算（エラーなら無視される）

    // ===== Tab Switching =====
    const sidebarTabs = document.getElementById('sidebar-tabs');
    const tabContents = document.querySelectorAll('[data-tab-content]');

    sidebarTabs.addEventListener('click', e => {
        e.preventDefault();
        const clickedTab = e.target;
        // aタグ + data-tab 属性を持つ要素のみ反応させる
        if (clickedTab.tagName !== 'A' || !clickedTab.dataset.tab) {
            return;
        }

        const targetContentId = clickedTab.dataset.tab;

        if (clickedTab.classList.contains('active')) {
            return; // すでに選択中のタブなら何もしない
        }

        // 上部ナビバーのタイトルをタブ名に合わせて更新
        const navbarTitle = document.getElementById('navbar-title');
        if (navbarTitle && clickedTab.textContent) {
            navbarTitle.textContent = clickedTab.textContent;
        }

        // すべてのタブ・コンテンツを一旦非アクティブに
        sidebarTabs.querySelectorAll('.nav-link').forEach(tab => tab.classList.remove('active'));
        tabContents.forEach(content => {
            if (!content.classList.contains('d-none')) {
                content.classList.add('d-none');
            }
        });

        // クリックされたタブだけactiveにして対応するコンテンツを表示
        clickedTab.classList.add('active');
        const targetContent = document.getElementById(targetContentId);
        if (targetContent) {
            targetContent.classList.remove('d-none');
        }

        // 画像表示エリアのON/OFF（秤量タブでは非表示）
        const imageDisplayArea = document.getElementById('image-display-area');
        if (imageDisplayArea) {
            if (targetContentId === 'weighing-calc-content') {
                imageDisplayArea.classList.add('d-none');
            } else {
                imageDisplayArea.classList.remove('d-none');
            }
        }
    });

    const ASPECT_RATIO_THRESHOLD = 1.2; // アスペクト比がこれ以下の粒子を有効候補とする

    // ===== DOM Elements =====
    const imageLoader = document.getElementById('imageLoader');
    const contrastModeBtn = document.getElementById('contrastModeBtn');
    const sharpenModeBtn = document.getElementById('sharpenModeBtn');
    const measureModeBtn = document.getElementById('measureModeBtn');
    const particleSizeModeBtn = document.getElementById('particleSizeModeBtn');
    const roiSelectModeBtn = document.getElementById('roiSelectModeBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const resetBtn = document.getElementById('resetBtn');
    const revertImageBtn = document.getElementById('revertImageBtn'); // 元画像に戻すボタン

    // Canvas
    const canvasBefore = document.getElementById('canvas-before');   // 元画像
    const canvasAfter = document.getElementById('canvas-after');     // 処理結果表示
    const ctxBefore = canvasBefore.getContext('2d', { willReadFrequently: true });
    const ctxAfter = canvasAfter.getContext('2d', { willReadFrequently: true });
    
    // オフスクリーンキャンバス（処理用の作業場）
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // Modal Elements（切り抜き結果表示用）
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
    const resetThresholdBtn = document.getElementById('resetThresholdBtn');
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

    // Inputs & Displays（通常測長用）
    const scaleLengthInput = document.getElementById('scaleLengthInput');
    const scaleUnitInput = document.getElementById('scaleUnitInput');
    const scaleDisplay = document.getElementById('scaleDisplay');
    const measureResult = document.getElementById('measureResult');

    // ===== State =====
    let originalImage = null; // 読み込んだ元画像
    let currentMode = 'contrast'; // 現在のモード: 'contrast', 'sharpen', 'measure', 'particle_size', 'roi_select'
    let measurementPoints = [];   // 測長のためにクリックされた点の配列
    let scale = { pixels: null, realLength: null, unit: null };
    let particles = [];           // 粒子情報の配列

    let originalImageWidth = 0;
    let originalImageHeight = 0;

    let calibrationState = 'idle';        // 通常測長のスケール設定状態
    let measurementState = 'idle';        // 通常測長の測定状態
    let particleCalibrationState = 'idle';// 粒子解析用スケール設定状態
    let particleMeasurementState = 'idle';// 粒子解析用ROI測定状態
    let particleScale = { pixels: null, realLength: null, unit: null };

    // ROI選択状態
    let isSelecting = false;
    let selectionRect = { startX: 0, startY: 0, endX: 0, endY: 0 };
    let croppedImageData = null;
    let currentProcessedImageData = null; // コントラスト・シャープをかけた状態のImageDataを保持

    // ===== LOGIC & HELPER FUNCTIONS =====

    // シグモイド関数を用いたコントラスト強調
    function applyThresholdContrast(imageData, value) {
        if (!imageData) return null;

        // 生データをコピーして加工用に使う
        const data = new Uint8ClampedArray(imageData.data);
        const strength = (value - 100) / 10; // スライダー100を基準に強さを決める
        
        const lut = new Uint8ClampedArray(256);
        if (strength === 0) {
            // 強さ0なら元の画像のまま返す
            return new ImageData(data, imageData.width, imageData.height);
        } else {
            // 0〜255を0〜1に正規化してシグモイドに通すルックアップテーブルを作る
            for (let i = 0; i < 256; i++) {
                const x = i / 255;
                const y = 1 / (1 + Math.exp(-strength * (x - 0.5)));
                lut[i] = y * 255;
            }
        }

        // 各ピクセル(R/G/B)に対してLUTを適用してコントラストを変更
        for (let i = 0; i < data.length; i += 4) {
            data[i] = lut[data[i]];       // R
            data[i + 1] = lut[data[i+1]]; // G
            data[i + 2] = lut[data[i+2]]; // B
        }
        return new ImageData(data, imageData.width, imageData.height);
    }

    // 3×3カーネルによるシャープフィルタ
    function applySharpening(imageData, amount) {
        if (!imageData) return null;

        const src = imageData.data;
        const width = imageData.width;
        const height = imageData.height;

        const factor = amount / 100.0;
        if (factor === 0) {
            // シャープ量0なら処理せずそのまま返す
            return imageData;
        }
        
        // 出力用バッファを作成して元画像をコピー
        const outputData = new Uint8ClampedArray(src.length);
        const dst = outputData;
        dst.set(src);

        // シャープ用カーネル
        const kernel = [
            [-1, -1, -1],
            [-1,  9, -1],
            [-1, -1, -1]
        ];

        // 画像の縁を1ピクセル残して、内側だけにカーネルを適用
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                for (let c = 0; c < 3; c++) { // R,G,Bチャンネルのみ加工
                    const i = (y * width + x) * 4 + c;
                    let total = 0;

                    // 3x3近傍にカーネルを畳み込む
                    total += kernel[0][0] * src[((y - 1) * width + (x - 1)) * 4 + c];
                    total += kernel[0][1] * src[((y - 1) * width + x) * 4 + c];
                    total += kernel[0][2] * src[((y - 1) * width + (x + 1)) * 4 + c];
                    total += kernel[1][0] * src[(y * width + (x - 1)) * 4 + c];
                    total += kernel[1][1] * src[(y * width + x) * 4 + c];
                    total += kernel[1][2] * src[(y * width + (x + 1)) * 4 + c];
                    total += kernel[2][0] * src[((y + 1) * width + (x - 1)) * 4 + c];
                    total += kernel[2][1] * src[((y + 1) * width + x) * 4 + c];
                    total += kernel[2][2] * src[((y + 1) * width + (x + 1)) * 4 + c];

                    // 元の値 * (1-factor) + 畳み込み結果 * factor でブレンド
                    dst[i] = src[i] * (1 - factor) + total * factor;
                }
            }
        }
        return new ImageData(outputData, width, height);
    }
    
    // 「元画像＋コントラスト＋シャープ＋モードに応じたオーバーレイ」までをまとめて描画
    function redrawAfterCanvas() {
        if (!originalImage) return null;

        // tempCanvasを元画像と同じサイズに設定
        tempCanvas.width = originalImageWidth;
        tempCanvas.height = originalImageHeight;
        
        // beforeキャンバスから元画像のImageDataを取得
        let processedImageData = ctxBefore.getImageData(0, 0, originalImageWidth, originalImageHeight);

        // コントラスト → シャープの順に適用
        processedImageData = applyThresholdContrast(processedImageData, contrastSlider.value);
        processedImageData = applySharpening(processedImageData, sharpenSlider.value);

        // 処理結果をtempCanvasに貼り付け
        tempCtx.putImageData(processedImageData, 0, 0);

        // afterキャンバスも元画像サイズにリサイズして、tempから描画
        canvasAfter.width = originalImageWidth;
        canvasAfter.height = originalImageHeight;
        ctxAfter.drawImage(tempCanvas, 0, 0);

        // 粒子解析モードのときは、画面表示用に二値化＆粒子外枠も描画
        if (currentMode === 'particle_size') {
            // 表示用のImageDataを生成
            let visualProcessedImageData = ctxBefore.getImageData(0, 0, originalImageWidth, originalImageHeight);
            visualProcessedImageData = applyThresholdContrast(visualProcessedImageData, contrastSlider.value);
            visualProcessedImageData = applySharpening(visualProcessedImageData, sharpenSlider.value);

            // 二値化してafterキャンバスに描画
            let visualThresholdedImageData = applyThreshold(visualProcessedImageData, parseInt(thresholdSlider.value));
            ctxAfter.putImageData(visualThresholdedImageData, 0, 0);

            // 検出済み粒子の外枠を重ねて表示
            drawParticlesOutlines(particles);
        }
        
        // 測長モード or 粒子スケール設定中のときに、点と線を重ねて描画
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
        
        // 粒子ROI測定中のときは青色で線を描く
        if (currentMode === 'particle_size' && particleMeasurementState === 'in_progress' && measurementPoints.length > 0) {
            const markerColor = '#0000FF';
            drawMarker(measurementPoints[0].x, measurementPoints[0].y, markerColor);
            if (measurementPoints.length === 2) {
                drawMarker(measurementPoints[1].x, measurementPoints[1].y, markerColor);
                drawLine(measurementPoints[0], measurementPoints[1], markerColor);
            }
        }

        // ROI選択中なら赤枠で矩形を描画
        if (isSelecting) {
            ctxAfter.strokeStyle = 'red';
            ctxAfter.lineWidth = 4;
            const { x, y, w, h } = getSelectionRect();
            ctxAfter.strokeRect(x, y, w, h);
        }

        // 粒子解析で再利用するために processedImageData を返す
        return processedImageData;
    }

    // 以下、測長リセット・粒子解析・ROI関連・イベントリスナーなどは
    // これまでの説明を細かく分解して、
    // それぞれの if / ループ / 状態変更の行の上に短めコメントを入れる形で構成しています。
    // （長くなるのでここから先は必要なところをピンポイントで増補していく運用を想定）

    function resetMeasurementState() {
        // 測長用の点とスケール情報を初期化
        measurementPoints = [];
        scale = { pixels: null, realLength: null, unit: null };
        calibrationState = 'idle';
        measurementState = 'idle';

        // 表示をデフォルトに戻す
        scaleDisplay.textContent = '未設定';
        measureResult.textContent = '0 px';
        scaleActionButton.textContent = 'スケール設定開始';
        scaleActionButton.classList.remove('btn-danger', 'btn-secondary');
        scaleActionButton.classList.add('btn-info');
        scaleActionButton.disabled = false;
        resetScaleContainer.classList.add('d-none');
        measureActionButton.textContent = '測定を開始する';
        measureActionButton.disabled = true;

        // オーバーレイを消して再描画
        redrawAfterCanvas();
    }

    function resetSharpeningState() {
        if (!originalImage) return;
        // シャープスライダーを0にリセット
        sharpenSlider.value = 0;
        sharpenValue.textContent = 0;
        redrawAfterCanvas();
    }
    
    function resetApp() {
        if (!originalImage) return;
        
        // 元画像に戻すボタンはデフォルト非表示
        revertImageBtn.classList.add('d-none');

        // afterキャンバスを元画像サイズに戻して再描画
        canvasAfter.width = originalImageWidth;
        canvasAfter.height = originalImageHeight;
        ctxAfter.drawImage(originalImage, 0, 0);

        // CSSのレスポンシブ表示を維持
        canvasAfter.classList.add('img-fluid');

        // コントラストをデフォルト値に戻す
        contrastSlider.value = 100;
        contrastValue.textContent = 100;
        
        // 各種状態リセット
        resetSharpeningState();
        resetMeasurementState();
        resetParticleSizeState();
        resetCroppedImageState();
        
        // モードをコントラストに戻して再描画
        switchMode('contrast');
    }
    
    function clearMeasurements() {
        if (!originalImage) return;
        // 測定点を消すだけ（スケール情報は残す）
        measurementPoints = [];
        const resultUnit = scale.unit ? scale.unit : 'px';
        measureResult.textContent = `0 ${resultUnit}`;
        redrawAfterCanvas();
    }

    function switchMode(mode) {
        // ROIモードを再押下したときはコントラストへ戻すトグル動作
        if (currentMode === 'roi_select' && mode === 'roi_select') {
            switchMode('contrast');
            return;
        }

        currentMode = mode;

        // すべてのコントロール群を非表示に
        const allControls = document.querySelectorAll('.control-group');
        allControls.forEach(c => c.classList.add('d-none'));

        // モードボタンを一度全部「secondary」に戻す
        const allModeBtns = [contrastModeBtn, sharpenModeBtn, measureModeBtn, particleSizeModeBtn, roiSelectModeBtn];
        allModeBtns.forEach(btn => {
            btn.classList.replace('btn-primary', 'btn-secondary');
            if (btn.id === 'roiSelectModeBtn') btn.textContent = '範囲選択';
        });

        // キャンバスは基本的にレスポンシブ表示
        canvasAfter.classList.add('img-fluid');

        let activeControls = null;
        let activeButton = null;
        let isRoiMode = false;

        // 選択モードごとに表示するコントロールとボタンを決定
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
        
        // 対象コントロールを表示し、ボタン色をprimaryへ
        if (activeControls) activeControls.classList.remove('d-none');
        if (activeButton) activeButton.classList.replace('btn-secondary', 'btn-primary');
        
        // ROIモード時だけカーソルを十字にする
        canvasAfter.style.cursor = isRoiMode ? 'crosshair' : 'default';

        // モード変更に応じてオーバーレイを再描画
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
            
            // アスペクト比が一定以下（ほぼ円形〜正方形）の粒子だけを描画
            if (aspectRatio <= ASPECT_RATIO_THRESHOLD) {
                ctxAfter.strokeStyle = '#00FF00';
                ctxAfter.lineWidth = 1;
                ctxAfter.strokeRect(p.minX, p.minY, p.maxX - p.minX + 1, p.maxY - p.minY + 1);
            }
        });
    }

    function resetParticleSizeState() {
        // 粒子一覧と各種表示を初期化
        particles = [];
        thresholdSlider.value = 128;
        thresholdValue.textContent = 128;
        particleCount.textContent = '0';
        averageDiameterPx.textContent = '0.00';
        averageDiameterReal.textContent = '未設定';
        averageDiameterUnit.textContent = '未設定';
        roiRealLength.textContent = '未設定';
        roiRealUnit.textContent = '未設定';

        // 粒子用スケール情報をリセット
        particleCalibrationState = 'idle';
        particleScale = { pixels: null, realLength: null, unit: null };
        particleScaleDisplay.textContent = '未設定';
        particleScaleActionButton.textContent = 'スケール設定開始';
        particleScaleActionButton.classList.remove('btn-danger', 'btn-secondary');
        particleScaleActionButton.classList.add('btn-info');
        particleScaleActionButton.disabled = false;
        particleResetScaleContainer.classList.add('d-none');

        // ROI測定状態をリセット
        particleMeasurementState = 'idle';
        analyzeParticlesBtn.textContent = '粒径を測定する';
        analyzeParticlesBtn.disabled = true;
        remapParticlesContainer.classList.add('d-none');

        redrawAfterCanvas(); 
    }

    // ===== NEW ROI FUNCTIONS =====

    function getSelectionRect() {
        // ドラッグ開始・終了座標から左上x,yと幅・高さを算出
        const x = Math.min(selectionRect.startX, selectionRect.endX);
        const y = Math.min(selectionRect.startY, selectionRect.endY);
        const w = Math.abs(selectionRect.startX - selectionRect.endX);
        const h = Math.abs(selectionRect.startY - selectionRect.endY);
        return { x, y, w, h };
    }

    function cropImageAndShowModal() {
        if (!originalImage) return;
        const rect = getSelectionRect();
        // 幅か高さが1px未満なら無効な選択としてリセット
        if (rect.w < 1 || rect.h < 1) {
            resetCroppedImageState();
            return;
        }

        // beforeキャンバス上の指定矩形領域をImageDataとして取得
        croppedImageData = ctxBefore.getImageData(rect.x, rect.y, rect.w, rect.h);
        
        // モーダル内キャンバスに描画してプレビュー表示
        canvasCroppedModal.width = rect.w;
        canvasCroppedModal.height = rect.h;
        ctxCroppedModal.putImageData(croppedImageData, 0, 0);
        
        cropResultModal.show();
    }
    
    function resetCroppedImageState() {
        // 切り抜き結果を破棄＆モーダルキャンバスをクリア
        croppedImageData = null;
        ctxCroppedModal.clearRect(0, 0, canvasCroppedModal.width, canvasCroppedModal.height);
    }
    
    function setCroppedAsNew() {
        if (!croppedImageData) return;
        
        // まずモーダルを閉じる
        cropResultModal.hide();

        // 一時キャンバスを用意して切り抜きImageDataを描画
        const newImage = new Image();
        const tempCropCanvas = document.createElement('canvas');
        tempCropCanvas.width = croppedImageData.width;
        tempCropCanvas.height = croppedImageData.height;
        tempCropCanvas.getContext('2d').putImageData(croppedImageData, 0, 0);

        // 一時キャンバスをDataURL化し、新しいImageとして読み込む
        newImage.onload = () => {
            // これ以降は切り抜いた画像を「新しい元画像」として扱う
            originalImage = newImage;
            originalImageWidth = originalImage.width;
            originalImageHeight = originalImage.height;

            canvasBefore.width = originalImageWidth;
            canvasBefore.height = originalImageHeight;
            ctxBefore.drawImage(originalImage, 0, 0);
            
            // 状態をリセットし、元画像に戻るボタンを表示
            resetApp();
            revertImageBtn.classList.remove('d-none');
        };
        newImage.src = tempCropCanvas.toDataURL();
    }


    // ===== EVENT LISTENERS =====

    // 画像読み込み時の処理
    imageLoader.addEventListener('change', e => {
        if (!e.target.files[0]) return;
        const reader = new FileReader();

        reader.onload = async event => {
            const imageDataUrl = event.target.result;
            
            // 画像をDBに保存（元画像に戻すための機能用）
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
                return;
            }

            // FileReaderで読み込んだDataURLをImageにセット
            originalImage = new Image();
            originalImage.onload = () => {
                originalImageWidth = originalImage.width;
                originalImageHeight = originalImage.height;

                // beforeキャンバスに元画像を描画
                canvasBefore.width = originalImageWidth;
                canvasBefore.height = originalImageHeight;
                ctxBefore.drawImage(originalImage, 0, 0);
                
                // アプリ状態リセット
                resetApp();
            };
            originalImage.src = imageDataUrl;
        };

        // 選択ファイルをDataURLとして読み込む
        reader.readAsDataURL(e.target.files[0]);
    });

    // 各モード切り替えボタン
    contrastModeBtn.addEventListener('click', () => switchMode('contrast'));
    sharpenModeBtn.addEventListener('click', () => switchMode('sharpen'));
    measureModeBtn.addEventListener('click', () => switchMode('measure'));
    particleSizeModeBtn.addEventListener('click', () => switchMode('particle_size'));
    roiSelectModeBtn.addEventListener('click', () => switchMode('roi_select'));
    
    // リセット・クリアボタン
    resetBtn.addEventListener('click', resetApp);
    clearMeasurementBtn.addEventListener('click', clearMeasurements);
    clearParticlesBtn.addEventListener('click', resetParticleSizeState);

    // 元画像に戻すボタン（DBから再ロード）
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
                    originalImage = newImage;
                    originalImageWidth = originalImage.width;
                    originalImageHeight = originalImage.height;

                    canvasBefore.width = originalImageWidth;
                    canvasBefore.height = originalImageHeight;
                    ctxBefore.drawImage(originalImage, 0, 0);
                    
                    resetApp();
                };
                newImage.src = data.image_data;
            }
        } catch (error) {
            console.error('Error loading original image:', error);
            alert('元の画像を読み込めませんでした。');
        }
    });

    // モーダルのボタンと閉じたときの処理
    setCroppedAsNewBtnModal.addEventListener('click', setCroppedAsNew);
    cropResultModalEl.addEventListener('hidden.bs.modal', resetCroppedImageState);

    // コントラスト・シャープ・閾値のリセットボタン
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

    // スケール設定開始ボタン
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

    // 長さ測定ボタン
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

        // ROI内の粒子解析開始
        particleMeasurementState = 'in_progress';
        measurementPoints = [];
        analyzeParticlesBtn.textContent = '測定中';
        remapParticlesContainer.classList.add('d-none');
        // コントラスト・シャープ適用済みImageDataを保存
        currentProcessedImageData = redrawAfterCanvas();
    });

    analyzeMultipleParticlesBtn.addEventListener('click', () => {
        // 画像全体を対象に粒子解析
        analyzeAllParticles();
    });

    remapParticlesBtn.addEventListener('click', () => {
        if (currentMode !== 'particle_size') return;
        // ROI指定をやり直すためのリセット
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

    // 閾値スライダーを動かしたときに二値化をリアルタイム更新
    thresholdSlider.addEventListener('input', (e) => {
        thresholdValue.textContent = e.target.value;
        if (currentMode === 'particle_size' && originalImage) {
            redrawAfterCanvas();
        }
    });

    // --- Particle Size Scale Button Listeners ---

    // 粒子解析用スケール設定
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
    
    // 画面上のマウス座標 → キャンバス上のピクセル座標に変換
    function getCanvasCoordinates(e) {
        const rect = canvasAfter.getBoundingClientRect();
        const scaleX = canvasAfter.width / rect.width;
        const scaleY = canvasAfter.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        return { x, y };
    }

    // ROI範囲選択の開始（マウス押下）
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
    
    // ROI範囲選択中（ドラッグ中は矩形を更新して再描画）
    canvasAfter.addEventListener('mousemove', e => {
        if (currentMode === 'roi_select' && isSelecting) {
            const { x, y } = getCanvasCoordinates(e);
            selectionRect.endX = x;
            selectionRect.endY = y;
            redrawAfterCanvas();
        }
    });

    // ROI選択完了（マウスを離したタイミングでトリミング＆モーダル表示）
    canvasAfter.addEventListener('mouseup', e => {
        if (currentMode === 'roi_select') {
            if (!originalImage || !isSelecting) return;
            isSelecting = false;
            cropImageAndShowModal();
            redrawAfterCanvas(); // 選択枠だけ消すため再描画
        }
    });

    // キャンバスクリック（測長/粒子スケール設定/粒子ROI指定に使う）
    canvasAfter.addEventListener('click', e => {
        if (!originalImage) return;
        // ROIドラッグ完了直後のクリックイベントは無視
        if (isSelecting) return;

        const { x, y } = getCanvasCoordinates(e);

        // --- 通常測長モード ---
        if (currentMode === 'measure') {
            // スケール設定中 or 測定中 以外なら何もしない
            if (calibrationState !== 'in_progress' && measurementState !== 'in_progress') return;

            measurementPoints.push({ x, y });
            const markerColor = (calibrationState === 'in_progress') ? '#dc3545' : '#ffc107';
            drawMarker(x, y, markerColor);

            if (measurementPoints.length === 2) {
                const [p1, p2] = measurementPoints;
                const pixelDistance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

                // --- スケール設定フェーズ ---
                if (calibrationState === 'in_progress') {
                    const realLength = parseFloat(scaleLengthInput.value);
                    if (!realLength || realLength <= 0) {
                        alert("基準長には0より大きい数値を入力してください。");
                        resetMeasurementState();
                        return;
                    }

                    // スケール情報を保存（px長と実長）
                    scale = { pixels: pixelDistance, realLength: realLength, unit: scaleUnitInput.value };
                    scaleDisplay.textContent = `${scale.realLength.toFixed(2)} ${scale.unit} = ${scale.pixels.toFixed(2)} px`;
                    
                    calibrationState = 'complete';
                    scaleActionButton.textContent = '設定完了';
                    scaleActionButton.classList.replace('btn-danger', 'btn-secondary');
                    scaleActionButton.disabled = true;
                    resetScaleContainer.classList.remove('d-none');
                    measureActionButton.disabled = false;
                    
                    drawLine(p1,p2,markerColor);
                    // 少し表示したあと線を消す
                    setTimeout(clearMeasurements, 500);

                // --- 実際の測長フェーズ ---
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

        // --- 粒子用スケール設定フェーズ ---
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
            
                // 粒子解析用スケール（px長 ↔ 実長）を保存
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

        // --- 粒子解析用のROI指定フェーズ ---
        } else if (currentMode === 'particle_size' && particleMeasurementState === 'in_progress') {
            measurementPoints.push({ x, y });
            drawMarker(x, y, '#0000FF');
            
            if (measurementPoints.length === 2) {
                const [p1, p2] = measurementPoints;
                const pixelDistance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            
                // スケールが設定されていればROIの実長も表示
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
                
                // ROI内の粒子解析を実行
                analyzeParticlesInRegion(p1, p2, currentProcessedImageData);
                drawLine(p1, p2, '#0000FF');
                drawMarker(p1.x, p1.y, '#0000FF');
                drawMarker(p2.x, p2.y, '#0000FF');
            }
        }
    });

    // --- Other Listeners ---

    // コントラスト・シャープのスライダー操作時に再描画
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

    // 加工後画像のダウンロード
    downloadBtn.addEventListener('click', () => {
        if (!originalImage) return;
        const link = document.createElement('a');
        link.download = 'edited-image.png';
        link.href = canvasAfter.toDataURL('image/png');
        link.click();
    });

    // 初期モードはコントラスト
    switchMode('contrast');

    // ページを閉じる際にサーバーへ「終了リクエスト」を投げる
    window.addEventListener('unload', () => {
        if (navigator.sendBeacon) {
            navigator.sendBeacon('/shutdown', new Blob(), {type : 'application/x-www-form-urlencoded'});
        }
    });

    // --- Particle Size Measurement Functions ---

    // グレースケール変換
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

    // 閾値による二値化処理（brightness > threshold ? 白 : 黒）
    function applyThreshold(imageData, threshold) {
        if (!imageData) return null;
        // 元のImageDataをコピーしてから処理（原本を壊さない）
        let processedImageData = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
        processedImageData = grayscale(processedImageData);

        const data = processedImageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const brightness = data[i];
            const value = brightness > threshold ? 255 : 0;
            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
        }
        return processedImageData;
    }

    // 画像全体を対象に粒子解析を行う
    function analyzeAllParticles() {
        if (!originalImage) {
            alert('画像を読み込んでください。');
            return;
        }
        if (currentMode !== 'particle_size') {
            switchMode('particle_size');
        }

        // ROIとして画像全体を指定
        const p1 = { x: 0, y: 0 };
        const p2 = { x: canvasAfter.width, y: canvasAfter.height };

        // コントラスト・シャープ適用済みImageDataを取得
        const processedImageData = redrawAfterCanvas();
        if (!processedImageData) return;

        // 全域で粒子解析
        analyzeParticlesInRegion(p1, p2, processedImageData);

        // 外枠描画も含めて再描画
        redrawAfterCanvas();
        drawParticlesOutlines(particles);
    }
    
    // ROIと処理済ImageDataをもとに粒子を検出・径計算
    function analyzeParticlesInRegion(p1, p2, processedImageData) {
        if (!originalImage || !processedImageData) {
            alert('画像を読み込んでください。');
            return;
        }

        // ROI範囲のmin/max座標を計算
        const roiMinX = Math.min(p1.x, p2.x);
        const roiMaxX = Math.max(p1.x, p2.x);
        const roiMinY = Math.min(p1.y, p2.y);
        const roiMaxY = Math.max(p1.y, p2.y);

        // コントラスト・シャープ適用済み画像を二値化
        let thresholdedImageData = applyThreshold(processedImageData, parseInt(thresholdSlider.value));
        const width = thresholdedImageData.width;
        const height = thresholdedImageData.height;
        const pixels = thresholdedImageData.data;

        const visited = new Uint8Array(width * height); // 各画素を1bitで訪問管理
        particles = [];

        // 指定座標の画素値(0 or 255)を返すヘルパー
        const getPixel = (x, y) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return 0;
            return pixels[(y * width + x) * 4];
        };

        // 1粒子ブロブをBFSで探索するフラッドフィル
        const floodFill = (startX, startY) => {
            const queue = [{ x: startX, y: startY }];
            let minX = startX, maxX = startX, minY = startY, maxY = startY;
            let pixelCount = 0;
            let perimeterCount = 0;
            const pixelsInBlob = [];

            while (queue.length > 0) {
                const { x, y } = queue.shift();
                const index = y * width + x;

                // ROI外 or 領域外 or 既訪問 or 背景(黒)ならスキップ
                if (x < roiMinX || x > roiMaxX || y < roiMinY || y > roiMaxY ||
                    x < 0 || x >= width || y < 0 || y >= height || visited[index] || getPixel(x, y) === 0) {
                    continue;
                }

                visited[index] = 1;
                pixelCount++;
                pixelsInBlob.push({x, y});

                // 外接矩形を更新
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);

                // 4近傍をキューに追加
                queue.push({ x: x + 1, y: y });
                queue.push({ x: x - 1, y: y });
                queue.push({ x: x, y: y + 1 });
                queue.push({ x: x, y: y - 1 });
            }

            if (pixelCount > 0) {
                // 周囲長(周りが背景に接しているピクセル数×1)を計算
                pixelsInBlob.forEach(({x, y}) => {
                    if (getPixel(x + 1, y) === 0) perimeterCount++;
                    if (getPixel(x - 1, y) === 0) perimeterCount++;
                    if (getPixel(x, y + 1) === 0) perimeterCount++;
                    if (getPixel(x, y - 1) === 0) perimeterCount++;
                });

                const particleWidth = maxX - minX + 1;
                const particleHeight = maxY - minY + 1;
                // 粒子情報を一旦追加（直径や円形度は後で詰める）
                particles.push({
                    x: (minX + maxX) / 2,
                    y: (minY + maxY) / 2,
                    width: particleWidth,
                    height: particleHeight,
                    diameterPx: 0,
                    pixelCount: pixelCount,
                    perimeter: perimeterCount,
                    minX: minX,
                    minY: minY,
                    maxX: maxX,
                    maxY: maxY
                });
            }
        };

        // ROI内の全ピクセルを走査して、白(255)かつ未訪問ならフラッドフィル
        for (let y = Math.floor(roiMinY); y <= Math.ceil(roiMaxY); y++) {
            for (let x = Math.floor(roiMinX); x <= Math.ceil(roiMaxX); x++) {
                const index = y * width + x;
                if (!visited[index] && getPixel(x, y) === 255) {
                    floodFill(x, y);
                }
            }
        }
        
        // ごく小さいノイズ(画素数5未満)を除外
        const minPixelCount = 5;
        let rawParticles = particles.filter(p => p.pixelCount >= minPixelCount);

        const circularityThreshold = 1.0;
        const goodParticles = [];
        const mergedBlobs = [];

        // 1stパス: 円形度・直径を計算して「単粒子」と「複数粒子ブロブ」に分類
        rawParticles.forEach(p => {
            if (p.perimeter === 0) {
                p.circularity = 0;
            } else {
                p.circularity = (4 * Math.PI * p.pixelCount) / (p.perimeter * p.perimeter);
            }
            
            // 面積から相当円直径を算出 (2 * sqrt(A/π))
            p.diameterPx = 2 * Math.sqrt(p.pixelCount / Math.PI);

            if (p.circularity >= circularityThreshold) {
                // 円形度が高い → 単粒子とみなす
                goodParticles.push(p);
            } else {
                // 複数粒子がくっついた可能性 → mergedBlobsへ
                mergedBlobs.push(p);
            }
        });

        let finalParticles = [...goodParticles];

        // 単粒子の平均面積から、mergedBlobs内の「粒子数」を推定して分割
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
                            isVirtual: true // 分割推定による仮想粒子であることを示すフラグ
                        });
                    }
                } else {
                    finalParticles.push(blob);
                }
            });
        } else {
            // 単粒子候補が一つもなければそのまま rawParticles を使う
            finalParticles = [...rawParticles];
        }

        particles = finalParticles;

        // 外れ値の除去（平均±2σから外れた直径を持つ粒子を除く）
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

        // アスペクト比で極端な縦長・横長を除外
        particles = particles.filter(p => {
            const aspectRatio = Math.max(p.width, p.height) / Math.min(p.width, p.height);
            return aspectRatio <= ASPECT_RATIO_THRESHOLD;
        });

        // 残った粒子の平均直径(px)を計算
        let totalDiameterPx = 0;
        particles.forEach(p => { totalDiameterPx += p.diameterPx; });

        const count = particles.length;
        const avgDiameterPx = count > 0 ? (totalDiameterPx / count) : 0;
        
        // 個数・平均直径(px)を表示
        particleCount.textContent = count;
        averageDiameterPx.textContent = avgDiameterPx.toFixed(2);

        // スケールが設定されていれば、実長[nm, μm 等]に変換して表示
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
