#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate a sandbox home with FAKE sessions for every supported CLI.

Purpose: README / demo screenshots must never contain real session titles.
The session-history readers all honor env overrides (see electron/sessions/paths.ts),
so a screenshot run can point every CLI at this sandbox and show plausible
but entirely fictional data.

    python tools/make_demo_home.py --out "$TEMP/asc-demo-home"

Then take screenshots with (bash):
    export GROK_HOME="$TEMP/asc-demo-home/grok"
    export CLAUDE_CONFIG_DIR="$TEMP/asc-demo-home/claude"
    export CODEX_HOME="$TEMP/asc-demo-home/codex"
    export KIMI_CODE_HOME="$TEMP/asc-demo-home/kimi"
    export PI_CODING_AGENT_SESSION_DIR="$TEMP/asc-demo-home/pi/sessions"
    export OPENCODE_DATA_DIR="$TEMP/asc-demo-home/opencode"
    export WORKBUDDY_HOME="$TEMP/asc-demo-home/workbuddy"
    bash tools/ui_shots.sh

Antigravity is intentionally left empty (its brain/ format has no generator here).
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import uuid
from datetime import datetime, timedelta, timezone

NOW = datetime(2026, 10, 5, 11, 30, 0, tzinfo=timezone.utc)

CWDS = [
    "C:/dev/agent-session-center",
    "C:/dev/blog-engine",
    "C:/dev/ppt-toolkit",
    "C:/dev/webhook-relay",
]

TITLES = [
    "Refactor auth flow to use PKCE",
    "Fix flaky checkout e2e test",
    "Migrate blog rendering to MDX",
    "Add retry with backoff to webhook client",
    "Instrument API latency histograms",
    "Draft v0.2 release notes",
    "Speed up the sqlite query planner path",
    "Wire Feishu approval cards into the bridge",
    "Replace cron with a debounce queue",
    "Cache bust the theme assets on deploy",
    "Type the websocket event envelope",
    "Split the pricing table into its own route",
    "Pin dependencies and rebuild the lockfile",
    "Add dark mode tokens to the design system",
    "Benchmark jsonl scan against mmap",
    "Harden the PTY resize path",
    "Write a fixture for torn trailing lines",
    "Document the resume contract for adapters",
    "Move cost estimation into the catalogue",
    "Trim the renderer bundle below 900kb",
    "Batch the token usage upsert",
    "Swap session search to fts5",
    "Guard against clock-skewed timestamps",
    "Generate the wordmark at build time",
    "Dry-run the windows installer on a clean vm",
    "Add a preflight for missing cwds",
    "Collapse sidebar state into settings",
    "Memoize the session list sort",
]

MODELS = {
    "claude": "claude-sonnet-4-5",
    "grok": "grok-4-fast",
    "codex": "gpt-5.2-codex",
    "kimi": "kimi-k2",
    "pi": "pi-1",
    "opencode": "qwen-local",
    "workbuddy": "glm-5.3-flash",
}


def iso(minutes_ago: int) -> str:
    return (NOW - timedelta(minutes=minutes_ago)).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def ms(minutes_ago: int) -> int:
    return int((NOW - timedelta(minutes=minutes_ago)).timestamp() * 1000)


