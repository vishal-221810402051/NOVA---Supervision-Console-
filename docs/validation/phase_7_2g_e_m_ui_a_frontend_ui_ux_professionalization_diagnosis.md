# Phase 7.2G-E-M-UI-A - Frontend UI/UX Professionalization Diagnosis and Plan

## 1. Executive Summary

This document diagnoses the current NOVA SC frontend and defines a controlled plan for converting it from an engineering validation console into a professional industrial supervision interface.

The current frontend is functionally rich and preserves important safety and evidence semantics, but its presentation model treats nearly every datum as an equally important bordered metric. Fixed column counts, a permanently visible `w-64` sidebar, repeated 10 px uppercase labels, extensive monospace use, and raw enum exposure make the interface dense and fragile below large desktop widths. The highest layout risks are `DeviceRegistryPanel` at seven fixed columns, `GlobalStatusBar` at five fixed columns, the Overview telemetry grid at four columns from the smallest viewport, and fixed four-column groups in System Overview, Power, and Health.

The recommended direction is:

- Keep the dark industrial visual language, but reduce border density and cyan saturation.
- Introduce a responsive application shell with a compact mobile/tablet navigation pattern.
- Establish a clear page, section, metric-group, and value hierarchy.
- Put current health, exceptions, and required operator actions first.
- Move stream IDs, sequence counters, phase IDs, replay internals, raw enums, and evidence mechanics into advanced diagnostics.
- Format raw values for display without changing telemetry, validation, report, or export values.
- Introduce only a small shared presentation layer: `PageHeader`, `SectionCard`, `MetricCard`, `StatusChip`, `EmptyState`, and `ResponsiveMetricGrid` plus display-format helpers.

No implementation is performed in this phase. The recommended work is frontend presentation only.

## 2. Current UI Baseline

### 2.1 Repository baseline

| Check | Result |
|---|---|
| Requested baseline commit | `98c32e9f860144971e78e56d4081dec21aa978bb` |
| Current `git log -1 --oneline` | `98c32e9 Implement Phase 7.2G-E-M-B frontend replay report integration` |
| `git diff --check` before diagnosis | PASS |

Unrelated pre-existing worktree changes were recorded and not modified:

```text
 M docs/validation/phase_7_2g_e_k_replay_result_artifact_schema_implementation_investigation.md
?? docs/reports/week_9_nova_sc_persistent_evidence_validation_report.md
```

### 2.2 Current product character

The frontend is an effective engineering console with these strengths:

- Direct visibility into topology, telemetry integrity, RTC evidence, health rules, and report state.
- Consistent dark theme and semantic green, amber, and red status colors.
- Safety-critical warnings remain visible.
- Report and evidence data are not hidden from technical users.
- Most complex pages already use some responsive breakpoints.

Its primary limitations are presentation rather than function:

- Operator status and developer diagnostics share the same visual priority.
- Fixed grids assume more width than phones and tablets provide.
- The shell does not define a shrinkable main-content area.
- Long IDs, enum values, timestamps, and prose use inconsistent overflow handling.
- Small uppercase text and wide letter spacing reduce scan speed.
- Repeated borders make all content look equally urgent.

## 3. Information Architecture Findings

### 3.1 Primary operator information

The primary layer should answer five questions quickly:

1. Is the system connected and current?
2. Is the hardware chain healthy?
3. Are there warnings or failures requiring attention?
4. Are power and clock subsystems within their validated state?
5. Can an evidence report be exported successfully?

Primary operator content should include:

- Overall health and connection state.
- Telemetry freshness.
- Hardware node and link availability.
- Current power status and measurement availability.
- Clock status, authority, and next required action.
- Active warnings and failed validation rules.
- Evidence/report readiness.
- Soak or stability test state when active.

### 3.2 Advanced diagnostics

The following information remains available but should be placed behind an `Advanced diagnostics` disclosure, secondary tab, expandable row, or details drawer:

- Endpoint and transport kind.
- Stream ID and run ID.
- Global and source sequence numbers.
- Schema rejects and unknown packet counters.
- Frontend event-store counts and rollover details.
- Replay internals and artifact identity.
- Raw enum values and raw protocol field names.
- Phase IDs and validation-engine versions.
- Device addresses, chip-select identifiers, and firmware IDs.
- Full evidence strings and detailed health-rule evidence.

This is a presentation separation only. No data should be deleted from the UI or exported report.

## 4. Header / Navigation Findings

### 4.1 Current shell risks

- `Sidebar` always consumes `w-64` and `min-h-screen`. At 360 px, only about 104 px remains before borders and padding.
- The main flex child has no `min-w-0`, so wide descendants can force page-level horizontal scrolling instead of shrinking.
- The sidebar does not collapse, overlay, scroll independently, or expose a mobile trigger.
- Header content uses a single non-wrapping `justify-between` row.
- The header repeats development-history language: `NOVA SC / PHASE 6.9` and `Hardware Telemetry Baseline`.
- `WS: CONNECTED` exposes transport vocabulary in the primary header.
- Main padding is fixed at `p-6`, which is excessive on 360 px and reduces usable tablet width.

