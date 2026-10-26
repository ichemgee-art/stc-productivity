export function progressMetersById(rows = []) {
  return rows.reduce((map, row) => {
    if (row.project_id) map[row.project_id] = (map[row.project_id] || 0) + Number(row.meters || 0)
    return map
  }, {})
}

export async function invalidateProductivity(client) {
  await Promise.all(['cycle-data', 'available-cycles', 'references', 'person-full-details', 'project-progress']
    .map((key) => client.invalidateQueries({ queryKey: [key] })))
}

// A request survives ambiguous network failures; only a changed intent gets a new key.
export function progressRequest(previous, payload, uuid = () => crypto.randomUUID()) {
  const fingerprint = JSON.stringify(payload)
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, id: uuid() }
}
