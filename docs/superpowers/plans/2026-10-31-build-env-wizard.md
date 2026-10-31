# Build-Env-Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/buildenv` Discord slash command that walks the user through Board → Feature-Flags → UserMods → Review via select menus and buttons, then feeds the generated PlatformIO `[env:...]` block into the existing `/build` queue/sandbox pipeline unchanged.

**Architecture:** Four new, framework-free modules carry all the logic that can be unit-tested without a live Discord gateway (`envWizardCatalog`, `envWizardGenerator`, `envWizardState`, `envWizardUI`). A thin orchestration module (`envWizardRunner`) wires them to Discord interactions and to the existing `buildRunner.runOneBuild`/`buildQueue` path. `events/interactionCreate.js` gets one new routing branch for select-menu/button interactions, mirroring its existing hardcoded modal-submit routing.

**Tech Stack:** Node.js, discord.js 14.14.1, `node:test` + `node:assert/strict` (existing project test runner, `npm test` picks up `test/**/*.test.js`).

**Spec:** [docs/superpowers/specs/2026-10-31-build-env-wizard-design.md](../specs/2026-10-31-build-env-wizard-design.md)

## Global Constraints

- Generated ini text may only use keys from `ALLOWED_KEYS` in `docker/builder/lib/iniSanitizer.js` (`board`, `extends`, `build_flags`, `build_unflags`, `build_src_filter`, `lib_deps`, `lib_ignore`, `lib_compat_mode`, `custom_usermods`, `monitor_*`, `upload_*`, `board_build.*`) and exactly one `[env:<name>]` section.
- A Discord select menu allows at most 25 options; a message allows at most 5 action rows, each either one select menu or up to 5 buttons.
- Wizard session TTL matches the existing `PENDING_BRANCH_TTL_MS` convention: 10 minutes (`10 * 60 * 1000`).
- Catalog (boards/usermods/features) is a static file derived once from the current WLED `main` checkout at `commands/build/wled/` — no live git clone/parse during the wizard (per design decision 3).
- No hub75/custom-pinout boards or matrix-specific envs in the catalog (per design Non-goal) — confirmed exclusion list below.
- The final "start build" action must call the *exact same* `buildQueue.enqueue(...)` → `runOneBuild(...)` path `/build`'s modal submit uses today — no parallel build logic.
- Board-default `custom_usermods` (currently only `audioreactive`, on all boards except the `esp01_1m_full*` family) are shown pre-selected in the UserMods step and can be consciously deselected (per design decision 4) — never silently re-added.

## Review Focus

- **No selections at all (just board, nothing else):** generator must produce a minimal `[env:<name>]\nextends = env:<board>\n` with neither `build_flags` nor `custom_usermods` present — confirms `extends` passthrough stays intact (Task 2).
- **User deselects a board-default usermod:** e.g. picks `esp32dev` (default `audioreactive`), then submits the usermods step with `audioreactive` unchecked — final generated `custom_usermods` must not contain it (Task 6).
- **Feature flags selected but zero usermods, and vice versa:** `build_flags` must only appear when ≥1 feature flag is selected, regardless of usermod selections, and must always start with `${env:<board>.build_flags}` before any `-D WLED_DISABLE_*` line — this is the inheritance-clobbering bug the builder-check caught (Task 2).
- **Selections split across multiple usermod category select-menus:** choosing usermods in one category menu, then another, must not drop the first category's picks (each Discord select menu only reports its own current values) (Task 6).
- **Stale/expired wizard interaction:** a component click arriving after the 10-minute TTL (or for a user with no session at all) must show a clear "run `/buildenv` again" message, not throw (Task 3 for TTL expiry, Task 6 for the missing-session branch).

---

## File Structure

| File | Responsibility |
|---|---|
| `commands/build/lib/envWizardCatalog.json` | Static data: board categories/boards/default-usermods, feature flags, usermod categories/usermods. |
| `commands/build/lib/envWizardCatalog.js` | Loads the JSON once, exposes typed lookup helpers. |
| `commands/build/lib/envWizardGenerator.js` | Pure function: session selections → sanitizer-valid ini text. |
| `commands/build/lib/envWizardState.js` | Per-user in-memory wizard session store with TTL (analogous to `pendingBranchByUser`). |
| `commands/build/lib/envWizardUI.js` | Builds discord.js select-menu/button/embed components for each wizard step from catalog + session. |
| `commands/build/lib/buildRunner.js` | *Modified*: export `runOneBuild`, `errorEmbed`, and a new `resolveBranchOption` helper extracted from `handleChatInput`, so the wizard can reuse them. |
| `commands/build/lib/envWizardRunner.js` | Orchestrates the wizard: starts it, dispatches every `envWizard:*` component interaction, hands off to `buildRunner.runOneBuild` on confirm. |
| `commands/build/buildenv.js` | New slash command definition (`data`/`execute`/`autocomplete`/`handleComponent`), same shape as `build.js`. |
| `events/interactionCreate.js` | *Modified*: route `isStringSelectMenu()`/`isButton()` interactions whose `customId` starts with `envWizard:` to `buildenv.js`'s `handleComponent`. |

---

### Task 1: Catalog data + loader

**Files:**
- Create: `commands/build/lib/envWizardCatalog.json`
- Create: `commands/build/lib/envWizardCatalog.js`
- Test: `test/build/envWizardCatalog.test.js`

**Interfaces:**
- Produces (used by every later task): `getBoardCategories(): {id, label}[]`, `getBoards(): Board[]`, `getBoardsByCategory(categoryId: string): Board[]`, `getBoardById(id: string): Board|undefined`, `getFeatures(): {flag, label}[]`, `getUsermodCategories(): {id, label}[]`, `getUsermodsByCategory(categoryId: string): Usermod[]`, `getUsermodById(id: string): Usermod|undefined`, where `Board = {id, label, category, defaultUsermods: string[]}` and `Usermod = {id, label, category}`.

- [ ] **Step 1: Write `commands/build/lib/envWizardCatalog.json`** with exactly this data (derived from `commands/build/wled/platformio.ini` and `commands/build/wled/usermods/`; hub75/matrix envs and the CI-only `usermods` env are already excluded):

