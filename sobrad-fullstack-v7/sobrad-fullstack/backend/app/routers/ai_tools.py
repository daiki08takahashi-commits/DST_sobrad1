"""AI Study Tools: explain a concept, quiz me, flashcards, summarize notes,
build a study plan, explain a mistake, and suggest study techniques.

Client's request, verbatim: "The AI can explain concepts, quiz users,
generate flashcards, summarise notes, create study plans, explain mistakes,
suggest better learning techniques."

Same optional-AI, real-Anthropic-client pattern as chat.py (client
construction, ANTHROPIC_TIMEOUT_SECONDS, ANTHROPIC_MAX_RETRIES=0, broad
try/except around the whole call) -- see chat.py's _build_reply docstring
for the full rationale on the timeout/retry choices.

Where this differs from BOTH chat.py and study.py's /insights: those two
have an honest fallback that still makes sense with no AI at all -- chat.py
falls back to a canned "I'm here" line (plausible for a generic companion
chat), and /insights falls back to a deterministic sentence built directly
from real numbers it already computed. Neither trick works here: there is no
honest way to fake "explain photosynthesis" or "quiz me on the French
Revolution" without an actual model behind it. So every endpoint below
returns a uniform `{available: bool, ...}` shape instead of a fallback
value: `available: false` (with every other field absent/empty) whenever
ANTHROPIC_API_KEY isn't configured, the Anthropic call fails for any reason,
or (for the two JSON-structured tools) the model's response can't be parsed
as the JSON it was asked for -- a parse failure is treated exactly like an
API failure, never surfaced as a garbage/partial answer. The frontend shows
a calm, explanatory message in that case rather than an error page. No
endpoint here ever raises past a broad except -- a 500 is never an
acceptable outcome for "the AI tutor is asleep right now."
"""
import json
import logging
import os
import re
from typing import Any, List, Optional

from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.models import User
from app.schemas import (
    AIExplainMistakeRequest,
    AIExplainMistakeResponse,
    AIExplainRequest,
    AIExplainResponse,
    AIFlashcard,
    AIFlashcardsRequest,
    AIFlashcardsResponse,
    AIQuizQuestion,
    AIQuizRequest,
    AIQuizResponse,
    AIStudyPlanRequest,
    AIStudyPlanResponse,
    AIStudyTechniqueRequest,
    AIStudyTechniqueResponse,
    AISummarizeRequest,
    AISummarizeResponse,
)

router = APIRouter(prefix="/api/ai-tools", tags=["ai-tools"])

logger = logging.getLogger(__name__)

# Same default as chat.py's DEFAULT_CHAT_MODEL (Haiku: low cost, low
# latency), overridable independently of chat's model via
# SOBRAD_AI_TOOLS_MODEL -- see README.md.
DEFAULT_AI_TOOLS_MODEL = "claude-haiku-4-5"

# Same rationale as chat.py's ANTHROPIC_TIMEOUT_SECONDS/ANTHROPIC_MAX_RETRIES:
# a short timeout and no SDK-level retries, so a stalled/unreachable network
# still resolves quickly into the honest "unavailable" response instead of
# hanging the request.
ANTHROPIC_TIMEOUT_SECONDS = 10.0
ANTHROPIC_MAX_RETRIES = 0

TUTOR_PERSONA = """You are the AI Study Tools tutor inside the SÕBRAD app, a calm \
companion/study-support app used mostly by students aged roughly 14-30. You \
are knowledgeable, encouraging, clear, and patient -- never condescending, \
never sarcastic, never making the student feel bad for not knowing \
something or for getting something wrong. Explain things simply first, then \
add nuance if it helps. Keep the same warm, non-judgmental spirit as the \
rest of SÕBRAD: this is a place a student can ask an honest question \
without feeling small."""


