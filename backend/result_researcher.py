from __future__ import annotations

import csv, json, re, sys, traceback
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

RESULT_DIR_NAMES = {"results", "result", "outputs", "output"}  # 결과 폴더명 다양성 허용

def _to_jsonable(obj: Any) -> Any:
    try:
        import numpy as _np  # type: ignore
    except Exception:
        _np = None
    if _np is not None:
        if isinstance(obj, (_np.floating, _np.integer, _np.bool_)):
            return obj.item()
        if isinstance(obj, _np.ndarray):
            return obj.tolist()
    try:
        import pandas as _pd  # type: ignore
    except Exception:
        _pd = None
    if _pd is not None:
        if isinstance(obj, _pd.DataFrame):
            return obj.to_dict(orient="records")
        if isinstance(obj, _pd.Series):
            return obj.to_dict()
    if isinstance(obj, (dict, list, str, int, float, bool)) or obj is None:
        return obj
    return str(obj)

@dataclass
class ResultFile:
    path: str
    task: str           # model/<task>/.../<results|result>/...
    kind: str           # json | csv | html | txt | other
    size_bytes: int
    modified_at: str
    basename: str
    def dt(self) -> datetime:
        return datetime.fromisoformat(self.modified_at)
    @property
    def stem(self) -> str:
        return Path(self.basename).stem

