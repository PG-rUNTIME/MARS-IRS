"""
SMTP configuration stored in a JSON file (admin-configured).
Used to send notification emails when configured; otherwise in-app only.
"""
import json
from pathlib import Path

CONFIG_FILE = Path(__file__).resolve().parent / 'smtp_config.json'


def get_smtp_config():
    """Return current SMTP config dict or None if not configured. Password included for sending."""
    if not CONFIG_FILE.exists():
        return None
    try:
        with open(CONFIG_FILE, 'r') as f:
            data = json.load(f)
        if not data.get('host'):
            return None
        return data
    except (json.JSONDecodeError, OSError):
        return None


def get_smtp_config_public():
    """Return config for API display: no password, plus configured=True/False."""
    config = get_smtp_config()
    if not config:
        return {'configured': False}
    return {
        'configured': True,
        'host': config.get('host', ''),
        'port': config.get('port', 587),
        'username': config.get('username', ''),
        'from_email': config.get('from_email', ''),
        'use_tls': config.get('use_tls', True),
    }


def save_smtp_config(host, port=587, username='', password='', from_email='', use_tls=True):
    """Save SMTP config to file. Create parent dirs if needed."""
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = {
        'host': (host or '').strip(),
        'port': int(port) if port is not None else 587,
        'username': (username or '').strip(),
        'password': (password or '').strip(),
        'from_email': (from_email or '').strip(),
        'use_tls': bool(use_tls),
    }
    with open(CONFIG_FILE, 'w') as f:
        json.dump(data, f, indent=2)
    return data
