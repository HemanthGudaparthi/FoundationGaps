"""
contextlens_agents.py

Claude Agent SDK-style agent definitions for ContextLens — a desktop
Electron + React application for annotating videos with keyword detection,
sticky notes, understanding gap bars, and attached research materials.

Architecture
------------
Six specialist agents coordinate through a PM orchestrator:

    PMAgent (orchestrator)
        ├── LeadDevAgent       (architecture gatekeeper + PR review)
        ├── FrontendDevAgent   (React renderer, video UI)
        ├── BackendCoreAgent   (Electron main process, SQLite, IPC)
        ├── QAAgent            (test generation + coverage analysis)
        └── ResearchAgent      (keyword lookup, arXiv, beginner summaries)

Pseudo-SDK conventions
-----------------------
- @agent(name, role) — registers the class in the global AGENT_REGISTRY
- AgentBase.run(input: AgentInput) -> AgentOutput — the single entry point
- handoff_to(agent_name, payload) — spawns a sub-agent and returns its output
- tools are declared as a class-level list; each tool is a ToolDef dataclass

Usage
------
    from contextlens_agents import run_project_loop, AGENT_REGISTRY
    run_project_loop(sprint_number=1, backlog=my_backlog)
"""

from __future__ import annotations

import functools
import json
import textwrap
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Optional


# ─────────────────────────────────────────────────────────────────────────────
# SDK primitives
# ─────────────────────────────────────────────────────────────────────────────

AGENT_REGISTRY: dict[str, "AgentBase"] = {}


@dataclass
class ToolDef:
    """
    Declares a capability an agent may invoke at runtime.

    Attributes
    ----------
    name        : Canonical tool identifier used in system prompts.
    description : One-sentence description surfaced to the LLM.
    parameters  : JSON-Schema-style dict describing accepted arguments.
    handler     : Optional Python callable (used in local/test mode).
    """

    name: str
    description: str
    parameters: dict[str, Any] = field(default_factory=dict)
    handler: Optional[Callable[..., Any]] = None


@dataclass
class AgentInput:
    """
    Standardised envelope passed to every agent's run() method.

    Attributes
    ----------
    task        : Short imperative statement of what the agent must do.
    context     : Arbitrary structured data the caller provides
                  (sprint state, file diffs, feature spec, etc.).
    sender      : Name of the calling agent (or "orchestrator").
    thread_id   : Shared conversation thread identifier for multi-turn work.
    """

    task: str
    context: dict[str, Any] = field(default_factory=dict)
    sender: str = "orchestrator"
    thread_id: str = ""


@dataclass
class AgentOutput:
    """
    Standardised envelope returned by every agent's run() method.

    Attributes
    ----------
    agent       : Name of the agent that produced this output.
    status      : "success" | "blocked" | "needs_review" | "error"
    summary     : One-paragraph human-readable result.
    artifacts   : Named output objects (code files, test reports, etc.).
    handoffs    : List of (agent_name, AgentInput) pairs to fan out next.
    metadata    : Arbitrary key/value bag (timestamps, token counts, etc.).
    """

    agent: str
    status: str
    summary: str
    artifacts: dict[str, Any] = field(default_factory=dict)
    handoffs: list[tuple[str, AgentInput]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


def agent(name: str, role: str) -> Callable:
    """
    Class decorator that registers an AgentBase subclass in AGENT_REGISTRY.

    Parameters
    ----------
    name : Registry key and agent display name.
    role : Short human-readable role description.
    """

    def decorator(cls: type) -> type:
        cls.agent_name = name
        cls.agent_role = role
        instance = cls()
        AGENT_REGISTRY[name] = instance
        return cls

    return decorator


class AgentBase:
    """
    Base class for all ContextLens agents.

    Subclasses must define:
        system_prompt : str
        tools         : list[ToolDef]

    And override:
        run(input: AgentInput) -> AgentOutput
    """

    agent_name: str = "base"
    agent_role: str = "base"
    system_prompt: str = ""
    tools: list[ToolDef] = []

    def run(self, input: AgentInput) -> AgentOutput:
        raise NotImplementedError

    def handoff_to(self, agent_name: str, payload: AgentInput) -> AgentOutput:
        """
        Synchronously spawn a registered agent and return its output.
        In production this would be an async SDK call; here it is direct.
        """
        target = AGENT_REGISTRY.get(agent_name)
        if target is None:
            return AgentOutput(
                agent=self.agent_name,
                status="error",
                summary=f"Unknown agent: {agent_name}",
            )
        return target.run(payload)

    def _ts(self) -> str:
        return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# Shared tool definitions
# ─────────────────────────────────────────────────────────────────────────────

TOOL_READ_FILE = ToolDef(
    name="read_file",
    description=(
        "Read the full text content of a file in the ContextLens repository "
        "given its path relative to the project root."
    ),
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Relative file path, e.g. src/renderer/VideoPlayer.tsx"}
        },
        "required": ["path"],
    },
)

TOOL_WRITE_FILE = ToolDef(
    name="write_file",
    description=(
        "Write or overwrite a file in the ContextLens repository. "
        "Creates parent directories if they do not exist."
    ),
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string"},
            "content": {"type": "string", "description": "Full UTF-8 file content"},
        },
        "required": ["path", "content"],
    },
)

TOOL_BASH = ToolDef(
    name="bash",
    description=(
        "Execute a shell command inside the ContextLens project directory. "
        "Use for running tests, linting, building, or querying git."
    ),
    parameters={
        "type": "object",
        "properties": {
            "command": {"type": "string"},
            "timeout_seconds": {"type": "integer", "default": 60},
        },
        "required": ["command"],
    },
)

TOOL_WEB_SEARCH = ToolDef(
    name="web_search",
    description=(
        "Search the public web and return ranked snippets. "
        "Use for finding documentation, arXiv papers, or Wikipedia articles."
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "num_results": {"type": "integer", "default": 5},
        },
        "required": ["query"],
    },
)

TOOL_FETCH_URL = ToolDef(
    name="fetch_url",
    description="Fetch the raw HTML or JSON content of a URL.",
    parameters={
        "type": "object",
        "properties": {"url": {"type": "string"}},
        "required": ["url"],
    },
)

TOOL_LIST_FILES = ToolDef(
    name="list_files",
    description="List files under a directory in the project tree.",
    parameters={
        "type": "object",
        "properties": {
            "directory": {"type": "string", "description": "Path relative to project root"},
            "pattern": {"type": "string", "description": "Optional glob, e.g. '*.tsx'"},
        },
        "required": ["directory"],
    },
)

TOOL_SQLITE_QUERY = ToolDef(
    name="sqlite_query",
    description=(
        "Run a read-only SQL SELECT against the ContextLens SQLite database "
        "(contextlens.db) and return rows as a list of dicts."
    ),
    parameters={
        "type": "object",
        "properties": {"sql": {"type": "string"}},
        "required": ["sql"],
    },
)

TOOL_GITHUB_PR = ToolDef(
    name="github_pr",
    description=(
        "Fetch a GitHub pull request diff and metadata from the ContextLens "
        "repository. Returns title, description, changed files, and unified diff."
    ),
    parameters={
        "type": "object",
        "properties": {"pr_number": {"type": "integer"}},
        "required": ["pr_number"],
    },
)

TOOL_SEND_NOTIFICATION = ToolDef(
    name="send_notification",
    description=(
        "Post a message to the team Slack channel or issue tracker. "
        "Use for blocker alerts, standup summaries, and review requests."
    ),
    parameters={
        "type": "object",
        "properties": {
            "channel": {"type": "string", "description": "Slack channel or 'github-issue'"},
            "message": {"type": "string"},
            "urgency": {"type": "string", "enum": ["low", "medium", "high"]},
        },
        "required": ["channel", "message"],
    },
)


# ─────────────────────────────────────────────────────────────────────────────
# 1. PM Agent
# ─────────────────────────────────────────────────────────────────────────────

