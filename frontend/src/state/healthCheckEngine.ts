import type {
  ConnectionState,
  DeviceRegistryEntry,
  GatewayHealthPayload,
  HealthCheckCategory,
  HealthCheckResult,
  HealthCheckRule,
  HealthCheckSeverity,
} from "../types/telemetry";
import type { DeviceRegistry } from "./deviceRegistry";
import { DEVICE_IDS } from "./deviceRegistry";
import type { LinkRegistry, LinkRegistryEntry } from "./linkRegistry";
import { LINK_IDS } from "./linkRegistry";

export function evaluateV1HealthCheck(
  registry: DeviceRegistry,
  isTelemetryStale: boolean
): {
  overall: HealthCheckResult;
  rules: HealthCheckRule[];
} {
  const rules: HealthCheckRule[] = [
    requiredHealthy(
      "MAIN_MCU_HEALTH",
      "MAIN ESP32-S3 health",
      registry[DEVICE_IDS.MAIN_MCU]
    ),
    requiredHealthy(
      "SUB_MCU_HEALTH",
      "SUB ESP32-S3 health",
      registry[DEVICE_IDS.SUB_MCU]
    ),
    requiredHealthy(
      "WIFI_LINK_ACTIVE",
      "WiFi telemetry link",
      registry[DEVICE_IDS.WIFI_LINK]
    ),
    requiredHealthy(
      "MAIN_SUB_UART_ACTIVE",
      "MAIN / SUB UART link",
      registry[DEVICE_IDS.MAIN_SUB_UART]
    ),
    requiredHealthy(
      "ADS1115_DETECTED",
      "ADS1115 ADC detected at 0x48",
      registry[DEVICE_IDS.ADS1115]
    ),
    requiredHealthy(
      "DS3231_DETECTED",
      "DS3231 RTC detected at 0x68",
      registry[DEVICE_IDS.DS3231]
    ),
    requiredHealthy(
      "PCA9685_1_DETECTED",
      "PCA9685 #1 detected at 0x40",
      registry[DEVICE_IDS.PCA9685_1]
    ),
    requiredHealthy(
      "PCA9685_2_DETECTED",
      "PCA9685 #2 detected at 0x41",
      registry[DEVICE_IDS.PCA9685_2]
    ),
    requiredHealthy(
      "PCA9685_ALLCALL_DETECTED",
      "PCA9685 AllCall detected at 0x70",
      registry[DEVICE_IDS.PCA9685_ALLCALL]
    ),
    requiredHealthy(
      "VIN_PRESENT",
      "VIN protected rail present",
      registry[DEVICE_IDS.VIN_PROTECTED]
    ),
    requiredHealthy(
      "RAIL_5V_VALID",
      "+5V logic rail valid",
      registry[DEVICE_IDS.RAIL_5V]
    ),
    requiredHealthy(
      "RAIL_3V3_VALID",
      "+3V3 logic rail valid",
      registry[DEVICE_IDS.RAIL_3V3]
    ),
    warningExpected(
      "FRAM_SPI_PENDING",
      "FRAM SPI validation pending",
      registry[DEVICE_IDS.FRAM]
    ),
    staleTelemetryRule(isTelemetryStale),
  ];

  const hasFail = rules.some((r) => r.result === "FAIL");
  const hasWarning = rules.some((r) => r.result === "WARNING");

  return {
    overall: hasFail ? "FAIL" : hasWarning ? "WARNING" : "PASS",
    rules,
  };
}

