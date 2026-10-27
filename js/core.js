// Wspólne narzędzia: połączenie z bazą, kolory lokalu, pieczątki, kod QR.
(function () {
  const CFG = window.APP_CONFIG || {};
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true } });

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function plural(n, one, few, many) {
    if (n === 1) return one;
    const d = n % 10, h = n % 100;
    return d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
  }
  const stampsWord = (n) => n + ' ' + plural(n, 'pieczątka', 'pieczątki', 'pieczątek');

  // Wywołanie funkcji w bazie; błąd zamieniamy na czytelny komunikat po polsku
  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, args || {});
    if (error) {
      const msg = /Failed to fetch|NetworkError/i.test(error.message) ? 'Brak połączenia z internetem. Spróbuj jeszcze raz.' : error.message;
      throw new Error(msg);
    }
    return data;
  }

  // Kolor tekstu, który będzie czytelny na danym tle
  function onColor(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(n >> 16 & 255) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255);
    return L > 0.4 ? '#1A1714' : '#FFFFFF';
  }

  function applyTheme(b) {
    const r = document.documentElement.style;
    r.setProperty('--brand', b.color_bg);
    r.setProperty('--accent', b.color_accent);
    r.setProperty('--on-brand', onColor(b.color_bg));
    r.setProperty('--on-accent', onColor(b.color_accent));
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', b.color_bg);
  }

  function initials(name) { return String(name || '').trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase(); }

  function logoHtml(b, cls) {
    return b.logo_url
      ? '<img class="' + cls + '" src="' + esc(b.logo_url) + '" alt="">'
      : '<div class="' + cls + '" aria-hidden="true">' + esc(initials(b.name)) + '</div>';
  }

  const ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    gift: '<svg class="stamp__gift" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="M12 9v12M3 13h18M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    insta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
    fb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h-2a4 4 0 0 0-4 4v3H7v4h2v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h2z"/></svg>',
    web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>'
  };

  const rewardsOf = (b) => (b.rewards || []).map((r) => ({ at: +r.at, label: String(r.label) })).sort((x, y) => x.at - y.at);

  // Siatka pieczątek; pola z nagrodą mają ikonę prezentu
  function stampGrid(b, stamps, animateFrom) {
    const goal = b.stamps_goal, rw = rewardsOf(b);
    const cols = goal % 5 === 0 ? 5 : goal % 6 === 0 ? 6 : goal % 4 === 0 ? 4 : 5;
    let html = '<div class="stamps stamps--' + cols + '" role="img" aria-label="' + stamps + ' z ' + goal + ' pieczątek">';
    for (let i = 1; i <= goal; i++) {
      const filled = i <= stamps, reward = rw.some((r) => r.at === i);
      const cls = ['stamp', filled ? 'is-filled' : '', reward ? 'is-reward' : '', animateFrom != null && i > animateFrom && filled ? 'is-new' : ''].join(' ');
      html += '<div class="' + cls + '">' + (filled ? ICON.check : reward ? ICON.gift : i) + '</div>';
    }
    return html + '</div>';
  }

  // Co dalej na karcie (tekst dla klienta)
  function progress(b, stamps) {
    const rw = rewardsOf(b);
    const next = rw.find((r) => r.at > stamps);
    const ready = rw.filter((r) => r.at <= stamps);
    if (stamps >= b.stamps_goal) return { head: 'Karta pełna! Odbierz nagrodę: ' + rw[rw.length - 1].label, sub: 'Pokaż kod przy kasie. Potem zaczynasz nową kartę.' };
    if (next && next.at - stamps === 1) return { head: 'Przy następnej pieczątce: ' + next.label, sub: ready.length ? 'Masz też do odebrania: ' + ready.map((r) => r.label).join(', ') + '.' : 'Pokaż kod przy kasie.' };
    const n = next.at - stamps;
    return { head: 'Jeszcze ' + stampsWord(n) + ' do: ' + next.label, sub: b.stamp_mode === 'amount' ? '1 pieczątka za każde ' + fmtMoney(b.amount_per_stamp) + ' zakupów.' : '1 pieczątka za każdą wizytę.' };
  }

  function rewardsList(b, card, redeemedLabels) {
    return '<div class="rewards">' + rewardsOf(b).map((r) => {
      const done = (redeemedLabels || []).includes(r.label);
      return '<div class="reward' + (done ? ' is-done' : '') + '"><span class="reward__at">' + r.at + '</span><span>' + esc(r.label) + '</span></div>';
    }).join('') + (b.bday_reward ? '<div class="reward"><span class="reward__at">🎂</span><span>' + esc(b.bday_reward) + ' (w dniu urodzin)</span></div>' : '') + '</div>';
  }

  // Nagrody już wydane na obecnej karcie (od ostatniego „nowa karta”)
  function redeemedNow(card) {
    const out = [];
    for (const v of card.visits || []) {
      if (v.kind === 'new_card') break;
      if (v.kind === 'reward') out.push(v.label);
    }
    return out;
  }

  function fmtMoney(v) { return Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' zł'; }
  const SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  function fmtShort(iso) { const d = new Date(iso); return d.getDate() + ' ' + SHORT[d.getMonth()] + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function fmtBday(d, m) { return d && m ? d + ' ' + MONTHS[m - 1] : ''; }

  function visitText(v) {
    if (v.kind === 'stamp') return '+' + stampsWord(v.stamps) + (v.amount ? ' (zakup ' + fmtMoney(v.amount) + ')' : '');
    if (v.kind === 'reward') return 'Nagroda: ' + v.label;
    if (v.kind === 'new_card') return 'Nowa karta';
    if (v.kind === 'birthday') return 'Prezent urodzinowy: ' + v.label;
    return v.kind;
  }

  function qrSvg(text) {
    const qr = window.qrcode(0, 'M');
    qr.addData(text); qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }

  function cardUrl(slug) { return (CFG.BASE_URL || location.origin + location.pathname.replace(/[^/]*$/, '')) + '?l=' + encodeURIComponent(slug); }

  let toastTimer;
  function toast(msg, isErr) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.className = 'toast' + (isErr ? ' toast--err' : '');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, isErr ? 5000 : 2600);
  }

  const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
  function bdaySelects(d, m) {
    return '<div class="grid2"><select name="day" aria-label="Dzień urodzin"><option value="">Dzień</option>' + DAYS.map((x) => '<option' + (x === d ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>' +
      '<select name="month" aria-label="Miesiąc urodzin"><option value="">Miesiąc</option>' + MONTHS.map((x, i) => '<option value="' + (i + 1) + '"' + (i + 1 === m ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>';
  }

  window.WW = { CFG, sb, esc, $, $$, plural, stampsWord, rpc, onColor, applyTheme, initials, logoHtml, ICON, rewardsOf, stampGrid, progress, rewardsList, redeemedNow, fmtMoney, fmtShort, fmtBday, visitText, qrSvg, cardUrl, toast, bdaySelects };
})();
