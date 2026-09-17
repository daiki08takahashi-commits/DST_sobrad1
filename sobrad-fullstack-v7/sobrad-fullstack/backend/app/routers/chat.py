import logging
import os
import random
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import ChatMessage, User
from app.schemas import ChatClearOut, ChatExchangeOut, ChatMessageCreate, ChatMessageOut

router = APIRouter(prefix="/api/chat", tags=["chat"])

logger = logging.getLogger(__name__)

# The only valid companion threads -- each is now its own independent
# conversation with its own history (see models.py's ChatMessage.companion).
# An invalid value is a 400, not a silent fallback to "sobrad" -- unlike
# settings.py's PATCH /api/settings/accessibility (which is phasing out
# User.companion as a chat-flow input), the frontend here always knows
# exactly which thread it's operating on, so a wrong value indicates a real
# bug worth surfacing rather than papering over.
VALID_COMPANIONS = ("sobrad", "friends")


def _validate_companion(companion: str) -> None:
    if companion not in VALID_COMPANIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"companion must be one of {VALID_COMPANIONS}",
        )

# Fixed, calm, generic, non-clinical companion replies. Used whenever real
# AI replies aren't available -- no ANTHROPIC_API_KEY configured, or the
# Anthropic API call fails for any reason (network error, auth error, rate
# limit, timeout, ...). This is the original, always-on prototype behavior
# and must keep working unchanged as a fallback -- most deployments of this
# app (including the client's, until she sets up billing) will be running
# with no key configured at all.
SOBRAD_REPLIES = [
    "That sounds like a lot to carry.",
    "Thank you for telling me.",
    "You don't have to have the right words for it.",
    "I'm here, take your time.",
    "One step is enough for today.",
]

# Default model: Claude Haiku, chosen for low per-message cost and low
# latency, which fits a lightweight chat companion feature. Overridable via
# SOBRAD_CHAT_MODEL (e.g. to a Sonnet model) for higher-quality replies at a
# higher per-message cost -- see README.md.
DEFAULT_CHAT_MODEL = "claude-haiku-4-5"

# Keep replies short, in keeping with the existing canned replies (each is a
# single short sentence) -- this is a calm, brief-reply companion, not a
# long-form chatbot.
MAX_REPLY_TOKENS = 300

# How many prior messages (both sides of the conversation) to send as context
# for the new reply. Recent history only -- enough for the reply to feel
# continuous without the request growing unbounded as a conversation gets
# long.
HISTORY_CONTEXT_LIMIT = 20

# Anthropic's default client timeout is 10 minutes (see anthropic._constants.
# DEFAULT_TIMEOUT), which is far too long for a synchronous chat request --
# if the outbound network hangs (proxy hiccup, DNS issue, a firewall
# silently dropping packets, etc.) rather than raising an error, the request
# would otherwise hang for up to 10 minutes with the user's "Send" button
# stuck, instead of falling back to a canned reply. 10 seconds is short
# enough that a stalled call still resolves quickly, but long enough not to
# needlessly kill a normal, slightly-slow real API call.
ANTHROPIC_TIMEOUT_SECONDS = 10.0

# The Anthropic SDK retries failed requests (including ones that time out)
# up to `max_retries` times by default (2 -> 3 attempts total), which would
# multiply a stalled request's wall-clock time to ~3x ANTHROPIC_TIMEOUT_SECONDS
# before falling back. That defeats the point of a short timeout here: this
# feature already has a graceful, instant fallback (the canned replies), so
# there's no benefit to retrying a slow/unreachable network before using it --
# only added latency. Disable retries so a stall resolves in one timeout
# window, not several.
ANTHROPIC_MAX_RETRIES = 0

# Companion persona names, keyed by the `User.companion` column value.
# Any value other than "friends" (including "sobrad", missing, or an
# unrecognized string) falls back to the "sobrad" persona -- same default
# as the DB column itself.
_COMPANION_PERSONA_NAMES = {
    "sobrad": "Sõbrad",
    "friends": "Friends",
}


def _build_system_prompt(companion: str) -> str:
    """Build the Anthropic system prompt for the given companion persona.

    Only the persona's name -- and a light touch of tone for "friends",
    which is meant to read a bit more casual/buddy-like -- differs between
    personas. The "Who you are" / "Who you are NOT" / Safety / closing
    instructions apply equally to both and are shared verbatim, word for
    word, regardless of which persona is selected.
    """
    persona_name = _COMPANION_PERSONA_NAMES.get(companion, _COMPANION_PERSONA_NAMES["sobrad"])
    tone_note = (
        " You're a bit more casual and buddy-like than a typical companion app --"
        " think a good friend checking in, not a formal presence."
        if companion == "friends"
        else ""
    )

    return f"""You are "{persona_name}," a warm, calm companion inside the SOBRAD app. \
SOBRAD is used by young people (roughly age 14-30) who are going through \
trauma or a hard emotional stretch, and are looking for a steady, gentle \
presence to talk to.

Who you are: warm, calm, and genuinely present.{tone_note} You validate what the person \
is feeling without being falsely cheerful, dismissive, or clinical. You keep \
replies short, gentle, and conversational -- usually just a sentence or two, \
in the same spirit as lines like "That sounds like a lot to carry," "Thank \
you for telling me," or "You don't have to have the right words for it." \
Let the person lead; you're there to sit with them in it, not to fix, \
lecture, or fill silence.

Who you are NOT: you are not a therapist, counselor, doctor, or any kind of \
medical or crisis service, and you must never claim to be one or attempt to \
diagnose or treat anything. You're a companion, not a clinician.

Safety is the one place you must be direct rather than purely conversational: \
if anything in the person's message suggests suicidal thoughts, self-harm, or \
that they may be in immediate danger, respond with warmth first, but be clear \
and direct about pointing them toward real help right now rather than trying \
to talk them through it yourself. In that case, mention SOBRAD's own \
Emergency screen/help resources in the app, and that in the US and Canada, \
988 (the Suicide & Crisis Lifeline) can be reached right now by call or text. \
Say this plainly and caringly -- don't bury it, soften it into vagueness, or \
try to continue the conversation as if it were an ordinary check-in.

Outside of that situation, just be present: brief, warm, and human."""


