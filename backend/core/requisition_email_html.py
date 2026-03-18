"""
HTML email body for internal requisition notifications (table layout).
"""
from __future__ import annotations

import html
from decimal import Decimal

from django.utils import timezone


def _fmt_money(amount, currency: str) -> str:
    try:
        d = Decimal(str(amount))
    except Exception:
        d = Decimal("0")
    return f"{currency} ${d:,.2f}"


def format_datetime_display(dt) -> str:
    if not dt:
        return "—"
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    dt = timezone.localtime(dt)
    return dt.strftime("%m/%d/%Y %I:%M:%S %p")


def awaiting_stage_token(role_or_label: str) -> str:
    """e.g. 'General Manager' -> 'AwaitingGeneralManagerApproval'."""
    safe = "".join(c for c in (role_or_label or "") if c.isalnum())
    return f"Awaiting{safe}Approval" if safe else "PendingAction"


def build_requisition_notification_html(
    req,
    headline: str,
    status_stage: str,
    login_url: str,
    system_name: str = "Internal Requisition System",
) -> tuple[str, str]:
    """
    Returns (plain_text, html_body).
    """
    requester = getattr(req, "requester", None)
    requested_by = html.escape(requester.name if requester else "—")
    req_no = html.escape(str(req.req_number or "—"))
    desc = html.escape((req.description or "").strip())
    just = (req.justification or "").strip()
    if desc and just:
        purpose_html = (
            desc
            + "<br/><br/><strong>Justification</strong><br/>"
            + html.escape(just).replace("\n", "<br/>")
        )
    elif desc:
        purpose_html = desc
    elif just:
        purpose_html = "<strong>Justification</strong><br/>" + html.escape(just).replace("\n", "<br/>")
    else:
        purpose_html = "—"

    ref_dt = req.submitted_at or req.created_at
    date_str = format_datetime_display(ref_dt)

    items = list(req.items.all()) if hasattr(req, "items") else []
    if not items:
        n_items = 1
        rows_html = (
            f"<tr><td>{html.escape((req.description or 'Line item')[:500])}</td>"
            f"<td style='text-align:right'>{_fmt_money(req.amount, req.currency)}</td>"
            f"<td style='text-align:center'>1</td>"
            f"<td style='text-align:right'>{_fmt_money(req.amount, req.currency)}</td></tr>"
        )
    else:
        n_items = len(items)
        parts = []
        for it in items:
            parts.append(
                f"<tr><td>{html.escape(it.description or '')}</td>"
                f"<td style='text-align:right'>{_fmt_money(it.unit_price, req.currency)}</td>"
                f"<td style='text-align:center'>{it.quantity}</td>"
                f"<td style='text-align:right'>{_fmt_money(it.line_total, req.currency)}</td></tr>"
            )
        rows_html = "".join(parts)

    total = _fmt_money(req.amount, req.currency)
    esc_head = html.escape(headline.strip())
    esc_stage = html.escape(status_stage.strip())
    esc_login = html.escape(login_url, quote=True)

    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.5;">
<p style="margin:0 0 12px;">{esc_head}</p>
<p style="margin:0 0 12px;">It is now <strong>{esc_stage}</strong>.</p>
<p style="margin:0 0 20px;">Please <a href="{login_url}" style="color:#b91c1c;font-weight:600;">log in here</a> to view more details.</p>
<p style="margin:0 0 8px;color:#64748b;font-size:12px;">{html.escape(system_name)}</p>
<table cellpadding="10" cellspacing="0" style="border-collapse:collapse;border:1px solid #cbd5e1;max-width:720px;width:100%;margin-bottom:20px;">
<tr style="background:#f8fafc;"><td style="border:1px solid #cbd5e1;width:220px;font-weight:600;">Internal Requisition Number</td><td style="border:1px solid #cbd5e1;">{req_no}</td></tr>
<tr><td style="border:1px solid #cbd5e1;font-weight:600;vertical-align:top;">Purpose</td><td style="border:1px solid #cbd5e1;">{purpose_html}</td></tr>
<tr style="background:#f8fafc;"><td style="border:1px solid #cbd5e1;font-weight:600;">Requested By</td><td style="border:1px solid #cbd5e1;">{requested_by}</td></tr>
<tr><td style="border:1px solid #cbd5e1;font-weight:600;">Date Requested</td><td style="border:1px solid #cbd5e1;">{html.escape(date_str)}</td></tr>
<tr style="background:#f8fafc;"><td style="border:1px solid #cbd5e1;font-weight:600;">Total Number Of Items</td><td style="border:1px solid #cbd5e1;">{n_items}</td></tr>
<tr><td style="border:1px solid #cbd5e1;font-weight:600;">Total Amount</td><td style="border:1px solid #cbd5e1;font-weight:600;">{html.escape(total)}</td></tr>
</table>
<p style="margin:16px 0 8px;font-weight:600;">List Of Items</p>
<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #cbd5e1;max-width:720px;width:100%;">
<tr style="background:#f1f5f9;font-weight:600;"><td style="border:1px solid #cbd5e1;">Description</td><td style="border:1px solid #cbd5e1;text-align:right;">Unit Price</td><td style="border:1px solid #cbd5e1;text-align:center;">Quantity</td><td style="border:1px solid #cbd5e1;text-align:right;">Amount</td></tr>
{rows_html}
</table>
</body>
</html>"""

    plain = (
        f"{headline}\n\nIt is now {status_stage}.\n\nLog in: {login_url}\n\n"
        f"Internal Requisition Number: {req.req_number}\n"
        f"Purpose: {(req.description or '')[:500]}\n"
        f"Requested By: {requester.name if requester else '—'}\n"
        f"Date Requested: {date_str}\n"
        f"Total Number Of Items: {n_items}\n"
        f"Total Amount: {total}\n"
    )
    return plain, html_body
