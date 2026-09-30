const { run } = require('./lib/buildJob');

run().catch((err) => {
    console.error('Unexpected error in build job:', err);
    process.exitCode = 1;
});