export function evaluateV1PlusHealthCheck(params: {
  deviceRegistry: DeviceRegistry;
  linkRegistry: LinkRegistry;
  gatewayHealth: GatewayHealthPayload | null;
  connectionState: ConnectionState;
  isTelemetryStale: boolean;
  activeStreamId: string | null;
  packetRateHz: number;
  duplicatePackets: number;
  outOfOrderPackets: number;
  sequenceGaps: number;
  sequenceResets: number;
  streamSwitches: number;
}, options: {
  nowMs?: number;
} = {}): {
  overall: HealthCheckResult;
  rules: HealthCheckRule[];
  summary: {
    pass: number;
    warning: number;
    fail: number;
    critical: number;
  };
} {
  const piGateway = params.deviceRegistry[DEVICE_IDS.PI_GATEWAY];
  const mainMcu = params.deviceRegistry[DEVICE_IDS.MAIN_MCU];
  const subMcu = params.deviceRegistry[DEVICE_IDS.SUB_MCU];

  const rules: HealthCheckRule[] = [
    ...topologyRules(params, piGateway, mainMcu, subMcu),
    ...gatewayRules(params.gatewayHealth, piGateway),
    ...linkRules(params.linkRegistry, params.connectionState, options.nowMs),
    ...streamRules(params),
    ...integrityRules(params),
    nodeRule("NODE_PI_GATEWAY_HEALTH", "Pi gateway node", piGateway),
    nodeRule("NODE_MAIN_ESP32_HEALTH", "MAIN ESP32-S3 node", mainMcu),
    nodeRule("NODE_SUB_ESP32_HEALTH", "SUB ESP32-S3 node", subMcu),
    ...chipPowerRules(params.deviceRegistry),
  ];

  const hasFail = rules.some((r) => r.result === "FAIL");
  const hasWarning = rules.some((r) => r.result === "WARNING");

  return {
    overall: hasFail ? "FAIL" : hasWarning ? "WARNING" : "PASS",
    rules,
    summary: {
      pass: rules.filter((r) => r.result === "PASS").length,
      warning: rules.filter((r) => r.result === "WARNING").length,
      fail: rules.filter((r) => r.result === "FAIL").length,
      critical: rules.filter((r) => r.severity === "CRITICAL").length,
    },
  };
}

function topologyRules(
  params: {
    deviceRegistry: DeviceRegistry;
    linkRegistry: LinkRegistry;
    connectionState: ConnectionState;
    isTelemetryStale: boolean;
    activeStreamId: string | null;
  },
  piGateway: DeviceRegistryEntry | undefined,
  mainMcu: DeviceRegistryEntry | undefined,
  subMcu: DeviceRegistryEntry | undefined
): HealthCheckRule[] {
  const laptopReachability = laptopSupervisionResult(
    params.connectionState,
    params.isTelemetryStale,
    params.activeStreamId
  );
  const links = [
    params.linkRegistry[LINK_IDS.LAPTOP_PI],
    params.linkRegistry[LINK_IDS.PI_MAIN],
    params.linkRegistry[LINK_IDS.MAIN_SUB],
  ];
  const allLinksHealthy = links.every((l) => l?.link_state === "LINK_HEALTHY");
  const allLinksSynced = links.every((l) => l?.sync_state === "SYNCED");
  const chainReachable =
    laptopReachability.result === "PASS" &&
    piGateway?.health_state === "HEALTHY" &&
    mainMcu?.health_state === "HEALTHY" &&
    subMcu?.health_state === "HEALTHY" &&
    allLinksHealthy &&
    allLinksSynced &&
    !params.isTelemetryStale &&
    params.connectionState === "CONNECTED";

  return [
    rule({
      rule_id: "TOPOLOGY_LAPTOP_CONSOLE_REACHABLE",
      label: "Laptop console supervision reachable",
      category: "TOPOLOGY",
      result: laptopReachability.result,
      severity: laptopReachability.severity,
      details: laptopReachability.details,
      evidence: {
        source: "connectionState",
        value: params.connectionState,
      },
    }),
    requiredNodeRule("TOPOLOGY_NODE_PI_PRESENT", "Pi gateway present", piGateway, "TOPOLOGY"),
    requiredNodeRule("TOPOLOGY_NODE_MAIN_PRESENT", "MAIN ESP32-S3 present", mainMcu, "TOPOLOGY"),
    requiredNodeRule("TOPOLOGY_NODE_SUB_PRESENT", "SUB ESP32-S3 present", subMcu, "TOPOLOGY"),
    rule({
      rule_id: "TOPOLOGY_CHAIN_REACHABLE",
      label: "Laptop / Pi / MAIN / SUB chain reachable",
      category: "TOPOLOGY",
      result: chainReachable ? "PASS" : "FAIL",
      severity: chainReachable ? "INFO" : "CRITICAL",
      details: chainReachable
        ? "All topology links are healthy, synced, connected, and fresh"
        : "Topology chain is not fully healthy, synced, connected, and fresh",
      evidence: {
        source: "linkRegistry",
        value: `healthy=${allLinksHealthy} synced=${allLinksSynced} stale=${params.isTelemetryStale}`,
      },
    }),
  ];
}

