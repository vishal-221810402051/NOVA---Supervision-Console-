from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from pi_time_trust import evaluate_pi_time_trust


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Evaluate whether Pi time is trusted for a future RTC sync."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        required=True,
        help="Evaluate trust only; this tool never writes to UART.",
    )
    parser.parse_args()

    evidence = evaluate_pi_time_trust()
    print(json.dumps(evidence.to_dict(), indent=2, sort_keys=True))
    print(f"SYNC_ALLOWED={'true' if evidence.trust_allowed else 'false'}")
    return 0 if evidence.trust_allowed else 1


if __name__ == "__main__":
    raise SystemExit(main())
