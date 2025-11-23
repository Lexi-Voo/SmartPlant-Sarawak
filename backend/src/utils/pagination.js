function getPagination(
  req,
  { defaultPage = 1, defaultPageSize = 20, maxPageSize = 50 } = {}
) {
  const page = Math.max(1, Number(req.query.page) || defaultPage);
  const requested = Number(req.query.pageSize) || defaultPageSize;
  const pageSize = Math.min(maxPageSize, Math.max(1, requested));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset, limit: pageSize };
}

module.exports = { getPagination };