# WartoWracać – pierwsza wersja

Osobna aplikacja dla wielu lokali. Nie ma nic wspólnego z bazą studia „Twoje Ciało Twój Dobrostan”.

## Co jest w środku
- `index.html` – karta klienta (adres lokalu: `?l=nazwa-lokalu`).
- `panel.html` – panel lokalu: konto, klienci, skanowanie QR, pieczątki, nagrody, ustawienia karty, zespół, plakat.
- `admin.html` – mój panel: wszystkie lokale, pakiet, status, okres próbny.
- `supabase/schema.sql` – baza danych (wkleja się raz w nowym projekcie Supabase).
- `regulamin.html`, `prywatnosc.html` – na razie zaślepki, treść przed startem płatnym.

## Uruchomienie (krok po kroku przeprowadzi Claude)
1. Nowy projekt Supabase (region Europa), SQL Editor → wklej `supabase/schema.sql` → Run.
2. Adres i klucz projektu wpisać do `config.js`.
3. Wgrać pliki do repozytorium `wartowracac` i włączyć GitHub Pages.
4. Podpiąć domenę wartowracac.pl.
5. Założyć swoje konto w panelu i nadać sobie administratora (polecenie na końcu `schema.sql`).
