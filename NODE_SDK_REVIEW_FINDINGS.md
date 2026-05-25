# Review PDFBolt Node SDK przed publikacja

Data: 2026-05-25

Zakres:

- SDK: `/home/michal/IdeaProjects/pdfbolt-node`
- Backend produkcyjny: `/home/michal/IdeaProjects/pdfbolt`
- Dokumentacja/landing page: `/home/michal/IdeaProjects/pdfbolt-landing-page`

Cel review: sprawdzic notatke z Jiry dotyczaca `User-Agent`, `Retry-After` / `retryAfterMs`, `filename` z `Content-Disposition`, rate-limit metadata na success resultach oraz temat retry w SDK. Kluczowe zalozenie: SDK nie powinno miec transportowych retry, bo retry konwersji async sa obslugiwane przez backendowy parametr `retryDelays`.

## Najwazniejszy wniosek

Najwiekszy problem przed release to publiczne retry w SDK (`maxRetries`, `retryDelayMs`). Sa wystawione w typach, zaimplementowane w kliencie HTTP i opisane w README. To moze powielac konwersje, tworzyc podwojne joby async albo naliczac kredyty wiecej niz raz. Ten mechanizm trzeba usunac przed publikacja.

`Retry-After` nie istnieje po stronie backendu i nie powinien byc dodawany do SDK. Obecny brak `retryAfterMs` w SDK jest poprawny.

Backend produkcyjny realnie wspiera `Content-Disposition` z prostym `filename="..."` oraz rate-limit headery na udanych, autoryzowanych requestach. SDK moze to expose'owac, ale trzeba doprecyzowac publiczny ksztalt API.

## Decyzje uzytkownika

### 1. SDK transport retries

Decyzja: **usunac**.

Rekomendowana implementacja:

- Usunac `maxRetries` i `retryDelayMs` z `PDFBoltClientOptions`.
- Usunac `maxRetries` z `PDFBoltRequestOptions`.
- Usunac retry loop z `src/http.ts`.
- Usunac `shouldRetryStatus` i `delay`.
- Usunac dokumentacje retry z README.
- Zostawic tylko backendowy async parametr `retryDelays`.
- Dodac testy, ze `503`, `504`, `429` i network error nie sa ponawiane.

### 2. Domyslny User-Agent SDK

Decyzja: **dodac**.

Rekomendacja: ustawic domyslny header:

```http
User-Agent: pdfbolt-node/1.0.0
```

Wartosc powinna byc skladana z `VERSION`. Nie dodajemy client-level `userAgent` option.

Wazne rozroznienie:

- SDK `User-Agent` to header requestu do PDFBolt API, np. `pdfbolt-node/1.0.0`.
- `extraHTTPHeaders` to parametr konwersji przekazywany do Chromium/Playwright, czyli header dla strony renderowanej do PDF.

Przed publikacja trzeba zrobic smoke test historycznego edge-case:

```json
{"html":""}
```

z domyslnym `User-Agent`, najlepiej na staging/test API albo kontrolowanym prod smoke tescie.

### 3. Retry-After / retryAfterMs

Decyzja: **nie dodawac**.

Uzasadnienie: backend nie wysyla `Retry-After`, nie ma `retryAfterMs` po stronie kontraktu API i nie powinno tego byc w SDK. Jezeli backend kiedys zacznie wysylac standardowy `Retry-After`, wtedy mozna wrocic do tematu.

### 4. `result.filename`

Decyzja: **zostawic, jesli dziala poprawnie dla wartosci obslugiwanych przez backend**.

Weryfikacja zachowania:

- `filename: "invoice"` -> backend dopisze `.pdf`, header bedzie `filename="invoice.pdf"`, SDK zwroci `result.filename === "invoice.pdf"`.
- `filename: "invoice.pdf"` -> backend zostawi nazwe, SDK zwroci `"invoice.pdf"`.
- `filename: "invoice.PDF"` -> backend uzna, ze rozszerzenie juz jest, SDK zwroci `"invoice.PDF"`.
- `filename: null` albo brak `filename` -> header bedzie bez filename, SDK zwroci `result.filename === null`.
- `filename: ""` -> backend odrzuca request jako 400.
- `filename` ze spacja, slash, backslash, srednikiem, cudzyslowem, non-ASCII itd. -> backend odrzuca request jako 400, bo dozwolone sa tylko `a-z`, `A-Z`, `0-9`, `.`, `_`, `-`.
- `filename` dluzszy niz 255 znakow -> backend odrzuca request jako 400.

Wniosek: dla aktualnego produkcyjnego kontraktu backendu obecny parser SDK bedzie dzialal poprawnie, bo backend generuje tylko prosty format:

