const test = require('node:test');
const assert = require('node:assert/strict');
const { BuildQueue } = require('../../commands/build/lib/buildQueue');

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

test('buildQueue: respektiert maxConcurrent', async () => {
    const queue = new BuildQueue({ maxConcurrent: 2 });
    let concurrent = 0;
    let maxObserved = 0;
    const jobsDone = [];

    for (let i = 0; i < 5; i++) {
        const { jobId } = queue.enqueue({
            label: `job-${i}`,
            run: async () => {
                concurrent++;
                maxObserved = Math.max(maxObserved, concurrent);
                await delay(30);
                concurrent--;
                jobsDone.push(i);
            },
        });
        assert.ok(jobId);
    }

    while (queue.getStatus().runningCount > 0 || queue.getStatus().queuedCount > 0) {
        await delay(10);
    }

    assert.ok(maxObserved <= 2, `maxObserved war ${maxObserved}, erwartet <= 2`);
    assert.equal(jobsDone.length, 5);
});

test('buildQueue: FIFO-Reihenfolge bei maxConcurrent=1', async () => {
    const queue = new BuildQueue({ maxConcurrent: 1 });
    const order = [];

    for (let i = 0; i < 4; i++) {
        queue.enqueue({
            label: `job-${i}`,
            run: async () => {
                order.push(i);
                await delay(10);
            },
        });
    }

    while (queue.getStatus().runningCount > 0 || queue.getStatus().queuedCount > 0) {
        await delay(5);
    }

    assert.deepEqual(order, [0, 1, 2, 3]);
});

test('buildQueue: ein werfender Job blockiert die Queue nicht dauerhaft', async () => {
    const queue = new BuildQueue({ maxConcurrent: 1 });
    let secondRan = false;

    queue.enqueue({
        label: 'failing-job',
        run: async () => {
            throw new Error('kaputt');
        },
    });

    queue.enqueue({
        label: 'second-job',
        run: async () => {
            secondRan = true;
        },
    });

    while (queue.getStatus().runningCount > 0 || queue.getStatus().queuedCount > 0) {
        await delay(5);
    }

    assert.equal(secondRan, true);
});

test('buildQueue: onQueued wird mit korrekter Position aufgerufen', async () => {
    const queue = new BuildQueue({ maxConcurrent: 1 });
    const positions = [];

    queue.enqueue({
        label: 'running',
        run: async () => {
            await delay(30);
        },
    });
    queue.enqueue({
        label: 'queued-1',
        onQueued: (pos) => positions.push(pos),
        run: async () => {},
    });
    queue.enqueue({
        label: 'queued-2',
        onQueued: (pos) => positions.push(pos),
        run: async () => {},
    });

    while (queue.getStatus().runningCount > 0 || queue.getStatus().queuedCount > 0) {
        await delay(5);
    }

    assert.deepEqual(positions, [1, 2]);
});
