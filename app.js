// ── State ──────────────────────────────────────────────────
let positions = [];
let excludePositions = [];
let currentRegex = '';
let explanationVisible = false;

// Init after DOM is ready
document.addEventListener('DOMContentLoaded', function () {
  addPosition();
  document.getElementById('lenExact').value = 5;
  generate();
  initWordle();
});

function addExcludePosition() {
  const id = Date.now() + Math.random();
  excludePositions.push({ id });
  appendExcludePosRow(id);
  generate();
}

function removeExcludePosition(id) {
  excludePositions = excludePositions.filter(p => p.id !== id);
  const row = document.getElementById('expos-row-' + id);
  if (row) row.remove();
  generate();
}

function appendExcludePosRow(id) {
  const area = document.getElementById('excludePosArea');
  const row = document.createElement('div');
  row.className = 'pos-row';
  row.id = 'expos-row-' + id;
  row.innerHTML =
    '<span class="pos-label" style="color:var(--danger)">Pozycja <input type="number" id="expos-n-' + id + '" min="1" max="50"' +
    ' placeholder="nr" style="width:54px;display:inline;padding:6px 8px;font-size:13px;"' +
    ' oninput="generate()"></span>' +
    '<input type="text" id="expos-l-' + id + '" placeholder="litery, np. AB"' +
    ' style="text-transform:uppercase;letter-spacing:0.12em;" oninput="generate()">' +
    '<button class="del-btn" onclick="removeExcludePosition(' + id + ')">×</button>';
  area.appendChild(row);
}

function addPosition() {
  const id = Date.now();
  positions.push({ id });
  appendPositionRow(id);
  generate();
}

function removePosition(id) {
  positions = positions.filter(p => p.id !== id);
  const row = document.getElementById('pos-row-' + id);
  if (row) row.remove();
  generate();
}

function appendPositionRow(id) {
  const area = document.getElementById('positionsArea');
  const row = document.createElement('div');
  row.className = 'pos-row';
  row.id = 'pos-row-' + id;
  row.innerHTML =
    '<span class="pos-label">Pozycja <input type="number" id="pos-n-' + id + '" min="1" max="50"' +
    ' placeholder="nr" style="width:54px;display:inline;padding:6px 8px;font-size:13px;"' +
    ' oninput="generate()"></span>' +
    '<input type="text" id="pos-l-' + id + '" maxlength="1" placeholder="litera"' +
    ' style="text-transform:uppercase;letter-spacing:0.2em;" oninput="generate()">' +
    '<button class="del-btn" onclick="removePosition(' + id + ')">×</button>';
  area.appendChild(row);
}

function parseLetters(str) {
  if (!str.trim()) return [];
  return str.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length === 1 && /[A-Z]/i.test(s));
}

