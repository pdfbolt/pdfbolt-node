# Szczegolowy plan naprawy PDFBolt Node SDK

Data: 2026-05-25

Status SDK: przed pierwsza publiczna publikacja, brak uzytkownikow produkcyjnych. Mozemy robic breaking changes bez warstwy kompatybilnosci.

Zasady prowadzace:

- **KISS**: proste API, brak ukrytej magii, brak compatibility shimow.
- **YAGNI**: nie dodajemy opcji, ktorych backend nie wspiera albo ktorych uzytkownik jeszcze nie potrzebuje.
- **DRY**: jedna funkcja parsowania rate-limit i conversion-cost headers, bez duplikacji getterow.
- **Separation of concerns**: SDK robi transport, typowanie i wygodne mapowanie odpowiedzi; backend odpowiada za retry konwersji async, walidacje parametrow API i rate limiting.
- **Evergreen**: Node 24+, aktualne typy Node, release smoke test paczki, brak legacy API przed pierwszym release.

## Docelowy publiczny kontrakt SDK

### Client options

```ts
export interface PDFBoltClientOptions {
  apiKey: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  fetch?: FetchLike;
}
```

Znaczenie:

- `apiKey`: wymagany.
- `baseUrl`: opcjonalny, glownie do testow/staging.
- `requestTimeoutMs`: SDK HTTP timeout, domyslnie `120_000`.
- `fetch`: opcjonalny custom fetch do testow/specjalnych runtime'ow.

Nie ma:

- `maxRetries`
- `retryDelayMs`
- `retryAfterMs`
- client-level `userAgent`

### Request options

```ts
export interface PDFBoltRequestOptions {
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}
```

Tylko realne opcje SDK. `maxRetries` znika calkowicie.

### Rate limit

Backend zostaje bez zmian i nadal wysyla plaskie HTTP headers:

```http
x-pdfbolt-limit-minute
x-pdfbolt-remaining-minute
x-pdfbolt-limit-hour
x-pdfbolt-remaining-hour
x-pdfbolt-limit-day
x-pdfbolt-remaining-day
```

SDK mapuje je na nested shape:

```ts
export interface RateLimitWindow {
  limit: number | null;
  remaining: number | null;
}

export interface RateLimitInfo {
  minute: RateLimitWindow;
  hour: RateLimitWindow;
  day: RateLimitWindow;
}
```

Przyklady:

```ts
result.rateLimit.minute.remaining
result.rateLimit.hour.limit
error.rateLimit.day.remaining
```

Wszystkie pola moga byc `null`, szczegolnie na `429`, bo backend nie gwarantuje rate-limit headers na bledach.

### Direct result

Zostaje `filename`, bez zmiany nazwy na `suggestedFilename`.

```ts
class DirectConversionResult {
  readonly buffer: Buffer;
  readonly base64: string | null;
  readonly contentType: string;
  readonly contentDisposition: string | null;
  readonly filename: string | null;
  readonly conversionCost: number | null;
  readonly rateLimit: RateLimitInfo;
  readonly headers: Headers;
  readonly size: number;
  save(filePath: string): Promise<void>;
}
```

Uzasadnienie: REST API ma parametr `filename`, backend zwraca go w `Content-Disposition`, a nazwa `result.filename` jest najprostsza dla uzytkownika. Nie robimy dodatkowego konceptu `suggestedFilename`.

### Sync result

Dodajemy `conversionCost` parsowany z `x-pdfbolt-conversion-cost`.

```ts
export interface SyncConversionResult {
  requestId: string;
  status: 'SUCCESS';
  errorCode: ConversionErrorCode | null;
  errorMessage: string | null;
  documentUrl: string | null;
  expiresAt: string | null;
  isAsync: false;
  duration: number | null;
  documentSizeMb: number | null;
  isCustomS3Bucket: boolean | null;
  conversionCost: number | null;
  rateLimit: RateLimitInfo;
}
```

Brak `conversionCost` na async acceptance result, bo `/v1/async` przy akceptacji joba nie ma jeszcze kosztu konwersji.

### Error model

Backend API ma jeden wspolny ksztalt bledu:

```ts
{
  timestamp: string;
  httpErrorCode: number;
  errorCode: ConversionErrorCode;
  errorMessage: string;
}
```

`ConversionErrorCode` w SDK musi byc zgodny z backendowym enumem `ErrorCode`, bo po uproszczeniu modelu bledow to `errorCode` jest glownym stabilnym sposobem rozrozniania przyczyn backendowych bledow.