```json
{
  "boardCategories": [
    { "id": "esp8266", "label": "ESP8266" },
    { "id": "esp32", "label": "ESP32 (generic)" },
    { "id": "esp32c3_s2", "label": "ESP32-C3 / ESP32-S2" },
    { "id": "esp32s3", "label": "ESP32-S3" }
  ],
  "boards": [
    { "id": "nodemcuv2", "label": "ESP8266 NodeMCU v2 (4M1M)", "category": "esp8266", "defaultUsermods": ["audioreactive"] },
    { "id": "nodemcuv2_compat", "label": "ESP8266 NodeMCU v2 (compat)", "category": "esp8266", "defaultUsermods": ["audioreactive"] },
    { "id": "nodemcuv2_160", "label": "ESP8266 NodeMCU v2 (160MHz)", "category": "esp8266", "defaultUsermods": ["audioreactive"] },
    { "id": "esp8266_2m", "label": "ESP8266 Generic (2M)", "category": "esp8266", "defaultUsermods": ["audioreactive"] },
    { "id": "esp8266_2m_compat", "label": "ESP8266 Generic 2M (compat)", "category": "esp8266", "defaultUsermods": ["audioreactive"] },
    { "id": "esp8266_2m_160", "label": "ESP8266 Generic 2M (160MHz)", "category": "esp8266", "defaultUsermods": ["audioreactive"] },
    { "id": "esp8266_2m_min", "label": "ESP8266 Generic 2M (minimal)", "category": "esp8266", "defaultUsermods": ["audioreactive"] },
    { "id": "esp01_1m_full", "label": "ESP8266 ESP-01 (1M full)", "category": "esp8266", "defaultUsermods": [] },
    { "id": "esp01_1m_full_compat", "label": "ESP8266 ESP-01 1M (compat)", "category": "esp8266", "defaultUsermods": [] },
    { "id": "esp01_1m_full_160", "label": "ESP8266 ESP-01 1M (160MHz)", "category": "esp8266", "defaultUsermods": [] },
    { "id": "esp32dev", "label": "ESP32 (generic)", "category": "esp32", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32dev_debug", "label": "ESP32 (debug build)", "category": "esp32", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32dev_8M", "label": "ESP32 (8MB flash)", "category": "esp32", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32dev_16M", "label": "ESP32 (16MB flash)", "category": "esp32", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32_eth", "label": "ESP32 (Ethernet)", "category": "esp32", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32_wrover", "label": "ESP32 Wrover", "category": "esp32", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32c3dev", "label": "ESP32-C3", "category": "esp32c3_s2", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32c3dev_qio", "label": "ESP32-C3 (QIO flash mode)", "category": "esp32c3_s2", "defaultUsermods": ["audioreactive"] },
    { "id": "lolin_s2_mini", "label": "ESP32-S2 (Lolin S2 Mini)", "category": "esp32c3_s2", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32s3dev_16MB_opi", "label": "ESP32-S3 (16MB OPI PSRAM)", "category": "esp32s3", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32s3dev_8MB_opi", "label": "ESP32-S3 (8MB OPI PSRAM)", "category": "esp32s3", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32s3dev_8MB_qspi", "label": "ESP32-S3 (8MB QSPI PSRAM)", "category": "esp32s3", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32s3dev_8MB_none", "label": "ESP32-S3 (8MB, no PSRAM)", "category": "esp32s3", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32S3_wroom2", "label": "ESP32-S3 Wroom-2", "category": "esp32s3", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32S3_wroom2_32MB", "label": "ESP32-S3 Wroom-2 (32MB)", "category": "esp32s3", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32s3_4M_qspi", "label": "ESP32-S3 (4MB QSPI PSRAM)", "category": "esp32s3", "defaultUsermods": ["audioreactive"] },
    { "id": "esp32s3_4M_none", "label": "ESP32-S3 (4MB, no PSRAM)", "category": "esp32s3", "defaultUsermods": ["audioreactive"] }
  ],
  "features": [
    { "flag": "WLED_DISABLE_2D", "label": "2D-Matrix-Unterstützung deaktivieren" },
    { "flag": "WLED_DISABLE_ADALIGHT", "label": "Adalight-Protokoll deaktivieren" },
    { "flag": "WLED_DISABLE_ALEXA", "label": "Amazon Alexa deaktivieren" },
    { "flag": "WLED_DISABLE_BROWNOUT_DET", "label": "Brownout-Detektor deaktivieren" },
    { "flag": "WLED_DISABLE_ESPNOW", "label": "ESP-NOW deaktivieren" },
    { "flag": "WLED_DISABLE_FILESYSTEM", "label": "Dateisystem deaktivieren" },
    { "flag": "WLED_DISABLE_HUESYNC", "label": "Philips-Hue-Sync deaktivieren" },
    { "flag": "WLED_DISABLE_IMPROV_WIFISCAN", "label": "Improv-WLAN-Scan deaktivieren" },
    { "flag": "WLED_DISABLE_INFRARED", "label": "Infrarot-Fernbedienung deaktivieren" },
    { "flag": "WLED_DISABLE_LOXONE", "label": "Loxone-Unterstützung deaktivieren" },
    { "flag": "WLED_DISABLE_MQTT", "label": "MQTT deaktivieren" },
    { "flag": "WLED_DISABLE_OTA", "label": "OTA-Updates deaktivieren" },
    { "flag": "WLED_DISABLE_PARTICLESYSTEM1D", "label": "1D-Partikelsystem deaktivieren" },
    { "flag": "WLED_DISABLE_PARTICLESYSTEM2D", "label": "2D-Partikelsystem deaktivieren" },
    { "flag": "WLED_DISABLE_PIXELFORGE", "label": "PixelForge-Renderer deaktivieren" },
    { "flag": "WLED_DISABLE_WEBSOCKETS", "label": "WebSockets deaktivieren" }
  ],
  "usermodCategories": [
    { "id": "sensors", "label": "Sensoren" },
    { "id": "display_clock", "label": "Display & Uhr" },
    { "id": "io_control", "label": "IO / Steuerung / Automation" },
    { "id": "network_misc", "label": "Netzwerk / Effekte / Sonstiges" }
  ],
  "usermods": [
    { "id": "ADS1115_v2", "label": "ADS1115", "category": "sensors" },
    { "id": "AHT10_v2", "label": "AHT10", "category": "sensors" },
    { "id": "BH1750_v2", "label": "BH1750", "category": "sensors" },
    { "id": "BME280_v2", "label": "BME280", "category": "sensors" },
    { "id": "BME68X_v2", "label": "BME68X", "category": "sensors" },
    { "id": "Battery", "label": "Battery", "category": "sensors" },
    { "id": "DHT", "label": "DHT", "category": "sensors" },
    { "id": "INA226_v2", "label": "INA226", "category": "sensors" },
    { "id": "Internal_Temperature_v2", "label": "Internal Temperature", "category": "sensors" },
    { "id": "LD2410_v2", "label": "LD2410", "category": "sensors" },
    { "id": "LDR_Dusk_Dawn_v2", "label": "LDR Dusk/Dawn", "category": "sensors" },
    { "id": "MAX17048_v2", "label": "MAX17048", "category": "sensors" },
    { "id": "PIR_sensor_switch", "label": "PIR Sensor Switch", "category": "sensors" },
    { "id": "SN_Photoresistor", "label": "SN Photoresistor", "category": "sensors" },
    { "id": "Si7021_MQTT_HA", "label": "Si7021 MQTT HA", "category": "sensors" },
    { "id": "Temperature", "label": "Temperature", "category": "sensors" },
    { "id": "VL53L0X_gestures", "label": "VL53L0X Gestures", "category": "sensors" },
    { "id": "mpu6050_imu", "label": "MPU6050 IMU", "category": "sensors" },
    { "id": "photoresistor_sensor_mqtt_v1", "label": "Photoresistor MQTT", "category": "sensors" },
    { "id": "sensors_to_mqtt", "label": "Sensors to MQTT", "category": "sensors" },
    { "id": "sht", "label": "SHT", "category": "sensors" },
    { "id": "battery_keypad_controller", "label": "Battery Keypad Controller", "category": "sensors" },
    { "id": "Analog_Clock", "label": "Analog Clock", "category": "display_clock" },
    { "id": "Cronixie", "label": "Cronixie", "category": "display_clock" },
    { "id": "EleksTube_IPS", "label": "EleksTube IPS", "category": "display_clock" },
    { "id": "Enclosure_with_OLED_temp_ESP07", "label": "Enclosure with OLED", "category": "display_clock" },
    { "id": "ST7789_display", "label": "ST7789 Display", "category": "display_clock" },
    { "id": "TTGO-T-Display", "label": "TTGO T-Display", "category": "display_clock" },
    { "id": "TetrisAI_v2", "label": "Tetris AI", "category": "display_clock" },
    { "id": "pov_display", "label": "POV Display", "category": "display_clock" },
    { "id": "seven_segment_display", "label": "Seven Segment Display", "category": "display_clock" },
    { "id": "seven_segment_display_reloaded", "label": "Seven Segment Display Reloaded", "category": "display_clock" },
    { "id": "usermod_v2_four_line_display_ALT", "label": "Four Line Display (ALT)", "category": "display_clock" },
    { "id": "usermod_v2_ping_pong_clock", "label": "Ping Pong Clock", "category": "display_clock" },
    { "id": "usermod_v2_word_clock", "label": "Word Clock", "category": "display_clock" },
    { "id": "word-clock-matrix", "label": "Word Clock Matrix", "category": "display_clock" },
    { "id": "pixels_dice_tray", "label": "Pixels Dice Tray", "category": "display_clock" },
    { "id": "RTC", "label": "RTC", "category": "display_clock" },
    { "id": "Animated_Staircase", "label": "Animated Staircase", "category": "io_control" },
    { "id": "Artemis_reciever", "label": "Artemis Receiver", "category": "io_control" },
    { "id": "MY9291", "label": "MY9291", "category": "io_control" },
    { "id": "PS_Comet", "label": "PS Comet", "category": "io_control" },
    { "id": "PWM_fan", "label": "PWM Fan", "category": "io_control" },
    { "id": "RelayBlinds", "label": "Relay Blinds", "category": "io_control" },
    { "id": "buzzer", "label": "Buzzer", "category": "io_control" },
    { "id": "deep_sleep", "label": "Deep Sleep", "category": "io_control" },
    { "id": "multi_relay", "label": "Multi Relay", "category": "io_control" },
    { "id": "project_cars_shiftlight", "label": "Project Cars Shiftlight", "category": "io_control" },
    { "id": "pwm_outputs", "label": "PWM Outputs", "category": "io_control" },
    { "id": "quinled-an-penta", "label": "QuinLED-An-Penta", "category": "io_control" },
    { "id": "rgb-rotary-encoder", "label": "RGB Rotary Encoder", "category": "io_control" },
    { "id": "rotary_encoder_change_effect", "label": "Rotary Encoder (change effect)", "category": "io_control" },
    { "id": "sd_card", "label": "SD Card", "category": "io_control" },
    { "id": "smartnest", "label": "Smartnest", "category": "io_control" },
    { "id": "stairway_wipe_basic", "label": "Stairway Wipe (basic)", "category": "io_control" },
    { "id": "usermod_rotary_brightness_color", "label": "Rotary Brightness/Color", "category": "io_control" },
    { "id": "usermod_v2_HttpPullLightControl", "label": "HTTP Pull Light Control", "category": "io_control" },
    { "id": "usermod_v2_RF433", "label": "RF433", "category": "io_control" },
    { "id": "usermod_v2_auto_save", "label": "Auto Save", "category": "io_control" },
    { "id": "usermod_v2_brightness_follow_sun", "label": "Brightness Follow Sun", "category": "io_control" },
    { "id": "usermod_v2_klipper_percentage", "label": "Klipper Percentage", "category": "io_control" },
    { "id": "usermod_v2_rotary_encoder_ui_ALT", "label": "Rotary Encoder UI (ALT)", "category": "io_control" },
    { "id": "wizlights", "label": "WizLights", "category": "io_control" },
    { "id": "Fix_unreachable_netservices_v2", "label": "Fix Unreachable Netservices", "category": "network_misc" },
    { "id": "JSON_IR_remote", "label": "JSON IR Remote", "category": "network_misc" },
    { "id": "Wemos_D1_mini+Wemos32_mini_shield", "label": "Wemos D1 Mini + Wemos32 Shield", "category": "network_misc" },
    { "id": "audioreactive", "label": "Audioreactive", "category": "network_misc" },
    { "id": "boblight", "label": "Boblight", "category": "network_misc" },
    { "id": "udp_name_sync", "label": "UDP Name Sync", "category": "network_misc" },
    { "id": "user_fx", "label": "User FX", "category": "network_misc" },
    { "id": "usermod_v2_animartrix", "label": "Animartrix", "category": "network_misc" },
    { "id": "wireguard", "label": "Wireguard", "category": "network_misc" }
  ]
}
```

