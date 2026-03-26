from __future__ import annotations

from rest_framework.permissions import BasePermission


def _roles(request) -> list[str]:
    user = getattr(request, "user", None)
    if not user or not getattr(user, "id", None):
        return []
    # `core.User` has related roles in `UserRole`
    return list(user.roles.values_list("role", flat=True))


class HasRole(BasePermission):
    required_roles: tuple[str, ...] = ()

    def has_permission(self, request, view) -> bool:
        roles = _roles(request)
        return any(r in roles for r in self.required_roles)


class IsSystemAdministrator(HasRole):
    required_roles = ("System Administrator",)


class IsAuditorOrFinancialController(HasRole):
    required_roles = ("Auditor", "Financial Controller")


class IsProcurementClerk(HasRole):
    required_roles = ("Procurement Clerk",)


class IsRequester(HasRole):
    required_roles = ("Requester",)


class IsRequesterOrProcurementClerk(HasRole):
    required_roles = ("Requester", "Procurement Clerk")