### 4.2 Recommended shell

- Add `min-w-0` to the main content column and page content wrappers.
- Use a desktop sidebar at 1024 px and above.
- Use a top app bar with a menu button and dismissible navigation drawer below 1024 px.
- Keep navigation independently scrollable when viewport height is constrained.
- Use responsive page padding: 16 px at 360/768, 20 px at 1024, and 24-32 px on larger displays.
- Cap readable content with a wide industrial maximum around 1600-1760 px while allowing topology and tables to use the available width.
- Replace the development-phase header with product identity, current page title, and compact system status.

Recommended primary header:

```text
NOVA SC
Supervision Console

[Current page title]                      [Connected] [Live] [Overall: Warning]
```

Phase and baseline metadata should remain available in an `About this validation build` or advanced diagnostics area.

## 5. Responsive Layout Findings

The current code mixes responsive grids with fixed assumptions. Topology and RTC use sensible one-column defaults in many places, while the shell and several high-traffic panels do not.

### 5.1 Target behavior by viewport

| Width | Navigation | Content / cards | Tables and long values |
|---:|---|---|---|
| 360 px | Top bar plus overlay drawer; no persistent sidebar | One column; status summary may use 2 compact columns only for short numeric values | Convert data rows to labeled cards; wrap prose; IDs use middle truncation with accessible full value |
| 768 px | Overlay drawer or compact rail | Two metric columns; primary cards one column; buttons wrap | Registry and health rules use stacked labeled rows, not fixed tables |
| 1024 px | Collapsible desktop sidebar or compact rail | Two to three metric columns; major sections one or two columns | Tables allowed only when each column has a defined shrink/wrap policy |
| 1366 px | Full sidebar | Three to four metric columns; two-column section layouts | Dense diagnostics may use table rows with flexible description columns |
| 1600 px | Full sidebar | Four to six metric columns where values are short | Topology can show the full horizontal chain; details remain readable |
| 1920 px | Full sidebar; centered wide content | Four to six primary columns, up to eight compact diagnostic metrics | Avoid stretching text lines; use max-width and balanced gutters |

### 5.2 No-scroll rule

No viewport should acquire unintentional page-level horizontal scrolling. Local horizontal scrolling should be a last resort for genuinely tabular diagnostic data, should be visually signposted, and should not be used for primary operator content.

## 6. Grid and Overflow Risk Matrix

| Component | Current layout | Risk | Severity | Recommendation |
|---|---|---|---|---|
| Application shell | Persistent `w-64` sidebar; main child lacks `min-w-0` | Leaves unusable mobile content width and lets descendants expand the page | Critical | Drawer below 1024 px; add `min-w-0`; responsive page padding |
| GlobalStatusBar | `grid-cols-5` at every width | Five cards compress and long labels collide | Critical | `grid-cols-2`, `sm:grid-cols-3`, `xl:grid-cols-5`; combine healthy/degraded into device health summary |
| TelemetryStats | `grid-cols-4`, then `xl:grid-cols-9` | Four columns at 360 px are unreadable; nine columns create tiny cards | Critical | Primary metrics 2/3/4 columns; move technical counters to advanced diagnostics |
| SystemOverview | Two fixed `grid-cols-4` groups | Cards become narrow on phone/tablet | High | 1/2/4 responsive columns |
| Topology summary | 1/2/5 responsive | Generally sound | Low | Add `min-w-0` and shared status cards |
| Topology chain | Seven custom columns at XL | Node/link prose can crowd even at 1280 px | High | Vertical chain through 1366 px; horizontal chain only when measured width supports it |
| Detailed link registry | Up to eight columns | Status text and messages lack width and wrapping contracts | High | Labeled cards below XL; table at XL with flexible message column |
| ChipStatus | Fixed `grid-cols-3` | Three status cards compress at 360 px | High | 1/2/3 columns |
| PowerHealth | Fixed four-column groups plus three columns | Raw ADC values and labels compress | Critical | 1/2/4 measurement grid; raw ADC under advanced disclosure |
| RtcStatus | 1/2/4 responsive with `break-words` | Better wrapping, but very high vertical density and arbitrary enum breaking | Medium | Operator summary first; advanced evidence sections collapsed; use `overflow-wrap:anywhere` only for IDs |
| EngineeringLogs | Flowing inline spans in 256 px high region | Long timestamp/event/message lines can widen page; poor column scanning | High | Structured event rows; message wraps; metadata collapses; user-selectable height |
| DeviceRegistryPanel | Fixed `grid-cols-7` | Highest direct overlap/overflow risk; no headers; status prose has no room | Critical | Responsive device cards below 1024/1280; semantic table above that with explicit columns |
| HealthCheckPanel summary | Fixed `grid-cols-4` | Compresses at 360 px | High | 2 columns on phone, 4 from medium widths |
| Health rule row | Fixed XL columns totaling 740 px plus flexible content | Long evidence and timestamps overflow; no `min-w-0` | Critical | Summary row plus expandable evidence; flexible grid; wrap evidence with raw value in details |
| ReportExportPanel header | One horizontal `justify-between` row | Long heading/subtitle/button compete and can overlap | High | Column layout by default; row only at LG; full-width mobile button |
| Report metrics | 1/2/4 responsive | Structurally sound, but values need wrapping policy | Low | Keep responsive grid; humanize status and move internals to details |