```http
Content-Disposition: inline; filename="invoice.pdf"
Content-Disposition: attachment; filename="invoice.pdf"
```

Nie obsluguje to ogolnego standardu HTTP `filename*`, escaped quotes ani srednikow w quoted filename, ale te przypadki sa obecnie nieosiagalne przez publiczny backendowy parametr `filename`.

Rekomendacja: zostawic `result.filename`. Dodatkowo warto dodac testy dla wartosci obslugiwanych przez backend.

### 5. Ksztalt `rateLimit`

Decyzja: **zmienic na nested shape**, zgodny z backendowymi headerami.

Backend nadal wysyla plaskie headery:

```http
x-pdfbolt-limit-minute
x-pdfbolt-remaining-minute
x-pdfbolt-limit-hour
x-pdfbolt-remaining-hour
x-pdfbolt-limit-day
x-pdfbolt-remaining-day
```

SDK powinno mapowac je na strukture:

```ts
result.rateLimit.minute.limit
result.rateLimit.minute.remaining
result.rateLimit.hour.limit
result.rateLimit.hour.remaining
result.rateLimit.day.limit
result.rateLimit.day.remaining
```

Wazne: to jest zmiana ksztaltu SDK, nie backendu. Backend zostaje bez zmian.

### 6. `conversionCost` na sync resultach

Decyzja: **dodac**.

Backend i docs juz wspieraja `x-pdfbolt-conversion-cost` dla `/v1/sync`, a SDK wystawia koszt tylko dla direct.

Rekomendowana implementacja:

- Dodac `conversionCost: number | null` do `SyncConversionResult`.
- Parsowac `x-pdfbolt-conversion-cost` w `SyncResource.convert`.
- Dodac test jednostkowy.
- Zaktualizowac README.

### 7. Eksport typow webhook helperow

Decyzja: **wyeksportowac**.

O co chodzilo w pytaniu: w `src/webhooks.ts` istnieja typy:

```ts
WebhookRawBody
WebhookVerificationOptions
```

Ale uzytkownik TypeScript nie moze ich importowac bezposrednio z glownego entrypointu:

```ts
import type { WebhookVerificationOptions } from "@pdfbolt/node";
```

bo `src/index.ts` ich nie eksportuje.

Rekomendacja techniczna: to niski koszt i niskie ryzyko, warto wyeksportowac te typy z root entrypointu. Nie zmienia to runtime SDK, tylko poprawia wygode TypeScript.

Rekomendowana implementacja:

- Wyeksportowac `WebhookRawBody` i `WebhookVerificationOptions` z `src/index.ts`.
- Dodac test albo typecheck potwierdzajacy, ze da sie zrobic:

```ts
import type { WebhookVerificationOptions } from "@pdfbolt/node";
```

### 8. Wersja Node

Decyzja: **podbic wymaganie do Node 24 i dodac checki**.

Rekomendowana implementacja:

- Zmienic `package.json`:

```json
"engines": {
  "node": ">=24"
}
```

- Zaktualizowac README z Node 24+.
- Dodac `.nvmrc` z:

```text
24
```

- Dodac release/CI check na Node 24.
- Dodac walidacje release z `engine-strict`, np.:

```bash
npm_config_engine_strict=true npm ci
npm test
```

### 9. Tarball / publish smoke test

Decyzja: **dodac**.

Rekomendowana implementacja:

- Dodac test/skrypt release smoke:

```bash
npm run build
npm pack --dry-run --json
```

- Zweryfikowac, ze tarball zawiera:

```text
dist/esm/index.js
dist/esm/index.d.ts
dist/cjs/index.js
dist/cjs/package.json
README.md
LICENSE
package.json
```

- Zweryfikowac, ze tarball nie zawiera:

```text
src/
test/
examples/
.env
.env.example
```

- Dodatkowo zainstalowac zbudowany tarball w tymczasowym consumerze i sprawdzic:

```js
await import("@pdfbolt/node")
require("@pdfbolt/node")
```

### 10. Integration tests

Decyzja: **rozszerzyc**.

Minimalny zestaw przed publikacja:

- `direct.fromUrl`
- `sync.fromUrl`
- `direct.fromHtml` z `isEncoded: true`
- `filename` + `Content-Disposition`
- rate-limit headers na successful `direct`, `sync`, `async`, `usage`
- invalid auth
- opcjonalnie async webhook test za env varami
- opcjonalnie template conversion za `PDFBOLT_TEMPLATE_ID`
- smoke test pustego HTML po dodaniu default `User-Agent`

## Szczegolowe findingi

### 1. High: publiczne retry w SDK trzeba usunac

