"""Locate judge evidence quotes inside the text the judge actually read.

The judges in this study copy a single short verbatim phrase per field and are
told to keep it on one line and turn any internal double quotes into single
quotes.  So the quotes are close to verbatim but not byte-identical: punctuation,
quote style and a few dropped/added words differ.  We match on word tokens with
difflib, which tolerates that, and map the matched run back to character offsets
in the original text so the app can wrap it in a <mark>.

`find_span` returns (start, end, kind) with kind "exact" or "fuzzy", or None.
"""

import re
from difflib import SequenceMatcher

_WORD = re.compile(r"\w+", re.UNICODE)


def _tokens(text):
    """Word tokens as (lower, start, end), punctuation ignored."""
    return [(m.group(0).lower(), m.start(), m.end()) for m in _WORD.finditer(text)]


def find_span(quote, target, min_tokens=3, min_coverage=0.6):
    """Best character span in `target` matching `quote`, or None.

    A very short quote (< min_tokens words) must match exactly as a contiguous
    token run; longer quotes may miss up to (1 - min_coverage) of their words.
    """
    if not quote or not target:
        return None
    qt = _tokens(quote)
    tt = _tokens(target)
    if not qt or not tt:
        return None
    qwords = [w for w, _, _ in qt]
    twords = [w for w, _, _ in tt]

    sm = SequenceMatcher(None, twords, qwords, autojunk=False)
    blocks = [b for b in sm.get_matching_blocks() if b.size > 0]
    if not blocks:
        return None
    matched = sum(b.size for b in blocks)
    coverage = matched / len(qwords)

    if len(qwords) < min_tokens:
        # Require the whole short quote as one contiguous run.
        if len(blocks) == 1 and blocks[0].size == len(qwords):
            b = blocks[0]
            return (tt[b.a][1], tt[b.a + b.size - 1][2], "exact")
        return None

    if coverage < min_coverage:
        return None

    first_t = blocks[0].a
    last_t = blocks[-1].a + blocks[-1].size - 1
    span_tokens = last_t - first_t + 1

    # If the matched tokens are scattered across far more target words than the
    # quote has, the match is probably spurious alignment of common words; keep
    # only the densest contiguous block instead.
    if span_tokens > len(qwords) * 2 + 6:
        best = max(blocks, key=lambda b: b.size)
        if best.size / len(qwords) < min_coverage:
            return None
        first_t, last_t = best.a, best.a + best.size - 1

    start = tt[first_t][1]
    end = tt[last_t][2]
    kind = "exact" if matched == len(qwords) and (last_t - first_t + 1) == len(qwords) else "fuzzy"
    return (start, end, kind)


def best_event(quote, candidates, **kw):
    """Pick the candidate (idx, text) whose match covers the most of `quote`.

    Returns (idx, start, end, kind) or None.  Used when a construal quote could
    sit in any of an agent's several reasoning blocks.
    """
    best = None
    best_len = 0
    for idx, text in candidates:
        span = find_span(quote, text, **kw)
        if span is None:
            continue
        length = span[1] - span[0]
        # Prefer an exact match, then the longest span.
        score = (1 if span[2] == "exact" else 0, length)
        if best is None or score > best_len:
            best = (idx, span[0], span[1], span[2])
            best_len = score
    return best
