"""UI utility functions."""

import platform
import subprocess
from pathlib import Path


def open_folder_in_explorer(folder_path: str) -> None:
    """Open the given folder in the OS file explorer (Finder / Explorer / xdg-open)."""
    path = Path(folder_path).resolve()
    path.mkdir(parents=True, exist_ok=True)

    system = platform.system()
    if system == "Darwin":
        subprocess.Popen(["open", str(path)])  # noqa: S603,S607
    elif system == "Windows":
        subprocess.Popen(["explorer", str(path)])  # noqa: S603,S607
    else:  # Linux
        subprocess.Popen(["xdg-open", str(path)])  # noqa: S603,S607
