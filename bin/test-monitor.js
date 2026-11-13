#!/usr/bin/env node
'use strict';
// The old name for `kurtest serve`, kept so setups from before the rename keep working. It keeps the old
// defaults too: listening on every address, the page open to the local network, and no token made for you.
require('../lib/serve').serve(process.argv.slice(2), { legacy: true });
