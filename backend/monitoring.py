import time, json, logging
from contextlib import contextmanager

logger = logging.getLogger("pitchpal")
if not logger.handlers:
    h = logging.StreamHandler()
    fmt = logging.Formatter('%(asctime)s | %(levelname)s | %(message)s')
    h.setFormatter(fmt)
    logger.addHandler(h)
logger.setLevel(logging.INFO)

def log_json(event: str, **fields):
    logger.info(json.dumps({"event": event, **fields}, ensure_ascii=False))

@contextmanager
def stage(name: str, **meta):
    t0 = time.perf_counter()
    log_json("stage_start", stage=name, **meta)
    try:
        yield
    finally:
        took = time.perf_counter() - t0
        log_json("stage_end", stage=name, took_sec=round(took, 4), **meta)
