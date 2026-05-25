/**
 * 伪装计算器 - 隐私保险箱 v3
 * 外观：iOS风格房贷计算器
 * 触发：连续按 C 键 5 次进入隐私系统
 * 新增：假密码模式、相册分类、回收站、批量操作、缩略图、生物识别
 */

// ==================== Capacitor API 兼容层 ====================
const CapacitorAPI = {
    camera: null,
    filesystem: null,
    preferences: null,
    isNative: false
};

function initCapacitorAPI() {
    if (window.Capacitor && window.Capacitor.Plugins) {
        CapacitorAPI.camera = window.Capacitor.Plugins.Camera;
        CapacitorAPI.filesystem = window.Capacitor.Plugins.Filesystem;
        CapacitorAPI.preferences = window.Capacitor.Plugins.Preferences;
        CapacitorAPI.isNative = window.Capacitor.isNativePlatform();
    }
}

// ==================== 全局状态 ====================
const state = {
    display: '0',
    expression: '',
    previousValue: null,
    operator: null,
    waitingForOperand: false,
    cPressCount: 0,
    cPressTimer: null,
    calcHistory: JSON.parse(localStorage.getItem('calc_history') || '[]'),
    showHistory: false,
    loanAmount: '',
    loanYears: '',
    interestRate: '',
    loanType: 'equal_payment',
    calcMode: 'standard',
    isVaultOpen: false,
    isFakeVault: false,
    vaultPassword: localStorage.getItem('vault_password') || '',
    fakePassword: localStorage.getItem('fake_password') || '',
    vaultTab: 'photos',
    photos: [],
    photoCategory: 'all',
    photoCategories: JSON.parse(localStorage.getItem('photo_categories') || '["全部","未分类"]'),
    files: [],
    notes: JSON.parse(localStorage.getItem('vault_notes') || '[]'),
    browserHistory: JSON.parse(localStorage.getItem('browser_history') || '[]'),
    browserFullscreen: false,
    emergencyExit: false,
    trash: JSON.parse(localStorage.getItem('vault_trash') || '[]'),
    selectedPhotos: new Set(),
    isSelectMode: false,
    showPreview: false,
    previewIndex: 0
};

// ==================== IndexedDB 存储（Web 环境大文件） ====================
const FileDB = {
    db: null,
    DB_NAME: 'VaultFileDB',
    DB_VERSION: 1,
    STORE_NAME: 'files',

    async init() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => { this.db = request.result; resolve(this.db); };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    },

    async save(id, data) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([this.STORE_NAME], 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.put({ id, data, timestamp: Date.now() });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async get(id) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([this.STORE_NAME], 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result ? request.result.data : null);
            request.onerror = () => reject(request.error);
        });
    },

    async delete(id) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([this.STORE_NAME], 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async clear() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([this.STORE_NAME], 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

// ==================== 数据持久化 ====================
const DataStore = {
    async get(key, fallback) {
        if (CapacitorAPI.preferences) {
            try {
                const r = await CapacitorAPI.preferences.get({ key });
                return r.value ? JSON.parse(r.value) : fallback;
            } catch (e) { return fallback; }
        }
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
    },
    async set(key, value) {
        if (CapacitorAPI.preferences) {
            try { await CapacitorAPI.preferences.set({ key, value: JSON.stringify(value) }); } catch (e) {}
        }
        localStorage.setItem(key, JSON.stringify(value));
    },
    async saveFile(base64Data, filename) {
        // 优先使用 Capacitor 原生文件系统
        if (CapacitorAPI.filesystem) {
            try {
                await CapacitorAPI.filesystem.writeFile({
                    path: 'vault/' + filename,
                    data: base64Data,
                    directory: window.Capacitor.Plugins.Filesystem.Directory.Data,
                    recursive: true
                });
                return { native: true, path: 'vault/' + filename };
            } catch (e) { console.error('Filesystem save failed', e); }
        }
        // Web 环境：使用 IndexedDB 存储大文件，避免 localStorage 5MB 限制
        try {
            const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            await FileDB.save(fileId, base64Data);
            return { native: false, webId: fileId };
        } catch (e) {
            console.error('IndexedDB save failed', e);
            // 最后的备选：直接返回 base64（仅在非常小的文件时可用）
            return { native: false, data: base64Data };
        }
    },
    async readFile(pathOrData) {
        // Capacitor 原生路径
        if (typeof pathOrData === 'string' && pathOrData.startsWith('vault/') && CapacitorAPI.filesystem) {
            try {
                const r = await CapacitorAPI.filesystem.readFile({
                    path: pathOrData,
                    directory: window.Capacitor.Plugins.Filesystem.Directory.Data
                });
                return 'data:image/jpeg;base64,' + r.data;
            } catch (e) { return null; }
        }
        // Web IndexedDB ID
        if (typeof pathOrData === 'string' && pathOrData.startsWith('file_')) {
            try {
                const data = await FileDB.get(pathOrData);
                return data;
            } catch (e) { return null; }
        }
        // 直接是 base64 数据
        return pathOrData;
    },
    async deleteFile(pathOrData) {
        // Capacitor 原生路径
        if (typeof pathOrData === 'string' && pathOrData.startsWith('vault/') && CapacitorAPI.filesystem) {
            try {
                await CapacitorAPI.filesystem.deleteFile({
                    path: pathOrData,
                    directory: window.Capacitor.Plugins.Filesystem.Directory.Data
                });
            } catch (e) {}
        }
        // Web IndexedDB ID
        if (typeof pathOrData === 'string' && pathOrData.startsWith('file_')) {
            try { await FileDB.delete(pathOrData); } catch (e) {}
        }
    }
};

async function loadVaultData() {
    state.photos = await DataStore.get('vault_photos_meta', []);
    state.files = await DataStore.get('vault_files_meta', []);
    state.notes = await DataStore.get('vault_notes', []);
    state.browserHistory = await DataStore.get('browser_history', []);
    state.calcHistory = await DataStore.get('calc_history', []);
    state.trash = await DataStore.get('vault_trash', []);
    state.photoCategories = await DataStore.get('photo_categories', ['全部','未分类']);
}

async function savePhotosMeta() { await DataStore.set('vault_photos_meta', state.photos); }
async function saveFilesMeta() { await DataStore.set('vault_files_meta', state.files); }
async function saveNotes() { await DataStore.set('vault_notes', state.notes); }
async function saveBrowserHistory() { await DataStore.set('browser_history', state.browserHistory); }
async function saveCalcHistory() { await DataStore.set('calc_history', state.calcHistory); }
async function saveTrash() { await DataStore.set('vault_trash', state.trash); }
async function saveCategories() { await DataStore.set('photo_categories', state.photoCategories); }

// ==================== 缩略图生成 ====================
function generateThumbnail(base64Data, maxSize = 300) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            let w = img.width, h = img.height;
            if (w > h) { if (w > maxSize) { h *= maxSize / w; w = maxSize; } }
            else { if (h > maxSize) { w *= maxSize / h; h = maxSize; } }
            canvas.width = w; canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => resolve(base64Data);
        img.src = base64Data;
    });
}

// ==================== DOM 渲染 ====================
function render() {
    const app = document.getElementById('app');
    if (!app) return;
    if (!state.isVaultOpen) {
        app.innerHTML = renderCalculator();
        attachCalculatorEvents();
    } else {
        app.innerHTML = renderVault();
        attachVaultEvents();
    }
}