function gatewayRules(
  gatewayHealth: GatewayHealthPayload | null,
  piGateway: DeviceRegistryEntry | undefined
): HealthCheckRule[] {
  if (!gatewayHealth) {
    return [
      rule({
        rule_id: "GATEWAY_TELEMETRY_PRESENT",
        label: "Gateway health telemetry present",
        category: "GATEWAY",
        result: "FAIL",
        severity: "CRITICAL",
        details: "No GATEWAY_HEALTH_TELEMETRY packet has been received",
        evidence: { source: "gatewayHealth", value: false },
      }),
      rule({
        rule_id: "GATEWAY_NODE_HEALTH",
        label: "Pi gateway node health",
        category: "GATEWAY",
        result: piGateway?.health_state === "HEALTHY" ? "PASS" : "FAIL",
        severity: piGateway?.health_state === "HEALTHY" ? "INFO" : "CRITICAL",
        details: piGateway
          ? `Pi gateway is ${piGateway.health_state}: ${piGateway.status_message}`
          : "Pi gateway node is missing from the device registry",
        evidence: {
          source: "deviceRegistry.pi_gateway",
          value: piGateway?.health_state ?? null,
        },
      }),
    ];
  }

  const cpu = thresholdRule(
    "GATEWAY_RESOURCE_CPU",
    "Gateway CPU load",
    "GATEWAY",
    gatewayHealth.cpu_percent,
    70,
    85,
    "%",
    "simulated gateway telemetry"
  );
  const memory = thresholdRule(
    "GATEWAY_RESOURCE_MEMORY",
    "Gateway memory load",
    "GATEWAY",
    gatewayHealth.memory_used_percent,
    75,
    90,
    "%",
    "simulated gateway telemetry"
  );
  const disk = thresholdRule(
    "GATEWAY_RESOURCE_DISK",
    "Gateway disk usage",
    "GATEWAY",
    gatewayHealth.disk_used_percent,
    80,
    90,
    "%",
    "simulated gateway telemetry"
  );

  return [
    rule({
      rule_id: "GATEWAY_TELEMETRY_PRESENT",
      label: "Gateway health telemetry present",
      category: "GATEWAY",
      result: "PASS",
      severity: "INFO",
      details: "GATEWAY_HEALTH_TELEMETRY is present",
      evidence: {
        source: "gatewayHealth",
        timestamp_utc: piGateway?.last_seen_utc ?? null,
        value: true,
      },
    }),
    rule({
      rule_id: "GATEWAY_NODE_HEALTH",
      label: "Pi gateway node health",
      category: "GATEWAY",
      result: gatewayHealth.health_state === "HEALTHY" ? "PASS" : "FAIL",
      severity: gatewayHealth.health_state === "HEALTHY" ? "INFO" : "CRITICAL",
      details: `Pi gateway is ${gatewayHealth.health_state}: ${gatewayHealth.status_message}`,
      evidence: {
        source: "gatewayHealth.health_state",
        value: gatewayHealth.health_state,
      },
    }),
    thresholdRule(
      "GATEWAY_BUFFER_DEPTH",
      "Gateway buffer depth",
      "GATEWAY",
      gatewayHealth.buffer_depth,
      11,
      50,
      " packets",
      "simulated gateway telemetry"
    ),
    rule({
      rule_id: "GATEWAY_DROPPED_PACKETS",
      label: "Gateway dropped packets",
      category: "GATEWAY",
      result: gatewayHealth.dropped_packets === 0 ? "PASS" : "WARNING",
      severity: gatewayHealth.dropped_packets === 0 ? "INFO" : "WARNING",
      details:
        gatewayHealth.dropped_packets === 0
          ? "No gateway dropped packets reported in simulated telemetry"
          : `${gatewayHealth.dropped_packets} gateway dropped packet(s) reported in simulated telemetry`,
      evidence: {
        source: "gatewayHealth.dropped_packets",
        value: gatewayHealth.dropped_packets,
      },
    }),
    cpu,
    memory,
    disk,
  ];
}

