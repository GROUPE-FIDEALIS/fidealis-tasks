// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════
const API_URL = "https://api.steinhq.com/v1/storages/698b2a6baffba40a624b12de";
const CONFIG_FILE = "config.json";

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
    const response = await fetch(`${CONFIG_FILE}?t=${Date.now()}`);
    const config = await response.json();
    console.log("CONFIG:", config);
    console.log("onglets:", config.onglets);
    console.log("pages:", config.pages, "sheets:", config.sheets, "tabs:", config.tabs);

    filterPage.innerHTML = '';

    // 1) Format attendu : { onglets: [ {value, label}, ... ] }
    if (Array.isArray(config.onglets) && config.onglets.length) {
      config.onglets.forEach(o => {
        const option = document.createElement('option');
        option.value = o.value ?? o.label;
        option.textContent = o.label ?? o.value;
        filterPage.appendChild(option);
      });
      console.log("✅ Onglets chargés (config.onglets)");
      return true;
    }

    // 2) Autre format : { pages: ["...", "..."] } ou { sheets: ["..."] }
    const list =
      (Array.isArray(config.pages) && config.pages) ||
      (Array.isArray(config.sheets) && config.sheets) ||
      (Array.isArray(config.tabs) && config.tabs) ||
      [];

    if (list.length) {
      list.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        filterPage.appendChild(option);
      });
      console.log("✅ Onglets chargés (liste pages/sheets/tabs)");
      return true;
    }

    // 3) Dernier recours : si config est un objet avec des clés (ex: { "Tache du jour": {...} })
    const keys = Object.keys(config).filter(k => typeof config[k] === 'object');
    if (keys.length) {
      keys.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        filterPage.appendChild(option);
      });
      console.log("✅ Onglets chargés (clés de config)");
      return true;
    }

    throw new Error("Aucune liste d'onglets trouvée dans config.json");

  } catch (err) {
    console.warn("⚠️ Impossible de charger/parse config.json:", err);

    // Fallback : onglets par défaut
    filterPage.innerHTML = `
      <option value="Tache du jour">Tâche du jour</option>
      <option value="depot jeux">Dépôt Jeux</option>
      <option value="certeco">Certeco & Veryproof</option>
    `;
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// CHARGEMENT DES TÂCHES
// ═══════════════════════════════════════════════════════════
async function loadTasks() {
    const sheetName = filterPage.value;
    if (!sheetName) {
        console.warn("⚠️ Aucun onglet sélectionné");
        return;
    }
    
    const pageUrl = `${API_URL}/${encodeURIComponent(sheetName)}`;
    
    console.log("════════════════════════════════");
    console.log("🔗 URL complète :", pageUrl);
    console.log("📄 Onglet sélectionné :", sheetName);
    
    try {
        showLoading(true); 
        hideError();
        
        const response = await fetch(`${pageUrl}?t=${new Date().getTime()}`);
        
        console.log("📡 Statut HTTP :", response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - Onglet "${sheetName}" introuvable ou vide`);
        }
        
        const data = await response.json();
        
        console.log("✅ Lignes reçues :", data.length);
        if (data.length > 0) {
            console.log("📋 Première ligne :", data[0]);
            console.log("🔑 Colonnes :", Object.keys(data[0]));
        }
        console.log("════════════════════════════════");

        if (!data || data.length === 0) {
            tasksBody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:50px">Aucune donnée dans cet onglet.</td></tr>';
            showLoading(false);
            updateStats();
            return;
        }

        // ═══════════════════════════════════════════════════════════
        // DÉTECTION AUTOMATIQUE DES COLONNES
        // ═══════════════════════════════════════════════════════════
        const firstRow = data[0];
        detectedColumns = Object.keys(firstRow).filter(col => col && col.trim() !== '');
        
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
            const hasContent = Object.values(row).some(val => 
                val && val.toString().trim() !== ''
            );
            return hasContent;
        }).map(row => {
            const task = {};
            
            // Copier toutes les colonnes
            detectedColumns.forEach(col => {
                task[col] = row[col] || '';
            });
            
            // ✅ DÉTECTER SI C'EST UNE LIGNE DE TITRE/SECTION
            const descCol = detectedColumns.find(col => col.toLowerCase().includes('description'));
            const etapeCol = detectedColumns.find(col => col.toLowerCase().includes('étape') || col.toLowerCase().includes('etape'));
            
            const desc = descCol ? (task[descCol] || '').toString().trim() : '';
            const etape = etapeCol ? (task[etapeCol] || '').toString().trim() : '';
            
            // ✅ CRITÈRES DE DÉTECTION D'UN TITRE
            const hasPhaseKeyword = desc.toUpperCase().includes('PHASE') || 
                                    etape.toUpperCase().includes('PHASE') ||
                                    desc.includes('===') || 
                                    desc.includes('---') ||
                                    desc.includes('___');
            
            const isAllCaps = desc.length > 5 && desc === desc.toUpperCase() && desc.match(/[A-ZÀ-Ÿ]/);
            
            // Vérifier si les colonnes importantes sont vides
            const affCol = detectedColumns.find(col => 
                col.toLowerCase().includes('affectation') || 
                col.toLowerCase().includes('assigné')
            );
            
            const hasNoAssignment = !task[affCol]?.trim();
            const hasNoProgress = !task[avancementColumn]?.trim() || 
                                 task[avancementColumn] === 'PAS FAIT';
            
            const isSectionTitle = (hasPhaseKeyword || isAllCaps) && hasNoAssignment && hasNoProgress;
            
            task._isSectionTitle = isSectionTitle;
            
            // Normaliser AVANCEMENT en majuscules
            if (avancementColumn && task[avancementColumn]) {
                task[avancementColumn] = task[avancementColumn].toString().trim().toUpperCase();
            } else if (avancementColumn) {
                task[avancementColumn] = 'PAS FAIT';
            }
            
            return task;
        });

        console.log("✅ Tâches chargées :", allTasks.length);
        
        // ✅ DEBUG : Afficher les sections détectées
        const sections = allTasks.filter(t => t._isSectionTitle);
        console.log("📌 Sections détectées :", sections.length);
        if (sections.length > 0) {
            const descCol = detectedColumns.find(col => col.toLowerCase().includes('description'));
            console.log("📋 Liste des sections :", sections.map(s => descCol ? s[descCol] : 'N/A'));
        }

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
        
        tasksBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:50px;color:#ef4444;">
            ⚠️ ${err.message}<br><br>
            <small>Vérifiez que l'onglet "${sheetName}" existe dans votre Google Sheet</small>
        </td></tr>`;
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
        // ✅ VÉRIFIER SI LA COLONNE CONTIENT DES DONNÉES RÉELLES (hors sections)
        const hasData = allTasks.some(t => 
            !t._isSectionTitle && // ✅ IGNORER LES SECTIONS
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
        !t._isSectionTitle && // ✅ IGNORER LES SECTIONS
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
        !t._isSectionTitle && // ✅ IGNORER LES SECTIONS
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
        const bus = [...new Set(
            allTasks
                .filter(t => !t._isSectionTitle) // ✅ IGNORER LES SECTIONS
                .map(t => t[buColumn])
        )]
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
            .filter(t => !t._isSectionTitle) // ✅ IGNORER LES SECTIONS
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
        // ✅ TOUJOURS AFFICHER LES SECTIONS
        if (t._isSectionTitle) return true;
        
        const matchBU = !sBU || (buColumn && t[buColumn] === sBU);
        const matchStat = !sStat || (avancementColumn && t[avancementColumn] === sStat);
        const matchAff = !sAff || (affColumn && t[affColumn] && t[affColumn].includes(sAff));
        
        return matchBU && matchStat && matchAff;
    });
    
    console.log(`🔍 Filtrage : ${filteredTasks.length}/${allTasks.length} tâches affichées`);
    
    displayTasks(); 
    updateStats();
}

// ═══════════════════════════════════════════════════════════
// AFFICHAGE DES TÂCHES
// ═══════════════════════════════════════════════════════════
function displayTasks() {
    tasksBody.innerHTML = '';
    
    if (filteredTasks.length === 0) {
        tasksBody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:50px;color:#94a3b8;">Aucune tâche ne correspond aux filtres sélectionnés.</td></tr>';
        return;
    }
    
    filteredTasks.forEach((task, index) => {
        const tr = document.createElement('tr');
        
        // ✅ SI C'EST UN TITRE DE SECTION
        if (task._isSectionTitle) {
            // Chercher le titre dans plusieurs colonnes possibles
            const descCol = detectedColumns.find(col => col.toLowerCase().includes('description'));
            const etapeCol = detectedColumns.find(col => col.toLowerCase().includes('étape') || col.toLowerCase().includes('etape'));
            
            // Prioriser la colonne ÉTAPE si elle existe, sinon DESCRIPTION
            let titleText = '';
            if (etapeCol && task[etapeCol]) {
                titleText = task[etapeCol];
            } else if (descCol && task[descCol]) {
                titleText = task[descCol];
            }
            
            // Nettoyer le texte (enlever les === et ---)
            titleText = titleText.replace(/[=\-_]{3,}/g, '').trim();
            
            // Ajouter une icône discrète selon le contenu
            let icon = '▸'; // Icône par défaut simple
            const upperTitle = titleText.toUpperCase();
            
            if (upperTitle.includes('PHASE 0') || upperTitle.includes('PASSATION')) {
                icon = '◆';
            } else if (upperTitle.includes('PHASE 1') || upperTitle.includes('FONDATION')) {
                icon = '▸';
            } else if (upperTitle.includes('PHASE 2') || upperTitle.includes('CONTENU')) {
                icon = '▹';
            } else if (upperTitle.includes('PHASE 3') || upperTitle.includes('DÉVELOPPEMENT') || upperTitle.includes('DEVELOPPEMENT')) {
                icon = '▸';
            } else if (upperTitle.includes('PHASE 4')) {
                icon = '▹';
            } else if (upperTitle.includes('PHASE 5')) {
                icon = '▸';
            }
            
            titleText = `${icon} ${titleText}`;
            
            tr.innerHTML = `
                <td colspan="${visibleColumns.length}" class="section-title">
                    ${titleText || '───────'}
                </td>
            `;
            tr.classList.add('section-row');
            tasksBody.appendChild(tr);
            return;
        }
        
        // ✅ SINON, AFFICHER UNE TÂCHE NORMALE
        let html = '';
        
        visibleColumns.forEach(col => {
            if (col === avancementColumn) {
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
    const sheetName = filterPage.value;
    const pageUrl = `${API_URL}/${encodeURIComponent(sheetName)}`;

    if (!avancementColumn) {
        alert("Aucune colonne AVANCEMENT détectée !");
        return;
    }

    try {
        const task = filteredTasks[taskIndex];
        const oldStatus = task[avancementColumn]; // ✅ SAUVEGARDER L'ANCIEN STATUT
        
        // Trouver la colonne description pour identifier la ligne
        const descCol = detectedColumns.find(col => col.toLowerCase().includes('description'));
        const descValue = task[descCol];

        // ✅ AJOUTER TIMESTAMP POUR ÉVITER LE CACHE
        await fetch(`${pageUrl}?t=${new Date().getTime()}`, {
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
        alert(`Erreur de synchronisation : ${err.message}`);
        
        // ✅ RESTAURER L'ANCIEN STATUT EN CAS D'ERREUR
        await loadTasks(); // Recharger les données du serveur
    }
}

// ═══════════════════════════════════════════════════════════
// MISE À JOUR DES STATISTIQUES
// ═══════════════════════════════════════════════════════════
function updateStats() {
    const s = { 'PAS FAIT': 0, 'EN COURS': 0, 'FAIT': 0 };
    
    if (avancementColumn) {
        // ✅ IGNORER LES SECTIONS DANS LES STATS
        allTasks
            .filter(t => !t._isSectionTitle)
            .forEach(t => { 
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
    await loadOnglets();
    await loadTasks();
};
