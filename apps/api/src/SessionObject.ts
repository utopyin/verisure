export class VerisureSessionObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: unknown,
  ) {}

  async fetch(): Promise<Response> {
    return Response.json({ status: "session-object-placeholder" });
  }
}
