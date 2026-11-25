# ScholarsMate

Research assistant: FastAPI + SQLAlchemy (SQLite) + Chroma backend, React 19 + Vite frontend, LLMs through LiteLLM.
Active plan: `context/ScholarMatePlan.md`. Run one wave at a time and read only that wave's section.

## Commands (run from repo root unless noted)

- Backend tests: `.venv/Scripts/python.exe -m pytest backend/tests -q -p no:cacheprovider` (about 80 s)
- Backend dev server: `.venv/Scripts/python.exe -m uvicorn backend.api.main:app --port 8000 --reload --reload-dir backend`. The repo lives in OneDrive and `--reload` often misses edits, so restart the server after backend changes. Check `/openapi.json` for the new routes or fields.
- Frontend dev server (`frontend/`): `npm run dev` (port 5173, the only CORS origin the backend allows)
- Frontend lint (`frontend/`): `npm run lint`
- Frontend build (`frontend/`): `npm run build`
- Frontend unit tests: `node --test "frontend/src/utils/*.test.js" "frontend/src/components/library/*.test.js"` (Node 22 needs the glob form; a bare directory fails)

## Baseline (2026-11-25, before the plan)

- pytest: 4 failed, 100 passed. These are known failures. Anything else that fails is new.
  - `test_latex_compiler.py::test_tectonic_pdf_compilation` and `::test_tectonic_pdf_compilation_with_math_and_matrix` (UnboundLocalError `shutil`)
  - `test_rag.py::test_retrieve_skips_search_for_conversational_plan` (`expand_query` called for "thanks")
  - `test_router_and_quality.py::test_sanitize_plan_routing` (`NEW_QUERY` != `GENERAL_KNOWLEDGE`)
- Lint: 219 problems (211 errors, 8 warnings), all pre-existing. "Lint passes" means a touched file has no more errors than it started with. Check with `npx eslint <file>`.
- Build: passes (chunk-size warning only).

## Layout

- `backend/api/main.py`: every route (query :816, editor drafts :2057, workspaces :1187–1879, library :2567+). Auth dependency is `get_current_user` in `backend/api/auth.py`.
- `backend/api/schemas.py`: Pydantic models. `backend/db/{models,crud,session}.py`: ORM, queries, schema setup.
- `backend/rag/generator.py` (`generate_answer`) and `backend/rag/modes.py` (Paper `assistant` / `general` modes).
- `backend/guardrails/`: input, retrieval and output rails, plus `pipeline.py` wrappers.
- `frontend/src/App.jsx`: routing (`chat`, `library`, `home`) and the split panel. `frontend/src/services/api.js`: the axios client.
- `frontend/src/components/{chat,writer,library,home,modals,layout,common}/`.

## Rules

- Every route uses `Depends(get_current_user)` and filters every query by `user_id`. Return 404 for another user's rows, not 403.
- New tables come from `create_all` (`backend/db/session.py:47`). New columns on existing tables use the hand-written ALTER pattern at `session.py:57`. There is no Alembic.
- Blocking work inside an `async def` route goes through `await asyncio.to_thread(...)`, which is the pattern `main.py` already uses.
- The writer is `contentEditable` + `document.execCommand`. Don't introduce TipTap or Lexical.
- Chat is not streamed. `/query` returns one JSON answer after the output rails run.
- Never read `.venv`, `node_modules`, `dist`, `chroma_db`, `data` or `scholarsmate.db`.
- Read `LibraryView.jsx` (2.3k lines), `DocumentWriter.jsx` (1.9k), `ChatInput.jsx` (1.3k), `App.jsx` (1.2k) and `main.py` by line range. Grep for the symbol first.
- Mark deliberate shortcuts with `ponytail:` comments naming the ceiling and the upgrade path.
- Commit only when the user asks.
