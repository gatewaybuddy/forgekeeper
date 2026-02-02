"""
Consciousness system CLI commands

Provides conversational interface to the consciousness system via GraphQL.
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any
from urllib import request, error

# GraphQL server URL
def get_consciousness_url() -> str:
    """Get consciousness GraphQL endpoint URL from environment"""
    port = os.getenv('FRONTEND_PORT', '3000')
    host = os.getenv('CONSCIOUSNESS_HOST', 'localhost')
    return f'http://{host}:{port}/graphql'

def get_api_url() -> str:
    """Get consciousness REST API URL"""
    port = os.getenv('FRONTEND_PORT', '3000')
    host = os.getenv('CONSCIOUSNESS_HOST', 'localhost')
    return f'http://{host}:{port}/api/consciousness'


# GraphQL query helper
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
                print(f"GraphQL Error: {result['errors']}", file=sys.stderr)
                return {}

            return result.get('data', {})
    except error.URLError as e:
        print(f"Error: Could not connect to consciousness system at {url}", file=sys.stderr)
        print(f"Make sure the server is running (npm run serve)", file=sys.stderr)
        print(f"Details: {e}", file=sys.stderr)
        return {}
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return {}


# REST API helper
def rest_api(endpoint: str, method: str = 'GET', data: dict[str, Any] | None = None) -> dict[str, Any]:
    """Execute a REST API call"""
    url = f"{get_api_url()}/{endpoint}"

    req_data = None
    if data:
        req_data = json.dumps(data).encode('utf-8')

    req = request.Request(
        url,
        data=req_data,
        headers={'Content-Type': 'application/json'},
        method=method
    )

    try:
        with request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode('utf-8'))
    except error.URLError as e:
        print(f"Error: Could not connect to {url}", file=sys.stderr)
        print(f"Make sure CONSCIOUSNESS_ENABLED=1 and server is running", file=sys.stderr)
        return {}
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return {}


# Command implementations

def cmd_status(args: Any) -> int:
    """Show consciousness status"""
    result = rest_api('state')

    if not result:
        return 1

    print(f"State: {result.get('state', 'unknown')}")
    print(f"Current Cycle: {result.get('currentCycle', 0)}")
    print(f"Cycle Interval: {result.get('cycleInterval', 0)}ms")
    print(f"API Tokens Remaining: {result.get('apiTokensRemaining', 0):,}")

    metrics = result.get('metrics', {})
    print(f"\nMetrics:")
    print(f"  Success Rate: {metrics.get('successRate', 0):.1f}%")
    print(f"  Avg Cycle Duration: {metrics.get('avgCycleDuration', 0):.0f}ms")
    print(f"  Uptime: {metrics.get('uptimeMs', 0) / 1000:.1f}s")

    stm = result.get('shortTermMemory', [])
    print(f"\nShort-Term Memory ({len(stm)} items):")
    for i, mem in enumerate(stm[:3], 1):  # Show first 3
        print(f"  {i}. {mem.get('summary', 'N/A')[:60]}...")

    return 0


def cmd_health(args: Any) -> int:
    """Check consciousness health"""
    result = rest_api('health')

    if not result:
        return 1

    status = result.get('status', 'unknown')
    print(f"Status: {status}")

    if status == 'stopped':
        print("⚠️  Consciousness is stopped")
        return 1

    print(f"State: {result.get('state', 'unknown')}")
    print(f"Success Rate: {result.get('successRate', 0):.1f}%")

    problems = result.get('problems', [])
    if problems:
        print(f"\n⚠️  {len(problems)} Problem(s) Detected:")
        for p in problems:
            severity = p.get('severity', 'unknown')
            msg = p.get('message', 'No description')
            icon = '🔴' if severity == 'critical' else '🟡'
            print(f"  {icon} [{severity.upper()}] {msg}")
        return 1
    else:
        print("\n✅ No problems detected")
        return 0


def cmd_start(args: Any) -> int:
    """Start consciousness"""
    result = rest_api('start', method='POST')

    if not result:
        return 1

    if result.get('success'):
        print("✅ Consciousness started successfully")
        return 0
    else:
        print(f"❌ Failed to start: {result.get('error', 'Unknown error')}")
        return 1


def cmd_stop(args: Any) -> int:
    """Stop consciousness"""
    reason = getattr(args, 'reason', None) or 'Manual stop via CLI'

    result = rest_api('stop', method='POST', data={'reason': reason})

    if not result:
        return 1

    if result.get('success'):
        print(f"✅ Consciousness stopped: {result.get('reason', reason)}")
        return 0
    else:
        print(f"❌ Failed to stop: {result.get('error', 'Unknown error')}")
        return 1


def cmd_ask(args: Any) -> int:
    """Ask consciousness a question"""
    question = args.question

    if not question:
        print("Error: No question provided", file=sys.stderr)
        print("Usage: forgekeeper consciousness ask \"What are you thinking about?\"")
        return 1

    # For now, query current state and short-term memory as the "answer"
    # In Sprint 9, this could use a dedicated query mutation
    query = """
    query {
      consciousnessState {
        state
        currentCycle
        shortTermMemory {
          summary
          importance
          timestamp
        }
      }
    }
    """

    result = graphql_query(query)

    if not result:
        return 1

    state = result.get('consciousnessState', {})

    print(f"Consciousness (Cycle {state.get('currentCycle', 0)}):\n")

    stm = state.get('shortTermMemory', [])
    if stm:
        print("Recent thoughts:")
        for mem in stm[:5]:
            print(f"  • {mem.get('summary', 'N/A')}")
    else:
        print("  (No recent thoughts in short-term memory)")

    print(f"\nCurrent state: {state.get('state', 'unknown')}")

    return 0


def cmd_goal_list(args: Any) -> int:
    """List goals"""
    query = """
    query {
      goals(state: ACTIVE) {
        id
        title
        type
        priority
        progress
        state
      }
    }
    """

    result = graphql_query(query)

    if not result:
        return 1

    goals = result.get('goals', [])

    if not goals:
        print("No active goals")
        return 0

    print(f"Active Goals ({len(goals)}):\n")

    for goal in goals:
        print(f"  [{goal.get('id', 'N/A')}] {goal.get('title', 'Untitled')}")
        print(f"    Type: {goal.get('type', 'unknown')}")
        print(f"    Priority: {goal.get('priority', 'unknown')}")
        print(f"    Progress: {goal.get('progress', 0)}%")
        print()

    return 0


def cmd_goal_add(args: Any) -> int:
    """Add a new goal"""
    title = args.title
    goal_type = getattr(args, 'type', 'IMPROVEMENT')
    priority = getattr(args, 'priority', 'MEDIUM')
    description = getattr(args, 'description', None)

    if not title:
        print("Error: Goal title required", file=sys.stderr)
        return 1

    mutation = """
    mutation CreateGoal($input: CreateGoalInput!) {
      createGoal(input: $input) {
        id
        title
        type
        priority
        state
      }
    }
    """

    variables = {
        'input': {
            'title': title,
            'type': goal_type.upper(),
            'priority': priority.upper()
        }
    }

    if description:
        variables['input']['description'] = description

    result = graphql_query(mutation, variables)

    if not result:
        return 1

    goal = result.get('createGoal', {})

    if goal:
        print(f"✅ Goal created: {goal.get('title', 'Untitled')}")
        print(f"   ID: {goal.get('id', 'N/A')}")
        print(f"   Type: {goal.get('type', 'unknown')}")
        print(f"   Priority: {goal.get('priority', 'unknown')}")
        return 0
    else:
        print("❌ Failed to create goal")
        return 1


def cmd_watch(args: Any) -> int:
    """Watch consciousness in real-time"""
    print("Watching consciousness (Ctrl+C to stop)...\n")

    try:
        while True:
            result = rest_api('state')

            if result:
                state = result.get('state', 'unknown')
                cycle = result.get('currentCycle', 0)
                tokens = result.get('apiTokensRemaining', 0)

                metrics = result.get('metrics', {})
                success_rate = metrics.get('successRate', 0)

                print(f"[Cycle {cycle}] State: {state} | Success: {success_rate:.1f}% | Tokens: {tokens:,}", end='\r')

            time.sleep(2)
    except KeyboardInterrupt:
        print("\n\nStopped watching")
        return 0


def cmd_dream(args: Any) -> int:
    """Trigger a dream cycle manually"""
    result = rest_api('dream', method='POST')

    if not result:
        return 1

    if result.get('success'):
        dream_result = result.get('result', {})
        print("✅ Dream cycle completed:")
        print(f"   Memories consolidated: {dream_result.get('memoriesConsolidated', 0)}")
        print(f"   Insights generated: {dream_result.get('insightsGenerated', 0)}")
        print(f"   Biases challenged: {dream_result.get('biasesChallenged', 0)}")
        return 0
    else:
        print(f"❌ Dream failed: {result.get('error', 'Unknown error')}")
        return 1


def setup_consciousness_parser(subparsers: Any) -> None:
    """Setup consciousness subcommand parser"""
    c = subparsers.add_parser('consciousness', help='Interact with consciousness system', aliases=['c'])
    c_sub = c.add_subparsers(dest='subcmd', help='Consciousness commands')

    # Status command
    c_status = c_sub.add_parser('status', help='Show consciousness status')
    c_status.set_defaults(func=cmd_status)

    # Health command
    c_health = c_sub.add_parser('health', help='Check consciousness health')
    c_health.set_defaults(func=cmd_health)

    # Start command
    c_start = c_sub.add_parser('start', help='Start consciousness')
    c_start.set_defaults(func=cmd_start)

    # Stop command
    c_stop = c_sub.add_parser('stop', help='Stop consciousness')
    c_stop.add_argument('-r', '--reason', help='Reason for stopping')
    c_stop.set_defaults(func=cmd_stop)

    # Ask command
    c_ask = c_sub.add_parser('ask', help='Ask consciousness a question')
    c_ask.add_argument('question', nargs='*', help='Question to ask')
    c_ask.set_defaults(func=cmd_ask)

    # Watch command
    c_watch = c_sub.add_parser('watch', help='Watch consciousness in real-time')
    c_watch.set_defaults(func=cmd_watch)

    # Dream command
    c_dream = c_sub.add_parser('dream', help='Trigger a dream cycle')
    c_dream.set_defaults(func=cmd_dream)

    # Goal commands
    c_goal = c_sub.add_parser('goal', help='Manage goals')
    c_goal_sub = c_goal.add_subparsers(dest='goal_cmd', help='Goal commands')

    c_goal_list = c_goal_sub.add_parser('list', help='List goals')
    c_goal_list.set_defaults(func=cmd_goal_list)

    c_goal_add = c_goal_sub.add_parser('add', help='Add a new goal')
    c_goal_add.add_argument('title', nargs='+', help='Goal title')
    c_goal_add.add_argument('-t', '--type', choices=['improvement', 'investigation', 'learning'], default='improvement')
    c_goal_add.add_argument('-p', '--priority', choices=['low', 'medium', 'high'], default='medium')
    c_goal_add.add_argument('-d', '--description', help='Goal description')
    c_goal_add.set_defaults(func=cmd_goal_add)

    # Set default handler for 'consciousness' with no subcmd
    c.set_defaults(func=lambda args: cmd_status(args))


def handle_consciousness_command(args: Any) -> int:
    """Handle consciousness command routing"""
    # Convert question list to string if needed
    if hasattr(args, 'question') and isinstance(args.question, list):
        args.question = ' '.join(args.question)

    # Convert title list to string if needed
    if hasattr(args, 'title') and isinstance(args.title, list):
        args.title = ' '.join(args.title)

    # Call the appropriate function
    if hasattr(args, 'func'):
        return args.func(args)

    # Default to status
    return cmd_status(args)