SDK powinno to odzwierciedlac jednym backendowym bledem:

```ts
class PDFBoltAPIError extends PDFBoltError {
  readonly statusCode: number;
  readonly timestamp: string | undefined;
  readonly errorCode: ConversionErrorCode | undefined;
  readonly errorMessage: string | undefined;
  readonly rateLimit: RateLimitInfo;
  readonly headers: Headers | undefined;
  readonly rawBody: string | undefined;
}
```

Uzytkownik sprawdza konkretny przypadek po `statusCode` albo backendowym `errorCode`:

```ts
if (error instanceof PDFBoltAPIError) {
  if (error.statusCode === 401) {
    // invalid API key
  }

  if (error.errorCode === 'TOO_MANY_REQUESTS') {
    console.log(error.rateLimit.minute.remaining);
  }
}
```

Nie tworzymy osobnych klas dla kazdego statusu HTTP:

```ts
PDFBoltBadRequestError
PDFBoltAuthenticationError
PDFBoltForbiddenError
PDFBoltConversionTimeoutError
PDFBoltNotFoundError
PDFBoltPayloadTooLargeError
PDFBoltUnprocessableEntityError
PDFBoltRateLimitError
PDFBoltServiceUnavailableError
PDFBoltGatewayTimeoutError
```

Uzasadnienie KISS/evergreen:

- te klasy nie modeluja innego ksztaltu danych; prawie wszystkie roznia sie tylko `name`;
- backend i tak niesie semantyke w `httpErrorCode` / HTTP statusie oraz `errorCode`;
- jeden `PDFBoltAPIError` jest latwiejszy do dokumentacji, testow i utrzymania;
- gdy backend doda nowy `errorCode`, SDK nie musi dodawac nowej klasy bledu;
- SDK nie ma jeszcze publicznych uzytkownikow, wiec nie potrzebujemy kompatybilnosci wstecznej ani aliasow.

Zostaja tylko klasy, ktore oznaczaja inne zrodlo bledu niz backendowy error response:

```ts
PDFBoltError
PDFBoltAPIError
PDFBoltNetworkError
PDFBoltWebhookSignatureError
PDFBoltValidationError
PDFBoltConfigurationError
```

`PDFBoltAPIError.rateLimit` ma ten sam nested shape co success resulty. Nie zostawiamy plaskich aliasow typu `error.minuteLimit`, bo jeden ksztalt API jest prostszy.

### User-Agent

SDK zawsze wysyla domyslny header:

```http
User-Agent: pdfbolt-node/<VERSION>
```

To identyfikuje SDK/platforme wykonujaca request do PDFBolt API i sluzy backendowi do logow, diagnostyki oraz analizy wersji SDK.

Nie dodajemy `userAgent` do `PDFBoltClientOptions`. Uzytkownik nie powinien nadpisywac SDK API-call User-Agent przez opcje klienta.

Dokladne rozroznienie:

- SDK `User-Agent` to header requestu **SDK -> PDFBolt API**. On mowi backendowi: "ten request przyszedl z oficjalnego Node SDK w wersji X". To jest do logow, diagnostyki, supportu i wykrywania problemow konkretnych wersji SDK. Ten header powinien byc zawsze ustawiany przez SDK.
- `extraHTTPHeaders` to parametr konwersji, czyli headers dla requestow **Chromium/Playwright -> strona uzytkownika**. To sa naglowki, ktore backend przekazuje do przegladarki renderujacej strone albo jej zasoby do PDF.

Jesli uzytkownik chce ustawic `User-Agent` dla strony renderowanej przez Chromium, robi to przez `extraHTTPHeaders` w parametrach konwersji, nie przez opcje klienta SDK.

### Webhook helper types

Eksportujemy z root entrypointu:

```ts
export type { WebhookRawBody, WebhookVerificationOptions } from './webhooks.js';
```

Nie przebudowujemy teraz webhook payload types na discriminated union. To byloby mile dla TypeScript, ale nie jest potrzebne do release. YAGNI.

## Non-goals

Nie robimy:

- zadnych SDK transport retries;
- `retryAfterMs`;
- kompatybilnosci wstecznej dla `maxRetries` / `retryDelayMs`;
- filtrowania starych pol retry;
- warningow deprecation;
- client-level `userAgent` ani custom API-call User-Agent override;
- klas bledow per HTTP status;
- aliasow kompatybilnosci dla usunietych klas bledow;
- aliasow flat `rateLimit`;
- automatycznego `save()` do `result.filename`;
- client-side walidacji wszystkich backendowych parametrow;
- custom parsera pelnego RFC dla `Content-Disposition`, bo backend generuje prosty format;
- zmiany backendu tylko po to, zeby dopasowac SDK.

Jesli plain JS caller wysle nieznane pole, np. `maxRetries`, i trafi ono do body requestu, backend moze zwrocic `400 Bad Request`. To jest poprawne i proste zachowanie przed pierwszym release.

## Faza 1: usuniecie retry i uproszczenie HTTP clienta

### Pliki

- `src/types.ts`
- `src/http.ts`
- `src/utils/request-options.ts`
- `README.md`
- `test/client.test.js`

### Zmiany

1. W `src/types.ts`:
   - usunac `maxRetries?: number` z `PDFBoltClientOptions`;
   - usunac `retryDelayMs?: number` z `PDFBoltClientOptions`;
   - usunac `maxRetries?: number` z `PDFBoltRequestOptions`;
   - zostawic `retryDelays?: number[] | null` tylko w `AsyncOptions`.

2. W `src/utils/request-options.ts`:
   - splitowac tylko `requestTimeoutMs` i `signal`;
   - nie special-case'owac `maxRetries`.

3. W `src/http.ts`:
   - usunac `maxRetries` i `retryDelayMs` z `InternalClientOptions`;
   - usunac `while`, `attempt`, `shouldRetryStatus`, `delay`;
   - jedna metoda SDK = jeden `fetch`;
   - zostawic mapowanie backendowego error response na jeden `PDFBoltAPIError`;
   - zachowac `requestTimeoutMs` i `AbortSignal`;
   - cleanup timeout/listener robic w `finally`.

4. W `README.md`:
   - usunac opis SDK retries;
   - dodac krotko: SDK nie robi automatycznych transport retries;
   - zostawic opis async `retryDelays` jako backendowego retry konwersji.

### Testy

Dodac testy:

- `503` robi jeden request i rzuca `PDFBoltAPIError` ze `statusCode === 503`;
- `504` robi jeden request i rzuca `PDFBoltAPIError` ze `statusCode === 504`;
- `429` robi jeden request i rzuca `PDFBoltAPIError` ze `statusCode === 429`;
- thrown fetch error robi jeden request i rzuca `PDFBoltNetworkError`;
- caller abort robi jeden request i rzuca `PDFBoltNetworkError`;
- timeout robi jeden request i rzuca `PDFBoltNetworkError`;
- `retryDelays` dalej przechodzi w body async requestu;
- `requestTimeoutMs` i `signal` nie trafiaja do body.

## Faza 2: User-Agent

### Pliki

- `src/http.ts`
- `src/version.ts`
- `test/client.test.js`
- `README.md`

### Zmiany

1. W `src/http.ts`:
   - importowac `VERSION`;
   - zawsze wysylac `User-Agent: pdfbolt-node/${VERSION}`;
   - nie czytac zadnej opcji `userAgent`;
   - nie mieszac SDK API-call `User-Agent` z konwersyjnym `extraHTTPHeaders`;
   - zaktualizowac komunikat braku fetch z Node 24+.

2. W `src/types.ts`:
   - usunac `userAgent?: string` z `PDFBoltClientOptions`.

3. W testach:
   - sprawdzic default `User-Agent`;
   - sprawdzic, ze `extraHTTPHeaders` zostaje w body requestu i nie jest traktowane jako SDK API-call `User-Agent`;
   - sprawdzic `VERSION === package.json.version`;
   - typowo potwierdzic, ze `PDFBoltClientOptions` nie ma `userAgent`.

4. Smoke test manualny/staging:
   - wykonac direct HTML z pustym HTML i domyslnym UA:

```json
{"html":""}
```

Cel: potwierdzic, ze historyczny socket-close edge-case nie wraca.

## Faza 3: uproszczenie modelu bledow

### Pliki

- `src/errors.ts`
- `src/http.ts`
- `src/types.ts`
- `src/rate-limit.ts`
- `src/index.ts`
- `test/client.test.js`
- `test/cjs.test.cjs`
- `README.md`

### Zmiany