function linkRules(
  linkRegistry: LinkRegistry,
  connectionState: ConnectionState,
  nowMs?: number
): HealthCheckRule[] {
  return [
    ...rulesForLink("LAPTOP_PI", linkRegistry[LINK_IDS.LAPTOP_PI], connectionState, nowMs),
    ...rulesForLink("PI_MAIN", linkRegistry[LINK_IDS.PI_MAIN], connectionState, nowMs),
    ...rulesForLink("MAIN_SUB", linkRegistry[LINK_IDS.MAIN_SUB], connectionState, nowMs),
  ];
}

function rulesForLink(
  id: string,
  link: LinkRegistryEntry | undefined,
  connectionState: ConnectionState,
  nowMs?: number
): HealthCheckRule[] {
  if (!link) {
    return [
      rule({
        rule_id: `LINK_${id}_HEALTH`,
        label: `${id} link health`,
        category: "LINK",
        result: "FAIL",
        severity: "CRITICAL",
        details: "Link entry missing from LinkRegistry",
        evidence: { source: `linkRegistry.${id}`, value: null },
      }),
    ];
  }

  const health = linkStateResult(link.link_state);
  const sync = syncStateResult(link.sync_state);
  const heartbeatAge = getHeartbeatAgeMs(link, nowMs);
  const freshness = heartbeatFreshnessResult(heartbeatAge, connectionState);

  return [
    rule({
      rule_id: `LINK_${id}_HEALTH`,
      label: `${link.display_name} health`,
      category: "LINK",
      result: health.result,
      severity: health.severity,
      details: `${link.display_name} reports ${link.link_state}`,
      evidence: { source: link.link_id, value: link.link_state },
    }),
    rule({
      rule_id: `LINK_${id}_SYNC`,
      label: `${link.display_name} sync`,
      category: "LINK",
      result: sync.result,
      severity: sync.severity,
      details: `${link.display_name} sync state is ${link.sync_state}`,
      evidence: { source: link.link_id, value: link.sync_state },
    }),
    rule({
      rule_id: `LINK_${id}_HEARTBEAT_FRESHNESS`,
      label: `${link.display_name} heartbeat freshness`,
      category: "LINK",
      result: freshness.result,
      severity: freshness.severity,
      details:
        heartbeatAge === null
          ? "No heartbeat timestamp is available"
          : `Heartbeat age is ${Math.round(heartbeatAge)} ms`,
      evidence: {
        source: `${link.link_id}.last_heartbeat_utc`,
        timestamp_utc: link.last_heartbeat_utc,
        value: heartbeatAge === null ? null : Math.round(heartbeatAge),
      },
    }),
    rule({
      rule_id: `LINK_${id}_MISSED_HEARTBEATS`,
      label: `${link.display_name} missed heartbeats`,
      category: "LINK",
      result: link.missed_heartbeat_count === 0 ? "PASS" : "WARNING",
      severity: link.missed_heartbeat_count === 0 ? "INFO" : "WARNING",
      details:
        link.missed_heartbeat_count === 0
          ? "No missed heartbeats reported"
          : `${link.missed_heartbeat_count} missed heartbeat(s) reported`,
      evidence: {
        source: `${link.link_id}.missed_heartbeat_count`,
        value: link.missed_heartbeat_count,
      },
    }),
  ];
}

