"""Legacy Git committer test shim.

This file remains for backwards compatibility. All tests have moved to
`tests/git_committer/` modules and are imported here so that running
`pytest tests/test_git_committer.py` still executes the split tests.
"""

pytest_plugins = ["tests.git_committer.conftest"]

from tests.git_committer.test_checks import *  # noqa: F401,F403
from tests.git_committer.test_push import *  # noqa: F401,F403
from tests.git_committer.test_abort_paths import *  # noqa: F401,F403
from tests.git_committer.test_diff_validation import *  # noqa: F401,F403
