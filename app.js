// ─────────────────────────────────────────
//  Scrabble Word Solver — app.js
// ─────────────────────────────────────────

// Tile face values
const TILE_VALUES = {
    A:1, B:3, C:3, D:2, E:1, F:4, G:2, H:4, I:1, J:8, K:5,
    L:1, M:3, N:1, O:1, P:3, Q:10, R:1, S:1, T:1, U:1, V:4,
    W:4, X:8, Y:4, Z:10
};

// ─── State ────────────────────────────────
// tiles[i] = null | { letter: 'A'-'Z' | '?', positions: null | [{ type:'start'|'end', n:1..15 }, ...] }
let tiles = Array(7).fill(null);
let suppressRackInputSync = false;  // prevents text-input ↔ rack render loop
let wordSet = null;
let selectedTileIndex = null;   // which rack tile the position modal is open for
let pendingSlotIndex = null;    // which rack slot the letter picker is for (null = new tile)
let currentResults = [];
let boardPosition = null;       // { type:'start'|'end', n:1..15 } | null — where board tiles appear in word

// ─── DOM shortcuts ───────────────────────
const $ = id => document.getElementById(id);

// ─────────────────────────────────────────
//  Initialise
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    buildLetterGrid();
    renderRack();
    setupRackTextInput();
    setupBoardTilesInput();
    setupButtons();
    loadWordList();
});

// ─────────────────────────────────────────
//  Word-list loading
// ─────────────────────────────────────────
async function loadWordList() {
    setStatus('loading', 'Loading word list…');

    // Try sources in order: local file → GitHub CDN
    const sources = [
        'words.txt',
        'https://raw.githubusercontent.com/redbo/scrabbletools/master/dictionary.txt'
    ];

    for (const src of sources) {
        try {
            const resp = await fetch(src);
            if (!resp.ok) continue;
            const text = await resp.text();
            const words = text
                .split(/\r?\n/)
                .map(w => w.trim().toUpperCase())
                .filter(w => w.length >= 2 && w.length <= 15 && /^[A-Z]+$/.test(w));
            wordSet = new Set(words);
            setStatus('ok', `${wordSet.size.toLocaleString()} words loaded`);
            return;
        } catch (_) { /* try next */ }
    }

    setStatus('error', 'Word list unavailable — run server.py');
}

function setStatus(type, msg) {
    $('statusDot').className = 'status-dot ' + type;
    $('statusText').textContent = msg;
}

// ─────────────────────────────────────────
//  Rack rendering
// ─────────────────────────────────────────
function renderRack() {
    const rack = $('tileRack');
    rack.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        rack.appendChild(makeTileEl(i));
    }
    if (!suppressRackInputSync) updateRackTextInput();
}

function makeTileEl(i) {
    const t = tiles[i];
    const el = document.createElement('div');

    if (!t) {
        el.className = 'tile empty-slot';
        el.innerHTML = '<span class="empty-plus">+</span>';
        el.title = 'Click to add a tile';
        el.addEventListener('click', () => openLetterPicker(i));
    } else {
        const hasPos = t.positions && t.positions.length > 0;
        el.className = 'tile' + (t.letter === '?' ? ' blank-tile' : '') + (hasPos ? ' has-position' : '');
        el.title = 'Click to set position / remove';

        const pts = t.letter === '?' ? '' : (TILE_VALUES[t.letter] ?? '');
        const posLabel = hasPos ? formatPositions(t.positions) : '';

        el.innerHTML = `
            <span class="tile-letter">${t.letter === '?' ? '&nbsp;' : t.letter}</span>
            <span class="tile-points">${pts}</span>
            ${posLabel ? `<span class="tile-pos-badge">${posLabel}</span>` : ''}
        `;
        el.addEventListener('click', () => openTileModal(i));
    }
    return el;
}

// Single position → short string (used by board position badge too)
function formatPos(pos) {
    if (!pos) return '';
    return pos.type === 'start' ? `#${pos.n}` : `-${pos.n}`;
}

