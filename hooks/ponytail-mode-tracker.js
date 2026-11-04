#!/usr/bin/env node
// ponytail — UserPromptSubmit hook to track which ponytail mode is active
// Inspects user input for /ponytail commands and "stop ponytail" and writes the
// mode to the flag file

const { getDefaultMode, isDeactivationCommand, writeDefaultMode } = require('./ponytail-config');
const { isCodex, readMode, setMode, writeHookOutput } = require('./ponytail-runtime');
const { getPonytailInstructions } = require('./ponytail-instructions');

let input = '';
let done = false;

function finish() {
  if (done) return;
  done = true;
  try {
    // Strip UTF-8 BOM some shells prepend when piping (breaks JSON.parse)
    const data = JSON.parse(input.replace(/^\uFEFF/, ''));
    const prompt = (data.prompt || '').trim().toLowerCase();

    // Match /ponytail commands
    if (/^[/@$]ponytail/.test(prompt)) {
      const parts = prompt.split(/\s+/);
      const cmd = parts[0].replace(/^[@$]/, '/');
      const arg = parts[1] || '';

      let mode = null;
      let isReportOnly = false;

      // /ponytail-review is a one-shot skill, not a session level (#736).
      if (cmd === '/ponytail' || cmd === '/ponytail:ponytail') {
        // `/ponytail default <mode>` persists the default to config (survives
        // restarts). Plain switches stay session-scoped ("sticks until session
        // end"), so this is the only path that writes config. review is not a
        // valid default (#377), so only off/lite/full/ultra are accepted.
        if (arg === 'default') {
          const dmode = parts[2];
          if (dmode === 'off' || dmode === 'lite' || dmode === 'full' || dmode === 'ultra') {
            writeDefaultMode(dmode);
            writeHookOutput('UserPromptSubmit', dmode, 'PONYTAIL DEFAULT SET — new sessions start in ' + dmode + '.');
          }
          return; // don't fall through to the session-mode switch
        }
        if (arg === 'lite') mode = 'lite';
        else if (arg === 'full') mode = 'full';
        else if (arg === 'ultra') mode = 'ultra';
        else if (arg === 'off') mode = 'off';
        else if (arg === '') {
          // Bare /ponytail switches ponytail on: off → the default level (full if
          // the default is off too); already on → keep the level, report it (#639).
          const live = readMode();
          if (live && live !== 'off') {
            isReportOnly = true;
            mode = live;
          } else {
            mode = getDefaultMode() === 'off' ? 'full' : getDefaultMode();
          }
        }
      }

      if (isReportOnly) {
        writeHookOutput('UserPromptSubmit', mode, 'PONYTAIL MODE ACTIVE — level: ' + mode);
      } else if (mode && mode !== 'off') {
        setMode(mode);
        // Codex has no /ponytail command that would load the skill body for the
        // new level, and the SessionStart ruleset is filtered to the start level,
        // so the tracker delivers that level's ruleset along with the confirmation.
        const header = 'PONYTAIL MODE CHANGED — level: ' + mode;
        writeHookOutput(
          'UserPromptSubmit',
          mode,
          isCodex ? header + '\n\n' + getPonytailInstructions(mode) : header,
        );
      } else if (mode === 'off') {
        setMode('off');
        writeHookOutput('UserPromptSubmit', 'off', 'PONYTAIL MODE OFF');
      }
    } else if (isDeactivationCommand(prompt)) {
      setMode('off');
      writeHookOutput('UserPromptSubmit', 'off', 'PONYTAIL MODE OFF');
    }
  } catch (e) {
    // Silent fail
  }
}

process.stdin.on('data', chunk => { input += chunk; });
// Exit on 'end', not just finish(): the fallback timer below must stay ref'd
// (see #790) so it can actually fire when stdin is stuck, and a ref'd timer
// would otherwise keep the process alive for its full 1000ms on this normal
// fast path.
process.stdin.on('end', () => { finish(); process.exit(0); });

// Never hang the session. On Windows, Claude Code runs this hook through a
// PowerShell `if {}` wrapper that can swallow the piped prompt JSON, so stdin
// 'end' never fires and the hook blocks forever — freezing the session (#443).
// On error, or after a short fallback, process whatever arrived (recovering the
// mode if data came without EOF) and exit. The fallback timer MUST stay ref'd:
// on Windows a stuck ref'd stdin handle keeps the event loop alive, and an
// unref'd timer competing with it is never scheduled — so the fallback was
// dead code in exactly the #443/#790 case it exists for, and the hook hung
// until Claude Code's external 5s watchdog killed it (#790). Mirrors the
// best-effort, never-block contract the other lifecycle hooks already follow.
process.stdin.on('error', () => { finish(); process.exit(0); });
setTimeout(() => { finish(); process.exit(0); }, 1000);
