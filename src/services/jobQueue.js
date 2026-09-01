/**
 * Simple in-process background job queue for offloading non-critical async work
 * (e.g. notifications, webhooks, heavy background tasks) from the HTTP request path.
 */

let jobCounter = 0;

/**
 * Enqueue a job function to run asynchronously.
 * 
 * @param {Function} jobFn - Async function to execute
 * @param {Object} options - Configuration options
 * @param {number} [options.maxAttempts=3] - Maximum retry attempts
 * @param {number} [options.retryDelayMs=100] - Delay between retry attempts in milliseconds
 * @returns {string} Unique Job ID
 */
function enqueue(jobFn, options = {}) {
  const jobId = `job_${++jobCounter}`;
  const maxAttempts = options.maxAttempts || 3;
  const retryDelayMs = options.retryDelayMs !== undefined ? options.retryDelayMs : 100;

  const job = {
    id: jobId,
    fn: jobFn,
    maxAttempts,
    retryDelayMs,
    attempts: 0
  };

  // Run asynchronously off the main request/response cycle
  setImmediate(() => {
    runJob(job);
  });

  return jobId;
}

async function runJob(job) {
  job.attempts += 1;
  try {
    console.log(`[JobQueue] Processing job ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);
    await job.fn();
    console.log(`[JobQueue] Job ${job.id} completed successfully.`);
  } catch (err) {
    if (job.attempts < job.maxAttempts) {
      console.warn(`[JobQueue] Job ${job.id} failed attempt ${job.attempts}/${job.maxAttempts}: ${err.message}. Retrying in ${job.retryDelayMs}ms...`);
      setTimeout(() => {
        runJob(job);
      }, job.retryDelayMs);
    } else {
      console.error(`[JobQueue] Job ${job.id} failed after ${job.maxAttempts} attempts: ${err.message}`);
    }
  }
}

module.exports = {
  enqueue
};