// Array of positions → compact badge label
function formatPositions(positions) {
    if (!positions || positions.length === 0) return '';
    if (positions.length === 1) return formatPos(positions[0]);
    if (positions.length <= 3) return positions.map(formatPos).join(',');
    return `${positions.length}pos`;
}

// ─────────────────────────────────────────
//  Rack text input (fast tile entry)
// ─────────────────────────────────────────
function setupRackTextInput() {
    $('rackTypeInput').addEventListener('input', e => {
        const raw = e.target.value.toUpperCase().replace(/[^A-Z?]/g, '').slice(0, 7);
        e.target.value = raw;
        suppressRackInputSync = true;
        tiles = Array(7).fill(null);
        for (let i = 0; i < raw.length; i++) {
            tiles[i] = { letter: raw[i], positions: null };
        }
        renderRack();
        suppressRackInputSync = false;
        hideResults();
    });
}

function updateRackTextInput() {
    $('rackTypeInput').value = tiles.filter(Boolean).map(t => t.letter).join('');
}

// ─────────────────────────────────────────
//  Board tiles
// ─────────────────────────────────────────
function setupBoardTilesInput() {
    const inp = $('boardTilesInput');

    inp.addEventListener('input', () => {
        inp.value = inp.value.toUpperCase().replace(/[^A-Z]/g, '');
        renderBoardTiles(inp.value);
        updateBoardPositionVisibility();
    });

    $('clearBoardBtn').addEventListener('click', () => {
        inp.value = '';
        boardPosition = null;
        renderBoardTiles('');
        updateBoardPositionVisibility();
    });

    $('clearBoardPosBtn').addEventListener('click', () => {
        boardPosition = null;
        buildBoardPosBtns('boardPosFromStart', 'start');
        buildBoardPosBtns('boardPosFromEnd',   'end');
        renderBoardTiles(inp.value);
    });

    buildBoardPosBtns('boardPosFromStart', 'start');
    buildBoardPosBtns('boardPosFromEnd',   'end');
}

function buildBoardPosBtns(containerId, type) {
    const labels = {
        start: ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th','13th','14th','15th'],
        end:   ['Last','2nd-last','3rd-last','4th-last','5th-last','6th-last','7th-last']
    };
    const maxN = type === 'start' ? 15 : 7;
    const container = $(containerId);
    container.innerHTML = '';
    for (let n = 1; n <= maxN; n++) {
        const btn = document.createElement('button');
        btn.className = 'pos-btn' + (boardPosition && boardPosition.type === type && boardPosition.n === n ? ' active' : '');
        btn.textContent = labels[type][n - 1] || `${n}`;
        btn.addEventListener('click', () => setBoardPosition(type, n));
        container.appendChild(btn);
    }
}

function setBoardPosition(type, n) {
    boardPosition = { type, n };
    buildBoardPosBtns('boardPosFromStart', 'start');
    buildBoardPosBtns('boardPosFromEnd',   'end');
    renderBoardTiles($('boardTilesInput').value);
}

function updateBoardPositionVisibility() {
    const hasBoard = $('boardTilesInput').value.length > 0;
    $('boardPositionSection').style.display = hasBoard ? 'block' : 'none';
    if (!hasBoard) {
        boardPosition = null;
        buildBoardPosBtns('boardPosFromStart', 'start');
        buildBoardPosBtns('boardPosFromEnd',   'end');
    }
}

function renderBoardTiles(str) {
    const display = $('boardTilesDisplay');
    if (!str) {
        display.innerHTML = '<span class="board-placeholder">None</span>';
        return;
    }
    const tileHtml = str.split('').map(ch => `
        <div class="board-tile">
            <span class="tile-letter">${ch}</span>
            <span class="tile-points">${TILE_VALUES[ch] ?? 0}</span>
        </div>
    `).join('');
    const badge = boardPosition
        ? `<span class="board-pos-badge">${formatPos(boardPosition)}</span>`
        : '';
    display.innerHTML = tileHtml + badge;
}