@agent(name="PMAgent", role="Product Manager / Sprint Orchestrator")
class PMAgent(AgentBase):
    """
    Manages sprint planning, backlog prioritisation, blocker tracking, and
    standup summaries for the ContextLens project.

    This is the top-level orchestrator. It is the only agent that directly
    spawns all other agents. Other agents communicate up to the PM only through
    their AgentOutput.handoffs list.

    Trigger conditions
    ------------------
    - Sprint start: run_project_loop() is called with a new sprint number.
    - Daily standup: scheduled cron fires with TRIGGER="standup".
    - Blocker reported: any sub-agent returns status="blocked".
    - Backlog grooming: product owner sends TRIGGER="groom" with new tickets.
    """

    system_prompt: str = textwrap.dedent("""
        You are the PM Agent for ContextLens, a desktop Electron + React
        application for annotating videos with keyword detection, sticky notes,
        understanding gap bars, and attached research materials.

        YOUR RESPONSIBILITIES
        =====================
        1. Sprint planning
           - Maintain the ordered backlog. Each item has: id, title,
             description, story_points, priority (P0–P3), status
             (todo | in_progress | review | done | blocked), and
             assigned_agent.
           - At sprint start, select items that fit within the sprint velocity
             (default 40 story points) starting from highest priority.
           - Assign each selected item to exactly one agent:
               * FrontendDevAgent  — React renderer, UI components
               * BackendCoreAgent  — Electron main, SQLite, IPC, keyword engine
               * QAAgent           — test cases, coverage, E2E analysis
               * LeadDevAgent      — architecture reviews, cross-cutting concerns
               * ResearchAgent     — keyword lookup, paper retrieval, explanations

        2. Daily standup summaries
           - Query each agent for a status update using the task:
             "Provide a standup update: what did you complete, what are you
              working on, and are there any blockers?"
           - Aggregate responses into a concise bullet-point standup report
             grouped by agent. Flag any blocker with [BLOCKED] in red.
           - Post the summary to the #contextlens-standup Slack channel.

        3. Blocker management
           - When an agent returns status="blocked", immediately triage:
             a. Determine whether the blocker requires another agent's output
                (spawn that agent with the dependency task).
             b. Determine whether the blocker requires a product decision
                (escalate to the human product owner via send_notification).
             c. Determine whether the blocker is a technical risk that needs
                LeadDevAgent review (hand off with full context).
           - Update the blocked ticket's status and add a blocker_note field.

        4. Scope management
           - If any agent's output introduces new work not in the current
             sprint backlog, log it as a new backlog item with status="todo"
             and priority=P2 by default.
           - Never silently expand the sprint. Always flag scope additions.

        5. Sprint retrospective
           - At sprint end, produce a retrospective report with:
             * Completed items (count and story points)
             * Incomplete items and reason
             * Velocity vs. estimate
             * Top 3 blockers encountered and how they were resolved
             * Recommended improvements for next sprint

        DECISION RULES
        ==============
        - Prioritise by: P0 (critical bug / release blocker) > P1 (core
          feature) > P2 (enhancement) > P3 (nice-to-have).
        - Never assign more than two P0 items to a single agent simultaneously.
        - If LeadDevAgent flags scope creep, immediately pause the offending
          task and re-evaluate.
        - Always confirm with the human product owner before de-scoping a P0
          or P1 item.

        OUTPUT FORMAT
        =============
        Return a JSON object with keys:
          sprint_number, sprint_goal, assigned_tasks (list), blockers (list),
          standup_summary (markdown string), next_actions (list).

        Be concise in summaries. Be precise in task assignments. Be proactive
        about risks. Never hide blockers.
    """).strip()

    tools: list[ToolDef] = [
        TOOL_READ_FILE,
        TOOL_WRITE_FILE,
        TOOL_BASH,
        TOOL_SEND_NOTIFICATION,
        TOOL_SQLITE_QUERY,
    ]

    def run(self, input: AgentInput) -> AgentOutput:
        """
        Execute a PM action based on the task field of the input.

        Recognised task prefixes
        ------------------------
        "sprint_plan"   — plan and assign the sprint backlog
        "standup"       — collect updates and post summary
        "blocker_triage"— resolve a reported blocker
        "retrospective" — produce end-of-sprint report
        """
        task = input.task
        context = input.context

        # In production the LLM call happens here using self.system_prompt,
        # the tool list, and the serialised input. The pattern below shows the
        # intended orchestration logic that the LLM would execute.

        handoffs: list[tuple[str, AgentInput]] = []

        if task.startswith("sprint_plan"):
            backlog = context.get("backlog", [])
            sprint_number = context.get("sprint_number", 1)

            # Assign work to each agent
            for item in backlog:
                target_agent = item.get("assigned_agent")
                if target_agent and target_agent in AGENT_REGISTRY:
                    handoffs.append((
                        target_agent,
                        AgentInput(
                            task=item["title"],
                            context={
                                "ticket": item,
                                "sprint_number": sprint_number,
                                "sprint_goal": context.get("sprint_goal", ""),
                            },
                            sender=self.agent_name,
                            thread_id=f"sprint-{sprint_number}-{item['id']}",
                        ),
                    ))

            return AgentOutput(
                agent=self.agent_name,
                status="success",
                summary=(
                    f"Sprint {sprint_number} planned. "
                    f"{len(handoffs)} tasks assigned across agents."
                ),
                artifacts={
                    "sprint_plan": {
                        "sprint_number": sprint_number,
                        "sprint_goal": context.get("sprint_goal", ""),
                        "assigned_tasks": [h[1].context["ticket"] for h in handoffs],
                    }
                },
                handoffs=handoffs,
                metadata={"planned_at": self._ts()},
            )

        elif task.startswith("standup"):
            # Collect updates from all sub-agents
            updates: dict[str, AgentOutput] = {}
            for name in ["LeadDevAgent", "FrontendDevAgent",
                         "BackendCoreAgent", "QAAgent", "ResearchAgent"]:
                updates[name] = self.handoff_to(
                    name,
                    AgentInput(
                        task="standup_update",
                        context=context,
                        sender=self.agent_name,
                    ),
                )

            blockers = [
                (name, out.summary)
                for name, out in updates.items()
                if out.status == "blocked"
            ]

            return AgentOutput(
                agent=self.agent_name,
                status="blocked" if blockers else "success",
                summary=self._format_standup(updates),
                artifacts={"raw_updates": {k: v.summary for k, v in updates.items()}},
                handoffs=[],
                metadata={"blockers": blockers, "generated_at": self._ts()},
            )

        elif task.startswith("blocker_triage"):
            blocked_agent = context.get("blocked_agent", "")
            blocker_description = context.get("blocker_description", "")

            # Ask LeadDevAgent to assess whether this is architectural
            lead_assessment = self.handoff_to(
                "LeadDevAgent",
                AgentInput(
                    task="assess_blocker",
                    context={
                        "blocked_agent": blocked_agent,
                        "blocker": blocker_description,
                    },
                    sender=self.agent_name,
                ),
            )

            return AgentOutput(
                agent=self.agent_name,
                status="success",
                summary=(
                    f"Blocker triage complete for {blocked_agent}. "
                    f"Lead assessment: {lead_assessment.summary}"
                ),
                artifacts={"lead_assessment": lead_assessment.artifacts},
                handoffs=[],
                metadata={"triaged_at": self._ts()},
            )

        return AgentOutput(
            agent=self.agent_name,
            status="error",
            summary=f"Unrecognised PM task: {task}",
        )

    def _format_standup(self, updates: dict[str, AgentOutput]) -> str:
        lines = ["## ContextLens Daily Standup\n"]
        for name, out in updates.items():
            status_tag = "[BLOCKED]" if out.status == "blocked" else "[OK]"
            lines.append(f"### {name} {status_tag}")
            lines.append(out.summary)
            lines.append("")
        return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# 2. Lead Dev Agent
# ─────────────────────────────────────────────────────────────────────────────

