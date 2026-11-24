'use strict';
// Sends events to the monitor in small batches. It never gets in the way of the tests: if the monitor
// can't be reached, it says so once and keeps trying in the background, less often the longer it lasts,
// so a short outage (a tunnel blip, Wi-Fi) loses nothing, including the run's end.

const MAX_QUEUE = 20000;

class Sender {
  constructor({ url, token, me = 'kurtest', log = msg => process.stderr.write(msg + '\n') }) {
    this.url = url.replace(/\/+$/, '') + '/api/events';
    this.token = token;
    this.log = log;
    this.me = me;
    this.q = [];
    this.busy = null;
    this.failures = 0;
    this.dead = false;
    this.next = 0; // no tries before this time, after failures
    this.warned = false;
    this.timer = setInterval(() => this.flush(), 250);
    this.timer.unref();
  }

  send(ev) {
    if (this.dead) return;
    if (typeof ev.at !== 'number') ev.at = Date.now();
    this.q.push(ev);
  }

  warn(msg) {
    if (this.warned) return;
    this.warned = true;
    this.log(`${this.me}: ${msg} The tests carry on without it.`);
  }

  flush(force = false) {
    if (this.busy) return this.busy;
    if (!this.q.length || this.dead) return Promise.resolve();
    if (!force && Date.now() < this.next) return Promise.resolve();
    const batch = this.q.splice(0);
    const headers = { 'content-type': 'application/json' };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    this.busy = fetch(this.url, { method: 'POST', headers, body: JSON.stringify(batch), signal: AbortSignal.timeout(4000) })
      .then(async res => {
        if (res.ok) { this.failures = 0; this.next = 0; return; }
        const text = (await res.text().catch(() => '')).slice(0, 200);
        if (res.status === 401) { this.dead = true; this.warn('KurTest refused the token (set KURTEST_TOKEN, or run `kurtest token` on the machine running KurTest).'); return; }
        this.warn(`KurTest answered ${res.status}: ${text}`);
      })
      .catch(() => {
        this.failures++;
        this.warn(`can't reach KurTest at ${this.url}.`);
        // Put the batch back in order and try again later: 1s, 2s, 4s ... up to 30s apart.
        this.q.unshift(...batch);
        if (this.q.length > MAX_QUEUE) { this.dead = true; this.q = []; return; }
        this.next = Date.now() + Math.min(30000, 1000 * 2 ** (this.failures - 1));
      })
      .finally(() => { this.busy = null; });
    return this.busy;
  }

  // Up to 5 seconds to deliver what's left. If KurTest has been unreachable for a while, one last try.
  async close() {
    clearInterval(this.timer);
    if (this.busy) await this.busy;
    if (this.failures >= 3) return this.flush(true);
    const until = Date.now() + 5000;
    while (this.q.length && !this.dead && Date.now() < until) {
      const failed = this.failures;
      await this.flush(true);
      if (this.failures > failed) await new Promise(r => setTimeout(r, Math.min(500, Math.max(0, until - Date.now()))));
    }
  }
}

module.exports = { Sender };