// ─────────────────────────────────────────
//  Letter picker modal
// ─────────────────────────────────────────
function buildLetterGrid() {
    const grid = $('letterGrid');
    grid.innerHTML = '';
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(ch => {
        const btn = document.createElement('button');
        btn.className = 'letter-btn';
        btn.innerHTML = `${ch}<span class="l-pts">${TILE_VALUES[ch]}</span>`;
        btn.addEventListener('click', () => placeLetter(ch));
        grid.appendChild(btn);
    });
}

function openLetterPicker(slotIndex) {
    pendingSlotIndex = slotIndex;
    $('letterModalTitle').textContent = 'Choose a Letter';
    $('letterModalBackdrop').style.display = 'flex';
}

function placeLetter(ch) {
    if (pendingSlotIndex === null) return;
    tiles[pendingSlotIndex] = { letter: ch, positions: null };
    closeLetterModal();
    renderRack();
}

function closeLetterModal() {
    $('letterModalBackdrop').style.display = 'none';
    pendingSlotIndex = null;
}

// ─────────────────────────────────────────
//  Tile position modal
// ─────────────────────────────────────────
function openTileModal(i) {
    selectedTileIndex = i;
    const t = tiles[i];

    // Preview tile
    const preview = $('modalTilePreview');
    const pts = t.letter === '?' ? '' : (TILE_VALUES[t.letter] ?? '');
    preview.innerHTML = `
        <div class="tile ${t.letter === '?' ? 'blank-tile' : ''}">
            <span class="tile-letter">${t.letter === '?' ? '&nbsp;' : t.letter}</span>
            <span class="tile-points">${pts}</span>
        </div>
    `;

    // Build position buttons (1..15 for start, 1..7 for end) — multi-select toggles
    buildPosBtns('posFromStart', 'start', t.positions);
    buildPosBtns('posFromEnd',   'end',   t.positions);

    $('tileModalBackdrop').style.display = 'flex';
}

function buildPosBtns(containerId, type, currentPositions) {
    const labels = {
        start: ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th','13th','14th','15th'],
        end:   ['Last','2nd-last','3rd-last','4th-last','5th-last','6th-last','7th-last']
    };
    const maxN = type === 'start' ? 15 : 7;
    const container = $(containerId);
    container.innerHTML = '';

    for (let n = 1; n <= maxN; n++) {
        const isActive = Array.isArray(currentPositions) &&
                         currentPositions.some(p => p.type === type && p.n === n);
        const btn = document.createElement('button');
        btn.className = 'pos-btn' + (isActive ? ' active' : '');
        btn.textContent = labels[type][n - 1] || `${n}`;
        btn.addEventListener('click', () => setTilePosition(type, n));
        container.appendChild(btn);
    }
}

function setTilePosition(type, n) {
    if (selectedTileIndex === null) return;
    const t = tiles[selectedTileIndex];
    if (!t.positions) t.positions = [];
    const idx = t.positions.findIndex(p => p.type === type && p.n === n);
    if (idx !== -1) {
        t.positions.splice(idx, 1);   // toggle off
    } else {
        t.positions.push({ type, n }); // toggle on
    }
    if (t.positions.length === 0) t.positions = null;
    buildPosBtns('posFromStart', 'start', t.positions);
    buildPosBtns('posFromEnd',   'end',   t.positions);
    renderRack();
}

function closeTileModal() {
    $('tileModalBackdrop').style.display = 'none';
    selectedTileIndex = null;
    renderRack();
}