1. W `src/errors.ts`:
   - zostawic `PDFBoltError` jako baze;
   - zostawic `PDFBoltAPIError` jako jedyny blad reprezentujacy odpowiedz bledu z backendu;
   - dodac `readonly rateLimit: RateLimitInfo` do `PDFBoltAPIError`;
   - usunac klasy statusowe:

```ts
PDFBoltBadRequestError
PDFBoltAuthenticationError
PDFBoltForbiddenError
PDFBoltConversionTimeoutError
PDFBoltNotFoundError
PDFBoltPayloadTooLargeError
PDFBoltUnprocessableEntityError
PDFBoltRateLimitError
PDFBoltServiceUnavailableError
PDFBoltGatewayTimeoutError
```

   - zostawic lokalne bledy SDK:

```ts
PDFBoltNetworkError
PDFBoltWebhookSignatureError
PDFBoltValidationError
PDFBoltConfigurationError
```

2. W `src/http.ts`:
   - usunac importy klas statusowych;
   - usunac `switch (response.status)` tworzacy rozne klasy;
   - `createAPIError(response)` zawsze zwraca `new PDFBoltAPIError(...)`;
   - parsowac `timestamp`, `errorCode`, `errorMessage` z backendowego body;
   - `statusCode` brac z realnego HTTP statusu odpowiedzi;
   - `message` ustawic na `errorMessage || response.statusText || fallback`;
   - dolaczyc `headers`, `rawBody` i `rateLimit`.

3. W `src/types.ts`:
   - zsynchronizowac `ConversionErrorCode` z backendowym `ErrorCode`;
   - dodac brakujace backendowe kody, np. `CLIENT_DISCONNECTED`;
   - zostawic fallback `(string & {})`, zeby SDK nie wymagal release w tym samym dniu, w ktorym backend doda nowy kod.

4. W `src/index.ts`:
   - usunac eksporty usunietych klas;
   - eksportowac tylko docelowe klasy bledow.

5. W README:
   - zastapic `instanceof PDFBoltAuthenticationError`, `PDFBoltRateLimitError` itd. obsluga jednego `PDFBoltAPIError`;
   - pokazac rozroznianie po `statusCode` i `errorCode`;
   - wyjasnic, ze backendowe bledy maja wspolny ksztalt, wiec SDK nie tworzy klas per status.

### Testy

Dodac lub zaktualizowac:

- `400`, `401`, `403`, `404`, `408`, `413`, `422`, `429`, `503`, `504` rzucaja `PDFBoltAPIError`;
- `error.statusCode` odpowiada HTTP statusowi;
- `error.errorCode`, `error.errorMessage`, `error.timestamp` sa parsowane z backendowego body;
- `429` ma `error.rateLimit.minute/hour/day`;
- malformed albo non-JSON body nadal daje `PDFBoltAPIError` z `rawBody`;
- network/timeout/abort nadal rzucaja `PDFBoltNetworkError`;
- lokalna walidacja nadal rzuca `PDFBoltValidationError`;
- brak API key / brak fetch nadal rzuca `PDFBoltConfigurationError`;
- CJS smoke nie oczekuje usunietych klas statusowych.

## Faza 4: nested rateLimit i conversionCost

### Pliki

- `src/types.ts`
- `src/rate-limit.ts`
- `src/errors.ts`
- `src/direct-result.ts`
- `src/resources/sync.ts`
- `src/resources/async.ts`
- `src/resources/usage.ts`
- `README.md`
- `test/client.test.js`

### Zmiany

1. W `src/types.ts`:
   - dodac `RateLimitWindow`;
   - zmienic `RateLimitInfo` na nested shape;
   - dodac `conversionCost: number | null` do `SyncConversionResult`.

2. W `src/rate-limit.ts`:
   - `readRateLimitInfo(headers)` zwraca:

```ts
{
  minute: { limit, remaining },
  hour: { limit, remaining },
  day: { limit, remaining }
}
```

3. W `src/errors.ts`:
   - zaimportowac `readRateLimitInfo`;
   - upewnic sie, ze `PDFBoltAPIError.rateLimit` uzywa nested `RateLimitInfo`;
   - nie dodawac plaskich getterow `minuteLimit`, `minuteRemaining`, itd.;
   - nie duplikowac `readNumberHeader`.

4. W `src/resources/sync.ts`:
   - zmienic typ generyczny na `Omit<SyncConversionResult, 'rateLimit' | 'conversionCost'>`;
   - parsowac `conversionCost` z `x-pdfbolt-conversion-cost`.