function streamRules(params: {
  connectionState: ConnectionState;
  isTelemetryStale: boolean;
  activeStreamId: string | null;
  packetRateHz: number;
}): HealthCheckRule[] {
  return [
    rule({
      rule_id: "WEBSOCKET_CONNECTED",
      label: "WebSocket connected",
      category: "STREAM",
      result:
        params.connectionState === "CONNECTED"
          ? "PASS"
          : params.connectionState === "OFFLINE"
            ? "FAIL"
            : "WARNING",
      severity:
        params.connectionState === "CONNECTED"
          ? "INFO"
          : params.connectionState === "OFFLINE"
            ? "CRITICAL"
            : "WARNING",
      details: `WebSocket state is ${params.connectionState}`,
      evidence: { source: "connectionState", value: params.connectionState },
    }),
    rule({
      rule_id: "STREAM_ACTIVE",
      label: "Active telemetry stream",
      category: "STREAM",
      result: params.activeStreamId ? "PASS" : "FAIL",
      severity: params.activeStreamId ? "INFO" : "CRITICAL",
      details: params.activeStreamId
        ? `Active stream ${params.activeStreamId}`
        : "No active stream ID observed",
      evidence: { source: "activeStreamId", value: params.activeStreamId },
    }),
    rule({
      rule_id: "TELEMETRY_FRESHNESS",
      label: "Telemetry freshness",
      category: "STREAM",
      result: params.isTelemetryStale ? "FAIL" : "PASS",
      severity: params.isTelemetryStale ? "CRITICAL" : "INFO",
      details: params.isTelemetryStale
        ? "Telemetry is stale; values are last known state"
        : "Telemetry stream is live",
      evidence: { source: "isTelemetryStale", value: params.isTelemetryStale },
    }),
    rule({
      rule_id: "PACKET_RATE_PRESENT",
      label: "Packet rate present",
      category: "STREAM",
      result:
        params.packetRateHz > 0
          ? "PASS"
          : params.connectionState === "CONNECTED"
            ? "WARNING"
            : "FAIL",
      severity:
        params.packetRateHz > 0
          ? "INFO"
          : params.connectionState === "CONNECTED"
            ? "WARNING"
            : "ERROR",
      details: `Packet rate is ${params.packetRateHz.toFixed(2)} Hz`,
      evidence: { source: "packetRateHz", value: Number(params.packetRateHz.toFixed(2)) },
    }),
  ];
}

function integrityRules(params: {
  duplicatePackets: number;
  outOfOrderPackets: number;
  sequenceGaps: number;
  sequenceResets: number;
  streamSwitches: number;
}): HealthCheckRule[] {
  return [
    counterRule("PACKET_DUPLICATES", "Duplicate packets", params.duplicatePackets, "INTEGRITY", "WARNING"),
    counterRule("PACKET_OUT_OF_ORDER", "Out-of-order packets", params.outOfOrderPackets, "INTEGRITY", "ERROR", true),
    counterRule("SEQUENCE_GAPS", "Sequence gaps", params.sequenceGaps, "INTEGRITY", "WARNING"),
    counterRule("SEQUENCE_RESETS", "Sequence resets", params.sequenceResets, "INTEGRITY", "WARNING"),
    counterRule("STREAM_SWITCHES", "Stream switches", params.streamSwitches, "INTEGRITY", "WARNING"),
  ];
}

