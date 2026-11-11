"""LLM adapter (TODO, spec §9.4 / §7.1).

Not wired yet: answers come from fixed templates (`fixed_questions.py`). When an LLM is added it
must (a) only see untrusted text inside a data block (see `prompt.untrusted_block`), (b) return
the structured AssistantAnswer JSON, (c) pass `verifier.verify` or the template answer is used, and
(d) time out after 8 seconds.
"""

from __future__ import annotations

LLM_TIMEOUT_SECONDS = 8


class LlmUnavailable(Exception):
    pass


async def write_answer(*_: object, **__: object) -> None:
    raise LlmUnavailable("LLM adapter not implemented; using template answers")