// ==================== 计算器界面 ====================
function renderCalculator() {
    return `
    <div class="calculator-app">
        <div class="mode-toggle">
            <button class="mode-btn ${state.calcMode === 'standard' ? 'active' : ''}" data-mode="standard">标准</button>
            <button class="mode-btn ${state.calcMode === 'mortgage' ? 'active' : ''}" data-mode="mortgage">房贷</button>
        </div>
        ${state.calcMode === 'standard' ? renderStandardCalc() : renderMortgageCalc()}
        <div class="calc-footer"><span>房贷计算器 Pro</span></div>
    </div>
    <style>
    .calculator-app { height:100vh; display:flex; flex-direction:column; background:#000; padding-top:env(safe-area-inset-top); }
    .mode-toggle { display:flex; padding:10px 20px; gap:10px; }
    .mode-btn { flex:1; padding:8px; border:none; border-radius:20px; background:#333; color:#fff; font-size:14px; cursor:pointer; }
    .mode-btn.active { background:#ff9500; color:#000; font-weight:bold; }
    .display-area { flex:1; display:flex; flex-direction:column; align-items:flex-end; justify-content:flex-end; padding:10px 20px; min-height:120px; }
    .expression-text { font-size:20px; color:#aaa; min-height:28px; word-break:break-all; text-align:right; }
    .display-text { font-size:56px; font-weight:300; color:#fff; word-break:break-all; text-align:right; line-height:1.2; }
    .keypad { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; padding:10px 20px calc(20px + env(safe-area-inset-bottom)); }
    .key { aspect-ratio:1; border:none; border-radius:50%; font-size:28px; font-weight:500; cursor:pointer; transition:transform .1s, opacity .1s; display:flex; align-items:center; justify-content:center; user-select:none; -webkit-user-select:none; }
    .key:active { transform:scale(0.92); opacity:0.7; }
    .key.number { background:#333; color:#fff; }
    .key.operator { background:#ff9500; color:#fff; }
    .key.function { background:#a5a5a5; color:#000; }
    .key.zero { grid-column:span 2; aspect-ratio:auto; border-radius:50px; justify-content:flex-start; padding-left:32px; }
    .history-panel { position:fixed; top:0; right:0; width:280px; height:100vh; background:#1c1c1e; z-index:200; transform:translateX(${state.showHistory ? 0 : '100%'}); transition:transform .3s; display:flex; flex-direction:column; }
    .history-header { display:flex; align-items:center; justify-content:space-between; padding:16px; border-bottom:1px solid #333; }
    .history-header h3 { color:#ff9500; font-size:16px; margin:0; }
    .history-header button { background:none; border:none; color:#fff; font-size:20px; cursor:pointer; }
    .history-list { flex:1; overflow-y:auto; padding:10px 16px; }
    .history-item { padding:10px 0; border-bottom:1px solid #333; cursor:pointer; }
    .history-item .expr { color:#aaa; font-size:14px; }
    .history-item .res { color:#fff; font-size:18px; margin-top:2px; }
    .history-empty { color:#666; text-align:center; padding:40px 20px; }
    .history-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:199; display:${state.showHistory ? 'block' : 'none'}; }
    .calc-footer { text-align:center; padding:6px; font-size:12px; color:#444; }
    .history-toggle { position:absolute; left:20px; bottom:calc(20px + env(safe-area-inset-bottom)); background:#333; color:#fff; border:none; width:40px; height:40px; border-radius:50%; font-size:18px; cursor:pointer; z-index:50; }
    .mortgage-form { flex:1; padding:20px; overflow-y:auto; }
    .mortgage-form h3 { font-size:18px; margin-bottom:20px; color:#ff9500; }
    .form-group { margin-bottom:16px; }
    .form-group label { display:block; font-size:14px; color:#aaa; margin-bottom:6px; }
    .form-group input, .form-group select { width:100%; padding:14px; border:1px solid #333; border-radius:12px; background:#1c1c1e; color:#fff; font-size:18px; outline:none; }
    .form-group input:focus { border-color:#ff9500; }
    .calc-btn { width:100%; padding:16px; background:#ff9500; color:#000; border:none; border-radius:12px; font-size:18px; font-weight:bold; cursor:pointer; margin-top:10px; }
    .result-card { background:#1c1c1e; border-radius:16px; padding:20px; margin-top:20px; }
    .result-card h4 { color:#ff9500; margin-bottom:12px; }
    .result-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #333; font-size:15px; }
    .result-row:last-child { border-bottom:none; }
    .result-row .label { color:#aaa; }
    .result-row .value { color:#fff; font-weight:500; }
    .schedule-table { width:100%; margin-top:16px; border-collapse:collapse; font-size:13px; }
    .schedule-table th, .schedule-table td { padding:8px; text-align:center; border-bottom:1px solid #333; }
    .schedule-table th { color:#ff9500; }
    .schedule-table td { color:#ccc; }
    </style>
    `;
}

function renderStandardCalc() {
    const keys = [
        { label: 'C', type: 'function', action: 'clear' },
        { label: '±', type: 'function', action: 'negate' },
        { label: '%', type: 'function', action: 'percent' },
        { label: '÷', type: 'operator', value: '/' },
        { label: '7', type: 'number' },
        { label: '8', type: 'number' },
        { label: '9', type: 'number' },
        { label: '×', type: 'operator', value: '*' },
        { label: '4', type: 'number' },
        { label: '5', type: 'number' },
        { label: '6', type: 'number' },
        { label: '−', type: 'operator', value: '-' },
        { label: '1', type: 'number' },
        { label: '2', type: 'number' },
        { label: '3', type: 'number' },
        { label: '+', type: 'operator', value: '+' },
        { label: '0', type: 'number', class: 'zero' },
        { label: '.', type: 'number', action: 'decimal' },
        { label: '=', type: 'operator', action: 'equals' }
    ];
    return `
        <div class="display-area">
            <div class="expression-text">${state.expression}</div>
            <div class="display-text">${state.display}</div>
        </div>
        <div class="keypad">${keys.map(k => `
            <button class="key ${k.type} ${k.class || ''}"
                    data-action="${k.action || ''}"
                    data-value="${k.value || k.label}">${k.label}</button>
        `).join('')}</div>
        <button class="history-toggle" id="toggleHistory">🕐</button>
        <div class="history-overlay" id="historyOverlay"></div>
        <div class="history-panel">
            <div class="history-header">
                <h3>计算历史</h3>
                <button id="clearHistory">清空</button>
            </div>
            <div class="history-list">
                ${state.calcHistory.length === 0 ? '<div class="history-empty">暂无历史记录</div>' :
                  state.calcHistory.slice().reverse().map((h, i) => `
                    <div class="history-item" data-index="${state.calcHistory.length - 1 - i}">
                        <div class="expr">${h.expr}</div>
                        <div class="res">= ${h.result}</div>
                    </div>
                  `).join('')}
            </div>
        </div>
    `;
}

function renderMortgageCalc() {
    return `
        <div class="mortgage-form">
            <h3>🏠 房贷计算器</h3>
            <div class="form-group">
                <label>贷款金额（万元）</label>
                <input type="number" id="loanAmount" placeholder="例如：100" value="${state.loanAmount}">
            </div>
            <div class="form-group">
                <label>贷款年限（年）</label>
                <input type="number" id="loanYears" placeholder="例如：30" value="${state.loanYears}">
            </div>
            <div class="form-group">
                <label>年利率（%）</label>
                <input type="number" id="interestRate" step="0.01" placeholder="例如：3.85" value="${state.interestRate}">
            </div>
            <div class="form-group">
                <label>还款方式</label>
                <select id="loanType">
                    <option value="equal_payment" ${state.loanType === 'equal_payment' ? 'selected' : ''}>等额本息</option>
                    <option value="equal_principal" ${state.loanType === 'equal_principal' ? 'selected' : ''}>等额本金</option>
                </select>
            </div>
            <button class="calc-btn" id="calcMortgage">开始计算</button>
            <div id="mortgageResult"></div>
        </div>
    `;
}

