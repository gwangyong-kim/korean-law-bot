# Phase 4: Conversation Persistence Stabilization - Discussion Log

> **Audit trail only.**

**Date:** 2026-04-13
**Mode:** Claude's discretion (user delegated)

All decisions auto-resolved by Claude based on:
- REQUIREMENTS.md PERS-01~04
- Phase 1 COMPAT decisions (read-time migration)
- AI SDK 6 constraints (ChatInit.messages research-required)
- Drop-first candidate status (safety floor from Phase 1)

See `04-CONTEXT.md` decisions D-01 through D-10.

## Key judgments

- **Schema upgrade with backward-read**: new saves always parts, old reads auto-convert
- **sanitizePartsForStorage lives in ui-message-parts.ts**: single source of truth (Phase 1 principle)
- **React key-based remount for reseed**: simplest reliable pattern for useChat({id, messages})
- **Gemini thought_signature preservation**: non-negotiable (providerMetadata MUST NOT be dropped)
- **Atomicity via status gating**: already exists from Phase 1, strengthened explicitly

## Research requirements (flagged in ROADMAP)

- ChatInit.messages API shape — LOW confidence, requires Context7 check
- vercel/ai #8061, #9731 — roundtrip bug status

## Drop strategy

Phase 4 is drop-first. If scope tightens:
- Phase 1 COMPAT provides safety floor (old flat messages still render)
- Phase 4 skipping loses: (a) new tool-call trace rendering in history (b) save sync with parts
- Acceptable regression per ROADMAP Phase 4 drop_criteria

## Anti-decisions

- No server DB (v2 V2-PERS)
- No schema versioning / migration versioning
- No manual "Clear old data" UI — backward read handles it transparently
