/* 멤버십 카드 배경 — 템플릿 13종 + 글자색 자동 대비 계산 (브라우저·Node 공용)
   외부 개발자 전달 꾸러미의 기준 구현. 저장 시 1회 계산해서 결과(textColor·scrimAlpha)를 DB에 넣고,
   고객앱은 저장된 값만 그린다(고객앱에서 다시 계산하지 않음). */
(function (root) {
  'use strict';

  const INK = '#16161C';
  const WHITE = '#FFFFFF';
  const MIN_CONTRAST = 4.5;
  // 글자 밑 배경 중 «가장 나쁜 쪽» 1%는 무시(사진 잡티·JPEG 노이즈) — 99백분위로 판정
  const WORST_PCT = 0.99;
  const SCRIM_MAX = 0.8;
  // 사진은 확대·축소·압축으로 픽셀이 조금씩 달라지므로 그늘 막은 4.8:1을 목표로 계산(여유분)
  const SCRIM_TARGET = 4.8;
  // 그늘 막 모양: 왼쪽(글자 쪽) 0~55%는 같은 진하기, 55%→90%로 사라짐(오른쪽 사진은 그대로 보이게)
  const SCRIM_SOLID_UNTIL = 0.55;
  const SCRIM_FADE_END = 0.9;

  // 카드 기준 글자 영역(비율, 글자 높이의 가운데 70%). 실서비스 카드(286×180pt)에서 잰 값.
  // 글자 폭은 내용 길이에 따라 달라지므로 가능하면 실제 글자 폭을 재서 w 대신 쓴다(시험판 관리자 화면은 실제 글자 위치를 잼).
  // 못 재면 이 표의 w(긴 센터명 8~9자까지 덮는 폭)를 그대로 쓴다.
  const TEXT_ZONES = [
    { key: 'name', x: 0.038, y: 0.095, w: 0.45, h: 0.08 },
    { key: 'sport', x: 0.038, y: 0.422, w: 0.20, h: 0.077 },
    { key: 'period', x: 0.038, y: 0.555, w: 0.34, h: 0.077 },
    { key: 'days', x: 0.038, y: 0.696, w: 0.36, h: 0.11 },
    { key: 'cond', x: 0.038, y: 0.852, w: 0.34, h: 0.063 },
  ];

  const TEMPLATES = [
    { id: 'S01', group: 'solid', name: '비비드 오렌지', css: '#CC3F00', stops: [['#CC3F00', 0]] },
    { id: 'S02', group: 'solid', name: '일렉트릭 퍼플', css: '#9D1FD1', stops: [['#9D1FD1', 0]] },
    { id: 'S03', group: 'solid', name: '에메랄드 그린', css: '#007F56', stops: [['#007F56', 0]] },
    { id: 'S04', group: 'solid', name: '차콜 잉크', css: '#16161C', stops: [['#16161C', 0]] },
    { id: 'S05', group: 'solid', name: '딥 인디고', css: '#253DBE', stops: [['#253DBE', 0]] },
    { id: 'G01', group: 'gradient', name: '선셋', angle: 135, stops: [['#CC3F00', 0], ['#B5179E', 1]] },
    { id: 'G02', group: 'gradient', name: '블루 바이올렛', angle: 135, stops: [['#0050E6', 0], ['#7B2FF7', 1]] },
    { id: 'G03', group: 'gradient', name: '미드나잇', angle: 160, stops: [['#121218', 0], ['#2C2E3E', 1]] },
    { id: 'G04', group: 'gradient', name: '오션 딥', angle: 120, stops: [['#1B2B8F', 0], ['#2156C4', 0.6], ['#2C86D6', 1]] },
    { id: 'G05', group: 'gradient', name: '로즈 딥', angle: 135, stops: [['#A3003F', 0], ['#D4004F', 1]] },
    // 메탈릭: 밝은 금속이라 글자는 검정 계열로 자동 전환. 은은한 명암 + 대각선 광택 띠 1줄(반짝이·입체 효과 없음)
    { id: 'M01', group: 'metal', name: '메탈릭 실버', angle: 115, stops: [['#8F959E', 0], ['#B9BEC5', 0.3], ['#E9ECEF', 0.46], ['#C3C8CE', 0.56], ['#A2A8B0', 0.8], ['#8C929B', 1]] },
    { id: 'M02', group: 'metal', name: '메탈릭 골드', angle: 115, stops: [['#B98B32', 0], ['#D2A64A', 0.3], ['#F3DC97', 0.46], ['#D9B055', 0.56], ['#C49638', 0.8], ['#B4862E', 1]] },
    // 블랙 메탈릭: 단색 차콜(S04)·미드나잇(G03)과 구분되게 가장자리를 더 짙게, 가운데 건메탈 빛줄기. 어두워서 글자는 흰색 자동
    { id: 'M03', group: 'metal', name: '블랙 메탈릭', angle: 115, stops: [['#0D0D0F', 0], ['#232529', 0.3], ['#5A5E64', 0.46], ['#33363B', 0.56], ['#18191C', 0.8], ['#0B0B0D', 1]] },
  ];
  TEMPLATES.forEach((t) => {
    if (t.group !== 'solid') t.css = `linear-gradient(${t.angle}deg, ${t.stops.map(([c, p]) => `${c} ${Math.round(p * 100)}%`).join(', ')})`;
  });

  const hexToRgb = (h) => {
    const s = h.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  };
  const chan = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance = (r, g, b) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  const L_INK = luminance(...hexToRgb(INK));
  const L_WHITE = 1;

  // CSS linear-gradient 각도와 같은 선을 캔버스에 그린다 (0deg=위로, 90deg=오른쪽으로)
  function paintGradient(ctx, w, h, angle, stops) {
    const a = (angle * Math.PI) / 180;
    const dx = Math.sin(a), dy = -Math.cos(a);
    const len = Math.abs(w * dx) + Math.abs(h * dy);
    const cx = w / 2, cy = h / 2;
    const g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
    stops.forEach(([c, p]) => g.addColorStop(p, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // background-size: cover + background-position: X% Y% 와 같은 자리
  function coverRect(iw, ih, w, h, posX, posY) {
    const s = Math.max(w / iw, h / ih);
    const dw = iw * s, dh = ih * s;
    return { x: (w - dw) * (posX / 100), y: (h - dh) * (posY / 100), w: dw, h: dh };
  }

  function paintBackground(ctx, w, h, bg, img) {
    ctx.clearRect(0, 0, w, h);
    if (bg.type === 'template') {
      const t = TEMPLATES.find((x) => x.id === bg.templateId);
      if (t.group === 'solid') { ctx.fillStyle = t.css; ctx.fillRect(0, 0, w, h); }
      else paintGradient(ctx, w, h, t.angle, t.stops);
    } else if (bg.type === 'image' && img) {
      const r = coverRect(img.naturalWidth || img.width, img.naturalHeight || img.height, w, h, bg.posX ?? 50, bg.posY ?? 50);
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
    } else {
      ctx.fillStyle = '#FAFAFA';
      ctx.fillRect(0, 0, w, h);
    }
  }

  const scrimRgb = (textColor) => (textColor === WHITE ? [0, 0, 0] : [255, 255, 255]);
  const scrimAlphaAt = (xFrac, alpha) =>
    xFrac <= SCRIM_SOLID_UNTIL ? alpha : alpha * Math.max(0, 1 - (xFrac - SCRIM_SOLID_UNTIL) / (SCRIM_FADE_END - SCRIM_SOLID_UNTIL));
  const scrimCss = (textColor, alpha) => {
    if (!alpha) return 'none';
    const [r, g, b] = scrimRgb(textColor);
    return `linear-gradient(90deg, rgba(${r},${g},${b},${alpha}) 0%, rgba(${r},${g},${b},${alpha}) ${SCRIM_SOLID_UNTIL * 100}%, rgba(${r},${g},${b},0) ${SCRIM_FADE_END * 100}%)`;
  };

  // 글자 영역 픽셀 목록: [r,g,b,xFrac]
  function samplePixels(ctx, w, h, zones) {
    const data = ctx.getImageData(0, 0, w, h).data;
    return zones.map((z) => {
      const x0 = Math.max(0, Math.floor(z.x * w)), y0 = Math.max(0, Math.floor(z.y * h));
      const x1 = Math.min(w, Math.ceil((z.x + z.w) * w)), y1 = Math.min(h, Math.ceil((z.y + z.h) * h));
      const px = [];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        px.push([data[i], data[i + 1], data[i + 2], (x + 0.5) / w]);
      }
      return { key: z.key, px };
    });
  }

  const pct = (arr, p) => {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  };

  // 영역별로 «가장 나쁜 쪽» 대비 (흰 글자는 밝은 배경 픽셀이, 검은 글자는 어두운 픽셀이 나쁨)
  function zoneContrast(zone, textColor, alpha) {
    const lt = textColor === WHITE ? L_WHITE : L_INK;
    const sc = scrimRgb(textColor);
    const lums = zone.px.map(([r, g, b, xf]) => {
      const a = scrimAlphaAt(xf, alpha);
      return luminance(r * (1 - a) + sc[0] * a, g * (1 - a) + sc[1] * a, b * (1 - a) + sc[2] * a);
    });
    const worstL = textColor === WHITE ? pct(lums, WORST_PCT) : pct(lums, 1 - WORST_PCT);
    const mean = lums.reduce((s, v) => s + v, 0) / lums.length;
    return { worst: contrast(lt, worstL), mean: contrast(lt, mean), meanL: mean };
  }

  function minContrast(zones, textColor, alpha) {
    return Math.min(...zones.map((z) => zoneContrast(z, textColor, alpha).worst));
  }

  function neededAlpha(zones, textColor) {
    if (minContrast(zones, textColor, 0) >= SCRIM_TARGET) return 0;
    if (minContrast(zones, textColor, SCRIM_MAX) < SCRIM_TARGET) return null;
    let lo = 0, hi = SCRIM_MAX;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (minContrast(zones, textColor, mid) >= SCRIM_TARGET) hi = mid; else lo = mid;
    }
    return Math.ceil(hi * 100) / 100;
  }

  const stdev = (a) => {
    const m = a.reduce((s, v) => s + v, 0) / a.length;
    return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length);
  };

  /* 판정: 두 후보(검정 계열 INK·흰색) 중
     1) 그늘 막 없이 4.5:1 넘는 쪽이 있으면 → 그중 대비가 더 높은 쪽 (템플릿은 항상 여기서 끝남)
     2) 둘 다 안 되면(사진 밝기 편차가 큼) → 평균 밝기 기준 글자색 + 4.5:1 되는 최소 진하기 그늘 막 */
  function evaluate(ctx, w, h, zones, opts) {
    const allowScrim = !opts || opts.allowScrim !== false;
    const zs = samplePixels(ctx, w, h, zones);
    const allL = [].concat(...zs.map((z) => z.px.map(([r, g, b]) => luminance(r, g, b))));
    const meanL = allL.reduce((s, v) => s + v, 0) / allL.length;
    const cand = [INK, WHITE].map((c) => ({ c, worst0: minContrast(zs, c, 0), mean: contrast(c === WHITE ? 1 : L_INK, meanL) }));
    const pass = cand.filter((x) => x.worst0 >= MIN_CONTRAST).sort((a, b) => b.worst0 - a.worst0);
    let textColor, alpha = 0;
    if (pass.length) textColor = pass[0].c;
    else if (!allowScrim) textColor = cand.sort((a, b) => b.worst0 - a.worst0)[0].c;
    else {
      // 글자 영역 평균 밝기와 대비가 큰 쪽을 글자색으로 → 그 색 기준으로 필요한 만큼만 그늘 막
      textColor = cand.slice().sort((a, b) => b.mean - a.mean)[0].c;
      alpha = neededAlpha(zs, textColor) ?? SCRIM_MAX;
    }
    const perZone = zs.map((z) => ({ key: z.key, ...zoneContrast(z, textColor, alpha) }));
    return {
      textColor,
      scrimAlpha: alpha,
      minContrast: Math.min(...perZone.map((z) => z.worst)),
      perZone,
      lumMean: meanL,
      lumStd: stdev(allL),
    };
  }

  const api = {
    INK, WHITE, MIN_CONTRAST, WORST_PCT, SCRIM_MAX, SCRIM_TARGET, SCRIM_SOLID_UNTIL, SCRIM_FADE_END, TEXT_ZONES, TEMPLATES,
    hexToRgb, luminance, contrast, paintBackground, paintGradient, coverRect, scrimCss, evaluate,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CardBg = api;
})(typeof window !== 'undefined' ? window : globalThis);