def _build_reply(
    current_user: User,
    incoming_text: str,
    db: Session,
    exclude_message_id: int,
    companion: str,
) -> str:
    """Return the assistant's reply text for a new incoming message.

    Tries the real Anthropic API first (only if an API key is configured);
    falls back to the original random canned reply on any problem at all --
    missing key, network error, auth error, rate limit, timeout, unexpected
    response shape, etc. The fallback is intentionally indistinguishable, to
    the user, from today's normal (no-AI) behavior.

    `companion` is the companion thread from the request payload (already
    validated by the caller) -- Sõbrad and Friends are separate
    conversations with independent histories, so both the history query
    below and the system prompt are scoped to this companion only.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning(
            "ANTHROPIC_API_KEY not configured; falling back to canned chat replies."
        )
        return random.choice(SOBRAD_REPLIES)

    try:
        import anthropic

        model = os.environ.get("SOBRAD_CHAT_MODEL", DEFAULT_CHAT_MODEL)

        # Same query as get_chat_history, minus the new incoming message
        # itself (it's already been persisted as a ChatMessage row by the
        # time this runs, so it must be excluded here -- it's added back
        # explicitly, as the latest turn, below). Scoped to this companion's
        # thread only, so Sõbrad's and Friends' conversations never leak
        # into each other's context window.
        history = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.user_id == current_user.id,
                ChatMessage.companion == companion,
                ChatMessage.id != exclude_message_id,
            )
            .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
            .all()
        )
        # Only the most recent messages are needed for conversational
        # context; the new incoming message is appended separately below.
        recent_history = history[-HISTORY_CONTEXT_LIMIT:]

        messages = [
            {
                "role": "user" if m.sender == "user" else "assistant",
                "content": m.text,
            }
            for m in recent_history
        ]
        messages.append({"role": "user", "content": incoming_text})

        client = anthropic.Anthropic(
            api_key=api_key,
            timeout=ANTHROPIC_TIMEOUT_SECONDS,
            max_retries=ANTHROPIC_MAX_RETRIES,
        )
        response = client.messages.create(
            model=model,
            max_tokens=MAX_REPLY_TOKENS,
            system=_build_system_prompt(companion),
            messages=messages,
        )
        reply_text = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        ).strip()
        if not reply_text:
            raise ValueError("empty response from Anthropic API")
        return reply_text
    except Exception:
        # Broad on purpose: any failure of the real-AI path (network,
        # auth, rate limit, timeout, malformed response, ...) must never
        # crash the request or leak internal details to the user -- it
        # should look exactly like ordinary canned-reply operation.
        logger.warning(
            "Anthropic API call failed; falling back to canned chat reply.",
            exc_info=True,
        )
        return random.choice(SOBRAD_REPLIES)


@router.post("", response_model=ChatExchangeOut, status_code=status.HTTP_201_CREATED)
def send_chat_message(
    payload: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validate_companion(payload.companion)

    user_message = ChatMessage(
        user_id=current_user.id,
        sender="user",
        text=payload.message,
        companion=payload.companion,
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    reply_text = _build_reply(
        current_user, payload.message, db, user_message.id, payload.companion
    )
    reply = ChatMessage(
        user_id=current_user.id,
        sender="sobrad",
        text=reply_text,
        companion=payload.companion,
    )
    db.add(reply)
    db.commit()
    db.refresh(reply)

    return ChatExchangeOut(
        user_message=ChatMessageOut(
            id=user_message.id,
            sender=user_message.sender,
            text=user_message.text,
            created_at=user_message.created_at,
        ),
        reply=ChatMessageOut(
            id=reply.id, sender=reply.sender, text=reply.text, created_at=reply.created_at
        ),
    )


@router.get("", response_model=List[ChatMessageOut])
def get_chat_history(
    companion: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validate_companion(companion)

    messages = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.user_id == current_user.id,
            ChatMessage.companion == companion,
        )
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        .all()
    )
    return messages


@router.delete("", response_model=ChatClearOut)
def clear_chat_history(
    companion: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validate_companion(companion)

    # Permanent, single-thread delete -- this is the "start fresh" /
    # "I don't want to remember this" control on the Chat screen, scoped to
    # just the companion thread that was open, not a per-message delete, so
    # it's a single bulk delete (filtered to this companion) rather than a
    # loop.
    db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.companion == companion,
    ).delete(synchronize_session=False)
    db.commit()
    return ChatClearOut(deleted=True)