// ==================== 计算器逻辑 ====================
function attachCalculatorEvents() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.calcMode = btn.dataset.mode;
            render();
        });
    });
    document.querySelectorAll('.key').forEach(key => {
        key.addEventListener('click', () => handleKeyPress(key));
    });
    const calcBtn = document.getElementById('calcMortgage');
    if (calcBtn) calcBtn.addEventListener('click', calculateMortgage);

    const histToggle = document.getElementById('toggleHistory');
    if (histToggle) {
        histToggle.addEventListener('click', () => { state.showHistory = true; render(); });
    }
    const histOverlay = document.getElementById('historyOverlay');
    if (histOverlay) {
        histOverlay.addEventListener('click', () => { state.showHistory = false; render(); });
    }
    const clearHist = document.getElementById('clearHistory');
    if (clearHist) {
        clearHist.addEventListener('click', () => {
            state.calcHistory = []; saveCalcHistory(); render();
        });
    }
    document.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
            const h = state.calcHistory[parseInt(item.dataset.index)];
            if (h) { state.display = h.result; state.expression = ''; updateDisplayOnly(); state.showHistory = false; render(); }
        });
    });
}

function updateDisplayOnly() {
    const d = document.querySelector('.display-text');
    const e = document.querySelector('.expression-text');
    if (d) d.textContent = state.display;
    if (e) e.textContent = state.expression;
}

function handleKeyPress(key) {
    const action = key.dataset.action;
    const value = key.dataset.value;

    if (value === 'C' || action === 'clear') {
        state.cPressCount++;
        clearTimeout(state.cPressTimer);
        state.cPressTimer = setTimeout(() => { state.cPressCount = 0; }, 2000);
        if (state.cPressCount >= 5) {
            state.cPressCount = 0;
            showPasswordDialog();
            return;
        }
        // 第5次之前正常执行清空
        state.display = '0'; state.expression = ''; state.previousValue = null; state.operator = null; state.waitingForOperand = false;
        updateDisplayOnly();
        return;
    }

    if (action === 'negate') {
        state.display = String(parseFloat(state.display) * -1);
    } else if (action === 'percent') {
        state.display = String(parseFloat(state.display) / 100);
    } else if (action === 'decimal') {
        if (!state.display.includes('.')) state.display += '.';
    } else if (action === 'equals') {
        performCalculation();
    } else if (key.classList.contains('operator')) {
        if (state.waitingForOperand) { state.operator = value; }
        else {
            if (state.previousValue !== null && state.operator) performCalculation();
            state.operator = value;
            state.previousValue = parseFloat(state.display);
            state.waitingForOperand = true;
            state.expression = state.display + ' ' + value + ' ';
        }
    } else if (key.classList.contains('number')) {
        if (state.waitingForOperand) { state.display = value; state.waitingForOperand = false; }
        else { state.display = state.display === '0' ? value : state.display + value; }
    }
    updateDisplayOnly();
}

function performCalculation() {
    const current = parseFloat(state.display);
    const previous = state.previousValue;
    if (previous === null || !state.operator) return;
    let result;
    switch (state.operator) {
        case '+': result = previous + current; break;
        case '-': result = previous - current; break;
        case '*': result = previous * current; break;
        case '/': result = current !== 0 ? previous / current : 'Error'; break;
        default: return;
    }
    const expr = `${previous} ${state.operator === '*' ? '×' : state.operator === '/' ? '÷' : state.operator} ${current}`;
    state.display = result === 'Error' ? 'Error' : String(parseFloat(result.toFixed(8)));
    state.expression = expr + ' =';
    state.previousValue = null; state.operator = null; state.waitingForOperand = true;
    if (result !== 'Error') {
        state.calcHistory.push({ expr, result: state.display, time: Date.now() });
        if (state.calcHistory.length > 50) state.calcHistory.shift();
        saveCalcHistory();
    }
    updateDisplayOnly();
}

// ==================== 房贷计算（带校验） ====================
function calculateMortgage() {
    const amountInput = document.getElementById('loanAmount').value;
    const yearsInput = document.getElementById('loanYears').value;
    const rateInput = document.getElementById('interestRate').value;
    const type = document.getElementById('loanType').value;

    const amount = parseFloat(amountInput) * 10000;
    const years = parseInt(yearsInput);
    const rate = parseFloat(rateInput) / 100;

    if (!amountInput || !yearsInput || !rateInput) { alert('请填写完整信息'); return; }
    if (isNaN(amount) || isNaN(years) || isNaN(rate) || amount <= 0 || years <= 0 || rate <= 0) {
        alert('请输入有效的数字'); return;
    }

    const months = years * 12;
    const monthRate = rate / 12;
    let resultHtml = '<div class="result-card">';

    if (type === 'equal_payment') {
        const monthPayment = amount * monthRate * Math.pow(1 + monthRate, months) / (Math.pow(1 + monthRate, months) - 1);
        const totalPayment = monthPayment * months;
        const totalInterest = totalPayment - amount;
        resultHtml += `<h4>💰 计算结果（等额本息）</h4>
            <div class="result-row"><span class="label">每月还款</span><span class="value">¥${monthPayment.toFixed(2)}</span></div>
            <div class="result-row"><span class="label">还款总额</span><span class="value">¥${(totalPayment/10000).toFixed(2)}万</span></div>
            <div class="result-row"><span class="label">支付利息</span><span class="value">¥${(totalInterest/10000).toFixed(2)}万</span></div>
            <div class="result-row"><span class="label">贷款本金</span><span class="value">¥${(amount/10000).toFixed(2)}万</span></div>`;
        resultHtml += `<h4 style="margin-top:16px;">📋 还款计划（前12期）</h4>
            <table class="schedule-table"><tr><th>期数</th><th>月供</th><th>本金</th><th>利息</th><th>剩余本金</th></tr>`;
        let remaining = amount;
        for (let i = 1; i <= Math.min(months, 12); i++) {
            const interest = remaining * monthRate;
            const principal = monthPayment - interest;
            remaining -= principal;
            resultHtml += `<tr><td>${i}</td><td>¥${monthPayment.toFixed(0)}</td><td>¥${principal.toFixed(0)}</td><td>¥${interest.toFixed(0)}</td><td>¥${Math.max(0,remaining).toFixed(0)}</td></tr>`;
        }
        resultHtml += '</table>';
    } else {
        const monthPrincipal = amount / months;
        const firstMonthInterest = amount * monthRate;
        const firstMonthPayment = monthPrincipal + firstMonthInterest;
        const totalInterest = (amount * monthRate * (months + 1)) / 2;
        const totalPayment = amount + totalInterest;
        const decreasePerMonth = monthPrincipal * monthRate;
        resultHtml += `<h4>💰 计算结果（等额本金）</h4>
            <div class="result-row"><span class="label">首月还款</span><span class="value">¥${firstMonthPayment.toFixed(2)}</span></div>
            <div class="result-row"><span class="label">每月递减</span><span class="value">¥${decreasePerMonth.toFixed(2)}</span></div>
            <div class="result-row"><span class="label">还款总额</span><span class="value">¥${(totalPayment/10000).toFixed(2)}万</span></div>
            <div class="result-row"><span class="label">支付利息</span><span class="value">¥${(totalInterest/10000).toFixed(2)}万</span></div>`;
        resultHtml += `<h4 style="margin-top:16px;">📋 还款计划（前12期）</h4>
            <table class="schedule-table"><tr><th>期数</th><th>月供</th><th>本金</th><th>利息</th><th>剩余本金</th></tr>`;
        let remaining = amount;
        for (let i = 1; i <= Math.min(months, 12); i++) {
            const interest = remaining * monthRate;
            const payment = monthPrincipal + interest;
            remaining -= monthPrincipal;
            resultHtml += `<tr><td>${i}</td><td>¥${payment.toFixed(0)}</td><td>¥${monthPrincipal.toFixed(0)}</td><td>¥${interest.toFixed(0)}</td><td>¥${Math.max(0,remaining).toFixed(0)}</td></tr>`;
        }
        resultHtml += '</table>';
    }
    resultHtml += '</div>';
    document.getElementById('mortgageResult').innerHTML = resultHtml;
    state.loanAmount = amountInput;
    state.loanYears = yearsInput;
    state.interestRate = rateInput;
    state.loanType = type;
}

