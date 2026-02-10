// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════
const API_URL = "https://api.steinhq.com/v1/storages/698b2a6baffba40a624b12de";
const CONFIG_FILE = "config.json"; // Fichier de configuration des onglets

// ═══════════════════════════════════════════════════════════
// VARIABLES GLOBALES
// ═══════════════════════════════════════════════════════════
let allTasks = [];
let filteredTasks = [];
let detectedColumns = [];
let visibleColumns = [];
let avancementColumn = null;

// ═══════════════════════════════════════════════════════════
// ÉLÉMENTS DOM
// ═══════════════════════════════════════════════════════════
const tasksBody = document.getElementById('tasksBody');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');
const filterPage = document.getElementById('filterPage');
const filterBU = document.getElementById('filterBU');
const filterStatus = document.getElementById('filterStatus');
const filterAffectation = document.getElementById('filterAffectation');
const refreshButton = document.getElementById('refreshButton');
const filterBUGroup = filterBU?.closest('.filter-group');
const filterAffectationGroup = filterAffectation?.closest('.filter-group');

// ═══════════════════════════════════════════════════════════
// INITIALISATION : CHARGEMENT DES ONGLETS
// ═══════════════════════════════════════════════════════════
async function loadOnglets() {
    try {
        const response = await fetch(CONFIG_FILE);
        const config = await response.json();
        
        filterPage.innerHTML = '';
        config.onglets.forEach(onglet => {
            const option = document.createElement('option');
            option.value = onglet.value;
            option.textContent = onglet.label;
            filterPage.appendChild(option);
        });
        
        console.log("✅ Onglets chargés depuis config.json");
    } catch (err) {
        console.warn("⚠️ Impossible de charger config.json, onglets par défaut utilisés");
        // Fallback : garder les onglets du HTML
    }
}