def _extract_json(text: str) -> Any:
    """Parse `text` as JSON, tolerating a markdown code fence around it (the
    model is always told to reply with JSON only, but may wrap it in
    ```json ... ``` anyway despite that instruction). Raises ValueError /
    json.JSONDecodeError on anything that still isn't valid JSON -- callers
    treat that exactly like an API failure (see module docstring).
    """
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def _call_anthropic_text(system_prompt: str, user_content: str, max_tokens: int) -> Optional[str]:
    """Call the Anthropic API and return the reply text, or None on ANY
    problem at all (no key configured, network error, auth error, rate
    limit, timeout, empty/malformed response, ...). Never raises -- mirrors
    chat.py's _build_reply / study.py's _build_ai_insight_summary.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.info("ANTHROPIC_API_KEY not configured; AI study tools unavailable.")
        return None

    try:
        import anthropic

        model = os.environ.get("SOBRAD_AI_TOOLS_MODEL", DEFAULT_AI_TOOLS_MODEL)
        client = anthropic.Anthropic(
            api_key=api_key,
            timeout=ANTHROPIC_TIMEOUT_SECONDS,
            max_retries=ANTHROPIC_MAX_RETRIES,
        )
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        text = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        ).strip()
        if not text:
            raise ValueError("empty response from Anthropic API")
        return text
    except Exception:
        # Broad on purpose -- see module docstring. Any failure here must
        # silently degrade to `available: false`, never crash the request or
        # leak internal details to the user.
        logger.warning("Anthropic API call failed; AI study tools unavailable.", exc_info=True)
        return None


def _call_anthropic_json(system_prompt: str, user_content: str, max_tokens: int) -> Optional[Any]:
    """Same as `_call_anthropic_text`, but also parses the reply as JSON. A
    successful API call whose response isn't valid JSON is treated exactly
    like a failed API call -- returns None either way, never raises.
    """
    text = _call_anthropic_text(system_prompt, user_content, max_tokens)
    if text is None:
        return None
    try:
        return _extract_json(text)
    except (json.JSONDecodeError, ValueError):
        logger.warning(
            "Anthropic response for an AI study tool wasn't valid JSON; "
            "treating as unavailable rather than returning a partial/garbage answer."
        )
        return None


# ---------------------------------------------------------------------------
# Explain a concept
# ---------------------------------------------------------------------------

EXPLAIN_SYSTEM_PROMPT = TUTOR_PERSONA + """

The student will give you a topic, or a chunk of text they don't understand. \
Explain it in plain, encouraging language appropriate for a student: start \
with a simple, direct explanation of the core idea, then (only if it \
genuinely helps) a short example or analogy. Keep it focused -- a few short \
paragraphs at most, not an essay. Reply with plain text only, no JSON, no \
markdown headers."""


@router.post("/explain", response_model=AIExplainResponse)
def explain_concept(
    payload: AIExplainRequest,
    current_user: User = Depends(get_current_user),
):
    text = _call_anthropic_text(
        EXPLAIN_SYSTEM_PROMPT, payload.topic_or_text, max_tokens=700
    )
    if text is None:
        return AIExplainResponse(available=False)
    return AIExplainResponse(available=True, explanation=text)


# ---------------------------------------------------------------------------
# Quiz me
# ---------------------------------------------------------------------------

QUIZ_SYSTEM_PROMPT = TUTOR_PERSONA + """

The student will give you a topic, or a chunk of text to be quizzed on, \
plus how many questions they want. Write a short quiz mixing multiple-choice \
and short-answer questions as fits the material best. Respond with ONLY a \
single JSON object, no markdown code fences, no commentary before or after \
it, in exactly this shape:

{"questions": [{"question": "...", "choices": ["...", "..."] or null, "answer": "..."}]}

Rules: "choices" is a list of 3-5 short options for a multiple-choice \
question, or null/omitted for a short-answer question. "answer" is always \
the correct answer as plain text (for multiple choice, the exact text of \
the correct choice). Write exactly the number of questions asked for."""


