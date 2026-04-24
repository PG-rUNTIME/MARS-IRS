# Canonical MARS bases — keep in sync with `src/app/data/bases.ts`.

ORGANIZATION_BASES = (
    'Harare',
    'Bulawayo',
    'Gweru',
    'Masvingo',
    'Mutare',
    'Victoria Falls',
    'Marondera',
)

ORGANIZATION_BASES_SET = frozenset(ORGANIZATION_BASES)

DEFAULT_BASE = ORGANIZATION_BASES[0]


def normalize_base(raw: str) -> str | None:
    s = (raw or '').strip()
    if not s:
        return None
    if s in ORGANIZATION_BASES_SET:
        return s
    # common misspelling from older forms
    if s.lower() == 'bulwayo':
        return 'Bulawayo'
    return None


def resolve_base(raw: str) -> str:
    """Return a valid base; default to Harare if empty or unknown."""
    n = normalize_base(raw)
    return n if n else DEFAULT_BASE
