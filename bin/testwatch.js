#!/usr/bin/env node
'use strict';
// The old name for `kurtest`, kept so setups from before the rename keep working.
require('../lib/cli').main(process.argv.slice(2), 'testwatch');