### 6.1 Long-value policy

- Human prose: normal wrapping with `break-words` and `min-w-0`.
- IDs and hashes: monospace, middle truncation in summaries, full value in tooltip/details/copy control.
- Endpoints and IP addresses: allow safe wrapping at punctuation; expose copy action.
- Raw enums: display formatted label; raw token in advanced details.
- Timestamps: use localized display where appropriate, with exact UTC in details.
- Never silently truncate a safety message, failure reason, or required next action.

## 7. Spacing Findings

The current interface largely uses `gap-3`, `gap-4`, `p-3`, and `p-4`, but because every metric is independently bordered, the page feels both cramped and fragmented.

Recommended scale:

| Level | Spacing |
|---|---|
| Page edge | 16 px small, 20 px medium, 24-32 px large |
| Major page sections | 24 px small, 32 px large |
| Section title to content | 16 px |
| Metric group gap | 12-16 px |
| Card padding | 16 px compact, 20-24 px normal |
| Inline status gap | 8 px |

Use whitespace to group related values. Do not place a full-strength border around every scalar value. A section card can contain a lightly divided definition list or grouped metric grid.

## 8. Typography Findings

The audit found 83 uses of `uppercase`, `tracking-widest`, `text-[10px]`, or `font-mono` across the shell and components. These styles are useful for compact labels, but their current frequency gives ordinary content the visual character of a protocol debugger.

Recommended hierarchy:

| Role | Treatment |
|---|---|
| Product name | 18-20 px, semibold, limited tracking |
| Page title | 24-30 px, semibold, normal case |
| Page description | 14 px, normal case, muted |
| Section heading | 16-18 px, semibold, normal case |
| Metric label | 12-13 px, medium, normal case; uppercase only when exceptionally compact |
| Primary metric value | 20-28 px, semibold; normal UI font for words |
| Secondary value | 14-16 px |
| Supporting text | 13-14 px; avoid 10 px body content |
| Diagnostic metadata | 12-13 px monospace where technically justified |

Reserve monospace for IDs, hashes, timestamps, addresses, endpoints, sequence numbers, and raw protocol values. Use the normal UI font for health labels, booleans, ordinary counts, descriptions, and actions.

## 9. Developer-Terminology Audit

### 9.1 Classification rules

| Class | Meaning | Examples |
|---|---|---|
| A. KEEP | Directly useful and understandable to an operator | Overall health, Connected, Live, Power, Warning, Event log |
| B. HUMANIZE | Useful state expressed in implementation vocabulary | WebSocket, RTC status, registry, soak, telemetry freshness, replay status |
| C. ADVANCED ONLY | Needed for diagnosis, not primary operation | stream ID, sequence counters, schema rejects, endpoint, transport, raw event store, run ID |
| D. REMOVE FROM PRIMARY UI | Development-history wording that does not explain current operation | Phase labels, V1/V1+, engine branding, baseline phase names |

### 9.2 Visible terminology inventory

