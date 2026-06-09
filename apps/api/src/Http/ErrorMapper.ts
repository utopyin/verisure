export const safeErrorResponse = (message = "Internal Server Error", status = 500) =>
  Response.json({ error: message }, { status });
