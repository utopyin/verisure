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
  const decodeVariables = Schema.decodeUnknownEffect(input.variables);
  const decodeResponse = Schema.decodeUnknownEffect(
    Schema.NonEmptyArray(Schema.Struct({ data: input.data }))
  );

  return (
    variables: Variables
  ): Effect.Effect<GraphQLOperation<Data, Variables>, Schema.SchemaError> =>
    decodeVariables(variables).pipe(
      Effect.map((decodedVariables) => ({
        decode: (response: unknown) =>
          decodeResponse(response).pipe(Effect.map(([first]) => first.data)),
        operationName: input.operationName,
        request: {
          operationName: input.operationName,
          query: input.query,
          variables: decodedVariables,
        },
      }))
    );
};