| Current visible term or family | Class | Recommended treatment |
|---|---|---|
| `NOVA SC` | A | Keep |
| `Supervision Console` | A | Keep |
| `System Overview` | A | Shorten navigation to `Overview` |
| `Topology` | B | Use `System Topology` |
| `Chip Status` | B | Use `Hardware` |
| `Power Health` | A | Use `Power` in navigation; retain `Power status` heading |
| `RTC Status` / `DS3231 RTC Status` | B | Use `Time & Clock`; name DS3231 in details |
| `Engineering Logs` | B | Use `Event Log`; raw event metadata remains advanced |
| `Device Registry` / `Device Registry Engine` | B/D | Use `Devices`; remove `Engine` from primary UI |
| `V1 Health Check` / `V1+ Supervisory Health Check` | D/B | Use `System Health`; keep engine version in diagnostics/report |
| `V1+ Supervisory Report Export` | D/B | Use `Reports` or `Validation Report` |
| `NOVA SC / PHASE 6.9` | D | Show `NOVA SC`; move phase to build/about details |
| `Hardware Telemetry Baseline` | D/B | Replace with current page description or `Hardware supervision` |
| `WS State` / `WS: CONNECTED` | B | Show `Connection`; retain WebSocket transport in diagnostics |
| `Telemetry Freshness` | B | Show `Data status` with `Live` or `Stale` |
| `Telemetry` in explanatory copy | A | Keep where it distinguishes measured data from commands |
| `Simulator Mode` / `Simulated Source` | B | Show `Data source: Simulation` only when simulated; otherwise advanced |
| `Soak Test` / `Soak Summary` | B | Use `Stability Test` / `Stability Summary` |
| `Phase 7.0 Soak Test` | D/B | Use `Telemetry Stability Test`; phase ID in details |
| `Replay` / `Replay Reconstruction` | C | Use `Evidence verification` in primary report readiness; raw replay terms advanced |
| `Persistent Evidence` | B | Use `Stored Evidence` |
| `Raw`, `Debug`, `RAW_SINGLE_ENDED_DEBUG` | C | Put under `Raw ADC diagnostics` and explain the limitation |
| `Registry`, `Engine` | C/D | Prefer `Devices`, `System checks`; keep internal identifiers out of primary headings |
| `Evidence` | B | Keep where legally/engineering-relevant, with context such as `Clock validation evidence` |
| `Phase 7.2C/E/F/G ... Evidence` | D/B | Use task-oriented section names; show phase ID in advanced metadata |
| Packet, sequence, schema, event-store terms | C | Advanced diagnostics only |

### 9.3 Exact professional wording plan

| Current Visible Text | Recommended Visible Text | Reason | Raw/Internal Value Preserved? |
|---|---|---|---|
| `NOVA SC / PHASE 6.9` | `NOVA SC` | Product identity should not be coupled to development history | Y |
| `Hardware Telemetry Baseline` | `Hardware Supervision` | Describes current function | Y |
| `WS: CONNECTED` | `Connected` | Operator outcome is more important than transport | Y |
| `WS State` | `Connection` | Removes protocol shorthand | Y |
| `Telemetry Freshness` | `Data Status` | More immediately understandable | Y |
| `System Overview` | `Overview` | Shorter navigation label | Y |
| `Topology` | `System Topology` | Clarifies scope | Y |
| `Mission Topology Chain` | `System Communication Path` | Descriptive without mission/development tone | Y |
| `Chip Status` | `Hardware` | Covers chips and attached devices | Y |
| `Power Health` | `Power` | Concise navigation label | Y |
| `RTC Status` | `Time & Clock` | Operator-oriented domain label | Y |
| `DS3231 RTC Status` | `Clock Status` | Device name belongs in details | Y |
| `Engineering Logs` | `Event Log` | Useful outside engineering context | Y |
| `Device Registry Engine` | `Devices` | Removes implementation vocabulary | Y |
| `V1 Health Check` | `System Health` | Removes version history | Y |
| `V1+ Supervisory Health Check` | `System Health Checks` | Clear current function | Y |
| `Topology-aware PASS / WARNING / FAIL validation` | `Automated checks for connectivity, integrity, hardware, and power` | Explains function in plain language | Y |
| `V1+ Supervisory Report Export` | `Validation Report` | Removes engine/version language | Y |
| `Download Supervisory JSON Report` | `Download Validation Report` | Clear action; format can remain supporting text | Y |
| `Phase 7.0 Soak Test` | `Telemetry Stability Test` | Operator-oriented purpose | Y |
| `Start 10 min` | `Run for 10 minutes` | More explicit action | Y |
| `Reset soak` | `Reset test` | Removes specialist wording | Y |
| `Phase 7.2C Validity Evidence` | `Clock Validity` | Task-oriented title | Y |
| `Phase 7.2E RTC Sync Result Evidence` | `Clock Synchronization` | Task-oriented title | Y |
| `Phase 7.2F RTC Retention Evidence` | `Clock Retention` | Task-oriented title | Y |
| `Phase 7.2G RTC Drift Evidence` | `Clock Drift` | Task-oriented title | Y |
| `RTC Can Be Authority` | `Eligible as Time Source` | Human-readable meaning | Y |
| `Timestamp Authority` | `Active Time Source` | Operator-oriented wording | Y |
| `Required Next Action` | `Next Action` | Shorter and clearer | Y |
| `Persistent Evidence` | `Stored Evidence` | Less implementation-specific | Y |
| `Persistent Replay` | `Evidence Verification` | Describes outcome rather than mechanism | Y |
| `Replay Reconstruction` | `Evidence Reconstruction` | Humanizes while retaining meaning | Y |
| `Simulator Mode` | `Data Source` with `Simulation`/`Hardware` | Presents meaningful state | Y |
| `Raw ADC input voltage - not calibrated rail voltage` | `Raw ADC diagnostics. These readings are not calibrated rail voltages.` | Clear safety limitation in normal sentence case | Y |

## 10. Raw Enum Presentation

### 10.1 Strategy