- [ ] **Step 2: Write `commands/build/lib/envWizardCatalog.js`** exposing exactly the functions listed in Interfaces above. Load the JSON with `require('./envWizardCatalog.json')` once at module scope; every getter reads from that in-memory object (no file I/O per call).

- [ ] **Step 3: Write the failing tests in `test/build/envWizardCatalog.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../../commands/build/lib/envWizardCatalog');

test('catalog: board categories and boards are consistent', () => {
  const categories = catalog.getBoardCategories();
  assert.equal(categories.length, 4);
  const boards = catalog.getBoards();
  assert.equal(boards.length, 27);
  const categoryIds = new Set(categories.map((c) => c.id));
  for (const board of boards) assert.ok(categoryIds.has(board.category), `${board.id} has unknown category`);
});

test('catalog: getBoardsByCategory partitions boards without exceeding 25 per category', () => {
  for (const { id } of catalog.getBoardCategories()) {
    const boards = catalog.getBoardsByCategory(id);
    assert.ok(boards.length > 0 && boards.length <= 25);
  }
  assert.equal(catalog.getBoardsByCategory('does-not-exist').length, 0);
});

test('catalog: no hub75/matrix boards are present (non-goal exclusion)', () => {
  const ids = catalog.getBoards().map((b) => b.id);
  assert.ok(!ids.some((id) => /hub75/i.test(id)));
  assert.ok(!ids.includes('adafruit_matrixportal_esp32s3'));
});

test('catalog: board default usermods match the known WLED main data', () => {
  assert.deepEqual(catalog.getBoardById('esp32dev').defaultUsermods, ['audioreactive']);
  assert.deepEqual(catalog.getBoardById('esp01_1m_full').defaultUsermods, []);
  assert.equal(catalog.getBoardById('does-not-exist'), undefined);
});

test('catalog: exactly 16 WLED_DISABLE_* feature flags', () => {
  const features = catalog.getFeatures();
  assert.equal(features.length, 16);
  for (const f of features) assert.ok(f.flag.startsWith('WLED_DISABLE_'));
});

test('catalog: usermod categories partition all 72 usermods without exceeding 25 per category', () => {
  const usermods = catalog.getUsermodsByCategory ? catalog.getUsermodCategories().flatMap((c) => catalog.getUsermodsByCategory(c.id)) : [];
  assert.equal(usermods.length, 72);
  for (const { id } of catalog.getUsermodCategories()) {
    assert.ok(catalog.getUsermodsByCategory(id).length <= 25);
  }
  assert.ok(catalog.getUsermodById('audioreactive'));
  assert.equal(catalog.getUsermodById('does-not-exist'), undefined);
});
```

