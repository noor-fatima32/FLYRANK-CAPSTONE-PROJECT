function errorHandler(err, req, res, next) {
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ error: 'payload exceeds 100kb limit' });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'invalid json payload' });
  }

  console.error('[Error]', err.stack || err.message);
  return res.status(500).json({ error: 'internal server error' });
}

module.exports = errorHandler;

