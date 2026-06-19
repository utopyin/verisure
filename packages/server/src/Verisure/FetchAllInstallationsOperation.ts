import * as Domain from "@verisure/domain";
import { operation } from "@verisure/graphql-client";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

const optionalNullable = <S extends Schema.Top>(schema: S) =>
  Schema.optionalKey(Schema.NullOr(schema)).pipe(
    Schema.decodeTo(Schema.optionalKey(Schema.toType(schema)), {
      decode: SchemaGetter.transformOptional(
        Option.filter(Predicate.isNotNull)
      ),
      encode: SchemaGetter.passthrough(),
    })
  );

const OptionalString = optionalNullable(Schema.String);
const OptionalNumber = optionalNullable(Schema.Number);

const InstallationAddressPayload = Schema.Struct({
  city: OptionalString,
  postalNumber: OptionalString,
  street: OptionalString,
});

const InstallationPayload = Schema.Struct({
  address: optionalNullable(InstallationAddressPayload),
  alias: Schema.String,
  customerType: OptionalString,
  dealerId: OptionalString,
  giid: Schema.String,
  locale: OptionalString,
  pinCodeLength: OptionalNumber,
  subsidiary: OptionalString,
});

const InstallationsData = Schema.Struct({
  account: Schema.Struct({
    installations: Schema.Array(InstallationPayload),
  }),
}).pipe(
  Schema.decodeTo(Schema.Array(Domain.InstallationSummarySchema), {
    decode: SchemaGetter.transform((data) => data.account.installations),
    encode: SchemaGetter.forbidden(
      () => "Encoding Verisure installations data is unsupported"
    ),
  })
);

export const fetchAllInstallationsOperation = operation({
  data: InstallationsData,
  operationName: "fetchAllInstallations",
  query: `query fetchAllInstallations($email: String!){
  account(email: $email) {
    installations {
      giid
      alias
      customerType
      dealerId
      subsidiary
      pinCodeLength
      locale
      address {
        street
        city
        postalNumber
        __typename
      }
      __typename
    }
    __typename
  }
}
`,
  variables: Schema.Struct({ email: Schema.String }),
});
