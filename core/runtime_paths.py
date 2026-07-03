"""Runtime data-path resolution shared by the edge stack.

Resolution order for every writable data directory:

1. Explicit environment variable (``PALLETIZER_CACHE_DIR`` etc.) — production
   edge containers mount a volume and point here.
2. ``/data/<name>`` — the conventional edge-container volume, used only if it
   already exists or is creatable (i.e. ``/data`` is writable).
3. ``./data/<name>`` relative to the current working directory — the dev /
   Codespaces path, kept out of git via ``.gitignore``.
4. ``<tempdir>/palletizer/<name>`` — last resort so IO setup can never crash
   a control process.

The resolver logs which tier was selected exactly once per directory so an
operator can always see where state is going.
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

logger = logging.getLogger("palletizer.paths")

_EDGE_ROOT = Path("/data")


def _try_mkdir(path: Path) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".write_probe"
        probe.touch()
        probe.unlink(missing_ok=True)
        return True
    except OSError:
        return False


def resolve_data_dir(env_var: str, name: str) -> Path:
    """Return a guaranteed-writable directory for *name*.

    ``env_var`` wins if set — and if it is set but unusable, we fail loudly
    rather than silently writing somewhere the operator didn't choose.
    """
    override = os.getenv(env_var)
    if override:
        path = Path(override)
        if not _try_mkdir(path):
            raise PermissionError(
                f"{env_var}={override} is set but not writable — refusing to "
                f"fall back silently"
            )
        logger.info("%s -> %s (env override)", name, path)
        return path

    edge_path = _EDGE_ROOT / name
    if _try_mkdir(edge_path):
        logger.info("%s -> %s (edge volume)", name, edge_path)
        return edge_path

    local_path = Path.cwd() / "data" / name
    if _try_mkdir(local_path):
        logger.info("%s -> %s (workspace-local)", name, local_path)
        return local_path

    tmp_path = Path(tempfile.gettempdir()) / "palletizer" / name
    if _try_mkdir(tmp_path):
        logger.warning("%s -> %s (tempdir fallback — non-persistent)", name, tmp_path)
        return tmp_path

    raise PermissionError(f"No writable location found for data dir '{name}'")