function generate() {
  if (!document.getElementById('lenExact')) return;
  const lenExact = document.getElementById('lenExact').value.trim();
  const lenMin = document.getElementById('lenMin').value.trim();
  const lenMax = document.getElementById('lenMax').value.trim();
  const mustHave = parseLetters(document.getElementById('mustHave').value);
  const mustNot = parseLetters(document.getElementById('mustNotHave').value);

  // Gather positions
  const posMap = {};
  positions.forEach(p => {
    const n = document.getElementById(`pos-n-${p.id}`)?.value.trim();
    const l = document.getElementById(`pos-l-${p.id}`)?.value.trim().toUpperCase();
    if (n && l && /^[A-Z]$/i.test(l)) {
      posMap[parseInt(n)] = l;
    }
  });

  // Gather excluded-letter positions
  const excludePosMap = {}; // pos -> string of letters to exclude
  excludePositions.forEach(p => {
    const n = document.getElementById(`expos-n-${p.id}`)?.value.trim();
    const l = document.getElementById(`expos-l-${p.id}`)?.value.trim().toUpperCase();
    if (n && l) {
      const letters = l.split('').filter(c => /[A-Z]/i.test(c));
      if (letters.length) excludePosMap[parseInt(n)] = letters.join('');
    }
  });

  const hasSomething = lenExact || lenMin || lenMax || mustHave.length || mustNot.length || Object.keys(posMap).length || Object.keys(excludePosMap).length;

  if (!hasSomething) {
    currentRegex = '';
    displayRegex('');
    return;
  }

  // --- Build regex ---
  let parts = [];
  let explanation = [];

  // 1. Must have (lookaheads)
  mustHave.forEach(letter => {
    parts.push(`(?=.*${letter})`);
    explanation.push({ code: `(?=.*${letter})`, desc: `słowo musi zawierać literę "${letter}"` });
  });

  // 2. Must not have (negative lookahead)
  if (mustNot.length) {
    const cls = mustNot.join('');
    parts.push(`(?!.*[${cls}])`);
    explanation.push({ code: `(?!.*[${cls}])`, desc: `słowo nie może zawierać: ${mustNot.join(', ')}` });
  }

  // 3. Build character-by-character pattern for guaranteed positions
  // Figure out total length constraint
  let lengthQuantifier = '';
  let minLen = 1, maxLen = null;

  if (lenExact) {
    minLen = maxLen = parseInt(lenExact);
    lengthQuantifier = `{${lenExact}}`;
    explanation.push({ code: `{${lenExact}}`, desc: `słowo ma dokładnie ${lenExact} liter` });
  } else if (lenMin || lenMax) {
    const mn = lenMin ? parseInt(lenMin) : '';
    const mx = lenMax ? parseInt(lenMax) : '';
    minLen = mn || 1;
    maxLen = mx || null;
    if (mn && mx) {
      lengthQuantifier = `{${mn},${mx}}`;
      explanation.push({ code: `{${mn},${mx}}`, desc: `słowo ma od ${mn} do ${mx} liter` });
    } else if (mn) {
      lengthQuantifier = `{${mn},}`;
      explanation.push({ code: `{${mn},}`, desc: `słowo ma co najmniej ${mn} liter` });
    } else if (mx) {
      lengthQuantifier = `{1,${mx}}`;
      explanation.push({ code: `{1,${mx}}`, desc: `słowo ma co najwyżej ${mx} liter` });
    }
  }

  // Build positional pattern
  const allPosKeys = [...new Set([...Object.keys(posMap).map(Number), ...Object.keys(excludePosMap).map(Number)])].sort((a,b)=>a-b);
  const posKeys = Object.keys(posMap).map(Number).sort((a,b) => a-b);

  // Helper: get char class for a position
  function charClassAt(pos) {
    const fixed = posMap[pos];
    if (fixed) return fixed; // exact letter, no brackets needed
    const excl = excludePosMap[pos];
    if (excl) {
      return `[^${excl}]`;
    }
    return `[A-Z]`;
  }

  if (allPosKeys.length === 0) {
    // No positions — just wildcard with length
    const wild = lengthQuantifier ? `[A-Z]${lengthQuantifier}` : `[A-Z]+`;
    parts.push(`^${wild}$`);
    if (!lengthQuantifier) {
      explanation.push({ code: `^[A-Z]+$`, desc: `dowolne litery, dowolna długość` });
    }
  } else {
    // Build positional pattern
    const maxPos = Math.max(...allPosKeys);
    let pattern = '^';
    let i = 1;

    while (i <= maxPos) {
      const cls = charClassAt(i);
      if (posMap[i]) {
        pattern += cls;
        explanation.push({ code: cls, desc: `pozycja ${i}: litera "${posMap[i]}"` });
        i++;
      } else if (excludePosMap[i]) {
        pattern += cls;
        explanation.push({ code: cls, desc: `pozycja ${i}: żadna z liter "${excludePosMap[i]}"` });
        i++;
      } else {
        // Count consecutive unconstrained positions
        let run = 0;
        while (i <= maxPos && !posMap[i] && !excludePosMap[i]) { run++; i++; }
        pattern += `[A-Z]{${run}}`;
      }
    }

    // After last fixed position: remaining characters
    if (lengthQuantifier) {
      // We know total length — calculate remaining
      const fixedPart = maxPos; // characters accounted for so far
      if (lenExact) {
        const remaining = parseInt(lenExact) - fixedPart;
        if (remaining < 0) {
          // Conflict — show warning
          pattern += `[A-Z]{0}`;
        } else if (remaining === 0) {
          // nothing
        } else {
          pattern += `[A-Z]{${remaining}}`;
        }
      } else {
        // min/max
        const mn = lenMin ? parseInt(lenMin) : 1;
        const mx = lenMax ? parseInt(lenMax) : null;
        const remMin = Math.max(0, mn - fixedPart);
        const remMax = mx ? mx - fixedPart : null;
        if (remMax === null) {
          pattern += remMin > 0 ? `[A-Z]{${remMin},}` : `[A-Z]*`;
        } else {
          if (remMin === remMax) {
            if (remMin > 0) pattern += `[A-Z]{${remMin}}`;
          } else {
            pattern += `[A-Z]{${remMin},${remMax}}`;
          }
        }
      }
    } else {
      pattern += `[A-Z]*`;
    }

    pattern += '$';
    parts.push(pattern);
  }

  const regex = parts.join('');
  currentRegex = regex;
  displayRegex(regex);
  renderExplanation(explanation);
}

