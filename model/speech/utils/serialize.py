# -*- coding: utf-8 -*-
"""
utils/serialize.py
A small, shared serialization helper to ensure every module
produces JSON-friendly outputs consistently.
"""
from __future__ import annotations

import json
import math
import os
from dataclasses import is_dataclass, asdict
from datetime import datetime, date
from decimal import Decimal
from pathlib import Path
from typing import Any

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None  # graceful if numpy not present


def to_jsonable(obj: Any):
    """Recursively convert common Python/NumPy/dataclass objects to JSON-safe values."""
    # Basic types
    if obj is None or isinstance(obj, (bool, int, float, str)):
        # Normalize floats (including -0.0) and NaNs/Infs
        if isinstance(obj, float):
            if math.isnan(obj) or math.isinf(obj):
                return None
            return float(+obj)  # drop -0.0 sign
        return obj

    # NumPy scalars/arrays
    if np is not None:
        if isinstance(obj, (np.floating,)):
            val = float(obj)
            if math.isnan(val) or math.isinf(val):
                return None
            return float(+val)
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.ndarray,)):
            return [to_jsonable(x) for x in obj.tolist()]

    # Collections
    if isinstance(obj, (list, tuple, set)):
        return [to_jsonable(x) for x in obj]
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v) for k, v in obj.items()}

    # Dataclasses
    if is_dataclass(obj):
        return to_jsonable(asdict(obj))

    # Dates / Decimals / Paths
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, Path):
        return str(obj)

    # Objects with __dict__
    if hasattr(obj, "__dict__"):
        return to_jsonable(vars(obj))

    # Fallback
    return str(obj)


def dumps(data: Any, ensure_ascii: bool = False, indent: int = 2) -> str:
    """json.dumps wrapper with to_jsonable pre-processing."""
    return json.dumps(to_jsonable(data), ensure_ascii=ensure_ascii, indent=indent)


def ensure_dir(path: str):
    """Create parent folder(s) for a file path."""
    dirpath = path if os.path.isdir(path) else os.path.dirname(path)
    if dirpath:
        os.makedirs(dirpath, exist_ok=True)


def dump_json(data: Any, path: str, ensure_ascii: bool = False, indent: int = 2, atomic: bool = True):
    """Write JSON to disk after converting to JSON-safe structures.
    If atomic=True, write to a temp file then rename for safer concurrent writes.
    """
    ensure_dir(path)
    payload = dumps(data, ensure_ascii=ensure_ascii, indent=indent)
    if atomic:
        tmp = f"{path}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(payload)
        os.replace(tmp, path)
    else:
        with open(path, "w", encoding="utf-8") as f:
            f.write(payload)


def load_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
