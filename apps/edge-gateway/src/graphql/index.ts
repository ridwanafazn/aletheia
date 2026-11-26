import {
  GraphQLError,
  GraphQLScalarType,
  Kind,
  parse,
  type DocumentNode,
  type FragmentDefinitionNode,
  type SelectionSetNode,
} from "graphql";
import { createSchema, createYoga } from "graphql-yoga";

import type { EdgeConfig } from "../config.js";
import type { BffClient } from "./bff.js";
import type { SessionIdentity } from "../lib/jwt.js";
import { schemaGraphql } from "./schema.js";

interface GraphqlContext {
  bff: BffClient;
  identity: SessionIdentity;
}

const passthroughScalar = (name: string) =>
  new GraphQLScalarType({
    name,
    serialize: (value) => value,
    parseValue: (value) => value,
    parseLiteral: (ast) => ("value" in ast ? ast.value : null),
  });

function selectionDepth(
  selectionSet: SelectionSetNode,
  depth: number,
  fragments: Map<string, FragmentDefinitionNode>,
): number {
  let maximum = depth;
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (selection.selectionSet !== undefined) {
        maximum = Math.max(maximum, selectionDepth(selection.selectionSet, depth + 1, fragments));
      } else {
        maximum = Math.max(maximum, depth);
      }
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      maximum = Math.max(maximum, selectionDepth(selection.selectionSet, depth, fragments));
    } else {
      const fragment = fragments.get(selection.name.value);
      if (fragment !== undefined) {
        maximum = Math.max(maximum, selectionDepth(fragment.selectionSet, depth, fragments));
      }
    }
  }
  return maximum;
}

function maximumDepth(document: DocumentNode): number {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(definition.name.value, definition);
    }
  }

  let maximum = 0;
  for (const definition of document.definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) {
      maximum = Math.max(maximum, selectionDepth(definition.selectionSet, 1, fragments));
    }
  }
  return maximum;
}

function requireRole(context: GraphqlContext, roles: readonly string[]): void {
  if (!roles.includes(context.identity.role)) {
    throw new GraphQLError("Peran tidak berwenang untuk query ini", {
      extensions: { code: "ERR_RBAC_FORBIDDEN" },
    });
  }
}

export function inspectGraphqlQuery(query: string, config: EdgeConfig): GraphQLError | null {
  if (
    config.environment === "production" &&
    (query.includes("__schema") || query.includes("__type"))
  ) {
    return new GraphQLError("Introspeksi dinonaktifkan", {
      extensions: { code: "ERR_RBAC_FORBIDDEN" },
    });
  }

  try {
    const document = parse(query);
    const depth = maximumDepth(document);
    if (depth > config.graphqlMaxDepth) {
      return new GraphQLError(`Kedalaman query melebihi batas ${config.graphqlMaxDepth}`, {
        extensions: { code: "ERR_VALIDATION_FAILED" },
      });
    }
  } catch {
    return new GraphQLError("Query GraphQL tidak valid", {
      extensions: { code: "ERR_VALIDATION_FAILED" },
    });
  }
  return null;
}

export function createEdgeGraphql(config: EdgeConfig) {
  const schema = createSchema<GraphqlContext>({
    typeDefs: schemaGraphql,
    resolvers: {
      DateTime: passthroughScalar("DateTime"),
      Decimal: passthroughScalar("Decimal"),
      JSON: passthroughScalar("JSON"),
      Query: {
        misExecutiveSummary: (
          _parent: unknown,
          args: { reportMonth: string; branchId?: string },
          context: GraphqlContext,
        ) => {
          requireRole(context, ["MIS_ANALYST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"]);
          return context.bff.misSummary(args.reportMonth, args.branchId);
        },
        claimAuditDetail: (
          _parent: unknown,
          args: { claimId: string },
          context: GraphqlContext,
        ) => {
          requireRole(context, [
            "CLAIMS_OFFICER",
            "BRANCH_MANAGER",
            "FINANCE_MANAGER",
            "COMPLIANCE_ADMIN",
            "MIS_ANALYST",
          ]);
          return context.bff.claimDetail(args.claimId);
        },
        misTrend: (
          _parent: unknown,
          args: { reportMonth: string; branchId?: string; months?: number },
          context: GraphqlContext,
        ) => {
          requireRole(context, ["MIS_ANALYST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"]);
          return context.bff.misTrend(args.reportMonth, args.branchId, args.months ?? 6);
        },
        whatIfSimulations: (
          _parent: unknown,
          args: { limit?: number },
          context: GraphqlContext,
        ) => {
          requireRole(context, ["MIS_ANALYST", "FINANCE_MANAGER", "COMPLIANCE_ADMIN"]);
          return context.bff.whatIf(args.limit ?? 10);
        },
      },
      Mutation: {
        runWhatIfSimulation: (
          _parent: unknown,
          args: {
            input: {
              simulationName: string;
              basePolicyVersionId: string;
              simulatedRulesPayload: Record<string, unknown>;
              targetPeriodStart: string;
              targetPeriodEnd: string;
              branchId?: string;
            };
          },
          context: GraphqlContext,
        ) => {
          requireRole(context, ["MIS_ANALYST", "FINANCE_MANAGER"]);
          return context.bff.runWhatIf(args.input);
        },
      },
    },
  });

  return createYoga<GraphqlContext>({
    schema,
    graphqlEndpoint: "/graphql",
    graphiql: false,
    maskedErrors: true,
    logging: false,
    plugins: [
      {
        onParams({ params, setResult }) {
          if (typeof params.query !== "string") {
            return;
          }
          const error = inspectGraphqlQuery(params.query, config);
          if (error !== null) {
            setResult({ errors: [error] });
          }
        },
      },
    ],
  });
}