function displayRegex(r) {
  const el = document.getElementById('regexOutput');
  if (!r) {
    el.textContent = 'wypełnij filtry powyżej...';
    el.classList.add('empty');
  } else {
    el.textContent = r;
    el.classList.remove('empty');
  }
}

function renderExplanation(items) {
  const el = document.getElementById('explanation');
  if (!items.length) { el.innerHTML = ''; return; }
  let html = '<div class="explain-row">';
  items.forEach(item => {
    html += `<span class="explain-code">${escHtml(item.code)}</span><span class="explain-desc">${escHtml(item.desc)}</span>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

function toggleExplain() {
  const el = document.getElementById('explanation');
  explanationVisible = !explanationVisible;
  el.classList.toggle('visible', explanationVisible);
}

function copyToClipboard(text, btnId, label) {
  function finish() {
    const btn = document.getElementById(btnId);
    const orig = btn.innerHTML;
    btn.textContent = '✓ Skopiowano!';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1800);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(finish).catch(() => fallback(text, finish));
  } else {
    fallback(text, finish);
  }
}

function fallback(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
  cb();
}

function copyRegex() {
  if (!currentRegex) return;
  copyToClipboard(currentRegex, 'copyBtn', 'Kopiuj');
}

function copyPoolRegex() {
  if (!currentPoolRegex) return;
  copyToClipboard(currentPoolRegex, 'poolCopyBtn', 'Kopiuj');
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Tab switching ──────────────────────────────────────────
const TAB_LABELS = { wordle: 'wordle', filters: 'filtr', pool: 'pula' };

function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.textContent.toLowerCase().includes(TAB_LABELS[name])) {
      b.classList.add('active');
    }
  });
}

// ── Pool tab ───────────────────────────────────────────────
let poolLetters = []; // array of uppercase letters (may repeat)
let currentPoolRegex = '';

function poolInputChanged() {
  // allow Enter to add
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.activeElement.id === 'poolInput') {
    poolAddFromInput();
  }
});

function poolAddFromInput() {
  const raw = document.getElementById('poolInput').value;
  // split by comma, space, or nothing (each char)
  const letters = raw.toUpperCase().split(/[\s,]+/).flatMap(chunk =>
    chunk.length > 1 ? chunk.split('') : [chunk]
  ).filter(c => /[A-Z]/.test(c));

  letters.forEach(l => {
    if (!poolLetters.includes(l)) poolLetters.push(l);
  });
  poolLetters.sort();
  document.getElementById('poolInput').value = '';
  renderPoolLetters();
  generatePool();
}

function removePoolLetter(letter) {
  poolLetters = poolLetters.filter(l => l !== letter);
  renderPoolLetters();
  generatePool();
}

function renderPoolLetters() {
  const container = document.getElementById('poolLetters');
  const emptyMsg = document.getElementById('poolEmpty');
  // remove old chips, keep empty msg
  container.querySelectorAll('.letter-chip').forEach(c => c.remove());

  if (poolLetters.length === 0) {
    emptyMsg.style.display = '';
    return;
  }
  emptyMsg.style.display = 'none';

  poolLetters.forEach(letter => {
    const chip = document.createElement('div');
    chip.className = 'letter-chip';
    chip.innerHTML = letter + '<button class="chip-del" onclick="removePoolLetter(\'' + letter + '\')">×</button>';
    container.appendChild(chip);
  });
}

function generatePool() {
  if (!document.getElementById('poolLenExact')) return;
  const exact = document.getElementById('poolLenExact').value.trim();
  const min = document.getElementById('poolLenMin').value.trim();
  const max = document.getElementById('poolLenMax').value.trim();
  const out = document.getElementById('poolRegexOutput');

  if (poolLetters.length === 0) {
    currentPoolRegex = '';
    out.textContent = 'dodaj litery do puli...';
    out.classList.add('empty');
    return;
  }

  const cls = '[' + poolLetters.join('') + ']';

  let quant;
  if (exact) {
    quant = '{' + exact + '}';
  } else if (min && max) {
    quant = '{' + min + ',' + max + '}';
  } else if (min) {
    quant = '{' + min + ',}';
  } else if (max) {
    quant = '{1,' + max + '}';
  } else {
    quant = '+';
  }

  const regex = '^' + cls + quant + '$';
  currentPoolRegex = regex;
  out.textContent = regex;
  out.classList.remove('empty');
}

// ── Wordle tab ─────────────────────────────────────────────
const W_ROWS = 6;
const W_COLS = 5;
let wordleState = [];
let currentWordleRegex = '';

function makeEmptyWordleState() {
  return Array.from({ length: W_ROWS }, () =>
    Array.from({ length: W_COLS }, () => ({ letter: '', state: 'empty' }))
  );
}

function initWordle() {
  wordleState = makeEmptyWordleState();
  const grid = document.getElementById('wordleGrid');
  grid.innerHTML = '';

  for (let r = 0; r < W_ROWS; r++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'wordle-row';

    for (let c = 0; c < W_COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'wordle-cell state-empty';
      cell.id = `wc-${r}-${c}`;

      const input = document.createElement('input');
      input.maxLength = 1;
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.inputMode = 'text';

      // Navigation + backspace via keydown (reliable on all platforms)
      input.addEventListener('keydown', (e) => handleWordleNav(e, r, c));

      // Letter input via `input` event — fires reliably on mobile virtual keyboards
      input.addEventListener('input', (e) => handleWordleInput(e, r, c));

      // Color cycling via pointerdown — works for both mouse and touch
      input.addEventListener('pointerdown', (e) => {
        if (wordleState[r][c].letter) {
          e.preventDefault(); // prevent text selection; focus managed manually
          input.focus();
          cycleWordleState(r, c);
        }
      });

      cell.appendChild(input);
      rowEl.appendChild(cell);
    }

    grid.appendChild(rowEl);
  }
}

// Handles navigation and backspace (keydown is reliable for these on all platforms)
function handleWordleNav(e, r, c) {
  if (e.key === 'Backspace') {
    e.preventDefault();
    if (wordleState[r][c].letter) {
      wordleState[r][c] = { letter: '', state: 'empty' };
      updateWordleCell(r, c);
    } else if (c > 0) {
      wordleState[r][c - 1] = { letter: '', state: 'empty' };
      updateWordleCell(r, c - 1);
      focusWordleCell(r, c - 1);
    }
    generateWordle();
    return;
  }
  if (e.key === 'ArrowLeft')  { e.preventDefault(); focusWordleCell(r, c - 1); return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); focusWordleCell(r, c + 1); return; }
  if (e.key === 'ArrowUp')    { e.preventDefault(); focusWordleCell(r - 1, c); return; }
  if (e.key === 'ArrowDown')  { e.preventDefault(); focusWordleCell(r + 1, c); return; }
}

// Handles letter input — fires reliably on mobile virtual keyboards
function handleWordleInput(e, r, c) {
  if (e.inputType === 'deleteContentBackward') {
    // Backspace on mobile (keydown may not fire) — handled here as fallback
    wordleState[r][c] = { letter: '', state: 'empty' };
    updateWordleCell(r, c);
    if (c > 0) focusWordleCell(r, c - 1);
    generateWordle();
    return;
  }

  const raw = (e.data || '').replace(/[^a-zA-Z]/g, '');
  if (!raw) {
    // Non-letter or composition — reset input to current state
    updateWordleCell(r, c);
    return;
  }

  const letter = raw[raw.length - 1].toUpperCase(); // take last char if multiple slipped through
  wordleState[r][c] = { letter, state: 'miss' };
  updateWordleCell(r, c);
  applyKnownState(r, c);
  generateWordle();
  if (c < W_COLS - 1) focusWordleCell(r, c + 1);
  else if (r < W_ROWS - 1) focusWordleCell(r + 1, 0);
}

function cycleWordleState(r, c) {
  const s = wordleState[r][c];
  if (s.state === 'miss') s.state = 'yellow';
  else if (s.state === 'yellow') s.state = 'green';
  else s.state = 'miss';
  updateWordleCell(r, c);
  propagateWordleState(r, c);
  generateWordle();
}

// After marking a cell, push its state to matching letters in other rows
function propagateWordleState(r, c) {
  const { letter, state } = wordleState[r][c];
  if (!letter || state === 'empty') return;

  for (let or = 0; or < W_ROWS; or++) {
    if (or === r) continue;
    for (let oc = 0; oc < W_COLS; oc++) {
      const cell = wordleState[or][oc];
      if (cell.letter !== letter || cell.state === 'empty') continue;

      if (state === 'green' && oc === c) {
        // Same letter, same column → also green
        cell.state = 'green';
        updateWordleCell(or, oc);
      } else if (state === 'yellow' && cell.state !== 'green') {
        // Same letter anywhere → also yellow (don't override green)
        cell.state = 'yellow';
        updateWordleCell(or, oc);
      } else if (state === 'miss' && cell.state === 'miss') {
        // Keep miss in sync (already miss, nothing to change)
      }
    }
  }
}

// When typing a new letter, apply already-known state for that letter
function applyKnownState(r, c) {
  const letter = wordleState[r][c].letter;
  if (!letter) return;

  // Check for known green at this exact column
  for (let or = 0; or < W_ROWS; or++) {
    if (or === r) continue;
    const cell = wordleState[or][c];
    if (cell.letter === letter && cell.state === 'green') {
      wordleState[r][c].state = 'green';
      updateWordleCell(r, c);
      return;
    }
  }

  // Check for known yellow anywhere
  for (let or = 0; or < W_ROWS; or++) {
    if (or === r) continue;
    for (let oc = 0; oc < W_COLS; oc++) {
      const cell = wordleState[or][oc];
      if (cell.letter === letter && cell.state === 'yellow') {
        wordleState[r][c].state = 'yellow';
        updateWordleCell(r, c);
        return;
      }
    }
  }
}

function updateWordleCell(r, c) {
  const cell = document.getElementById(`wc-${r}-${c}`);
  if (!cell) return;
  const { letter, state } = wordleState[r][c];
  cell.className = `wordle-cell state-${state}`;
  cell.querySelector('input').value = letter;
}

function focusWordleCell(r, c) {
  if (r < 0 || r >= W_ROWS || c < 0 || c >= W_COLS) return;
  document.getElementById(`wc-${r}-${c}`)?.querySelector('input')?.focus();
}

function clearWordle() {
  initWordle();
  generateWordle();
}

function generateWordle() {
  const greenMap = {};       // pos (1-5) -> letter
  const yellowExclude = {};  // pos (1-5) -> Set of letters excluded there
  const mustHaveLetters = new Set();
  const missLetters = new Set();
  const foundLetters = new Set();

  for (let r = 0; r < W_ROWS; r++) {
    for (let c = 0; c < W_COLS; c++) {
      const { letter, state } = wordleState[r][c];
      if (!letter || state === 'empty') continue;
      const pos = c + 1;

      if (state === 'green') {
        greenMap[pos] = letter;
        foundLetters.add(letter);
      } else if (state === 'yellow') {
        mustHaveLetters.add(letter);
        foundLetters.add(letter);
        if (!yellowExclude[pos]) yellowExclude[pos] = new Set();
        yellowExclude[pos].add(letter);
      } else if (state === 'miss') {
        missLetters.add(letter);
      }
    }
  }

  // Letters truly absent (grey and not also yellow/green)
  const absentLetters = [...missLetters].filter(l => !foundLetters.has(l));

  const hasData = Object.keys(greenMap).length > 0 || mustHaveLetters.size > 0 || absentLetters.length > 0;
  const out = document.getElementById('wordleRegexOutput');

  if (!hasData) {
    currentWordleRegex = '';
    out.textContent = 'wypełnij siatkę...';
    out.classList.add('empty');
    return;
  }

  const parts = [];

  // Must-have lookaheads (yellow letters)
  mustHaveLetters.forEach(letter => parts.push(`(?=.*${letter})`));

  // Must-not lookahead (absent letters)
  if (absentLetters.length) {
    parts.push(`(?!.*[${absentLetters.join('')}])`);
  }

  // 5-character positional pattern
  let pattern = '^';
  for (let pos = 1; pos <= W_COLS; pos++) {
    if (greenMap[pos]) {
      pattern += greenMap[pos];
    } else {
      const excl = new Set();
      if (yellowExclude[pos]) yellowExclude[pos].forEach(l => excl.add(l));
      absentLetters.forEach(l => excl.add(l));

      if (excl.size) {
        pattern += `[^${[...excl].join('')}]`;
      } else {
        pattern += `[A-Z]`;
      }
    }
  }
  pattern += '$';
  parts.push(pattern);

  const regex = parts.join('');
  currentWordleRegex = regex;
  out.textContent = regex;
  out.classList.remove('empty');
}

function copyWordleRegex() {
  if (!currentWordleRegex) return;
  copyToClipboard(currentWordleRegex, 'wordleCopyBtn', 'Kopiuj');
}