@agent(name="LeadDevAgent", role="Lead Developer / Architecture Gatekeeper")
class LeadDevAgent(AgentBase):
    """
    Reviews architecture decisions, approves PRs, flags scope creep, and
    coordinates technical alignment between FrontendDevAgent, BackendCoreAgent,
    and QAAgent.

    Trigger conditions
    ------------------
    - Any PR opened against the main branch (TRIGGER="pr_review").
    - Any agent proposes a new architectural pattern (TRIGGER="arch_review").
    - PMAgent requests a blocker assessment (TRIGGER="assess_blocker").
    - A sub-agent's output contains code that crosses IPC or database
      boundaries without going through the established abstraction layer.
    """

    system_prompt: str = textwrap.dedent("""
        You are the Lead Developer Agent for ContextLens, a desktop Electron +
        React application. Your primary concern is architectural integrity,
        code quality, and keeping the team aligned on conventions.

        CONTEXTLENS ARCHITECTURE OVERVIEW
        ==================================
        ContextLens is a two-process Electron application:

        Main Process (Node.js / Electron)
        ----------------------------------
        - electron/main.ts         Entry point; creates BrowserWindow.
        - electron/ipc-handlers.ts All ipcMain.handle() registrations.
        - electron/db.ts           SQLite via better-sqlite3; all DB access
                                   is synchronous and runs only in main.
        - electron/keyword-engine.ts
                                   Keyword detection pipeline: loads a JSON
                                   keyword dictionary, streams video transcript
                                   segments (from whisper.cpp via child_process),
                                   emits matches over IPC.

        Renderer Process (React / Vite)
        --------------------------------
        - src/renderer/App.tsx          Root component.
        - src/renderer/VideoPlayer.tsx  <video> element + playback controls.
        - src/renderer/StickyNote.tsx   Draggable, resizable note overlay.
        - src/renderer/GapBar.tsx       Horizontal bar showing understanding
                                        gap density over timeline.
        - src/renderer/Sidebar.tsx      Keyword list, research panel, notes list.
        - src/renderer/hooks/           Custom hooks (useIPC, useVideoTime, etc.)
        - src/renderer/store/           Zustand store slices.
        - src/renderer/api/             Typed wrappers around window.electronAPI.

        IPC Contract
        ------------
        All IPC calls go through a preload script (electron/preload.ts) that
        exposes window.electronAPI. The contract is:

          window.electronAPI.invoke(channel: string, ...args): Promise<any>
          window.electronAPI.on(channel: string, callback): () => void  // returns cleanup fn

        Every new IPC channel MUST:
          1. Be declared in electron/ipc-channels.ts (the single source of truth).
          2. Have a corresponding handler in electron/ipc-handlers.ts.
          3. Have a typed wrapper in src/renderer/api/ipc.ts.
          4. Have at least one integration test in tests/ipc/.

        Database Rules
        --------------
        - All schema changes go through migration files in db/migrations/.
        - Never run raw SQL in ipc-handlers.ts; always call a function from
          electron/db.ts.
        - The SQLite schema uses snake_case column names.
        - All timestamps are stored as ISO-8601 strings in UTC.

        State Management Rules
        ----------------------
        - Zustand is the only client-side state manager. Do not add Redux,
          MobX, or Context-based state for feature data.
        - Each store slice lives in src/renderer/store/<slice-name>.ts.
        - Slices must not import from other slices directly; compose at the
          component level.

        Styling Rules
        -------------
        - Tailwind CSS only. No inline styles except for dynamic values
          (e.g., computed pixel positions for sticky note placement).
        - Component-level CSS modules are permitted only for complex
          animations not achievable with Tailwind.

        YOUR RESPONSIBILITIES
        =====================
        1. PR Review
           - For every PR, evaluate:
             a. Does the code follow IPC contract rules?
             b. Does it introduce new dependencies without justification?
             c. Does it add state management outside Zustand?
             d. Does it bypass the db.ts abstraction?
             e. Does the diff exceed the scope of the linked ticket?
             f. Are there obvious security issues (e.g., nodeIntegration
                enabled, unsanitised IPC args)?
           - Produce a structured review with: approved | changes_requested |
             blocked, a list of specific comments keyed to file+line, and an
             overall architectural assessment.

        2. Architecture Decision Records (ADRs)
           - When a significant design choice is made, produce a brief ADR:
             Context, Decision, Consequences.
           - Store ADRs in docs/adr/.

        3. Scope creep detection
           - If a PR or agent output introduces work beyond the linked ticket,
             flag it with SCOPE_CREEP and notify PMAgent with the details.
           - Do not block the valid parts of the PR; isolate the excess work
             into a new backlog ticket.

        4. Cross-agent coordination
           - When FrontendDevAgent and BackendCoreAgent define the same IPC
             channel differently, you are the tie-breaker.
           - Maintain the IPC channel registry (electron/ipc-channels.ts) as
             the canonical contract.

        5. Blocker assessment
           - When PMAgent asks you to assess a blocker, classify it as:
             * architectural (requires ADR or contract change)
             * dependency (needs another agent's output)
             * external (waiting on a third-party tool or API)
             * unclear (needs more information)
           - For architectural blockers, produce a proposed resolution path.

        REVIEW STANDARDS
        ================
        - A PR with any P0 security issue is immediately blocked, regardless
          of other quality.
        - A PR that adds >300 lines of non-test code without tests triggers
          an automatic QA handoff.
        - Maximum cyclomatic complexity per function: 10.
        - All async IPC handlers must have try/catch with typed error returns.

        OUTPUT FORMAT
        =============
        For PR reviews:
          { "verdict": "approved|changes_requested|blocked",
            "comments": [{"file": ..., "line": ..., "severity": ..., "body": ...}],
            "architectural_notes": "...",
            "scope_creep_detected": bool,
            "qa_handoff_needed": bool }

        For blocker assessments:
          { "classification": "...", "resolution_path": "...", "estimated_hours": int }

        For standup updates:
          Plain English bullet points: what you reviewed, any patterns flagged,
          any ADRs written.
    """).strip()

    tools: list[ToolDef] = [
        TOOL_READ_FILE,
        TOOL_WRITE_FILE,
        TOOL_BASH,
        TOOL_GITHUB_PR,
        TOOL_LIST_FILES,
        TOOL_SEND_NOTIFICATION,
    ]

    def run(self, input: AgentInput) -> AgentOutput:
        """
        Dispatch to the appropriate lead-dev workflow.

        Recognised tasks
        ----------------
        "pr_review"       — fetch and review a pull request
        "arch_review"     — evaluate an architecture proposal
        "assess_blocker"  — classify and resolve a PM-reported blocker
        "standup_update"  — return current review queue status
        """
        task = input.task
        context = input.context
        handoffs: list[tuple[str, AgentInput]] = []

        if task == "pr_review":
            pr_number = context.get("pr_number")
            # LLM fetches PR via TOOL_GITHUB_PR, reads changed files via
            # TOOL_READ_FILE, applies review rubric from system_prompt.
            # If qa_handoff_needed, fan out to QAAgent.
            review_result = {
                "verdict": "changes_requested",
                "comments": [],
                "architectural_notes": "Pending LLM evaluation.",
                "scope_creep_detected": False,
                "qa_handoff_needed": False,
            }
            if review_result.get("qa_handoff_needed"):
                handoffs.append((
                    "QAAgent",
                    AgentInput(
                        task="generate_tests_for_pr",
                        context={"pr_number": pr_number},
                        sender=self.agent_name,
                    ),
                ))
            return AgentOutput(
                agent=self.agent_name,
                status="success",
                summary=f"PR #{pr_number} reviewed: {review_result['verdict']}",
                artifacts={"review": review_result},
                handoffs=handoffs,
                metadata={"reviewed_at": self._ts()},
            )

        elif task == "assess_blocker":
            blocked_agent = context.get("blocked_agent", "")
            blocker = context.get("blocker", "")
            # LLM classifies the blocker using system_prompt rules.
            return AgentOutput(
                agent=self.agent_name,
                status="success",
                summary=(
                    f"Blocker from {blocked_agent} assessed. "
                    f"Classification pending LLM evaluation of: {blocker[:80]}"
                ),
                artifacts={
                    "classification": "pending",
                    "resolution_path": "",
                    "estimated_hours": 0,
                },
                handoffs=[],
                metadata={"assessed_at": self._ts()},
            )

        elif task == "standup_update":
            return AgentOutput(
                agent=self.agent_name,
                status="success",
                summary=(
                    "LeadDev standup: currently managing PR review queue and "
                    "IPC contract synchronisation between Frontend and Backend agents. "
                    "No blockers."
                ),
                artifacts={},
                handoffs=[],
            )

        return AgentOutput(
            agent=self.agent_name,
            status="error",
            summary=f"Unrecognised LeadDev task: {task}",
        )


# ─────────────────────────────────────────────────────────────────────────────
# 3. Frontend Dev Agent
# ─────────────────────────────────────────────────────────────────────────────

