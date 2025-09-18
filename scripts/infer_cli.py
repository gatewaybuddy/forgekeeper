#!/usr/bin/env python3
"""
Minimal Triton inference CLI (planning stub).

- HTTP (default) or gRPC modes.
- Gracefully warns if tritonclient is not installed or server is unreachable.

Usage:
  python forgekeeper/scripts/infer_cli.py --prompt "Say hello."
  python forgekeeper/scripts/infer_cli.py --host localhost --http-port 8000 --mode http --prompt "..."
  python forgekeeper/scripts/infer_cli.py --mode grpc --grpc-port 8001 --prompt "..."
  python forgekeeper/scripts/infer_cli.py --dry-run --prompt "Say hello."
"""
import argparse
import sys
import time

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', default='localhost')
    ap.add_argument('--http-port', type=int, default=8000)
    ap.add_argument('--grpc-port', type=int, default=8001)
    ap.add_argument('--mode', choices=['http', 'grpc'], default='http')
    ap.add_argument('--prompt', required=False, default='')
    ap.add_argument('--timeout', type=float, default=10.0)
    ap.add_argument('--dry-run', action='store_true', help='Do not contact Triton; simulate a response')
    args = ap.parse_args()

    if args.dry_run:
        text = 'hello' if 'hello' in args.prompt.lower() else f"echo: {args.prompt}"
        print(text)
        return 0

    start = time.time()
    try:
        if args.mode == 'http':
            try:
                import tritonclient.http as httpclient  # type: ignore
            except Exception as e:
                print(f"ERROR: tritonclient[http] not installed: {e}")
                print("Tip: pip install 'tritonclient[http]'")
                return 2

            url = f"http://{args.host}:{args.http_port}"
            cli = httpclient.InferenceServerClient(url=url, verbose=False)
            if not cli.is_server_live():
                print(f"ERROR: Triton HTTP server not live at {url}")
                return 3
            print("TRITON_HTTP_OK")
            print("Note: model invocation not implemented in planning stub.")
            return 0
        else:
            try:
                import tritonclient.grpc as grpcclient  # type: ignore
            except Exception as e:
                print(f"ERROR: tritonclient[grpc] not installed: {e}")
                print("Tip: pip install 'tritonclient[grpc]'")
                return 2

            url = f"{args.host}:{args.grpc_port}"
            cli = grpcclient.InferenceServerClient(url=url, verbose=False)
            if not cli.is_server_live():
                print(f"ERROR: Triton gRPC server not live at {url}")
                return 3
            print("TRITON_GRPC_OK")
            print("Note: model invocation not implemented in planning stub.")
            return 0
    except Exception as e:
        print(f"ERROR: {e}")
        return 1
    finally:
        dur = (time.time() - start) * 1000
        print(f"latency_ms={dur:.1f}")

if __name__ == '__main__':
    sys.exit(main())

