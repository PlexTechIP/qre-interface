// @vitest-environment node

/**
 * The block an analyst pastes into their MCP client.
 *
 * Nobody can check this by reading it: they paste it and either the agent
 * connects or it does not. So the properties worth holding are the ones a
 * wrong answer would violate silently — that the command is this app's own
 * runtime rather than a node the machine may not have, that a path with a
 * space in it survives the shell, and that a problem is REPORTED rather than
 * producing a block that looks fine and fails at the first tool call.
 */

import { describe, expect, it } from "vitest";

import { buildMcpSetup } from "./mcpSetup.js";

const PATHS = {
  executablePath: "/Applications/QRE Interface.app/Contents/MacOS/QRE Interface",
  serverBundlePath: "/Applications/QRE Interface.app/Contents/Resources/mcp-server.mjs",
  runDatabasePath: "/Users/an analyst/Library/Application Support/qre/run-history.sqlite",
  hasSavedRuns: true,
  pythonBinPath:
    "/Applications/QRE Dashboard.app/Contents/Resources/python/.venv/bin/python3",
  // Off by default, like the checkbox: every test above is about the block an
  // analyst gets without opting into anything.
  allowRuns: false,
};

const everythingExists = (): boolean => true;

describe("the MCP setup block", () => {
  it("launches the app's own runtime, not a node from the machine", () => {
    // The whole reason a packaged app can ship without asking the analyst to
    // install anything: Electron embeds the Node that node:sqlite needs.
    const setup = buildMcpSetup({ ...PATHS, exists: everythingExists });

    expect(setup.entry.command).toBe(PATHS.executablePath);
    expect(setup.entry.env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(setup.entry.args).toEqual([PATHS.serverBundlePath]);
  });

  it("names the database this install actually opened", () => {
    const setup = buildMcpSetup({ ...PATHS, exists: everythingExists });

    expect(setup.entry.env.QRE_DB_PATH).toBe(PATHS.runDatabasePath);
  });

  it("quotes every path in the shell command", () => {
    // Two of these three paths contain a space in the fixture, which is what a
    // real install directory looks like.
    const command = buildMcpSetup({ ...PATHS, exists: everythingExists })
      .claudeCodeCommand;

    expect(command).toContain(`'${PATHS.executablePath}'`);
    expect(command).toContain(`'${PATHS.serverBundlePath}'`);
    expect(command).toContain(`QRE_DB_PATH='${PATHS.runDatabasePath}'`);
  });

  it("survives an apostrophe in a path", () => {
    const runDatabasePath = "/Users/o'brien/qre/run-history.sqlite";

    const command = buildMcpSetup({
      ...PATHS,
      runDatabasePath,
      exists: everythingExists,
    }).claudeCodeCommand;

    // The POSIX escape: close the quote, emit an escaped quote, reopen.
    expect(command).toContain(`QRE_DB_PATH='/Users/o'\\''brien/qre/run-history.sqlite'`);
  });

  it("emits a config block a client can parse", () => {
    const parsed = JSON.parse(
      buildMcpSetup({ ...PATHS, exists: everythingExists }).configJson,
    ) as {
      mcpServers: Record<
        string,
        { command: string; args: string[]; env: Record<string, string> }
      >;
    };

    const entry = parsed.mcpServers["qre-dashboard"];
    expect(entry?.command).toBe(PATHS.executablePath);
    expect(entry?.env.ELECTRON_RUN_AS_NODE).toBe("1");
  });

  it("says nothing is wrong when nothing is", () => {
    expect(buildMcpSetup({ ...PATHS, exists: everythingExists }).problems).toEqual([]);
  });

  it("reports a missing server bundle as a packaging fault", () => {
    // An analyst cannot fix this, so the message must not send them looking.
    const setup = buildMcpSetup({
      ...PATHS,
      exists: (target) => target !== PATHS.serverBundlePath,
    });

    expect(setup.problems.join(" ")).toMatch(/not part of this install/i);
  });

  it("still emits a usable block before the first run is saved", () => {
    // qre_list_benchmarks answers with no runs at all, so setting the agent up
    // early has to work — but the analyst should know what they will see.
    //
    // Asked as "are there runs", not "is there a file": SQLite creates the
    // database when the store opens it, and main opens the store before it
    // builds this, so a first launch has a real but EMPTY file. File existence
    // could never see the case this note is for.
    const setup = buildMcpSetup({ ...PATHS, hasSavedRuns: false, exists: everythingExists });

    expect(setup.problems.join(" ")).toMatch(/no runs are saved/i);
    expect(setup.entry.env.QRE_DB_PATH).toBe(PATHS.runDatabasePath);
    expect(setup.claudeCodeCommand).toContain("claude mcp add");
  });

  describe("when the app is packaged into an asar archive", () => {
    const ARCHIVED =
      "/Applications/QRE Interface.app/Contents/Resources/app.asar/dist-electron/mcp-server.mjs";
    const UNPACKED = ARCHIVED.replace("app.asar/", "app.asar.unpacked/");

    it("points at the unpacked twin when packaging left one", () => {
      const setup = buildMcpSetup({
        ...PATHS,
        serverBundlePath: ARCHIVED,
        exists: (target) => target === UNPACKED,
      });

      expect(setup.entry.args).toEqual([UNPACKED]);
      expect(setup.problems).toEqual([]);
    });

    it("refuses to present a path inside the archive as working", () => {
      // The reason this cannot be left to existsSync: Electron patches fs to
      // read INSIDE an asar, so the archived path answers true while `spawn`
      // on it fails with ENOENT. Without this the panel would hand over a
      // block that looks correct and dies at the client.
      const setup = buildMcpSetup({
        ...PATHS,
        serverBundlePath: ARCHIVED,
        exists: (target) => target === ARCHIVED,
      });

      expect(setup.problems.join(" ")).toMatch(/inside this app's archive/i);
    });
  });
});

describe("the Python interpreter", () => {
  it("is always named, because the server's own default is wrong when packaged", () => {
    // `resolvePythonBin` falls back to a path relative to its own module, which
    // is right from a checkout and wrong beside `mcp-server.mjs` in a release.
    const setup = buildMcpSetup({ ...PATHS, exists: everythingExists });

    expect(setup.entry.env.QRE_PYTHON_BIN).toBe(PATHS.pythonBinPath);
    expect(setup.claudeCodeCommand).toContain(
      `QRE_PYTHON_BIN='${PATHS.pythonBinPath}'`,
    );
  });

  it("is in the Codex TOML block too", () => {
    const setup = buildMcpSetup({ ...PATHS, exists: everythingExists });

    expect(setup.codexConfigToml).toContain("QRE_PYTHON_BIN = ");
  });
});

describe("the Codex tool timeout", () => {
  it("sits between args and the env table, and is emitted either way", () => {
    // Codex defaults to 60 seconds and an estimate routinely takes longer, so
    // without this a run that SUCCEEDED is reported to the analyst as a
    // timeout.
    for (const allowRuns of [false, true]) {
      const lines = buildMcpSetup({ ...PATHS, allowRuns, exists: everythingExists })
        .codexConfigToml.split("\n");

      const argsAt = lines.findIndex((line) => line.startsWith("args = "));
      const timeoutAt = lines.indexOf("tool_timeout_sec = 600");
      const blankAt = lines.indexOf("");

      expect(timeoutAt).toBe(argsAt + 1);
      expect(blankAt).toBe(timeoutAt + 1);
    }
  });
});

describe("letting agents run estimates", () => {
  it("says nothing about runs when the analyst has not asked for it", () => {
    const setup = buildMcpSetup({ ...PATHS, exists: everythingExists });

    // Absent rather than "0": absence is what the server reads as off, so
    // turning the toggle back off and re-pasting really does turn it off.
    expect(setup.entry.env).not.toHaveProperty("QRE_MCP_ALLOW_RUNS");
    expect(setup.claudeCodeCommand).not.toContain("QRE_MCP_ALLOW_RUNS");
    expect(setup.problems).toEqual([]);
  });

  it("carries the opt-in in every form of the block when it is on", () => {
    const setup = buildMcpSetup({
      ...PATHS,
      allowRuns: true,
      exists: everythingExists,
    });

    expect(setup.entry.env.QRE_MCP_ALLOW_RUNS).toBe("1");
    expect(setup.claudeCodeCommand).toContain(`--env QRE_MCP_ALLOW_RUNS='1'`);
    expect(setup.codexCommand).toContain(`--env QRE_MCP_ALLOW_RUNS='1'`);
    expect(setup.codexConfigToml).toContain(`QRE_MCP_ALLOW_RUNS = "1"`);
    expect(JSON.parse(setup.configJson)).toMatchObject({
      mcpServers: { "qre-dashboard": { env: { QRE_MCP_ALLOW_RUNS: "1" } } },
    });
    expect(setup.problems).toEqual([]);
  });

  it("makes the Codex command set the tool timeout itself", () => {
    // `codex mcp add` has no timeout flag and rewrites the table on a repeat
    // add, so the one-liner applies the line after the add, idempotently. The
    // Claude Code command needs nothing of the kind.
    const setup = buildMcpSetup({ ...PATHS, exists: everythingExists });

    expect(setup.codexCommand).toMatch(/^codex mcp add /);
    expect(setup.codexCommand).toContain(" && perl -0pi -e '");
    expect(setup.codexCommand).toContain("tool_timeout_sec = 600");
    expect(setup.codexCommand).toContain("(?!tool_timeout_sec)");
    expect(setup.codexCommand).toMatch(/~\/\.codex\/config\.toml$/);
    expect(setup.claudeCodeCommand).not.toContain("perl");
  });

  it("offers Codex a standing instruction without writing it anywhere", () => {
    // Codex finds a custom server's tools only by searching for them and does
    // not show the server's instructions, so a session asked to "run an
    // estimate" can answer from the web. The stanza is offered for AGENTS.md;
    // the command deliberately does not touch that file.
    const setup = buildMcpSetup({ ...PATHS, exists: everythingExists });

    expect(setup.codexAgentsInstruction).toContain("qre-dashboard MCP server");
    expect(setup.codexAgentsInstruction).toContain("qre_run_estimate");
    expect(setup.codexAgentsInstruction).toMatch(/trapped ion/i);
    expect(setup.codexCommand).not.toContain("AGENTS.md");
    expect(setup.claudeCodeCommand).not.toContain("AGENTS.md");
  });

  it("reports a missing Python environment, but only when runs are on", () => {
    const noPython = (target: string): boolean => target !== PATHS.pythonBinPath;

    const enabled = buildMcpSetup({ ...PATHS, allowRuns: true, exists: noPython });
    expect(enabled.problems.join(" ")).toMatch(/setup_venv\.sh/);
    expect(enabled.problems.join(" ")).toMatch(/QRE_PYTHON_BIN/);

    // With runs off the interpreter is never used, so saying it is missing
    // would be noise on a block that works perfectly.
    const disabled = buildMcpSetup({ ...PATHS, allowRuns: false, exists: noPython });
    expect(disabled.problems).toEqual([]);
  });
});
