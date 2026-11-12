'use strict';
// Turn `testwatch -- <args>` back into one command line for the shell that will run it, keeping each
// argument whole (quotes, spaces and all).

// POSIX shells (macOS, Linux, Git Bash on Windows): single quotes, with ' written as '\''.
const posix = a => (a === '' ? "''" : /[^\w@%+=:,./-]/.test(a) ? `'${a.replace(/'/g, `'\\''`)}'` : a);

// cmd.exe: double quotes, with the backslash rules Windows programs use to read their arguments.
const cmd = a => {
  if (a !== '' && !/[\s"&|<>^()%!,;=]/.test(a)) return a;
  return '"' + a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1').replace(/%/g, '"%"') + '"';
};

// On Windows, a command typed in Git Bash runs in bash (so ./tests/run.sh works); otherwise in cmd.exe.
function commandFor(args, { platform = process.platform, env = process.env } = {}) {
  if (platform === 'win32' && !env.MSYSTEM) return { command: args.map(cmd).join(' '), shell: true };
  return { command: args.map(posix).join(' '), shell: platform === 'win32' ? 'bash' : true };
}

module.exports = { commandFor, posix, cmd };