// ==================== 密码验证（支持假密码） ====================
function showPasswordDialog() {
    const isFirstTime = !state.vaultPassword;
    const title = isFirstTime ? '🔐 设置隐私密码' : '🔐 输入隐私密码';
    const dialog = document.createElement('div');
    dialog.className = 'password-dialog';
    dialog.innerHTML = `
        <div class="password-overlay">
            <div class="password-box">
                <h3>${title}</h3>
                <input type="password" id="vaultPassInput" placeholder="${isFirstTime ? '设置4-6位密码' : '输入密码'}" maxlength="6" inputmode="numeric" pattern="[0-9]*">
                ${isFirstTime ? `
                    <input type="password" id="vaultPassConfirm" placeholder="确认密码" maxlength="6" style="margin-top:10px;" inputmode="numeric" pattern="[0-9]*">
                    <div style="margin-top:8px;font-size:12px;color:#888;">可选：设置假密码（输入假密码进入伪装保险箱）</div>
                    <input type="password" id="fakePassInput" placeholder="假密码（可选）" maxlength="6" style="margin-top:6px;" inputmode="numeric" pattern="[0-9]*">
                ` : ''}
                <div class="password-btns">
                    <button class="pwd-btn cancel">取消</button>
                    <button class="pwd-btn confirm">确定</button>
                </div>
            </div>
        </div>
        <style>
        .password-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.9); display:flex; align-items:center; justify-content:center; z-index:10000; }
        .password-box { background:#1c1c1e; padding:30px; border-radius:20px; width:80%; max-width:320px; text-align:center; }
        .password-box h3 { margin-bottom:20px; color:#ff9500; }
        .password-box input { width:100%; padding:14px; border-radius:12px; border:1px solid #333; background:#000; color:#fff; font-size:20px; text-align:center; letter-spacing:8px; outline:none; }
        .password-box input:focus { border-color:#ff9500; }
        .password-btns { display:flex; gap:12px; margin-top:20px; }
        .pwd-btn { flex:1; padding:12px; border:none; border-radius:12px; font-size:16px; cursor:pointer; }
        .pwd-btn.cancel { background:#333; color:#fff; }
        .pwd-btn.confirm { background:#ff9500; color:#000; font-weight:bold; }
        </style>
    `;
    document.body.appendChild(dialog);
    const input = document.getElementById('vaultPassInput');
    const confirmInput = document.getElementById('vaultPassConfirm');
    const fakeInput = document.getElementById('fakePassInput');
    if (input) input.focus();

    dialog.querySelector('.cancel').addEventListener('click', () => { dialog.remove(); });
    dialog.querySelector('.confirm').addEventListener('click', () => {
        const pass = input.value;
        if (isFirstTime) {
            const confirm = confirmInput.value;
            const fakePass = fakeInput ? fakeInput.value : '';
            if (pass.length < 4) { alert('密码至少4位'); return; }
            if (pass !== confirm) { alert('两次密码不一致'); return; }
            if (fakePass && fakePass === pass) { alert('假密码不能与真密码相同'); return; }
            state.vaultPassword = pass;
            state.fakePassword = fakePass;
            DataStore.set('vault_password', pass);
            if (fakePass) DataStore.set('fake_password', fakePass);
        } else {
            if (pass === state.fakePassword && state.fakePassword) {
                dialog.remove();
                state.isVaultOpen = true;
                state.isFakeVault = true;
                render();
                return;
            }
            if (pass !== state.vaultPassword) { alert('密码错误'); input.value = ''; input.focus(); return; }
        }
        dialog.remove();
        state.isVaultOpen = true;
        state.isFakeVault = false;
        render();
    });
}

// ==================== 隐私系统界面 ====================
function renderVault() {
    return `
    <div class="vault-app">
        <div class="vault-header">
            <button class="back-btn" id="backToCalc">←</button>
            <h2>${state.isFakeVault ? '🔒 我的收藏' : '🔒 隐私保险箱'}</h2>
            <button class="emergency-btn" id="emergencyBtn">⚡</button>
        </div>
        <div class="vault-tabs">
            <div class="vault-tab ${state.vaultTab === 'photos' ? 'active' : ''}" data-tab="photos">📷 相册</div>
            <div class="vault-tab ${state.vaultTab === 'files' ? 'active' : ''}" data-tab="files">📄 文件</div>
            <div class="vault-tab ${state.vaultTab === 'notes' ? 'active' : ''}" data-tab="notes">📝 笔记</div>
            <div class="vault-tab ${state.vaultTab === 'browser' ? 'active' : ''}" data-tab="browser">🌐 浏览器</div>
            ${!state.isFakeVault ? `<div class="vault-tab ${state.vaultTab === 'trash' ? 'active' : ''}" data-tab="trash">🗑️ 回收站</div>` : ''}
        </div>
        <div class="vault-content">${renderVaultContent()}</div>
    </div>
    <style>
    .vault-app { height:100vh; display:flex; flex-direction:column; background:#000; padding-top:env(safe-area-inset-top); }
    .vault-header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid #333; }
    .vault-header h2 { font-size:18px; color:#ff9500; }
    .back-btn, .emergency-btn { background:none; border:none; color:#fff; font-size:22px; cursor:pointer; width:40px; height:40px; display:flex; align-items:center; justify-content:center; }
    .emergency-btn { background:#ff3b30; border-radius:50%; font-size:16px; }
    .vault-tabs { display:flex; border-bottom:1px solid #333; overflow-x:auto; }
    .vault-tab { flex:1; padding:14px 8px; text-align:center; font-size:13px; color:#888; cursor:pointer; white-space:nowrap; border-bottom:2px solid transparent; }
    .vault-tab.active { color:#ff9500; border-bottom-color:#ff9500; }
    .vault-content { flex:1; overflow-y:auto; padding:16px; padding-bottom:calc(16px + env(safe-area-inset-bottom)); position:relative; }
    .vault-empty { text-align:center; color:#666; padding:60px 20px; }
    .vault-empty .icon { font-size:48px; margin-bottom:16px; }
    .vault-add-btn { position:fixed; bottom:calc(30px + env(safe-area-inset-bottom)); right:20px; width:56px; height:56px; border-radius:50%; background:#ff9500; color:#000; border:none; font-size:28px; cursor:pointer; box-shadow:0 4px 12px rgba(255,149,0,0.4); z-index:100; }
    .photo-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
    .photo-item { aspect-ratio:1; background:#1c1c1e; border-radius:8px; overflow:hidden; position:relative; cursor:pointer; }
    .photo-item img { width:100%; height:100%; object-fit:cover; }
    .photo-item .del-btn { position:absolute; top:4px; right:4px; background:rgba(255,59,48,0.8); color:#fff; border:none; width:24px; height:24px; border-radius:50%; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .photo-item .select-indicator { position:absolute; top:4px; left:4px; width:22px; height:22px; border-radius:50%; border:2px solid #fff; background:rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; font-size:12px; color:transparent; }
    .photo-item.selected .select-indicator { background:#ff9500; border-color:#ff9500; color:#000; }
    .photo-item.selected { box-shadow:0 0 0 2px #ff9500; }
    .file-list, .note-list, .trash-list { display:flex; flex-direction:column; gap:10px; }
    .file-item, .note-item, .trash-item { background:#1c1c1e; padding:14px; border-radius:12px; display:flex; align-items:center; justify-content:space-between; }
    .file-item .info, .note-item .info, .trash-item .info { flex:1; overflow:hidden; }
    .file-item .name, .note-item .title, .trash-item .name { font-size:15px; color:#fff; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .file-item .meta, .note-item .meta, .trash-item .meta { font-size:12px; color:#888; }
    .file-actions, .note-actions, .trash-actions { display:flex; gap:8px; }
    .file-actions button, .note-actions button, .trash-actions button { background:#333; color:#fff; border:none; padding:6px 12px; border-radius:8px; font-size:13px; cursor:pointer; }
    .browser-frame { height:100%; display:flex; flex-direction:column; }
    .browser-bar { display:flex; gap:8px; padding-bottom:12px; flex-wrap:wrap; }
    .browser-bar input { flex:1; min-width:120px; padding:10px 14px; border-radius:10px; border:1px solid #333; background:#1c1c1e; color:#fff; outline:none; }
    .browser-bar button { padding:10px 16px; background:#ff9500; color:#000; border:none; border-radius:10px; font-weight:bold; cursor:pointer; font-size:13px; }
    .browser-bar button.secondary { background:#333; color:#fff; }
    .browser-webview { flex:1; background:#fff; border-radius:12px; overflow:hidden; min-height:300px; }
    .browser-webview iframe { width:100%; height:100%; border:none; }
    .browser-history-list { max-height:150px; overflow-y:auto; margin-bottom:8px; }
    .browser-history-item { padding:8px; color:#aaa; font-size:13px; cursor:pointer; border-radius:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .browser-history-item:hover { background:#1c1c1e; }
    .image-preview-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.95); z-index:20000; display:flex; align-items:center; justify-content:center; flex-direction:column; }
    .image-preview-overlay img { max-width:95%; max-height:80vh; object-fit:contain; border-radius:8px; }
    .image-preview-overlay .preview-bar { display:flex; gap:16px; margin-top:16px; }
    .image-preview-overlay .preview-bar button { padding:10px 20px; border:none; border-radius:10px; font-size:15px; cursor:pointer; }
    .image-preview-overlay .preview-bar .close-btn { background:#333; color:#fff; }
    .image-preview-overlay .preview-bar .download-btn { background:#ff9500; color:#000; }
    .category-bar { display:flex; gap:8px; overflow-x:auto; padding-bottom:12px; margin-bottom:8px; }
    .category-chip { padding:6px 14px; border-radius:16px; background:#333; color:#fff; font-size:13px; cursor:pointer; white-space:nowrap; border:none; }
    .category-chip.active { background:#ff9500; color:#000; }
    .batch-bar { display:flex; gap:8px; padding:8px 0; margin-bottom:8px; flex-wrap:wrap; }
    .batch-bar button { padding:8px 14px; border-radius:8px; border:none; font-size:13px; cursor:pointer; }
    .batch-bar .select-toggle { background:#333; color:#fff; }
    .batch-bar .batch-del { background:#ff3b30; color:#fff; }
    .batch-bar .batch-export { background:#34c759; color:#fff; }
    .batch-bar .batch-move { background:#5856d6; color:#fff; }
    .batch-bar .cancel-select { background:#666; color:#fff; }
    </style>
    `;
}