function chipPowerRules(registry: DeviceRegistry): HealthCheckRule[] {
  return [
    v1DeviceRule("ADS1115_DETECTED", "ADS1115 ADC detected at 0x48", registry[DEVICE_IDS.ADS1115], "CHIP"),
    v1DeviceRule("DS3231_DETECTED", "DS3231 RTC detected at 0x68", registry[DEVICE_IDS.DS3231], "CHIP"),
    v1DeviceRule("PCA9685_1_DETECTED", "PCA9685 #1 detected at 0x40", registry[DEVICE_IDS.PCA9685_1], "CHIP"),
    v1DeviceRule("PCA9685_2_DETECTED", "PCA9685 #2 detected at 0x41", registry[DEVICE_IDS.PCA9685_2], "CHIP"),
    v1DeviceRule("PCA9685_ALLCALL_DETECTED", "PCA9685 AllCall detected at 0x70", registry[DEVICE_IDS.PCA9685_ALLCALL], "CHIP"),
    powerRailRule("VIN_PRESENT", "VIN protected rail present", registry[DEVICE_IDS.VIN_PROTECTED]),
    powerRailRule("RAIL_5V_VALID", "+5V logic rail valid", registry[DEVICE_IDS.RAIL_5V]),
    powerRailRule("RAIL_3V3_VALID", "+3V3 logic rail valid", registry[DEVICE_IDS.RAIL_3V3]),
    framExpectedRule(registry[DEVICE_IDS.FRAM]),
  ];
}

function requiredHealthy(
  rule_id: string,
  label: string,
  device: DeviceRegistryEntry | undefined
): HealthCheckRule {
  if (!device) {
    return {
      rule_id,
      label,
      result: "FAIL",
      details: "Device missing from registry",
    };
  }

  if (device.health_state === "HEALTHY") {
    return {
      rule_id,
      label,
      result: "PASS",
      details: device.status_message,
    };
  }

  return {
    rule_id,
    label,
    result: "FAIL",
    details: `${device.display_name} is ${device.health_state}: ${device.status_message}`,
  };
}

function warningExpected(
  rule_id: string,
  label: string,
  device: DeviceRegistryEntry | undefined
): HealthCheckRule {
  if (!device) {
    return {
      rule_id,
      label,
      result: "WARNING",
      details: "FRAM entry missing from registry",
    };
  }

  if (device.health_state === "DEGRADED") {
    return {
      rule_id,
      label,
      result: "WARNING",
      details: "Expected V1 warning: correct SPI FRAM installation/validation pending",
    };
  }

  if (device.health_state === "HEALTHY") {
    return {
      rule_id,
      label,
      result: "PASS",
      details: "FRAM SPI device validated",
    };
  }

  return {
    rule_id,
    label,
    result: "WARNING",
    details: `FRAM state: ${device.health_state}`,
  };
}

function staleTelemetryRule(isTelemetryStale: boolean): HealthCheckRule {
  return {
    rule_id: "TELEMETRY_FRESHNESS",
    label: "Telemetry freshness",
    result: isTelemetryStale ? "FAIL" : "PASS",
    details: isTelemetryStale
      ? "Telemetry is stale; values are last known state"
      : "Telemetry stream is live",
  };
}

function rule(input: HealthCheckRule): HealthCheckRule {
  return input;
}

function requiredNodeRule(
  rule_id: string,
  label: string,
  device: DeviceRegistryEntry | undefined,
  category: HealthCheckCategory
): HealthCheckRule {
  if (!device) {
    return rule({
      rule_id,
      label,
      category,
      result: "FAIL",
      severity: "CRITICAL",
      details: "Required topology node missing from DeviceRegistry",
      evidence: { source: "deviceRegistry", value: null },
    });
  }

  if (device.health_state === "OFFLINE" || device.health_state === "FAIL_SAFE") {
    return rule({
      rule_id,
      label,
      category,
      result: "FAIL",
      severity: "CRITICAL",
      details: `${device.display_name} is ${device.health_state}: ${device.status_message}`,
      evidence: {
        source: device.device_id,
        timestamp_utc: device.last_seen_utc,
        value: device.health_state,
      },
    });
  }

  if (device.health_state === "DEGRADED") {
    return rule({
      rule_id,
      label,
      category,
      result: "WARNING",
      severity: "WARNING",
      details: `${device.display_name} is degraded: ${device.status_message}`,
      evidence: {
        source: device.device_id,
        timestamp_utc: device.last_seen_utc,
        value: device.health_state,
      },
    });
  }

  return rule({
    rule_id,
    label,
    category,
    result: "PASS",
    severity: "INFO",
    details: `${device.display_name} is healthy: ${device.status_message}`,
    evidence: {
      source: device.device_id,
      timestamp_utc: device.last_seen_utc,
      value: device.health_state,
    },
  });
}