Add a frontend-only presentation utility that maps known domains to display labels while preserving raw values:

```text
formatStatus(domain, rawValue) -> {
  label,
  tone,
  description,
  rawValue
}
```

The formatter should:

- Use domain-specific maps rather than one global replacement table.
- Fall back safely by replacing underscores with spaces and applying sentence/title case.
- Never change store values, comparisons, health calculations, report generation, or exports.
- Return the original token for advanced details and copy actions.
- Keep mappings near presentation code, not telemetry contracts.
- Unit-test representative values and unknown-value fallback.

### 10.2 Representative mappings

| Raw value | Primary display | Advanced detail |
|---|---|---|
| `RTC_PRESENT_TIME_INVALID_OSF` | `Clock detected; time invalid` | Raw value plus OSF explanation |
| `PI_BACKEND_UTC` | `Raspberry Pi system time` | `PI_BACKEND_UTC` |
| `PI_GATEWAY_SYSTEM_CLOCK` | `Gateway system clock` | `PI_GATEWAY_SYSTEM_CLOCK` |
| `PI_TO_RTC_SESSION_SYNC_REQUIRED` | `Synchronize the clock` | Raw next-action token |
| `RETENTION_CHECK_PENDING` | `Retention check pending` | Raw retention status |
| `DRIFT_OBSERVATION_IN_PROGRESS` | `Drift observation in progress` | Raw drift status and timing fields |
| `DRIFT_EVIDENCE_READY` | `Drift evidence ready` | Raw status and tolerance evidence |
| `RAW_SINGLE_ENDED_DEBUG` | `Raw single-ended readings` | Raw ADC mode |
| `REPLAY_RUN_ID_MISMATCH` | `Evidence run does not match` | Raw failure code and expected/actual IDs |
| `LINK_HEALTHY` | `Healthy` | Raw link state |
| `REPORT_DATA_UNAVAILABLE` | `Verification data unavailable` | Raw capture status and error reason |

Do not create a giant switch inside each component. Use small domain maps such as `connection`, `health`, `clock`, `drift`, `retention`, `replay`, and `powerMeasurement`.

## 11. Page-by-Page Findings

| Component | Current purpose and layout | Main issues | Recommended presentation | Risk |
|---|---|---|---|---|
| `TelemetryStats` | Overview transport, stream, integrity, registry, event-store, replay, and stability metrics; 4/9-column main grid plus stability sections | Extreme density; four columns on mobile; nine tiny desktop columns; diagnostic counters dominate; values are truncated in code without a full-value affordance | Show 6-8 operator KPIs, active warnings, and current stability run first. Move endpoint, sequence, event store, replay, and packet taxonomy to advanced diagnostics | High |
| `SystemOverview` | Four hardware statuses and four resource/network metrics | Fixed four columns; duplicated Panel/Metric; stale state reduces entire panel opacity and may weaken warning contrast | Responsive 1/2/4 layout; group controller, network, and link status; retain explicit stale banner without fading critical text | Medium |
| `TopologyView` | Chain health, nodes, links, gateway resources, integrity, detailed link registry | Seven-column horizontal chain and eight-column detailed rows; raw IDs/roles; animated healthy heartbeat is decorative motion | Responsive vertical path through medium widths; horizontal only on wide screens; status summary first; technical IDs in details; respect reduced motion | High |
| `ChipStatus` | Three chip/device status badges | Fixed three columns; generic panel; likely no explanation of device purpose | Rename page Hardware; responsive cards with device role, presence, and warning; addresses/details secondary | Medium |
| `PowerHealth` | Rail status, power state, measurement mode, and raw ADC channels | Fixed four/three columns; raw debug mode appears alongside primary rail health; raw values can crowd | Primary power summary and measurement availability first; raw ADC diagnostics collapsed and clearly labeled as uncalibrated | High |
| `RtcStatus` | Clock validity, sync, retention, drift, raw RTC state | Four large evidence sections and dozens of equal metrics; phase-history headings; many raw enums; long evidence prose; high cognitive load | Create operator summary: clock detected, active time source, synchronization, retention/drift state, next action. Put each evidence phase in expandable advanced sections with formatted labels and raw values | High |
| `EngineeringLogs` | Recent telemetry events with timestamp, severity, IDs, sequences, event type, and message | Inline monospace line has no column structure; long lines can overflow; 256 px height is restrictive; no empty state/filtering | Rename Event Log; structured rows with time, severity, source, message; metadata expandable; wrap messages; preserve raw event data | High |
| `DeviceRegistryPanel` | Lists device identity, type, bus, address, health, heartbeat, and message in seven columns | Critical small-screen failure; no labels/headers; long message squeezed; raw kind/bus dominate | Device cards below desktop; semantic table on wide screens; primary name/health/message, secondary bus/address/heartbeat | Critical |
| `HealthCheckPanel` | Evaluates and displays health result, category summaries, rule result/severity/details/evidence | Fixed four-column summary; rigid XL row; raw evidence/timestamps always visible; V1+ terminology | System Health page with overall state, failed/warning checks first, passing groups collapsed, rule evidence expandable | High |
| `ReportExportPanel` | Builds and downloads validation report; displays included scopes and replay/evidence status | Heading/button can collide; many internal claims shown as equal metrics; raw capture error shown directly | Stack header/action until LG; prominent export readiness and action; group contents; advanced evidence verification detail; humanize error with raw reason in details | Medium |