5. W README:
   - zaktualizowac wszystkie przyklady `rateLimit.minuteRemaining` na `rateLimit.minute.remaining`;
   - dodac `result.conversionCost` dla sync;
   - napisac, ze rate-limit na `429` jest best-effort i pola moga byc `null`.

### Testy

Dodac lub zaktualizowac:

- direct success parsuje nested minute/hour/day;
- sync success parsuje nested rateLimit i `conversionCost`;
- async acceptance parsuje nested rateLimit;
- usage success parsuje nested rateLimit;
- missing/malformed headers daja `null`;
- `PDFBoltAPIError.rateLimit` dziala z headerami;
- `PDFBoltAPIError.rateLimit` jest all-null bez headerow.

## Faza 5: filename i DirectConversionResult

### Pliki

- `src/direct-result.ts`
- `test/client.test.js`
- `README.md`

### Zmiany

1. Zostawic `result.filename`.
2. Nie zmieniac na `suggestedFilename`.
3. Parser moze zostac prosty, bo backend generuje tylko:

```http
Content-Disposition: inline; filename="invoice.pdf"
Content-Disposition: attachment; filename="invoice.pdf"
```

4. README powinien opisac, ze `filename` pochodzi z `Content-Disposition` i zwykle zawiera `.pdf` dopisane przez backend.

### Testy

Unit testy parsera:

- `attachment; filename="invoice.pdf"` -> `invoice.pdf`;
- `inline; filename="invoice.pdf"` -> `invoice.pdf`;
- `attachment; filename=invoice.pdf` -> `invoice.pdf`;
- `inline` -> `null`;
- missing header -> `null`.

Integration smoke:

- request `filename: "invoice"` powinien zwrocic `result.filename === "invoice.pdf"`;
- request bez `filename` powinien zwrocic `result.filename === null`.

Nie testujemy jako wymogu release:

- `filename*`;
- semicolon inside quoted filename;
- escaped quotes;
- Unicode filename.

Backend ich nie emituje dla publicznego parametru `filename`.

## Faza 6: webhook type exports

### Pliki

- `src/index.ts`
- `test/types.test.ts` albo istniejacy typecheck fixture

### Zmiany

W `src/index.ts` dodac:

```ts
export type { WebhookRawBody, WebhookVerificationOptions } from './webhooks.js';
```

Nie zmieniac runtime.

### Test

Dodac typecheck fixture, ktory importuje:

```ts
import type { WebhookRawBody, WebhookVerificationOptions } from '../src/index.js';
```

albo po buildzie z `../dist/esm/index.js`, jesli test ma sprawdzac publiczny output.

## Faza 7: Node 24 i evergreen release baseline

### Pliki

- `package.json`
- `package-lock.json`
- `.nvmrc`
- `README.md`
- ewentualnie `.github/workflows/*`, jesli dodajemy CI w tym repo

### Zmiany

1. `package.json`:

```json
"engines": {
  "node": ">=24"
}
```

2. Dev dependency:

```json
"@types/node": "^24.0.0"
```

3. Dodac `.nvmrc`:

```text
24
```

4. README:
   - zmienic wymaganie na Node 24+.

5. Release check:

```bash
npm_config_engine_strict=true npm ci
npm run typecheck
npm test
```

Uwaga: lokalne srodowisko podczas review mialo Node `20.12.2`, wiec docelowa walidacja musi byc uruchomiona na Node 24.

## Faza 8: tarball install smoke test

### Pliki

- `package.json`
- `scripts/test-pack.js`

### Zmiany

Dodać skrypt bez zaleznosci zewnetrznych:

```json
"test:pack": "npm run build && node scripts/test-pack.js"
```

`scripts/test-pack.js` powinien:

1. uruchomic `npm pack --json`;
2. sprawdzic liste plikow w tarballu;
3. wymagac obecnosci:

```text
dist/esm/index.js
dist/esm/index.d.ts
dist/cjs/index.js
dist/cjs/package.json
README.md
LICENSE
package.json
```

4. wymagac braku:

```text
src/
test/
examples/
.env
.env.example
node_modules/
```

5. stworzyc temp consumer;
6. zainstalowac wygenerowany `.tgz`;
7. sprawdzic ESM:

```bash
node --input-type=module -e "const sdk = await import('@pdfbolt/node'); if (!sdk.PDFBolt) process.exit(1)"
```

8. sprawdzic CJS:

```bash
node -e "const sdk = require('@pdfbolt/node'); if (!sdk.PDFBolt) process.exit(1)"
```