@router.post("/quiz", response_model=AIQuizResponse)
def quiz_me(
    payload: AIQuizRequest,
    current_user: User = Depends(get_current_user),
):
    num_questions = payload.num_questions or 5
    user_content = (
        f"Topic/text: {payload.topic_or_text}\n"
        f"Number of questions: {num_questions}"
    )
    data = _call_anthropic_json(QUIZ_SYSTEM_PROMPT, user_content, max_tokens=1500)
    if data is None:
        return AIQuizResponse(available=False)

    try:
        raw_questions = data["questions"]
        questions: List[AIQuizQuestion] = []
        for q in raw_questions:
            choices = q.get("choices") or None
            if choices is not None:
                choices = [str(c) for c in choices]
            questions.append(
                AIQuizQuestion(
                    question=str(q["question"]).strip(),
                    choices=choices,
                    answer=str(q["answer"]).strip(),
                )
            )
        if not questions:
            raise ValueError("no questions in AI response")
    except (KeyError, TypeError, ValueError):
        # The API call and JSON parse both succeeded, but the JSON wasn't
        # shaped the way we asked for it -- still treated as "unavailable"
        # rather than returning a broken/partial quiz (see module docstring).
        logger.warning("AI quiz response was valid JSON but the wrong shape.")
        return AIQuizResponse(available=False)

    return AIQuizResponse(available=True, questions=questions)


# ---------------------------------------------------------------------------
# Flashcards
# ---------------------------------------------------------------------------

FLASHCARDS_SYSTEM_PROMPT = TUTOR_PERSONA + """

The student will give you a topic, or a chunk of text, plus how many \
flashcards they want. Write concise front/back study flashcards: the front \
is a short question or term, the back is a clear, concise answer or \
definition -- a couple of sentences at most, this is a flashcard, not an \
essay. Respond with ONLY a single JSON object, no markdown code fences, no \
commentary before or after it, in exactly this shape:

{"cards": [{"front": "...", "back": "..."}]}

Write exactly the number of cards asked for."""


@router.post("/flashcards", response_model=AIFlashcardsResponse)
def generate_flashcards(
    payload: AIFlashcardsRequest,
    current_user: User = Depends(get_current_user),
):
    num_cards = payload.num_cards or 8
    user_content = (
        f"Topic/text: {payload.topic_or_text}\n"
        f"Number of cards: {num_cards}"
    )
    data = _call_anthropic_json(FLASHCARDS_SYSTEM_PROMPT, user_content, max_tokens=1500)
    if data is None:
        return AIFlashcardsResponse(available=False)

    try:
        raw_cards = data["cards"]
        cards = [
            AIFlashcard(front=str(c["front"]).strip(), back=str(c["back"]).strip())
            for c in raw_cards
        ]
        if not cards:
            raise ValueError("no cards in AI response")
    except (KeyError, TypeError, ValueError):
        logger.warning("AI flashcards response was valid JSON but the wrong shape.")
        return AIFlashcardsResponse(available=False)

    return AIFlashcardsResponse(available=True, cards=cards)


# ---------------------------------------------------------------------------
# Summarize notes
# ---------------------------------------------------------------------------

SUMMARIZE_SYSTEM_PROMPT = TUTOR_PERSONA + """

The student will paste in notes or text. Write a clear, concise summary \
that captures the key points and structure, in plain prose (short \
paragraphs, or a short list if that reads better) -- shorter than the \
original, but keep anything that actually matters for studying from it. \
Reply with plain text only, no JSON, no markdown headers."""


@router.post("/summarize", response_model=AISummarizeResponse)
def summarize_notes(
    payload: AISummarizeRequest,
    current_user: User = Depends(get_current_user),
):
    text = _call_anthropic_text(SUMMARIZE_SYSTEM_PROMPT, payload.text, max_tokens=700)
    if text is None:
        return AISummarizeResponse(available=False)
    return AISummarizeResponse(available=True, summary=text)


# ---------------------------------------------------------------------------
# Study plan
# ---------------------------------------------------------------------------

STUDY_PLAN_SYSTEM_PROMPT = TUTOR_PERSONA + """

The student will give you a goal, and optionally a timeframe and a list of \
subjects. Write a short, realistic, encouraging study plan toward that \
goal: break it into a small number of concrete phases or steps (a short \
numbered/bulleted list reads best), each with roughly what to focus on and, \
if a timeframe was given, roughly when. Keep it achievable and specific to \
what the student told you -- don't pad it out with generic filler. Reply \
with plain text only, no JSON."""