// ─────────────────────────────────────────
//  Button wiring
// ─────────────────────────────────────────
function setupButtons() {
    // Rack controls
    $('clearRackBtn').addEventListener('click', () => {
        tiles = Array(7).fill(null);
        renderRack();
        hideResults();
    });

    $('randomTilesBtn').addEventListener('click', () => {
        tiles = randomTiles(7);
        renderRack();
        hideResults();
    });

    // Solve
    $('solveBtn').addEventListener('click', solve);

    // Sort
    $('sortSelect').addEventListener('change', () => {
        renderResults(sortResults(currentResults, $('sortSelect').value));
    });

    // Tile modal
    $('closeTileModal').addEventListener('click', closeTileModal);
    $('clearPosBtn').addEventListener('click', () => {
        if (selectedTileIndex !== null) {
            tiles[selectedTileIndex].positions = null;
            buildPosBtns('posFromStart', 'start', null);
            buildPosBtns('posFromEnd',   'end',   null);
            renderRack();
        }
    });
    $('removeTileBtn').addEventListener('click', () => {
        if (selectedTileIndex !== null) {
            tiles[selectedTileIndex] = null;
            closeTileModal();
        }
    });
    $('tileModalBackdrop').addEventListener('click', e => {
        if (e.target === $('tileModalBackdrop')) closeTileModal();
    });

    // Letter modal
    $('closeLetterModal').addEventListener('click', closeLetterModal);
    $('letterModalBackdrop').addEventListener('click', e => {
        if (e.target === $('letterModalBackdrop')) closeLetterModal();
    });
    $('blankTileBtn').addEventListener('click', () => {
        if (pendingSlotIndex === null) return;
        tiles[pendingSlotIndex] = { letter: '?', positions: null };
        closeLetterModal();
        renderRack();
    });

    // Keyboard: close modals with Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if ($('tileModalBackdrop').style.display !== 'none') closeTileModal();
            if ($('letterModalBackdrop').style.display !== 'none') closeLetterModal();
        }
    });
}

// ─────────────────────────────────────────
//  Random tile bag (standard Scrabble distribution)
// ─────────────────────────────────────────
const TILE_BAG = (
    'AAAAAAAAABBCCDDDDEEEEEEEEEEEEFFGGGHHIIIIIIIIIJKLLLLMM' +
    'NNNNNNOOOOOOOOPPQRRRRRRSSSSTTTTTTUUUUVVWWXXYYYZ??'
).split('');

function randomTiles(n) {
    const bag = [...TILE_BAG];
    const picked = [];
    for (let i = 0; i < n && bag.length; i++) {
        const idx = Math.floor(Math.random() * bag.length);
        picked.push({ letter: bag[idx], positions: null });
        bag.splice(idx, 1);
    }
    // Pad to n with nulls
    while (picked.length < n) picked.push(null);
    return picked;
}

// ─────────────────────────────────────────
//  Solver
// ─────────────────────────────────────────
function solve() {
    if (!wordSet) {
        alert('Word list is still loading. Please wait a moment.');
        return;
    }

    const activeTiles = tiles.filter(Boolean);
    if (activeTiles.length === 0) {
        alert('Add at least one tile to your rack.');
        return;
    }

    const boardStr = $('boardTilesInput').value.toUpperCase().trim();
    const btn = $('solveBtn');
    btn.textContent = 'Searching…';
    btn.disabled = true;

    // Run solver async so the UI can repaint the button state
    setTimeout(() => {
        try {
            currentResults = findWords(activeTiles, boardStr);
            const sorted = sortResults(currentResults, $('sortSelect').value);
            renderResults(sorted);
        } finally {
            btn.textContent = 'Find Words';
            btn.disabled = false;
        }
    }, 20);
}

/**
 * Find all valid Scrabble words that:
 *   1. Contain boardStr as a substring (if provided)
 *   2. Can be formed using the hand tiles (+ blanks as wildcards)
 *   3. Satisfy any per-tile position constraints
 *
 * Returns array of result objects:
 *   { word, score, usedBlanksAt: Set<index in word>, boardStart: number }
 */
