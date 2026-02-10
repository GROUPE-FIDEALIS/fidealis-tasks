const API_URL = "https://api.steinhq.com/v1/storages/698b2a6baffba40a624b12de";
const filterPage = document.getElementById('filterPage');

let allTasks = [];
let filteredTasks = [];
let detectedColumns = []; // ✅ Colonnes détectées automatiquement
let avancementColumn = null; // ✅ Colonne pour les boutons de statut

const tasksBody = document.getElementById('tasksBody');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');
const filterBU = document.getElementById('filterBU');
const filterStatus = document.getElementById('filterStatus');
const filterAffectation = document.getElementById('filterAffectation');
const refreshButton = document.getElementById('refreshButton');
const filterBUGroup = filterBU?.closest('.filter-group');
const filterAffectationGroup = filterAffectation.closest('.filter-group');

// --- 1. CHARGEMENT ---
async function loadTasks() {
    const pageUrl = `${API_URL}/${encodeURIComponent(filterPage.value)}`;
    
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

        // ✅ DÉTECTION AUTOMATIQUE DE TOUTES LES COLONNES
        const firstRow = data[0];
        detectedColumns = Object.keys(firstRow).filter(col => col.trim() !== '');
        
        // ✅ DÉTECTER LA COLONNE AVANCEMENT (pour les boutons 🔴🟠🟢)
        avancementColumn = detectedColumns.find(col => 
            col.toLowerCase().includes('avancement') || 
            col.toLowerCase().includes('statut') || 
            col.toLowerCase().includes('status')
        );
        
        console.log("📊 Colonnes détectées :", detectedColumns);
        console.log("🎯 Colonne avancement :", avancementColumn);

        // ✅ MAPPER LES DONNÉES (filtrer les lignes vides et titres de phase)
        allTasks = data.filter(row => {
            // Chercher une colonne qui contient "description" pour filtrer
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

        // ✅ CONSTRUIRE LE HEADER DYNAMIQUE
        buildTableHeader();
        
        // ✅ CONSTRUIRE LES FILTRES DYNAMIQUES
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

// ✅ CONSTRUIRE LE HEADER DU TABLEAU DYNAMIQUEMENT
function buildTableHeader() {
    const thead = document.querySelector('thead tr');
    thead.innerHTML = '';
    
    detectedColumns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        thead.appendChild(th);
    });
}

// ✅ CONSTRUIRE LES FILTRES DYNAMIQUES
function buildDynamicFilters() {
    // Détecter si on a une colonne BU
    const buColumn = detectedColumns.find(col => 
        col.toLowerCase().includes('bu') || 
        col.toLowerCase().includes('business')
    );
    
    if (buColumn) {
        filterBUGroup.style.display = '';
        filterBUGroup.querySelector('label').textContent = `${buColumn} :`;
    } else {
        filterBUGroup.style.display = 'none';
    }
    
    // Détecter si on a une colonne Affectation
    const affColumn = detectedColumns.find(col => 
        col.toLowerCase().includes('affectation') || 
        col.toLowerCase().includes('assigné') ||
        col.toLowerCase().includes('responsable')
    );
    
    if (affColumn) {
        filterAffectationGroup.style.display = '';
        filterAffectationGroup.querySelector('label').textContent = `${affColumn} :`;
    } else {
        filterAffectationGroup.style.display = 'none';
    }
}

// --- 2. SAUVEGARDE ---
async function updateTaskStatus(button) {
    const taskIndex = button.dataset.taskIndex;
    const newStat = button.dataset.status;
    const pageUrl = `${API_URL}/${encodeURIComponent(filterPage.value)}`;


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
    } catch (err) { 
        console.error("❌ Erreur sauvegarde :", err);
        alert(`Erreur : ${err.message}`); 
    }
}

// --- 3. FILTRES ---
function updateDropdownFilters() {
    // Filtre BU
    const buColumn = detectedColumns.find(col => 
        col.toLowerCase().includes('bu') || 
        col.toLowerCase().includes('business')
    );
    
    if (buColumn) {
        const bus = [...new Set(allTasks.map(t => t[buColumn]))].filter(x => x && x.trim()).sort();
        filterBU.innerHTML = '<option value="">Toutes</option>';
        bus.forEach(b => filterBU.innerHTML += `<option value="${b}">${b}</option>`);
    }

    // Filtre Affectation
    const affColumn = detectedColumns.find(col => 
        col.toLowerCase().includes('affectation') || 
        col.toLowerCase().includes('assigné') ||
        col.toLowerCase().includes('responsable')
    );
    
    if (affColumn) {
        let names = allTasks
            .map(t => t[affColumn] || '')
            .filter(aff => aff.trim() !== '')
            .map(aff => aff.split(/[,/]+/))
            .flat();
        
        let uniqueStaff = [...new Set(names.map(s => s.trim()))].filter(x => x).sort();
        filterAffectation.innerHTML = '<option value="">Tous</option>';
        uniqueStaff.forEach(n => filterAffectation.innerHTML += `<option value="${n}">${n}</option>`);
    }
}

function applyFilters() {
    const buColumn = detectedColumns.find(col => 
        col.toLowerCase().includes('bu') || col.toLowerCase().includes('business')
    );
    const affColumn = detectedColumns.find(col => 
        col.toLowerCase().includes('affectation') || col.toLowerCase().includes('assigné')
    );
    
    const sBU = buColumn ? filterBU.value : '';
    const sStat = filterStatus.value.toUpperCase();
    const sAff = affColumn ? filterAffectation.value : '';

    filteredTasks = allTasks.filter(t => {
        const matchBU = !sBU || (buColumn && t[buColumn] === sBU);
        const matchStat = !sStat || (avancementColumn && t[avancementColumn] === sStat);
        const matchAff = !sAff || (affColumn && t[affColumn] && t[affColumn].includes(sAff));
        
        return matchBU && matchStat && matchAff;
    });
    
    displayTasks(); 
    updateStats();
}

// --- 4. AFFICHAGE ---
function displayTasks() {
    tasksBody.innerHTML = '';
    
    filteredTasks.forEach((task, index) => {
        const tr = document.createElement('tr');
        let html = '';
        
        detectedColumns.forEach(col => {
            if (col === avancementColumn) {
                // ✅ Cellule spéciale pour les boutons de statut
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
            } else if (col.toLowerCase().includes('importance')) {
                html += `<td>${task[col] ? `<span class="badge">${task[col]}</span>` : '-'}</td>`;
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

function updateStats() {
    const s = { 'PAS FAIT': 0, 'EN COURS': 0, 'FAIT': 0 };
    
    if (avancementColumn) {
        allTasks.forEach(t => { 
            const status = t[avancementColumn];
            if (s[status] !== undefined) s[status]++; 
        });
    }
    
    document.getElementById('statTodo').innerText = s['PAS FAIT'];
    document.getElementById('statInProgress').innerText = s['EN COURS'];
    document.getElementById('statDone').innerText = s['FAIT'];
}

function showLoading(s) { loading.style.display = s ? 'block' : 'none'; }
function showError(m) { errorMessage.innerText = m; errorMessage.style.display = 'block'; }
function hideError() { errorMessage.style.display = 'none'; }

filterPage.onchange = () => loadTasks();
filterBU.onchange = applyFilters;
filterStatus.onchange = applyFilters;
filterAffectation.onchange = applyFilters;
refreshButton.onclick = () => loadTasks();

window.onload = () => loadTasks();