"""Tag generation and resolution for time tracking."""
import re
import sqlite3

MAX_SLUG_LEN = 32


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    if len(slug) > MAX_SLUG_LEN:
        slug = slug[:MAX_SLUG_LEN].rsplit("-", 1)[0] or slug[:MAX_SLUG_LEN]
    return slug or "item"


def _existing_tags(conn: sqlite3.Connection, project_id: int) -> set[str]:
    tags = {
        r["tag"].lower()
        for r in conn.execute("SELECT tag FROM tasks WHERE project_id = ?", (project_id,))
    }
    tags |= {
        r["tag"].lower()
        for r in conn.execute(
            "SELECT tag FROM overhead_categories WHERE project_id = ?", (project_id,)
        )
    }
    return tags


def unique_tag(conn: sqlite3.Connection, project_id: int, base: str) -> str:
    """Return base, or base-2, base-3, ... until unique within the project."""
    existing = _existing_tags(conn, project_id)
    if base.lower() not in existing:
        return base
    n = 2
    while f"{base}-{n}".lower() in existing:
        n += 1
    return f"{base}-{n}"


def task_tag(conn: sqlite3.Connection, project_id: int, project_code: str,
             external_key: str, title: str) -> str:
    key = slugify(external_key).upper() if external_key else ""
    parts = [project_code.upper()] + ([key] if key else []) + [slugify(title)]
    return unique_tag(conn, project_id, "-".join(parts))


def overhead_tag(conn: sqlite3.Connection, project_id: int, project_code: str,
                 name: str) -> str:
    return unique_tag(conn, project_id, f"{project_code.upper()}-OH-{slugify(name)}")


def resolve_tag(conn: sqlite3.Connection, project_id: int, raw: str):
    """Resolve a tag string to ('task'|'overhead', id, canonical_tag).

    Exact match wins; otherwise a unique prefix match is accepted.
    Returns (None, None, error_message) on failure.
    """
    needle = raw.strip().lower()
    if not needle:
        return None, None, "empty tag"
    candidates = [
        ("task", r["id"], r["tag"])
        for r in conn.execute(
            "SELECT id, tag FROM tasks WHERE project_id = ?", (project_id,)
        )
    ] + [
        ("overhead", r["id"], r["tag"])
        for r in conn.execute(
            "SELECT id, tag FROM overhead_categories WHERE project_id = ?", (project_id,)
        )
    ]
    exact = [c for c in candidates if c[2].lower() == needle]
    if len(exact) == 1:
        return exact[0]
    prefixed = [c for c in candidates if c[2].lower().startswith(needle)]
    if len(prefixed) == 1:
        return prefixed[0]
    if len(prefixed) > 1:
        opts = ", ".join(sorted(c[2] for c in prefixed)[:5])
        return None, None, f"ambiguous tag '{raw}' (matches: {opts})"
    return None, None, f"unknown tag '{raw}'"