function nodeRule(
  rule_id: string,
  label: string,
  device: DeviceRegistryEntry | undefined,
): HealthCheckRule {
  return requiredNodeRule(rule_id, label, device, "NODE");
}

function laptopSupervisionResult(
  connectionState: ConnectionState,
  isTelemetryStale: boolean,
  activeStreamId: string | null
): {
  result: HealthCheckResult;
  severity: HealthCheckSeverity;
  details: string;
} {
  if (
    connectionState === "CONNECTED" &&
    activeStreamId &&
    !isTelemetryStale
  ) {
    return {
      result: "PASS",
      severity: "INFO",
      details: "Laptop console is connected to the telemetry stream",
    };
  }

  if (connectionState === "CONNECTING" || connectionState === "RECONNECTING") {
    return {
      result: "WARNING",
      severity: "WARNING",
      details: `Laptop console telemetry stream is ${connectionState.toLowerCase()}`,
    };
  }

  return {
    result: "FAIL",
    severity: "CRITICAL",
    details: "Laptop console is not supervising a live telemetry stream",
  };
}

function v1DeviceRule(
  rule_id: string,
  label: string,
  device: DeviceRegistryEntry | undefined,
  category: HealthCheckCategory
): HealthCheckRule {
  if (!device) {
    return rule({
      rule_id,
      label,
      category,
      result: "FAIL",
      severity: "ERROR",
      details: "Device missing from registry",
      evidence: { source: "deviceRegistry", value: null },
    });
  }

  const pass = device.health_state === "HEALTHY";

  return rule({
    rule_id,
    label,
    category,
    result: pass ? "PASS" : "FAIL",
    severity: pass ? "INFO" : "ERROR",
    details: pass
      ? device.status_message
      : `${device.display_name} is ${device.health_state}: ${device.status_message}`,
    evidence: {
      source: device.device_id,
      timestamp_utc: device.last_seen_utc,
      value: device.health_state,
    },
  });
}

function powerRailRule(
  rule_id: string,
  label: string,
  device: DeviceRegistryEntry | undefined
): HealthCheckRule {
  if (!device) {
    return rule({
      rule_id,
      label,
      category: "POWER",
      result: "FAIL",
      severity: "ERROR",
      details: "Power rail missing from registry",
      evidence: { source: "deviceRegistry", value: null },
    });
  }

  if (device.health_state === "HEALTHY") {
    return rule({
      rule_id,
      label,
      category: "POWER",
      result: "PASS",
      severity: "INFO",
      details: device.status_message,
      evidence: {
        source: device.device_id,
        timestamp_utc: device.last_seen_utc,
        value: device.health_state,
      },
    });
  }

  if (device.health_state === "DEGRADED") {
    return rule({
      rule_id,
      label,
      category: "POWER",
      result: "WARNING",
      severity: "WARNING",
      details: `${device.display_name} is degraded: ${device.status_message}`,
      evidence: {
        source: device.device_id,
        timestamp_utc: device.last_seen_utc,
        value: device.health_state,
      },
    });
  }

  return rule({
    rule_id,
    label,
    category: "POWER",
    result: "FAIL",
    severity: "ERROR",
    details: `${device.display_name} is ${device.health_state}: ${device.status_message}`,
    evidence: {
      source: device.device_id,
      timestamp_utc: device.last_seen_utc,
      value: device.health_state,
    },
  });
}

