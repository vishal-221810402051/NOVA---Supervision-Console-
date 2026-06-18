from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import subprocess
import time
from typing import Callable, Sequence


PI_TIME_TRUSTED = "PI_TIME_TRUSTED"
PI_TIME_UNVERIFIED = "PI_TIME_UNVERIFIED"
PI_TIME_NOT_SYNCHRONIZED = "PI_TIME_NOT_SYNCHRONIZED"
PI_TIME_INVALID = "PI_TIME_INVALID"
PI_TIME_JUMP_DETECTED = "PI_TIME_JUMP_DETECTED"

MINIMUM_PLAUSIBLE_YEAR = 2026
MINIMUM_OBSERVATION_SECONDS = 30.0
MAXIMUM_WALL_CLOCK_DISCONTINUITY_SECONDS = 1.0

_PROCESS_STARTED_MONOTONIC = time.monotonic()


@dataclass(frozen=True)
class PiTimeTrustEvidence:
    pi_time_status: str
    pi_ntp_synchronized: bool | None
    pi_utc_now: str
    timezone: str | None
    plausible_year: bool
    backend_uptime_seconds: float
    monotonic_observation_seconds: float
    wall_clock_progression_seconds: float
    monotonic_progression_seconds: float
    wall_clock_jump_detected: bool
    trust_allowed: bool
    failure_reasons: list[str]
    evidence_source: str
    checked_at_utc: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _read_timedatectl(
    run_command: Callable[..., subprocess.CompletedProcess[str]],
) -> tuple[bool | None, str | None, str, list[str]]:
    command: Sequence[str] = (
        "timedatectl",
        "show",
        "-p",
        "NTPSynchronized",
        "-p",
        "TimeUSec",
        "-p",
        "Timezone",
    )

    try:
        result = run_command(
            command,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (FileNotFoundError, OSError, subprocess.SubprocessError) as exc:
        return None, None, "timedatectl_unavailable", [
            f"Unable to read timedatectl status: {type(exc).__name__}"
        ]

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "unknown timedatectl failure").strip()
        return None, None, "timedatectl_failed", [
            f"timedatectl exited with code {result.returncode}: {detail}"
        ]

    values: dict[str, str] = {}
    for line in result.stdout.splitlines():
        key, separator, value = line.partition("=")
        if separator:
            values[key.strip()] = value.strip()

    ntp_value = values.get("NTPSynchronized", "").lower()
    if ntp_value == "yes":
        ntp_synchronized: bool | None = True
    elif ntp_value == "no":
        ntp_synchronized = False
    else:
        ntp_synchronized = None

    reasons = []
    if ntp_synchronized is None:
        reasons.append("timedatectl did not provide a recognized NTPSynchronized value")

    return ntp_synchronized, values.get("Timezone") or None, "timedatectl", reasons


def evaluate_pi_time_trust(
    *,
    observation_seconds: float = MINIMUM_OBSERVATION_SECONDS,
    run_command: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    utc_now: Callable[[], datetime] | None = None,
    monotonic: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
    process_started_monotonic: float | None = None,
) -> PiTimeTrustEvidence:
    utc_now = utc_now or (lambda: datetime.now(timezone.utc))
    process_started_monotonic = (
        _PROCESS_STARTED_MONOTONIC
        if process_started_monotonic is None
        else process_started_monotonic
    )

    checked_at = utc_now().astimezone(timezone.utc)
    plausible_year = checked_at.year >= MINIMUM_PLAUSIBLE_YEAR
    ntp_synchronized, configured_timezone, evidence_source, failure_reasons = (
        _read_timedatectl(run_command)
    )

    wall_clock_progression = 0.0
    monotonic_progression = 0.0
    observed_seconds = 0.0
    jump_detected = False

    if ntp_synchronized is True and plausible_year:
        requested_observation = max(0.0, observation_seconds)
        wall_start = utc_now().astimezone(timezone.utc)
        monotonic_start = monotonic()
        sleep(requested_observation)
        wall_end = utc_now().astimezone(timezone.utc)
        monotonic_end = monotonic()

        wall_clock_progression = (wall_end - wall_start).total_seconds()
        monotonic_progression = monotonic_end - monotonic_start
        observed_seconds = monotonic_progression
        jump_detected = (
            abs(wall_clock_progression - monotonic_progression)
            > MAXIMUM_WALL_CLOCK_DISCONTINUITY_SECONDS
        )
        checked_at = wall_end

    backend_uptime = max(0.0, monotonic() - process_started_monotonic)

    if not plausible_year:
        status = PI_TIME_INVALID
        failure_reasons.append(
            f"UTC year is earlier than {MINIMUM_PLAUSIBLE_YEAR}"
        )
    elif ntp_synchronized is None:
        status = PI_TIME_UNVERIFIED
    elif ntp_synchronized is False:
        status = PI_TIME_NOT_SYNCHRONIZED
        failure_reasons.append("Pi reports that NTP is not synchronized")
    elif jump_detected:
        status = PI_TIME_JUMP_DETECTED
        failure_reasons.append(
            "Wall-clock progression differs from monotonic progression by more than 1 second"
        )
    elif observed_seconds < MINIMUM_OBSERVATION_SECONDS:
        status = PI_TIME_UNVERIFIED
        failure_reasons.append(
            f"Observation window is shorter than {MINIMUM_OBSERVATION_SECONDS:.0f} seconds"
        )
    elif backend_uptime < MINIMUM_OBSERVATION_SECONDS:
        status = PI_TIME_UNVERIFIED
        failure_reasons.append(
            f"Process uptime is shorter than {MINIMUM_OBSERVATION_SECONDS:.0f} seconds"
        )
    else:
        status = PI_TIME_TRUSTED

    trust_allowed = status == PI_TIME_TRUSTED
    return PiTimeTrustEvidence(
        pi_time_status=status,
        pi_ntp_synchronized=ntp_synchronized,
        pi_utc_now=checked_at.isoformat().replace("+00:00", "Z"),
        timezone=configured_timezone,
        plausible_year=plausible_year,
        backend_uptime_seconds=round(backend_uptime, 6),
        monotonic_observation_seconds=round(observed_seconds, 6),
        wall_clock_progression_seconds=round(wall_clock_progression, 6),
        monotonic_progression_seconds=round(monotonic_progression, 6),
        wall_clock_jump_detected=jump_detected,
        trust_allowed=trust_allowed,
        failure_reasons=failure_reasons,
        evidence_source=evidence_source,
        checked_at_utc=checked_at.isoformat().replace("+00:00", "Z"),
    )
