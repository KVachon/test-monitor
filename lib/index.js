'use strict';
// For embedding KurTest in your own tooling. Most people want the `kurtest` command instead.
const { createMonitor } = require('./server');
const { Sender } = require('./sender');
const { normalize } = require('./events');
module.exports = { createMonitor, Sender, normalize };
