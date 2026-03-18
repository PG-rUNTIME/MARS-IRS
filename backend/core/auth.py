from __future__ import annotations

from typing import Optional, Tuple

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import ApiToken, User


class ApiTokenAuthentication(BaseAuthentication):
    """
    Authenticate requests using `Authorization: Token <key>`.
    Sets `request.user` to `core.models.User`.
    """

    keyword = "Token"

    def authenticate(self, request) -> Optional[Tuple[User, ApiToken]]:
        auth = request.headers.get("Authorization", "")
        if not auth:
            return None
        try:
            keyword, key = auth.split(" ", 1)
        except ValueError:
            raise AuthenticationFailed("Invalid Authorization header.")
        if keyword != self.keyword or not key:
            return None

        key = key.strip()
        try:
            token = ApiToken.objects.select_related("user").get(key=key)
        except ApiToken.DoesNotExist:
            raise AuthenticationFailed("Invalid token.")

        token.last_used_at = timezone.now()
        token.save(update_fields=["last_used_at"])
        return (token.user, token)