class ResultsResearcher:
    def __init__(self, model_root: Union[str, Path] = "model") -> None:
        self.model_root = Path(model_root).resolve()
        if not self.model_root.exists():
            raise FileNotFoundError(f"model root not found: {self.model_root}")
        self._index: List[ResultFile] = []

    def index_results(self) -> List[ResultFile]:
        files: List[ResultFile] = []
        # rglob 전체 훑기: 경로 어딘가에 result(s)/output(s) 폴더가 포함되면 채택
        for p in self.model_root.rglob("*"):
            if not p.is_file():
                continue
            parts_set = set(p.parts)
            if RESULT_DIR_NAMES.isdisjoint(parts_set):
                continue
            kind = self._detect_kind(p.suffix.lower())
            stat = p.stat()
            task = self._detect_task(p)
            files.append(
                ResultFile(
                    path=str(p),
                    task=task,
                    kind=kind,
                    size_bytes=stat.st_size,
                    modified_at=datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    basename=p.name,
                )
            )
        files.sort(key=lambda x: x.modified_at, reverse=True)
        self._index = files
        return files

    def latest(self, task: Optional[str] = None, kind: Optional[str] = None) -> Optional[ResultFile]:
        if not self._index:
            self.index_results()
        for rf in self._index:
            if (task is None or rf.task == task) and (kind is None or rf.kind == kind):
                return rf
        return None

    def load(self, target: Union[str, Path, ResultFile]) -> Any:
        p = Path(target.path if isinstance(target, ResultFile) else target)
        kind = self._detect_kind(p.suffix.lower())
        if kind == "json":
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        if kind == "csv":
            try:
                import pandas as pd  # optional
                return pd.read_csv(p)
            except Exception:
                rows = []
                with open(p, "r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    rows.extend(reader)
                return rows
        if kind == "txt":
            return p.read_text(encoding="utf-8", errors="ignore")
        if kind == "html":
            text = p.read_text(encoding="utf-8", errors="ignore")
            title = self._extract_html_title(text)
            return {"title": title, "html": text}
        return {"path": str(p), "kind": kind, "size": p.stat().st_size}

    def summarize(self) -> Dict[str, Any]:
        """
        출력 구조:
        {
          model_root, indexed_files, generated_at,
          tasks: {
            <task>: {
              counts: {json, csv, ...},
              latest: { kind: {file, preview} },
              merged_by_stem: [
                {
                  stem, latest_modified_at, formats: {
                    json: { path, basename, modified_at, size_bytes },
                    csv:  { ... },
                    ...
                  },
                  preferred: "json" | "csv" | "html" | "txt" | "other"
                }, ...
              ]
            }, ...
          }
        }
        """
        if not self._index:
            self.index_results()
        summary: Dict[str, Any] = {
            "model_root": str(self.model_root),
            "indexed_files": len(self._index),
            "tasks": {},
            "generated_at": datetime.now().isoformat()
        }
        # 태스크별 묶기
        tasks: Dict[str, List[ResultFile]] = {}
        for rf in self._index:
            tasks.setdefault(rf.task, []).append(rf)

        for task, files in tasks.items():
            # 형식별 카운트 & 최신(기존 필드 유지)
            by_kind: Dict[str, List[ResultFile]] = {}
            for f in files:
                by_kind.setdefault(f.kind, []).append(f)

            task_block: Dict[str, Any] = {
                "counts": {k: len(v) for k, v in by_kind.items()},
                "latest": {}
            }
            for kind, vec in by_kind.items():
                latest_file = sorted(vec, key=lambda r: r.modified_at, reverse=True)[0]
                preview = self._make_preview(latest_file)
                task_block["latest"][kind] = {"file": asdict(latest_file), "preview": preview}

            # === 파일명 기반 병합: stem(확장자 제외) 단위로 그룹 ===
            groups: Dict[str, List[ResultFile]] = {}
            for f in files:
                groups.setdefault(f.stem, []).append(f)

            merged_entries: List[Dict[str, Any]] = []
            for stem, vec in groups.items():
                # 동일 stem의 포맷들을 kind -> 최신 파일로 매핑
                formats: Dict[str, Dict[str, Any]] = {}
                latest_ts = None
                latest_iso = None
                for kind, per_kind_files in _group_by_kind(vec).items():
                    # 같은 stem + 같은 kind 중 최신
                    latest_k = sorted(per_kind_files, key=lambda r: r.modified_at, reverse=True)[0]
                    formats[kind] = {
                        "path": latest_k.path,
                        "basename": latest_k.basename,
                        "modified_at": latest_k.modified_at,
                        "size_bytes": latest_k.size_bytes,
                    }
                    if (latest_ts is None) or (latest_k.modified_at > latest_iso):
                        latest_iso = latest_k.modified_at
                        latest_ts = latest_k.dt()

                # 선호 포맷 결정(프론트 선택 기본값): json > csv > html > txt > other
                preferred = _pick_preferred_format(formats)

                merged_entries.append({
                    "stem": stem,
                    "latest_modified_at": latest_iso,
                    "formats": formats,
                    "preferred": preferred
                })

            # 최신 수정 시각 기준 내림차순 정렬
            merged_entries.sort(key=lambda e: e.get("latest_modified_at") or "", reverse=True)
            task_block["merged_by_stem"] = merged_entries

            summary["tasks"][task] = task_block

        return summary

    # 내부 유틸
    @staticmethod
    def _detect_kind(suffix: str) -> str:
        if suffix == ".json": return "json"
        if suffix == ".csv":  return "csv"
        if suffix in (".html", ".htm"): return "html"
        if suffix in (".txt", ".log"):  return "txt"
        return "other"

    @staticmethod
    def _detect_task(p: Path) -> str:
        parts = list(p.parts)
        if "model" in parts:
            i = parts.index("model")
            if i + 1 < len(parts):
                return parts[i + 1]
        return p.parent.parent.name if p.parent.parent.name else "unknown"

    @staticmethod
    def _extract_html_title(html_text: str) -> Optional[str]:
        m = re.search(r"<title>(.*?)</title>", html_text, flags=re.I | re.S)
        return m.group(1).strip() if m else None

    def _make_preview(self, rf: ResultFile) -> Any:
        try:
            data = self.load(rf)
            if rf.kind == "json":
                if isinstance(data, dict):
                    keys = list(data.keys())[:5]
                    return {"type": "dict", "keys": keys, "sizes": {k: self._brief_size(data[k]) for k in keys}}
                if isinstance(data, list):
                    first_keys = list(data[0].keys()) if data and isinstance(data[0], dict) else None
                    return {"type": "list", "length": len(data), "first_item_keys": first_keys}
                return {"type": type(data).__name__}
            if rf.kind == "csv":
                try:
                    import pandas as pd  # type: ignore
                    if hasattr(data, "head"):
                        head = data.head(5)
                        return {"type": "dataframe", "rows": json.loads(json.dumps(_to_jsonable(head)))}
                except Exception:
                    pass
                if isinstance(data, list):
                    return {"type": "rows", "rows": data[:5]}
                return {"type": type(data).__name__}
            if rf.kind == "txt":
                text: str = data if isinstance(data, str) else str(data)
                return {"type": "text", "preview": text[:200]}
            if rf.kind == "html":
                return {"type": "html", "title": data.get("title") if isinstance(data, dict) else None}
            return {"type": rf.kind, "size": rf.size_bytes}
        except Exception as e:
            return {"error": str(e), "traceback": traceback.format_exc()}

    @staticmethod
    def _brief_size(val: Any) -> Any:
        val = _to_jsonable(val)
        if isinstance(val, list):
            return f"list(len={len(val)})"
        if isinstance(val, dict):
            return f"dict(keys={len(val)})"
        if isinstance(val, str):
            return f"str(len={len(val)})"
        return type(val).__name__

def _group_by_kind(files: List[ResultFile]) -> Dict[str, List[ResultFile]]:
    by_kind: Dict[str, List[ResultFile]] = {}
    for f in files:
        by_kind.setdefault(f.kind, []).append(f)
    return by_kind

def _pick_preferred_format(formats: Dict[str, Dict[str, Any]]) -> str:
    priority = ["json", "csv", "html", "txt", "other"]
    for k in priority:
        if k in formats:
            return k
    # fallback: 사전순
    return sorted(formats.keys())[0] if formats else "other"

def _print_json(obj: Any) -> None:
    print(json.dumps(_to_jsonable(obj), ensure_ascii=False, indent=2))

def main(argv: List[str]) -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Scan model/**/(results|result|outputs|output) for artifacts (with filename-based merge)")
    parser.add_argument("--root", default="model", help="model root (default: model)")
    sub = parser.add_subparsers(dest="cmd")

    sub.add_parser("summary", help="인덱싱 후 요약 출력(기본)")
    p_latest = sub.add_parser("latest", help="태스크/타입별 최신 파일 메타")
    p_latest.add_argument("--task", default=None)
    p_latest.add_argument("--kind", default=None)

    p_load = sub.add_parser("load", help="경로로 파일 로드")
    p_load.add_argument("--path", required=True)

    sub.add_parser("scan", help="결과 폴더/파일을 나열(진단용)")

    args = parser.parse_args(argv[1:])
    rr = ResultsResearcher(model_root=args.root)
    cmd = args.cmd or "summary"

    if cmd == "summary":
        rr.index_results()
        _print_json(rr.summarize()); return
    if cmd == "latest":
        rr.index_results()
        rf = rr.latest(task=args.task, kind=args.kind)
        _print_json(asdict(rf) if rf else {"message": "no match"}); return
    if cmd == "load":
        data = rr.load(args.path)
        _print_json(data); return
    if cmd == "scan":
        # 어떤 폴더가 잡히는지, 파일은 몇 개인지 보여줌
        results_dirs = sorted({str(p.parent) for p in rr.model_root.rglob("*") if p.is_file() and not RESULT_DIR_NAMES.isdisjoint(set(p.parts))})
        rr.index_results()
        _print_json({
            "model_root": str(rr.model_root),
            "result_like_dirs": results_dirs,
            "file_count": len(rr._index),
            "first_10_files": [asdict(r) for r in rr._index[:10]],
        }); return

if __name__ == "__main__":
    main(sys.argv)
