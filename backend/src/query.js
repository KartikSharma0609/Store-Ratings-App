function listClauses(q, filterCols, sortCols, params) {
  const where = [];
  for (const c of filterCols) {
    if (!q[c]) continue;
    if (c === 'role') {
      params.push(String(q[c]));
      where.push(`role = $${params.length}`);
    } else {
      params.push(`%${String(q[c])}%`);
      where.push(`${c} ILIKE $${params.length}`);
    }
  }
  const col = sortCols.includes(q.sort) ? q.sort : sortCols[0];
  const dir = q.order === 'desc' ? 'DESC' : 'ASC';
  return `${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${col} ${dir}, id`;
}

module.exports = { listClauses };