function findWords(handTiles, boardStr) {
    const results = [];
    const letterCounts = countLetters(handTiles);  // { A:2, B:1, '?':1, ... }

    for (const word of wordSet) {
        // ── 1. Quick containment check for board tiles ────────
        let boardStart = -1;
        if (boardStr) {
            if (boardPosition) {
                // Constrain the exact position of the board tile sequence
                const { type, n } = boardPosition;
                boardStart = type === 'start'
                    ? n - 1                                          // n=1 → index 0
                    : word.length - boardStr.length - (n - 1);      // n=1 → ends at last letter
                if (boardStart < 0 || boardStart + boardStr.length > word.length) continue;
                if (word.slice(boardStart, boardStart + boardStr.length) !== boardStr) continue;
            } else {
                boardStart = word.indexOf(boardStr);
                if (boardStart === -1) continue;
            }
        }

        // ── 2. Compute letters needed from hand ───────────────
        const needed = neededFromHand(word, boardStr, boardStart);
        if (!needed) continue;   // mismatch (shouldn't happen after indexOf check)

        // ── 3. Can we cover 'needed' with hand tiles? ─────────
        const matchResult = matchTiles(needed, letterCounts);
        if (!matchResult) continue;

        // ── 4. Position constraints ───────────────────────────
        if (!checkPositionConstraints(word, handTiles)) continue;

        // ── 5. Score ──────────────────────────────────────────
        const score = scoreWord(word, boardStr, boardStart, matchResult.blanksUsedFor);

        results.push({
            word,
            score,
            usedBlanksAt: matchResult.blanksUsedFor,
            boardStart,
            boardStr,
            handCount: needed.length   // letters contributed from hand
        });
    }

    return results;
}

/**
 * Count letters (including '?' blanks) in the hand.
 */
function countLetters(handTiles) {
    const counts = {};
    for (const t of handTiles) {
        if (!t) continue;
        counts[t.letter] = (counts[t.letter] || 0) + 1;
    }
    return counts;
}

/**
 * Return the letters that must come from the hand for this word,
 * given that boardStr is embedded at boardStart.
 * Returns array of letters, or null if something is wrong.
 */
function neededFromHand(word, boardStr, boardStart) {
    if (!boardStr) return word.split('');

    // Letters before board segment + letters after board segment
    const before = word.slice(0, boardStart).split('');
    const after  = word.slice(boardStart + boardStr.length).split('');
    return [...before, ...after];
}

/**
 * Try to cover the `needed` letters using `available` counts.
 * Returns { blanksUsedFor: Set<letter> } or null if impossible.
 * blanksUsedFor: the letters (of the word) that a blank covered.
 */
function matchTiles(needed, available) {
    // Work on a copy
    const pool = { ...available };
    const blanksUsedFor = new Set();

    for (const ch of needed) {
        if (pool[ch] > 0) {
            pool[ch]--;
        } else if (pool['?'] > 0) {
            pool['?']--;
            blanksUsedFor.add(ch);
        } else {
            return null;
        }
    }
    return { blanksUsedFor };
}

/**
 * Check that every hand tile with a position constraint has its letter
 * at the correct position in the word.
 * (Blanks with position constraints are ignored — they adapt to any letter.)
 */
function checkPositionConstraints(word, handTiles) {
    for (const t of handTiles) {
        if (!t || !t.positions || t.positions.length === 0 || t.letter === '?') continue;

        // ANY of the selected positions must place this letter correctly
        const matched = t.positions.some(({ type, n }) => {
            const idx = type === 'start' ? n - 1 : word.length - n;
            return idx >= 0 && idx < word.length && word[idx] === t.letter;
        });
        if (!matched) return false;
    }
    return true;
}

/**
 * Score a word.
 * Board-tile letters score at face value.
 * Hand-tile letters score at face value EXCEPT blanks, which score 0.
 *
 * blanksUsedFor = Set of letters (e.g. {'E','S'}) that blanks represented.
 * We need to find which positions in the word those letters occupy
 * (excluding board-tile positions).
 */