function framExpectedRule(device: DeviceRegistryEntry | undefined): HealthCheckRule {
  if (!device) {
    return rule({
      rule_id: "FRAM_SPI_PENDING",
      label: "FRAM SPI validation pending",
      category: "EXPECTED_WARNING",
      result: "WARNING",
      severity: "WARNING",
      details: "FRAM entry missing from registry",
      evidence: { source: "deviceRegistry.fram", value: null },
    });
  }

  if (device.health_state === "HEALTHY") {
    return rule({
      rule_id: "FRAM_SPI_PENDING",
      label: "FRAM SPI validation pending",
      category: "EXPECTED_WARNING",
      result: "PASS",
      severity: "INFO",
      details: "FRAM SPI device validated",
      evidence: {
        source: device.device_id,
        timestamp_utc: device.last_seen_utc,
        value: device.health_state,
      },
    });
  }

  return rule({
    rule_id: "FRAM_SPI_PENDING",
    label: "FRAM SPI validation pending",
    category: "EXPECTED_WARNING",
    result: "WARNING",
    severity: "WARNING",
    details: "Expected V1 warning: correct SPI FRAM installation/validation pending",
    evidence: {
      source: device.device_id,
      timestamp_utc: device.last_seen_utc,
      value: device.health_state,
    },
  });
}

function thresholdRule(
  rule_id: string,
  label: string,
  category: HealthCheckCategory,
  value: number,
  warningAt: number,
  failAt: number,
  unit: string,
  source: string
): HealthCheckRule {
  const result: HealthCheckResult =
    value > failAt ? "FAIL" : value >= warningAt ? "WARNING" : "PASS";
  const severity: HealthCheckSeverity =
    result === "FAIL" ? "ERROR" : result === "WARNING" ? "WARNING" : "INFO";

  return rule({
    rule_id,
    label,
    category,
    result,
    severity,
    details:
      result === "PASS"
        ? `${label} is nominal at ${value}${unit} (${source})`
        : `${label} is ${result.toLowerCase()} at ${value}${unit} (${source})`,
    evidence: { source, value },
  });
}

function counterRule(
  rule_id: string,
  label: string,
  value: number,
  category: HealthCheckCategory,
  warningSeverity: HealthCheckSeverity,
  failOnNonZero = false
): HealthCheckRule {
  const clean = value === 0;
  const result: HealthCheckResult = clean ? "PASS" : failOnNonZero ? "FAIL" : "WARNING";
  const severity: HealthCheckSeverity = clean ? "INFO" : failOnNonZero ? "ERROR" : warningSeverity;

  return rule({
    rule_id,
    label,
    category,
    result,
    severity,
    details: clean ? `${label} counter is clean` : `${label} counter is ${value}`,
    evidence: { source: rule_id, value },
  });
}

function linkStateResult(state: string): {
  result: HealthCheckResult;
  severity: HealthCheckSeverity;
} {
  if (state === "LINK_HEALTHY") return { result: "PASS", severity: "INFO" };
  if (state === "LINK_RECOVERING" || state === "LINK_DEGRADED") {
    return { result: "WARNING", severity: "WARNING" };
  }
  return { result: "FAIL", severity: "CRITICAL" };
}

function syncStateResult(state: string): {
  result: HealthCheckResult;
  severity: HealthCheckSeverity;
} {
  if (state === "SYNCED") return { result: "PASS", severity: "INFO" };
  if (state === "UNKNOWN") return { result: "WARNING", severity: "WARNING" };
  return { result: "FAIL", severity: "CRITICAL" };
}

function heartbeatFreshnessResult(
  ageMs: number | null,
  connectionState: ConnectionState
): {
  result: HealthCheckResult;
  severity: HealthCheckSeverity;
} {
  if (ageMs === null) {
    return connectionState === "CONNECTED"
      ? { result: "WARNING", severity: "WARNING" }
      : { result: "FAIL", severity: "ERROR" };
  }

  if (ageMs > 6000) return { result: "FAIL", severity: "CRITICAL" };
  if (ageMs > 3000) return { result: "WARNING", severity: "WARNING" };
  return { result: "PASS", severity: "INFO" };
}

function getHeartbeatAgeMs(link: LinkRegistryEntry, nowMs: number = Date.now()): number | null {
  if (!link.last_heartbeat_utc) return null;
  return Math.max(0, nowMs - new Date(link.last_heartbeat_utc).getTime());
}
