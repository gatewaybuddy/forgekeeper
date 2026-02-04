"""
Consciousness Conversational REPL

Claude Code style conversational interface to the consciousness system.
Supports multi-line input, shows reasoning, and provides a human-friendly chat experience.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any
from urllib import request, error

# Terminal colors
class Colors:
    RESET = '\033[0m'
    BOLD = '\033[1m'
    DIM = '\033[2m'

    # Text colors
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    MAGENTA = '\033[35m'
    CYAN = '\033[36m'
    WHITE = '\033[37m'

    # Bright colors
    BRIGHT_RED = '\033[91m'
    BRIGHT_GREEN = '\033[92m'
    BRIGHT_YELLOW = '\033[93m'
    BRIGHT_BLUE = '\033[94m'
    BRIGHT_MAGENTA = '\033[95m'
    BRIGHT_CYAN = '\033[96m'
    BRIGHT_WHITE = '\033[97m'


def get_consciousness_url() -> str:
    """Get consciousness GraphQL endpoint URL"""
    port = os.getenv('FRONTEND_PORT', '3000')
    host = os.getenv('CONSCIOUSNESS_HOST', 'localhost')
    return f'http://{host}:{port}/graphql'


def graphql_query(query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
    """Execute a GraphQL query"""
    url = get_consciousness_url()

    payload = {'query': query}
    if variables:
        payload['variables'] = variables

    data = json.dumps(payload).encode('utf-8')

    req = request.Request(
        url,
        data=data,
        headers={'Content-Type': 'application/json'}
    )

    try:
        with request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode('utf-8'))

            if 'errors' in result:
                return {'error': result['errors']}

            return result.get('data', {})
    except error.URLError as e:
        return {'error': f'Connection failed: {e}'}
    except Exception as e:
        return {'error': str(e)}


def print_banner():
    """Print welcome banner"""
    print(f"\n{Colors.BRIGHT_MAGENTA}{Colors.BOLD}╔═══════════════════════════════════════════════════════════╗{Colors.RESET}")
    print(f"{Colors.BRIGHT_MAGENTA}{Colors.BOLD}║{Colors.RESET}  {Colors.BRIGHT_CYAN}🧠 Consciousness Conversational Interface{Colors.RESET}              {Colors.BRIGHT_MAGENTA}{Colors.BOLD}║{Colors.RESET}")
    print(f"{Colors.BRIGHT_MAGENTA}{Colors.BOLD}╚═══════════════════════════════════════════════════════════╝{Colors.RESET}\n")
    print(f"{Colors.DIM}Type your message and press Enter.{Colors.RESET}")
    print(f"{Colors.DIM}For multi-line input, end with an empty line (press Enter twice).{Colors.RESET}")
    print(f"{Colors.DIM}Press Ctrl+C to exit.{Colors.RESET}\n")


def print_separator():
    """Print visual separator"""
    print(f"\n{Colors.DIM}{'─' * 60}{Colors.RESET}\n")


def print_user_message(message: str):
    """Print user message"""
    print(f"{Colors.BRIGHT_CYAN}{Colors.BOLD}You:{Colors.RESET}")
    print(f"{Colors.WHITE}{message}{Colors.RESET}")


def print_consciousness_response(response: dict[str, Any]):
    """Print consciousness response with reasoning"""
    print(f"\n{Colors.BRIGHT_MAGENTA}{Colors.BOLD}Consciousness:{Colors.RESET}")

    # Extract state info
    state = response.get('consciousnessState', {})

    # Show current state
    cycle = state.get('currentCycle', 0)
    current_state = state.get('state', 'unknown')

    print(f"{Colors.DIM}[Cycle {cycle} • State: {current_state}]{Colors.RESET}\n")

    # Show reasoning/thoughts
    stm = state.get('shortTermMemory', [])

    if stm:
        print(f"{Colors.BRIGHT_YELLOW}💭 Recent Thoughts:{Colors.RESET}")
        for i, mem in enumerate(stm[:5], 1):
            summary = mem.get('summary', 'N/A')
            importance = mem.get('importance', 0)

            # Color code by importance
            if importance > 0.7:
                color = Colors.BRIGHT_RED
            elif importance > 0.5:
                color = Colors.BRIGHT_YELLOW
            else:
                color = Colors.WHITE

            print(f"{Colors.DIM}  {i}.{Colors.RESET} {color}{summary}{Colors.RESET}")
        print()

    # Show metrics
    metrics = state.get('metrics', {})
    if metrics:
        success_rate = metrics.get('successRate', 0)
        avg_duration = metrics.get('avgCycleDuration', 0)
        uptime = metrics.get('uptimeMs', 0) / 1000

        print(f"{Colors.DIM}📊 Metrics:{Colors.RESET}")
        print(f"{Colors.DIM}  • Success Rate: {Colors.BRIGHT_GREEN}{success_rate:.1f}%{Colors.RESET}")
        print(f"{Colors.DIM}  • Avg Cycle: {Colors.BRIGHT_CYAN}{avg_duration:.0f}ms{Colors.RESET}")
        print(f"{Colors.DIM}  • Uptime: {Colors.BRIGHT_CYAN}{uptime:.1f}s{Colors.RESET}")

    print()


def read_multiline_input() -> str:
    """Read multi-line input from user"""
    lines = []

    print(f"{Colors.BRIGHT_CYAN}{Colors.BOLD}You:{Colors.RESET} ", end='', flush=True)

    try:
        # Read first line
        first_line = input().strip()

        if not first_line:
            return ''

        lines.append(first_line)

        # Check if user wants to continue (look for incomplete thoughts)
        # If first line ends with certain characters, enable multi-line
        if first_line.endswith(('...', ',', 'and', 'or', ':', '-')):
            print(f"{Colors.DIM}(Multi-line mode - press Enter on empty line to send){Colors.RESET}")

            while True:
                try:
                    line = input(f"{Colors.DIM}...{Colors.RESET} ")

                    if not line.strip():
                        # Empty line - finish input
                        break

                    lines.append(line)
                except EOFError:
                    break

        return '\n'.join(lines)

    except (EOFError, KeyboardInterrupt):
        raise


def send_message(message: str) -> dict[str, Any]:
    """Send message to consciousness and get response"""
    query = """
    query GetConsciousnessState {
      consciousnessState {
        state
        currentCycle
        shortTermMemory {
          summary
          importance
          timestamp
        }
        metrics {
          successRate
          avgCycleDuration
          uptimeMs
        }
      }
    }
    """

    result = graphql_query(query)

    if 'error' in result:
        return result

    return result


def run_repl():
    """Run the conversational REPL"""
    print_banner()

    # Initial connection test
    print(f"{Colors.DIM}Connecting to consciousness system...{Colors.RESET}")
    test_result = send_message("")

    if 'error' in test_result:
        print(f"\n{Colors.BRIGHT_RED}❌ Error:{Colors.RESET} {test_result['error']}")
        print(f"\n{Colors.YELLOW}Make sure the consciousness system is running:{Colors.RESET}")
        print(f"{Colors.DIM}  1. Start the server: npm run serve{Colors.RESET}")
        print(f"{Colors.DIM}  2. Or start with Docker: docker compose --profile ui up{Colors.RESET}")
        print(f"{Colors.DIM}  3. Ensure CONSCIOUSNESS_ENABLED=1 in .env{Colors.RESET}\n")
        return 1

    print(f"{Colors.BRIGHT_GREEN}✓ Connected{Colors.RESET}\n")
    print_separator()

    # Conversation loop
    conversation_count = 0

    while True:
        try:
            # Read user input
            user_message = read_multiline_input()

            if not user_message:
                continue

            conversation_count += 1

            # Show user message
            if conversation_count > 1:
                print()  # Add spacing after first message
                print_user_message(user_message)

            # Send to consciousness
            print(f"\n{Colors.DIM}Thinking...{Colors.RESET}")

            response = send_message(user_message)

            if 'error' in response:
                print(f"\n{Colors.BRIGHT_RED}❌ Error:{Colors.RESET} {response['error']}\n")
                continue

            # Show response
            print_consciousness_response(response)

            print_separator()

        except KeyboardInterrupt:
            # Ctrl+C to exit
            print(f"\n\n{Colors.BRIGHT_YELLOW}Exiting conversation...{Colors.RESET}")
            print(f"{Colors.DIM}Had {conversation_count} exchanges with consciousness.{Colors.RESET}\n")
            return 0

        except EOFError:
            # End of input
            print(f"\n\n{Colors.DIM}Conversation ended.{Colors.RESET}\n")
            return 0

        except Exception as e:
            print(f"\n{Colors.BRIGHT_RED}❌ Unexpected error:{Colors.RESET} {e}\n")
            import traceback
            traceback.print_exc()
            return 1


def main():
    """Main entry point"""
    try:
        return run_repl()
    except KeyboardInterrupt:
        print(f"\n\n{Colors.DIM}Goodbye!{Colors.RESET}\n")
        return 0


if __name__ == '__main__':
    sys.exit(main())
