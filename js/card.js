// Karta klienta: dołączenie do programu lokalu i podgląd pieczątek.
(function () {
  const { rpc, esc, $, $$, applyTheme, logoHtml, ICON, stampGrid, progress, rewardsList, redeemedNow, qrSvg, fmtShort, visitText, bdaySelects, toast } = window.WW;
  const main = $('#main');
  const STORE = 'ww.cards';   // { slug: token }
  const LAST = 'ww.last';

  const store = {
    all() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } },
    set(slug, token) { const a = store.all(); a[slug] = token; try { localStorage.setItem(STORE, JSON.stringify(a)); localStorage.setItem(LAST, slug); } catch (e) {} },
    remove(slug) { const a = store.all(); delete a[slug]; try { localStorage.setItem(STORE, JSON.stringify(a)); } catch (e) {} },
    last() { try { return localStorage.getItem(LAST); } catch (e) { return null; } }
  };

  let current = null; // { card, business }
  let poll;

  async function start() {
    const q = new URLSearchParams(location.search);
    const token = q.get('t'), slug = (q.get('l') || '').toLowerCase();
    try {
      if (token) {
        const res = await rpc('get_my_card', { p_token: token });
        if (!res) return message('Nie znaleziono karty', 'Link jest nieaktualny. Poproś obsługę lokalu o nowy.');
        store.set(res.business.slug, token);
        history.replaceState(null, '', '?l=' + encodeURIComponent(res.business.slug));
        return showCard(res);
      }
      const target = slug || store.last();
      if (target && store.all()[target]) {
        const res = await rpc('get_my_card', { p_token: store.all()[target] });
        if (res) return showCard(res);
        store.remove(target);
      }
      if (slug) {
        const b = await rpc('get_business', { p_slug: slug });
        if (!b) return message('Nie ma takiego lokalu', 'Sprawdź link albo zeskanuj kod QR w lokalu jeszcze raz.');
        return showJoin(b);
      }
      return showList();
    } catch (e) {
      message('Coś poszło nie tak', e.message);
    }
  }

  function message(head, sub) {
    main.innerHTML = '<div class="box center" style="margin-top:20vh"><h1>' + esc(head) + '</h1><p class="muted">' + esc(sub) + '</p></div>';
  }

  // Lista kart z różnych lokali (albo ekran powitalny)
  async function showList() {
    const slugs = Object.keys(store.all());
    if (!slugs.length) {
      main.innerHTML = '<div class="stack" style="margin-top:12vh"><h1>Twoje karty stałego klienta</h1>' +
        '<p class="muted">Zeskanuj kod QR w lokalu, który korzysta z WartoWracać, a jego karta pojawi się tutaj.</p></div>' + footer();
      return;
    }
    main.innerHTML = '<h1>Twoje karty</h1><div class="list" id="cards"><div class="spinner"></div></div>' + footer();
    const rows = await Promise.all(slugs.map((s) => rpc('get_my_card', { p_token: store.all()[s] }).catch(() => null)));
    $('#cards').innerHTML = rows.filter(Boolean).map((r) =>
      '<a class="item" href="?l=' + esc(r.business.slug) + '">' + logoHtml(r.business, 'item__av') +
      '<div class="grow"><div class="item__name">' + esc(r.business.name) + '</div><div class="item__sub">' + r.card.stamps + ' z ' + r.business.stamps_goal + ' pieczątek</div></div></a>').join('') || '<p class="item muted">Brak kart.</p>';
  }

  // Formularz dołączenia do programu
  function showJoin(b) {
    applyTheme(b);
    document.title = 'Karta stałego klienta · ' + b.name;
    const rw = window.WW.rewardsOf(b);
    main.innerHTML =
      '<div class="lcard"><div class="lcard__top">' + logoHtml(b, 'lcard__logo') + '<div><div class="lcard__name">' + esc(b.name) + '</div><div class="lcard__who">Karta stałego klienta</div></div></div>' +
      stampGrid(b, 0) +
      '<div class="lcard__msg">' + esc(rw.map((r) => r.at + '. pieczątka: ' + r.label).join(' · ')) +
      '<small>' + (b.stamp_mode === 'amount' ? '1 pieczątka za każde ' + window.WW.fmtMoney(b.amount_per_stamp) + ' zakupów' : '1 pieczątka za każdą wizytę') + (b.bday_reward ? ' · w urodziny: ' + esc(b.bday_reward) : '') + '</small></div></div>' +
      (b.active ? '<form class="box" id="join" novalidate><h2>Załóż kartę</h2>' +
        '<label>Imię<input name="name" type="text" autocomplete="given-name" required maxlength="80"></label>' +
        '<label>Telefon <span class="hint">Opcjonalnie. Pomoże odzyskać kartę, jeśli zmienisz telefon.</span><input name="phone" type="tel" autocomplete="tel" maxlength="30"></label>' +
        (b.bday_reward ? '<label>Urodziny <span class="hint">Opcjonalnie. W dniu urodzin czeka prezent.</span></label>' + bdaySelects() : '') +
        '<label class="check"><input type="checkbox" name="ok" required><span>Akceptuję <a href="regulamin.html" target="_blank">regulamin</a> i <a href="prywatnosc.html" target="_blank">zasady prywatności</a>.</span></label>' +
        '<p class="err" id="err" role="alert"></p>' +
        '<button class="btn btn--accent btn--big btn--block" type="submit">Załóż kartę</button></form>'
        : '<div class="box"><p>Ten lokal chwilowo nie przyjmuje nowych kart.</p></div>') + footer();
    const form = $('#join');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form), err = $('#err');
      err.textContent = '';
      if (String(f.get('name') || '').trim().length < 2) return (err.textContent = 'Podaj imię.');
      if (!f.get('ok')) return (err.textContent = 'Zaznacz zgodę na regulamin.');
      const btn = form.querySelector('button'); btn.disabled = true;
      try {
        const res = await rpc('register_card', { p_slug: b.slug, p_name: f.get('name'), p_phone: f.get('phone') || '', p_day: +f.get('day') || null, p_month: +f.get('month') || null });
        store.set(b.slug, res.card.token);
        showCard(res, true);
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    });
  }

  function showCard(res, fresh) {
    const prev = current && current.card.id === res.card.id ? current.card.stamps : null;
    current = res;
    const { card, business: b } = res;
    applyTheme(b);
    document.title = b.name + ' · Moja karta';
    const p = progress(b, card.stamps);
    const others = Object.keys(store.all()).filter((s) => s !== b.slug);
    const bdayNow = b.bday_reward && card.bday_today && card.birthday_used_year !== new Date().getFullYear();
    const links = [
      b.booking_url && ['Umów wizytę', b.booking_url, ICON.calendar],
      b.phone && ['Zadzwoń', 'tel:' + b.phone.replace(/\s/g, ''), ICON.phone],
      b.instagram_url && ['Instagram', b.instagram_url, ICON.insta],
      b.facebook_url && ['Facebook', b.facebook_url, ICON.fb],
      b.website_url && ['Strona', b.website_url, ICON.web],
      b.address && ['Dojazd', 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.address), ICON.pin]
    ].filter(Boolean);

    main.innerHTML =
      (others.length ? '<div class="row row--between"><a class="btn btn--sm btn--ghost" href="./?l=" id="all">← Wszystkie karty</a></div>' : '') +
      (fresh ? '<div class="box box--accent"><b>Karta założona!</b><p class="small muted">Dodaj ją do ekranu głównego telefonu, żeby mieć ją zawsze pod ręką.</p></div>' : '') +
      (bdayNow ? '<div class="box box--accent"><h2>🎂 Wszystkiego najlepszego, ' + esc(card.name) + '!</h2><p>Dziś czeka na Ciebie prezent: <b>' + esc(b.bday_reward) + '</b>. Pokaż kod przy kasie.</p></div>' : '') +
      '<div class="lcard"><div class="lcard__top">' + logoHtml(b, 'lcard__logo') + '<div class="grow"><div class="lcard__name">' + esc(b.name) + '</div><div class="lcard__who">' + esc(card.name) + (card.cards_completed ? ' · pełnych kart: ' + card.cards_completed : '') + '</div></div></div>' +
      stampGrid(b, card.stamps, prev) +
      '<div class="lcard__msg">' + esc(p.head) + '<small>' + esc(p.sub) + '</small></div></div>' +
      '<div class="box"><h3 class="center">Pokaż ten kod przy kasie</h3><div class="qr">' + qrSvg(card.code) + '</div><div class="code">' + esc(card.code) + '</div></div>' +
      '<div class="box"><h3>Nagrody</h3>' + rewardsList(b, card, redeemedNow(card)) + '</div>' +
      (links.length ? '<div class="links">' + links.map((l) => '<a class="link-tile" href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + l[2] + esc(l[0]) + '</a>').join('') + '</div>' : '') +
      installBox() +
      (card.visits.length ? '<details class="box"><summary><b>Historia</b></summary><div class="stack small">' + card.visits.map((v) => '<div class="row row--between"><span>' + esc(visitText(v)) + '</span><span class="muted">' + fmtShort(v.created_at) + '</span></div>').join('') + '</div></details>' : '') +
      footer();

    const all = $('#all');
    if (all) all.addEventListener('click', (e) => { e.preventDefault(); try { localStorage.removeItem(LAST); } catch (x) {} history.pushState(null, '', './'); showList(); });
    bindInstall();
    if (prev != null && card.stamps > prev) toast('Nowa pieczątka! 🎉');
    clearInterval(poll);
    poll = setInterval(refresh, 15000);
  }

  async function refresh() {
    if (document.hidden || !current) return;
    try {
      const res = await rpc('get_my_card', { p_token: store.all()[current.business.slug] });
      if (res && (res.card.stamps !== current.card.stamps || res.card.visits.length !== current.card.visits.length)) showCard(res);
    } catch (e) { /* bez internetu: spróbujemy za chwilę */ }
  }
  document.addEventListener('visibilitychange', refresh);

  // Podpowiedź „dodaj do ekranu głównego”
  let deferred;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; const b = $('#installBtn'); if (b) b.hidden = false; });
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  function installBox() {
    if (standalone()) return '';
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return '<div class="box"><h3>Miej kartę zawsze pod ręką</h3>' +
      (ios ? '<p class="small">W Safari stuknij <b>Udostępnij</b> (kwadrat ze strzałką), potem <b>Do ekranu początkowego</b>.</p>'
           : '<p class="small">Dodaj kartę do ekranu głównego: menu przeglądarki (⋮) → <b>Dodaj do ekranu głównego</b>.</p><button class="btn btn--primary" id="installBtn" hidden>Dodaj do ekranu głównego</button>') + '</div>';
  }
  function bindInstall() {
    const b = $('#installBtn');
    if (!b) return;
    if (deferred) b.hidden = false;
    b.addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; b.hidden = true; });
  }

  function footer() { return '<p class="foot">Karta działa dzięki <a href="https://wartowracac.pl" target="_blank" rel="noopener">WartoWracać</a></p>'; }

  window.addEventListener('popstate', start);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  start();
})();
