"""
Outbound transactional email for SOBRAD -- currently just the family-sharing
invite (see routers/family.py). Sent via Resend's HTTP API
(https://resend.com), a simple email-sending service with a shared test
sending domain (onboarding@resend.dev) that needs zero domain setup to try.

This is a DIFFERENT fallback pattern from the AI features (chat.py,
routers/ai_tools.py, routers/study.py's insights): those are optional
enhancements that honestly report `available: false` when no
ANTHROPIC_API_KEY is configured, because there's no honest substitute for a
real AI reply. Sending the family-sharing invite email, on the other hand,
is the whole point of that feature -- the caller is asking for a real,
required, user-facing side effect, so silently reporting "unavailable" would
just break the feature for every local/dev environment and for the client's
own deployment until she signs up for Resend.

So instead: with no RESEND_API_KEY set (the case in local testing, and
possibly in production until the client sets the env var on Render), this
module does NOT fail -- it logs a clearly-marked dev-mode line to the
console with the join_url and to_email, and returns normally (success). Once
RESEND_API_KEY is set (e.g. as a Render environment variable), real emails
go out automatically the very next call and this dev-mode branch simply
stops being hit -- no code change needed to "turn on" real sending.
"""
import logging
import os

import httpx

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_FROM_EMAIL = "SÕBRAD <onboarding@resend.dev>"
REQUEST_TIMEOUT_SECONDS = 10.0


class EmailSendError(Exception):
    """Raised when a real send (RESEND_API_KEY is set) fails for any reason
    -- a non-2xx response from Resend, a network error, or a timeout. The
    message on this exception is short and human-readable, safe to show to
    an end user as-is (the real API error, if any, is only printed server-
    side for debugging -- never included in this message).
    """


def _invite_email_html(child_username: str, join_url: str) -> str:
    """Short, warm, on-brand HTML email body. SOBRAD is a calm, gentle
    mental-wellness app for students -- the tone here matches that: quiet,
    reassuring, no urgency/pressure language.
    """
    return f"""\
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', \
Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; \
padding: 32px 24px; color: #2d2a4a;">
  <p style="font-size: 20px; font-weight: 600; margin: 0 0 16px;">SÕBRAD</p>
  <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
    Hi there,
  </p>
  <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
    <strong>{child_username}</strong> uses SÕBRAD, a calm companion app for
    school and wellbeing, and would like to share their study progress with
    you -- subject averages, trends, and a gentle progress summary. Nothing
    else on their account is shared; their journal and chats stay
    completely private.
  </p>
  <p style="margin: 24px 0;">
    <a href="{join_url}" style="display: inline-block; background: #6c63ff; \
color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: \
8px; font-size: 15px; font-weight: 600;">
      View {child_username}'s study progress
    </a>
  </p>
  <p style="font-size: 13px; line-height: 1.6; color: #6b6885; margin: \
24px 0 0;">
    If the button above doesn't work, copy and paste this link into your \
browser:<br>
    <a href="{join_url}" style="color: #6c63ff;">{join_url}</a>
  </p>
  <p style="font-size: 13px; line-height: 1.6; color: #6b6885; margin: \
24px 0 0;">
    If you weren't expecting this, you can safely ignore this email.
  </p>
</div>
"""


def send_family_invite_email(to_email: str, child_username: str, join_url: str) -> None:
    api_key = os.environ.get("RESEND_API_KEY")
    from_email = os.environ.get("RESEND_FROM_EMAIL", DEFAULT_FROM_EMAIL)

    if not api_key:
        # Deliberate dev-mode fallback -- see module docstring. Not an
        # error: the caller should treat this as a normal, successful send.
        print(
            f"[email-service] DEV MODE (no RESEND_API_KEY set) — would send "
            f"invite to {to_email}: {join_url}"
        )
        return

    try:
        response = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "from": from_email,
                "to": [to_email],
                "subject": f"{child_username} wants to share their study progress with you",
                "html": _invite_email_html(child_username, join_url),
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        if response.status_code >= 300:
            # Real error body is only printed server-side -- never leaked to
            # the caller-facing exception message.
            print(
                f"[email-service] Resend API error {response.status_code}: "
                f"{response.text}"
            )
            raise EmailSendError(
                "Couldn't send the invite email right now. Please try again in a moment."
            )
    except EmailSendError:
        raise
    except Exception as exc:
        # Network error, timeout, etc.
        print(f"[email-service] Failed to send invite email: {exc!r}")
        raise EmailSendError(
            "Couldn't send the invite email right now. Please try again in a moment."
        )