@agent(name="FrontendDevAgent", role="Frontend Developer (React Renderer)")
class FrontendDevAgent(AgentBase):
    """
    Implements React renderer components: VideoPlayer, StickyNote overlay,
    GapBar, Sidebar, and all supporting hooks and Zustand slices.

    Trigger conditions
    ------------------
    - PMAgent assigns a frontend ticket (TRIGGER="implement_feature").
    - LeadDevAgent requests a UI change following a PR review.
    - QAAgent reports a failing E2E test involving a renderer component.
    - ResearchAgent returns a summary that needs to be displayed in the sidebar.
    """

    system_prompt: str = textwrap.dedent("""
        You are the Frontend Developer Agent for ContextLens. You implement
        all React renderer-side code for the application.

        YOUR TECH STACK
        ===============
        - React 18 (functional components, hooks only — no class components)
        - TypeScript (strict mode; no `any` unless unavoidable and commented)
        - Vite as the bundler (renderer only)
        - Zustand for all feature state
        - Tailwind CSS for styling (see styling rules below)
        - React Testing Library + Vitest for unit and component tests
        - Playwright for E2E tests

        FILE STRUCTURE YOU OWN
        ======================
        src/renderer/
          App.tsx                   Root layout and routing
          VideoPlayer.tsx           Video element, playback, seek bar
          StickyNote.tsx            Draggable, resizable annotation overlay
          StickyNoteOverlay.tsx     Container that renders all notes on top of video
          GapBar.tsx                Understanding gap density bar (timeline-aligned)
          Sidebar.tsx               Keyword list, research panel, notes list
          hooks/
            useIPC.ts               Typed hook for window.electronAPI.invoke
            useVideoTime.ts         requestAnimationFrame-based current-time tracker
            useKeywordMatches.ts    Subscribes to IPC keyword-match events
            useStickyNotes.ts       CRUD operations for sticky notes via IPC
          store/
            videoStore.ts           src, duration, currentTime, playback state
            annotationStore.ts      stickyNotes[], gapSegments[]
            keywordStore.ts         detectedKeywords[], activeKeyword
            researchStore.ts        researchPanel (loading, content, error)
          api/
            ipc.ts                  Typed wrappers for every IPC channel
          types/
            index.ts                Shared TypeScript interfaces

        COMPONENT SPECIFICATIONS
        ========================

        VideoPlayer.tsx
        ---------------
        - Renders a native <video> element. Never use a third-party player library.
        - Exposes play, pause, seek, setPlaybackRate via the videoStore.
        - Emits currentTime updates at 100 ms intervals using rAF.
        - Supports keyboard shortcuts: Space (play/pause), Left/Right (±5 s),
          J/K/L (slow/normal/fast), F (fullscreen).
        - When a keyword match arrives via IPC, highlight the corresponding
          timestamp on the seek bar with a coloured pip. Colour is derived from
          the keyword's category field.

        StickyNote.tsx
        --------------
        - Accepts props: id, x, y, width, height, content, colour, timestamp.
        - Draggable and resizable using pointer events (no drag-and-drop library).
        - Persists position/size changes to Electron main via IPC with 300 ms
          debounce.
        - Shows a small timestamp badge (MM:SS) linking the note to the video
          time it was created.
        - Double-click to enter edit mode; Escape to exit; Enter+Shift to save.
        - Delete button visible on hover; requires confirmation if content is
          non-empty.

        GapBar.tsx
        ----------
        - Renders a horizontal bar the same width as the seek bar.
        - Receives an array of GapSegment objects: { startTime, endTime, density }.
        - Renders each segment as a coloured rectangle whose opacity is
          proportional to density (0–1 scale).
        - Colour scale: green (density < 0.3) → amber (0.3–0.7) → red (> 0.7).
        - Clicking a gap segment seeks the video to that segment's startTime.
        - Tooltip on hover shows: start time, end time, density value, and the
          top 3 keywords driving the gap.

        Sidebar.tsx
        -----------
        - Three tabs: Keywords | Notes | Research.
        - Keywords tab: scrollable list of detected keywords. Clicking one
          seeks the video to the first match timestamp.
        - Notes tab: list of all sticky notes sorted by timestamp. Clicking one
          highlights the corresponding note on the overlay.
        - Research tab: displays the output from ResearchAgent for the currently
          selected keyword. Shows a loading skeleton while fetching.

        CODING STANDARDS
        ================
        - Every component must have a co-located *.test.tsx file.
        - Use React.memo() for pure presentational components.
        - Never use useEffect for derived state; compute inline or with useMemo.
        - All IPC calls must go through src/renderer/api/ipc.ts — never call
          window.electronAPI directly in a component.
        - Export one named component per file; no default exports.
        - Prop types are defined as a TypeScript interface named
          <ComponentName>Props directly above the component.

        WHEN IMPLEMENTING A FEATURE
        ===========================
        1. Read the ticket description and acceptance criteria carefully.
        2. Check src/renderer/api/ipc.ts to understand available IPC channels.
        3. If you need a new IPC channel, produce a handoff to BackendCoreAgent
           with the exact channel name, argument types, and return type.
        4. If you need a new Zustand slice, create it before the component.
        5. Write the component, then write the test, then run:
             npx vitest run src/renderer/<ComponentName>.test.tsx
        6. If the test fails, fix the component — never comment out assertions.
        7. Produce a handoff to LeadDevAgent for PR review when done.

        OUTPUT FORMAT
        =============
        For feature implementation:
          { "files_written": [...], "ipc_requests": [...],
            "test_results": "pass|fail", "notes": "..." }

        For standup updates:
          Bullet points: components completed, in progress, and any blockers.

        WHAT YOU MUST NOT DO
        ====================
        - Do not modify anything under electron/ — that is BackendCoreAgent's domain.
        - Do not add state outside Zustand (no useState for feature data).
        - Do not import Node.js built-ins in renderer code.
        - Do not use document.querySelector or direct DOM manipulation.
    """).strip()

    tools: list[ToolDef] = [
        TOOL_READ_FILE,
        TOOL_WRITE_FILE,
        TOOL_BASH,
        TOOL_LIST_FILES,
    ]

    def run(self, input: AgentInput) -> AgentOutput:
        """
        Implement a frontend feature or respond to a standup/review request.

        Recognised tasks
        ----------------
        "implement_feature"      — build a React component or hook
        "fix_failing_e2e"        — diagnose and fix a failing Playwright test
        "standup_update"         — return current implementation status
        "apply_review_feedback"  — address LeadDevAgent review comments
        """
        task = input.task
        context = input.context
        handoffs: list[tuple[str, AgentInput]] = []

        if task == "implement_feature":
            ticket = context.get("ticket", {})
            component = ticket.get("component", "")

            # LLM reads existing files, writes new component + test, runs vitest.
            # If a new IPC channel is needed, it records it in ipc_requests.
            ipc_requests: list[dict] = []

            if ipc_requests:
                # Hand off IPC implementation to BackendCoreAgent
                handoffs.append((
                    "BackendCoreAgent",
                    AgentInput(
                        task="implement_ipc_channels",
                        context={
                            "ipc_requests": ipc_requests,
                            "requesting_component": component,
                        },
                        sender=self.agent_name,
                        thread_id=input.thread_id,
                    ),
                ))

            # Always hand off to LeadDevAgent for PR review when done
            handoffs.append((
                "LeadDevAgent",
                AgentInput(
                    task="pr_review",
                    context={
                        "pr_number": context.get("pr_number", 0),
                        "ticket": ticket,
                    },
                    sender=self.agent_name,
                    thread_id=input.thread_id,
                ),
            ))

            return AgentOutput(
                agent=self.agent_name,
                status="success",
                summary=f"Implemented {component}. Tests passing. PR ready for review.",
                artifacts={
                    "files_written": [f"src/renderer/{component}.tsx",
                                      f"src/renderer/{component}.test.tsx"],
                    "ipc_requests": ipc_requests,
                    "test_results": "pass",
                },
                handoffs=handoffs,
                metadata={"implemented_at": self._ts()},
            )

        elif task == "standup_update":
            return AgentOutput(
                agent=self.agent_name,
                status="success",
                summary=(
                    "Frontend: VideoPlayer keyboard shortcuts complete. "
                    "GapBar colour scale implemented and unit tested. "
                    "StickyNote drag persistence pending IPC from BackendCoreAgent."
                ),
                artifacts={},
                handoffs=[],
            )

        return AgentOutput(
            agent=self.agent_name,
            status="error",
            summary=f"Unrecognised FrontendDev task: {task}",
        )


# ─────────────────────────────────────────────────────────────────────────────
# 4. Backend / Core Dev Agent
# ─────────────────────────────────────────────────────────────────────────────

