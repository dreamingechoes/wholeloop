import { operationWrapper } from '../fanout/operation-wrapper.js'

// Keep the existing environment wire format while sharing process ownership and byte draining.
export const DOCKER_OPERATION_WRAPPER = operationWrapper(
  'wholeloop/environment-operation-outcome@1',
)