function scoreWord(word, boardStr, boardStart, blanksUsedFor) {
    let score = 0;
    const blankCopy = [...blanksUsedFor]; // consume as we assign

    for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        const isBoard = boardStr && i >= boardStart && i < boardStart + boardStr.length;

        if (isBoard) {
            // Board tiles always score face value (already on board, no premium)
            score += TILE_VALUES[ch] || 0;
        } else {
            // Hand tile — check if this letter was covered by a blank
            const blankIdx = blankCopy.indexOf(ch);
            if (blankIdx !== -1) {
                blankCopy.splice(blankIdx, 1); // mark consumed
                // blank scores 0
            } else {
                score += TILE_VALUES[ch] || 0;
            }
        }
    }
    return score;
}

// ─────────────────────────────────────────
//  Sort
// ─────────────────────────────────────────
function sortResults(results, key) {
    const copy = [...results];
    if (key === 'score') {
        copy.sort((a, b) => b.score - a.score || b.word.length - a.word.length || a.word.localeCompare(b.word));
    } else if (key === 'length') {
        copy.sort((a, b) => b.word.length - a.word.length || b.score - a.score || a.word.localeCompare(b.word));
    } else {
        copy.sort((a, b) => a.word.localeCompare(b.word));
    }
    return copy;
}

// ─────────────────────────────────────────
//  Results rendering
// ─────────────────────────────────────────
function renderResults(results) {
    const card    = $('resultsCard');
    const grid    = $('resultsGrid');
    const countEl = $('resultsCount');

    card.style.display = 'block';
    countEl.textContent = results.length === 0
        ? 'No words found'
        : `${results.length.toLocaleString()} word${results.length === 1 ? '' : 's'} found`;

    if (results.length === 0) {
        grid.innerHTML = `
            <div class="no-results">
                <p>&#x1F914;</p>
                <p>No valid words found with these tiles.</p>
                <p style="font-size:0.82rem;margin-top:6px;">Try removing position constraints or adding more tiles.</p>
            </div>`;
        return;
    }

    grid.innerHTML = '';
    for (const r of results) {
        grid.appendChild(makeResultCard(r));
    }

    // Smooth-scroll to results
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function makeResultCard(r) {
    const card = document.createElement('div');
    card.className = 'result-card';

    // Tile row
    const tilesRow = document.createElement('div');
    tilesRow.className = 'result-word-tiles';

    for (let i = 0; i < r.word.length; i++) {
        const ch = r.word[i];
        const isBoard = r.boardStr &&
                        i >= r.boardStart &&
                        i < r.boardStart + r.boardStr.length;

        // Determine blank: only from hand letters, and only if the blank was
        // used for this specific letter (heuristic: mark unused occurrences)
        const pts = TILE_VALUES[ch] || 0;

        const t = document.createElement('div');
        t.className = 'result-tile' +
                      (isBoard ? ' board-letter' : '') +
                      (isBoard ? '' : (r.usedBlanksAt.has(ch) ? ' blank-used' : ''));
        t.innerHTML = `
            <span class="tile-letter">${ch}</span>
            <span class="tile-points">${isBoard || r.usedBlanksAt.has(ch) ? pts : pts}</span>
        `;
        tilesRow.appendChild(t);
    }

    // Meta row
    const meta = document.createElement('div');
    meta.className = 'result-meta';
    meta.innerHTML = `
        <span class="result-score">
            ${r.score} <span class="result-score-label">pts</span>
        </span>
        <span class="result-badges">
            <span class="badge badge-len">${r.word.length} letters</span>
            ${r.handCount === 7 ? '<span class="badge badge-bingo">BINGO</span>' : ''}
        </span>
    `;

    card.appendChild(tilesRow);
    card.appendChild(meta);
    return card;
}

function hideResults() {
    $('resultsCard').style.display = 'none';
    currentResults = [];
}
