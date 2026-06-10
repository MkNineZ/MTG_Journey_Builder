import os

search_engine_path = 'js/components/searchEngine.js'
collection_path = 'js/screens/collection.js'

with open(search_engine_path, 'r', encoding='utf-8') as f:
    se_code = f.read()

# Modify export function signature
se_code = se_code.replace(
    'export function renderSearchUI(containerElement, allCards, onFilterCallback) {',
    'export function renderSearchUI(containerElement, allCards, onFilterCallback, initialState = null) {'
)

# Modify uiState initialization and sync DOM
old_ui_init = "const uiState = { name: '', oracleText: '', keywords: '', type: 'all', subtype: '', rarity: 'all', set: 'all', manaValue: '', colors: [], colorMode: 'includes' };"
new_ui_init = """const uiState = initialState ? { ...initialState } : { name: '', oracleText: '', keywords: '', type: 'all', subtype: '', rarity: 'all', set: 'all', manaValue: '', colors: [], colorMode: 'includes' };

    const elName = containerElement.querySelector('.search-name');
    const elOracle = containerElement.querySelector('.search-oracle');
    const elKeywords = containerElement.querySelector('.search-keywords');
    const elType = containerElement.querySelector('.search-type');
    const elSubtype = containerElement.querySelector('.search-subtype');
    const elRarity = containerElement.querySelector('.search-rarity');
    const elSet = containerElement.querySelector('.search-set');
    const elMv = containerElement.querySelector('.search-mv');
    const elColorMode = containerElement.querySelector('.search-colormode');
    const manaBtns = containerElement.querySelectorAll('.mana-btn');
    const btnReset = containerElement.querySelector('.search-reset');

    // Sync DOM to uiState
    if (initialState) {
        elName.value = uiState.name;
        elOracle.value = uiState.oracleText;
        elKeywords.value = uiState.keywords;
        elType.value = uiState.type;
        elSubtype.value = uiState.subtype;
        elRarity.value = uiState.rarity;
        elSet.value = uiState.set;
        elMv.value = uiState.manaValue;
        elColorMode.value = uiState.colorMode;
        
        uiState.colors.forEach(c => {
            const btn = Array.from(manaBtns).find(b => b.getAttribute('data-color') === c);
            if (btn) {
                btn.style.borderColor = 'var(--accent-color)';
                btn.style.boxShadow = '0 0 10px var(--accent-color)';
            }
        });
    }"""

se_code = se_code.replace(old_ui_init, new_ui_init)

# Remove the old DOM queries that we just moved up
old_queries = """
    const elName = containerElement.querySelector('.search-name');
    const elOracle = containerElement.querySelector('.search-oracle');
    const elKeywords = containerElement.querySelector('.search-keywords');
    const elType = containerElement.querySelector('.search-type');
    const elSubtype = containerElement.querySelector('.search-subtype');
    const elRarity = containerElement.querySelector('.search-rarity');
    const elSet = containerElement.querySelector('.search-set');
    const elMv = containerElement.querySelector('.search-mv');
    const elColorMode = containerElement.querySelector('.search-colormode');
    const manaBtns = containerElement.querySelectorAll('.mana-btn');
    const btnReset = containerElement.querySelector('.search-reset');
"""
# We must replace only the second occurrence or just clean it carefully.
# Actually, since we replaced old_ui_init WITH the DOM queries, the old DOM queries are right below it.
# Let's just find `const elName =` and remove until `btnReset`
idx_start = se_code.find('const elName = containerElement.querySelector(\'.search-name\');', se_code.find('if (initialState) {'))
if idx_start != -1:
    idx_end = se_code.find('const btnReset = containerElement.querySelector(\'.search-reset\');', idx_start)
    if idx_end != -1:
        # + length of that line
        idx_end = se_code.find('\\n', idx_end)
        se_code = se_code[:idx_start] + se_code[idx_end+1:]

# Add return uiState at the end of renderSearchUI
last_brace = se_code.rfind('}')
se_code = se_code[:last_brace] + '    return uiState;\n}\n'

with open(search_engine_path, 'w', encoding='utf-8') as f:
    f.write(se_code)
print("searchEngine.js updated")

# Modify collection.js
with open(collection_path, 'r', encoding='utf-8') as f:
    col_code = f.read()

# Add global state var
if "let currentSearchState = null;" not in col_code:
    col_code = col_code.replace("let currentFilteredCards = [];", "let currentFilteredCards = [];\nlet currentSearchState = null;")

# Update render
old_render_block = """        const searchContainer = document.getElementById('collection-search');
        renderSearchUI(searchContainer, inventory, onFilter);
        onFilter(filterCards(inventory, { name: '', oracleText: '', keywords: '', type: 'all', rarity: 'all', set: 'all', manaValue: '', colors: [], colorMode: 'includes' }));"""

new_render_block = """        const searchContainer = document.getElementById('collection-search');
        currentSearchState = renderSearchUI(searchContainer, inventory, onFilter, currentSearchState);
        
        // Execute initial or restored filter
        onFilter(filterCards(inventory, currentSearchState));"""

col_code = col_code.replace(old_render_block, new_render_block)

with open(collection_path, 'w', encoding='utf-8') as f:
    f.write(col_code)
print("collection.js updated")