### 11.1 Global status and shell components

| Component | Finding | Recommendation | Risk |
|---|---|---|---|
| `Sidebar` | Fixed width and always present; uppercase button labels; no focus-visible treatment | Responsive drawer/desktop sidebar; normal-case labels; clear selected state and keyboard focus | Critical |
| `GlobalStatusBar` | Five equal cards at all widths; transport vocabulary; border-heavy | Responsive summary with Overall Health, Connection, Data Status, and Devices; 2/3/5 columns as space permits | Critical |

## 12. Proposed Navigation

Recommended primary navigation, ordered by operator workflow:

1. `Overview`
2. `System Topology`
3. `Hardware`
4. `Power`
5. `Time & Clock`
6. `Event Log`
7. `Devices`
8. `System Health`
9. `Reports`

These labels accurately match current functionality. `Hardware` should initially represent the existing chip-status page rather than implying actuator control. The interface must not use visual wording that suggests commands, actuation, or control readiness.

Advanced diagnostics can be a consistent disclosure within pages rather than a tenth top-level destination. This keeps context: topology diagnostics stay with topology, clock evidence stays with Time & Clock, and report replay details stay with Reports.

## 13. Proposed Visual System

### 13.1 Hierarchy

```text
Page
  Page header and current system state
  Primary operator summary
  Exceptions / required actions
  Section card
    Metric group or definition list
  Advanced diagnostics disclosure
```

### 13.2 Cards and borders

- Page background: retain near-black/slate foundation.
- Section surfaces: one subtle `slate-800/60` border and 8-12 px radius.
- Metric groups: use tonal surface differences or dividers; avoid a full border around every scalar.
- Critical alerts: stronger border plus icon/text, not color alone.
- Primary accent: cyan for selection, focus, and key information, not every value.
- Healthy green: confirm state but do not color large surfaces unnecessarily.
- Amber: caution, stale data, pending action, and incomplete validation.
- Red: offline, failed, critical, or unsafe evidence only.
- Radius: 8 px compact controls, 10-12 px section cards.
- No decorative gradients or non-functional animation.

### 13.3 Status presentation

Every status should combine:

- Human-readable text.
- Icon or shape where useful.
- Semantic color.
- Optional supporting description.
- Raw value in advanced details when it differs from the display label.

## 14. Shared Component Strategy

Duplication exists across `SystemOverview`, `ChipStatus`, `PowerHealth`, `TelemetryStats`, `RtcStatus`, `TopologyView`, `GlobalStatusBar`, and `ReportExportPanel`. Multiple local `Panel` and `Metric` implementations repeat nearly identical borders, labels, typography, and stale handling.

Introduce a small V1 set:

| Component | Responsibility |
|---|---|
| `PageHeader` | Page title, description, compact status/actions, responsive wrapping |
| `SectionCard` | Consistent section surface, heading, description, optional action and stale state |
| `MetricCard` | Label/value/supporting text with safe wrapping and optional status tone |
| `StatusChip` | Text plus semantic tone/icon; never color-only |
| `EmptyState` | Consistent waiting/no-data/unavailable presentation |
| `ResponsiveMetricGrid` | Standard 1/2/3/4-column behavior and child `min-w-0` |

Add presentation utilities under `frontend/src/presentation/`:

- `formatStatus.ts` for display labels, descriptions, tones, and raw values.
- `formatTechnicalValue.ts` for IDs, timestamps, endpoints, booleans, and unknown/unavailable states.

Do not create a full design-system package, generalized table framework, or new state layer. Keep domain calculations in their current modules.

## 15. Responsive Breakpoint Strategy

Use the existing Tailwind breakpoints consistently, with behavior designed around content rather than merely adding columns:

- Base, 360 px: one-column content; two columns only for short numeric summaries.
- `sm`, 640 px: two metric columns where labels are short.
- `md`, 768 px: two columns for general cards; stacked data rows remain preferable.
- `lg`, 1024 px: desktop navigation can appear; three columns for compact metrics; two-column sections.
- `xl`, 1280 px: four columns for standard metrics and wide diagnostic tables where safe.
- `2xl`, 1536 px: five or six compact metrics; horizontal topology only after content validation.

Rules:

- Every flex/grid content child that may contain long text receives `min-w-0`.
- Avoid fixed columns at base width.
- Avoid more than six metric columns, even at 1920 px, unless values are guaranteed short.
- Tables switch to cards or labeled rows below their proven minimum width.
- Buttons use `flex-wrap`; primary actions become full-width on small screens.

## 16. Accessibility

Minimal practical fixes for implementation:

- Raise routine text from 10 px to at least 12-13 px; body/supporting text should generally be 14 px.
- Add visible `focus-visible` outlines to navigation and buttons.
- Mark current navigation with `aria-current="page"`.
- Give the mobile drawer an accessible name, close behavior, focus management, and Escape handling.
- Preserve semantic `h1`, `h2`, and `h3` order; currently pages rely primarily on component `h2` headings under one static app `h1`.
- Do not use color alone for state; include status text and, where helpful, an icon.
- Verify muted slate text contrast against black/slate backgrounds, especially `text-slate-500` at 10-12 px.
- Do not fade entire stale panels with `opacity-70`; this also fades warnings and reduces readability.
- Add reduced-motion behavior for the topology heartbeat pulse.
- Ensure buttons remain at least about 44 px high on touch layouts.
- Preserve full technical values through accessible details, title text, or copy controls.
- Keep keyboard navigation order aligned with visual navigation order.
- Use semantic tables only where the data is genuinely tabular and provide headers.

## 17. Implementation File Impact

### 17.1 Must modify

- `frontend/src/App.tsx`
- `frontend/src/index.css`
- `frontend/src/components/Sidebar.tsx`
- `frontend/src/components/GlobalStatusBar.tsx`
- `frontend/src/components/TelemetryStats.tsx`
- `frontend/src/components/SystemOverview.tsx`
- `frontend/src/components/TopologyView.tsx`
- `frontend/src/components/ChipStatus.tsx`
- `frontend/src/components/PowerHealth.tsx`
- `frontend/src/components/RtcStatus.tsx`
- `frontend/src/components/EngineeringLogs.tsx`
- `frontend/src/components/DeviceRegistryPanel.tsx`
- `frontend/src/components/HealthCheckPanel.tsx`
- `frontend/src/components/ReportExportPanel.tsx`

### 17.2 May modify or add

- `frontend/src/components/StatusBadge.tsx`, preferably replaced or adapted to `StatusChip`.
- `frontend/src/components/ui/PageHeader.tsx`
- `frontend/src/components/ui/SectionCard.tsx`
- `frontend/src/components/ui/MetricCard.tsx`
- `frontend/src/components/ui/StatusChip.tsx`
- `frontend/src/components/ui/EmptyState.tsx`
- `frontend/src/components/ui/ResponsiveMetricGrid.tsx`
- `frontend/src/presentation/formatStatus.ts`
- `frontend/src/presentation/formatTechnicalValue.ts`
- Focused frontend tests for display formatting and presentation behavior.

### 17.3 Must not modify

- `backend/`
- `firmware/`
- WebSocket protocol definitions or transport behavior.
- `frontend/src/store/telemetryStore.ts` semantics.
- `frontend/src/state/healthCheckEngine.ts` calculations.
- RTC validity, retention, drift, or authority calculations.
- Persistent replay validation or artifact loading.
- Persistent evidence behavior.
- Report schemas, raw values, or exported evidence contracts.
- Telemetry freshness algorithm.
- Command/control, actuator, PWM, GPIO, PCA9685, or FRAM behavior.

Types may be imported for presentation, but domain contracts should not be changed merely to support labels or layout.

## 18. Implementation Phasing

The smallest safe sequence is:

### UI-B1: Shell and shared presentation primitives

- Add responsive app shell, mobile drawer, `min-w-0`, page container, and page-aware header.
- Add the six small shared presentational components.
- Add focus states and baseline typography tokens.
- Preserve existing page selection semantics.

### UI-B2: Overview and global status

- Professionalize Global Status, Telemetry Stats, System Overview, and stability-test presentation.
- Separate operator metrics from advanced transport/integrity diagnostics.
- Do not change soak actions or calculations.

### UI-B3: Topology, hardware, and power

- Make topology adaptive and change detailed link rows to responsive cards/tables.
- Convert Hardware and Power grids to responsive groups.
- Move raw ADC data into an advanced disclosure.

### UI-B4: Time, health, and devices

- Add display formatting for clock and validation enums.
- Reorganize RTC content around current state and next action.
- Make health rules and device data responsive with expandable evidence.

### UI-B5: Reports, event log, and terminology

- Professionalize report readiness and export layout without changing export behavior.
- Convert logs to structured responsive event rows.
- Complete wording and typography cleanup across all pages.

### UI-V: Responsive and regression validation

- Validate all target widths and long-value fixtures.
- Run frontend tests, lint, and build.
- Confirm report export, health semantics, telemetry freshness, and safety wording remain unchanged.

Each phase should be reviewable and reversible without requiring the next phase.

