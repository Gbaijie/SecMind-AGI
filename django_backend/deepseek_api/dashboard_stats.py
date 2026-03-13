import csv
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path


def _default_log_root() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "log"


HIGH_KEYWORDS = [
    "critical",
    "fatal",
    "panic",
    "error",
    "high",
    "严重",
    "高危",
    "失败",
    "拒绝",
]

MEDIUM_KEYWORDS = [
    "warn",
    "warning",
    "timeout",
    "异常",
    "超时",
    "中危",
    "告警",
]

LOW_KEYWORDS = [
    "info",
    "debug",
    "notice",
    "提示",
    "低危",
    "正常",
]


def _normalize_csv_value(value) -> str:
    if isinstance(value, list):
        return " ".join(str(item).strip() for item in value if item is not None)
    if value is None:
        return ""
    return str(value).strip()


def _classify_threat(text: str) -> str:
    lowered = text.lower()
    if any(token in lowered for token in HIGH_KEYWORDS):
        return "high"
    if any(token in lowered for token in MEDIUM_KEYWORDS):
        return "medium"
    if any(token in lowered for token in LOW_KEYWORDS):
        return "low"
    return "medium"


def _category_and_source(csv_path: Path, log_root: Path) -> tuple[str, str]:
    rel_parts = csv_path.relative_to(log_root).parts
    if len(rel_parts) >= 3:
        return rel_parts[0], rel_parts[1]
    if len(rel_parts) == 2:
        return rel_parts[0], rel_parts[0]
    parent_name = csv_path.parent.name if csv_path.parent.name else "unknown"
    return parent_name, parent_name


def _iter_csv_files(log_root: Path) -> list[Path]:
    if not log_root.exists():
        return []
    return sorted(log_root.rglob("*.csv"))


def _build_topology(category_counts, source_counts_by_category):
    nodes = [
        {
            "id": "core",
            "name": "DeepSOC Core",
            "type": "core",
            "x": 0.0,
            "y": 0.0,
            "z": 0.0,
            "value": 1,
        }
    ]
    links = []

    categories = sorted(category_counts.items(), key=lambda item: item[1], reverse=True)
    if not categories:
        return {"nodes": nodes, "links": links}

    category_radius = 34.0
    source_ring_radius = 12.0
    node_ids = {"core"}

    for idx, (category, count) in enumerate(categories):
        angle = (2 * math.pi * idx) / max(1, len(categories))
        cx = category_radius * math.cos(angle)
        cz = category_radius * math.sin(angle)
        cy = (idx % 3 - 1) * 4.0

        category_id = f"category:{category}"
        nodes.append(
            {
                "id": category_id,
                "name": category,
                "type": "category",
                "x": round(cx, 3),
                "y": round(cy, 3),
                "z": round(cz, 3),
                "value": int(count),
            }
        )
        node_ids.add(category_id)

        links.append(
            {
                "source": "core",
                "target": category_id,
                "weight": int(count),
                "severity": "medium",
            }
        )

        source_items = sorted(
            source_counts_by_category[category].items(),
            key=lambda item: item[1],
            reverse=True,
        )[:8]

        for s_idx, (source, s_count) in enumerate(source_items):
            source_angle = (2 * math.pi * s_idx) / max(1, len(source_items))
            sx = cx + source_ring_radius * math.cos(source_angle)
            sz = cz + source_ring_radius * math.sin(source_angle)
            sy = cy + ((s_idx % 2) * 3 - 1.5)

            source_id = f"source:{source}"
            if source_id not in node_ids:
                nodes.append(
                    {
                        "id": source_id,
                        "name": source,
                        "type": "source",
                        "x": round(sx, 3),
                        "y": round(sy, 3),
                        "z": round(sz, 3),
                        "value": int(s_count),
                    }
                )
                node_ids.add(source_id)

            severity = "low"
            if s_count >= 40:
                severity = "high"
            elif s_count >= 15:
                severity = "medium"

            links.append(
                {
                    "source": category_id,
                    "target": source_id,
                    "weight": int(s_count),
                    "severity": severity,
                }
            )

    return {"nodes": nodes, "links": links}


def build_dashboard_stats(log_root: Path | None = None) -> dict:
    root = log_root or _default_log_root()

    source_counts = defaultdict(int)
    category_counts = defaultdict(int)
    threat_counts = defaultdict(int)
    source_counts_by_category = defaultdict(lambda: defaultdict(int))
    timeline = []

    for csv_file in _iter_csv_files(root):
        category, source = _category_and_source(csv_file, root)
        file_count = 0

        with csv_file.open("r", encoding="utf-8", errors="ignore", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                text = " ".join(_normalize_csv_value(value) for value in row.values())
                if not text:
                    continue
                file_count += 1
                threat = _classify_threat(text)
                threat_counts[threat] += 1

        if file_count == 0:
            continue

        source_counts[source] += file_count
        category_counts[category] += file_count
        source_counts_by_category[category][source] += file_count

        mtime = int(csv_file.stat().st_mtime)
        timeline.append(
            {
                "label": source,
                "file": csv_file.name,
                "value": file_count,
                "updated_at": mtime,
                "updated_text": datetime.fromtimestamp(mtime).strftime("%m-%d %H:%M"),
            }
        )

    source_series = [
        {"name": key, "value": value}
        for key, value in sorted(source_counts.items(), key=lambda item: item[1], reverse=True)
    ]

    category_series = [
        {"name": key, "value": value}
        for key, value in sorted(category_counts.items(), key=lambda item: item[1], reverse=True)
    ]

    threat_series = [
        {"name": "High", "level": "high", "value": int(threat_counts.get("high", 0))},
        {"name": "Medium", "level": "medium", "value": int(threat_counts.get("medium", 0))},
        {"name": "Low", "level": "low", "value": int(threat_counts.get("low", 0))},
    ]

    latest_timeline = sorted(timeline, key=lambda item: item["updated_at"])[-12:]

    topology = _build_topology(category_counts, source_counts_by_category)

    return {
        "summary": {
            "total_records": int(sum(source_counts.values())),
            "total_sources": int(len(source_counts)),
            "total_categories": int(len(category_counts)),
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        },
        "source_counts": source_series,
        "category_counts": category_series,
        "threat_distribution": threat_series,
        "timeline": latest_timeline,
        "topology": topology,
    }