SDK retry support istnieje w kilku miejscach:

- `src/types.ts:7` expose'uje `maxRetries` i `retryDelayMs`.
- `src/types.ts:16` expose'uje request-level `maxRetries`.
- `src/utils/request-options.ts:6` usuwa `maxRetries` z body i traktuje jako opcje SDK.
- `src/http.ts:123` retry'uje `503` / `504`.
- `src/http.ts:144` retry'uje transport failures i SDK HTTP timeouty.
- `README.md:283` i `README.md:293` dokumentuja retry.

Backend async retries to inny mechanizm:

- `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/domain/conversion/api/service/ConversionService.kt:255`
- `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/domain/model/repository/ApiCallRepository.kt:99`
- `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/domain/conversion/api/job/AsyncConversionJob.kt:181`
- `../pdfbolt-landing-page/docs/api-endpoints/async.mdx:216`

Ryzyko: retry w SDK moze powtorzyc request po tym, jak backend juz go przyjal lub wykonal.

### 2. High: testy retry trzeba zastapic regresja braku retry

Obecnie `test/client.test.js` nie ma testow `maxRetries`. Po usunieciu retry trzeba dodac testy, ktore potwierdzaja, ze SDK nie powtarza requestow.

### 3. Medium: brak domyslnego SDK User-Agent

SDK ustawia `User-Agent` tylko gdy caller poda `userAgent`:

- `src/types.ts:10`
- `src/http.ts:161`

Decyzja po doprecyzowaniu kontraktu: usunac opcje `userAgent` z klienta i zawsze wysylac `User-Agent: pdfbolt-node/<VERSION>`. Nie mieszac tego z `extraHTTPHeaders`, bo to parametr konwersji dla Chromium/Playwright.

Backend potrafi logowac i zapisywac User-Agent:

- `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/platform/filter/HttpLoggerFilter.kt:44`
- `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/platform/misc/Util.kt:53`
- `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/domain/model/entity/ApiCall.kt:76`
- `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/domain/conversion/api/service/ConversionService.kt:112`

### 4. Medium: `Retry-After` nie jest kontraktem API

Backendowy 429 nie ustawia `Retry-After`:

- `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/domain/conversion/api/filter/RateLimitFilter.kt:71`
- `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/domain/conversion/api/filter/RateLimitFilter.kt:88`

Docs mowia to samo:

- `../pdfbolt-landing-page/docs/rate-limits/index.mdx:44`
- `../pdfbolt-landing-page/docs/error-handling/index.mdx:107`

SDK nie powinno dodawac `retryAfterMs`.

### 5. Medium: rate-limit metadata na 429 jest best-effort

SDK ma gettery na `PDFBoltRateLimitError`:

- `src/errors.ts:101` do `:123`

Ale produkcyjny backend zwykle nie zwroci tych headerow na 429, bo headery sa ustawiane dopiero po przejsciu rate-limit checka:

- success path: `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/domain/conversion/api/filter/RateLimitFilter.kt:61`
- 429 path: `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/domain/conversion/api/filter/RateLimitFilter.kt:79`

Wniosek: gettery moga zostac jako best-effort, ale README i testy nie powinny sugerowac, ze sa gwarantowane na 429.

### 6. Medium: success `rateLimit` jest wspierany, ale SDK shape ma byc nested

Backend produkcyjny ustawia headery:

- `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/domain/conversion/api/filter/RateLimitFilter.kt:61` do `:68`

SDK obecnie parsuje je plasko:

- `src/rate-limit.ts:3` do `:10`

Decyzja: zmienic publiczny shape na nested, mapujac te same backendowe headery.

### 7. Medium: free-tools nie zwraca rate-limit headers

`pdfbolt-free-tools` nie ustawia odpowiednikow `x-pdfbolt-limit-*` w filtrze:

- `../pdfbolt-free-tools/src/main/kotlin/com/msz/pdfbolt/domain/conversion/api/filter/RateLimitFilter.kt:63`

Wniosek: jesli SDK bedzie uzywane z demo API przez `baseUrl`, `rateLimit` moze byc `null`. To nie blokuje SDK dla production API.

### 8. Medium: sync nie expose'uje `conversionCost`

Backend sync ustawia `x-pdfbolt-conversion-cost`:

- `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/domain/conversion/api/controller/ConversionController.kt:78`

Docs mowia, ze header dotyczy `/v1/sync`:

- `../pdfbolt-landing-page/docs/api-endpoints/index.mdx:68`

SDK nie ma `conversionCost` w `SyncConversionResult`:

- `src/types.ts:225`
- `src/resources/sync.ts:27`

### 9. Medium: `filename` jest bezpieczny dla aktualnego backendowego formatu

