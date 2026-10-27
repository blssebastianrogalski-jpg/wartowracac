// Panel lokalu: logowanie, klienci, pieczątki, nagrody, ustawienia karty, zespół.
(function () {
  const W = window.WW;
  const { sb, rpc, esc, $, $$, applyTheme, logoHtml, stampGrid, progress, rewardsOf, redeemedNow, qrSvg, fmtShort, fmtBday, fmtMoney, visitText, bdaySelects, toast, stampsWord, initials, cardUrl, CFG } = W;
  const main = $('#main'), nav = $('#nav');
  const BIZ_KEY = 'ww.panel.biz';

  const CATEGORIES = [
    ['paznokcie', 'Paznokcie i pedicure'], ['fryzjer', 'Fryzjer'], ['barber', 'Barber'], ['beauty', 'Kosmetyczka / beauty'],
    ['masaz', 'Masaż / SPA'], ['bistro', 'Bistro / kawiarnia'], ['restauracja', 'Restauracja / pizzeria'], ['inne', 'Inne']
  ];
  const PRESETS = {
    paznokcie: { stamp_mode: 'visit', stamps_goal: 8, rewards: [{ at: 8, label: '−50% na manicure' }] },
    fryzjer: { stamp_mode: 'visit', stamps_goal: 10, rewards: [{ at: 5, label: '−15%' }, { at: 10, label: 'Strzyżenie gratis' }] },
    barber: { stamp_mode: 'visit', stamps_goal: 10, rewards: [{ at: 10, label: 'Strzyżenie gratis' }] },
    beauty: { stamp_mode: 'visit', stamps_goal: 10, rewards: [{ at: 5, label: '−15%' }, { at: 10, label: '−30%' }] },
    masaz: { stamp_mode: 'visit', stamps_goal: 10, rewards: [{ at: 5, label: '−15%' }, { at: 10, label: '−30%' }] },
    bistro: { stamp_mode: 'visit', stamps_goal: 10, rewards: [{ at: 5, label: 'Kawa gratis' }, { at: 10, label: 'Obiad gratis' }] },
    restauracja: { stamp_mode: 'amount', amount_per_stamp: 30, stamps_goal: 10, rewards: [{ at: 10, label: 'Pizza gratis' }] },
    inne: { stamp_mode: 'visit', stamps_goal: 10, rewards: [{ at: 10, label: 'Nagroda' }] }
  };

  const S = { user: null, list: [], biz: null, role: null, info: null, view: 'clients', query: '' };

  // ---------- start i logowanie ----------

  async function boot() {
    const { data } = await sb.auth.getSession();
    S.user = data.session ? data.session.user : null;
    if (!S.user) return showAuth('login');
    await loadBusinesses();
  }

  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') return showNewPassword();
    if (ev === 'SIGNED_OUT') { S.user = null; showAuth('login'); }
  });

  function showAuth(mode, note) {
    nav.hidden = true;
    applyTheme({ color_bg: '#14110F', color_accent: '#E0B354' });
    const T = { login: ['Zaloguj się', 'Zaloguj'], signup: ['Załóż konto lokalu', 'Załóż konto'], reset: ['Nie pamiętasz hasła?', 'Wyślij link'] }[mode];
    main.innerHTML =
      '<div class="stack" style="margin-top:6vh"><div class="head"><div class="head__logo">WW</div><div><div class="head__name">' + esc(CFG.APP_NAME || 'WartoWracać') + '</div><div class="head__sub">Panel lokalu</div></div></div>' +
      '<form class="box" id="auth" novalidate><h1>' + T[0] + '</h1>' +
      (mode === 'signup' ? '<p class="muted small">30 dni za darmo. Bez karty płatniczej.</p>' : '') +
      (note ? '<p class="ok">' + esc(note) + '</p>' : '') +
      '<label>E-mail<input name="email" type="email" autocomplete="email" required></label>' +
      (mode !== 'reset' ? '<label>Hasło' + (mode === 'signup' ? ' <span class="hint">Co najmniej 8 znaków.</span>' : '') + '<input name="password" type="password" autocomplete="' + (mode === 'signup' ? 'new-password' : 'current-password') + '" required minlength="8"></label>' : '') +
      (mode === 'signup' ? '<label class="check"><input type="checkbox" name="ok" required><span>Akceptuję <a href="regulamin.html" target="_blank">regulamin usługi</a> i <a href="prywatnosc.html" target="_blank">zasady przetwarzania danych</a>.</span></label>' : '') +
      '<p class="err" id="err" role="alert"></p>' +
      '<button class="btn btn--accent btn--big btn--block" type="submit">' + T[1] + '</button>' +
      '<div class="row row--between small">' +
      (mode === 'login' ? '<a href="#" data-mode="signup">Załóż konto lokalu</a><a href="#" data-mode="reset">Nie pamiętam hasła</a>' : '<a href="#" data-mode="login">← Mam już konto</a>') +
      '</div></form></div>';
    $$('[data-mode]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); showAuth(a.dataset.mode); }));
    const form = $('#auth');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form), err = $('#err'), btn = form.querySelector('button[type=submit]');
      const email = String(f.get('email') || '').trim(), password = String(f.get('password') || '');
      err.textContent = '';
      if (!/^\S+@\S+\.\S+$/.test(email)) return (err.textContent = 'Wpisz poprawny adres e-mail.');
      if (mode !== 'reset' && password.length < 8) return (err.textContent = 'Hasło musi mieć co najmniej 8 znaków.');
      if (mode === 'signup' && !f.get('ok')) return (err.textContent = 'Zaznacz akceptację regulaminu.');
      btn.disabled = true;
      const back = location.origin + location.pathname;
      let res;
      if (mode === 'login') res = await sb.auth.signInWithPassword({ email, password });
      else if (mode === 'signup') res = await sb.auth.signUp({ email, password, options: { emailRedirectTo: back } });
      else res = await sb.auth.resetPasswordForEmail(email, { redirectTo: back });
      btn.disabled = false;
      if (res.error) return (err.textContent = authError(res.error.message));
      if (mode === 'reset') return showAuth('login', 'Wysłałem link do zmiany hasła. Sprawdź skrzynkę.');
      if (mode === 'signup' && !res.data.session) return showAuth('login', 'Konto założone. Kliknij link w e-mailu, a potem zaloguj się tutaj.');
      S.user = res.data.user || res.data.session.user;
      await loadBusinesses();
    });
  }

  function authError(m) {
    if (/Invalid login/i.test(m)) return 'Zły e-mail albo hasło.';
    if (/already registered/i.test(m)) return 'To konto już istnieje. Zaloguj się.';
    if (/Email not confirmed/i.test(m)) return 'Najpierw kliknij link w e-mailu, który wysłaliśmy przy zakładaniu konta.';
    if (/rate limit/i.test(m)) return 'Za dużo prób. Spróbuj za kilka minut.';
    return m;
  }

  function showNewPassword() {
    nav.hidden = true;
    main.innerHTML = '<form class="box" id="np" style="margin-top:10vh"><h1>Nowe hasło</h1><label>Hasło <span class="hint">Co najmniej 8 znaków.</span><input name="p" type="password" autocomplete="new-password" minlength="8" required></label><p class="err" id="err"></p><button class="btn btn--accent btn--big btn--block">Zapisz hasło</button></form>';
    $('#np').addEventListener('submit', async (e) => {
      e.preventDefault();
      const p = new FormData(e.target).get('p');
      if (String(p).length < 8) return ($('#err').textContent = 'Hasło musi mieć co najmniej 8 znaków.');
      const { error } = await sb.auth.updateUser({ password: p });
      if (error) return ($('#err').textContent = error.message);
      toast('Hasło zmienione');
      boot();
    });
  }

  // ---------- lokale ----------

  async function loadBusinesses(selectId) {
    main.innerHTML = '<div class="spinner"></div>';
    try { S.list = await rpc('my_businesses'); } catch (e) { return fatal(e); }
    if (!S.list.length) return showCreate();
    let want = selectId;
    try { want = want || localStorage.getItem(BIZ_KEY); } catch (e) {}
    const pick = S.list.find((x) => x.business.id === want) || S.list[0];
    selectBusiness(pick);
  }

  function selectBusiness(x) {
    S.biz = x.business; S.role = x.role; S.info = x; S.canStamp = x.can_stamp !== false;
    try { localStorage.setItem(BIZ_KEY, S.biz.id); } catch (e) {}
    applyTheme(S.biz);
    nav.hidden = false;
    go('clients');
  }

  function fatal(e) { main.innerHTML = '<div class="box"><h2>Coś poszło nie tak</h2><p>' + esc(e.message) + '</p><button class="btn" onclick="location.reload()">Spróbuj ponownie</button></div>'; }

  const slugify = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

  function showCreate(first) {
    nav.hidden = true;
    main.innerHTML = '<form class="box" id="create" style="margin-top:4vh" novalidate><h1>Twój lokal</h1><p class="muted small">Ustawienia karty zmienisz później w każdej chwili.</p>' +
      '<label>Nazwa lokalu<input name="name" type="text" required maxlength="80" placeholder="np. Studio Paznokci Ola"></label>' +
      '<label>Branża<select name="category">' + CATEGORIES.map((c) => '<option value="' + c[0] + '">' + c[1] + '</option>').join('') + '</select></label>' +
      '<label>Adres karty <span class="hint">Pod tym adresem klienci zakładają kartę.</span><input name="slug" type="text" required maxlength="40" autocapitalize="off" spellcheck="false"></label>' +
      '<p class="small muted" id="slugPrev"></p><p class="err" id="err" role="alert"></p>' +
      '<button class="btn btn--accent btn--big btn--block" type="submit">Utwórz kartę lokalu</button>' +
      (S.list.length ? '<button class="btn btn--ghost" type="button" id="cancel">Anuluj</button>' : '<button class="btn btn--ghost" type="button" id="logout">Wyloguj</button>') + '</form>';
    const form = $('#create'), name = form.name, slug = form.slug;
    let touched = false;
    const prev = () => { $('#slugPrev').textContent = cardUrl(slug.value || '…'); };
    name.addEventListener('input', () => { if (!touched) slug.value = slugify(name.value); prev(); });
    slug.addEventListener('input', () => { touched = true; slug.value = slugify(slug.value); prev(); });
    prev();
    const c = $('#cancel'); if (c) c.addEventListener('click', () => selectBusiness(S.info));
    const l = $('#logout'); if (l) l.addEventListener('click', () => sb.auth.signOut());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#err'); err.textContent = '';
      if (name.value.trim().length < 2) return (err.textContent = 'Podaj nazwę lokalu.');
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const b = await rpc('create_business', { p_name: name.value, p_slug: slug.value, p_category: form.category.value });
        await rpc('update_business', { p_business: b.id, p: PRESETS[form.category.value] || PRESETS.inne }).catch(() => {});
        await loadBusinesses(b.id);
        go('settings');
        toast('Lokal utworzony. Ustaw logo, kolory i nagrody.');
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    });
  }

  // ---------- nawigacja ----------

  function go(view, arg) {
    S.view = view;
    $$('#nav button').forEach((b) => { if (b.dataset.go === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    window.scrollTo(0, 0);
    if (view === 'clients') return showClients();
    if (view === 'scan') return startScan();
    if (view === 'settings') return showSettings();
    if (view === 'more') return showMore();
    if (view === 'card') return showCard(arg);
    if (view === 'team') return showTeam();
    if (view === 'poster') return showPoster();
    if (view === 'newClient') return showNewClient();
  }
  nav.addEventListener('click', (e) => { const b = e.target.closest('button[data-go]'); if (b) go(b.dataset.go); });

  function header() {
    const st = S.info.status, days = Math.ceil((new Date(S.info.trial_until) - new Date()) / 86400000);
    return '<div class="head">' + logoHtml(S.biz, 'head__logo') + '<div class="grow"><div class="head__name">' + esc(S.biz.name) + '</div><div class="head__sub">' +
      (S.role === 'owner' ? 'Właściciel' : 'Pracownik') + ' · ' + (S.info.plan === 'pro' ? 'Pro' : 'Start') + '</div></div>' +
      (S.list.length > 1 ? '<button class="btn btn--sm" id="switch">Zmień lokal</button>' : '') + '</div>' +
      (st === 'paused' ? '<div class="box box--accent"><b>Konto wstrzymane.</b><p class="small">Dodawanie pieczątek jest wyłączone. Sprawdź płatność za abonament.</p></div>' : '') +
      (st === 'trial' ? '<p class="small muted">' + (days > 0 ? 'Okres próbny: jeszcze ' + days + ' ' + W.plural(days, 'dzień', 'dni', 'dni') : 'Okres próbny się skończył') + '</p>' : '');
  }
  function bindHeader() { const s = $('#switch'); if (s) s.addEventListener('click', showSwitch); }

  function showSwitch() {
    main.innerHTML = '<h1>Wybierz lokal</h1><div class="list">' + S.list.map((x, i) => '<button class="item" data-i="' + i + '">' + logoHtml(x.business, 'item__av') + '<div class="grow"><div class="item__name">' + esc(x.business.name) + '</div><div class="item__sub">' + (x.role === 'owner' ? 'Właściciel' : 'Pracownik') + '</div></div></button>').join('') + '</div>' +
      '<button class="btn" id="add">+ Dodaj kolejny lokal</button>';
    $$('[data-i]').forEach((b) => b.addEventListener('click', () => selectBusiness(S.list[+b.dataset.i])));
    $('#add').addEventListener('click', () => showCreate());
  }

  // ---------- klienci ----------

  let searchTimer;
  async function showClients() {
    main.innerHTML = header() +
      '<button class="btn btn--accent btn--big btn--block" id="scanBtn">Skanuj kod klienta</button>' +
      '<form class="row" id="codeForm"><input class="grow" name="code" type="text" placeholder="albo wpisz kod z karty, np. K7Q2MX" autocapitalize="characters" spellcheck="false" style="flex:1"><button class="btn">Szukaj</button></form>' +
      '<div class="row row--between"><h2>Klienci</h2><button class="btn btn--sm" id="newBtn">+ Nowy klient</button></div>' +
      '<input type="search" id="q" placeholder="Szukaj po imieniu lub telefonie" value="' + esc(S.query) + '">' +
      '<div id="list"><div class="spinner"></div></div>';
    bindHeader();
    $('#scanBtn').addEventListener('click', () => go('scan'));
    $('#newBtn').addEventListener('click', () => go('newClient'));
    $('#codeForm').addEventListener('submit', (e) => { e.preventDefault(); openByCode(e.target.code.value); });
    $('#q').addEventListener('input', (e) => { S.query = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(loadList, 250); });
    loadList();
  }

  async function loadList() {
    const box = $('#list');
    if (!box) return;
    try {
      const rows = await rpc('list_cards', { p_business: S.biz.id, p_query: S.query });
      if (!rows.length) { box.innerHTML = '<div class="box center muted">' + (S.query ? 'Nikogo nie znaleziono.' : 'Nie ma jeszcze klientów. Wydrukuj plakat z kodem QR (Więcej → Plakat) i postaw go przy kasie.') + '</div>'; return; }
      const quick = S.biz.stamp_mode === 'visit' && S.canStamp;
      box.innerHTML = '<div class="list">' + rows.map((r) => '<div class="item"><button class="item item--link" data-id="' + r.id + '"><div class="item__av">' + esc(initials(r.name)) + '</div><div class="grow"><div class="item__name">' + esc(r.name) + (r.bday_today ? ' 🎂' : '') + '</div><div class="item__sub">' +
        r.stamps + '/' + S.biz.stamps_goal + (r.phone ? ' · ' + esc(r.phone) : '') + (r.last_visit ? ' · ' + fmtShort(r.last_visit) : '') + '</div></div></button>' +
        (quick && r.stamps < S.biz.stamps_goal ? '<button class="btn btn--sm btn--accent" data-plus="' + r.id + '" aria-label="Dodaj pieczątkę: ' + esc(r.name) + '">+1</button>' : '') + '</div>').join('') + '</div>';
      $$('[data-id]', box).forEach((b) => b.addEventListener('click', () => go('card', b.dataset.id)));
      $$('[data-plus]', box).forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try { const c = await rpc('add_stamps', { p_card: b.dataset.plus, p_count: 1, p_amount: null }); toast('+1 pieczątka: ' + c.name + ' (' + c.stamps + '/' + S.biz.stamps_goal + ')'); loadList(); }
        catch (e) { toast(e.message, true); b.disabled = false; }
      }));
    } catch (e) { box.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
  }

  async function openByCode(code) {
    code = String(code || '').trim();
    if (!code) return;
    try {
      const c = await rpc('find_card', { p_business: S.biz.id, p_code: code });
      if (!c) return toast('Nie ma takiej karty w Twoim lokalu.', true);
      go('card', c.id);
    } catch (e) { toast(e.message, true); }
  }

  function showNewClient() {
    main.innerHTML = '<button class="btn btn--sm btn--ghost" id="back">← Klienci</button><form class="box" id="nc" novalidate><h1>Nowy klient</h1><p class="small muted">Dla osoby bez telefonu przy sobie. Potem wyślesz jej link do karty SMS-em.</p>' +
      '<label>Imię<input name="name" type="text" required maxlength="80"></label>' +
      '<label>Telefon<input name="phone" type="tel" maxlength="30"></label>' +
      (S.biz.bday_reward ? '<label>Urodziny <span class="hint">Opcjonalnie.</span></label>' + bdaySelects() : '') +
      '<p class="err" id="err"></p><button class="btn btn--accent btn--big btn--block">Załóż kartę</button></form>';
    $('#back').addEventListener('click', () => go('clients'));
    $('#nc').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (String(f.get('name')).trim().length < 2) return ($('#err').textContent = 'Podaj imię.');
      try {
        const c = await rpc('create_card_staff', { p_business: S.biz.id, p_name: f.get('name'), p_phone: f.get('phone') || '', p_day: +f.get('day') || null, p_month: +f.get('month') || null });
        S.newToken = { id: c.id, token: c.token };
        go('card', c.id);
      } catch (ex) { $('#err').textContent = ex.message; }
    });
  }

  // ---------- karta klienta ----------

  async function showCard(id, prevStamps) {
    main.innerHTML = '<div class="spinner"></div>';
    let c;
    try { c = await rpc('get_card', { p_card: id }); } catch (e) { return fatal(e); }
    if (!c) return go('clients');
    const b = S.biz, rw = rewardsOf(b), done = redeemedNow(c), p = progress(b, c.stamps);
    const ready = S.canStamp ? rw.filter((r) => r.at <= c.stamps && !done.includes(r.label)) : [];
    const full = c.stamps >= b.stamps_goal;
    const year = new Date().getFullYear();
    const bday = S.canStamp && b.bday_reward && c.bday_today && c.birthday_used_year !== year;
    const share = S.newToken && S.newToken.id === c.id ? cardUrl(b.slug).replace(/\?l=.*$/, '') + '?t=' + S.newToken.token : null;
    const smsBody = share ? 'Twoja karta stałego klienta w ' + b.name + ': ' + share : '';
    const lastStamp = S.canStamp && c.visits[0] && c.visits[0].kind === 'stamp' && Date.now() - new Date(c.visits[0].created_at) < 86400000;

    main.innerHTML =
      '<button class="btn btn--sm btn--ghost" id="back">← Klienci</button>' +
      '<div class="lcard"><div class="lcard__top"><div class="lcard__logo">' + esc(initials(c.name)) + '</div><div class="grow"><div class="lcard__name">' + esc(c.name) + (c.bday_today ? ' 🎂' : '') + '</div><div class="lcard__who">' +
      esc([c.phone, c.bday_day ? 'urodziny ' + fmtBday(c.bday_day, c.bday_month) : '', c.cards_completed ? 'pełnych kart: ' + c.cards_completed : ''].filter(Boolean).join(' · ')) + '</div></div></div>' +
      stampGrid(b, c.stamps, prevStamps) + '<div class="lcard__msg">' + esc(p.head) + '</div></div>' +
      (share ? '<div class="box box--accent"><b>Wyślij klientowi link do karty</b><p class="small">Po kliknięciu karta otworzy się w jego telefonie.</p><div class="row"><a class="btn btn--primary" href="sms:' + esc((c.phone || '').replace(/\s/g, '')) + '?&body=' + encodeURIComponent(smsBody) + '">Wyślij SMS</a><button class="btn" id="copy">Kopiuj link</button></div></div>' : '') +
      (bday ? '<div class="box box--accent"><b>🎂 Dziś urodziny!</b><p class="small">Prezent: ' + esc(b.bday_reward) + '</p><button class="btn btn--accent" id="bday">Wydaj prezent urodzinowy</button></div>' : '') +
      (ready.length ? '<div class="box box--accent"><b>Nagroda do wydania</b>' + ready.map((r) => '<button class="btn btn--accent btn--block" data-at="' + r.at + '">Wydaj: ' + esc(r.label) + '</button>').join('') +
        (full ? '<p class="small muted">Po wydaniu ostatniej nagrody karta zacznie się od nowa.</p>' : '') + '</div>' : '') +
      (!S.canStamp ? '<div class="box"><p class="small">Nie masz uprawnień do dodawania pieczątek. Właściciel może je włączyć w zakładce Zespół.</p></div>' : full ? '' : (b.stamp_mode === 'amount'
        ? '<form class="box" id="amount"><label>Kwota zakupu (zł) <span class="hint">1 pieczątka za każde ' + fmtMoney(b.amount_per_stamp) + '</span><input name="a" type="number" inputmode="decimal" min="0" step="0.01" required></label><button class="btn btn--accent btn--big btn--block">Dodaj pieczątki</button><button class="btn btn--sm" type="button" data-add="1">albo +1 pieczątka ręcznie</button></form>'
        : '<div class="box"><button class="btn btn--accent btn--big btn--block" data-add="1">+1 pieczątka</button><div class="row"><button class="btn btn--sm" data-add="2">+2</button><button class="btn btn--sm" data-add="3">+3</button></div></div>')) +
      (lastStamp ? '<button class="btn btn--sm btn--ghost" id="undo">Cofnij ostatnią pieczątkę</button>' : '') +
      '<details class="box"><summary><b>Historia</b></summary><div class="stack small">' + (c.visits.length ? c.visits.map((v) => '<div class="row row--between"><span>' + esc(visitText(v)) + '</span><span class="muted">' + fmtShort(v.created_at) + '</span></div>').join('') : '<p class="muted">Brak wpisów.</p>') + '</div></details>' +
      '<p class="small muted">Kod karty: <b>' + esc(c.code) + '</b></p>' +
      (S.role === 'owner' ? '<button class="btn btn--sm btn--danger" id="del">Usuń kartę</button>' : '');

    $('#back').addEventListener('click', () => go('clients'));
    const act = async (fn, args, msg) => {
      $$('button', main).forEach((x) => (x.disabled = true));
      try { await rpc(fn, args); toast(msg); showCard(id, c.stamps); }
      catch (e) { toast(e.message, true); $$('button', main).forEach((x) => (x.disabled = false)); }
    };
    $$('[data-add]').forEach((x) => x.addEventListener('click', () => act('add_stamps', { p_card: id, p_count: +x.dataset.add, p_amount: null }, 'Dodano ' + stampsWord(+x.dataset.add))));
    const am = $('#amount');
    if (am) am.addEventListener('submit', (e) => {
      e.preventDefault();
      const a = parseFloat(String(e.target.a.value).replace(',', '.'));
      if (!(a > 0)) return toast('Wpisz kwotę zakupu.', true);
      act('add_stamps', { p_card: id, p_count: null, p_amount: a }, 'Pieczątki dodane');
    });
    $$('[data-at]').forEach((x) => x.addEventListener('click', () => act('redeem_reward', { p_card: id, p_at: +x.dataset.at }, 'Nagroda wydana')));
    const bd = $('#bday'); if (bd) bd.addEventListener('click', () => act('use_birthday', { p_card: id }, 'Prezent urodzinowy wydany'));
    const un = $('#undo'); if (un) un.addEventListener('click', () => act('undo_stamp', { p_card: id }, 'Cofnięto ostatnią pieczątkę'));
    const cp = $('#copy'); if (cp) cp.addEventListener('click', () => navigator.clipboard.writeText(share).then(() => toast('Link skopiowany')));
    const del = $('#del');
    if (del) del.addEventListener('click', async () => {
      if (!confirm('Usunąć kartę ' + c.name + ' razem z historią? Tego nie da się cofnąć.')) return;
      try { await rpc('delete_card', { p_card: id }); toast('Karta usunięta'); go('clients'); } catch (e) { toast(e.message, true); }
    });
  }

  // ---------- skaner QR ----------

  function loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/jsQR.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }

  async function startScan() {
    let stream, stopped = false;
    const ov = document.createElement('div');
    ov.className = 'scanner';
    ov.innerHTML = '<video playsinline muted></video><div class="scanner__frame"><div></div></div><div class="scanner__bar"><button class="btn btn--big">Zamknij</button></div>';
    document.body.appendChild(ov);
    const stop = (code) => {
      stopped = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      ov.remove();
      if (code) openByCode(code); else go('clients');
    };
    ov.querySelector('button').addEventListener('click', () => stop());
    try {
      await loadJsQR();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e) {
      stop();
      return toast('Nie mam dostępu do aparatu. Wpisz kod ręcznie albo zezwól na aparat w ustawieniach przeglądarki.', true);
    }
    const video = ov.querySelector('video');
    video.srcObject = stream;
    await video.play().catch(() => {});
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      if (stopped) return;
      if (video.readyState >= 2) {
        const w = Math.min(640, video.videoWidth), h = Math.round(video.videoHeight * (w / video.videoWidth));
        canvas.width = w; canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const r = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (r && r.data) { if (navigator.vibrate) navigator.vibrate(80); return stop(r.data); }
      }
      requestAnimationFrame(tick);
    };
    tick();
  }

  // ---------- ustawienia karty ----------

  function showSettings() {
    if (S.role !== 'owner') {
      main.innerHTML = header() + '<div class="box"><p>Ustawienia karty może zmieniać tylko właściciel lokalu.</p></div>';
      return bindHeader();
    }
    const b = S.biz, rw = rewardsOf(b);
    const rewardRow = (r, i) => '<div class="row" data-rw><input type="number" min="1" max="20" value="' + (r ? r.at : '') + '" aria-label="Nagroda ' + (i + 1) + ': numer pieczątki" style="width:80px" name="rat"><input type="text" maxlength="40" value="' + esc(r ? r.label : '') + '" aria-label="Nagroda ' + (i + 1) + ': opis" placeholder="np. Kawa gratis" style="flex:1" name="rlabel"></div>';
    main.innerHTML = header() +
      '<div id="preview"></div>' +
      '<form class="stack" id="set" novalidate>' +
      '<div class="box"><h2>Wygląd</h2>' +
      '<label>Nazwa lokalu<input name="name" type="text" maxlength="80" value="' + esc(b.name) + '"></label>' +
      '<label>Branża<select name="category">' + CATEGORIES.map((c) => '<option value="' + c[0] + '"' + (c[0] === b.category ? ' selected' : '') + '>' + c[1] + '</option>').join('') + '</select></label>' +
      '<div class="stack"><b class="small">Logo</b><div class="row">' + logoHtml(b, 'head__logo') + '<label class="btn btn--sm" style="flex-direction:row">Wgraj logo<input type="file" id="logo" accept="image/png,image/jpeg,image/webp" hidden></label>' + (b.logo_url ? '<button class="btn btn--sm btn--ghost" type="button" id="nologo">Usuń</button>' : '') + '</div><p class="hint">Kwadratowe, PNG lub JPG, do 1 MB.</p></div>' +
      '<div class="grid2"><label>Kolor karty<input name="color_bg" type="color" value="' + b.color_bg + '"></label><label>Kolor pieczątek<input name="color_accent" type="color" value="' + b.color_accent + '"></label></div></div>' +
      '<div class="box"><h2>Pieczątki i nagrody</h2>' +
      '<label>Za co pieczątka<select name="stamp_mode"><option value="visit"' + (b.stamp_mode === 'visit' ? ' selected' : '') + '>Za każdą wizytę / zakup</option><option value="amount"' + (b.stamp_mode === 'amount' ? ' selected' : '') + '>Za kwotę zakupu</option></select></label>' +
      '<label id="amtRow"' + (b.stamp_mode === 'amount' ? '' : ' hidden') + '>1 pieczątka za każde (zł)<input name="amount_per_stamp" type="number" min="1" step="1" value="' + (b.amount_per_stamp || 30) + '"></label>' +
      '<label>Ile pieczątek na karcie<input name="stamps_goal" type="number" min="3" max="20" value="' + b.stamps_goal + '"></label>' +
      '<div class="stack"><b class="small">Nagrody <span class="hint">(numer pieczątki i co klient dostaje; ostatnia pieczątka musi mieć nagrodę)</span></b>' + [0, 1, 2, 3].map((i) => rewardRow(rw[i], i)).join('') + '</div>' +
      '<label>Prezent urodzinowy <span class="hint">Puste = bez prezentu. Np. „−20% w dniu urodzin”.</span><input name="bday_reward" type="text" maxlength="60" value="' + esc(b.bday_reward || '') + '"></label></div>' +
      '<div class="box"><h2>Kontakt na karcie</h2><p class="hint">Puste pola się nie pokażą.</p>' +
      '<label>Rezerwacje (np. link do Booksy)<input name="booking_url" type="url" value="' + esc(b.booking_url || '') + '" placeholder="https://"></label>' +
      '<label>Telefon<input name="phone" type="tel" value="' + esc(b.phone || '') + '"></label>' +
      '<label>Adres<input name="address" type="text" value="' + esc(b.address || '') + '"></label>' +
      '<label>Instagram<input name="instagram_url" type="url" value="' + esc(b.instagram_url || '') + '" placeholder="https://instagram.com/…"></label>' +
      '<label>Facebook<input name="facebook_url" type="url" value="' + esc(b.facebook_url || '') + '" placeholder="https://facebook.com/…"></label>' +
      '<label>Strona www<input name="website_url" type="url" value="' + esc(b.website_url || '') + '" placeholder="https://"></label></div>' +
      '<p class="err" id="err" role="alert"></p><button class="btn btn--accent btn--big btn--block">Zapisz</button></form>';
    bindHeader();
    const form = $('#set');

    const collect = () => {
      const f = new FormData(form);
      const rewards = $$('[data-rw]', form).map((r) => ({ at: +r.querySelector('[name=rat]').value, label: r.querySelector('[name=rlabel]').value.trim() })).filter((r) => r.at && r.label);
      const p = {};
      ['name', 'category', 'color_bg', 'color_accent', 'stamp_mode', 'bday_reward', 'booking_url', 'phone', 'address', 'instagram_url', 'facebook_url', 'website_url'].forEach((k) => (p[k] = String(f.get(k) || '').trim()));
      p.stamps_goal = +f.get('stamps_goal');
      p.amount_per_stamp = p.stamp_mode === 'amount' ? String(f.get('amount_per_stamp') || '') : '';
      p.rewards = rewards;
      return p;
    };
    const preview = () => {
      const p = collect();
      const fake = Object.assign({}, S.biz, p, { stamps_goal: Math.min(20, Math.max(3, p.stamps_goal || 10)), rewards: p.rewards.length ? p.rewards : S.biz.rewards });
      applyTheme(fake);
      const demo = Math.max(0, Math.floor(fake.stamps_goal / 2) - 1);
      $('#preview').innerHTML = '<p class="small muted">Podgląd karty klienta</p><div class="lcard"><div class="lcard__top">' + logoHtml(fake, 'lcard__logo') + '<div><div class="lcard__name">' + esc(fake.name) + '</div><div class="lcard__who">Anna</div></div></div>' + stampGrid(fake, demo) + '<div class="lcard__msg">' + esc(safeProgress(fake, demo)) + '</div></div>';
      $('#amtRow').hidden = p.stamp_mode !== 'amount';
    };
    form.addEventListener('input', preview);
    preview();

    $('#logo').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 1048576) return toast('Logo jest za duże (maks. 1 MB).', true);
      const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const path = S.biz.id + '/logo-' + Date.now() + '.' + ext;
      const { error } = await sb.storage.from('logos').upload(path, file, { upsert: true, contentType: file.type });
      if (error) return toast('Nie udało się wgrać logo: ' + error.message, true);
      const url = sb.storage.from('logos').getPublicUrl(path).data.publicUrl;
      await save({ logo_url: url }, 'Logo zapisane');
    });
    const nl = $('#nologo'); if (nl) nl.addEventListener('click', () => save({ logo_url: '' }, 'Logo usunięte'));

    form.addEventListener('submit', (e) => { e.preventDefault(); save(collect(), 'Zapisano'); });

    async function save(p, msg) {
      $('#err').textContent = '';
      try {
        const b2 = await rpc('update_business', { p_business: S.biz.id, p });
        S.biz = b2; S.info.business = b2;
        toast(msg);
        showSettings();
      } catch (ex) { $('#err').textContent = ex.message; toast(ex.message, true); }
    }
  }
  function safeProgress(b, s) { try { return progress(b, s).head; } catch (e) { return ''; } }

  // ---------- więcej: zespół, plakat, statystyki ----------

  async function showMore() {
    main.innerHTML = header() +
      '<div class="stats" id="stats"><div class="spinner"></div></div>' +
      '<div class="list">' +
      '<button class="item" data-go2="poster"><div class="grow"><div class="item__name">Plakat z kodem QR</div><div class="item__sub">Do wydruku przy kasie i link do karty</div></div></button>' +
      '<button class="item" data-go2="team"><div class="grow"><div class="item__name">Zespół</div><div class="item__sub">Konta pracowników</div></div></button>' +
      '<button class="item" id="addBiz"><div class="grow"><div class="item__name">Dodaj kolejny lokal</div></div></button>' +
      (S.list.length > 1 ? '<button class="item" id="sw"><div class="grow"><div class="item__name">Zmień lokal</div></div></button>' : '') +
      '<a class="item" href="admin.html" id="adm" hidden><div class="grow"><div class="item__name">Administracja usługi</div></div></a>' +
      '<button class="item" id="out"><div class="grow"><div class="item__name">Wyloguj</div><div class="item__sub">' + esc(S.user ? S.user.email : '') + '</div></div></button>' +
      '</div>' + (CFG.CONTACT_EMAIL ? '<p class="small muted center">Pomoc: <a href="mailto:' + esc(CFG.CONTACT_EMAIL) + '">' + esc(CFG.CONTACT_EMAIL) + '</a></p>' : '');
    bindHeader();
    $$('[data-go2]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go2)));
    $('#addBiz').addEventListener('click', () => showCreate());
    const sw = $('#sw'); if (sw) sw.addEventListener('click', showSwitch);
    $('#out').addEventListener('click', () => sb.auth.signOut());
    rpc('is_admin').then((a) => { if (a) $('#adm').hidden = false; }).catch(() => {});
    try {
      const s = await rpc('business_stats', { p_business: S.biz.id });
      const st = $('#stats'); if (!st) return;
      st.innerHTML = [['Klientów z kartą', s.cards], ['Nowych kart (30 dni)', s.new_30], ['Pieczątek (30 dni)', s.stamps_30], ['Powracających (30 dni)', s.returning_30]].map((x) => '<div class="stat"><b>' + x[1] + '</b><span>' + x[0] + '</span></div>').join('');
    } catch (e) { const st = $('#stats'); if (st) st.innerHTML = ''; }
  }

  function showPoster() {
    const url = cardUrl(S.biz.slug), b = S.biz;
    const rw = rewardsOf(b);
    main.innerHTML = '<button class="btn btn--sm btn--ghost" id="back">← Więcej</button>' +
      '<div class="poster">' + logoHtml(b, 'head__logo') + '<div class="poster__title">' + esc(b.name) + '</div><div><b>Zbieraj pieczątki w telefonie</b></div>' + qrSvg(url) +
      '<div>' + esc(rw.map((r) => r.at + '. pieczątka: ' + r.label).join(' · ')) + '</div><div class="small">Zeskanuj aparatem telefonu i załóż kartę w 20 sekund.<br>Bez instalowania aplikacji.</div></div>' +
      '<div class="row"><button class="btn btn--primary" id="print">Drukuj plakat</button><button class="btn" id="copy">Kopiuj link</button></div>' +
      '<p class="small muted">Link do karty: <a href="' + esc(url) + '" target="_blank">' + esc(url) + '</a>. Wklej go na Instagram, Facebook i do Booksy.</p>';
    $('#back').addEventListener('click', () => go('more'));
    $('#print').addEventListener('click', () => window.print());
    $('#copy').addEventListener('click', () => navigator.clipboard.writeText(url).then(() => toast('Link skopiowany')));
  }

  async function showTeam() {
    main.innerHTML = '<button class="btn btn--sm btn--ghost" id="back">← Więcej</button><h1>Zespół</h1><div id="team"><div class="spinner"></div></div>' +
      (S.role === 'owner' ? '<form class="box" id="add"><h3>Dodaj pracownika</h3><p class="small muted">Pracownik najpierw zakłada konto w tym panelu („Załóż konto lokalu”, bez tworzenia lokalu), a potem wpisujesz tu jego e-mail.</p><input name="email" type="email" placeholder="e-mail pracownika" required><button class="btn btn--accent">Dodaj</button></form>' : '');
    $('#back').addEventListener('click', () => go('more'));
    const render = (rows) => {
      $('#team').innerHTML = '<div class="list">' + rows.map((r) => '<div class="item"><div class="grow"><div class="item__name">' + esc(r.email) + (r.me ? ' (Ty)' : '') + '</div><div class="item__sub">' + (r.role === 'owner' ? 'Właściciel · dodaje pieczątki' : 'Pracownik' + (r.can_stamp ? ' · dodaje pieczątki' : ' · tylko podgląd')) + '</div>' +
        (S.role === 'owner' && r.role === 'staff' ? '<label class="check small"><input type="checkbox" data-can="' + r.user_id + '"' + (r.can_stamp ? ' checked' : '') + '><span>Może dodawać pieczątki i wydawać nagrody</span></label>' : '') + '</div>' +
        (S.role === 'owner' && r.role === 'staff' ? '<button class="btn btn--sm btn--danger" data-rm="' + r.user_id + '">Usuń</button>' : '') + '</div>').join('') + '</div>';
      $$('[data-can]').forEach((b) => b.addEventListener('change', async () => {
        try { render(await rpc('set_staff_stamp', { p_business: S.biz.id, p_user: b.dataset.can, p_can: b.checked })); toast(b.checked ? 'Pracownik może dodawać pieczątki' : 'Pracownik ma tylko podgląd'); } catch (e) { toast(e.message, true); }
      }));
      $$('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Odebrać dostęp do panelu?')) return;
        try { render(await rpc('remove_staff', { p_business: S.biz.id, p_user: b.dataset.rm })); } catch (e) { toast(e.message, true); }
      }));
    };
    try { render(await rpc('list_team', { p_business: S.biz.id })); } catch (e) { $('#team').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
    const add = $('#add');
    if (add) add.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { render(await rpc('add_staff', { p_business: S.biz.id, p_email: e.target.email.value })); e.target.reset(); toast('Pracownik dodany'); } catch (ex) { toast(ex.message, true); }
    });
  }

  // Pracownik bez własnego lokalu: zamiast formularza „Twój lokal” krótka informacja
  const _showCreate = showCreate;
  showCreate = function () {
    if (!S.list.length && !S._askedCreate) {
      S._askedCreate = true;
      nav.hidden = true;
      main.innerHTML = '<div class="box" style="margin-top:8vh"><h1>Witaj!</h1><p>Zakładasz kartę dla swojego lokalu, czy pracujesz w lokalu, który już ją ma?</p>' +
        '<button class="btn btn--accent btn--big btn--block" id="own">Zakładam kartę dla mojego lokalu</button>' +
        '<button class="btn btn--block" id="emp">Jestem pracownikiem</button></div>';
      $('#own').addEventListener('click', () => _showCreate());
      $('#emp').addEventListener('click', () => {
        main.innerHTML = '<div class="box" style="margin-top:8vh"><h1>Prawie gotowe</h1><p>Poproś właściciela lokalu, żeby dodał Cię w panelu (Więcej → Zespół) po adresie <b>' + esc(S.user.email) + '</b>. Potem odśwież tę stronę.</p><button class="btn btn--accent" onclick="location.reload()">Odśwież</button><button class="btn btn--ghost" id="lo">Wyloguj</button></div>';
        $('#lo').addEventListener('click', () => sb.auth.signOut());
      });
      return;
    }
    _showCreate();
  };

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  boot();
})();