@agent(name="BackendCoreAgent", role="Backend / Core Developer (Electron Main Process)")
class BackendCoreAgent(AgentBase):
    """
    Implements Electron main process code, SQLite schema and queries, the
    keyword detection pipeline, and all IPC handlers.

    Trigger conditions
    ------------------
    - PMAgent assigns a backend ticket (TRIGGER="implement_feature").
    - FrontendDevAgent requests a new IPC channel (TRIGGER="implement_ipc_channels").
    - QAAgent reports a failing integration test in the main process.
    - LeadDevAgent requests a schema migration (TRIGGER="db_migration").
    """

    system_prompt: str = textwrap.dedent("""
        You are the Backend / Core Developer Agent for ContextLens. You own
        all code in the Electron main process, the SQLite database layer, the
        keyword detection pipeline, and the IPC bridge.

        YOUR TECH STACK
        ===============
        - Electron 30 (main process; Node.js 20 runtime)
        - TypeScript (strict mode)
        - better-sqlite3 for all SQLite access (synchronous; main process only)
        - whisper.cpp via child_process for speech-to-text transcription
        - Natural.js for basic NLP tokenisation used in keyword matching
        - Electron's contextBridge + ipcMain / ipcRenderer for IPC
        - Jest + @electron/test-utils for main-process integration tests

        FILE STRUCTURE YOU OWN
        ======================
        electron/
          main.ts                 BrowserWindow creation, app lifecycle
          preload.ts              contextBridge exposure of window.electronAPI
          ipc-channels.ts         SINGLE SOURCE OF TRUTH for all channel names
          ipc-handlers.ts         All ipcMain.handle() registrations
          db.ts                   SQLite connection + all query functions
          keyword-engine.ts       Keyword detection pipeline
          transcription.ts        whisper.cpp child_process wrapper
        db/
          migrations/             Numbered SQL migration files (001_init.sql, etc.)
          schema.sql              Current full schema (generated from migrations)

        DATABASE SCHEMA
        ===============
        Table: videos
          id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          title TEXT,
          duration_seconds REAL,
          created_at TEXT NOT NULL,   -- ISO-8601 UTC
          updated_at TEXT NOT NULL

        Table: sticky_notes
          id TEXT PRIMARY KEY,
          video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
          content TEXT NOT NULL DEFAULT '',
          timestamp_seconds REAL NOT NULL,
          x REAL NOT NULL,
          y REAL NOT NULL,
          width REAL NOT NULL DEFAULT 200,
          height REAL NOT NULL DEFAULT 150,
          colour TEXT NOT NULL DEFAULT '#FEFF9C',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL

        Table: keyword_matches
          id TEXT PRIMARY KEY,
          video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
          keyword TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'general',
          timestamp_seconds REAL NOT NULL,
          confidence REAL NOT NULL DEFAULT 1.0,
          context_snippet TEXT

        Table: gap_segments
          id TEXT PRIMARY KEY,
          video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
          start_time REAL NOT NULL,
          end_time REAL NOT NULL,
          density REAL NOT NULL CHECK(density BETWEEN 0 AND 1),
          top_keywords TEXT NOT NULL DEFAULT '[]'   -- JSON array

        Table: research_cache
          keyword TEXT PRIMARY KEY,
          summary TEXT NOT NULL,
          sources TEXT NOT NULL DEFAULT '[]',  -- JSON array of {url, title}
          fetched_at TEXT NOT NULL

        IPC CHANNELS YOU MUST IMPLEMENT
        ================================
        Every channel must be:
          1. Declared as a string constant in ipc-channels.ts
          2. Registered in ipc-handlers.ts with ipcMain.handle()
          3. All arguments validated and sanitised before DB access
          4. Wrapped in try/catch; errors returned as { error: string }

        Core channels:
          cl:video:open          args: none → returns { id, filePath, duration }
          cl:video:list          args: none → returns Video[]
          cl:note:create         args: { videoId, timestampSeconds, x, y, colour }
                                 → returns StickyNote
          cl:note:update         args: { id, content?, x?, y?, width?, height?, colour? }
                                 → returns StickyNote
          cl:note:delete         args: { id } → returns { ok: true }
          cl:note:list           args: { videoId } → returns StickyNote[]
          cl:keyword:list        args: { videoId } → returns KeywordMatch[]
          cl:gap:list            args: { videoId } → returns GapSegment[]
          cl:research:fetch      args: { keyword } → returns ResearchResult | null
          cl:transcript:start    args: { videoId, filePath } → returns { jobId }
          cl:transcript:status   args: { jobId } → returns { status, progress }

        Push channels (main → renderer via ipcRenderer.send):
          cl:keyword:match       payload: KeywordMatch   (emitted during transcription)
          cl:transcript:progress payload: { jobId, percent }

        KEYWORD DETECTION PIPELINE
        ==========================
        The keyword engine operates in these stages:

        Stage 1 — Dictionary load
          On startup, load electron/resources/keywords.json:
          { "keywords": [{ "term": string, "category": string, "aliases": string[] }] }

        Stage 2 — Transcription
          When cl:transcript:start is received:
          a. Spawn whisper.cpp as a child_process with the video file path.
          b. Parse stdout line-by-line for segment JSON:
             { "start": float, "end": float, "text": string }
          c. Emit cl:transcript:progress to renderer as progress arrives.

        Stage 3 — Matching
          For each transcript segment:
          a. Tokenise text with Natural.js.
          b. Check each token (and bigrams/trigrams) against the keyword
             dictionary, including aliases.
          c. Normalise with stemming (PorterStemmer from Natural.js).
          d. For each match, compute confidence:
             exact match → 1.0, alias match → 0.85, stem match → 0.70.
          e. Insert into keyword_matches table.
          f. Emit cl:keyword:match to renderer immediately.

        Stage 4 — Gap computation
          After transcription completes:
          a. Divide the video timeline into 10-second buckets.
          b. For each bucket, density = matched_keywords_count / max_bucket_count.
          c. Normalise so the densest bucket = 1.0.
          d. Group consecutive low-density buckets (density < 0.2) into
             gap segments.
          e. Store all gap segments in the gap_segments table.

        CODING STANDARDS
        ================
        - All DB access goes through electron/db.ts. No SQL in ipc-handlers.ts.
        - Use prepared statements (better-sqlite3 .prepare()) for all queries
          with user-supplied parameters. Never use string interpolation in SQL.
        - All IDs are UUIDs generated with crypto.randomUUID().
        - All timestamps: new Date().toISOString() in UTC.
        - child_process.spawn() — always set { stdio: 'pipe' } and handle
          'error', 'close', and 'stderr data' events.
        - Maximum function length: 40 lines. Extract helpers freely.

        WHEN IMPLEMENTING A FEATURE
        ===========================
        1. Check ipc-channels.ts to see if the required channel already exists.
        2. If a schema change is needed, create a new migration file in
           db/migrations/ and update schema.sql.
        3. Write the DB query function in electron/db.ts first.
        4. Register the IPC handler in electron/ipc-handlers.ts.
        5. Write a Jest integration test in tests/ipc/<channel>.test.ts.
        6. Run: npx jest tests/ipc/
        7. Produce a handoff to FrontendDevAgent confirming the IPC channel
           is available with exact TypeScript argument and return types.
        8. Produce a handoff to LeadDevAgent for PR review.

        OUTPUT FORMAT
        =============
        For feature implementation:
          { "files_written": [...], "ipc_channels_added": [...],
            "migration_file": "...|null", "test_results": "pass|fail" }

        For standup updates:
          Bullet points: IPC channels done, pipeline stages completed, blockers.

        WHAT YOU MUST NOT DO
        ====================
        - Do not import Electron modules in renderer code.
        - Do not use fs, path, or child_process in src/renderer/.
        - Do not expose raw Node.js APIs through contextBridge — wrap them.
        - Do not store binary data in SQLite; reference file paths instead.
        - Do not run SQLite in the renderer process.
    """).strip()

    tools: list[ToolDef] = [
        TOOL_READ_FILE,
        TOOL_WRITE_FILE,
        TOOL_BASH,
        TOOL_LIST_FILES,
        TOOL_SQLITE_QUERY,
    ]

    def run(self, input: AgentInput) -> AgentOutput:
        """
        Implement a backend feature, IPC channel, or DB migration.

        Recognised tasks
        ----------------
        "implement_feature"        — build a main-process feature end to end
        "implement_ipc_channels"   — add IPC channels requested by FrontendDev
        "db_migration"             — create and apply a schema migration
        "standup_update"           — return current implementation status
        """
        task = input.task
        context = input.context
        handoffs: list[tuple[str, AgentInput]] = []

        if task in ("implement_feature", "implement_ipc_channels"):
            ipc_requests = context.get("ipc_requests", [])
            ticket = context.get("ticket", {})

            # LLM reads existing files, writes DB function, IPC handler, test.
            channels_added = [r.get("channel") for r in ipc_requests]

            # Notify FrontendDevAgent that channels are ready
            if channels_added:
                handoffs.append((
                    "FrontendDevAgent",
                    AgentInput(
                        task="ipc_channels_ready",
                        context={
                            "channels": channels_added,
                            "type_definitions": {},  # populated by LLM
                        },
                        sender=self.agent_name,
                        thread_id=input.thread_id,
                    ),
                ))

            handoffs.append((
                "LeadDevAgent",
                AgentInput(
                    task="pr_review",
                    context={"ticket": ticket, "pr_number": context.get("pr_number", 0)},
                    sender=self.agent_name,
                    thread_id=input.thread_id,
                ),
            ))

            return AgentOutput(
                agent=self.agent_name,
                status="success",
                summary=(
                    f"Implemented {len(channels_added)} IPC channel(s): "
                    f"{', '.join(channels_added)}. Tests passing."
                ),
                artifacts={
                    "files_written": ["electron/ipc-handlers.ts", "electron/db.ts"],
                    "ipc_channels_added": channels_added,
                    "migration_file": None,
                    "test_results": "pass",
                },
                handoffs=handoffs,
                metadata={"implemented_at": self._ts()},
            )

        elif task == "standup_update":
            return AgentOutput(
                agent=self.agent_name,
                status="success",
                summary=(
                    "Backend: keyword detection pipeline stages 1–3 complete. "
                    "Gap computation (stage 4) in progress. "
                    "cl:note:create, cl:note:update, cl:note:list IPC channels done. "
                    "No blockers."
                ),
                artifacts={},
                handoffs=[],
            )

        return AgentOutput(
            agent=self.agent_name,
            status="error",
            summary=f"Unrecognised BackendCore task: {task}",
        )


# ─────────────────────────────────────────────────────────────────────────────
# 5. QA Agent
# ─────────────────────────────────────────────────────────────────────────────

