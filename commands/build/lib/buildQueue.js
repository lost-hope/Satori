const { randomUUID } = require('node:crypto');

// Generischer FIFO-Limiter. Der Slot-Release-Mechanismus liegt zentral in _start()/finally -
// ein werfendes run() kann eine Warteschlangen-Position dadurch nie dauerhaft blockieren, anders
// als beim vorherigen Muster mit drei unabhängigen isCommandRunning-Flags ohne try/finally.
class BuildQueue {
    constructor({ maxConcurrent = 1 } = {}) {
        this.maxConcurrent = maxConcurrent;
        this.running = new Map();
        this.pending = [];
    }

    enqueue({ label, onQueued, onStart, run }) {
        const job = { id: randomUUID(), label, run, onStart, enqueuedAt: Date.now() };

        if (this.running.size < this.maxConcurrent) {
            this._start(job);
        } else {
            this.pending.push(job);
            if (typeof onQueued === 'function') {
                try {
                    onQueued(this.pending.length);
                } catch (err) {
                    console.error('buildQueue onQueued handler failed:', err);
                }
            }
        }

        return { jobId: job.id };
    }

    _start(job) {
        this.running.set(job.id, job);
        if (typeof job.onStart === 'function') {
            try {
                job.onStart();
            } catch (err) {
                console.error('buildQueue onStart handler failed:', err);
            }
        }
        Promise.resolve()
            .then(() => job.run({ jobId: job.id }))
            .catch((err) => {
                console.error(`Build-Job '${job.label}' ist fehlgeschlagen:`, err);
            })
            .finally(() => {
                this.running.delete(job.id);
                this._tryStartNext();
            });
    }

    _tryStartNext() {
        if (this.pending.length === 0) return;
        if (this.running.size >= this.maxConcurrent) return;
        this._start(this.pending.shift());
    }

    getStatus() {
        return {
            runningCount: this.running.size,
            queuedCount: this.pending.length,
            queue: this.pending.map((job) => ({ label: job.label, enqueuedAt: job.enqueuedAt })),
        };
    }
}

let config = {};
try {
    config = require('../../../config.json');
} catch {
    config = {};
}

const singleton = new BuildQueue({ maxConcurrent: config.buildConcurrency ?? 1 });
singleton.BuildQueue = BuildQueue;

module.exports = singleton;
