from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from pi_time_trust import evaluate_pi_time_trust
from rtc_sync_protocol import RtcSyncProtocolError
from rtc_sync_service import preview_rtc_sync_request


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Evaluate whether Pi time is trusted for a future RTC sync."
    )
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument(
        "--dry-run",
        action="store_true",
        help="Evaluate trust only; this tool never writes to UART.",
    )
    modes.add_argument(
        "--preview-request",
        action="store_true",
        help="Build and print an RTC sync request preview without writing to UART.",
    )
    args = parser.parse_args()

    evidence = evaluate_pi_time_trust()
    if args.preview_request and evidence.trust_allowed:
        try:
            output = preview_rtc_sync_request(evidence)
        except RtcSyncProtocolError as exc:
            output = {"trust_evidence": evidence.to_dict(), "error": str(exc)}
            print(json.dumps(output, indent=2, sort_keys=True))
            print("SYNC_ALLOWED=false")
            print("WRITE_ATTEMPTED=false")
            return 1
    else:
        output = evidence.to_dict()

    print(json.dumps(output, indent=2, sort_keys=True))
    print(f"SYNC_ALLOWED={'true' if evidence.trust_allowed else 'false'}")
    print("WRITE_ATTEMPTED=false")
    return 0 if evidence.trust_allowed else 1


if __name__ == "__main__":
    raise SystemExit(main())