@router.post("/study-plan", response_model=AIStudyPlanResponse)
def study_plan(
    payload: AIStudyPlanRequest,
    current_user: User = Depends(get_current_user),
):
    lines = [f"Goal: {payload.goal}"]
    if payload.timeframe:
        lines.append(f"Timeframe: {payload.timeframe}")
    if payload.subjects:
        lines.append(f"Subjects involved: {', '.join(payload.subjects)}")
    user_content = "\n".join(lines)

    text = _call_anthropic_text(STUDY_PLAN_SYSTEM_PROMPT, user_content, max_tokens=700)
    if text is None:
        return AIStudyPlanResponse(available=False)
    return AIStudyPlanResponse(available=True, plan=text)


# ---------------------------------------------------------------------------
# Explain a mistake
# ---------------------------------------------------------------------------

EXPLAIN_MISTAKE_SYSTEM_PROMPT = TUTOR_PERSONA + """

The student will give you a question, the wrong answer they gave, and \
optionally the correct answer. Gently explain why that answer is a common \
or understandable mistake to make, walk through the correct way to think \
about the question, and end with something encouraging -- this must never \
read as scolding or as making the student feel bad for getting it wrong. \
If they didn't give you the correct answer, work it out yourself and \
explain it. Reply with plain text only, a few short paragraphs at most."""


@router.post("/explain-mistake", response_model=AIExplainMistakeResponse)
def explain_mistake(
    payload: AIExplainMistakeRequest,
    current_user: User = Depends(get_current_user),
):
    lines = [
        f"Question: {payload.question}",
        f"Student's answer: {payload.wrong_answer}",
    ]
    if payload.correct_answer:
        lines.append(f"Correct answer: {payload.correct_answer}")
    user_content = "\n".join(lines)

    text = _call_anthropic_text(EXPLAIN_MISTAKE_SYSTEM_PROMPT, user_content, max_tokens=600)
    if text is None:
        return AIExplainMistakeResponse(available=False)
    return AIExplainMistakeResponse(available=True, explanation=text)


# ---------------------------------------------------------------------------
# Study technique suggestions
# ---------------------------------------------------------------------------

STUDY_TECHNIQUE_SYSTEM_PROMPT = TUTOR_PERSONA + """

The student will optionally give you a subject and/or a challenge they're \
having (e.g. "I keep forgetting things by test day" or "I get distracted \
easily"). Suggest 2-3 concrete, actionable learning techniques relevant to \
what they described (e.g. spaced repetition, active recall, the Pomodoro \
technique, interleaving, teaching it back to someone) -- specific and \
practical, not a generic listicle, and tailored to what they told you if \
they told you anything. If they gave you nothing at all, suggest 2-3 solid \
general-purpose techniques. Respond with ONLY a single JSON object, no \
markdown code fences, no commentary before or after it, in exactly this \
shape:

{"techniques": ["...", "...", "..."]}

Each string should be a short paragraph: name the technique, then 1-2 \
sentences on how to apply it to what the student described."""


@router.post("/study-technique", response_model=AIStudyTechniqueResponse)
def study_technique(
    payload: AIStudyTechniqueRequest,
    current_user: User = Depends(get_current_user),
):
    lines = []
    if payload.subject:
        lines.append(f"Subject: {payload.subject}")
    if payload.challenge:
        lines.append(f"Challenge: {payload.challenge}")
    user_content = "\n".join(lines) if lines else "(No specific subject or challenge given.)"

    data = _call_anthropic_json(STUDY_TECHNIQUE_SYSTEM_PROMPT, user_content, max_tokens=700)
    if data is None:
        return AIStudyTechniqueResponse(available=False)

    try:
        techniques = [str(t).strip() for t in data["techniques"]]
        techniques = [t for t in techniques if t]
        if not techniques:
            raise ValueError("no techniques in AI response")
    except (KeyError, TypeError, ValueError):
        logger.warning("AI study-technique response was valid JSON but the wrong shape.")
        return AIStudyTechniqueResponse(available=False)

    return AIStudyTechniqueResponse(available=True, techniques=techniques)
