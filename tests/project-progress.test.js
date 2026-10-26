import test from 'node:test'
import assert from 'node:assert/strict'
import { progressMetersById, progressRequest, invalidateProductivity } from '../src/lib/projectProgress.js'

test('quantity previews use IDs across renamed projects and A -> B switches', () => {
  const map = progressMetersById([{ project_id: 'a', project: 'old', meters: 10 }, { project_id: 'a', project: 'new', meters: 7 }, { project_id: 'b', project: 'old', meters: 3 }, { project: 'old', meters: 99 }])
  assert.deepEqual(map, { a: 17, b: 3 })
})
test('network retry reuses key while changed intent gets a fresh key', () => {
  const p = { project_name: 'x', contract_quantity: null }
  const first = progressRequest(null, p, () => 'first')
  assert.equal(progressRequest(first, p, () => 'wrong'), first)
  assert.equal(progressRequest(first, { ...p, contract_quantity: 1 }, () => 'next').id, 'next')
  assert.equal(progressRequest(null, p, () => 'legitimate-new-record').id, 'legitimate-new-record')
})
test('central invalidation refreshes all progress queries and productivity dependents', async () => {
  const calls = []
  await invalidateProductivity({ invalidateQueries: async (options) => calls.push(options.queryKey) })
  assert.deepEqual(calls, [['cycle-data'], ['available-cycles'], ['references'], ['person-full-details'], ['project-progress']])
})