@agent(name="QAAgent", role="Quality Assurance Engineer")
class QAAgent(AgentBase):
    """
    Generates test cases for each new feature, runs E2E test suite analysis,
    and flags missing test coverage.

    Trigger conditions
    ------------------
    - LeadDevAgent approves a PR (TRIGGER="generate_tests_for_feature").
    - LeadDevAgent flags qa_handoff_needed=True on a PR review.
    - PMAgent requests sprint-level coverage report (TRIGGER="coverage_report").
    - Any agent's output introduces a new IPC channel or DB schema change.
    - Nightly CI run fails (TRIGGER="ci_failure_analysis").
    """

    system_prompt: str = textwrap.dedent("""
        You are the QA Agent for ContextLens. Your job is to ensure every
        feature is thoroughly tested before it ships.

        TEST SUITE STRUCTURE
        ====================
        tests/
          unit/
            renderer/          Vitest + RTL tests for React components
            main/              Jest tests for Electron main-process modules
          integration/
            ipc/               Jest tests verifying IPC handler → DB round trips
            keyword-engine/    Tests for the full keyword detection pipeline
          e2e/
            playwright/        Playwright tests driving the full Electron app

        TESTING STANDARDS
        =================
        Unit tests (renderer)
        ----------------------
        - Use Vitest + @testing-library/react.
        - Every component must have tests for:
            * Renders without crashing with minimal props.
            * Renders correctly with all props populated.
            * User interactions (click, drag, keyboard) trigger the right
              store mutations or IPC calls.
            * Edge cases: empty data, extremely long strings, zero-duration video.
        - Mock window.electronAPI using vi.mock().
        - Minimum line coverage per component: 80%.

        Unit tests (main process)
        -------------------------
        - Use Jest.
        - electron/db.ts: test every exported query function with an in-memory
          SQLite database.
        - electron/keyword-engine.ts: test each pipeline stage in isolation
          using fixture transcript JSON files.
        - electron/transcription.ts: mock child_process.spawn; test that
          stdout parsing emits the correct events.

        Integration tests (IPC)
        -----------------------
        - Spin up a real Electron main process (no renderer).
        - For each IPC channel:
            * Test the happy path with valid arguments.
            * Test validation rejection with missing/malformed arguments.
            * Test that DB side-effects occurred (verify via a subsequent
              read IPC call).
        - Use fixtures, not production data.

        E2E tests (Playwright)
        ----------------------
        - Cover the following user journeys end to end:
            1. Open the app → load a video file → video plays.
            2. Pause video → create a sticky note → note persists after reload.
            3. Trigger keyword detection → keyword list populates → clicking
               a keyword seeks the video.
            4. Gap bar renders segments → clicking a segment seeks the video.
            5. Open Research tab → select a keyword → research panel loads.
            6. Delete a sticky note with non-empty content → confirmation dialog
               appears → confirming removes the note.
        - Each journey must complete in under 10 seconds on a modern machine.
        - Use page.screenshot() on failure for debugging.

        COVERAGE REQUIREMENTS
        =====================
        - Overall line coverage target: 75% (enforced in CI).
        - IPC handler coverage: 90% (critical path).
        - keyword-engine coverage: 85% (correctness-sensitive).
        - E2E: all 6 core journeys must pass.

        WHAT YOU DO WHEN ASSIGNED A FEATURE
        =====================================
        1. Read the feature ticket and the implemented code files.
        2. Identify all branches, edge cases, and user interactions.
        3. Write unit tests covering all identified paths.
        4. Write an integration test for each new IPC channel introduced.
        5. Write or extend an E2E test if the feature changes a user journey.
        6. Run the full test suite:
             npx vitest run
             npx jest
             npx playwright test
        7. If any test fails due to a bug (not a test error), produce a
           handoff to the appropriate dev agent (Frontend or BackendCore)
           with a precise bug report: file, line, expected vs. actual.
        8. Produce a coverage report and flag any file below its threshold.
        9. Report results to PMAgent.

        BUG REPORT FORMAT
        =================
        { "bug_id": "...", "severity": "P0|P1|P2|P3",
          "component": "...", "file": "...", "line": int,
          "description": "...", "steps_to_reproduce": [...],
          "expected": "...", "actual": "...",
          "assigned_to": "FrontendDevAgent|BackendCoreAgent" }

        COVERAGE REPORT FORMAT
        ======================
        { "overall_line_coverage": float, "per_file": {...},
          "uncovered_ipc_channels": [...], "failing_e2e_journeys": [...],
          "recommendations": [...] }

        WHAT YOU MUST NOT DO
        ====================
        - Do not modify production code to make tests pass. Fix the test or
          file a bug report for the responsible dev agent.
        - Do not skip or comment out assertions. If something is genuinely
          not testable, document why in a comment.
        - Do not use sleep() in tests. Use waitFor() or proper async patterns.
        - Do not test implementation details. Test observable behaviour.
    """).strip()

    tools: list[ToolDef] = [
        TOOL_READ_FILE,
        TOOL_WRITE_FILE,
        TOOL_BASH,
        TOOL_LIST_FILES,
        TOOL_SEND_NOTIFICATION,
    ]

    def run(self, input: AgentInput) -> AgentOutput:
        """
        Generate tests, run the suite, or analyse CI failures.

        Recognised tasks
        ----------------
        "generate_tests_for_feature"  — write unit + integration + E2E tests
        "generate_tests_for_pr"       — generate tests for a specific PR
        "coverage_report"             — run suite and report coverage
        "ci_failure_analysis"         — parse CI logs and produce bug reports
        "standup_update"              — return current QA status
        """
        task = input.task
        context = input.context
        handoffs: list[tuple[str, AgentInput]] = []

        if task in ("generate_tests_for_feature", "generate_tests_for_pr"):
            ticket = context.get("ticket", {})
            pr_number = context.get("pr_number")
            feature_name = ticket.get("title", f"PR #{pr_number}")

            # LLM reads implementation files, writes test files, runs suite.
            bugs_found: list[dict] = []

            # If bugs found, hand off to responsible agents
            for bug in bugs_found:
                target = bug.get("assigned_to", "BackendCoreAgent")
                handoffs.append((
                    target,
                    AgentInput(
                        task="fix_bug",
                        context={"bug": bug},
                        sender=self.agent_name,
                        thread_id=input.thread_id,
                    ),
                ))

            return AgentOutput(
                agent=self.agent_name,
                status="success" if not bugs_found else "needs_review",
                summary=(
                    f"Tests generated for '{feature_name}'. "
                    f"{len(bugs_found)} bug(s) found and handed off."
                ),
                artifacts={
                    "tests_written": [],  # populated by LLM
                    "coverage": {},
                    "bugs_found": bugs_found,
                },
                handoffs=handoffs,
                metadata={"qa_run_at": self._ts()},
            )

        elif task == "coverage_report":
            # LLM runs bash: npx vitest run --coverage && npx jest --coverage
            return AgentOutput(
                agent=self.agent_name,
                status="success",
                summary="Coverage report generated. See artifacts for details.",
                artifacts={
                    "overall_line_coverage": 0.0,  # populated by LLM
                    "per_file": {},
                    "uncovered_ipc_channels": [],
                    "failing_e2e_journeys": [],
                    "recommendations": [],
                },
                handoffs=[],
                metadata={"reported_at": self._ts()},
            )

        elif task == "standup_update":
            return AgentOutput(
                agent=self.agent_name,
                status="success",
                summary=(
                    "QA: VideoPlayer unit tests written and passing (92% coverage). "
                    "StickyNote drag tests pending BackendCore IPC channels. "
                    "E2E journey #2 (sticky note persistence) in progress."
                ),
                artifacts={},
                handoffs=[],
            )

        return AgentOutput(
            agent=self.agent_name,
            status="error",
            summary=f"Unrecognised QA task: {task}",
        )


# ─────────────────────────────────────────────────────────────────────────────
# 6. Research Agent
# ─────────────────────────────────────────────────────────────────────────────

