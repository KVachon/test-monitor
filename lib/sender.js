'use strict';
// Sends events to the monitor in small batches. It never gets in the way of the tests:
// if the monitor can't be reached, it says so once and drops the events.

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

  flush() {
    if (this.busy) return this.busy;
    if (!this.q.length || this.dead) return Promise.resolve();
    const batch = this.q.splice(0);
    const headers = { 'content-type': 'application/json' };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    this.busy = fetch(this.url, { method: 'POST', headers, body: JSON.stringify(batch), signal: AbortSignal.timeout(4000) })
      .then(async res => {
        if (res.ok) { this.failures = 0; return; }
        const text = (await res.text().catch(() => '')).slice(0, 200);
        if (res.status === 401) { this.dead = true; this.warn('KurTest refused the token (set KURTEST_TOKEN, or run `kurtest token` on the machine running KurTest).'); return; }
        this.warn(`KurTest answered ${res.status}: ${text}`);
      })
      .catch(() => {
        this.failures++;
        this.warn(`can't reach KurTest at ${this.url}.`);
        if (this.failures >= 3) this.dead = true;
      })
      .finally(() => { this.busy = null; });
    return this.busy;
  }

  async close() {
    clearInterval(this.timer);
    const until = Date.now() + 5000;
    while ((this.q.length || this.busy) && !this.dead && Date.now() < until) await this.flush();
  }
}

module.exports = { Sender };