def w(path: str, data, binary=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mode = "wb" if binary else "w"
    if binary:
        open(path, mode).write(data)
    else:
        with open(path, mode, encoding="utf-8", newline="\n") as f:
            f.write(data)


def take_titles(n: int, offset: int):
    out = []
    for i in range(n):
        out.append(TITLES[(offset + i) % len(TITLES)].capitalize() if False else TITLES[(offset + i) % len(TITLES)])
    return out


def gen_claude(root: str):
    # $CLAUDE_CONFIG_DIR/projects/<slug>/<uuid>.jsonl
    offset = 0
    for cwd in CWDS[:2]:
        slug = cwd.replace(":", "").replace("/", "-").lstrip("-")
        for title in take_titles(3, offset):
            offset += 1
            sid = str(uuid.uuid4())
            start = 90 - offset * 7
            lines = [
                json.dumps({
                    "type": "user", "timestamp": iso(start), "cwd": cwd,
                    "sessionId": sid,
                    "message": {"role": "user", "content": title},
                }),
                json.dumps({
                    "type": "assistant", "timestamp": iso(start - 2), "cwd": cwd,
                    "sessionId": sid,
                    "message": {"role": "assistant", "model": MODELS["claude"],
                                "content": [{"type": "text", "text": "On it."}],
                                "usage": {"input_tokens": 5200, "output_tokens": 640,
                                          "cache_creation_input_tokens": 800,
                                          "cache_read_input_tokens": 2100}},
                }),
                json.dumps({
                    "type": "user", "timestamp": iso(start - 4), "cwd": cwd,
                    "sessionId": sid,
                    "message": {"role": "user", "content": "looks good, ship it"},
                }),
            ]
            w(os.path.join(root, "claude", "projects", slug, f"{sid}.jsonl"),
              "\n".join(lines) + "\n")


def gen_grok(root: str):
    # $GROK_HOME/sessions/<encoded-cwd>/<session-id>/{summary.json,usage.json,updates.jsonl}
    offset = 3
    for cwd in CWDS:
        group = cwd.replace(":", "").replace("/", "%5C").replace("\\", "%5C")
        for _ in range(2):
            title = TITLES[offset % len(TITLES)]
            offset += 1
            sid = str(uuid.uuid4())
            start = 120 - offset * 9
            d = os.path.join(root, "grok", "sessions", group, sid)
            w(os.path.join(d, "summary.json"), json.dumps({
                "info": {"id": sid, "cwd": cwd},
                "session_summary": title,
                "created_at": iso(start),
                "updated_at": iso(start - 6),
                "num_messages": 11,
                "num_chat_messages": 9,
                "current_model_id": MODELS["grok"],
            }))
            w(os.path.join(d, "usage.json"), json.dumps({
                "sessionId": sid, "updatedAt": iso(start - 6),
                "session": {"inputTokens": 23400, "outputTokens": 2140,
                            "cachedReadTokens": 1280, "reasoningTokens": 620,
                            "totalTokens": 25540, "modelCalls": 9,
                            "costUsdTicks": 470000000,
                            "primaryModelId": MODELS["grok"]},
            }))
            w(os.path.join(d, "updates.jsonl"), json.dumps({
                "event": "user_message_chunk",
                "params": {"update": {"content": {"text": title}}},
            }) + "\n")


CODEX_SCHEMA = """
create table threads (
  id text primary key, rollout_path text, created_at integer, updated_at integer,
  cwd text, title text, name text, preview text, first_user_message text,
  model text, model_provider text, tokens_used integer, archived integer,
  thread_source text, source text
);
create table thread_spawn_edges (parent_thread_id text, child_thread_id text);
"""


def gen_codex(root: str):
    # $CODEX_HOME/state_5.sqlite + sessions/<Y>/<M>/<D>/rollout-*.jsonl
    os.makedirs(os.path.join(root, "codex"), exist_ok=True)
    db = sqlite3.connect(os.path.join(root, "codex", "state_5.sqlite"))
    db.executescript(CODEX_SCHEMA)
    offset = 0
    for title in take_titles(8, 7):
        offset += 1
        sid = str(uuid.uuid4())
        start = 150 - offset * 11
        day = (NOW - timedelta(minutes=start))
        rel = os.path.join("sessions", f"{day.year:04d}", f"{day.month:02d}", f"{day.day:02d}")
        fname = f"rollout-{day.strftime('%Y-%m-%dT%H-%M-%S')}-{sid}.jsonl"
        rollout = os.path.join(root, "codex", rel, fname)
        tail = json.dumps({
            "payload": {"info": {"total_token_usage": {
                "input_tokens": 4100, "cached_input_tokens": 900,
                "output_tokens": 520, "reasoning_output_tokens": 140}}}
        })
        w(rollout, json.dumps({
            "timestamp": iso(start), "cwd": CWDS[offset % len(CWDS)],
            "session_id": sid,
            "payload": {"type": "user_message", "message": title},
        }) + "\n" + tail + "\n")
        db.execute(
            "insert into threads values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (sid, rollout.replace("/", "\\") if os.name == "nt" else rollout,
             ms(start), ms(start - 5), CWDS[offset % len(CWDS)], title, None,
             title[:60], title, MODELS["codex"], "openai", 4620, 0,
             "local", "cli"))
    db.commit()
    db.close()


def gen_kimi(root: str):
    # $KIMI_CODE_HOME/sessions/wd_*/session_*/state.json (+ agents/main/wire.jsonl)
    offset = 2
    for title in take_titles(3, 15):
        sid = str(uuid.uuid4())
        start = 200 - offset * 13
        offset += 1
        d = os.path.join(root, "kimi", "sessions", "wd_C--dev-demo", f"session_{sid}")
        w(os.path.join(d, "state.json"), json.dumps({
            "id": sid, "title": title, "cwd": "C:/dev/blog-engine",
            "model": MODELS["kimi"], "messageCount": 9,
            "usage": {"input": 5230, "output": 840, "cacheRead": 1150, "reasoning": 160},
        }))
        w(os.path.join(d, "agents", "main", "wire.jsonl"),
          json.dumps({"role": "user", "text": title}) + "\n")


