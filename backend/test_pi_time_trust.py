from datetime import datetime, timedelta, timezone
import subprocess
import unittest

from pi_time_trust import (
    PI_TIME_JUMP_DETECTED,
    PI_TIME_TRUSTED,
    PI_TIME_UNVERIFIED,
    evaluate_pi_time_trust,
)


class SequenceClock:
    def __init__(self, values):
        self._values = iter(values)

    def __call__(self):
        return next(self._values)


def timedatectl_result(ntp_value: str = "yes"):
    return subprocess.CompletedProcess(
        args=[],
        returncode=0,
        stdout=(
            f"NTPSynchronized={ntp_value}\n"
            "TimeUSec=Fri 2026-06-19 12:00:00 UTC\n"
            "Timezone=Asia/Kolkata\n"
        ),
        stderr="",
    )


class PiTimeTrustTests(unittest.TestCase):
    def test_synchronized_stable_clock_is_trusted(self):
        start = datetime(2026, 6, 19, 12, 0, tzinfo=timezone.utc)
        evidence = evaluate_pi_time_trust(
            run_command=lambda *args, **kwargs: timedatectl_result(),
            utc_now=SequenceClock([start, start, start + timedelta(seconds=30)]),
            monotonic=SequenceClock([100.0, 130.0, 130.0]),
            sleep=lambda seconds: None,
            process_started_monotonic=90.0,
        )

        self.assertEqual(evidence.pi_time_status, PI_TIME_TRUSTED)
        self.assertTrue(evidence.trust_allowed)

    def test_missing_timedatectl_fails_closed(self):
        now = datetime(2026, 6, 19, 12, 0, tzinfo=timezone.utc)

        def missing_command(*args, **kwargs):
            raise FileNotFoundError("timedatectl")

        evidence = evaluate_pi_time_trust(
            run_command=missing_command,
            utc_now=lambda: now,
            monotonic=lambda: 100.0,
            sleep=lambda seconds: None,
            process_started_monotonic=0.0,
        )

        self.assertEqual(evidence.pi_time_status, PI_TIME_UNVERIFIED)
        self.assertFalse(evidence.trust_allowed)

    def test_wall_clock_jump_blocks_trust(self):
        start = datetime(2026, 6, 19, 12, 0, tzinfo=timezone.utc)
        evidence = evaluate_pi_time_trust(
            run_command=lambda *args, **kwargs: timedatectl_result(),
            utc_now=SequenceClock([start, start, start + timedelta(seconds=35)]),
            monotonic=SequenceClock([100.0, 130.0, 130.0]),
            sleep=lambda seconds: None,
            process_started_monotonic=90.0,
        )

        self.assertEqual(evidence.pi_time_status, PI_TIME_JUMP_DETECTED)
        self.assertFalse(evidence.trust_allowed)


if __name__ == "__main__":
    unittest.main()
