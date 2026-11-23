/* TOEIC · SQLD · ADsP 마스터 — 순수 JS 단일 페이지 앱 (localStorage 기반)
   과정마다 데이터와 학습 기록을 따로 가진다. */
(function () {
  'use strict';

  // ---------- 과정(시험) 정의 ----------
  const CERT_MSGS = ['시험 범위의 용어를 거의 마스터했습니다', '핵심 개념이 안정되고 있습니다', '핵심 개념을 다지는 단계입니다', '기본 개념을 쌓는 단계입니다', '레벨별 마스터 비율로 계산합니다. Day 1부터 시작하세요'];
  const COURSES = {
    toeic: { key: 'toeic', short: 'TOEIC', noun: '단어', book: '단어장', kind: 'word', store: 'toeic900_v1', cats: window.WORD_DATA,
      daySize: 50, newBatch: 30, order: 'level', orderLabel: '기초에서 고급 순', levels: { 1: '기초 700', 2: '중급 800', 3: '고급 900+' },
      goalLabel: '900점 준비도', goals: [20, 30, 50, 80, 100], goal: 50, tts: true, blankMeta: 'Part 5',
      msgs: ['900점 어휘가 완성 단계에 있습니다', '고득점 어휘가 안정되고 있습니다', '중급 어휘를 다지는 단계입니다', '기초를 쌓는 단계입니다', '레벨별 마스터 비율로 계산합니다. Day 1부터 시작하세요'] },
    sqld: { key: 'sqld', short: 'SQLD', noun: '용어', book: '용어집', kind: 'term', store: 'toeic900_v1_sqld', cats: window.SQLD_DATA,
      daySize: 15, newBatch: 15, order: 'subject', orderLabel: '과목 순', levels: { 1: '기본', 2: '핵심', 3: '심화' },
      goalLabel: '합격 준비도', goals: [10, 15, 20, 30, 50], goal: 20, tts: false, blankMeta: '시험 포인트', msgs: CERT_MSGS },
    adsp: { key: 'adsp', short: 'ADsP', noun: '용어', book: '용어집', kind: 'term', store: 'toeic900_v1_adsp', cats: window.ADSP_DATA,
      daySize: 15, newBatch: 15, order: 'subject', orderLabel: '과목 순', levels: { 1: '기본', 2: '핵심', 3: '심화' },
      goalLabel: '합격 준비도', goals: [10, 15, 20, 30, 50], goal: 20, tts: false, blankMeta: '시험 포인트', msgs: CERT_MSGS },
  };
  const COURSE_KEY = 'toeic900_course';

  // 현재 과정에 따라 바뀌는 값들
  let C, CATS, CAT_KEYS, WORDS, BY_ID, DAYS, DAY_SIZE, LV, N, S;
  function setCourse(key) {
    C = COURSES[key] && COURSES[key].cats ? COURSES[key] : COURSES.toeic;
    CATS = C.cats; CAT_KEYS = Object.keys(CATS); LV = C.levels; N = C.noun; DAY_SIZE = C.daySize;
    WORDS = [];              // {id, cat, w, p, k, syn, ex, lv}
    CAT_KEYS.forEach(cat => {
      CATS[cat].words.forEach((a, i) => {
        WORDS.push({ id: cat + ':' + i, cat, w: a[0], p: a[1], k: a[2], syn: a[3], ex: a[4], lv: a[5] });
      });
    });
    BY_ID = Object.fromEntries(WORDS.map(w => [w.id, w]));
    // 커리큘럼: TOEIC은 레벨 → 카테고리 순, 자격증은 과목 순서 그대로 Day 구성
    const ordered = C.order === 'level' ? [...WORDS].sort((a, b) => a.lv - b.lv || CAT_KEYS.indexOf(a.cat) - CAT_KEYS.indexOf(b.cat)) : WORDS;
    DAYS = [];
    for (let i = 0; i < ordered.length; i += DAY_SIZE) DAYS.push(ordered.slice(i, i + DAY_SIZE).map(w => w.id));
    S = load();
    wf = { q: '', cat: '', lv: '', st: '' };
    try { localStorage.setItem(COURSE_KEY, C.key); } catch (e) { /* ignore */ }
    document.body.dataset.kind = C.kind;
    document.title = `${C.short} ${N} 마스터`;
    document.getElementById('brandMark').textContent = C.short[0];
    document.getElementById('brandName').textContent = `${C.short} ${N} 마스터`;
    document.getElementById('navWords').textContent = C.book;
    document.getElementById('courseSeg').innerHTML = Object.values(COURSES).filter(c => c.cats).map(c => `<button type="button" data-course="${c.key}" class="${c.key === C.key ? 'on' : ''}" aria-pressed="${c.key === C.key}">${c.short}</button>`).join('');
  }
  let wf = { q: '', cat: '', lv: '', st: '' };

  // ---------- 저장 상태 ----------
  const INTERVALS = [0, 1, 3, 7, 14, 30, 60]; // box별 복습 간격(일). box 5 이상 = 마스터
  const MASTER_BOX = 5;
  function load() {
    try {
      const raw = localStorage.getItem(C.store);
      if (raw) return Object.assign(defaults(), JSON.parse(raw));
    } catch (e) { /* 사생활 모드 등 */ }
    return defaults();
  }
  function defaults() {
    return { cards: {}, starred: {}, log: {}, goal: C.goal, streak: 0, lastStudy: null, quizHistory: [], settings: { autoSpeak: false, quizCount: 10 } };
  }
  function save() { try { localStorage.setItem(C.store, JSON.stringify(S)); } catch (e) { /* ignore */ } }

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
  const ic = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#ic-${name}"/></svg>`;
  const CAT_ICON = { hr: 'briefcase', office: 'building', marketing: 'trending', finance: 'coins', legal: 'scale', logistics: 'package', travel: 'plane', facility: 'wrench', service: 'bag', media: 'megaphone', advanced: 'award', collocation: 'link' };
  const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  function todayLabel() { const d = new Date(); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${KO_DAYS[d.getDay()]}요일`; }
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
  function hasTerm(w) { return C.kind === 'term' ? w.ex.includes(w.w) : wordRegex(w.w).test(w.ex); }
  function markExample(w, mode) { // mode: 'bold' | 'blank'
    const wrap = t => mode === 'blank' ? '<span class="blank">&nbsp;</span>' : '<span class="mark">' + esc(t) + '</span>';
    if (C.kind === 'term') return w.ex.split(w.w).map(esc).join(wrap(w.w)); // 용어가 여러 번 나오면 모두 표시
    const re = wordRegex(w.w); const m = w.ex.match(re);
    if (!m) return esc(w.ex);
    return esc(w.ex.slice(0, m.index)) + wrap(m[0]) + esc(w.ex.slice(m.index + m[0].length));
  }
  function levelBadge(lv) { return `<span class="tag"><span class="dot lv${lv}"></span>${LV[lv]}</span>`; }
  function speakBtn(text, label = '발음') { if (!C.tts) return ''; return `<button class="speak" data-speak="${esc(text)}" title="발음 듣기">${ic('volume')}${label}</button>`; }

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
    const weak = WORDS.filter(w => isWeak(w.id)).length;
    const todayLog = S.log[today()] || { studied: 0, correct: 0, wrong: 0 };
    const goalPct = Math.min(100, Math.round(todayLog.studied / S.goal * 100));
    const nextDay = DAYS.findIndex(ids => ids.some(id => !isLearned(id)));
    const dayIdx = nextDay < 0 ? DAYS.length - 1 : nextDay;
    const r = readinessScore();
    const yesterday = S.log[addDays(today(), -1)];
    const cmp = yesterday ? `${todayLog.studied - yesterday.studied >= 0 ? '+' : ''}${todayLog.studied - yesterday.studied} vs 어제` : '어제 기록 없음';
    render(`
      <div class="page-head enter">
        <div><h1>${todayLabel()}</h1><p class="sub">${due ? `복습 ${due}개가 기다리고 있습니다` : nextDay < 0 ? '모든 Day를 한 번씩 학습했습니다' : `Day ${nextDay + 1}부터 이어서 학습합니다`}</p></div>
        <div class="btn-row">
          ${due ? `<a class="btn btn-primary btn-lg" href="#/study/due">${ic('repeat')}복습 ${due}개</a><a class="btn btn-lg" href="#/day/${dayIdx}">Day ${dayIdx + 1} 학습</a>`
                : `<a class="btn btn-primary btn-lg" href="#/study/day/${dayIdx}">${ic('layers')}Day ${dayIdx + 1} 학습</a><a class="btn btn-lg" href="#/quiz">퀴즈</a>`}
        </div>
      </div>
      <div class="grid grid-4 mb">
        <div class="card stat"><div class="lbl">오늘 학습</div><div class="val accent">${todayLog.studied}<span class="muted" style="font-size:15px"> / ${S.goal}</span></div><div class="progress mt" style="margin-top:8px"><span style="width:${goalPct}%"></span></div></div>
        <div class="card stat"><div class="lbl">연속 학습일</div><div class="val">${S.streak}<span class="muted" style="font-size:15px"> 일</span></div><div class="cmp">${cmp}</div></div>
        <div class="card stat"><div class="lbl">학습한 ${N}</div><div class="val">${learned.toLocaleString()}</div><div class="cmp">전체 ${WORDS.length.toLocaleString()}</div></div>
        <div class="card stat"><div class="lbl">마스터</div><div class="val">${mastered.toLocaleString()}</div><div class="cmp">5단계 이상 도달</div></div>
      </div>
      <div class="grid grid-main mb">
        <div class="card">
          <div class="row spread mb"><h2>${DAYS.length}일 커리큘럼</h2><span class="meta">하루 ${DAY_SIZE}${N} · ${C.orderLabel}</span></div>
          <div class="day-grid ${C.kind === 'term' ? 'wide' : ''}">${DAYS.map((ids, i) => {
            const done = ids.filter(id => isLearned(id)).length; const pct = Math.round(done / ids.length * 100);
            return `<a class="day-tile ${pct === 100 ? 'done' : ''} ${i === nextDay ? 'today' : ''}" href="#/day/${i}"><div class="d">Day ${i + 1}</div><div class="c">${dayLabel(ids)} · ${done}/${ids.length}</div><div class="mini"><span style="width:${pct}%"></span></div></a>`;
          }).join('')}</div>
        </div>
        <div class="stack">
          <div class="card">
            <h2 class="mb-sm">${C.goalLabel}</h2>
            <div class="gauge">${gaugeSvg(r.score)}<div><p class="sec small">${r.msg}</p>
              <div class="lvrow mt">${[1, 2, 3].map(l => `<span class="sec">${LV[l]}</span><div class="progress quiet"><span style="width:${r.lv[l]}%"></span></div><span class="n">${r.lv[l]}%</span>`).join('')}</div></div></div>
          </div>
          <div class="card" style="padding:8px">
            <a class="link-row" href="#/study/due"><span class="l">${ic('repeat')}복습 예정</span><span class="meta">${due}</span></a>
            <a class="link-row" href="#/study/weak"><span class="l">${ic('alert')}자주 틀리는 ${N}</span><span class="meta">${weak}</span></a>
            <a class="link-row" href="#/study/starred"><span class="l">${ic('star')}즐겨찾기</span><span class="meta">${Object.keys(S.starred).length}</span></a>
            <a class="link-row" href="#/quiz/blank"><span class="l">${ic('pen')}빈칸 채우기 퀴즈</span><span class="meta">${C.blankMeta}</span></a>
          </div>
        </div>
      </div>`);
  }
  // Day 타일의 보조 라벨: TOEIC은 난이도, 자격증은 과목 영역
  function dayLabel(ids) {
    if (C.kind === 'word') return LV[BY_ID[ids[0]].lv].split(' ')[0];
    return CATS[BY_ID[ids[0]].cat].short;
  }
  function daySub(ids) {
    if (C.kind === 'word') return LV[BY_ID[ids[0]].lv];
    return [...new Set(ids.map(id => CATS[BY_ID[id].cat].name))].join(', ');
  }
  function readinessScore() {
    const lv = {};
    [1, 2, 3].forEach(l => { const ws = WORDS.filter(w => w.lv === l); lv[l] = Math.round(ws.filter(w => isMastered(w.id)).length / ws.length * 100); });
    const score = Math.round(lv[1] * 0.3 + lv[2] * 0.35 + lv[3] * 0.35);
    const msg = C.msgs[score >= 90 ? 0 : score >= 70 ? 1 : score >= 40 ? 2 : score > 0 ? 3 : 4];
    return { score, lv, msg };
  }
  function gaugeSvg(pct) {
    const r = 48, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--raised)" stroke-width="8"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 60 60)"/><text x="60" y="68" text-anchor="middle" font-family="var(--serif)" font-size="30" fill="var(--text)">${pct}<tspan font-size="14" fill="var(--muted)">%</tspan></text></svg>`;
  }

  // ---------- Day / 카테고리 상세 ----------
  function dayView([n]) {
    const i = Math.max(0, Math.min(DAYS.length - 1, parseInt(n, 10) || 0));
    const ids = DAYS[i];
    const done = ids.filter(id => isLearned(id)).length;
    render(`
      <div class="page-head"><div><h1>Day ${i + 1}</h1><p class="sub">${esc(daySub(ids))} · ${done}/${ids.length} 학습</p></div>
        <div class="btn-row">${i > 0 ? `<a class="btn btn-sm" href="#/day/${i - 1}">${ic('arrow-left')}Day ${i}</a>` : ''}${i < DAYS.length - 1 ? `<a class="btn btn-sm" href="#/day/${i + 1}">Day ${i + 2}${ic('arrow-right')}</a>` : ''}</div></div>
      <div class="btn-row mb">
        <a class="btn btn-primary" href="#/study/day/${i}">${ic('layers')}플래시카드로 학습</a>
        <a class="btn" href="#/quiz/mixed/day/${i}">${ic('target')}이 Day 퀴즈</a>
      </div>
      ${wordList(ids)}`);
  }
  function catView([k]) {
    const cat = CATS[k]; if (!cat) return home();
    const ids = WORDS.filter(w => w.cat === k).map(w => w.id);
    render(`
      <div class="page-head"><div><h1>${esc(cat.name)}</h1><p class="sub">${ids.length}${N} · 마스터 ${ids.filter(isMastered).length}</p></div>
        <a class="btn btn-ghost btn-sm" href="#/words">${ic('arrow-left')}${C.book}</a></div>
      <div class="btn-row mb">
        <a class="btn btn-primary" href="#/study/cat/${k}">${ic('layers')}플래시카드</a>
        <a class="btn" href="#/quiz/mixed/cat/${k}">${ic('target')}카테고리 퀴즈</a>
      </div>
      ${wordList(ids)}`);
  }
  function wordList(ids) {
    if (!ids.length) return `<div class="empty">표시할 ${N}가 없습니다</div>`;
    return `<div class="wlist">${ids.map(id => {
      const w = BY_ID[id], c = card(id);
      const st = isMastered(id) ? '<span class="tag ok">마스터</span>' : isWeak(id) ? '<span class="tag bad">취약</span>' : c.seen ? `<span class="tag">${c.box}/${MASTER_BOX}단계</span>` : '';
      return `<div class="witem"><div class="head"><span class="w">${esc(w.w)}</span><span class="tag pos">${esc(w.p)}</span><span class="m">${esc(w.k)}</span>${levelBadge(w.lv)}${st}
        <button class="star ${S.starred[id] ? 'on' : ''}" data-star="${id}" title="즐겨찾기" aria-label="즐겨찾기">${ic('star')}</button></div>
        <div class="syn">${esc(w.syn)}</div>
        <div class="ex">${markExample(w, 'bold')}${speakBtn(w.ex, '')}</div></div>`;
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
    else if (mode === 'new') ids = WORDS.filter(w => !isLearned(w.id)).map(w => w.id).slice(0, C.newBatch);
    else ids = null;
    const titles = { due: `복습 예정 ${N}`, weak: `자주 틀리는 ${N}`, starred: '즐겨찾기', day: `Day ${parseInt(arg, 10) + 1}`, cat: CATS[arg] ? CATS[arg].name : '', new: `새 ${N} ${C.newBatch}개` };
    return { ids, title: titles[mode] || '' };
  }
  function study(args) {
    const set = pickSet(args);
    if (!set.ids) return studyMenu();
    if (!set.ids.length) return render(`<div class="empty"><h2>${esc(set.title)}</h2><p class="mt">학습할 ${N}가 없습니다</p><a class="btn btn-primary mt" href="#/study">다른 학습 선택</a></div>`);
    runFlash(shuffle(set.ids), set.title);
  }
  function studyMenu() {
    const due = WORDS.filter(w => isDue(w.id)).length, weak = WORDS.filter(w => isWeak(w.id)).length, fresh = WORDS.filter(w => !isLearned(w.id)).length;
    render(`
      <div class="page-head"><div><h1>플래시카드</h1><p class="sub">카드를 뒤집어 ${C.kind === 'term' ? '설명' : '뜻'}을 확인하고 알아요 또는 몰라요를 고르면, 간격 반복이 다음 복습 시점을 정합니다</p></div></div>
      <div class="grid grid-4 mb">
        <a class="cat-tile" href="#/study/due"><span class="ic">${ic('repeat', 'i-lg')}</span><div class="body"><div class="nm">복습 예정</div><div class="ct">${due}개</div></div></a>
        <a class="cat-tile" href="#/study/new"><span class="ic">${ic('plus', 'i-lg')}</span><div class="body"><div class="nm">새 ${N} ${C.newBatch}개</div><div class="ct">미학습 ${fresh}개 중</div></div></a>
        <a class="cat-tile" href="#/study/weak"><span class="ic">${ic('alert', 'i-lg')}</span><div class="body"><div class="nm">취약 ${N}</div><div class="ct">${weak}개</div></div></a>
        <a class="cat-tile" href="#/study/starred"><span class="ic">${ic('star', 'i-lg')}</span><div class="body"><div class="nm">즐겨찾기</div><div class="ct">${Object.keys(S.starred).length}개</div></div></a>
      </div>
      <div class="section"><h2>카테고리별 학습</h2>
      <div class="grid grid-3">${catTiles('study')}</div></div>`);
  }
  function catTiles(target) {
    return CAT_KEYS.map(k => {
      const ws = WORDS.filter(w => w.cat === k); const m = ws.filter(w => isMastered(w.id)).length;
      const href = target === 'study' ? `#/study/cat/${k}` : target === 'quiz' ? `#/quiz/mixed/cat/${k}` : `#/cat/${k}`;
      return `<a class="cat-tile" href="${href}"><span class="ic">${ic(CAT_ICON[k] || CATS[k].icon || 'book', 'i-lg')}</span><div class="body"><div class="nm">${CATS[k].name}</div><div class="ct">${ws.length}${N} · 마스터 ${m}</div><div class="progress quiet"><span style="width:${Math.round(m / ws.length * 100)}%"></span></div></div></a>`;
    }).join('');
  }
  function runFlash(queue, title) {
    let idx = 0, ok = 0, ng = 0, flipped = false; const total = queue.length; const again = [];
    function draw() {
      if (idx >= queue.length) {
        if (again.length) { queue = shuffle(again.splice(0)); idx = 0; toast(`몰랐던 ${N}를 다시 봅니다`); }
        else return finish();
      }
      const w = BY_ID[queue[idx]]; flipped = false;
      render(`
        <div class="flash-wrap">
          <div class="row spread mb"><h2>${esc(title)}</h2><span class="counter">${Math.min(idx + 1, total)} / ${total}</span></div>
          <div class="progress mb"><span style="width:${Math.round((ok + ng) / total * 100)}%"></span></div>
          <div class="flash" id="flash">
            <div class="flash-inner">
              <div class="face front">${levelBadge(w.lv)}<div class="word mt">${esc(w.w)}</div><div class="pos">${esc(w.p)}</div>${speakBtn(w.w)}<div class="flash-hint">카드를 누르거나 <kbd>Space</kbd>로 뒤집기</div></div>
              <div class="face back"><div class="word">${esc(w.w)} <span class="pos">${esc(w.p)}</span></div><div class="meaning">${esc(w.k)}</div><div class="syn">${esc(w.syn)}</div><div class="ex">${markExample(w, 'bold')}</div>${speakBtn(w.ex, '예문 듣기')}</div>
            </div>
          </div>
          <div class="flash-actions">
            <button class="btn" id="ng">${ic('x')}몰라요 <kbd>1</kbd></button>
            <button class="btn btn-primary" id="ok">${ic('check')}알아요 <kbd>2</kbd></button>
          </div>
          <div class="row spread mt"><button class="btn btn-sm btn-ghost star-toggle ${S.starred[w.id] ? 'on' : ''}" data-star="${w.id}">${ic('star')}${S.starred[w.id] ? '즐겨찾기 해제' : '즐겨찾기'}</button><a class="btn btn-sm btn-ghost" href="#/study">종료</a></div>
        </div>`);
      if (S.settings.autoSpeak && C.tts) speak(w.w);
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
      render(`<div class="card result enter">
        <h2 style="text-align:center">${esc(title)} 완료</h2><div class="big mt">${pct}<small>%</small></div>
        <p class="sec mt" style="text-align:center">알아요 ${ok} · 몰라요 ${ng} · 몰랐던 ${N}는 다시 확인했습니다</p>
        <div class="btn-row mt" style="justify-content:center"><a class="btn btn-primary" href="#/study">학습 메뉴</a><a class="btn" href="#/quiz">퀴즈로 확인</a><a class="btn btn-ghost" href="#/">홈</a></div></div>`);
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
  function quizTypes() {
    if (C.kind === 'term') return {
      e2k: { name: '용어에서 설명으로', desc: '용어를 보고 설명을 고릅니다', icon: 'type' },
      k2e: { name: '설명에서 용어로', desc: '설명을 보고 용어를 고릅니다', icon: 'languages' },
      blank: { name: '빈칸 채우기', desc: '문장의 빈칸에 맞는 용어를 고릅니다', icon: 'pen' },
      spell: { name: '직접 입력', desc: '설명을 보고 용어를 입력합니다', icon: 'keyboard' },
      mixed: { name: '혼합', desc: '고르기 세 유형이 섞여서 나옵니다', icon: 'shuffle' },
    };
    return {
      e2k: { name: '영어에서 한국어로', desc: '단어를 보고 뜻을 고릅니다', icon: 'type' },
      k2e: { name: '한국어에서 영어로', desc: '뜻을 보고 단어를 고릅니다', icon: 'languages' },
      syn: { name: '동의어 고르기', desc: 'Part 7 동의어 문제 대비', icon: 'repeat' },
      blank: { name: '빈칸 채우기', desc: '예문의 빈칸에 맞는 단어, Part 5 대비', icon: 'pen' },
      spell: { name: '스펠링 입력', desc: '뜻을 보고 단어를 직접 입력합니다', icon: 'keyboard' },
      mixed: { name: '혼합', desc: '다섯 유형이 섞여서 나옵니다', icon: 'shuffle' },
    };
  }
  function quiz(args) {
    const [type, scope, arg] = args;
    const QT = quizTypes();
    if (!QT[type]) return quizMenu();
    // 혼합 모드: 용어 과정은 긴 용어 입력을 빼고 고르기 유형만 섞는다
    const mixable = Object.keys(QT).filter(t => t !== 'mixed' && !(C.kind === 'term' && t === 'spell'));
    let pool;
    if (scope === 'day') pool = DAYS[parseInt(arg, 10)] || [];
    else if (scope === 'cat') pool = WORDS.filter(w => w.cat === arg).map(w => w.id);
    else if (scope === 'lv') pool = WORDS.filter(w => w.lv === parseInt(arg, 10)).map(w => w.id);
    else if (scope === 'learned') pool = WORDS.filter(w => isLearned(w.id)).map(w => w.id);
    else if (scope === 'weak') pool = WORDS.filter(w => isWeak(w.id) || isDue(w.id)).map(w => w.id);
    else pool = WORDS.map(w => w.id);
    if (pool.length < 4) return render(`<div class="empty"><p>퀴즈를 만들려면 ${N}가 4개 이상 필요합니다</p><a class="btn btn-primary mt" href="#/quiz">퀴즈 메뉴</a></div>`);
    const n = Math.min(S.settings.quizCount, pool.length);
    const qs = sample(pool, n).map(id => makeQuestion(id, type === 'mixed' ? sample(mixable, 1)[0] : type, pool));
    runQuiz(qs, QT[type].name);
  }
  function quizMenu() {
    render(`
      <div class="page-head"><div><h1>퀴즈</h1><p class="sub">유형과 범위를 고르세요. 틀린 문제는 복습 목록에 들어갑니다</p></div></div>
      <div class="card mb settings">
        <div class="row" style="gap:16px">
          <label>문항 수
            <select id="qCount">${[10, 20, 30, 50].map(n => `<option ${S.settings.quizCount === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>범위
            <select id="qScope">
              <option value="all">전체 ${N}</option>
              <option value="learned">학습한 ${N}만</option>
              <option value="weak">복습 예정·취약 ${N}</option>
              ${[1, 2, 3].map(l => `<option value="lv/${l}">${LV[l]}</option>`).join('')}
              ${CAT_KEYS.map(k => `<option value="cat/${k}">${CATS[k].name}</option>`).join('')}
              ${DAYS.map((_, i) => `<option value="day/${i}">Day ${i + 1}</option>`).join('')}
            </select></label>
        </div>
      </div>
      <div class="grid grid-3">${Object.entries(quizTypes()).map(([k, t]) => `<button class="cat-tile" data-quiz="${k}"><span class="ic">${ic(t.icon, 'i-lg')}</span><div class="body"><div class="nm">${t.name}</div><div class="ct" style="font-family:var(--sans);font-size:13px">${t.desc}</div></div></button>`).join('')}</div>`);
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
    if (type === 'e2k') return { type, w, prompt: `<div class="q-prompt"><div class="big">${esc(w.w)}</div><div class="pos">${esc(w.p)}</div></div>`, answer: w.k, choices: shuffle([w.k, ...distractors(w, pool, 'k').map(x => x.k)]), speakText: w.w };
    if (type === 'k2e') return { type, w, prompt: `<div class="q-prompt"><div class="ko">${esc(w.k)}</div><div class="pos">${esc(w.p)}</div></div>`, answer: w.w, choices: shuffle([w.w, ...distractors(w, pool, 'w').map(x => x.w)]) };
    if (type === 'syn') {
      const synFirst = w.syn.split(/[,;]/)[0].trim();
      return { type, w, prompt: `<div class="q-prompt"><div class="lead">의미가 가장 가까운 단어</div><div class="big">${esc(w.w)}</div></div>`, answer: synFirst, choices: shuffle([synFirst, ...distractors(w, pool, 'syn').map(x => x.syn.split(/[,;]/)[0].trim())]) };
    }
    if (type === 'blank') {
      if (!hasTerm(w)) return makeQuestion(id, 'e2k', pool);
      return { type, w, prompt: `<div class="q-prompt sentence"><div class="sent">${markExample(w, 'blank')}</div><div class="hint">${C.kind === 'term' ? '분류 · ' + esc(w.p) : '힌트 · ' + esc(w.k)}</div></div>`, answer: w.w, choices: shuffle([w.w, ...distractors(w, pool, 'w').map(x => x.w)]) };
    }
    if (type === 'spell') return { type, w, prompt: `<div class="q-prompt"><div class="ko">${esc(w.k)}</div><div class="pos">${esc(w.p)}</div><div class="hint">${C.kind === 'term' ? '' : esc(w.syn) + ' · '}${w.w.length}글자${w.w.includes(' ') ? ', 띄어쓰기 포함' : ''}</div></div>`, answer: w.w, typing: true };
    return makeQuestion(id, 'e2k', pool);
  }
  function runQuiz(qs, title) {
    let i = 0, score = 0; const wrongs = [];
    function draw() {
      if (i >= qs.length) return finish();
      const q = qs[i];
      render(`
        <div class="flash-wrap">
          <div class="row spread mb"><h2>${esc(title)}</h2><span class="counter">${i + 1} / ${qs.length}</span></div>
          <div class="progress mb"><span style="width:${Math.round(i / qs.length * 100)}%"></span></div>
          <div class="card">
            ${q.prompt}
            ${q.speakText ? `<div style="text-align:center">${speakBtn(q.speakText)}</div>` : ''}
            ${q.typing ? `<form class="typing" id="typeForm"><input id="typeIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${C.kind === 'term' ? '용어' : '영어 단어'}"><button class="btn btn-primary btn-lg">확인</button></form>`
              : `<div class="choices">${q.choices.map((c, k) => `<button class="choice" data-c="${esc(c)}"><kbd>${k + 1}</kbd><span>${esc(c)}</span></button>`).join('')}</div>`}
            <div id="explain"></div>
          </div>
          <div class="row spread mt"><span class="small muted">${q.typing ? '<kbd>Enter</kbd> 로 확인' : '<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> 로 선택'}</span><a class="btn btn-sm btn-ghost" href="#/quiz">종료</a></div>
        </div>`);
      if (q.typing) { const inp = $('#typeIn'); inp.focus(); $('#typeForm').onsubmit = e => { e.preventDefault(); check(inp.value.trim()); }; }
      else document.querySelectorAll('.choice').forEach(b => b.onclick = () => check(b.dataset.c));
    }
    // 대소문자, 악센트(résumé), 공백과 구두점 차이는 무시하고 비교한다
    function norm(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').toLowerCase().replace(/[\s\-_.,;:()'"*/·]/g, ''); }
    function check(ans) {
      const q = qs[i]; if (q.done) return; q.done = true;
      const correct = norm(ans) === norm(q.answer);
      grade(q.w.id, correct);
      if (correct) score++; else wrongs.push(q.w.id);
      document.querySelectorAll('.choice').forEach(b => { b.disabled = true; if (b.dataset.c === q.answer) b.classList.add('correct'); else if (b.dataset.c === ans && !correct) b.classList.add('wrong'); });
      if (q.typing) { const inp = $('#typeIn'); inp.disabled = true; inp.style.borderColor = correct ? 'var(--positive)' : 'var(--negative)'; }
      $('#explain').innerHTML = `<div class="explain"><div class="verdict ${correct ? 'ok' : 'ng'}">${ic(correct ? 'check' : 'x')}${correct ? '정답' : '오답 · 정답은 ' + esc(q.answer)}</div>
        <div class="w">${esc(q.w.w)} <span class="meta">${esc(q.w.p)}</span></div><div>${esc(q.w.k)} <span class="muted">· ${esc(q.w.syn)}</span></div>
        <div class="ex">${markExample(q.w, 'bold')}</div>
        <div class="row spread mt">${speakBtn(q.w.w)}<button class="btn btn-primary" id="next" style="margin-left:auto">${i + 1 < qs.length ? '다음' : '결과 보기'} <kbd>Enter</kbd></button></div></div>`;
      $('#next').onclick = () => { i++; draw(); }; $('#next').focus();
    }
    function finish() {
      const pct = Math.round(score / qs.length * 100);
      S.quizHistory.unshift({ d: today(), t: title, s: score, n: qs.length }); S.quizHistory = S.quizHistory.slice(0, 50); save();
      const prev = S.quizHistory[1]; const cmpTxt = prev ? ` · 직전 퀴즈 ${Math.round(prev.s / prev.n * 100)}점` : '';
      render(`<div class="card result enter">
        <h2 style="text-align:center">${esc(title)} 결과</h2><div class="big mt">${pct}<small>점</small></div>
        <p class="sec mt" style="text-align:center">${qs.length}문제 중 ${score}개 정답${cmpTxt}</p>
        ${wrongs.length ? `<h3 class="mt-lg mb-sm">틀린 ${N} ${wrongs.length}</h3>${wordList(wrongs)}` : ''}
        <div class="btn-row mt-lg" style="justify-content:center"><a class="btn btn-primary" href="#/quiz">다른 퀴즈</a>${wrongs.length ? `<a class="btn" href="#/study/weak">취약 ${N} 복습</a>` : ''}<a class="btn btn-ghost" href="#/">홈</a></div></div>`);
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
  function words() {
    render(`
      <div class="page-head"><div><h1>${C.book}</h1><p class="sub">${WORDS.length.toLocaleString()}${N} · ${CAT_KEYS.length}개 ${C.kind === 'term' ? '영역' : '주제'}</p></div></div>
      <div class="grid grid-3 mb">${catTiles('cat')}</div>
      <div class="card section">
        <div class="filters">
          <input id="fq" placeholder="검색" value="${esc(wf.q)}">
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
      let list = WORDS.filter(w => (!wf.cat || w.cat === wf.cat) && (!wf.lv || w.lv == wf.lv) && (!wf.q || w.w.toLowerCase().includes(wf.q) || w.k.toLowerCase().includes(wf.q) || w.syn.toLowerCase().includes(wf.q)));
      if (wf.st === 'new') list = list.filter(w => !isLearned(w.id));
      else if (wf.st === 'learning') list = list.filter(w => isLearned(w.id) && !isMastered(w.id));
      else if (wf.st === 'weak') list = list.filter(w => isWeak(w.id));
      else if (wf.st === 'mastered') list = list.filter(w => isMastered(w.id));
      else if (wf.st === 'starred') list = list.filter(w => S.starred[w.id]);
      const shown = list.slice(0, 300);
      $('#wres').innerHTML = `<p class="meta mb-sm">${list.length}개${list.length > 300 ? ' 중 300개 표시' : ''}</p>${wordList(shown.map(w => w.id))}`;
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
      <div class="page-head"><div><h1>${C.short} 학습 통계</h1><p class="sub">${Object.values(S.log).reduce((a, l) => a + l.studied, 0).toLocaleString()}회 학습 · 첫 학습 ${Object.keys(S.log).sort()[0] || '없음'}</p></div></div>
      <div class="grid grid-4 mb">
        <div class="card stat"><div class="lbl">학습한 ${N}</div><div class="val">${seenAny.toLocaleString()}</div><div class="cmp">전체 ${WORDS.length.toLocaleString()}</div></div>
        <div class="card stat"><div class="lbl">마스터</div><div class="val accent">${boxes.slice(MASTER_BOX).reduce((a, b) => a + b, 0).toLocaleString()}</div><div class="cmp">5단계 이상</div></div>
        <div class="card stat"><div class="lbl">누적 정답률</div><div class="val">${totalCorrect + totalWrong ? Math.round(totalCorrect / (totalCorrect + totalWrong) * 100) : 0}<span class="muted" style="font-size:15px">%</span></div><div class="cmp">${(totalCorrect + totalWrong).toLocaleString()}회 응답</div></div>
        <div class="card stat"><div class="lbl">연속 학습일</div><div class="val">${S.streak}</div><div class="cmp">마지막 학습 ${S.lastStudy || '없음'}</div></div>
      </div>
      <div class="grid grid-main mb">
        <div class="card"><h2 class="mb-sm">최근 6주</h2><p class="small muted mb">하루에 학습한 횟수. 짙을수록 많이 학습한 날입니다</p>
          <div class="heat">${days.map(d => { const l = S.log[d]; const n = l ? l.studied : 0; return `<div class="${n >= 60 ? 'h3' : n >= 25 ? 'h2' : n > 0 ? 'h1' : ''}" title="${d}: ${n}회"></div>`; }).join('')}</div></div>
        <div class="card"><h2 class="mb-sm">${C.goalLabel}</h2><div class="gauge">${gaugeSvg(r.score)}<div><p class="sec small">${r.msg}</p>
          <div class="lvrow mt">${[1, 2, 3].map(l => `<span class="sec">${LV[l]}</span><div class="progress quiet"><span style="width:${r.lv[l]}%"></span></div><span class="n">${r.lv[l]}%</span>`).join('')}</div></div></div></div>
      </div>
      <div class="grid grid-2 mb">
        <div class="card"><h2 class="mb-sm">학습 단계 분포</h2><p class="small muted mb">단계가 오를수록 복습 간격이 길어지고, 5단계부터 마스터로 봅니다</p>
          <div class="hbars">${['미학습', ...INTERVALS.map((_, i) => i + '단계')].map((lbl, i) => { const v = i === 0 ? unseen : boxes[i - 1]; const max = Math.max(1, unseen, ...boxes); return `<span class="lbl">${lbl}</span><div class="progress ${i > MASTER_BOX ? '' : 'quiet'}"><span style="width:${Math.round(v / max * 100)}%;${i === 0 ? 'background:var(--line-strong)' : ''}"></span></div><span class="n">${v}</span>`; }).join('')}</div></div>
        <div class="card"><h2 class="mb-sm">복습 예정</h2>
          <table class="table"><tr><th>날짜</th><th class="n">${N}</th></tr>${upcoming.map((n, d) => `<tr><td>${d === 0 ? '오늘까지' : d === 1 ? '내일' : addDays(today(), d)}</td><td class="n">${n}</td></tr>`).join('')}</table></div>
      </div>
      <div class="card mb"><h2 class="mb-sm">최근 퀴즈</h2>${S.quizHistory.length ? `<table class="table"><tr><th>날짜</th><th>유형</th><th class="n">정답</th><th class="n">점수</th></tr>${S.quizHistory.slice(0, 10).map(h => `<tr><td>${h.d}</td><td>${esc(h.t)}</td><td class="n">${h.s}/${h.n}</td><td class="n">${Math.round(h.s / h.n * 100)}</td></tr>`).join('')}</table>` : '<p class="muted">아직 퀴즈 기록이 없습니다</p>'}</div>
      <div class="card settings"><h2 class="mb">설정과 데이터</h2>
        <div class="row mb" style="gap:24px"><label>일일 목표 <select id="goal">${C.goals.map(n => `<option ${S.goal === n ? 'selected' : ''}>${n}</option>`).join('')}</select> ${N}</label>
          ${C.tts ? `<label><input type="checkbox" id="autoSpeak" ${S.settings.autoSpeak ? 'checked' : ''}> 플래시카드 자동 발음</label>` : ''}</div>
        <p class="small muted mb">학습 기록과 백업은 과정마다 따로 저장됩니다. 지금은 ${C.short} 기록입니다</p>
        <div class="btn-row"><button class="btn" id="export">${ic('download')}백업 파일 받기</button><label class="btn">${ic('upload')}복원 <input type="file" id="import" accept="application/json" hidden></label><button class="btn btn-ghost" id="reset" style="color:var(--negative)">${ic('rotate')}전체 초기화</button></div>
      </div>`);
    $('#goal').onchange = e => { S.goal = parseInt(e.target.value, 10); save(); toast('목표를 저장했습니다'); };
    if ($('#autoSpeak')) $('#autoSpeak').onchange = e => { S.settings.autoSpeak = e.target.checked; save(); };
    $('#export').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })); a.download = `${C.key}-backup-${today()}.json`; a.click(); };
    $('#import').onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { const d = JSON.parse(rd.result); if (!d.cards) throw 0; S = Object.assign(defaults(), d); save(); toast('복원했습니다'); stats(); } catch (_) { toast('백업 파일을 읽을 수 없습니다'); } }; rd.readAsText(f); };
    $('#reset').onclick = () => { if (confirm(`${C.short} 학습 기록을 모두 삭제합니다. 되돌릴 수 없습니다.`)) { S = defaults(); save(); toast('초기화했습니다'); stats(); } };
  }

  // ---------- 전역 이벤트 (과정 전환, 즐겨찾기, 발음) ----------
  document.addEventListener('click', e => {
    const cs = e.target.closest('[data-course]'); if (cs) {
      if (cs.dataset.course === C.key) return;
      setCourse(cs.dataset.course);
      if (location.hash.replace(/^#\/?/, '') === '') route(); else location.hash = '#/';
      return;
    }
    const sp = e.target.closest('[data-speak]'); if (sp) { e.stopPropagation(); speak(sp.dataset.speak); return; }
    const st = e.target.closest('[data-star]'); if (st) {
      const id = st.dataset.star; if (S.starred[id]) delete S.starred[id]; else S.starred[id] = 1; save();
      st.classList.toggle('on', !!S.starred[id]);
      if (st.classList.contains('star-toggle')) st.innerHTML = ic('star') + (S.starred[id] ? '즐겨찾기 해제' : '즐겨찾기');
      toast(S.starred[id] ? '즐겨찾기에 추가했습니다' : '즐겨찾기에서 뺐습니다');
    }
  });

  // ---------- 테마 ----------
  const themeKey = 'toeic900_theme';
  function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
  function themeIsDark() { return (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'; }
  try { applyTheme(localStorage.getItem(themeKey)); } catch (e) { /* ignore */ }
  function themeBtn() { $('#themeToggle').innerHTML = themeIsDark() ? '<svg class="i" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>' : ic('moon'); }
  themeBtn();
  $('#themeToggle').onclick = () => {
    const next = themeIsDark() ? 'light' : 'dark'; applyTheme(next); themeBtn();
    try { localStorage.setItem(themeKey, next); } catch (e) { /* ignore */ }
  };

  let savedCourse = 'toeic';
  try { savedCourse = localStorage.getItem(COURSE_KEY) || 'toeic'; } catch (e) { /* ignore */ }
  setCourse(savedCourse);
  route();
})();