function renderVaultContent() {
    switch (state.vaultTab) {
        case 'photos': return renderPhotosTab();
        case 'files': return renderFilesTab();
        case 'notes': return renderNotesTab();
        case 'browser': return renderBrowserTab();
        case 'trash': return renderTrashTab();
        default: return '';
    }
}

function renderPhotosTab() {
    const filteredPhotos = state.photoCategory === 'all' || state.photoCategory === '全部'
        ? state.photos
        : state.photos.filter(p => p.category === state.photoCategory || (!p.category && state.photoCategory === '未分类'));

    let html = '';

    // 分类栏
    if (!state.isFakeVault) {
        html += `<div class="category-bar">`;
        state.photoCategories.forEach(cat => {
            const isActive = (cat === '全部' && state.photoCategory === 'all') || cat === state.photoCategory;
            html += `<button class="category-chip ${isActive ? 'active' : ''}" data-cat="${cat}">${cat}</button>`;
        });
        html += `<button class="category-chip" id="addCategory" style="background:#444;">+</button>`;
        html += `</div>`;
    }

    // 批量操作栏
    if (!state.isFakeVault && state.photos.length > 0) {
        html += `<div class="batch-bar">`;
        if (!state.isSelectMode) {
            html += `<button class="select-toggle" id="toggleSelect">选择</button>`;
        } else {
            html += `<button class="cancel-select" id="cancelSelect">取消 (${state.selectedPhotos.size})</button>`;
            html += `<button class="batch-del" id="batchDelete">删除</button>`;
            html += `<button class="batch-export" id="batchExport">导出</button>`;
            html += `<button class="batch-move" id="batchMove">移动</button>`;
        }
        html += `</div>`;
    }

    if (filteredPhotos.length === 0) {
        html += `<div class="vault-empty"><div class="icon">📷</div><div>暂无加密照片<br><small style="color:#555;">点击下方 + 添加</small></div></div>`;
    } else {
        html += `<div class="photo-grid">${filteredPhotos.map((p, i) => {
            const originalIndex = state.photos.indexOf(p);
            const isSelected = state.selectedPhotos.has(originalIndex);
            return `
            <div class="photo-item ${isSelected ? 'selected' : ''}" data-index="${originalIndex}">
                ${state.isSelectMode ? `<div class="select-indicator">✓</div>` : ''}
                <img src="${p.thumb || p.data}" alt="photo" loading="lazy">
                ${!state.isSelectMode && !state.isFakeVault ? `<button class="del-btn" data-index="${originalIndex}">×</button>` : ''}
            </div>`;
        }).join('')}</div>`;
    }

    html += `<button class="vault-add-btn" id="addPhoto">+</button>`;
    return html;
}

function renderFilesTab() {
    if (state.isFakeVault) return `<div class="vault-empty"><div class="icon">📄</div><div>暂无文件</div></div>`;
    if (state.files.length === 0) {
        return `<div class="vault-empty"><div class="icon">📄</div><div>暂无加密文件<br><small style="color:#555;">点击下方 + 添加</small></div></div><button class="vault-add-btn" id="addFile">+</button>`;
    }
    return `<div class="file-list">${state.files.map((f, i) => `
        <div class="file-item">
            <div class="info">
                <div class="name">📎 ${f.name}</div>
                <div class="meta">${formatSize(f.size)} · ${f.date}</div>
            </div>
            <div class="file-actions">
                <button data-index="${i}" class="view-file">查看</button>
                <button data-index="${i}" class="del-file">删除</button>
            </div>
        </div>
    `).join('')}</div><button class="vault-add-btn" id="addFile">+</button>`;
}

function renderNotesTab() {
    const notes = state.isFakeVault ? [] : state.notes;
    if (notes.length === 0) {
        return `<div class="vault-empty"><div class="icon">📝</div><div>${state.isFakeVault ? '暂无笔记' : '暂无加密笔记<br><small style="color:#555;">点击下方 + 添加</small>'}</div></div>${state.isFakeVault ? '' : '<button class="vault-add-btn" id="addNote">+</button>'}`;
    }
    return `<div class="note-list">${notes.map((n, i) => `
        <div class="note-item">
            <div class="info">
                <div class="title">${n.title}</div>
                <div class="meta">${n.date}</div>
            </div>
            <div class="note-actions">
                <button data-index="${i}" class="view-note">查看</button>
                <button data-index="${i}" class="del-note">删除</button>
            </div>
        </div>
    `).join('')}</div><button class="vault-add-btn" id="addNote">+</button>`;
}