def gen_pi(root: str):
    # $PI_CODING_AGENT_SESSION_DIR/<project>/<stamp>_<uuid>.jsonl
    offset = 0
    for title in take_titles(2, 19):
        offset += 1
        sid = str(uuid.uuid4())
        start = 240 - offset * 15
        base = NOW - timedelta(minutes=start)
        stamp = base.strftime("%Y-%m-%dT%H-%M-%S") + "-000Z"
        lines = [
            json.dumps({"role": "user", "timestamp": iso(start),
                        "cwd": "C:/dev/webhook-relay", "model": MODELS["pi"],
                        "content": title}),
            json.dumps({"role": "assistant", "timestamp": iso(start - 3),
                        "cwd": "C:/dev/webhook-relay", "model": MODELS["pi"],
                        "content": "Done.",
                        "usage": {"input": 3100, "output": 420,
                                  "cache_read_input_tokens": 700}}),
        ]
        w(os.path.join(root, "pi", "sessions", "demo-project",
                       f"{stamp}_{sid}.jsonl"), "\n".join(lines) + "\n")


OPENCODE_SCHEMA = """
create table session (
  id text primary key, parent_id text, directory text, path text,
  title text, agent text, model text, cost real,
  tokens_input integer, tokens_output integer, tokens_reasoning integer,
  tokens_cache_read integer, tokens_cache_write integer,
  time_created integer, time_updated integer, time_archived integer
);
create table message (session_id text, id text);
"""


def gen_opencode(root: str):
    os.makedirs(os.path.join(root, "opencode"), exist_ok=True)
    db = sqlite3.connect(os.path.join(root, "opencode", "opencode.db"))
    db.executescript(OPENCODE_SCHEMA)
    offset = 5
    for title in take_titles(4, 21):
        offset += 1
        sid = str(uuid.uuid4())
        start = 300 - offset * 17
        db.execute(
            "insert into session values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (sid, None, "C:/dev/ppt-toolkit", "C:/dev/ppt-toolkit", title,
             "build", json.dumps({"id": MODELS["opencode"], "providerID": "colasoft"}),
             0.13, 3840, 610, 120, 940, 0, ms(start), ms(start - 4), None))
        for m in range(6):
            db.execute("insert into message values (?,?)", (sid, f"m{m}"))
    db.commit()
    db.close()


WORKBUDDY_SCHEMA = """
create table sessions (
  id text primary key, cwd text, title text, custom_title text,
  created_at integer, updated_at integer, last_activity_at integer,
  model text, deleted_at integer
);
"""


def gen_workbuddy(root: str):
    os.makedirs(os.path.join(root, "workbuddy"), exist_ok=True)
    db = sqlite3.connect(os.path.join(root, "workbuddy", "workbuddy.db"))
    db.executescript(WORKBUDDY_SCHEMA)
    offset = 9
    for title in take_titles(3, 24):
        offset += 1
        start = 400 - offset * 19
        db.execute(
            "insert into sessions values (?,?,?,?,?,?,?,?,NULL)",
            (str(uuid.uuid4()), "C:/dev/agent-session-center", title, None,
             ms(start), ms(start - 6), ms(start - 6), MODELS["workbuddy"]))
    db.commit()
    db.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", required=True, help="sandbox root to create")
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    if os.path.exists(out):
        print(f"refusing to overwrite existing {out}; pass a fresh path", file=sys.stderr)
        return 2
    gen_claude(out)
    gen_grok(out)
    gen_codex(out)
    gen_kimi(out)
    gen_pi(out)
    gen_opencode(out)
    gen_workbuddy(out)
    total = sum(len(files) for _, _, files in os.walk(out))
    print(f"demo home ready: {out}  ({total} files)")
    print("export GROK_HOME={0}/grok CLAUDE_CONFIG_DIR={0}/claude CODEX_HOME={0}/codex "
          "KIMI_CODE_HOME={0}/kimi PI_CODING_AGENT_SESSION_DIR={0}/pi/sessions "
          "OPENCODE_DATA_DIR={0}/opencode WORKBUDDY_HOME={0}/workbuddy".format(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
