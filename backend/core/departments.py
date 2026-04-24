# Canonical organisation departments — keep in sync with `src/app/data/departments.ts`.

ORGANIZATION_DEPARTMENTS = (
    'Operations',
    'Finance',
    'Marketing',
    'Training',
    'Medical Stores',
    'Information Technology',
    'Medisport',
)

DEPARTMENT_COST_CENTRE = {
    'Operations': 'CC-OPS-001',
    'Finance': 'CC-FIN-001',
    'Marketing': 'CC-MKT-001',
    'Training': 'CC-TRN-001',
    'Medical Stores': 'CC-MS-001',
    'Information Technology': 'CC-IT-001',
    'Medisport': 'CC-MSP-001',
}

ORGANIZATION_DEPARTMENTS_SET = frozenset(DEPARTMENT_COST_CENTRE.keys())

LEGACY_DEPARTMENT_MAP = {
    'Logistics': 'Operations',
    'Human Resources': 'Training',
    'Administration': 'Finance',
    'Medical/Clinical': 'Medical Stores',
    'Management': 'Operations',
    'Compliance': 'Finance',
}


def resolve_department(raw: str) -> str | None:
    """Return a canonical department name, or None if unknown / empty."""
    s = (raw or '').strip()
    if not s:
        return None
    if s in ORGANIZATION_DEPARTMENTS_SET:
        return s
    return LEGACY_DEPARTMENT_MAP.get(s)


def default_department() -> str:
    return ORGANIZATION_DEPARTMENTS[0]


def cost_centre_for_department(department: str) -> str:
    d = resolve_department(department) or department
    return DEPARTMENT_COST_CENTRE.get(d, '')


def department_and_cost_centre_for_payload(raw: str) -> tuple[str, str]:
    """Resolve department from request or user profile; always pair with the canonical cost centre."""
    d = resolve_department(raw) or default_department()
    return d, DEPARTMENT_COST_CENTRE[d]