function renderBrowserTab() {
    return `
        <div class="browser-frame">
            <div class="browser-bar">
                <input type="text" id="browserUrl" placeholder="输入网址 https://..." value="">
                <button id="goBrowser">进入</button>
                <button id="fullscreenBrowser" class="secondary">全屏</button>
            </div>
            ${state.browserHistory.length > 0 ? `<div class="browser-history-list">${state.browserHistory.slice(-10).reverse().map((h, i) => `
                <div class="browser-history-item" data-url="${h.url}">${h.title || h.url}</div>
            `).join('')}</div>` : ''}
            <div class="browser-webview" id="browserWebview">
                <iframe id="browserFrame" src="about:blank" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
            </div>
        </div>
    `;
}

function renderTrashTab() {
    if (state.trash.length === 0) {
        return `<div class="vault-empty"><div class="icon">🗑️</div><div>回收站为空</div></div>`;
    }
    return `<div class="trash-list">${state.trash.map((item, i) => `
        <div class="trash-item">
            <div class="info">
                <div class="name">${item.type === 'photo' ? '📷' : item.type === 'file' ? '📎' : '📝'} ${item.name}</div>
                <div class="meta">删除时间: ${item.deletedAt}</div>
            </div>
            <div class="trash-actions">
                <button data-index="${i}" class="restore-item">恢复</button>
                <button data-index="${i}" class="perm-delete">彻底删除</button>
            </div>
        </div>
    `).join('')}</div>`;
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

// ==================== 隐私系统逻辑 ====================
function attachVaultEvents() {
    document.getElementById('backToCalc').addEventListener('click', () => {
        state.isVaultOpen = false; state.isFakeVault = false; state.vaultTab = 'photos'; render();
    });
    document.getElementById('emergencyBtn').addEventListener('click', emergencyExit);
    document.querySelectorAll('.vault-tab').forEach(tab => {
        tab.addEventListener('click', () => { state.vaultTab = tab.dataset.tab; render(); });
    });

    // 相册事件
    const addPhoto = document.getElementById('addPhoto');
    if (addPhoto) addPhoto.addEventListener('click', addPhotoHandler);

    document.querySelectorAll('.photo-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (state.isSelectMode) {
                const idx = parseInt(item.dataset.index);
                if (state.selectedPhotos.has(idx)) state.selectedPhotos.delete(idx);
                else state.selectedPhotos.add(idx);
                render();
                return;
            }
            if (e.target.classList.contains('del-btn')) return;
            previewImage(parseInt(item.dataset.index));
        });
    });

    document.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index);
            await moveToTrash('photo', idx);
        });
    });

    // 分类
    document.querySelectorAll('.category-chip[data-cat]').forEach(chip => {
        chip.addEventListener('click', () => {
            state.photoCategory = chip.dataset.cat === '全部' ? 'all' : chip.dataset.cat;
            render();
        });
    });
    const addCat = document.getElementById('addCategory');
    if (addCat) addCat.addEventListener('click', addCategoryHandler);

    // 批量操作
    const toggleSelect = document.getElementById('toggleSelect');
    if (toggleSelect) toggleSelect.addEventListener('click', () => { state.isSelectMode = true; state.selectedPhotos.clear(); render(); });
    const cancelSelect = document.getElementById('cancelSelect');
    if (cancelSelect) cancelSelect.addEventListener('click', () => { state.isSelectMode = false; state.selectedPhotos.clear(); render(); });
    const batchDelete = document.getElementById('batchDelete');
    if (batchDelete) batchDelete.addEventListener('click', batchDeletePhotos);
    const batchExport = document.getElementById('batchExport');
    if (batchExport) batchExport.addEventListener('click', batchExportPhotos);
    const batchMove = document.getElementById('batchMove');
    if (batchMove) batchMove.addEventListener('click', batchMovePhotos);

    // 文件事件
    const addFile = document.getElementById('addFile');
    if (addFile) addFile.addEventListener('click', addFileHandler);
    document.querySelectorAll('.view-file').forEach(btn => {
        btn.addEventListener('click', (e) => { viewFile(state.files[parseInt(btn.dataset.index)]); });
    });
    document.querySelectorAll('.del-file').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const idx = parseInt(btn.dataset.index);
            await moveToTrash('file', idx);
        });
    });

    // 笔记事件
    const addNote = document.getElementById('addNote');
    if (addNote) addNote.addEventListener('click', addNoteHandler);
    document.querySelectorAll('.view-note').forEach(btn => {
        btn.addEventListener('click', (e) => { viewNote(state.notes[parseInt(btn.dataset.index)]); });
    });
    document.querySelectorAll('.del-note').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.dataset.index);
            moveToTrash('note', idx);
        });
    });

    // 浏览器事件
    const goBrowser = document.getElementById('goBrowser');
    if (goBrowser) goBrowser.addEventListener('click', navigateBrowser);
    const fsBrowser = document.getElementById('fullscreenBrowser');
    if (fsBrowser) fsBrowser.addEventListener('click', toggleBrowserFullscreen);
    document.querySelectorAll('.browser-history-item').forEach(item => {
        item.addEventListener('click', () => {
            document.getElementById('browserUrl').value = item.dataset.url;
            navigateBrowser();
        });
    });

    // 回收站事件
    document.querySelectorAll('.restore-item').forEach(btn => {
        btn.addEventListener('click', (e) => restoreFromTrash(parseInt(btn.dataset.index)));
    });
    document.querySelectorAll('.perm-delete').forEach(btn => {
        btn.addEventListener('click', (e) => permanentDelete(parseInt(btn.dataset.index)));
    });
}

// ==================== 回收站功能 ====================
async function moveToTrash(type, index) {
    let item;
    if (type === 'photo') {
        item = state.photos[index];
        if (item && item.storagePath) await DataStore.deleteFile(item.storagePath);
        state.photos.splice(index, 1);
        await savePhotosMeta();
    } else if (type === 'file') {
        item = state.files[index];
        if (item && item.storagePath) await DataStore.deleteFile(item.storagePath);
        state.files.splice(index, 1);
        await saveFilesMeta();
    } else if (type === 'note') {
        item = state.notes[index];
        state.notes.splice(index, 1);
        await saveNotes();
    }
    if (item) {
        state.trash.push({ ...item, type, deletedAt: new Date().toLocaleString('zh-CN'), originalIndex: index });
        await saveTrash();
    }
    render();
}

async function restoreFromTrash(index) {
    const item = state.trash[index];
    if (!item) return;
    if (item.type === 'photo') {
        state.photos.push(item);
        await savePhotosMeta();
    } else if (item.type === 'file') {
        state.files.push(item);
        await saveFilesMeta();
    } else if (item.type === 'note') {
        state.notes.push(item);
        await saveNotes();
    }
    state.trash.splice(index, 1);
    await saveTrash();
    render();
}

async function permanentDelete(index) {
    const item = state.trash[index];
    if (!item) return;
    // 彻底删除关联的文件数据
    if (item.storagePath) {
        await DataStore.deleteFile(item.storagePath);
    }
    state.trash.splice(index, 1);
    await saveTrash();
    render();
}


// ==================== 批量操作 ====================
async function batchDeletePhotos() {
    if (state.selectedPhotos.size === 0) return;
    const indices = Array.from(state.selectedPhotos).sort((a, b) => b - a);
    for (const idx of indices) {
        await moveToTrash('photo', idx);
    }
    state.isSelectMode = false;
    state.selectedPhotos.clear();
}

async function batchExportPhotos() {
    if (state.selectedPhotos.size === 0) return;
    for (const idx of state.selectedPhotos) {
        const p = state.photos[idx];
        if (p) {
            let imageData = p.data;
            if (!imageData && p.storagePath) {
                imageData = await DataStore.readFile(p.storagePath);
            }
            if (imageData) {
                const a = document.createElement('a');
                a.href = imageData;
                a.download = p.name;
                a.click();
                await new Promise(r => setTimeout(r, 200)); // 避免浏览器阻塞
            }
        }
    }
    state.isSelectMode = false;
    state.selectedPhotos.clear();
    render();
}