// ═══════════════════════════════════════════════════════════
// CHARGEMENT DES TÂCHES
// ═══════════════════════════════════════════════════════════
async function loadTasks() {
    const pageUrl = `${API_URL}/${filterPage.value}`;
    
    console.log("════════════════════════════════");
    console.log("🔗 URL complète :", pageUrl);
    console.log("📄 Onglet sélectionné :", filterPage.value);
    
    try {
        showLoading(true); 
        hideError();
        
        const response = await fetch(`${pageUrl}?t=${new Date().getTime()}`);
        
        console.log("📡 Statut HTTP :", response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - Onglet "${filterPage.value}" introuvable`);
        }
        
        const data = await response.json();
        
        console.log("✅ Lignes reçues :", data.length);
        if (data.length > 0) {
            console.log("📋 Première ligne :", data[0]);
            console.log("🔑 Colonnes :", Object.keys(data[0]));
        }
        console.log("════════════════════════════════");

        if (!data || data.length === 0) {
            tasksBody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:50px">Aucune donnée.</td></tr>';
            showLoading(false); 
            return;
        }

        // ═══════════════════════════════════════════════════════════
        // DÉTECTION AUTOMATIQUE DES COLONNES
        // ═══════════════════════════════════════════════════════════
        const firstRow = data[0];
        detectedColumns = Object.keys(firstRow).filter(col => col.trim() !== '');
        
        // Détecter la colonne AVANCEMENT
        avancementColumn = detectedColumns.find(col => 
            col.toLowerCase().includes('avancement') || 
            col.toLowerCase().includes('statut') || 
            col.toLowerCase().includes('status')
        );
        
        console.log("📊 Colonnes détectées :", detectedColumns);
        console.log("🎯 Colonne avancement :", avancementColumn);

        // ═══════════════════════════════════════════════════════════
        // MAPPING DES DONNÉES
        // ═══════════════════════════════════════════════════════════
        allTasks = data.filter(row => {
            const descCol = detectedColumns.find(col => col.toLowerCase().includes('description'));
            const desc = descCol ? (row[descCol] || '') : '';
            
            // Ignorer les lignes vides et les titres de phase
            const isPhaseTitle = desc.toString().toUpperCase().includes('PHASE') && 
                                desc === desc.toUpperCase();
            
            return desc.trim() !== "" && !isPhaseTitle;
        }).map(row => {
            const task = {};
            
            // Copier toutes les colonnes
            detectedColumns.forEach(col => {
                task[col] = row[col] || '';
            });
            
            // Normaliser AVANCEMENT en majuscules
            if (avancementColumn && task[avancementColumn]) {
                task[avancementColumn] = task[avancementColumn].toString().trim().toUpperCase();
            } else if (avancementColumn) {
                task[avancementColumn] = 'PAS FAIT';
            }
            
            return task;
        });

        console.log("✅ Tâches chargées :", allTasks.length);

        // ═══════════════════════════════════════════════════════════
        // CONSTRUCTION DE L'INTERFACE
        // ═══════════════════════════════════════════════════════════
        buildTableHeader();
        buildDynamicFilters();
        updateDropdownFilters();
        applyFilters();
        showLoading(false);
        
    } catch (err) {
        console.error("❌ ERREUR :", err);
        showError(`Erreur : ${err.message}`);
        showLoading(false);
    }
}

// ═══════════════════════════════════════════════════════════
// CONSTRUCTION DU HEADER (UNIQUEMENT COLONNES AVEC DONNÉES)
// ═══════════════════════════════════════════════════════════
function buildTableHeader() {
    const thead = document.querySelector('thead tr');
    thead.innerHTML = '';
    visibleColumns = [];
    
    detectedColumns.forEach(col => {
        // ✅ VÉRIFIER SI LA COLONNE CONTIENT DES DONNÉES RÉELLES
        const hasData = allTasks.some(t => 
            t[col] && 
            t[col].toString().trim() !== '' && 
            t[col] !== '-'
        );
        
        // Toujours afficher DESCRIPTION et AVANCEMENT
        const isRequired = col.toLowerCase().includes('description') || 
                          col === avancementColumn;
        
        if (hasData || isRequired) {
            const th = document.createElement('th');
            th.textContent = col;
            th.dataset.column = col;
            thead.appendChild(th);
            visibleColumns.push(col);
        }
    });
    
    console.log("👁️ Colonnes visibles :", visibleColumns);
}

// ═══════════════════════════════════════════════════════════
// CONSTRUCTION DES FILTRES DYNAMIQUES
// ═══════════════════════════════════════════════════════════
function buildDynamicFilters() {
    // ─────────────────────────────────────────────────────────
    // FILTRE BU
    // ─────────────────────────────────────────────────────────
    const buColumn = detectedColumns.find(col => 
        col.toLowerCase().includes('bu') || 
        col.toLowerCase().includes('business')
    );
    
    const hasBUData = buColumn && allTasks.some(t => 
        t[buColumn] && 
        t[buColumn].trim() !== '' && 
        t[buColumn] !== '-'
    );
    
    if (filterBUGroup) {
        if (hasBUData) {
            filterBUGroup.style.display = '';
            const label = filterBUGroup.querySelector('label');
            if (label) label.textContent = `${buColumn} :`;
        } else {
            filterBUGroup.style.display = 'none';
        }
    }
    
    // ─────────────────────────────────────────────────────────
    // FILTRE AFFECTATION
    // ─────────────────────────────────────────────────────────
    const affColumn = detectedColumns.find(col => 
        col.toLowerCase().includes('affectation') || 
        col.toLowerCase().includes('assigné') ||
        col.toLowerCase().includes('responsable')
    );
    
    const hasAffData = affColumn && allTasks.some(t => 
        t[affColumn] && 
        t[affColumn].trim() !== '' && 
        t[affColumn] !== '-'
    );
    
    if (filterAffectationGroup) {
        if (hasAffData) {
            filterAffectationGroup.style.display = '';
            const label = filterAffectationGroup.querySelector('label');
            if (label) label.textContent = `${affColumn} :`;
        } else {
            filterAffectationGroup.style.display = 'none';
        }
    }
}

// ═══════════════════════════════════════════════════════════
// MISE À JOUR DES DROPDOWNS DE FILTRES
// ═══════════════════════════════════════════════════════════
function updateDropdownFilters() {
    // ─────────────────────────────────────────────────────────
    // FILTRE BU
    // ─────────────────────────────────────────────────────────
    const buColumn = detectedColumns.find(col => 
        col.toLowerCase().includes('bu') || 
        col.toLowerCase().includes('business')
    );
    
    if (buColumn && filterBU) {
        const bus = [...new Set(allTasks.map(t => t[buColumn]))]
            .filter(x => x && x.trim() && x !== '-')
            .sort();
        
        filterBU.innerHTML = '<option value="">Toutes</option>';
        bus.forEach(b => {
            const option = document.createElement('option');
            option.value = b;
            option.textContent = b;
            filterBU.appendChild(option);
        });
    }

    // ─────────────────────────────────────────────────────────
    // FILTRE AFFECTATION
    // ─────────────────────────────────────────────────────────
    const affColumn = detectedColumns.find(col => 
        col.toLowerCase().includes('affectation') || 
        col.toLowerCase().includes('assigné') ||
        col.toLowerCase().includes('responsable')
    );
    
    if (affColumn && filterAffectation) {
        let names = allTasks
            .map(t => t[affColumn] || '')
            .filter(aff => aff.trim() !== '' && aff !== '-')
            .map(aff => aff.split(/[,/]+/))
            .flat();
        
        let uniqueStaff = [...new Set(names.map(s => s.trim()))]
            .filter(x => x)
            .sort();
        
        filterAffectation.innerHTML = '<option value="">Tous</option>';
        uniqueStaff.forEach(n => {
            const option = document.createElement('option');
            option.value = n;
            option.textContent = n;
            filterAffectation.appendChild(option);
        });
    }
}

// ═══════════════════════════════════════════════════════════
// APPLICATION DES FILTRES
// ═══════════════════════════════════════════════════════════
function applyFilters() {
    const buColumn = detectedColumns.find(col => 
        col.toLowerCase().includes('bu') || col.toLowerCase().includes('business')
    );
    const affColumn = detectedColumns.find(col => 
        col.toLowerCase().includes('affectation') || col.toLowerCase().includes('assigné')
    );
    
    const sBU = buColumn && filterBU ? filterBU.value : '';
    const sStat = filterStatus ? filterStatus.value.toUpperCase() : '';
    const sAff = affColumn && filterAffectation ? filterAffectation.value : '';

    filteredTasks = allTasks.filter(t => {
        const matchBU = !sBU || (buColumn && t[buColumn] === sBU);
        const matchStat = !sStat || (avancementColumn && t[avancementColumn] === sStat);
        const matchAff = !sAff || (affColumn && t[affColumn] && t[affColumn].includes(sAff));
        
        return matchBU && matchStat && matchAff;
    });
    
    displayTasks(); 
    updateStats();
}

// ═══════════════════════════════════════════════════════════
// AFFICHAGE DES TÂCHES
// ═══════════════════════════════════════════════════════════
function displayTasks() {
    tasksBody.innerHTML = '';
    
    filteredTasks.forEach((task, index) => {
        const tr = document.createElement('tr');
        let html = '';
        
        // ✅ N'AFFICHER QUE LES COLONNES VISIBLES
        visibleColumns.forEach(col => {
            if (col === avancementColumn) {
                // Cellule spéciale pour les boutons de statut
                const status = task[col] || 'PAS FAIT';
                html += `
                    <td>
                        <div class="status-selector">
                            <button class="status-btn ${status === 'PAS FAIT' ? 'active' : ''}" 
                                    data-task-index="${index}" data-status="PAS FAIT">🔴</button>
                            <button class="status-btn ${status === 'EN COURS' ? 'active' : ''}" 
                                    data-task-index="${index}" data-status="EN COURS">🟠</button>
                            <button class="status-btn ${status === 'FAIT' ? 'active' : ''}" 
                                    data-task-index="${index}" data-status="FAIT">🟢</button>
                        </div>
                    </td>`;
            } else if (col.toLowerCase().includes('description')) {
                html += `<td style="max-width:350px">${task[col] || '-'}</td>`;
            } else if (col.toLowerCase().includes('bu') || col.toLowerCase().includes('business')) {
                html += `<td><strong>${task[col] || '-'}</strong></td>`;
            } else if (col.toLowerCase().includes('importance') || col.toLowerCase().includes('priorité')) {
                const value = task[col] || '-';
                html += `<td>${value !== '-' ? `<span class="badge">${value}</span>` : '-'}</td>`;
            } else {
                html += `<td>${task[col] || '-'}</td>`;
            }
        });
        
        tr.innerHTML = html;
        tr.querySelectorAll('.status-btn').forEach(btn => 
            btn.onclick = () => updateTaskStatus(btn)
        );
        tasksBody.appendChild(tr);
    });
}

// ═══════════════════════════════════════════════════════════
// SAUVEGARDE DU STATUT
// ═══════════════════════════════════════════════════════════
async function updateTaskStatus(button) {
    const taskIndex = button.dataset.taskIndex;
    const newStat = button.dataset.status;
    const pageUrl = `${API_URL}/${filterPage.value}`;

    if (!avancementColumn) {
        alert("Aucune colonne AVANCEMENT détectée !");
        return;
    }

    try {
        const task = filteredTasks[taskIndex];
        
        // Trouver la colonne description pour identifier la ligne
        const descCol = detectedColumns.find(col => col.toLowerCase().includes('description'));
        const descValue = task[descCol];

        await fetch(pageUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                condition: { [descCol]: descValue }, 
                set: { [avancementColumn]: newStat } 
            })
        });

        // Mise à jour locale
        task[avancementColumn] = newStat;
        const originalTask = allTasks.find(t => t[descCol] === descValue);
        if (originalTask) originalTask[avancementColumn] = newStat;
        
        updateStats(); 
        displayTasks();
        
        console.log(`✅ Statut mis à jour : "${descValue}" → ${newStat}`);
    } catch (err) { 
        console.error("❌ Erreur sauvegarde :", err);
        alert(`Erreur : ${err.message}`); 
    }
}

// ═══════════════════════════════════════════════════════════
// MISE À JOUR DES STATISTIQUES
// ═══════════════════════════════════════════════════════════
function updateStats() {
    const s = { 'PAS FAIT': 0, 'EN COURS': 0, 'FAIT': 0 };
    
    if (avancementColumn) {
        allTasks.forEach(t => { 
            const status = t[avancementColumn];
            if (s[status] !== undefined) s[status]++; 
        });
    }
    
    const statTodo = document.getElementById('statTodo');
    const statInProgress = document.getElementById('statInProgress');
    const statDone = document.getElementById('statDone');
    
    if (statTodo) statTodo.innerText = s['PAS FAIT'];
    if (statInProgress) statInProgress.innerText = s['EN COURS'];
    if (statDone) statDone.innerText = s['FAIT'];
}

// ═══════════════════════════════════════════════════════════
// UTILITAIRES
// ═══════════════════════════════════════════════════════════
function showLoading(show) { 
    if (loading) loading.style.display = show ? 'block' : 'none'; 
}

function showError(message) { 
    if (errorMessage) {
        errorMessage.innerText = message; 
        errorMessage.style.display = 'block'; 
    }
}

function hideError() { 
    if (errorMessage) errorMessage.style.display = 'none'; 
}

// ═══════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════
if (filterPage) filterPage.onchange = () => loadTasks();
if (filterBU) filterBU.onchange = applyFilters;
if (filterStatus) filterStatus.onchange = applyFilters;
if (filterAffectation) filterAffectation.onchange = applyFilters;
if (refreshButton) refreshButton.onclick = () => loadTasks();

// ═══════════════════════════════════════════════════════════
// INITIALISATION
// ═══════════════════════════════════════════════════════════
window.onload = async () => {
    await loadOnglets(); // Charger les onglets depuis config.json
    loadTasks(); // Charger les données
};