Backend generuje prosty header:

- `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/domain/conversion/api/controller/ConversionController.kt:52`

Backend waliduje filename:

- `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/domain/conversion/api/dto/Deserializers.kt:251`

Backend dopisuje `.pdf`:

- `../pdfbolt/src/main/kotlin/com/msz/pdfbolt/platform/misc/Util.kt:129`

SDK parser:

- `src/direct-result.ts:55`

Wniosek: zostawic `result.filename`, jezeli testy potwierdza zachowanie dla wszystkich wartosci dozwolonych przez backend. Backend nie generuje trudnych przypadkow, ktorych parser nie obsluguje.

Rekomendowana implementacja:

- Zostawic `DirectConversionResult.filename`.
- Dodac testy dla `filename: "invoice"`, `filename: "invoice.pdf"`, `filename: "invoice.PDF"` i braku filename.
- Dodac test, ze parser zwraca `null`, gdy `Content-Disposition` nie zawiera filename.
- Nie trzeba obslugiwac `filename*`, srednikow ani escaped quotes jako wymogu release, bo backendowy parametr `filename` nie dopuszcza takich wartosci.

### 10. Low: typy webhook helperow nie sa eksportowane z root

Typy istnieja:

- `src/webhooks.ts:5`
- `src/webhooks.ts:7`

Root export ich nie wystawia:

- `src/index.ts:4`

Decyzja: wyeksportowac te typy z root entrypointu.

### 11. Medium: Node 24 musi byc egzekwowany

Obecnie:

- `package.json:25` wymaga Node `>=22`
- `README.md:13` mowi Node 22+

Decyzja: Node 24+ z `.nvmrc` i checkami.

### 12. Medium: package powinien byc testowany jako tarball

Aktualne testy importuja lokalny `dist`:

- `test/client.test.js:16`
- `test/cjs.test.cjs:3`

To nie sprawdza realnego zainstalowanego package przez `exports`.

### 13. Medium: integration coverage jest za waskie

Integration tests sa opt-in:

- `test/integration.test.js:9`

Aktualnie pokrywaja tylko:

- usage
- direct HTML
- sync HTML
- invalid auth

Trzeba rozszerzyc przed release.

### 14. Low: docs landing page nie maja jeszcze oficjalnych przykladow SDK

Node quick-start nadal pokazuje raw `fetch`, a nie `@pdfbolt/node`:

- `../pdfbolt-landing-page/docs/quick-start-guide/nodeJS.mdx:18`

To nie blokuje zmian w SDK, ale warto poprawic przed publicznym ogloszeniem.

## Rzeczy potwierdzone jako poprawne

### Brak retryAfterMs

Poprawne. Backend nie wysyla `Retry-After`, wiec SDK nie powinno expose'owac `retryAfterMs`.

### Async retryDelays

Poprawne. SDK uzywa backendowej nazwy `retryDelays`, a README poprawnie opisuje, ze chodzi o retry konwersji async, nie retry webhook delivery.

### Content-Disposition filename

Poprawne dla produkcyjnego kontraktu backendu. Parser SDK jest waski, ale backend generuje waski, bezpieczny format.

### Rate-limit headers na success

Poprawne dla produkcji. Backend wysyla headery po przejsciu rate-limit checka, SDK powinno je mapowac na nested `rateLimit`.

## Weryfikacja wykonana podczas review

Uruchomione lokalnie w `/home/michal/IdeaProjects/pdfbolt-node`:

```bash
npm ci
npm test
npm run typecheck
npm pack --dry-run
node -v
npm -v
```

Wyniki:

- `npm ci` przeszlo, ale pokazalo `EBADENGINE`, bo lokalny Node to `v20.12.2`, a package wymaga `>=22`.
- `npm test` przeszlo: 12 testow passed, integration suite skipped przez env.
- `npm run typecheck` przeszlo.
- `npm pack --dry-run` po buildzie zawieral ESM/CJS `dist` i nie zawieral `src`, `test`, examples ani env files.

## Plan napraw po decyzjach

Proponowana kolejnosc:

1. Usunac transportowe retry z SDK i README.
2. Dodac domyslny `User-Agent` oparty o `VERSION`.
3. Zmienic `rateLimit` na nested shape.
4. Dodac `conversionCost` dla sync.
5. Zostawic `filename`, dodac testy backendowego zachowania.
6. Podbic Node do 24, dodac `.nvmrc` i checki.
7. Dodac tarball install smoke test.
8. Rozszerzyc integration tests.
9. Wyeksportowac typy webhook helperow z root entrypointu.
10. Opcjonalnie zaktualizowac landing docs o oficjalne Node SDK examples.