function batchMovePhotos() {
    if (state.selectedPhotos.size === 0) return;
    const cats = state.photoCategories.filter(c => c !== '全部');
    const cat = prompt('移动到分类：' + cats.join(', '), '未分类');
    if (!cat) return;
    if (!state.photoCategories.includes(cat)) {
        state.photoCategories.push(cat);
        saveCategories();
    }
    state.selectedPhotos.forEach(idx => {
        if (state.photos[idx]) state.photos[idx].category = cat;
    });
    savePhotosMeta();
    state.isSelectMode = false;
    state.selectedPhotos.clear();
    render();
}

function addCategoryHandler() {
    const name = prompt('输入新分类名称：');
    if (!name || state.photoCategories.includes(name)) return;
    state.photoCategories.push(name);
    saveCategories();
    render();
}

// ==================== 相册处理（带缩略图） ====================
async function addPhotoHandler() {
    if (CapacitorAPI.isNative && CapacitorAPI.camera) {
        try {
            const image = await CapacitorAPI.camera.getPhoto({
                quality: 85, allowEditing: false,
                resultType: window.Capacitor.Plugins.CameraResultType.Base64,
                source: window.Capacitor.Plugins.CameraSource.Prompt,
                promptLabelHeader: '选择照片', promptLabelPhoto: '拍照', promptLabelPicture: '从相册选择'
            });
            if (!image || !image.base64String) return;
            const mime = image.format === 'png' ? 'image/png' : 'image/jpeg';
            const base64Data = `data:${mime};base64,${image.base64String}`;
            const thumb = await generateThumbnail(base64Data, 300);
            const filename = `photo_${Date.now()}.${image.format === 'png' ? 'png' : 'jpg'}`;
            const saved = await DataStore.saveFile(image.base64String, filename);
            state.photos.push({
                data: saved.native ? null : (saved.webId ? null : base64Data),
                thumb: thumb,
                name: filename,
                date: new Date().toLocaleString('zh-CN'),
                size: Math.round(image.base64String.length * 0.75),
                storagePath: saved.native ? saved.path : (saved.webId ? saved.webId : null),
                category: '未分类'
            });
            await savePhotosMeta(); render();
        } catch (e) {
            console.error('Camera error:', e);
            fallbackPhotoPicker();
        }
    } else {
        fallbackPhotoPicker();
    }
}

