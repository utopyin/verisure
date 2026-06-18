import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export interface GraphQLRequest<Variables> {
  readonly operationName: string;
  readonly variables: Variables;
  readonly query: string;
}

export interface GraphQLOperation<Data, Variables> {
  readonly operationName: string;
  readonly request: GraphQLRequest<Variables>;
  readonly decode: (
    response: unknown
  ) => Effect.Effect<Data, Schema.SchemaError>;
}

export const operation = <Variables, Data>(input: {
  readonly operationName: string;
  readonly query: string;
  readonly variables: Schema.Decoder<Variables>;
  readonly data: Schema.Decoder<Data>;
}) => {
  const decodeResponse = Schema.decodeUnknownEffect(
    Schema.NonEmptyArray(Schema.Struct({ data: input.data }))
  );

  return (variables: Variables): GraphQLOperation<Data, Variables> => ({
    decode: (response) =>
      decodeResponse(response).pipe(Effect.map(([first]) => first.data)),
    operationName: input.operationName,
    request: {
      operationName: input.operationName,
      query: input.query,
      variables,
    },
  });
};