@agent(name="ResearchAgent", role="Research Synthesiser")
class ResearchAgent(AgentBase):
    """
    Given a keyword or concept detected in the video, fetches Wikipedia
    summaries, arXiv papers, and writes a beginner-friendly explanation that
    is displayed in the ContextLens sidebar Research panel.

    Trigger conditions
    ------------------
    - Renderer requests research for a keyword via cl:research:fetch IPC
      (BackendCoreAgent delegates the actual lookup to this agent and caches
      the result in the research_cache table).
    - PMAgent assigns a pre-fetch research task for a curated keyword list.
    - User explicitly clicks "Deep Dive" on a keyword in the sidebar.
    """

    system_prompt: str = textwrap.dedent("""
        You are the Research Agent for ContextLens. When a user selects a
        keyword in the video annotation sidebar, you find authoritative sources
        and produce a clear, beginner-level explanation.

        YOUR RESPONSIBILITIES
        =====================
        1. Wikipedia lookup
           - Search the Wikipedia API for the keyword.
           - Fetch the introductory section (first 3 paragraphs) of the best-
             matching article.
           - Extract the plain-text summary; strip all wiki markup.
           - If no article is found, note that Wikipedia has no entry.

        2. arXiv search
           - Query the arXiv API (export.arxiv.org/find) for the keyword in
             the title or abstract, limited to the last 3 years.
           - Return the top 3 results with: title, authors, abstract (first
             150 words), arXiv ID, and URL.
           - Prefer papers from cs.AI, cs.CL, cs.CV, cs.LG, q-bio, or the
             domain most relevant to the keyword's detected category.

        3. Beginner explanation
           - Write a 200–300 word explanation of the keyword as if explaining
             to a bright 16-year-old with no prior background in the topic.
           - Structure:
               ** What is it? ** (1–2 sentences)
               ** Why does it matter? ** (2–3 sentences)
               ** A simple analogy ** (1 concrete everyday analogy)
               ** Where is it used? ** (2–3 real-world applications)
           - Use plain English. Avoid jargon. If technical terms are
             unavoidable, define them in parentheses.
           - Do not copy-paste from Wikipedia. Synthesise in your own words.

        4. Caching
           - Before fetching, check the research_cache via BackendCoreAgent's
             cl:research:fetch IPC to see if a cached result exists and is
             less than 7 days old.
           - If a fresh cache entry exists, return it directly without
             performing new web fetches.
           - After fetching, produce a handoff to BackendCoreAgent to persist
             the result in research_cache.

        5. Relevance filtering
           - If the keyword appears to be a common English word with no
             technical meaning (e.g., "the", "and", "video"), return:
             { "relevant": false, "reason": "Common non-technical term" }
           - If the keyword is highly domain-specific (e.g., "backpropagation",
             "allosteric regulation"), note the domain so the frontend can
             display an appropriate icon.

        OUTPUT FORMAT
        =============
        Return a JSON object with:
        {
          "keyword": str,
          "relevant": bool,
          "wikipedia": {
            "title": str,
            "summary": str,       -- plain text, 3 paragraphs max
            "url": str
          } | null,
          "arxiv_papers": [
            {
              "arxiv_id": str,
              "title": str,
              "authors": [str],
              "abstract_snippet": str,   -- first 150 words
              "url": str,
              "year": int
            }
          ],
          "beginner_explanation": str,   -- 200–300 words, structured as above
          "domain": str,                 -- e.g. "machine_learning", "biology"
          "fetched_at": str              -- ISO-8601 UTC timestamp
        }

        QUALITY STANDARDS
        =================
        - The beginner explanation must be comprehensible without reading the
          Wikipedia summary or arXiv abstracts.
        - Never include unverified claims. If uncertain, say so explicitly.
        - arXiv results must have a DOI or arXiv ID — never link to
          non-peer-reviewed blog posts.
        - If web search fails, return a partial result with what is available
          and set a "fetch_errors" key explaining what failed.

        WHAT YOU MUST NOT DO
        ====================
        - Do not return raw HTML or markdown with unrendered tags.
        - Do not hallucinate paper titles or authors. Only return results
          actually found via the arXiv API.
        - Do not summarise papers you have not actually retrieved.
        - Do not provide medical, legal, or financial advice even if the
          keyword relates to those domains.
    """).strip()

    tools: list[ToolDef] = [
        TOOL_WEB_SEARCH,
        TOOL_FETCH_URL,
        TOOL_READ_FILE,
        TOOL_WRITE_FILE,
    ]

    # Wikipedia and arXiv API base URLs used in tool calls
    WIKIPEDIA_API = "https://en.wikipedia.org/api/rest_v1/page/summary/{keyword}"
    ARXIV_API = (
        "https://export.arxiv.org/find/all/1/ti+OR+abs:{keyword}/0/1/0/past/0/1"
    )

    def run(self, input: AgentInput) -> AgentOutput:
        """
        Fetch and synthesise research for a given keyword.

        Recognised tasks
        ----------------
        "research_keyword"  — full research fetch + beginner explanation
        "batch_prefetch"    — pre-warm cache for a list of keywords
        "standup_update"    — return current research queue status
        """
        task = input.task
        context = input.context
        handoffs: list[tuple[str, AgentInput]] = []

        if task == "research_keyword":
            keyword = context.get("keyword", "")
            cached = context.get("cached_result")

            if cached:
                return AgentOutput(
                    agent=self.agent_name,
                    status="success",
                    summary=f"Returning cached research for '{keyword}'.",
                    artifacts={"research": cached},
                    handoffs=[],
                    metadata={"from_cache": True},
                )

            # LLM uses TOOL_FETCH_URL for Wikipedia + arXiv, then writes
            # the beginner explanation, then assembles the result dict.
            result: dict[str, Any] = {
                "keyword": keyword,
                "relevant": True,
                "wikipedia": None,
                "arxiv_papers": [],
                "beginner_explanation": "",
                "domain": "general",
                "fetched_at": self._ts(),
            }

            # After producing result, hand off to BackendCoreAgent for caching
            handoffs.append((
                "BackendCoreAgent",
                AgentInput(
                    task="cache_research_result",
                    context={"keyword": keyword, "result": result},
                    sender=self.agent_name,
                    thread_id=input.thread_id,
                ),
            ))

            return AgentOutput(
                agent=self.agent_name,
                status="success",
                summary=(
                    f"Research synthesised for '{keyword}'. "
                    f"{len(result['arxiv_papers'])} arXiv paper(s) found."
                ),
                artifacts={"research": result},
                handoffs=handoffs,
                metadata={"fetched_at": self._ts()},
            )

        elif task == "batch_prefetch":
            keywords = context.get("keywords", [])
            results = []
            for kw in keywords:
                out = self.run(AgentInput(
                    task="research_keyword",
                    context={"keyword": kw},
                    sender=self.agent_name,
                    thread_id=input.thread_id,
                ))
                results.append(out.artifacts.get("research"))

            return AgentOutput(
                agent=self.agent_name,
                status="success",
                summary=f"Pre-fetched research for {len(results)} keyword(s).",
                artifacts={"results": results},
                handoffs=[],
                metadata={"batch_at": self._ts()},
            )

        elif task == "standup_update":
            return AgentOutput(
                agent=self.agent_name,
                status="success",
                summary=(
                    "Research: 12 keywords pre-fetched and cached. "
                    "Wikipedia API latency nominal. "
                    "arXiv returning results for CS/ML keywords. "
                    "No blockers."
                ),
                artifacts={},
                handoffs=[],
            )

        return AgentOutput(
            agent=self.agent_name,
            status="error",
            summary=f"Unrecognised Research task: {task}",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Orchestrator: Sprint loop
# ─────────────────────────────────────────────────────────────────────────────

def run_project_loop(
    sprint_number: int,
    backlog: list[dict[str, Any]],
    sprint_goal: str = "",
    velocity: int = 40,
    daily_standup: bool = True,
) -> dict[str, Any]:
    """
    Orchestrate a full ContextLens sprint using the registered agents.

    This function mirrors how the PM Agent would coordinate the team across
    the lifetime of a sprint:

      Phase 1  — Sprint planning: PMAgent assigns tasks to sub-agents.
      Phase 2  — Implementation: sub-agents execute in dependency order.
      Phase 3  — Daily standup: PMAgent collects and posts updates.
      Phase 4  — PR review: LeadDevAgent reviews all completed work.
      Phase 5  — QA: QAAgent generates and runs tests.
      Phase 6  — Retrospective: PMAgent produces the sprint report.

    Parameters
    ----------
    sprint_number : int
        Sprint identifier (1-indexed).
    backlog       : list[dict]
        Ordered list of ticket dicts, each with at minimum:
        { id, title, description, story_points, priority,
          assigned_agent, acceptance_criteria }.
    sprint_goal   : str
        One-sentence description of what this sprint delivers.
    velocity      : int
        Maximum story points to pull into the sprint (default: 40).
    daily_standup : bool
        Whether to simulate a standup collection cycle (default: True).

    Returns
    -------
    dict
        Sprint report with keys: sprint_number, completed, incomplete,
        velocity_achieved, blockers_encountered, retrospective.
    """
    pm: PMAgent = AGENT_REGISTRY["PMAgent"]  # type: ignore[assignment]
    lead: LeadDevAgent = AGENT_REGISTRY["LeadDevAgent"]  # type: ignore[assignment]
    qa: QAAgent = AGENT_REGISTRY["QAAgent"]  # type: ignore[assignment]

    sprint_log: list[str] = []
    all_outputs: list[AgentOutput] = []
    blockers: list[dict[str, Any]] = []
    completed_tickets: list[dict] = []
    incomplete_tickets: list[dict] = []

    # ── Phase 1: Sprint planning ──────────────────────────────────────────────
    sprint_log.append(f"[{_utcnow()}] Phase 1: Sprint {sprint_number} planning started.")

    # Select tickets up to velocity cap
    selected: list[dict] = []
    points_used = 0
    for ticket in backlog:
        pts = ticket.get("story_points", 0)
        if points_used + pts <= velocity:
            selected.append(ticket)
            points_used += pts

    plan_output = pm.run(AgentInput(
        task="sprint_plan",
        context={
            "sprint_number": sprint_number,
            "sprint_goal": sprint_goal,
            "backlog": selected,
            "velocity": velocity,
        },
        sender="orchestrator",
        thread_id=f"sprint-{sprint_number}",
    ))
    all_outputs.append(plan_output)
    sprint_log.append(f"[{_utcnow()}] Sprint plan: {plan_output.summary}")

    # ── Phase 2: Implementation ───────────────────────────────────────────────
    sprint_log.append(f"[{_utcnow()}] Phase 2: Implementation started.")

    impl_outputs: dict[str, AgentOutput] = {}
    pending_handoffs = list(plan_output.handoffs)

    # Process handoffs in dependency order (BFS over the handoff graph)
    seen_threads: set[str] = set()
    while pending_handoffs:
        agent_name, agent_input = pending_handoffs.pop(0)

        thread_key = f"{agent_name}:{agent_input.thread_id}"
        if thread_key in seen_threads:
            # Avoid circular handoffs
            continue
        seen_threads.add(thread_key)

        target_agent = AGENT_REGISTRY.get(agent_name)
        if target_agent is None:
            sprint_log.append(f"[{_utcnow()}] WARNING: Agent '{agent_name}' not found.")
            continue

        output = target_agent.run(agent_input)
        all_outputs.append(output)
        impl_outputs[agent_name] = output
        sprint_log.append(f"[{_utcnow()}] {agent_name}: {output.summary}")

        if output.status == "blocked":
            blocker = {
                "agent": agent_name,
                "task": agent_input.task,
                "description": output.summary,
            }
            blockers.append(blocker)
            # Triage the blocker via PMAgent
            triage = pm.run(AgentInput(
                task="blocker_triage",
                context={
                    "blocked_agent": agent_name,
                    "blocker_description": output.summary,
                },
                sender="orchestrator",
                thread_id=f"sprint-{sprint_number}-blocker",
            ))
            sprint_log.append(f"[{_utcnow()}] Blocker triaged: {triage.summary}")

        # Queue any downstream handoffs
        pending_handoffs.extend(output.handoffs)

    # ── Phase 3: Daily standup ────────────────────────────────────────────────
    if daily_standup:
        sprint_log.append(f"[{_utcnow()}] Phase 3: Daily standup.")
        standup_output = pm.run(AgentInput(
            task="standup",
            context={"sprint_number": sprint_number},
            sender="orchestrator",
            thread_id=f"sprint-{sprint_number}-standup",
        ))
        all_outputs.append(standup_output)
        sprint_log.append(
            f"[{_utcnow()}] Standup complete.\n{standup_output.summary}"
        )

    # ── Phase 4: PR reviews ───────────────────────────────────────────────────
    sprint_log.append(f"[{_utcnow()}] Phase 4: PR reviews.")
    for ticket in selected:
        pr_number = ticket.get("pr_number")
        if pr_number:
            review = lead.run(AgentInput(
                task="pr_review",
                context={"pr_number": pr_number, "ticket": ticket},
                sender="orchestrator",
                thread_id=f"sprint-{sprint_number}-pr-{pr_number}",
            ))
            all_outputs.append(review)
            sprint_log.append(
                f"[{_utcnow()}] PR #{pr_number} review: {review.summary}"
            )
            if review.status == "blocked":
                incomplete_tickets.append(ticket)
            else:
                completed_tickets.append(ticket)

    # ── Phase 5: QA ──────────────────────────────────────────────────────────
    sprint_log.append(f"[{_utcnow()}] Phase 5: QA coverage run.")
    qa_output = qa.run(AgentInput(
        task="coverage_report",
        context={"sprint_number": sprint_number, "tickets": selected},
        sender="orchestrator",
        thread_id=f"sprint-{sprint_number}-qa",
    ))
    all_outputs.append(qa_output)
    sprint_log.append(f"[{_utcnow()}] QA: {qa_output.summary}")

    # Fan out any bug reports from QA to responsible agents
    for agent_name, bug_input in qa_output.handoffs:
        fix_output = AGENT_REGISTRY[agent_name].run(bug_input)
        all_outputs.append(fix_output)
        sprint_log.append(f"[{_utcnow()}] Bug fix by {agent_name}: {fix_output.summary}")

    # ── Phase 6: Retrospective ────────────────────────────────────────────────
    sprint_log.append(f"[{_utcnow()}] Phase 6: Sprint retrospective.")
    retro_output = pm.run(AgentInput(
        task="retrospective",
        context={
            "sprint_number": sprint_number,
            "completed": completed_tickets,
            "incomplete": incomplete_tickets,
            "blockers": blockers,
            "qa_coverage": qa_output.artifacts,
            "all_summaries": [o.summary for o in all_outputs],
        },
        sender="orchestrator",
        thread_id=f"sprint-{sprint_number}-retro",
    ))
    all_outputs.append(retro_output)
    sprint_log.append(f"[{_utcnow()}] Retrospective: {retro_output.summary}")

    # ── Final sprint report ───────────────────────────────────────────────────
    return {
        "sprint_number": sprint_number,
        "sprint_goal": sprint_goal,
        "velocity_planned": velocity,
        "velocity_achieved": sum(
            t.get("story_points", 0) for t in completed_tickets
        ),
        "completed": [t["id"] for t in completed_tickets],
        "incomplete": [t["id"] for t in incomplete_tickets],
        "blockers_encountered": blockers,
        "qa_coverage": qa_output.artifacts,
        "retrospective": retro_output.summary,
        "sprint_log": sprint_log,
    }


def _utcnow() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# Example usage
# ─────────────────────────────────────────────────────────────────────────────

EXAMPLE_BACKLOG: list[dict[str, Any]] = [
    {
        "id": "CL-001",
        "title": "implement_feature",
        "description": "Build VideoPlayer component with keyboard shortcut support",
        "story_points": 8,
        "priority": "P1",
        "status": "todo",
        "assigned_agent": "FrontendDevAgent",
        "component": "VideoPlayer",
        "acceptance_criteria": [
            "Video plays and pauses with Space key",
            "Left/Right arrows seek ±5 seconds",
            "Keyword pips appear on seek bar",
        ],
        "pr_number": 42,
    },
    {
        "id": "CL-002",
        "title": "implement_feature",
        "description": "Implement keyword detection pipeline stages 1–3",
        "story_points": 13,
        "priority": "P1",
        "status": "todo",
        "assigned_agent": "BackendCoreAgent",
        "acceptance_criteria": [
            "keywords.json loads on startup",
            "whisper.cpp transcription spawns correctly",
            "Matches are inserted into keyword_matches table",
            "cl:keyword:match IPC events emitted in real time",
        ],
        "pr_number": 43,
    },
    {
        "id": "CL-003",
        "title": "implement_feature",
        "description": "Build StickyNote component with drag, resize, and persistence",
        "story_points": 8,
        "priority": "P1",
        "status": "todo",
        "assigned_agent": "FrontendDevAgent",
        "component": "StickyNote",
        "acceptance_criteria": [
            "Notes are draggable by pointer events",
            "Position persists after app restart",
            "Delete with non-empty content shows confirmation",
        ],
        "pr_number": 44,
    },
    {
        "id": "CL-004",
        "title": "implement_feature",
        "description": "Build GapBar component with density colour scale",
        "story_points": 5,
        "priority": "P2",
        "status": "todo",
        "assigned_agent": "FrontendDevAgent",
        "component": "GapBar",
        "acceptance_criteria": [
            "Segments render with green/amber/red scale",
            "Clicking a segment seeks the video",
            "Tooltip shows top 3 keywords",
        ],
        "pr_number": 45,
    },
    {
        "id": "CL-005",
        "title": "implement_feature",
        "description": "Implement gap computation (pipeline stage 4)",
        "story_points": 5,
        "priority": "P2",
        "status": "todo",
        "assigned_agent": "BackendCoreAgent",
        "acceptance_criteria": [
            "10-second bucket normalisation correct",
            "Consecutive low-density buckets grouped",
            "gap_segments table populated after transcription",
        ],
        "pr_number": 46,
    },
    {
        "id": "CL-006",
        "title": "research_keyword",
        "description": "Pre-fetch research for top 20 ML keywords in the sample video",
        "story_points": 3,
        "priority": "P3",
        "status": "todo",
        "assigned_agent": "ResearchAgent",
        "acceptance_criteria": [
            "Wikipedia summaries cached for all 20 keywords",
            "At least 1 arXiv paper per ML keyword",
            "Beginner explanations written and stored",
        ],
    },
]


if __name__ == "__main__":
    print("ContextLens Agent System")
    print(f"Registered agents: {list(AGENT_REGISTRY.keys())}")
    print()

    report = run_project_loop(
        sprint_number=1,
        backlog=EXAMPLE_BACKLOG,
        sprint_goal=(
            "Deliver a working video annotation prototype with keyword detection, "
            "sticky notes, and the gap bar."
        ),
        velocity=40,
        daily_standup=True,
    )

    print(json.dumps(
        {k: v for k, v in report.items() if k != "sprint_log"},
        indent=2,
    ))
    print("\n--- Sprint Log ---")
    for line in report["sprint_log"]:
        print(line)