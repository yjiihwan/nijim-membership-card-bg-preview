(function () {
  'use strict';
  const C = window.CardBg;
  const KEY = 'nijim_cardbg_v1';
  const MAX_BYTES = 5 * 1024 * 1024;
  const MIN_W = 600;
  const MAX_EDGE = 1600;

  const CENTERS = [
    { id: 'c_sangdo', name: '엔짐 상도점', sport: '헬스', period: '8개월 멤버십', days: 196, cond: '무제한 이용가능' },
    { id: 'c_sindaebang', name: '엔짐 신대방점', sport: '헬스', period: '11개월 멤버십', days: 263, cond: '무제한 이용가능' },
    { id: 'c_bodyworks', name: '바디웍스 강남점', sport: '필라테스', period: '3개월 멤버십', days: 54, cond: '주 2회 이용가능' },
  ];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = (all) => localStorage.setItem(KEY, JSON.stringify(all));

  // ── 카드 그리기 (관리자 미리보기·회원 앱 공용) ──
  function cardHtml(c) {
    return `<div class="mc-scrim"></div>
      <div class="mc-name">${esc(c.name)}</div>
      <div class="mc-sport">${esc(c.sport)}</div>
      <div class="mc-period">${esc(c.period)}</div>
      <div class="mc-days"><b>${esc(c.days)}</b>일 남음</div>
      <div class="mc-cond">${esc(c.cond)}</div>`;
  }

  function applyBg(el, bg) {
    el.classList.remove('cbg', 'img');
    el.style.background = '';
    el.style.removeProperty('--card-fg');
    const scrim = $('.mc-scrim', el);
    scrim.style.background = 'none';
    if (!bg || bg.type === 'default') return;
    if (bg.type === 'template') {
      el.style.background = C.TEMPLATES.find((t) => t.id === bg.templateId).css;
    } else if (bg.type === 'image' && bg.imageUrl) {
      el.classList.add('img');
      el.style.background = `url("${bg.imageUrl}") ${bg.posX}% ${bg.posY}% / cover no-repeat`;
    } else return;
    el.classList.add('cbg');
    el.style.setProperty('--card-fg', bg.textColor);
    scrim.style.background = C.scrimCss(bg.textColor, bg.scrimAlpha);
  }

  // 화면에 실제로 그려진 글자 위치를 재서 판정 영역으로 쓴다
  function zonesOf(card) {
    const r = card.getBoundingClientRect();
    const sx = card.offsetWidth / r.width, sy = card.offsetHeight / r.height;
    return $$('div:not(.mc-scrim)', card).map((d) => {
      const b = d.getBoundingClientRect();
      // 줄 상자 대신 글자 높이만큼(위아래 여백 15% 제외)
      const padY = b.height * 0.15;
      return {
        key: d.className.replace('mc-', ''),
        x: ((b.left - r.left) * sx) / card.offsetWidth,
        y: ((b.top - r.top) * sy + padY) / card.offsetHeight,
        w: (b.width * sx) / card.offsetWidth,
        h: (b.height * sy - padY * 2) / card.offsetHeight,
      };
    });
  }

  const imgCache = new Map();
  function getImg(url) {
    if (!url) return Promise.resolve(null);
    if (imgCache.has(url)) return imgCache.get(url);
    const p = new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    imgCache.set(url, p);
    return p;
  }

  async function evaluateBg(bg, card) {
    const W = 286 * 2, H = 180 * 2;
    const cv = $('#calc'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const img = bg.type === 'image' ? await getImg(bg.imageUrl) : null;
    C.paintBackground(ctx, W, H, bg, img);
    return C.evaluate(ctx, W, H, card ? zonesOf(card) : C.TEXT_ZONES, { allowScrim: bg.type === 'image' });
  }

  // ── 관리자 화면 ──
  let all = load();
  let centerId = CENTERS[0].id;
  let draft = null;
  let lastEval = null;

  const center = () => CENTERS.find((c) => c.id === centerId);
  const fresh = (c) => ({ type: 'default', templateId: null, imageUrl: null, posX: 50, posY: 50, imgW: 0, imgH: 0, textColor: null, scrimAlpha: 0 });

  function buildTemplates() {
    const mk = (t) => `<div class="tpl" data-id="${t.id}"><div class="tpl-sw" style="background:${t.css}"><span style="color:${t.textColor}">196</span></div>${esc(t.name)}</div>`;
    $('#tplSolid').innerHTML = C.TEMPLATES.filter((t) => t.group === 'solid').map(mk).join('');
    $('#tplGrad').innerHTML = C.TEMPLATES.filter((t) => t.group === 'gradient').map(mk).join('');
    $('#tplMetal').innerHTML = C.TEMPLATES.filter((t) => t.group === 'metal').map(mk).join('');
  }

  async function precomputeTemplates() {
    for (const t of C.TEMPLATES) {
      const r = await evaluateBg({ type: 'template', templateId: t.id }, null);
      t.textColor = r.textColor; t.minContrast = r.minContrast;
    }
  }

  function renderAdmin() {
    $('#centerSel').innerHTML = CENTERS.map((c) => `<option value="${c.id}"${c.id === centerId ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
    $$('.opt').forEach((o) => o.classList.toggle('on', o.dataset.type === draft.type));
    $$('.tpl').forEach((t) => t.classList.toggle('on', draft.type === 'template' && t.dataset.id === draft.templateId));
    $('#posBox').hidden = !(draft.type === 'image' && draft.imageUrl);
    $('#upTitle').textContent = draft.imageUrl ? '다른 사진으로 바꾸기' : '사진 고르기';
    if (draft.imageUrl) {
      $('#posX').value = draft.posX; $('#posY').value = draft.posY;
      const free = freeAxes();
      $('#posX').disabled = !free.x; $('#posY').disabled = !free.y;
      $('#posNote').textContent = free.x && free.y ? '' : free.x ? '이 사진은 카드보다 가로가 길어서 좌우로만 움직여요.' : free.y ? '이 사진은 카드보다 세로가 길어서 위아래로만 움직여요.' : '이 사진은 카드 비율과 같아 위치를 바꿀 필요가 없어요.';
    }
    const card = $('#prevCard');
    card.innerHTML = cardHtml(center());
    refreshPreview();
    const saved = all[centerId];
    $('#savedNote').textContent = saved ? `저장된 설정: ${label(saved)} · ${new Date(saved.updatedAt).toLocaleString('ko-KR')}` : '저장된 설정 없음 (기본 회색)';
  }

  const label = (b) => b.type === 'template' ? `템플릿 «${C.TEMPLATES.find((t) => t.id === b.templateId).name}»` : b.type === 'image' ? '내 이미지' : '기본 배경';

  function freeAxes() {
    const cw = 286, ch = 180;
    const r = C.coverRect(draft.imgW, draft.imgH, cw, ch, 0, 0);
    return { x: r.w - cw > 1, y: r.h - ch > 1 };
  }

  let evalSeq = 0;
  async function refreshPreview() {
    const card = $('#prevCard');
    const seq = ++evalSeq;
    if (draft.type === 'default' || (draft.type === 'template' && !draft.templateId) || (draft.type === 'image' && !draft.imageUrl)) {
      applyBg(card, null);
      lastEval = null;
      showReadout(null);
      return;
    }
    // 글자 위치는 배경과 무관 → 판정 전에 먼저 그려 둔 카드에서 잰다
    applyBg(card, { ...draft, textColor: draft.textColor || C.INK });
    const r = await evaluateBg(draft, card);
    if (seq !== evalSeq) return;
    draft.textColor = r.textColor; draft.scrimAlpha = r.scrimAlpha;
    lastEval = r;
    applyBg(card, draft);
    showReadout(r);
  }

  function showReadout(r) {
    const el = $('#readout');
    if (!r) {
      el.innerHTML = `<dt>배경</dt><dd>기본 연회색 (지금 그대로)</dd><dt>글자색</dt><dd>기존 그대로</dd>`;
      return;
    }
    const ok = r.minContrast >= C.MIN_CONTRAST;
    el.innerHTML = `<dt>글자색 자동</dt><dd><i class="chip" style="background:${r.textColor}"></i>${r.textColor === C.WHITE ? '흰색' : '검정 계열'} (${r.textColor})</dd>
      <dt>가장 낮은 대비</dt><dd class="${ok ? 'ok' : 'ng'}">${r.minContrast.toFixed(1)} : 1 ${ok ? '— 잘 읽혀요' : '— 기준(4.5) 미달'}</dd>
      <dt>그늘 막</dt><dd>${r.scrimAlpha ? `자동으로 깔림 (진하기 ${Math.round(r.scrimAlpha * 100)}%)` : '필요 없음'}</dd>`;
    el.dataset.min = r.minContrast.toFixed(2);
    el.dataset.fg = r.textColor;
    el.dataset.scrim = r.scrimAlpha;
  }

  function selectCenter(id) {
    centerId = id;
    draft = { ...fresh(), ...(all[id] || {}) };
    $('#upErr').hidden = true;
    renderAdmin();
  }

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function readImage(file) {
    return new Promise((res, rej) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return rej('JPG·PNG·WEBP 사진만 올릴 수 있어요.');
      if (file.size > MAX_BYTES) return rej(`사진이 너무 커요 (${(file.size / 1048576).toFixed(1)}MB). 5MB 이하로 올려 주세요.`);
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        if (im.naturalWidth < MIN_W) return rej(`사진 가로가 ${im.naturalWidth}px라 카드에서 흐려 보여요. 가로 ${MIN_W}px 이상 사진을 올려 주세요.`);
        // 긴 변 1600px로 줄여 저장(실서비스: 서버에서 WebP로 다시 저장 권장)
        const s = Math.min(1, MAX_EDGE / Math.max(im.naturalWidth, im.naturalHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.naturalWidth * s); cv.height = Math.round(im.naturalHeight * s);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        res({ url: cv.toDataURL('image/jpeg', 0.86), w: cv.width, h: cv.height });
      };
      im.onerror = () => { URL.revokeObjectURL(url); rej('사진을 열 수 없어요. 다른 사진으로 해 주세요.'); };
      im.src = url;
    });
  }

  function bindAdmin() {
    $('#centerSel').addEventListener('change', (e) => selectCenter(e.target.value));
    $$('.opt').forEach((o) => o.addEventListener('click', (e) => {
      if (e.target.closest('.opt-b')) return;
      draft.type = o.dataset.type;
      if (draft.type === 'template' && !draft.templateId) draft.templateId = C.TEMPLATES[0].id;
      renderAdmin();
    }));
    document.addEventListener('click', (e) => {
      const t = e.target.closest('.tpl'); if (!t) return;
      draft.type = 'template'; draft.templateId = t.dataset.id; renderAdmin();
    });
    $('#fileIn').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      $('#upErr').hidden = true;
      try {
        const r = await readImage(f);
        Object.assign(draft, { type: 'image', imageUrl: r.url, imgW: r.w, imgH: r.h, posX: 50, posY: 50 });
        renderAdmin();
      } catch (msg) { $('#upErr').textContent = msg; $('#upErr').hidden = false; }
    });
    const onPos = () => { draft.posX = +$('#posX').value; draft.posY = +$('#posY').value; refreshPreview(); };
    $('#posX').addEventListener('input', onPos);
    $('#posY').addEventListener('input', onPos);
    $('#posCenter').addEventListener('click', () => { draft.posX = 50; draft.posY = 50; renderAdmin(); });

    // 미리보기 카드 끌어서 위치 조정
    const card = $('#prevCard');
    let drag = null;
    card.addEventListener('pointerdown', (e) => {
      if (draft.type !== 'image' || !draft.imageUrl) return;
      card.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, px: draft.posX, py: draft.posY };
    });
    card.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = C.coverRect(draft.imgW, draft.imgH, 286, 180, 0, 0);
      const ox = 286 - r.w, oy = 180 - r.h;
      if (ox < -1) draft.posX = Math.max(0, Math.min(100, drag.px + ((e.clientX - drag.x) / ox) * 100));
      if (oy < -1) draft.posY = Math.max(0, Math.min(100, drag.py + ((e.clientY - drag.y) / oy) * 100));
      $('#posX').value = draft.posX; $('#posY').value = draft.posY;
      applyBg(card, draft);
    });
    const end = () => { if (drag) { drag = null; draft.posX = Math.round(draft.posX); draft.posY = Math.round(draft.posY); refreshPreview(); } };
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);

    $('#btnReset').addEventListener('click', () => {
      delete all[centerId]; save(all);
      draft = fresh(); renderAdmin();
      toast('기본 배경으로 되돌렸어요.');
    });
    $('#btnSave').addEventListener('click', async () => {
      if (draft.type === 'default') { delete all[centerId]; save(all); renderAdmin(); toast('기본 배경으로 저장했어요.'); return; }
      if (draft.type === 'image' && !draft.imageUrl) { toast('사진을 먼저 올려 주세요.'); return; }
      await refreshPreview();
      all[centerId] = { ...draft, minContrast: lastEval ? +lastEval.minContrast.toFixed(2) : null, updatedAt: Date.now() };
      try { save(all); } catch { toast('브라우저 저장 공간이 부족해요. 더 작은 사진으로 해 주세요.'); return; }
      renderAdmin();
      toast('저장했어요. 회원 앱에 바로 적용돼요.');
    });
  }

  // ── 회원 앱 화면 ──
  function renderApp() {
    all = load();
    const car = $('#car');
    car.innerHTML = CENTERS.map((c) => `<div class="slide" data-id="${c.id}"><div class="mcard">${cardHtml(c)}</div><div class="enter">입장하기</div></div>`).join('');
    $$('.slide', car).forEach((s) => applyBg($('.mcard', s), all[s.dataset.id]));
    car.scrollLeft = 0;
    markActive();
  }
  function markActive() {
    const car = $('#car');
    const i = Math.round(car.scrollLeft / (286 + 12));
    $$('.slide', car).forEach((s, k) => s.classList.toggle('act', k === i));
  }

  // ── 시험용 ──
  async function fetchAsFile(path, name) {
    const b = await (await fetch(path)).blob();
    return new File([b], name, { type: b.type || 'image/jpeg' });
  }
  async function loadSample() {
    const f = await fetchAsFile('img/sample_gym_dark.jpg', 'sample.jpg');
    const r = await readImage(f);
    const s = { ...fresh(), type: 'image', imageUrl: r.url, imgW: r.w, imgH: r.h, posX: 50, posY: 50 };
    const tmp = document.createElement('div');
    tmp.className = 'mcard'; tmp.style.cssText = 'position:fixed;left:-9999px;top:0';
    tmp.innerHTML = cardHtml(CENTERS[1]); document.body.appendChild(tmp);
    const ev = await evaluateBg(s, tmp); tmp.remove();
    Object.assign(s, { textColor: ev.textColor, scrimAlpha: ev.scrimAlpha, minContrast: +ev.minContrast.toFixed(2), updatedAt: Date.now() });
    const t = C.TEMPLATES.find((x) => x.id === 'G04');
    all = { c_sangdo: { ...fresh(), type: 'template', templateId: 'G04', textColor: t.textColor, scrimAlpha: 0, minContrast: +t.minContrast.toFixed(2), updatedAt: Date.now() }, c_sindaebang: s };
    save(all);
  }

  function setView(v) {
    $$('.demo-nav a[data-view]').forEach((a) => a.classList.toggle('on', a.dataset.view === v));
    $$('.view').forEach((m) => m.classList.toggle('on', m.id === `view-${v}`));
    if (v === 'app') renderApp(); else selectCenter(centerId);
    history.replaceState(null, '', `#${v}`);
  }

  async function init() {
    await precomputeTemplates();
    buildTemplates();
    bindAdmin();
    $('#car').addEventListener('scroll', markActive, { passive: true });
    $$('.demo-nav a').forEach((a) => a.addEventListener('click', async () => {
      if (a.dataset.view) return setView(a.dataset.view);
      if (a.dataset.act === 'reset') { all = {}; save(all); toast('모든 센터 설정을 지웠어요.'); }
      if (a.dataset.act === 'sample') { await loadSample(); toast('예시: 상도점=오션 딥 · 신대방점=사진 · 바디웍스=기본'); }
      setView(location.hash === '#app' ? 'app' : 'admin');
    }));
    draft = { ...fresh(), ...(all[centerId] || {}) };
    setView(location.hash === '#app' ? 'app' : 'admin');
    document.body.dataset.ready = '1';
  }
  window.__cardbg = { evaluateBg, applyBg, CENTERS, selectCenter, renderApp, get draft() { return draft; }, get lastEval() { return lastEval; } };
  init();
})();