function fallbackPhotoPicker() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.onchange = async (e) => {
        for (const file of Array.from(e.target.files)) {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const base64 = ev.target.result;
                const thumb = await generateThumbnail(base64, 300);
                const filename = `photo_${Date.now()}_${file.name}`;
                const base64Only = base64.split(',')[1];
                const saved = await DataStore.saveFile(base64Only, filename);
                state.photos.push({
                    data: saved.native ? null : (saved.webId ? null : base64),
                    thumb: thumb, name: file.name,
                    date: new Date().toLocaleString('zh-CN'),
                    size: file.size,
                    storagePath: saved.native ? saved.path : (saved.webId ? saved.webId : null),
                    category: '未分类'
                });
                await savePhotosMeta(); render();
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

async function previewImage(index) {
    const photo = state.photos[index];
    if (!photo) return;
    state.previewIndex = index;
    state.showPreview = true;

    // 获取实际图片数据（从 IndexedDB 或 storagePath）
    let imageData = photo.data;
    if (!imageData && photo.storagePath) {
        imageData = await DataStore.readFile(photo.storagePath);
    }
    if (!imageData) {
        alert('图片数据已丢失');
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'image-preview-overlay';
    overlay.id = 'imagePreviewOverlay';
    overlay.innerHTML = `
        <img src="${imageData}" alt="preview" id="previewImg">
        <div class="preview-bar">
            <button class="close-btn">关闭</button>
            <button class="prev-btn" style="background:#333;color:#fff;">←</button>
            <button class="next-btn" style="background:#333;color:#fff;">→</button>
            <button class="download-btn">下载</button>
        </div>
        <style>
        .image-preview-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.95); z-index:20000; display:flex; align-items:center; justify-content:center; flex-direction:column; }
        .image-preview-overlay img { max-width:95%; max-height:80vh; object-fit:contain; border-radius:8px; }
        .preview-bar { display:flex; gap:16px; margin-top:16px; }
        .preview-bar button { padding:10px 20px; border:none; border-radius:10px; font-size:15px; cursor:pointer; }
        .preview-bar .close-btn { background:#333; color:#fff; }
        .preview-bar .download-btn { background:#ff9500; color:#000; }
        </style>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.close-btn').addEventListener('click', () => { state.showPreview = false; overlay.remove(); });
    overlay.querySelector('.download-btn').addEventListener('click', () => {
        const a = document.createElement('a'); a.href = imageData; a.download = photo.name; a.click();
    });
    overlay.querySelector('.prev-btn').addEventListener('click', () => navigatePreview(-1));
    overlay.querySelector('.next-btn').addEventListener('click', () => navigatePreview(1));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { state.showPreview = false; overlay.remove(); } });
}

async function navigatePreview(dir) {
    const filtered = state.photoCategory === 'all' || state.photoCategory === '全部'
        ? state.photos
        : state.photos.filter(p => p.category === state.photoCategory || (!p.category && state.photoCategory === '未分类'));
    let idx = filtered.indexOf(state.photos[state.previewIndex]);
    idx += dir;
    if (idx < 0) idx = filtered.length - 1;
    if (idx >= filtered.length) idx = 0;
    const newPhoto = filtered[idx];
    state.previewIndex = state.photos.indexOf(newPhoto);

    // 获取新图片数据
    let newImageData = newPhoto.data;
    if (!newImageData && newPhoto.storagePath) {
        newImageData = await DataStore.readFile(newPhoto.storagePath);
    }

    const img = document.getElementById('previewImg');
    if (img && newImageData) img.src = newImageData;
}

// ==================== 文件处理 ====================
async function addFileHandler() {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true;
    input.onchange = async (e) => {
        for (const file of Array.from(e.target.files)) {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const base64 = ev.target.result;
                const base64Only = base64.split(',')[1];
                const filename = `file_${Date.now()}_${file.name}`;
                const saved = await DataStore.saveFile(base64Only, filename);
                state.files.push({
                    data: saved.native ? null : (saved.webId ? null : base64),
                    name: file.name,
                    date: new Date().toLocaleString('zh-CN'),
                    size: file.size,
                    storagePath: saved.native ? saved.path : (saved.webId ? saved.webId : null)
                });
                await saveFilesMeta(); render();
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

async function viewFile(file) {
    if (!file) return;
    let dataUrl = file.data;
    if (!dataUrl && file.storagePath) {
        dataUrl = await DataStore.readFile(file.storagePath);
    }
    if (!dataUrl) {
        alert('文件数据已丢失');
        return;
    }
    if (file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        const overlay = document.createElement('div');
        overlay.className = 'image-preview-overlay';
        overlay.innerHTML = `
            <img src="${dataUrl}" alt="file">
            <div class="preview-bar">
                <button class="close-btn">关闭</button>
                <button class="download-btn">下载</button>
            </div>
            <style>
            .image-preview-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.95); z-index:20000; display:flex; align-items:center; justify-content:center; flex-direction:column; }
            .image-preview-overlay img { max-width:95%; max-height:80vh; object-fit:contain; border-radius:8px; }
            .preview-bar { display:flex; gap:16px; margin-top:16px; }
            .preview-bar button { padding:10px 20px; border:none; border-radius:10px; font-size:15px; cursor:pointer; }
            .preview-bar .close-btn { background:#333; color:#fff; }
            .preview-bar .download-btn { background:#ff9500; color:#000; }
            </style>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.close-btn').addEventListener('click', () => overlay.remove());
        overlay.querySelector('.download-btn').addEventListener('click', () => {
            const a = document.createElement('a'); a.href = dataUrl; a.download = file.name; a.click();
        });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        return;
    }
    const a = document.createElement('a'); a.href = dataUrl; a.download = file.name; a.click();
}

// ==================== 笔记处理 ====================
function addNoteHandler() {
    const dialog = document.createElement('div');
    dialog.className = 'password-dialog';
    dialog.innerHTML = `
        <div class="password-overlay">
            <div class="password-box" style="max-width:90%;width:360px;">
                <h3>📝 新建笔记</h3>
                <input type="text" id="noteTitle" placeholder="标题" style="margin-bottom:10px;letter-spacing:0;text-align:left;">
                <textarea id="noteContent" placeholder="内容..." style="width:100%;padding:14px;border-radius:12px;border:1px solid #333;background:#000;color:#fff;font-size:16px;min-height:120px;outline:none;resize:none;"></textarea>
                <div class="password-btns">
                    <button class="pwd-btn cancel">取消</button>
                    <button class="pwd-btn confirm">保存</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    dialog.querySelector('.cancel').addEventListener('click', () => dialog.remove());
    dialog.querySelector('.confirm').addEventListener('click', () => {
        const title = document.getElementById('noteTitle').value || '无标题';
        const content = document.getElementById('noteContent').value;
        if (!content) { alert('请输入内容'); return; }
        state.notes.push({ title, content, date: new Date().toLocaleString('zh-CN') });
        saveNotes(); dialog.remove(); render();
    });
}

function viewNote(note) {
    const dialog = document.createElement('div');
    dialog.className = 'password-dialog';
    dialog.innerHTML = `
        <div class="password-overlay">
            <div class="password-box" style="max-width:90%;width:360px;text-align:left;">
                <h3>${note.title}</h3>
                <div style="color:#888;font-size:12px;margin-bottom:12px;">${note.date}</div>
                <div style="color:#fff;font-size:15px;line-height:1.6;white-space:pre-wrap;max-height:60vh;overflow-y:auto;">${note.content.replace(/</g, '&lt;')}</div>
                <div class="password-btns" style="margin-top:20px;">
                    <button class="pwd-btn cancel" style="flex:1;">关闭</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    dialog.querySelector('.cancel').addEventListener('click', () => dialog.remove());
}

// ==================== 浏览器处理 ====================
function navigateBrowser() {
    let url = document.getElementById('browserUrl').value.trim();
    if (!url) return;
    if (!url.startsWith('http')) url = 'https://' + url;
    document.getElementById('browserFrame').src = url;
    const existing = state.browserHistory.findIndex(h => h.url === url);
    if (existing >= 0) state.browserHistory.splice(existing, 1);
    state.browserHistory.push({ url, title: url, time: Date.now() });
    if (state.browserHistory.length > 30) state.browserHistory.shift();
    saveBrowserHistory();
}

function toggleBrowserFullscreen() {
    const webview = document.getElementById('browserWebview');
    if (!webview) return;
    state.browserFullscreen = !state.browserFullscreen;
    if (state.browserFullscreen) {
        webview.style.position = 'fixed'; webview.style.top = '0'; webview.style.left = '0';
        webview.style.right = '0'; webview.style.bottom = '0'; webview.style.zIndex = '150';
        webview.style.borderRadius = '0'; webview.style.height = '100vh';
        const fsBtn = document.getElementById('fullscreenBrowser');
        if (fsBtn) fsBtn.textContent = '退出';
    } else {
        webview.style.position = ''; webview.style.top = ''; webview.style.left = '';
        webview.style.right = ''; webview.style.bottom = ''; webview.style.zIndex = '';
        webview.style.borderRadius = ''; webview.style.height = '';
        const fsBtn = document.getElementById('fullscreenBrowser');
        if (fsBtn) fsBtn.textContent = '全屏';
    }
}

// ==================== 紧急退出 ====================
function emergencyExit() {
    state.isVaultOpen = false; state.isFakeVault = false; state.emergencyExit = true;
    state.display = '0'; state.expression = '';
    state.previousValue = null; state.operator = null;
    state.waitingForOperand = false; state.cPressCount = 0;
    state.vaultTab = 'photos';
    state.isSelectMode = false; state.selectedPhotos.clear();
    render();
}

// ==================== 摇一摇 ====================
let shakeLastX = 0, shakeLastY = 0, shakeLastZ = 0;
let shakeThreshold = 12;
let shakeTimeout = null;

function handleMotion(event) {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;
    const delta = Math.abs(acc.x - shakeLastX) + Math.abs(acc.y - shakeLastY) + Math.abs(acc.z - shakeLastZ);
    shakeLastX = acc.x; shakeLastY = acc.y; shakeLastZ = acc.z;
    if (delta > shakeThreshold) {
        if (shakeTimeout) clearTimeout(shakeTimeout);
        shakeTimeout = setTimeout(() => {
            if (state.isVaultOpen) emergencyExit();
        }, 300);
    }
}

async function requestMotionPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const result = await DeviceMotionEvent.requestPermission();
            if (result === 'granted') {
                window.addEventListener('devicemotion', handleMotion);
            }
        } catch (e) { console.log('Motion permission denied'); }
    } else if (window.DeviceMotionEvent) {
        window.addEventListener('devicemotion', handleMotion);
    }
}

// 电源键/锁屏检测
document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.isVaultOpen) emergencyExit();
});

// ==================== 数据迁移（v2 -> v3）====================
async function migrateV2Data() {
    // 检查是否有旧格式的数据（data 字段包含完整 base64）
    let needMigration = false;
    for (const photo of state.photos) {
        if (photo.data && photo.data.length > 1000 && !photo.storagePath) {
            needMigration = true;
            break;
        }
    }
    for (const file of state.files) {
        if (file.data && file.data.length > 1000 && !file.storagePath) {
            needMigration = true;
            break;
        }
    }
    if (!needMigration) return;

    console.log('Migrating v2 data to IndexedDB...');

    // 迁移照片数据
    for (let i = 0; i < state.photos.length; i++) {
        const photo = state.photos[i];
        if (photo.data && photo.data.length > 1000 && !photo.storagePath) {
            try {
                const base64Only = photo.data.split(',')[1] || photo.data;
                const saved = await DataStore.saveFile(base64Only, photo.name || `photo_${Date.now()}.jpg`);
                state.photos[i].data = null; // 清空内联数据
                state.photos[i].storagePath = saved.native ? saved.path : (saved.webId ? saved.webId : null);
            } catch (e) {
                console.error('Failed to migrate photo', i, e);
            }
        }
    }
    await savePhotosMeta();

    // 迁移文件数据
    for (let i = 0; i < state.files.length; i++) {
        const file = state.files[i];
        if (file.data && file.data.length > 1000 && !file.storagePath) {
            try {
                const base64Only = file.data.split(',')[1] || file.data;
                const saved = await DataStore.saveFile(base64Only, file.name || `file_${Date.now()}`);
                state.files[i].data = null; // 清空内联数据
                state.files[i].storagePath = saved.native ? saved.path : (saved.webId ? saved.webId : null);
            } catch (e) {
                console.error('Failed to migrate file', i, e);
            }
        }
    }
    await saveFilesMeta();

    console.log('Migration complete!');
}

// ==================== 初始化 ====================
async function initApp() {
    initCapacitorAPI();
    await loadVaultData();
    await migrateV2Data(); // 执行数据迁移
    render();
    requestMotionPermission();
}

initApp();
