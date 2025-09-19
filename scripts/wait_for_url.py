#!/usr/bin/env python3
import argparse
import sys
import time
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError


def wait_for(url: str, max_wait: float, interval: float, timeout: float, expect_status: int | None) -> bool:
    deadline = time.time() + max_wait
    while time.time() < deadline:
        try:
            req = Request(url, method='GET')
            with urlopen(req, timeout=timeout) as resp:
                if expect_status is None or resp.status == expect_status:
                    print(f"URL_OK {url} status={resp.status}")
                    return True
        except HTTPError as e:
            # If a specific status is expected, honor it
            if expect_status is not None and e.code == expect_status:
                print(f"URL_OK {url} status={e.code}")
                return True
            print(f"URL_WAIT {url} http_error={e.code}")
        except URLError as e:
            print(f"URL_WAIT {url} url_error={e}")
        except Exception as e:
            print(f"URL_WAIT {url} error={e}")
        time.sleep(interval)
    print(f"URL_TIMEOUT {url}")
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('url')
    ap.add_argument('--max-wait', type=float, default=30.0)
    ap.add_argument('--interval', type=float, default=0.5)
    ap.add_argument('--timeout', type=float, default=2.0)
    ap.add_argument('--expect-status', type=int, default=200)
    args = ap.parse_args()
    ok = wait_for(args.url, args.max_wait, args.interval, args.timeout, args.expect_status)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