9. posprzatac `.tgz` i temp dir.

Nie wystarczy samo `npm pack --dry-run`, bo ono nie sprawdza instalacji realnej paczki.

## Faza 9: integration tests

### Pliki

- `test/integration.test.js`
- `.env.example`
- README sekcja integration tests

### Zmiany

Integration testy zostaja opt-in:

```bash
PDFBOLT_RUN_INTEGRATION_TESTS=1 PDFBOLT_API_KEY=... npm run test:integration
```

Rozszerzyc o:

- `direct.fromUrl`;
- `sync.fromUrl`;
- `direct.fromHtml` z `isEncoded: true`;
- `direct.fromHtml` z `filename: "invoice"` i sprawdzeniem `result.filename === "invoice.pdf"`;
- success `rateLimit` na `direct`, `sync`, `usage`;
- invalid auth;
- pusty HTML z domyslnym User-Agent;
- opcjonalnie `asyncConversions.fromHtml`, tylko gdy ustawione `PDFBOLT_WEBHOOK_URL`;
- opcjonalnie template conversion, tylko gdy ustawione `PDFBOLT_TEMPLATE_ID`.

Wazne:

- integration tests moga konsumowac kredyty, wiec powinny isc na test API albo test key;
- async test tworzy prawdziwy job i powinien byc osobno warunkowany env varami.

## Faza 10: README i landing docs

### README w SDK

Zaktualizowac:

- Node 24+;
- brak automatic SDK retries;
- async `retryDelays` jako backend conversion retries;
- jeden `PDFBoltAPIError` dla backendowych HTTP error responses;
- nested `rateLimit`;
- `conversionCost` dla direct i sync;
- `filename` z `Content-Disposition`;
- default SDK `User-Agent`;
- rozdzielenie SDK `User-Agent` od konwersyjnego `extraHTTPHeaders`;
- webhook type helper exports.

### Landing docs

W `pdfbolt-landing-page` raw fetch quick-start dla Node nadal moze zostac jako REST example, ale przed publicznym ogloszeniem SDK powinien powstac official SDK path:

- install `npm install @pdfbolt/node`;
- create client;
- direct/sync/async examples;
- error handling;
- webhook signature verification;
- no SDK transport retries;
- rate-limit metadata;
- filename constraints.

To nie musi blokowac samego npm package, ale powinno blokowac publiczny launch/announcement.

## Kolejnosc implementacji

1. Retry removal + HTTP simplify.
2. User-Agent.
3. Uproszczenie modelu bledow do jednego `PDFBoltAPIError`.
4. Nested rateLimit + sync conversionCost.
5. Filename tests.
6. Webhook type exports.
7. Node 24 baseline.
8. Tarball smoke test.
9. Integration tests.
10. README update.
11. Landing docs update przed publicznym launch.

## Komendy weryfikacyjne

Na Node 24:

```bash
npm_config_engine_strict=true npm ci
npm run typecheck
npm test
npm run test:pack
```

Opcjonalnie integration:

```bash
PDFBOLT_RUN_INTEGRATION_TESTS=1 PDFBOLT_API_KEY=... npm run test:integration
```

Po zmianach w landing docs:

```bash
cd $PDFBOLT_PROJECTS_DIR/pdfbolt-landing-page
npm run build
```

## Kryteria akceptacji

- SDK nie expose'uje `maxRetries`, `retryDelayMs`, `retryAfterMs`.
- Jeden call SDK wykonuje maksymalnie jeden HTTP request.
- `retryDelays` istnieje tylko dla async conversion params.
- SDK wysyla default `User-Agent`.
- SDK nie expose'uje client-level `userAgent`; `extraHTTPHeaders` pozostaje zwyklym parametrem konwersji.
- Backendowe HTTP error responses zawsze mapuja sie na jeden `PDFBoltAPIError`.
- SDK nie eksportuje klas bledow per HTTP status.
- `rateLimit` jest nested wszedzie, lacznie z `PDFBoltAPIError`.
- `/v1/sync` result ma `conversionCost`.
- `DirectConversionResult.filename` zostaje i ma testy.
- Webhook helper types sa eksportowane z root.
- Package wymaga Node 24+ i jest testowany na Node 24.
- Tarball da sie zainstalowac i zaimportowac przez ESM oraz CJS.
- README nie opisuje SDK transport retries.
- Integration smoke obejmuje najwazniejsze endpointy i metadata.