- [ ] **Step 4: Run `npm test` and verify these tests fail** (module doesn't exist yet). Expected: FAIL with "Cannot find module".

- [ ] **Step 5: Re-run `npm test` and verify all new tests pass.**

- [ ] **Step 6: Commit**

```bash
git add commands/build/lib/envWizardCatalog.json commands/build/lib/envWizardCatalog.js test/build/envWizardCatalog.test.js
git commit -m "feat: add build-env wizard board/feature/usermod catalog"
```

---

### Task 2: Env-ini generator

**Files:**
- Create: `commands/build/lib/envWizardGenerator.js`
- Test: `test/build/envWizardGenerator.test.js`

**Interfaces:**
- Consumes: nothing from other wizard modules (pure function over plain strings/arrays — does not import the catalog).
- Produces: `generateEnvIni({ boardId: string, selectedFeatureFlags？: string[], selectedUsermods？: string[], envName？: string }): string`, default-exported alongside a `DEFAULT_ENV_NAME = 'custom_build'` constant. Task 6 calls this with `boardId` from the session and the session's selection arrays.

- [ ] **Step 1: Write the failing tests in `test/build/envWizardGenerator.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateEnvIni, DEFAULT_ENV_NAME } = require('../../commands/build/lib/envWizardGenerator');
const { sanitizePlatformioEnv } = require('../../docker/builder/lib/iniSanitizer');

test('generateEnvIni: board only, no selections -> bare extends, no build_flags/custom_usermods', () => {
  const ini = generateEnvIni({ boardId: 'esp32dev' });
  assert.equal(ini, `[env:${DEFAULT_ENV_NAME}]\nextends = env:esp32dev\n`);
});

test('generateEnvIni: usermods are deduped and space-joined', () => {
  const ini = generateEnvIni({ boardId: 'esp32dev', selectedUsermods: ['multi_relay', 'audioreactive', 'audioreactive'] });
  assert.match(ini, /^custom_usermods = audioreactive multi_relay$/m);
});

test('generateEnvIni: feature flags always inherit the board build_flags first', () => {
  const ini = generateEnvIni({ boardId: 'esp32dev', selectedFeatureFlags: ['WLED_DISABLE_MQTT', 'WLED_DISABLE_ALEXA'] });
  assert.equal(
    ini,
    `[env:${DEFAULT_ENV_NAME}]\nextends = env:esp32dev\nbuild_flags = \${env:esp32dev.build_flags}\n\t-D WLED_DISABLE_ALEXA\n\t-D WLED_DISABLE_MQTT\n`
  );
});

test('generateEnvIni: no feature flags selected -> no build_flags key at all, even with usermods set', () => {
  const ini = generateEnvIni({ boardId: 'esp32dev', selectedUsermods: ['audioreactive'] });
  assert.ok(!ini.includes('build_flags'));
});

test('generateEnvIni: custom envName is honored', () => {
  const ini = generateEnvIni({ boardId: 'esp32dev', envName: 'my_custom' });
  assert.ok(ini.startsWith('[env:my_custom]\n'));
});

test('generateEnvIni: throws on missing boardId', () => {
  assert.throws(() => generateEnvIni({}));
});

test('generateEnvIni output always passes the real sanitizer', () => {
  const combos = [
    { boardId: 'esp32dev' },
    { boardId: 'nodemcuv2', selectedUsermods: ['audioreactive', 'multi_relay'] },
    { boardId: 'esp32s3dev_8MB_opi', selectedFeatureFlags: ['WLED_DISABLE_MQTT', 'WLED_DISABLE_OTA'], selectedUsermods: ['sht'] },
  ];
  for (const combo of combos) {
    const ini = generateEnvIni(combo);
    const result = sanitizePlatformioEnv({ rawText: ini, envName: combo.envName || DEFAULT_ENV_NAME });
    assert.equal(result.ok, true, JSON.stringify(result.violations));
  }
});
```

- [ ] **Step 2: Run tests, verify they fail** (module doesn't exist). Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `generateEnvIni` in `commands/build/lib/envWizardGenerator.js`.**

Algorithm (this is the corrected logic from the design doc's builder-check fix — follow it exactly, do not merge `build_flags` any other way):

```
lines = [`[env:${envName}]`, `extends = env:${boardId}`]
usermods = dedupe(selectedUsermods).sort()
if usermods.length > 0: lines.push(`custom_usermods = ${usermods.join(' ')}`)
flags = dedupe(selectedFeatureFlags).sort()
if flags.length > 0:
    lines.push(`build_flags = \${env:${boardId}.build_flags}`)
    for flag in flags: lines.push(`\t-D ${flag}`)
return lines.join('\n') + '\n'
```

Throw `new Error('boardId is required')` if `boardId` is falsy. Export `DEFAULT_ENV_NAME`.

- [ ] **Step 4: Run tests, verify all pass.**

- [ ] **Step 5: Commit**

```bash
git add commands/build/lib/envWizardGenerator.js test/build/envWizardGenerator.test.js
git commit -m "feat: generate sanitizer-valid ini from build-env wizard selections"
```

---

### Task 3: Wizard session state store

**Files:**
- Create: `commands/build/lib/envWizardState.js`
- Test: `test/build/envWizardState.test.js`

**Interfaces:**
- Produces: `createSession(userId: string, initial: {branch: string}, ttlMs？: number): Session`, `getSession(userId: string): Session|null`, `updateSession(userId: string, patch: Partial<Session>): Session|null`, `clearSession(userId: string): void`, `DEFAULT_TTL_MS = 10 * 60 * 1000`, where `Session = { userId, branch, step, boardCategoryId, boardId, selectedFeatureFlags: string[], selectedUsermods: string[], generatedIni, expiresAt }`. `createSession` defaults `step` to `'boardCategory'`, `boardCategoryId`/`boardId`/`generatedIni` to `null`, and both selection arrays to `[]`. Task 6 is the sole consumer.

- [ ] **Step 1: Write the failing tests in `test/build/envWizardState.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSession, getSession, updateSession, clearSession } = require('../../commands/build/lib/envWizardState');

test('createSession seeds defaults and getSession returns them', () => {
  createSession('u1', { branch: 'main' });
  const session = getSession('u1');
  assert.equal(session.branch, 'main');
  assert.equal(session.step, 'boardCategory');
  assert.deepEqual(session.selectedFeatureFlags, []);
  assert.deepEqual(session.selectedUsermods, []);
  clearSession('u1');
});

test('createSession overwrites any existing session for the same user', () => {
  createSession('u2', { branch: 'main' });
  updateSession('u2', { boardId: 'esp32dev' });
  createSession('u2', { branch: 'dev' });
  assert.equal(getSession('u2').boardId, null);
  clearSession('u2');
});

test('updateSession merges a partial patch without clobbering other fields', () => {
  createSession('u3', { branch: 'main' });
  updateSession('u3', { boardId: 'esp32dev' });
  updateSession('u3', { selectedUsermods: ['audioreactive'] });
  const session = getSession('u3');
  assert.equal(session.boardId, 'esp32dev');
  assert.deepEqual(session.selectedUsermods, ['audioreactive']);
  clearSession('u3');
});

test('getSession returns null, and the session is gone, once the TTL expires', async () => {
  createSession('u4', { branch: 'main' }, 20);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(getSession('u4'), null);
  assert.equal(updateSession('u4', { boardId: 'x' }), null);
});

test('clearSession removes the session', () => {
  createSession('u5', { branch: 'main' });
  clearSession('u5');
  assert.equal(getSession('u5'), null);
});
```

- [ ] **Step 2: Run tests, verify they fail.** Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `commands/build/lib/envWizardState.js`.** Use a module-level `Map` keyed by `userId`, same pattern as `pendingBranchByUser` in `buildRunner.js`. `getSession`/`updateSession` must delete and return `null` for an entry whose `expiresAt < Date.now()` rather than returning stale data.

- [ ] **Step 4: Run tests, verify all pass.**

- [ ] **Step 5: Commit**

```bash
git add commands/build/lib/envWizardState.js test/build/envWizardState.test.js
git commit -m "feat: add per-user session store for the build-env wizard"
```

---

### Task 4: Discord UI component builders

**Files:**
- Create: `commands/build/lib/envWizardUI.js`
- Test: `test/build/envWizardUI.test.js`

**Interfaces:**
- Consumes: `envWizardCatalog`'s getters (Task 1).
- Produces: `buildBoardCategoryRow(): ActionRowBuilder`, `buildBoardRow(categoryId: string): ActionRowBuilder`, `buildFeatureRow(selectedFlags？: string[]): ActionRowBuilder`, `buildUsermodRows(selectedUsermods？: string[]): ActionRowBuilder[]` (one row per usermod category), `buildUsermodsNextRow(): ActionRowBuilder`, `buildReviewComponents(generatedIni: string): { embed: EmbedBuilder, row: ActionRowBuilder }`. CustomIds are fixed and load-bearing for Task 6's dispatch: `envWizard:boardCategory`, `envWizard:board`, `envWizard:features`, `envWizard:usermods:<categoryId>` (one per usermod category id from the catalog), `envWizard:usermodsNext`, and on the review row: `envWizard:confirm`, `envWizard:restart`, `envWizard:cancel`.

- [ ] **Step 1: Write the failing tests in `test/build/envWizardUI.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../../commands/build/lib/envWizardUI');
const catalog = require('../../commands/build/lib/envWizardCatalog');

test('buildBoardCategoryRow: one option per catalog category', () => {
  const json = ui.buildBoardCategoryRow().toJSON();
  const menu = json.components[0];
  assert.equal(menu.custom_id, 'envWizard:boardCategory');
  assert.equal(menu.options.length, catalog.getBoardCategories().length);
});

test('buildBoardRow: options match the boards of the given category', () => {
  const json = ui.buildBoardRow('esp8266').toJSON();
  const menu = json.components[0];
  assert.equal(menu.custom_id, 'envWizard:board');
  assert.deepEqual(menu.options.map((o) => o.value).sort(), catalog.getBoardsByCategory('esp8266').map((b) => b.id).sort());
});

test('buildFeatureRow: all 16 flags present, selected ones marked default', () => {
  const json = ui.buildFeatureRow(['WLED_DISABLE_MQTT']).toJSON();
  const menu = json.components[0];
  assert.equal(menu.custom_id, 'envWizard:features');
  assert.equal(menu.options.length, 16);
  const mqtt = menu.options.find((o) => o.value === 'WLED_DISABLE_MQTT');
  assert.equal(mqtt.default, true);
  const other = menu.options.find((o) => o.value !== 'WLED_DISABLE_MQTT');
  assert.ok(!other.default);
});

test('buildUsermodRows: one row per usermod category, pre-selected ids marked default', () => {
  const rows = ui.buildUsermodRows(['audioreactive']).map((r) => r.toJSON());
  assert.equal(rows.length, catalog.getUsermodCategories().length);
  const networkMenu = rows.map((r) => r.components[0]).find((m) => m.custom_id === 'envWizard:usermods:network_misc');
  const audioreactive = networkMenu.options.find((o) => o.value === 'audioreactive');
  assert.equal(audioreactive.default, true);
});

test('buildUsermodsNextRow: a single button with the expected customId', () => {
  const json = ui.buildUsermodsNextRow().toJSON();
  assert.equal(json.components[0].custom_id, 'envWizard:usermodsNext');
});

test('buildReviewComponents: embed contains the ini, row has confirm/restart/cancel buttons', () => {
  const { embed, row } = ui.buildReviewComponents('[env:custom_build]\nextends = env:esp32dev\n');
  const embedJson = embed.toJSON();
  assert.ok(embedJson.description.includes('extends = env:esp32dev'));
  const customIds = row.toJSON().components.map((b) => b.custom_id);
  assert.deepEqual(customIds, ['envWizard:confirm', 'envWizard:restart', 'envWizard:cancel']);
});
```

- [ ] **Step 2: Run tests, verify they fail.** Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `commands/build/lib/envWizardUI.js`** using discord.js's `StringSelectMenuBuilder`, `StringSelectMenuOptionBuilder` (`.setDefault(true)` for pre-selected ids), `ActionRowBuilder`, `ButtonBuilder`/`ButtonStyle`, `EmbedBuilder`. Each select menu sets `minValues: 0` and `maxValues` equal to its option count (multi-select, nothing required). Wrap the ini text in the review embed description inside a ` ```ini ` code block. Button labels/styles are free wording (German, matching the bot's existing tone) — only the `customId`s above are fixed.

- [ ] **Step 4: Run tests, verify all pass.**

- [ ] **Step 5: Commit**

```bash
git add commands/build/lib/envWizardUI.js test/build/envWizardUI.test.js
git commit -m "feat: add discord components for the build-env wizard steps"
```

---

### Task 5: Expose reusable pieces of `buildRunner.js`

**Files:**
- Modify: `commands/build/lib/buildRunner.js:111-136` (current `handleChatInput`), `commands/build/lib/buildRunner.js:279` (exports)
- Test: `test/build/buildRunner.test.js`

**Interfaces:**
- Produces (new exports, consumed by Task 6): `resolveBranchOption(interaction): Promise<{branch: string|null, error: string|null}>` — same branch-validation/default-lookup behavior `handleChatInput` already has (lines 112-123), just extracted into a standalone function instead of inlined; `runOneBuild(interaction, rawText, branch): Promise<void>` (already exists privately, just add it to `module.exports`); `errorEmbed(title, fields): EmbedBuilder` (already exists privately, just add it to `module.exports`).

- [ ] **Step 1: Write the failing test in `test/build/buildRunner.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const buildRunner = require('../../commands/build/lib/buildRunner');

test('buildRunner exports runOneBuild, errorEmbed, and resolveBranchOption for reuse by the env wizard', () => {
  assert.equal(typeof buildRunner.runOneBuild, 'function');
  assert.equal(typeof buildRunner.errorEmbed, 'function');
  assert.equal(typeof buildRunner.resolveBranchOption, 'function');
});

test('resolveBranchOption: rejects an invalid branch name without calling git', async () => {
  const fakeInteraction = { options: { getString: () => 'foo;rm -rf /' }, user: { id: 'u1' } };
  const result = await buildRunner.resolveBranchOption(fakeInteraction);
  assert.equal(result.branch, null);
  assert.match(result.error, /Invalid branch/);
});
```

- [ ] **Step 2: Run tests, verify they fail** (exports don't exist yet / `resolveBranchOption` undefined).

- [ ] **Step 3: Extract `resolveBranchOption`.** Move the body of `handleChatInput`'s lines 112–123 (branch option read, `isValidBranchName` check, default-branch lookup) into a new function `resolveBranchOption(interaction)` that returns `{ branch, error }` instead of calling `interaction.reply` directly. Update `handleChatInput` to call it and keep its current `interaction.reply(errorEmbed(...))` behavior when `error` is set — no behavior change for `/build`. Add `runOneBuild`, `errorEmbed`, `resolveBranchOption` to the `module.exports` on line 279.

- [ ] **Step 4: Run the full test suite (`npm test`), verify everything (including pre-existing tests) still passes.**

- [ ] **Step 5: Commit**

```bash
git add commands/build/lib/buildRunner.js test/build/buildRunner.test.js
git commit -m "refactor: export runOneBuild/errorEmbed/resolveBranchOption for reuse by the build-env wizard"
```

---

### Task 6: Wizard orchestration, slash command, and interaction routing

**Files:**
- Create: `commands/build/lib/envWizardRunner.js`
- Create: `commands/build/buildenv.js`
- Modify: `events/interactionCreate.js:61-72` (add a new branch after the existing `isModalSubmit()` block)
- Test: `test/build/envWizardRunner.test.js`

**Interfaces:**
- Consumes: `envWizardCatalog` (Task 1), `envWizardGenerator.generateEnvIni` (Task 2), `envWizardState.*` (Task 3), `envWizardUI.*` (Task 4), `buildRunner.{runOneBuild, errorEmbed, resolveBranchOption, autocompleteBranch}` (Task 5 + existing), `buildQueue.enqueue` (existing).
- Produces: `envWizardRunner.handleChatInput(interaction): Promise<void>`, `envWizardRunner.handleComponent(interaction): Promise<void>` — both consumed only by `buildenv.js`.

- [ ] **Step 1: Write failing tests in `test/build/envWizardRunner.test.js`** using hand-built fake interaction objects (no real discord.js client/gateway involved — same style as the rest of this codebase's tests, which never open a real Discord connection):

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const envWizardRunner = require('../../commands/build/lib/envWizardRunner');
const { createSession, getSession, clearSession } = require('../../commands/build/lib/envWizardState');

function fakeInteraction({ customId, values = [], userId = 'u1' }) {
  const calls = { update: null, reply: null };
  return {
    customId,
    values,
    user: { id: userId },
    isStringSelectMenu: () => true,
    isButton: () => customId === 'envWizard:usermodsNext' || ['envWizard:confirm', 'envWizard:restart', 'envWizard:cancel'].includes(customId),
    update: async (payload) => { calls.update = payload; },
    reply: async (payload) => { calls.reply = payload; },
    _calls: calls,
  };
}

test('handleComponent: picking a board category renders the board select for that category', async () => {
  createSession('u1', { branch: 'main' });
  const interaction = fakeInteraction({ customId: 'envWizard:boardCategory', values: ['esp8266'] });
  await envWizardRunner.handleComponent(interaction);
  assert.equal(getSession('u1').boardCategoryId, 'esp8266');
  assert.equal(interaction._calls.update.components[0].toJSON().components[0].custom_id, 'envWizard:board');
  clearSession('u1');
});

test('handleComponent: picking a board pre-selects its default usermods', async () => {
  createSession('u1', { branch: 'main' });
  await envWizardRunner.handleComponent(fakeInteraction({ customId: 'envWizard:board', values: ['esp32dev'] }));
  assert.deepEqual(getSession('u1').selectedUsermods, ['audioreactive']);
  clearSession('u1');
});

test('handleComponent: usermod selections from different category menus accumulate, not overwrite', async () => {
  createSession('u1', { branch: 'main', boardId: 'esp32dev', selectedUsermods: ['audioreactive'] });
  await envWizardRunner.handleComponent(fakeInteraction({ customId: 'envWizard:usermods:sensors', values: ['BME280_v2'] }));
  assert.deepEqual(getSession('u1').selectedUsermods.sort(), ['BME280_v2', 'audioreactive'].sort());
  clearSession('u1');
});

test('handleComponent: deselecting a board-default usermod removes it from the session', async () => {
  createSession('u1', { branch: 'main', boardId: 'esp32dev', selectedUsermods: ['audioreactive'] });
  await envWizardRunner.handleComponent(fakeInteraction({ customId: 'envWizard:usermods:network_misc', values: [] }));
  assert.deepEqual(getSession('u1').selectedUsermods, []);
  clearSession('u1');
});

test('handleComponent: an expired/missing session shows an error instead of throwing', async () => {
  const interaction = fakeInteraction({ customId: 'envWizard:board', values: ['esp32dev'] });
  await assert.doesNotReject(() => envWizardRunner.handleComponent(interaction));
  assert.ok(interaction._calls.update || interaction._calls.reply);
});

test('handleComponent: confirm enqueues a build via buildQueue.enqueue, running buildRunner.runOneBuild with the session\'s ini/branch, and clears the session', async () => {
  createSession('u1', { branch: 'main', boardId: 'esp32dev', selectedUsermods: ['audioreactive'], generatedIni: '[env:custom_build]\nextends = env:esp32dev\n' });
  const buildQueue = require('../../commands/build/lib/buildQueue');
  const buildRunner = require('../../commands/build/lib/buildRunner');
  const originalEnqueue = buildQueue.enqueue;
  const originalRunOneBuild = buildRunner.runOneBuild;
  let enqueuedJob = null;
  let runOneBuildArgs = null;
  buildQueue.enqueue = (job) => { enqueuedJob = job; return { jobId: 'fake' }; };
  buildRunner.runOneBuild = async (interaction, rawText, branch) => { runOneBuildArgs = { rawText, branch }; };
  try {
    const interaction = fakeInteraction({ customId: 'envWizard:confirm' });
    await envWizardRunner.handleComponent(interaction);
    assert.ok(enqueuedJob, 'buildQueue.enqueue was not called');
    await enqueuedJob.run({ jobId: 'fake' });
    assert.deepEqual(runOneBuildArgs, { rawText: '[env:custom_build]\nextends = env:esp32dev\n', branch: 'main' });
  } finally {
    buildQueue.enqueue = originalEnqueue;
    buildRunner.runOneBuild = originalRunOneBuild;
  }
  assert.equal(getSession('u1'), null);
});

test('handleComponent: restart clears selections but keeps the branch, re-showing the board-category step', async () => {
  createSession('u1', { branch: 'main', boardId: 'esp32dev', selectedUsermods: ['audioreactive'] });
  const interaction = fakeInteraction({ customId: 'envWizard:restart' });
  await envWizardRunner.handleComponent(interaction);
  const session = getSession('u1');
  assert.equal(session.branch, 'main');
  assert.equal(session.boardId, null);
  assert.equal(interaction._calls.update.components[0].toJSON().components[0].custom_id, 'envWizard:boardCategory');
  clearSession('u1');
});

test('handleComponent: cancel clears the session', async () => {
  createSession('u1', { branch: 'main' });
  await envWizardRunner.handleComponent(fakeInteraction({ customId: 'envWizard:cancel' }));
  assert.equal(getSession('u1'), null);
});
```

- [ ] **Step 2: Run tests, verify they fail.** Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `commands/build/lib/envWizardRunner.js`.**

Import `buildRunner` and `buildQueue` as whole modules (`const buildRunner = require('./buildRunner'); const buildQueue = require('./buildQueue');`) and always call through the module object (`buildRunner.runOneBuild(...)`, `buildQueue.enqueue(...)`) rather than destructuring the functions out at the top of the file. The confirm-path test monkeypatches `buildRunner.runOneBuild` and `buildQueue.enqueue` on the required module objects at test time — a destructured reference captured at `require()` time would not see that monkeypatch and the test would call the real build pipeline.

`handleChatInput(interaction)`: call `buildRunner.resolveBranchOption(interaction)`; on `error`, `interaction.reply({ embeds: [buildRunner.errorEmbed(...)] })` and return (mirrors `/build`'s existing error path). Otherwise `createSession(interaction.user.id, { branch })` and `interaction.reply({ components: [envWizardUI.buildBoardCategoryRow()], ephemeral: true })`.

`handleComponent(interaction)`: look up `getSession(interaction.user.id)`; if `null`, respond (via `update` if the interaction supports it, else `reply`) with an ephemeral "Session abgelaufen, bitte `/buildenv` erneut ausführen" message and return. Otherwise dispatch on `interaction.customId`:
  - `'envWizard:boardCategory'`: `updateSession(userId, { boardCategoryId: interaction.values[0], step: 'board' })`; `interaction.update({ components: [envWizardUI.buildBoardRow(interaction.values[0])] })`.
  - `'envWizard:board'`: look up the board via `catalog.getBoardById(interaction.values[0])`; `updateSession(userId, { boardId: board.id, selectedUsermods: [...board.defaultUsermods], step: 'features' })`; `interaction.update({ components: [envWizardUI.buildFeatureRow([])] })`.
  - `'envWizard:features'`: `updateSession(userId, { selectedFeatureFlags: interaction.values, step: 'usermods' })`; `interaction.update({ components: [...envWizardUI.buildUsermodRows(session.selectedUsermods), envWizardUI.buildUsermodsNextRow()] })`.
  - `customId.startsWith('envWizard:usermods:')`: extract `categoryId = customId.split(':')[2]`; compute the new full `selectedUsermods` by removing every id currently in that category (via `catalog.getUsermodsByCategory(categoryId).map(u => u.id)`) from the session's list, then appending `interaction.values`; `updateSession(userId, { selectedUsermods })`; re-render with `interaction.update({ components: [...envWizardUI.buildUsermodRows(selectedUsermods), envWizardUI.buildUsermodsNextRow()] })`.
  - `'envWizard:usermodsNext'`: `generatedIni = generateEnvIni({ boardId: session.boardId, selectedFeatureFlags: session.selectedFeatureFlags, selectedUsermods: session.selectedUsermods })`; `updateSession(userId, { step: 'review', generatedIni })`; `interaction.update(envWizardUI.buildReviewComponents(generatedIni))` (spread embed/row into `{ embeds: [embed], components: [row] }`).
  - `'envWizard:confirm'`: read `branch`/`generatedIni` off the session, `clearSession(userId)`, then run the *exact* existing enqueue flow: `interaction.update({ content: 'Queued...', embeds: [], components: [] })` followed by `buildQueue.enqueue({ label: ..., onQueued, onStart, run: () => buildRunner.runOneBuild(interaction, generatedIni, branch) })` (same shape as `handleModalSubmit` in `buildRunner.js`).
  - `'envWizard:restart'`: `const { branch } = session; createSession(userId, { branch }); interaction.update({ components: [envWizardUI.buildBoardCategoryRow()] })`.
  - `'envWizard:cancel'`: `clearSession(userId); interaction.update({ content: 'Abgebrochen.', embeds: [], components: [] })`.

- [ ] **Step 4: Run tests, verify all pass.**

- [ ] **Step 5: Write `commands/build/buildenv.js`:**

```js
const { SlashCommandBuilder } = require('discord.js');
const envWizardRunner = require('./lib/envWizardRunner');
const buildRunner = require('./lib/buildRunner');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buildenv')
        .setDescription('Geführte Erstellung einer WLED-Build-Umgebung')
        .addStringOption((option) =>
            option
                .setName('branch')
                .setDescription('Branch or tag (default: repository default branch)')
                .setRequired(false)
                .setAutocomplete(true)
        ),
    async execute(interaction) {
        await envWizardRunner.handleChatInput(interaction);
    },
    async autocomplete(interaction) {
        await buildRunner.autocompleteBranch(interaction);
    },
    async handleComponent(interaction) {
        await envWizardRunner.handleComponent(interaction);
    },
};
```

- [ ] **Step 6: Modify `events/interactionCreate.js`** — add a new `else if` branch directly after the existing `isModalSubmit()` block (after line 71's closing, before the final `}` of `execute`):

```js
} else if (interaction.isStringSelectMenu() || interaction.isButton()) {
    if (interaction.customId.startsWith('envWizard:')) {
        const command = interaction.client.commands.get('buildenv');
        try {
            await command.handleComponent(interaction);
        } catch (error) {
            console.error(error);
            fs.appendFile('log.txt', error, function (err) { });
        }
    }
}
```

- [ ] **Step 7: Run the full test suite (`npm test`), verify everything passes.**

- [ ] **Step 8: Manual verification** (no automated E2E exists for live Discord interactions in this codebase — `/build` itself isn't covered either). Run `node deploy-commands.js` against the dev bot/guild from `config.json`, then in Discord: run `/buildenv`, pick a board from each of the 4 categories at least once across repeated runs, toggle several feature flags, select usermods from at least two different categories in the same run, deselect a board-default usermod, reach the review screen and confirm the shown ini looks right, then click "✅ Build starten" and confirm a real build gets queued (watch for the same `⏳ Queued...`/`🔧 Build started...` progression `/build` shows). Also test "✏️ Von vorne" and "❌ Abbrechen". Also let one session sit idle past 10 minutes and confirm clicking a stale component shows the "run `/buildenv` again" message instead of crashing the bot process.

- [ ] **Step 9: Commit**

```bash
git add commands/build/lib/envWizardRunner.js commands/build/buildenv.js events/interactionCreate.js test/build/envWizardRunner.test.js
git commit -m "feat: add /buildenv wizard command wiring board/feature/usermod selection into the build queue"
```
