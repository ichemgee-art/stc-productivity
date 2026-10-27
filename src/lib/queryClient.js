import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { captureClientError } from '../services/monitoringService'

const queryCache = new QueryCache({
  onError: (error, query) => {
    captureClientError(error, {
      source: 'react-query.query',
      metadata: { queryHash: query?.queryHash || '' },
    })
  },
})

const mutationCache = new MutationCache({
  onError: (error) => {
    captureClientError(error, { source: 'react-query.mutation' })
  },
})

export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
    mutations: { retry: 0 },
  },
})
