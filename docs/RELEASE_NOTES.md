# MARS IRS Release Notes

This file tracks notable system changes by release date for backend, frontend, and operational docs.

---

## 2026-03-26

### Added

- **Annual Budget Management**
  - Introduced department annual budget configuration (USD and ZIG).
  - Added Budget Setup UI for Financial Controller.
  - Added Budget Stats UI for Department Manager, Accountant, General Manager, and Financial Controller.
  - Added backend endpoints:
    - `GET /api/budgets/?year=YYYY`
    - `POST /api/budgets/`
    - `GET /api/budgets/stats/?year=YYYY`

- **Budget Analytics**
  - Added per-department and organisation-level utilization stats.
  - Added monthly consumption trend data (USD and ZIG) and chart visualization.
  - Added utilization alerts at thresholds:
    - warning at `>=80%`
    - critical at `>=90%`

### Changed

- **Finance Payment Processing**
  - Updated payment processing so any finance-team member can upload Proof of Payment (POP) for requisitions in `Pending Payment`.
  - Finance team roles for POP/payment actions:
    - `Accountant`
    - `Financial Controller`
    - `General Manager`
  - Added backend enforcement for finance-only payment-state mutations.
  - Updated requisition detail UI copy to reflect finance-team ownership of payment stage.
  - Added POP uploader role badge in requisition detail for clearer audit visibility.

- **Audit Trail Filtering**
  - Fixed action filter behavior for non-requisition actions (for example `Login`).
  - Audit Trail now uses:
    - requisition-summary endpoint for requisition-linked activity,
    - detailed audit endpoint for non-requisition activity rows.

- **Budget Setup Usability**
  - Department field changed from free-text input to dropdown selection.
  - Dropdown options sourced from existing departments (users + configured budgets).

### Fixed

- **Backend startup / 502 login issue**
  - Resolved migration dependency causing backend crash loop:
    - `core.0013_department_budget` dependency corrected to existing migration parent.

### Documentation

- Updated:
  - `docs/POSTMAN.md`
  - `docs/ARCHITECTURE.md`
  - `docs/PRODUCTION.md`
  - `README.md`

---

## Template for future entries

```md
## YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Documentation
- ...
```

