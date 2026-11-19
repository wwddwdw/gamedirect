/* TOEIC 900+ 단어 마스터 — 순수 JS 단일 페이지 앱 (localStorage 기반) */
(function () {
  'use strict';

  // ---------- 데이터 준비 ----------
  const CATS = window.WORD_DATA;
  const CAT_KEYS = Object.keys(CATS);
  const WORDS = [];              // {id, cat, w, p, k, syn, ex, lv}
  CAT_KEYS.forEach(cat => {
    CATS[cat].words.forEach((a, i) => {
      WORDS.push({ id: cat + ':' + i, cat, w: a[0], p: a[1], k: a[2], syn: a[3], ex: a[4], lv: a[5] });
    });
  });
  const BY_ID = Object.fromEntries(WORDS.map(w => [w.id, w]));

  // 커리큘럼: 레벨 → 카테고리 순으로 정렬해 하루 50단어씩 Day 구성 (기초부터 고급으로)
  const DAY_SIZE = 50;
  const ordered = [...WORDS].sort((a, b) => a.lv - b.lv || CAT_KEYS.indexOf(a.cat) - CAT_KEYS.indexOf(b.cat));
  const DAYS = [];
  for (let i = 0; i < ordered.length; i += DAY_SIZE) DAYS.push(ordered.slice(i, i + DAY_SIZE).map(w => w.id));

  // ---------- 저장 상태 ----------
  const KEY = 'toeic900_v1';
  const INTERVALS = [0, 1, 3, 7, 14, 30, 60]; // box별 복습 간격(일). box 5 이상 = 마스터
  const MASTER_BOX = 5;
  let S = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(defaults(), JSON.parse(raw));
    } catch (e) { /* 사생활 모드 등 */ }
    return defaults();
  }
  function defaults() {
    return { cards: {}, starred: {}, log: {}, goal: 50, streak: 0, lastStudy: null, quizHistory: [], settings: { autoSpeak: false, quizCount: 10 } };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

  const today = () => new Date().toISOString().slice(0, 10);
  const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }

  function card(id) { return S.cards[id] || { box: 0, due: null, seen: 0, ok: 0, ng: 0 }; }
  function touchLog(field, n = 1) {
    const t = today(); S.log[t] = S.log[t] || { studied: 0, correct: 0, wrong: 0 };
    S.log[t][field] += n;
    if (S.lastStudy !== t) {
      S.streak = (S.lastStudy && dayDiff(S.lastStudy, t) === 1) ? S.streak + 1 : 1;
      S.lastStudy = t;
    }
  }
  function grade(id, correct) {
    const c = card(id); c.seen++;
    if (correct) { c.ok++; c.box = Math.min(c.box + 1, INTERVALS.length - 1); }
    else { c.ng++; c.box = Math.max(0, c.box - 2); }
    c.due = addDays(today(), INTERVALS[c.box]);
    S.cards[id] = c;
    touchLog('studied'); touchLog(correct ? 'correct' : 'wrong');
    save();
  }
  const isMastered = id => card(id).box >= MASTER_BOX;
  const isLearned = id => card(id).seen > 0;
  const isDue = id => { const c = card(id); return c.seen > 0 && c.box < MASTER_BOX && c.due && c.due <= today(); };
  const isWeak = id => { const c = card(id); return c.ng >= 2 && c.box < 3; };

  // ---------- 유틸 ----------
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sample = (a, n) => shuffle(a).slice(0, n);
  const LV = { 1: '기초 700', 2: '중급 800', 3: '고급 900+' };
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800); }
  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 0.95;
    speechSynthesis.speak(u);
  }
  // 예문에서 단어를 굵게/빈칸으로 표시 (굴절형 대응: 어간 앞 5글자 이상 매칭)
  function stem(w) { const base = w.split(/[ /(]/)[0].toLowerCase().replace(/[^a-z-]/g, ''); return base.length > 5 ? base.slice(0, Math.max(5, base.length - 2)) : base; }
  function wordRegex(w) {
    const first = w.toLowerCase().split(/[ /(]/)[0].replace(/[^a-z-]/g, '');
    if (w.includes(' ')) { // 구동사/숙어: 각 토큰 어간 기준
      const parts = w.toLowerCase().split(' ').filter(p => /[a-z]/.test(p)).map(p => stem(p));
      return new RegExp('\\b' + parts.map(p => esc(p).replace(/-/g, '\\-') + '[a-z]*').join('\\s+(?:[a-z]+\\s+)?') + '\\b', 'i');
    }
    return new RegExp('\\b' + stem(first).replace(/-/g, '\\-') + '[a-z]*\\b', 'i');
  }
  function markExample(w, mode) { // mode: 'bold' | 'blank'
    const re = wordRegex(w.w); const m = w.ex.match(re);
    if (!m) return esc(w.ex);
    const rep = mode === 'blank' ? '<span class="blank">______</span>' : '<b>' + esc(m[0]) + '</b>';
    return esc(w.ex.slice(0, m.index)) + rep + esc(w.ex.slice(m.index + m[0].length));
  }
  function levelBadge(lv) { return `<span class="badge lv${lv}">${LV[lv]}</span>`; }
  function speakBtn(text) { return `<button class="speak" data-speak="${esc(text)}" title="발음 듣기">🔊 발음</button>`; }

  // ---------- 라우터 ----------
  let keyHandler = null;
  const app = $('#app');
  const routes = { '': home, study: study, quiz: quiz, words: words, stats: stats, day: dayView, cat: catView };
  function route() {
    keyHandler = null;
    const hash = location.hash.replace(/^#\/?/, '');
    const [name, ...rest] = hash.split('/');
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === (name || 'home') || (name === 'day' && a.dataset.route === 'home') || (name === 'cat' && a.dataset.route === 'words')));
    (routes[name] || home)(rest);
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  function render(html) { app.innerHTML = html; }

  // ---------- 홈 ----------
  function home() {
    const learned = WORDS.filter(w => isLearned(w.id)).length;
    const mastered = WORDS.filter(w => isMastered(w.id)).length;
    const due = WORDS.filter(w => isDue(w.id)).length;
    const todayLog = S.log[today()] || { studied: 0, correct: 0, wrong: 0 };
    const goalPct = Math.min(100, Math.round(todayLog.studied / S.goal * 100));
    const nextDay = DAYS.findIndex(ids => ids.some(id => !isLearned(id)));
    const readiness = readinessScore();
    render(`
      <div class="hero mb">
        <h1>토익 900점, 단어로 시작하세요</h1>
        <p class="muted">빈출 어휘 ${WORDS.length.toLocaleString()}개를 ${DAYS.length}일 커리큘럼과 간격 반복(SRS)으로 완성합니다.</p>
        <div class="row mt">
          ${due ? `<a class="btn btn-lg" href="#/study/due">🔁 복습 ${due}개</a>` : ''}
          <a class="btn btn-lg" href="#/day/${nextDay < 0 ? 0 : nextDay}">📚 Day ${nextDay < 0 ? DAYS.length : nextDay + 1} 학습</a>
          <a class="btn btn-lg" href="#/quiz">🎯 퀴즈</a>
        </div>
      </div>
      <div class="grid grid-4 mb">
        <div class="card stat"><div class="num">${todayLog.studied}</div><div class="lbl">오늘 학습 / 목표 ${S.goal}</div><div class="progress mt" style="margin-top:8px"><span style="width:${goalPct}%"></span></div></div>
        <div class="card stat"><div class="num">${S.streak}</div><div class="lbl">연속 학습일 🔥</div></div>
        <div class="card stat"><div class="num">${learned}</div><div class="lbl">학습한 단어</div></div>
        <div class="card stat"><div class="num" style="color:var(--success)">${mastered}</div><div class="lbl">마스터한 단어</div></div>
      </div>
      <div class="grid grid-2 mb">
        <div class="card">
          <h2>900점 준비도</h2>
          <div class="gauge">${gaugeSvg(readiness.score)}
            <div><p><b>${readiness.score}%</b> ${readiness.msg}</p>
              <p class="small muted">기초 ${readiness.lv[1]}% · 중급 ${readiness.lv[2]}% · 고급 ${readiness.lv[3]}%</p>
              <p class="small muted">레벨별 마스터 비율에 가중치(기초 30 · 중급 35 · 고급 35)를 둔 지표입니다.</p></div>
          </div>
        </div>
        <div class="card">
          <h2>오늘의 추천 학습</h2>
          <div class="stack">
            <a class="btn" href="#/study/due">🔁 복습 예정 단어 ${due}개</a>
            <a class="btn" href="#/study/weak">⚠️ 자주 틀리는 단어 ${WORDS.filter(w => isWeak(w.id)).length}개</a>
            <a class="btn" href="#/study/starred">⭐ 즐겨찾기 ${Object.keys(S.starred).length}개</a>
            <a class="btn" href="#/quiz/blank">✍️ 빈칸 채우기 퀴즈 (Part 5 대비)</a>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="row spread"><h2>${DAYS.length}일 커리큘럼</h2><span class="small muted">하루 ${DAY_SIZE}단어 · 기초 → 고급 순</span></div>
        <div class="day-grid mt">${DAYS.map((ids, i) => {
          const done = ids.filter(id => isLearned(id)).length; const pct = Math.round(done / ids.length * 100);
          return `<a class="day-tile ${pct === 100 ? 'done' : ''} ${i === nextDay ? 'today' : ''}" href="#/day/${i}"><div class="d">Day ${i + 1}</div><div class="c">${LV[BY_ID[ids[0]].lv].split(' ')[0]} · ${done}/${ids.length}</div><div class="mini"><span style="width:${pct}%"></span></div></a>`;
        }).join('')}</div>
      </div>`);
  }
  function readinessScore() {
    const lv = {};
    [1, 2, 3].forEach(l => { const ws = WORDS.filter(w => w.lv === l); lv[l] = Math.round(ws.filter(w => isMastered(w.id)).length / ws.length * 100); });
    const score = Math.round(lv[1] * 0.3 + lv[2] * 0.35 + lv[3] * 0.35);
    const msg = score >= 90 ? '900점 어휘 완성 단계입니다!' : score >= 70 ? '고득점 어휘가 안정되고 있습니다.' : score >= 40 ? '중급 어휘를 다지는 단계입니다.' : score > 0 ? '기초를 쌓는 단계입니다. 매일 꾸준히!' : '아직 시작 전입니다. Day 1부터 시작하세요.';
    return { score, lv, msg };
  }
  function gaugeSvg(pct) {
    const r = 48, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="12"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--primary)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 60 60)"/><text x="60" y="66" text-anchor="middle" font-size="22" font-weight="800" fill="var(--text)">${pct}%</text></svg>`;
  }

  // ---------- Day / 카테고리 상세 ----------
  function dayView([n]) {
    const i = Math.max(0, Math.min(DAYS.length - 1, parseInt(n, 10) || 0));
    const ids = DAYS[i];
    const done = ids.filter(id => isLearned(id)).length;
    render(`
      <div class="row spread mb"><h1>Day ${i + 1} <span class="muted small">${done}/${ids.length} 학습</span></h1>
        <div class="row">${i > 0 ? `<a class="btn btn-sm" href="#/day/${i - 1}">← Day ${i}</a>` : ''}${i < DAYS.length - 1 ? `<a class="btn btn-sm" href="#/day/${i + 1}">Day ${i + 2} →</a>` : ''}</div></div>
      <div class="row mb">
        <a class="btn btn-primary" href="#/study/day/${i}">🃏 플래시카드로 학습</a>
        <a class="btn" href="#/quiz/mixed/day/${i}">🎯 이 Day 퀴즈</a>
      </div>
      ${wordList(ids)}`);
  }
  function catView([k]) {
    const cat = CATS[k]; if (!cat) return home();
    const ids = WORDS.filter(w => w.cat === k).map(w => w.id);
    render(`
      <h1>${cat.icon} ${cat.name} <span class="muted small">${ids.length}단어</span></h1>
      <div class="row mb mt">
        <a class="btn btn-primary" href="#/study/cat/${k}">🃏 플래시카드</a>
        <a class="btn" href="#/quiz/mixed/cat/${k}">🎯 카테고리 퀴즈</a>
        <a class="btn btn-ghost" href="#/words">← 단어장</a>
      </div>
      ${wordList(ids)}`);
  }
  function wordList(ids) {
    if (!ids.length) return '<div class="empty">표시할 단어가 없습니다.</div>';
    return `<div class="wlist">${ids.map(id => {
      const w = BY_ID[id], c = card(id);
      const st = isMastered(id) ? '<span class="badge ok">마스터</span>' : isWeak(id) ? '<span class="badge bad">취약</span>' : c.seen ? `<span class="badge warn">학습중 ${c.box}/${MASTER_BOX}</span>` : '<span class="badge">미학습</span>';
      return `<div class="witem"><div class="head"><span class="w">${esc(w.w)}</span><span class="badge pos">${esc(w.p)}</span><span class="m">${esc(w.k)}</span>${levelBadge(w.lv)}${st}
        <button class="star ${S.starred[id] ? 'on' : ''}" data-star="${id}" title="즐겨찾기">★</button></div>
        <div class="small muted">≒ ${esc(w.syn)}</div>
        <div class="ex">${markExample(w, 'bold')} ${speakBtn(w.ex)}</div></div>`;
    }).join('')}</div>`;
  }

  // ---------- 플래시카드 학습 ----------
  function pickSet(args) {
    // args: [] | ['due'] | ['weak'] | ['starred'] | ['day', n] | ['cat', k] | ['new']
    const [mode, arg] = args;
    let ids;
    if (mode === 'due') ids = WORDS.filter(w => isDue(w.id)).map(w => w.id);
    else if (mode === 'weak') ids = WORDS.filter(w => isWeak(w.id)).map(w => w.id);
    else if (mode === 'starred') ids = Object.keys(S.starred).filter(id => BY_ID[id]);
    else if (mode === 'day') ids = DAYS[parseInt(arg, 10)] || [];
    else if (mode === 'cat') ids = WORDS.filter(w => w.cat === arg).map(w => w.id);
    else if (mode === 'new') ids = WORDS.filter(w => !isLearned(w.id)).map(w => w.id).slice(0, 30);
    else ids = null;
    const titles = { due: '복습 예정 단어', weak: '자주 틀리는 단어', starred: '즐겨찾기', day: `Day ${parseInt(arg, 10) + 1}`, cat: CATS[arg] ? CATS[arg].icon + ' ' + CATS[arg].name : '', new: '새 단어 30개' };
    return { ids, title: titles[mode] || '' };
  }
  function study(args) {
    const set = pickSet(args);
    if (!set.ids) return studyMenu();
    if (!set.ids.length) return render(`<div class="empty"><h2>${esc(set.title)}</h2><p>학습할 단어가 없습니다.</p><a class="btn btn-primary mt" href="#/study">다른 학습 선택</a></div>`);
    runFlash(shuffle(set.ids), set.title);
  }
  function studyMenu() {
    const due = WORDS.filter(w => isDue(w.id)).length, weak = WORDS.filter(w => isWeak(w.id)).length, fresh = WORDS.filter(w => !isLearned(w.id)).length;
    render(`
      <h1>플래시카드 학습</h1>
      <p class="muted">카드를 뒤집어 뜻을 확인하고, 아는 단어는 <b>알아요</b>, 모르는 단어는 <b>몰라요</b>를 누르세요. 간격 반복(SRS)이 복습 시점을 자동으로 잡아 줍니다.</p>
      <div class="grid grid-3 mt mb">
        <a class="card cat-tile" href="#/study/due"><span class="ic">🔁</span><div><div class="nm">복습 예정</div><div class="ct">${due}개</div></div></a>
        <a class="card cat-tile" href="#/study/new"><span class="ic">🆕</span><div><div class="nm">새 단어 30개</div><div class="ct">미학습 ${fresh}개 중</div></div></a>
        <a class="card cat-tile" href="#/study/weak"><span class="ic">⚠️</span><div><div class="nm">취약 단어</div><div class="ct">${weak}개</div></div></a>
        <a class="card cat-tile" href="#/study/starred"><span class="ic">⭐</span><div><div class="nm">즐겨찾기</div><div class="ct">${Object.keys(S.starred).length}개</div></div></a>
      </div>
      <h2>카테고리별 학습</h2>
      <div class="grid grid-3 mt">${catTiles('study')}</div>`);
  }
  function catTiles(target) {
    return CAT_KEYS.map(k => {
      const ws = WORDS.filter(w => w.cat === k); const m = ws.filter(w => isMastered(w.id)).length;
      const href = target === 'study' ? `#/study/cat/${k}` : target === 'quiz' ? `#/quiz/mixed/cat/${k}` : `#/cat/${k}`;
      return `<a class="cat-tile" href="${href}"><span class="ic">${CATS[k].icon}</span><div style="flex:1"><div class="nm">${CATS[k].name}</div><div class="ct">${ws.length}단어 · 마스터 ${m}</div><div class="progress success"><span style="width:${Math.round(m / ws.length * 100)}%"></span></div></div></a>`;
    }).join('');
  }
  function runFlash(queue, title) {
    let idx = 0, ok = 0, ng = 0, flipped = false; const total = queue.length; const again = [];
    function draw() {
      if (idx >= queue.length) {
        if (again.length) { queue = shuffle(again.splice(0)); idx = 0; toast('틀린 단어를 다시 복습합니다'); }
        else return finish();
      }
      const w = BY_ID[queue[idx]]; flipped = false;
      render(`
        <div class="flash-wrap">
          <div class="row spread mb"><h2>${esc(title)}</h2><span class="muted">${Math.min(idx + 1, total)} / ${total}</span></div>
          <div class="progress mb"><span style="width:${Math.round((ok + ng) / total * 100)}%"></span></div>
          <div class="flash" id="flash">
            <div class="flash-inner">
              <div class="face front">${levelBadge(w.lv)}<div class="word">${esc(w.w)}</div><div class="pos">${esc(w.p)}</div>${speakBtn(w.w)}<div class="flash-hint">카드를 클릭하거나 <kbd>Space</kbd>로 뒤집기</div></div>
              <div class="face back"><div class="word" style="font-size:1.5rem">${esc(w.w)} <span class="pos">${esc(w.p)}</span></div><div class="meaning">${esc(w.k)}</div><div class="syn">≒ ${esc(w.syn)}</div><div class="ex">${markExample(w, 'bold')}</div>${speakBtn(w.ex)}</div>
            </div>
          </div>
          <div class="flash-actions">
            <button class="btn btn-danger" id="ng">✗ 몰라요 <kbd>1</kbd></button>
            <button class="btn btn-success" id="ok">✓ 알아요 <kbd>2</kbd></button>
          </div>
          <div class="row spread mt"><button class="btn btn-sm star-toggle ${S.starred[w.id] ? 'on' : ''}" data-star="${w.id}">${S.starred[w.id] ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기'}</button><a class="btn btn-sm btn-ghost" href="#/study">종료</a></div>
        </div>`);
      if (S.settings.autoSpeak) speak(w.w);
      $('#flash').onclick = e => { if (e.target.closest('[data-speak]')) return; flip(); };
      $('#ok').onclick = () => answer(true); $('#ng').onclick = () => answer(false);
    }
    function flip() { flipped = !flipped; $('#flash').classList.toggle('flipped', flipped); }
    function answer(correct) {
      const id = queue[idx]; grade(id, correct);
      if (correct) ok++; else { ng++; again.push(id); }
      idx++; draw();
    }
    function finish() {
      const pct = Math.round(ok / Math.max(1, ok + ng) * 100);
      render(`<div class="card" style="max-width:520px;margin:0 auto;text-align:center">
        <h2>${esc(title)} 완료!</h2><div class="result-big">${pct}%</div>
        <p class="muted">알아요 ${ok} · 몰라요 ${ng} (틀린 단어는 재복습 완료)</p>
        <div class="row mt" style="justify-content:center"><a class="btn btn-primary" href="#/study">학습 메뉴</a><a class="btn" href="#/quiz">퀴즈로 확인</a><a class="btn btn-ghost" href="#/">홈</a></div></div>`);
      keyHandler = null;
    }
    keyHandler = e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); flip(); }
      else if (e.key === '1' || e.key === 'ArrowLeft') answer(false);
      else if (e.key === '2' || e.key === 'ArrowRight') answer(true);
    };
    draw();
  }
  document.addEventListener('keydown', e => { if (keyHandler) keyHandler(e); });

  // ---------- 퀴즈 ----------
  const QUIZ_TYPES = {
    e2k: { name: '영→한 뜻 고르기', desc: '영어 단어를 보고 알맞은 뜻 선택', icon: '🇬🇧' },
    k2e: { name: '한→영 단어 고르기', desc: '뜻을 보고 알맞은 영어 단어 선택', icon: '🇰🇷' },
    syn: { name: '동의어 고르기', desc: 'Part 7 동의어 문제 대비', icon: '🔄' },
    blank: { name: '빈칸 채우기', desc: '예문의 빈칸에 알맞은 단어 선택 (Part 5 대비)', icon: '✍️' },
    spell: { name: '스펠링 타이핑', desc: '뜻을 보고 단어를 직접 입력', icon: '⌨️' },
    mixed: { name: '혼합 모드', desc: '모든 유형이 무작위로 출제', icon: '🎲' },
  };
  function quiz(args) {
    const [type, scope, arg] = args;
    if (!QUIZ_TYPES[type]) return quizMenu();
    let pool;
    if (scope === 'day') pool = DAYS[parseInt(arg, 10)] || [];
    else if (scope === 'cat') pool = WORDS.filter(w => w.cat === arg).map(w => w.id);
    else if (scope === 'lv') pool = WORDS.filter(w => w.lv === parseInt(arg, 10)).map(w => w.id);
    else if (scope === 'learned') pool = WORDS.filter(w => isLearned(w.id)).map(w => w.id);
    else if (scope === 'weak') pool = WORDS.filter(w => isWeak(w.id) || isDue(w.id)).map(w => w.id);
    else pool = WORDS.map(w => w.id);
    if (pool.length < 4) return render(`<div class="empty"><p>퀴즈를 만들기에 단어가 부족합니다 (최소 4개).</p><a class="btn btn-primary" href="#/quiz">퀴즈 메뉴</a></div>`);
    const n = Math.min(S.settings.quizCount, pool.length);
    const qs = sample(pool, n).map(id => makeQuestion(id, type === 'mixed' ? sample(Object.keys(QUIZ_TYPES).filter(t => t !== 'mixed'), 1)[0] : type, pool));
    runQuiz(qs, QUIZ_TYPES[type].name);
  }
  function quizMenu() {
    render(`
      <h1>퀴즈</h1>
      <p class="muted">유형과 범위를 선택하세요. 틀린 문제는 자동으로 복습 큐에 들어갑니다.</p>
      <div class="card mb mt">
        <div class="row">
          <label>문항 수
            <select id="qCount">${[10, 20, 30, 50].map(n => `<option ${S.settings.quizCount === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>범위
            <select id="qScope">
              <option value="all">전체 단어</option>
              <option value="learned">학습한 단어만</option>
              <option value="weak">복습 예정·취약 단어</option>
              <option value="lv/1">기초 700</option><option value="lv/2">중급 800</option><option value="lv/3">고급 900+</option>
              ${CAT_KEYS.map(k => `<option value="cat/${k}">${CATS[k].icon} ${CATS[k].name}</option>`).join('')}
              ${DAYS.map((_, i) => `<option value="day/${i}">Day ${i + 1}</option>`).join('')}
            </select></label>
        </div>
      </div>
      <div class="grid grid-3">${Object.entries(QUIZ_TYPES).map(([k, t]) => `<button class="cat-tile" data-quiz="${k}"><span class="ic">${t.icon}</span><div><div class="nm">${t.name}</div><div class="ct">${t.desc}</div></div></button>`).join('')}</div>`);
    $('#qCount').onchange = e => { S.settings.quizCount = parseInt(e.target.value, 10); save(); };
    document.querySelectorAll('[data-quiz]').forEach(b => b.onclick = () => {
      const scope = $('#qScope').value; location.hash = `#/quiz/${b.dataset.quiz}/${scope === 'all' ? '' : scope}`;
    });
  }
  function distractors(w, pool, field, n = 3) {
    // 같은 품사·레벨 우선, 부족하면 전체에서 보충. 정답과 같은 값은 제외
    const same = pool.map(id => BY_ID[id]).filter(x => x.id !== w.id && x[field] !== w[field] && x.p === w.p);
    let picks = sample(same, n);
    if (picks.length < n) {
      const rest = WORDS.filter(x => x.id !== w.id && x[field] !== w[field] && !picks.includes(x));
      picks = picks.concat(sample(rest.filter(x => x.p === w.p), n - picks.length));
      if (picks.length < n) picks = picks.concat(sample(rest.filter(x => !picks.includes(x)), n - picks.length));
    }
    return picks;
  }
  function makeQuestion(id, type, pool) {
    const w = BY_ID[id];
    if (type === 'e2k') return { type, w, prompt: `<div class="q-prompt">${esc(w.w)} <span class="badge pos">${esc(w.p)}</span></div>`, answer: w.k, choices: shuffle([w.k, ...distractors(w, pool, 'k').map(x => x.k)]), speakText: w.w };
    if (type === 'k2e') return { type, w, prompt: `<div class="q-prompt">${esc(w.k)} <span class="badge pos">${esc(w.p)}</span></div>`, answer: w.w, choices: shuffle([w.w, ...distractors(w, pool, 'w').map(x => x.w)]) };
    if (type === 'syn') {
      const synFirst = w.syn.split(/[,;]/)[0].trim();
      return { type, w, prompt: `<div class="q-prompt"><span class="small muted" style="display:block;font-weight:500">다음 단어와 의미가 가장 가까운 것은?</span>${esc(w.w)}</div>`, answer: synFirst, choices: shuffle([synFirst, ...distractors(w, pool, 'syn').map(x => x.syn.split(/[,;]/)[0].trim())]) };
    }
    if (type === 'blank') {
      const re = wordRegex(w.w);
      if (!re.test(w.ex)) return makeQuestion(id, 'e2k', pool);
      return { type, w, prompt: `<div class="q-prompt sentence">${markExample(w, 'blank')}</div><p class="muted small" style="text-align:center">힌트: ${esc(w.k)}</p>`, answer: w.w, choices: shuffle([w.w, ...distractors(w, pool, 'w').map(x => x.w)]) };
    }
    if (type === 'spell') return { type, w, prompt: `<div class="q-prompt">${esc(w.k)} <span class="badge pos">${esc(w.p)}</span></div><p class="muted small" style="text-align:center">≒ ${esc(w.syn)} · ${w.w.length}글자${w.w.includes(' ') ? ' (띄어쓰기 포함)' : ''}</p>`, answer: w.w, typing: true };
    return makeQuestion(id, 'e2k', pool);
  }
  function runQuiz(qs, title) {
    let i = 0, score = 0; const wrongs = [];
    function draw() {
      if (i >= qs.length) return finish();
      const q = qs[i];
      render(`
        <div class="flash-wrap">
          <div class="row spread mb"><h2>${esc(title)}</h2><span class="muted">${i + 1} / ${qs.length}</span></div>
          <div class="progress mb"><span style="width:${Math.round(i / qs.length * 100)}%"></span></div>
          <div class="card">
            ${q.prompt}
            ${q.speakText ? `<div style="text-align:center">${speakBtn(q.speakText)}</div>` : ''}
            ${q.typing ? `<form class="typing mt" id="typeForm"><input id="typeIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="영어 단어 입력 후 Enter"><button class="btn btn-primary">확인</button></form>`
              : `<div class="choices mt">${q.choices.map((c, k) => `<button class="choice" data-c="${esc(c)}"><span class="k">${k + 1}</span><span>${esc(c)}</span></button>`).join('')}</div>`}
            <div id="explain"></div>
          </div>
          <div class="row spread mt"><span class="small muted">${q.typing ? '' : '키보드 <kbd>1</kbd>~<kbd>4</kbd> 로 선택'}</span><a class="btn btn-sm btn-ghost" href="#/quiz">종료</a></div>
        </div>`);
      if (q.typing) { const inp = $('#typeIn'); inp.focus(); $('#typeForm').onsubmit = e => { e.preventDefault(); check(inp.value.trim()); }; }
      else document.querySelectorAll('.choice').forEach(b => b.onclick = () => check(b.dataset.c));
    }
    function norm(s) { return s.toLowerCase().replace(/[^a-z]/g, ''); }
    function check(ans) {
      const q = qs[i]; if (q.done) return; q.done = true;
      const correct = norm(ans) === norm(q.answer);
      grade(q.w.id, correct);
      if (correct) score++; else wrongs.push(q.w.id);
      document.querySelectorAll('.choice').forEach(b => { b.disabled = true; if (b.dataset.c === q.answer) b.classList.add('correct'); else if (b.dataset.c === ans && !correct) b.classList.add('wrong'); });
      if (q.typing) { const inp = $('#typeIn'); inp.disabled = true; inp.style.borderColor = correct ? 'var(--success)' : 'var(--danger)'; }
      $('#explain').innerHTML = `<div class="explain"><b style="color:${correct ? 'var(--success)' : 'var(--danger)'}">${correct ? '정답! 🎉' : '오답 ✗ 정답: ' + esc(q.answer)}</b>
        <div><b>${esc(q.w.w)}</b> <span class="badge pos">${esc(q.w.p)}</span> ${esc(q.w.k)} <span class="muted">≒ ${esc(q.w.syn)}</span></div>
        <div class="ex">${markExample(q.w, 'bold')}</div>
        <div class="row mt">${speakBtn(q.w.w)}<button class="btn btn-primary" id="next" style="margin-left:auto">${i + 1 < qs.length ? '다음 →' : '결과 보기'} <kbd>Enter</kbd></button></div></div>`;
      $('#next').onclick = () => { i++; draw(); }; $('#next').focus();
    }
    function finish() {
      const pct = Math.round(score / qs.length * 100);
      S.quizHistory.unshift({ d: today(), t: title, s: score, n: qs.length }); S.quizHistory = S.quizHistory.slice(0, 50); save();
      render(`<div class="card" style="max-width:600px;margin:0 auto">
        <h2 style="text-align:center">${esc(title)} 결과</h2><div class="result-big">${pct}점</div>
        <p class="muted" style="text-align:center">${qs.length}문제 중 ${score}개 정답${pct >= 90 ? ' · 훌륭합니다!' : pct >= 70 ? ' · 좋아요, 틀린 단어만 다시 보세요.' : ' · 틀린 단어를 플래시카드로 복습하세요.'}</p>
        ${wrongs.length ? `<h3 class="mt">틀린 단어</h3>${wordList(wrongs)}` : ''}
        <div class="row mt" style="justify-content:center"><a class="btn btn-primary" href="#/quiz">다른 퀴즈</a>${wrongs.length ? `<a class="btn" href="#/study/weak">취약 단어 복습</a>` : ''}<a class="btn btn-ghost" href="#/">홈</a></div></div>`);
      keyHandler = null;
    }
    keyHandler = e => {
      const q = qs[i]; if (!q) return;
      if (q.done && e.key === 'Enter') { e.preventDefault(); $('#next') && $('#next').click(); return; }
      if (!q.typing && !q.done && /^[1-4]$/.test(e.key)) { const b = document.querySelectorAll('.choice')[parseInt(e.key, 10) - 1]; b && b.click(); }
    };
    draw();
  }

  // ---------- 단어장 ----------
  let wf = { q: '', cat: '', lv: '', st: '' };
  function words() {
    render(`
      <h1>단어장 <span class="muted small">${WORDS.length.toLocaleString()}개</span></h1>
      <div class="grid grid-3 mt mb">${catTiles('cat')}</div>
      <div class="card">
        <div class="filters">
          <input id="fq" placeholder="단어·뜻·동의어 검색" value="${esc(wf.q)}">
          <select id="fcat"><option value="">모든 카테고리</option>${CAT_KEYS.map(k => `<option value="${k}" ${wf.cat === k ? 'selected' : ''}>${CATS[k].name}</option>`).join('')}</select>
          <select id="flv"><option value="">모든 레벨</option>${[1, 2, 3].map(l => `<option value="${l}" ${wf.lv == l ? 'selected' : ''}>${LV[l]}</option>`).join('')}</select>
          <select id="fst"><option value="">모든 상태</option><option value="new" ${wf.st === 'new' ? 'selected' : ''}>미학습</option><option value="learning" ${wf.st === 'learning' ? 'selected' : ''}>학습중</option><option value="weak" ${wf.st === 'weak' ? 'selected' : ''}>취약</option><option value="mastered" ${wf.st === 'mastered' ? 'selected' : ''}>마스터</option><option value="starred" ${wf.st === 'starred' ? 'selected' : ''}>즐겨찾기</option></select>
        </div>
        <div id="wres" class="mt"></div>
      </div>`);
    const upd = () => { wf = { q: $('#fq').value.trim().toLowerCase(), cat: $('#fcat').value, lv: $('#flv').value, st: $('#fst').value }; drawList(); };
    ['fq', 'fcat', 'flv', 'fst'].forEach(id => $('#' + id).oninput = upd);
    drawList();
    function drawList() {
      let list = WORDS.filter(w => (!wf.cat || w.cat === wf.cat) && (!wf.lv || w.lv == wf.lv) && (!wf.q || w.w.toLowerCase().includes(wf.q) || w.k.includes(wf.q) || w.syn.toLowerCase().includes(wf.q)));
      if (wf.st === 'new') list = list.filter(w => !isLearned(w.id));
      else if (wf.st === 'learning') list = list.filter(w => isLearned(w.id) && !isMastered(w.id));
      else if (wf.st === 'weak') list = list.filter(w => isWeak(w.id));
      else if (wf.st === 'mastered') list = list.filter(w => isMastered(w.id));
      else if (wf.st === 'starred') list = list.filter(w => S.starred[w.id]);
      const shown = list.slice(0, 200);
      $('#wres').innerHTML = `<p class="small muted">${list.length}개 결과${list.length > 200 ? ' (상위 200개 표시)' : ''}</p>${wordList(shown.map(w => w.id))}`;
    }
  }

  // ---------- 통계 ----------
  function stats() {
    const boxes = Array.from({ length: INTERVALS.length }, () => 0); let seenAny = 0;
    WORDS.forEach(w => { const c = card(w.id); if (c.seen) { seenAny++; boxes[c.box]++; } });
    const unseen = WORDS.length - seenAny;
    const days = Array.from({ length: 42 }, (_, i) => addDays(today(), i - 41));
    const totalCorrect = Object.values(S.log).reduce((a, l) => a + l.correct, 0), totalWrong = Object.values(S.log).reduce((a, l) => a + l.wrong, 0);
    const r = readinessScore();
    const upcoming = [0, 1, 2, 3, 4, 5, 6].map(d => { const dt = addDays(today(), d); return WORDS.filter(w => { const c = card(w.id); return c.seen && c.box < MASTER_BOX && c.due && (d === 0 ? c.due <= dt : c.due === dt); }).length; });
    render(`
      <h1>학습 통계</h1>
      <div class="grid grid-4 mt mb">
        <div class="card stat"><div class="num">${seenAny}</div><div class="lbl">학습한 단어</div></div>
        <div class="card stat"><div class="num" style="color:var(--success)">${boxes.slice(MASTER_BOX).reduce((a, b) => a + b, 0)}</div><div class="lbl">마스터</div></div>
        <div class="card stat"><div class="num">${totalCorrect + totalWrong ? Math.round(totalCorrect / (totalCorrect + totalWrong) * 100) : 0}%</div><div class="lbl">누적 정답률</div></div>
        <div class="card stat"><div class="num">${S.streak}</div><div class="lbl">연속 학습일</div></div>
      </div>
      <div class="grid grid-2 mb">
        <div class="card"><h2>900점 준비도</h2><div class="gauge">${gaugeSvg(r.score)}<div><p>${r.msg}</p>
          ${[1, 2, 3].map(l => `<div class="small muted">${LV[l]} <b>${r.lv[l]}%</b></div><div class="progress success" style="margin:2px 0 6px"><span style="width:${r.lv[l]}%"></span></div>`).join('')}</div></div></div>
        <div class="card"><h2>학습 단계 분포</h2><p class="small muted">단계가 높을수록 복습 간격이 길어집니다 (5단계 이상 마스터).</p>
          <div class="hbars">${['미학습', ...INTERVALS.map((_, i) => i + '단계')].map((lbl, i) => { const v = i === 0 ? unseen : boxes[i - 1]; const max = Math.max(1, unseen, ...boxes); return `<span class="lbl">${lbl}</span><div class="progress ${i > MASTER_BOX ? 'success' : ''}"><span style="width:${Math.round(v / max * 100)}%;${i === 0 ? 'background:var(--border)' : ''}"></span></div><span class="n">${v}</span>`; }).join('')}</div></div>
      </div>
      <div class="grid grid-2 mb">
        <div class="card"><h2>최근 6주 학습 기록</h2>
          <div class="heat">${days.map(d => { const l = S.log[d]; const n = l ? l.studied : 0; return `<div class="${n >= 60 ? 'h3' : n >= 25 ? 'h2' : n > 0 ? 'h1' : ''}" title="${d}: ${n}개"></div>`; }).join('')}</div>
          <p class="small muted mt">오늘까지 총 ${Object.values(S.log).reduce((a, l) => a + l.studied, 0).toLocaleString()}회 학습</p></div>
        <div class="card"><h2>복습 예정</h2>
          <table class="table"><tr><th>날짜</th><th>단어 수</th></tr>${upcoming.map((n, d) => `<tr><td>${d === 0 ? '오늘 (누적)' : d === 1 ? '내일' : addDays(today(), d)}</td><td>${n}</td></tr>`).join('')}</table></div>
      </div>
      <div class="card mb"><h2>최근 퀴즈</h2>${S.quizHistory.length ? `<table class="table"><tr><th>날짜</th><th>유형</th><th>점수</th></tr>${S.quizHistory.slice(0, 10).map(h => `<tr><td>${h.d}</td><td>${esc(h.t)}</td><td>${h.s}/${h.n} (${Math.round(h.s / h.n * 100)}%)</td></tr>`).join('')}</table>` : '<p class="muted">아직 퀴즈 기록이 없습니다.</p>'}</div>
      <div class="card"><h2>설정 · 데이터</h2>
        <div class="row mb"><label>일일 목표 <select id="goal">${[20, 30, 50, 80, 100].map(n => `<option ${S.goal === n ? 'selected' : ''}>${n}</option>`).join('')}</select> 단어</label>
          <label><input type="checkbox" id="autoSpeak" ${S.settings.autoSpeak ? 'checked' : ''}> 플래시카드 자동 발음</label></div>
        <div class="row"><button class="btn" id="export">⬇ 학습 기록 백업(JSON)</button><label class="btn">⬆ 복원 <input type="file" id="import" accept="application/json" hidden></label><button class="btn btn-danger" id="reset">전체 초기화</button></div>
      </div>`);
    $('#goal').onchange = e => { S.goal = parseInt(e.target.value, 10); save(); toast('목표가 저장되었습니다'); };
    $('#autoSpeak').onchange = e => { S.settings.autoSpeak = e.target.checked; save(); };
    $('#export').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })); a.download = `toeic900-backup-${today()}.json`; a.click(); };
    $('#import').onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { const d = JSON.parse(rd.result); if (!d.cards) throw 0; S = Object.assign(defaults(), d); save(); toast('복원되었습니다'); stats(); } catch (_) { toast('올바른 백업 파일이 아닙니다'); } }; rd.readAsText(f); };
    $('#reset').onclick = () => { if (confirm('모든 학습 기록을 삭제할까요? 되돌릴 수 없습니다.')) { S = defaults(); save(); toast('초기화되었습니다'); stats(); } };
  }

  // ---------- 전역 이벤트 (즐겨찾기, 발음) ----------
  document.addEventListener('click', e => {
    const sp = e.target.closest('[data-speak]'); if (sp) { e.stopPropagation(); speak(sp.dataset.speak); return; }
    const st = e.target.closest('[data-star]'); if (st) {
      const id = st.dataset.star; if (S.starred[id]) delete S.starred[id]; else S.starred[id] = 1; save();
      st.classList.toggle('on', !!S.starred[id]);
      if (st.classList.contains('star-toggle')) st.textContent = S.starred[id] ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기';
      toast(S.starred[id] ? '즐겨찾기에 추가' : '즐겨찾기 해제');
    }
  });

  // ---------- 테마 ----------
  const themeKey = 'toeic900_theme';
  function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
  try { applyTheme(localStorage.getItem(themeKey)); } catch (e) { /* ignore */ }
  $('#themeToggle').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark'; applyTheme(next);
    try { localStorage.setItem(themeKey, next); } catch (e) { /* ignore */ }
  };

  route();
})();
