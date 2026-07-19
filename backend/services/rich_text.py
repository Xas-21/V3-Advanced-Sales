"""Shared rich-text sanitization + mention/hashtag helpers.

Feed posts, comments and chat messages all accept a small subset of formatting
HTML produced by the frontend contentEditable editor (bold/italic/underline,
colors, highlights, links, lists). We sanitize server-side with a strict
allowlist so a malicious client can never inject script/style/event handlers,
then the frontend re-sanitizes with DOMPurify before rendering. Defense in depth.
"""
from __future__ import annotations

import re
from typing import Iterable

import bleach

try:  # bleach[css] extra — enables safe inline color / highlight styles
    from bleach.css_sanitizer import CSSSanitizer

    _CSS_SANITIZER = CSSSanitizer(
        allowed_css_properties=[
            "color",
            "background-color",
            "font-weight",
            "font-style",
            "text-decoration",
        ]
    )
except Exception:  # pragma: no cover - fallback if tinycss2 missing
    _CSS_SANITIZER = None

ALLOWED_TAGS = [
    "b", "strong", "i", "em", "u", "s", "strike", "a", "br", "p", "span",
    "ul", "ol", "li", "blockquote", "code", "pre", "h1", "h2", "h3", "div",
    "mark",
]

ALLOWED_ATTRS = {
    "a": ["href", "title", "target", "rel"],
    "span": ["style", "class", "data-mention", "data-hashtag"],
    "mark": ["style"],
    "p": ["style"],
    "div": ["style"],
    "code": ["class"],
}

_MAX_HTML = 20000

_MENTION_RE = re.compile(r"@([A-Za-z0-9_.\-]{2,40})")
_HASHTAG_RE = re.compile(r"#([A-Za-z0-9_\-]{1,40})")
_TAG_STRIP_RE = re.compile(r"<[^>]+>")


def sanitize_html(html: str | None) -> str:
    """Return a safe HTML fragment limited to the formatting allowlist."""
    if not html:
        return ""
    kwargs = dict(tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)
    if _CSS_SANITIZER is not None:
        kwargs["css_sanitizer"] = _CSS_SANITIZER
    cleaned = bleach.clean(html, **kwargs)
    # Force links to open safely (no reverse tabnabbing).
    cleaned = cleaned.replace("<a ", '<a target="_blank" rel="noopener noreferrer" ')
    return cleaned[:_MAX_HTML]


def html_to_text(html: str | None) -> str:
    """Plain-text projection of an HTML fragment (for search / previews)."""
    if not html:
        return ""
    text = _TAG_STRIP_RE.sub(" ", html)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_hashtags(text: str | None) -> list[str]:
    """Lowercased, de-duplicated hashtags found in plain text (no leading #)."""
    if not text:
        return []
    seen: list[str] = []
    for m in _HASHTAG_RE.findall(text):
        tag = m.lower()
        if tag not in seen:
            seen.append(tag)
    return seen[:20]


def normalize_mentions(ids: Iterable | None) -> list[str]:
    """Coerce a mentions payload into a clean, de-duplicated list of user ids."""
    if not ids:
        return []
    out: list[str] = []
    for x in ids:
        s = str(x).strip()
        if s and s not in out:
            out.append(s)
    return out[:50]
