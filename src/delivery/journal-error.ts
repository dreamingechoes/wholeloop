/** Keep family reducers independent of the envelope's registry to avoid a runtime import cycle. */
export class DeliveryJournalError extends Error {
  constructor(readonly problem: string) {
    super(
      `Delivery journal refused: ${problem}; retain the original journal and recover before writing`,
    )
  }
}
