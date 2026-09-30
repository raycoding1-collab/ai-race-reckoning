// Karuta: eight cards on the mat, each with the second half of a poem in kana.
// The reader chants the first half one syllable at a time; take the card that
// completes it. Taken cards are replaced from the deck, ten readings a game.

const ROUNDS = 10;
const BOARD = 8;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function initKaruta(poems) {
  const fig = document.getElementById('karuta');
  if (!fig || !poems?.length) return;
  const mat = fig.querySelector('[data-kr-cards]');
  const upper = fig.querySelector('[data-kr-upper]');
  const scoreEl = fig.querySelector('[data-kr-score]');
  const roundEl = fig.querySelector('[data-kr-round]');
  const timeEl = fig.querySelector('[data-kr-time]');
  const startBtn = fig.querySelector('[data-kr-start]');
  const hard = fig.querySelector('#kr-hard');

  let deck = [];
  let board = [];
  let target = null;
  let round = 0;
  let score = 0;
  let timer = 0;
  let t0 = 0;
  let times = [];
  let locked = true;

  function cardHTML(p) {
    // laid out like a printed torifuda: the kana alone, in three columns
    const chars = [...p.l.replace(/ /g, '')];
    const per = Math.ceil(chars.length / 3);
    const lines = [0, 1, 2].map((i) => `<span>${chars.slice(i * per, (i + 1) * per).join('')}</span>`).join('');
    return `<li><button type="button" class="kr-card" data-n="${p.n}" aria-label="${p.l}"><span class="kr-kana" lang="ja">${lines}</span></button></li>`;
  }

  function renderBoard() {
    mat.innerHTML = board.map(cardHTML).join('');
  }

  function readerText(p, upto) {
    // the upper verse, revealed up to `upto` syllables (spaces are free)
    const chars = [...p.u];
    let shown = 0;
    const k = p.k.length;
    let html = '';
    for (const c of chars) {
      if (c === ' ') { if (shown < upto) html += ' '; continue; }
      if (shown >= upto) break;
      const cls = shown < k ? 'kr-k' : '';
      html += cls ? `<b class="${cls}">${c}</b>` : c;
      shown += 1;
    }
    return html;
  }

  function nextRound() {
    clearInterval(timer);
    if (round >= ROUNDS) return finish();
    round += 1;
    roundEl.textContent = String(round);
    target = board[Math.floor(Math.random() * board.length)];
    const total = [...target.u.replace(/ /g, '')].length;
    const stopAt = hard.checked ? target.k.length : total;
    let n = 0;
    upper.innerHTML = '';
    locked = false;
    t0 = performance.now();
    const step = () => {
      n += 1;
      upper.innerHTML = readerText(target, Math.min(n, stopAt));
      if (n >= stopAt) clearInterval(timer);
    };
    step();
    timer = setInterval(step, reduceMotion.matches ? 380 : 300);
  }

  function take(btn) {
    if (locked || !target) return;
    const n = Number(btn.dataset.n);
    if (n !== target.n) {
      btn.classList.remove('miss');
      void btn.offsetWidth;
      btn.classList.add('miss');
      t0 -= 2000; // a fault costs two seconds
      return;
    }
    locked = true;
    clearInterval(timer);
    const dt = (performance.now() - t0) / 1000;
    times.push(dt);
    score += 1;
    scoreEl.textContent = String(score);
    upper.innerHTML = `${readerText(target, 99)} <span class="kr-done">Poem <a href="#poem-${target.n}">${target.n}</a>, ${target.p}. ${dt.toFixed(1)} s</span>`;
    btn.classList.add('taken');
    setTimeout(() => {
      const i = board.indexOf(target);
      const next = deck.pop();
      if (next) board[i] = next; else board.splice(i, 1);
      renderBoard();
      nextRound();
    }, reduceMotion.matches ? 600 : 1100);
  }

  function finish() {
    locked = true;
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    upper.innerHTML = `<span class="kr-done">Game over: ${score} of ${ROUNDS} cards, ${avg.toFixed(1)} seconds a card on average.</span>`;
    timeEl.textContent = '';
    startBtn.textContent = 'Play again';
    startBtn.disabled = false;
  }

  function start() {
    deck = shuffle([...poems]);
    board = deck.splice(-BOARD);
    round = 0;
    score = 0;
    times = [];
    scoreEl.textContent = '0';
    roundEl.textContent = '0';
    renderBoard();
    startBtn.disabled = true;
    startBtn.textContent = 'Playing';
    setTimeout(nextRound, 500);
  }

  mat.addEventListener('click', (e) => {
    const b = e.target.closest('.kr-card');
    if (b) take(b);
  });
  startBtn.addEventListener('click', start);

  // at rest: a sample of cards so the mat is not empty
  board = shuffle([...poems]).slice(0, BOARD);
  renderBoard();
  roundEl.textContent = String(ROUNDS);
}
