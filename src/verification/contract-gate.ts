// Builds contract gate units from the stored plan and the artifacts actually present.
import { contractDigest } from '../contracts/compatibility.js'
import { DeliveryPlanning } from '../delivery/planning-store.js'
import type { GatePlan } from '../gates/contracts.js'
import { ContractArtifactError, observeContractArtifacts } from './contract-artifacts.js'

export interface ContractGateInput {
  run: string
  revision: number
  unit: string
  refs: Record<string, string>
}

/** Re-read the stored plan and actual artifacts; supplied gate units are never observations. */
export function contractGateUnits(store: string, workspace: string, input: ContractGateInput) {
  const prepared = new DeliveryPlanning(store).getPlan(input.run, input.revision),
    observed = observeContractArtifacts(prepared.plan, input.unit, workspace, input.refs)
  const units: GatePlan['units'] = observed.contracts.map((contract) => ({
    id: `contracts/${contract.id}`,
    lens: 'contract',
    asks: JSON.stringify({
      run: input.run,
      revision: input.revision,
      plan: prepared.digest,
      unit: input.unit,
      contract,
    }),
    prompt:
      'Independently inspect this exact declared contract and its committed artifact. Check scope, compatibility and failure cases. Matching bytes alone establish no semantic correctness or observed suite execution.',
    origin: 'delivery:contracts',
    failSafe: true,
  }))
  return { units, observed }
}

/** Retained locators permit the same audit, never a newly selected contract or path. */
export function contractGateInput(units: GatePlan['units']): ContractGateInput | undefined {
  const selected = units.filter((unit) => unit.origin === 'delivery:contracts')
  if (!selected.length) return undefined
  const values = selected.map(
      (unit) =>
        JSON.parse(unit.asks) as {
          run: string
          revision: number
          plan: string
          unit: string
          contract: { id: string; ref: string }
        },
    ),
    first = values[0]
  if (
    !first ||
    !/^[a-f0-9]{64}$/.test(first.plan) ||
    values.some(
      (value) =>
        value.run !== first.run ||
        value.revision !== first.revision ||
        value.plan !== first.plan ||
        value.unit !== first.unit ||
        !value.contract?.id ||
        typeof value.contract.ref !== 'string',
    ) ||
    new Set(values.map((value) => value.contract.id)).size !== values.length
  )
    throw new ContractArtifactError('contract-gate-locators')
  const input = {
    run: first.run,
    revision: first.revision,
    unit: first.unit,
    refs: Object.fromEntries(values.map((value) => [value.contract.id, value.contract.ref])),
  }
  // Compare complete original units in the caller after re-observation. Merely
  // parsing a valid locator cannot preserve changed declared metadata or prompts.
  return structuredClone(input)
}

export function sameContractGateUnits(left: GatePlan['units'], right: GatePlan['units']) {
  return (
    contractDigest(left.filter((unit) => unit.origin === 'delivery:contracts')) ===
    contractDigest(right.filter((unit) => unit.origin === 'delivery:contracts'))
  )
}