## 19. Validation Strategy

### 19.1 Width matrix

Validate every primary page at:

```text
360 px
768 px
1024 px
1366 px
1600 px
1920 px
```

At each width verify:

- No component overlap or clipping.
- No accidental page-level horizontal scrolling.
- Navigation opens, closes, selects pages, and exposes current state.
- Header, action buttons, and status chips wrap intentionally.
- Long stream IDs, run IDs, endpoints, timestamps, enums, and evidence messages remain accessible.
- Cards adapt without creating unreadably narrow columns.
- Tables become cards/labeled rows at their designed breakpoint.
- Status remains understandable without color.
- Focus order and focus visibility remain clear.
- Empty, waiting, stale, warning, failure, and unavailable states are readable.

### 19.2 Functional regression

- Report export still makes the same health request and produces the same report contract.
- Raw report values remain unchanged despite formatted UI labels.
- Telemetry ingestion and store updates remain unchanged.
- Health results, freshness, replay, persistent evidence, RTC authority, and safety boundaries remain unchanged.
- Stability-test controls invoke the same store actions.
- Frontend tests pass.
- `npm run build` passes.
- Changed-file lint passes; existing repository lint debt is tracked separately.
- `git diff --check` passes.

### 19.3 Browser automation availability

No Playwright, Cypress, Puppeteer, WebDriver, or repository browser-test setup was found. The current frontend has Vitest unit tests only. Do not add browser tooling during this diagnosis. UI-V should use manual responsive browser inspection or existing Codex/browser control for viewport checks, screenshots, keyboard navigation, and console errors. A later tooling decision can add automated visual regression only if separately approved.

## 20. Risks / Non-Goals

### 20.1 Risks

- Hiding too much diagnostic data could slow engineering investigation. Mitigation: progressive disclosure, not deletion.
- Humanized labels could be mistaken for changed state semantics. Mitigation: centralized formatting with raw value always preserved.
- Shell changes could break page selection or narrow-screen focus. Mitigation: implement shell first and validate keyboard/mobile behavior before page migrations.
- Shared components could become an overgeneralized design system. Mitigation: limit V1 to six presentational components and two formatter modules.
- Status colors could accidentally change meaning. Mitigation: define one semantic tone mapping and test known/unknown states.
- RTC and replay wording could overstate validation. Mitigation: preserve existing non-claims and authority statements verbatim where needed.

### 20.2 Non-goals and safety boundary

Professionalization must not change:

- Backend or firmware.
- WebSocket or telemetry protocols.
- Telemetry store semantics.
- Health calculation or rule ordering semantics.
- Telemetry freshness calculation.
- Replay validation or artifact selection.
- Persistent evidence collection or finalization.
- Report/export contracts or raw evidence values.
- RTC authority, validity, synchronization, retention, or drift rules.
- Command/control and actuator safety boundaries.

Display labels, grouping, hierarchy, wrapping, and responsive behavior may change. Underlying values and behavior may not.

## 21. Acceptance Criteria

Phase UI implementation is acceptable only when:

- Navigation is usable at all six target widths.
- The 360 px layout does not retain a persistent 256 px sidebar.
- The main content column and long-value containers use a reliable shrink/wrap strategy.
- No fixed multi-column layout causes overlap or accidental horizontal page scrolling.
- Global status is readable at 360 px.
- Device and health-rule rows become responsive labeled content below desktop width.
- Report heading and action do not compete or overlap.
- Primary pages show operator state before diagnostic internals.
- Raw enums have human-readable labels and accessible raw-value details.
- Phase/version/engine wording is removed from primary navigation and headers but remains in evidence/report metadata.
- Ordinary prose is not rendered as 10 px uppercase monospace text.
- Status is not conveyed by color alone.
- Existing telemetry, health, freshness, RTC, replay, evidence, report, and safety semantics remain unchanged.
- Frontend tests and build pass.
- Responsive visual validation passes at 360, 768, 1024, 1366, 1600, and 1920 px.
- `git diff --check` passes.

## 22. Final Recommendation

Proceed with Phase UI-B1 as a shell and presentation-foundation change only. The first implementation should solve the structural constraints before restyling individual pages: responsive navigation, `min-w-0`, page width/padding, heading hierarchy, focus treatment, and the small shared component set.

Then migrate pages in operator-value order: Overview and global status; Topology/Hardware/Power; Time/Health/Devices; Reports/Event Log. Keep advanced diagnostics colocated with their domain through disclosures rather than creating a disconnected developer-only page.

The professional target is not a less technical system. It is a system that presents operational truth first, exposes engineering detail deliberately, and remains legible from 360 px through 1920 px without changing any underlying validation or safety claim.

```text
PHASE_7_2G_E_M_UI_A_FRONTEND_UI_UX_PROFESSIONALIZATION_DIAGNOSIS: READY_FOR_REVIEW
```
